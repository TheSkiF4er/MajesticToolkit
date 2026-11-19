import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {newTerritory,changeTerritory,newCrimeEvent,changeCrimeEvent,validateCrime,crimeSummary,crimeCsv,cleanCrimeEvent,cleanTerritory,TERRITORY_PREFIX,CRIME_EVENT_PREFIX} from '../src/lib/crime-core.mjs';
const mem=new Map(),clone=structuredClone;
globalThis.browser={storage:{local:{async get(k){if(k===null)return Object.fromEntries([...mem].map(([key,value])=>[key,clone(value)]));return Object.fromEntries((Array.isArray(k)?k:[k]).filter(x=>mem.has(x)).map(x=>[x,clone(mem.get(x))]));},async set(rows){for(const [key,v] of Object.entries(rows))mem.set(key,clone(v));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])mem.delete(key);}}}};
const [core,crimeStore,families,organizations,backup]=await Promise.all([import('../src/lib/crime-core.mjs'),import('../src/lib/crime-store.mjs'),import('../src/lib/family-store.mjs'),import('../src/lib/organization-store.mjs'),import('../src/lib/justice-backup.mjs')]);
const state=defaultState(),pid=state.activeProfileId,pid2='other_profile_98765';
beforeEach(()=>mem.clear());
async function seeded(){const family=await families.addFamily(pid,{name:'Family QA',tag:'FAM'}),org=await organizations.addOrganization(pid,{name:'Organization QA',type:'criminal'});return {family,org};}
const group=(type,row)=>({type,id:row.id});
const arena=(family)=>({name:'Sector A',region:'North',ownerType:'family',ownerId:family.id,notes:'<script>'});
const battle=(territory,org,family)=>({title:'Capture Alpha',eventKind:'capture',territoryId:territory.id,date:'2026-11-19',attackerType:'organization',attackerId:org.id,defenderType:'family',defenderId:family.id,notes:'Result'});
test('live territory, RP capture, roster statistics, ownership and audit',async()=>{
 const {family,org}=await seeded();let territory=await crimeStore.addTerritory(pid,arena(family));
 let op=await crimeStore.addCrimeEvent(pid,battle(territory,org,family));
 op=await crimeStore.updateCrimeEvent(op.id,pid,'participant-add',{side:'attacker',player:'Player <script>',kills:8,deaths:2,damage:1500});
 await assert.rejects(crimeStore.updateCrimeEvent(op.id,pid,'participant-add',{side:'attacker',player:'player <script>',kills:0,deaths:0,damage:0}),/зарегистрирован/);
 op=await crimeStore.updateCrimeEvent(op.id,pid,'participant-add',{side:'defender',player:'Player Blue',kills:1,deaths:5,damage:700});
 const previousIds=op.events.map(x=>x.id);
 op=await crimeStore.updateCrimeEvent(op.id,pid,'finish',{winner:'attacker',reason:'Протокол завершения'});
 assert.deepEqual(op.events.slice(0,previousIds.length).map(e=>e.id),previousIds);
 await assert.rejects(crimeStore.updateCrimeEvent(op.id,pid,'edit',{title:'overwrite',date:'2026-11-19',notes:''}),/Завершённое/);
 const ledger=await crimeStore.listCrime(),summary=crimeSummary(ledger.territories,ledger.operations,pid,[family],[org]);
 assert.equal(ledger.owners.get(territory.id).id,org.id);assert.equal(summary.groups.find(x=>x.id===org.id).wins,1);assert.equal(summary.players.find(x=>x.player==='Player <script>').damage,1500);
 assert.equal(summary.territories[0].initialOwner.id,family.id);assert.match(crimeCsv(ledger.territories,ledger.operations,pid),/Capture Alpha/);
 territory=await crimeStore.updateTerritory(territory.id,pid,'edit',{name:'Sector B',region:'South',notes:'Updated'});
 assert.equal(territory.name,'Sector B');assert.equal((await crimeStore.loadCrime(pid)).territories.length,1);
 assert.equal((await crimeStore.loadCrime(pid2)).territories.length,0);
 await assert.rejects(organizations.removeOrganization(org.id,pid),/RP-событиях/);
 await assert.rejects(families.removeFamily(family.id,pid),/RP-событиях/);
});
test('capture chain validates actual owner at event date and prevents invalid retrospective edits',async()=>{
 const {family,org}=await seeded(),territory=await crimeStore.addTerritory(pid,arena(family));
 let first=await crimeStore.addCrimeEvent(pid,battle(territory,org,family));first=await crimeStore.updateCrimeEvent(first.id,pid,'finish',{winner:'attacker'});
 const invalid=await crimeStore.addCrimeEvent(pid,{...battle(territory,org,family),date:'2026-11-21'});await assert.rejects(crimeStore.updateCrimeEvent(invalid.id,pid,'finish',{winner:'attacker'}),/Защитник/);
 let second=await crimeStore.addCrimeEvent(pid,{...battle(territory,org,family),date:'2026-11-20',attackerType:'family',attackerId:family.id,defenderType:'organization',defenderId:org.id});
 second=await crimeStore.updateCrimeEvent(second.id,pid,'finish',{winner:'defender'});
 assert.equal((await crimeStore.listCrime()).owners.get(territory.id).id,org.id);
 const forged=clone(second);forged.events.push({...second.events[0]});assert.throws(()=>cleanCrimeEvent(forged));
 await assert.rejects(crimeStore.updateTerritory(territory.id,pid,'archive',{archived:true}),/запланирован/);
});
test('reject invalid input, ownership references and cross-profile foreign keys',async()=>{
 const {family,org}=await seeded(),territory=await crimeStore.addTerritory(pid,arena(family));
 await assert.rejects(crimeStore.addCrimeEvent(pid,{...battle(territory,org,family),attackerType:'family',attackerId:family.id}),/стороны/);
 await assert.rejects(crimeStore.addCrimeEvent(pid,{...battle(territory,org,family),attackerId:'missing_12345'}),/отсутствует/);
 await assert.rejects(crimeStore.addCrimeEvent(pid,{...battle(territory,org,family),date:'2026-02-30'}));
 await assert.rejects(crimeStore.addCrimeEvent(pid2,battle(territory,org,family)),/профиле/);
 const forged=clone(territory);forged.events[0].name='';assert.throws(()=>cleanTerritory(forged));
 assert.throws(()=>validateCrime([territory,territory],[],[pid],[family],[org]),/Дубликат/);
});
test('cancelled and planned events never change ownership; archiving blocks pending operations',async()=>{
 const {family,org}=await seeded(),t=await crimeStore.addTerritory(pid,arena(family));
 const op=await crimeStore.addCrimeEvent(pid,battle(t,org,family));await assert.rejects(crimeStore.updateTerritory(t.id,pid,'archive',{archived:true}),/запланирован/);
 await crimeStore.updateCrimeEvent(op.id,pid,'cancel',{reason:'Перенесено'});
 assert.equal((await crimeStore.listCrime()).owners.get(t.id).id,family.id);
 const archived=await crimeStore.updateTerritory(t.id,pid,'archive',{archived:true});assert.equal(archived.archived,true);
 await assert.rejects(crimeStore.addCrimeEvent(pid,battle(t,org,family)),/архивирована/);
 await crimeStore.updateTerritory(t.id,pid,'archive',{archived:false});
});
test('replacement is rollback safe and rejects tampered references and keys',async()=>{
 const {family,org}=await seeded(),t=await crimeStore.addTerritory(pid,arena(family));
 const previous=globalThis.browser.storage.local.set;let count=0;
 globalThis.browser.storage.local.set=async values=>{await previous(values);if(++count===1)throw Error('interrupted');};
 try{await assert.rejects(crimeStore.replaceCrime([t],[],[pid]),/interrupted/);}finally{globalThis.browser.storage.local.set=previous;}
 assert.equal((await crimeStore.listCrime()).territories.length,1);
 await assert.rejects(crimeStore.replaceCrime([{...t,profileId:pid2}],[],[pid],[ [family],[org] ]),/профиль|отсутствует/);
 mem.set(TERRITORY_PREFIX+'tampered_key',t);await assert.rejects(crimeStore.listCrime(),/ключ/);mem.delete(TERRITORY_PREFIX+'tampered_key');
});
test('Backup v19 carries territories, RP events, rejects damaged chain and preserves old v19 imports',async()=>{
 const {family,org}=await seeded(),t=await crimeStore.addTerritory(pid,arena(family));
 let op=await crimeStore.addCrimeEvent(pid,battle(t,org,family));op=await crimeStore.updateCrimeEvent(op.id,pid,'finish',{winner:'attacker'});
 const m=await import('../src/lib/model.mjs'),prod=await import('../src/lib/productivity-core.mjs'),mon=await import('../src/lib/monitor-core.mjs'),k=await import('../src/lib/knowledge-core.mjs');
 const args=[state,[],[],[],[],[],[],[],prod.defaultProductivity(),[],mon.emptyMonitor(),k.emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const p={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},operations={version:1,profiles:[]};
 const txt=await backup.makeBackupV19(args,p,sections,registry,operations,[],null,[],[],[family],[org],[t],[op]);const parsed=await backup.parseBackupV19(txt,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.territories.length,1);assert.equal(parsed.crimeEvents[0].status,'completed');
 const forged=JSON.parse(txt);forged.crimeEvents[0].events.at(-1).winner='draw'; // draw is valid, but the previous match's owner changes, remains valid
 forged.crimeEvents[0].events.at(-1).winner='invalid';await assert.rejects(backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate));
 delete forged.territories;await assert.rejects(backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate),/Неполная/);
 delete forged.crimeEvents;const old=await backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate);assert.equal(old.territories,null);
});
