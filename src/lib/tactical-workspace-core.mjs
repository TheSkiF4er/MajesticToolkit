/** Tactical 2.2.1: profile-scoped workspace preferences and real Crime & Territory read models. */
import {crimeSummary} from './crime-core.mjs';
export const TACTICAL_UI_KEY='mtTacticalWorkspaceV221';
export const TACTICAL_TABS=Object.freeze(['overview','map','airdrops','planning','territories','events','groups','recent']);
export const TACTICAL_TAB_LABELS=Object.freeze({overview:'Обзор',map:'Карта',airdrops:'Аирдропы',planning:'Планирование',territories:'Территории',events:'Капты и события',groups:'Семьи и организации',recent:'Недавние'});
export const TACTICAL_FILTERS=Object.freeze(['all','planned','overdue','completed','cancelled']);
const validId=x=>typeof x==='string'&&/^[\w-]{8,120}$/.test(x);
const validKind=x=>['territory','event','family','organization'].includes(x);
const cleanTerm=x=>typeof x==='string'?x.slice(0,140):'';
export function cleanTacticalUI(raw,profileIds=[]){
 const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},ids=new Set(profileIds.filter(validId));
 const tabs={},queries={},filters={};
 for(const id of ids){if(TACTICAL_TABS.includes(source.tabs?.[id]))tabs[id]=source.tabs[id];if(typeof source.queries?.[id]==='string')queries[id]=cleanTerm(source.queries[id]);if(TACTICAL_FILTERS.includes(source.filters?.[id]))filters[id]=source.filters[id];}
 const recent=Array.isArray(source.recent)?source.recent.filter(x=>x&&ids.has(x.profileId)&&validKind(x.kind)&&validId(x.id)).map(({profileId,kind,id})=>({profileId,kind,id})).filter((x,i,a)=>a.findIndex(y=>y.profileId===x.profileId&&y.kind===x.kind&&y.id===x.id)===i).slice(0,30):[];
 const favorites=Array.isArray(source.favorites)?source.favorites.filter(x=>x&&ids.has(x.profileId)&&validKind(x.kind)&&validId(x.id)).map(({profileId,kind,id})=>({profileId,kind,id})).filter((x,i,a)=>a.findIndex(y=>y.profileId===x.profileId&&y.kind===x.kind&&y.id===x.id)===i).slice(0,100):[];
 return {tabs,queries,filters,recent,favorites};
}
export function changeTacticalPreference(raw,profileId,field,value,profileIds){
 const next=cleanTacticalUI(raw,profileIds);if(!profileIds.includes(profileId)||!validId(profileId))throw Error('Профиль не найден');
 if(field==='tab'){if(!TACTICAL_TABS.includes(value))throw Error('Неизвестная тактическая вкладка');next.tabs[profileId]=value;}
 else if(field==='query')next.queries[profileId]=cleanTerm(value);
 else if(field==='filter'){if(!TACTICAL_FILTERS.includes(value))throw Error('Неверный фильтр RP-событий');next.filters[profileId]=value;}
 else throw Error('Неизвестная настройка тактического раздела');
 return next;
}
export function changeTacticalRecord(raw,profileId,kind,id,action,profileIds){
 if(!validKind(kind)||!validId(id)||!profileIds.includes(profileId))throw Error('Недопустимая тактическая запись');
 const next=cleanTacticalUI(raw,profileIds),row={profileId,kind,id};
 const key=x=>x.profileId===profileId&&x.kind===kind&&x.id===id;
 if(action==='open')next.recent=[row,...next.recent.filter(x=>!key(x))].slice(0,30);
 else if(action==='favorite')next.favorites=next.favorites.some(key)?next.favorites.filter(x=>!key(x)):[row,...next.favorites].slice(0,100);
 else throw Error('Неизвестная операция с тактической записью');
 return next;
}
export function tacticalSnapshot({territories=[],operations=[],families=[],organizations=[]},profileId,ui=cleanTacticalUI(),today=new Date().toISOString().slice(0,10)){
 const summary=crimeSummary(territories,operations,profileId,families,organizations);
 const familyRows=families.filter(x=>x.profileId===profileId),orgRows=organizations.filter(x=>x.profileId===profileId);
 const groupName=g=>g?.type==='family'?familyRows.find(x=>x.id===g.id)?.name??'Неизвестная семья':g?.type==='organization'?orgRows.find(x=>x.id===g.id)?.name??'Неизвестная организация':'Нет владельца';
 const nameOf=(kind,id)=>kind==='territory'?summary.territories.find(x=>x.id===id)?.name:kind==='event'?summary.operations.find(x=>x.id===id)?.title:kind==='family'?familyRows.find(x=>x.id===id)?.name:orgRows.find(x=>x.id===id)?.name;
 const records=[...summary.territories.map(x=>({kind:'territory',id:x.id,name:x.name,detail:`${x.region} · ${groupName(x.owner)}`,date:x.updatedAt,search:[x.name,x.region,x.notes,groupName(x.owner)].join(' '),source:x})),
 ...summary.operations.map(x=>({kind:'event',id:x.id,name:x.title,detail:`${x.date} · ${x.kind==='capture'?'Капт':x.kind==='battle'?'Противостояние':'RP-событие'} · ${groupName(x.attacker)} / ${groupName(x.defender)}`,date:x.date,search:[x.title,x.notes,x.date,x.kind,x.status,groupName(x.attacker),groupName(x.defender),summary.territories.find(t=>t.id===x.territoryId)?.name,...x.participants.map(p=>p.player)].join(' '),source:x})),
 ...familyRows.map(x=>({kind:'family',id:x.id,name:x.name,detail:`Семья · ${x.members.filter(m=>m.active).length} участников`,date:x.updatedAt,search:[x.name,x.tag,...x.members.map(m=>m.player)].join(' '),source:x})),
 ...orgRows.map(x=>({kind:'organization',id:x.id,name:x.name,detail:'Организация',date:x.updatedAt,search:[x.name,x.description,x.category,...(x.members||[]).map(m=>m.player||m.name||'')].join(' '),source:x}))];
 const index=new Map(records.map(x=>[x.kind+':'+x.id,x]));
 const favorites=(ui.favorites||[]).filter(x=>x.profileId===profileId&&index.has(x.kind+':'+x.id));
 const recent=(ui.recent||[]).filter(x=>x.profileId===profileId&&index.has(x.kind+':'+x.id));
 const query=(ui.queries?.[profileId]||'').trim().toLocaleLowerCase('ru');
 const filter=ui.filters?.[profileId]||'all';
 const matched=records.filter(x=>(!query||x.search.toLocaleLowerCase('ru').includes(query))&&(x.kind!=='event'||filter==='all'||(filter==='overdue'?x.source.status==='planned'&&x.source.date<today:x.source.status===filter)));
 const planned=summary.operations.filter(x=>x.status==='planned').sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt));
 const completed=summary.operations.filter(x=>x.status==='completed');
 return {records,matched,groupName,nameOf,favorites,recent,summary,planned,completed,today,stats:{territories:summary.territories.filter(x=>!x.archived).length,planned:planned.length,overdue:planned.filter(x=>x.date<today).length,completed:completed.length,families:familyRows.filter(x=>!x.archived).length,organizations:orgRows.filter(x=>!x.archived).length}};
}
