import {api} from './browser.mjs';
import {MONITOR_KEY,emptyMonitor,validateMonitor,toggleFavorite,saveCard,deleteCard,applyCatalog,applyLive} from './monitor-core.mjs';
let serial=Promise.resolve();
const run=fn=>{const work=serial.then(fn);serial=work.catch(()=>{});return work;};
export async function loadMonitor(){const raw=(await api.storage.local.get(MONITOR_KEY))[MONITOR_KEY];return raw===undefined?emptyMonitor():validateMonitor(raw);}
export function updateMonitor(change){return run(async()=>{const next=validateMonitor(change(await loadMonitor()));await api.storage.local.set({[MONITOR_KEY]:next});return next;});}
export function replaceMonitor(value){return run(async()=>{const data=validateMonitor(value);await api.storage.local.set({[MONITOR_KEY]:data});return data;});}
export const favoriteServer=id=>updateMonitor(d=>toggleFavorite(d,id));
export const storePlayer=card=>updateMonitor(d=>saveCard(d,card));
export const removePlayer=(profileId,url)=>updateMonitor(d=>deleteCard(d,profileId,url));
export const storeCatalog=(catalog,now)=>updateMonitor(d=>applyCatalog(d,catalog,now));
export const storeLive=(live,now)=>updateMonitor(d=>applyLive(d,live,now));

export const setAutoRefresh=enabled=>updateMonitor(data=>({...data,autoRefresh:enabled===true}));
