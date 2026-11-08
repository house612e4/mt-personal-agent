import test from 'node:test';
import assert from 'node:assert/strict';
import {siteDb} from './helpers/site-db.mjs';
import {createStore} from '../server/agent-store.mjs';

test('durable memories can be listed and explicitly forgotten',async()=>{
 const {db}=siteDb(),store=createStore(db,'owner');
 const saved=await store.remember('আমি সংক্ষিপ্ত বাংলা পছন্দ করি');
 assert.equal((await store.listMemories())[0].id,saved.id);
 await store.deleteMemory(saved.id);
 assert.equal((await store.listMemories()).length,0);
});

test('agent model follows server configuration before owner overrides it',async()=>{
 const {db}=siteDb(),store=createStore(db,'owner',{OPENAI_AGENT_MODEL:'available-model'});
 assert.equal((await store.brain()).model,'available-model');
});
