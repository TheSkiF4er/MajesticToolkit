import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {newAirdropPoint,changeAirdropPoint,newAirdropEvent,changeAirdropEvent,cleanAirdropPoint,cleanAirdropEvent,validateAirdrops,airdropTimer,airdropCsv,airdropPackage,parseAirdropPackage,AIRDROP_POINT_PREFIX,AIRDROP_EVENT_PREFIX} from '../src/lib/tactical-airdrop-core.mjs';
const profile='profile_airdrop_test',other='other_airdrop_profile',mapSha='f'.repeat(64),time='2026-11-19T12:00:00.000Z';
const point={name:'Северный аэродром',description:'Зона RP',x:.34,y:.57,mapSha256:mapSha};
// Store lifecycle tests use a map-independent point; native IndexedDB bindings are validated by the GA browser E2E.
const unboundPoint={...point,mapSha256:''};
const fields=(id)=>({title:'Тестовый аирдроп',pointId:id,scheduledAt:time,durationMinutes:30,notes:'Свидетель'});
const mem=new Map(),clone=structuredClone;
globalThis.browser={storage:{local:{async get(k){if(k===null)return Object.fromEntries([...mem].map(([key,value])=>[key,clone(value)]));return Object.fromEntries((Array.isArray(k)?k:[k]).filter(x=>mem.has(x)).map(x=>[x,clone(mem.get(x))]));},async set(rows){for(const [key,v] of Object.entries(rows))mem.set(key,clone(v));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])mem.delete(key);}}}};
const store=await import('../src/lib/tactical-airdrop-store.mjs');
beforeEach(()=>mem.clear());
test('point creation, editing, archiving, immutable replay and coordinates',()=>{
 const p=newAirdropPoint(profile,point);assert.equal(cleanAirdropPoint(p).name,point.name);
 assert.throws(()=>newAirdropPoint(profile,{...point,x:1.2}),/Координаты/);
 assert.throws(()=>newAirdropPoint(profile,{...point,mapSha256:'broken'}),/подложки/);
 const edited=changeAirdropPoint(p,'edit',{...point,name:'Аэропорт'});assert.equal(edited.name,'Аэропорт');
 const archived=changeAirdropPoint(edited,'archive',{archived:true});assert.equal(archived.archived,true);
 assert.throws(()=>changeAirdropPoint(archived,'edit',point));
 const forged=clone(edited);forged.history[0].data.x=-1;assert.throws(()=>cleanAirdropPoint(forged));
});
test('complete event lifecycle: participants, timers, claims and historical result',()=>{
 const p=newAirdropPoint(profile,point);let event=newAirdropEvent(profile,fields(p.id));
 event=changeAirdropEvent(event,'participant-add',{name:'Player One'});event=changeAirdropEvent(event,'participant-add',{name:'Player Two'});
 assert.equal(event.participants.length,2);assert.throws(()=>changeAirdropEvent(event,'participant-add',{name:'player one'}),/зарегистрирован/);
 event=changeAirdropEvent(event,'participant-remove',{name:'Player Two'});assert.deepEqual(event.participants,['Player One']);
 assert.equal(airdropTimer(event,Date.parse(time)-10000).seconds,10);
 event=changeAirdropEvent(event,'start');assert.equal(event.status,'active');
 event=changeAirdropEvent(event,'claim',{winner:'Player One',reward:'Loot box'});assert.equal(event.winner,'Player One');
 event=changeAirdropEvent(event,'finish',{result:'Delivered'});assert.equal(event.status,'completed');assert.equal(event.history.length,7);
 assert.throws(()=>changeAirdropEvent(event,'start'),/переход/);
 assert.equal(airdropTimer(event).seconds,0);
 const rows=validateAirdrops([p],[event],[profile]);assert.equal(rows.events.length,1);
});
test('cancellation and invalid status transitions are rejected',()=>{
 const p=newAirdropPoint(profile,point),event=newAirdropEvent(profile,fields(p.id));
 assert.throws(()=>changeAirdropEvent(event,'claim',{winner:'Someone',reward:''}),/переход/);
 assert.throws(()=>changeAirdropEvent(event,'cancel',{reason:''}),/Причина/);
 const cancelled=changeAirdropEvent(event,'cancel',{reason:'Weather'});assert.equal(cancelled.status,'cancelled');
 assert.throws(()=>changeAirdropEvent(cancelled,'finish',{}),/переход/);
});
test('reference checks, profile boundaries and duplicate point names',()=>{
 const p=newAirdropPoint(profile,point),sameName=newAirdropPoint(profile,point),event=newAirdropEvent(profile,fields(p.id));
 assert.throws(()=>validateAirdrops([p,sameName],[],[profile]),/название/);
 assert.throws(()=>validateAirdrops([],[event],[profile]),/отсутствует/);
 assert.throws(()=>validateAirdrops([p],[{...event,profileId:other}],null),/профиле/);
 assert.throws(()=>validateAirdrops([p],[event],[other]),/Чужой/);
});
test('store protects linked locations, rejects duplicate records and isolates profiles',async()=>{
 const p=await store.addAirdropPoint(profile,unboundPoint),otherPoint=await store.addAirdropPoint(other,{...unboundPoint,name:'Запад'});
 const event=await store.addAirdropEvent(profile,fields(p.id));
 await assert.rejects(store.updateAirdropPoint(p.id,profile,'edit',{...point,x:.2}),/перемещать/);
 await assert.rejects(store.updateAirdropPoint(p.id,profile,'archive',{archived:true}),/незавершённые/);
 await assert.rejects(store.addAirdropEvent(other,fields(p.id)),/недоступна/);
 await assert.rejects(store.addAirdropPoint(profile,unboundPoint),/название/);
 await store.updateAirdropEvent(event.id,profile,'cancel',{reason:'Перенос'});
 const archived=await store.updateAirdropPoint(p.id,profile,'archive',{archived:true});assert.equal(archived.archived,true);
 const a=await store.listAirdrops(profile),b=await store.listAirdrops(other);assert.equal(a.events.length,1);assert.equal(b.events.length,0);assert.equal(b.points[0].id,otherPoint.id);
});
test('JSON export/import safely replaces only one profile and keeps other profiles',async()=>{
 const p=await store.addAirdropPoint(profile,unboundPoint),event=await store.addAirdropEvent(profile,fields(p.id));
 const foreign=await store.addAirdropPoint(other,{...unboundPoint,name:'Other'});
 const pack=airdropPackage([p,foreign],[event],profile);
 assert.equal(parseAirdropPackage(pack,profile).points.length,1);
 assert.throws(()=>parseAirdropPackage(pack,other),/профилю/);
 await store.importAirdrops(profile,{...pack,points:[],events:[]});
 const rows=await store.importAirdrops(profile,pack);assert.equal(rows.events.length,1);
 assert.equal((await store.listAirdrops(other)).points[0].id,foreign.id);
 assert.match(airdropCsv(rows.points,rows.events,profile),/Тестовый аирдроп/);
});
test('tampered storage key and replay log fail closed',async()=>{
 const p=await store.addAirdropPoint(profile,unboundPoint);mem.set(AIRDROP_POINT_PREFIX+'forged_key',p);
 await assert.rejects(store.listAirdrops(),/ключ/);mem.delete(AIRDROP_POINT_PREFIX+'forged_key');
 const event=await store.addAirdropEvent(profile,fields(p.id)),bad=clone(event);bad.history.push({...bad.history[0]});
 mem.set(AIRDROP_EVENT_PREFIX+event.id,bad);await assert.rejects(store.listAirdrops(),/порядок/);
});
test('remove expired profile records while preserving active profile',async()=>{
 await store.addAirdropPoint(profile,unboundPoint);await store.addAirdropPoint(other,{...unboundPoint,name:'Other'});
 assert.equal(await store.clearOrphanAirdrops([profile]),1);assert.equal((await store.listAirdrops()).points.length,1);
});
