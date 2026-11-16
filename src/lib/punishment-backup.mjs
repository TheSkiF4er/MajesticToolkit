import {validateSectionData} from './section-monitor-store.mjs';
import {api} from './browser.mjs';
import {makeBackupV15,parseBackupV15} from './rules-backup.mjs';
import {validatePolicy} from './punishment-calculator.mjs';
import {SANCTIONS,UNITS,ruleSource} from './rules-core.mjs';
import {OVERLAY_PREFIX} from './punishment-overlay-store.mjs';
import {CALCULATOR_PREFIX} from './punishment-calculator-store.mjs';

// Historical snapshots are validated independently of current rules: revisions may have
// been archived or removed since the calculation was saved. Never re-run them on import.
const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
const fail=()=>{throw Error('Некорректные данные наказаний в резервной копии');};
const str=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail();return v;};
const integer=(v,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail();return v;};
const bool=v=>{if(typeof v!=='boolean')fail();return v;};
const arr=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail();return v;};
const id=v=>{if(typeof v!=='string'||!/^[-\w]{8,128}$/.test(v))fail();return v;};
const stamp=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))fail();return new Date(v).toISOString();};
const enumValue=(v,values)=>{if(!Object.hasOwn(values,v))fail();return v;};
const scopeKey=(p,server)=>CALCULATOR_PREFIX+p.id+':'+p.project+':'+encodeURIComponent(server);
const cleanEntry=(e,project)=>{
 const type=enumValue(e.type,SANCTIONS),unit=enumValue(e.unit,UNITS);
 if(type==='warn'&&unit!=='none')fail();
 if(unit==='none'&&e.amount!==null)fail();
 if(!['reviewed','unverified'].includes(e.verification))fail();
 return {ruleId:id(e.ruleId),revisionId:id(e.revisionId),index:integer(e.index,0,19),code:str(e.code,80,true),title:str(e.title,240,true),source:ruleSource(e.source,project),verification:e.verification,conditions:str(e.conditions,4000),condition:str(e.condition,1000),type,unit,amount:unit==='none'?null:integer(e.amount,1,1000000)};
};
function cleanResult(r,p,server){
 if(!r||r.profileId!==p.id||r.project!==p.project||r.server!==server)fail();
 const policy=validatePolicy(r.policy,p.project),ids=new Set();let count=0;
 const players=arr(r.players,20).map(x=>{
  const playerId=str(x.id,80,true);if(ids.has(playerId.toLowerCase()))fail();ids.add(playerId.toLowerCase());
  const entries=arr(x.entries,40).map(e=>cleanEntry(e,p.project));if(!entries.length||(count+=entries.length)>200)fail();
  if(new Set(entries.map(e=>e.ruleId+':'+e.index)).size!==entries.length)fail();
  const totals=arr(x.totals,28).map(t=>({type:enumValue(t.type,SANCTIONS),unit:enumValue(t.unit,UNITS),amount:integer(t.amount,1,Number.MAX_SAFE_INTEGER),resolved:bool(t.resolved)}));
  if(!totals.length||new Set(totals.map(t=>t.type+':'+t.unit)).size!==totals.length)fail();
  return {id:playerId,nickname:str(x.nickname,120),entries,totals,steps:arr(x.steps,100).map(s=>str(s,10000)),warnings:arr(x.warnings,100).map(s=>str(s,10000)),unresolved:bool(x.unresolved)};
 });if(!players.length)fail();
 return {policy,profileId:p.id,project:p.project,server,players,createdAt:stamp(r.createdAt)};
}
function cleanCalculator(v,p,server){
 if(!v||typeof v!=='object')fail();
 const history=arr(v.history,20).map(h=>({id:id(h.id),result:cleanResult(h.result,p,server)}));
 if(new Set(history.map(h=>h.id)).size!==history.length||bytes(history)>2*1024*1024)fail();
 return {policy:validatePolicy(v.policy,p.project),history};
}
function cleanDrafts(v,p){
 const host=p.project==='majestic'?'forum.majestic-rp.ru':p.project==='russia-online'?'forum.russia.online':null;
 const seen=new Set();return arr(v,50).map(d=>{
  const thread=str(d.thread,200,true);if(!host||!thread.startsWith(host+':')||!/^[\p{L}\p{N}_.%-]{1,180}$/u.test(thread.slice(host.length+1))||seen.has(thread))fail();seen.add(thread);
  const items=arr(d.items,40).map(i=>({ruleId:id(i.ruleId),revisionId:id(i.revisionId),index:integer(i.index,0,19),amount:i.amount===null?null:integer(i.amount,1,1000000)}));
  if(!items.length||new Set(items.map(i=>i.ruleId)).size!==items.length)fail();return {thread,items};
 });
}
export function validatePunishmentBackup(value,profiles){
 if(!value||value.version!==1)fail();const keys=new Set();
 const calculators=arr(value.calculators,500).map(x=>{const p=profiles.find(p=>p.id===x.profileId&&p.project===x.project);if(!p)fail();const server=str(x.server,90,true),k=scopeKey(p,server);if(keys.has(k))fail();keys.add(k);return {profileId:p.id,project:p.project,server,...cleanCalculator(x,p,server)};});
 const drafts=arr(value.drafts,500).map(x=>{const p=profiles.find(p=>p.id===x.profileId&&p.project===x.project);if(!p||keys.has(OVERLAY_PREFIX+p.id))fail();keys.add(OVERLAY_PREFIX+p.id);return {profileId:p.id,project:p.project,threads:cleanDrafts(x.threads,p)};});
 const result={version:1,calculators,drafts};if(bytes(result)>16*1024*1024)throw Error('История наказаний превышает 16 МиБ');return result;
}
export function punishmentBackupFromStorage(raw,profiles){
 const calculators=[],drafts=[];
 for(const p of profiles){const prefix=CALCULATOR_PREFIX+p.id+':'+p.project+':';for(const [k,v] of Object.entries(raw))if(k.startsWith(prefix)){const server=decodeURIComponent(k.slice(prefix.length));calculators.push({profileId:p.id,project:p.project,server,policy:v.policy,history:v.history});}
  if(Object.hasOwn(raw,OVERLAY_PREFIX+p.id))drafts.push({profileId:p.id,project:p.project,threads:raw[OVERLAY_PREFIX+p.id]});
 }return validatePunishmentBackup({version:1,calculators,drafts},profiles);
}
export async function exportPunishmentData(profiles){return punishmentBackupFromStorage(await api.storage.local.get(null),profiles);}
export function punishmentStorageRecords(value,profiles){const v=validatePunishmentBackup(value,profiles);return Object.fromEntries([...v.calculators.map(x=>[scopeKey({id:x.profileId,project:x.project},x.server),{policy:x.policy,history:x.history}]),...v.drafts.map(x=>[OVERLAY_PREFIX+x.profileId,x.threads])]);}
export async function replacePunishmentData(value,profiles){
 const next=punishmentStorageRecords(value,profiles),raw=await api.storage.local.get(null);const previous=Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith(CALCULATOR_PREFIX)||k.startsWith(OVERLAY_PREFIX)));
 const extra=Object.keys(previous).filter(k=>!Object.hasOwn(next,k));try{if(Object.keys(next).length)await api.storage.local.set(next);if(extra.length)await api.storage.local.remove(extra);}catch(err){if(Object.keys(previous).length)await api.storage.local.set(previous);const added=Object.keys(next).filter(k=>!Object.hasOwn(previous,k));if(added.length)await api.storage.local.remove(added);throw err;}
}
export function makeRulesExperienceBackup(args,punishments,sectionMonitor){const raw=JSON.parse(makeBackupV15(...args));raw.punishments=validatePunishmentBackup(punishments,raw.payload.profiles);if(sectionMonitor!==undefined)raw.sectionMonitor=validateSectionData(sectionMonitor,raw.payload.profiles);const text=JSON.stringify(raw,null,2);if(new TextEncoder().encode(text).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ');return text;}
export function parseRulesExperienceBackup(text,validateState,cleanTemplate){const data=parseBackupV15(text,validateState,cleanTemplate),raw=JSON.parse(text);return {...data,sectionMonitor:raw.schemaVersion===15&&Object.hasOwn(raw,'sectionMonitor')?validateSectionData(raw.sectionMonitor,data.state.profiles):null,punishments:raw.schemaVersion===15&&Object.hasOwn(raw,'punishments')?validatePunishmentBackup(raw.punishments,data.state.profiles):null};}
