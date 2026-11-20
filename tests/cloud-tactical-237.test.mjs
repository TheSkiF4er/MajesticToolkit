import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {cleanMapMeta} from '../src/lib/tactical-map-core.mjs';
import {createPlan,mutatePlan} from '../src/lib/tactical-planning-core.mjs';
import {newAirdropPoint,newAirdropEvent,changeAirdropEvent} from '../src/lib/tactical-airdrop-core.mjs';
import {newTerritory,newCrimeEvent} from '../src/lib/crime-core.mjs';
import {tacticalRecordForProfile,editSharedTacticalRecord} from '../src/lib/cloud-tactical-source.mjs';
const password='Another-Secure-Password-237!';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/u/8AAAAASUVORK5CYII=','base64');
const sha=createHash('sha256').update(png).digest('hex');
const localProfile='profile-tactical-237';
async function fixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'mt-tact-237-')),dbPath=join(dir,'identity.sqlite');let app=createIdentityServer({dbPath,port:0});await app.listen();
 const origin=()=>`http://127.0.0.1:${app.server.address().port}`;
 const request=async(path,token,method='GET',body=null)=>{
  const r=await fetch(origin()+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();return {status:r.status,data};
 };
 const register=async username=>{const r=await request('/v1/auth/register',null,'POST',{username,password,deviceName:username});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;};
 try{await fn({request,register,origin,db:()=>app.db,async restart(){await app.close();app=createIdentityServer({dbPath,port:0});await app.listen();}});}finally{await app.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
const op=(baseVersion,record)=>({operationId:randomUUID(),baseVersion,...(record?{record}:{})});
async function createSetup({request,register,origin}){
 const owner=await register('tacowner'),editor=await register('taceditor'),viewer=await register('tacviewer'),stranger=await register('tacstranger');
 const t=await request('/v1/teams',owner.accessToken,'POST',{name:'Tactical 237'});assert.equal(t.status,201);
 const team=t.data.team.id;
 const p=await request(`/v1/teams/${team}/cloud/profiles`,owner.accessToken,'POST',{name:'Shared RP',project:'majestic',server:'1'});assert.equal(p.status,201);
 const profile=p.data.profile.id;
 for(const [user,role] of [[editor,'editor'],[viewer,'viewer']]){
  const invite=await request(`/v1/teams/${team}/invitations`,owner.accessToken,'POST',{role,targetUsername:user.account.username});assert.equal(invite.status,201);
  assert.equal((await request('/v1/teams/invitations/accept',user.accessToken,'POST',{token:invite.data.token})).status,200);
 }
 const root=`/v1/teams/${team}/cloud/profiles/${profile}/tactical`;
 const put=(kind,id,token,version,record,operationId=randomUUID())=>request(`${root}/${kind}/${id}`,token,'PUT',{operationId,baseVersion:version,record});
 const del=(kind,id,token,version)=>request(`${root}/${kind}/${id}`,token,'DELETE',op(version));
 const upload=async(token,bytes=png,hashValue=sha,type='image/png')=>{
  const r=await fetch(`${origin() + root}/image/${hashValue}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':type},body:bytes});
  return {status:r.status,data:await r.json()};
 };
 const meta=cleanMapMeta({profileId:profile,name:'Tactical Map',mime:'image/png',size:png.length,width:1,height:1,sha256:sha,updatedAt:new Date().toISOString(),view:{},anchors:[]});
 return {owner,editor,viewer,stranger,root,profile,team,put,del,upload,meta};
}
test('2.3.7 collaborative map binary, RBAC, CAS, dependencies and replay across accounts',()=>fixture(async f=>{
 const s=await createSetup(f),{request,restart,db}=f,{root,profile,put,del,upload,meta}=s;
 const owner=s.owner.accessToken,editor=s.editor.accessToken,viewer=s.viewer.accessToken,stranger=s.stranger.accessToken;
 const mapId='map-'+profile;
 assert.equal((await request(root,viewer)).status,200);
 assert.equal((await request(root,stranger)).status,404);
 assert.equal((await request(root,null)).status,401);
 assert.equal((await upload(viewer)).status,403);
 assert.equal((await upload(editor,png,'0'.repeat(64))).status,409);
 assert.equal((await upload(editor,Buffer.from('not an image'),'0'.repeat(64))).status,413);
 assert.equal((await put('map',mapId,viewer,0,meta)).status,403);
 assert.equal((await put('map',mapId,editor,0,meta)).status,409,'map image must be uploaded first');
 assert.equal((await upload(editor)).status,201);
 const created=await put('map',mapId,editor,0,meta);assert.equal(created.status,201,JSON.stringify(created.data));
 assert.equal((await put('map',mapId,owner,0,meta)).status,409,'stale base rejected');
 const bin=await fetch(f.origin()+root+'/image/'+sha,{headers:{Authorization:'Bearer '+viewer}});
 assert.equal(bin.status,200);assert.equal(createHash('sha256').update(Buffer.from(await bin.arrayBuffer())).digest('hex'),sha);
 assert.equal((await fetch(f.origin()+root+'/image/'+sha,{headers:{Authorization:'Bearer '+stranger}})).status,404);
 const plan=tacticalRecordForProfile('plan',createPlan(localProfile,{title:'Plan A',mapSha256:sha}),profile);
 const added=await put('plan',plan.id,editor,0,plan);assert.equal(added.status,201,JSON.stringify(added.data));
 assert.equal((await del('map',mapId,owner,1)).status,409,'dependent plan protects map');
 const revised=mutatePlan(plan,'edit',{title:'Plan B',brief:'Second',scheduledAt:'',group:null});
 const changed=await put('plan',plan.id,owner,1,revised);assert.equal(changed.status,200,JSON.stringify(changed.data));
 assert.equal((await put('plan',plan.id,editor,1,revised)).status,409,'CAS against concurrent actor');
 assert.equal((await put('plan',plan.id,editor,2,plan)).status,409,'history truncation blocked');
 assert.equal((await request(`${root}/plan/${plan.id}`,viewer)).data.entry.record.state.title,'Plan B');
 const i=randomUUID(),replay=await put('plan',plan.id,owner,2,revised,i);
 assert.equal(replay.status,409,'same revision without new log is not permitted');
 const list=await request(root,viewer);assert.equal(list.data.records.length,2);
 const changes=await request(root+'/changes?after=0&limit=100',viewer);assert.equal(changes.status,200);assert.deepEqual(changes.data.changes.map(x=>x.action),['create','create','update']);
 assert.equal(changes.data.changes[2].actorId,s.owner.account.id);
 await restart();assert.equal((await request(root,viewer)).data.records.length,2);
 const afterRestart=await fetch(f.origin()+root+'/image/'+sha,{headers:{Authorization:'Bearer '+viewer}});assert.equal(afterRestart.status,200);assert.equal(createHash('sha256').update(Buffer.from(await afterRestart.arrayBuffer())).digest('hex'),sha,'image bytes survive restart');
 assert.equal(db().prepare('SELECT count(*) n FROM cloud_tactical_changes').get().n,3);
 assert.equal((await request('/v1/auth/logout',editor,'POST',{})).status,200);
 assert.equal((await put('plan',plan.id,editor,2,revised)).status,401,'revoked editor session');
}));
test('2.3.7 airdrop, territory event, referential integrity and deletion tombstones',()=>fixture(async f=>{
 const s=await createSetup(f),{request}=f,token=s.owner.accessToken,root=s.root,profile=s.profile;
 assert.equal((await s.upload(token)).status,201);
 assert.equal((await s.put('map','map-'+profile,token,0,s.meta)).status,201);
 const point=tacticalRecordForProfile('airdrop_point',newAirdropPoint(localProfile,{name:'Drop 1',x:0.5,y:0.5,mapSha256:sha}),profile);
 const event=tacticalRecordForProfile('airdrop_event',newAirdropEvent(localProfile,{title:'Drop at HQ',pointId:point.id,scheduledAt:new Date(Date.now()+3600000).toISOString(),durationMinutes:30}),profile);
 assert.equal((await s.put('airdrop_event',event.id,token,0,event)).status,409,'event cannot precede point');
 assert.equal((await s.put('airdrop_point',point.id,token,0,point)).status,201);
 assert.equal((await s.put('airdrop_event',event.id,token,0,event)).status,201);
 assert.equal((await s.del('airdrop_point',point.id,token,1)).status,409,'point cannot be removed while referenced');
 const start=editSharedTacticalRecord('airdrop_event',event,'start',{});
 assert.equal((await s.put('airdrop_event',event.id,token,1,start)).status,200);
 const territory=tacticalRecordForProfile('territory',newTerritory(localProfile,{name:'North',region:'Center',ownerType:'none',ownerId:''}),profile);
 assert.equal((await s.put('territory',territory.id,token,0,territory)).status,201);
 const opEvent=tacticalRecordForProfile('territory_event',newCrimeEvent(localProfile,{title:'Capture',eventKind:'capture',date:'2026-11-21',territoryId:territory.id,attackerType:'family',attackerId:'family-aaa-001',defenderType:'none',defenderId:''}),profile);
 assert.equal((await s.put('territory_event',opEvent.id,token,0,opEvent)).status,201);
 assert.equal((await s.del('territory',territory.id,token,1)).status,409,'territory used in event');
 assert.equal((await s.del('territory_event',opEvent.id,token,1)).status,200);
 assert.equal((await s.del('territory',territory.id,token,1)).status,200);
 assert.equal((await s.put('territory',territory.id,token,0,territory)).status,409,'tombstone prevents stale recreation');
 assert.equal((await s.put('territory',territory.id,token,2,territory)).status,201,'explicit resurrection requires deleted version');
 assert.equal((await request(root+'/territory/'+territory.id,token)).status,200);
 const changelog=await request(root+'/changes?after=0&limit=100',token);
 assert.ok(changelog.data.changes.some(x=>x.action==='delete'&&x.kind==='territory'));
}));
test('2.3.7 stable idempotency, image dimensions, hostile input and team revocation',()=>fixture(async f=>{
 const s=await createSetup(f),{request}=f,token=s.editor.accessToken;
 assert.equal((await s.upload(token,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAAAAAAAAAAAA'.padEnd(50,'A')),'0'.repeat(64))).status,400);
 assert.equal((await s.upload(token)).status,201);
 const id='map-'+s.profile,operationId=randomUUID();
 const x=await s.put('map',id,token,0,s.meta,operationId);assert.equal(x.status,201);
 const y=await s.put('map',id,token,0,s.meta,operationId);assert.equal(y.status,200);assert.equal(y.data.replayed,true);
 assert.equal((await s.put('map',id,token,0,{...s.meta,name:'Malicious'},operationId)).status,409);
 const inv=await request(`/v1/teams/${s.team}/members/${s.editor.account.id}`,s.owner.accessToken,'DELETE');assert.equal(inv.status,200);
 assert.equal((await request(s.root,token)).status,404);
 assert.equal((await s.put('map',id,token,1,s.meta)).status,404);
 assert.equal((await request(s.root,s.viewer.accessToken)).status,200);
}));
