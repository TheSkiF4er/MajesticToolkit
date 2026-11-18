import {saveJudgmentDraft,approveJudgment,fileCaseAppeal,resolveCaseAppeal} from './judicial-case-core.mjs';
import {judgmentSnapshot,judgmentSealInput,digestJudgment,verifyJudgments} from './judicial-decisions-core.mjs';
import {createJudicialCase,editJudicialCase,changeCaseStatus,mutateCaseParticipants,mutateCaseDocuments,noteJudicialCase,mutateCaseHearing,mutateCaseMotion,mutateCaseDeadline,mutateCaseEvidence,validateCaseRelations} from './judicial-case-core.mjs';
import {listDocumentRecords} from './document-store.mjs';
import {createDocument,validateDocuments,DOCUMENT_PREFIX} from './document-core.mjs';
import {prepareProceduralDocument} from './procedural-document-core.mjs';
import {api} from './browser.mjs';
import {getVaultRecord,verifyVaultFile} from './evidence-vault.mjs';
import { GOV_PREFIX,GOV_LIMITS,cleanGovernment,validateGovernment,createDepartment,editDepartment,createTemplate,editTemplate,createDecision,editDecision,finalizeDecision,cloneDecision,createAgencyUnit,editAgencyUnit,createAgencyPosition,editAgencyPosition,createAgencyCompetence,editAgencyCompetence,createAgencyAssignment,editAgencyAssignment,createCourt,editCourt,createCourtJurisdiction,editCourtJurisdiction,findCourtJurisdiction } from './government-core.mjs';
let chain=Promise.resolve();const enqueue=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
export function parseGovernmentStorage(raw){return Object.entries(raw).filter(([k])=>k.startsWith(GOV_PREFIX)).flatMap(([k,v])=>{try{const r=cleanGovernment(v);return k===GOV_PREFIX+r.id?[r]:[];}catch(err){console.warn('MajesticToolkit: повреждённая запись Government Tools',k,err);return [];}});}
export async function listGovernment(){return parseGovernmentStorage(await api.storage.local.get(null)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function getGovernment(id){if(typeof id!=='string'||!/^[\w-]{8,128}$/.test(id))throw Error('Неверный ID');const r=(await api.storage.local.get(GOV_PREFIX+id))[GOV_PREFIX+id];if(!r)throw Error('Запись Government Tools не найдена');return cleanGovernment(r);}
async function insert(r){const rows=await listGovernment();if(rows.length>=GOV_LIMITS.records)throw Error('Лимит записей Government Tools');const next=validateGovernment([...rows,r]);await api.storage.local.set({[GOV_PREFIX+r.id]:r});return r;}
async function update(r){const rows=await listGovernment();if(!rows.some(x=>x.id===r.id))throw Error('Запись Government Tools не найдена');validateGovernment(rows.map(x=>x.id===r.id?r:x));await api.storage.local.set({[GOV_PREFIX+r.id]:r});return r;}
export const addAgencyUnit=(profile,fields)=>enqueue(()=>insert(createAgencyUnit(profile,fields)));
export const updateAgencyUnit=(id,fields)=>enqueue(async()=>update(editAgencyUnit(await getGovernment(id),fields)));
export const addAgencyPosition=(profile,fields)=>enqueue(()=>insert(createAgencyPosition(profile,fields)));
export const updateAgencyPosition=(id,fields)=>enqueue(async()=>update(editAgencyPosition(await getGovernment(id),fields)));
export const addAgencyCompetence=(profile,fields)=>enqueue(()=>insert(createAgencyCompetence(profile,fields)));
export const updateAgencyCompetence=(id,fields)=>enqueue(async()=>update(editAgencyCompetence(await getGovernment(id),fields)));
export const addAgencyAssignment=(profile,fields)=>enqueue(()=>insert(createAgencyAssignment(profile,fields)));
export const updateAgencyAssignment=(id,fields)=>enqueue(async()=>update(editAgencyAssignment(await getGovernment(id),fields)));
export const addCourt=(profile,fields)=>enqueue(()=>insert(createCourt(profile,fields)));
export const updateCourt=(id,fields)=>enqueue(async()=>update(editCourt(await getGovernment(id),fields)));
export const addCourtJurisdiction=(profile,fields)=>enqueue(()=>insert(createCourtJurisdiction(profile,fields)));
export const updateCourtJurisdiction=(id,fields)=>enqueue(async()=>update(editCourtJurisdiction(await getGovernment(id),fields)));
// All case writes use the Government Tools queue; multi-tab updates are refreshed
// from storage before mutation and every change appends a validated audit event.
async function caseInsert(profile,fields){const row=createJudicialCase(profile,fields),records=await listGovernment();validateCaseRelations(row,[...records,row],await listDocumentRecords());return insert(row);}
async function caseUpdate(id,operation){const current=await getGovernment(id);if(current.type!=='case')throw Error('Судебное дело не найдено');await verifyJudgments(current);const row=operation(current),records=await listGovernment();validateCaseRelations(row,records.map(x=>x.id===id?row:x),await listDocumentRecords());if(row===current)return row;return update(row);}
/** Create a real Studio record AND link it to the case, including the case audit
 * event. A single storage write keeps both records together; rollback also
 * handles storage implementations that partially apply a failed set(). */
export const generateCourtCaseDocument=(caseId,kind,fields,profiles)=>enqueue(async()=>{
 const row=await getGovernment(caseId);
 if(row.type!=='case'||!profiles.includes(row.profileId))throw Error('Судебное дело не найдено в доступном профиле');
 const gov=await listGovernment(),docs=await listDocumentRecords();
 const draft=prepareProceduralDocument(row,gov,kind,fields);
 const procedural={caseId:row.id,kind,sourceRevision:row.revision,generatedAt:new Date().toISOString(),approvals:[]};
 const document=createDocument(row.profileId,{...draft,procedural});
 const updated=mutateCaseDocuments(row,'add',{id:document.id,kind:'document',title:draft.title});
 const nextGov=gov.map(r=>r.id===row.id?updated:r),nextDocs=[...docs,document];
 validateGovernment(nextGov,profiles);
 validateDocuments(nextDocs,profiles,nextGov);
 validateCaseRelations(updated,nextGov,nextDocs);
 const docKey=DOCUMENT_PREFIX+document.id,caseKey=GOV_PREFIX+row.id;
 try{await api.storage.local.set({[docKey]:document,[caseKey]:updated});}
 catch(error){try{await api.storage.local.set({[caseKey]:row});await api.storage.local.remove(docKey);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось восстановить дело после ошибки создания документа');}throw error;}
 return {document,caseRecord:updated};
});

const uid=()=>globalThis.crypto?.randomUUID?.()??`jd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
export const saveCourtJudgment=(caseId,fields)=>enqueue(()=>caseUpdate(caseId,row=>saveJudgmentDraft(row,fields)));
export const approveCourtJudgment=caseId=>enqueue(async()=>{
 const row=await getGovernment(caseId);await verifyJudgments(row);
 if(row.status!=='closed'||!row.judgmentDraft)throw Error('Завершите дело и сохраните черновик судебного решения');
 const approval={id:uid(),approvedAt:new Date().toISOString(),draft:row.judgmentDraft,snapshot:judgmentSnapshot(row)};
 approval.sha256=await digestJudgment(judgmentSealInput(approval));
 return caseUpdate(caseId,old=>approveJudgment(old,approval));
});
/** Create an appellate CASE at a configured higher court, not a placeholder.
 * Source and child records are written together and rolled back if storage fails. */
export const fileCourtAppeal=(caseId,fields)=>enqueue(async()=>{
 const source=await getGovernment(caseId);if(source.type!=='case'||source.status!=='closed')throw Error('Обжаловать можно завершённое судебное дело');
 await verifyJudgments(source);
 if(!source.participants.some(p=>p.id===fields.appellantId))throw Error('Заявитель апелляции должен быть участником исходного дела');
 const all=await listGovernment(),docs=await listDocumentRecords();
 const possible=findCourtJurisdiction(all,source.profileId,{stage:'appeal',category:source.category,territory:source.territory,originCourtId:source.courtId});
 const selected=possible.find(x=>x.court.id===fields.courtId);if(!selected)throw Error('Апелляционный суд не соответствует сохранённым правилам подсудности и судебной иерархии');
 const num=String(fields.number??'').trim();if(!num||num.length>100)throw Error('Введите номер апелляционного дела');
 const appealId=uid();const judgment=source.judgments.find(j=>j.id===fields.judgmentId);if(!judgment)throw Error('Выберите утверждённое судебное решение');
 const child=createJudicialCase(source.profileId,{courtId:selected.court.id,number:num,title:`Апелляция: ${source.title}`.slice(0,200),category:source.category,territory:source.territory,summary:String(fields.grounds??'').slice(0,9000),participants:source.participants.map(x=>({...x})),origin:{caseId:source.id,appealId,judgmentId:judgment.id}});
 const appeal={id:appealId,judgmentId:judgment.id,appellantId:fields.appellantId,caseId:child.id,courtId:child.courtId,filedAt:new Date().toISOString(),grounds:fields.grounds,status:'reviewing',resolution:'',resolvedAt:'',reviewJudgmentId:''};
 const updated=fileCaseAppeal(source,appeal),next=all.map(r=>r.id===source.id?updated:r).concat(child);
 validateGovernment(next);validateCaseRelations(updated,next,docs);validateCaseRelations(child,next,docs);
 if(all.length>=GOV_LIMITS.records)throw Error('Лимит записей Government Tools');
 const parentKey=GOV_PREFIX+source.id,childKey=GOV_PREFIX+child.id;
 try{await api.storage.local.set({[parentKey]:updated,[childKey]:child});}
 catch(error){try{await api.storage.local.set({[parentKey]:source});await api.storage.local.remove(childKey);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось откатить создание апелляционного производства');}throw error;}
 return {source:updated,caseRecord:child};
});
export const resolveCourtAppeal=(caseId,appealId,outcome,resolution)=>enqueue(async()=>{
 const source=await getGovernment(caseId);if(source.type!=='case')throw Error('Исходное дело отсутствует');await verifyJudgments(source);
 const appeal=source.appeals.find(x=>x.id===appealId);if(!appeal||appeal.status!=='reviewing')throw Error('Апелляция уже рассмотрена или отсутствует');
 const child=await getGovernment(appeal.caseId);if(child.type!=='case'||child.profileId!==source.profileId||child.origin?.caseId!==caseId||child.status!=='closed')throw Error('Для результата требуется завершённое апелляционное производство');
 await verifyJudgments(child);const approved=child.judgments.at(-1);if(!approved)throw Error('Сначала утвердите решение апелляционного суда');
 return caseUpdate(caseId,row=>resolveCaseAppeal(row,appealId,outcome,resolution,approved.id));
});
export const addJudicialCase=(profile,fields)=>enqueue(()=>caseInsert(profile,fields));
export const editCourtCase=(id,fields)=>enqueue(()=>caseUpdate(id,r=>editJudicialCase(r,fields)));
export const setCourtCaseStatus=(id,status,reason)=>enqueue(()=>caseUpdate(id,r=>changeCaseStatus(r,status,reason)));
export const mutateCourtCaseParticipant=(id,action,fields)=>enqueue(()=>caseUpdate(id,r=>mutateCaseParticipants(r,action,fields)));
export const mutateCourtCaseDocument=(id,action,fields)=>enqueue(async()=>{
 if(fields?.kind==='document'){
  const document=(await listDocumentRecords()).find(r=>r.id===fields.id&&r.type==='document');
  if(document?.procedural){if(document.procedural.caseId!==id)throw Error('Процессуальный документ привязан к другому делу');
   if(action==='remove')throw Error('Процессуальный документ нельзя отвязать от исходного дела: его связь является частью истории');}
 }
 return caseUpdate(id,r=>mutateCaseDocuments(r,action,fields));
});
export const addCourtCaseNote=(id,text)=>enqueue(()=>caseUpdate(id,r=>noteJudicialCase(r,text)));
export const mutateCourtCaseHearing=(id,action,fields)=>enqueue(()=>caseUpdate(id,r=>mutateCaseHearing(r,action,fields)));
export const mutateCourtCaseMotion=(id,action,fields)=>enqueue(()=>caseUpdate(id,r=>mutateCaseMotion(r,action,fields)));
export const mutateCourtCaseDeadline=(id,action,fields)=>enqueue(()=>caseUpdate(id,r=>mutateCaseDeadline(r,action,fields)));
export const mutateCourtCaseEvidence=(id,action,fields)=>enqueue(async()=>{
 const row=await getGovernment(id);if(row.type!=='case')throw Error('Судебное дело не найдено');
 let payload=fields;
 if(action==='add'){
  const {meta}=await getVaultRecord(fields.vaultId);if(meta.profileId!==row.profileId)throw Error('Материал другого профиля');
  if(meta.kind==='file')await verifyVaultFile(meta.id,row.profileId);
  payload={...fields,snapshot:meta};
 }
 return caseUpdate(id,r=>mutateCaseEvidence(r,action,payload));
});
export const addDepartment=(profile,fields)=>enqueue(()=>insert(createDepartment(profile,fields)));
export const updateDepartment=(id,fields)=>enqueue(async()=>update(editDepartment(await getGovernment(id),fields)));
export const addTemplate=(profile,fields)=>enqueue(()=>insert(createTemplate(profile,fields)));
export const updateTemplate=(id,fields)=>enqueue(async()=>update(editTemplate(await getGovernment(id),fields)));
export const addDecision=(profile,fields,laws)=>enqueue(()=>insert(createDecision(profile,fields,laws)));
export const updateDecision=(id,fields,laws)=>enqueue(async()=>update(editDecision(await getGovernment(id),fields,laws)));
export const approveDecision=id=>enqueue(async()=>update(finalizeDecision(await getGovernment(id))));
export const duplicateDecision=id=>enqueue(async()=>insert(cloneDecision(await getGovernment(id))));
export function deleteGovernment(id){return enqueue(async()=>{const r=await getGovernment(id);const entries=await listGovernment();if(r.type==='court'&&entries.some(x=>x.type==='jurisdiction'&&x.courtId===id))throw Error('Сначала удалите правила подсудности суда');
 if(r.type==='case')throw Error('Судебное дело можно архивировать, но нельзя удалить вместе с журналом действий');if(['decision','template'].includes(r.type)&&entries.some(x=>x.type==='case'&&x.documents.some(d=>d.id===id&&d.kind===(r.type==='decision'?'decision':'template'))))throw Error('Сначала отвяжите документ от судебного дела');
 if(r.type==='department'){
  if(entries.some(x=>x.departmentId===id))throw Error('Сначала удалите или перенесите связанные решения и шаблоны');
  const stored=await api.storage.local.get(null);
  if(Object.entries(stored).some(([key,doc])=>key.startsWith('majesticDocumentV7:') && doc?.profileId===r.profileId && (doc?.type==='template'&&doc.departmentId===id || doc?.type==='document'&&Array.isArray(doc.versions)&&doc.versions.some(v=>v.departmentId===id)))) throw Error('Сначала удалите или перенесите связанные документы Document Studio');
 }validateGovernment(entries.filter(x=>x.id!==id));await api.storage.local.remove(GOV_PREFIX+id);});}
export function replaceGovernment(raw,profileIds){return enqueue(async()=>{const records=validateGovernment(raw,profileIds);for(const row of records)if(row.type==='case'&&row.judgments.length)await verifyJudgments(row);const original=Object.fromEntries(Object.entries(await api.storage.local.get(null)).filter(([k])=>k.startsWith(GOV_PREFIX)));const next=Object.fromEntries(records.map(r=>[GOV_PREFIX+r.id,r]));try{if(Object.keys(next).length)await api.storage.local.set(next);const stale=Object.keys(original).filter(k=>!Object.hasOwn(next,k));if(stale.length)await api.storage.local.remove(stale);}catch(error){try{if(Object.keys(original).length)await api.storage.local.set(original);const extra=Object.keys(next).filter(k=>!Object.hasOwn(original,k));if(extra.length)await api.storage.local.remove(extra);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось восстановить данные Government Tools после ошибки');}throw error;}});}
