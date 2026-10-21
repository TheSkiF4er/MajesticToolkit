import {makeBackupV8,parseBackupV8} from './integration-backup.mjs';
import {validateProductivity,defaultProductivity} from './productivity-core.mjs';
export function makeBackupV9(state,templates,cases,economy,laws,government,documents,links,productivity,cleanTemplate){
  const obj=JSON.parse(makeBackupV8(state,templates,cases,economy,laws,government,documents,links,cleanTemplate));
  obj.schemaVersion=9;obj.productivity=validateProductivity(productivity);
  return JSON.stringify(obj,null,2);
}
export function parseBackupV9(source,validateState,cleanTemplate){
  if(typeof source!=='string'||new TextEncoder().encode(source).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ');
  let obj;try{obj=JSON.parse(source);}catch{throw Error('Некорректный JSON');}
  if(obj?.schemaVersion!==9)return {...parseBackupV8(source,validateState,cleanTemplate),productivity:defaultProductivity()};
  if(obj.format!=='majestictoolkit-backup')throw Error('Неверный формат резервной копии');
  const productivity=validateProductivity(obj.productivity);
  const old={...obj,schemaVersion:8};delete old.productivity;
  return {...parseBackupV8(JSON.stringify(old),validateState,cleanTemplate),schemaVersion:9,productivity};
}
