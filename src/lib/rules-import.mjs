/** Structured legacy import. No rule or calculator policy is implicitly verified. */
import './forum-core.js';
import './xenforo-core.js';
import {createRule,reviseRule,currentRevision,validateRules,ruleSource,cleanSanction,RULES_KEY} from './rules-core.mjs';
import {validateState} from './model.mjs';
import {validateImportSettings} from './rules-import-settings.mjs';
const C=globalThis.RPNForumCore,X=globalThis.MTXenForo;
const units={demorgan:'minutes',mute:'minutes',ban:'days',hardban:'days',gunban:'days'};
const text=(v,max,empty=false)=>{if(typeof v!=='string'||v.length>max||(!empty&&!v.trim()))throw Error('Некорректное поле исходного набора');return v;};
const external=v=>{if(typeof v!=='string'||!/^[-\w]{1,90}$/.test(v))throw Error('Некорректный внешний ID');return v;};
export function parseRulesImport(raw,profile){
 if(profile?.project!=='majestic')throw Error('Этот набор правил предназначен для Majestic RP. Выберите профиль Majestic RP.');
 const pack=C.parseImport(raw,profile.id);if(pack.source!=='binds_and_links')throw Error('Выберите binds_and_links.json');
 const source=JSON.parse(raw),settings=validateImportSettings({folders:source.bindFolders,calcSettings:source.calcSettings??null});
 const folders=new Map(settings.folders.map(f=>[f.id,f]));
 const rows=source.binds.map((b,i)=>{
  const id=external(b.id),folderId=external(b.folderId),folder=folders.get(folderId);if(!folder)throw Error('Неизвестная папка: '+folderId);
  const originalText=text(b.textOutput,16000,true),color=text(b.color??'',40,true),p=b.punish;
  if(!p||typeof p.on!=='boolean')throw Error('Отсутствует состояние наказания: '+id);
  let fields=null,punish={on:p.on};
  if(p.on){
   const reason=text(p.reasonText,500),link=ruleSource(p.link,profile.project),ranges=p.t;if(!ranges||typeof ranges!=='object'||Array.isArray(ranges))throw Error('Некорректные диапазоны: '+id);
   const sanctions=[],t={};for(const [type,r] of Object.entries(ranges)){
    if(type==='warn'){if(typeof r!=='boolean')throw Error('Некорректный WARN');t.warn=r;continue;}
    if(!Object.hasOwn(units,type)||!r||typeof r!=='object')throw Error('Неизвестная санкция: '+type);
    const s=cleanSanction({type,unit:units[type],min:r.min,max:r.max,condition:''});sanctions.push(s);t[type]={min:s.min,max:s.max};
   }
   if(p.warn!==undefined&&typeof p.warn!=='boolean')throw Error('Некорректный WARN');
   if(p.warn===true||t.warn===true)sanctions.push(cleanSanction({type:'warn',unit:'none',min:null,max:null}));
   punish={on:true,reasonText:reason,link,t,...(p.warn===undefined?{}:{warn:p.warn})};
   let excerpt='';const fragment=new URL(link).hash.split(':~:text=')[1];if(fragment){try{excerpt=decodeURIComponent(fragment.split('&')[0]);}catch{throw Error('Повреждён текстовый якорь: '+id);}}
   const code=reason.match(/^\s*(\d+(?:\.\d+)+)/)?.[1]??excerpt.match(/^\s*(\d+(?:\.\d+)+)/)?.[1]??(b.titelOutput.match(/^\d+(?:\.\d+)+$/)?.[0]??'Без номера');
   fields={code,title:pack.templates[i].label,category:folder.name,text:excerpt||reason,aliases:[...new Set([reason,b.titelOutput].filter(v=>v.length<=80))],sourceUrl:link,sourceTitle:folder.name,verification:'unverified',sanctions,conditions:'Импортированный набор. Проверьте единицы, актуальность и условия применения по источнику; перечисление не означает совместное применение.',changeNote:'Импорт binds_and_links.json',server:''};
  }
  return {externalId:id,folderId,color,originalText,punish,fields,template:pack.templates[i]};
 });
 return {rows,templates:pack.templates,links:pack.links,settings,source:pack.source};
}
const stable=async (p,id)=>'legacy_rule_'+[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([p,id]))))].map(x=>x.toString(16).padStart(2,'0')).join('');
const snapshot=t=>{const {id,profileId,createdAt,history,legacy,...rest}=t;return rest;};
export async function planRulesImport(pack,state,profileId,templates,rules,links,mode='merge'){
 if(!['merge','skip','replace','add'].includes(mode))throw Error('Неизвестный режим импорта');
 const profile=state.profiles.find(p=>p.id===profileId);if(state.activeProfileId!==profileId||profile?.project!=='majestic')throw Error('Активный профиль изменился');
 const out=new Map(templates.map(t=>[t.id,t])),ruleRows=[...rules],linkRows=[...links],writes={};
 const report={imported:0,updated:0,skipped:0,rulesCreated:0,rulesUpdated:0,rulesLinked:0,linksImported:0,folders:pack.settings.folders.length,settings:!!pack.settings.calcSettings};
 for(const row of pack.rows){
  const candidates=[...out.values()].filter(t=>t.profileId===profileId),matches=candidates.filter(t=>t.legacy?.externalId===row.externalId||t.id===row.template.id);
  const fallback=candidates.filter(t=>!t.legacy&&t.label===row.template.label&&t.category===row.template.category&&t.text===row.template.text);
  if(!matches.length&&fallback.length>1&&mode!=='add')throw Error('Несколько совпадений для '+row.template.label+'; выберите создание копий');
  const existing=matches.find(t=>t.id===row.template.id)??matches[0]??(fallback.length===1?fallback[0]:null);
  if(existing&&mode==='skip'){report.skipped++;continue;}
  let ruleId=null;
  if(row.fields){
   const canonical=await stable(profileId,row.externalId);let r=ruleRows.find(r=>r.id===canonical);
   if(r&&(r.profileId!==profileId||r.project!==profile.project))throw Error('Конфликт ID правила');
   if(!r){r={...createRule(profile,row.fields),id:canonical};ruleRows.push(r);report.rulesCreated++;}
   else if(mode==='replace'){
    const rev=currentRevision(r),changed=['code','title','category','text','sourceUrl','sourceTitle','aliases','sanctions','conditions'].some(k=>JSON.stringify(rev[k])!==JSON.stringify(row.fields[k]));
    if(changed){r=reviseRule(r,{...row.fields,server:r.server,note:r.note},r.activeRevisionId);ruleRows[ruleRows.findIndex(x=>x.id===r.id)]=r;report.rulesUpdated++;}
   }
   ruleId=r.id;report.rulesLinked++;
  }
  const body=row.originalText.trim()?row.originalText:row.template.text;
  const legacy={externalId:row.externalId,folderId:row.folderId,color:row.color,originalText:row.originalText,punish:row.punish,ruleId};
  let t;
  if(existing&&mode==='merge'){t=C.cleanTemplate({...existing,legacy});}
  else if(existing&&mode==='replace'){
   t=C.cleanTemplate({...existing,label:row.template.label,category:row.template.category,text:body,format:row.template.format,variables:(existing.variables??[]).filter(v=>C.variableNames(body).includes(v.key)),tags:row.template.tags,legacy,updatedAt:new Date().toISOString(),history:[snapshot(existing),...(existing.history??[])].slice(0,10)});
   if(['label','category','text','format','tags','legacy'].every(k=>JSON.stringify(t[k])===JSON.stringify(existing[k])))t=existing;
  }else{t=C.createTemplate({...row.template,text:body,legacy});if(mode!=='add'&&!out.has(row.template.id))t=C.cleanTemplate({...t,id:row.template.id});}
  if(existing&&mode!=='add'&&JSON.stringify(t)===JSON.stringify(existing)){report.skipped++;continue;}
  if(existing&&mode!=='add')report.updated++;else report.imported++;
  out.set(t.id,t);writes[C.KEY_PREFIX+t.id]=t;
 }
 if(out.size>C.MAX_TEMPLATES)throw Error('Превышен лимит шаблонов');
 for(const l of pack.links){const same=linkRows.find(x=>x.kind!=='bookmark'&&x.profileId===profileId&&x.url===l.url);if(same&&mode!=='replace'&&mode!=='add')continue;const item=X.validateLink({...same,...l,profileId,id:same&&mode==='replace'?same.id:X.newLinkId(),createdAt:same&&mode==='replace'?same.createdAt:new Date().toISOString(),host:'forum.majestic-rp.ru'});if(same&&mode==='replace'){if(JSON.stringify(same)===JSON.stringify(item))continue;linkRows.splice(linkRows.indexOf(same),1,item);}else linkRows.push(item);writes[X.PREFIX+item.id]=item;report.linksImported++;}
 X.validateLinks(linkRows);const checked=validateRules(ruleRows,state.profiles);
 // Skip preserves existing configuration; merge adds metadata without overwriting existing settings.
 const prior=profile.rulesImport;const settings=mode==='replace'||!prior?pack.settings:{folders:[...prior.folders,...pack.settings.folders.filter(f=>!prior.folders.some(x=>x.id===f.id))],calcSettings:prior.calcSettings??pack.settings.calcSettings};
 const next=validateState({...state,profiles:state.profiles.map(p=>p.id===profileId?{...p,rulesImport:settings}:p)});
 if(JSON.stringify(checked)!==JSON.stringify(rules))writes[RULES_KEY]=checked;
 if(JSON.stringify(next)!==JSON.stringify(state))writes.rpNexusStateV1=next;
 return {writes,report};
}
