import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newTerritory,newCrimeEvent,changeCrimeEvent} from '../src/lib/crime-core.mjs';
import {newAirdropPoint,newAirdropEvent,changeAirdropEvent} from '../src/lib/tactical-airdrop-core.mjs';
import {buildTacticalAnalytics,tacticalReplayFrame,tacticalAnalyticsCsv,tacticalSimulationContext,cleanReplayRange} from '../src/lib/tactical-analytics-core.mjs';
const profile='profile_replay_228',other='profile_other_228',sha='a'.repeat(64);
const family={id:'family_replay_01',profileId:profile,name:'West Family'},organization={id:'org_replay_0001',profileId:profile,name:'East Team'};
function fixture(){
 const territory=newTerritory(profile,{name:'Old Port',region:'Bay',ownerType:'family',ownerId:family.id,notes:''});
 let capture=newCrimeEvent(profile,{title:'Захват порта',eventKind:'capture',territoryId:territory.id,date:'2026-11-01',attackerType:'organization',attackerId:organization.id,defenderType:'family',defenderId:family.id,notes:''});
 capture=changeCrimeEvent(capture,'participant-add',{player:'Player Alpha',side:'attacker',kills:6,deaths:2,damage:1900});
 capture=changeCrimeEvent(capture,'finish',{winner:'attacker'});
 const point=newAirdropPoint(profile,{name:'Drop Zone',description:'',mapSha256:sha,x:.5,y:.2});
 let drop=newAirdropEvent(profile,{title:'Air Loot',pointId:point.id,scheduledAt:'2026-11-19T12:00:00.000Z',durationMinutes:40,notes:''});
 drop=changeAirdropEvent(drop,'start');drop=changeAirdropEvent(drop,'claim',{winner:'Player Alpha',reward:'Loot'});drop=changeAirdropEvent(drop,'finish',{result:'Taken'});
 return {territories:[territory],operations:[capture],airdropPoints:[point],airdropEvents:[drop],families:[family],organizations:[organization],simulations:[]};
}
const build=(f,options={},pid=profile)=>buildTacticalAnalytics(f,pid,options);
test('completed captures and airdrops produce correct daily and owner replay',()=>{
 const f=fixture(),r=build(f);
 assert.equal(r.stats.captures,1);assert.equal(r.stats.airdrops,1);assert.equal(r.stats.claims,1);
 assert.equal(r.stats.kills,6);assert.equal(r.stats.damage,1900);
 assert.equal(r.groups.find(x=>x.key==='organization:'+organization.id)?.wins,1);
 assert.equal(r.events.length,4);
 assert.equal(tacticalReplayFrame(r,-1).owners[f.territories[0].id].id,family.id);
 assert.equal(tacticalReplayFrame(r,0).owners[f.territories[0].id].id,organization.id);
 assert.equal(tacticalReplayFrame(r,3).owners[f.territories[0].id].id,organization.id);
 assert.equal(r.trend.reduce((n,x)=>n+x.airdrops,0),1);
 assert.equal(r.events.filter(x=>x.category==='airdrop').length,3);
});
test('category filtering never leaks future territory owner into earlier replay frames',()=>{
 const f=fixture(),r=build(f,{category:'airdrop'});assert.equal(r.events.length,3);
 assert.equal(tacticalReplayFrame(r,-1).owners[f.territories[0].id].id,family.id);
 assert.equal(tacticalReplayFrame(r,0).owners[f.territories[0].id].id,organization.id);
 assert.equal(r.stats.captures,0);assert.equal(r.stats.claims,1);
 const past=build(f,{from:'2026-11-18',category:'airdrop'});
 assert.equal(tacticalReplayFrame(past,-1).owners[f.territories[0].id].id,organization.id);
});
test('time filter includes only period events but preserves pre-period owner',()=>{
 const f=fixture(),r=build(f,{from:'2026-11-05',to:'2026-11-30'});
 assert.equal(r.stats.captures,0);assert.equal(r.stats.airdrops,1);
 assert.equal(tacticalReplayFrame(r,-1).owners[f.territories[0].id].id,organization.id);
 assert.equal(build(f,{to:'2026-11-02'}).events.length,1);
 assert.equal(build(f,{from:'2026-12-01'}).events.length,0);
});
test('profile isolation, corrupt ledgers and invalid ranges fail closed',()=>{
 const f=fixture();assert.equal(build(f,{},other).events.length,0);
 assert.throws(()=>cleanReplayRange({from:'2026-02-30'}));
 assert.throws(()=>cleanReplayRange({from:'2026-11-22',to:'2026-11-01'}));
 assert.throws(()=>cleanReplayRange({category:'unknown'}));
 const bad=structuredClone(f);bad.operations[0].events.at(-1).winner='forged';assert.throws(()=>build(bad));
 const broken=structuredClone(f);broken.airdropEvents[0].history.at(-1).kind='claim';assert.throws(()=>build(broken));
 assert.throws(()=>tacticalReplayFrame(build(f),99),/вне истории/);
});
test('safe CSV export and separate model comparison',()=>{
 const f=fixture(),r=build(f);assert.match(tacticalAnalyticsCsv(r),/Захват порта/);
 const replaced=structuredClone(f);replaced.airdropEvents[0].history[0].data.title='=SUM(A1:A2)';replaced.airdropEvents[0].title='=SUM(A1:A2)';
 const report=build(replaced);assert.match(tacticalAnalyticsCsv(report),/"'=SUM\(A1:A2\)"/);
 assert.throws(()=>tacticalSimulationContext(r,'unknown_simulation'),/отсутствует/);
 assert.equal(f.operations[0].status,'completed');
});
