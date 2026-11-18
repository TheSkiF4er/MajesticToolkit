/** User-triggered, read-only diagnostics. Only status enums are eligible for AI transmission. */
import {api} from './browser.mjs';
import {AI_ORIGIN,aiHealth} from './ai-connection.mjs';
import {SUPPORT_CHECKS} from './ai-support-core.mjs';
const origin={forumMajestic:'https://forum.majestic-rp.ru/*',forumRussia:'https://forum.russia.online/*',gatewayPermission:AI_ORIGIN};
function result(id,status,detail){return {id,status,detail};}
export async function runSupportDiagnostics({token='',includeGateway=false,apiImpl=api,indexedDBImpl=globalThis.indexedDB,storageManager=globalThis.navigator?.storage,health=aiHealth}={}){
 const checks=[];
 const version=String(apiImpl?.runtime?.getManifest?.()?.version||'0.0.0');
 checks.push(result('runtime',version==='0.0.0'?'warn':'ok',version==='0.0.0'?'Не удалось определить версию расширения':`Установлена версия ${version}`));
 try{if(!apiImpl?.storage?.local?.get)throw Error();await apiImpl.storage.local.get('mtAiConnectionV191');checks.push(result('localStorage','ok','Хранилище доступно для чтения'));}catch{checks.push(result('localStorage','fail','Ошибка чтения локального хранилища'));}
 checks.push(result('indexedDB',indexedDBImpl&&typeof indexedDBImpl.open==='function'?'ok':'fail',indexedDBImpl&&typeof indexedDBImpl.open==='function'?'API IndexedDB доступен (состояние отдельных файлов не проверялось)':'API IndexedDB недоступен'));
 try{if(!storageManager?.estimate)throw Error();const usage=await storageManager.estimate();if(!Number.isFinite(usage.quota)||usage.quota<=0)throw Error();const ratio=Math.max(0,Number(usage.usage||0))/usage.quota;checks.push(result('storageQuota',ratio>=.9?'warn':'ok',ratio>=.9?'Хранилище заполнено более чем на 90%':'Свободное пространство проверено (оценка браузера)'));}catch{checks.push(result('storageQuota','unknown','Браузер не предоставил оценку квоты'));}
 for(const [id,host] of Object.entries(origin)){try{const granted=await apiImpl.permissions.contains({origins:[host]});checks.push(result(id,granted?'ok':'warn',granted?'Разрешение предоставлено':'Разрешение отсутствует (может быть не нужно)'));}catch{checks.push(result(id,'unknown','Невозможно определить разрешение'));}}
 if(includeGateway){try{if(!token.trim())throw Error('token missing');await health(token,{signal:AbortSignal.timeout(7000)});checks.push(result('gatewayConnection','ok','Локальный шлюз ответил'));}catch{checks.push(result('gatewayConnection','warn','Локальный шлюз недоступен или токен отклонён'));}}
 return {version:/^\d{1,2}\.\d{1,2}\.\d{1,3}$/.test(version)?version:'0.0.0',checks:checks.filter(x=>Object.hasOwn(SUPPORT_CHECKS,x.id))};
}
