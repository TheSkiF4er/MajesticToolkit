import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {createCloudIdentityService,cloudHostPattern} from '../src/lib/cloud-identity-client.mjs';
const password='not-a-common-password-2026';
async function withServer(fn){
  const dir=await mkdtemp(join(tmpdir(),'mt-teams-232-'));let t=Date.now();let app=createIdentityServer({dbPath:join(dir,'identity.sqlite'),port:0,clock:()=>t});
  const start=async()=>{const addr=await app.listen();return `http://127.0.0.1:${addr.port}`;};
  try{let origin=await start();await fn({origin,advance:ms=>{t+=ms;},async restart(){await app.close();app=createIdentityServer({dbPath:join(dir,'identity.sqlite'),port:0,clock:()=>t});origin=await start();return origin;}});}
  finally{await app.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
async function call(origin,path,method='GET',body=null,token=null){
 const res=await fetch(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 return {status:res.status,body:await res.json()};
}
async function user(origin,username){const result=await call(origin,'/v1/auth/register','POST',{username,password,deviceName:'Test Device'});assert.equal(result.status,201,JSON.stringify(result.body));return {...result.body,token:result.body.accessToken};}
const api=(origin,auth,path,method='GET',body=null)=>call(origin,path,method,body,auth.token);
const teamURL=id=>`/v1/teams/${id}`;

// All tests use the real listening HTTP server and SQLite (not endpoint mocks).
test('2.3.2: owner creates team, cross-account isolation and persistent roster',async()=>withServer(async({origin,restart})=>{
 const alice=await user(origin,'teamalice'),bob=await user(origin,'teambob');
 assert.equal((await api(origin,alice,'/v1/teams')).body.teams.length,0);
 assert.equal((await call(origin,'/v1/teams','POST',{name:'Not authorized'})).status,401);
 assert.equal((await api(origin,alice,'/v1/teams','POST',{name:'<script>bad</script>'})).status,400);
 const create=await api(origin,alice,'/v1/teams','POST',{name:'City Watch'});assert.equal(create.status,201);
 const id=create.body.team.id;assert.equal(create.body.team.role,'owner');
 const list=await api(origin,alice,'/v1/teams');assert.equal(list.body.teams.length,1);
 assert.equal((await api(origin,bob,'/v1/teams')).body.teams.length,0);
 assert.equal((await api(origin,bob,teamURL(id))).status,404);
 assert.equal((await api(origin,bob,teamURL(id)+'/members')).status,404);
 assert.equal((await api(origin,bob,teamURL(id)+'/invitations')).status,404);
 assert.equal((await api(origin,bob,teamURL(id)+'/activity')).status,404);
 const next=await restart();assert.equal((await api(next,alice,teamURL(id)+'/members')).body.members.length,1);
 assert.equal((await api(next,alice,teamURL(id))).body.team.name,'City Watch');
}));

test('2.3.2: invite is single-use and expires; tokens are never listed or stored as plaintext',async()=>withServer(async({origin,advance})=>{
 const owner=await user(origin,'inviteowner'),bob=await user(origin,'invitebob'),charlie=await user(origin,'invitecharlie');
 const id=(await api(origin,owner,'/v1/teams','POST',{name:'Invited Team'})).body.team.id;
 const inv=await api(origin,owner,teamURL(id)+'/invitations','POST',{role:'editor',targetUsername:'invitebob'});
 assert.equal(inv.status,201);const secret=inv.body.token;assert.match(secret,/^[A-Za-z0-9_-]{43}$/);
 const list=await api(origin,owner,teamURL(id)+'/invitations');assert.equal(list.status,200);
 assert.equal(list.body.invitations[0].status,'active');assert.equal(JSON.stringify(list.body).includes(secret),false);
 assert.equal((await api(origin,charlie,'/v1/teams/invitations/accept','POST',{token:secret})).status,403);
 const accepted=await api(origin,bob,'/v1/teams/invitations/accept','POST',{token:secret});assert.equal(accepted.status,200);assert.equal(accepted.body.team.role,'editor');
 assert.equal((await api(origin,bob,'/v1/teams/invitations/accept','POST',{token:secret})).status,410);
 assert.equal((await api(origin,charlie,'/v1/teams/invitations/accept','POST',{token:secret})).status,410);
 const extra=await api(origin,owner,teamURL(id)+'/invitations','POST',{role:'viewer'});
 assert.equal((await api(origin,owner,teamURL(id)+'/invitations/'+extra.body.invitation.id,'DELETE')).status,200);
 assert.equal((await api(origin,charlie,'/v1/teams/invitations/accept','POST',{token:extra.body.token})).status,410);
 const exp=await api(origin,owner,teamURL(id)+'/invitations','POST',{role:'viewer'});
 advance(8*24*60*60_000);
 const next=await call(origin,'/v1/auth/refresh','POST',{refreshToken:charlie.refreshToken});assert.equal(next.status,200);charlie.token=next.body.accessToken;
 const ownerNext=await call(origin,'/v1/auth/refresh','POST',{refreshToken:owner.refreshToken});owner.token=ownerNext.body.accessToken;
 assert.equal((await api(origin,charlie,'/v1/teams/invitations/accept','POST',{token:exp.body.token})).status,410);
 assert.equal((await api(origin,owner,teamURL(id)+'/invitations')).body.invitations.find(x=>x.id===exp.body.invitation.id).status,'expired');
}));

test('2.3.2: RBAC prevents client-side role escalation and protects owner/admin',async()=>withServer(async({origin})=>{
 const owner=await user(origin,'rbacowner'),admin=await user(origin,'rbacadmin'),editor=await user(origin,'rbaceditor'),viewer=await user(origin,'rbacviewer');
 const id=(await api(origin,owner,'/v1/teams','POST',{name:'RBAC Team'})).body.team.id;
 for(const [account,role] of [[admin,'admin'],[editor,'editor'],[viewer,'viewer']]){
   const created=await api(origin,owner,teamURL(id)+'/invitations','POST',{role});assert.equal(created.status,201);
   assert.equal((await api(origin,account,'/v1/teams/invitations/accept','POST',{token:created.body.token})).status,200);
 }
 assert.equal((await api(origin,viewer,teamURL(id)+'/members')).status,200);
 for(const actor of [viewer,editor]){
   assert.equal((await api(origin,actor,teamURL(id)+'/invitations','POST',{role:'viewer'})).status,403);
   assert.equal((await api(origin,actor,teamURL(id)+'/members/'+viewer.account.id,'PATCH',{role:'admin'})).status,403);
   assert.equal((await api(origin,actor,teamURL(id)+'/activity')).status,403);
 }
 assert.equal((await api(origin,admin,teamURL(id)+'/invitations','POST',{role:'admin'})).status,403);
 assert.equal((await api(origin,admin,teamURL(id)+'/members/'+owner.account.id,'DELETE')).status,403);
 assert.equal((await api(origin,admin,teamURL(id)+'/members/'+admin.account.id,'PATCH',{role:'owner'})).status,400);
 assert.equal((await api(origin,admin,teamURL(id)+'/members/'+admin.account.id,'PATCH',{role:'viewer'})).status,403);
 assert.equal((await api(origin,owner,teamURL(id)+'/members/'+owner.account.id,'PATCH',{role:'editor'})).status,403);
 assert.equal((await api(origin,owner,teamURL(id)+'/members/'+admin.account.id,'PATCH',{role:'editor'})).status,200);
 assert.equal((await api(origin,admin,teamURL(id)+'/invitations')).status,403);
 assert.equal((await api(origin,owner,teamURL(id)+'/members/'+admin.account.id,'PATCH',{role:'admin'})).status,200);
 assert.equal((await api(origin,admin,teamURL(id)+'/members/'+viewer.account.id,'PATCH',{role:'editor'})).status,200);
 assert.equal((await api(origin,admin,teamURL(id)+'/members/'+viewer.account.id,'PATCH',{role:'admin'})).status,403);
 assert.equal((await api(origin,admin,teamURL(id)+'/members/'+editor.account.id,'DELETE')).status,200);
 assert.equal((await api(origin,editor,teamURL(id)+'/members')).status,404);
 assert.equal((await api(origin,admin,teamURL(id)+'/activity')).status,200);
}));

test('2.3.2: ownership transfer, leave and delete keep consistent authority',async()=>withServer(async({origin})=>{
 const owner=await user(origin,'transferowner'),heir=await user(origin,'transferheir');
 const id=(await api(origin,owner,'/v1/teams','POST',{name:'Shift Team'})).body.team.id;
 assert.equal((await api(origin,owner,teamURL(id)+'/leave','POST')).status,403);
 const inv=(await api(origin,owner,teamURL(id)+'/invitations','POST',{role:'viewer'})).body;
 await api(origin,heir,'/v1/teams/invitations/accept','POST',{token:inv.token});
 assert.equal((await api(origin,heir,teamURL(id)+'/transfer','POST',{accountId:owner.account.id})).status,403);
 assert.equal((await api(origin,owner,teamURL(id)+'/transfer','POST',{accountId:heir.account.id})).status,200);
 const roster=(await api(origin,heir,teamURL(id)+'/members')).body.members;
 assert.equal(roster.filter(x=>x.role==='owner').length,1);assert.equal(roster.find(x=>x.id===heir.account.id).role,'owner');
 assert.equal((await api(origin,owner,teamURL(id),'DELETE')).status,403);
 assert.equal((await api(origin,owner,teamURL(id)+'/leave','POST')).status,200);
 assert.equal((await api(origin,owner,teamURL(id))).status,404);
 assert.equal((await api(origin,heir,teamURL(id),'DELETE')).status,200);
 assert.equal((await api(origin,heir,teamURL(id))).status,404);
 assert.equal((await api(origin,heir,'/v1/teams')).body.teams.length,0);
}));

test('2.3.2: session revocation removes team API access immediately',async()=>withServer(async({origin})=>{
 const owner=await user(origin,'revokedowner');const id=(await api(origin,owner,'/v1/teams','POST',{name:'Revocation Team'})).body.team.id;
 assert.equal((await api(origin,owner,teamURL(id)+'/members')).status,200);
 assert.equal((await api(origin,owner,'/v1/auth/logout','POST')).status,200);
 assert.equal((await api(origin,owner,teamURL(id)+'/members')).status,401);
 assert.equal((await api(origin,owner,'/v1/teams')).status,401);
}));

test('2.3.2: simultaneous acceptance has exactly one winner and no duplicate membership',async()=>withServer(async({origin})=>{
 const owner=await user(origin,'raceowner'),a=await user(origin,'raceusera'),b=await user(origin,'raceuserb');
 const id=(await api(origin,owner,'/v1/teams','POST',{name:'Race Team'})).body.team.id;
 const invite=(await api(origin,owner,teamURL(id)+'/invitations','POST',{role:'viewer'})).body;
 const results=await Promise.all([a,b].map(account=>api(origin,account,'/v1/teams/invitations/accept','POST',{token:invite.token})));
 assert.deepEqual(results.map(x=>x.status).sort((x,y)=>x-y),[200,410]);
 const members=(await api(origin,owner,teamURL(id)+'/members')).body.members;
 assert.equal(members.length,2);assert.equal(members.filter(x=>x.role==='owner').length,1);
}));

test('2.3.2: background RPC performs real authenticated team workflow without leaking tokens',async()=>withServer(async({origin})=>{
 const state=new Map(),storage={get:async key=>({[key]:state.get(key)}),set:async obj=>{Object.entries(obj).forEach(([k,v])=>state.set(k,v));},remove:async key=>state.delete(key)};
 const permissions={contains:async({origins})=>origins.includes(cloudHostPattern(origin))};
 const a=createCloudIdentityService({storage,permissions});await a.handle('configure',{origin});await a.handle('register',{username:'backgroundteam',password,deviceName:'Test Device'});
 const created=await a.handle('teamCreate',{name:'Background Team'});const teamId=created.team.id;
 assert.equal((await a.handle('teams')).teams.length,1);assert.equal((await a.handle('teamMembers',{teamId})).members.length,1);
 const secret=(await a.handle('teamInvite',{teamId,role:'viewer'})).token;
 assert.ok(secret);assert.ok(!JSON.stringify(await a.handle('teamInvitations',{teamId})).includes(secret));
 assert.equal((await a.handle('teamActivity',{teamId})).events.length,2);
 await a.handle('teamInviteRevoke',{teamId,invitationId:(await a.handle('teamInvitations',{teamId})).invitations[0].id});
 await a.handle('teamDelete',{teamId});assert.equal((await a.handle('teams')).teams.length,0);
 await a.handle('logout');await assert.rejects(a.handle('teams'),/Сначала войдите/);
}));
