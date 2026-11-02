import test from 'node:test';import assert from 'node:assert/strict';
import {createHandler} from '../netlify/functions/api.mjs';
import {text,draftId} from '../server/core.mjs';
const records=new Map();let tail=Promise.resolve(),writes=0;
function ref(path){return {id:path.split('/').at(-1),collection:k=>collection(path+'/'+k),get:async()=>({exists:records.has(path),data:()=>records.get(path)}),update:async d=>records.set(path,{...records.get(path),...d}),path};}
function collection(path) {
 return {
  doc: id => ref(path+'/'+id),
  orderBy: () => ({limit: () => ({get: async () => ({
   docs: [...records].filter(([k]) => k.startsWith(path+'/')).map(([k,d]) => ({id:k.split('/').at(-1),data:()=>d}))
  })})})
 };
}
const db={collection,runTransaction:async fn=>{const next=tail.then(()=>fn({get:r=>r.get(),set:(r,d)=>records.set(r.path,d),update:(r,d)=>r.update(d),delete:r=>records.delete(r.path)}));tail=next.catch(()=>{});return next;}};
const getServices=()=>({auth:{verifyIdToken:async t=>{if(t==='bad')throw Error();return {uid:t};}},db});
const handler=createHandler({getServices,graphCall:async()=>{writes++;return {id:'page_post'};},remoteCall:async()=>({choices:[{message:{content:'বাংলা পরীক্ষামূলক লেখা'}}]})});
Object.assign(process.env,{OWNER_UID:'owner',MT_STUDIO_PAGE_TOKEN:'test-only',MT_STUDIO_PAGE_ID:'123',META_GRAPH_VERSION:'v23.0',OPENAI_API_KEY:'test-only'});
const req=(action,body={},token='owner')=>handler({httpMethod:'POST',headers:{host:'example.test',origin:'https://example.test',...(token?{authorization:'Bearer '+token}:{})},queryStringParameters:{action},body:JSON.stringify(body)});
const data=r=>JSON.parse(r.body);
test('authentication and ownership enforced',async()=>{assert.equal((await req('list',{},null)).statusCode,401);assert.equal((await req('list',{},'bad')).statusCode,401);assert.equal((await req('list',{},'other')).statusCode,403);});
test('save, edit and list owner draft',async()=>{const r=await req('save',{accountKey:'mt-studio',text:'প্রথম লেখা'});assert.equal(r.statusCode,200);const id=data(r).id;assert.equal((await req('save',{id,accountKey:'mt-studio',text:'সম্পাদিত লেখা'})).statusCode,200);assert.equal(data(await req('list')).drafts.find(d=>d.id===id).text,'সম্পাদিত লেখা');});
test('invalid text and traversal rejected',async()=>{for(const value of ['','   ','x'.repeat(1025)])assert.throws(()=>text(value));assert.throws(()=>draftId('../../secret'));assert.equal((await req('save',{accountKey:'wrong',text:'লেখা'})).statusCode,400);});
test('dry run and approval prevent remote publication',async()=>{const id=data(await req('save',{accountKey:'mt-studio',text:'পরীক্ষা'})).id;process.env.DRY_RUN='true';assert.equal((await req('publish',{id,approved:true})).statusCode,409);process.env.DRY_RUN='false';assert.equal((await req('publish',{id,approved:false})).statusCode,400);assert.equal(writes,0);});
test('personal profile cannot publish',async()=>{const id=data(await req('save',{accountKey:'md-mahsin',text:'ব্যক্তিগত লেখা'})).id;assert.equal((await req('publish',{id,approved:true})).statusCode,400);assert.equal(writes,0);});
test('concurrent publish sends once; published draft immutable',async()=>{const id=data(await req('save',{accountKey:'mt-studio',text:'একবার প্রকাশ'})).id;const r=await Promise.all([req('publish',{id,approved:true}),req('publish',{id,approved:true})]);assert.deepEqual(r.map(x=>x.statusCode).sort(),[200,409]);assert.equal(writes,1);assert.equal((await req('delete',{id})).statusCode,409);assert.equal((await req('save',{id,accountKey:'mt-studio',text:'বদল'})).statusCode,409);});
test('uncertain remote outcome blocks retries',async()=>{const uncertain=createHandler({getServices,graphCall:async()=>{throw Error('timeout');}});const id=data(await req('save',{accountKey:'mt-studio',text:'ফল অনিশ্চিত'})).id;const e={httpMethod:'POST',headers:{host:'example.test',authorization:'Bearer owner'},queryStringParameters:{action:'publish'},body:JSON.stringify({id,approved:true})};assert.equal((await uncertain(e)).statusCode,502);assert.equal((await req('publish',{id,approved:true})).statusCode,409);assert.equal(data(await req('list')).drafts.find(d=>d.id===id).status,'review_required');});
test('AI output and durable rate limit',async()=>{assert.equal(data(await req('generate',{accountKey:'mt-studio',topic:'পরামর্শ'})).text,'বাংলা পরীক্ষামূলক লেখা');assert.equal((await req('generate',{accountKey:'mt-studio',topic:'পরামর্শ'})).statusCode,429);});
test('delete draft, invalid JSON, cross origin',async()=>{const id=data(await req('save',{accountKey:'golapi-shop',text:'মুছবো'})).id;assert.equal((await req('delete',{id})).statusCode,200);assert.ok(!data(await req('list')).drafts.some(d=>d.id===id));const e={httpMethod:'POST',headers:{authorization:'Bearer owner'},queryStringParameters:{action:'list'},body:'{'};assert.equal((await handler(e)).statusCode,400);e.headers={origin:'https://evil.test',host:'example.test'};assert.equal((await handler(e)).statusCode,403);});
