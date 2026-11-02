import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';import {execFileSync} from 'node:child_process';
function walk(p){return readdirSync(p).flatMap(f=>{const q=join(p,f);return statSync(q).isDirectory()?walk(q):[q]});}
for(const root of ['public','server','netlify','scripts','tests'])for(const file of walk(root)){if(/\.(mjs|js)$/.test(file))execFileSync(process.execPath,['--check',file],{stdio:'inherit'});}
for(const f of ['public/manifest.webmanifest','package.json'])JSON.parse(readFileSync(f,'utf8'));
console.log('JavaScript syntax and JSON checks passed.');

const html=readFileSync('public/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw Error('Duplicate HTML IDs');
const code=readFileSync('public/app.js','utf8');
for(const m of code.matchAll(/\$\('([^']+)'\)/g))if(!ids.includes(m[1]))throw Error('Missing HTML element: '+m[1]);
const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
for(const icon of manifest.icons)readFileSync('public'+icon.src);
console.log('HTML IDs, JS element references and PWA assets passed.');
