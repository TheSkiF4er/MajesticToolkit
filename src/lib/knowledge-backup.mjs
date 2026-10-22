import {makeBackupV11,parseBackupV11} from './monitor-backup.mjs';
import {validateKnowledge,emptyKnowledge} from './knowledge-core.mjs';
export function makeBackupV12(state,templates,cases,economy,laws,government,documents,links,productivity,xfLinks,monitor,knowledge,cleanTemplate){
 const backup=JSON.parse(makeBackupV11(state,templates,cases,economy,laws,government,documents,links,productivity,xfLinks,monitor,cleanTemplate));
 return JSON.stringify({...backup,schemaVersion:12,knowledgeWorkspace:validateKnowledge(knowledge,state.profiles.map(p=>p.id))},null,2);
}
export function parseBackupV12(text,validateState,cleanTemplate){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Копия превышает 48 МиБ');
 let raw;try{raw=JSON.parse(text);}catch{throw Error('Неверный JSON');}
 if(raw?.schemaVersion!==12)return {...parseBackupV11(text,validateState,cleanTemplate),knowledgeWorkspace:null};
 if(raw.format!=='majestictoolkit-backup')throw Error('Неверный формат копии');
 const previous={...raw,schemaVersion:11};delete previous.knowledgeWorkspace;
 const parsed=parseBackupV11(JSON.stringify(previous),validateState,cleanTemplate);
 return {...parsed,schemaVersion:12,knowledgeWorkspace:validateKnowledge(raw.knowledgeWorkspace,parsed.state.profiles.map(p=>p.id))};
}
