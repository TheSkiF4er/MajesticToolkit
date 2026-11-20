import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {createBackup,verifyBackup,restoreBackup} from '../cloud-identity/ops-cli.mjs';
const secret='0123456789abcdef0123456789abcdef0123456789abcdef';
const password='HardeningPassphrase!2026';
async function fixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'mt-ops-239-')),dbPath=join(dir,'server.sqlite');
 let app=createIdentityServer({dbPath,port:0,operatorToken:secret});
 const start=async()=>{await app.listen();return `http://127.0.0.1:${app.server.address().port}`;};
 let origin=await start();
 const call=async(path,{token,method='GET',body,operator}={})=>{
  const res=await fetch(origin+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(operator?{Authorization:'Bearer '+operator}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 };
 const register=async username=>{const r=await call('/v1/auth/register',{method:'POST',body:{username,password,deviceName:'Laptop'}});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;};
 try{await fn({call,register,origin:()=>origin,db:()=>app.db,dbPath,dir,async restart(){await app.close();app=createIdentityServer({dbPath,port:0,operatorToken:secret});origin=await start();}});}
 finally{await app?.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
async function seeded(f){
 const owner=await f.register('opsowner'),editor=await f.register('opseditor'),viewer=await f.register('opsviewer'),stranger=await f.register('opsstranger');
 const team=(await f.call('/v1/teams',{method:'POST',token:owner.accessToken,body:{name:'Operations'}})).data.team.id;
 for(const [u,role] of [[editor,'editor'],[viewer,'viewer']]){
  const invitation=await f.call(`/v1/teams/${team}/invitations`,{method:'POST',token:owner.accessToken,body:{role,targetUsername:u.account.username}});
  assert.equal(invitation.status,201);
  assert.equal((await f.call('/v1/teams/invitations/accept',{method:'POST',token:u.accessToken,body:{token:invitation.data.token}})).status,200);
 }
 const p=await f.call(`/v1/teams/${team}/cloud/profiles`,{method:'POST',token:owner.accessToken,body:{name:'San Andreas',project:'majestic',server:'1'}});
 assert.equal(p.status,201,JSON.stringify(p.data));
 return {team,profile:p.data.profile.id,owner,editor,viewer,stranger};
}
test('2.3.9: durable team audit, notifications scoped per recipient, read state and revocation',()=>fixture(async f=>{
 const t=await seeded(f),root=`/v1/teams/${t.team}`,auth=token=>({token});
 assert.equal((await f.call(root+'/audit',auth(t.viewer.accessToken))).status,403);
 assert.equal((await f.call(root+'/audit',auth(t.stranger.accessToken))).status,404);
 let result=await f.call(root+'/audit',auth(t.owner.accessToken));assert.equal(result.status,200);
 assert.ok(result.data.events.some(x=>x.event==='cloud.profile_created'));
 const editorAlerts=await f.call(root+'/notifications',auth(t.editor.accessToken));assert.equal(editorAlerts.status,200);
 assert.ok(editorAlerts.data.notifications.some(x=>x.event==='cloud.profile_created'));
 const owned=editorAlerts.data.notifications[0];assert.equal(owned.readAt,null);
 assert.equal((await f.call(root+`/notifications/${owned.seq}/read`,{token:t.viewer.accessToken,method:'POST'})).status,404);
 assert.equal((await f.call(root+`/notifications/${owned.seq}/read`,{token:t.editor.accessToken,method:'POST'})).status,200);
 assert.equal((await f.call(root+`/notifications/${owned.seq}/read`,{token:t.editor.accessToken,method:'POST'})).status,200);
 assert.ok((await f.call(root+'/notifications',auth(t.editor.accessToken))).data.notifications.find(x=>x.seq===owned.seq).readAt);
 const profileRoot=root+'/cloud/profiles/'+t.profile;
 const k=await f.call(profileRoot+'/knowledge',{token:t.editor.accessToken,method:'POST',body:{kind:'note',title:'Operations handbook',category:'Rules',body:'Sensitive draft'}});
 assert.equal(k.status,201,JSON.stringify(k.data));
 assert.equal((await f.call(profileRoot+'/knowledge/'+k.data.item.id,{token:t.viewer.accessToken})).status,404);
 assert.ok((await f.call(root+'/audit',auth(t.owner.accessToken))).data.events.some(x=>x.event==='knowledge.created'));
 // Viewer sees only neutral activity, never a draft body or private file content.
 const alerts=await f.call(root+'/notifications',auth(t.viewer.accessToken));
 assert.ok(!JSON.stringify(alerts.data).includes('Sensitive draft'));
 await f.restart();
 assert.ok((await f.call(root+'/notifications',auth(t.editor.accessToken))).data.notifications.find(x=>x.seq===owned.seq).readAt);
 assert.ok((await f.call(root+'/audit',auth(t.owner.accessToken))).data.events.some(x=>x.event==='knowledge.created'));
 assert.equal((await f.call('/v1/auth/logout',{token:t.editor.accessToken,method:'POST',body:{}})).status,200);
 assert.equal((await f.call(root+'/notifications',auth(t.editor.accessToken))).status,401);
}));
test('2.3.9: operator-only metrics and readiness; long URL denied',()=>fixture(async f=>{
 assert.equal((await f.call('/v1/ready')).status,200);
 assert.equal((await f.call('/v1/operations/metrics')).status,401);
 assert.equal((await f.call('/v1/operations/metrics',{operator:'fake-operator-token'})).status,401);
 const stats=await f.call('/v1/operations/metrics',{operator:secret});assert.equal(stats.status,200);
 assert.ok(stats.data.requests.total>=3);assert.ok(stats.data.latencyMs.p95>=0);
 assert.ok(stats.data.sqlite.pageCount>0);assert.equal(stats.data.auditEntries,0);
 const huge=await f.call('/v1/health?'+'x'.repeat(5000));assert.equal(huge.status,414);
 assert.equal((await f.call('/v1/operations/metrics',{operator:secret})).data.requests.errors4xx>=3,true);
}));
test('2.3.9: WAL-safe snapshot, SHA-256 verify, offline restore, concurrent lock and corrupt refusal',()=>fixture(async f=>{
 const t=await seeded(f),snapshot=join(f.dir,'snap.sqlite'),restored=join(f.dir,'restored.sqlite');
 assert.equal((await f.call('/v1/teams',{token:t.owner.accessToken})).data.teams.length,1);
 const manifest=await createBackup(f.dbPath,snapshot);
 assert.ok(manifest.bytes>100000);assert.equal((await verifyBackup(snapshot)).sha256,manifest.sha256);
 await assert.rejects(()=>createBackup(f.dbPath,snapshot),/already exists/);
 await assert.rejects(()=>restoreBackup(snapshot,f.dbPath,{confirmed:true}),/lock exists/);
 await assert.rejects(()=>restoreBackup(snapshot,restored),/explicit --yes/);
 assert.equal((await restoreBackup(snapshot,restored,{confirmed:true})).restored,true);
 assert.equal((await stat(restored)).mode & 0o777,0o600);
 const fromRestored=createIdentityServer({dbPath:restored,port:0});await fromRestored.listen();
 try{assert.equal(fromRestored.db.prepare('SELECT count(*) AS n FROM teams').get().n,1);assert.equal(fromRestored.db.prepare('SELECT count(*) AS n FROM cloud_notifications').get().n>0,true);}
 finally{await fromRestored.close();}
 const bytes=await readFile(snapshot);bytes[250]=bytes[250]^0xff;await writeFile(snapshot,bytes);
 await assert.rejects(()=>verifyBackup(snapshot),/SHA-256/);
 await assert.rejects(()=>restoreBackup(snapshot,join(f.dir,'bad.sqlite'),{confirmed:true}),/SHA-256/);
}));

test('2.3.9: private evidence creates no team audit or recipient notification',()=>fixture(async f=>{
 const t=await seeded(f),root=`/v1/teams/${t.team}`;
 const before=(await f.call(root+'/audit',{token:t.owner.accessToken})).data.events.length;
 const aliceAlerts=(await f.call(root+'/notifications',{token:t.viewer.accessToken})).data.notifications.length;
 const bytes=Buffer.from('Confidential investigator material 2026');
 const sha=createHash('sha256').update(bytes).digest('hex');
 const meta={name:'private.txt',title:'Private notes',note:'Strictly private',visibility:'private'};
 const target=`${f.origin()}${root}/cloud/profiles/${t.profile}/files`;
 const upload=await fetch(target,{method:'POST',headers:{Authorization:'Bearer '+t.editor.accessToken,'Content-Type':'text/plain','X-MT-File-Meta':Buffer.from(JSON.stringify(meta)).toString('base64url'),'X-MT-Sha256':sha},body:bytes});
 assert.equal(upload.status,201,await upload.text());
 const audit=(await f.call(root+'/audit',{token:t.owner.accessToken})).data.events;
 assert.equal(audit.length,before,'private evidence must not appear in team audit');
 const alerts=(await f.call(root+'/notifications',{token:t.viewer.accessToken})).data.notifications;
 assert.equal(alerts.length,aliceAlerts,'private evidence must not notify other members');
}));
