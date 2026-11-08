import {services} from './api.mjs';
import {createAgentService} from '../../server/agent-service.mjs';
import {bounded,conversationInput,conversationKey,publicMedia} from '../../server/agent-core.mjs';
import {AppError} from '../../server/core.mjs';
import {wake} from '../../server/agent-runtime.mjs';

const terminal=new Set(['succeeded','attention','blocked','failed','uncertain','cancelled']);
const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

// The browser observes one durable job. Disconnecting this response never cancels the worker.
export function createChatHandler({env=process.env,getServices=services,makeService=createAgentService,wakeWorker=wake,waitMs=45000}={}){
 return async request=>{
  try{
   if(request.method!=='POST')throw new AppError(405,'POST প্রয়োজন।');
   const origin=request.headers.get('origin');
   if(origin&&new URL(origin).origin!==new URL(request.url).origin)throw new AppError(403,'নিজের অ্যাপ থেকে চেষ্টা করো।');
   const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
   if(!token)throw new AppError(401,'আগে লগইন করো।');
   const {auth,db}=getServices();let user;
   try{user=await auth.verifyIdToken(token,true);}catch{throw new AppError(401,'আবার লগইন করো।');}
   if(!env.OWNER_UID||user.uid!==env.OWNER_UID.trim())throw new AppError(403,'এই চ্যাট শুধু মালিকের জন্য।');
   const raw=await request.text();
   if(raw.length>45000)throw new AppError(413,'বার্তাটি অনেক বড়। একটু ছোট করো।');
   let input;
   try{input=JSON.parse(raw);}catch{throw new AppError(400,'বার্তার তথ্য সঠিক নয়।');}
   if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError(400,'বার্তার তথ্য সঠিক নয়।');
   const id=input.requestId,command=bounded(input.command,6000),conversationId=conversationInput(input.conversationId);
   if(typeof id!=='string'||!/^[A-Za-z0-9-]{10,100}$/.test(id))throw new AppError(400,'বার্তার ID সঠিক নয়।');
   let media=null;
   if(input.media!==undefined){
    if(!input.media||!['image/png','image/jpeg','video/mp4','video/quicktime'].includes(input.media.contentType))throw new AppError(400,'PNG বা JPEG ছবি দাও।');
    const url=publicMedia(input.media.url);
    if(!url)throw new AppError(400,'ছবিটি সঠিকভাবে সংযুক্ত হয়নি। আবার বেছে নাও।');
    media={url,contentType:input.media.contentType,mediaType:/^video\//.test(input.media.contentType)?'video':'image'};
   }
   const {store}=makeService({db,uid:user.uid,env});
   const {created}=await store.enqueue({id,payload:{command,media,live:true,conversationId},allowWrites:true});
   const saved=await store.get('jobs',id);
   if(conversationKey(saved)!==conversationId||saved.kind!=='command'||saved.payload.command!==command||
      (saved.payload.media?.url||null)!==(media?.url||null))throw new AppError(409,'এই ID-তে অন্য বার্তা আছে। নতুন করে পাঠাও।');
   const ref=store.col('jobs').doc(id),encoder=new TextEncoder();
   let close=()=>{};
   const body=new ReadableStream({
    start(controller){
     let closed=false,unsubscribe=null,timeout=null,heartbeat=null;
     const send=value=>{if(!closed)try{controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));}catch{close();}};
     close=()=>{
      if(closed)return;
      closed=true;clearTimeout(timeout);clearInterval(heartbeat);unsubscribe?.();
      request.signal.removeEventListener('abort',close);
      try{controller.close();}catch{/* The browser may have closed the stream already. */}
     };
     request.signal.addEventListener('abort',close,{once:true});
     if(request.signal.aborted){close();return;}
     send({id,accepted:true});
     unsubscribe=ref.onSnapshot(snapshot=>{
      if(closed)return;
      const job=snapshot.data();
      if(!job){send({id,pending:true,error:'বার্তার অবস্থা পড়া যাচ্ছে না।'});close();return;}
      if(terminal.has(job.status)){
       send({id,done:true,status:job.status,result:job.result||'',cancelReason:job.cancelReason||null,taskActivity:job.taskActivity??null});close();
      }else send({id,status:job.status,text:job.liveText||''});
     },()=>{send({id,pending:true,error:'সংযোগ বিচ্ছিন্ন হয়েছে। কাজের ফল চ্যাটে আবার দেখা যাবে।'});close();});
     if(closed){unsubscribe?.();return;}
     timeout=setTimeout(()=>{send({id,pending:true});close();},waitMs);
     heartbeat=setInterval(()=>send({id,waiting:true}),10000);
     // Repeated requests only observe an existing job; they do not start another model call.
     if(created||saved.status==='queued')wakeWorker().catch(()=>{
      send({id,dispatchPending:true});
     });
    },
    cancel(){close();}
   });
   return new Response(body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-store, private, no-transform'}});
  }catch(error){return json(error.status||500,{error:error.status?error.message:'চ্যাটে সংযোগ হয়নি। আবার চেষ্টা করো।'});}
 };
}

export default createChatHandler();
