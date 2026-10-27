/** v14 source snapshots are opt-in and validated; legacy backups never erase them. */
import {makeBackupV13,parseBackupV13} from './workflow-backup.mjs';
import {validateSources} from './source-library.mjs';
export function makeBackupV14(...args){
 const rows=validateSources(args.at(-1));
 const old=JSON.parse(makeBackupV13(...args.slice(0,-1)));
 const allowed=new Set(old.payload.profiles.map(p=>p.id));
 if(rows.some(s=>!allowed.has(s.profileId)))throw Error('Импортированная статья привязана к отсутствующему профилю');
 return JSON.stringify({...old,schemaVersion:14,sourceLibrary:rows},null,2);
}
export function parseBackupV14(text,validateState,cleanTemplate){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ');
 let raw;try{raw=JSON.parse(text);}catch{throw Error('Неверный JSON');}
 if(raw?.schemaVersion!==14)return {...parseBackupV13(text,validateState,cleanTemplate),sourceLibrary:null};
 if(raw.format!=='majestictoolkit-backup')throw Error('Неверный формат копии');
 const data=parseBackupV13(JSON.stringify({...raw,schemaVersion:13}),validateState,cleanTemplate);
 const articles=validateSources(raw.sourceLibrary);
 if(articles.some(s=>!data.state.profiles.some(p=>p.id===s.profileId)))throw Error('Статья привязана к отсутствующему профилю');
 return {...data,schemaVersion:14,sourceLibrary:articles};
}
