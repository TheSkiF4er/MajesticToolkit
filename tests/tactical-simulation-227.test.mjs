import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createPlan,mutatePlan,cleanPlan} from '../src/lib/tactical-planning-core.mjs';
import {runTacticalSimulation,normalizeSimulationSettings,createTacticalSimulation,cleanTacticalSimulation,compareTacticalSimulations,SIMULATION_PREFIX,SIMULATION_LIMITS} from '../src/lib/tactical-simulation-core.mjs';
const p='profile_simulation_227',other='other_simulation_227',sha='a'.repeat(64),map={width:1000,height:600};
function plan(){let x=createPlan(p,{title:'Test RP map',mapSha256:sha});
 for(const t of [{id:'point_start_001',name:'Start A',kind:'rally',x:.1,y:.1},{id:'point_end_002',name:'End A',kind:'objective',x:.9,y:.9},{id:'point_start_003',name:'Start B',kind:'rally',x:.1,y:.9},{id:'point_end_004',name:'End B',kind:'objective',x:.9,y:.1}])x=mutatePlan(x,'add-point',{...t,squadId:''});
 x=mutatePlan(x,'add-route',{id:'route_alpha_001',name:'Alpha',pointIds:['point_start_001','point_end_002'],speed:100,squadId:''});
 x=mutatePlan(x,'add-route',{id:'route_bravo_002',name:'Bravo',pointIds:['point_start_003','point_end_004'],speed:100,squadId:''});return x;
}
const defaults={speedMultiplier:1,departureMinutes:0,waypointWaitMinutes:0,collisionRadiusPixels:12,speedVariation:0,seed:5,iterations:1};
test('movement simulation computes two intersecting RP routes and exact timings',()=>{
 const result=runTacticalSimulation(plan(),defaults,map),first=result.primary;
 assert.equal(first.routes.length,2);assert.ok(first.totalDistancePixels>1800&&first.totalDistancePixels<2200);
 assert.equal(first.conflictCount,1);assert.equal(first.conflicts[0].distancePixels,0);
 assert.ok(first.durationMinutes>9&&first.durationMinutes<11);
 assert.equal(result.statistics.durationMedian,first.durationMinutes);
});
test('time-spaced routes do not collide, even when their geometric lines intersect',()=>{
 const x=plan();const settings={...defaults,departureMinutes:0};const same=runTacticalSimulation(x,settings,map);
 assert.equal(same.primary.conflictCount,1);
 let moved=mutatePlan(x,'edit-route',{...x.state.routes[1],speed:20});
 const different=runTacticalSimulation(moved,settings,map);assert.equal(different.primary.conflictCount,0);
});
test('speed, dwell and departure shift time but keep route distance',()=>{
 const x=plan(),a=runTacticalSimulation(x,defaults,map),b=runTacticalSimulation(x,{...defaults,speedMultiplier:2,departureMinutes:30,waypointWaitMinutes:2},map);
 assert.equal(a.primary.totalDistancePixels,b.primary.totalDistancePixels);
 assert.ok(b.primary.durationMinutes>30&&b.primary.durationMinutes<a.primary.durationMinutes+30);
 assert.equal(b.primary.routes[0].startedMinute,30);
});
test('repeated seeded Monte Carlo simulations are identical and report bounded quantiles',()=>{
 const x=plan(),settings={...defaults,iterations:50,speedVariation:.2,seed:123456};
 const a=runTacticalSimulation(x,settings,map),b=runTacticalSimulation(x,settings,map);
 assert.deepEqual(a,b);assert.equal(a.statistics.runs,50);assert.ok(a.statistics.durationP10<=a.statistics.durationMedian&&a.statistics.durationMedian<=a.statistics.durationP90);
 assert.ok(a.statistics.runsWithConflicts<=50);
 assert.notDeepEqual(a,runTacticalSimulation(x,{...settings,seed:123457},map));
});
test('plan snapshots and immutable outcomes reject tampering',()=>{
 const x=plan(),run=createTacticalSimulation(p,x,'Scenario 1',defaults,map);assert.equal(cleanTacticalSimulation(run).id,run.id);
 const edited=structuredClone(run);edited.result.primary.conflictCount=23;assert.throws(()=>cleanTacticalSimulation(edited),/изменён|повреждён/);
 const forged=structuredClone(run);forged.plan.state.points[0].x=.3;assert.throws(()=>cleanTacticalSimulation(forged),/повреждены/);
 const foreign=structuredClone(run);foreign.profileId=other;assert.throws(()=>cleanTacticalSimulation(foreign),/профилю/);
 assert.equal(cleanPlan(x).state.points[0].x,.1);
});
test('cross-profile or cross-map comparisons fail; original plan remains unchanged',()=>{
 const a=createTacticalSimulation(p,plan(),'А',defaults,map),b=createTacticalSimulation(p,plan(),'Б',{...defaults,speedMultiplier:1.5},map);
 const result=compareTacticalSimulations(a,b);assert.ok(result.deltaDurationMinutes<0);
 const different=structuredClone(b);different.profileId=other;assert.throws(()=>compareTacticalSimulations(a,different));
 const changed=plan();changed.state.mapSha256='b'.repeat(64); // invalid history
 assert.throws(()=>createTacticalSimulation(p,changed,'X',defaults,map));
});
test('invalid settings, oversized plans and invalid map reject before persistence',()=>{
 for(const bad of [{speedMultiplier:0},{seed:-1},{iterations:81},{speedVariation:.6},{collisionRadiusPixels:201},{waypointWaitMinutes:Infinity},{departureMinutes:NaN}])assert.throws(()=>normalizeSimulationSettings(bad));
 assert.throws(()=>runTacticalSimulation(plan(),defaults,{width:0,height:600}),/размер/);
 assert.throws(()=>createTacticalSimulation(other,plan(),'X',defaults,map),/профиля/);
 assert.equal(SIMULATION_LIMITS.perProfile,60);
});
const mem=new Map();
globalThis.browser={storage:{local:{async get(k){if(k===null)return Object.fromEntries([...mem].map(([key,v])=>[key,structuredClone(v)]));return Object.fromEntries((Array.isArray(k)?k:[k]).filter(key=>mem.has(key)).map(key=>[key,structuredClone(mem.get(key))]));},async set(rows){for(const [k,v] of Object.entries(rows))mem.set(k,structuredClone(v));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])mem.delete(key);}}}};
const store=await import('../src/lib/tactical-simulation-store.mjs');
beforeEach(()=>mem.clear());
test('strict list, export, deletion and profile cleanup of saved runs',async()=>{
 const row=createTacticalSimulation(p,plan(),'A',defaults,map);mem.set(SIMULATION_PREFIX+row.id,row);
 assert.equal((await store.listTacticalSimulations(p)).length,1);
 assert.equal((await store.listTacticalSimulations(other)).length,0);
 assert.equal((await store.exportTacticalSimulations(p)).runs.length,1);
 await assert.rejects(store.deleteTacticalSimulation(other,row.id),/не найдена/);
 await store.deleteTacticalSimulation(p,row.id);assert.equal((await store.listTacticalSimulations(p)).length,0);
 const active=createTacticalSimulation(p,plan(),'B',defaults,map);mem.set(SIMULATION_PREFIX+active.id,active);
 assert.equal(await store.clearOrphanTacticalSimulations([other]),1);
 assert.equal((await store.listTacticalSimulations()).length,0);
});
test('tampered stored simulation and mismatched key fail closed',async()=>{
 const row=createTacticalSimulation(p,plan(),'Bad',defaults,map);mem.set(SIMULATION_PREFIX+row.id,{...row,result:{...row.result,statistics:{...row.result.statistics,runs:99}}});
 await assert.rejects(store.listTacticalSimulations(p),/изменён|повреждён/);
 mem.clear();mem.set(SIMULATION_PREFIX+'wrong_record_id',row);await assert.rejects(store.listTacticalSimulations(),/ключ/);
});
