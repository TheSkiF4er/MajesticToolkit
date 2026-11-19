/** Transactional-per-record planning operations using the existing extension storage. */
import {api} from './browser.mjs';
import {PLAN_PREFIX,PLAN_LIMITS,cleanPlan,createPlan,mutatePlan,duplicatePlan,planExport} from './tactical-planning-core.mjs';
import {listFamilies} from './family-store.mjs';
import {listOrganizations} from './organization-store.mjs';
import {getTacticalMap} from './tactical-map-store.mjs';
let serial=Promise.resolve();
const lock=fn=>{const run=serial.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-planning-v226',{mode:'exclusive'},fn):fn());serial=run.catch(()=>{});return run;};
async function all(){const data=await api.storage.local.get(null),result=[];for(const [key,value] of Object.entries(data)){if(!key.startsWith(PLAN_PREFIX))continue;if(key!==PLAN_PREFIX+value?.id)throw Error('Повреждён ключ тактического плана');result.push(cleanPlan(value));}return result;}
export async function listTacticalPlans(profileId){const rows=await all();return profileId?rows.filter(x=>x.profileId===profileId):rows;}
async function checkGroup(profileId,group){if(!group)return;const entries=group.type==='family'?await listFamilies():await listOrganizations();if(!entries.some(x=>x.id===group.id&&x.profileId===profileId&&!x.archived))throw Error('Семья или организация отсутствует либо архивирована');}
async function checkMap(profileId,sha){const map=await getTacticalMap(profileId,{verify:false});if(!map||map.meta.sha256!==sha)throw Error('Подложка карты была удалена или изменена. Используйте исходную карту');}
export function addTacticalPlan(profileId,fields){return lock(async()=>{const rows=await all(),p=createPlan(profileId,fields);if(rows.filter(x=>x.profileId===profileId).length>=PLAN_LIMITS.plans)throw Error('Лимит планов достигнут');await checkMap(profileId,p.state.mapSha256);await checkGroup(profileId,p.state.group);await api.storage.local.set({[PLAN_PREFIX+p.id]:p});return p;});}
export function editTacticalPlan(id,profileId,action,fields={}){return lock(async()=>{const rows=await all(),p=rows.find(x=>x.id===id&&x.profileId===profileId);if(!p)throw Error('План не найден в профиле');const next=mutatePlan(p,action,fields);if(action!=='archive'){await checkMap(profileId,next.state.mapSha256);await checkGroup(profileId,next.state.group);}await api.storage.local.set({[PLAN_PREFIX+id]:next});return next;});}
export function forkTacticalPlan(id,profileId,title){return lock(async()=>{const rows=await all(),p=rows.find(x=>x.id===id&&x.profileId===profileId);if(!p)throw Error('План не найден');if(rows.filter(x=>x.profileId===profileId).length>=PLAN_LIMITS.plans)throw Error('Лимит планов достигнут');await checkMap(profileId,p.state.mapSha256);const next=duplicatePlan(p,{title});await checkGroup(profileId,next.state.group);await api.storage.local.set({[PLAN_PREFIX+next.id]:next});return next;});}
export async function exportTacticalPlans(profileId){return planExport(await all(),profileId);}
export function clearOrphanTacticalPlans(profileIds){return lock(async()=>{const allowed=new Set(profileIds),rows=await all(),keys=rows.filter(x=>!allowed.has(x.profileId)).map(x=>PLAN_PREFIX+x.id);if(keys.length)await api.storage.local.remove(keys);return keys.length;});}
