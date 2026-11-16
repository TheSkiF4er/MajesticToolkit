import './forum-core.js';
import {parseRulesImport,planRulesImport} from './rules-import.mjs';
import {loadState} from './state.mjs';
import {listRules,withRulesWriteLock} from './rules-store.mjs';
import './xenforo-core.js';
import {listXenForoLinks} from './xenforo-store.mjs';
import {createRestorePoint,completeRestorePoint} from './recovery.mjs';
import { api } from './browser.mjs';
const C = globalThis.RPNForumCore;
const prefix = C.KEY_PREFIX;
let mutations = Promise.resolve();
function serialize(callback) {
  const job = mutations.then(callback);
  mutations = job.catch(() => {});
  return job;
}
function fromStorage(value) {
  const out = [];
  for (const [key, object] of Object.entries(value)) {
    if (!key.startsWith(prefix)) continue;
    try { const record = C.cleanTemplate(object); if (key === prefix + record.id) out.push(record); }
    catch (error) { console.warn('MajesticToolkit: invalid template skipped', key, error); }
  }
  return out;
}
export async function listTemplates() { return fromStorage(await api.storage.local.get(null)); }
export async function upsertTemplate(input, id = null) {
  return serialize(async () => {
    const records = await listTemplates();
    const old = id ? records.find(x => x.id === id) : null;
    if (id && !old) throw new Error('Шаблон не найден или повреждён');
    if (!old && records.length >= C.MAX_TEMPLATES) throw new Error('Достигнут лимит шаблонов');
    if(old?.legacy&&old.profileId!==input.profileId)throw Error('Связанный бинд нельзя переносить между профилями. Импортируйте набор в целевой профиль.');
    let item = C.createTemplate(input, old);
    if(item.shortcut&&records.some(t=>t.id!==item.id&&t.profileId===item.profileId&&t.shortcut===item.shortcut))throw Error('Сочетание клавиш уже занято в этом профиле');
    if(old&&['label','category','text','format','shortcut','variables','tags'].some(k=>JSON.stringify(old[k])!==JSON.stringify(item[k]))){
      const {id,profileId,createdAt,history,...snapshot}=old;
      item=C.cleanTemplate({...item,history:[snapshot,...(history??[])].slice(0,10)});
    }
    await api.storage.local.set({ [prefix + item.id]: item });
    return item;
  });
}
export async function removeTemplate(id) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new Error('Неверный ID');
  return serialize(() => api.storage.local.remove(prefix + id));
}
export async function replaceTemplates(records) {
  return serialize(async () => {
    if (!Array.isArray(records) || records.length > C.MAX_TEMPLATES) throw new Error('Превышен лимит шаблонов');
    const seen = new Set(), validated = records.map(item => {
      const record = C.cleanTemplate(item);
      if (seen.has(record.id)) throw new Error('Повторяющиеся шаблоны');
      seen.add(record.id);
      return record;
    });
    const old = await api.storage.local.get(null);
    const oldKeys = Object.keys(old).filter(k => k.startsWith(prefix));
    const update = Object.fromEntries(validated.map(t => [prefix + t.id, t]));
    // Pre-write new values, then remove stale keys. If storage fails, restore the original records.
    try {
      if (Object.keys(update).length) await api.storage.local.set(update);
      const remove = oldKeys.filter(k => !Object.hasOwn(update, k));
      if (remove.length) await api.storage.local.remove(remove);
    } catch (error) {
      const previous = Object.fromEntries(oldKeys.map(k => [k, old[k]]));
      if (oldKeys.length) await api.storage.local.set(previous);
      const introduced = Object.keys(update).filter(k => !oldKeys.includes(k));
      if (introduced.length) await api.storage.local.remove(introduced);
      throw error;
    }
  });
}
export function makeFullBackup(profileState, templates) {
  const checked = templates.map(C.cleanTemplate);
  if (checked.length > C.MAX_TEMPLATES) throw new Error('Слишком много шаблонов');
  return JSON.stringify({ format: 'rp-nexus-backup', schemaVersion: 2, exportedAt: new Date().toISOString(), payload: profileState, forumTemplates: checked }, null, 2);
}
export function parseFullBackup(text, validateState) {
  if (typeof text !== 'string' || text.length > 8 * 1024 * 1024) throw new Error('Размер копии превышает 8 МиБ');
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('Некорректный JSON'); }
  if (obj?.format !== 'rp-nexus-backup' || !Number.isFinite(Date.parse(obj.exportedAt))) throw new Error('Неверный формат копии');
  if (obj.schemaVersion !== 1 && obj.schemaVersion !== 2) throw new Error('Неподдерживаемая версия копии');
  const profiles = validateState(obj.payload);
  const templates = obj.schemaVersion === 2 ? obj.forumTemplates : [];
  if (!Array.isArray(templates) || templates.length > C.MAX_TEMPLATES) throw new Error('Некорректные шаблоны');
  const seen = new Set();
  const validTemplates = templates.map(t => {
    const x = C.cleanTemplate(t);
    if (seen.has(x.id)) throw new Error('Повторяющийся ID шаблона');
    seen.add(x.id);
    if (x.profileId !== '*' && !profiles.profiles.some(p => p.id === x.profileId)) throw new Error('Шаблон связан с отсутствующим профилем');
    return x;
  });
  return { state: profiles, templates: validTemplates, legacy: obj.schemaVersion === 1 };
}

// Usage is isolated by profile even when a template is shared across profiles.
const usageKey=id=>'mtBinderUsage:'+encodeURIComponent(id);
export async function binderUsage(profileId){
  if(typeof profileId!=='string'||!profileId||profileId.length>128)throw Error('Неверный профиль');
  const key=usageKey(profileId),raw=(await api.storage.local.get(key))[key];
  return Object.fromEntries(Object.entries(raw??{}).filter(([id,time])=>/^[a-zA-Z0-9_-]{8,100}$/.test(id)&&Number.isFinite(time)&&time>0).sort((a,b)=>b[1]-a[1]).slice(0,C.MAX_TEMPLATES));
}
export function recordBinderUsage(profileId,id){return serialize(async()=>{
  const t=(await listTemplates()).find(t=>t.id===id&&(t.profileId==='*'||t.profileId===profileId));
  if(!t)throw Error('Шаблон недоступен');
  const usage=await binderUsage(profileId);usage[id]=Date.now();
  await api.storage.local.set({[usageKey(profileId)]:Object.fromEntries(Object.entries(usage).sort((a,b)=>b[1]-a[1]).slice(0,C.MAX_TEMPLATES))});return true;
});}
export function setBinderFavorite(id,profileId,favorite){return serialize(async()=>{
  const old=(await listTemplates()).find(t=>t.id===id&&(t.profileId==='*'||t.profileId===profileId));
  if(!old)throw Error('Шаблон недоступен');
  const item=C.cleanTemplate({...old,favorite:favorite===true});await api.storage.local.set({[prefix+id]:item});return item;
});}
// Import is additive and writes the entire validated batch in one storage operation.
export function importBinderPack(text,profileId,mode='skip'){return serialize(async()=>{
  if(!['skip','replace','add'].includes(mode))throw Error('Неверный режим импорта');
  const pack=C.parseImport(text,profileId),rows=pack.templates,existing=await listTemplates(),out=new Map(existing.map(t=>[t.id,t])),writes={};let imported=0,skipped=0,unassigned=0;
  for(const row of rows){
    const same=[...out.values()].find(t=>t.profileId===profileId&&(t.id===row.id||(t.label===row.label&&t.category===row.category&&(mode==='replace'||t.text===row.text))));
    if(same&&mode==='skip'){skipped++;continue;}
    let item=C.createTemplate({...row,variables:row.variables??[],tags:row.tags??[],favorite:row.favorite??false,order:row.order??1000000},mode==='replace'&&same?same:null);
    if(mode!=='add'&&!same&&!out.has(row.id))item={...item,id:row.id};
    if(mode==='replace'&&same){const {id,profileId,createdAt,history,...snapshot}=same;item={...item,history:[snapshot,...(history??[])].slice(0,10)};}else if(row.history)item={...item,history:row.history};
    if(item.shortcut&&[...out.values()].some(t=>t.id!==item.id&&t.profileId===profileId&&t.shortcut===item.shortcut)){item={...item,shortcut:0};unassigned++;}
    item=C.cleanTemplate(item);out.set(item.id,item);writes[prefix+item.id]=item;imported++;
  }
  if(out.size>C.MAX_TEMPLATES)throw Error('Превышен лимит шаблонов');
  const XF=globalThis.MTXenForo,links=await listXenForoLinks(),linkRows=[...links];let linksImported=0;
  for(const l of pack.links){
    const same=linkRows.find(x=>x.kind!=='bookmark'&&x.profileId===profileId&&x.url===l.url);
    if(same&&mode==='skip')continue;
    const item=XF.validateLink({...((mode==='replace'&&same)?same:{}),...l,profileId,id:mode==='replace'&&same?same.id:XF.newLinkId(),createdAt:mode==='replace'&&same?same.createdAt:new Date().toISOString()});
    if(mode==='replace'&&same)linkRows.splice(linkRows.indexOf(same),1,item);else linkRows.push(item);
    writes[XF.PREFIX+item.id]=item;linksImported++;
  }
  XF.validateLinks(linkRows);
  if(imported||linksImported){await createRestorePoint(api.storage.local);await api.storage.local.set(writes);await completeRestorePoint(api.storage.local);}
  return {imported,skipped,unassigned,linksImported};
});}

export function bulkBinderTemplates(ids,profileId,action,folder=''){return serialize(async()=>{
  if(!Array.isArray(ids)||!ids.length||ids.length>C.MAX_TEMPLATES||new Set(ids).size!==ids.length||!['move','delete'].includes(action))throw Error('Некорректная массовая операция');
  const all=await listTemplates(),rows=ids.map(id=>all.find(t=>t.id===id&&(t.profileId==='*'||t.profileId===profileId)));
  if(rows.some(t=>!t))throw Error('Шаблон недоступен');
  const writes=action==='move'?Object.fromEntries(rows.map(t=>{const {id,profileId,createdAt,history,...snapshot}=t;const item=C.cleanTemplate({...t,category:folder,updatedAt:new Date().toISOString(),history:[snapshot,...(history??[])].slice(0,10)});return [prefix+t.id,item];})):null;
  await createRestorePoint(api.storage.local);if(writes)await api.storage.local.set(writes);else await api.storage.local.remove(ids.map(id=>prefix+id));await completeRestorePoint(api.storage.local);return rows.length;
});}

// One validated batch covers profiles, templates, rules and navigation; recovery precedes writes.
export function importStructuredBinder(raw,profileId,mode='merge'){return serialize(()=>withRulesWriteLock(async()=>{
 const state=await loadState(),profile=state.profiles.find(p=>p.id===profileId);
 const pack=parseRulesImport(raw,profile);
 const plan=await planRulesImport(pack,state,profileId,await listTemplates(),await listRules(),await listXenForoLinks(),mode);
 if(Object.keys(plan.writes).length){await createRestorePoint(api.storage.local);await api.storage.local.set(plan.writes);await completeRestorePoint(api.storage.local);}
 return plan.report;
}));}
