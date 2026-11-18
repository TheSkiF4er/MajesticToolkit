/** Judicial Evidence & Dossier 2.0.8: immutable Vault metadata snapshots inside a court case.
 * Binary contents remain exclusively in Evidence Vault (IndexedDB). */
import {cleanVaultMetadata} from './evidence-vault.mjs';
export const JUDICIAL_EVIDENCE_CATEGORIES=Object.freeze({document:'Документ',photo:'Фото / изображение',video:'Видео',audio:'Аудио / запись',testimony:'Показание',other:'Иное доказательство'});
export const JUDICIAL_EVIDENCE_LIMIT=100;
const identifier=(v,label='ID')=>{if(typeof v!=='string'||!/^[\w-]{8,128}$/.test(v))throw Error(`Недопустимое значение: ${label}`);return v;};
const text=(v,label,max=200,optional=false)=>{if(typeof v!=='string'||v.length>max||(!optional&&!v.trim()))throw Error(`Некорректное поле: ${label}`);return v.trim();};
const when=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('Неверная дата приобщения');return v;};
export function cleanJudicialEvidence(raw,profileId='',proceedings=null){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректный материал судебного дела');
 const meta=cleanVaultMetadata(raw.snapshot);
 const result={id:identifier(raw.id),vaultId:identifier(raw.vaultId),category:raw.category,title:text(raw.title,'Название',180),note:text(raw.note??'','Описание',2000,true),hearingId:raw.hearingId?identifier(raw.hearingId):'',motionId:raw.motionId?identifier(raw.motionId):'',attachedAt:when(raw.attachedAt),snapshot:meta};
 if(!Object.hasOwn(JUDICIAL_EVIDENCE_CATEGORIES,result.category))throw Error('Неизвестная категория доказательства');
 if(meta.id!==result.vaultId||(profileId&&meta.profileId!==profileId))throw Error('Доказательство принадлежит другому профилю или ID не совпадает');
 if(proceedings){if(result.hearingId&&!proceedings.hearings.some(x=>x.id===result.hearingId))throw Error('Заседание для доказательства отсутствует');if(result.motionId&&!proceedings.motions.some(x=>x.id===result.motionId))throw Error('Ходатайство для доказательства отсутствует');}
 return result;
}
export function judicialEvidenceRecord(meta,{category='other',title='',note='',hearingId='',motionId=''}={}){
 const snapshot=cleanVaultMetadata(meta);
 return {id:crypto.randomUUID(),vaultId:snapshot.id,category,title:title||snapshot.title,note,hearingId,motionId,attachedAt:new Date().toISOString(),snapshot};
}
export function evidenceMatchesVault(evidence,actual){const snap=cleanJudicialEvidence(evidence).snapshot,meta=cleanVaultMetadata(actual);
 // Description/title may be edited in Evidence Vault, but file identity, hash and source URL are frozen.
 return meta.id===snap.id&&meta.profileId===snap.profileId&&meta.kind===snap.kind&&(snap.kind==='file'?meta.sha256===snap.sha256&&meta.size===snap.size&&meta.mime===snap.mime:meta.url===snap.url&&meta.seconds===snap.seconds);
}
