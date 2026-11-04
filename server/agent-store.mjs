import contract from '../public/project-contract.js';
import {randomUUID} from 'node:crypto';
import {DEFAULT_BRAIN,bounded,versionCheck,brainInput,routineInput,nextOccurrence,stableId,localDate} from './agent-core.mjs';
import {AppError} from './core.mjs';
export function createStore(db,uid){
 const owner=db.collection(contract.schema.paths.owners).doc(uid),col=name=>owner.collection(contract.schema.paths[name]||name);
 const brainRef=col('config').doc('brain');
 const get=async(name,id)=>{if(typeof id!=='string'||!/^[A-Za-z0-9-]{10,100}$/.test(id))throw new AppError(400,'ID সঠিক নয়।');const s=await col(name).doc(id).get();if(!s.exists)throw new AppError(404,'তথ্য পাওয়া যায়নি।');return{...s.data(),id:s.id}};
 const list=async(name,field='createdAt',limit=50)=>{const s=await col(name).orderBy(field,'desc').limit(limit).get();return s.docs.map(d=>({...d.data(),id:d.id}));};
 return{db,uid,col,get,list,
  brain:async()=>{const s=await brainRef.get();return{...DEFAULT_BRAIN,...s.data()};},
  saveBrain:async b=>{const input=brainInput(b);await db.runTransaction(async tx=>{const s=await tx.get(brainRef);versionCheck(s.data(),b.expectedVersion);if(s.exists)tx.set(brainRef.collection('history').doc(String(s.data().version)),{...s.data(),savedAt:new Date().toISOString()});tx.set(brainRef,{...input,version:(s.data()?.version||0)+1,updatedAt:new Date().toISOString()});});return{ok:true};},
  remember:async note=>{await db.runTransaction(async tx=>{const s=await tx.get(brainRef),b={...DEFAULT_BRAIN,...s.data()};const memory=b.memory+'\n'+bounded(note,2000);if(memory.length>12000)throw new AppError(400,'স্মৃতি পূর্ণ। ব্রেন থেকে অপ্রয়োজনীয় অংশ সরান।');tx.set(brainRef,{...b,memory,version:b.version+1,updatedAt:new Date().toISOString()});});return{ok:true};},
  saveRoutine:async b=>{const input=routineInput(b),id=b.id||randomUUID(),ref=col('routines').doc(id);await db.runTransaction(async tx=>{const s=await tx.get(ref);versionCheck(s.data(),b.expectedVersion);tx.set(ref,{...input,version:(s.data()?.version||0)+1,createdAt:s.data()?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});});return{id};},
  enqueue:async({id=randomUUID(),kind='command',payload,runAt=new Date().toISOString(),routineId=null,routineVersion=null,allowWrites=false})=>{const ref=col('jobs').doc(id);await db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.exists)return;tx.set(ref,{kind,payload,runAt,routineId,routineVersion,allowWrites,status:'queued',createdAt:new Date().toISOString()});});return{id};},
  dueRoutines:async function(now=Date.now()){
   const snap=await col('routines').where('enabled','==',true).limit(contract.product.agent.routineScanLimit).get();let count=0;
   for(const item of snap.docs){const r=item.data();if(Date.parse(r.nextRunAt)>now)continue;
    await db.runTransaction(async tx=>{const ref=col('routines').doc(item.id),s=await tx.get(ref),v=s.data();if(!v?.enabled||Date.parse(v.nextRunAt)>now)return;
     const occurrence=localDate(Date.parse(v.nextRunAt),v.timezone),id=stableId(item.id+':'+v.version+':'+occurrence),jr=col('jobs').doc(id),existing=await tx.get(jr);
     if(!existing.exists)tx.set(jr,{kind:'command',payload:{command:v.command},runAt:new Date(now).toISOString(),routineId:item.id,routineVersion:v.version,allowWrites:v.allowWrites,status:'queued',createdAt:new Date(now).toISOString()});
     tx.update(ref,{nextRunAt:nextOccurrence(v,now),lastQueuedAt:new Date(now).toISOString()});count++;
    });
   }return count;
  },
  claim:async id=>db.runTransaction(async tx=>{const ref=col('jobs').doc(id),s=await tx.get(ref);if(!s.exists)return null;const d=s.data();if(d.status!=='queued'||Date.parse(d.runAt)>Date.now())return null;
    let routine=null;if(d.routineId){const r=await tx.get(col('routines').doc(d.routineId));routine=r.data();}
    if(d.routineId&&(!routine?.enabled||routine.version!==d.routineVersion)){tx.update(ref,{status:'cancelled',finishedAt:new Date().toISOString()});return null;}
    tx.update(ref,{status:'running',startedAt:new Date().toISOString()});return{...d,id};
   }),
  finish:async(id,status,result)=>col('jobs').doc(id).update({status,result:String(result).slice(0,30000),finishedAt:new Date().toISOString()}),
  trace:async(id,value)=>col('jobs').doc(id).collection('trace').add(JSON.parse(JSON.stringify({...value,createdAt:new Date().toISOString()}))),
  saveReport:async({title,body,evidence})=>{const ref=col('reports').doc(randomUUID());await ref.set({title,body,evidence:JSON.parse(JSON.stringify(evidence)),version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});return{id:ref.id,title,body,evidence};},
  editReport:async b=>{const ref=col('reports').doc(b.id);await db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)throw new AppError(404,'রিপোর্ট পাওয়া যায়নি।');const old=s.data();versionCheck(old,b.expectedVersion);tx.set(ref.collection('history').doc(String(old.version)),{...old,savedAt:new Date().toISOString()});tx.update(ref,{body:bounded(b.body,30000),version:old.version+1,updatedAt:new Date().toISOString()});});return{ok:true};}
 };
}
