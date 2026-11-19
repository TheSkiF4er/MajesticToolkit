/** Tactical source links keep RP event evidence and documents connected by stable IDs. */
export const TACTICAL_LINK_PREFIX='mtTacticalLinkV229:';
export const TACTICAL_LINK_LIMIT=2000;
const pattern=/^[\w-]{8,120}$/;
const id=(value,label)=>{if(typeof value!=='string'||!pattern.test(value))throw Error(`Некорректный идентификатор: ${label}`);return value;};
const kind=(value,choices,label)=>{if(!choices.includes(value))throw Error(`Недопустимый тип: ${label}`);return value;};
export function cleanTacticalLink(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Повреждена тактическая ссылка');
 const link={id:id(raw.id,'связь'),profileId:id(raw.profileId,'профиль'),entityType:kind(raw.entityType,['territory','airdrop','plan','simulation'],'объект'),entityId:id(raw.entityId,'объект'),sourceType:kind(raw.sourceType,['evidence','document'],'источник'),sourceId:id(raw.sourceId,'источник'),note:typeof raw.note==='string'&&raw.note.length<=500?raw.note.trim():(()=>{throw Error('Некорректный комментарий ссылки');})(),createdAt:raw.createdAt};
 if(typeof link.createdAt!=='string'||!Number.isFinite(Date.parse(link.createdAt)))throw Error('Некорректная дата ссылки');
 return link;
}
export function validateTacticalLinks(rows,profileIds,refs){
 if(!Array.isArray(rows)||rows.length>TACTICAL_LINK_LIMIT)throw Error('Превышен размер тактического реестра ссылок');
 const allowed=new Set(profileIds.map(p=>typeof p==='string'?p:p.id)),ids=new Set(),pairs=new Set();
 const kinds={territory:refs.territories,airdrop:refs.airdropEvents,plan:refs.plans,simulation:refs.simulations};
 return rows.map(raw=>{
  const row=cleanTacticalLink(raw),entity=kinds[row.entityType],source=row.sourceType==='evidence'?refs.evidenceVault:refs.documents;
  if(!allowed.has(row.profileId)||ids.has(row.id))throw Error('Дубликат ссылки или чужой профиль');ids.add(row.id);
  const pair=[row.profileId,row.entityType,row.entityId,row.sourceType,row.sourceId].join(':');if(pairs.has(pair))throw Error('Повторное прикрепление источника');pairs.add(pair);
  if(!Array.isArray(entity)||!entity.some(x=>x.id===row.entityId&&x.profileId===row.profileId))throw Error('Тактический объект ссылки отсутствует');
  if(!Array.isArray(source)||!source.some(x=>x.id===row.sourceId&&x.profileId===row.profileId))throw Error('Документ или доказательство тактической ссылки отсутствует');
  return row;
 });
}
export function newTacticalLink(profileId,fields){
 const idValue=globalThis.crypto?.randomUUID?.()??`tlink-${Date.now()}-${Math.random().toString(36).slice(2,13)}`;
 return cleanTacticalLink({id:idValue,profileId,...fields,note:fields.note??'',createdAt:new Date().toISOString()});
}
