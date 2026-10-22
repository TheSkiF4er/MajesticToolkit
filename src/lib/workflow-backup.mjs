import {makeBackupV12,parseBackupV12} from './knowledge-backup.mjs';
export function makeBackupV13(...args){
  const previous=JSON.parse(makeBackupV12(...args));
  return JSON.stringify({...previous,schemaVersion:13},null,2);
}
export function parseBackupV13(text,validateState,cleanTemplate){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Слишком большая резервная копия');
  let raw;try{raw=JSON.parse(text);}catch{throw Error('Некорректный JSON');}
  if(raw?.schemaVersion!==13)return parseBackupV12(text,validateState,cleanTemplate);
  if(raw.format!=='majestictoolkit-backup')throw Error('Неверный формат резервной копии');
  return {...parseBackupV12(JSON.stringify({...raw,schemaVersion:12}),validateState,cleanTemplate),schemaVersion:13};
}
