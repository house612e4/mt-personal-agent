import {services} from './api.mjs';
import {createAgentService} from '../../server/agent-service.mjs';
import {wake} from '../../server/agent-runtime.mjs';
export const handler=async()=>{
 try{if(!process.env.OWNER_UID)return{statusCode:503,body:'Owner setup missing'};const {db}=services(),s=createAgentService({db,uid:process.env.OWNER_UID.trim()});await s.store.dueRoutines();
  const stale=await s.store.col('jobs').where('status','==','running').where('startedAt','<=',new Date(Date.now()-20*60000).toISOString()).limit(20).get();
  for(const d of stale.docs)await d.ref.update({status:'uncertain',result:'আগের worker-এর ফল পাওয়া যায়নি। trace ও বাইরের ফল যাচাই করুন; নিজে থেকে আবার পাঠানো হয়নি।',finishedAt:new Date().toISOString()});
  await wake();return{statusCode:200,body:'Worker requested'};
 }catch{return{statusCode:503,body:'Agent schedule configuration or dispatch needs attention'};}
};
