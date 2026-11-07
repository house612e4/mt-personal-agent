import contract from '../../public/project-contract.js';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {services} from './api.mjs';
import {createStore} from '../../server/agent-store.mjs';
import {wake} from '../../server/agent-runtime.mjs';
import {stableId} from '../../server/agent-core.mjs';
export function verifySignature(raw,signature,secret){if(!secret||!/^sha256=[0-9a-f]{64}$/i.test(signature||''))return false;const expected=createHmac('sha256',secret).update(raw).digest();const actual=Buffer.from(signature.slice(7),'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export function extractMessages(body,phoneId){
 const result=[];
 for(const entry of body.entry||[])for(const change of entry.changes||[]){
  const v=change.value||{},kind=change.field||'messages';
  if(v.metadata?.phone_number_id!==phoneId)continue;
  for(const [messages,inbound] of [[v.messages,kind==='messages'],[v.message_echoes,false]]){
   for(const m of messages||[]){
    if(!m.id)continue;
    const body=typeof m.text?.body==='string'?m.text.body:'';
    const text=m.type==='text'?body:body||m.image?.caption||m.document?.caption||'[non-text message; attachment not downloaded]';
    result.push({providerId:m.id,kind,from:m.from||'',to:m.to||'',sentAt:m.timestamp||'',type:m.type||'',
     text:String(text).slice(0,4000),backfill:false,inbound});
   }
  }
  for(const history of v.history||[])for(const thread of history.threads||[])for(const m of thread.messages||[]){
   if(m.id)result.push({providerId:m.id,kind:'history',from:m.from||thread.id||'',to:m.to||'',sentAt:m.timestamp||'',
    type:m.type||'',text:String(m.text?.body||'[historical non-text message]').slice(0,4000),backfill:true,inbound:false});
  }
 }
 return result;
}
export function createWhatsAppWebhook({env=process.env,getServices=services,wakeWorker=wake}={}){
 return async event=>{
 if(event.httpMethod==='GET'){const q=event.queryStringParameters||{};if(env.WHATSAPP_VERIFY_TOKEN&&q['hub.mode']==='subscribe'&&q['hub.verify_token']===env.WHATSAPP_VERIFY_TOKEN)return{statusCode:200,body:q['hub.challenge']||''};return{statusCode:403,body:''};}
 if(event.httpMethod!=='POST')return{statusCode:405,body:''};
 try{if(!env.WHATSAPP_PHONE_NUMBER_ID||!env.OWNER_UID||!env.META_APP_SECRET)return{statusCode:503,body:'Setup missing'};
  const raw=Buffer.from(event.body||'',event.isBase64Encoded?'base64':'utf8');if(raw.length>3000000)return{statusCode:413,body:''};
  if(!verifySignature(raw,event.headers?.['x-hub-signature-256'],env.META_APP_SECRET))return{statusCode:401,body:''};
  const records=extractMessages(JSON.parse(raw.toString()),env.WHATSAPP_PHONE_NUMBER_ID);if(records.length>500)return{statusCode:413,body:'Split history batches to <=500 messages'};
  const {db}=getServices(),col=db.collection(contract.schema.paths.owners).doc(env.OWNER_UID.trim()).collection(contract.schema.paths.events),writer=db.bulkWriter();
  await Promise.all(records.map(r=>writer.create(col.doc(stableId(r.kind+':'+r.providerId)),{...r,receivedAt:new Date().toISOString()}).catch(e=>{if(e.code!==6)throw e;})));await writer.close();
  const owner=env.WHATSAPP_OWNER_NUMBER?.trim();
  if(env.WHATSAPP_TOKEN&&env.WHATSAPP_VERIFY_TOKEN&&/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION||'')&&/^\+?[1-9]\d{6,14}$/.test(owner||'')){
   const recipient=owner.replace(/^\+/,'');
   const store=createStore(db,env.OWNER_UID.trim());
   const commands=records.filter(r=>r.inbound&&r.type==='text'&&
    String(r.from).replace(/^\+/,'')===recipient&&r.text.trim());
   const jobs=await Promise.all(commands.map(r=>store.enqueue({
    id:stableId(`whatsapp:${env.WHATSAPP_PHONE_NUMBER_ID}:${r.providerId}`),
    payload:{command:r.text,source:'whatsapp',replyTo:recipient},allowWrites:true
   })));
   if(jobs.some(job=>job.created))try{await wakeWorker();}catch{/* Scheduled pulse will pick up the jobs. */}
  }
  return{statusCode:200,body:'EVENT_RECEIVED'};
 }catch{return{statusCode:500,body:'Webhook ingestion failed'};}
 };
}

export const handler=createWhatsAppWebhook();
