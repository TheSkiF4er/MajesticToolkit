import {api} from './browser.mjs';
import {defaultProductivity,PRODUCTIVITY_KEY,validateProductivity} from './productivity-core.mjs';
let pending=Promise.resolve();
export async function loadProductivity(){
  const raw=(await api.storage.local.get(PRODUCTIVITY_KEY))[PRODUCTIVITY_KEY];
  return raw===undefined?defaultProductivity():validateProductivity(raw);
}
export function saveProductivity(patch){
  const task=pending.then(async()=>{
    const settings=validateProductivity({...await loadProductivity(),...patch});
    await api.storage.local.set({[PRODUCTIVITY_KEY]:settings});
    return settings;
  });
  pending=task.catch(()=>{});return task;
}
export function replaceProductivity(data){return saveProductivity(validateProductivity(data));}
