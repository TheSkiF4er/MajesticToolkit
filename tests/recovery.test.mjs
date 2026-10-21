import test from 'node:test';
import assert from 'node:assert/strict';
import {RECOVERY_KEY,RECOVERY_LIMIT,isOwnedKey,ownedRecords,createRestorePoint,completeRestorePoint,examineRestorePoint,applyRestorePoint,discardRestorePoint} from '../src/lib/recovery.mjs';
function memory(initial={}){const d=structuredClone(initial);let fail='';return {data:d,failOn(value){fail=value;},async get(keys){if(keys===null)return structuredClone(d);const keysArray=Array.isArray(keys)?keys:[keys];return Object.fromEntries(keysArray.filter(k=>Object.hasOwn(d,k)).map(k=>[k,structuredClone(d[k])]));},async set(x){if(fail==='set'){fail='';throw Error('simulated quota failure');}Object.assign(d,structuredClone(x));},async remove(keys){if(fail==='remove'){fail='';throw Error('simulated delete failure');}for(const k of Array.isArray(keys)?keys:[keys])delete d[k];}};}
const sample=()=>memory({'rpNexusStateV1':{profiles:['old']},'rpnForumTemplateV2:aaa':{name:'my answer'},'majesticToolkit:externalLinks:v8':[],'third-party-key':'leave-me','google-oauth-token':'private'});
test('recovery selects all extension modules and excludes arbitrary storage including OAuth tokens',()=>{
 assert.ok(isOwnedKey('majesticLawV5:abc'));assert.ok(isOwnedKey('majesticDocumentV7:x'));assert.ok(isOwnedKey('majesticToolkitProductivityV9'));
 assert.ok(!isOwnedKey('google-oauth-token'));assert.ok(!isOwnedKey('rpnForumTemplateV20:test'));
 const picked=ownedRecords(sample().data);assert.equal(picked['third-party-key'],undefined);assert.equal(picked['google-oauth-token'],undefined);
});
test('rollback is verified, preserves unrelated keys, and removes new owned records',async()=>{
 const st=sample();const original=structuredClone(st.data);await createRestorePoint(st);
 await st.set({'rpNexusStateV1':{profiles:['new']},'rpnEconomyV4:new':{amount:5},'third-party-key':'not-ours'});
 await completeRestorePoint(st);const count=await applyRestorePoint(st);
 assert.equal(count,3);assert.deepEqual(st.data.rpNexusStateV1,original.rpNexusStateV1);assert.equal(st.data['rpnEconomyV4:new'],undefined);
 assert.equal(st.data['third-party-key'],'not-ours');assert.equal(st.data['google-oauth-token'],'private');
});
test('snapshot survives interruption, can be retried after I/O failure',async()=>{
 const st=sample();await createRestorePoint(st);st.data.rpNexusStateV1={profiles:['corrupted']};st.failOn('set');
 await assert.rejects(applyRestorePoint(st),/quota/);assert.equal((await examineRestorePoint(st)).status,'pending');
 await applyRestorePoint(st);assert.deepEqual(st.data.rpNexusStateV1,{profiles:['old']});
});
test('pending snapshot blocks another import until recovery is resolved',async()=>{
 const st=sample();await createRestorePoint(st);await assert.rejects(createRestorePoint(st),/незавершённое/);
 await completeRestorePoint(st);await createRestorePoint(st);assert.equal((await examineRestorePoint(st)).status,'pending');
});
test('corrupted hash fails before modifying current state',async()=>{
 const st=sample();await createRestorePoint(st);st.data[RECOVERY_KEY].records.rpNexusStateV1={profiles:['forged']};
 const before=structuredClone(st.data.rpNexusStateV1);
 await assert.rejects(applyRestorePoint(st),/Контрольная сумма/);assert.deepEqual(st.data.rpNexusStateV1,before);
});
test('snapshot with foreign key is rejected before writing',async()=>{
 const st=sample();await createRestorePoint(st);st.data[RECOVERY_KEY].records['other-app-data']='x';
 await assert.rejects(applyRestorePoint(st),/посторонние ключи/);
});
test('snapshot size is bounded and does not corrupt existing recovery marker',async()=>{
 const st=memory({rpNexusStateV1:{data:'x'.repeat(RECOVERY_LIMIT+10)}});
 await assert.rejects(createRestorePoint(st),/20 МиБ/);assert.equal(st.data[RECOVERY_KEY],undefined);
});
test('explicit deletion removes only recovery marker',async()=>{
 const st=sample();await createRestorePoint(st);await discardRestorePoint(st);
 assert.equal(await examineRestorePoint(st),null);assert.ok(st.data.rpNexusStateV1);
});
test('invalid restore-point timestamp and unsupported version are rejected',async()=>{
 const st=sample();await createRestorePoint(st);st.data[RECOVERY_KEY].version=999;
 await assert.rejects(examineRestorePoint(st),/Повреждена/);
});
test('snapshot checksum is deterministic across validation and state transitions',async()=>{
 const st=sample();const p=await createRestorePoint(st);assert.equal((await examineRestorePoint(st)).hash,p.hash);
 await completeRestorePoint(st);assert.equal((await examineRestorePoint(st)).hash,p.hash);
});
