import './complaints-core.js';
import { api } from './browser.mjs';
import {loadState} from './state.mjs';
import {getActiveProfile} from './model.mjs';
import {listRules} from './rules-store.mjs';
import {listTemplates} from './forum-store.mjs';
import {moderationOpsFor,moderationOpsKey,changeOpsInternal,runOverdueAutomationsInternal} from './moderation-ops-store.mjs';
import {applySla,applyRules,auditEvent,cleanOperations} from './moderation-ops-core.mjs';
import {assertCaseScope,saveModerationRecord,prepareDecision,assertDecisionReady} from './moderation-core.mjs';
const C = globalThis.RPNComplaints;
export const CASE_PREFIX = C.PREFIX;
let serial = Promise.resolve();
function enqueue(fn) { const current = serial.then(fn); serial = current.catch(() => {}); return current; }
async function profileForCase(id){const state=await loadState();return state.profiles.find(p=>p.id===id)??null;}
async function withOperations(before,after,action,description,trigger=null){
 const profile=await profileForCase(after.profileId);
 if(!profile)return {[CASE_PREFIX+after.id]:after};
 let ops=await moderationOpsFor(profile),item=after;
 if(trigger){const result=applyRules(item,ops,trigger);item=result.item;ops=result.ops;}
 item=applySla(before,item,ops.policy);
 ops=auditEvent(ops,action,description,item.id);
 return {[CASE_PREFIX+item.id]:item,[moderationOpsKey(profile.id)]:cleanOperations(ops,profile)};
}
export function mutateModerationOperations(profileId,operation,input={}){return enqueue(async()=>{
 const profile=(await loadState()).profiles.find(p=>p.id===profileId);if(!profile)throw Error('Профиль не найден');
 return changeOpsInternal(profile,operation,input);
});}
export function runOverdueAutomations(profileId,at=Date.now()){return enqueue(async()=>{
 const profile=(await loadState()).profiles.find(p=>p.id===profileId);if(!profile)throw Error('Профиль не найден');
 return runOverdueAutomationsInternal(profile,await listCases(),at);
});}
function itemsFromStorage(raw) {
  return Object.entries(raw).filter(([key]) => key.startsWith(CASE_PREFIX)).flatMap(([key, value]) => {
    try { const item = C.cleanCase(value); return key === CASE_PREFIX + item.id ? [item] : []; }
    catch (error) { console.warn('MajesticToolkit: повреждённая запись жалобы пропущена', key, error); return []; }
  });
}
export async function listCases() { return itemsFromStorage(await api.storage.local.get(null)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); }
export async function getCase(id) {
  if (typeof id !== 'string' || !/^[\w-]{8,120}$/.test(id)) throw Error('Неверный ID');
  const value = (await api.storage.local.get(CASE_PREFIX + id))[CASE_PREFIX + id];
  if (!value) throw Error('Жалоба не найдена');
  return C.cleanCase(value);
}
export function createComplaint(input) {
  return enqueue(async () => {
    const cases = await listCases();
    if (cases.length >= C.MAX_CASES) throw Error('Лимит жалоб достигнут');
    const complaint = C.createCase(input);
    if (cases.some(c => c.profileId === complaint.profileId && c.threadKey === complaint.threadKey)) throw Error('Жалоба на эту тему уже добавлена для данного профиля');
    await api.storage.local.set(await withOperations(null,complaint,'case','Жалоба создана','create'));
    return complaint;
  });
}
export function editComplaint(id, patch) {
  return enqueue(async () => {
    const before=await getCase(id),item=C.updateCase(before,patch);
    await api.storage.local.set(await withOperations(before,item,'case','Данные жалобы изменены','update'));
    return item;
  });
}
export function addComplaintEvidence(id, input) {
  return enqueue(async () => {
    const before=await getCase(id),item=C.addEvidence(before,input);
    await api.storage.local.set(await withOperations(before,item,'evidence','Добавлено доказательство'));
    return item;
  });
}
export function linkComplaintEvidence(id,evidenceId,vaultId){
 return enqueue(async()=>{
  const before=await getCase(id),after=C.linkLegacyEvidence(before,evidenceId,vaultId);
  await api.storage.local.set(await withOperations(before,after,'evidence','Связано с Evidence Vault'));
  return after;
 });
}
export function removeComplaintEvidence(id, evidenceId) {
  return enqueue(async () => {
    const before=await getCase(id),item=C.removeEvidence(before,evidenceId);
    await api.storage.local.set(await withOperations(before,item,'evidence','Удалено доказательство'));
    return item;
  });
}
// Persist timeline mutations in the same serialized queue as evidence and complaint edits.
export function mutateCaseTimeline(id,action,input={},expected=null){
  return enqueue(async()=>{
    const profile=getActiveProfile(await loadState()),before=await getCase(id);
    if(before.profileId!==profile.id||new URL(before.url).hostname!==(profile.project==='majestic'?'forum.majestic-rp.ru':'forum.russia.online'))throw Error('Жалоба другого профиля или проекта');
    const after=C.timelineAction(before,action,input,expected);
    const current=getActiveProfile(await loadState());
    if(current.id!==profile.id||current.project!==profile.project||current.server!==profile.server)throw Error('Активный профиль изменился');
    await api.storage.local.set(await withOperations(before,after,'evidence',`Хронология: ${action}`));
    return after;
  });
}
// Serialized with evidence and status mutations to avoid lost workflow events.
export function mutateCaseWorkflow(id,action,payload={}) {
  return enqueue(async()=>{
    const current=await getCase(id);
    if(action==='next'&&current.workflow.stage==='decision'&&current.moderation){const profile=getActiveProfile(await loadState());if(current.moderation.status!=='reviewed')throw Error('Сначала подтвердите расчёт');if(assertDecisionReady(current,profile,await listRules()).result.players.some(x=>x.unresolved))throw Error('Расчёт содержит неоднозначности');}
    const updated=C.workflowAction(current,action,payload);
    await api.storage.local.set(await withOperations(current,updated,'workflow',`Этап: ${action}`));
    return updated;
  });
}
/** Save a human-reviewed AI suggestion without forum actions; serialized optimistic locking. */
export function saveComplaintAIDraft(id,profileId,expectedAt,text){return enqueue(async()=>{
 const profile=getActiveProfile(await loadState()),before=await getCase(id);
 if(!profile||profile.id!==profileId||before.profileId!==profileId||new URL(before.url).hostname!==(profile.project==='majestic'?'forum.majestic-rp.ru':'forum.russia.online'))throw Error('Жалоба другого профиля');
 if(before.updatedAt!==expectedAt)throw Error('Жалоба изменена после AI-анализа; откройте её заново');
 if(before.status==='done')throw Error('Завершённую жалобу сначала откройте повторно');
 if(typeof text!=='string'||!text.trim()||text.length>12000)throw Error('Некорректный AI-черновик');
 const updated=C.updateCase(before,{draft:text});
 const after=C.cleanCase({...updated,updatedAt:new Date(Math.max(Date.now(),Date.parse(before.updatedAt)+1)).toISOString()});
 await api.storage.local.set(await withOperations(before,after,'workflow','Сохранён проверенный пользователем AI-черновик'));
 return after;
});}
export function removeComplaint(id) { return enqueue(async () => { const current=await getCase(id),profile=await profileForCase(current.profileId);if(profile){const ops=auditEvent(await moderationOpsFor(profile),'case','Жалоба удалена',id);await api.storage.local.set({[moderationOpsKey(profile.id)]:cleanOperations(ops,profile)});}await api.storage.local.remove(CASE_PREFIX + id); }); }
export function observeThread(url, postId, profileId = null, forumState = 'unknown') {
  return enqueue(async () => {
    const key = C.threadKey(url);
    const cases = (await listCases()).filter(c => c.threadKey === key && c.watching && (!profileId || c.profileId===profileId));
    const changed = [];
    for (const c of cases) {
      const result = C.observeCase(c, postId, undefined, forumState);
      const samePost=result.item.lastSeenPostId===c.lastSeenPostId;
      const lastCheck=c.lastCheckedAt?Date.parse(c.lastCheckedAt):0;
      // Suppress redundant full-record writes during repeated scans of an unchanged thread.
      if(result.changed)await api.storage.local.set(await withOperations(c,result.item,'case','Обнаружен новый ответ','reply'));
      else if(!samePost || result.item.forumState.state!==c.forumState.state || Date.now()-lastCheck>=4*60000)await api.storage.local.set({ [CASE_PREFIX + c.id]: result.item });
      if (result.changed) changed.push(result.item);
    }
    return changed;
  });
}
export function replaceCases(records) {
  return enqueue(async () => {
    if (!Array.isArray(records) || records.length > C.MAX_CASES) throw Error('Некорректное количество жалоб');
    const cases = records.map(C.cleanCase);
    const ids = new Set(), keys = new Set();
    for (const c of cases) {
      if (ids.has(c.id) || keys.has(`${c.profileId}|${c.threadKey}`)) throw Error('Дублирование жалоб');
      ids.add(c.id); keys.add(`${c.profileId}|${c.threadKey}`);
    }
    const raw = await api.storage.local.get(null);
    const before = Object.fromEntries(Object.entries(raw).filter(([k]) => k.startsWith(CASE_PREFIX)));
    const newer = Object.fromEntries(cases.map(x => [CASE_PREFIX + x.id, x]));
    try {
      if (Object.keys(newer).length) await api.storage.local.set(newer);
      const remove = Object.keys(before).filter(k => !Object.hasOwn(newer, k));
      if (remove.length) await api.storage.local.remove(remove);
    } catch (error) {
      if (Object.keys(before).length) await api.storage.local.set(before);
      const introduced = Object.keys(newer).filter(k => !Object.hasOwn(before,k));
      if (introduced.length) await api.storage.local.remove(introduced);
      throw error;
    }
  });
}
export function makeCompleteBackup(profileState, templates, cases, cleanTemplate) {
  const validated = cases.map(C.cleanCase);
  if (validated.length > C.MAX_CASES) throw Error('Превышен лимит жалоб');
  for (const c of validated) if (!profileState.profiles.some(p => p.id === c.profileId)) throw Error('Жалоба привязана к удалённому профилю');
  return JSON.stringify({ format:'rp-nexus-backup', schemaVersion:3, exportedAt:new Date().toISOString(), payload:profileState, forumTemplates:templates.map(cleanTemplate), complaints:validated }, null, 2);
}
export function parseCompleteBackup(text, validateState, cleanTemplate) {
  if (typeof text !== 'string' || text.length > 24*1024*1024) throw Error('Резервная копия превышает 24 МиБ');
  let src; try { src = JSON.parse(text); } catch { throw Error('Некорректный JSON'); }
  if (src?.format !== 'rp-nexus-backup' || !Number.isFinite(Date.parse(src.exportedAt)) || ![1,2,3].includes(src.schemaVersion)) throw Error('Неизвестный формат копии');
  const state = validateState(src.payload);
  const ts = src.schemaVersion >= 2 ? src.forumTemplates : [];
  const cs = src.schemaVersion >= 3 ? src.complaints : [];
  if (!Array.isArray(ts) || ts.length > 500 || !Array.isArray(cs) || cs.length > C.MAX_CASES) throw Error('Превышено количество записей');
  const templates = ts.map(cleanTemplate), cases = cs.map(C.cleanCase);
  const ids = new Set(), keys = new Set(), tids = new Set();
  for (const t of templates) {
    if (tids.has(t.id) || (t.profileId !== '*' && !state.profiles.some(p => p.id === t.profileId))) throw Error('Повторяющийся шаблон или отсутствующий профиль');
    tids.add(t.id);
  }
  for (const c of cases) {
    const key = `${c.profileId}|${c.threadKey}`;
    if (ids.has(c.id) || keys.has(key) || !state.profiles.some(p => p.id === c.profileId)) throw Error('Повторяющаяся жалоба или отсутствующий профиль');
    ids.add(c.id); keys.add(key);
  }
  return { state, templates, cases, schemaVersion:src.schemaVersion };
}

// Serialize moderation changes with ordinary case/evidence mutations.
export function mutateModeration(id,action,input={}){
 return enqueue(async()=>{
  const profile=getActiveProfile(await loadState()),c=await getCase(id);assertCaseScope(c,profile);
  const rows=await listRules();let next;
  if(action==='save'){
   next=saveModerationRecord(c,profile,input,rows);
   next=C.workflowAction(next,'note',{text:next.moderation.status==='draft'?'Сохранены участники и нарушения':next.moderation.status==='reviewed'?'Расчёт проверен пользователем (локально)':'Сохранён предварительный расчёт санкций'});
  }else if(action==='decision'){
   if(c.moderation?.revision!==input.expected||c.draft!==input.expectedDraft)throw Error('Жалоба или черновик изменились. Откройте заново.');
   const template=input.templateId?(await listTemplates()).find(t=>t.id===input.templateId):null;
   if(input.templateId&&!template)throw Error('Шаблон не найден');
   const prepared=prepareDecision(c,profile,rows,template,input.fields??{});
   next=C.updateCase(c,{draft:prepared.text});
   next=C.cleanCase({...next,moderation:{...c.moderation,draftFormat:prepared.format,decisionSnapshotId:c.moderation.history[0].id,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()}});
  }else throw Error('Неизвестное действие рассмотрения');
  const active=getActiveProfile(await loadState());assertCaseScope(next,active);
  if(active.id!==profile.id||active.server!==profile.server||active.project!==profile.project)throw Error('Активный профиль изменился');
  await api.storage.local.set(await withOperations(c,next,'calculation',action==='save'?'Обновлён расчёт':'Подготовлен черновик решения'));return next;
 });
}

// Validate every target before a single storage write; no partial batch on a validation error.
export function mutateComplaintQueue(profileId,ids,operation,input={}){
 return enqueue(async()=>{
  if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw Error('Выберите от 1 до 100 уникальных жалоб');
  const profile=getActiveProfile(await loadState());if(profile.id!==profileId)throw Error('Активный профиль изменился');
  const items=await Promise.all(ids.map(getCase));
  for(const c of items){if(c.profileId!==profileId)throw Error('Жалоба другого профиля');const host=profile.project==='majestic'?'forum.majestic-rp.ru':profile.project==='russia-online'?'forum.russia.online':null;if(!host||new URL(c.url).hostname!==host)throw Error('Жалоба другого проекта');if(c.moderation)assertCaseScope(c,profile);}
  const rules=operation==='finish'?await listRules():[];
  const next=items.map(c=>{if(operation==='finish'){if(input.confirm!==true||c.workflow.stage!=='decision')throw Error('Каждая жалоба должна быть на этапе решения');if(c.moderation){if(c.moderation.status!=='reviewed')throw Error('Сначала подтвердите расчёт');if(assertDecisionReady(c,profile,rules).result.players.some(x=>x.unresolved))throw Error('Расчёт содержит неоднозначности');}return C.workflowAction(c,'next',{confirm:true});}if(operation==='triage'){const patch=Object.fromEntries(Object.entries(input).filter(([k])=>['priority','category','section','assignee','tags'].includes(k)));return C.updateCase(c,{triage:patch,...(typeof input.watching==='boolean'?{watching:input.watching}:{})});}return C.triageAction(c,operation,input);});
  const active=getActiveProfile(await loadState());if(active.id!==profileId||active.project!==profile.project||active.server!==profile.server)throw Error('Активный профиль изменился');
  let ops=await moderationOpsFor(profile);const entries={};const finished=[];
  for(let i=0;i<next.length;i++){
   const result=applyRules(next[i],ops,'update');ops=result.ops;
   const item=applySla(items[i],result.item,ops.policy);
   ops=auditEvent(ops,'triage',`Пакетная операция: ${operation}`,item.id);
   entries[CASE_PREFIX+item.id]=item;finished.push(item);
  }
  entries[moderationOpsKey(profile.id)]=cleanOperations(ops,profile);
  await api.storage.local.set(entries);return finished;
 });
}

export function applyPolicyToUnscheduled(profileId){return enqueue(async()=>{
 const profile=(await loadState()).profiles.find(p=>p.id===profileId);if(!profile)throw Error('Профиль не найден');
 let ops=await moderationOpsFor(profile);if(!ops.policy.enabled)throw Error('Сначала включите SLA');
 const records=(await listCases()).filter(c=>c.profileId===profileId&&c.status!=='done'&&!c.deadline&&!c.sla);
 const patch={};for(const c of records){const n=applySla(null,c,ops.policy);patch[CASE_PREFIX+c.id]=n;ops=auditEvent(ops,'sla','Применён срок SLA к жалобе',c.id);}
 if(records.length){patch[moderationOpsKey(profile.id)]=cleanOperations(ops,profile);await api.storage.local.set(patch);}return records.length;
});}

export function recordDeadlineNotification(caseId,threshold){return enqueue(async()=>{
 const c=await getCase(caseId),profile=await profileForCase(c.profileId);if(!profile)return;
 const ops=auditEvent(await moderationOpsFor(profile),'notification',`Уведомление о сроке: ${threshold===0?'просрочка':threshold+' минут'}`,c.id);
 await api.storage.local.set({[moderationOpsKey(profile.id)]:cleanOperations(ops,profile)});
});}
