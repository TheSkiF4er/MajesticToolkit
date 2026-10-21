import { api } from './browser.mjs';
import { LAW_PREFIX, LIMITS, cleanLawRecord, validateLawRecords, createBook, updateBookMetadata, addEdition, switchEdition, createMemo, updateMemo, makeFavorite } from './law-core.mjs';
let serial=Promise.resolve();
const enqueue=(fn)=>{const job=serial.then(fn);serial=job.catch(()=>{});return job;};
export function parseLawStorage(raw){return Object.entries(raw).filter(([key])=>key.startsWith(LAW_PREFIX)).flatMap(([key,value])=>{try{const item=cleanLawRecord(value);return key===LAW_PREFIX+item.id?[item]:[];}catch(error){console.warn('MajesticToolkit: некорректная запись Law Codex',key,error);return [];}});}
export async function listLawRecords(){return parseLawStorage(await api.storage.local.get(null)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function getLawRecord(id){if(!/^[a-zA-Z0-9_-]{8,120}$/.test(String(id)))throw Error('Неверный идентификатор');const object=(await api.storage.local.get(LAW_PREFIX+id))[LAW_PREFIX+id];if(!object)throw Error('Запись Law Codex не найдена');return cleanLawRecord(object);}
async function put(record){const checked=cleanLawRecord(record);await api.storage.local.set({[LAW_PREFIX+checked.id]:checked});return checked;}
export function newLawBook(profileId,fields){return enqueue(async()=>{const records=await listLawRecords();if(records.length>=LIMITS.records||records.filter(r=>r.type==='book').length>=LIMITS.books)throw Error('Лимит записей Law Codex');return put(createBook(profileId,fields));});}
export function editLawBook(id,fields){return enqueue(async()=>put(updateBookMetadata(await getLawRecord(id),fields)));}
export function newLawEdition(id,fields){return enqueue(async()=>put(addEdition(await getLawRecord(id),fields)));}
export function chooseLawEdition(id,editionId){return enqueue(async()=>put(switchEdition(await getLawRecord(id),editionId)));}
export function newLawMemo(profileId,fields){return enqueue(async()=>{if((await listLawRecords()).length>=LIMITS.records)throw Error('Лимит записей');return put(createMemo(profileId,fields));});}
export function editLawMemo(id,fields){return enqueue(async()=>put(updateMemo(await getLawRecord(id),fields)));}
export function toggleLawFavorite(profileId,bookId,articleKey){return enqueue(async()=>{const book=await getLawRecord(bookId);if(book.type!=='book'||book.profileId!==profileId)throw Error('Закон относится к другому профилю');const entries=await listLawRecords();const current=entries.find(r=>r.type==='favorite'&&r.profileId===profileId&&r.bookId===bookId&&r.articleKey.toLowerCase()===articleKey.toLowerCase());if(current){await api.storage.local.remove(LAW_PREFIX+current.id);return false;}if(entries.length>=LIMITS.records)throw Error('Лимит записей');if(!book.editions.some(ed=>ed.articles.some(a=>a.key.toLowerCase()===articleKey.toLowerCase())))throw Error('Статья не найдена');await put(makeFavorite(profileId,bookId,articleKey));return true;});}
export function removeLawRecord(id){return enqueue(async()=>{const record=await getLawRecord(id);if(record.type==='book'){const linked=(await listLawRecords()).filter(r=>r.type!=='book'&&r.bookId===id);await api.storage.local.remove([LAW_PREFIX+id,...linked.map(r=>LAW_PREFIX+r.id)]);}else await api.storage.local.remove(LAW_PREFIX+id);});}
export function replaceLawRecords(records,profiles){return enqueue(async()=>{
  const validated=validateLawRecords(records,profiles);const raw=await api.storage.local.get(null);const before=Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith(LAW_PREFIX)));const after=Object.fromEntries(validated.map(r=>[LAW_PREFIX+r.id,r]));
  try{if(Object.keys(after).length)await api.storage.local.set(after);const stale=Object.keys(before).filter(k=>!Object.hasOwn(after,k));if(stale.length)await api.storage.local.remove(stale);}
  catch(error){try{if(Object.keys(before).length)await api.storage.local.set(before);const introduced=Object.keys(after).filter(k=>!Object.hasOwn(before,k));if(introduced.length)await api.storage.local.remove(introduced);}catch(rollbackError){throw new AggregateError([error,rollbackError],'Не удалось откатить обновление Law Codex');}throw error;}
});}
