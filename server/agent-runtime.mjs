import {timingSafeEqual} from 'node:crypto';
import {AppError} from './core.mjs';
export function checkWorker(headers,env=process.env){const secret=env.INTERNAL_WORKER_SECRET;if(!secret||secret.length<32)throw new AppError(503,'INTERNAL_WORKER_SECRET কমপক্ষে ৩২ অক্ষর দিন।');const value=(headers?.authorization||'').replace(/^Bearer /,'');if(Buffer.byteLength(value)!==Buffer.byteLength(secret)||!timingSafeEqual(Buffer.from(value),Buffer.from(secret)))throw new AppError(401,'অনুমতি নেই।');}
export async function wake(env=process.env){
 if(!env.INTERNAL_WORKER_SECRET||env.INTERNAL_WORKER_SECRET.length<32)throw new AppError(503,'Worker secret সেটআপ বাকি।');
 let url;try{url=new URL(env.URL||env.AGENT_BASE_URL);}catch{throw new AppError(503,'Netlify URL/AGENT_BASE_URL সেট করুন।');}
 if(url.protocol!=='https:'||url.username||url.password)throw new AppError(503,'Worker base URL HTTPS হতে হবে।');
 const response=await fetch(new URL('/.netlify/functions/worker-background',url),{method:'POST',headers:{Authorization:`Bearer ${env.INTERNAL_WORKER_SECRET}`},signal:AbortSignal.timeout(5000),redirect:'error'});
 if(!response.ok)throw new AppError(502,'Worker চালু হয়নি; কাজ queue-তে আছে।');return{queued:true};
}
