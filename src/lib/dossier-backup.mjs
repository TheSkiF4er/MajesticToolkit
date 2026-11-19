/** Backup v17: all v16 records plus an explicit inventory of local Evidence Vault assets.
 * JSON is metadata-only; a portable ZIP can include the complete binary contents. */
import {makeModerationBackup,parseModerationBackup} from './moderation-backup.mjs';
import {cleanVaultMetadata,listVault,verifyVaultFile} from './evidence-vault.mjs';
import {makeZip,readZip,digest,decodeJson,encodeJson} from './dossier-archive.mjs';
const path=id=>`vault/${id}.bin`;
export function validateVaultInventory(input,profiles){
 if(!Array.isArray(input)||input.length>5000)throw Error('Некорректный состав Evidence Vault');
 const allowed=new Set(profiles.map(p=>p.id)),seen=new Set();
 return input.map(item=>{
  const value=cleanVaultMetadata(item);
  if(!allowed.has(value.profileId)||seen.has(value.id))throw Error('Вложения относятся к отсутствующему профилю или дублируются');
  seen.add(value.id);return value;
 });
}
export function makeBackupV17(args,punishments,sections,registry,operations,inventory){
 const old=JSON.parse(makeModerationBackup(args,punishments,sections,registry,operations));
 return JSON.stringify({...old,schemaVersion:17,evidenceVault:validateVaultInventory(inventory,old.payload.profiles)},null,2);
}
export function parseBackupV17(text,validateState,cleanTemplate){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ');
 let json;try{json=JSON.parse(text);}catch{throw Error('Некорректный JSON резервной копии');}
 if(json?.schemaVersion!==17)return {...parseModerationBackup(text,validateState,cleanTemplate),evidenceVault:null};
 if(json.format!=='majestictoolkit-backup')throw Error('Неверный формат резервной копии');
 const validated=parseModerationBackup(JSON.stringify({...json,schemaVersion:16}),validateState,cleanTemplate);
 return {...validated,schemaVersion:17,evidenceVault:validateVaultInventory(json.evidenceVault,validated.state.profiles)};
}
export async function inventoryAllVault(profiles){
 const groups=await Promise.all(profiles.map(p=>listVault(p.id)));return validateVaultInventory(groups.flat(),profiles);
}
/** Full portable backup including all binary files. Stops on corruption, never silently skips files. */
export async function makePortableBackup(backupJson,inventory,tacticalMapBytes=new Map()){
 const json=JSON.parse(backupJson);
 if(![17,18,19,20,21].includes(json.schemaVersion))throw Error('Для переносимой копии требуется Backup v17–v21');
 const records=validateVaultInventory(inventory,json.payload.profiles),entries=[['backup.json',backupJson]],files=[];
 for(const meta of records){if(meta.kind!=='file')continue;
  const value=await verifyVaultFile(meta.id,meta.profileId);
  if(value.meta.sha256!==meta.sha256||value.meta.size!==meta.size)throw Error('Метаданные вложения изменены: '+meta.id);
  const bytes=new Uint8Array(await value.blob.arrayBuffer());files.push({id:meta.id,name:path(meta.id),sha256:meta.sha256,size:bytes.length});entries.push([path(meta.id),bytes]);
 }
 const maps=[];
 if(json.schemaVersion===21){
  if(!Array.isArray(json.tactical?.maps))throw Error('Backup v21 не содержит карту');
  if(tacticalMapBytes.size!==json.tactical.maps.length)throw Error('Для ZIP v21 требуются все изображения карт');
  for(const meta of json.tactical.maps){
   const bytes=tacticalMapBytes.get(meta.profileId),name=`maps/${meta.profileId}.bin`;
   if(!(bytes instanceof Uint8Array)||bytes.length!==meta.size||await digest(bytes)!==meta.sha256)throw Error('Недоступна или повреждена подложка карты '+meta.profileId);
   maps.push({profileId:meta.profileId,name,sha256:meta.sha256,size:meta.size});entries.push([name,bytes]);
  }
 }
 const items=[];for(const [name,raw] of entries){const bytes=raw instanceof Uint8Array?raw:new TextEncoder().encode(raw);items.push({name,size:bytes.length,sha256:await digest(bytes)});}
 const manifest={format:'majestictoolkit-portable-backup',version:json.schemaVersion===21?2:1,exportedAt:new Date().toISOString(),files,maps,items};
 entries.push(['manifest.json',encodeJson(manifest)]);return {blob:await makeZip(entries),manifest};
}
export async function parsePortableBackup(input){
 const entries=await readZip(input),manifest=decodeJson(entries.get('manifest.json'));
 if(manifest?.format!=='majestictoolkit-portable-backup'||![1,2].includes(manifest.version)||!Array.isArray(manifest.items)||!Array.isArray(manifest.files)||!entries.has('backup.json'))throw Error('Неверный формат переносимой копии');
 const names=new Set();for(const row of manifest.items){if(!row||names.has(row.name)||!entries.has(row.name)||!(/^[a-f0-9]{64}$/.test(row.sha256))||row.size!==entries.get(row.name).length||await digest(entries.get(row.name))!==row.sha256)throw Error('Контрольная сумма переносимой копии не совпадает');names.add(row.name);}
 if(entries.size!==names.size+1)throw Error('В архиве есть незаявленные файлы');
 const json=new TextDecoder('utf-8',{fatal:true}).decode(entries.get('backup.json'));let raw;try{raw=JSON.parse(json);}catch{throw Error('Повреждён backup.json');}
 if(![17,18,19,20,21].includes(raw.schemaVersion)||raw.format!=='majestictoolkit-backup'||!Array.isArray(raw.evidenceVault))throw Error('Неверный Backup v17–v20');
 const inventory=validateVaultInventory(raw.evidenceVault,raw.payload.profiles),files=new Map();
 for(const f of manifest.files){const meta=inventory.find(x=>x.id===f.id&&x.kind==='file');if(!meta||f.name!==path(f.id)||meta.sha256!==f.sha256||meta.size!==f.size||!names.has(f.name)||await digest(entries.get(f.name))!==f.sha256)throw Error('Отсутствует или повреждено вложение '+String(f.id));if(files.has(f.id))throw Error('Дубликат вложения');files.set(f.id,entries.get(f.name));}
 if(inventory.filter(x=>x.kind==='file').length!==files.size)throw Error('Архив не содержит все локальные файлы');
 const maps=new Map();
 if(raw.schemaVersion===21){
  if(manifest.version!==2||!Array.isArray(manifest.maps)||!Array.isArray(raw.tactical?.maps)||manifest.maps.length!==raw.tactical.maps.length)throw Error('ZIP v21 не содержит полный список карт');
  for(const meta of raw.tactical.maps){
   const row=manifest.maps.find(x=>x.profileId===meta.profileId),name=`maps/${meta.profileId}.bin`;
   if(!row||row.name!==name||row.size!==meta.size||row.sha256!==meta.sha256||!names.has(name)||await digest(entries.get(name))!==meta.sha256||maps.has(meta.profileId))throw Error('Отсутствует или повреждена карта '+meta.profileId);
   maps.set(meta.profileId,entries.get(name));
  }
 }else if(manifest.version!==1||manifest.maps?.length)throw Error('Неверная версия ZIP');
 return {json,inventory,files,maps,manifest};
}
