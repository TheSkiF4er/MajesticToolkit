import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,validateState,makeBackup,parseBackup} from '../src/lib/model.mjs';
import {EVIDENCE_TABS,EVIDENCE_PERIODS,cleanEvidenceKnowledge,defaultEvidenceKnowledge} from '../src/lib/evidence-knowledge-prefs.mjs';
import {evidenceKnowledgeSnapshot,evidenceKnowledgeSection} from '../src/ui/evidence-knowledge-center.mjs';
import {makeBackupV17,parseBackupV17} from '../src/lib/dossier-backup.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import '../src/lib/forum-core.js';
import '../src/lib/complaints-core.js';
const C=globalThis.RPNComplaints;
const stamp='2026-11-17T17:00:00.000Z';
const profile={...defaultState().profiles[0],id:'profile_known_1234',server:'Alpha'};
const bundle={cases:[],vault:[],sources:[],knowledge:emptyKnowledge(),registry:{records:[]}};

test('1.9.0 strict per-profile Evidence & Knowledge preferences and routes',()=>{
 assert.deepEqual(EVIDENCE_TABS,['overview','vault','timeline','library','graph','dossier']);
 assert.deepEqual(EVIDENCE_PERIODS,[7,14,30,90]);
 assert.deepEqual(defaultEvidenceKnowledge(),{tab:'overview',days:30,caseId:''});
 assert.deepEqual(cleanEvidenceKnowledge({tab:'dossier',days:90,caseId:'case_123456',unexpected:'ignored'}),{tab:'dossier',days:90,caseId:'case_123456'});
 for(const bad of [null,[],{}, {tab:'injected',days:7,caseId:''},{tab:'overview',days:'7',caseId:''},{tab:'timeline',days:30,caseId:'../../secret'},{tab:'overview',days:30,caseId:42}])assert.throws(()=>cleanEvidenceKnowledge(bad));
 const s=defaultState();s.profiles[0].evidenceKnowledge={tab:'graph',days:14,caseId:'case_known_1234',extra:'ignore'};
 const valid=validateState(s);assert.deepEqual(valid.profiles[0].evidenceKnowledge,{tab:'graph',days:14,caseId:'case_known_1234'});
 assert.deepEqual(parseBackup(makeBackup(valid)),valid);
 assert.throws(()=>validateState({...valid,profiles:[{...valid.profiles[0],evidenceKnowledge:{tab:'bad',days:30,caseId:''}}]}));
 assert.ok(valid.preferences.startPage==='home');
});

test('1.9.0 overview aggregates real data and excludes foreign profile/server',()=>{
 const c=C.createCase({profileId:profile.id,title:'Current',url:'https://forum.majestic-rp.ru/threads/test.123/'});
 c.updatedAt=stamp;c.evidence=[{id:'evid_123456',kind:'file',vaultId:'file_missing_1234'}];c.timeline=[{id:'event_1234'}];
 const foreign=C.createCase({profileId:'profile_other_1234',title:'Foreign',url:'https://forum.majestic-rp.ru/threads/other.124/'});
 const knowledge=emptyKnowledge();knowledge.collections=[{id:'coll_1234',profileId:profile.id},{id:'coll_5678',profileId:'profile_other_1234'}];knowledge.evidenceGraph={quotes:[{profileId:profile.id},{profileId:'profile_other_1234'}],links:[{profileId:profile.id},{profileId:profile.id},{profileId:'profile_other_1234'}]};
 const files=[{id:'file_other_1234',profileId:'profile_other_1234',kind:'file'},{id:'link_1234',profileId:profile.id,kind:'link'}];
 const sources=[{id:'src_1234',profileId:profile.id,capturedAt:stamp,revisions:[{id:'rev_1234'}]},{id:'src_other_1234',profileId:'profile_other_1234',capturedAt:stamp,revisions:[]}];
 const registry={records:[{profileId:profile.id,project:'majestic',server:'Alpha'},{profileId:profile.id,project:'majestic',server:'Beta'},{profileId:'profile_other_1234',project:'majestic',server:'Alpha'}]};
 const d=evidenceKnowledgeSnapshot(profile,[c,foreign],files,sources,knowledge,registry,{days:7,now:Date.parse('2026-11-18T00:00:00Z')});
 assert.deepEqual([d.cases,d.events,d.evidence,d.vault,d.missing,d.sources,d.revisions,d.collections,d.quotes,d.links,d.decisions,d.recent.length],[1,1,1,1,1,1,1,1,1,2,1,1]);
 assert.equal(d.recent[0].title,'Current');
 const other=evidenceKnowledgeSnapshot({...profile,id:'profile_other_1234'},[c,foreign],files,sources,knowledge,registry);
 assert.equal(other.cases,1);assert.equal(other.quotes,1);assert.equal(other.links,1);
 assert.throws(()=>evidenceKnowledgeSnapshot(profile,[],[],[],knowledge,registry,{days:365}));
});

test('1.9.0 interface embeds actual original editors, sanitizes profile title and supports six tabs',()=>{
 const state=defaultState();state.profiles[0].name='<img src=x onerror=alert(1)>';
 const html=evidenceKnowledgeSection(state,'<div id="actual-complaints">List</div><div id="evidence-vault-root"></div><div id="section-monitor-root"></div>','<div id="actual-library">Library</div><div id="evidence-knowledge-graph"></div>');
 assert.match(html,/id="evidence-knowledge-center"/);
 for(const t of EVIDENCE_TABS)assert.match(html,new RegExp('id="ek-panel-'+t+'"'));
 assert.match(html,/actual-complaints/);assert.match(html,/actual-library/);assert.match(html,/evidence-vault-root/);assert.match(html,/evidence-knowledge-graph/);
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);
});

test('Backup v17 preserves Evidence & Knowledge preferences and old v16 imports',()=>{
 const s=defaultState();s.profiles[0].evidenceKnowledge={tab:'vault',days:90,caseId:''};
 const empty={version:1,calculators:[],drafts:[]};
 const sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},ops={version:1,profiles:[]};
 const args=[validateState(s),[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const backup=makeBackupV17(args,empty,sections,registry,ops,[]);
 const parsed=parseBackupV17(backup,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.schemaVersion,17);assert.deepEqual(parsed.state.profiles[0].evidenceKnowledge,{tab:'vault',days:90,caseId:''});
 assert.deepEqual(parsed.evidenceVault,[]);
 const broken=JSON.parse(backup);broken.payload.profiles[0].evidenceKnowledge={tab:'javascript',days:30,caseId:''};
 assert.throws(()=>parseBackupV17(JSON.stringify(broken),validateState,globalThis.RPNForumCore.cleanTemplate));
});
