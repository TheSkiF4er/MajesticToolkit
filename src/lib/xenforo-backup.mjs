import './xenforo-core.js';
import {makeBackupV9,parseBackupV9} from './productivity-backup.mjs';
const validate=globalThis.MTXenForo.validateLinks;
export function makeBackupV10(state,templates,cases,economy,laws,government,documents,links,productivity,xfLinks,cleanTemplate){
  const obj=JSON.parse(makeBackupV9(state,templates,cases,economy,laws,government,documents,links,productivity,cleanTemplate));
  obj.schemaVersion=10;obj.xenforoNavigation=validate(xfLinks);
  return JSON.stringify(obj,null,2);
}
export function parseBackupV10(text,validateState,cleanTemplate){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Резервная копия превышает 48 МиБ');
  let obj;try{obj=JSON.parse(text);}catch{throw Error('Некорректный JSON');}
  if(obj?.schemaVersion!==10)return {...parseBackupV9(text,validateState,cleanTemplate),xenforoNavigation:null};
  if(obj.format!=='majestictoolkit-backup')throw Error('Неверный формат копии');
  const navigation=validate(obj.xenforoNavigation);
  const legacy={...obj,schemaVersion:9};delete legacy.xenforoNavigation;
  const parsed=parseBackupV9(JSON.stringify(legacy),validateState,cleanTemplate);
  if(navigation.some(x=>x.profileId!=='*'&&!parsed.state.profiles.some(p=>p.id===x.profileId)))throw Error('Ссылка связана с отсутствующим профилем');
  return {...parsed,schemaVersion:10,xenforoNavigation:navigation};
}
