import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {makeBackupV13,parseBackupV13} from '../src/lib/workflow-backup.mjs';
import {makeBackupV12} from '../src/lib/knowledge-backup.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
const C=globalThis.RPNComplaints,F=globalThis.RPNForumCore;
const profile=defaultState(),id=profile.activeProfileId;
const URL='https://forum.majestic-rp.ru/threads/workflow-example.1002/';
const seed=()=>C.createCase({profileId:id,title:'Апелляция <script>unsafe</script>',url:URL});
test('1.4.0 starts with four unchecked stages and rejects skipped steps',()=>{
 const c=seed();assert.equal(c.workflow.stage,'intake');assert.equal(c.workflow.history.length,0);
 assert.throws(()=>C.workflowAction(c,'next',{}),/проверку/);
 assert.throws(()=>C.workflowAction(c,'check',{stage:'facts',done:true}),/не открыт/);
 assert.throws(()=>C.workflowAction(c,'next',{confirm:true}),/проверку/);
 assert.throws(()=>C.workflowAction(c,'check',{stage:'invalid',done:true}));
});
test('manual step-by-step workflow, backwards, guard for terminal state and reopening',()=>{
 let c=seed();
 for(const stage of ['intake','facts','evidence','decision']){
  c=C.workflowAction(c,'check',{stage,done:true});
  assert.equal(c.workflow.checks[stage],true);
  if(stage==='decision'){
   assert.throws(()=>C.workflowAction(c,'next',{confirm:true}),/черновик/);
   c=C.updateCase(c,{draft:C.draftDecision(c)});
   assert.throws(()=>C.workflowAction(c,'next'),/подтверждения/);
  }
  c=C.workflowAction(c,'next',{confirm:true});
 }
 assert.equal(c.workflow.stage,'closed');assert.equal(c.status,'done');
 c=C.workflowAction(c,'previous');assert.equal(c.workflow.stage,'decision');assert.equal(c.status,'in-progress');
 assert.ok(c.workflow.history.some(x=>x.type==='step'));
});
test('no direct bypass to done without review, and manual notes validate and persist',()=>{
 let c=seed();assert.throws(()=>C.updateCase(c,{status:'done'}),/этапы/);
 c=C.workflowAction(c,'note',{text:'Ожидаем уточнений'});
 assert.equal(c.workflow.history.at(-1).text,'Ожидаем уточнений');
 assert.throws(()=>C.workflowAction(c,'note',{text:'<'.repeat(501)}));
 assert.throws(()=>C.workflowAction(c,'decision',{kind:'injected'}));
 c=C.workflowAction(c,'decision',{kind:'rejected'});
 assert.match(C.draftDecision(c),/отказать/);assert.match(C.draftDecision(c),/заполнить вручную/);
});
test('audit tracks evidence, deadline, draft and changing status',()=>{
 let c=seed();c=C.updateCase(c,{status:'waiting',deadline:'2026-12-01T12:00:00Z',draft:'проверка'});
 c=C.addEvidence(c,{url:'https://youtube.com/watch?v=123',title:'Запись'});
 c=C.removeEvidence(c,c.evidence[0].id);
 assert.deepEqual(c.workflow.history.map(x=>x.type),['status','deadline','draft','evidence','evidence']);
 assert.equal(C.cleanCase(c).workflow.history.length,5);
});
test('migrates 1.3 complaint without workflow and retains already completed cases',()=>{
 let c=seed();delete c.workflow;
 assert.equal(C.cleanCase(c).workflow.stage,'intake');
 c.status='done';assert.equal(C.cleanCase(c).workflow.stage,'closed');
 assert.equal(C.cleanCase(c).workflow.checks.decision,true);
});
test('rejects corrupted or malicious workflow records at storage boundary',()=>{
 const c=seed();
 assert.throws(()=>C.cleanCase({...c,workflow:{...c.workflow,stage:'injected'}}));
 assert.throws(()=>C.cleanCase({...c,workflow:{...c.workflow,checks:{...c.workflow.checks,facts:'yes'}}}));
 assert.throws(()=>C.cleanCase({...c,workflow:{...c.workflow,history:Array(121).fill({type:'note'})}}));
 assert.throws(()=>C.cleanCase({...c,workflow:{...c.workflow,history:[{id:'bad',type:'invalid',at:new Date().toISOString(),text:'hello'}]}}));
});
test('deadline reminders classify safely and do not invent future alerts',()=>{
 const now=Date.parse('2026-12-01T12:00:00Z');
 const d=ms=>new Date(now+ms).toISOString();
 assert.equal(C.deadlineTier(null,now),null);
 assert.equal(C.deadlineTier(d(25*3600000),now),null);
 assert.equal(C.deadlineTier(d(20*3600000),now),'24h');
 assert.equal(C.deadlineTier(d(45*60000),now),'1h');
 assert.equal(C.deadlineTier(d(12*60000),now),'15m');
 assert.equal(C.deadlineTier(d(-1000),now),'overdue');
});
test('v13 backup round-trips full journal and accepts v12 with workflow migration',()=>{
 let c=seed();c=C.workflowAction(c,'check',{stage:'intake',done:true});c=C.workflowAction(c,'next');
 const args=[profile,[],[c],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),F.cleanTemplate];
 const backup=makeBackupV13(...args);
 assert.equal(JSON.parse(backup).schemaVersion,13);
 const parsed=parseBackupV13(backup,validateState,F.cleanTemplate);
 assert.equal(parsed.cases.length,1);
 assert.deepEqual(parsed.cases[0].workflow,c.workflow);
 assert.deepEqual(parsed.knowledgeWorkspace,emptyKnowledge());
 assert.throws(()=>parseBackupV13(backup.replace('"stage": "facts"','"stage": "fake"'),validateState,F.cleanTemplate));
 const old=makeBackupV12(...args);
 assert.equal(parseBackupV13(old,validateState,F.cleanTemplate).schemaVersion,12);
 const legacy=JSON.parse(old);delete legacy.complaints[0].workflow;
 assert.equal(parseBackupV13(JSON.stringify(legacy),validateState,F.cleanTemplate).cases[0].workflow.stage,'intake');
});
