import {timingSafeEqual} from 'node:crypto';
import {services} from './api.mjs';
import {createStore} from '../../server/agent-store.mjs';
import {stableId} from '../../server/agent-core.mjs';
import {wake} from '../../server/agent-runtime.mjs';

export function createTelegramWebhook({env=process.env,getServices=services,wakeWorker=wake}={}){
 return async event=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:''};
  const secret=env.TELEGRAM_WEBHOOK_SECRET?.trim(),owner=env.TELEGRAM_OWNER_CHAT_ID?.trim();
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret||'')||!/^\d{1,16}$/.test(owner||'')||!env.TELEGRAM_BOT_TOKEN||!env.OWNER_UID)return{statusCode:503,body:'Setup missing'};
  const supplied=event.headers?.['x-telegram-bot-api-secret-token'];
  if(typeof supplied!=='string'||!timingSafeMatch(secret,supplied))return{statusCode:401,body:''};
  if((event.body||'').length>50000)return{statusCode:413,body:''};
  let update;
  try{update=JSON.parse(event.body||'{}');}catch{return{statusCode:400,body:''};}
  const m=update?.message,text=typeof m?.text==='string'?m.text.trim():'';
  if(!text||text.startsWith('/')||m.chat?.type!=='private'||m.from?.is_bot||
     String(m.chat.id)!==owner||String(m.from?.id)!==owner||!Number.isSafeInteger(m.message_id)||m.message_id<1)return{statusCode:200,body:'OK'};
  try{
   const {db}=getServices(),store=createStore(db,env.OWNER_UID.trim());
   const {created}=await store.enqueue({
    id:stableId(`telegram:${owner}:${m.message_id}`),
    payload:{command:text.slice(0,4000),source:'telegram',replyTo:owner},allowWrites:true
   });
   if(created)try{await wakeWorker();}catch{/* Scheduled pulse will pick up the job. */}
   return{statusCode:200,body:'OK'};
  }catch{return{statusCode:500,body:'Webhook ingestion failed'};}
 };
}

function timingSafeMatch(expected,value){
 const a=Buffer.from(expected),b=Buffer.from(value);
 return a.length===b.length&&timingSafeEqual(a,b);
}

export const handler=createTelegramWebhook();
