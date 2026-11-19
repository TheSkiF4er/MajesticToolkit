/** Block destructive map operations while stored tactical records depend on the image.
 * Even archived plans and points retain a SHA-256 reference for portable backup.
 */
import {PLAN_PREFIX,cleanPlan} from './tactical-planning-core.mjs';
import {SIMULATION_PREFIX,cleanTacticalSimulation} from './tactical-simulation-core.mjs';
import {AIRDROP_POINT_PREFIX,cleanAirdropPoint} from './tactical-airdrop-core.mjs';
import {TACTICAL_LINK_PREFIX,cleanTacticalLink} from './tactical-links-core.mjs';

export function assertTacticalMapIsReplaceable(storage,profileId,incomingSha256=null){
 if(!storage||typeof storage!=='object'||Array.isArray(storage))throw Error('Хранилище тактических данных недоступно');
 for(const [key,raw] of Object.entries(storage)){
  if(key.startsWith(PLAN_PREFIX)){
   const plan=cleanPlan(raw);
   if(key!==PLAN_PREFIX+plan.id)throw Error('Повреждён ключ плана');
   if(plan.profileId===profileId&&plan.state.mapSha256!==incomingSha256)throw Error('Карта используется тактическим планом (включая архив). Сначала удалите связанные данные');
  }else if(key.startsWith(SIMULATION_PREFIX)){
   const run=cleanTacticalSimulation(raw);
   if(key!==SIMULATION_PREFIX+run.id)throw Error('Повреждён ключ симуляции');
   if(run.profileId===profileId&&run.result.mapSha256!==incomingSha256)throw Error('Карта используется сохранённой симуляцией. Сначала удалите связанные данные');
  }else if(key.startsWith(AIRDROP_POINT_PREFIX)){
   const point=cleanAirdropPoint(raw);
   if(key!==AIRDROP_POINT_PREFIX+point.id)throw Error('Повреждён ключ точки аирдропа');
   if(point.profileId===profileId&&point.mapSha256&&point.mapSha256!==incomingSha256)throw Error('Карта используется точкой аирдропа (включая архив). Сначала удалите связанные данные');
  }else if(key.startsWith(TACTICAL_LINK_PREFIX)){
   const link=cleanTacticalLink(raw);
   if(key!==TACTICAL_LINK_PREFIX+link.id)throw Error('Повреждён ключ тактической ссылки');
  }
 }
}
