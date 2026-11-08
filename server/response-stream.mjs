import {AppError} from './core.mjs';

// Accept only a complete provider response. Partial text must never become a finished result.
export async function responseStream(payload,{apiKey,fetcher=fetch,onDelta}){
 const response=await fetcher('https://api.openai.com/v1/responses',{
  method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
  body:JSON.stringify({...payload,stream:true}),signal:AbortSignal.timeout(120000)
 });
 if(!response.ok||!response.body)throw new AppError(502,'উত্তর আসেনি। OpenAI সংযোগ ও ক্রেডিট পরীক্ষা করো।');
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let buffer='',completed=null;
 async function consume(block){
  const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data||data==='[DONE]')return;
  let event;
  try{event=JSON.parse(data);}catch{throw new AppError(502,'উত্তরের কিছু অংশ সঠিকভাবে আসেনি।');}
  if(event.type==='response.output_text.delta'&&typeof event.delta==='string')await onDelta(event.delta);
  if(event.type==='response.completed')completed=event.response;
  if(['response.failed','response.incomplete','error'].includes(event.type))throw new AppError(502,'উত্তরটি পুরো আসেনি। যা হয়েছে তা বিস্তারিততে দেখো।');
 }
 try{
  while(true){
   const chunk=await reader.read();
   if(chunk.done)break;
   buffer+=decoder.decode(chunk.value,{stream:true});
   if(buffer.length>2000000)throw new AppError(502,'উত্তরের আকার গ্রহণযোগ্য সীমা ছাড়িয়েছে।');
   let match;
   while((match=/\r?\n\r?\n/.exec(buffer))){
    const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
    await consume(block);
   }
  }
  buffer+=decoder.decode();
  if(buffer.trim())await consume(buffer);
  if(!completed||completed.status!=='completed'||!Array.isArray(completed.output))throw new AppError(502,'উত্তর পুরো আসার আগে সংযোগ বিচ্ছিন্ন হয়েছে।');
  return completed;
 }finally{await reader.cancel().catch(()=>{});}
}
