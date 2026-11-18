/** Opt-in local AI work: conversations, context references and manually edited drafts.
 * No gateway token, OpenAI key, consent, or automatic chat persistence. Not part of Backup v17.
 */
import {api} from './browser.mjs';
export const AI_WORKSPACE_PREFIX='mtAiWorkspaceV195:';
export const AI_WORKSPACE_LIMITS=Object.freeze({conversations:20,contexts:30,drafts:30,messages:40,message:12000,draft:12000});
const ID=/^[A-Za-z0-9_-]{8,128}$/;
const KINDS=['rule','source','case'];
const newId=()=>globalThis.crypto?.randomUUID?.()??'ai_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,16);
const idCheck=(id)=>typeof id==='string'&&ID.test(id);
const text=(value,max,label,nonempty=true)=>{if(typeof value!=='string'||value.length>max||(nonempty&&!value.trim()))throw Error('Недопустимое поле: '+label);return value;};
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export const emptyAIWorkspace=()=>({version:1,conversations:[],contexts:[],drafts:[]});
export function cleanAIWorkspace(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','conversations','contexts','drafts'].includes(k))||value.version!==1||!Array.isArray(value.conversations)||!Array.isArray(value.contexts)||!Array.isArray(value.drafts)||value.conversations.length>20||value.contexts.length>30||value.drafts.length>30)throw Error('Некорректное локальное хранилище AI');
 const unique=rows=>{if(new Set(rows.map(x=>x.id)).size!==rows.length)throw Error('Повторяющийся ID локальной записи AI');return rows;};
 const contexts=unique(value.contexts.map(c=>{if(!c||!idCheck(c.id)||!KINDS.includes(c.kind)||!idCheck(c.refId)||!date(c.createdAt))throw Error('Некорректная контекстная ссылка');return {id:c.id,kind:c.kind,refId:c.refId,title:text(c.title,140,'контекст'),createdAt:c.createdAt};}));
 const conversations=unique(value.conversations.map(c=>{
  if(!c||!idCheck(c.id)||!date(c.updatedAt)||!Array.isArray(c.messages)||!c.messages.length||c.messages.length>AI_WORKSPACE_LIMITS.messages)throw Error('Некорректная история диалога');
  const messages=c.messages.map(m=>{if(!m||!['user','assistant'].includes(m.role))throw Error('Некорректная роль в диалоге');return {role:m.role,text:text(m.text,AI_WORKSPACE_LIMITS.message,'сообщение',false)};});
  if(JSON.stringify(messages).length>100000)throw Error('Диалог слишком большой');
  return {id:c.id,title:text(c.title,100,'название диалога'),updatedAt:c.updatedAt,messages};
 }));
 const drafts=unique(value.drafts.map(d=>{if(!d||!idCheck(d.id)||!date(d.updatedAt))throw Error('Некорректный AI-черновик');return {id:d.id,title:text(d.title,100,'название черновика'),text:text(d.text,AI_WORKSPACE_LIMITS.draft,'черновик'),updatedAt:d.updatedAt};}));
 if(JSON.stringify({contexts,conversations,drafts}).length>600000)throw Error('Локальная история AI превышает лимит');
 return {version:1,contexts,conversations,drafts};
}
export const aiWorkspaceKey=profileId=>{if(typeof profileId!=='string'||!profileId||profileId.length>128||!/^[A-Za-z0-9_-]+$/.test(profileId))throw Error('Некорректный профиль AI');return AI_WORKSPACE_PREFIX+encodeURIComponent(profileId);};
export async function loadAIWorkspace(profileId){const key=aiWorkspaceKey(profileId);const value=(await api.storage.local.get(key))[key];return cleanAIWorkspace(value===undefined?emptyAIWorkspace():value);}
let queue=Promise.resolve();
function serial(fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;}
async function mutate(profileId,callback){return serial(async()=>{const old=await loadAIWorkspace(profileId),next=cleanAIWorkspace(callback(old));await api.storage.local.set({[aiWorkspaceKey(profileId)]:next});return next;});}
export function saveAIConversation(profileId,{id=null,title,messages}){return mutate(profileId,old=>{
 const row={id:id??newId(),title,updatedAt:new Date().toISOString(),messages};
 const next=[row,...old.conversations.filter(c=>c.id!==row.id)];
 if(next.length>20)throw Error('Лимит 20 сохранённых диалогов. Удалите старые записи.');
 return {...old,conversations:next};
});}
export function deleteAIConversation(profileId,id){return mutate(profileId,x=>({...x,conversations:x.conversations.filter(c=>c.id!==id)}));}
export function saveAIContext(profileId,{kind,refId,title}){return mutate(profileId,old=>{
 if(!KINDS.includes(kind)||!idCheck(refId))throw Error('Неверный тип контекста');
 const existing=old.contexts.find(x=>x.kind===kind&&x.refId===refId);
 const row={id:existing?.id??newId(),kind,refId,title,createdAt:existing?.createdAt??new Date().toISOString()};
 const contexts=[row,...old.contexts.filter(x=>x.id!==row.id)];if(contexts.length>30)throw Error('Лимит 30 контекстных ссылок');return {...old,contexts};
});}
export function deleteAIContext(profileId,id){return mutate(profileId,x=>({...x,contexts:x.contexts.filter(c=>c.id!==id)}));}
export function saveAIDraft(profileId,{id=null,title,text:body}){return mutate(profileId,old=>{
 const row={id:id??newId(),title,text:body,updatedAt:new Date().toISOString()};
 const drafts=[row,...old.drafts.filter(x=>x.id!==row.id)];if(drafts.length>30)throw Error('Лимит 30 черновиков');return {...old,drafts};
});}
export function deleteAIDraft(profileId,id){return mutate(profileId,x=>({...x,drafts:x.drafts.filter(d=>d.id!==id)}));}
export async function removeAIWorkspaceProfile(profileId){await serial(async()=>{const key=aiWorkspaceKey(profileId);if(typeof api.storage.local.remove==='function')await api.storage.local.remove(key);else await api.storage.local.set({[key]:emptyAIWorkspace()});});}
/** Resolve a saved reference against CURRENT stores/profile before it can be previewed or transmitted. */
export async function resolveAIContext(profile,ref,{rules=null,sources=null,cases=null}={}){
 if(!profile||!ref||!KINDS.includes(ref.kind)||!idCheck(ref.refId))throw Error('Некорректная ссылка контекста');
 if(ref.kind==='rule'){
  const {listRules}=await import('./rules-store.mjs');const all=rules??await listRules();const item=all.find(r=>r.id===ref.refId&&r.profileId===profile.id&&r.project===profile.project&&!r.archived&&(!r.server||r.server===profile.server));
  if(!item)throw Error('Правило удалено, архивировано или недоступно в текущем профиле');
  const r=item.revisions.find(x=>x.id===item.activeRevisionId);if(!r)throw Error('Редакция правила отсутствует');
  return {kind:'rule',refId:item.id,title:`${r.code} — ${r.title}`,text:`Правило ${r.code}: ${r.title}\nРедакция: ${r.id}\nСтатус проверки: ${r.verification==='reviewed'?'проверено пользователем (не официальное подтверждение)':'непроверенная редакция'}\nОписание: ${r.text||''}\nУсловия: ${r.conditions||''}\nИсточник: ${r.sourceUrl||item.sourceUrl||''}`.slice(0,3200)};
 }
 if(ref.kind==='source'){
  const {listSources,sourceDigest}=await import('./source-library.mjs');const all=sources??await listSources();const item=all.find(s=>s.id===ref.refId&&s.profileId===profile.id);
  if(!item)throw Error('Источник отсутствует в этом профиле');
  const host=profile.project==='majestic'?'forum.majestic-rp.ru':profile.project==='russia-online'?'forum.russia.online':null;
  if(item.kind==='forum'&&host&&new URL(item.url).hostname!==host)throw Error('Источник принадлежит другому форуму');
  if(item.sha256&&await sourceDigest(item.body)!==item.sha256)throw Error('Источник повреждён: SHA-256 не совпадает');
  return {kind:'source',refId:item.id,title:item.title,text:`Источник: ${item.title}\nРедакция: ${item.capturedAt}\nСтатус: ${item.status}\nURL: ${item.url}\nТекст: ${item.body.slice(0,2500)}`.slice(0,3200)};
 }
 const {listCases}=await import('./complaints-store.mjs');const all=cases??await listCases();const item=all.find(c=>c.id===ref.refId&&c.profileId===profile.id);
 if(!item)throw Error('Жалоба отсутствует в этом профиле');
 const host=profile.project==='majestic'?'forum.majestic-rp.ru':profile.project==='russia-online'?'forum.russia.online':null;
 if(host&&new URL(item.url).hostname!==host)throw Error('Жалоба принадлежит другому форуму');
 // No notes, participants, evidence URLs, or draft by default; user still previews and consents.
 return {kind:'case',refId:item.id,title:item.title,text:`Жалоба: ${item.title}\nЛокальный статус: ${item.status}\nКоличество доказательств: ${item.evidence?.length??0}\nСобытий таймлайна: ${item.timeline?.length??0}\nИсточник: ${item.url}`.slice(0,3200)};
}
