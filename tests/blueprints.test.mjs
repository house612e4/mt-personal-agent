import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {loadBlueprints,verifyBlueprints,generate} from '../scripts/blueprints.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
function sandbox(fn){const tmp=mkdtempSync(join(tmpdir(),'mt-blueprint-'));cpSync(root,tmp,{recursive:true,filter:p=>!p.split('/').some(x=>['node_modules','.qa','.git'].includes(x))});return Promise.resolve().then(()=>fn(tmp)).finally(()=>rmSync(tmp,{recursive:true,force:true}));}
function change(tmp,name,fn){const path=join(tmp,name);let s=readFileSync(path,'utf8');s=s.replace(/```json blueprint\s*\n([\s\S]*?)\n```/,(_,block)=>'```json blueprint\n'+JSON.stringify(fn(JSON.parse(block)),null,2)+'\n```');writeFileSync(path,s);}
test('all six executable blueprint contracts validate',()=>{const c=loadBlueprints(root);assert.equal(Object.keys(c).length,6);verifyBlueprints(root,c);});
test('PRD edit actually changes shared runtime text validation',()=>sandbox(async tmp=>{change(tmp,'PRD.md',c=>({...c,maxPostLength:1536}));generate(tmp);const core=await import(pathToFileURL(join(tmp,'server/core.mjs')).href);assert.equal(core.text('x'.repeat(1400)).length,1400);assert.match(readFileSync(join(tmp,'public/project-contract.js'),'utf8'),/"maxPostLength": 1536/);assert.throws(()=>core.text('x'.repeat(1537)));}));
test('UI blueprint edit actually changes generated stylesheet',()=>sandbox(tmp=>{change(tmp,'UI_Spec.md',c=>({...c,colors:{...c.colors,'--green':'#123456'}}));generate(tmp);assert.match(readFileSync(join(tmp,'public/design-tokens.css'),'utf8'),/--green:#123456/);}));
test('Schema limits feed the shared runtime contract',()=>sandbox(tmp=>{change(tmp,'Schema.md',c=>({...c,pageSize:75}));const c=generate(tmp);assert.equal(c.schema.pageSize,75);assert.match(readFileSync(join(tmp,'public/project-contract.js'),'utf8'),/"pageSize": 75/);}));
test('unsafe AppFlow recovery interval fails validation',()=>sandbox(tmp=>{change(tmp,'AppFlow.md',c=>({...c,minRecoveryWaitMs:1}));assert.throws(()=>generate(tmp),/recovery wait/);}));
test('TRD package mismatch fails build',()=>sandbox(tmp=>{const p=join(tmp,'package.json'),pkg=JSON.parse(readFileSync(p));pkg.dependencies['firebase-admin']='0.0.0';writeFileSync(p,JSON.stringify(pkg));assert.throws(()=>generate(tmp),/Firebase Admin differs/);}));
test('Plan required test removal fails build',()=>sandbox(tmp=>{unlinkSync(join(tmp,'tests/api.test.mjs'));assert.throws(()=>generate(tmp),/required test missing/);}));
test('missing blueprint cannot silently pass',()=>sandbox(tmp=>{unlinkSync(join(tmp,'PRD.md'));assert.throws(()=>generate(tmp));}));
