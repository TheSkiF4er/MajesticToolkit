/** Profile-isolated organization data store with replay and inventory ownership checks. */
import {api} from './browser.mjs';
import {TERRITORY_PREFIX,CRIME_EVENT_PREFIX,cleanTerritory,cleanCrimeEvent} from './crime-core.mjs';
import {ORGANIZATION_PREFIX,MAX_ORGANIZATIONS,cleanOrganization,newOrganization,applyOrganization,validateOrganizations} from './organization-core.mjs';
import {listInventory,loadInventory} from './inventory-store.mjs';
let queue=Promise.resolve();
const locked=fn=>{const job=queue.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-organizations-v215',{mode:'exclusive'},fn):fn());queue=job.catch(()=>{});return job;};
const ownerMatch=(event,org)=>event.profileId===org.profileId&&((event.ownerType==='organization'&&event.ownerName?.toLocaleLowerCase('ru')===org.name.toLocaleLowerCase('ru'))||(event.toOwnerType==='organization'&&event.toOwnerName?.toLocaleLowerCase('ru')===org.name.toLocaleLowerCase('ru')));
async function inventoryRefs(org){return (await listInventory()).some(batch=>batch.profileId===org.profileId&&batch.events.some(event=>ownerMatch(event,org)));}
async function crimeRefs(groupId,profileId){const raw=await api.storage.local.get(null);return Object.entries(raw).some(([key,value])=>{if(key.startsWith(TERRITORY_PREFIX)){const row=cleanTerritory(value);return row.profileId===profileId&&row.initialOwner.type==='organization'&&row.initialOwner.id===groupId;}if(key.startsWith(CRIME_EVENT_PREFIX)){const row=cleanCrimeEvent(value);return row.profileId===profileId&&[row.attacker,row.defender].some(g=>g.type==='organization'&&g.id===groupId);}return false;});}
async function all(){const raw=await api.storage.local.get(null),rows=[];for(const [key,value] of Object.entries(raw))if(key.startsWith(ORGANIZATION_PREFIX)){const record=cleanOrganization(value);if(key!==ORGANIZATION_PREFIX+record.id)throw Error('Повреждён ключ организации');rows.push(record);}return validateOrganizations(rows);}
export async function listOrganizations(profileId=null){return (await all()).filter(x=>profileId===null||x.profileId===profileId).sort((a,b)=>a.name.localeCompare(b.name,'ru'));}
export async function getOrganization(orgId,profileId){const record=(await all()).find(x=>x.id===orgId&&x.profileId===profileId);if(!record)throw Error('Организация отсутствует в профиле');return record;}
export function addOrganization(profileId,fields){return locked(async()=>{const rows=await all();if(rows.length>=MAX_ORGANIZATIONS)throw Error('Достигнут лимит организаций');const org=newOrganization(profileId,fields);validateOrganizations([...rows,org]);await api.storage.local.set({[ORGANIZATION_PREFIX+org.id]:org});return org;});}
export function updateOrganization(orgId,profileId,kind,fields={}){return locked(async()=>{
 const rows=await all(),before=rows.find(x=>x.id===orgId&&x.profileId===profileId);if(!before)throw Error('Организация отсутствует в профиле');
 const after=applyOrganization(before,kind,fields);validateOrganizations(rows.map(x=>x.id===orgId?after:x));
 if(after.name!==before.name&&await inventoryRefs(before))throw Error('Организация упоминается в складском журнале: нельзя переименовать владельца исторических операций.');
 if(after.archived&&!before.archived){const inventory=await loadInventory(profileId);if(inventory.stock.some(row=>row.ownerType==='organization'&&row.ownerName.toLocaleLowerCase('ru')===before.name.toLocaleLowerCase('ru')&&row.quantity>0))throw Error('Нельзя архивировать организацию, пока на её складе остались товары.');}
 await api.storage.local.set({[ORGANIZATION_PREFIX+orgId]:after});return after;
});}
export function removeOrganization(orgId,profileId){return locked(async()=>{const rows=await all(),org=rows.find(x=>x.id===orgId&&x.profileId===profileId);if(!org)throw Error('Организация отсутствует в профиле');if(await crimeRefs(orgId,profileId))throw Error('Организация используется в RP-событиях или историях территорий. Архивируйте её.');if(org.events.length>3||await inventoryRefs(org))throw Error('У организации есть история или складские операции — используйте архивирование');await api.storage.local.remove(ORGANIZATION_PREFIX+orgId);return org;});}
export function replaceOrganizations(rows,profileIds=null){return locked(async()=>{
 const next=validateOrganizations(rows,profileIds),raw=await api.storage.local.get(null),before=Object.fromEntries(Object.entries(raw).filter(([key])=>key.startsWith(ORGANIZATION_PREFIX))),update=Object.fromEntries(next.map(org=>[ORGANIZATION_PREFIX+org.id,org]));
 try{if(Object.keys(update).length)await api.storage.local.set(update);const removed=Object.keys(before).filter(key=>!Object.hasOwn(update,key));if(removed.length)await api.storage.local.remove(removed);}catch(error){try{const extra=Object.keys(update).filter(key=>!Object.hasOwn(before,key));if(extra.length)await api.storage.local.remove(extra);if(Object.keys(before).length)await api.storage.local.set(before);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось откатить реестр организаций');}throw error;}return next;
});}
