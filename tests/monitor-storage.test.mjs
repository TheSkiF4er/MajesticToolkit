import test from 'node:test';
import assert from 'node:assert/strict';
const records={};let failWrite=false;
globalThis.browser={storage:{local:{
 async get(keys){return keys===null?{...records}:Object.fromEntries([keys].filter(x=>Object.hasOwn(records,x)).map(x=>[x,records[x]]));},
 async set(data){if(failWrite){failWrite=false;throw Error('storage blocked');}Object.assign(records,data);},
 async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete records[k];}
}},permissions:{async contains(){return true;},async request(){return true;}}};
const storage=await import('../src/lib/monitor-store.mjs');
const service=await import('../src/lib/monitor-service.mjs');
const core=await import('../src/lib/monitor-core.mjs');
const catalog={result:{servers:[{id:'RU1',name:'New York',region:'RU'},{id:'RO1',name:'Арбатский',region:'RU'}]}};
const fetcher=(payload,code=200)=>async (_url,opts)=>({ok:code===200,status:code,headers:{get:()=> 'application/json'},async text(){return JSON.stringify(payload)}});
test('verified official catalog and live sample persist through the browser storage API',async()=>{
 const found=await service.refreshOfficialCatalog(fetcher(catalog));assert.equal(found.length,2);
 let state=await storage.loadMonitor();assert.equal(state.catalog.length,2);
 const sample=await service.refreshVerifiedOnline(fetcher({result:{servers:[{id:'RU1',online:543,queue:12,status:'online'},{id:'RO1',online:400,queue:0,status:'online'}]}}));
 assert.equal(sample.length,2);
 state=await storage.favoriteServer('RU1');assert.deepEqual(state.favorites,['RU1']);assert.equal(state.live[0].online,543);
});
test('invalid response or failed request leaves cached known-good snapshot unchanged',async()=>{
 const before=await storage.loadMonitor();
 await assert.rejects(()=>service.refreshVerifiedOnline(fetcher({result:{servers:[{id:'RU1',online:'fake'}]}})),/подтверждённых/);
 await assert.rejects(()=>service.refreshOfficialCatalog(fetcher(null,503)),/503/);
 assert.deepEqual(await storage.loadMonitor(),before);
});
test('atomic storage errors never update in-memory monitor state',async()=>{
 const original=await storage.loadMonitor();failWrite=true;
 await assert.rejects(()=>storage.favoriteServer('RO1'),/storage blocked/);
 assert.deepEqual(await storage.loadMonitor(),original);
});
test('manual API permission and source URLs never request unrelated sites',async()=>{
 let options;const pm={async request(arg){options=arg;return true;},async contains(){return true;}};
 assert.equal(await service.requestMonitorPermission(pm),true);
 assert.deepEqual(options.origins,['https://api.majestic-files.com/*']);
 assert.equal(core.CATALOG_URL,'https://api.majestic-files.com/meta/general');
});
test('remote monitoring never authorizes automatic access before permission',async()=>{
 const pm={async contains(){return false;}};
 assert.equal(await service.hasMonitorPermission(pm),false);
});
