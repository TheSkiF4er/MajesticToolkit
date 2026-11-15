import {api} from './browser.mjs';
import './xenforo-core.js';
const KEY='mtForumReadingV1:';
let pending=Promise.resolve();
export function readingPath(url){const u=new URL(url);if(!globalThis.MTXenForo.domain(u.href)||u.protocol!=='https:'||u.username||u.password||!/(?:^|\/)threads\//.test(u.pathname)||u.pathname.length>1024)throw Error('Откройте тему поддерживаемого форума');return u.hostname+u.pathname;}
export function readingPosition(profileId,url,action,postId){
 const path=readingPath(url),key=KEY+profileId;
 if(!['get','save','clear'].includes(action))throw Error('Неизвестное действие чтения');
 if(action==='save'&&(typeof postId!=='string'||!/^(?:js-)?post-\d{1,18}$/.test(postId)))throw Error('Некорректный номер сообщения');
 const op=pending.then(async()=>{const raw=(await api.storage.local.get(key))[key];const rows=Array.isArray(raw)?raw.filter(x=>x&&typeof x.path==='string'&&typeof x.postId==='string'&&/^(?:js-)?post-\d{1,18}$/.test(x.postId)).slice(0,50):[];
   if(action==='get')return rows.find(x=>x.path===path)?.postId||'';
   const next=rows.filter(x=>x.path!==path);if(action==='save')next.unshift({path,postId});await api.storage.local.set({[key]:next.slice(0,50)});return action==='save'?postId:'';
 });pending=op.catch(()=>{});return op;
}
