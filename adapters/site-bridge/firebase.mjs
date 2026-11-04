import {cert,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
export function siteFirebase(env=process.env){let app=getApps().find(a=>a.name==='personal-agent-site');if(!app){const raw=env.FIREBASE_SERVICE_ACCOUNT_JSON;if(!raw)throw Error('Target site Firebase service account missing');const service=JSON.parse(raw);if(!service.project_id||!service.client_email||!service.private_key)throw Error('Target site Firebase service account invalid');app=initializeApp({credential:cert(service),projectId:service.project_id},'personal-agent-site');}return{db:getFirestore(app),auth:getAuth(app)};}
