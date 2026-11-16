import {api} from './browser.mjs';
import {listRules,patchRule} from './rules-store.mjs';
import {searchRules,currentRevision,SANCTIONS,UNITS} from './rules-core.mjs';
import './complaints-core.js';

// Local, thread-scoped drafts. Only the trusted background resolves rules and sanctions.
export const OVERLAY_PREFIX='mtPunishmentDraftV1:';
const MAX_DRAFTS=50, MAX_ITEMS=40;
let pending=Promise.resolve();
function serial(fn){const run=pending.then(fn);pending=run.catch(()=>{});return run;}
export function overlayThread(url){try{return globalThis.RPNComplaints.threadKey(url);}catch{return null;}}
export function availableRules(rows,profile){return searchRules(rows,{profileId:profile.id,project:profile.project,server:profile.server}).filter(r=>currentRevision(r).sanctions.length);}
export function selectSanction(rule,revisionId,index,amount){
 const revision=currentRevision(rule);
 if(rule.archived||revision.id!==revisionId)throw Error('Редакция правила изменилась. Выберите санкцию заново.');
 if(!Number.isSafeInteger(index)||index<0||index>=revision.sanctions.length)throw Error('Неизвестная санкция');
 const s=revision.sanctions[index];
 if(s.unit==='none'){if(amount!==null)throw Error('Для санкции без срока значение не задаётся');}
 else if(!Number.isSafeInteger(amount)||amount<s.min||amount>s.max)throw Error('Срок вне допустимого диапазона');
 return {ruleId:rule.id,revisionId:revision.id,index,amount};
}
export function draftEntries(items,rules){return items.map(item=>{
 const rule=rules.find(r=>r.id===item.ruleId);const rev=rule?.revisions.find(r=>r.id===item.revisionId);const sanction=rev?.sanctions[item.index];
 let stale=true;try{if(rule){selectSanction(rule,item.revisionId,item.index,item.amount);stale=false;}}catch{}
 return {...item,code:rev?.code||'—',title:rev?.title||'Правило недоступно',sourceUrl:rev?.sourceUrl||'',verification:rev?.verification||'unverified',sanction: sanction?`${SANCTIONS[sanction.type]}${sanction.unit==='none'?'':` ${item.amount} ${UNITS[sanction.unit]}`}`:'',condition:sanction?.condition||'',conditions:rev?.conditions||'',stale};
});}
export function draftText(entries){
 if(!entries.length)throw Error('Добавьте нарушения в черновик');
 if(entries.some(e=>e.stale))throw Error('В черновике есть устаревшие редакции. Удалите их и выберите заново.');
 return ['Черновик санкций (не итоговое наказание)',...entries.map((e,i)=>`${i+1}. ${e.code} — ${e.title}: ${e.sanction}\nИсточник: ${e.sourceUrl}${e.condition?'\nУсловие: '+e.condition:''}${e.conditions?'\nУсловия правила: '+e.conditions:''}${e.verification!=='reviewed'?'\nТребует проверки по источнику':''}`),'Санкции выбраны вручную; объединение сроков не выполнено.'].join('\n\n');
}
function cleanDrafts(raw){return Array.isArray(raw)?raw.filter(d=>d&&typeof d.thread==='string'&&Array.isArray(d.items)).slice(0,MAX_DRAFTS).map(d=>({thread:d.thread,items:d.items.filter(i=>i&&typeof i.ruleId==='string'&&typeof i.revisionId==='string'&&Number.isSafeInteger(i.index)&&(i.amount===null||Number.isSafeInteger(i.amount))).slice(0,MAX_ITEMS)})):[];}
export function removePunishmentProfile(id){return serial(()=>api.storage.local.remove(OVERLAY_PREFIX+id));}
export function punishmentOverlay(profile,url,message){return serial(async()=>{
 const rules=availableRules(await listRules(),profile),thread=overlayThread(url),key=OVERLAY_PREFIX+profile.id;
 const drafts=cleanDrafts((await api.storage.local.get(key))[key]);
 const items=drafts.find(d=>d.thread===thread)?.items||[];
 const response=()=>({thread,entries:draftEntries(items,rules)});
 if(message.action==='list')return {...response(),rules:rules.map(r=>({id:r.id,favorite:r.favorite,lastOpened:r.lastOpened,server:r.server,revision:currentRevision(r)}))};
 if(message.action==='favorite'||message.action==='opened'){
  const rule=rules.find(r=>r.id===message.ruleId);if(!rule)throw Error('Правило недоступно');
  if(message.action==='favorite'&&typeof message.favorite!=='boolean')throw Error('Некорректное избранное');
  // Use the existing rule mutation API to preserve other fields.
  const updated=await patchRule(profile,rule.id,message.action==='favorite'?{favorite:message.favorite}:{lastOpened:new Date().toISOString()});
  return {id:updated.id,favorite:updated.favorite,lastOpened:updated.lastOpened};
 }
 if(!thread)throw Error('Для черновика откройте тему форума');
 if(message.action==='preview')return draftText(draftEntries(items,rules));
 if(message.action==='add'){
  const rule=rules.find(r=>r.id===message.ruleId);if(!rule)throw Error('Правило недоступно в текущем профиле и сервере');
  const entry=selectSanction(rule,message.revisionId,message.index,message.amount);
  const i=items.findIndex(x=>x.ruleId===entry.ruleId);
  if(i>=0)items[i]=entry;else{if(items.length>=MAX_ITEMS)throw Error('Лимит черновика: 40 нарушений');items.push(entry);}
 }else if(message.action==='remove'){
  const i=items.findIndex(x=>x.ruleId===message.ruleId);if(i>=0)items.splice(i,1);
 }else if(message.action==='clear')items.length=0;
 else throw Error('Неизвестное действие оверлея');
 const next=drafts.filter(d=>d.thread!==thread);if(items.length)next.unshift({thread,items});
 await api.storage.local.set({[key]:next.slice(0,MAX_DRAFTS)});
 return response();
});}
