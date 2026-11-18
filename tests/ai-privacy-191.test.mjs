import test from 'node:test';
import assert from 'node:assert/strict';
// A separate Node test process loads the real browser adapter after supplying a
// deterministic extension API. This exercises persisted production preferences.
const records={};
const origin='http://127.0.0.1/*';
const grants=new Set();
globalThis.browser={permissions:{async request({origins}){origins.forEach(x=>grants.add(x));return true;},async contains({origins}){return origins.every(x=>grants.has(x));}},storage:{local:{async get(k){return {[k]:records[k]};},async set(v){Object.assign(records,structuredClone(v));}}}};
const m=await import('../src/lib/ai-connection.mjs');
test('AI settings default to disabled and persist only one boolean per profile',async()=>{
 assert.deepEqual(await m.getAISettings('p_first'),{enabled:false});assert.deepEqual(await m.getAISettings('p_second'),{enabled:false});
 await m.setAIEnabled('p_first',true);assert.deepEqual(await m.getAISettings('p_first'),{enabled:true});assert.deepEqual(await m.getAISettings('p_second'),{enabled:false});
 assert.deepEqual(records[m.AI_SETTINGS_KEY],{p_first:{enabled:true}});
 assert.ok(!JSON.stringify(records).includes('sk-'));assert.ok(!JSON.stringify(records).includes('Bearer'));
 await m.setAIEnabled('p_first',false);assert.deepEqual(await m.getAISettings('p_first'),{enabled:false});
});
test('AI host permission remains optional and is requested on explicit action',async()=>{
 assert.equal(await m.hasAIPermission(),false);assert.equal(await m.requestAIPermission(),true);assert.equal(await m.hasAIPermission(),true);assert.deepEqual([...grants],[origin]);
});
test('profile removal clears persistent AI flag and rejects invalid injected settings',async()=>{
 await m.setAIEnabled('p_first',true);await m.setAIEnabled('p_second',true);
 await m.removeAIProfile('p_first');assert.equal(await m.getAISettings('p_first').then(s=>s.enabled),false);assert.equal(await m.getAISettings('p_second').then(s=>s.enabled),true);
 records[m.AI_SETTINGS_KEY].p_second={enabled:true,apiKey:'sk-not-allowed'};
 await assert.rejects(()=>m.getAISettings('p_second'),/Некорректные настройки AI/);
});
