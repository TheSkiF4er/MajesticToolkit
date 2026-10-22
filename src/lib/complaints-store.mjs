import './complaints-core.js';
import { api } from './browser.mjs';
const C = globalThis.RPNComplaints;
export const CASE_PREFIX = C.PREFIX;
let serial = Promise.resolve();
function enqueue(fn) { const current = serial.then(fn); serial = current.catch(() => {}); return current; }
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
    await api.storage.local.set({ [CASE_PREFIX + complaint.id]: complaint });
    return complaint;
  });
}
export function editComplaint(id, patch) {
  return enqueue(async () => {
    const item = C.updateCase(await getCase(id), patch);
    await api.storage.local.set({ [CASE_PREFIX + id]: item });
    return item;
  });
}
export function addComplaintEvidence(id, input) {
  return enqueue(async () => {
    const item = C.addEvidence(await getCase(id), input);
    await api.storage.local.set({ [CASE_PREFIX + id]: item });
    return item;
  });
}
export function removeComplaintEvidence(id, evidenceId) {
  return enqueue(async () => {
    const item = C.removeEvidence(await getCase(id), evidenceId);
    await api.storage.local.set({ [CASE_PREFIX + id]: item });
    return item;
  });
}
// Serialized with evidence and status mutations to avoid lost workflow events.
export function mutateCaseWorkflow(id,action,payload={}) {
  return enqueue(async()=>{
    const updated=C.workflowAction(await getCase(id),action,payload);
    await api.storage.local.set({[CASE_PREFIX+id]:updated});
    return updated;
  });
}
export function removeComplaint(id) { return enqueue(async () => { await getCase(id); await api.storage.local.remove(CASE_PREFIX + id); }); }
export function observeThread(url, postId, profileId = null) {
  return enqueue(async () => {
    const key = C.threadKey(url);
    const cases = (await listCases()).filter(c => c.threadKey === key && c.watching && (!profileId || c.profileId===profileId));
    const changed = [];
    for (const c of cases) {
      const result = C.observeCase(c, postId);
      const samePost=result.item.lastSeenPostId===c.lastSeenPostId;
      const lastCheck=c.lastCheckedAt?Date.parse(c.lastCheckedAt):0;
      // Suppress redundant full-record writes during repeated scans of an unchanged thread.
      if(result.changed || !samePost || Date.now()-lastCheck>=4*60000)await api.storage.local.set({ [CASE_PREFIX + c.id]: result.item });
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
