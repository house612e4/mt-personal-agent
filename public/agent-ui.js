import contract from './project-contract.js';
export function mountAgent({request,lock=()=>{}}){
 const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 let state=null,busy=false,brainDirty=false,brainVersion=0,editReport=null,pending=null,attachment=null,timer=null,epoch=0,polling=false,calendarMonth=null,calendarRequest=0;
 const {name,creditRule}=contract.product.agent;
 const avatarKey='mt-personal-agent-avatar';
 const boss=text=>/^বস(?:[।,!?\s]|$)/u.test(String(text).trim())?String(text).trim():`বস, ${text}`;
 const isPending=job=>job.status==='running'||job.status==='queued'&&Date.parse(job.runAt)<=Date.now();
 const names={queued:'অপেক্ষমাণ',running:'চলছে',succeeded:'কাজের ফল পাওয়া গেছে',attention:'কিছু কাজে সমস্যা',failed:'ব্যর্থ',blocked:'সংযোগ/অনুমতি বাকি',uncertain:'ফল যাচাই প্রয়োজন',cancelled:'বাতিল'};
 function notice(text){$('agentNotice').textContent=boss(text);}
 async function run(button,fn){if(busy)return;busy=true;lock(true);const old=button.textContent;button.disabled=true;button.textContent='অপেক্ষা করুন…';try{await fn();}catch(e){notice(e.message||'কাজ হয়নি।');}finally{button.textContent=old;busy=false;lock(false);}}
 function action(box,label,fn,cls='secondary'){const b=el('button',cls,label);b.type='button';b.onclick=()=>run(b,fn);box.append(b);return b;}
 function brainForm(b){brainVersion=b.version;for(const [id,key] of [['brainModel','model'],['brainInstructions','instructions'],['brainMemory','memory'],['brainZone','timezone'],['brainSteps','maxSteps'],['brainDailyCalls','dailyAiCalls']])$(id).value=b[key];$('brainSocial').checked=b.automaticSocial;$('brainWebsite').checked=b.automaticWebsite;$('brainDeploy').checked=b.automaticDeploy;const box=$('brainTools');box.replaceChildren(el('legend','','চালু টুলগুলো'));for(const name of contract.product.agent.tools){const label=el('label'),c=el('input');c.type='checkbox';c.value=name;c.checked=b.enabledTools.includes(name);label.append(c,el('span','',name));box.append(label);}}
 function routineForm(r){$('routineId').value=r?.id||'';$('routineVersion').value=r?.version||0;$('routineTitle').value=r?.title||'';$('routineCommand').value=r?.command||'';$('routineTime').value=r?.time||'20:00';$('routineZone').value=r?.timezone||state?.brain?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone;$('routineEnabled').checked=r?.enabled!==false;$('routineWrites').checked=r?.allowWrites===true;document.querySelectorAll('#routineDays input').forEach(c=>c.checked=(r?.days||[0,1,2,3,4,5,6]).includes(Number(c.value)));}
 function renderToday(){
  const list=$('todayJobs');list.replaceChildren();
  const rows=[...(state.today||[])];
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:state.brain.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
  for(const routine of state.routines){
   if(routine.enabled&&routine.nextRunAt&&fmt.format(new Date(routine.nextRunAt))===fmt.format(new Date())&&!rows.some(job=>job.routineId===routine.id&&job.createdAt>=routine.nextRunAt)){
    rows.push({title:routine.title,status:'queued',runAt:routine.nextRunAt});
   }
  }
  const done=rows.filter(job=>job.status==='succeeded').length;
  const pending=rows.filter(job=>['queued','running'].includes(job.status)).length;
  const review=rows.length-done-pending;
  const count=value=>value.toLocaleString('bn-BD');
  $('todayCounts').textContent=rows.length?`${count(done)} সম্পন্ন · ${count(pending)} বাকি${review?` · ${count(review)} অন্যান্য`:''}`:'আজ কোনো কাজ নেই';
  for(const job of rows){
   const when=job.status==='queued'&&Date.parse(job.runAt)>Date.now()?` · ${new Date(job.runAt).toLocaleTimeString('bn-BD',{timeZone:state.brain.timezone,hour:'numeric',minute:'2-digit'})}`:'';
   list.append(el('li','',`${job.title} — ${names[job.status]||job.status}${when}`));
  }
 }
 function render(){
  renderToday();
  const jobs=$('agentJobs');jobs.replaceChildren();if(!state.jobs.length)jobs.append(el('div','chat-empty','আপনার কাজটি নিচে লিখুন। এজেন্ট প্রয়োজন হলে ছোট প্রশ্ন করবে।'));
  for(const j of [...state.jobs].reverse()){
   const mine=el('article','chat-row mine'),userBubble=el('div','chat-bubble user-bubble');userBubble.append(el('p','',j.payload?.command||(j.kind==='merge'?`কোড পরিবর্তন #${j.payload.prNumber} merge যাচাই`:j.kind==='deployment'?'Live deployment যাচাই':`${j.payload?.platform||''} পোস্ট`)));
   if(j.payload?.media?.url){const image=el('img','chat-image');image.src=j.payload.media.url;image.alt='সংযুক্ত ছবি';userBubble.append(image);}
   userBubble.append(el('small','',new Date(j.createdAt).toLocaleString('bn-BD')));mine.append(userBubble);jobs.append(mine);
   const theirs=el('article','chat-row agent'),reply=el('div','chat-bubble agent-bubble'),status=el('p','job-status',names[j.status]||j.status);reply.append(status);
   if(j.result)reply.append(el('p','job-result',boss(j.result)));else if(['queued','running'].includes(j.status))reply.append(el('p','muted',boss(j.status==='queued'?'কাজটি অপেক্ষায় আছে…':'কাজটি করছি…')));
   if(!j.result&&!['queued','running'].includes(j.status))status.textContent=boss(status.textContent);
   if(['unconfirmed','skipped'].includes(j.replyStatus))reply.append(el('p','muted',boss('বাইরের চ্যাটে উত্তর পৌঁছানোর নিশ্চয়তা পাওয়া যায়নি।')));
   if(j.kind==='social')reply.append(el('p','muted',`নির্ধারিত সময়: ${new Date(j.runAt).toLocaleString('bn-BD')} · ${j.payload?.accountKey}`),el('p','job-result',j.payload?.caption||''));
   const a=el('div','chat-message-actions');action(a,'ধাপ',async()=>{const d=await request('trace',{id:j.id});$('tracePanel').hidden=false;$('agentTrace').textContent=JSON.stringify(d.trace,null,2);});if(['blocked','failed'].includes(j.status))action(a,'আবার চালান',async()=>{await request('retry',{id:j.id});await refresh();});if(j.status==='queued')action(a,'বাতিল',async()=>{await request('cancel',{id:j.id});await refresh();},'quiet danger');reply.append(a);theirs.append(reply);jobs.append(theirs);
  }
  const routines=$('routineList');routines.replaceChildren();for(const r of state.routines){const c=el('article','panel');c.append(el('h2','',r.title),el('p','',r.command),el('p','muted',`${r.enabled?'চালু':'বন্ধ'} · ${r.time} · ${r.timezone} · পরের সময়: ${new Date(r.nextRunAt).toLocaleString('bn-BD')}`));const a=el('div','actions');action(a,'সম্পাদনা',async()=>routineForm(r));action(a,r.enabled?'বন্ধ করুন':'চালু করুন',async()=>{await request('routine',{...r,expectedVersion:r.version,enabled:!r.enabled});await refresh();if($('workCalendar').open)await loadCalendar(calendarMonth);});c.append(a);routines.append(c);}
  const reports=$('reportList');reports.replaceChildren();if(!state.reports.length)reports.append(el('section','panel','এখনো রিপোর্ট নেই। এজেন্টকে উৎসের নাম দিয়ে রিপোর্ট করতে বলুন।'));
  for(const r of state.reports){const c=el('article','panel');c.append(el('h2','',r.title),el('small','',`ID: ${r.id} · সংস্করণ ${r.version}`),el('p','report-content',r.body));const details=el('details');details.append(el('summary','','উৎস ও coverage দেখুন'),el('pre','evidence-box',JSON.stringify(r.evidence,null,2)));c.append(details);action(c,'লেখা সংশোধন',async()=>{editReport={id:r.id,version:r.version};$('reportEditTitle').textContent=r.title;$('reportBody').value=r.body;$('reportEditor').hidden=false;$('reportEditor').scrollIntoView({behavior:'smooth'});});reports.append(c);}
  if(!brainDirty)brainForm(state.brain);
  const conn=$('agentConnections');conn.replaceChildren();const items=[['Gmail',state.connections.gmail],['WhatsApp webhook',state.connections.whatsapp],['WhatsApp নির্দেশ ও উত্তর',state.connections.whatsAppChat],['Telegram নির্দেশ ও উত্তর',state.connections.telegramChat],['নিজের Facebook posts',state.connections.facebookPersonal],...state.connections.sites.map(s=>[`${s.key} website bridge`,s.bridge]),...state.connections.sites.map(s=>[`${s.key} repository`,s.repository]),...state.connections.instagram.map(s=>[`${s.key} Instagram`,s.configured])];for(const [name,on] of items){const row=el('div','connection');row.append(el('span','',name),el('span','muted',on?'সেটিং আছে; live যাচাই প্রয়োজন':'সংযোগ বাকি'));conn.append(row);}
  for(const s of state.connections.facebook||[]){const box=el('div','connection');box.append(el('span','',`${s.key} Facebook`));if(s.configured)action(box,'লাইভ যাচাই',async()=>{const d=await request('facebook_check',{site:s.key});notice(`${d.name}: Facebook সংযোগ কার্যকর।`);});else box.append(el('span','muted','সংযোগ বাকি'));conn.append(box);}
  for(const s of state.connections.sites){const box=el('div','connection');box.append(el('span','',s.key));action(box,'ওয়েবসাইট যাচাই',async()=>{const d=await request('website_check',{site:s.key});notice(`${d.domain}: সংযোগ সফল। ${d.reads.length}টি read action; ${Object.values(d.writes).filter(x=>x.enabled).length}টি write action চালু।`);});conn.append(box);}
  $('agentConnection').textContent=creditRule;
 }
 async function refresh(){const e=epoch;const result=await request('state');if(e!==epoch)return;state=result;restoreAvatar();render();if(!timer)timer=setInterval(()=>{if(!document.hidden&&!$('app').hidden&&!$('agent').hidden&&!busy&&!polling&&state&&(state.jobs.some(isPending)||(state.today||[]).some(isPending)||state.routines.some(r=>r.enabled&&Date.parse(r.nextRunAt)<=Date.now())))pollJobs().catch(()=>{});},contract.product.agent.pollMs);}
 const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});
 const validImage=(file,limit)=>file&&['image/png','image/jpeg'].includes(file.type)&&file.size>0&&file.size<=limit;
 function showAvatar(url){$('agentAvatar').src=url||'';$('agentAvatar').hidden=!url;$('agentAvatarInitial').hidden=!!url;}
 function restoreAvatar(){try{showAvatar(localStorage.getItem(avatarKey));}catch{showAvatar(null);}}
 $('agentName').textContent=name;
 $('agentAvatarButton').onclick=()=>$('agentAvatarFile').click();
 $('agentAvatarFile').onchange=async()=>{
  const e=epoch,file=$('agentAvatarFile').files?.[0];$('agentAvatarFile').value='';if(!file)return;
  if(!validImage(file,1000000)){notice('অ্যাভাটারের জন্য সর্বোচ্চ ১ MB-এর PNG বা JPEG বাছুন।');return;}
  try{const url=await readFile(file);if(e!==epoch)return;localStorage.setItem(avatarKey,url);showAvatar(url);}
  catch{notice('অ্যাভাটার সংরক্ষণ করা যায়নি।');}
 };
 function clearAttachment(){
  if(attachment)URL.revokeObjectURL(attachment.preview);
  attachment=null;$('agentImage').value='';$('agentAttachment').hidden=true;$('agentAttachment').replaceChildren();
 }
 $('agentChooseImage').onclick=()=>{if(!busy)$('agentImage').click();};
 $('agentImage').onchange=()=>{
  const file=$('agentImage').files?.[0];if(!file||busy)return;
  if(!validImage(file,2000000)){$('agentImage').value='';notice('সর্বোচ্চ ২ MB-এর PNG বা JPEG বাছুন।');return;}
  clearAttachment();attachment={file,preview:URL.createObjectURL(file),media:null};
  const box=$('agentAttachment'),image=el('img','attachment-preview');image.src=attachment.preview;image.alt='সংযুক্ত ছবি';
  const remove=el('button','quiet','সরান');remove.type='button';remove.onclick=()=>{if(!busy)clearAttachment();};
  box.replaceChildren(image,el('span','',file.name),remove);box.hidden=false;
 };
 $('gmailConnect').onclick=()=>run($('gmailConnect'),async()=>{const d=await request('gmail_connect');window.location.assign(d.url);});
 async function pollJobs(){
  polling=true;
  try{
   const e=epoch,prior=state,data=await request('jobs');if(e!==epoch||!state||state!==prior)return;
   const routineStarted=state.routines.some(r=>r.enabled&&data.today?.some(job=>job.routineId===r.id&&job.createdAt>=r.nextRunAt));
   const justFinished=[...state.jobs,...(state.today||[])].some(old=>['running','queued'].includes(old.status)&&[...data.jobs,...(data.today||[])].some(job=>job.id===old.id&&!['queued','running'].includes(job.status)));
   if(justFinished||routineStarted){await refresh();return;}
   const changed=JSON.stringify([data.jobs,data.today])!==JSON.stringify([state.jobs,state.today]);
   state={...state,...data};if(changed)render();
  }finally{polling=false;}
 }
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&!$('app').hidden&&!$('agent').hidden&&!busy&&state)refresh().catch(()=>{});
 });
 $('agentRefresh').onclick=()=>run($('agentRefresh'),refresh);$('reportsRefresh').onclick=()=>run($('reportsRefresh'),refresh);
 $('agentSend').onclick=()=>run($('agentSend'),async()=>{
  const e=epoch,command=$('agentCommand').value.trim(),selected=attachment;if(!command)throw Error('বার্তাটি লিখুন।');
  if(selected&&!selected.media){
   const base64=(await readFile(selected.file)).split(',')[1];
   if(e!==epoch)return;
   selected.media=await request('upload',{base64});
  }
  if(e!==epoch)return;
  if(!pending||pending.command!==command||pending.media!==selected?.media)pending={requestId:crypto.randomUUID(),command,...(selected?{media:selected.media}:{})};
  const r=await request('command',pending);if(e!==epoch)return;
  pending=null;$('agentCommand').value='';clearAttachment();
  notice(r.worker==='requested'?'বার্তা পাঠানো হয়েছে।':'কাজ কিউতে আছে। worker সেটআপ পরীক্ষা করুন।');await refresh();
 });
 $('brainForm').oninput=()=>{brainDirty=true;};
 $('brainForm').onsubmit=e=>{e.preventDefault();run($('brainSave'),async()=>{await request('brain',{expectedVersion:brainVersion,model:$('brainModel').value,instructions:$('brainInstructions').value,memory:$('brainMemory').value,timezone:$('brainZone').value,dailyAiCalls:Number($('brainDailyCalls').value),maxSteps:Number($('brainSteps').value),automaticSocial:$('brainSocial').checked,automaticWebsite:$('brainWebsite').checked,automaticDeploy:$('brainDeploy').checked,enabledTools:[...document.querySelectorAll('#brainTools input:checked')].map(e=>e.value)});brainDirty=false;await refresh();notice('ব্রেন সংরক্ষণ হয়েছে।');});};
 async function loadCalendar(month){
  const current=++calendarRequest,e=epoch,note=$('calendarNote');
  note.textContent='ক্যালেন্ডার পড়ছি…';
  try{
   const data=await request('calendar',month?{month}:{});
   if(e!==epoch||current!==calendarRequest)return;
   calendarMonth=data.month;
   const heading=new Intl.DateTimeFormat('bn-BD',{timeZone:'UTC',month:'long',year:'numeric'});
   $('calendarMonth').textContent=heading.format(new Date(`${data.month}-01T00:00:00Z`));
   const format=new Intl.DateTimeFormat('bn-BD',{timeZone:data.timezone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
   $('calendarEntries').replaceChildren(...data.entries.map(item=>el('li','',`${format.format(new Date(item.time))} · ${item.title}`)));
   note.textContent=data.truncated?'প্রথম ২০০টি কিউয়ের রেকর্ড থেকে পাওয়া কাজ দেখানো হয়েছে।':data.entries.length?'অপেক্ষমাণ পোস্ট ও রুটিনের পরের সময়।':'এই মাসে অপেক্ষমাণ পোস্ট বা রুটিন নেই।';
  }catch(err){if(e===epoch&&current===calendarRequest)note.textContent=boss(err.message||'ক্যালেন্ডার পড়া যায়নি।');}
 }
 function shiftCalendar(offset){
  if(!calendarMonth)return;
  const [year,month]=calendarMonth.split('-').map(Number);
  const next=new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7);
  return loadCalendar(next);
 }
 $('workCalendar').ontoggle=()=>{if($('workCalendar').open)loadCalendar(calendarMonth);};
 $('calendarPrev').onclick=()=>run($('calendarPrev'),()=>shiftCalendar(-1));
 $('calendarNext').onclick=()=>run($('calendarNext'),()=>shiftCalendar(1));
 $('routineNew').onclick=()=>{if(!busy)routineForm(null);};
 $('routineForm').onsubmit=e=>{e.preventDefault();run($('routineSave'),async()=>{await request('routine',{id:$('routineId').value||undefined,expectedVersion:Number($('routineVersion').value),title:$('routineTitle').value,command:$('routineCommand').value,time:$('routineTime').value,timezone:$('routineZone').value,days:[...document.querySelectorAll('#routineDays input:checked')].map(e=>Number(e.value)),enabled:$('routineEnabled').checked,allowWrites:$('routineWrites').checked});routineForm(null);await refresh();if($('workCalendar').open)await loadCalendar(calendarMonth);notice('রুটিন সংরক্ষণ হয়েছে।');});};
 $('reportSave').onclick=()=>run($('reportSave'),async()=>{if(!editReport)return;await request('report',{id:editReport.id,expectedVersion:editReport.version,body:$('reportBody').value});editReport=null;$('reportEditor').hidden=true;await refresh();notice('সংশোধন সংরক্ষণ হয়েছে; আগের সংস্করণ ও evidence রাখা আছে।');});
  return{refresh,reset(){++epoch;if(timer)clearInterval(timer);timer=null;state=null;pending=null;calendarMonth=null;++calendarRequest;$('workCalendar').open=false;$('calendarMonth').textContent='';$('calendarNote').textContent='';$('calendarEntries').replaceChildren();clearAttachment();showAvatar(null);$('agentAvatarFile').value='';$('todayCounts').textContent='';$('todayJobs').replaceChildren();brainDirty=false;editReport=null;$('agentJobs').replaceChildren();$('routineList').replaceChildren();$('reportList').replaceChildren();$('agentTrace').textContent='';$('agentCommand').value='';$('reportBody').value='';$('brainInstructions').value='';$('brainMemory').value='';$('reportEditor').hidden=true;$('agentNotice').textContent='';$('agentConnections').replaceChildren();$('routineTitle').value='';$('routineCommand').value='';$('routineId').value='';$('reportEditTitle').textContent='রিপোর্ট সংশোধন';$('tracePanel').hidden=true;}};
}
