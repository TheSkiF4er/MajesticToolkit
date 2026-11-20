import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {createCloudIdentityService,cloudHostPattern} from '../src/lib/cloud-identity-client.mjs';
import {CLOUD_SYNC_KEY} from '../src/lib/cloud-sync-client.mjs';
import {FAMILY_PREFIX,newFamily,applyFamily} from '../src/lib/family-core.mjs';
const password='Testing-Strong-Password-234!';
const localA='profile-234-device-a',localB='profile-234-device-b';
const localProfile=id=>({id,name:'RP Dev',project:'majestic',server:'One'});
const req=async(origin,path,token=null,method='GET',body=null)=>{const r=await fetch(origin+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {code:r.status,data:await r.json()};};
async function context(fn){
 const dir=await mkdtemp(join(tmpdir(),'mt-sync-234-'));
 let app=createIdentityServer({dbPath:join(dir,'id.sqlite'),port:0});
 const origin=()=>`http://127.0.0.1:${app.server.address().port}`;
 try{await app.listen();await fn({origin:origin(),db:app.db,async restart(){await app.close();app=createIdentityServer({dbPath:join(dir,'id.sqlite'),port:0});await app.listen();return origin();}});}finally{await app.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
async function register(origin,name){const r=await req(origin,'/v1/auth/register',null,'POST',{username:name,password,deviceName:name});assert.equal(r.code,201,JSON.stringify(r.data));return r.data;}
const mem=initial=>{const map=new Map(Object.entries(initial||{}));return {map,storage:{async get(k){if(k===null)return Object.fromEntries(map);return {[k]:map.get(k)};},async set(v){for(const [k,x] of Object.entries(v))map.set(k,structuredClone(x));},async remove(k){if(Array.isArray(k))k.forEach(x=>map.delete(x));else map.delete(k);}}};};
const connected=(origin,storage,fetchImpl=fetch)=>createCloudIdentityService({storage,fetchImpl,permissions:{contains:async({origins})=>origins[0]===cloudHostPattern(origin)}});
const edit=(record,name)=>applyFamily(record,'family-edit',{name,tag:'',description:'',reason:'sync edit'});
const key=id=>FAMILY_PREFIX+id;

test('2.3.4 server sync: CAS, snapshot, replay-safe operations, tombstones, upgrades',async()=>context(async({origin,db,restart})=>{
 const owner=await register(origin,'syncserverowner'),team=(await req(origin,'/v1/teams',owner.accessToken,'POST',{name:'Sync Team'})).data.team;
 const cloud='/v1/teams/'+team.id+'/cloud/profiles';const profile=(await req(origin,cloud,owner.accessToken,'POST',localProfile(localA))).data.profile;
 const url=cloud+'/'+profile.id+'/sync';const initial=newFamily(localA,{name:'A Family'});
 const imported=await req(origin,cloud+'/'+profile.id+'/records',owner.accessToken,'POST',{records:[{kind:'family',record:initial}]});assert.equal(imported.code,200);
 const snapshot=await req(origin,url+'/snapshot',owner.accessToken);assert.equal(snapshot.data.entries.length,1);assert.equal(snapshot.data.entries[0].version,1);
 let newOrigin=await restart(); // migration and cursor persist
 const newUrl='/v1/teams/'+team.id+'/cloud/profiles/'+profile.id+'/sync';
 assert.equal((await req(newOrigin,newUrl+'/snapshot',owner.accessToken)).data.entries.length,1);
 const family=edit(initial,'Updated Name');const op=crypto.randomUUID();
 const action={operationId:op,kind:'family',id:initial.id,baseVersion:1,record:family};
 const changed=await req(newOrigin,newUrl,owner.accessToken,'POST',action);assert.equal(changed.code,200,JSON.stringify(changed.data));assert.equal(changed.data.version,2);
 const replay=await req(newOrigin,newUrl,owner.accessToken,'POST',action);assert.equal(replay.code,200);assert.equal(replay.data.version,2);assert.equal(replay.data.replayed,true);
 assert.equal((await req(newOrigin,newUrl,owner.accessToken,'POST',{...action,operationId:op,baseVersion:2})).code,409);
 assert.equal((await req(newOrigin,newUrl,owner.accessToken,'POST',{...action,operationId:crypto.randomUUID(),baseVersion:1})).code,409);
 const latest=(await req(newOrigin,newUrl+'/record/family/'+initial.id,owner.accessToken)).data.entry;
 assert.equal(latest.record.name,'Updated Name');assert.equal(latest.version,2);
 const deleted=await req(newOrigin,newUrl,owner.accessToken,'POST',{operationId:crypto.randomUUID(),kind:'family',id:initial.id,baseVersion:2,deleted:true});assert.equal(deleted.code,200);assert.equal(deleted.data.version,3);
 assert.equal((await req(newOrigin,newUrl+'/record/family/'+initial.id,owner.accessToken)).data.entry.deleted,true);
 assert.equal((await req(newOrigin,cloud+'/'+profile.id+'/records',owner.accessToken)).data.records.length,0);
 const changes=(await req(newOrigin,newUrl+'?after=0',owner.accessToken)).data.changes;
 assert.deepEqual(changes.map(x=>x.version),[1,2,3]);assert.deepEqual(changes.map(x=>x.deleted),[false,false,true]);
 const snapAfter=(await req(newOrigin,newUrl+'/snapshot',owner.accessToken)).data.entries;
 assert.equal(snapAfter.length,1);assert.equal(snapAfter[0].deleted,true);
 assert.equal((await req(newOrigin,newUrl+'/snapshot?after=bad',owner.accessToken)).code,400);
 assert.equal((await req(newOrigin,newUrl+'?after=-1',owner.accessToken)).code,400);
}));

test('2.3.4 real two-device sync: bootstrap, incremental edits, conflicts, offline durable queue and resume',async()=>context(async({origin})=>{
 const a=mem({'rpNexusStateV1':{profiles:[localProfile(localA)],activeProfileId:localA}}),b=mem({'rpNexusStateV1':{profiles:[localProfile(localB)],activeProfileId:localB}});
 const alice=connected(origin,a.storage),bob=connected(origin,b.storage);
 await alice.handle('configure',{origin});await bob.handle('configure',{origin});
 await alice.handle('register',{username:'syncalice',password,deviceName:'A'});await bob.handle('register',{username:'syncbob',password,deviceName:'B'});
 const team=(await alice.handle('teamCreate',{name:'Cloud Members'})).team;
 const invitation=(await alice.handle('teamInvite',{teamId:team.id,role:'editor',targetUsername:'syncbob'})).token;
 await bob.handle('teamAccept',{token:invitation});
 const cloud=(await alice.handle('cloudProfileCreate',{teamId:team.id,...localProfile(localA)})).profile;
 await alice.handle('cloudBind',{teamId:team.id,cloudProfileId:cloud.id,localProfileId:localA});
 await bob.handle('cloudBind',{teamId:team.id,cloudProfileId:cloud.id,localProfileId:localB});
 const fam=newFamily(localA,{name:'First'});await a.storage.set({[key(fam.id)]:fam});
 const started=await alice.handle('syncEnable',{teamId:team.id,localProfileId:localA});assert.equal(started.error,null,JSON.stringify(started));
 const subscribed=await bob.handle('syncEnable',{teamId:team.id,localProfileId:localB});assert.equal(subscribed.error,null,JSON.stringify(subscribed));
 assert.equal(b.map.get(key(fam.id)).name,'First');assert.equal(b.map.get(key(fam.id)).profileId,localB);
 await b.storage.set({[key(fam.id)]:edit(b.map.get(key(fam.id)),'Second')});
 const bUpdated=await bob.handle('syncNow',{teamId:team.id,localProfileId:localB});assert.equal(bUpdated.error,null,JSON.stringify(bUpdated));
 const aUpdated=await alice.handle('syncNow',{teamId:team.id,localProfileId:localA});assert.equal(aUpdated.error,null,JSON.stringify(aUpdated));
 assert.equal(a.map.get(key(fam.id)).name,'Second');
 // Concurrent edits: Alice uploads first, Bob must preserve his local copy and report conflict.
 await a.storage.set({[key(fam.id)]:edit(a.map.get(key(fam.id)),'Alice edit')});
 await b.storage.set({[key(fam.id)]:edit(b.map.get(key(fam.id)),'Bob edit')});
 assert.equal((await alice.handle('syncNow',{teamId:team.id,localProfileId:localA})).error,null);
 const conflicting=await bob.handle('syncNow',{teamId:team.id,localProfileId:localB});assert.equal(conflicting.conflicts.length,1,JSON.stringify(conflicting));assert.equal(b.map.get(key(fam.id)).name,'Bob edit');
 await bob.handle('syncResolve',{teamId:team.id,localProfileId:localB,kind:'family',id:fam.id,choice:'cloud'});
 assert.equal(b.map.get(key(fam.id)).name,'Alice edit');
 await bob.handle('syncNow',{teamId:team.id,localProfileId:localB});
 // Offline persistence before network: use the same extension storage and simulate worker restart.
 await b.storage.set({[key(fam.id)]:edit(b.map.get(key(fam.id)),'Offline edit')});
 let online=false;
 const offline=connected(origin,b.storage,(...args)=>online?fetch(...args):Promise.reject(new Error('offline')));
 const pending=await offline.handle('syncTick',{});assert.ok(pending.profiles[0].pending>=1);assert.ok(pending.profiles[0].error);assert.ok(b.map.get(CLOUD_SYNC_KEY));
 online=true;
 const resumed=connected(origin,b.storage);
 const done=await resumed.handle('syncNow',{teamId:team.id,localProfileId:localB});assert.equal(done.error,null,JSON.stringify(done));assert.equal(done.pending,0);
 const other=await alice.handle('syncNow',{teamId:team.id,localProfileId:localA});assert.equal(other.error,null);assert.equal(a.map.get(key(fam.id)).name,'Offline edit');
 await alice.handle('syncDisable',{teamId:team.id,localProfileId:localA});
 assert.equal((await alice.handle('syncStatus',{teamId:team.id,localProfileId:localA})).enabled,false);
}));

test('2.3.4 server enforces RBAC and snapshot watermark under concurrent writes',async()=>context(async({origin})=>{
 const owner=await register(origin,'syncroleowner'),viewer=await register(origin,'syncroleviewer'),stranger=await register(origin,'syncrolestranger');
 const team=(await req(origin,'/v1/teams',owner.accessToken,'POST',{name:'Watermark Team'})).data.team;
 const cloud='/v1/teams/'+team.id+'/cloud/profiles',profile=(await req(origin,cloud,owner.accessToken,'POST',localProfile(localA))).data.profile,url=cloud+'/'+profile.id+'/sync';
 const token=(await req(origin,'/v1/teams/'+team.id+'/invitations',owner.accessToken,'POST',{role:'viewer',targetUsername:'syncroleviewer'})).data.token;
 assert.equal((await req(origin,'/v1/teams/invitations/accept',viewer.accessToken,'POST',{token})).code,200);
 assert.equal((await req(origin,url,stranger.accessToken)).code,404);
 assert.equal((await req(origin,url,viewer.accessToken)).code,200);
 const first=newFamily(localA,{name:'A'}),second=newFamily(localA,{name:'B'});
 const write=(record)=>({operationId:crypto.randomUUID(),kind:'family',id:record.id,baseVersion:0,record});
 assert.equal((await req(origin,url,viewer.accessToken,'POST',write(first))).code,403);
 assert.equal((await req(origin,url,owner.accessToken,'POST',write(first))).code,200);
 assert.equal((await req(origin,url,owner.accessToken,'POST',write(second))).code,200);
 const page=(await req(origin,url+'/snapshot?limit=1',viewer.accessToken)).data;
 assert.equal(page.entries.length,1);assert.ok(page.nextCursor);
 const next=edit(first,'Later Name');
 assert.equal((await req(origin,url,owner.accessToken,'POST',{...write(next),baseVersion:1})).code,200);
 const finalPage=(await req(origin,url+'/snapshot?limit=1&watermark='+page.watermark+'&after='+encodeURIComponent(page.nextCursor),viewer.accessToken)).data;
 assert.equal(finalPage.watermark,page.watermark);assert.equal(finalPage.entries.length,1);
 assert.equal((await req(origin,url,viewer.accessToken,'POST',{...write(second),baseVersion:1})).code,403);
 assert.equal((await req(origin,'/v1/auth/logout',viewer.accessToken,'POST')).code,200);
 assert.equal((await req(origin,url,viewer.accessToken)).code,401);
}));

test('2.3.4 explicit local conflict resolution and two-device deletion propagation',async()=>context(async({origin})=>{
 const a=mem({'rpNexusStateV1':{profiles:[localProfile(localA)],activeProfileId:localA}}),b=mem({'rpNexusStateV1':{profiles:[localProfile(localB)],activeProfileId:localB}});
 const alice=connected(origin,a.storage),bob=connected(origin,b.storage);
 for(const [client,username] of [[alice,'syncdelalice'],[bob,'syncdelbob']]){await client.handle('configure',{origin});await client.handle('register',{username,password,deviceName:username});}
 const team=(await alice.handle('teamCreate',{name:'Sync Delete'})).team;
 const invite=(await alice.handle('teamInvite',{teamId:team.id,role:'editor',targetUsername:'syncdelbob'})).token;await bob.handle('teamAccept',{token:invite});
 const cloud=(await alice.handle('cloudProfileCreate',{teamId:team.id,...localProfile(localA)})).profile;
 for(const [client,localId] of [[alice,localA],[bob,localB]])await client.handle('cloudBind',{teamId:team.id,cloudProfileId:cloud.id,localProfileId:localId});
 const first=newFamily(localA,{name:'Original'});await a.storage.set({[key(first.id)]:first});
 await alice.handle('syncEnable',{teamId:team.id,localProfileId:localA});await bob.handle('syncEnable',{teamId:team.id,localProfileId:localB});
 await a.storage.set({[key(first.id)]:edit(a.map.get(key(first.id)),'Alice One')});
 await b.storage.set({[key(first.id)]:edit(b.map.get(key(first.id)),'Bob Two')});
 await alice.handle('syncNow',{teamId:team.id,localProfileId:localA});
 assert.equal((await bob.handle('syncNow',{teamId:team.id,localProfileId:localB})).conflicts.length,1);
 await bob.handle('syncResolve',{teamId:team.id,localProfileId:localB,kind:'family',id:first.id,choice:'local'});
 const resolved=await bob.handle('syncNow',{teamId:team.id,localProfileId:localB});assert.equal(resolved.error,null,JSON.stringify(resolved));assert.equal(resolved.conflicts.length,0);
 await alice.handle('syncNow',{teamId:team.id,localProfileId:localA});assert.equal(a.map.get(key(first.id)).name,'Bob Two');
 // Changed records retain historical events: destructive remote deletion must
 // raise a conflict rather than bypass the local domain store's protections.
 await a.storage.remove(key(first.id));
 assert.equal((await alice.handle('syncNow',{teamId:team.id,localProfileId:localA})).error,null);
 assert.equal((await bob.handle('syncNow',{teamId:team.id,localProfileId:localB})).conflicts.length,1);
 assert.equal(b.map.get(key(first.id)).name,'Bob Two');
 // A pristine, unreferenced family can be deleted on both devices.
 const plain=newFamily(localA,{name:'Pristine'});await a.storage.set({[key(plain.id)]:plain});
 await alice.handle('syncNow',{teamId:team.id,localProfileId:localA});await bob.handle('syncNow',{teamId:team.id,localProfileId:localB});
 assert.ok(b.map.has(key(plain.id)));
 await a.storage.remove(key(plain.id));
 await alice.handle('syncNow',{teamId:team.id,localProfileId:localA});
 assert.equal((await bob.handle('syncNow',{teamId:team.id,localProfileId:localB})).error,null);
 assert.equal(b.map.has(key(plain.id)),false);
 // Removing the whole local profile must never delete cloud records.
 await a.storage.set({'rpNexusStateV1':{profiles:[],activeProfileId:''}});
 const stopped=await alice.handle('syncTick',{});assert.match(stopped.profiles[0].error,/профиль отсутствует/);
}));

test('2.3.4 upgrading a populated 2.3.3 database backfills change log without losing imported rows',async()=>context(async({origin,db,restart})=>{
 const owner=await register(origin,'syncupgradeowner'),team=(await req(origin,'/v1/teams',owner.accessToken,'POST',{name:'Upgrade Team'})).data.team;
 const cloud='/v1/teams/'+team.id+'/cloud/profiles',profile=(await req(origin,cloud,owner.accessToken,'POST',localProfile(localA))).data.profile;
 const fam=newFamily(localA,{name:'Legacy Record'});
 assert.equal((await req(origin,cloud+'/'+profile.id+'/records',owner.accessToken,'POST',{records:[{kind:'family',record:fam}]})).code,200);
 // Reconstruct exactly the cloud-record schema of 2.3.3, with neither
 // v2.3.4 journal nor tombstone column present.
 db.exec('DROP TABLE cloud_changes');db.exec('ALTER TABLE cloud_records DROP COLUMN deleted_at');
 const newOrigin=await restart();
 const synced=await req(newOrigin,cloud+'/'+profile.id+'/sync/snapshot',owner.accessToken);
 assert.equal(synced.code,200,JSON.stringify(synced.data));
 assert.equal(synced.data.entries.length,1);assert.equal(synced.data.entries[0].record.name,'Legacy Record');
 assert.equal((await req(newOrigin,cloud+'/'+profile.id+'/records',owner.accessToken)).data.records.length,1);
}));

test('2.3.4 serializable competing server updates and duplicate-name constraint',async()=>context(async({origin})=>{
 const owner=await register(origin,'syncatomicowner'),team=(await req(origin,'/v1/teams',owner.accessToken,'POST',{name:'Atomic Team'})).data.team;
 const cloud='/v1/teams/'+team.id+'/cloud/profiles',profile=(await req(origin,cloud,owner.accessToken,'POST',localProfile(localA))).data.profile,url=cloud+'/'+profile.id+'/sync';
 const a=newFamily(localA,{name:'Alpha'}),b=newFamily(localA,{name:'Beta'});
 const push=(record,baseVersion=0)=>req(origin,url,owner.accessToken,'POST',{operationId:crypto.randomUUID(),kind:'family',id:record.id,baseVersion,record});
 assert.equal((await push(a)).code,200);assert.equal((await push(b)).code,200);
 const [one,two]=await Promise.all([push(edit(a,'Alpha One'),1),push(edit(a,'Alpha Two'),1)]);
 assert.deepEqual([one.code,two.code].sort(),[200,409]);
 assert.equal((await push(edit(b,'Alpha One'),1)).code===409 || (await push(edit(b,'Alpha Two'),1)).code===409,true);
 const snapshot=(await req(origin,url+'/snapshot',owner.accessToken)).data.entries;
 assert.equal(snapshot.length,2);
 assert.notEqual(snapshot[0].record.name,snapshot[1].record.name);
}));
