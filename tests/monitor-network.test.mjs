import test from 'node:test';
import assert from 'node:assert/strict';
const local=new Map();
globalThis.browser={permissions:{contains:async()=>true},storage:{local:{get:async key=>typeof key==='string'?{[key]:local.get(key)}:Object.fromEntries(local),set:async kv=>{for(const [k,v]of Object.entries(kv))local.set(k,v);}}}};
const {refreshOfficialCatalog}=await import('../src/lib/monitor-service.mjs');
const validJSON=JSON.stringify({result:{servers:[{id:'RU1',name:'Test Server',region:'RU'}]}});
function fake(bytes,headers={}){let i=0;return async()=>({ok:true,headers:{get:k=>headers[k]??(k==='content-type'?'application/json':null)},body:{getReader(){return {read:async()=>i<bytes.length?{done:false,value:bytes[i++]}:{done:true},releaseLock(){}}}}});}
test('streaming catalog response is parsed within 1MiB boundary',async()=>{
 const enc=new TextEncoder().encode(validJSON);
 const data=await refreshOfficialCatalog(fake([enc.subarray(0,8),enc.subarray(8)]));
 assert.equal(data[0].id,'RU1');
});
test('oversized chunked API response is aborted without parsing',async()=>{
 const chunk=new Uint8Array(600000);
 await assert.rejects(()=>refreshOfficialCatalog(fake([chunk,chunk])),/слишком большой/);
});
test('oversized Content-Length is rejected before allocating response body',async()=>{
 await assert.rejects(()=>refreshOfficialCatalog(fake([] ,{'content-length':'2000000'})),/слишком большой/);
});
test('invalid UTF-8 source is rejected',async()=>{
 await assert.rejects(()=>refreshOfficialCatalog(fake([Uint8Array.from([0xff,0xff])])),/encoded|valid|utf-8|невер|invalid/i);
});
