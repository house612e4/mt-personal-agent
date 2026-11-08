import {createPushService} from '../../server/push-service.mjs';
import {saveImage,saveVideo,mediaType} from '../../server/agent-media.mjs';
import {randomUUID} from 'node:crypto';
import {signState,googleRedirect} from '../../server/agent-credentials.mjs';
import {services} from './api.mjs';
import {createAgentService} from '../../server/agent-service.mjs';
import {bounded,conversationInput,publicMedia} from '../../server/agent-core.mjs';
import {AppError} from '../../server/core.mjs';
import {wake} from '../../server/agent-runtime.mjs';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(data)});
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9-]{10,100}$/.test(value))throw new AppError(400,'ID সঠিক নয়।');return value;};
export const handler=async event=>{
 try{
  if(event.httpMethod!=='POST')throw new AppError(405,'POST প্রয়োজন।');
  if(event.headers?.origin){let origin;try{origin=new URL(event.headers.origin);}catch{throw new AppError(403,'Origin সঠিক নয়।');}if(origin.host!==event.headers.host)throw new AppError(403,'অনুমোদিত সাইট থেকে চেষ্টা করুন।');}
  const token=(event.headers?.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)throw new AppError(401,'লগইন করুন।');
  const {auth,db}=services();let user;try{user=await auth.verifyIdToken(token,true);}catch{throw new AppError(401,'আবার লগইন করুন।');}
  if(!process.env.OWNER_UID||user.uid!==process.env.OWNER_UID.trim())throw new AppError(403,'শুধু মালিকের জন্য।');
  if((event.body||'').length>(event.queryStringParameters?.action==='upload'?6000000:45000))throw new AppError(413,'অনুরোধ খুব বড়।');
  let b;try{b=JSON.parse(event.body||'{}');}catch{throw new AppError(400,'Input সঠিক নয়।');}if(!b||typeof b!=='object'||Array.isArray(b))throw new AppError(400,'Input সঠিক নয়।');
  const service=createAgentService({db,uid:user.uid}),action=event.queryStringParameters?.action,store=service.store;
  if(action==='upload'){
   if(typeof b.base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.base64))throw new AppError(400,'মিডিয়ার তথ্য সঠিক নয়।');
   const bytes=Buffer.from(b.base64,'base64'),type=mediaType(bytes);
   if(type.kind==='video')return reply(200,await saveVideo(bytes,user.uid));
   if(bytes.length>2000000)throw new AppError(400,'ছবি সর্বোচ্চ ২ MB দাও।');
   return reply(200,{...await saveImage(bytes,user.uid),mediaType:'image'});
  }
  if(action==='gmail_connect'){
   const env=process.env;if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.CREDENTIAL_ENCRYPTION_KEY)throw new AppError(503,'Google OAuth ও encryption সেটআপ বাকি।');
   const nonce=randomUUID(),expires=Date.now()+10*60000,state=signState({uid:user.uid,nonce,expires},env);
   await store.col('oauth').doc(nonce).set({expires,used:false});
   const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:googleRedirect(env),response_type:'code',scope:'https://www.googleapis.com/auth/gmail.modify',access_type:'offline',prompt:'consent',include_granted_scopes:'true',state}).toString();return reply(200,{url:url.href});
  }
  if(action==='website_check'){if(!['mt-studio','golapi-shop'].includes(b.site))throw new AppError(400,'ওয়েবসাইট বাছুন।');return reply(200,await service.connectors.website(b.site,'capabilities'));}
  if(action==='facebook_check'){if(!['mt-studio','golapi-shop'].includes(b.site))throw new AppError(400,'Facebook পেজ বাছুন।');return reply(200,await service.connectors.facebookPage(b.site));}
  if(action==='instagram_check'){if(!['mt-studio','golapi-shop'].includes(b.site))throw new AppError(400,'Instagram account বাছুন।');return reply(200,await service.connectors.instagramAccount(b.site));}
  if(action==='push_info')return reply(200,createPushService({store}).info());
  if(action==='push_subscribe')return reply(200,await createPushService({store}).subscribe(b.subscription));
  if(action==='push_test')return reply(200,await createPushService({store}).test());
  if(action==='push_unsubscribe')return reply(200,await createPushService({store}).unsubscribe(b.endpoint));
  if(action==='calendar')return reply(200,await service.calendar(b.month));
  if(action==='jobs')return reply(200,await service.jobs(undefined,b.conversationId));
  if(action==='state')return reply(200,await service.state(b.conversationId));
  if(action==='brain')return reply(200,await store.saveBrain(b));
  if(action==='routine'){if(b.id)id(b.id);return reply(200,await store.saveRoutine(b));}
  if(action==='report')return reply(200,await store.editReport({...b,id:id(b.id)}));
  if(action==='command'){
   let media=null;if(b.media!==undefined){if(!b.media||typeof b.media!=='object'||Array.isArray(b.media)||!['image/png','image/jpeg','video/mp4','video/quicktime'].includes(b.media.contentType))throw new AppError(400,'সংযুক্ত ছবির তথ্য সঠিক নয়।');media={url:publicMedia(b.media.url),contentType:b.media.contentType,mediaType:/^video\//.test(b.media.contentType)?'video':'image'};}
   const result=await store.enqueue({id:id(b.requestId),payload:{command:bounded(b.command,6000),media,conversationId:conversationInput(b.conversationId)},allowWrites:true});let worker='requested';try{await wake();}catch{worker='setup_or_dispatch_pending';}return reply(202,{...result,worker});
  }
  if(action==='run'){let worker='requested';try{await wake();}catch(e){throw new AppError(503,e.message);}return reply(202,{worker});}
  if(action==='trace')return reply(200,{trace:await store.col('jobs').doc(id(b.id)).collection('trace').orderBy('createdAt','asc').limit(40).get().then(s=>s.docs.map(d=>d.data()))});
  if(action==='retry'){
   const ref=store.col('jobs').doc(id(b.id));await db.runTransaction(async tx=>{const s=await tx.get(ref);if(!['blocked','failed'].includes(s.data()?.status))throw new AppError(409,'এই কাজ নিজে থেকে আবার পাঠানো নিরাপদ নয়। ফল যাচাই করুন।');tx.update(ref,{status:'queued',runAt:new Date().toISOString(),result:''});});try{await wake();}catch{}return reply(202,{ok:true});
  }
  if(action==='cancel'){
   const ref=store.col('jobs').doc(id(b.id));await db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.data()?.status!=='queued')throw new AppError(409,'চলমান বা সম্পন্ন কাজ বাতিল করা যাবে না।');tx.update(ref,{status:'cancelled',finishedAt:new Date().toISOString()});});return reply(200,{ok:true});
  }
  throw new AppError(404,'এই কাজ নেই।');
 }catch(e){return reply(e.status||500,{error:e.status?e.message:'এজেন্টের কাজ সম্পন্ন হয়নি।'});}
};
