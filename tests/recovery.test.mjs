import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {captureRecovery,commitRecovery,restoreRecovery,getRecoveryStatus,discardRecovery,RECOVERY_KEY,managedKeys} from '../src/lib/recovery.mjs';
globalThis.crypto ??= webcrypto;
function storage(seed={}){
  const data=structuredClone(seed);
  return {data,
    async get(keys){if(keys===null)return structuredClone(data);const selected=Array.isArray(keys)?keys:[keys];return Object.fromEntries(selected.filter(k=>Object.hasOwn(data,k)).map(k=>[k,structuredClone(data[k])]));},
    async set(entries){Object.assign(data,structuredClone(entries));},
    async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[k];}
  };
}
const original={rpNexusStateV1:{profiles:[],preferences:{theme:'dark'}},'rpnComplaintV3:abc12345':{id:'abc12345'},'majesticToolkit:googleClientId:v8':'unchanged','otherExtension:unrelated':'keep'};
test('creates persisted point, restores local records and leaves external keys untouched',async()=>{
  const s=storage(original);
  const saved=await captureRecovery(s);assert.equal(saved.count,2);
  assert.equal((await getRecoveryStatus(s)).phase,'pending');
  await s.set({rpNexusStateV1:{profiles:['changed']},'majesticLawV5:xyzabc99':{hello:1},'otherExtension:unrelated':'modified'});
  const result=await restoreRecovery(s);
  assert.equal(result.removed,1);
  assert.deepEqual(s.data.rpNexusStateV1,original.rpNexusStateV1);
  assert.ok(!Object.hasOwn(s.data,'majesticLawV5:xyzabc99'));
  assert.equal(s.data['otherExtension:unrelated'],'modified');
  assert.equal(s.data['majesticToolkit:googleClientId:v8'],'unchanged');
  assert.ok(!Object.hasOwn(s.data,RECOVERY_KEY));
});
test('committed point can undo successful import',async()=>{
 const s=storage(original);await captureRecovery(s);await s.set({rpNexusStateV1:{profiles:['new']}});await commitRecovery(s);
 assert.equal((await getRecoveryStatus(s)).phase,'ready');await restoreRecovery(s);
 assert.deepEqual(s.data.rpNexusStateV1,original.rpNexusStateV1);
});
test('interrupted pending import blocks replacement and removal',async()=>{
 const s=storage(original);await captureRecovery(s);
 await assert.rejects(captureRecovery(s),/прерван/);
 await assert.rejects(discardRecovery(s),/прерван/);
});
test('detects tampered checkpoint before changing any data',async()=>{
 const s=storage(original);await captureRecovery(s);
 s.data[RECOVERY_KEY].entries.rpNexusStateV1.profiles=['spoof'];
 await assert.rejects(restoreRecovery(s),/целостность/);
 assert.deepEqual(s.data.rpNexusStateV1,original.rpNexusStateV1);
});
test('missing journal is rejected, matching keys exact',async()=>{
 const s=storage(original);await assert.rejects(restoreRecovery(s),/формат/);
 assert.deepEqual(managedKeys({...original,'rpnComplaintV3:../../foo':2}),['rpNexusStateV1','rpnComplaintV3:abc12345']);
});
test('storage write error keeps checkpoint for retry',async()=>{
 const s=storage(original);await captureRecovery(s);
 const set=s.set.bind(s);let fail=true;
 s.set=async entries=>{if(fail){fail=false;throw Error('disk full');}await set(entries);};
 await assert.rejects(restoreRecovery(s),/disk full/);
 assert.equal((await getRecoveryStatus(s)).phase,'pending');
 await restoreRecovery(s);
 assert.ok(!Object.hasOwn(s.data,RECOVERY_KEY));
});
test('ready point can be discarded, sensitive keys are not captured',async()=>{
 const s=storage(original);await captureRecovery(s);assert.ok(!Object.hasOwn(s.data[RECOVERY_KEY].entries,'majesticToolkit:googleClientId:v8'));
 await commitRecovery(s);await discardRecovery(s);assert.equal(await getRecoveryStatus(s),null);
});
