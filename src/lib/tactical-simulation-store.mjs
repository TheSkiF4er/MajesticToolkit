/** Durable, profile-isolated, immutable simulation results. No mutation of source plans or Crime records. */
import {api} from './browser.mjs';
import {SIMULATION_PREFIX,SIMULATION_LIMITS,cleanTacticalSimulation,createTacticalSimulation,compareTacticalSimulations,simulationExport} from './tactical-simulation-core.mjs';
import {listTacticalPlans} from './tactical-planning-store.mjs';
import {getTacticalMap} from './tactical-map-store.mjs';
let queue=Promise.resolve();
const lock=work=>{const run=queue.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-simulation-v227',{mode:'exclusive'},work):work());queue=run.catch(()=>{});return run;};
async function all(){const data=await api.storage.local.get(null),out=[];for(const [key,value] of Object.entries(data)){if(!key.startsWith(SIMULATION_PREFIX))continue;const run=cleanTacticalSimulation(value);if(key!==SIMULATION_PREFIX+run.id)throw Error('Повреждён ключ сохранённой симуляции');out.push(run);}return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));}
export async function listTacticalSimulations(profileId){const rows=await all();return profileId?rows.filter(x=>x.profileId===profileId):rows;}
export function addTacticalSimulation(profileId,{planId,title,settings}){return lock(async()=>{
 const rows=await all();if(rows.filter(x=>x.profileId===profileId).length>=SIMULATION_LIMITS.perProfile)throw Error('Лимит сохранённых симуляций достигнут');
 const plan=(await listTacticalPlans(profileId)).find(x=>x.id===planId);if(!plan)throw Error('План не найден в активном профиле');
 const map=await getTacticalMap(profileId);if(!map||map.meta.sha256!==plan.state.mapSha256)throw Error('Для запуска требуется исходная подложка карты');
 const run=createTacticalSimulation(profileId,plan,title,settings,{width:map.meta.width,height:map.meta.height});
 if(JSON.stringify(run).length>SIMULATION_LIMITS.bytes)throw Error('Сценарий превышает допустимый объём хранения');
 await api.storage.local.set({[SIMULATION_PREFIX+run.id]:run});return run;
});}
export function deleteTacticalSimulation(profileId,id){return lock(async()=>{const rows=await all(),row=rows.find(x=>x.id===id&&x.profileId===profileId);if(!row)throw Error('Симуляция не найдена');await api.storage.local.remove(SIMULATION_PREFIX+id);return row;});}
export async function compareSavedSimulations(profileId,aId,bId){const rows=await listTacticalSimulations(profileId),a=rows.find(x=>x.id===aId),b=rows.find(x=>x.id===bId);if(!a||!b)throw Error('Сравниваемый сценарий отсутствует');return compareTacticalSimulations(a,b);}
export async function exportTacticalSimulations(profileId){return simulationExport(await all(),profileId);}
export function clearOrphanTacticalSimulations(profileIds){return lock(async()=>{const allowed=new Set(profileIds),rows=await all(),keys=rows.filter(x=>!allowed.has(x.profileId)).map(x=>SIMULATION_PREFIX+x.id);if(keys.length)await api.storage.local.remove(keys);return keys.length;});}
