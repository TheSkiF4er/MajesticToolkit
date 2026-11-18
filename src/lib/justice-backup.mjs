/** Backup v19: full cross-store judicial preflight before export/import.
 * Compatible with historical v1-v18; JSON keeps Vault metadata while ZIP
 * carries and verifies binary attachments. No transient AI consent is exported. */
import {makeBackupV18,parseBackupV18} from './ai-backup.mjs';
import {verifyJusticeIntegrity} from './government-justice-ga.mjs';
import {validateVaultInventory} from './dossier-backup.mjs';

const MAX_BYTES=48*1024*1024;
const safeJSON=text=>{if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Резервная копия превышает 48 МиБ');try{return JSON.parse(text);}catch{throw Error('Некорректный JSON резервной копии');}};
const check=async backup=>{
 const profiles=backup.state.profiles;
 await verifyJusticeIntegrity(profiles,backup.government??[],backup.documents??[],backup.evidenceVault);
 return backup;
};
export async function makeBackupV19(args,punishments,sections,registry,operations,inventory,aiWorkspace=null){
 const safeInventory=validateVaultInventory(inventory,args[0].profiles);
 const backup=JSON.parse(makeBackupV18(args,punishments,sections,registry,operations,safeInventory,aiWorkspace));
 await verifyJusticeIntegrity(backup.payload.profiles,backup.government,backup.documents,safeInventory);
 const result=JSON.stringify({...backup,schemaVersion:19},null,2);
 if(new TextEncoder().encode(result).length>MAX_BYTES)throw Error('Резервная копия превышает 48 МиБ');
 return result;
}
export async function parseBackupV19(text,validateState,cleanTemplate){
 const raw=safeJSON(text);
 if(raw?.schemaVersion!==19)return check(parseBackupV18(text,validateState,cleanTemplate));
 if(raw.format!=='majestictoolkit-backup'||!Object.hasOwn(raw,'aiWorkspace')||!Array.isArray(raw.evidenceVault))throw Error('Некорректный Backup v19');
 const parsed=parseBackupV18(JSON.stringify({...raw,schemaVersion:18}),validateState,cleanTemplate);
 await check(parsed);
 return {...parsed,schemaVersion:19};
}
