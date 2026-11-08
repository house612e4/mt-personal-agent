import {getStorage,getDownloadURL} from 'firebase-admin/storage';
import {randomUUID} from 'node:crypto';
import {AppError} from './core.mjs';

export function imageType(bytes){
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return{mime:'image/png',ext:'png'};
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return{mime:'image/jpeg',ext:'jpg'};
 throw new AppError(400,'শুধু PNG বা JPEG ছবি ব্যবহার করুন।');
}

export async function saveImage(bytes,uid,env=process.env){
 if(!env.FIREBASE_STORAGE_BUCKET)throw new AppError(503,'FIREBASE_STORAGE_BUCKET সেট করুন।');
 if(!bytes.length||bytes.length>10000000)throw new AppError(400,'ছবিটি সর্বোচ্চ ১০ MB হতে পারবে।');
 const type=imageType(bytes),file=getStorage().bucket(env.FIREBASE_STORAGE_BUCKET).file(`agent-media/${uid}/${randomUUID()}.${type.ext}`);
 await file.save(bytes,{resumable:false,metadata:{contentType:type.mime,cacheControl:'public,max-age=3600',metadata:{firebaseStorageDownloadTokens:randomUUID()}}});
 return{url:await getDownloadURL(file),contentType:type.mime};
}

export function mediaType(bytes){
 try{return{...imageType(bytes),kind:'image'};}catch{}
 const brand=bytes.subarray(8,12).toString('ascii');
 const brands=['isom','iso2','iso4','iso5','iso6','iso8','mp41','mp42','avc1','hvc1','hev1','M4V ','MSNV','qt  '];
 if(bytes.length>=12&&bytes.subarray(4,8).toString('ascii')==='ftyp'&&brands.includes(brand)){
  return{mime:brand==='qt  '?'video/quicktime':'video/mp4',ext:brand==='qt  '?'mov':'mp4',kind:'video'};
 }
 throw new AppError(400,'PNG/JPEG ছবি অথবা MP4/MOV ভিডিও বেছে নাও।');
}

export async function saveVideo(bytes,uid,env=process.env){
 if(!env.FIREBASE_STORAGE_BUCKET)throw new AppError(503,'FIREBASE_STORAGE_BUCKET সেট করো।');
 const type=mediaType(bytes);
 if(type.kind!=='video'||bytes.length>4000000)throw new AppError(400,'সর্বোচ্চ ৪ MB-এর MP4/MOV ভিডিও দাও। বড় ভিডিওর public link পাঠাতে পারো।');
 const file=getStorage().bucket(env.FIREBASE_STORAGE_BUCKET).file(`agent-media/${uid}/${randomUUID()}.${type.ext}`);
 await file.save(bytes,{resumable:false,metadata:{contentType:type.mime,cacheControl:'public,max-age=3600',metadata:{firebaseStorageDownloadTokens:randomUUID()}}});
 return{url:await getDownloadURL(file),contentType:type.mime,mediaType:'video'};
}
