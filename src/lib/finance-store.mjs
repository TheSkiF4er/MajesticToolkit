/** Financial journals: one atomic write per profile; validation on every read and mutation. */
import {api} from './browser.mjs';
import {FINANCE_PREFIX,MAX_FINANCE_EVENTS,financeSnapshot,newFinanceEvent,validateFinanceBatches} from './finance-core.mjs';
import {listFamilies} from './family-store.mjs';
import {listOrganizations} from './organization-store.mjs';
let serial=Promise.resolve();
const locked=fn=>{const job=serial.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-finance-v217',{mode:'exclusive'},fn):fn());serial=job.catch(()=>{});return job;};
const checkId=x=>{if(typeof x!=='string'||!/^[\w-]{8,120}$/.test(x))throw Error('Недопустимый профиль');return x;};
async function owners(){const [families,organizations]=await Promise.all([listFamilies(),listOrganizations()]);return {families,organizations};}
async function read(profileId){const key=FINANCE_PREFIX+checkId(profileId);const raw=(await api.storage.local.get(key))[key];if(raw===undefined)return {profileId,events:[]};if(raw.profileId!==profileId)throw Error('Повреждён ключ финансового профиля');return raw;}
export async function listFinance(){const raw=await api.storage.local.get(null),rows=[];for(const [key,batch] of Object.entries(raw))if(key.startsWith(FINANCE_PREFIX)){if(key!==FINANCE_PREFIX+batch?.profileId)throw Error('Повреждён ключ финансового журнала');rows.push(batch);}return validateFinanceBatches(rows,null,await owners());}
export async function loadFinance(profileId){return financeSnapshot(await read(profileId),await owners());}
export function financeAction(profileId,kind,values={}){return locked(async()=>{
 const prev=await read(profileId),refs=await owners();financeSnapshot(prev,refs);
 if(prev.events.length>=MAX_FINANCE_EVENTS)throw Error('Достигнут лимит финансового журнала');
 const event=newFinanceEvent(profileId,kind,values);
 const snapshot=financeSnapshot({...prev,events:[...prev.events,event]},refs);
 try{await api.storage.local.set({[FINANCE_PREFIX+profileId]:{profileId,events:snapshot.events}});}
 catch(error){try{if(prev.events.length)await api.storage.local.set({[FINANCE_PREFIX+profileId]:prev});else await api.storage.local.remove(FINANCE_PREFIX+profileId);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось откатить финансовую операцию');}throw error;}
 return {event,snapshot};
});}
export function replaceFinance(rows,profileIds=null,ownerRows=null){return locked(async()=>{
 const next=validateFinanceBatches(rows,profileIds,ownerRows??await owners());
 const raw=await api.storage.local.get(null),previous=Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith(FINANCE_PREFIX)));
 const update=Object.fromEntries(next.map(b=>[FINANCE_PREFIX+b.profileId,b]));
 try{if(Object.keys(update).length)await api.storage.local.set(update);const removed=Object.keys(previous).filter(k=>!Object.hasOwn(update,k));if(removed.length)await api.storage.local.remove(removed);}
 catch(err){try{const added=Object.keys(update).filter(k=>!Object.hasOwn(previous,k));if(added.length)await api.storage.local.remove(added);if(Object.keys(previous).length)await api.storage.local.set(previous);}catch(rollback){throw new AggregateError([err,rollback],'Не удалось откатить восстановление финансов');}throw err;}
 return next;
});}
