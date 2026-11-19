import {withTacticalWriteLock} from './tactical-lock.mjs';
/** Persistent airdrop observations. All mutations validate the complete profile-linked ledger. */
import {api} from './browser.mjs';
import {TACTICAL_LINK_PREFIX,cleanTacticalLink} from './tactical-links-core.mjs';
import {getTacticalMap} from './tactical-map-store.mjs';
import {AIRDROP_POINT_PREFIX,AIRDROP_EVENT_PREFIX,validateAirdrops,newAirdropPoint,changeAirdropPoint,newAirdropEvent,changeAirdropEvent,parseAirdropPackage} from './tactical-airdrop-core.mjs';
const lock=withTacticalWriteLock;
const keys=row=>AIRDROP_POINT_PREFIX+row.id;
async function readRaw(){const data=await api.storage.local.get(null),points=[],events=[];for(const [key,value] of Object.entries(data)){
 if(key.startsWith(AIRDROP_POINT_PREFIX)){if(key!==AIRDROP_POINT_PREFIX+value?.id)throw Error('Повреждён ключ точки аирдропа');points.push(value);}
 if(key.startsWith(AIRDROP_EVENT_PREFIX)){if(key!==AIRDROP_EVENT_PREFIX+value?.id)throw Error('Повреждён ключ события аирдропа');events.push(value);}
}return {points,events};}
export async function listAirdrops(profileId=null){const rows=validateAirdrops(...Object.values(await readRaw()));return profileId?{points:rows.points.filter(x=>x.profileId===profileId),events:rows.events.filter(x=>x.profileId===profileId)}:rows;}
async function checkPointMap(profileId,sha256){
 if(!sha256)return;
 const map=await getTacticalMap(profileId);
 if(!map||map.meta.sha256!==sha256)throw Error('Точка аирдропа ссылается на отсутствующую или изменённую подложку карты');
}
async function modify(prefix,id,profileId,edit){return lock(async()=>{const rows=await listAirdrops();const next=edit(rows);
 if(next.profileId!==profileId)throw Error('Попытка изменить запись другого профиля');validateAirdrops(rows.points,rows.events);
 if(prefix===AIRDROP_POINT_PREFIX)await checkPointMap(profileId,next.mapSha256);
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
/** Explicit deletion keeps historic records unless all dependent records are removed. */
export function deleteAirdropEvent(profileId,id){return lock(async()=>{
 const rows=await listAirdrops(),event=rows.events.find(x=>x.profileId===profileId&&x.id===id);
 if(!event)throw Error('Аирдроп отсутствует в профиле');
 if(!['completed','cancelled'].includes(event.status))throw Error('Сначала завершите или отмените аирдроп');
 const all=await api.storage.local.get(null);
 for(const [key,raw] of Object.entries(all))if(key.startsWith(TACTICAL_LINK_PREFIX)){
  const link=cleanTacticalLink(raw);
  if(key!==TACTICAL_LINK_PREFIX+link.id)throw Error('Повреждён ключ тактической ссылки');
  if(link.profileId===profileId&&link.entityType==='airdrop'&&link.entityId===id)throw Error('Аирдроп связан с источником. Сначала удалите связь');
 }
 await api.storage.local.remove(AIRDROP_EVENT_PREFIX+id);return event;
});}
export function deleteAirdropPoint(profileId,id){return lock(async()=>{
 const rows=await listAirdrops(),point=rows.points.find(x=>x.profileId===profileId&&x.id===id);
 if(!point)throw Error('Точка аирдропа отсутствует в профиле');
 if(!point.archived)throw Error('Сначала перенесите точку аирдропа в архив');
 if(rows.events.some(x=>x.profileId===profileId&&x.pointId===id))throw Error('Точка используется зарегистрированными аирдропами');
 await api.storage.local.remove(AIRDROP_POINT_PREFIX+id);return point;
});}
// Archive transfer: imported packages can replace only this profile, preserving all other profiles.
export function importAirdrops(profileId,raw){return lock(async()=>{const incoming=parseAirdropPackage(raw,profileId),before=await readRaw();const current=validateAirdrops(before.points,before.events);
 const mapHashes=new Set(incoming.points.map(x=>x.mapSha256).filter(Boolean));
 if(mapHashes.size>1)throw Error('Импорт аирдропов содержит точки разных версий карты');
 for(const hash of mapHashes)await checkPointMap(profileId,hash);
 const keptPoints=current.points.filter(x=>x.profileId!==profileId),keptEvents=current.events.filter(x=>x.profileId!==profileId);
 validateAirdrops([...keptPoints,...incoming.points],[...keptEvents,...incoming.events]);
 const prev=Object.fromEntries([...current.points.filter(x=>x.profileId===profileId).map(x=>[AIRDROP_POINT_PREFIX+x.id,x]),...current.events.filter(x=>x.profileId===profileId).map(x=>[AIRDROP_EVENT_PREFIX+x.id,x])]);
 const target=Object.fromEntries([...incoming.points.map(x=>[AIRDROP_POINT_PREFIX+x.id,x]),...incoming.events.map(x=>[AIRDROP_EVENT_PREFIX+x.id,x])]);
 try{if(Object.keys(target).length)await api.storage.local.set(target);const stale=Object.keys(prev).filter(x=>!Object.hasOwn(target,x));if(stale.length)await api.storage.local.remove(stale);}catch(error){try{const created=Object.keys(target).filter(x=>!Object.hasOwn(prev,x));if(created.length)await api.storage.local.remove(created);if(Object.keys(prev).length)await api.storage.local.set(prev);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось откатить импорт аирдропов');}throw error;}
 return incoming;
});}
export function clearOrphanAirdrops(profileIds){return lock(async()=>{const rows=await readRaw(),valid=new Set(profileIds),keys=[...rows.points.filter(x=>!valid.has(x.profileId)).map(x=>AIRDROP_POINT_PREFIX+x.id),...rows.events.filter(x=>!valid.has(x.profileId)).map(x=>AIRDROP_EVENT_PREFIX+x.id)];if(keys.length)await api.storage.local.remove(keys);return keys.length;});}
