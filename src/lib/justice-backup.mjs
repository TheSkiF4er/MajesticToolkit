/** Backup v19: full cross-store judicial preflight before export/import.
 * Compatible with historical v1-v18; JSON keeps Vault metadata while ZIP
 * carries and verifies binary attachments. No transient AI consent is exported. */
import {makeBackupV18,parseBackupV18} from './ai-backup.mjs';
import {verifyJusticeIntegrity} from './government-justice-ga.mjs';
import {validateVaultInventory} from './dossier-backup.mjs';
import {validateMarketplace} from './marketplace-core.mjs';
import {validateInventoryBatches} from './inventory-core.mjs';
import {validateFamilies} from './family-core.mjs';

const MAX_BYTES=48*1024*1024;
const safeJSON=text=>{if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Резервная копия превышает 48 МиБ');try{return JSON.parse(text);}catch{throw Error('Некорректный JSON резервной копии');}};
const check=async backup=>{
 const profiles=backup.state.profiles;
 await verifyJusticeIntegrity(profiles,backup.government??[],backup.documents??[],backup.evidenceVault);
 return backup;
};
export async function makeBackupV19(args,punishments,sections,registry,operations,inventory,aiWorkspace=null,marketplace=[],tradingInventory=[],families=[]){
 const safeInventory=validateVaultInventory(inventory,args[0].profiles);
 const backup=JSON.parse(makeBackupV18(args,punishments,sections,registry,operations,safeInventory,aiWorkspace));
 await verifyJusticeIntegrity(backup.payload.profiles,backup.government,backup.documents,safeInventory);
 const marketRows=validateMarketplace(marketplace,backup.payload.profiles.map(p=>p.id));
 const trading=validateInventoryBatches(tradingInventory,backup.payload.profiles.map(p=>p.id),marketRows);
 const familyRows=validateFamilies(families,backup.payload.profiles.map(p=>p.id));
 const result=JSON.stringify({...backup,schemaVersion:19,marketplace:marketRows,tradingInventory:trading,families:familyRows},null,2);
 if(new TextEncoder().encode(result).length>MAX_BYTES)throw Error('Резервная копия превышает 48 МиБ');
 return result;
}
export async function parseBackupV19(text,validateState,cleanTemplate){
 const raw=safeJSON(text);
 if(raw?.schemaVersion!==19)return {...await check(parseBackupV18(text,validateState,cleanTemplate)),marketplace:null,tradingInventory:null,families:null};
 if(raw.format!=='majestictoolkit-backup'||!Object.hasOwn(raw,'aiWorkspace')||!Array.isArray(raw.evidenceVault))throw Error('Некорректный Backup v19');
 const parsed=parseBackupV18(JSON.stringify({...raw,schemaVersion:18}),validateState,cleanTemplate);
 await check(parsed);
 const marketplace=Object.hasOwn(raw,'marketplace')?validateMarketplace(raw.marketplace,parsed.state.profiles.map(p=>p.id)):null;
 const tradingInventory=Object.hasOwn(raw,'tradingInventory')?validateInventoryBatches(raw.tradingInventory,parsed.state.profiles.map(p=>p.id),marketplace):null;
 if(tradingInventory&&!marketplace&&tradingInventory.some(b=>b.events.length))throw Error('Складской журнал без рыночного каталога');
 const families=Object.hasOwn(raw,'families')?validateFamilies(raw.families,parsed.state.profiles.map(p=>p.id)):null;
 return {...parsed,schemaVersion:19,marketplace,tradingInventory,families};
}
