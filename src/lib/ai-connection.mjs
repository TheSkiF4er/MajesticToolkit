/** Explicitly opt-in OpenAI gateway client. Never stores or transmits a provider key. */
import {api} from './browser.mjs';
export const AI_GATEWAY='http://127.0.0.1:32187';
export const AI_ORIGIN='http://127.0.0.1/*';
export const AI_SETTINGS_KEY='mtAiConnectionV191';
export const EMPTY_AI_SETTINGS=Object.freeze({enabled:false});
export function validateAISettings(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.enabled!=='boolean'||Object.keys(data).some(k=>k!=='enabled'))throw Error('Некорректные настройки AI');
 return {enabled:data.enabled};
}
export async function getAISettings(profileId){
 const value=(await api.storage.local.get(AI_SETTINGS_KEY))[AI_SETTINGS_KEY];
 return value?.[profileId]===undefined?{...EMPTY_AI_SETTINGS}:validateAISettings(value[profileId]);
}
export async function setAIEnabled(profileId,enabled){
 if(typeof profileId!=='string'||!profileId||typeof enabled!=='boolean')throw Error('Некорректные данные AI');
 const old=(await api.storage.local.get(AI_SETTINGS_KEY))[AI_SETTINGS_KEY]||{};
 const next={...old,[profileId]:{enabled}};await api.storage.local.set({[AI_SETTINGS_KEY]:next});return next[profileId];
}
export async function removeAIProfile(profileId){
 const raw=(await api.storage.local.get(AI_SETTINGS_KEY))[AI_SETTINGS_KEY]||{};if(!Object.hasOwn(raw,profileId))return;const next={...raw};delete next[profileId];await api.storage.local.set({[AI_SETTINGS_KEY]:next});
}
export async function requestAIPermission(){return api.permissions.request({origins:[AI_ORIGIN]});}
export async function hasAIPermission(){return api.permissions.contains({origins:[AI_ORIGIN]});}
export function assertQuestion(value){if(typeof value!=='string'||!value.trim()||value.length>5000)throw Error('Введите вопрос до 5000 символов');return value.trim();}
export async function aiHealth(token,{fetchImpl=fetch,signal}={}){
 if(typeof token!=='string'||!token.trim())throw Error('Введите токен локального шлюза');
 const res=await fetchImpl(`${AI_GATEWAY}/health`,{headers:{Authorization:`Bearer ${token.trim()}`},signal,cache:'no-store'});
 if(!res.ok)throw Error(res.status===401?'Неверный токен шлюза':`Шлюз недоступен (HTTP ${res.status})`);
 const data=await res.json();if(!data?.ok||typeof data.model!=='string')throw Error('Некорректный ответ шлюза');return data;
}
export async function streamAI(question,token,options={}){return streamAIPayload({question:assertQuestion(question)},token,options);}
export async function streamRulesAI(question,token,sources,options={}){
 if(!Array.isArray(sources)||sources.length<1||sources.length>5)throw Error('Выберите до пяти локальных источников');
 return streamAIPayload({mode:'rules',question:assertQuestion(question),sources},token,options);
}
/** Human-approved complaint metadata only. No uploads or background analysis. */
export async function streamComplaintAI(question,token,context,options={}){
 if(!context||JSON.stringify(context).length>16000)throw Error('Слишком большой контекст жалобы');
 return streamAIPayload({mode:'complaint',question:assertQuestion(question),case:context},token,options);
}
async function streamAIPayload(payload,token,{fetchImpl=fetch,signal,onDelta=()=>{},onReady=()=>{},onComplete=()=>{}}={}){if(!token?.trim())throw Error('Введите токен локального шлюза');
 const res=await fetchImpl(`${AI_GATEWAY}/v1/chat`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token.trim()}`},body:JSON.stringify(payload),signal,cache:'no-store'});
 if(!res.ok){let error;try{error=(await res.json()).error;}catch{}throw Error(typeof error==='string'&&error.length<200?error:`AI Gateway: HTTP ${res.status}`);}
 if(!res.body)throw Error('Шлюз не передал поток ответа');
 const reader=res.body.getReader(),decoder=new TextDecoder();let pending='',complete=false,total='';
 try{while(true){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});pending=pending.replace(/\r\n/g,'\n');if(pending.length>200_000)throw Error('Повреждённый поток AI');
  while(pending.includes('\n\n')){const i=pending.indexOf('\n\n'),part=pending.slice(0,i);pending=pending.slice(i+2);const event=part.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim();const body=part.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!body)continue;
   let payload;try{payload=JSON.parse(body);}catch{throw Error('Некорректный JSON потока');}
   if(event==='ready')onReady(payload);
   if(event==='delta'){if(typeof payload.text!=='string')throw Error('Неверный фрагмент ответа');total+=payload.text;if(total.length>60_000)throw Error('Ответ слишком длинный');onDelta(payload.text,total);}
   if(event==='complete'){complete=true;onComplete(payload);}
   if(event==='error')throw Error(payload.error||'Ошибка генерации');
  }
 }}finally{reader.releaseLock();}
 if(!complete)throw Error('Поток ответа прерван');return total;
}
