import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as webpush from 'web-push';
import {siteDb} from './helpers/site-db.mjs';
import {createStore} from '../server/agent-store.mjs';
import {createPushService,pushSubscription} from '../server/push-service.mjs';

const keys=webpush.generateVAPIDKeys();
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test-endpoint',keys:{p256dh:keys.publicKey,auth:Buffer.alloc(16,1).toString('base64url')}};
const env={VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:'mailto:owner@example.com'};

test('server push sends a finished job once without requiring an open application',async()=>{
 const f=siteDb(),store=createStore(f.db,'owner'),sent=[];
 const push=createPushService({store,env,send:async(...args)=>{sent.push(args);}});
 await push.subscribe(subscription);
 const {id}=await store.enqueue({payload:{command:'রিপোর্ট করো'}});
 await store.finish(id,'succeeded','বস, রিপোর্ট প্রস্তুত।',true);
 await push.notify({id,kind:'command'},'succeeded');await push.notify({id,kind:'command'},'succeeded');
 assert.equal(sent.length,1);assert.equal(sent[0][0].endpoint,subscription.endpoint);
 const payload=JSON.parse(sent[0][1]);assert.equal(payload.title,'আরমান');assert.equal(payload.tag,id);
 assert.equal(sent[0][2].vapidDetails.publicKey,keys.publicKey);
 assert.equal((await store.get('jobs',id)).pushStatus,'sent');
});

test('expired subscriptions are removed and cannot cause the completed work to repeat',async()=>{
 const f=siteDb(),store=createStore(f.db,'owner');
 const push=createPushService({store,env,send:async()=>{throw Object.assign(Error('expired'),{statusCode:410});}});
 await push.subscribe(subscription);
 const {id}=await store.enqueue({payload:{command:'পোস্ট করো'}});await store.finish(id,'succeeded','প্রকাশ হয়েছে।');
 const outcome=await push.notify({id,kind:'social'},'succeeded');
 assert.equal(outcome.status,'failed');
 assert.equal((await store.col('config').doc('push').collection('subscriptions').limit(5).get()).docs.length,0);
 assert.equal((await store.get('jobs',id)).status,'succeeded');
});

test('push refuses arbitrary network endpoints and malformed browser keys',()=>{
 assert.throws(()=>pushSubscription({...subscription,endpoint:'https://localhost/private'}));
 assert.throws(()=>pushSubscription({...subscription,keys:{auth:'bad',p256dh:'bad'}}));
});

test('new subscription can receive a server-originated test notification',async()=>{
 const f=siteDb(),store=createStore(f.db,'owner'),sent=[];
 const push=createPushService({store,env,send:async(...args)=>sent.push(args)});await push.subscribe(subscription);
 const result=await push.test();assert.equal(result.status,'sent');assert.equal(sent.length,1);
 assert.equal(JSON.parse(sent[0][1]).tag,'arman-push-test');
});

test('service worker shows the servers notification with the page closed',async()=>{
 const listeners={},shown=[];
 const self={location:{origin:'https://agent.example'},addEventListener:(event,fn)=>listeners[event]=fn,
  registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL});
 let done;
 listeners.push({data:{json:()=>({title:'আরমান',body:'উত্তর এসেছে।',tag:'job-123',url:'/?job=job-123'})},waitUntil:promise=>{done=promise;}});
 await done;assert.equal(shown[0].title,'আরমান');assert.equal(shown[0].options.body,'উত্তর এসেছে।');
 assert.equal(shown[0].options.data.url,'/?job=job-123');
});
