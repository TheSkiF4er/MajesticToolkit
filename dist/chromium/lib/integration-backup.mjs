import {makeBackupV7,parseBackupV7} from './document-backup.mjs';
import {validateLinks} from './integration-core.mjs';
export function makeBackupV8(state,templates,cases,economy,laws,government,documents,links,cleanTemplate){
  const backup=JSON.parse(makeBackupV7(state,templates,cases,economy,laws,government,documents,cleanTemplate));
  backup.schemaVersion=8;backup.siteLinks=validateLinks(links);
  return JSON.stringify(backup,null,2);
}
export function parseBackupV8(text,validateState,cleanTemplate){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ');
  let input;try{input=JSON.parse(text);}catch{throw Error('Некорректный JSON');}
  if(input?.schemaVersion!==8)return {...parseBackupV7(text,validateState,cleanTemplate),siteLinks:[]};
  if(input.format!=='majestictoolkit-backup'||!Array.isArray(input.siteLinks))throw Error('Некорректная копия внешних интеграций');
  const older={...input,schemaVersion:7};delete older.siteLinks;
  const parsed=parseBackupV7(JSON.stringify(older),validateState,cleanTemplate);
  return {...parsed,schemaVersion:8,siteLinks:validateLinks(input.siteLinks)};
}
