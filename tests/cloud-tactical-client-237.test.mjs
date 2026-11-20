import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {newTerritory,TERRITORY_PREFIX} from '../src/lib/crime-core.mjs';
const localId='profile-client-tact-237',password='Strong-Cloud-Password-237!';
function memoryStorage(){
 const data=new Map();return {data,async get(key){if(key===null)return Object.fromEntries(data);return {[key]:data.get(key)};},async set(values){for(const [k,v] of Object.entries(values))data.set(k,structuredClone(v));},async remove(key){for(const k of Array.isArray(key)?key:[key])data.delete(k);}};
}
test('2.3.7 background service publishes local territory, edits remotely and rejects silent local overwrite',async()=>{
 const path=await mkdtemp(join(tmpdir(),'mt-client-tact-'));const app=createIdentityServer({dbPath:join(path,'db.sqlite'),port:0});await app.listen();
 const storage=memoryStorage();globalThis.browser={storage:{local:storage}};
 try{
  const {createCloudIdentityService,cloudHostPattern}=await import('../src/lib/cloud-identity-client.mjs');
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  const local={id:localId,name:'RP',project:'majestic',server:'One'};
  storage.data.set('rpNexusStateV1',{profiles:[local],activeProfileId:localId});
  const territory=newTerritory(localId,{name:'North',region:'Center',ownerType:'none',ownerId:''});
  storage.data.set(TERRITORY_PREFIX+territory.id,territory);
  const client=createCloudIdentityService({storage,permissions:{contains:async ({origins})=>origins[0]===cloudHostPattern(origin)}});
  await client.handle('configure',{origin});await client.handle('register',{username:'tacticalclient',password,deviceName:'Test device'});
  const team=(await client.handle('teamCreate',{name:'Client tactical team'})).team.id;
  const cloud=(await client.handle('cloudProfileCreate',{teamId:team,name:'RP',project:'majestic',server:'One'})).profile.id;
  await client.handle('cloudBind',{teamId:team,cloudProfileId:cloud,localProfileId:localId});
  const args={teamId:team,cloudProfileId:cloud,localProfileId:localId,kind:'territory',id:territory.id};
  const first=await client.handle('tacticalPublishLocal',{...args,baseVersion:0});assert.equal(first.version,1);
  const remote=(await client.handle('tacticalGet',args)).entry;assert.equal(remote.record.name,'North');
  const updated=await client.handle('tacticalEdit',{...args,baseVersion:1,operation:'edit',fields:{name:'South',region:'New',notes:'Collaborative'}});assert.equal(updated.version,2);
  assert.equal((await client.handle('tacticalGet',args)).entry.record.name,'South');
  assert.equal((await storage.get(TERRITORY_PREFIX+territory.id))[TERRITORY_PREFIX+territory.id].name,'North','cloud edit does not overwrite local data');
  await assert.rejects(client.handle('tacticalImportRemote',args),/Локальная запись.*отличается/);
  assert.equal((await storage.get(TERRITORY_PREFIX+territory.id))[TERRITORY_PREFIX+territory.id].name,'North');
  await assert.rejects(client.handle('tacticalPublishLocal',{...args,baseVersion:2}),/журнал|операции истории/i);
  assert.equal((await client.handle('tacticalList',{teamId:team,cloudProfileId:cloud})).records.length,1);
  const changelog=await client.handle('tacticalChanges',{teamId:team,cloudProfileId:cloud,after:0});
  assert.deepEqual(changelog.changes.map(x=>x.version),[1,2]);
  assert.equal(changelog.changes[0].record.name,'North');assert.equal(changelog.changes[1].record.name,'South','old revisions remain readable');
 }finally{delete globalThis.browser;await app.close();await rm(path,{recursive:true,force:true});}
});
