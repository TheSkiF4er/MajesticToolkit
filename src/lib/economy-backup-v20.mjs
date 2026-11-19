/** Backup v20: validated economy cross-links, while retaining all v1-v19 restore paths. */
import {makeBackupV19,parseBackupV19} from './justice-backup.mjs';
import {validateEconomyLinks} from './economy-links-core.mjs';
const LIMIT=48*1024*1024;
export async function makeBackupV20(args,punishments,sections,registry,operations,evidenceVault,aiWorkspace=null,marketplace=[],tradingInventory=[],families=[],organizations=[],territories=[],crimeEvents=[],financeLedger=[],economyLinks=[]){
 const base=JSON.parse(await makeBackupV19(args,punishments,sections,registry,operations,evidenceVault,aiWorkspace,marketplace,tradingInventory,families,organizations,territories,crimeEvents,financeLedger));
 const profiles=base.payload.profiles.map(r=>r.id);
 const links=validateEconomyLinks(economyLinks,profiles,{marketplace:base.marketplace,families:base.families,organizations:base.organizations,territories:base.territories,documents:base.documents,evidenceVault:base.evidenceVault});
 const json=JSON.stringify({...base,schemaVersion:20,economyLinks:links},null,2);
 if(new TextEncoder().encode(json).length>LIMIT)throw Error('Backup v20 превышает 48 МиБ');return json;
}
export async function parseBackupV20(text,validateState,cleanTemplate){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>LIMIT)throw Error('Backup v20 превышает 48 МиБ');
 let data;try{data=JSON.parse(text);}catch{throw Error('Некорректный JSON резервной копии');}
 if(data?.schemaVersion!==20){const legacy=await parseBackupV19(text,validateState,cleanTemplate);return {...legacy,economyLinks:null};}
 if(data.format!=='majestictoolkit-backup'||!Array.isArray(data.economyLinks))throw Error('Неверная структура Backup v20');
 const parsed=await parseBackupV19(JSON.stringify({...data,schemaVersion:19}),validateState,cleanTemplate);
 const links=validateEconomyLinks(data.economyLinks,parsed.state.profiles.map(p=>p.id),{marketplace:parsed.marketplace,families:parsed.families,organizations:parsed.organizations,territories:parsed.territories,documents:parsed.documents,evidenceVault:parsed.evidenceVault});
 return {...parsed,schemaVersion:20,economyLinks:links};
}
