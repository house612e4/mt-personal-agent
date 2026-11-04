import {getStorage,getDownloadURL} from 'firebase-admin/storage';
import {randomUUID} from 'node:crypto';
import {AppError} from './core.mjs';
export function imageType(bytes){if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return{mime:'image/png',ext:'png'};if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return{mime:'image/jpeg',ext:'jpg'};throw new AppError(400,'শুধু PNG বা JPEG ছবি ব্যবহার করুন।');}
export async function saveImage(bytes,uid,env=process.env){if(!env.FIREBASE_STORAGE_BUCKET)throw new AppError(503,'FIREBASE_STORAGE_BUCKET সেট করুন।');if(!bytes.length||bytes.length>10000000)throw new AppError(400,'ছবিটি সর্বোচ্চ ১০ MB হতে পারবে।');const type=imageType(bytes),file=getStorage().bucket(env.FIREBASE_STORAGE_BUCKET).file(`agent-media/${uid}/${randomUUID()}.${type.ext}`);await file.save(bytes,{resumable:false,metadata:{contentType:type.mime,cacheControl:'public,max-age=3600',metadata:{firebaseStorageDownloadTokens:randomUUID()}}});return{url:await getDownloadURL(file),contentType:type.mime};}
export async function generateImage({prompt,brain,store,env=process.env,fetcher=fetch,save=saveImage}){
 if(!env.OPENAI_API_KEY||!env.FIREBASE_STORAGE_BUCKET)throw new AppError(503,'Image generation-এর API key ও Storage bucket সেট করুন।');
 const ref=store.col('limits').doc('agent-images'),day=new Date().toISOString().slice(0,10);
 await store.db.runTransaction(async tx=>{const s=await tx.get(ref),d=s.data()||{},count=d.day===day?d.count||0:0;if(count>=brain.dailyImages)throw new AppError(429,'আজকের ছবি তৈরির সীমা শেষ।');tx.set(ref,{day,count:count+1});});
 let response;try{response=await fetcher('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:brain.imageModel,prompt,n:1,size:'1024x1024',quality:'low',output_format:'jpeg'}),signal:AbortSignal.timeout(180000)});}catch{throw new AppError(502,'ছবি তৈরির ফল পাওয়া যায়নি। quota reservation রাখা হয়েছে।');}
 const data=await response.json().catch(()=>({}));if(!response.ok||!data.data?.[0]?.b64_json)throw new AppError(502,'ছবি তৈরি হয়নি। model access, billing ও request পরীক্ষা করুন।');
 return save(Buffer.from(data.data[0].b64_json,'base64'),store.uid,env);
}
