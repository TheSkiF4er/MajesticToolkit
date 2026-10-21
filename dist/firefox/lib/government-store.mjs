import {api} from './browser.mjs';
import { GOV_PREFIX,GOV_LIMITS,cleanGovernment,validateGovernment,createDepartment,editDepartment,createTemplate,editTemplate,createDecision,editDecision,finalizeDecision,cloneDecision } from './government-core.mjs';
let chain=Promise.resolve();const enqueue=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
export function parseGovernmentStorage(raw){return Object.entries(raw).filter(([k])=>k.startsWith(GOV_PREFIX)).flatMap(([k,v])=>{try{const r=cleanGovernment(v);return k===GOV_PREFIX+r.id?[r]:[];}catch(err){console.warn('MajesticToolkit: повреждённая запись Government Tools',k,err);return [];}});}
export async function listGovernment(){return parseGovernmentStorage(await api.storage.local.get(null)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function getGovernment(id){if(typeof id!=='string'||!/^[\w-]{8,128}$/.test(id))throw Error('Неверный ID');const r=(await api.storage.local.get(GOV_PREFIX+id))[GOV_PREFIX+id];if(!r)throw Error('Запись Government Tools не найдена');return cleanGovernment(r);}
async function insert(r){const rows=await listGovernment();if(rows.length>=GOV_LIMITS.records)throw Error('Лимит записей Government Tools');const next=validateGovernment([...rows,r]);await api.storage.local.set({[GOV_PREFIX+r.id]:r});return r;}
async function update(r){const rows=await listGovernment();validateGovernment(rows.map(x=>x.id===r.id?r:x));await api.storage.local.set({[GOV_PREFIX+r.id]:r});return r;}
export const addDepartment=(profile,fields)=>enqueue(()=>insert(createDepartment(profile,fields)));
export const updateDepartment=(id,fields)=>enqueue(async()=>update(editDepartment(await getGovernment(id),fields)));
export const addTemplate=(profile,fields)=>enqueue(()=>insert(createTemplate(profile,fields)));
export const updateTemplate=(id,fields)=>enqueue(async()=>update(editTemplate(await getGovernment(id),fields)));
export const addDecision=(profile,fields,laws)=>enqueue(()=>insert(createDecision(profile,fields,laws)));
export const updateDecision=(id,fields,laws)=>enqueue(async()=>update(editDecision(await getGovernment(id),fields,laws)));
export const approveDecision=id=>enqueue(async()=>update(finalizeDecision(await getGovernment(id))));
export const duplicateDecision=id=>enqueue(async()=>insert(cloneDecision(await getGovernment(id))));
export function deleteGovernment(id){return enqueue(async()=>{const r=await getGovernment(id);const entries=await listGovernment();if(r.type==='department'&&entries.some(x=>x.departmentId===id))throw Error('Сначала удалите или перенесите связанные документы и шаблоны');await api.storage.local.remove(GOV_PREFIX+id);});}
export function replaceGovernment(raw,profileIds){return enqueue(async()=>{const records=validateGovernment(raw,profileIds);const original=Object.fromEntries(Object.entries(await api.storage.local.get(null)).filter(([k])=>k.startsWith(GOV_PREFIX)));const next=Object.fromEntries(records.map(r=>[GOV_PREFIX+r.id,r]));try{if(Object.keys(next).length)await api.storage.local.set(next);const stale=Object.keys(original).filter(k=>!Object.hasOwn(next,k));if(stale.length)await api.storage.local.remove(stale);}catch(error){try{if(Object.keys(original).length)await api.storage.local.set(original);const extra=Object.keys(next).filter(k=>!Object.hasOwn(original,k));if(extra.length)await api.storage.local.remove(extra);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось восстановить данные Government Tools после ошибки');}throw error;}});}
