/** Economy 2.1.9: validated, profile-scoped links to existing documents and Vault evidence. */
export const ECONOMY_LINK_PREFIX='mtEconomyLinkV219:';
export const MAX_ECONOMY_LINKS=5000;
export const ECONOMY_ENTITY_TYPES=Object.freeze(['product','family','organization','territory']);
export const ECONOMY_SOURCE_TYPES=Object.freeze(['document','evidence']);
const identifier=(v,label)=>{if(typeof v!=='string'||!/^[\w-]{8,128}$/.test(v))throw Error(`Неверный ID: ${label}`);return v;};
const note=v=>{if(typeof v!=='string'||v.length>500)throw Error('Примечание должно быть текстом до 500 символов');return v.trim();};
const iso=v=>{if(typeof v!=='string'||!/\d{4}-\d\d-\d\dT/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Некорректная дата связи');return new Date(v).toISOString();};
export function cleanEconomyLink(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректная экономическая связь');
 const link={id:identifier(raw.id,'связь'),profileId:identifier(raw.profileId,'профиль'),entityType:raw.entityType,entityId:identifier(raw.entityId,'объект'),sourceType:raw.sourceType,sourceId:identifier(raw.sourceId,'источник'),note:note(raw.note??''),createdAt:iso(raw.createdAt)};
 if(!ECONOMY_ENTITY_TYPES.includes(link.entityType)||!ECONOMY_SOURCE_TYPES.includes(link.sourceType))throw Error('Недопустимый тип связи');
 return link;
}
export function validateEconomyLinks(rows,profileIds=null,refs={}){
 if(!Array.isArray(rows)||rows.length>MAX_ECONOMY_LINKS)throw Error('Недопустимое число связей экономики');
 const allowed=profileIds===null?null:new Set(profileIds),ids=new Set(),pairs=new Set();
 const indexed={product:new Map((refs.marketplace??[]).filter(r=>r.type==='product').map(r=>[r.id,r])),family:new Map((refs.families??[]).map(r=>[r.id,r])),organization:new Map((refs.organizations??[]).map(r=>[r.id,r])),territory:new Map((refs.territories??[]).map(r=>[r.id,r]))};
 const sources={document:new Map((refs.documents??[]).filter(r=>r.type==='document').map(r=>[r.id,r])),evidence:new Map((refs.evidenceVault??[]).map(r=>[r.id,r]))};
 return rows.map(input=>{
  const r=cleanEconomyLink(input),key=[r.profileId,r.entityType,r.entityId,r.sourceType,r.sourceId].join('\u001f');
  if(ids.has(r.id)||pairs.has(key))throw Error('Повторяющаяся экономическая связь');ids.add(r.id);pairs.add(key);
  if(allowed&&!allowed.has(r.profileId))throw Error('Экономическая связь указывает на отсутствующий профиль');
  if(!indexed[r.entityType].get(r.entityId)||indexed[r.entityType].get(r.entityId).profileId!==r.profileId)throw Error('Экономическая связь указывает на отсутствующий объект или другой профиль');
  if(!sources[r.sourceType].get(r.sourceId)||sources[r.sourceType].get(r.sourceId).profileId!==r.profileId)throw Error('Экономическая связь указывает на отсутствующее доказательство/документ или другой профиль');
  return r;
 });
}
export function newEconomyLink(profileId,input){return cleanEconomyLink({...input,profileId,id:globalThis.crypto?.randomUUID?.()??`link-${Date.now()}-${Math.random().toString(36).slice(2,12)}`,createdAt:new Date().toISOString()});}
