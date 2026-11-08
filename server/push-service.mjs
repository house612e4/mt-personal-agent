import * as webpush from 'web-push';
import {AppError} from './core.mjs';
import {stableId,conversationKey} from './agent-core.mjs';

export function pushSubscription(value){
 if(!value||typeof value!=='object')throw new AppError(400,'নোটিফিকেশনের subscription সঠিক নয়।');
 let url;
 try{url=new URL(value.endpoint);}catch{throw new AppError(400,'নোটিফিকেশনের ঠিকানা সঠিক নয়।');}
 const host=url.hostname;
 const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
 if(!allowed||url.protocol!=='https:'||url.username||url.password||url.port||url.href.length>2048)throw new AppError(400,'এই push service অনুমোদিত নয়।');
 const {p256dh,auth}=value.keys||{};
 if(typeof p256dh!=='string'||typeof auth!=='string'||!/^[\w-]+$/.test(p256dh)||!/^[\w-]+$/.test(auth)||Buffer.from(p256dh,'base64url').length!==65||Buffer.from(auth,'base64url').length!==16)throw new AppError(400,'Subscription key সঠিক নয়।');
 return{endpoint:url.href,keys:{p256dh,auth}};
}

export function createPushService({store,env=process.env,send=webpush.sendNotification.bind(webpush)}){
 const subject=env.VAPID_SUBJECT||env.AGENT_BASE_URL;
 const ready=Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&subject);
 const subscriptions=store.col('config').doc('push').collection('subscriptions');
 return{
  info:()=>({ready,publicKey:ready?env.VAPID_PUBLIC_KEY:null}),
  subscribe:async value=>{
   if(!ready)throw new AppError(503,'Netlify-তে VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY ও VAPID_SUBJECT বসাও।');
   const subscription=pushSubscription(value),id=stableId(subscription.endpoint);
   await subscriptions.doc(id).set({...subscription,updatedAt:new Date().toISOString()});
   return{ok:true};
  },
  unsubscribe:async endpoint=>{
   if(typeof endpoint!=='string')throw new AppError(400,'Subscription-এর ঠিকানা দাও।');
   await subscriptions.doc(stableId(endpoint)).delete();return{ok:true};
  },
  test:async()=>{
   if(!ready)throw new AppError(503,'Netlify-তে VAPID সেটআপ বাকি।');const devices=await subscriptions.limit(5).get();if(!devices.docs.length)return{status:'unsubscribed'};
   const payload=JSON.stringify({title:'আরমান',body:'পরীক্ষামূলক নোটিফিকেশন পৌঁছেছে।',tag:'arman-push-test',url:'/?push=test'});
   const results=await Promise.all(devices.docs.map(async device=>{try{await send(pushSubscription(device.data()),payload,{TTL:60,timeout:10000,topic:'arman-push-test',vapidDetails:{subject,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});return true;}catch(error){if([404,410].includes(error.statusCode))await device.ref.delete().catch(()=>{});return false;}}));
   return{status:results.every(Boolean)?'sent':results.some(Boolean)?'partial':'failed'};
  },
  notify:async(job,status)=>{
   if(!ready)return{status:'disabled'};
   const devices=await subscriptions.limit(5).get();
   if(!devices.docs.length)return{status:'unsubscribed'};
   const ref=store.col('jobs').doc(job.id);
   const claimed=await store.db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists)return false;const data=snapshot.data(),attempts=Number(data.pushAttempts)||0,attempted=Date.parse(data.pushAttemptedAt||'');
    if(['sent','partial'].includes(data.pushStatus)||attempts>=3||data.pushStatus==='sending'&&Date.now()-attempted<5*60_000)return false;
    tx.update(ref,{pushStatus:'sending',pushAttempts:attempts+1,pushAttemptedAt:new Date().toISOString()});return true;
   });
   if(!claimed)return{status:'already_attempted'};
   const body=status==='succeeded'?(job.kind==='social'?'তোমার পোস্ট প্রকাশ হয়েছে।':'তোমার উত্তরের কাজ শেষ। চ্যাট খুলে দেখো।'):'কাজটিতে তোমার নজর দরকার। চ্যাটে বিস্তারিত আছে।';
   const payload=JSON.stringify({title:'আরমান',body,tag:job.id,url:'/?conversation='+encodeURIComponent(conversationKey(job))+'&job='+encodeURIComponent(job.id)});
   const results=await Promise.all(devices.docs.map(async device=>{
    try{
     await send(pushSubscription(device.data()),payload,{TTL:86400,timeout:10000,topic:job.id.slice(0,32),vapidDetails:{subject,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});
     return true;
    }catch(error){
     if([404,410].includes(error.statusCode))await device.ref.delete().catch(()=>{});
     return false;
    }
   }));
   const outcome=results.every(Boolean)?'sent':results.some(Boolean)?'partial':'failed';
   await ref.update({pushStatus:outcome,pushFinishedAt:new Date().toISOString()});return{status:outcome};
  },
  retryPending:async()=>{
   if(!ready)return{retried:0};const rows=await store.list('jobs','createdAt',50),terminal=new Set(['succeeded','attention','blocked','failed','uncertain','cancelled']);let retried=0;
   for(const job of rows){if(!terminal.has(job.status)||!['failed','sending'].includes(job.pushStatus))continue;if(job.pushStatus==='sending'&&Date.now()-Date.parse(job.pushAttemptedAt||'')<5*60_000)continue;await createPushService({store,env,send}).notify(job,job.status);retried++;if(retried>=10)break;}
   return{retried};
  }
 };
}
