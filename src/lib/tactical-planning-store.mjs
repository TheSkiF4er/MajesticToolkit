import {withTacticalWriteLock} from './tactical-lock.mjs';
/** Transactional-per-record planning operations using the existing extension storage. */
import {api} from './browser.mjs';
import {PLAN_PREFIX,PLAN_LIMITS,cleanPlan,createPlan,mutatePlan,duplicatePlan,planExport} from './tactical-planning-core.mjs';
import {listFamilies} from './family-store.mjs';
import {listOrganizations} from './organization-store.mjs';
import {getTacticalMap} from './tactical-map-store.mjs';
import {SIMULATION_PREFIX,cleanTacticalSimulation} from './tactical-simulation-core.mjs';
import {TACTICAL_LINK_PREFIX,cleanTacticalLink} from './tactical-links-core.mjs';
const lock=withTacticalWriteLock;
async function all(){const data=await api.storage.local.get(null),result=[];for(const [key,value] of Object.entries(data)){if(!key.startsWith(PLAN_PREFIX))continue;if(key!==PLAN_PREFIX+value?.id)throw Error('Повреждён ключ тактического плана');result.push(cleanPlan(value));}return result;}
export async function listTacticalPlans(profileId){const rows=await all();return profileId?rows.filter(x=>x.profileId===profileId):rows;}
async function checkGroup(profileId,group){if(!group)return;const entries=group.type==='family'?await listFamilies():await listOrganizations();if(!entries.some(x=>x.id===group.id&&x.profileId===profileId&&!x.archived))throw Error('Семья или организация отсутствует либо архивирована');}
async function checkMap(profileId,sha){const map=await getTacticalMap(profileId,{verify:false});if(!map||map.meta.sha256!==sha)throw Error('Подложка карты была удалена или изменена. Используйте исходную карту');}
export function addTacticalPlan(profileId,fields){return lock(async()=>{const rows=await all(),p=createPlan(profileId,fields);if(rows.filter(x=>x.profileId===profileId).length>=PLAN_LIMITS.plans)throw Error('Лимит планов достигнут');await checkMap(profileId,p.state.mapSha256);await checkGroup(profileId,p.state.group);await api.storage.local.set({[PLAN_PREFIX+p.id]:p});return p;});}
export function editTacticalPlan(id,profileId,action,fields={}){return lock(async()=>{const rows=await all(),p=rows.find(x=>x.id===id&&x.profileId===profileId);if(!p)throw Error('План не найден в профиле');const next=mutatePlan(p,action,fields);if(action!=='archive'){await checkMap(profileId,next.state.mapSha256);await checkGroup(profileId,next.state.group);}await api.storage.local.set({[PLAN_PREFIX+id]:next});return next;});}
export function forkTacticalPlan(id,profileId,title){return lock(async()=>{const rows=await all(),p=rows.find(x=>x.id===id&&x.profileId===profileId);if(!p)throw Error('План не найден');if(rows.filter(x=>x.profileId===profileId).length>=PLAN_LIMITS.plans)throw Error('Лимит планов достигнут');await checkMap(profileId,p.state.mapSha256);const next=duplicatePlan(p,{title});await checkGroup(profileId,next.state.group);await api.storage.local.set({[PLAN_PREFIX+next.id]:next});return next;});}
/** Permanent removal is explicit and allowed only for archived, unreferenced plans. */
export function deleteTacticalPlan(profileId,id){return lock(async()=>{
 const rows=await all(),plan=rows.find(x=>x.profileId===profileId&&x.id===id);
 if(!plan)throw Error('План не найден в профиле');
 if(!plan.state.archived)throw Error('Перед удалением перенесите план в архив');
 if(rows.some(x=>x.id!==id&&x.profileId===profileId&&x.state.parentPlanId===id))throw Error('На план ссылается другой тактический вариант');
 const storage=await api.storage.local.get(null);
 for(const [key,raw] of Object.entries(storage)){
  if(key.startsWith(SIMULATION_PREFIX)){
   const run=cleanTacticalSimulation(raw);
   if(key!==SIMULATION_PREFIX+run.id)throw Error('Повреждён ключ симуляции');
   if(run.profileId===profileId&&run.plan.id===id)throw Error('План используется сохранённой симуляцией');
  }else if(key.startsWith(TACTICAL_LINK_PREFIX)){
   const link=cleanTacticalLink(raw);
   if(key!==TACTICAL_LINK_PREFIX+link.id)throw Error('Повреждён ключ тактической ссылки');
   if(link.profileId===profileId&&link.entityType==='plan'&&link.entityId===id)throw Error('План связан с источником. Сначала удалите связь');
  }
 }
 await api.storage.local.remove(PLAN_PREFIX+id);return plan;
});}
export async function exportTacticalPlans(profileId){return planExport(await all(),profileId);}
export function clearOrphanTacticalPlans(profileIds){return lock(async()=>{const allowed=new Set(profileIds),rows=await all(),keys=rows.filter(x=>!allowed.has(x.profileId)).map(x=>PLAN_PREFIX+x.id);if(keys.length)await api.storage.local.remove(keys);return keys.length;});}
