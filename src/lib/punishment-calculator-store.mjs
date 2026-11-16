import {api} from './browser.mjs';
import {loadState} from './state.mjs';
import {listRules} from './rules-store.mjs';
import {defaultPolicy,validatePolicy,calculatePunishments} from './punishment-calculator.mjs';
import {OVERLAY_PREFIX} from './punishment-overlay-store.mjs';
const PREFIX='mtPunishmentCalculatorV1:';
const key=p=>PREFIX+p.id+':'+p.project+':'+encodeURIComponent(p.server);
let pending=Promise.resolve();
const serial=fn=>{const run=()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request(PREFIX,fn):fn();const job=pending.then(run);pending=job.catch(()=>{});return job;};
async function assertProfile(p){const s=await loadState(),a=s.profiles.find(x=>x.id===s.activeProfileId);if(!a||a.id!==p.id||a.project!==p.project||a.server!==p.server)throw Error('Активный профиль или сервер изменился');}
export async function loadCalculator(p){await assertProfile(p);const raw=(await api.storage.local.get(key(p)))[key(p)];return {policy:raw?.policy?validatePolicy(raw.policy,p.project):defaultPolicy(),history:Array.isArray(raw?.history)?raw.history.slice(0,20):[]};}
export function savePolicy(p,policy){return serial(async()=>{const old=await loadCalculator(p),next={...old,policy:validatePolicy(policy,p.project)};await api.storage.local.set({[key(p)]:next});return next;});}
export function saveCalculation(p,players,policy){return serial(async()=>{const old=await loadCalculator(p),result=calculatePunishments(players,await listRules(),p,policy);await assertProfile(p);const record={id:crypto.randomUUID(),result};const history=[record,...old.history].slice(0,20);while(new TextEncoder().encode(JSON.stringify(history)).length>2*1024*1024&&history.length>1)history.pop();if(new TextEncoder().encode(JSON.stringify(history)).length>2*1024*1024)throw Error('Расчёт слишком большой');await api.storage.local.set({[key(p)]:{...old,history}});return record;});}
export function deleteCalculation(p,id){return serial(async()=>{const old=await loadCalculator(p);await api.storage.local.set({[key(p)]:{...old,history:old.history.filter(x=>x.id!==id)}});});}
export async function listCalculatorDrafts(p){await assertProfile(p);const k=OVERLAY_PREFIX+p.id,raw=(await api.storage.local.get(k))[k];return Array.isArray(raw)?raw.filter(d=>typeof d?.thread==='string'&&Array.isArray(d.items)).slice(0,50):[];}
export function removeCalculatorProfile(id){return serial(async()=>{const all=await api.storage.local.get(null);const keys=Object.keys(all).filter(k=>k.startsWith(PREFIX+id+':'));if(keys.length)await api.storage.local.remove(keys);});}
