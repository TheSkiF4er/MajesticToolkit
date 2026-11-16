import {api} from './browser.mjs';
import {loadState} from './state.mjs';
import {getActiveProfile} from './model.mjs';
import {getCase} from './complaints-store.mjs';
import {listRules} from './rules-store.mjs';
import {REGISTRY_KEY,validateRegistry,registerDecision,transitionRegistry,filterRegistry} from './punishment-registry-core.mjs';
export {REGISTRY_KEY,validateRegistry};
let tail=Promise.resolve();const serial=fn=>{const job=tail.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request(REGISTRY_KEY,fn):fn());tail=job.catch(()=>{});return job;};
async function active(profileId){const state=await loadState(),p=getActiveProfile(state);if(p.id!==profileId)throw Error('Активный профиль изменился');return {state,p};}
async function read(){return (await api.storage.local.get(REGISTRY_KEY))[REGISTRY_KEY]??{version:1,records:[]};}
export async function exportRegistryData(profiles){return validateRegistry(await read(),profiles);}
export function replaceRegistryData(value,profiles){return serial(async()=>api.storage.local.set({[REGISTRY_KEY]:validateRegistry(value,profiles)}));}
export function removeRegistryProfile(id){return serial(async()=>{const v=await read();await api.storage.local.set({[REGISTRY_KEY]:validateRegistry({version:1,records:v.records.filter(r=>r.profileId!==id)})});});}
export async function listRegistry(profileId){const {state,p}=await active(profileId);return filterRegistry((await exportRegistryData(state.profiles)).records,p);}
export function registryAction(profileId,action,input={}){return serial(async()=>{const {state,p}=await active(profileId),data=await exportRegistryData(state.profiles);let record;
 if(action==='register'){const c=await getCase(input.caseId);record=registerDecision(c,p,await listRules(),data.records,input.snapshotId);if(data.records.some(r=>r.id===record.id))return record;data.records.push(record);}
 else if(action==='transition'){const i=data.records.findIndex(r=>r.id===input.id&&r.profileId===p.id&&r.project===p.project&&r.server===p.server);if(i<0)throw Error('Запись не найдена в текущем профиле');record=transitionRegistry(data.records[i],input.state,input.note,input.expected);data.records[i]=record;}
 else throw Error('Неизвестное действие реестра');
 const fresh=await active(profileId);if(fresh.p.project!==p.project||fresh.p.server!==p.server)throw Error('Сервер изменился');if(action==='register'){const latest=await getCase(input.caseId);if(latest.status!=='done'||latest.moderation?.history[0]?.id!==input.snapshotId||latest.draft!==record.decisionText||latest.workflow.decision!==record.decision)throw Error('Жалоба изменилась');}
 await api.storage.local.set({[REGISTRY_KEY]:validateRegistry(data,fresh.state.profiles)});return record;
});}
