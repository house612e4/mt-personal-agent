import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldPath} from 'firebase-admin/firestore';
const require=createRequire(import.meta.url);
test('updated Firebase SDK builds actual cursor query without network',async()=>{
 const app=initializeApp({projectId:'mt-agent-unit-test'},'dependency-test');
 try{assert.equal(typeof getAuth(app).verifyIdToken,'function');const q=getFirestore(app).collection('owners').doc('owner').collection('drafts').orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc').startAfter('2026-01-01T00:00:00.000Z','draft-1234567890').limit(51);assert.equal(typeof q.get,'function');}
 finally{await deleteApp(app);}
});
test('patched glob remains compatible with rimraf async and sync APIs',async()=>{
 const {rimraf,rimrafSync}=require('rimraf');const root=await mkdtemp(join(tmpdir(),'mt-agent-glob-'));
 try{await mkdir(join(root,'one'));await mkdir(join(root,'two'));await writeFile(join(root,'one','a.tmp'),'test');await writeFile(join(root,'two','b.tmp'),'test');await rimraf(join(root,'one','*.tmp'),{glob:true});await assert.rejects(()=>access(join(root,'one','a.tmp')));rimrafSync(join(root,'two','*.tmp'),{glob:true});await assert.rejects(()=>access(join(root,'two','b.tmp')));await rimraf(join(root,'one'));await assert.rejects(()=>access(join(root,'one')));}
 finally{await rm(root,{recursive:true,force:true});}
});
