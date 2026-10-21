import { makeCompleteBackup, parseCompleteBackup } from './complaints-store.mjs';
import { validateRecords } from './economy-core.mjs';
export function makeBackupV4(profileState,templates,cases,economy,cleanTemplate){
  const base=JSON.parse(makeCompleteBackup(profileState,templates,cases,cleanTemplate));
  const validated=validateRecords(economy,profileState.profiles.map(p=>p.id));
  base.schemaVersion=4;
  base.economy=validated;
  return JSON.stringify(base,null,2);
}
export function parseBackupV4(text,validateState,cleanTemplate){
  if(typeof text!=='string'||text.length>24*1024*1024)throw Error('Резервная копия превышает 24 МиБ');
  let input;try{input=JSON.parse(text);}catch{throw Error('Некорректный JSON');}
  if(input?.schemaVersion!==4){const data=parseCompleteBackup(text,validateState,cleanTemplate);return {...data,economy:[]};}
  if(input.format!=='rp-nexus-backup'||!Array.isArray(input.economy))throw Error('Неверный формат копии');
  const old={...input,schemaVersion:3};delete old.economy;
  const main=parseCompleteBackup(JSON.stringify(old),validateState,cleanTemplate);
  const economy=validateRecords(input.economy,main.state.profiles.map(p=>p.id));
  return {...main,schemaVersion:4,economy};
}
