/** Persistent airdrop observations. All mutations validate the complete profile-linked ledger. */
import {api} from './browser.mjs';
import {AIRDROP_POINT_PREFIX,AIRDROP_EVENT_PREFIX,validateAirdrops,newAirdropPoint,changeAirdropPoint,newAirdropEvent,changeAirdropEvent,parseAirdropPackage} from './tactical-airdrop-core.mjs';
let serial=Promise.resolve();
const lock=fn=>{const job=serial.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-airdrop-v224',{mode:'exclusive'},fn):fn());serial=job.catch(()=>{});return job;};
const keys=row=>AIRDROP_POINT_PREFIX+row.id;
async function readRaw(){const data=await api.storage.local.get(null),points=[],events=[];for(const [key,value] of Object.entries(data)){
 if(key.startsWith(AIRDROP_POINT_PREFIX)){if(key!==AIRDROP_POINT_PREFIX+value?.id)throw Error('Повреждён ключ точки аирдропа');points.push(value);}
 if(key.startsWith(AIRDROP_EVENT_PREFIX)){if(key!==AIRDROP_EVENT_PREFIX+value?.id)throw Error('Повреждён ключ события аирдропа');events.push(value);}
}return {points,events};}
export async function listAirdrops(profileId=null){const rows=validateAirdrops(...Object.values(await readRaw()));return profileId?{points:rows.points.filter(x=>x.profileId===profileId),events:rows.events.filter(x=>x.profileId===profileId)}:rows;}
async function modify(prefix,id,profileId,edit){return lock(async()=>{const rows=await listAirdrops();const next=edit(rows);
 if(next.profileId!==profileId)throw Error('Попытка изменить запись другого профиля');validateAirdrops(rows.points,rows.events);
 await api.storage.local.set({[prefix+(id||next.id)]:next});return next;
});}
export function addAirdropPoint(profileId,fields){return modify(AIRDROP_POINT_PREFIX,null,profileId,rows=>{const row=newAirdropPoint(profileId,fields);rows.points.push(row);return row;});}
export function updateAirdropPoint(id,profileId,action,fields={}){return modify(AIRDROP_POINT_PREFIX,id,profileId,rows=>{const idx=rows.points.findIndex(x=>x.id===id&&x.profileId===profileId);if(idx<0)throw Error('Точка не найдена');const current=rows.points[idx];
 if(action==='edit'&&rows.events.some(x=>x.pointId===id)&&(['x','y','mapSha256'].some(k=>fields[k]!==current[k])))throw Error('Нельзя перемещать точку с зарегистрированными аирдропами');
 if(action==='archive'&&fields.archived===true&&rows.events.some(x=>x.pointId===id&&['planned','active','claimed'].includes(x.status)))throw Error('Есть незавершённые аирдропы для этой точки');
 const next=changeAirdropPoint(current,action,fields);rows.points[idx]=next;return next;
});}
export function addAirdropEvent(profileId,fields){return modify(AIRDROP_EVENT_PREFIX,null,profileId,rows=>{const point=rows.points.find(x=>x.id===fields.pointId&&x.profileId===profileId);if(!point||point.archived)throw Error('Точка появления недоступна');const next=newAirdropEvent(profileId,fields);rows.events.push(next);return next;});}
export function updateAirdropEvent(id,profileId,action,fields={}){return modify(AIRDROP_EVENT_PREFIX,id,profileId,rows=>{const index=rows.events.findIndex(x=>x.id===id&&x.profileId===profileId);if(index<0)throw Error('Аирдроп отсутствует в профиле');if(action==='edit'){const point=rows.points.find(x=>x.id===fields.pointId&&x.profileId===profileId);if(!point||point.archived)throw Error('Выбранная точка недоступна');}
 const next=changeAirdropEvent(rows.events[index],action,fields);rows.events[index]=next;return next;});}
// Archive transfer: imported packages can replace only this profile, preserving all other profiles.
export function importAirdrops(profileId,raw){return lock(async()=>{const incoming=parseAirdropPackage(raw,profileId),before=await readRaw();const current=validateAirdrops(before.points,before.events);
 const keptPoints=current.points.filter(x=>x.profileId!==profileId),keptEvents=current.events.filter(x=>x.profileId!==profileId);
 validateAirdrops([...keptPoints,...incoming.points],[...keptEvents,...incoming.events]);
 const prev=Object.fromEntries([...current.points.filter(x=>x.profileId===profileId).map(x=>[AIRDROP_POINT_PREFIX+x.id,x]),...current.events.filter(x=>x.profileId===profileId).map(x=>[AIRDROP_EVENT_PREFIX+x.id,x])]);
 const target=Object.fromEntries([...incoming.points.map(x=>[AIRDROP_POINT_PREFIX+x.id,x]),...incoming.events.map(x=>[AIRDROP_EVENT_PREFIX+x.id,x])]);
 try{if(Object.keys(target).length)await api.storage.local.set(target);const stale=Object.keys(prev).filter(x=>!Object.hasOwn(target,x));if(stale.length)await api.storage.local.remove(stale);}catch(error){try{const created=Object.keys(target).filter(x=>!Object.hasOwn(prev,x));if(created.length)await api.storage.local.remove(created);if(Object.keys(prev).length)await api.storage.local.set(prev);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось откатить импорт аирдропов');}throw error;}
 return incoming;
});}
export function clearOrphanAirdrops(profileIds){return lock(async()=>{const rows=await readRaw(),valid=new Set(profileIds),keys=[...rows.points.filter(x=>!valid.has(x.profileId)).map(x=>AIRDROP_POINT_PREFIX+x.id),...rows.events.filter(x=>!valid.has(x.profileId)).map(x=>AIRDROP_EVENT_PREFIX+x.id)];if(keys.length)await api.storage.local.remove(keys);return keys.length;});}
