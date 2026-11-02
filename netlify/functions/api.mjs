import {initializeApp,getApps,cert} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {randomUUID} from 'node:crypto';
import {AppError,accountInfo,account,text,draftId,publishingAllowed,remoteJSON} from '../../server/core.mjs';
const env=process.env;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const reply=(statusCode,data)=>({statusCode,headers,body:JSON.stringify(data)});
function required(key) { if(!env[key]) throw new AppError(503,`সেটআপ বাকি: ${key}`); return env[key]; }
function services() {
  if(!getApps().length) {
    let credentials;try {credentials=JSON.parse(required('FIREBASE_SERVICE_ACCOUNT_JSON'));} catch(e) {if(e.status) throw e;throw new AppError(503,'Firebase service account সেটিং সঠিক নয়।');}
    initializeApp({credential:cert(credentials),projectId:required('FIREBASE_PROJECT_ID')});
  }
  return {auth:getAuth(),db:getFirestore()};
}
async function graph(a,path,body) {
  const version=required('META_GRAPH_VERSION');if(!/^v\d+\.\d+$/.test(version)) throw new AppError(503,'META_GRAPH_VERSION সঠিক নয়।');
  const token=required(`${a.prefix}_PAGE_TOKEN`);
  return remoteJSON(`https://graph.facebook.com/${version}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},'Facebook');
}
export function createHandler({getServices=services, graphCall=graph, remoteCall=remoteJSON}={}) { return async(event)=>{
  try {
    const action=event.queryStringParameters?.action||'config';
    if(action==='config'&&event.httpMethod==='GET') {
      const keys=['FIREBASE_WEB_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID','OWNER_UID','FIREBASE_SERVICE_ACCOUNT_JSON'];
      const ready=keys.every(k=>Boolean(env[k]));
      return reply(200,{ready,firebase:ready?{apiKey:env.FIREBASE_WEB_API_KEY,authDomain:env.FIREBASE_AUTH_DOMAIN,projectId:env.FIREBASE_PROJECT_ID,appId:env.FIREBASE_APP_ID}:null});
    }
    if(event.httpMethod!=='POST') throw new AppError(405,'POST প্রয়োজন।');
    const origin=event.headers?.origin;
    if(origin&&new URL(origin).host!==(event.headers?.host)) throw new AppError(403,'অনুমোদিত সাইট থেকে চেষ্টা করুন।');
    const token=(event.headers?.authorization||'').match(/^Bearer (.+)$/)?.[1];
    if(!token) throw new AppError(401,'প্রথমে লগইন করুন।');
    const {auth,db}=getServices();let user;try {user=await auth.verifyIdToken(token,true);} catch {throw new AppError(401,'লগইন মেয়াদ শেষ। আবার লগইন করুন।');}
    if(user.uid!==required('OWNER_UID')) throw new AppError(403,'এই অ্যাপ শুধু মালিকের জন্য।');
    if((event.body||'').length>16000) throw new AppError(413,'অনুরোধ খুব বড়।');
    let b;try {b=JSON.parse(event.body||'{}');} catch {throw new AppError(400,'অনুরোধ সঠিক নয়।');}
    const drafts=db.collection('owners').doc(user.uid).collection('drafts');
    if(action==='status') return reply(200,{dryRun:env.DRY_RUN!=='false',ai:!!env.OPENAI_API_KEY,accounts:accountInfo.map(({prefix,...a})=>({...a,connected:a.kind==='page'&&!!env[`${prefix}_PAGE_TOKEN`]&&!!env[`${prefix}_PAGE_ID`]&&!!env.META_GRAPH_VERSION}))});
    if(action==='list') { const snap=await drafts.orderBy('createdAt','desc').limit(200).get();return reply(200,{drafts:snap.docs.map(d=>({id:d.id,...d.data()}))}); }
    if(action==='save') {
      const a=account(b.accountKey); const value=text(b.text);const ref=drafts.doc(b.id?draftId(b.id):randomUUID());
      await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data().status!=='draft') throw new AppError(409,'এই পোস্ট আর সম্পাদনা করা যাবে না।');tx.set(ref,{accountKey:a.key,text:value,status:'draft',createdAt:snap.exists?snap.data().createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});});
      return reply(200,{id:ref.id});
    }
    if(action==='delete') { const ref=drafts.doc(draftId(b.id));await db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists) throw new AppError(404,'খসড়া নেই।');if(s.data().status!=='draft') throw new AppError(409,'শুধু খসড়া মুছতে পারবেন।');tx.delete(ref);});return reply(200,{ok:true}); }
    if(action==='generate') {
      const a=account(b.accountKey),topic=text(b.topic,1500);
      // Durable per-owner rate limit remains effective across function instances.
      const limit=db.collection('owners').doc(user.uid).collection('limits').doc('ai');
      await db.runTransaction(async tx=>{const s=await tx.get(limit),old=s.data()||{},now=Date.now(),same=old.day===new Date().toISOString().slice(0,10);if(now-(old.last||0)<10000||(same&&old.count>=100)) throw new AppError(429,'কিছুক্ষণ অপেক্ষা করুন। দিনে সর্বোচ্চ ১০০টি লেখা তৈরি করা যায়।');tx.set(limit,{last:now,day:new Date().toISOString().slice(0,10),count:same?(old.count||0)+1:1});});
      const data=await remoteCall('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${required('OPENAI_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4o-mini',max_tokens:700,messages:[{role:'system',content:`Write one natural Bengali Facebook post under 900 characters for ${a.kind==='personal'?'a personal profile':'a business page'}. No invented prices, offers, results, contacts or addresses. No emojis unless requested. At most 3 relevant hashtags. Return post text only.`},{role:'user',content:`Account: ${a.label}\nTopic: ${topic}`} ]})},'AI');
      return reply(200,{text:text(data.choices?.[0]?.message?.content)});
    }
    if(action==='insights') {
      const a=account(b.accountKey);if(a.kind!=='page') throw new AppError(400,'এই তথ্য শুধু পেজের জন্য।');const id=required(`${a.prefix}_PAGE_ID`);if(!/^\d+$/.test(id)) throw new AppError(503,'Page ID সঠিক নয়।');
      const page=await graphCall(a,`${id}?fields=id,name,followers_count,fan_count`);
      const posts=await graphCall(a,`${id}/posts?fields=id,message,created_time,permalink_url&limit=5`);
      return reply(200,{page,posts:posts.data||[]});
    }
    if(action==='publish') {
      const ref=drafts.doc(draftId(b.id));let d,a;
      await db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists) throw new AppError(404,'খসড়া নেই।');d=s.data();a=account(d.accountKey);publishingAllowed(env,a,b.approved);if(d.status!=='draft') throw new AppError(409,'এই পোস্ট আগে পাঠানো হয়েছে বা প্রক্রিয়াধীন।');required(`${a.prefix}_PAGE_TOKEN`);required('META_GRAPH_VERSION');const id=required(`${a.prefix}_PAGE_ID`);if(!/^\d+$/.test(id)) throw new AppError(503,'Page ID সঠিক নয়।');text(d.text);tx.update(ref,{status:'publishing',attemptedAt:new Date().toISOString()});});
      let result;
      try { result=await graphCall(a,`${env[`${a.prefix}_PAGE_ID`]}/feed`,{message:d.text});if(!result.id) throw new Error('No post id'); }
      catch { await ref.update({status:'review_required'});throw new AppError(502,'প্রকাশের ফল নিশ্চিত নয়। Facebook পেজ দেখে নিন। একই পোস্ট আবার পাঠানো বন্ধ রাখা হয়েছে।'); }
      await ref.update({status:'published',postId:result.id,publishedAt:new Date().toISOString()});return reply(200,{ok:true,postId:result.id});
    }
    throw new AppError(404,'এই কাজটি পাওয়া যায়নি।');
  } catch(e) {return reply(e.status||500,{error:e.status?e.message:'কাজ সম্পন্ন হয়নি। আবার চেষ্টা করুন বা সেটআপ পরীক্ষা করুন।'});}
};
}
export const handler=createHandler();
