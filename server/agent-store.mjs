import contract from '../public/project-contract.js';
import {randomUUID} from 'node:crypto';
import {DEFAULT_BRAIN,TOOL_NAMES,bounded,versionCheck,brainInput,routineInput,nextOccurrence,stableId,localDate} from './agent-core.mjs';
import {AppError} from './core.mjs';
export function createStore(db,uid,env=process.env){
 const owner=db.collection(contract.schema.paths.owners).doc(uid),col=name=>owner.collection(contract.schema.paths[name]||name);
 const brainRef=col('config').doc('brain');
 const get=async(name,id)=>{if(typeof id!=='string'||!/^[A-Za-z0-9-]{10,100}$/.test(id))throw new AppError(400,'ID সঠিক নয়।');const s=await col(name).doc(id).get();if(!s.exists)throw new AppError(404,'তথ্য পাওয়া যায়নি।');return{...s.data(),id:s.id}};
 const list=async(name,field='createdAt',limit=50)=>{const s=await col(name).orderBy(field,'desc').limit(limit).get();return s.docs.map(d=>({...d.data(),id:d.id}));};
 return{db,uid,col,get,list,
  brain:async()=>{const s=await brainRef.get(),{imageModel,dailyImages,...stored}=s.data()||{};
   const legacy=Number(stored.capabilityVersion||0)<DEFAULT_BRAIN.capabilityVersion;
   const configuredModel=env.OPENAI_AGENT_MODEL||env.OPENAI_MODEL||DEFAULT_BRAIN.model;
   const brain={...DEFAULT_BRAIN,model:configuredModel,...stored,...(legacy?{capabilityVersion:DEFAULT_BRAIN.capabilityVersion,model:configuredModel,reasoningEffort:DEFAULT_BRAIN.reasoningEffort,maxSteps:DEFAULT_BRAIN.maxSteps}:{})};brain.enabledTools=TOOL_NAMES.filter(name=>!Array.isArray(brain.enabledTools)||brain.enabledTools.includes(name));return brain;},
  todayJobs:async(timezone,now=Date.now())=>{
   const date=localDate(now,timezone),window=26*60*60000;
   const from=new Date(now-window).toISOString(),to=new Date(now+window).toISOString();
   const fields=['createdAt','runAt','finishedAt'];
   const snapshots=await Promise.all(fields.map(field=>col('jobs').where(field,'>=',from).where(field,'<=',to).get()));
   const jobs=new Map();
   for(const snapshot of snapshots)for(const doc of snapshot.docs){
    const job=doc.data();
    if(fields.some(field=>job[field]&&localDate(Date.parse(job[field]),timezone)===date))jobs.set(doc.id,{...job,id:doc.id});
   }
   const parents=new Set([...jobs.values()].map(job=>job.payload?.parentJobId).filter(Boolean));
   return [...jobs.values()].filter(job=>!parents.has(job.id)&&!(job.kind==='command'&&job.status==='succeeded'&&job.taskActivity!==true)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(job=>({
    id:job.id,status:job.status,runAt:job.runAt,createdAt:job.createdAt,routineId:job.routineId||null,
    title:job.payload?.command?.slice(0,160)||(job.kind==='social'?`${job.payload.platform} · ${job.payload.accountKey}`:job.kind==='merge'?'কোড পরিবর্তন':'ডেপ্লয় যাচাই')
   }));
  },
  saveBrain:async b=>{const input=brainInput(b);await db.runTransaction(async tx=>{const s=await tx.get(brainRef);versionCheck(s.data(),b.expectedVersion);if(s.exists)tx.set(brainRef.collection('history').doc(String(s.data().version)),{...s.data(),savedAt:new Date().toISOString()});tx.set(brainRef,{...input,version:(s.data()?.version||0)+1,updatedAt:new Date().toISOString()});});return{ok:true};},
  remember:async note=>{const text=bounded(note,2000),ref=col('memories').doc(randomUUID()),now=new Date().toISOString();await ref.set({text,createdAt:now,updatedAt:now});return{ok:true,id:ref.id};},
	  listMemories:async()=>{const snapshot=await col('memories').orderBy('updatedAt','desc').limit(50).get();return snapshot.docs.map(doc=>({id:doc.id,text:doc.data().text,updatedAt:doc.data().updatedAt}));},
	  deleteMemory:async id=>{const memory=await get('memories',id);await col('memories').doc(memory.id).delete();return{ok:true,id:memory.id};},
  memoryContext:async command=>{
   const snapshot=await col('memories').orderBy('updatedAt','desc').limit(100).get();
   const terms=value=>new Set(String(value).toLocaleLowerCase('bn').match(/[\p{L}\p{N}]{2,}/gu)||[]),wanted=terms(command);
   return snapshot.docs.map((doc,index)=>{const data=doc.data(),words=terms(data.text),score=[...wanted].reduce((n,word)=>n+(words.has(word)?1:0),0);return{id:doc.id,text:data.text,score,index};})
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,12).map(item=>`[${item.id}] ${item.text}`).join('\n').slice(0,12000);
  },
  saveRoutine:async b=>{const input=routineInput(b),id=b.id||randomUUID(),ref=col('routines').doc(id);await db.runTransaction(async tx=>{const s=await tx.get(ref);versionCheck(s.data(),b.expectedVersion);tx.set(ref,{...input,version:(s.data()?.version||0)+1,createdAt:s.data()?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});});return{id};},
  enqueue:async({id=randomUUID(),kind='command',payload,runAt=new Date().toISOString(),routineId=null,routineVersion=null,allowWrites=false})=>{const ref=col('jobs').doc(id);const created=await db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.exists)return false;tx.set(ref,{kind,payload,runAt,routineId,routineVersion,allowWrites,status:'queued',createdAt:new Date().toISOString()});return true;});return{id,created};},
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
    if(d.routineId&&(!routine?.enabled||routine.version!==d.routineVersion)){tx.update(ref,{status:'cancelled',cancelReason:'routine_changed',result:'রুটিনটি বন্ধ বা বদলানো হয়েছে, তাই কাজটি চলেনি।',finishedAt:new Date().toISOString()});return null;}
    tx.update(ref,{status:'running',startedAt:new Date().toISOString()});return{...d,id};
   }),
  finish:async(id,status,result,taskActivity)=>col('jobs').doc(id).update({status,result:String(result).slice(0,30000),liveText:null,finishedAt:new Date().toISOString(),...(typeof taskActivity==='boolean'?{taskActivity}:{})}),
  trace:async(id,value)=>col('jobs').doc(id).collection('trace').add(JSON.parse(JSON.stringify({...value,createdAt:new Date().toISOString()}))),
  saveReport:async({title,body,evidence})=>{const ref=col('reports').doc(randomUUID());await ref.set({title,body,evidence:JSON.parse(JSON.stringify(evidence)),version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});return{id:ref.id,title,body,evidence};},
  editReport:async b=>{const ref=col('reports').doc(b.id);await db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)throw new AppError(404,'রিপোর্ট পাওয়া যায়নি।');const old=s.data();versionCheck(old,b.expectedVersion);tx.set(ref.collection('history').doc(String(old.version)),{...old,savedAt:new Date().toISOString()});tx.update(ref,{body:bounded(b.body,30000),version:old.version+1,updatedAt:new Date().toISOString()});});return{ok:true};}
 };
}
