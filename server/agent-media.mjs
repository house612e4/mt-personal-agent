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
