import {api} from './browser.mjs';
import {TIMERS_KEY,validateTimers,createTimer,MAX_TIMERS} from './timers-core.mjs';
let serial = Promise.resolve();
function enqueue(fn) { const task=serial.then(fn); serial=task.catch(()=>{}); return task; }
export async function listTimers() {
  const data=await api.storage.local.get(TIMERS_KEY);
  return validateTimers(data[TIMERS_KEY]);
}
export async function addTimer(input) {
  return enqueue(async()=>{
    const timers=await listTimers();
    // Older finished timers can be pruned, never drop running timers.
    const active=timers.filter(t=>t.status==='active');
    if(active.length >= MAX_TIMERS) throw Error('Достигнут лимит активных таймеров');
    const retained=timers.filter(t=>t.status==='completed').slice(-Math.max(0,MAX_TIMERS-active.length-1));
    const item=createTimer(input);
    await api.storage.local.set({[TIMERS_KEY]:[...retained,...active,item]});
    return item;
  });
}
export async function completeTimer(id,now=Date.now()) {
  return enqueue(async()=>{
    const timers=await listTimers();
    const index=timers.findIndex(t=>t.id===id);
    if(index<0 || timers[index].status!=='active' || timers[index].expiresAt>now)return null;
    const finished={...timers[index],status:'completed',completedAt:now};
    timers[index]=finished;
    await api.storage.local.set({[TIMERS_KEY]:timers});
    return finished;
  });
}
export async function removeTimer(id) {
  return enqueue(async()=>{
    const timers=await listTimers();
    if(!timers.some(t=>t.id===id)) throw Error('Таймер не найден');
    await api.storage.local.set({[TIMERS_KEY]:timers.filter(t=>t.id!==id)});
    return true;
  });
}
