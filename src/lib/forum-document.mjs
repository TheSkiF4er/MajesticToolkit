import {api} from './browser.mjs';
import '../lib/xenforo-core.js';
import './complaints-core.js';
/** Explicitly target a matching, permitted forum tab. Never post or submit a form. */
export async function insertForumDocument(profile,text,confirmTarget=globalThis.confirm){
  if(typeof text!=='string'||!text.trim()||text.length>120000)throw Error('Документ пуст или превышает 120 000 символов');
  const host=globalThis.MTXenForo.domain(profile?.forumUrl);if(!host)throw Error('Выберите профиль поддерживаемого форума');
  const origin=`https://${host}/*`;
  if(!await api.permissions.contains({origins:[origin]}))throw Error('Сначала разрешите доступ к форуму');
  const tabs=(await api.tabs.query({url:[origin]})).filter(t=>Number.isInteger(t.id)&&globalThis.MTXenForo.domain(t.url)===host);
  if(!tabs.length)throw Error('Откройте форум и редактор ответа');
  tabs.sort((a,b)=>Number(!!b.active)-Number(!!a.active)||(b.lastAccessed||0)-(a.lastAccessed||0));
  const target=tabs[0];
  if(!confirmTarget(`Вставить документ как текст в редактор вкладки «${String(target.title||target.url).slice(0,180)}»? Сообщение не будет отправлено.`))return false;
  const result=await api.tabs.sendMessage(target.id,{type:'MT_APPLY_DOCUMENT',profileId:profile.id,text});
  if(!result?.ok)throw Error(result?.error||'Вставка не подтверждена. Обновите вкладку форума');
  return true;
}

/** Complaint drafts must only be inserted into the exact complaint thread. */
export async function insertCaseDecision(profile,c,confirmTarget=globalThis.confirm,verifyFresh=null){
  const host=globalThis.MTXenForo.domain(profile?.forumUrl), C=globalThis.RPNComplaints;
  if(!host||!C||c.profileId!==profile.id||new URL(c.url).hostname!==host||!c.draft.trim()||c.draft.length>30000)throw Error('Нет доступного черновика жалобы');
  if(!await api.permissions.contains({origins:[`https://${host}/*`]}))throw Error('Сначала разрешите доступ к форуму');
  const tabs=(await api.tabs.query({url:[`https://${host}/*`]})).filter(t=>{try{return Number.isInteger(t.id)&&C.threadKey(t.url)===c.threadKey;}catch{return false;}});
  if(!tabs.length)throw Error('Откройте тему этой жалобы и редактор ответа');
  tabs.sort((a,b)=>Number(!!b.active)-Number(!!a.active)||(b.lastAccessed||0)-(a.lastAccessed||0));const target=tabs[0];
  if(!confirmTarget(`Вставить черновик в тему «${String(target.title||c.title).slice(0,180)}»? Отправка только вручную.`))return false;
  if(verifyFresh)await verifyFresh();
  const result=await api.tabs.sendMessage(target.id,{type:'MT_APPLY_MODERATION',profileId:profile.id,threadKey:c.threadKey,text:c.draft,format:c.moderation?.draftFormat??'plain'});
  if(!result?.ok)throw Error(result?.error||'Вставка не подтверждена');return true;
}
