export async function readChatStream(response,onEvent){
 if(!response.ok){
  const data=await response.json().catch(()=>({}));
  throw Error(data.error||'বার্তা পাঠানো যায়নি। আবার চেষ্টা করো।');
 }
 if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('চ্যাটের নতুন সার্ভারটি চালু হয়নি। Netlify ডেপ্লয় পরীক্ষা করো।');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',final=null;
 function consume(block){
  const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data)return;
  let event;try{event=JSON.parse(data);}catch{throw Error('উত্তরের অংশ পড়া যায়নি। ফলটি চ্যাটে আবার দেখো।');}
  onEvent(event);
  if(event.done||event.pending)final=event;
 }
 try{
  while(true){
   const chunk=await reader.read();if(chunk.done)break;
   buffer+=decoder.decode(chunk.value,{stream:true});
   if(buffer.length>200000)throw Error('চ্যাটের উত্তরের আকার অনেক বড়।');
   let match;
   while((match=/\r?\n\r?\n/.exec(buffer))){
    consume(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);
   }
  }
  buffer+=decoder.decode();if(buffer.trim())consume(buffer);
  if(!final)throw Error('সরাসরি সংযোগটি থেমেছে। কাজের ফল চ্যাটে আবার দেখা যাবে।');
  return final;
 }finally{await reader.cancel().catch(()=>{});}
}
