import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatHandler} from '../netlify/functions/chat.mjs';
import {responseStream} from '../server/response-stream.mjs';
import {readChatStream} from '../public/chat-stream.js';

function fixture(){
 const jobs=new Map(),listeners=new Set();let wakes=0;
 const getSnapshot=id=>({data:()=>jobs.get(id)});
 const store={
  enqueue:async({id,payload})=>{const created=!jobs.has(id);if(created)jobs.set(id,{id,kind:'command',payload,status:'queued'});return{id,created};},
  get:async(name,id)=>jobs.get(id),
  col:()=>({doc:id=>({onSnapshot:fn=>{const listener=()=>fn(getSnapshot(id));listeners.add(listener);queueMicrotask(listener);return()=>listeners.delete(listener);}})})
 };
 const handler=createChatHandler({env:{OWNER_UID:'owner'},getServices:()=>({db:{},auth:{verifyIdToken:async token=>({uid:token})}}),
  makeService:()=>({store}),wakeWorker:async()=>{wakes++;},waitMs:50});
 const request=(body={},token='owner')=>new Request('https://agent.example/.netlify/functions/chat',{
  method:'POST',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({requestId:'same-message-12345',command:'আছো?',...body})
 });
 const update=(id,fields)=>{Object.assign(jobs.get(id),fields);for(const listener of listeners)listener();};
 return{handler,request,jobs,listeners,update,wakes:()=>wakes};
}

test('live chat checks owner and origin before creating any job',async()=>{
 const f=fixture();
 assert.equal((await f.handler(f.request({},'stranger'))).status,403);
 const request=f.request();request.headers.set('origin','https://another.example');
 assert.equal((await f.handler(request)).status,403);
 assert.equal(f.jobs.size,0);assert.equal(f.wakes(),0);
});

test('live chat emits real text then the stored result and cleans up its listener',async()=>{
 const f=fixture(),events=[];
 const response=await f.handler(f.request());
 const result=readChatStream(response,event=>events.push(event));
 await new Promise(resolve=>setImmediate(resolve));
 f.update('same-message-12345',{status:'running',liveText:'বস, আছি'});
 f.update('same-message-12345',{status:'succeeded',result:'বস, আছি। বলো।',taskActivity:false,liveText:null});
 const final=await result;
 assert.equal(final.result,'বস, আছি। বলো।');assert.equal(final.taskActivity,false);
 assert.ok(events.some(event=>event.text==='বস, আছি'));assert.equal(f.listeners.size,0);assert.equal(f.wakes(),1);
});

test('disconnecting live chat keeps its job and duplicate request observes the same result',async()=>{
 const f=fixture(),response=await f.handler(f.request());
 await response.body.cancel();
 assert.equal(f.jobs.size,1);assert.equal(f.jobs.get('same-message-12345').status,'queued');assert.equal(f.listeners.size,0);
 f.update('same-message-12345',{status:'succeeded',result:'বস, আছি।'});
 const repeated=await readChatStream(await f.handler(f.request()),()=>{});
 assert.equal(repeated.result,'বস, আছি।');assert.equal(f.jobs.size,1);assert.equal(f.wakes(),1);
 assert.equal((await f.handler(f.request({command:'অন্য বার্তা'}))).status,409);
});

test('a live chat observation timeout leaves the underlying job active',async()=>{
 const f=fixture();
 const result=await readChatStream(await f.handler(f.request()),()=>{});
 assert.equal(result.pending,true);assert.equal(f.jobs.get('same-message-12345').status,'queued');assert.equal(f.listeners.size,0);
});

function providerResponse(events){
 const bytes=new TextEncoder().encode(events.map(event=>`data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
 return new Response(new ReadableStream({start(controller){
  for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();
 }}),{headers:{'Content-Type':'text/event-stream'}});
}

test('provider stream preserves Bengali across byte chunks and requires a complete response',async()=>{
 const message={type:'message',content:[{type:'output_text',text:'বস, আছি।'}]};
 const events=[{type:'response.output_text.delta',delta:'বস, আছি।'},
  {type:'response.completed',response:{status:'completed',output:[message]}}];
 const seen=[];
 const output=await responseStream({model:'test'},{apiKey:'test',onDelta:text=>seen.push(text),fetcher:async()=>providerResponse(events)});
 assert.equal(seen.join(''),'বস, আছি।');assert.equal(output.output[0].content[0].text,'বস, আছি।');
 await assert.rejects(()=>responseStream({},{apiKey:'test',onDelta:()=>{},fetcher:async()=>providerResponse(events.slice(0,1))}),/সংযোগ বিচ্ছিন্ন/);
 await assert.rejects(()=>responseStream({},{apiKey:'test',onDelta:()=>{},fetcher:async()=>providerResponse([{type:'response.incomplete'}])}),/পুরো আসেনি/);
});
