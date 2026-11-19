// Economy & Crime workspace: real views over legacy deal/cash/match records.
// These preferences never replace or re-serialize financial ledger records.
import {cleanRecord,summarizeEconomy,summarizeMatches} from './economy-core.mjs';
export const ECONOMY_UI_KEY='mtEconomyWorkspaceV211';
export const ECONOMY_TABS=Object.freeze(['overview','market','inventory','finance','groups','organizations','territories','analytics','calculators','journal']);
export const ECONOMY_TAB_LABELS=Object.freeze({overview:'Обзор',market:'Рынок и сделки',inventory:'Склад и имущество',finance:'Финансы',groups:'Семьи и игроки',organizations:'Организации',territories:'Территории и капты',analytics:'Аналитика',calculators:'Калькуляторы',journal:'Журнал'});
const idOK=value=>typeof value==='string'&&/^[\w-]{8,120}$/.test(value);
const str=(value,max)=>typeof value==='string'?value.slice(0,max):'';
const allowedTypes=new Set(['all','deal','cash','match']);
export function cleanEconomyUI(input,profileIds=[]){
 const ids=new Set(profileIds.filter(x=>typeof x==='string'));
 const source=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const tabs={},filters={},queries={};
 for(const id of ids){
  if(ECONOMY_TABS.includes(source.tabs?.[id]))tabs[id]=source.tabs[id];
  const filter=source.filters?.[id];if(allowedTypes.has(filter))filters[id]=filter;
  if(source.queries?.[id]!==undefined)queries[id]=str(source.queries[id],160);
 }
 const recent=Array.isArray(source.recent)?source.recent.filter(x=>x&&ids.has(x.profileId)&&idOK(x.id)).map(x=>({profileId:x.profileId,id:x.id})).filter((x,i,a)=>a.findIndex(y=>y.profileId===x.profileId&&y.id===x.id)===i).slice(0,24):[];
 return {tabs,filters,queries,recent};
}
export function selectEconomyTab(ui,profileId,tab,profileIds){
 if(!ECONOMY_TABS.includes(tab))throw Error('Неизвестная вкладка экономики');
 const next=cleanEconomyUI(ui,profileIds);if(!profileIds.includes(profileId))throw Error('Профиль не найден');
 next.tabs[profileId]=tab;return next;
}
export function setEconomyPref(ui,profileId,field,value,profileIds){
 const next=cleanEconomyUI(ui,profileIds);if(!profileIds.includes(profileId))throw Error('Профиль не найден');
 if(field==='filters'){if(!allowedTypes.has(value))throw Error('Неверный тип записи');next.filters[profileId]=value;}
 else if(field==='queries')next.queries[profileId]=str(value,160);
 else throw Error('Недопустимая настройка');
 return next;
}
export function rememberEconomyRecord(ui,profileId,id,profileIds){
 if(!idOK(id)||!profileIds.includes(profileId))throw Error('Запись или профиль не найдены');
 const next=cleanEconomyUI(ui,profileIds);
 next.recent=[{profileId,id},...next.recent.filter(x=>x.id!==id||x.profileId!==profileId)].slice(0,24);
 return next;
}
const lower=value=>String(value??'').toLocaleLowerCase('ru');
const searchable=r=>[r.date,r.title,r.category,r.kind,r.status,r.player,r.family,r.opponent,r.mode,r.result,r.note,r.amount,r.quantity].some(Boolean);
export function economySearch(records,profileId,query='',type='all',limit=80){
 if(!allowedTypes.has(type))throw Error('Неверный фильтр экономики');
 const text=lower(str(query,160).trim());
 return records.filter(r=>r.profileId===profileId&&(type==='all'||r.type===type)&&(!text||searchable(r)&&[r.date,r.title,r.category,r.kind,r.status,r.player,r.family,r.opponent,r.mode,r.result,r.note,r.amount,r.quantity].some(v=>lower(v).includes(text)))).slice(0,Math.min(160,Math.max(1,limit)));
}
export function economySnapshot(records,profileId){
 const rows=records.filter(r=>r.profileId===profileId).map(cleanRecord);
 const stats=summarizeEconomy(rows),matches=rows.filter(r=>r.type==='match');
 const recent=rows.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.date.localeCompare(a.date));
 return {rows,stats,matches,players:summarizeMatches(matches),families:summarizeMatches(matches,'family'),recent,
  deals:rows.filter(r=>r.type==='deal'),cash:rows.filter(r=>r.type==='cash'),open:rows.filter(r=>r.type==='deal'&&r.status==='open')};
}
