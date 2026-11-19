import {api} from './browser.mjs';
import {ECONOMY_LINK_PREFIX,MAX_ECONOMY_LINKS,cleanEconomyLink,validateEconomyLinks,newEconomyLink} from './economy-links-core.mjs';
import {listMarketplace} from './marketplace-store.mjs';
import {listFamilies} from './family-store.mjs';
import {listOrganizations} from './organization-store.mjs';
import {listCrime} from './crime-store.mjs';
import {listDocumentRecords} from './document-store.mjs';
import {listVault} from './evidence-vault.mjs';
let queue=Promise.resolve();
const locked=fn=>{const job=queue.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('mt-economy-links-v219',{mode:'exclusive'},fn):fn());queue=job.catch(()=>{});return job;};
export async function economyLinkReferences(profiles){
 const [marketplace,families,organizations,crime,documents,vaultRows]=await Promise.all([listMarketplace(),listFamilies(),listOrganizations(),listCrime(),listDocumentRecords(),Promise.all(profiles.map(p=>listVault(p)))]);
 return {marketplace,families,organizations,territories:crime.territories,documents,evidenceVault:vaultRows.flat()};
}
export async function listEconomyLinks(profileId=null){
 const raw=await api.storage.local.get(null),rows=[];
 for(const [key,value] of Object.entries(raw))if(key.startsWith(ECONOMY_LINK_PREFIX)){
  const row=cleanEconomyLink(value);if(key!==ECONOMY_LINK_PREFIX+row.id)throw Error('Повреждённый ключ экономической связи');rows.push(row);
 }
 if(rows.length>MAX_ECONOMY_LINKS)throw Error('Превышен лимит связей');
 return rows.filter(r=>!profileId||r.profileId===profileId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export function addEconomyLink(profileId,fields,profileIds){return locked(async()=>{
 const rows=await listEconomyLinks(),refs=await economyLinkReferences(profileIds),link=newEconomyLink(profileId,fields);
 validateEconomyLinks([...rows,link],profileIds,refs);
 await api.storage.local.set({[ECONOMY_LINK_PREFIX+link.id]:link});return link;
});}
export function removeEconomyLink(profileId,id){return locked(async()=>{
 const row=(await listEconomyLinks()).find(r=>r.id===id&&r.profileId===profileId);if(!row)throw Error('Связь отсутствует в выбранном профиле');
 await api.storage.local.remove(ECONOMY_LINK_PREFIX+id);return row;
});}
export function replaceEconomyLinks(raw,profileIds,refs){return locked(async()=>{
 const valid=validateEconomyLinks(raw,profileIds,refs??await economyLinkReferences(profileIds));
 const stored=await api.storage.local.get(null),previous=Object.fromEntries(Object.entries(stored).filter(([k])=>k.startsWith(ECONOMY_LINK_PREFIX)));
 const next=Object.fromEntries(valid.map(r=>[ECONOMY_LINK_PREFIX+r.id,r]));
 try{
  if(Object.keys(next).length)await api.storage.local.set(next);
  const stale=Object.keys(previous).filter(k=>!Object.hasOwn(next,k));if(stale.length)await api.storage.local.remove(stale);
 }catch(error){try{const added=Object.keys(next).filter(k=>!Object.hasOwn(previous,k));if(added.length)await api.storage.local.remove(added);if(Object.keys(previous).length)await api.storage.local.set(previous);}catch(rollback){throw new AggregateError([error,rollback],'Не удалось откатить восстановление экономических связей');}throw error;}
 return valid;
});}
