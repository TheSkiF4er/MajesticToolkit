import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=async n=>JSON.parse(await readFile(new URL(n,root),'utf8'));
const REQUIRED=['none'];
const OPTIONAL=['authenticationInfo','personallyIdentifyingInfo','personalCommunications','websiteContent'];
test('all Firefox target manifests declare privacy honestly and use stable ID',async()=>{
 for(const target of ['firefox','firefox-android']){
  const m=await read(`manifests/${target}.json`);
  assert.equal(m.browser_specific_settings.gecko.id,'majestictoolkit@theskif4er.github.io');
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions.required,REQUIRED);
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions.optional,OPTIONAL);
  assert.ok(Number(m.browser_specific_settings.gecko.strict_min_version)>=140);
  assert.ok(Number(m.browser_specific_settings.gecko_android.strict_min_version)>=142);
  assert.equal(m.browser_specific_settings.gecko.update_url,undefined);
 }
});
test('Firefox Google connection requests declared categories and origins together before auth',async()=>{
 const calls=[];
 globalThis.browser={
  runtime:{getManifest:()=>({browser_specific_settings:{gecko:{data_collection_permissions:{required:REQUIRED,optional:OPTIONAL}}}})},
  permissions:{async request(args){calls.push(args);return false;}},
  storage:{local:{async get(){return {};}},session:{}},
  identity:{async launchWebAuthFlow(){throw Error('OAuth must not start');}}
 };
 try{
  const google=await import('../src/lib/google-client.mjs');
  assert.deepEqual(google.googlePermissionRequest().data_collection,OPTIONAL);
  await assert.rejects(()=>google.connectGoogle(),/согласие/);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].data_collection,OPTIONAL);
  assert.equal(calls[0].origins.length,4);
 }finally{delete globalThis.browser;}
});
