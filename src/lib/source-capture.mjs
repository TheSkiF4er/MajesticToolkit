/** Explicitly capture a page already opened by the user. No crawling, bypassing or background polling. */
import {api} from './browser.mjs';
import {sourceKind,saveSource} from './source-library.mjs';
export const FLETCHER_ORIGINS=['https://fletcher-wiki.com/*','https://www.fletcher-wiki.com/*'];
const FORUM_ORIGINS=['https://forum.majestic-rp.ru/*','https://forum.russia.online/*'];
export function captureVisibleArticle(){
 // Prefer published XenForo message bodies over navigation/sidebar text.
 const messages=[...document.querySelectorAll('.message-body .bbWrapper,.message-content .bbWrapper')];
 const readable=messages.length?messages.slice(0,25):[...document.querySelectorAll('article .content,article,[role="main"],main')];
 const texts=readable.map(n=>(n.innerText||n.textContent||'').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim()).filter(t=>t.length>20);
 const body=messages.length?texts.join('\n\n'):(texts.sort((a,b)=>b.length-a.length)[0]||'');
 return {url:location.href,title:(document.querySelector('h1')?.textContent||document.title||'').trim().slice(0,240),body:body.slice(0,16000)};
}

export function selectSourceTab(tabs,kind,project){
 const expected=kind==='fletcher'?[...FLETCHER_ORIGINS]:project==='russia-online'?[FORUM_ORIGINS[1]]:[FORUM_ORIGINS[0]];
 const matches=tabs.filter(tab=>Number.isInteger(tab.id)&&typeof tab.url==='string'&&(()=>{try{return sourceKind(tab.url)===kind&&(kind!=='forum'||(project==='russia-online' ? new URL(tab.url).hostname==='forum.russia.online':new URL(tab.url).hostname==='forum.majestic-rp.ru'));}catch{return false;}})());
 matches.sort((a,b)=>Number(Boolean(b.active))-Number(Boolean(a.active))||(b.lastAccessed||0)-(a.lastAccessed||0));
 if(!matches.length)throw Error(`Откройте ${kind==='forum'?'форум выбранного проекта':'статью Fletcher Wiki'} в другой вкладке браузера`);
 return {tab:matches[0],origins:expected};
}
export async function importOpenedPage(kind,profile){
 if(!['forum','fletcher'].includes(kind))throw Error('Неизвестный источник');
 if(kind==='fletcher'){
   // Must be the very first asynchronous API call from the user click (Firefox Android).
   if(!await api.permissions.request({origins:FLETCHER_ORIGINS}))throw Error('Разрешение Fletcher Wiki не предоставлено');
 }else{
   const origins=profile.project==='russia-online'?[FORUM_ORIGINS[1]]:[FORUM_ORIGINS[0]];
   if(!await api.permissions.contains({origins}))throw Error('Разрешите доступ к форуму в разделе «Сайты и доступ»');
 }
 const tabs=await api.tabs.query({url:kind==='fletcher'?FLETCHER_ORIGINS:FORUM_ORIGINS});
 const {tab}=selectSourceTab(tabs,kind,profile.project);
 let items;
 try{items=await api.scripting.executeScript({target:{tabId:tab.id},func:captureVisibleArticle});}
 catch{throw Error('Нельзя прочитать открытую страницу. Убедитесь, что доступ к сайту разрешён и страница полностью загружена.');}
 const snapshot=items?.[0]?.result;
 if(!snapshot||sourceKind(snapshot.url)!==kind||new URL(snapshot.url).hostname!==new URL(tab.url).hostname)throw Error('Ответ страницы не соответствует выбранному источнику');
 if(/checking your browser|automated protection|проверка браузера/i.test(snapshot.title+' '+snapshot.body.slice(0,300)))throw Error('Сайт защищён проверкой браузера. Откройте доступную статью вручную; обход защиты не выполняется.');
 if(!snapshot.title||snapshot.body.trim().length<80)throw Error('На странице нет доступного текста статьи. Откройте конкретную публикацию, дождитесь загрузки и повторите.');
 return saveSource({profileId:profile.id,kind,title:snapshot.title,body:snapshot.body,url:snapshot.url});
}
