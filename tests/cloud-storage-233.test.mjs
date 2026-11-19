import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {createCloudIdentityService,cloudHostPattern,CLOUD_CONFIG_KEY,CLOUD_BINDINGS_KEY} from '../src/lib/cloud-identity-client.mjs';
import {newFamily} from '../src/lib/family-core.mjs';
import {newOrganization} from '../src/lib/organization-core.mjs';

const password='long-and-unique-password-2026';
const localId='local-rp-profile-0001';
const source={id:localId,name:'Основной',project:'majestic',server:'Majestic 1'};
async function context(fn){
 const folder=await mkdtemp(join(tmpdir(),'mt-storage-233-'));let time=Date.now();let server=createIdentityServer({dbPath:join(folder,'identity.sqlite'),port:0,clock:()=>time});
 const start=async()=>{const addr=await server.listen();return 'http://127.0.0.1:'+addr.port;};
 try{let origin=await start();await fn({origin,db:()=>server.db,advance:n=>{time+=n;},async restart(){await server.close();server=createIdentityServer({dbPath:join(folder,'identity.sqlite'),port:0,clock:()=>time});return start();}});}
 finally{await server.close().catch(()=>{});await rm(folder,{recursive:true,force:true});}
}
async function call(origin,path,method='GET',body=null,token=null){
 const res=await fetch(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 return {status:res.status,body:await res.json()};
}
async function register(origin,username){const r=await call(origin,'/v1/auth/register','POST',{username,password,deviceName:username+' browser'});assert.equal(r.status,201,JSON.stringify(r.body));return {name:username,token:r.body.accessToken,refresh:r.body.refreshToken,account:r.body.account};}
const api=(origin,user,path,method='GET',body=null)=>call(origin,path,method,body,user.token);
const teamURL=id=>'/v1/teams/'+id;
async function createTeam(origin,user,name='Team Storage'){const r=await api(origin,user,'/v1/teams','POST',{name});assert.equal(r.status,201);return r.body.team.id;}
async function addRole(origin,owner,user,teamId,role){const inv=await api(origin,owner,teamURL(teamId)+'/invitations','POST',{role,targetUsername:user.name});assert.equal(inv.status,201);const r=await api(origin,user,'/v1/teams/invitations/accept','POST',{token:inv.body.token});assert.equal(r.status,200);}
const cloud=(teamId)=>teamURL(teamId)+'/cloud/profiles';
const recordURL=(teamId,profileId)=>cloud(teamId)+'/'+profileId+'/records';
const family=(name='Семья Альфа')=>newFamily(localId,{name});
const org=(name='Администрация')=>newOrganization(localId,{name,type:'government'});

test('2.3.3 real HTTP/SQLite: team profiles, RBAC isolation, stable persisted storage',async()=>context(async({origin,restart})=>{
 const owner=await register(origin,'storageowner'),admin=await register(origin,'storageadmin'),editor=await register(origin,'storageeditor'),viewer=await register(origin,'storageviewer'),outsider=await register(origin,'storagestranger');
 const teamId=await createTeam(origin,owner);for(const [u,r] of [[admin,'admin'],[editor,'editor'],[viewer,'viewer']])await addRole(origin,owner,u,teamId,r);
 const endpoint=cloud(teamId);
 assert.equal((await api(origin,outsider,endpoint)).status,404);
 assert.equal((await api(origin,viewer,endpoint,'POST',{...source})).status,403);
 assert.equal((await api(origin,editor,endpoint,'POST',{...source})).status,403);
 const made=await api(origin,admin,endpoint,'POST',{name:source.name,project:source.project,server:source.server});assert.equal(made.status,201,JSON.stringify(made.body));
 const profileId=made.body.profile.id;
 assert.equal((await api(origin,admin,endpoint,'POST',{name:source.name,project:source.project,server:source.server})).status,200);
 assert.equal((await api(origin,owner,endpoint,'POST',{name:source.name,project:source.project,server:'Other'})).status,409);
 assert.equal((await api(origin,owner,endpoint,'POST',{name:'Bad',project:'unknown',server:'One'})).status,400);
 assert.equal((await api(origin,outsider,recordURL(teamId,profileId))).status,404);
 assert.equal((await api(origin,viewer,recordURL(teamId,profileId),'POST',{records:[{kind:'family',record:family()}]})).status,403);
 const f=family(),o=org();const url=recordURL(teamId,profileId);
 const loaded=await api(origin,editor,url,'POST',{records:[{kind:'family',record:f},{kind:'organization',record:o}]});
 assert.deepEqual(loaded.body,{imported:2,unchanged:0,total:2});
 const result=await api(origin,viewer,url);assert.equal(result.status,200);assert.equal(result.body.records.length,2);
 for(const row of result.body.records){assert.equal(row.record.profileId,profileId);assert.equal(row.version,1);assert.equal(row.checksum.length,64);}
 assert.equal(f.profileId,localId,'local family remains unchanged');
 assert.equal(o.profileId,localId,'local organization remains unchanged');
 const again=await api(origin,editor,url,'POST',{records:[{kind:'family',record:f},{kind:'organization',record:o}]});
 assert.deepEqual(again.body,{imported:0,unchanged:2,total:2});
 const next=await restart();const persistent=await api(next,viewer,url);assert.equal(persistent.status,200);assert.equal(persistent.body.records.length,2);
 assert.equal((await api(next,outsider,url)).status,404);
 assert.equal((await api(next,owner,endpoint)).body.profiles[0].recordCount,2);
}));

test('2.3.3 conflict is rejected without overwriting old or partly writing new data',async()=>context(async({origin})=>{
 const owner=await register(origin,'conflictowner');const teamId=await createTeam(origin,owner);const id=(await api(origin,owner,cloud(teamId),'POST',source)).body.profile.id,url=recordURL(teamId,id);
 const first=family('Old Name');assert.equal((await api(origin,owner,url,'POST',{records:[{kind:'family',record:first}]})).body.imported,1);
 const changed=structuredClone(first);changed.events[0].name='New Name';
 const newOne=family('Second Family');const failure=await api(origin,owner,url,'POST',{records:[{kind:'family',record:newOne},{kind:'family',record:changed}]});
 assert.equal(failure.status,409);assert.match(failure.body.error,/Конфликт/);
 const rows=(await api(origin,owner,url)).body.records;assert.equal(rows.length,1);assert.equal(rows[0].record.name,'Old Name');
 assert.equal((await api(origin,owner,url,'POST',{records:[{kind:'family',record:{...first,events:[]}}]})).status,400);
 assert.equal((await api(origin,owner,url,'POST',{records:[{kind:'secrets',record:first}]})).status,400);
 assert.equal((await api(origin,owner,url,'POST',{records:[]})).status,400);
 assert.equal((await api(origin,owner,url,'POST',{records:[{kind:'family',record:first},{kind:'family',record:first}]})).status,400);
 assert.equal((await api(origin,owner,url,'POST',{records:[{kind:'family',record:{...first,profileId:'../../evil'}}]})).status,400);
 assert.equal((await api(origin,owner,url+'?kind=family')).body.records.length,1);
 assert.equal((await api(origin,owner,url+'?kind=secrets')).status,400);
}));

test('2.3.3 permission changes, session revoke, team deletion protect stored cloud rows',async()=>context(async({origin})=>{
 const owner=await register(origin,'revowner'),editor=await register(origin,'reveditor');const teamId=await createTeam(origin,owner);await addRole(origin,owner,editor,teamId,'editor');
 const id=(await api(origin,owner,cloud(teamId),'POST',source)).body.profile.id,url=recordURL(teamId,id);
 const data=[{kind:'family',record:family()}];assert.equal((await api(origin,editor,url,'POST',{records:data})).status,200);
 assert.equal((await api(origin,owner,teamURL(teamId)+'/members/'+editor.account.id,'PATCH',{role:'viewer'})).status,200);
 assert.equal((await api(origin,editor,url,'POST',{records:data})).status,403);
 assert.equal((await api(origin,editor,url)).status,200);
 assert.equal((await api(origin,owner,teamURL(teamId)+'/members/'+editor.account.id,'DELETE')).status,200);
 assert.equal((await api(origin,editor,url)).status,404);
 assert.equal((await api(origin,owner,'/v1/auth/logout','POST')).status,200);
 assert.equal((await api(origin,owner,url)).status,401);
 const logged=await call(origin,'/v1/auth/login','POST',{username:owner.name,password,deviceName:'second'});assert.equal(logged.status,200);owner.token=logged.body.accessToken;
 assert.equal((await api(origin,owner,teamURL(teamId),'DELETE')).status,200);
 assert.equal((await api(origin,owner,url)).status,404);
}));

test('2.3.3 background client binds local RP and imports through authenticated real server',async()=>context(async({origin})=>{
 const memory=new Map([['rpNexusStateV1',{profiles:[source],activeProfileId:source.id}]]);
 const storage={async get(key){return {[key]:memory.get(key)};},async set(value){for(const [k,v] of Object.entries(value))memory.set(k,v);},async remove(key){memory.delete(key);}};
 const permissions={contains:async({origins})=>origins[0]===cloudHostPattern(origin)};
 const client=createCloudIdentityService({storage,permissions});
 await client.handle('configure',{origin});assert.equal((await client.handle('register',{username:'clientowner',password,deviceName:'Client'})).authenticated,true);
 const team=(await client.handle('teamCreate',{name:'Client Team'})).team;
 const remote=(await client.handle('cloudProfileCreate',{teamId:team.id,name:source.name,project:source.project,server:source.server})).profile;
 assert.equal((await client.handle('cloudBindings',{teamId:team.id})).profiles.length,1);
 await assert.rejects(client.handle('cloudImport',{teamId:team.id,cloudProfileId:remote.id,records:[{kind:'family',record:family()}]}),/не принадлежат/);
 await client.handle('cloudBind',{teamId:team.id,localProfileId:source.id,cloudProfileId:remote.id});
 const saved=memory.get(CLOUD_BINDINGS_KEY);assert.ok(Object.keys(saved)[0].includes(team.id));
 const migrated=await client.handle('cloudImport',{teamId:team.id,cloudProfileId:remote.id,records:[{kind:'family',record:family('Local Client')}]});
 assert.equal(migrated.imported,1);
 const cloudRecords=await client.handle('cloudRecords',{teamId:team.id,cloudProfileId:remote.id});assert.equal(cloudRecords.records.length,1);
 assert.equal(cloudRecords.records[0].record.profileId,remote.id);
 await client.handle('cloudUnbind',{teamId:team.id,localProfileId:source.id});
 assert.deepEqual((await client.handle('cloudBindings',{teamId:team.id})).bindings,{});
 assert.equal(memory.get('rpNexusStateV1').profiles[0].id,localId);
 assert.equal((await client.handle('logout')).ok,true);
 assert.ok(memory.get(CLOUD_CONFIG_KEY));
}));

test('2.3.3 cloud read pagination and oversized import rejection',async()=>context(async({origin})=>{
 const owner=await register(origin,'pagingowner'),teamId=await createTeam(origin,owner);
 const id=(await api(origin,owner,cloud(teamId),'POST',source)).body.profile.id,url=recordURL(teamId,id);
 const rows=Array.from({length:27},(_,i)=>({kind:'family',record:family('Family '+String(i).padStart(2,'0'))}));
 assert.equal((await api(origin,owner,url,'POST',{records:rows.slice(0,20)})).body.imported,20);
 assert.equal((await api(origin,owner,url,'POST',{records:rows.slice(20)})).body.imported,7);
 const first=await api(origin,owner,url+'?kind=family');assert.equal(first.status,200);assert.equal(first.body.records.length,20);
 assert.ok(first.body.nextCursor);
 const second=await api(origin,owner,url+'?kind=family&after='+first.body.nextCursor);assert.equal(second.status,200);assert.equal(second.body.records.length,7);assert.equal(second.body.nextCursor,null);
 const all=await api(origin,owner,url);assert.equal(all.status,200);assert.equal(all.body.records.length,20);
 const rest=await api(origin,owner,url+'?after='+encodeURIComponent(all.body.nextCursor));assert.equal(rest.body.records.length,7);
 const tooLarge=await api(origin,owner,url,'POST',{records:[{kind:'family',record:{...family('Too Large'),extra:'A'.repeat(540_000)}}]});assert.equal(tooLarge.status,413);
 assert.equal((await api(origin,owner,cloud(teamId))).body.profiles[0].recordCount,27);
}));
