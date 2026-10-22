import {makeBackupV10,parseBackupV10} from './xenforo-backup.mjs';
import {validateMonitor,emptyMonitor} from './monitor-core.mjs';
export function makeBackupV11(state,templates,cases,economy,laws,government,documents,links,productivity,xfLinks,monitor,cleanTemplate){
 const source=JSON.parse(makeBackupV10(state,templates,cases,economy,laws,government,documents,links,productivity,xfLinks,cleanTemplate));
 return JSON.stringify({...source,schemaVersion:11,serverMonitor:validateMonitor(monitor)},null,2);
}
export function parseBackupV11(text,validateState,cleanTemplate){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Копия превышает 48 МиБ');
 let data;try{data=JSON.parse(text);}catch{throw Error('Некорректный JSON');}
 if(data?.schemaVersion!==11)return {...parseBackupV10(text,validateState,cleanTemplate),serverMonitor:null};
 if(data.format!=='majestictoolkit-backup')throw Error('Неверный формат копии');
 const monitor=validateMonitor(data.serverMonitor);
 const old={...data,schemaVersion:10};delete old.serverMonitor;
 const result=parseBackupV10(JSON.stringify(old),validateState,cleanTemplate);
 if(monitor.players.some(p=>!result.state.profiles.some(s=>s.id===p.profileId)))throw Error('Карточка игрока связана с удалённым профилем');
 return {...result,schemaVersion:11,serverMonitor:monitor};
}
