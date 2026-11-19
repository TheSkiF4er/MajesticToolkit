/** Durable source links for territorial records, airdrops, plans and simulations. */
import {api} from './browser.mjs';
import {TACTICAL_LINK_PREFIX,TACTICAL_LINK_LIMIT,cleanTacticalLink,newTacticalLink,validateTacticalLinks} from './tactical-links-core.mjs';
import {listCrime} from './crime-store.mjs';
import {listAirdrops} from './tactical-airdrop-store.mjs';
import {listTacticalPlans} from './tactical-planning-store.mjs';
import {listTacticalSimulations} from './tactical-simulation-store.mjs';
import {listDocumentRecords} from './document-store.mjs';
import {listVault} from './evidence-vault.mjs';
let serial=Promise.resolve();
const lock=fn=>{const result=serial.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-tactical-links-v229',{mode:'exclusive'},fn):fn());serial=result.catch(()=>{});return result;};
export async function listTacticalLinks(profileId=null){const all=await api.storage.local.get(null),rows=[];for(const [key,raw] of Object.entries(all))if(key.startsWith(TACTICAL_LINK_PREFIX)){const row=cleanTacticalLink(raw);if(key!==TACTICAL_LINK_PREFIX+row.id)throw Error('Повреждён ключ тактической ссылки');rows.push(row);}if(rows.length>TACTICAL_LINK_LIMIT)throw Error('Превышен лимит ссылок');return rows.filter(x=>!profileId||x.profileId===profileId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function tacticalLinkReferences(profiles){const [crime,airdrops,plans,simulations,documents,inventory]=await Promise.all([listCrime(),listAirdrops(),listTacticalPlans(),listTacticalSimulations(),listDocumentRecords(),Promise.all(profiles.map(p=>listVault(p)))]);return {territories:crime.territories,airdropEvents:airdrops.events,plans,simulations,documents,evidenceVault:inventory.flat()};}
export function addTacticalLink(profileId,fields,profiles){return lock(async()=>{const link=newTacticalLink(profileId,fields),rows=await listTacticalLinks(),refs=await tacticalLinkReferences(profiles);validateTacticalLinks([...rows,link],profiles,refs);await api.storage.local.set({[TACTICAL_LINK_PREFIX+link.id]:link});return link;});}
export function removeTacticalLink(profileId,id){return lock(async()=>{const row=(await listTacticalLinks(profileId)).find(x=>x.id===id);if(!row)throw Error('Связь не найдена в профиле');await api.storage.local.remove(TACTICAL_LINK_PREFIX+id);return row;});}

/** Remove links for a deleted RP-profile without touching remaining profiles. */
export function clearOrphanTacticalLinks(profileIds){return lock(async()=>{const allowed=new Set(profileIds),rows=await listTacticalLinks(),keys=rows.filter(x=>!allowed.has(x.profileId)).map(x=>TACTICAL_LINK_PREFIX+x.id);if(keys.length)await api.storage.local.remove(keys);return keys.length;});}
