/** 2.3.9 reproducible local HTTP/SQLite concurrency smoke (not an internet-scale load claim). */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createIdentityServer} from '../cloud-identity/server.mjs';
const iterations=Number(process.env.CLOUD_LOAD_REQUESTS||240);
if(!Number.isSafeInteger(iterations)||iterations<20||iterations>2000)throw Error('CLOUD_LOAD_REQUESTS must be 20..2000');
const concurrency=Number(process.env.CLOUD_LOAD_CONCURRENCY||12);
if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>32)throw Error('CLOUD_LOAD_CONCURRENCY must be 1..32');
const dir=await mkdtemp(join(tmpdir(),'mt-cloud-load-239-'));
const app=createIdentityServer({dbPath:join(dir,'load.sqlite'),port:0});
try{
 await app.listen();const base='http://127.0.0.1:'+app.server.address().port;
 const request=async(path,token,method='GET',body)=>{
  const t=performance.now();const res=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await res.json();return {status:res.status,data,elapsed:performance.now()-t};
 };
 const user=await request('/v1/auth/register',null,'POST',{username:'loadowner',password:'LoadTestPassphrase2026!!',deviceName:'Benchmark'});
 assert.equal(user.status,201);
 const token=user.data.accessToken;
 const team=await request('/v1/teams',token,'POST',{name:'Load smoke team'});assert.equal(team.status,201);
 const teamId=team.data.team.id;
 const tasks=Array.from({length:iterations},(_,i)=>async()=>i%10===0?
  request(`/v1/teams/${teamId}/cloud/profiles`,token,'POST',{name:'Load '+i,project:'majestic',server:'1'}):
  request(`/v1/teams/${teamId}/members`,token));
 let current=0;const outcomes=[];
 await Promise.all(Array.from({length:concurrency},async()=>{while(current<tasks.length){const i=current++;outcomes[i]=await tasks[i]();}}));
 const failures=outcomes.filter(x=>x.status>=500||x.status!==200&&x.status!==201);
 const latency=outcomes.map(x=>x.elapsed).sort((a,b)=>a-b);
 const p95=Math.round(latency[Math.ceil(latency.length*.95)-1]);
 const audit=await request(`/v1/teams/${teamId}/audit`,token);
 assert.equal(audit.status,200);
 assert.equal(audit.data.events.filter(x=>x.event==='cloud.profile_created').length,Math.floor((iterations-1)/10)+1);
 assert.equal(failures.length,0,JSON.stringify(failures.slice(0,3)));
 console.log(JSON.stringify({requests:iterations,concurrency,failed:failures.length,p95Ms:p95,maxMs:Math.ceil(latency.at(-1)),auditedProfiles:Math.floor((iterations-1)/10)+1}));
}finally{await app.close();await rm(dir,{recursive:true,force:true});}
