/** Economy & Crime 2.2.0: live end-to-end integrity certification.
 * This module reads real browser stores, does not mutate them, and never reports
 * success for a store that could not be read or validated. */
import {validateRecords} from './economy-core.mjs';
import {validateMarketplace} from './marketplace-core.mjs';
import {validateInventoryBatches} from './inventory-core.mjs';
import {validateFamilies} from './family-core.mjs';
import {validateOrganizations} from './organization-core.mjs';
import {validateCrime} from './crime-core.mjs';
import {validateFinanceBatches} from './finance-core.mjs';
import {validateEconomyLinks} from './economy-links-core.mjs';
import {listEconomyStrict} from './economy-store.mjs';
import {listMarketplace} from './marketplace-store.mjs';
import {listInventory} from './inventory-store.mjs';
import {listFamilies} from './family-store.mjs';
import {listOrganizations} from './organization-store.mjs';
import {listCrime} from './crime-store.mjs';
import {listFinance} from './finance-store.mjs';
import {listEconomyLinks} from './economy-links-store.mjs';
import {listDocumentRecords} from './document-store.mjs';
import {listVault} from './evidence-vault.mjs';

const checks=[
 ['legacy','Старые сделки и операции'],
 ['marketplace','Рынок и цены'],
 ['inventory','Складские партии'],
 ['families','Семьи и составы'],
 ['organizations','Организации и активы'],
 ['crime','Территории и капты'],
 ['finance','Финансовые счета и бюджеты'],
 ['links','Документы и доказательства']
];
const assertProfiles=ids=>{if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!/^[\w-]{8,120}$/.test(x)))throw Error('Недопустимый список RP-профилей');return ids;};
const count=(kind,db)=>kind==='inventory'?db.reduce((n,b)=>n+b.events.length,0):kind==='crime'?db.territories.length+db.operations.length:db.length;
/** Pure, testable audit for the exact dataset to be exported or restored. */
export function auditEconomyDataset(data,profileIds){
 const ids=assertProfiles(profileIds),results=[],issues=[];
 const perform=(key,fn)=>{
  const label=checks.find(x=>x[0]===key)[1];
  try{const value=fn();results.push({key,label,ok:true,count:count(key,value)});return value;}
  catch(error){results.push({key,label,ok:false,count:0});issues.push({key,label,message:String(error?.message??error).slice(0,500)});return null;}
 };
 perform('legacy',()=>validateRecords(data.legacy,ids));
 const marketplace=perform('marketplace',()=>validateMarketplace(data.marketplace,ids));
 const families=perform('families',()=>validateFamilies(data.families,ids));
 const organizations=perform('organizations',()=>validateOrganizations(data.organizations,ids));
 // If a parent store is broken, child checks must fail, rather than treating refs as empty.
 perform('inventory',()=>{if(!marketplace)throw Error('Сначала исправьте каталог товаров');return validateInventoryBatches(data.inventory,ids,marketplace);});
 const crime=perform('crime',()=>{if(!families||!organizations)throw Error('Сначала исправьте реестр владельцев');const result=validateCrime(data.crime.territories,data.crime.operations,ids,families,organizations);return {territories:result.territories,operations:result.operations};});
 perform('finance',()=>{if(!families||!organizations)throw Error('Сначала исправьте реестр владельцев');return validateFinanceBatches(data.finance,ids,{families,organizations});});
 perform('links',()=>{
  if(!marketplace||!families||!organizations||!crime)throw Error('Сначала исправьте экономические реестры');
  return validateEconomyLinks(data.links,ids,{marketplace,families,organizations,territories:crime.territories,documents:data.documents,evidenceVault:data.evidenceVault});
 });
 return {ok:issues.length===0,checked:results.length,results,issues,profileCount:ids.length};
}

/** Audit all stored profiles; an unreadable store becomes an explicit failed check. */
export async function runEconomyGAAudit(profileIds){
 const ids=assertProfiles(profileIds),data={},failures=[];
 const get=async(key,fn)=>{try{data[key]=await fn();}catch(error){failures.push({key,message:String(error?.message??error).slice(0,500)});}};
 await Promise.all([
  get('legacy',listEconomyStrict),get('marketplace',listMarketplace),
  get('inventory',listInventory),get('families',listFamilies),
  get('organizations',listOrganizations),get('crime',listCrime),
  get('finance',listFinance),get('links',listEconomyLinks),
  get('documents',listDocumentRecords),
  get('evidenceVault',async()=>(await Promise.all(ids.map(id=>listVault(id)))).flat())
 ]);
 // A missing source must be reported; never fake an empty, healthy collection.
 const missing=new Set(failures.map(x=>x.key));
 const results=[],issues=[];
 for(const [key,label] of checks){
  const upstream=key==='inventory'?['marketplace']:key==='crime'||key==='finance'?['families','organizations']:key==='links'?['marketplace','families','organizations','crime','documents','evidenceVault']:[];
  if(missing.has(key)||upstream.some(x=>missing.has(x))){
   results.push({key,label,ok:false,count:0});issues.push({key,label,message:failures.find(x=>x.key===key)?.message??'Не удалось прочитать зависимый реестр'});
  }
 }
 // Core returns one result per store. Suppress these failed checks from the second pass
 // and reuse only successful checks so that diagnostic records are not duplicated.
 const safe={legacy:data.legacy??[],marketplace:data.marketplace??[],inventory:data.inventory??[],families:data.families??[],organizations:data.organizations??[],crime:data.crime??{territories:[],operations:[]},finance:data.finance??[],links:data.links??[],documents:data.documents??[],evidenceVault:data.evidenceVault??[]};
 const evaluated=auditEconomyDataset(safe,ids);
 for(const result of evaluated.results){if(!results.some(r=>r.key===result.key)){results.push(result);if(!result.ok)issues.push(...evaluated.issues.filter(x=>x.key===result.key));}}
 return {ok:issues.length===0,checked:checks.length,results:checks.map(([key])=>results.find(r=>r.key===key)),issues,profileCount:ids.length,at:new Date().toISOString()};
}
