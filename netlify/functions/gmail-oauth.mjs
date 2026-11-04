import contract from '../../public/project-contract.js';
import {services} from './api.mjs';
import {readState,seal,googleRedirect} from '../../server/agent-credentials.mjs';
import {remoteJSON} from '../../server/core.mjs';
export const handler=async event=>{
 try{if(event.httpMethod!=='GET')return{statusCode:405,body:''};const q=event.queryStringParameters||{},env=process.env,state=readState(q.state,env),{db}=services(),owner=db.collection(contract.schema.paths.owners).doc(state.uid),ref=owner.collection(contract.schema.paths.oauth).doc(state.nonce);
  await db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists||s.data().used||s.data().expires<Date.now())throw Error('Invalid state');tx.update(ref,{used:true});});
  if(q.error||!q.code)throw Error('Consent not completed');
  const token=await remoteJSON('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:googleRedirect(env),code:q.code,grant_type:'authorization_code'}).toString()},'Gmail OAuth');
  const credential=owner.collection(contract.schema.paths.config).doc('gmail'),old=await credential.get();if(!token.refresh_token&&!old.exists)throw Error('No offline refresh token');if(token.refresh_token)await credential.set({encryptedRefresh:seal(token.refresh_token,env),connectedAt:new Date().toISOString()});
  return{statusCode:302,headers:{Location:new URL('/?gmail=connected',googleRedirect(env)).href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'},body:''};
 }catch{return{statusCode:400,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'},body:'Gmail সংযোগ সম্পন্ন হয়নি। অ্যাপে ফিরে সেটিং পরীক্ষা করে আবার যুক্ত করুন।'};}
};
