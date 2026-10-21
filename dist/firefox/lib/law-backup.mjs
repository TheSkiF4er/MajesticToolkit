import { makeBackupV4,parseBackupV4 } from './economy-backup.mjs';
import {validateLawRecords} from './law-core.mjs';
export function makeBackupV5(state,templates,cases,economy,laws,cleanTemplate){const base=JSON.parse(makeBackupV4(state,templates,cases,economy,cleanTemplate));base.schemaVersion=5;base.format='majestictoolkit-backup';base.lawRecords=validateLawRecords(laws,state.profiles.map(p=>p.id));return JSON.stringify(base,null,2);}
export function parseBackupV5(text,validateState,cleanTemplate){if(typeof text!=='string'||text.length>32*1024*1024)throw Error('Резервная копия превышает 32 МиБ');let obj;try{obj=JSON.parse(text);}catch{throw Error('Некорректный JSON');}
 if(obj?.schemaVersion!==5){const old=parseBackupV4(text,validateState,cleanTemplate);return {...old,lawRecords:[]};}
 if(obj.format!=='majestictoolkit-backup')throw Error('Неверный формат резервной копии');
 const v4={...obj,schemaVersion:4,format:'rp-nexus-backup'};delete v4.lawRecords;
 const old=parseBackupV4(JSON.stringify(v4),validateState,cleanTemplate);return {...old,schemaVersion:5,lawRecords:validateLawRecords(obj.lawRecords,old.state.profiles.map(p=>p.id))};}
