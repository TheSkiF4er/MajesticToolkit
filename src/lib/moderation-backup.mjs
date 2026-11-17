import {makeRulesExperienceBackup,parseRulesExperienceBackup} from './punishment-backup.mjs';
// V16 carries the existing V15 stores plus validated, profile-scoped Moderation
// Center settings in payload.profiles. Old backups are still parsed verbatim.
export function makeModerationBackup(args,punishments,sections,registry,operations){
 const v15=JSON.parse(makeRulesExperienceBackup(args,punishments,sections,registry,operations));
 if(v15.schemaVersion!==15)throw Error('Неожиданная версия резервной копии');
 return JSON.stringify({...v15,schemaVersion:16},null,2);
}
export function parseModerationBackup(text,validateState,cleanTemplate){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ');
 let raw;try{raw=JSON.parse(text);}catch{throw Error('Некорректный JSON резервной копии');}
 if(raw?.schemaVersion!==16)return parseRulesExperienceBackup(text,validateState,cleanTemplate);
 if(raw.format!=='majestictoolkit-backup')throw Error('Неверный формат резервной копии');
 const validated=parseRulesExperienceBackup(JSON.stringify({...raw,schemaVersion:15}),validateState,cleanTemplate);
 return {...validated,schemaVersion:16};
}
