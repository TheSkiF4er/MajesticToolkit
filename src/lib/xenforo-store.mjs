import './xenforo-core.js';
import {api} from './browser.mjs';
const XF=globalThis.MTXenForo;
let sequence=Promise.resolve();
const serialized=fn=>{const result=sequence.then(fn);sequence=result.catch(()=>{});return result;};
export async function listXenForoLinks(){
  const result=await api.storage.local.get(null);
  const rows=[];
  for(const [key,item] of Object.entries(result))if(key.startsWith(XF.PREFIX)){
    try{const value=XF.validateLink(item);if(key===XF.PREFIX+value.id)rows.push(value);}catch(error){console.warn('MajesticToolkit: invalid XenForo navigation item',key,error);}
  }
  return rows;
}
export async function saveXenForoLink(input,id=null){
  return serialized(async()=>{
    const all=await listXenForoLinks(),before=id?all.find(x=>x.id===id):null;
    if(id&&!before)throw Error('Ссылка не найдена');
    
    const item=XF.validateLink({...before,...input,id:before?.id||XF.newLinkId(),createdAt:before?.createdAt||new Date().toISOString()});
    XF.validateLinks([...all.filter(x=>x.id!==item.id),item]);await api.storage.local.set({[XF.PREFIX+item.id]:item});return item;
  });
}
export async function deleteXenForoLink(id){
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw Error('Некорректный идентификатор');
  return serialized(()=>api.storage.local.remove(XF.PREFIX+id));
}
export async function replaceXenForoLinks(items){
  return serialized(async()=>{
    const clean=XF.validateLinks(items),current=await api.storage.local.get(null),oldKeys=Object.keys(current).filter(k=>k.startsWith(XF.PREFIX));
    const updates=Object.fromEntries(clean.map(x=>[XF.PREFIX+x.id,x]));
    try{
      if(Object.keys(updates).length)await api.storage.local.set(updates);
      const stale=oldKeys.filter(k=>!Object.hasOwn(updates,k));if(stale.length)await api.storage.local.remove(stale);
    }catch(e){
      const rollback=Object.fromEntries(oldKeys.map(k=>[k,current[k]]));if(oldKeys.length)await api.storage.local.set(rollback);
      const added=Object.keys(updates).filter(k=>!oldKeys.includes(k));if(added.length)await api.storage.local.remove(added);throw e;
    }
  });
}

export const HISTORY_PREFIX='mtNavigationHistory:';
export async function navigationHistory(profileId){
  const key=HISTORY_PREFIX+profileId,raw=(await api.storage.local.get(key))[key];
  return (Array.isArray(raw)?raw:[]).slice(0,50).filter(x=>{try{return XF.pageUrl(x.url)===x.url&&typeof x.title==='string'&&x.title.length<=250&&Number.isFinite(x.visitedAt)&&Number.isFinite(new Date(x.visitedAt).getTime());}catch{return false;}});
}
export function clearNavigationHistory(profileId){return serialized(()=>api.storage.local.remove(HISTORY_PREFIX+profileId));}
export function recordNavigationVisit(profileId,url,title){return serialized(async()=>{
  url=XF.pageUrl(url);const rows=await navigationHistory(profileId),now=Date.now();
  if(rows[0]?.url===url&&now-rows[0].visitedAt<60000)return rows;
  const next=[{url,title:String(title||url).trim().slice(0,250),visitedAt:now},...rows.filter(x=>x.url!==url)].slice(0,50);
  await api.storage.local.set({[HISTORY_PREFIX+profileId]:next});return next;
});}
export function saveCurrentBookmark(profileId,url,title){return serialized(async()=>{
  url=XF.pageUrl(url);const all=await listXenForoLinks();const existing=all.find(x=>x.kind==='bookmark'&&x.profileId===profileId&&x.url===url);if(existing)return existing;
  const item=XF.validateLink({id:XF.newLinkId(),profileId,title:String(title||url).trim().slice(0,70),url,kind:'bookmark',group:'Закладки',target:'current',createdAt:new Date().toISOString()});
  XF.validateLinks([...all,item]);await api.storage.local.set({[XF.PREFIX+item.id]:item});return item;
});}

export function markNavigationOpened(id,profileId,host){return serialized(async()=>{
 const all=await listXenForoLinks(),item=XF.selectNavigation(all,profileId,host).find(x=>x.id===id);
 if(!item||item.kind!=='bookmark')throw Error('Закладка не найдена');
 const updated=XF.validateLink({...item,lastOpened:new Date().toISOString()});await api.storage.local.set({[XF.PREFIX+id]:updated});return updated;
});}
export function reorderNavigation(ids,profileId,host){return serialized(async()=>{
 const all=await listXenForoLinks(),visible=XF.selectNavigation(all,profileId,host);if(!Array.isArray(ids)||ids.length!==visible.length||new Set(ids).size!==visible.length||ids.some(id=>!visible.some(x=>x.id===id)))throw Error('Список навигации изменился');
 const updates={};ids.forEach((id,i)=>{const item=visible.find(x=>x.id===id);updates[XF.PREFIX+id]=XF.validateLink({...item,order:i});});await api.storage.local.set(updates);return Object.values(updates);
});}
