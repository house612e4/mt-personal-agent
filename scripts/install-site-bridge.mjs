#!/usr/bin/env node
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function installSiteBridge(site,destination){
 if(!['mt-studio','golapi-shop'].includes(site))throw Error('Use --site mt-studio or golapi-shop');
 const target=resolve(destination);if(target===root)throw Error('Target must be a separate website repository, not the agent repository');
 const pkg=JSON.parse(await readFile(join(target,'package.json'),'utf8')),manifest=JSON.parse(await readFile(join(root,'adapters/site-bridge/source-manifest.json'),'utf8'));
 const expected=site==='mt-studio'?'mt-studio-netlify-firebase':'golapishop-online-unified';if(pkg.name!==expected)throw Error('Wrong repository: package name must be '+expected);
 for(const file of manifest[site].requiredFiles)await stat(join(target,file));
 if(site==='mt-studio'&&!pkg.dependencies?.['firebase-admin'])throw Error('Target firebase-admin dependency missing');
 if(site==='golapi-shop'&&Object.keys(pkg.dependencies||{}).some(k=>k!=='firebase-admin'))throw Error('Additional root dependencies found; merge dependency lock before installing. No files changed.');
 const sources={};for(const file of manifest[site].requiredFiles)sources[file]=createHash('sha256').update(await readFile(join(target,file))).digest('hex');
 const sourceBaselineMatches=Object.entries(sources).filter(([name])=>!['package.json','netlify.toml'].includes(name)).every(([name,hash])=>manifest[site].sha256[name]===hash);
 if(!sourceBaselineMatches)throw Error('Site logic differs from reviewed source. Review adapter compatibility first; no files changed.');
 let config=await readFile(join(target,'netlify.toml'),'utf8');
 if(/^\[functions\]\s*$/m.test(config)){
  const block=config.match(/^\[functions\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1]||'';
  if(!/^\s*external_node_modules\s*=/m.test(block))config=config.replace(/^\[functions\][ \t]*$/m,'[functions]\n  external_node_modules = ["firebase-admin"]');
  const dir=block.match(/^\s*directory\s*=\s*"([^"]+)"/m)?.[1];if(dir&&dir!=='netlify/functions')throw Error('Existing functions directory differs; no files changed');
 }else config+='\n[functions]\n  directory = "netlify/functions"\n  node_bundler = "esbuild"\n  external_node_modules = ["firebase-admin"]\n';
 const bridgeDir=join(target,'netlify/agent'),functionDir=join(target,'netlify/functions');await mkdir(bridgeDir,{recursive:true});await mkdir(functionDir,{recursive:true});
 for(const name of ['common.mjs','profiles.mjs','domain.mjs','handler.mjs','firebase.mjs'])await copyFile(join(root,'adapters/site-bridge',name),join(bridgeDir,name));
 const imports=site==='mt-studio'?"import {validateBrand} from '../../lib/studio-settings.ts';\nimport {validatePolicies,validateContest} from '../../lib/site-content.ts';\n":'';
 const wrapper=`import {makeHandler} from '../agent/handler.mjs';\nimport {siteFirebase} from '../agent/firebase.mjs';\n${imports}export const handler=makeHandler({site:'${site}',getDb:()=>siteFirebase().db,getUser:id=>siteFirebase().auth.getUser(id),validators:${site==='mt-studio'?'{validateBrand,validatePolicies,validateContest}':'{}'}});\n`;
 await writeFile(join(functionDir,'agent-bridge.mjs'),wrapper);
 await writeFile(join(target,'netlify.toml'),config);
 if(site==='golapi-shop'){
  const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
  pkg.dependencies={...pkg.dependencies,'firebase-admin':'14.5.0'};pkg.overrides={...pkg.overrides,rimraf:{...pkg.overrides?.rimraf,glob:'14.0.3'}};
  lock.name=pkg.name;lock.version=pkg.version;lock.packages['']={name:pkg.name,version:pkg.version,dependencies:pkg.dependencies,engines:pkg.engines};
  await writeFile(join(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');await writeFile(join(target,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
  await mkdir(join(target,'.github/workflows'),{recursive:true});
  await writeFile(join(target,'.github/workflows/agent-site-ci.yml'),`name: Validate Golapi website\non:\n  push:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  validate-agent-site:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm ci --ignore-scripts --no-audit --no-fund\n      - run: npm --prefix driver-app ci --no-audit --no-fund\n      - run: npm --prefix customer-app ci --no-audit --no-fund\n      - run: npm run check\n      - run: node --check netlify/functions/agent-bridge.mjs\n      - run: node --test tests/agent-bridge.test.mjs\n`);
 }
 await mkdir(join(target,'tests'),{recursive:true});await copyFile(join(root,'adapters/site-bridge/smoke-test.template'),join(target,'tests/agent-bridge.test.mjs'));
 const changed=['netlify/functions/agent-bridge.mjs',...['common','profiles','domain','handler','firebase'].map(n=>'netlify/agent/'+n+'.mjs'),'netlify.toml','tests/agent-bridge.test.mjs',...(site==='golapi-shop'?['package.json','package-lock.json','.github/workflows/agent-site-ci.yml']:[])];
 return{site,target,changed,sourceBaselineMatches,requiredCheck:site==='mt-studio'?'validate':'validate-agent-site'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),site=args[args.indexOf('--site')+1],target=args[args.indexOf('--target')+1];
 if(!args.includes('--site')||!args.includes('--target')||!target)throw Error('node scripts/install-site-bridge.mjs --site mt-studio|golapi-shop --target /path/to/site');
 console.log(JSON.stringify(await installSiteBridge(site,target),null,2));
}
