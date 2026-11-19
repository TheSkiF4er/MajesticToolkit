import test from 'node:test';
import assert from 'node:assert/strict';
import {TACTICAL_UI_KEY,TACTICAL_TABS,cleanTacticalUI,changeTacticalPreference,changeTacticalRecord,tacticalSnapshot} from '../src/lib/tactical-workspace-core.mjs';
import {newTerritory,newCrimeEvent,changeCrimeEvent} from '../src/lib/crime-core.mjs';
import {defaultState,savePreferences,validateState,makeBackup,parseBackup} from '../src/lib/model.mjs';
const p='profile_test_221',other='profile_other_221',groupId='organization_221',familyId='family_test_221';
const group={id:groupId,profileId:p,name:'<img src=x onerror=alert(1)>',description:'Harbor',members:[],archived:false};
const family={id:familyId,profileId:p,name:'Northern Family',tag:'NF',members:[{player:'Pilot QA',active:true}],archived:false};
const territory=newTerritory(p,{name:'Harbor Sector',region:'North',notes:'West dock',ownerType:'family',ownerId:familyId});
const event=newCrimeEvent(p,{title:'Harbor cap',eventKind:'capture',territoryId:territory.id,date:'2026-11-18',attackerType:'organization',attackerId:groupId,defenderType:'family',defenderId:familyId,notes:'Night event'});
const finished=changeCrimeEvent(event,'finish',{winner:'attacker'});
const all={territories:[territory],operations:[event],families:[family],organizations:[group]};
test('preferences validate tabs, filters and profile scope without changing source data',()=>{
 assert.equal(TACTICAL_UI_KEY,'mtTacticalWorkspaceV221');assert.equal(TACTICAL_TABS.length,10);
 assert.deepEqual(cleanTacticalUI(null,[p]),{tabs:{},queries:{},filters:{},recent:[],favorites:[]});
 let prefs=changeTacticalPreference(null,p,'tab','events',[p,other]);prefs=changeTacticalPreference(prefs,p,'filter','planned',[p,other]);prefs=changeTacticalPreference(prefs,p,'query','a'.repeat(240),[p,other]);
 assert.equal(prefs.queries[p].length,140);assert.equal(prefs.tabs[p],'events');assert.equal(prefs.filters[p],'planned');
 assert.throws(()=>changeTacticalPreference(prefs,p,'tab','invalid',[p]));assert.throws(()=>changeTacticalPreference(prefs,p,'filter','unknown',[p]));assert.throws(()=>changeTacticalPreference(prefs,'missing_profile','tab','events',[p]));
 assert.equal(cleanTacticalUI(prefs,[other]).tabs[p],undefined);
});
test('favorites and recent records remain unique, profile-scoped and bounded',()=>{
 let prefs=null;for(let i=0;i<3;i++)prefs=changeTacticalRecord(prefs,p,'event',event.id,'open',[p,other]);
 assert.equal(prefs.recent.length,1);assert.equal(prefs.recent[0].id,event.id);
 prefs=changeTacticalRecord(prefs,p,'territory',territory.id,'favorite',[p,other]);assert.equal(prefs.favorites.length,1);
 prefs=changeTacticalRecord(prefs,p,'territory',territory.id,'favorite',[p,other]);assert.equal(prefs.favorites.length,0);
 assert.throws(()=>changeTacticalRecord(prefs,p,'event','!foreign','open',[p]));assert.throws(()=>changeTacticalRecord(prefs,other,'unknown',territory.id,'open',[p,other]));
 const polluted={...prefs,recent:[{profileId:p,kind:'event',id:event.id},{profileId:p,kind:'event',id:event.id},{profileId:'profile_unrelated',kind:'family',id:familyId}],favorites:[{profileId:p,kind:'family',id:familyId},{profileId:p,kind:'family',id:familyId}]};
 const clean=cleanTacticalUI(polluted,[p]);assert.equal(clean.recent.length,1);assert.equal(clean.favorites.length,1);
 assert.equal(cleanTacticalUI(polluted,[other]).recent.length,0);
});
test('real Crime & Territory data, group names and planned event deadlines drive the dashboard',()=>{
 const snap=tacticalSnapshot(all,p,cleanTacticalUI(), '2026-11-19');
 assert.deepEqual(snap.stats,{territories:1,planned:1,overdue:1,completed:0,families:1,organizations:1});
 assert.equal(snap.records.length,4);assert.equal(snap.planned[0].id,event.id);
 assert.equal(snap.summary.territories[0].owner.id,familyId);
 assert.equal(snap.records.find(x=>x.kind==='territory').detail.includes('Northern Family'),true);
 assert.equal(snap.records.find(x=>x.kind==='event').search.includes('Night event'),true);
 assert.equal(snap.nameOf('organization',groupId),group.name);
});
test('completed captures update ownership while preserving historical source records',()=>{
 const snap=tacticalSnapshot({...all,operations:[finished]},p,cleanTacticalUI(), '2026-11-19');
 assert.equal(snap.stats.completed,1);assert.equal(snap.stats.planned,0);
 assert.equal(snap.summary.territories[0].owner.id,groupId);
 assert.equal(snap.summary.groups.find(x=>x.id===groupId).wins,1);
 assert.equal(territory.initialOwner.id,familyId);
});
test('query, status filters and recent/favorite joins use active-profile records only',()=>{
 let ui=changeTacticalPreference(null,p,'query','Pilot QA',[p,other]);
 let snap=tacticalSnapshot(all,p,ui,'2026-11-19');assert.deepEqual(snap.matched.map(x=>x.kind),['family']);
 ui=changeTacticalPreference(ui,p,'query','Harbor',[p,other]);ui=changeTacticalPreference(ui,p,'filter','completed',[p,other]);
 snap=tacticalSnapshot(all,p,ui,'2026-11-19');assert.deepEqual(snap.matched.map(x=>x.kind),['territory','organization']);
 ui=changeTacticalPreference(ui,p,'filter','overdue',[p,other]);assert.equal(tacticalSnapshot(all,p,ui,'2026-11-19').matched.some(x=>x.kind==='event'),true);assert.equal(tacticalSnapshot(all,p,ui,'2026-11-18').matched.some(x=>x.kind==='event'),false);
 ui=changeTacticalRecord(ui,p,'event',event.id,'open',[p,other]);ui=changeTacticalRecord(ui,p,'family',familyId,'favorite',[p,other]);
 assert.equal(tacticalSnapshot(all,p,ui).recent.length,1);assert.equal(tacticalSnapshot(all,p,ui).favorites.length,1);
 assert.equal(tacticalSnapshot(all,other,ui).records.length,0);assert.equal(tacticalSnapshot(all,other,ui).recent.length,0);
 const gone=tacticalSnapshot({...all,operations:[]},p,ui);assert.equal(gone.recent.length,0);
});
test('polluted preferences are sanitized and never expose other profile data',()=>{
 const polluted={tabs:{[p]:'__proto__',[other]:'overview'},queries:{[p]:'<script>alert(1)</script>'},filters:{[p]:'invalid'},recent:[{profileId:other,kind:'organization',id:groupId}]};
 const ui=cleanTacticalUI(polluted,[p]);assert.equal(ui.tabs[p],undefined);assert.equal(ui.filters[p],undefined);assert.equal(ui.recent.length,0);
 const snap=tacticalSnapshot(all,p,ui);assert.equal(snap.matched.length,0); // literal query does not match any source
 assert.equal(snap.records.length,4);
});

test('Tactical Toolkit is a valid persisted start page without changing old backup format',()=>{
 const state=savePreferences(defaultState(),{startPage:'tactical'});assert.equal(validateState(state).preferences.startPage,'tactical');
 assert.equal(parseBackup(makeBackup(state)).preferences.startPage,'tactical');
});
