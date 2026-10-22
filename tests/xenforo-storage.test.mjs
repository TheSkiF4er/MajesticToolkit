import test from 'node:test';
import assert from 'node:assert/strict';
// Storage API is bound at module evaluation. This test file has its own isolated Node process.
const data=Object.create(null);
let failed=false;
globalThis.browser={storage:{local:{
  async get(keys){if(keys===null)return {...data}; const names=Array.isArray(keys)?keys:[keys];return Object.fromEntries(names.filter(x=>x in data).map(x=>[x,data[x]]));},
  async set(obj){if(failed){failed=false;throw Error('failed storage write');}Object.assign(data,obj);},
  async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}
}}};
const store=await import('../src/lib/xenforo-store.mjs');
const core=globalThis.MTXenForo;

test('XenForo bookmarks persist, edit, remove and isolate invalid storage data',async()=>{
 const first=await store.saveXenForoLink({profileId:'a',title:'Правила сервера',url:'https://forum.majestic-rp.ru/pages/rules/'});
 const b=await store.saveXenForoLink({profileId:'b',title:'Fletcher',url:'https://www.fletcher-wiki.com/russiaonline'});
 assert.equal((await store.listXenForoLinks()).length,2);
 await store.saveXenForoLink({profileId:'a',title:'Новые правила',url:'https://example.org/'},first.id);
 assert.equal((await store.listXenForoLinks()).find(x=>x.id===first.id).title,'Новые правила');
 data[core.PREFIX+'fake12345']={id:'fake12345',title:'javascript',url:'javascript:alert(1)',profileId:'a'};
 assert.equal((await store.listXenForoLinks()).length,2);
 await store.deleteXenForoLink(b.id);
 assert.equal((await store.listXenForoLinks()).length,1);
 delete data[core.PREFIX+'fake12345'];
});

test('XenForo batch replacement supports rollback on write failure',async()=>{
 const original=await store.listXenForoLinks();
 const changed=[{id:'xf_12345678',profileId:'*',title:'Меню',url:'https://example.org/',createdAt:new Date().toISOString()}];
 failed=true;
 await assert.rejects(()=>store.replaceXenForoLinks(changed),/failed storage write/);
 assert.deepEqual(await store.listXenForoLinks(),original);
 await store.replaceXenForoLinks(changed);
 assert.deepEqual(await store.listXenForoLinks(),changed);
});
