export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const accountInfo = [
  {key:'mt-studio',label:'MT Studio',kind:'page',url:'https://www.facebook.com/mtstudioai',prefix:'MT_STUDIO'},
  {key:'golapi-shop',label:'Golapi Shop Online',kind:'page',url:'https://www.facebook.com/profile.php?id=61596314931955',prefix:'GOLAPI_SHOP'},
  {key:'md-mahsin',label:'Md Mahsin',kind:'personal',url:'https://www.facebook.com/Mahsin426'}
];
export function account(key) { const a=accountInfo.find(a=>a.key===key); if(!a) throw new AppError(400,'অ্যাকাউন্ট সঠিক নয়।'); return a; }
export function text(value,max=1024) { if(typeof value!=='string'||!value.trim()||value.length>max) throw new AppError(400,`১ থেকে ${max} অক্ষরের লেখা দিন।`); return value.trim(); }
export function draftId(id) { if(typeof id!=='string'||!/^[a-zA-Z0-9-]{10,64}$/.test(id)) throw new AppError(400,'খসড়ার আইডি সঠিক নয়।'); return id; }
export function publishingAllowed(env,a,approved) {
  if(approved!==true) throw new AppError(400,'পোস্ট প্রকাশের অনুমোদন দিন।');
  if(a.kind!=='page') throw new AppError(400,'ব্যক্তিগত প্রোফাইলে লেখা কপি করে নিজে পোস্ট করুন।');
  if(env.DRY_RUN!=='false') throw new AppError(409,'পরীক্ষামূলক মোড চালু। প্রকাশের জন্য Netlify-তে DRY_RUN=false করুন।');
}
export async function remoteJSON(url,options={},label='সংযোগ') {
  let res; try { res=await fetch(url,{...options,signal:AbortSignal.timeout(20000)}); }
  catch { throw new AppError(502,`${label} পাওয়া যায়নি। কিছুক্ষণ পরে চেষ্টা করুন।`); }
  const data=await res.json().catch(()=>({}));
  if(!res.ok||data.error) throw new AppError(502,`${label} ব্যর্থ। key/token, অনুমতি ও বিলিং পরীক্ষা করুন।`);
  return data;
}
