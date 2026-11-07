import {actionInfo} from '../adapters/site-bridge/profiles.mjs';
import {unseal} from './agent-credentials.mjs';
import {createHmac,randomUUID} from 'node:crypto';
import {AppError,remoteJSON} from './core.mjs';
import {bounded,publicMedia} from './agent-core.mjs';
export const SITES={'mt-studio':{domain:'mt-studio-ai.com',prefix:'MT_STUDIO'},'golapi-shop':{domain:'golapishop.online',prefix:'GOLAPI_SHOP'}};
export function createConnectors({store,env=process.env,http=remoteJSON}){
 const required=k=>{if(!env[k]?.trim())throw new AppError(503,`সংযোগ বাকি: ${k}`);return env[k].trim()};
 const whatsAppOwner=env.WHATSAPP_OWNER_NUMBER?.trim().replace(/^\+/,'');
 const telegramOwner=env.TELEGRAM_OWNER_CHAT_ID?.trim();
 const whatsAppChat=Boolean(/^[1-9]\d{6,14}$/.test(whatsAppOwner||'')&&env.WHATSAPP_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.META_APP_SECRET&&env.WHATSAPP_VERIFY_TOKEN&&env.META_GRAPH_VERSION);
 const telegramChat=Boolean(/^\d{1,16}$/.test(telegramOwner||'')&&env.TELEGRAM_BOT_TOKEN&&/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET?.trim()||''));
 const graphVersion=()=>{const v=required('META_GRAPH_VERSION');if(!/^v\d+\.\d+$/.test(v))throw new AppError(503,'Graph version সঠিক নয়।');return v;};
 const graph=async(path,token,body)=>http(`https://graph.facebook.com/${graphVersion()}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},'Meta');
 const site=k=>{if(!SITES[k])throw new AppError(400,'ওয়েবসাইট সঠিক নয়।');return SITES[k];};
 const gh=async(k,path,body)=>{const s=site(k),repo=required(s.prefix+'_GITHUB_REPO');if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new AppError(503,'Repository owner/name দিন।');return http(`https://api.github.com/repos/${repo}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${required('GITHUB_AGENT_TOKEN')}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},'GitHub');};
 return{
  status:async()=>({whatsAppChat,telegramChat,gmail:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&(env.GMAIL_REFRESH_TOKEN||(await store.col('config').doc('gmail').get()).exists)),whatsapp:!!(env.WHATSAPP_PHONE_NUMBER_ID&&env.META_APP_SECRET&&env.WHATSAPP_VERIFY_TOKEN),facebookPersonal:!!env.PERSONAL_FACEBOOK_USER_TOKEN,facebook:Object.entries(SITES).map(([key,s])=>({key,configured:!!(env[s.prefix+'_PAGE_ID']&&env[s.prefix+'_PAGE_TOKEN']&&env.META_GRAPH_VERSION)})),sites:Object.entries(SITES).map(([key,s])=>({key,bridge:!!(env[s.prefix+'_BRIDGE_URL']&&env[s.prefix+'_BRIDGE_KEY']),repository:!!(env[s.prefix+'_GITHUB_REPO']&&env.GITHUB_AGENT_TOKEN)})),instagram:Object.entries(SITES).map(([key,s])=>({key,configured:!!(env[s.prefix+'_INSTAGRAM_ID']&&env[s.prefix+'_PAGE_TOKEN'])}))}),
  sendOwnerReply:async(source,recipient,text)=>{
   if(source==='whatsapp'&&whatsAppChat&&recipient===whatsAppOwner){
    const phoneId=required('WHATSAPP_PHONE_NUMBER_ID');
    if(!/^\d+$/.test(phoneId))throw new AppError(503,'WhatsApp phone number ID সঠিক নয়।');
    const result=await graph(`${phoneId}/messages`,required('WHATSAPP_TOKEN'),{
     messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',
     text:{preview_url:false,body:text.slice(0,4000)}
    });
    return result.messages?.[0]?.id?'sent':'unconfirmed';
   }
   if(source==='telegram'&&telegramChat&&recipient===telegramOwner){
    const result=await http(`https://api.telegram.org/bot${required('TELEGRAM_BOT_TOKEN')}/sendMessage`,{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({chat_id:Number(recipient),text:text.slice(0,4000)})
    },'Telegram');
    return result.ok&&result.result?.message_id?'sent':'unconfirmed';
   }
   return 'skipped';
  },
  facebookPage:async k=>{const s=site(k),id=required(s.prefix+'_PAGE_ID'),token=required(s.prefix+'_PAGE_TOKEN');if(!/^\d+$/.test(id))throw new AppError(503,'Facebook Page ID সঠিক নয়।');const page=await graph(`${id}?fields=id,name,tasks`,token);if(page.id!==id)throw new AppError(409,'Page token ও Page ID মিলছে না।');return{id:page.id,name:page.name,tasks:Array.isArray(page.tasks)?page.tasks:[],live:true};},
 readSource:async name=>{
  if(name==='gmail'){
   const saved=await store.col('config').doc('gmail').get();const refresh=env.GMAIL_REFRESH_TOKEN||(saved.exists?unseal(saved.data().encryptedRefresh,env):null);if(!refresh)throw new AppError(503,'অ্যাপ থেকে Gmail যুক্ত করুন।');
   const auth=await http('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:required('GOOGLE_CLIENT_ID'),client_secret:required('GOOGLE_CLIENT_SECRET'),refresh_token:refresh,grant_type:'refresh_token'}).toString()},'Gmail OAuth');
   const headers={Authorization:`Bearer ${auth.access_token}`};
   const list=await http('https://gmail.googleapis.com/gmail/v1/users/me/messages?q='+encodeURIComponent('newer_than:1d -in:spam -in:trash')+'&maxResults=50',{headers},'Gmail');
   const messages=[];const rows=list.messages||[];for(let i=0;i<rows.length;i+=5){const batch=await Promise.all(rows.slice(i,i+5).map(async m=>{const d=await http(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,{headers},'Gmail');return{id:d.id,snippet:d.snippet,labels:d.labelIds,headers:d.payload?.headers||[]};}));messages.push(...batch);}
   return{source:name,coverage:{window:'Gmail newer_than:1d',loaded:messages.length,truncated:!!list.nextPageToken,content:'headers/snippets only; attachments and full bodies not read'},items:messages};
  }
  if(name==='whatsapp'){
   required('WHATSAPP_PHONE_NUMBER_ID');
   const snap=await store.col('events').where('receivedAt','>=',new Date(Date.now()-86400000).toISOString()).limit(100).get();
   const items=snap.docs.map(d=>d.data());return{source:name,coverage:{window:'last 24 hours of collected webhooks',loaded:items.length,truncated:items.length===100,note:'শুধু সংযুক্ত Business Platform/coexistence থেকে পাওয়া events; ফোনের সব chat নয়। History event আলাদা backfill হিসেবে চিহ্নিত।'},items};
  }
  if(name==='facebook-personal'){
   const data=await graph('me/posts?fields=id,message,created_time,permalink_url&limit=25',required('PERSONAL_FACEBOOK_USER_TOKEN'));
   return{source:name,coverage:{loaded:data.data?.length||0,truncated:!!data.paging?.next,note:'শুধু API-অনুমোদিত নিজের পোস্ট; Messenger, private inbox বা সব activity নয়।'},items:data.data||[]};
  }
  throw new AppError(400,'এই audit source নেই।');
 },
 website:async(k,action,documentId='',patch={},operationId=randomUUID())=>{
  const s=site(k);if(!actionInfo(k,action))throw new AppError(400,'এই সাইটে action নেই; আগে capabilities পড়ুন।');const url=new URL(required(s.prefix+'_BRIDGE_URL'));
  if(url.protocol!=='https:'||![s.domain,'www.'+s.domain].includes(url.hostname)||url.username||url.password)throw new AppError(503,'Bridge URL নিজের নির্ধারিত website domain-এ হতে হবে।');
  const body=JSON.stringify({action,documentId,patch,operationId}),timestamp=String(Date.now()),nonce=randomUUID(),signature=createHmac('sha256',required(s.prefix+'_BRIDGE_KEY')).update(timestamp+'.'+nonce+'.'+body).digest('hex');
  const result=await http(url.href,{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Time':timestamp,'X-Agent-Nonce':nonce,'X-Agent-Signature':signature},body},s.domain);if(result.protocol!=='mt-agent-site/3.1'||result.site!==k)throw new AppError(503,'সাইটের v3.1 bridge deploy/matching profile যাচাই করুন।');return result;
 },
 publish:async payload=>{
  const s=site(payload.accountKey),token=required(s.prefix+'_PAGE_TOKEN'),id=required(s.prefix+(payload.platform==='instagram'?'_INSTAGRAM_ID':'_PAGE_ID'));
  if(!/^\d+$/.test(id))throw new AppError(503,'Meta account ID সঠিক নয়।');
  if(env.DRY_RUN!=='false')throw new AppError(409,'DRY_RUN চালু; বাইরের পোস্ট প্রকাশ বন্ধ।');
  const image=publicMedia(payload.imageUrl),caption=image&&payload.caption===''?'':bounded(payload.caption,2000);
  if(payload.platform==='instagram'){
   if(!image)throw new AppError(400,'Instagram পোস্টের জন্য পাবলিক ছবির URL প্রয়োজন।');
   const container=await graph(`${id}/media`,token,{image_url:image,caption});
   if(!container.id)throw new AppError(502,'Instagram container তৈরি হয়নি।');
   // No auto-retry if the final publication outcome is unknown.
   const result=await graph(`${id}/media_publish`,token,{creation_id:container.id});if(!result.id)throw new AppError(502,'Instagram ফল অনিশ্চিত।');return{platform:'instagram',id:result.id};
  }
  if(payload.platform!=='facebook')throw new AppError(400,'প্ল্যাটফর্ম সঠিক নয়।');
  const result=await graph(image?`${id}/photos`:`${id}/feed`,token,image?{url:image,caption}:{message:caption});if(!result.id&&!result.post_id)throw new AppError(502,'Facebook ফল অনিশ্চিত।');return{platform:'facebook',id:result.post_id||result.id};
 },
 mergeCode:async(k,prNumber)=>{
  if(!Number.isSafeInteger(prNumber)||prNumber<1)throw new AppError(400,'PR number সঠিক নয়।');
  const s=site(k),requiredNames=required(s.prefix+'_REQUIRED_CHECKS').split(',').map(x=>x.trim()).filter(Boolean),pr=await gh(k,'/pulls/'+prNumber),info=await gh(k,'');
  if(pr.merged)return{merged:true,sha:pr.merge_commit_sha,status:'আগে merge হয়েছে; deployment আলাদাভাবে যাচাই করুন।'};
  if(pr.state!=='open'||!pr.head?.ref?.startsWith('agent/')||pr.head?.repo?.full_name!==pr.base?.repo?.full_name||pr.base?.ref!==info.default_branch)throw new AppError(403,'শুধু এজেন্টের নিজের branch-এর default-branch PR merge করা যাবে।');
  const checks=await gh(k,`/commits/${pr.head.sha}/check-runs?per_page=100`);
  const runs=checks.check_runs||[];
  for(const name of requiredNames){const matches=runs.filter(r=>r.name===name).sort((a,b)=>Number(b.id)-Number(a.id));if(!matches.length||matches[0].status!=='completed')return{pending:true,reason:'প্রয়োজনীয় CI check এখনো শেষ হয়নি: '+name};if(matches[0].conclusion!=='success')throw new AppError(409,'CI check পাস করেনি: '+name);}
  if(!requiredNames.length)throw new AppError(503,'Required CI checks কনফিগার করুন।');
  if(pr.mergeable!==true)return{pending:true,reason:'Mergeability/CI যাচাই এখনো সম্পন্ন নয়।'};
  const repo=required(s.prefix+'_GITHUB_REPO'),result=await http(`https://api.github.com/repos/${repo}/pulls/${prNumber}/merge`,{method:'PUT',headers:{Authorization:`Bearer ${required('GITHUB_AGENT_TOKEN')}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({sha:pr.head.sha,merge_method:'squash'})},'GitHub merge');
  if(!result.merged)throw new AppError(409,'PR merge হয়নি।');return{merged:true,sha:result.sha,status:'CI যাচাইয়ের পর merge হয়েছে; live deployment এখনো যাচাই হয়নি।'};
 },
 deployment:async(k,sha)=>{
  const s=site(k);if(typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha))throw new AppError(400,'Commit SHA সঠিক নয়।');
  const id=required(s.prefix+'_NETLIFY_SITE_ID');if(!/^[a-zA-Z0-9-]+$/.test(id))throw new AppError(503,'Netlify site ID সঠিক নয়।');
  const d=await http(`https://api.netlify.com/api/v1/sites/${id}/deploys?per_page=20`,{headers:{Authorization:`Bearer ${required('NETLIFY_AGENT_TOKEN')}`}},'Netlify');
  if(!Array.isArray(d))throw new AppError(502,'Deployment তথ্য পাওয়া যায়নি।');const match=d.find(x=>x.commit_ref===sha);
  if(!match)return{pending:true,reason:'এই commit-এর Netlify deploy এখনো পাওয়া যায়নি।'};
  if(match.state==='ready')return{ready:true,url:match.ssl_url||match.deploy_ssl_url,commit:sha};
  if(['error','failed','rejected'].includes(match.state))throw new AppError(409,'Netlify deployment ব্যর্থ হয়েছে।');
  return{pending:true,reason:'Netlify deployment চলছে: '+match.state};
 },
 listCode:async(k)=>{const info=await gh(k,''),ref=await gh(k,'/git/ref/heads/'+encodeURIComponent(info.default_branch)),tree=await gh(k,`/git/trees/${ref.object.sha}?recursive=1`);const paths=(tree.tree||[]).filter(x=>x.type==='blob'&&!/\.env|service.account|credentials|node_modules\//i.test(x.path)).map(x=>x.path);return{paths:paths.slice(0,500),truncated:!!tree.truncated||paths.length>500,branch:info.default_branch};},
 readCode:async(k,path)=>{
  if(typeof path!=='string'||path.startsWith('/')||path.split('/').some(p=>!p||p==='..'||p==='.git')||/\.env|service.account|credentials/i.test(path))throw new AppError(400,'এই file path পড়া যাবে না।');
  const d=await gh(k,'/contents/'+path.split('/').map(encodeURIComponent).join('/'));
  if(d.type!=='file'||d.encoding!=='base64'||d.size>60000)throw new AppError(400,'শুধু ৬০ KB-এর ছোট text file পড়া যাবে।');
  return{path,sha:d.sha,content:Buffer.from(d.content,'base64').toString('utf8')};
 },
 proposeCode:async(k,b,jobId)=>{
  const s=site(k),repo=required(s.prefix+'_GITHUB_REPO'),path=bounded(b.path,300);
  if(path.startsWith('/')||path.split('/').some(p=>!p||p==='..'||p==='.git')||/\.env|service.account|credentials|^\.github\/workflows\//i.test(path))throw new AppError(400,'এই file path পরিবর্তন করা যাবে না।');
  bounded(b.content,60000);bounded(b.title,180);
  const current=await gh(k,'/contents/'+path.split('/').map(encodeURIComponent).join('/'));if(current.sha!==b.originalSha)throw new AppError(409,'File বদলেছে। আবার পড়ুন।');
  const info=await gh(k,''),base=info.default_branch,ref=await gh(k,'/git/ref/heads/'+encodeURIComponent(base)),branch='agent/'+jobId+'-'+randomUUID().slice(0,8);
  await gh(k,'/git/refs',{ref:'refs/heads/'+branch,sha:ref.object.sha});
  const token=required('GITHUB_AGENT_TOKEN');
  const update=await http(`https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({message:bounded(b.title,180),content:Buffer.from(b.content).toString('base64'),sha:b.originalSha,branch})},'GitHub');
  const pr=await gh(k,'/pulls',{title:bounded(b.title,180),head:branch,base,body:'Agent-proposed single-file change. Tests and deployment are not verified by this action.'});
  return{pullRequest:pr.html_url,prNumber:pr.number,commit:update.commit?.sha,status:'প্রস্তাবিত পরিবর্তন; merge/deploy হয়নি, CI যাচাই বাকি।'};
 }
 };
}
