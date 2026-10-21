import { api } from './browser.mjs';
import { PREFIX, MAX_RECORDS, cleanRecord, createRecord, editRecord, validateRecords } from './economy-core.mjs';
let serial=Promise.resolve();
function enqueue(fn){const job=serial.then(fn);serial=job.catch(()=>{});return job;}
export function parseStored(raw){return Object.entries(raw).filter(([key])=>key.startsWith(PREFIX)).flatMap(([key,value])=>{
  try {const item=cleanRecord(value);return key===PREFIX+item.id?[item]:[];}
  catch(err){console.warn('MajesticToolkit: повреждённая запись экономики пропущена',key,err);return [];}
});}
export async function listEconomy(){return parseStored(await api.storage.local.get(null)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));}
export async function getEconomy(id){if(typeof id!=='string'||!/^[\w-]{8,120}$/.test(id))throw Error('Неверный ID');
  const entry=(await api.storage.local.get(PREFIX+id))[PREFIX+id];if(!entry)throw Error('Запись не найдена');return cleanRecord(entry);}
export function addEconomy(type,profileId,data){return enqueue(async()=>{
  if((await listEconomy()).length>=MAX_RECORDS)throw Error('Достигнут лимит записей');
  const item=createRecord(type,profileId,data);await api.storage.local.set({[PREFIX+item.id]:item});return item;
});}
export function updateEconomy(id,fields){return enqueue(async()=>{
  const item=editRecord(await getEconomy(id),fields);await api.storage.local.set({[PREFIX+item.id]:item});return item;
});}
export function removeEconomy(id){return enqueue(async()=>{await getEconomy(id);await api.storage.local.remove(PREFIX+id);});}
export function replaceEconomy(records){return enqueue(async()=>{
  const next=validateRecords(records);const raw=await api.storage.local.get(null);
  const previous=Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith(PREFIX)));
  const update=Object.fromEntries(next.map(r=>[PREFIX+r.id,r]));
  try {if(Object.keys(update).length)await api.storage.local.set(update);
    const old=Object.keys(previous).filter(k=>!Object.hasOwn(update,k));if(old.length)await api.storage.local.remove(old);
  } catch(err){try{if(Object.keys(previous).length)await api.storage.local.set(previous);
    const added=Object.keys(update).filter(k=>!Object.hasOwn(previous,k));if(added.length)await api.storage.local.remove(added);
  }catch(rollbackError){throw new AggregateError([err,rollbackError],'Сбой восстановления хранилища после ошибки');}throw err;}
});}
