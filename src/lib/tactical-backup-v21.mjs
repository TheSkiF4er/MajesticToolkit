/** Backup v21: complete tactical journals + validated map metadata.
 * Binary map images are carried by portable ZIP, never silently dropped from JSON. */
import {makeBackupV20,parseBackupV20} from './economy-backup-v20.mjs';
import {cleanMapMeta,validMapProfile} from './tactical-map-core.mjs';
import {validateAirdrops} from './tactical-airdrop-core.mjs';
import {cleanPlan,PLAN_LIMITS} from './tactical-planning-core.mjs';
import {cleanTacticalSimulation,SIMULATION_LIMITS} from './tactical-simulation-core.mjs';
import {validateTacticalLinks} from './tactical-links-core.mjs';
const LIMIT=48*1024*1024;
const isArray=x=>Array.isArray(x);
export function validateTacticalSnapshot(snapshot,profiles,{families=[],organizations=[],territories=[],documents=[],evidenceVault=[]}={}){
 if(!snapshot||typeof snapshot!=='object'||isArray(snapshot)||!['maps','airdropPoints','airdropEvents','plans','simulations'].every(k=>isArray(snapshot[k])))throw Error('Некорректная структура Tactical Backup v21');
 const known=new Set(profiles.map(p=>typeof p==='string'?p:p.id)),mapByProfile=new Map(),seen=new Set();
 if(snapshot.maps.length>profiles.length)throw Error('Превышено число карт в Backup v21');
 const maps=snapshot.maps.map(raw=>{
  const m=cleanMapMeta(raw);
  if(!known.has(m.profileId)||mapByProfile.has(m.profileId))throw Error('Дубликат карты или неизвестный профиль');
  mapByProfile.set(m.profileId,m);
  for(const link of m.territoryLinks){if(!territories.some(t=>t.id===link.territoryId&&t.profileId===m.profileId))throw Error('Привязка карты к отсутствующей территории');}
  return m;
 });
 const airdrops=validateAirdrops(snapshot.airdropPoints,snapshot.airdropEvents,[...known]);
 for(const point of airdrops.points){if(point.mapSha256 && mapByProfile.get(point.profileId)?.sha256!==point.mapSha256)throw Error('Точка аирдропа не соответствует подложке карты');}
 const plans=snapshot.plans.map(cleanPlan),planCounts=new Map();
 for(const p of plans){
  if(!known.has(p.profileId)||seen.has('p:'+p.id))throw Error('Дубликат плана или неизвестный профиль');seen.add('p:'+p.id);
  if(mapByProfile.get(p.profileId)?.sha256!==p.state.mapSha256)throw Error('Отсутствует исходная подложка тактического плана');
  if(p.state.group){const group=p.state.group.type==='family'?families:organizations;if(!group.some(x=>x.id===p.state.group.id&&x.profileId===p.profileId))throw Error('Группа плана отсутствует в резервной копии');}
  planCounts.set(p.profileId,(planCounts.get(p.profileId)||0)+1);
 }
 if([...planCounts.values()].some(n=>n>PLAN_LIMITS.plans))throw Error('Превышен лимит тактических планов');
 const runs=snapshot.simulations.map(cleanTacticalSimulation),runCounts=new Map();
 for(const r of runs){
  if(!known.has(r.profileId)||seen.has('s:'+r.id))throw Error('Дубликат симуляции или неизвестный профиль');seen.add('s:'+r.id);
  if(mapByProfile.get(r.profileId)?.sha256!==r.result.mapSha256)throw Error('Отсутствует исходная подложка симуляции');
  if(!plans.some(p=>p.id===r.plan.id&&p.profileId===r.profileId))throw Error('Симуляция ссылается на отсутствующий план');
  runCounts.set(r.profileId,(runCounts.get(r.profileId)||0)+1);
 }
 if([...runCounts.values()].some(n=>n>SIMULATION_LIMITS.perProfile))throw Error('Превышен лимит симуляций');
 const links=validateTacticalLinks(snapshot.links??[],profiles,{territories,airdropEvents:airdrops.events,plans,simulations:runs,documents,evidenceVault});
 return {maps,airdropPoints:airdrops.points,airdropEvents:airdrops.events,plans,simulations:runs,links};
}
export async function makeBackupV21(baseArgs,tactical){
 const base=JSON.parse(await makeBackupV20(...baseArgs));
 const checked=validateTacticalSnapshot(tactical,base.payload.profiles,{families:base.families,organizations:base.organizations,territories:base.territories,documents:base.documents,evidenceVault:base.evidenceVault});
 const result=JSON.stringify({...base,schemaVersion:21,tactical:checked},null,2);
 if(new TextEncoder().encode(result).length>LIMIT)throw Error('Backup v21 превышает 48 МиБ');
 return result;
}
export async function parseBackupV21(text,validateState,cleanTemplate){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>LIMIT)throw Error('Backup v21 превышает 48 МиБ');
 let raw;try{raw=JSON.parse(text);}catch{throw Error('Некорректный JSON резервной копии');}
 if(raw?.schemaVersion!==21){const old=await parseBackupV20(text,validateState,cleanTemplate);return {...old,tactical:null};}
 if(raw.format!=='majestictoolkit-backup')throw Error('Неизвестный формат Backup v21');
 const base=await parseBackupV20(JSON.stringify({...raw,schemaVersion:20}),validateState,cleanTemplate);
 const checked=validateTacticalSnapshot(raw.tactical,base.state.profiles,{families:base.families,organizations:base.organizations,territories:base.territories,documents:base.documents,evidenceVault:base.evidenceVault});
 return {...base,schemaVersion:21,tactical:checked};
}
