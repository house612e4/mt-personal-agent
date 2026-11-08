import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import contract from '../public/project-contract.js';import {DEFAULT_BRAIN} from '../server/agent-core.mjs';
function fixture(request,send=null){
 class Element{constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.style={};}append(...v){this.children.push(...v)}replaceChildren(...v){this.children=[...v]}scrollIntoView(){} }
 const nodes=new Map([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const document={hidden:false,addEventListener(){},getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),querySelectorAll:()=>[]};
 let source=readFileSync(new URL('../public/agent-ui.js',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('export function mountAgent','function mountAgent');source+='\nthis.mount=mountAgent;';
 const values=new Map(),revoked=[];
 class Reader{readAsDataURL(file){this.result=file.data;this.onload();}}
 const localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const browserURL={createObjectURL:()=> 'blob:photo',revokeObjectURL:value=>revoked.push(value)};
 const context=vm.createContext({document,contract,FileReader:Reader,localStorage,URL:browserURL,Intl,Date,JSON,Set,Number,String,Object,Promise,crypto:{randomUUID:()=> 'request-stable-123'},setInterval:()=>1,clearInterval:()=>{},window:{confirm:()=>false,location:{assign(){}}}});vm.runInContext(source,context);return{ui:context.mount({request,send}),nodes,revoked};
}
const initial=()=>({brain:{...DEFAULT_BRAIN},jobs:[],reports:[],routines:[],connections:{sites:[{key:'mt-studio',bridge:true,repository:false}],instagram:[],gmail:false,whatsapp:false,facebookPersonal:false}});
const descendants=e=>[e,...e.children.flatMap(descendants)];
test('mobile website probe reports real capability result in the visible global status',async()=>{const calls=[],f=fixture(async(action,b)=>{calls.push([action,b]);return action==='state'?initial():{domain:'mt-studio-ai.com',reads:['capabilities'],writes:{'brand.update':{enabled:true}}};});await f.ui.refresh();const button=descendants(f.nodes.get('agentConnections')).find(e=>e.textContent==='ওয়েবসাইট যাচাই');await button.onclick();assert.equal(calls[1][0],'website_check');assert.equal(calls[1][1].site,'mt-studio');assert.match(f.nodes.get('agentNotice').textContent,/সংযোগ সফল/);const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.ok(html.indexOf('id="agentNotice"')<html.indexOf('id="agent"'));f.ui.reset();});
test('logout clears unsaved routine, report, image and last connection notice',async()=>{const f=fixture(async()=>initial());await f.ui.refresh();for(const id of ['routineCommand','routineTitle','agentCommand','brainMemory','reportBody','agentNotice','agentImage'])f.nodes.get(id).value=f.nodes.get(id).textContent='private';f.ui.reset();for(const id of ['routineCommand','routineTitle','agentCommand','brainMemory','reportBody','agentImage'])assert.equal(f.nodes.get(id).value,'');assert.equal(f.nodes.get('agentNotice').textContent,'');assert.equal(f.nodes.get('agentConnections').children.length,0);});

test('opening Arman shows saved progress and Boss replies with a read-only request',async()=>{
 const actions=[],f=fixture(async action=>{
  actions.push(action);return{...initial(),today:[{id:'post',status:'queued',title:'MT Studio পোস্ট'}],
   jobs:[{id:'chat',status:'succeeded',result:'রিপোর্ট তৈরি হয়েছে।',payload:{command:'রিপোর্ট করো'}}]};
 });
 await f.ui.refresh();
 assert.deepEqual(actions,['state']);assert.equal(f.nodes.get('agentName').textContent,'আরমান');
 assert.match(f.nodes.get('todayCounts').textContent,/০ সম্পন্ন · ১ বাকি/);
 assert.match(f.nodes.get('todayJobs').children[0].textContent,/MT Studio পোস্ট/);
 assert.ok(descendants(f.nodes.get('agentJobs')).some(e=>e.textContent==='বস, রিপোর্ট তৈরি হয়েছে।'));
});

test('selecting a post image is local and sending uses the original bytes in one upload',async()=>{
 const calls=[],url='https://example.com/original.png',data='data:image/png;base64,iVBORw0KGgo=';
 const f=fixture(async(action,body)=>{calls.push([action,body]);if(action==='upload')return{url,contentType:'image/png'};if(action==='command')return{worker:'requested'};return initial();});
 await f.ui.refresh();
 f.nodes.get('agentImage').files=[{name:'original.png',type:'image/png',size:8,data}];
 f.nodes.get('agentImage').onchange();
 assert.deepEqual(calls.map(c=>c[0]),['state']);
 f.nodes.get('agentCommand').value='এই ছবিটি ফেসবুকে পোস্ট করো';
 await f.nodes.get('agentSend').onclick();
 assert.deepEqual(calls.map(c=>c[0]),['state','upload','command','state']);
 assert.equal(calls[1][1].base64,data.split(',')[1]);assert.equal(calls[2][1].media.url,url);
 assert.deepEqual(f.revoked,['blob:photo']);
});
test('avatar is kept in the browser and does not call the server',async()=>{
 const calls=[],f=fixture(async action=>{calls.push(action);return initial();});
 await f.ui.refresh();
 const data='data:image/png;base64,iVBORw0KGgo=';
 f.nodes.get('agentAvatarFile').files=[{type:'image/png',size:8,data}];
 await f.nodes.get('agentAvatarFile').onchange();
 assert.deepEqual(calls,['state']);assert.equal(f.nodes.get('agentAvatar').src,data);
 f.ui.reset();assert.equal(f.nodes.get('agentAvatar').hidden,true);
 await f.ui.refresh();assert.equal(f.nodes.get('agentAvatar').src,data);
});

test('calendar is loaded only when opened and clears its data at logout',async()=>{
 const actions=[],f=fixture(async(action,body)=>{
  actions.push([action,body]);
  if(action==='calendar')return{month:'2026-11',timezone:'America/New_York',entries:[{time:'2026-11-30T23:00:00Z',title:'পোস্ট'}]};
  return initial();
 });
 await f.ui.refresh();
 assert.deepEqual(actions.map(call=>call[0]),['state']);
 const calendar=f.nodes.get('workCalendar');calendar.open=true;calendar.ontoggle();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(actions.map(call=>call[0]),['state','calendar']);
 assert.match(f.nodes.get('calendarEntries').children[0].textContent,/পোস্ট/);
 f.ui.reset();assert.equal(calendar.open,false);assert.equal(f.nodes.get('calendarEntries').children.length,0);
});

test('successful conversation has no task status, debug button or credit instructions in the chat',async()=>{
 const f=fixture(async()=>({...initial(),jobs:[{id:'chat-123',kind:'command',status:'succeeded',taskActivity:false,
  createdAt:'2026-11-07T10:00:00Z',payload:{command:'আছো?'},result:'বস, আছি। বলো।'}]}));
 await f.ui.refresh();
 const nodes=descendants(f.nodes.get('agentJobs'));
 assert.ok(nodes.some(node=>node.textContent==='বস, আছি। বলো।'));
 assert.ok(!nodes.some(node=>['কাজের ফল পাওয়া গেছে','ধাপ','বিস্তারিত'].includes(node.textContent)));
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<html[^>]+translate="no"/);assert.match(html,/<meta name="google" content="notranslate">/);
 assert.doesNotMatch(html,/id="agentConnection"/);
});
