import {services} from './api.mjs';
import {createAgentService} from '../../server/agent-service.mjs';
import {wake} from '../../server/agent-runtime.mjs';
import {createPushService} from '../../server/push-service.mjs';
import {cleanupStaleMedia,cleanupPendingUploads} from '../../server/agent-media.mjs';
export const handler=async()=>{
 try{if(!process.env.OWNER_UID)return{statusCode:503,body:'Owner setup missing'};const {db}=services(),s=createAgentService({db,uid:process.env.OWNER_UID.trim()});await s.store.dueRoutines();
  const stale=await s.store.col('jobs').where('status','==','running').where('startedAt','<=',new Date(Date.now()-20*60000).toISOString()).limit(20).get();
  for(const d of stale.docs)await d.ref.update({status:'uncertain',result:'আগের worker-এর ফল পাওয়া যায়নি। trace ও বাইরের ফল যাচাই করুন; নিজে থেকে আবার পাঠানো হয়নি।',finishedAt:new Date().toISOString()});
  await createPushService({store:s.store}).retryPending();
	  await cleanupPendingUploads(s.store).catch(()=>{});
	  const maintenance=s.store.col('config').doc('maintenance'),clean=await db.runTransaction(async tx=>{const old=await tx.get(maintenance),data=old.data()||{},last=Date.parse(data.mediaCleanupAt||''),started=Date.parse(data.mediaCleanupStartedAt||'');if(Date.now()-last<23*60*60_000||Date.now()-started<30*60_000)return false;tx.set(maintenance,{mediaCleanupStartedAt:new Date().toISOString()},{merge:true});return true;});if(clean)try{const result=await cleanupStaleMedia();await maintenance.set({mediaCleanupAt:new Date().toISOString(),mediaCleanupStartedAt:null,mediaCleanupResult:result},{merge:true});}catch{await maintenance.set({mediaCleanupStartedAt:null,mediaCleanupErrorAt:new Date().toISOString()},{merge:true});}
  await wake();return{statusCode:200,body:'Worker requested'};
 }catch{return{statusCode:503,body:'Agent schedule configuration or dispatch needs attention'};}
};
