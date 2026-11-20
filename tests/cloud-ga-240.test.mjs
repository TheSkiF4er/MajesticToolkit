/** GA acceptance runs against a real HTTP server and a persistent SQLite file.
 * It deliberately exercises several features in the *same* team and database,
 * not isolated mocked endpoints or standalone schema declarations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {createBackup,verifyBackup,restoreBackup} from '../cloud-identity/ops-cli.mjs';
import {newFamily} from '../src/lib/family-core.mjs';
const password='TeamCloudGA-Production-2026!';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence=Buffer.from('GA sensitive private evidence\nversion-one\n');
const filesMeta=(visibility,name='case.txt',note='Private preliminary evidence')=>({name,title:'Cloud evidence',note,visibility});
async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'majestic-ga-240-')),dbPath=join(dir,'cloud.sqlite');
 let app=createIdentityServer({dbPath,port:0});
 let url;
 const start=async()=>{await app.listen();url='http://127.0.0.1:'+app.server.address().port;};
 const request=async(path,{token,method='GET',body,headers={}}={})=>{
  const response=await fetch(url+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();return {status:response.status,data:result};
 };
 const raw=async(path,{token,method='GET',bytes,headers={}}={})=>fetch(url+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...headers},body:bytes});
 const register=async(username,deviceName='Desktop')=>{
  const res=await request('/v1/auth/register',{method:'POST',body:{username,password,deviceName}});
  assert.equal(res.status,201,JSON.stringify(res.data));return res.data;
 };
 try{await start();await run({request,raw,register,dir,dbPath,db:()=>app.db,async restart(){await app.close();app=createIdentityServer({dbPath,port:0});await start();},async stop(){await app.close();app=null;}});}
 finally{if(app)await app.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
async function joinTeam(f,teamId,owner,person,role){
 const invite=await f.request(`/v1/teams/${teamId}/invitations`,{token:owner.accessToken,method:'POST',body:{role,targetUsername:person.account.username}});
 assert.equal(invite.status,201,JSON.stringify(invite.data));
 assert.equal((await f.request('/v1/teams/invitations/accept',{token:person.accessToken,method:'POST',body:{token:invite.data.token}})).status,200);
}
async function upload(f,path,who,visibility,bytes=evidence){
 const response=await f.raw(path,{token:who,method:'POST',bytes,headers:{'Content-Type':'text/plain','X-MT-Sha256':digest(bytes),'X-MT-File-Meta':Buffer.from(JSON.stringify(filesMeta(visibility))).toString('base64url')}});
 return {status:response.status,data:await response.json()};
}

test('2.4.0 GA: full cross-service flow, per-revision privacy, versions, RBAC, offline recovery and durable audit',()=>fixture(async f=>{
 const owner=await f.register('gaowner'),editor=await f.register('gaeditor'),viewer=await f.register('gaviewer'),outsider=await f.register('gaoutsider');
 const created=await f.request('/v1/teams',{token:owner.accessToken,method:'POST',body:{name:'Cloud GA Acceptance'}});
 assert.equal(created.status,201);const team=created.data.team.id;
 await joinTeam(f,team,owner,editor,'editor');await joinTeam(f,team,owner,viewer,'viewer');
 const cloud= `/v1/teams/${team}/cloud/profiles`;
 const profileRes=await f.request(cloud,{token:owner.accessToken,method:'POST',body:{name:'RP GA',project:'majestic',server:'1'}});
 assert.equal(profileRes.status,201,JSON.stringify(profileRes.data));
 const profile=profileRes.data.profile.id,root=`${cloud}/${profile}`;
 // A record created on one device must be seen through the same server state by another.
 const family=newFamily('local-ga-profile-a',{name:'GA Family'}),sync=root+'/sync';
 const push=await f.request(sync,{token:editor.accessToken,method:'POST',body:{operationId:randomUUID(),kind:'family',id:family.id,baseVersion:0,record:family}});
 assert.equal(push.status,200,JSON.stringify(push.data));
 const received=await f.request(sync+'/snapshot',{token:viewer.accessToken});
 assert.equal(received.status,200);assert.equal(received.data.entries[0].record.name,'GA Family');
 assert.equal((await f.request(sync,{token:viewer.accessToken,method:'POST',body:{operationId:randomUUID(),kind:'family',id:family.id,baseVersion:1,record:family}})).status,403);
 assert.equal((await f.request(sync,{token:outsider.accessToken})).status,404);
 const knowledge=root+'/knowledge';
 const draft=await f.request(knowledge,{token:editor.accessToken,method:'POST',body:{kind:'law',title:'Cloud law',category:'Rules',body:'Published rule v1'}});
 assert.equal(draft.status,201,JSON.stringify(draft.data));const id=draft.data.item.id;
 assert.equal((await f.request(knowledge+'/'+id,{token:viewer.accessToken})).status,404);
 assert.equal((await f.request(knowledge+'/'+id+'/submit',{token:editor.accessToken,method:'POST',body:{baseRevision:1}})).status,200);
 assert.equal((await f.request(knowledge+'/'+id+'/review',{token:editor.accessToken,method:'POST',body:{baseRevision:1,decision:'approve'}})).status,403);
 assert.equal((await f.request(knowledge+'/'+id+'/review',{token:owner.accessToken,method:'POST',body:{baseRevision:1,decision:'approve'}})).status,200);
 assert.equal((await f.request(knowledge+'/'+id+'/publish',{token:owner.accessToken,method:'POST',body:{baseRevision:1}})).status,200);
 assert.equal((await f.request(knowledge+'/'+id,{token:viewer.accessToken})).data.item.body,'Published rule v1');
 const files=root+'/files';
 const privateFile=await upload(f,files,editor.accessToken,'private');assert.equal(privateFile.status,201,JSON.stringify(privateFile.data));
 const file=privateFile.data.file.id;
 assert.equal((await f.request(files+'/'+file,{token:viewer.accessToken})).status,404);
 const share=await f.request(files+'/'+file,{token:editor.accessToken,method:'PATCH',body:{...filesMeta('team','case.txt','Shared summary only'),baseVersion:1}});
 assert.equal(share.status,200,JSON.stringify(share.data));
 const fileHistory=await f.request(files+'/'+file+'/versions',{token:viewer.accessToken});
 assert.deepEqual(fileHistory.data.versions.map(v=>v.version),[2]);
 assert.equal((await f.raw(files+'/'+file+'/versions/1',{token:viewer.accessToken})).status,404,'previous private content is NOT retroactively shared');
 assert.equal((await f.raw(files+'/'+file+'/versions/1',{token:owner.accessToken})).status,404,'team owner cannot bypass private history');
 assert.equal((await f.raw(files+'/'+file+'/versions/1',{token:editor.accessToken})).status,200,'original author retains private revision');
 assert.equal((await f.raw(files+'/'+file+'/content',{token:viewer.accessToken})).status,200);
 const link=await f.request(files+'/'+file+'/links',{token:editor.accessToken,method:'POST',body:{targetType:'knowledge',targetKind:'',targetId:id}});
 assert.equal(link.status,201,JSON.stringify(link.data));
 assert.equal((await f.request(files+'/'+file+'/links',{token:viewer.accessToken})).data.links.length,1);
 assert.equal((await f.request(files+'/'+file,{token:editor.accessToken,method:'PATCH',body:{...filesMeta('private'),baseVersion:2}})).status,409,'attached team file cannot be privatized');
 const audit=await f.request(`/v1/teams/${team}/audit`,{token:owner.accessToken});
 assert.equal(audit.status,200);assert.ok(audit.data.events.some(x=>x.event==='knowledge.published'));
 assert.equal((await f.request(`/v1/teams/${team}/audit`,{token:viewer.accessToken})).status,403);
 assert.ok(!(JSON.stringify(audit.data).includes('Private preliminary evidence')),'audit must not disclose evidence text');
 const notifications=await f.request(`/v1/teams/${team}/notifications`,{token:viewer.accessToken});
 assert.equal(notifications.status,200);assert.ok(notifications.data.notifications.length>0);
 const snap=join(f.dir,'ga-snapshot.sqlite');await createBackup(f.dbPath,snap);await verifyBackup(snap);
 await f.restart();
 assert.equal((await f.request(knowledge+'/'+id,{token:viewer.accessToken})).data.item.body,'Published rule v1');
 assert.equal((await f.request(files+'/'+file+'/versions/1',{token:viewer.accessToken})).status,404);
 // A removed team member loses the entire data plane, not just the team UI.
 assert.equal((await f.request(`/v1/teams/${team}/members/${viewer.account.id}`,{token:owner.accessToken,method:'DELETE'})).status,200);
 for(const url of [sync,knowledge+'/'+id,files+'/'+file,`/v1/teams/${team}/notifications`]){
  assert.equal((await f.request(url,{token:viewer.accessToken})).status,404,url);
 }
 assert.equal((await f.request('/v1/auth/logout',{token:editor.accessToken,method:'POST',body:{}})).status,200);
 assert.equal((await f.request(files+'/'+file,{token:editor.accessToken})).status,401);
 await f.stop();
 const target=join(f.dir,'restored.sqlite');await restoreBackup(snap,target,{confirmed:true});
 const restored=createIdentityServer({dbPath:target,port:0});
 await restored.listen();try{
  const u='http://127.0.0.1:'+restored.server.address().port;
  const r=await fetch(u+knowledge+'/'+id,{headers:{Authorization:'Bearer '+viewer.accessToken}});
  assert.equal(r.status,200,'backup recovers publication and membership from snapshot');
  const bin=await fetch(u+files+'/'+file+'/content',{headers:{Authorization:'Bearer '+viewer.accessToken}});
  assert.equal(bin.status,200);assert.equal(digest(Buffer.from(await bin.arrayBuffer())),digest(evidence));
 }finally{await restored.close();}
}));

test('2.4.0 GA: backup refuses application-level corrupted bytes even when SQLite integrity passes',()=>fixture(async f=>{
 const owner=await f.register('gablobowner');
 const team=(await f.request('/v1/teams',{token:owner.accessToken,method:'POST',body:{name:'Integrity Team'}})).data.team.id;
 const profile=(await f.request(`/v1/teams/${team}/cloud/profiles`,{token:owner.accessToken,method:'POST',body:{name:'Integrity RP',project:'majestic',server:'1'}})).data.profile.id;
 const path=`/v1/teams/${team}/cloud/profiles/${profile}/files`;
 assert.equal((await upload(f,path,owner.accessToken,'private')).status,201);
 // Corrupt a blob without changing the SQLite page checksum. SQLite's own
 // integrity_check still reports ok; content hashing must catch the damage.
 f.db().prepare('UPDATE cloud_file_blobs SET bytes=?').run(Buffer.from('tampered blob data'));
 assert.equal(f.db().prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 await assert.rejects(createBackup(f.dbPath,join(f.dir,'corrupt.sqlite')),/content-addressed blob integrity failed/);
 assert.equal((await f.request('/v1/ready')).status,200,'SQLite readiness alone is not proof of binary content integrity');
}));

test('2.4.0 GA: private historical binary remains inaccessible after a replacement becomes team-visible',()=>fixture(async f=>{
 const owner=await f.register('garevisionowner'),viewer=await f.register('garevisionviewer');
 const team=(await f.request('/v1/teams',{token:owner.accessToken,method:'POST',body:{name:'Revision Privacy'}})).data.team.id;
 await joinTeam(f,team,owner,viewer,'viewer');
 const profile=(await f.request(`/v1/teams/${team}/cloud/profiles`,{token:owner.accessToken,method:'POST',body:{name:'Evidence RP',project:'majestic',server:'1'}})).data.profile.id;
 const root=`/v1/teams/${team}/cloud/profiles/${profile}/files`;
 const first=await upload(f,root,owner.accessToken,'private');assert.equal(first.status,201);const file=first.data.file.id;
 const publicBytes=Buffer.from('Redacted evidence for team disclosure\n');
 const response=await f.raw(root+'/'+file+'/versions',{token:owner.accessToken,method:'PUT',bytes:publicBytes,headers:{'Content-Type':'text/plain','X-MT-Sha256':digest(publicBytes),'X-MT-Base-Version':'1','X-MT-File-Meta':Buffer.from(JSON.stringify(filesMeta('team','redacted.txt','Public redacted copy'))).toString('base64url')}});
 assert.equal(response.status,200,await response.text());
 const allowed=await f.raw(root+'/'+file+'/content',{token:viewer.accessToken});
 assert.equal(allowed.status,200);assert.equal(Buffer.from(await allowed.arrayBuffer()).toString(),publicBytes.toString());
 for(const path of [root+'/'+file+'/versions/1',root+'/'+file+'/versions']){
  const r=await f.raw(path,{token:viewer.accessToken});
  if(path.endsWith('/1'))assert.equal(r.status,404);
  else assert.deepEqual((await r.json()).versions.map(x=>x.version),[2]);
 }
 const old=await f.raw(root+'/'+file+'/versions/1',{token:owner.accessToken});
 assert.equal(old.status,200);assert.equal(Buffer.from(await old.arrayBuffer()).toString(),evidence.toString());
}));

test('2.4.0 GA: recovery validation rejects Tactical map image bit rot',()=>fixture(async f=>{
 const owner=await f.register('gamapowner');
 const team=(await f.request('/v1/teams',{token:owner.accessToken,method:'POST',body:{name:'Map Integrity'}})).data.team.id;
 const profile=(await f.request(`/v1/teams/${team}/cloud/profiles`,{token:owner.accessToken,method:'POST',body:{name:'Map RP',project:'majestic',server:'1'}})).data.profile.id;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/u/8AAAAASUVORK5CYII=','base64');
 const sha=digest(png),url=`/v1/teams/${team}/cloud/profiles/${profile}/tactical/image/${sha}`;
 const sent=await f.raw(url,{method:'PUT',token:owner.accessToken,bytes:png,headers:{'Content-Type':'image/png'}});
 assert.equal(sent.status,201,await sent.text());
 await createBackup(f.dbPath,join(f.dir,'valid-map.sqlite'));
 f.db().prepare('UPDATE cloud_tactical_images SET data=?').run(Buffer.from('invalid map binary after page-level corruption'));
 assert.equal(f.db().prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 await assert.rejects(createBackup(f.dbPath,join(f.dir,'corrupt-map.sqlite')),/Tactical map image integrity failed/);
}));
