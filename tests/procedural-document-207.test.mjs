import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {PROCEDURAL_KINDS,prepareProceduralDocument,verifyProceduralApproval} from '../src/lib/procedural-document-core.mjs';
import {documentText,cleanDocumentRecord,validateDocuments} from '../src/lib/document-core.mjs';
import {GOV_PREFIX} from '../src/lib/government-core.mjs';
import {DOCUMENT_PREFIX} from '../src/lib/document-core.mjs';
const data={};let failNext=false;
globalThis.chrome={storage:{local:{async get(key){if(key===null)return structuredClone(data);if(typeof key==='string')return Object.hasOwn(data,key)?{[key]:structuredClone(data[key])}:{};return {};},async set(values){if(failNext){failNext=false;Object.assign(data,structuredClone(values));throw Error('Forced partial storage failure');}Object.assign(data,structuredClone(values));},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[k];}}}};
const gov=await import('../src/lib/government-store.mjs'),doc=await import('../src/lib/document-store.mjs');
const profile='profile-proc-doc-207',other='profile-proc-foreign',profiles=[profile,other];
beforeEach(()=>{for(const k of Object.keys(data))delete data[k];failNext=false;});
async function caseFixture(){const department=await gov.addDepartment(profile,{name:'Окружной суд',code:'DISTR',officer:'Судья Смит',position:'Судья'});const court=await gov.addCourt(profile,{departmentId:department.id,level:'first'});const row=await gov.addJudicialCase(profile,{courtId:court.id,judgeAssignmentId:'',number:'LS-207',title:'Возмещение ущерба',category:'Гражданское',territory:'Los Santos',summary:'Установленные заявителем обстоятельства'});await gov.mutateCourtCaseParticipant(row.id,'add',{name:'Иванов',role:'claimant'});return {court,department,row:await gov.getGovernment(row.id)};}

test('all nine kinds produce editable source snapshots without inventing a legal basis',async()=>{
 const {row}=await caseFixture(),rows=await gov.listGovernment();assert.equal(Object.keys(PROCEDURAL_KINDS).length,9);
 for(const kind of Object.keys(PROCEDURAL_KINDS)){const fields=prepareProceduralDocument(row,rows,kind);assert.ok(fields.body.includes('{{court_name}}'));assert.equal(fields.values.case_number,'LS-207');assert.equal(fields.values.claimants,'Иванов');assert.equal(fields.values.legal_basis,'');assert.ok(fields.title.includes('LS-207'));}
 assert.throws(()=>prepareProceduralDocument(row,rows,'foreign-type'),/Неподдерживаемый/);
});
test('generating case document writes actual linked Studio record and immutable case event',async()=>{
 const {row}=await caseFixture(),result=await gov.generateCourtCaseDocument(row.id,'claim',{legalBasis:'RP-правила, статья 5',signer:'Судья Смит'},profiles);
 const updated=await gov.getGovernment(row.id),stored=await doc.getDocumentRecord(result.document.id);
 assert.equal(updated.documents.length,1);assert.equal(updated.documents[0].id,stored.id);assert.equal(updated.history.at(-1).action,'document-add');assert.equal(updated.revision,row.revision+1);assert.equal(stored.procedural.caseId,row.id);assert.equal(stored.procedural.sourceRevision,row.revision);
 assert.match(documentText(stored),/Окружной суд/);assert.match(documentText(stored),/Иванов/);
 assert.ok(Object.hasOwn(data,DOCUMENT_PREFIX+stored.id));assert.ok(Object.hasOwn(data,GOV_PREFIX+row.id));
 await assert.rejects(()=>gov.mutateCourtCaseDocument(row.id,'remove',{kind:'document',id:stored.id}),/нельзя отвязать/);
 assert.throws(()=>validateDocuments([stored],profiles,[]),/Ведомство отсутствует|отсутствующим делом/);
 await assert.rejects(()=>doc.removeDocumentRecord(stored.id),/связан/);
});
test('approval requires completed fields, locks a digest per revision, export verification detects tampering',async()=>{
 const {row}=await caseFixture();const created=(await gov.generateCourtCaseDocument(row.id,'judgment',{},profiles)).document;
 const govt=await gov.listGovernment();await assert.rejects(()=>doc.approveStudioRevision(created.id,'Судья Смит','',[profile],govt),/Правовое основание|заполните/);
 const values={...created.versions[0].values,legal_basis:'Закон: ст. 5',statement:'Исследованные доказательства',resolution:'Решение по делу',signer:'Судья Смит'};
 const updated=await doc.updateStudioDocument(created.id,{...created.versions[0],values},profiles,govt);
 assert.equal(updated.currentVersion,2);
 await assert.rejects(()=>doc.approveStudioRevision(created.id,'Другое лицо','',profiles,govt),/не совпадает/);
 let approved=await doc.approveStudioRevision(created.id,'Судья Смит','Проверено',profiles,govt);
 assert.equal(approved.procedural.approvals.length,1);assert.equal(approved.procedural.approvals[0].version,2);
 assert.ok(await verifyProceduralApproval(approved,2));
 await assert.rejects(()=>doc.replaceDocumentRecords([{...approved,versions:approved.versions.map(v=>v.number===2?{...v,body:'Другое содержание'}:v)}],profiles,govt),/SHA-256/);
 await assert.rejects(()=>doc.approveStudioRevision(created.id,'Судья Смит','',profiles,govt),/уже утверждена/);
 const newest=await doc.updateStudioDocument(created.id,{...approved.versions.at(-1),title:'Уточнённая редакция'},profiles,govt);
 assert.equal(newest.currentVersion,3);assert.equal(newest.procedural.approvals[0].version,2);
 assert.ok(await verifyProceduralApproval(newest,2));assert.equal(await verifyProceduralApproval(newest,3),false);
 const corrupted=cleanDocumentRecord({...newest,versions:newest.versions.map(v=>v.number===2?{...v,title:'Неавторизованная правка'}:v)});
 assert.equal(await verifyProceduralApproval(corrupted,2),false);
 await assert.rejects(()=>doc.removeDocumentRecord(created.id),/Утверждённый/);
 const clone=await doc.duplicateStudioDocument(created.id,profiles,govt);assert.equal(clone.procedural,undefined);
});
test('foreign profile, archived case and storage partial failure are rejected or rolled back',async()=>{
 const {row}=await caseFixture();await assert.rejects(()=>gov.generateCourtCaseDocument(row.id,'application',{},[other]),/профиле/);
 const prior=await gov.getGovernment(row.id);failNext=true;
 await assert.rejects(()=>gov.generateCourtCaseDocument(row.id,'application',{},profiles),/Forced/);
 assert.deepEqual(await gov.getGovernment(row.id),prior);
 assert.equal((await doc.listDocumentRecords()).length,0);
 const a=await gov.setCourtCaseStatus(row.id,'archived','Архив на время проверки');
 await assert.rejects(()=>gov.generateCourtCaseDocument(a.id,'claim',{},profiles),/архивного/);
});
test('procedural metadata survives document collection validation and backup roundtrip',async()=>{
 const {row}=await caseFixture();const created=(await gov.generateCourtCaseDocument(row.id,'motion',{legalBasis:'Внутренние правила'},profiles)).document;
 const all=await doc.listDocumentRecords(),government=await gov.listGovernment();
 assert.deepEqual(validateDocuments(all,profiles,government),all);
 assert.throws(()=>validateDocuments(all,profiles,government.map(r=>r.id===row.id?{...r,documents:[]}:r)),/отсутствует в материалах/);
 await doc.replaceDocumentRecords(JSON.parse(JSON.stringify(all)),profiles,government);
 assert.equal((await doc.getDocumentRecord(created.id)).procedural.kind,'motion');
 await assert.rejects(()=>doc.replaceDocumentRecords([{...created,procedural:{...created.procedural,kind:'alien'}}],profiles,government),/Некорректная связь/);
 assert.equal((await doc.getDocumentRecord(created.id)).procedural.kind,'motion');
});
