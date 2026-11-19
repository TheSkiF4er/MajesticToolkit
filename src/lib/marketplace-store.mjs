import {api} from './browser.mjs';
import {listInventory} from './inventory-store.mjs';
import {MARKET_PREFIX,MAX_MARKET_ROWS,cleanMarketRecord,newMarketRecord,changeMarketRecord,validateMarketplace} from './marketplace-core.mjs';
let sequence=Promise.resolve();
function locked(fn){const job=sequence.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-trading-inventory-v213',{mode:'exclusive'},fn):fn());sequence=job.catch(()=>{});return job;}
function parseRows(raw){return Object.entries(raw).filter(([k])=>k.startsWith(MARKET_PREFIX)).map(([k,v])=>{const row=cleanMarketRecord(v);if(k!==MARKET_PREFIX+row.id)throw Error('Повреждённый ключ записи рынка: '+k);return row;});}
async function all(){const rows=parseRows(await api.storage.local.get(null));return validateMarketplace(rows);}
export async function listMarketplace(profileId=null){const rows=await all();return rows.filter(r=>!profileId||r.profileId===profileId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));}
export async function getMarketplace(id,profileId){if(typeof id!=='string'||!/^[\w-]{8,120}$/.test(id))throw Error('Неверный идентификатор рынка');const row=(await api.storage.local.get(MARKET_PREFIX+id))[MARKET_PREFIX+id];if(!row)throw Error('Рыночная запись не найдена');const clean=cleanMarketRecord(row);if(clean.id!==id||profileId&&clean.profileId!==profileId)throw Error('Рыночная запись другого профиля');return clean;}
export function addMarketplace(type,profileId,values){return locked(async()=>{const rows=await all();if(rows.length>=MAX_MARKET_ROWS)throw Error('Лимит рыночных записей достигнут');const row=newMarketRecord(type,profileId,values);validateMarketplace([...rows,row]);if(row.type==='listing'&&row.status==='active'&&rows.some(p=>p.id===row.productId&&p.archived))throw Error('Нельзя публиковать активное объявление по архивному товару');await api.storage.local.set({[MARKET_PREFIX+row.id]:row});return row;});}
export function updateMarketplace(id,profileId,values){return locked(async()=>{const rows=await all();const previous=rows.find(r=>r.id===id&&r.profileId===profileId);if(!previous)throw Error('Рыночная запись другого профиля или удалена');const next=changeMarketRecord(previous,values);
 if(next.type==='product'&&next.archived&&rows.some(r=>r.type==='listing'&&r.productId===next.id&&r.status==='active'))throw Error('Закройте активные объявления перед архивированием товара');
 if(next.type==='listing'&&next.status==='active'&&rows.some(p=>p.id===next.productId&&p.archived))throw Error('Архивный товар не может иметь активные объявления');
 validateMarketplace(rows.map(r=>r.id===id?next:r));await api.storage.local.set({[MARKET_PREFIX+id]:next});return next;});}
export function removeMarketplace(id,profileId){return locked(async()=>{const rows=await all();const previous=rows.find(r=>r.id===id&&r.profileId===profileId);if(!previous)throw Error('Рыночная запись другого профиля или удалена');if(previous.type==='product'&&Object.entries(await api.storage.local.get(null)).some(([k,v])=>k.startsWith('mtEconomyLinkV219:')&&v.entityType==='product'&&v.entityId===id&&v.profileId===profileId))throw Error('Товар связан с документом или доказательством. Сначала удалите связь.');if(previous.type==='product'){if(rows.some(r=>r.productId===id))throw Error('Товар используется в объявлениях или истории цен. Архивируйте товар вместо удаления.');if((await listInventory()).some(b=>b.events.some(e=>e.productId===id)))throw Error('Товар используется в складских операциях. Архивируйте товар вместо удаления.');}await api.storage.local.remove(MARKET_PREFIX+id);return previous;});}
export function replaceMarketplace(records,profileIds=null){return locked(async()=>{
 const next=validateMarketplace(records,profileIds);const inventory=await listInventory();
 const productIds=new Set(next.filter(r=>r.type==='product').map(r=>r.id));
 if(inventory.some(b=>b.events.some(e=>e.productId&&!productIds.has(e.productId))))throw Error('Нельзя удалить товар, используемый складским журналом');
 const raw=await api.storage.local.get(null);
 // Include damaged storage rows in rollback: never silently discard corrupt data.
 const previous=Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith(MARKET_PREFIX)));
 const update=Object.fromEntries(next.map(row=>[MARKET_PREFIX+row.id,row]));
 try{if(Object.keys(update).length)await api.storage.local.set(update);const obsolete=Object.keys(previous).filter(k=>!Object.hasOwn(update,k));if(obsolete.length)await api.storage.local.remove(obsolete);}
 catch(error){try{const added=Object.keys(update).filter(k=>!Object.hasOwn(previous,k));if(added.length)await api.storage.local.remove(added);if(Object.keys(previous).length)await api.storage.local.set(previous);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось откатить восстановление рынка');}throw error;}
 return next;
});}
/** Append-only Marketplace import. Compare baseline INSIDE the write lock to avoid
 * overwriting market edits from another Toolkit tab after the user's preview. */
export function appendMarketplaceImport(records,expectedBaseline,profileIds){return locked(async()=>{
 const current=await all();
 const baseline=JSON.stringify(current.map(r=>[r.id,r.updatedAt]).sort((a,b)=>a[0].localeCompare(b[0])));
 if(baseline!==expectedBaseline)throw Error('Рынок изменился после предпросмотра. Повторите проверку файла');
 if(!Array.isArray(records))throw Error('Некорректные записи импорта');
 const next=validateMarketplace([...current,...records],profileIds);
 const known=new Set(current.map(r=>r.id)),added=next.filter(r=>!known.has(r.id));
 if(added.length!==records.length)throw Error('Импорт содержит повторяющиеся идентификаторы');
 const update=Object.fromEntries(added.map(r=>[MARKET_PREFIX+r.id,r]));
 try{if(added.length)await api.storage.local.set(update);}
 catch(error){try{if(added.length)await api.storage.local.remove(Object.keys(update));}catch(rollback){throw new AggregateError([error,rollback],'Не удалось откатить импорт рыночных данных');}throw error;}
 return added;
});}
