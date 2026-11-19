import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {createCloudIdentityService,cloudEndpoint,cloudHostPattern,CLOUD_CONFIG_KEY,CLOUD_SESSION_KEY} from '../src/lib/cloud-identity-client.mjs';

async function withServer(fn){
  const dir=await mkdtemp(join(tmpdir(),'mt-cloud-231-'));
  let time=Date.now();let app=createIdentityServer({dbPath:join(dir,'identity.db'),host:'127.0.0.1',port:0,clock:()=>time});
  try{const address=await app.listen();const origin=`http://127.0.0.1:${address.port}`;
    await fn({origin,app,getTime:()=>time,advance:ms=>{time+=ms;},async restart(){await app.close();app=createIdentityServer({dbPath:join(dir,'identity.db'),host:'127.0.0.1',port:0,clock:()=>time});const addr=await app.listen();return `http://127.0.0.1:${addr.port}`;}});
  }finally{await app.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
async function call(base,path,method='GET',body=null,token=null,origin=null){
  const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json(),headers:response.headers};
}
const creds=(username='tester',deviceName='PC')=>({username,password:'correct-horse-with-15-chars',deviceName});

test('2.3.1: registration, login, real sessions and cross-device revocation',async()=>withServer(async({origin})=>{
  const created=await call(origin,'/v1/auth/register','POST',creds());assert.equal(created.status,201);
  const pc=created.data;assert.equal(pc.account.username,'tester');assert.ok(pc.refreshToken);assert.ok(pc.accessToken);
  const mobile=(await call(origin,'/v1/auth/login','POST',creds('tester','Firefox Android'))).data;
  const sessions=await call(origin,'/v1/auth/sessions','GET',null,pc.accessToken);
  assert.equal(sessions.status,200);assert.equal(sessions.data.sessions.length,2);
  assert.equal(sessions.data.sessions.find(s=>s.current).id,pc.sessionId);
  const cross=await call(origin,'/v1/auth/sessions/'+mobile.sessionId,'DELETE',null,pc.accessToken);
  assert.equal(cross.status,200);
  assert.equal((await call(origin,'/v1/auth/me','GET',null,mobile.accessToken)).status,401);
  assert.equal((await call(origin,'/v1/auth/refresh','POST',{refreshToken:mobile.refreshToken})).status,401);
  assert.equal((await call(origin,'/v1/auth/me','GET',null,pc.accessToken)).status,200);
  const other=(await call(origin,'/v1/auth/register','POST',creds('other'))).data;
  assert.equal((await call(origin,'/v1/auth/sessions/'+other.sessionId,'DELETE',null,pc.accessToken)).status,404);
  assert.equal((await call(origin,'/v1/auth/logout-all','POST',null,pc.accessToken)).data.revoked,1);
  assert.equal((await call(origin,'/v1/auth/me','GET',null,pc.accessToken)).status,401);
  assert.equal((await call(origin,'/v1/auth/me','GET',null,other.accessToken)).status,200);
}));

test('2.3.1: refresh rotates credentials, replay of old refresh revokes family',async()=>withServer(async({origin,advance})=>{
  const original=(await call(origin,'/v1/auth/register','POST',creds('replaytest'))).data;
  advance(16*60_000);
  assert.equal((await call(origin,'/v1/auth/me','GET',null,original.accessToken)).status,401);
  const rotated=await call(origin,'/v1/auth/refresh','POST',{refreshToken:original.refreshToken});
  assert.equal(rotated.status,200);assert.notEqual(rotated.data.accessToken,original.accessToken);
  assert.equal((await call(origin,'/v1/auth/me','GET',null,rotated.data.accessToken)).status,200);
  assert.equal((await call(origin,'/v1/auth/refresh','POST',{refreshToken:original.refreshToken})).status,401);
  assert.equal((await call(origin,'/v1/auth/me','GET',null,rotated.data.accessToken)).status,401);
  assert.equal((await call(origin,'/v1/auth/refresh','POST',{refreshToken:rotated.data.refreshToken})).status,401);
}));

test('2.3.1: session persistence survives DB restart',async()=>withServer(async({origin,restart})=>{
  const original=(await call(origin,'/v1/auth/register','POST',creds('persistent'))).data;
  const next=await restart();
  assert.equal((await call(next,'/v1/auth/me','GET',null,original.accessToken)).status,200);
  assert.equal((await call(next,'/v1/auth/logout','POST',null,original.accessToken)).status,200);
  assert.equal((await call(next,'/v1/auth/me','GET',null,original.accessToken)).status,401);
}));

test('2.3.1: invalid credentials, rate limiting, strict content and cross-origin requests',async()=>withServer(async({origin})=>{
  assert.equal((await call(origin,'/v1/auth/register','POST',{...creds('wrong'),password:'short'})).status,400);
  assert.equal((await call(origin,'/v1/auth/register','POST',creds('correct'))).status,201);
  assert.equal((await call(origin,'/v1/auth/register','POST',creds('correct'))).status,409);
  assert.equal((await call(origin,'/v1/auth/login','POST',{...creds('correct'),password:'also-wrong-long-password'})).status,401);
  const forbidden=await call(origin,'/v1/auth/me','GET',null,null,'https://evil.example');assert.equal(forbidden.status,403);
  const allowed=await call(origin,'/v1/health','GET',null,null,'chrome-extension://example-id');assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),'chrome-extension://example-id');
  let status;for(let i=0;i<10;i++)status=(await call(origin,'/v1/auth/login','POST',{...creds('correct'),password:'really-wrong-password'})).status;
  assert.equal(status,429);
}));

test('2.3.1: background client stores refresh secret privately, restores sessions and disconnects',async()=>withServer(async({origin})=>{
  const map=new Map(),storage={get:async key=>({[key]:map.get(key)}),set:async obj=>{for(const [k,v] of Object.entries(obj))map.set(k,v);},remove:async key=>map.delete(key)};
  const permitted=new Set([cloudHostPattern(origin)]),permissions={contains:async({origins})=>origins.every(x=>permitted.has(x))};
  const service=createCloudIdentityService({storage,permissions});
  assert.equal((await service.handle('status')).authenticated,false);
  assert.equal((await service.handle('configure',{origin})).configured,true);
  const auth=await service.handle('register',creds('clienttest'));assert.equal(auth.authenticated,true);
  assert.ok(!JSON.stringify(auth).includes('Token'));
  assert.ok(map.get(CLOUD_SESSION_KEY).refreshToken);
  assert.equal((await service.handle('status')).account.username,'clienttest');
  const sessions=await service.handle('sessions');assert.equal(sessions.sessions.length,1);
  const afterRestart=createCloudIdentityService({storage,permissions});
  assert.equal((await afterRestart.handle('status')).authenticated,true);
  await assert.rejects(afterRestart.handle('configure',{origin:'https://example.org'}),/Сначала выйдите/);
  await afterRestart.handle('logout');assert.equal((await service.handle('status')).authenticated,false);
  assert.equal(map.has(CLOUD_SESSION_KEY),false);
  assert.equal(map.get(CLOUD_CONFIG_KEY).origin,origin);
  assert.equal((await afterRestart.handle('login',creds('clienttest'))).authenticated,true);
  assert.equal((await afterRestart.handle('logoutAll')).ok,true);
  assert.equal((await afterRestart.handle('status')).authenticated,false);
}));

test('2.3.1: HTTPS-only remote cloud URLs and narrow permission scope',()=>{
  assert.equal(cloudEndpoint('https://cloud.example.org/'),'https://cloud.example.org');
  assert.equal(cloudEndpoint('http://127.0.0.1:8787/'),'http://127.0.0.1:8787');
  assert.equal(cloudHostPattern('https://cloud.example.org:8443'),'https://cloud.example.org/*');
  for(const unsafe of ['http://example.org','http://localhost:8787','https://admin:pass@example.org','https://example.org/path','https://example.org/?token=abc','file:///etc/passwd','https://example.org/#secret'])assert.throws(()=>cloudEndpoint(unsafe));
  assert.throws(()=>createIdentityServer({host:'0.0.0.0',port:0}),/TLS/);
});
