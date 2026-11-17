import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,validateState} from '../src/lib/model.mjs';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
const C=globalThis.RPNComplaints,state=defaultState(),profile=state.profiles[0];
const db={rpNexusStateV1:structuredClone(state)};
globalThis.browser={storage:{local:{async get(k){if(k===null||k===undefined)return structuredClone(db);return {[k]:structuredClone(db[k])};},async set(items){Object.assign(db,structuredClone(items));},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete db[k];}}}};
const core=await import('../src/lib/moderation-ops-core.mjs');
const opsStore=await import('../src/lib/moderation-ops-store.mjs');
const complaints=await import('../src/lib/complaints-store.mjs');
const {makeRulesExperienceBackup,parseRulesExperienceBackup}=await import('../src/lib/punishment-backup.mjs');
const {defaultProductivity}=await import('../src/lib/productivity-core.mjs');
const {emptyMonitor}=await import('../src/lib/monitor-core.mjs');
const {emptyKnowledge}=await import('../src/lib/knowledge-core.mjs');
beforeEach(()=>{for(const k of Object.keys(db))delete db[k];db.rpNexusStateV1=structuredClone(state);});
const seed=(id=1)=>C.createCase({profileId:profile.id,title:'Жалоба '+id,url:`https://forum.majestic-rp.ru/threads/qa.${id}/`,triage:{category:'STATE'}});
function enabled(){return {...core.defaultPolicy(),enabled:true,priorityHours:{low:48,normal:24,high:8,urgent:1},categories:[{name:'STATE',hours:6}]};}
test('1.7.5 validates SLA and local rules, disallows malformed backup and invalid actions',()=>{
 assert.throws(()=>core.cleanPolicy({...enabled(),priorityHours:{...enabled().priorityHours,urgent:0}}));
 assert.throws(()=>core.cleanPolicy({...enabled(),alerts:[15,15]}));
 assert.throws(()=>core.cleanPolicy({...enabled(),categories:[{name:'STATE',hours:6},{name:'state',hours:8}]}));
 const r={id:'rule_123456',name:'Маркировка',enabled:true,trigger:'create',field:'category',equals:'STATE',action:'tag',value:'QA'};
 assert.deepEqual(core.cleanRule(r),r);assert.throws(()=>core.cleanRule({...r,action:'publish'}));
 const ops=core.cleanOperations(undefined,profile);assert.equal(ops.rules.length,0);
 assert.throws(()=>core.cleanOperations({...ops,profileId:'another'},profile));
 assert.throws(()=>opsStore.validateModerationOpsBackup({version:1,profiles:[ops,ops]},[profile]));
});
test('SLA applies configured category hours, pauses during waiting and resumes with remainder; manual deadline wins',()=>{
 const p=enabled();let c=seed(),n=core.applySla(null,c,p,'2026-11-16T08:00:00.000Z');
 assert.equal(Date.parse(n.deadline)-Date.parse(c.createdAt),6*3600000);assert.equal(n.sla.managed,true);
 const before=n;n=C.triageAction(n,'wait',{reason:'Ожидание доказательств'});
 n=core.applySla(before,n,p,new Date(Date.parse(before.createdAt)+3600000).toISOString());
 assert.equal(n.deadline,null);assert.equal(n.sla.remainingMs,5*3600000);
 const waiting=n;n=C.triageAction(n,'resume');n=core.applySla(waiting,n,p,'2026-11-16T10:00:00Z');
 assert.equal(n.deadline,'2026-11-16T15:00:00.000Z');
 const manual=C.updateCase(n,{deadline:'2026-11-20T12:00:00Z'});
 assert.equal(manual.sla,undefined);assert.equal(core.applySla(n,manual,p).deadline,'2026-11-20T12:00:00.000Z');
});
test('automation applies local tags only once per matching change; audit is bounded',()=>{
 let c=seed(),ops=core.cleanOperations(undefined,profile);
 const rule=core.cleanRule({id:'rule_123456',name:'STATE',enabled:true,trigger:'create',field:'category',equals:'STATE',action:'tag',value:'Рассмотреть'});
 ops={...ops,rules:[rule]};const a=core.applyRules(c,ops,'create');assert.deepEqual(a.item.triage.tags,['Рассмотреть']);assert.equal(a.applied.length,1);
 const b=core.applyRules(a.item,a.ops,'create');assert.equal(b.applied.length,0);assert.deepEqual(b.ops.audit,a.ops.audit);
 assert.throws(()=>core.cleanRule({...rule,action:'bad'}));
});
test('analytics uses actual local workflow transitions and correctly isolates profiles',()=>{
 const created=Date.now()-86400000;
 let a=seed(1),b=seed(2);a=C.cleanCase({...a,createdAt:new Date(created).toISOString(),updatedAt:new Date(created).toISOString()});
 for(const stage of C.WORKFLOW_STAGES.slice(0,-1)){a=C.workflowAction(a,'check',{stage,done:true});if(stage!=='decision')a=C.workflowAction(a,'next');}
 a=C.updateCase(a,{draft:'Решение проверено'});a=C.workflowAction(a,'next',{confirm:true});
 b=C.cleanCase({...b,deadline:new Date(Date.now()-3600000).toISOString()});
 const foreign={...b,id:'foreign_123456',profileId:'other-id'};
 const v=core.analytics([a,b,foreign],profile.id,{days:7});
 assert.equal(v.counts.total,2);assert.equal(v.counts.completed,1);assert.equal(v.counts.overdue,1);assert.equal(v.series.reduce((s,x)=>s+x.created,0),2);assert.equal(v.series.reduce((s,x)=>s+x.completed,0),1);
});
test('real complaint storage applies SLA, rules, captures audit, restores and round-trips Backup v15',async()=>{
 await complaints.mutateModerationOperations(profile.id,'policy',{policy:enabled()});
 await complaints.mutateModerationOperations(profile.id,'rule-add',{rule:{id:'rule_123456',name:'Пометка STATE',enabled:true,trigger:'create',field:'category',equals:'STATE',action:'tag',value:'Проверка'}});
 const initial=await complaints.createComplaint({profileId:profile.id,title:'Жалоба STATE',url:'https://forum.majestic-rp.ru/threads/qa.123/',triage:{category:'STATE'}});
 let c=await complaints.getCase(initial.id);assert.ok(c.deadline);assert.deepEqual(c.triage.tags,['Проверка']);
 await complaints.mutateComplaintQueue(profile.id,[c.id],'wait',{reason:'Ожидание'});c=await complaints.getCase(c.id);assert.equal(c.deadline,null);assert.ok(c.sla.pausedAt);
 await complaints.mutateComplaintQueue(profile.id,[c.id],'resume');c=await complaints.getCase(c.id);assert.ok(c.deadline);assert.equal(c.sla.pausedAt,null);
 let ops=await opsStore.moderationOpsFor(profile);assert.ok(ops.audit.some(e=>e.action==='automation'));assert.ok(ops.audit.some(e=>e.action==='triage'));
 const exported=await opsStore.exportModerationOps(state.profiles);
 const args=[state,[],[c],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const backup=makeRulesExperienceBackup(args,{version:1,calculators:[],drafts:[]},undefined,undefined,exported);
 const restored=parseRulesExperienceBackup(backup,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.deepEqual(restored.moderationOps,exported);assert.equal(restored.cases[0].sla.managed,true);
 await opsStore.replaceModerationOps({version:1,profiles:[]},state.profiles);
 assert.equal((await opsStore.moderationOpsFor(profile)).rules.length,0);
 await opsStore.replaceModerationOps(restored.moderationOps,state.profiles);
 assert.equal((await opsStore.moderationOpsFor(profile)).rules.length,1);
});
test('overdue automatic escalation fires once and never changes forum state',async()=>{
 await complaints.mutateModerationOperations(profile.id,'rule-add',{rule:{id:'overdue_rule1',name:'Повышение срочности',enabled:true,trigger:'overdue',field:'status',equals:'new',action:'priority',value:'urgent'}});
 const c=await complaints.createComplaint({profileId:profile.id,title:'Просрочена',url:'https://forum.majestic-rp.ru/threads/late.456/',deadline:'2026-11-10T00:00:00Z'});
 assert.equal(await complaints.runOverdueAutomations(profile.id,Date.now()),1);
 assert.equal(await complaints.runOverdueAutomations(profile.id,Date.now()),0);
 const updated=await complaints.getCase(c.id);assert.equal(updated.triage.priority,'urgent');assert.equal(updated.forumState.state,'unknown');
});
