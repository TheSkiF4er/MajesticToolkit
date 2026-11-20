/** Extracts a deliberately selected, validated local source into a cloud review draft.
 * Original Law Codex, forum and template records are not altered or auto-published.
 */
import './forum-core.js';
import {cleanLawRecord} from './law-core.mjs';
import {cleanGovernment} from './government-core.mjs';
import {cleanDocumentRecord} from './document-core.mjs';
const C=globalThis.RPNForumCore;
const localSources={law:{prefix:'majesticLawV5:',clean:cleanLawRecord},'forum-template':{prefix:'rpnForumTemplateV2:',clean:C.cleanTemplate},'government-template':{prefix:'majesticGovernmentV6:',clean:cleanGovernment},'document-template':{prefix:'majesticDocumentV7:',clean:cleanDocumentRecord}};
export function sharedSourceSnapshot(kind,raw,localProfileId){
 const model=localSources[kind];if(!model)throw Error('Тип локального источника не поддерживается');
 const record=model.clean(raw);if(record.profileId!==localProfileId)throw Error('Источник относится к другому RP-профилю');
 let title='',category='',body='';
 if(kind==='law'){
   if(record.type==='memo'){title=record.title;category=record.category;body=record.body;}
   else if(record.type==='book'){
     const edition=record.editions.find(ed=>ed.id===record.activeEditionId);
     if(!edition)throw Error('Активная редакция закона не найдена');
     title=record.title;category=record.category;
     body=[`Редакция: ${edition.label} (${edition.effectiveDate})`,edition.preamble||'',...edition.articles.map(a=>`Статья ${a.key}. ${a.title}\n${a.text}`)].filter(Boolean).join('\n\n');
   }else throw Error('В облако можно перенести закон или памятку, но не избранное');
 }else if(kind==='forum-template'){
   title=record.label;category=record.category||'Форум';body=record.text;
 }else{
   if(record.type!=='template')throw Error('Для публикации выберите шаблон');
   title=record.title;category=record.category;body=record.body;
 }
 if(!body||body.length>60_000)throw Error('Содержание пустое или превышает лимит 60 000 символов');
 return {kind,title,category,body,sourceKind:kind,sourceId:record.id};
}
export function sharedSourceStorageKey(kind,id){if(!localSources[kind]||typeof id!=='string'||!/^[-\w]{8,128}$/.test(id))throw Error('Некорректный источник');return localSources[kind].prefix+id;}
