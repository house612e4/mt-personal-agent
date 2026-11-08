import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('production UI is chat-first and legacy demo dashboard is absent',()=>{
 assert.match(html,/id="agent"/);
 assert.match(html,/id="agentCommand"/);
 assert.doesNotMatch(html,/id="demo"|id="compose"|id="drafts"|id="insights"|id="post"/);
});

test('main navigation contains only agent operations',()=>{
 for(const tab of ['agent','routines','reports','brain','settings'])assert.match(html,new RegExp(`data-tab="${tab}"`));
 assert.doesNotMatch(html,/data-tab="compose"|data-tab="drafts"|data-tab="insights"/);
});

test('logout clears the mounted agent state and authenticated session',()=>{
 assert.match(app,/agentUI\.reset\(\)/);
 assert.match(app,/user=null/);
 assert.match(app,/fb\.signOut\(auth\)/);
});
