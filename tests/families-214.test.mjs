import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {FAMILY_PREFIX,newFamily,applyFamily,cleanFamily,validateFamilies,familyMatchStats} from '../src/lib/family-core.mjs';
const mem=new Map(),clone=structuredClone;
globalThis.browser={storage:{local:{
 async get(k){if(k===null)return Object.fromEntries([...mem].map(([id,v])=>[id,clone(v)]));const ids=Array.isArray(k)?k:[k];return Object.fromEntries(ids.filter(id=>mem.has(id)).map(id=>[id,clone(mem.get(id))]));},
 async set(rows){for(const [k,v] of Object.entries(rows))mem.set(k,clone(v));},
 async remove(k){for(const id of Array.isArray(k)?k:[k])mem.delete(id);}
}}};
const store=await import('../src/lib/family-store.mjs');
const backup=await import('../src/lib/justice-backup.mjs');
const state=defaultState(),profile=state.activeProfileId;
beforeEach(()=>mem.clear());
const basic={name:'Family QA',tag:'FQA',description:'Проверка истории'};
const event=(f,kind,extra)=>applyFamily(f,kind,{reason:'Контроль',...extra});
test('family registry persists rank creation, joins, promotions, exits and immutable history',async()=>{
 let family=await store.addFamily(profile,basic);
 assert.equal(family.ranks.length,2);
 const original=family.events.map(x=>x.id);
 family=await store.updateFamily(family.id,profile,'rank-add',{rankName:'Заместитель',priority:'2',reason:'Назначить ранг'});
 const rank=family.ranks.find(x=>x.name==='Заместитель');
 family=await store.updateFamily(family.id,profile,'join',{player:'Player Alpha',rankId:family.ranks.find(r=>r.name==='Участник').id,date:'2026-11-18',reason:'Вступление'});
 const member=family.members.find(m=>m.player==='Player Alpha');
 family=await store.updateFamily(family.id,profile,'rank-change',{memberId:member.id,rankId:rank.id,date:'2026-11-19',reason:'Повышение'});
 assert.equal(family.members[0].rankId,rank.id);
 await assert.rejects(store.updateFamily(family.id,profile,'rank-remove',{rankId:rank.id}),/используется/);
 family=await store.updateFamily(family.id,profile,'leave',{memberId:member.id,date:'2026-11-20',reason:'Заявление'});
 assert.equal(family.members[0].active,false);
 family=await store.updateFamily(family.id,profile,'rank-remove',{rankId:rank.id,reason:'Оптимизация'});
 assert.equal(family.ranks.length,2);
 assert.deepEqual(family.events.slice(0,3).map(x=>x.id),original);
 assert.equal((await store.getFamily(family.id,profile)).members.length,1);
 await assert.rejects(store.removeFamily(family.id,profile),/Архивируйте/);
 family=await store.updateFamily(family.id,profile,'archive',{archived:true});
 await assert.rejects(store.updateFamily(family.id,profile,'join',{player:'New',rankId:family.ranks[0].id,date:'2026-11-20'}),/архив|Нельзя|неверный ранг|раньше предыдущего/i);
 family=await store.updateFamily(family.id,profile,'archive',{archived:false});
 assert.equal(family.archived,false);
});
test('duplicate names and active nicknames are rejected, profiles are isolated',async()=>{
 const f=await store.addFamily(profile,basic);
 await assert.rejects(store.addFamily(profile,{...basic,name:'family qa'}),/существует/);
 await assert.rejects(store.getFamily(f.id,'another-profile'));
 await assert.rejects(store.updateFamily(f.id,'another-profile','archive',{archived:true}));
 const other=await store.addFamily('another-profile',basic);assert.equal((await store.listFamilies('another-profile')).length,1);
 assert.equal(other.profileId,'another-profile');
 let r=await store.updateFamily(f.id,profile,'join',{player:'Duplicate',rankId:f.ranks[0].id,date:'2026-11-18'});
 await assert.rejects(store.updateFamily(f.id,profile,'join',{player:'duplicate',rankId:f.ranks[0].id,date:'2026-11-18'}),/состоит/);
 r=await store.updateFamily(f.id,profile,'family-edit',{name:'New Family',tag:'NEW',description:''});assert.equal(r.name,'New Family');
 assert.equal((await store.listFamilies(profile)).length,1);
});
test('legacy match aliases map only by explicit user action, old records stay untouched',async()=>{
 let f=await store.addFamily(profile,basic);
 const old={type:'match',profileId:profile,family:'Old Family',result:'win',kills:8,deaths:2,damage:900};
 assert.equal(familyMatchStats([f],[old]).get(f.id).matches,0);
 f=await store.updateFamily(f.id,profile,'alias-add',{alias:'Old Family'});
 const stats=familyMatchStats([f],[old]).get(f.id);
 assert.equal(stats.matches,1);assert.equal(stats.wins,1);assert.equal(stats.kills,8);assert.equal(stats.damage,900);
 assert.equal(old.family,'Old Family');
 await assert.rejects(store.addFamily(profile,{name:'New One'}).then(v=>store.updateFamily(v.id,profile,'alias-add',{alias:'Old Family'})),/используется/);
 f=await store.updateFamily(f.id,profile,'alias-remove',{alias:'old family'});
 assert.equal(familyMatchStats([f],[old]).get(f.id).matches,0);
});
test('corrupt events, unknown rank, duplicate ID, profile and malformed dates are blocked',()=>{
 const f=newFamily(profile,basic),rank=f.ranks[0].id;
 assert.throws(()=>event(f,'join',{player:'Who',rankId:'missing_id',date:'2026-11-18'}));
 assert.throws(()=>event(f,'join',{player:'Who',rankId:rank,date:'2026-02-30'}));
 assert.throws(()=>event(f,'rank-add',{rankName:'Глава',priority:2}));
 assert.equal(event(f,'rank-remove',{rankId:rank}).ranks.length,1);
 const poisoned=clone(f);poisoned.events[0].name='<script>'; // text is allowed, but only escaped at display
 assert.equal(cleanFamily(poisoned).name,'<script>');
 const forged=clone(f);forged.events.push({...f.events[0]});assert.throws(()=>cleanFamily(forged),/Дублирование/);
 assert.throws(()=>validateFamilies([f,f]));
 assert.throws(()=>validateFamilies([f],['other-profile']));
 const noRank=clone(f);noRank.events[1].rankId='???';assert.throws(()=>cleanFamily(noRank));
});
test('replacement rolls back interrupted partial writes and reports damaged storage',async()=>{
 const first=await store.addFamily(profile,basic),second=await store.addFamily(profile,{name:'Second Family'});
 const original=globalThis.browser.storage.local.set;let n=0;
 globalThis.browser.storage.local.set=async rows=>{await original(rows);if(++n===1)throw Error('storage interrupted');};
 try{await assert.rejects(store.replaceFamilies([first],[profile]),/interrupted/);}finally{globalThis.browser.storage.local.set=original;}
 assert.deepEqual((await store.listFamilies(profile)).map(x=>x.id).sort(),[first.id,second.id].sort());
 mem.set(FAMILY_PREFIX+'malformed', {profileId:profile});
 await assert.rejects(store.listFamilies(),/Повреждённая|Неверный идентификатор/);
});
test('backup v19 round trip preserves rosters and rejects foreign profile and forged history',async()=>{
 let f=await store.addFamily(profile,basic);f=await store.updateFamily(f.id,profile,'join',{player:'Member',rankId:f.ranks[0].id,date:'2026-11-18'});
 const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const punishment={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},operations={version:1,profiles:[]};
 const txt=await backup.makeBackupV19(args,punishment,sections,registry,operations,[],null,[],[],[f]);
 const parsed=await backup.parseBackupV19(txt,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.schemaVersion,19);assert.equal(parsed.families[0].members[0].player,'Member');
 const forged=JSON.parse(txt);forged.families[0].profileId='foreign-profile';
 await assert.rejects(backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate));
 delete forged.families;const legacy=await backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(legacy.families,null);
});
test('family HTML escapes user text and includes persisted roster and real match stats',async()=>{
 let f=await store.addFamily(profile,{name:'Family <img src=x onerror=alert(1)>',tag:'QA'});
 f=await store.updateFamily(f.id,profile,'join',{player:'<script>Bad</script>',rankId:f.ranks[0].id,date:'2026-11-18'});
 const ui=await import('../src/ui/family-page.mjs');await ui.refreshFamilies();
 const html=ui.familiesSection(state,[{type:'match',profileId:profile,family:f.name,result:'win',kills:2,deaths:1,damage:100}]);
 assert.match(html,/families-root/);assert.match(html,/100/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>Bad/);assert.doesNotMatch(html,/<img src=x/);
});
