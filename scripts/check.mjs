import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';import {execFileSync} from 'node:child_process';
function walk(p){return readdirSync(p).flatMap(f=>{const q=join(p,f);return statSync(q).isDirectory()?walk(q):[q]});}
for(const root of ['public','server','netlify','scripts'])for(const file of walk(root)){if(/\.(mjs|js)$/.test(file))execFileSync(process.execPath,['--check',file],{stdio:'inherit'});}
for(const f of ['public/manifest.webmanifest','package.json'])JSON.parse(readFileSync(f,'utf8'));
console.log('JavaScript syntax and JSON checks passed.');
