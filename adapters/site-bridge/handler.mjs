import {createHmac,timingSafeEqual} from 'node:crypto';
import {BridgeError,object,exact,fail,docId} from './common.mjs';
import {createDomain} from './domain.mjs';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(data)});
export function makeHandler({site,getDb,getUser,validators={},env=process.env}){return async event=>{
 try{
  if(event.httpMethod!=='POST')return reply(405,{error:'POST required'});
  const secret=env.AGENT_BRIDGE_KEY;if(!secret||secret.length<32)fail(503,'AGENT_BRIDGE_KEY কমপক্ষে ৩২ অক্ষর দিন।');
  const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v])),time=headers['x-agent-time'],nonce=headers['x-agent-nonce'],sig=headers['x-agent-signature'];
  if(!/^\d{13}$/.test(time||'')||Math.abs(Date.now()-Number(time))>300000||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(nonce||'')||!/^[a-f0-9]{64}$/.test(sig||''))fail(401,'Signature metadata সঠিক নয়।');
  const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):event.body||'';if(Buffer.byteLength(raw)>80000)fail(413,'Request সর্বোচ্চ ৮০ KB দিন।');
  const expected=createHmac('sha256',secret).update(time+'.'+nonce+'.'+raw).digest('hex');if(!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))fail(401,'Signature সঠিক নয়।');
  let body;try{body=JSON.parse(raw);}catch{fail(400,'JSON input সঠিক নয়।');}exact(body,['action','documentId','patch','operationId']);if(typeof body.action!=='string'||body.action.length>80||body.documentId!==undefined&&body.documentId!==''&&typeof body.documentId!=='string'||body.patch!==undefined&&!object(body.patch))fail(400,'Action/input সঠিক নয়।');if(body.documentId)docId(body.documentId);
  const db=await getDb(),nr=db.collection('_agent_nonces').doc(nonce);try{await nr.create({at:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000)});}catch(e){if(e.code===6||e.code==='already-exists')fail(409,'একই signed request আবার গ্রহণ করা হয়নি।');throw e;}
  return reply(200,{...await createDomain({site,db,env,validators,getUser}).execute(body),protocol:'mt-agent-site/3.1',site});
 }catch(e){if(e instanceof BridgeError)return reply(e.status,{error:e.message});return reply(503,{error:'Website bridge কাজ সম্পন্ন করতে পারেনি। Site Firebase/index/configuration বা operation outcome যাচাই করুন।'});}
};}
