import {services} from './api.mjs';
import {checkWorker} from '../../server/agent-runtime.mjs';
import {createAgentService} from '../../server/agent-service.mjs';
export const handler=async event=>{
 try{if(event.httpMethod!=='POST')return{statusCode:405,body:''};checkWorker(event.headers);if(!process.env.OWNER_UID)return{statusCode:503,body:''};const {db}=services();const service=createAgentService({db,uid:process.env.OWNER_UID.trim()});return{statusCode:200,body:JSON.stringify(await service.drain())};}
 catch(e){return{statusCode:e.status||500,body:JSON.stringify({error:e.status?e.message:'Worker কাজ সম্পন্ন হয়নি।'})};}
};
