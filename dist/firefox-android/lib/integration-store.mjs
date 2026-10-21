import {api} from './browser.mjs';
import {LINK_KEY,validateLinks,safeSiteUrl} from './integration-core.mjs';
let queue=Promise.resolve();function serial(fn){const n=queue.then(fn);queue=n.catch(()=>{});return n;}
export async function listLinks(){const result=await api.storage.local.get(LINK_KEY);try{return validateLinks(result[LINK_KEY]||[]);}catch(err){console.warn('MajesticToolkit: external links corrupted',err);return [];}}
export async function replaceLinks(next){return serial(async()=>{const validated=validateLinks(next);await api.storage.local.set({[LINK_KEY]:validated});return validated;});}
export function addLink({title,url,notes=''}){return serial(async()=>{const current=await listLinks();const next=validateLinks([...current,{id:crypto.randomUUID(),title,url:safeSiteUrl(url),notes}]);await api.storage.local.set({[LINK_KEY]:next});return next.at(-1);});}
export function deleteLink(id){return serial(async()=>{const current=await listLinks();if(!current.some(x=>x.id===id))throw Error('Закладка не найдена');await api.storage.local.set({[LINK_KEY]:current.filter(x=>x.id!==id)});});}
