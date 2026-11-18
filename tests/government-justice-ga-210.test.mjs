import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {createDepartment,createCourt,validateGovernment} from '../src/lib/government-core.mjs';
import {createJudicialCase,mutateCaseDocuments,changeCaseStatus,mutateCaseParticipants} from '../src/lib/judicial-case-core.mjs';
import {createDocument} from '../src/lib/document-core.mjs';
import {justiceActionQueue,verifyJusticeIntegrity,verifyJusticeStorageRows} from '../src/lib/government-justice-ga.mjs';
import {makeBackupV19,parseBackupV19} from '../src/lib/justice-backup.mjs';
import {makeBackupV18} from '../src/lib/ai-backup.mjs';
import {makePortableBackup,parsePortableBackup} from '../src/lib/dossier-backup.mjs';
import '../src/lib/forum-core.js';
import '../src/lib/complaints-core.js';
const state=validateState(defaultState()),P=state.profiles[0].id;
const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
const punishment={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},ops={version:1,profiles:[]};
const parse=text=>parseBackupV19(text,validateState,globalThis.RPNForumCore.cleanTemplate);
const dep=createDepartment(P,{name:'Суд',code:'GA210',officer:'Судья',position:'Judge'});
const court=createCourt(P,{departmentId:dep.id,level:'first',status:'active'});
const basic=()=>createJudicialCase(P,{courtId:court.id,number:'GA-210',title:'GA case',category:'civil',territory:'Los Santos'});
const doc=()=>createDocument(P,{title:'Реальный документ',body:'Текст',fields:[],values:{},departmentId:dep.id});

test('GA queue sorts live overdue deadlines, motions and hearings and never leaks profiles',()=>{
 const row=basic();const ongoing={...row,status:'accepted',deadlines:[{id:'deadline_210',status:'open',title:'Отправка ответа',dueOn:'2026-11-17'}],motions:[{id:'motion_210',status:'pending',title:'Заявление',filedAt:'2026-11-01T10:00:00.000Z'}],hearings:[{id:'hearing_210',status:'scheduled',title:'Следующее заседание',startsAt:'2026-11-20T11:00:00.000Z'}]};
 const hidden={...ongoing,id:'case_hidden_210',profileId:'profile_other_210',number:'PRIVATE',title:'Hidden'};
 const result=justiceActionQueue([ongoing,hidden],P,new Date('2026-11-18T12:00:00.000Z'));
 assert.deepEqual(result.map(x=>x.kind),['deadline','motion','hearing']);
 assert.equal(result[0].status,'overdue');assert.ok(result.every(x=>x.caseId===row.id));
 assert.deepEqual(justiceActionQueue([{...ongoing,deadlines:[{...ongoing.deadlines[0],status:'completed'}],motions:[],hearings:[]}],P,new Date('2026-11-18T12:00:00.000Z')),[]);
 assert.equal(justiceActionQueue([{...row,status:'closed',judgments:[]}],P).at(0).kind,'judgment');
});

test('GA integrity verifies live cross-store document links and rejects orphaned references',async()=>{
 const document=doc(),caseRow=mutateCaseDocuments(basic(),'add',{id:document.id,kind:'document',title:'Реальный документ'});
 const rows=[dep,court,caseRow];
 assert.equal((await verifyJusticeIntegrity(state.profiles,rows,[document],[])).cases,1);
 await assert.rejects(()=>verifyJusticeIntegrity(state.profiles,rows,[],[]),/удалён|Связанный документ/);
 await assert.rejects(()=>verifyJusticeIntegrity(state.profiles,[dep,court,{...caseRow,profileId:'other_210'}],[document],[]),/профилю|Запись относится/);
});

test('GA integrity refuses altered file SHA even when court evidence carries valid snapshot',async()=>{
 const row=basic(),meta={id:'vault_210_file',profileId:P,kind:'file',title:'Квитанция',note:'',createdAt:new Date().toISOString(),name:'file.pdf',mime:'application/pdf',size:10,sha256:'a'.repeat(64)};
 const evidence={id:'court_evidence_210',vaultId:meta.id,category:'document',title:'Квитанция',note:'',hearingId:'',motionId:'',attachedAt:new Date().toISOString(),snapshot:meta};
 const caseRow={...row,evidence:[evidence]};
 assert.equal((await verifyJusticeIntegrity(state.profiles,[dep,court,caseRow],[],[meta])).evidence,1);
 await assert.rejects(()=>verifyJusticeIntegrity(state.profiles,[dep,court,caseRow],[],[{...meta,sha256:'b'.repeat(64)}]),/метаданные изменены/);
 const checked=[];await verifyJusticeIntegrity(state.profiles,[dep,court,caseRow],[],[meta],{checkFiles:async id=>checked.push(id)});
 assert.deepEqual(checked,[meta.id]);
});

test('Backup v19 roundtrip and portable ZIP preserve real case/document references',async()=>{
 const document=doc(),row=mutateCaseDocuments(basic(),'add',{id:document.id,kind:'document',title:'Реальный документ'});
 const input=[...args];input[5]=validateGovernment([dep,court,row]);input[6]=[document];
 const json=await makeBackupV19(input,punishment,sections,registry,ops,[],null),raw=JSON.parse(json);
 assert.equal(raw.schemaVersion,19);assert.equal(raw.aiWorkspace,null);
 const restored=await parse(json);assert.equal(restored.schemaVersion,19);assert.equal(restored.government.find(x=>x.type==='case').documents[0].id,document.id);
 const {blob}=await makePortableBackup(json,[]),unpacked=await parsePortableBackup(blob);
 assert.equal(unpacked.json,json);assert.equal((await parse(unpacked.json)).documents.length,1);
});

test('Backup v19 rejects forged cross-store links before restoration and reads legacy v18',async()=>{
 const json=await makeBackupV19(args,punishment,sections,registry,ops,[],null);
 const parsed=await parse(json);assert.equal(parsed.schemaVersion,19);
 const legacy=makeBackupV18(args,punishment,sections,registry,ops,[],null);
 assert.equal((await parse(legacy)).schemaVersion,18);
 const source=JSON.parse(json),document=doc(),row=mutateCaseDocuments(basic(),'add',{id:document.id,kind:'document',title:'Реальный документ'});
 source.government=[dep,court,row];source.documents=[];
 await assert.rejects(()=>parse(JSON.stringify(source)),/Связанный документ/);
 source.documents=[document];source.government=[dep,court,{...row,profileId:'another_210'}];
 await assert.rejects(()=>parse(JSON.stringify(source)),/профилю|Запись относится/);
});

test('GA queue and dashboard escape untrusted names instead of injecting HTML',async()=>{
 const {governmentJusticeSection}=await import('../src/ui/government-justice-page.mjs');
 const {justiceSnapshot}=await import('../src/lib/government-justice-core.mjs');
 const title='Тест <img src=x onerror=alert(1)>';
 const row={...basic(),title,deadlines:[{id:'deadline_x',title,createdAt:'2026-11-17T12:00:00.000Z',dueOn:'2026-11-18',description:'',status:'open',result:'',resolvedAt:''}]};
 const found=justiceActionQueue([row],P,new Date('2026-11-18T00:00:00Z'));assert.equal(found.length,1);
 // Projections do not render HTML themselves; UI escapes all queue labels.
 const view=governmentJusticeSection({activeProfileId:P,profiles:state.profiles});
 assert.match(view,/Очередь судебной работы|Government & Justice/);
 assert.doesNotMatch(view,/<img src=x/);
 assert.equal(justiceSnapshot(P,[dep,court,row]).cases.length,1);
});

test('GA backup preflight catches malformed stored records that list APIs would silently skip',()=>{
 assert.deepEqual(verifyJusticeStorageRows({}),{government:0,documents:0,laws:0});
 assert.throws(()=>verifyJusticeStorageRows({["majesticGovernmentV6:forged_210"]:{type:"case",id:"forged_210"}}),/повреждена локальная запись/);
 assert.throws(()=>verifyJusticeStorageRows({["majesticGovernmentV6:another_210"]:dep}),/ID локальной записи/);
 assert.equal(verifyJusticeStorageRows({["majesticGovernmentV6:"+dep.id]:dep}).government,1);
 assert.equal(verifyJusticeStorageRows({["majesticGovernmentV6:"+dep.id]:dep},{profileId:"another_210"}).government,0);
});
