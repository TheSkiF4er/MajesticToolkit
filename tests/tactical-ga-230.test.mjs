import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withTacticalWriteLock} from '../src/lib/tactical-lock.mjs';
import {assertTacticalMapIsReplaceable} from '../src/lib/tactical-map-dependencies.mjs';
import {createPlan,mutatePlan,PLAN_PREFIX} from '../src/lib/tactical-planning-core.mjs';
import {newAirdropPoint,AIRDROP_POINT_PREFIX} from '../src/lib/tactical-airdrop-core.mjs';
import {newTerritory,newCrimeEvent,changeCrimeEvent} from '../src/lib/crime-core.mjs';
import {buildTacticalAnalytics,tacticalReplayFrame} from '../src/lib/tactical-analytics-core.mjs';

const profile='profile_tactical_ga230',other='profile_other_ga230',sha='a'.repeat(64);
const groupA={id:'family_tactical_ga230',profileId:profile,name:'Family A'};
const groupB={id:'org_tactical_ga230',profileId:profile,name:'Organization B'};

// This is the guard called by the actual IndexedDB replacement/deletion path.
test('GA: archived plans still protect the original map from destructive replacement',()=>{
 const created=createPlan(profile,{title:'Archived tactical plan',mapSha256:sha});
 const archived=mutatePlan(created,'archive',{archived:true});
 assert.equal(archived.state.archived,true);
 assert.throws(()=>assertTacticalMapIsReplaceable({[PLAN_PREFIX+archived.id]:archived},profile),/тактическим планом/);
 // Restoring the exact missing original image must remain possible.
 assert.doesNotThrow(()=>assertTacticalMapIsReplaceable({[PLAN_PREFIX+archived.id]:archived},profile,sha));
 assert.doesNotThrow(()=>assertTacticalMapIsReplaceable({[PLAN_PREFIX+archived.id]:archived},other));
 assert.throws(()=>assertTacticalMapIsReplaceable({[PLAN_PREFIX+'incorrect_key']:archived},other),/Повреждён ключ/);
});

test('GA: airdrop points bound to an image cannot be orphaned, including archived ones',()=>{
 const created=newAirdropPoint(profile,{name:'Original image point',description:'',x:.3,y:.7,mapSha256:sha});
 const archived=created;
 assert.throws(()=>assertTacticalMapIsReplaceable({[AIRDROP_POINT_PREFIX+archived.id]:archived},profile),/точкой аирдропа/);
 assert.doesNotThrow(()=>assertTacticalMapIsReplaceable({[AIRDROP_POINT_PREFIX+archived.id]:archived},profile,sha));
 const independent=newAirdropPoint(profile,{name:'No image point',description:'',x:.4,y:.6,mapSha256:''});
 assert.doesNotThrow(()=>assertTacticalMapIsReplaceable({[AIRDROP_POINT_PREFIX+independent.id]:independent},profile));
});

test('GA: the shared tactical write lock serializes writes and recovers after rejection',async()=>{
 const steps=[];
 let release;const barrier=new Promise(resolve=>{release=resolve;});
 const first=withTacticalWriteLock(async()=>{steps.push('start map');await barrier;steps.push('finish map');});
 const second=withTacticalWriteLock(async()=>{steps.push('start plan');});
 await Promise.resolve();assert.deepEqual(steps,['start map']);
 release();await Promise.all([first,second]);
 assert.deepEqual(steps,['start map','finish map','start plan']);
 await assert.rejects(withTacticalWriteLock(async()=>{throw Error('quota');}),/quota/);
 assert.equal(await withTacticalWriteLock(async()=>42),42);
});

test('GA: replay on a single RP date reflects each capture in order, not all at once',async()=>{
 const territory=newTerritory(profile,{name:'Territory',region:'',ownerType:'family',ownerId:groupA.id,notes:''});
 let first=newCrimeEvent(profile,{title:'Capture',eventKind:'capture',territoryId:territory.id,date:'2026-11-19',attackerType:'organization',attackerId:groupB.id,defenderType:'family',defenderId:groupA.id,notes:''});
 first=changeCrimeEvent(first,'finish',{winner:'attacker'});
 await new Promise(resolve=>setTimeout(resolve,8));
 let second=newCrimeEvent(profile,{title:'Retake',eventKind:'capture',territoryId:territory.id,date:'2026-11-19',attackerType:'family',attackerId:groupA.id,defenderType:'organization',defenderId:groupB.id,notes:''});
 second=changeCrimeEvent(second,'finish',{winner:'attacker'});
 const report=buildTacticalAnalytics({territories:[territory],operations:[first,second],families:[groupA],organizations:[groupB]},profile);
 assert.equal(report.events.length,2);
 assert.equal(tacticalReplayFrame(report,-1).owners[territory.id].id,groupA.id);
 assert.equal(tacticalReplayFrame(report,0).owners[territory.id].id,groupB.id);
 assert.equal(tacticalReplayFrame(report,1).owners[territory.id].id,groupA.id);
 assert.equal(report.stats.captures,2);
});
