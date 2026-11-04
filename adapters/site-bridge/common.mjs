import {createHash} from 'node:crypto';
export class BridgeError extends Error{constructor(status,message){super(message);this.status=status;}}
export const fail=(status,message)=>{throw new BridgeError(status,message);};
export function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
export function exact(value,keys){if(!object(value)||Object.keys(value).some(k=>!keys.includes(k)))fail(400,'অনুমোদিত fields দিন।');return value;}
export function text(v,max=500,min=1){if(typeof v!=='string'||v.trim().length<min||v.length>max)fail(400,`লেখা ${min}–${max} অক্ষর হতে হবে।`);return v.trim();}
export function docId(v){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))fail(400,'সঠিক document ID দিন।');return v;}
export function number(v,max=1e8,integer=false){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max||integer&&!Number.isSafeInteger(v))fail(400,'সংখ্যার মান সঠিক নয়।');return v;}
export function choice(v,values){if(!values.includes(v))fail(400,'অনুমোদিত অবস্থা বাছুন।');return v;}
export function https(v){text(v,2000);let u;try{u=new URL(v);}catch{fail(400,'সঠিক HTTPS লিংক দিন।');}if(u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||u.hostname.endsWith('.local'))fail(400,'পাবলিক HTTPS লিংক দিন।');return v;}
export function canonical(value){if(value===undefined)return null;if(value?.toDate)return{timestampSeconds:value.seconds,nanoseconds:value.nanoseconds};if(value instanceof Date)return value.toISOString();if(Buffer.isBuffer(value))return value.toString('base64');if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
export const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const revision=data=>digest(data??null);
export function expect(snapshot,expected,{create=false}={}){if(typeof expected!=='string'||expected!==revision(snapshot.exists?snapshot.data():null))fail(409,'তথ্য বদলেছে। আগে get/list করে নতুন revision নিন।');if(!snapshot.exists&&!create)fail(404,'তথ্য পাওয়া যায়নি।');}
export function clean(value,depth=0){if(depth>6)return '[nested value omitted]';if(value?.toDate)return value.toDate().toISOString();if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.slice(0,60).map(v=>clean(v,depth+1));if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value).slice(0,80))if(!/password|token|secret|private.?key|api.?key|credential|session|pin|\bnid\b|nidNumber|national.?id|guestAccessHash/i.test(k))out[k]=clean(v,depth+1);return out;}return typeof value==='string'?value.slice(0,5000):value??null;}
export function view(s){return{id:s.id,exists:s.exists,revision:revision(s.exists?s.data():null),data:s.exists?clean(s.data()):null};}
export async function atomic(db,b,plan){
 if(typeof b.operationId!=='string'||!/^[a-f0-9]{40}$/.test(b.operationId))fail(400,'Stable operation ID প্রয়োজন।');
 const key=digest([b.action,b.documentId||'',b.patch||{}]),op=db.collection('_agent_operations').doc(b.operationId),audit=db.collection('_agent_audit').doc(b.operationId);
 return db.runTransaction(async tx=>{const previous=await tx.get(op);if(previous.exists){if(previous.data().fingerprint!==key)fail(409,'একই operation ID-তে অন্য তথ্য পাঠানো যাবে না।');return{...previous.data().result,replayed:true};}
  // plan completes all reads before returning a synchronous mutation closure.
  const prepared=await plan(tx),result=prepared.result,at=new Date().toISOString();prepared.commit();
  tx.create(op,{fingerprint:key,result,at});tx.create(audit,{action:b.action,documentId:b.documentId||'',at,result,actor:'personal-agent'});return result;
 });
}
