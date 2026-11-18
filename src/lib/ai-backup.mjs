/** Backup v18: optional explicit export of profile-scoped AI conversations, links and drafts.
 * Gateway credentials, enabled flags and transient consent are deliberately never exported.
 * The v17 payload, including Evidence Vault inventory, remains intact for migration.
 */
import {makeBackupV17,parseBackupV17} from './dossier-backup.mjs';
import {cleanAIWorkspace,emptyAIWorkspace,aiWorkspaceKey} from './ai-workspace-store.mjs';
import {AI_SETTINGS_KEY} from './ai-connection.mjs';

export function validateAIBackup(rows,profiles){
 if(rows===null)return null;
 if(!Array.isArray(rows)||rows.length>profiles.length)throw Error('Некорректная история AI в Backup v18');
 const ids=new Set(profiles.map(p=>p.id)),seen=new Set();
 return rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['profileId','workspace'].includes(k))||typeof row.profileId!=='string'||!ids.has(row.profileId)||seen.has(row.profileId))throw Error('История AI относится к постороннему или повторному профилю');
  seen.add(row.profileId);
  const value=cleanAIWorkspace(row.workspace);
  return {profileId:row.profileId,workspace:value};
 });
}
export function makeBackupV18(args,punishments,sections,registry,operations,inventory,aiWorkspace=null){
 const base=JSON.parse(makeBackupV17(args,punishments,sections,registry,operations,inventory));
 const safe=validateAIBackup(aiWorkspace,base.payload.profiles);
 const json=JSON.stringify({...base,schemaVersion:18,aiWorkspace:safe},null,2);
 if(new TextEncoder().encode(json).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ, сократите историю AI');
 return json;
}
export function parseBackupV18(text,validateState,cleanTemplate){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ');
 let raw;try{raw=JSON.parse(text);}catch{throw Error('Некорректный JSON резервной копии');}
 if(raw?.schemaVersion!==18)return {...parseBackupV17(text,validateState,cleanTemplate),aiWorkspace:null};
 if(raw.format!=='majestictoolkit-backup'||!Object.hasOwn(raw,'aiWorkspace'))throw Error('Неверный формат Backup v18');
 const {aiWorkspace,...legacy}=raw;
 const validated=parseBackupV17(JSON.stringify({...legacy,schemaVersion:17}),validateState,cleanTemplate);
 return {...validated,schemaVersion:18,aiWorkspace:validateAIBackup(aiWorkspace,validated.state.profiles)};
}
export async function exportAIWorkspaces(profiles){
 const {loadAIWorkspace}=await import('./ai-workspace-store.mjs');
 return validateAIBackup(await Promise.all(profiles.map(async p=>({profileId:p.id,workspace:await loadAIWorkspace(p.id)}))),profiles);
}
export async function replaceAIWorkspaces(rows,profiles,storage){
 const validated=validateAIBackup(rows,profiles);
 if(validated===null)return;
 const byId=new Map(validated.map(x=>[x.profileId,x.workspace]));
 const payload=Object.fromEntries(profiles.map(p=>[aiWorkspaceKey(p.id),byId.get(p.id)??emptyAIWorkspace()]));
 if(Object.keys(payload).length)await storage.set(payload);
}

/** Recovered profiles must opt in again; import never transfers old AI consent. */
export async function disableAIOnRestore(profiles,storage){
 const current=(await storage.get(AI_SETTINGS_KEY))[AI_SETTINGS_KEY]||{};
 const after={...current};for(const p of profiles)after[p.id]={enabled:false};
 await storage.set({[AI_SETTINGS_KEY]:after});
}
