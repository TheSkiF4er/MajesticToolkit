/** Explicit tactical collaboration bridge. Neither sharing nor importing runs automatically. */
import {api} from './browser.mjs';
import {withTacticalWriteLock} from './tactical-lock.mjs';
import {getTacticalMap,installSharedTacticalMap} from './tactical-map-store.mjs';
import {cleanPlan,PLAN_PREFIX,mutatePlan} from './tactical-planning-core.mjs';
import {AIRDROP_POINT_PREFIX,AIRDROP_EVENT_PREFIX,cleanAirdropPoint,cleanAirdropEvent,changeAirdropPoint,changeAirdropEvent,validateAirdrops} from './tactical-airdrop-core.mjs';
import {TERRITORY_PREFIX,CRIME_EVENT_PREFIX,cleanTerritory,cleanCrimeEvent,changeTerritory,changeCrimeEvent,validateCrime} from './crime-core.mjs';
import {cleanMapMeta} from './tactical-map-core.mjs';
const PREFIX={plan:PLAN_PREFIX,airdrop_point:AIRDROP_POINT_PREFIX,airdrop_event:AIRDROP_EVENT_PREFIX,territory:TERRITORY_PREFIX,territory_event:CRIME_EVENT_PREFIX};
const CLEAN={map:cleanMapMeta,plan:cleanPlan,airdrop_point:cleanAirdropPoint,airdrop_event:cleanAirdropEvent,territory:cleanTerritory,territory_event:cleanCrimeEvent};
export function tacticalRecordForProfile(kind,raw,profileId){
 if(!Object.hasOwn(CLEAN,kind))throw Error('Неизвестный тип тактической записи');
 const cloned=structuredClone(raw);
 cloned.profileId=profileId;
 if(kind==='plan'){
  cloned.history[0].data.profileId=profileId;
  cloned.state.profileId=profileId;
 }
 return CLEAN[kind](cloned);
}
export async function localTacticalChoices(profileId){
 const raw=await api.storage.local.get(null),choices=[];
 const map=await getTacticalMap(profileId,{verify:false});
 if(map)choices.push({kind:'map',id:'map-'+profileId,title:map.meta.name,description:map.meta.sha256.slice(0,12)});
 for(const [kind,prefix] of Object.entries(PREFIX))for(const [key,record] of Object.entries(raw)){
  if(!key.startsWith(prefix)||record?.profileId!==profileId)continue;
  const checked=CLEAN[kind](record);
  choices.push({kind,id:checked.id,title:checked.title||checked.name||`Событие ${checked.id}`,description:checked.updatedAt});
 }
 return choices.slice(0,2000);
}
export async function localTacticalRecord(profileId,kind,id){
 if(kind==='map')return (await getTacticalMap(profileId))?.meta??null;
 if(!Object.hasOwn(PREFIX,kind))throw Error('Неизвестный тип');
 const row=(await api.storage.local.get(PREFIX[kind]+id))[PREFIX[kind]+id];
 if(!row||row.profileId!==profileId)throw Error('Запись отсутствует в локальном RP-профиле');
 return CLEAN[kind](row);
}
export function editSharedTacticalRecord(kind,record,action,fields){
 if(kind==='plan')return mutatePlan(record,action,fields);
 if(kind==='airdrop_point')return changeAirdropPoint(record,action,fields);
 if(kind==='airdrop_event')return changeAirdropEvent(record,action,fields);
 if(kind==='territory')return changeTerritory(record,action,fields);
 if(kind==='territory_event')return changeCrimeEvent(record,action,fields);
 throw Error('Изменяйте разметку карты в локальном Tactical Map и публикуйте новую редакцию');
}
export async function applyTacticalCloudRecord(profileId,kind,record,image=null,{overwriteMap=false}={}){
 const local=tacticalRecordForProfile(kind,record,profileId);
 if(kind==='map'){
  if(!(image instanceof Uint8Array))throw Error('Отсутствует изображение карты');
  await installSharedTacticalMap(profileId,local,image,{overwrite:overwriteMap});return {imported:true};
 }
 const key=PREFIX[kind]+local.id;
 return withTacticalWriteLock(async()=>{
  const raw=await api.storage.local.get(null),existing=raw[key];
  if(existing){
   if(JSON.stringify(existing)===JSON.stringify(local))return {imported:false};
   throw Error('Локальная запись с тем же ID уже отличается от облачной. Автоматическая перезапись запрещена; разрешите конфликт вручную');
  }
  // Domain cross-record validation, not just a record-level JSON check.
  const collect=(prefix,clean)=>Object.entries(raw).filter(([k])=>k.startsWith(prefix)).map(([,v])=>clean(v));
  if(kind.startsWith('airdrop_')){
   const points=collect(AIRDROP_POINT_PREFIX,cleanAirdropPoint),events=collect(AIRDROP_EVENT_PREFIX,cleanAirdropEvent);
   if(kind==='airdrop_point')points.push(local);else events.push(local);
   validateAirdrops(points,events);
  }
  if(kind==='territory'||kind==='territory_event'){
   const territories=collect(TERRITORY_PREFIX,cleanTerritory),events=collect(CRIME_EVENT_PREFIX,cleanCrimeEvent);
   if(kind==='territory')territories.push(local);else events.push(local);
   validateCrime(territories,events);
  }
  if(kind==='plan'){
   const map=await getTacticalMap(profileId,{verify:false});
   if(!map||map.meta.sha256!==local.state.mapSha256)throw Error('Сначала импортируйте подложку карты этой редакции');
  }
  await api.storage.local.set({[key]:local});return {imported:true};
 });
}
