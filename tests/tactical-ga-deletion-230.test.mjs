import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlan,mutatePlan,PLAN_PREFIX} from '../src/lib/tactical-planning-core.mjs';
import {newAirdropPoint,changeAirdropPoint,newAirdropEvent,changeAirdropEvent,AIRDROP_POINT_PREFIX,AIRDROP_EVENT_PREFIX} from '../src/lib/tactical-airdrop-core.mjs';
import {newTacticalLink,TACTICAL_LINK_PREFIX} from '../src/lib/tactical-links-core.mjs';
const db=new Map();
globalThis.browser={storage:{local:{
 async get(keys){if(keys===null)return Object.fromEntries(db);const requested=Array.isArray(keys)?keys:[keys];return Object.fromEntries(requested.filter(k=>db.has(k)).map(k=>[k,db.get(k)]));},
 async set(rows){for(const [key,value] of Object.entries(rows))db.set(key,structuredClone(value));},
 async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])db.delete(k);}
}}};
const {deleteTacticalPlan}=await import('../src/lib/tactical-planning-store.mjs');
const {deleteAirdropPoint,deleteAirdropEvent}=await import('../src/lib/tactical-airdrop-store.mjs');
const profile='profile_ga_deletes_230',sha='e'.repeat(64);

test('GA: only archived unreferenced tactical plans are removable',async()=>{
 db.clear();const plan=createPlan(profile,{title:'Base plan',mapSha256:sha});db.set(PLAN_PREFIX+plan.id,plan);
 await assert.rejects(deleteTacticalPlan(profile,plan.id),/архив/);
 const archived=mutatePlan(plan,'archive',{archived:true});db.set(PLAN_PREFIX+plan.id,archived);
 const linked=newTacticalLink(profile,{entityType:'plan',entityId:plan.id,sourceType:'document',sourceId:'document_test_230'});
 db.set(TACTICAL_LINK_PREFIX+linked.id,linked);
 await assert.rejects(deleteTacticalPlan(profile,plan.id),/связан/);
 db.delete(TACTICAL_LINK_PREFIX+linked.id);
 assert.equal((await deleteTacticalPlan(profile,plan.id)).id,plan.id);
 assert.equal(db.has(PLAN_PREFIX+plan.id),false);
});

test('GA: airdrop deletion never leaves event-point or evidence links dangling',async()=>{
 db.clear();const point=newAirdropPoint(profile,{name:'Drop Zone',x:.5,y:.5,mapSha256:sha});
 db.set(AIRDROP_POINT_PREFIX+point.id,point);
 const event=newAirdropEvent(profile,{title:'Drop',pointId:point.id,scheduledAt:'2026-11-19T10:00:00.000Z',durationMinutes:30});
 db.set(AIRDROP_EVENT_PREFIX+event.id,event);
 await assert.rejects(deleteAirdropEvent(profile,event.id),/завершите или отмените/);
 const cancelled=changeAirdropEvent(event,'cancel',{reason:'No event'});db.set(AIRDROP_EVENT_PREFIX+event.id,cancelled);
 const link=newTacticalLink(profile,{entityType:'airdrop',entityId:event.id,sourceType:'evidence',sourceId:'evidence_test_230'});
 db.set(TACTICAL_LINK_PREFIX+link.id,link);
 await assert.rejects(deleteAirdropEvent(profile,event.id),/связан/);
 const archived=changeAirdropPoint(point,'archive',{archived:true});db.set(AIRDROP_POINT_PREFIX+point.id,archived);
 await assert.rejects(deleteAirdropPoint(profile,point.id),/используется/);
 db.delete(TACTICAL_LINK_PREFIX+link.id);
 await deleteAirdropEvent(profile,event.id);
 await deleteAirdropPoint(profile,point.id);
 assert.equal(db.size,0);
});
