import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const definitions={product:'PRD.md',flow:'AppFlow.md',ui:'UI_Spec.md',tech:'TRD.md',schema:'Schema.md',plan:'Plan.md'};
export function loadBlueprints(root){
 const result={};
 for(const [key,name] of Object.entries(definitions)){
  const source=readFileSync(resolve(root,name),'utf8');
  const blocks=[...source.matchAll(/```json blueprint\s*\n([\s\S]*?)\n```/g)];
  if(blocks.length!==1)throw Error(`${name}: exactly one executable blueprint block is required`);
  result[key]=JSON.parse(blocks[0][1]);
 }
 return result;
}
function requireRule(condition,message){if(!condition)throw Error('Blueprint contract: '+message);}
export function verifyBlueprints(root,c){
 const positive=n=>Number.isSafeInteger(n)&&n>0;
 for(const n of [c.product.maxPostLength,c.product.maxTopicLength,c.flow.minRecoveryWaitMs,c.flow.providerTimeoutMs,c.flow.clientTimeoutMs,c.flow.configTimeoutMs,c.schema.pageSize,c.schema.maxBodyLength,c.schema.aiMaxDaily,c.schema.aiMinIntervalMs])requireRule(positive(n),'limits/timeouts must be positive integers');
 requireRule(c.schema.pageSize<=100,'page size must be <=100');
 requireRule(c.flow.minRecoveryWaitMs>c.flow.providerTimeoutMs,'recovery wait must exceed provider timeout');
 requireRule(c.flow.clientTimeoutMs>c.flow.providerTimeoutMs,'client timeout must exceed provider timeout');
 requireRule(Array.isArray(c.product.accounts)&&c.product.accounts.length===3,'three declared accounts required');
 requireRule(new Set(c.product.accounts.map(a=>a.key)).size===3,'account keys must be unique');
 for(const a of c.product.accounts){requireRule(/^[a-z0-9-]+$/.test(a.key)&&a.label&&a.initial&&['page','personal'].includes(a.kind),'valid account definition');requireRule(a.kind!=='page'||/^[A-Z_]+$/.test(a.prefix),'Page token prefix');const u=new URL(a.url);requireRule(u.protocol==='https:'&&u.hostname==='www.facebook.com','Facebook account URL');}
 requireRule(Object.values(c.flow.states).sort().join(',')==='draft,published,publishing,review_required','publication state names are fixed until lifecycle migration');
 for(const [k,v] of Object.entries(c.schema.paths))requireRule(/^[A-Za-z][A-Za-z0-9_-]*$/.test(v),'invalid collection path '+k);
 for(const v of Object.values(c.ui.colors))requireRule(/^#[0-9a-f]{6}$/i.test(v),'UI color must be a six-digit hex value');
 requireRule(c.product.agent&&Array.isArray(c.product.agent.tools)&&new Set(c.product.agent.tools).size===c.product.agent.tools.length,'agent tool allowlist is required');
 requireRule(c.product.agent.name && c.product.agent.creditRule,'agent name and credit rule are required');
 for(const n of [c.product.agent.maxSteps,c.product.agent.maxDailyAiCalls,c.product.agent.pollMs,c.product.agent.workerBatchSize,c.product.agent.routineScanLimit])requireRule(positive(n),'agent policy values must be positive integers');
 requireRule(c.product.agent.maxSteps<=16&&c.product.agent.workerBatchSize<=10,'agent execution bounds exceed supported range');
 const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
 const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8'));
 requireRule(pkg.scripts.build===c.plan.buildScript,'build command differs from Plan.md');
 requireRule(pkg.dependencies['firebase-admin']===c.tech.firebaseAdmin,'Firebase Admin differs from TRD.md');
 requireRule(pkg.dependencies['web-push']===c.tech.webPush && lock.packages['node_modules/web-push'].version===c.tech.webPush,'Web Push version differs from TRD.md');
 requireRule(lock.packages['node_modules/firebase-admin'].version===c.tech.firebaseAdmin,'lockfile Firebase version mismatch');
 requireRule(pkg.overrides?.rimraf?.glob===c.tech.globOverride,'glob override differs from TRD.md');
 requireRule(lock.packages['node_modules/glob'].version===c.tech.globOverride,'lockfile glob version mismatch');
 const netlify=readFileSync(resolve(root,'netlify.toml'),'utf8');
 for(const [key,value] of [['NODE_VERSION',String(c.tech.nodeMajor)],['publish',c.tech.publishDirectory],['directory',c.tech.functionsDirectory]])requireRule(netlify.includes(`${key} = "${value}"`),'Netlify '+key+' differs from TRD.md');
 for(const test of c.plan.requiredTestFiles)requireRule(existsSync(resolve(root,test)),'required test missing: '+test);
 const css=readFileSync(resolve(root,'public/style.css'),'utf8');
 for(const size of c.ui.breakpoints)requireRule(css.includes(`max-width:${size}px`),'responsive breakpoint differs from UI_Spec.md');
 for(const file of ['public/app.js','server/core.mjs','netlify/functions/api.mjs'])requireRule(readFileSync(resolve(root,file),'utf8').includes('project-contract.js'),'runtime contract import missing: '+file);
}
export function generate(root){
 const contract=loadBlueprints(root);verifyBlueprints(root,contract);
 const runtime={product:contract.product,flow:contract.flow,ui:contract.ui,tech:contract.tech,schema:contract.schema};
 const htmlPath=resolve(root,'public/index.html');
 let html=readFileSync(htmlPath,'utf8');
 for(const [id,max] of [['post',contract.product.maxPostLength],['topic',contract.product.maxTopicLength]])html=html.replace(new RegExp('(<textarea id="'+id+'"[^>]*maxlength=")\\d+(")'),(_,start,end)=>start+max+end);
 writeFileSync(htmlPath,html);
 writeFileSync(resolve(root,'public/project-contract.js'),'// Generated from the six root blueprints. Edit the blueprints, then run npm run build.\nexport default '+JSON.stringify(runtime,null,2)+';\n');
 writeFileSync(resolve(root,'public/design-tokens.css'),'/* Generated from UI_Spec.md. */\n:root{'+Object.entries(contract.ui.colors).map(([k,v])=>`${k}:${v}`).join(';')+'}\n');
 return runtime;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){generate(process.cwd());console.log('Six blueprints validated; shared runtime contract and design tokens generated.');}
