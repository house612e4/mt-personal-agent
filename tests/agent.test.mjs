import test from 'node:test';import assert from 'node:assert/strict';
import {routineInput,nextOccurrence,agentLoop,DEFAULT_BRAIN,requireWrite,brainInput,publicMedia} from '../server/agent-core.mjs';
import {createStore} from '../server/agent-store.mjs';
import {createAgentService} from '../server/agent-service.mjs';
import {createConnectors} from '../server/agent-connectors.mjs';
import {verifySignature,extractMessages,createWhatsAppWebhook} from '../netlify/functions/whatsapp-webhook.mjs';
import {seal,unseal,signState,readState} from '../server/agent-credentials.mjs';
import {createHmac,randomBytes} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createTelegramWebhook} from '../netlify/functions/telegram-webhook.mjs';
function fixture(){const rows=new Map();let tail=Promise.resolve(),seq=0;
 const snap=p=>({id:p.split('/').at(-1),ref:ref(p),exists:rows.has(p),data:()=>rows.has(p)?structuredClone(rows.get(p)):undefined});
 function ref(path){return{path,id:path.split('/').at(-1),collection:n=>col(path+'/'+n),get:async()=>snap(path),set:async d=>rows.set(path,structuredClone(d)),update:async d=>rows.set(path,{...rows.get(path),...structuredClone(d)}),create:async d=>{if(rows.has(path))throw Object.assign(Error(),{code:6});rows.set(path,structuredClone(d));}};}
 function col(path){return{doc:id=>ref(path+'/'+id),add:async d=>{const r=ref(path+'/event-'+(++seq));await r.set(d);return r},where:(...f)=>query(path,[f]),orderBy:(...o)=>query(path,[],o),limit:n=>query(path,[],[],n)};}
 function query(path,filters=[],order=[],limit=Infinity){return{where:(...f)=>query(path,[...filters,f],order,limit),orderBy:(...o)=>query(path,filters,o,limit),limit:n=>query(path,filters,order,n),get:async()=>{let list=[...rows].filter(([p,d])=>p.startsWith(path+'/')&&p.split('/').length===path.split('/').length+1&&filters.every(([f,op,v])=>op==='=='?d[f]===v:op==='<='?d[f]<=v:d[f]>=v));if(order.length)list.sort(([,a],[,b])=>String(a[order[0]]).localeCompare(String(b[order[0]]))*(order[1]==='desc'?-1:1));const docs=list.slice(0,limit).map(([p])=>snap(p));return{docs,size:docs.length};}};}
 const db={collection:col,bulkWriter:()=>({create:(ref,data)=>ref.create(data),close:async()=>{}}),runTransaction:async fn=>{const next=tail.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,d)=>writes.push(()=>r.set(d)),update:(r,d)=>writes.push(()=>r.update(d)),delete:r=>writes.push(()=>rows.delete(r.path))});for(const w of writes)await w();return result});tail=next.catch(()=>{});return next;}};
 return{db,rows,store:createStore(db,'owner')};}
test('routine validates timezone, day and time',()=>{const b={title:'দৈনিক',command:'রিপোর্ট করো',time:'20:00',timezone:'Asia/Dhaka',days:[0,1,2,3,4,5,6]};const r=routineInput(b,Date.parse('2026-11-02T12:00:00Z'));assert.equal(r.nextRunAt,'2026-11-02T14:00:00.000Z');for(const bad of [{time:'25:00'},{timezone:'bad/zone'},{days:[]}])assert.throws(()=>routineInput({...b,...bad}));});
test('DST missing local time moves to next valid occurrence',()=>{const r={time:'02:30',timezone:'America/New_York',days:[0,1,2,3,4,5,6]};assert.equal(nextOccurrence(r,Date.parse('2026-03-08T06:00:00Z')),'2026-03-09T06:30:00.000Z');});
test('one queued job has one claim despite concurrent workers',async()=>{const f=fixture();const j=await f.store.enqueue({payload:{command:'পড়ো'}});const claims=await Promise.all([f.store.claim(j.id),f.store.claim(j.id)]);assert.equal(claims.filter(Boolean).length,1);});
test('same command request ID enqueues once',async()=>{const f=fixture();await f.store.enqueue({id:'stable-request-id',payload:{command:'পড়ো'}});await f.store.enqueue({id:'stable-request-id',payload:{command:'পড়ো'}});assert.equal((await f.store.list('jobs')).length,1);});
test('routine pause or version change cancels queued execution',async()=>{const f=fixture(),r=await f.store.saveRoutine({title:'দৈনিক',command:'পড়ো',time:'20:00',timezone:'UTC',days:[0,1,2,3,4,5,6],expectedVersion:0});const j=await f.store.enqueue({payload:{command:'পড়ো'},routineId:r.id,routineVersion:1});const old=await f.store.get('routines',r.id);await f.store.saveRoutine({...old,enabled:false,expectedVersion:1});assert.equal(await f.store.claim(j.id),null);assert.equal((await f.store.get('jobs',j.id)).status,'cancelled');});
test('routine tick creates one occurrence across repeat pulses',async()=>{const f=fixture(),r=await f.store.saveRoutine({title:'দৈনিক',command:'পড়ো',time:'20:00',timezone:'UTC',days:[0,1,2,3,4,5,6],expectedVersion:0});const ref=f.store.col('routines').doc(r.id);await ref.update({nextRunAt:new Date(Date.now()-60000).toISOString()});await Promise.all([f.store.dueRoutines(),f.store.dueRoutines()]);assert.equal((await f.store.list('jobs')).length,1);});
test('report correction preserves evidence and previous body',async()=>{const f=fixture(),r=await f.store.saveReport({title:'রিপোর্ট',body:'প্রথম লেখা',evidence:[{source:'gmail',loaded:2}]});await f.store.editReport({id:r.id,expectedVersion:1,body:'সংশোধন'});const current=await f.store.get('reports',r.id);assert.equal(current.version,2);assert.equal(current.evidence[0].loaded,2);assert.equal(f.rows.get('owners/owner/reports/'+r.id+'/history/1').body,'প্রথম লেখা');await assert.rejects(()=>f.store.editReport({id:r.id,expectedVersion:1,body:'পুরোনো'}));});
test('brain updates are versioned and permission flags are explicit',async()=>{const f=fixture();await f.store.saveBrain({...DEFAULT_BRAIN,expectedVersion:0,instructions:'নতুন নিয়ম'});await assert.rejects(()=>f.store.saveBrain({...DEFAULT_BRAIN,expectedVersion:0}));const b=brainInput({...DEFAULT_BRAIN,maxSteps:99});assert.equal(b.maxSteps,12);assert.throws(()=>requireWrite(DEFAULT_BRAIN,{},'social'));assert.throws(()=>requireWrite(DEFAULT_BRAIN,{},'communication'));assert.throws(()=>requireWrite({...DEFAULT_BRAIN,automaticSocial:true},{routineId:'x',allowWrites:false},'social'));});
test('agent executes a tool and uses its real result',async()=>{let step=0,called=0;const result=await agentLoop({brain:DEFAULT_BRAIN,command:'রিপোর্ট দেখাও',request:async()=>++step===1?{output:[{type:'function_call',name:'list_reports',call_id:'c1',arguments:'{}'}]}:{output:[{type:'message',content:[{type:'output_text',text:'একটি রিপোর্ট পাওয়া গেছে।'}]}]},runTool:async()=>{called++;return[{id:'report'}]}});assert.equal(called,1);assert.match(result,/রিপোর্ট/);});
test('chat attachment is omitted from AI input and image tools stay disabled even for legacy brain settings',async()=>{
 let payload,calls=0;
 const answer=await agentLoop({
  brain:{...DEFAULT_BRAIN,enabledTools:[...DEFAULT_BRAIN.enabledTools,'edit_uploaded_image','generate_image']},
  command:'ছবিটি পোস্ট করো',media:{url:'https://example.com/original.jpg'},
  request:async p=>{payload=structuredClone(p);return{output:[{type:'message',content:[{type:'output_text',text:'কোন পেজে?'}]}]};},
  runTool:async()=>{calls++;}
 });
 assert.equal(calls,0);assert.equal(answer,'বস, কোন পেজে?');
 assert.match(payload.input.at(-1).content,/বাড়তি ধাপ, AI কল/);
 assert.match(payload.input.at(-1).content,/মূল মিডিয়া সংযুক্ত আছে/);
 assert.doesNotMatch(JSON.stringify(payload),/original[.]jpg|input_image|edit_uploaded_image|generate_image/);
});

test('model cannot invoke a disabled tool',async()=>{let calls=0,step=0,trace;await agentLoop({brain:{...DEFAULT_BRAIN,enabledTools:[]},command:'কাজ',request:async()=>++step===1?{output:[{type:'function_call',name:'website_action',call_id:'c',arguments:'{}'}]}:{output:[{type:'message',content:[{type:'output_text',text:'বন্ধ আছে।'}]}]},runTool:async()=>{calls++},trace:async x=>trace=x});assert.equal(calls,0);assert.equal(trace.ok,false);});
test('new Gmail source never fabricates disconnected mail',async()=>{const f=fixture(),c=createConnectors({store:f.store,env:{}});await assert.rejects(()=>c.readSource('gmail'),/Gmail/);});
test('missing image cannot pretend to publish Instagram',async()=>{const f=fixture(),c=createConnectors({store:f.store,env:{META_GRAPH_VERSION:'v23.0',MT_STUDIO_PAGE_TOKEN:'test',MT_STUDIO_INSTAGRAM_ID:'123',DRY_RUN:'false'}});await assert.rejects(()=>c.publish({accountKey:'mt-studio',platform:'instagram',caption:'লেখা'}),/ছবির URL/);});
test('unconfigured website bridge is explicitly blocked',async()=>{const f=fixture(),c=createConnectors({store:f.store,env:{}});await assert.rejects(()=>c.website('mt-studio','overview'),/সংযোগ বাকি/);});
test('WhatsApp signature and phone filter prevent forged data',()=>{const raw=Buffer.from('{}'),secret='secret',sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');assert.equal(verifySignature(raw,sig,secret),true);assert.equal(verifySignature(Buffer.from('bad'),sig,secret),false);const b={entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},messages:[{id:'wamid.1',from:'a',text:{body:'কাজ'}}]}}]}]};assert.equal(extractMessages(b,'other').length,0);assert.equal(extractMessages(b,'123')[0].text,'কাজ');});
test('OAuth state expires and encrypted refresh tokens detect tampering',()=>{const env={INTERNAL_WORKER_SECRET:'x'.repeat(40),OWNER_UID:'owner',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64')};const sealed=seal('refresh-secret',env);assert.equal(unseal(sealed,env),'refresh-secret');assert.throws(()=>unseal({...sealed,tag:randomBytes(16).toString('base64')},env));const s=signState({uid:'owner',expires:Date.now()+60000},env);assert.equal(readState(s,env).uid,'owner');assert.throws(()=>readState(s+'x',env));assert.throws(()=>readState(signState({uid:'owner',expires:1},env),env));});
test('untrusted source text is put under data instruction boundary',async()=>{let instructions;await agentLoop({brain:DEFAULT_BRAIN,command:'রিপোর্ট',request:async p=>{instructions=p.instructions;return{output:[{type:'message',content:[{type:'output_text',text:'ফল'}]}]}},runTool:async()=>{}});assert.match(instructions,/UNTRUSTED DATA/);assert.throws(()=>publicMedia('http://localhost/private'));});
test('real agent service creates a report with explicit source evidence',async()=>{const f=fixture();let turns=0;const connectors={status:()=>({}),readSource:async name=>({source:name,items:[{subject:'পরীক্ষা'}],coverage:'test fixture'})};const http=async(url,opt)=>{const b=JSON.parse(opt.body);if(!b.tools)return{output:[{type:'message',content:[{type:'output_text',text:'উৎস অনুযায়ী রিপোর্ট।'}]}]};return++turns===1?{output:[{type:'function_call',name:'audit_sources',call_id:'audit1',arguments:JSON.stringify({sources:['gmail'],title:'দৈনিক'})}]}:{output:[{type:'message',content:[{type:'output_text',text:'রিপোর্ট সংরক্ষিত হয়েছে।'}]}]};};const s=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},connectors,http});const result=await s.execute({id:'report-command-123',kind:'command',payload:{command:'রিপোর্ট করো'}});assert.equal(result.status,'succeeded');const rows=await f.store.list('reports');assert.equal(rows.length,1);assert.equal(rows[0].evidence[0].source,'gmail');});
test('one interpretation call queues a single original photo even when the model supplies a replacement URL',async()=>{
 const f=fixture();
 await f.store.saveBrain({...DEFAULT_BRAIN,automaticSocial:true,expectedVersion:0});
 let calls=0,published;
 const service=createAgentService({
  db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},
  connectors:{publish:async post=>{published=post;return{id:'post-id'};}},
  http:async()=>{calls++;return{output:[{type:'function_call',name:'prepare_post',call_id:'post',arguments:JSON.stringify({
   accountKey:'mt-studio',platform:'facebook',caption:'',imageUrl:'https://example.com/substitute.jpg',scheduleAt:''
  })}]};}
 });
 const original='https://example.com/original.png';
 const command=await f.store.enqueue({payload:{command:'মূল ছবি MT Studio ফেসবুকে পোস্ট দাও',media:{url:original}}});
 await service.drain();
 assert.equal(calls,1);assert.equal((await f.store.get('jobs',command.id)).result,'বস, পোস্টের ব্যবস্থা করেছি। প্রকাশ হলে আজকের কাজে দেখাবে।');
 const posts=(await f.store.list('jobs')).filter(job=>job.kind==='social');
 assert.equal(posts.length,1);assert.equal(posts[0].payload.imageUrl,original);assert.equal(posts[0].payload.caption,'');
 const firestore=getFirestore(initializeApp({projectId:'local-arman-validation'},'local-arman-photo'));
 // Building a batch validates the real Firestore shape without committing it.
 assert.doesNotThrow(()=>firestore.batch().set(firestore.doc('local/jobs'),{payload:posts[0].payload}));
 await service.drain();
 assert.equal(calls,1);assert.equal(published.imageUrl,original);
 assert.equal((await f.store.get('jobs',posts[0].id)).status,'succeeded');
});

test('agent AI calls enforce editable daily budget',async()=>{const f=fixture();await f.store.saveBrain({...DEFAULT_BRAIN,dailyAiCalls:1,expectedVersion:0});const s=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},connectors:{status:()=>({})},http:async()=>({output:[{type:'message',content:[{type:'output_text',text:'উত্তর'}]}]})});const j={id:'budget-command-123',kind:'command',payload:{command:'বলুন'}};await s.execute(j);await assert.rejects(()=>s.execute(j),/AI call সীমা/);});
test('background merge job defers while CI pending and completes after checks',async()=>{const f=fixture();await f.store.saveBrain({...DEFAULT_BRAIN,automaticWebsite:true,automaticDeploy:true,expectedVersion:0});let ready=false,calls=0;const s=createAgentService({db:f.db,uid:'owner',env:{},connectors:{status:()=>({}),mergeCode:async()=>{calls++;return ready?{merged:true,sha:'a'.repeat(40)}:{pending:true,reason:'CI pending'}}}});const j=await f.store.enqueue({kind:'merge',payload:{site:'mt-studio',prNumber:7},allowWrites:true});await s.drain();assert.equal((await f.store.get('jobs',j.id)).status,'queued');assert.equal((await f.store.get('jobs',j.id)).polls,1);ready=true;await f.store.col('jobs').doc(j.id).update({runAt:new Date(Date.now()-1000).toISOString()});await s.drain();assert.equal((await f.store.get('jobs',j.id)).status,'succeeded');assert.equal(calls,2);});
test('failed latest configured CI check prevents merge HTTP write',async()=>{const f=fixture();let writes=0;const c=createConnectors({store:f.store,env:{MT_STUDIO_GITHUB_REPO:'owner/site',GITHUB_AGENT_TOKEN:'test',MT_STUDIO_REQUIRED_CHECKS:'build'},http:async(url,opt)=>{if(opt.method==='PUT'){writes++;return{merged:true}}if(url.includes('/pulls/'))return{state:'open',merged:false,mergeable:true,head:{ref:'agent/job',sha:'a'.repeat(40),repo:{full_name:'owner/site'}},base:{ref:'main',repo:{full_name:'owner/site'}}};if(url.includes('/check-runs'))return{check_runs:[{id:1,name:'build',status:'completed',conclusion:'success'},{id:2,name:'build',status:'completed',conclusion:'failure'}]};return{default_branch:'main'};}});await assert.rejects(()=>c.mergeCode('mt-studio',7),/CI check পাস করেনি/);assert.equal(writes,0);});
test('model multi-call response cannot bypass per-step execution bound',async()=>{let count=0;await assert.rejects(()=>agentLoop({brain:DEFAULT_BRAIN,command:'কাজ',request:async()=>({output:[{type:'function_call'},{type:'function_call'}]}),runTool:async()=>{count++}}));assert.equal(count,0);});
test('transaction callback retry cannot return a job claimed by another worker',async()=>{const f=fixture(),j=await f.store.enqueue({payload:{command:'কাজ'}}),ref=f.store.col('jobs').doc(j.id),original=f.db.runTransaction;f.db.runTransaction=async fn=>{await fn({get:r=>r.get(),update:()=>{}});await ref.update({status:'running'});return original(fn);};assert.equal(await f.store.claim(j.id),null);});
test('trace failure after queueing a post leaves the parent uncertain and only one child',async()=>{
 const f=fixture();
 await f.store.saveBrain({...DEFAULT_BRAIN,automaticSocial:true,expectedVersion:0});
 const service=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},connectors:{},http:async()=>({
  output:[{type:'function_call',name:'prepare_post',call_id:'p',arguments:JSON.stringify({accountKey:'mt-studio',platform:'facebook',caption:'লেখা',imageUrl:'',scheduleAt:''})}]
 })});
 service.store.trace=async()=>{throw Error('Firestore unavailable');};
 const job=await f.store.enqueue({payload:{command:'পোস্ট করো'}});
 await service.drain();
 assert.equal((await f.store.get('jobs',job.id)).status,'uncertain');
 assert.equal((await f.store.list('jobs')).filter(x=>x.kind==='social').length,1);
});
test('today state reads saved records across local midnight and uses the actual post status',async()=>{
 const f=fixture(),now=Date.parse('2026-11-05T05:15:00Z');
 const jobs=f.store.col('jobs');
 await jobs.doc('yesterday-task').set({createdAt:'2026-11-05T04:55:00Z',runAt:'2026-11-05T04:55:00Z',status:'succeeded',payload:{command:'গতকালের কাজ'}});
 await jobs.doc('today-task').set({createdAt:'2026-11-05T05:01:00Z',status:'succeeded',payload:{command:'পোস্ট করো'}});
 await jobs.doc('today-post').set({kind:'social',createdAt:'2026-11-05T05:01:30Z',runAt:'2026-11-05T20:00:00Z',status:'queued',payload:{platform:'facebook',accountKey:'mt-studio',parentJobId:'today-task'}});
 await jobs.doc('overnight-task').set({createdAt:'2026-11-05T04:50:00Z',finishedAt:'2026-11-05T05:10:00Z',status:'succeeded',payload:{command:'রাতের রিপোর্ট'}});
 assert.deepEqual((await f.store.todayJobs('America/New_York',now)).map(x=>[x.id,x.status]),[['today-post','queued'],['overnight-task','succeeded']]);
 let requests=0;
 const service=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},http:async()=>{requests++;},connectors:{status:async()=>({})}});
 await service.state();await service.jobs();assert.equal(requests,0);
});

test('incomplete model response cannot run an incomplete tool call',async()=>{let calls=0;await assert.rejects(()=>agentLoop({brain:DEFAULT_BRAIN,command:'কাজ',request:async()=>({status:'incomplete',output:[{type:'function_call',name:'remember',arguments:'{"note":"partial"}'}]}),runTool:async()=>calls++}),/অসম্পূর্ণ/);assert.equal(calls,0);assert.throws(()=>routineInput({title:'দৈনিক',command:'পড়ো',time:'20:00',days:[1]}),/timezone/);});
test('worker deadline blocks starting a fresh command near runtime expiry',async()=>{const f=fixture();let calls=0;const s=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},connectors:{},http:async()=>{calls++}});await assert.rejects(()=>s.execute({id:'deadline-job-123',kind:'command',payload:{command:'কাজ'}},{deadline:Date.now()+60000}),/সময়সমীমা|সময়সীমা/);assert.equal(calls,0);});
test('code proposal preserves exact source whitespace when encoding the file',async()=>{const f=fixture();let written;const content='  leading indentation\n\n';const c=createConnectors({store:f.store,env:{MT_STUDIO_GITHUB_REPO:'owner/site',GITHUB_AGENT_TOKEN:'test'},http:async(url,opt)=>{if(opt.method==='PUT'){written=JSON.parse(opt.body);return{commit:{sha:'b'.repeat(40)}}}if(url.includes('/contents/'))return{sha:'old-sha'};if(url.includes('/git/ref/heads/'))return{object:{sha:'base-sha'}};if(url.endsWith('/pulls'))return{number:1,html_url:'https://github.com/owner/site/pull/1'};if(url.endsWith('/git/refs'))return{};return{default_branch:'main'};}});await c.proposeCode('mt-studio',{path:'source.txt',originalSha:'old-sha',content,title:'Fix content'},'job-123');assert.equal(Buffer.from(written.content,'base64').toString(),content);});
test('a PR-only command stops at the proposal even when merge permission is enabled',async()=>{
 const f=fixture();
 await f.store.saveBrain({...DEFAULT_BRAIN,automaticWebsite:true,automaticDeploy:true,expectedVersion:0});
 let calls=0;
 const service=createAgentService({
  db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},
  connectors:{proposeCode:async()=>({prNumber:4,pullRequest:'https://github.com/owner/site/pull/4'})},
  http:async()=>{calls++;return{output:[{type:'function_call',name:'propose_code_change',call_id:'pr',arguments:JSON.stringify({site:'mt-studio',path:'README.md',content:'update',mergeWhenReady:false})}]};}
 });
 const out=await service.execute({id:'proposal-command',kind:'command',payload:{command:'শুধু PR করো'}});
 assert.match(out.result,/^বস, PR #4/);assert.equal(calls,1);
 assert.equal((await f.store.list('jobs')).length,0);
});

test('Telegram requires the correct secret and owner private sender, then deduplicates and replies once',async()=>{
 const f=fixture(),secret='webhook-secret-for-owner-test-1234';
 const env={OWNER_UID:'owner',TELEGRAM_OWNER_CHAT_ID:'12345',TELEGRAM_WEBHOOK_SECRET:secret,TELEGRAM_BOT_TOKEN:'test-token',OPENAI_API_KEY:'test'};
 let wakes=0,reads=0;
 const getServices=()=>{reads++;return{db:f.db};};
 const handler=createTelegramWebhook({env,getServices,wakeWorker:async()=>{wakes++;}});
 const message={message_id:101,chat:{id:12345,type:'private'},from:{id:12345,is_bot:false},text:'আমার জন্য শুভেচ্ছা লিখো'};
 const makeEvent=(m=message,key=secret)=>({httpMethod:'POST',headers:{'x-telegram-bot-api-secret-token':key},body:JSON.stringify({message:m})});
 const noSecret=createTelegramWebhook({env:{...env,TELEGRAM_WEBHOOK_SECRET:''},getServices});
 assert.equal((await noSecret(makeEvent())).statusCode,503);
 assert.equal((await handler(makeEvent(message,'wrong'))).statusCode,401);
 assert.equal((await handler(makeEvent({...message,from:{id:9999}}))).statusCode,200);
 assert.equal((await handler(makeEvent({...message,chat:{id:12345,type:'group'}}))).statusCode,200);
 assert.equal(reads,0);
 assert.deepEqual((await Promise.all([handler(makeEvent()),handler(makeEvent())])).map(r=>r.statusCode),[200,200]);
 assert.equal(wakes,1);assert.equal((await f.store.list('jobs')).length,1);
 const traffic=[];
 const service=createAgentService({db:f.db,uid:'owner',env,http:async(url,options)=>{
  const body=JSON.parse(options.body);traffic.push({url,body});
  if(url.startsWith('https://api.openai.com/'))return{output:[{type:'message',content:[{type:'output_text',text:'শুভ সকাল।'}]}]};
  return{ok:true,result:{message_id:202}};
 }});
 await service.drain();await service.drain();await handler(makeEvent());
 assert.equal(traffic.length,2);
 assert.equal(traffic[1].body.chat_id,12345);assert.equal(traffic[1].body.text,'বস, শুভ সকাল।');
 assert.equal((await f.store.list('jobs'))[0].replyStatus,'sent');
});

test('WhatsApp replays only audit once and queue one owner text, ignoring echoes and other senders',async()=>{
 const f=fixture();
 const env={OWNER_UID:'owner',WHATSAPP_OWNER_NUMBER:'+15551234567',WHATSAPP_PHONE_NUMBER_ID:'456',
  META_APP_SECRET:'test-meta-secret',WHATSAPP_TOKEN:'test-token',WHATSAPP_VERIFY_TOKEN:'verify',META_GRAPH_VERSION:'v23.0'};
 let wakes=0;
 const handler=createWhatsAppWebhook({env,getServices:()=>({db:f.db}),wakeWorker:async()=>{wakes++;}});
 const value={metadata:{phone_number_id:'456'},messages:[
  {id:'wamid.1',type:'text',from:'15551234567',text:{body:'রিপোর্ট দেখাও'}},
  {id:'wamid.2',type:'text',from:'15551234566',text:{body:'অন্যের বার্তা'}},
  {id:'wamid.3',type:'image',from:'15551234567',image:{caption:'অগ্রাহ্য করুন'}},
  {id:'wamid.4',type:'text',from:'15551234567'}
 ],message_echoes:[{id:'wamid.5',type:'text',from:'15551234567',text:{body:'echo'}}]};
 const body=JSON.stringify({entry:[{changes:[{field:'messages',value}]}]});
 const signature='sha256='+createHmac('sha256',env.META_APP_SECRET).update(body).digest('hex');
 const event={httpMethod:'POST',headers:{'x-hub-signature-256':signature},body};
 assert.equal((await handler({...event,headers:{}})).statusCode,401);
 assert.equal((await handler(event)).statusCode,200);assert.equal((await handler(event)).statusCode,200);
 assert.equal(wakes,1);assert.equal((await f.store.list('events','receivedAt')).length,5);
 const [job,...extra]=await f.store.list('jobs');assert.equal(extra.length,0);
 assert.deepEqual(job.payload,{command:'রিপোর্ট দেখাও',source:'whatsapp',replyTo:'15551234567'});
 const sent=[];
 const connectors=createConnectors({store:f.store,env,http:async(url,opt)=>{sent.push(JSON.parse(opt.body));return{messages:[{id:'wamid.reply'}]};}});
 assert.equal(await connectors.sendOwnerReply('whatsapp','15551234566','বস'), 'skipped');
 assert.equal(await connectors.sendOwnerReply('whatsapp',job.payload.replyTo,'বস, ফল পেয়েছি।'),'sent');
 assert.equal(sent.length,1);assert.equal(sent[0].to,'15551234567');
});

test('monthly calendar reads local month boundaries and excludes stale routine jobs without AI',async()=>{
 const f=fixture();
 const snapshot=f.store.col('routines').doc('daily-routine');
 await snapshot.set({title:'পরের রুটিন',enabled:true,version:2,nextRunAt:'2026-12-01T04:30:00.000Z'});
 for(const [id,runAt,kind,extra] of [
  ['last-day','2026-12-01T04:00:00.000Z','social',{}],
  ['next-month','2026-12-01T06:00:00.000Z','social',{}],
  ['past-month','2026-11-01T02:00:00.000Z','social',{}],
  ['stale-routine','2026-11-10T12:00:00.000Z','social',{routineId:'daily-routine',routineVersion:1}],
  ['ordinary','2026-11-03T00:00:00.000Z','command',{}]
 ])await f.store.enqueue({id,runAt,kind,payload:{platform:'facebook',accountKey:'mt-studio'},...extra});
 const service=createAgentService({db:f.db,uid:'owner',http:async()=>assert.fail('calendar must not call providers')});
 assert.deepEqual((await service.calendar('2026-11')).entries,[
  {time:'2026-12-01T04:00:00.000Z',title:'facebook · mt-studio'},
  {time:'2026-12-01T04:30:00.000Z',title:'পরের রুটিন'}
 ]);
 await assert.rejects(()=>service.calendar('2026-13'),/মাস সঠিক নয়/);
});

test('conversation keeps speaker roles and carries a previous original photo into an explicit follow-up',async()=>{
 const f=fixture(),original='https://example.com/original-upload.png';
 await f.store.saveBrain({...DEFAULT_BRAIN,automaticSocial:true,expectedVersion:0});
 const prior=await f.store.enqueue({payload:{command:'এই ছবিটি ব্যবহার করবে',media:{url:original,contentType:'image/png'}}});
 await f.store.finish(prior.id,'succeeded','বস, ছবিটি পেয়েছি।',false);
 let payload;
 const service=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},connectors:{},http:async(url,opt)=>{
  payload=JSON.parse(opt.body);
  return{output:[{type:'function_call',name:'prepare_post',call_id:'post',arguments:JSON.stringify({
   accountKey:'mt-studio',platform:'facebook',caption:'',imageUrl:`uploaded:${prior.id}`,scheduleAt:''
  })}]};
 }});
 const out=await service.execute({id:'new-message-12345',kind:'command',payload:{command:'আগের ছবিটা ফেসবুকে পোস্ট করো'}});
 assert.deepEqual(payload.input.slice(0,2).map(message=>message.role),['user','assistant']);
 assert.equal(payload.input[1].content,'বস, ছবিটি পেয়েছি।');
 assert.match(payload.input[0].content,new RegExp(`uploaded:${prior.id}`));
 assert.equal(out.taskActivity,true);
 const post=(await f.store.list('jobs')).find(job=>job.kind==='social');assert.equal(post.payload.imageUrl,original);
});

test('a chat-only reply is stored as conversation and excluded from todays task count',async()=>{
 const f=fixture();
 const service=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},connectors:{},http:async()=>({output:[{
  type:'message',content:[{type:'output_text',text:'বস, বস, আছি। বলো।'}]
 }]})});
 const command=await f.store.enqueue({payload:{command:'তুমি কি আমার সঙ্গে আছো'}});
 await service.drain();
 const saved=await f.store.get('jobs',command.id);
 assert.equal(saved.result,'বস, আছি। বলো।');assert.equal(saved.taskActivity,false);
 assert.deepEqual(await f.store.todayJobs('America/New_York'),[]);
});

test('media captions may be omitted, null, empty or whitespace without invalid Firestore fields',async()=>{
 const {initializeApp}=await import('firebase-admin/app');const {getFirestore}=await import('firebase-admin/firestore');
 const firestore=getFirestore(initializeApp({projectId:'local-caption-check'},'caption-matrix'));
 for(const caption of [undefined,null,'','   ']){
  const f=fixture();await f.store.saveBrain({...DEFAULT_BRAIN,automaticSocial:true,expectedVersion:0});
  const args={accountKey:'mt-studio',platform:'facebook',imageUrl:'uploaded',scheduleAt:'',...(caption===undefined?{}:{caption})};
  const service=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},connectors:{},http:async()=>({output:[{type:'function_call',name:'prepare_post',call_id:'media',arguments:JSON.stringify(args)}]})});
  const result=await service.execute({id:'caption-matrix-job',kind:'command',payload:{command:'ছবিটি পোস্ট করো',media:{url:'https://example.com/original.jpg',contentType:'image/jpeg'}}});
  assert.equal(result.status,'succeeded');
  const job=(await f.store.list('jobs')).find(job=>job.kind==='social');
  assert.equal(job.payload.caption,caption??'');
  assert.doesNotThrow(()=>firestore.batch().set(firestore.doc('local/post'),job));
 }
});

test('Instagram video processing reuses the same container until it is ready',async()=>{
 const f=fixture(),calls=[];let ready=false;
 const connector=createConnectors({store:f.store,env:{DRY_RUN:'false',META_GRAPH_VERSION:'v23.0',MT_STUDIO_PAGE_TOKEN:'test',MT_STUDIO_INSTAGRAM_ID:'123'},http:async(url,opt)=>{
  calls.push({url,method:opt.method,body:opt.body?JSON.parse(opt.body):null});
  if(url.endsWith('/123/media'))return{id:'container-1'};
  if(url.includes('fields=status_code'))return{status_code:ready?'FINISHED':'IN_PROGRESS'};
  if(url.endsWith('/123/media_publish'))return{id:'published-1'};
  throw Error('unexpected endpoint');
 }});
 const payload={accountKey:'mt-studio',platform:'instagram',mediaType:'video',imageUrl:'https://example.com/reel.mp4',caption:''};
 const first=await connector.publish(payload);assert.equal(first.pending,true);
 const waiting=await connector.publish(payload,first.providerState);assert.equal(waiting.pending,true);
 ready=true;const final=await connector.publish(payload,first.providerState);assert.equal(final.id,'published-1');
 assert.equal(calls.filter(call=>call.url.endsWith('/123/media')).length,1);
 assert.equal(calls.filter(call=>call.url.endsWith('/123/media_publish')).length,1);
});

test('a deferred video job persists provider state for the next worker pass',async()=>{
 const f=fixture();await f.store.saveBrain({...DEFAULT_BRAIN,automaticSocial:true,expectedVersion:0});
 let stateSeen=null;
 const service=createAgentService({db:f.db,uid:'owner',connectors:{publish:async(payload,state)=>{
  stateSeen=state;return state?{id:'published'}:{pending:true,providerState:{containerId:'same-container'},reason:'প্রস্তুত হচ্ছে।'};
 }}});
 const {id}=await f.store.enqueue({kind:'social',payload:{platform:'instagram',mediaType:'video',caption:'',imageUrl:'https://example.com/a.mp4'},allowWrites:true});
 await service.drain();const queued=await f.store.get('jobs',id);assert.equal(queued.status,'queued');assert.equal(queued.providerState.containerId,'same-container');
 await f.store.col('jobs').doc(id).update({runAt:new Date(Date.now()-1000).toISOString()});
 await service.drain();assert.equal(stateSeen.containerId,'same-container');assert.equal((await f.store.get('jobs',id)).status,'succeeded');
});

test('different conversations do not share their previous messages with the model',async()=>{
 const f=fixture();
 const one=await f.store.enqueue({payload:{command:'প্রথম চ্যাটের কথা',conversationId:'conversation-one'}});await f.store.finish(one.id,'succeeded','প্রথম উত্তর',false);
 const two=await f.store.enqueue({payload:{command:'দ্বিতীয় চ্যাটের গোপন কথা',conversationId:'conversation-two'}});await f.store.finish(two.id,'succeeded','দ্বিতীয় উত্তর',false);
 let input;
 const service=createAgentService({db:f.db,uid:'owner',env:{OPENAI_API_KEY:'test'},connectors:{},http:async(url,opt)=>{input=JSON.parse(opt.body).input;return{output:[{type:'message',content:[{type:'output_text',text:'উত্তর'}]}]};}});
 await service.execute({id:'new-chat-turn',kind:'command',payload:{command:'আগের কথা মনে আছে?',conversationId:'conversation-one'}});
 assert.match(JSON.stringify(input),/প্রথম চ্যাটের কথা/);assert.doesNotMatch(JSON.stringify(input),/দ্বিতীয় চ্যাট/);
});

test('Facebook video uploads only once and verifies processing before reporting completion',async()=>{
 const f=fixture(),calls=[];
 const connector=createConnectors({store:f.store,env:{DRY_RUN:'false',META_GRAPH_VERSION:'v23.0',MT_STUDIO_PAGE_TOKEN:'test',MT_STUDIO_PAGE_ID:'123'},http:async(url,opt)=>{
  calls.push({url,method:opt.method,body:opt.body?JSON.parse(opt.body):null});
  return opt.method==='POST'?{id:'video-id'}:{status:{video_status:'ready'}};
 }});
 const payload={accountKey:'mt-studio',platform:'facebook',mediaType:'video',imageUrl:'https://example.com/original.mp4'};
 const upload=await connector.publish(payload);assert.equal(upload.pending,true);
 const result=await connector.publish(payload,upload.providerState);assert.equal(result.id,'video-id');
 assert.equal(calls.filter(call=>call.method==='POST').length,1);assert.equal(calls[0].body.description,'');
 assert.equal(calls[0].body.file_url,payload.imageUrl);
});

test('reasoning profile and durable relevant memory are supplied to complex commands',async()=>{
 const f=fixture();await f.store.remember('Golapi পোস্টে ছোট বাংলা ক্যাপশন ব্যবহার করবে।');await f.store.remember('MT Studio-এর রং সবুজ।');
 const context=await f.store.memoryContext('Golapi পোস্টের ক্যাপশন লিখো');assert.match(context,/Golapi পোস্টে/);
 let payload;await agentLoop({brain:{...DEFAULT_BRAIN,reasoningEffort:'high'},command:'কাজ করো',memoryContext:context,request:async value=>{payload=value;return{output:[{type:'message',content:[{type:'output_text',text:'হয়েছে।'}]}]}},runTool:async()=>{}});
 assert.equal(payload.reasoning.effort,'high');assert.equal(payload.max_output_tokens,25000);assert.match(payload.instructions,/RELEVANT DURABLE MEMORY/);
});

test('connected communication adapters send Gmail, WhatsApp and Telegram only to validated recipients',async()=>{
 const f=fixture(),calls=[];
 const env={GOOGLE_CLIENT_ID:'google-id',GOOGLE_CLIENT_SECRET:'google-secret',GMAIL_REFRESH_TOKEN:'refresh',META_GRAPH_VERSION:'v23.0',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_TOKEN:'wa-token',TELEGRAM_BOT_TOKEN:'tg-token'};
 const connectors=createConnectors({store:f.store,env,http:async(url,opt={})=>{
  calls.push({url,body:opt.body});if(url.includes('oauth2.googleapis.com'))return{access_token:'access'};
  if(url.includes('/messages/send'))return{id:'gmail-1',threadId:'thread-1'};
  if(url.includes('graph.facebook.com'))return{messages:[{id:'wa-1'}]};
  if(url.includes('api.telegram.org'))return{ok:true,result:{message_id:7}};throw Error('unexpected '+url);
 }});
 assert.equal((await connectors.communication({channel:'gmail',action:'send',recipient:'owner@example.com',subject:'পরীক্ষা',body:'ইমেইল',messageId:'',query:'',templateName:'',language:''})).id,'gmail-1');
 assert.equal((await connectors.communication({channel:'whatsapp',action:'send',recipient:'+15551234567',subject:'',body:'বার্তা',messageId:'',query:'',templateName:'',language:''})).id,'wa-1');
 assert.equal((await connectors.communication({channel:'telegram',action:'send',recipient:'12345',subject:'',body:'বার্তা',messageId:'',query:'',templateName:'',language:''})).id,7);
 await assert.rejects(()=>connectors.communication({channel:'gmail',action:'send',recipient:'not-an-email',subject:'x',body:'x'}),/email address/);
 assert.equal(calls.filter(call=>/messages\/send|graph\.facebook|api\.telegram/.test(call.url)).length,3);
});

test('Instagram live probe verifies the configured account ID with its page token',async()=>{
 const f=fixture();const connector=createConnectors({store:f.store,env:{META_GRAPH_VERSION:'v23.0',MT_STUDIO_INSTAGRAM_ID:'987',MT_STUDIO_PAGE_TOKEN:'token'},http:async()=>({id:'987',username:'mtstudio',media_count:12})});
 assert.deepEqual(await connector.instagramAccount('mt-studio'),{id:'987',username:'mtstudio',mediaCount:12,live:true});
});
