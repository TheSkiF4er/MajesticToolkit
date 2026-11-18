/** Per-profile atomic journal saves; full replay precedes each mutation. */
import {api} from './browser.mjs';
import {INVENTORY_PREFIX,MAX_INVENTORY_EVENTS,newInventoryEvent,inventorySnapshot,validateInventoryBatches} from './inventory-core.mjs';
import {listMarketplace} from './marketplace-store.mjs';
let queue=Promise.resolve();
const locked=fn=>{const job=queue.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-trading-inventory-v213',{mode:'exclusive'},fn):fn());queue=job.catch(()=>{});return job;};
const profile=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{8,120}$/.test(v))throw Error('Некорректный ID профиля');return v;};
async function read(profileId){const key=INVENTORY_PREFIX+profile(profileId),raw=(await api.storage.local.get(key))[key];if(!raw)return {profileId,events:[]};if(raw.profileId!==profileId||!Array.isArray(raw.events))throw Error('Повреждённый складской журнал');return raw;}
export async function listInventory(){const raw=await api.storage.local.get(null),batches=[];for(const [key,value] of Object.entries(raw))if(key.startsWith(INVENTORY_PREFIX)){if(key!==INVENTORY_PREFIX+value?.profileId)throw Error('Повреждённый ключ склада');batches.push(value);}return validateInventoryBatches(batches,null,await listMarketplace());}
export async function loadInventory(profileId){const batch=await read(profileId);const market=await listMarketplace(profileId);return inventorySnapshot(batch.events,profileId,market);}
export function inventoryAction(profileId,kind,values){return locked(async()=>{
 const batch=await read(profileId),market=await listMarketplace(profileId);
 inventorySnapshot(batch.events,profileId,market);
 if(batch.events.length>=MAX_INVENTORY_EVENTS)throw Error('Лимит складского журнала достигнут');
 const event=newInventoryEvent(profileId,kind,values);
 if(event.kind!=='void'){
  const product=market.find(x=>x.id===event.productId&&x.type==='product');
  if(!product)throw Error('Товар отсутствует в каталоге');
  if(kind==='purchase'&&product.archived)throw Error('Нельзя закупать архивный товар');
 }
 const next=inventorySnapshot([...batch.events,event],profileId,market);
 await api.storage.local.set({[INVENTORY_PREFIX+profileId]:{profileId,events:next.events}});
 return {event,snapshot:next};
});}
export function replaceInventory(batches,profileIds=null,marketRows=null){return locked(async()=>{
 const market=marketRows??await listMarketplace(),next=validateInventoryBatches(batches,profileIds,market);
 const raw=await api.storage.local.get(null),previous=Object.fromEntries(Object.entries(raw).filter(([key])=>key.startsWith(INVENTORY_PREFIX)));
 const update=Object.fromEntries(next.map(entry=>[INVENTORY_PREFIX+entry.profileId,entry]));
 try{if(Object.keys(update).length)await api.storage.local.set(update);const removed=Object.keys(previous).filter(key=>!Object.hasOwn(update,key));if(removed.length)await api.storage.local.remove(removed);}
 catch(error){try{const created=Object.keys(update).filter(key=>!Object.hasOwn(previous,key));if(created.length)await api.storage.local.remove(created);if(Object.keys(previous).length)await api.storage.local.set(previous);}catch(rollback){throw new AggregateError([error,rollback],'Ошибка отката складских данных');}throw error;}
 return next;
});}
