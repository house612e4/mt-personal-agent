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

const uploadSpec=contentType=>{
 const specs={
  'image/png':{ext:'png',kind:'image',maxBytes:10_000_000},
  'image/jpeg':{ext:'jpg',kind:'image',maxBytes:10_000_000},
  'video/mp4':{ext:'mp4',kind:'video',maxBytes:100_000_000},
  'video/quicktime':{ext:'mov',kind:'video',maxBytes:100_000_000}
 };
 const spec=specs[contentType];if(!spec)throw new AppError(400,'PNG/JPEG ছবি অথবা MP4/MOV ভিডিও দাও।');return spec;
};

export async function prepareMediaUpload({uid,contentType,size},env=process.env){
 if(!env.FIREBASE_STORAGE_BUCKET)throw new AppError(503,'FIREBASE_STORAGE_BUCKET সেট করো।');
 const spec=uploadSpec(contentType);
 if(!Number.isSafeInteger(size)||size<1||size>spec.maxBytes)throw new AppError(400,spec.kind==='video'?'ভিডিও সর্বোচ্চ ১০০ MB হতে পারবে।':'ছবি সর্বোচ্চ ১০ MB হতে পারবে।');
 const storagePath=`agent-media/${uid}/${randomUUID()}.${spec.ext}`,file=getStorage().bucket(env.FIREBASE_STORAGE_BUCKET).file(storagePath);
 const [uploadUrl]=await file.getSignedUrl({version:'v4',action:'write',expires:Date.now()+10*60_000,contentType});
 return{storagePath,uploadUrl,maxBytes:spec.maxBytes,mediaType:spec.kind};
}

export async function finalizeMediaUpload({storagePath,contentType,size},uid,env=process.env){
 const spec=uploadSpec(contentType),prefix=`agent-media/${uid}/`;
 if(typeof storagePath!=='string'||!storagePath.startsWith(prefix)||storagePath.includes('..'))throw new AppError(400,'আপলোডের path সঠিক নয়।');
 const file=getStorage().bucket(env.FIREBASE_STORAGE_BUCKET).file(storagePath),[metadata]=await file.getMetadata(),actual=Number(metadata.size);
 if(!Number.isSafeInteger(size)||actual!==size||actual<1||actual>spec.maxBytes){await file.delete({ignoreNotFound:true}).catch(()=>{});throw new AppError(400,'আপলোড করা ফাইলের আকার মিলছে না।');}
 const [prefixBytes]=await file.download({start:0,end:31});const detected=mediaType(prefixBytes);
 if(detected.kind!==spec.kind||detected.mime!==contentType){await file.delete({ignoreNotFound:true}).catch(()=>{});throw new AppError(400,'ফাইলের আসল ধরন নির্বাচিত ধরনের সঙ্গে মিলছে না।');}
 await file.setMetadata({contentType,cacheControl:'public,max-age=3600',metadata:{firebaseStorageDownloadTokens:randomUUID()}});
 return{url:await getDownloadURL(file),contentType,mediaType:spec.kind,storagePath};
}

export async function cleanupStaleMedia(env=process.env,now=Date.now()){
 if(!env.FIREBASE_STORAGE_BUCKET)return{deleted:0};
 const days=Math.max(1,Math.min(365,Number(env.MEDIA_RETENTION_DAYS)||30)),cutoff=now-days*86_400_000,bucket=getStorage().bucket(env.FIREBASE_STORAGE_BUCKET);
 const [files]=await bucket.getFiles({prefix:'agent-media/',maxResults:200});let deleted=0;
 for(const file of files){const [metadata]=await file.getMetadata().catch(()=>[null]);if(metadata&&Date.parse(metadata.timeCreated)<cutoff){await file.delete({ignoreNotFound:true});deleted++;}}
 return{deleted,scanned:files.length,retentionDays:days};
}

export async function cleanupPendingUploads(store,env=process.env,now=Date.now()){
 const snapshot=await store.col('uploads').where('expiresAt','<=',now).limit(50).get();let deleted=0;
 for(const document of snapshot.docs){const data=document.data();if(data.status!=='ready'&&typeof data.storagePath==='string'&&env.FIREBASE_STORAGE_BUCKET)await getStorage().bucket(env.FIREBASE_STORAGE_BUCKET).file(data.storagePath).delete({ignoreNotFound:true}).catch(()=>{});await document.ref.delete();deleted++;}
 return{deleted};
}
