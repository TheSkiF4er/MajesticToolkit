import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,validateState,savePreferences} from '../src/lib/model.mjs';
import {CENTER_TABS,CENTER_PERIODS,cleanModerationCenter,defaultModerationCenter} from '../src/lib/moderation-center-prefs.mjs';
import '../src/lib/forum-core.js';
import '../src/lib/complaints-core.js';
import {moderationCenterSnapshot,moderationCenterSection} from '../src/ui/moderation-center.mjs';
import {makeModerationBackup,parseModerationBackup} from '../src/lib/moderation-backup.mjs';
import {makeRulesExperienceBackup} from '../src/lib/punishment-backup.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
const profile=defaultState().profiles[0],C=globalThis.RPNComplaints;
const emptySections={version:1,subscriptions:[],inbox:[]};
const emptyRegistry={version:1,records:[]};
const emptyOps={version:1,profiles:[]};
const args=s=>[s,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];

test('1.8.0 moderation tabs and periods have strict, profile-scoped validation',()=>{
 assert.deepEqual(defaultModerationCenter(),{tab:'overview',days:7});
 assert.deepEqual(CENTER_TABS,['overview','cases','inbox','registry','analytics']);
 assert.deepEqual(CENTER_PERIODS,[7,14,30,90]);
 assert.deepEqual(cleanModerationCenter({tab:'registry',days:30,unknown:'ignored'}),{tab:'registry',days:30});
 for(const invalid of [null,[],{}, {tab:'admin',days:7},{tab:'cases',days:0},{tab:'cases',days:'7'}])assert.throws(()=>cleanModerationCenter(invalid));
 let s=defaultState();s.profiles[0].moderationCenter={tab:'inbox',days:14,unknown:'unsafe'};
 s=validateState(s);assert.deepEqual(s.profiles[0].moderationCenter,{tab:'inbox',days:14});
 assert.deepEqual(validateState(savePreferences(s,{startPage:'moderation'})).preferences.startPage,'moderation');
});

test('live Moderation Center snapshot isolates project, server, profile, respects deadlines and audit',()=>{
 const p={...profile,id:'profile_current',project:'majestic',server:'Alpha',moderationBatch:[{caseId:'queue_entry'}]};
 const c=C.createCase({profileId:p.id,title:'Срочная жалоба',url:'https://forum.majestic-rp.ru/threads/test.101/',deadline:'2026-11-17T12:00:00Z'});
 const c2=C.createCase({profileId:'profile_foreign',title:'Чужая жалоба',url:'https://forum.majestic-rp.ru/threads/other.102/'});
 const sources={subscriptions:[{id:'sub001',profileId:p.id,project:'majestic',server:'Alpha'},{id:'sub999',profileId:p.id,project:'majestic',server:'Beta'}],inbox:[{profileId:p.id,subscriptionId:'sub001',status:'pending',kind:'new',at:'2026-11-17T11:10:00Z',row:{title:'Новая жалоба'}},{profileId:p.id,subscriptionId:'sub999',status:'pending',kind:'new',at:'2026-11-17T11:12:00Z',row:{title:'Чужой сервер'}},{profileId:p.id,subscriptionId:'sub001',status:'accepted',kind:'reply',at:'2026-11-17T11:09:00Z',row:{title:'Ответ'}}]};
 const registry={records:[{profileId:p.id,project:'majestic',server:'Alpha',status:'reviewed'},{profileId:p.id,project:'majestic',server:'Beta',status:'reviewed'}]};
 const ops={audit:[{action:'create',at:'2026-11-17T11:00:00Z'}]};
 const d=moderationCenterSnapshot(p,[c,c2],sources,registry,ops,{now:Date.parse('2026-11-17T13:00:00Z'),days:7});
 assert.equal(d.active,1);assert.equal(d.overdue,1);assert.equal(d.pending,1);assert.equal(d.subscriptions,1);assert.equal(d.records,1);assert.equal(d.reviewed,1);assert.equal(d.events.length,1);assert.equal(d.cases[0].id,c.id);assert.equal(d.audit.length,1);assert.equal(d.batch.length,1);
 assert.throws(()=>moderationCenterSnapshot(p,[],sources,registry,ops,{days:180}));
});

test('Moderation Center exposes working existing sections without unsafe HTML in heading',()=>{
 const s=defaultState();s.profiles[0].name='<script>alert(1)</script>';
 const html=moderationCenterSection(s,'<div id="real-complaint-list">real complaints</div>');
 assert.match(html,/id="moderation-center"/);
 for(const tab of CENTER_TABS)assert.match(html,new RegExp('id="mc-panel-'+tab+'"'));
 assert.match(html,/real-complaint-list/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});

test('Backup v16 includes validated Moderation Center settings and all existing module blocks; imports v15',()=>{
 const s=defaultState();s.profiles[0].moderationCenter={tab:'analytics',days:90};const valid=validateState(s);
 const extra={version:1,calculators:[],drafts:[]};
 const raw=makeModerationBackup(args(valid),extra,emptySections,emptyRegistry,emptyOps);
 const serialized=JSON.parse(raw);assert.equal(serialized.schemaVersion,16);assert.deepEqual(serialized.payload.profiles[0].moderationCenter,{tab:'analytics',days:90});
 assert.ok(serialized.punishments);assert.ok(serialized.sectionMonitor);assert.ok(serialized.punishmentRegistry);assert.ok(serialized.moderationOps);
 const parsed=parseModerationBackup(raw,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.schemaVersion,16);assert.deepEqual(parsed.state.profiles[0].moderationCenter,{tab:'analytics',days:90});
 assert.deepEqual(parsed.sectionMonitor,emptySections);assert.deepEqual(parsed.punishmentRegistry,emptyRegistry);
 const old=makeRulesExperienceBackup(args(valid),extra,emptySections,emptyRegistry,emptyOps);
 assert.equal(parseModerationBackup(old,validateState,globalThis.RPNForumCore.cleanTemplate).schemaVersion,15);
 assert.throws(()=>parseModerationBackup(JSON.stringify({...serialized,payload:{...serialized.payload,profiles:[{...serialized.payload.profiles[0],moderationCenter:{tab:'invalid',days:7}}]}}),validateState,globalThis.RPNForumCore.cleanTemplate));
});

test('Backup v16 rejects malformed core and untrusted module data',()=>{
 const s=defaultState(),v=JSON.parse(makeModerationBackup(args(s),{version:1,calculators:[],drafts:[]},emptySections,emptyRegistry,emptyOps));
 assert.throws(()=>parseModerationBackup(JSON.stringify({...v,format:'imposter'}),validateState,globalThis.RPNForumCore.cleanTemplate));
 assert.throws(()=>parseModerationBackup(JSON.stringify({...v,sectionMonitor:{...emptySections,inbox:[{bad:true}]}}),validateState,globalThis.RPNForumCore.cleanTemplate));
 assert.throws(()=>parseModerationBackup('not-json',validateState,globalThis.RPNForumCore.cleanTemplate));
});
