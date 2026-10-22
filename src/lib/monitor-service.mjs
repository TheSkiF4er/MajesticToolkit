import {api} from './browser.mjs';
import {CATALOG_URL,LIVE_URL,MONITOR_ORIGIN,normalizeCatalog,normalizeLive} from './monitor-core.mjs';
import {loadMonitor,storeCatalog,storeLive} from './monitor-store.mjs';
const read=async(url,fetcher=fetch)=>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
 try{
   const response=await fetcher(url,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,headers:{accept:'application/json'}});
   if(!response.ok)throw Error(`Источник ответил HTTP ${response.status}`);
   const type=response.headers?.get?.('content-type')||'';
   if(type&&!/json/i.test(type))throw Error('Источник вернул не JSON');
   const length=Number(response.headers?.get?.('content-length'));
   if(Number.isFinite(length)&&length>1048576)throw Error('Ответ источника слишком большой');
   let body;
   if(response.body?.getReader){
     const reader=response.body.getReader(),chunks=[];let total=0;
     try{
       while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
         if(total>1048576)throw Error('Ответ источника слишком большой');chunks.push(value);
       }
       const result=new Uint8Array(total);let i=0;for(const chunk of chunks){result.set(chunk,i);i+=chunk.byteLength;}
       body=new TextDecoder('utf-8',{fatal:true}).decode(result);
     }finally{reader.releaseLock();}
   }else{
     body=await response.text();if(new TextEncoder().encode(body).length>1048576)throw Error('Ответ источника слишком большой');
   }
   return JSON.parse(body);
 }catch(error){if(error instanceof SyntaxError)throw Error('Источник вернул некорректный JSON');throw error;}
 finally{clearTimeout(timeout);}
};
export async function hasMonitorPermission(permissions=api.permissions){return permissions.contains({origins:[MONITOR_ORIGIN]});}
/** Must be initiated from a direct user gesture before any async work. */
export async function requestMonitorPermission(permissions=api.permissions){return permissions.request({origins:[MONITOR_ORIGIN]});}
export async function refreshOfficialCatalog(fetcher=fetch){
 if(!await hasMonitorPermission())throw Error('Разрешите доступ к официальному API');
 const catalog=normalizeCatalog(await read(CATALOG_URL,fetcher));await storeCatalog(catalog);return catalog;
}
export async function refreshVerifiedOnline(fetcher=fetch){
 if(!await hasMonitorPermission())throw Error('Разрешите доступ к официальному API');
 const data=await loadMonitor();if(!data.catalog.length)throw Error('Сначала обновите каталог серверов');
 const stats=normalizeLive(await read(LIVE_URL,fetcher),data.catalog);await storeLive(stats);return stats;
}
