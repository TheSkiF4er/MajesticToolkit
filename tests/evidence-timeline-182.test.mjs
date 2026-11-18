import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import {makeModerationBackup,parseModerationBackup} from '../src/lib/moderation-backup.mjs';
import {defaultState,validateState} from '../src/lib/model.mjs';
import '../src/lib/forum-core.js';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
const C=globalThis.RPNComplaints;
const profile='timeline_profile_182';
const base=()=>C.createCase({profileId:profile,title:'Timeline QA',url:'https://forum.majestic-rp.ru/threads/timeline.182/'});
const attachVideo=c=>C.addEvidence(c,{title:'Camera',url:'https://youtu.be/example',seconds:20,note:''});
const attachPhoto=c=>C.addEvidence(c,{kind:'file',vaultId:'vault_photo_182',sha256:'a'.repeat(64),size:100,mime:'image/png',title:'Screen',note:''});
const event=(c,extra={})=>({title:'Возник конфликт',description:'Наблюдение на видео',occurredAt:'2026-11-17T20:00:00Z',status:'unverified',participants:['12345','Player_A'],evidenceIds:[c.evidence[0].id],clipEvidenceId:c.evidence[0].id,startSeconds:42,endSeconds:65,...extra});
test('1.8.2 creates, updates and removes durable chronological events',()=>{
 let c=attachVideo(base());const start=c.updatedAt;c=C.timelineAction(c,'add',event(c),start);
 assert.equal(c.timeline.length,1);assert.equal(c.timeline[0].startSeconds,42);assert.ok(Date.parse(c.updatedAt)>Date.parse(start));
 const id=c.timeline[0].id;assert.equal(C.timelineText(c).includes('Возник конфликт'),true);
 const changed=C.timelineAction(c,'edit',{...c.timeline[0],title:'Фрагмент проверен',status:'supported',startSeconds:44},c.updatedAt);
 assert.equal(changed.timeline[0].id,id);assert.equal(changed.timeline[0].createdAt,c.timeline[0].createdAt);
 assert.equal(changed.timeline[0].startSeconds,44);assert.equal(changed.timeline[0].status,'supported');
 assert.equal(C.cleanCase(changed).timeline[0].id,id);
 const removed=C.timelineAction(changed,'remove',{id},changed.updatedAt);assert.equal(removed.timeline.length,0);assert.equal(removed.evidence.length,1);
});
test('1.8.2 independent event clock and video offsets, chronological order',()=>{
 let c=attachVideo(base());c=C.timelineAction(c,'add',event(c,{title:'Позже',occurredAt:'2026-11-17T22:00:00Z',startSeconds:10,endSeconds:null}));
 c=C.timelineAction(c,'add',event(c,{title:'Раньше',occurredAt:'2026-11-17T19:00:00Z',startSeconds:90,endSeconds:100}));
 c=C.timelineAction(c,'add',event(c,{title:'Неизвестное время',occurredAt:null,startSeconds:0,endSeconds:null}));
 assert.deepEqual(C.timelineOrdered(c.timeline).map(x=>x.title),['Раньше','Позже','Неизвестное время']);
 assert.equal(c.timeline[2].startSeconds,0);assert.equal(c.timeline[1].startSeconds,90);
});
test('1.8.2 rejects cross-case evidence, duplicates, and malformed intervals',()=>{
 let c=attachVideo(base());const other=attachVideo(base()).evidence[0].id;
 for(const patch of [
  {evidenceIds:[other],clipEvidenceId:other},
  {evidenceIds:[],clipEvidenceId:c.evidence[0].id},
  {startSeconds:-1}, {startSeconds:22,endSeconds:22},{startSeconds:22,endSeconds:21},
  {startSeconds:22.5},{endSeconds:86401},{status:'official'},
  {participants:['a','A']},{title:''},
 ])assert.throws(()=>C.timelineAction(c,'add',event(c,patch)),JSON.stringify(patch));
 c=attachPhoto(c);
 assert.throws(()=>C.timelineAction(c,'add',event(c,{evidenceIds:[c.evidence[1].id],clipEvidenceId:c.evidence[1].id})));
 const t=C.timelineAction(c,'add',event(c));
 assert.throws(()=>C.cleanCase({...t,timeline:[...t.timeline,t.timeline[0]]}));
});
test('1.8.2 supports manually reconstructed events with no video or exact timestamp',()=>{
 const c=base(),created=C.timelineAction(c,'add',{title:'Свидетельство',description:'Требует проверки',occurredAt:null,status:'disputed',participants:[],evidenceIds:[],clipEvidenceId:null,startSeconds:null,endSeconds:null});
 assert.equal(created.timeline[0].occurredAt,null);assert.equal(created.timeline[0].status,'disputed');
 assert.ok(C.draftDecision(created).includes('Свидетельство'));
});
test('1.8.2 linked evidence cannot be removed until timeline reference is unlinked',()=>{
 let c=attachVideo(base());c=C.timelineAction(c,'add',event(c));
 assert.throws(()=>C.removeEvidence(c,c.evidence[0].id),/хронологии/);
 c=C.timelineAction(c,'edit',{...c.timeline[0],evidenceIds:[],clipEvidenceId:null,startSeconds:null,endSeconds:null});
 assert.equal(C.removeEvidence(c,c.evidence[0].id).evidence.length,0);
});
test('1.8.2 stale edit blocked; completed cases must be reopened',()=>{
 let c=attachVideo(base());const older=c.updatedAt;c=C.timelineAction(c,'add',event(c),older);
 assert.throws(()=>C.timelineAction(c,'remove',{id:c.timeline[0].id},older),/другой вкладке/);
 assert.throws(()=>C.timelineAction(c,'edit',{id:'missing_182'},c.updatedAt),/не найдено/);
 const done=C.cleanCase({...c,status:'done',workflow:C.initialWorkflow('done')});
 assert.throws(()=>C.timelineAction(done,'add',event(c)),/откройте/);
});
test('1.8.2 preserves legacy cases without timeline and invalidates moderation decision on change',()=>{
 const c=attachVideo(base()),legacy={...c};delete legacy.timeline;
 assert.deepEqual(C.cleanCase(legacy).timeline,[]);
 const prepared={...c,moderation:C.cleanModeration({version:1,revision:'mod_revision_182',project:'majestic',server:'Alpha',players:[],policy:'{}',status:'draft',history:[],note:'',draftFormat:'plain',decisionSnapshotId:'old_decision_182',updatedAt:new Date().toISOString()},c.evidence)};
 const newEvent=C.timelineAction(C.cleanCase(prepared),'add',event(c));
 assert.equal(newEvent.moderation.status,'draft');assert.equal(newEvent.moderation.decisionSnapshotId,null);assert.notEqual(newEvent.moderation.revision,'mod_revision_182');
});
test('1.8.2 timeline survives Backup v16 and tampering is rejected',()=>{
 const state=defaultState(),p=state.profiles[0];let c=C.createCase({profileId:p.id,title:'Backup Timeline',url:'https://forum.majestic-rp.ru/threads/timeline.188/'});c=attachVideo(c);c=C.timelineAction(c,'add',event(c));
 const args=[state,[],[c],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const text=makeModerationBackup(args,{version:1,calculators:[],drafts:[]},{version:1,subscriptions:[],inbox:[]},{version:1,records:[]},{version:1,profiles:[]});
 const parsed=parseModerationBackup(text,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.deepEqual(parsed.cases[0].timeline,c.timeline);
 const bad=JSON.parse(text);bad.complaints[0].timeline[0].evidenceIds=['external_evidence_id'];
 assert.throws(()=>parseModerationBackup(JSON.stringify(bad),validateState,globalThis.RPNForumCore.cleanTemplate));
});
