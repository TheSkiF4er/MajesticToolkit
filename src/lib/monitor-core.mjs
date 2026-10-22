/** Server catalog and publicly displayed XenForo player records. No synthetic online data. */
export const MONITOR_KEY='majesticToolkitMonitorV12';
export const CATALOG_URL='https://api.majestic-files.com/meta/general';
export const LIVE_URL='https://api.majestic-files.com/meta/servers';
export const MONITOR_ORIGIN='https://api.majestic-files.com/*';
export const MAX_SAVED_PLAYERS=250;
export const MAX_FAVORITES=80;
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const clean=(x,max=150)=>{if(typeof x!=='string'||!x.trim()||x.trim().length>max)throw Error('Неверное строковое поле');return x.trim();};
const count=n=>Number.isInteger(n)&&n>=0&&n<=1000000?n:null;
const allowedId=x=>typeof x==='string'&&/^(?:RU(?:[1-9]|[12][0-9])|RO[1-9]|DE[1-9]|PL[1-9]|MCL)$/i.test(x);
const projects={majestic:'majestic','russia-online':'russia-online'};
export function serverId(value){const id=clean(String(value),12).toUpperCase();if(!allowedId(id))throw Error('Неизвестный идентификатор сервера');return id;}
export function serverProject(id){return serverId(id).startsWith('RO')?'russia-online':'majestic';}
export function normalizeCatalog(payload){
 const input=payload?.result?.servers??payload?.servers;
 if(!Array.isArray(input)||input.length===0||input.length>100)throw Error('Источник не вернул корректный список серверов');
 const ids=new Set();return input.map(row=>{
   if(!obj(row))throw Error('Некорректная запись сервера');
   const id=serverId(row.id),name=clean(row.name,80);
   if(ids.has(id))throw Error('Повторный идентификатор сервера');ids.add(id);
   const region=typeof row.region==='string'&&/^[A-Z]{2,5}$/i.test(row.region)?row.region.toUpperCase():'—';
   return {id,name,region,project:serverProject(id)};
 });
}
/** Only accept online counts from a response containing explicit per-server numbers. */
export function normalizeLive(payload,catalog){
 const raw=payload?.result?.servers??payload?.servers??payload?.result;
 const rows=Array.isArray(raw)?raw:Array.isArray(raw?.list)?raw.list:null;
 if(!rows)throw Error('Публичный источник не предоставил проверяемую статистику онлайна');
 const known=new Set(catalog.map(x=>x.id));const seen=new Set();const live=[];
 for(const s of rows){
   if(!obj(s))continue;
   let id;try{id=serverId(s.id??s.serverId??s.code);}catch{continue;}
   if(!known.has(id)||seen.has(id))continue;
   const online=count(s.online??s.players??s.playerCount??s.currentPlayers);
   const queue=count(s.queue??s.queueCount??s.waiting);
   const status=typeof s.status==='string'?s.status.toLowerCase():null;
   if(online===null&&queue===null&&status===null)continue;
   seen.add(id);
   live.push({id,online,queue,availability:['online','up','running','active'].includes(status)?'online':['offline','down','stopped'].includes(status)?'offline':'unknown'});
 }
 if(!live.length)throw Error('Источник не содержит подтверждённых числовых данных для известных серверов');
 return live;
}
export function validatePublicCard(input){
 if(!obj(input))throw Error('Неверная карточка');
 const raw=clean(input.url,2048),url=new URL(raw);
 if(url.protocol!=='https:'||!['forum.majestic-rp.ru','forum.russia.online'].includes(url.hostname)||url.port||url.username||url.password||!/\/members\/[^/]+/i.test(url.pathname))throw Error('Требуется публичная ссылка XenForo на пользователя');
 const profileId=clean(input.profileId,128),name=clean(input.name,280),subtitle=typeof input.subtitle==='string'?input.subtitle.trim().slice(0,280):'';
 const stats=Array.isArray(input.stats)?input.stats.slice(0,8).filter(obj).map(x=>({label:clean(x.label,70),value:clean(x.value,130)})):[];
 const capturedAt=typeof input.capturedAt==='string'&&Number.isFinite(Date.parse(input.capturedAt))?input.capturedAt:new Date().toISOString();
 return {profileId,url:url.origin+url.pathname,name,subtitle,stats,capturedAt};
}
export function emptyMonitor(){return {version:1,favorites:[],catalog:[],observedAt:null,live:[],liveAt:null,players:[],autoRefresh:false};}
export function validateMonitor(input){
 if(!obj(input)||input.version!==1)throw Error('Некорректное состояние мониторинга');
 const favorites=input.favorites,players=input.players;
 if(!Array.isArray(favorites)||favorites.length>MAX_FAVORITES||!Array.isArray(players)||players.length>MAX_SAVED_PLAYERS)throw Error('Превышен лимит мониторинга');
 const fav=favorites.map(serverId);if(new Set(fav).size!==fav.length)throw Error('Повторный избранный сервер');
 const catalog=Array.isArray(input.catalog)&&input.catalog.length?normalizeCatalog({servers:input.catalog}):[];
 const live=Array.isArray(input.live)?input.live.slice(0,100).map(s=>({id:serverId(s.id),online:count(s.online),queue:count(s.queue),availability:['online','offline','unknown'].includes(s.availability)?s.availability:'unknown'})):[];
 const cards=players.map(validatePublicCard);
 if(new Set(cards.map(c=>c.profileId+'|'+c.url)).size!==cards.length)throw Error('Повторная карточка');
 const date=d=>typeof d==='string'&&Number.isFinite(Date.parse(d))?d:null;
 return {version:1,favorites:fav,catalog,observedAt:date(input.observedAt),live,liveAt:date(input.liveAt),players:cards,autoRefresh:input.autoRefresh===true};
}
export function toggleFavorite(data,id){const source=validateMonitor(data),key=serverId(id),favorites=source.favorites.includes(key)?source.favorites.filter(x=>x!==key):[...source.favorites,key];return validateMonitor({...source,favorites});}
export function saveCard(data,input){const state=validateMonitor(data),card=validatePublicCard(input),others=state.players.filter(x=>x.profileId!==card.profileId||x.url!==card.url);return validateMonitor({...state,players:[card,...others].slice(0,MAX_SAVED_PLAYERS)});}
export function deleteCard(data,profileId,url){const source=validateMonitor(data);return validateMonitor({...source,players:source.players.filter(x=>x.profileId!==profileId||x.url!==url)});}
export function applyCatalog(data,catalog,now=new Date().toISOString()){const source=validateMonitor(data);return validateMonitor({...source,catalog,observedAt:now,live:source.live.filter(x=>catalog.some(s=>s.id===x.id))});}
export function applyLive(data,live,now=new Date().toISOString()){const source=validateMonitor(data);return validateMonitor({...source,live,liveAt:now});}
