/** Airdrop Operations 2.2.4: validated local RP observations, point ownership and replayable event history. */
import {validMapProfile} from './tactical-map-core.mjs';
export const AIRDROP_POINT_PREFIX='mtAirdropPointV224:';
export const AIRDROP_EVENT_PREFIX='mtAirdropEventV224:';
export const AIRDROP_LIMITS=Object.freeze({points:500,events:3000,participants:80,history:350});
const uuid=()=>globalThis.crypto?.randomUUID?.()??`airdrop-${Date.now()}-${Math.random().toString(36).slice(2,14)}`;
const id=value=>{if(typeof value!=='string'||!/^[\w-]{8,120}$/.test(value))throw Error('Некорректный идентификатор аирдропа');return value;};
const text=(value,label,max,required=true)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error(`Некорректное поле: ${label}`);return value.trim();};
const stamp=value=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||!([value,value.replace(/Z$/,'.000Z')].includes(new Date(value).toISOString())))throw Error('Некорректная дата аирдропа');return new Date(value).toISOString();};
const coord=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw Error('Координаты точки должны быть в диапазоне 0–1');return value;};
const sha=value=>{if(value!==''&&!(typeof value==='string'&&/^[0-9a-f]{64}$/.test(value)))throw Error('Некорректная версия подложки карты');return value;};
const positive=(value,min,max)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(`Недопустимая длительность (${min}–${max})`);return value;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pointFields=x=>({name:text(x.name,'Название точки',100),description:text(x.description??'','Описание',500,false),x:coord(x.x),y:coord(x.y),mapSha256:sha(x.mapSha256??'')});
const eventFields=x=>({title:text(x.title,'Название события',120),pointId:id(x.pointId),scheduledAt:stamp(x.scheduledAt),durationMinutes:positive(x.durationMinutes,1,1440),notes:text(x.notes??'','Описание события',1000,false)});
const makeHeader=(profileId,now)=>{if(!validMapProfile(profileId))throw Error('Недопустимый профиль');return {id:uuid(),profileId,createdAt:now,updatedAt:now,history:[]};};
const eventRow=(kind,data,at)=>({id:uuid(),kind,at,data:structuredClone(data)});
function replay(raw,project){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.history)||raw.history.length<1||raw.history.length>AIRDROP_LIMITS.history)throw Error('Повреждён журнал аирдропа');
 const head={id:id(raw.id),profileId:id(raw.profileId),createdAt:stamp(raw.createdAt),updatedAt:stamp(raw.updatedAt)};
 if(head.updatedAt<head.createdAt)throw Error('Неверная хронология аирдропа');
 const seen=new Set();let previous=null,at=head.createdAt;
 for(const original of raw.history){
  if(!original||typeof original!=='object'||typeof original.kind!=='string'||original.kind.length>24)throw Error('Повреждена операция аирдропа');
  const entry={id:id(original.id),kind:original.kind,at:stamp(original.at),data:original.data};
  if(seen.has(entry.id)||entry.at<at||entry.at>head.updatedAt)throw Error('Нарушен порядок операций аирдропа');
  seen.add(entry.id);at=entry.at;previous=project(previous,entry);
 }
 if(!previous||at!==head.updatedAt)throw Error('Не совпадает последняя редакция аирдропа');
 return {...head,...previous,history:raw.history.map(x=>structuredClone(x))};
}
export function cleanAirdropPoint(raw){return replay(raw,(before,{kind,data})=>{
 if(!before){if(kind!=='create')throw Error('Нет регистрации точки');return {...pointFields(data),archived:false};}
 if(kind==='edit'&&!before.archived)return {...before,...pointFields(data)};
 if(kind==='archive'&&typeof data.archived==='boolean'&&before.archived!==data.archived)return {...before,archived:data.archived};
 throw Error('Недопустимая операция с точкой появления');
});}
export function cleanAirdropEvent(raw){return replay(raw,(before,{kind,data,at})=>{
 if(!before){if(kind!=='create')throw Error('Нет регистрации аирдропа');return {...eventFields(data),status:'planned',participants:[],startedAt:'',claimedAt:'',finishedAt:'',winner:'',reward:'',result:''};}
 if(kind==='edit'&&before.status==='planned')return {...before,...eventFields(data)};
 if(kind==='participant-add'&&['planned','active'].includes(before.status)){
  const name=text(data.name,'Участник',80);if(before.participants.length>=AIRDROP_LIMITS.participants||before.participants.some(x=>x.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))throw Error('Участник уже зарегистрирован или достигнут лимит');
  return {...before,participants:[...before.participants,name]};
 }
 if(kind==='participant-remove'&&['planned','active'].includes(before.status)){
  const name=text(data.name,'Участник',80);if(!before.participants.includes(name))throw Error('Участник отсутствует');return {...before,participants:before.participants.filter(x=>x!==name)};
 }
 if(kind==='start'&&before.status==='planned')return {...before,status:'active',startedAt:at};
 if(kind==='claim'&&before.status==='active')return {...before,status:'claimed',claimedAt:at,winner:text(data.winner,'Получатель',120),reward:text(data.reward??'','Награда',300,false)};
 if(kind==='finish'&&['active','claimed'].includes(before.status))return {...before,status:'completed',finishedAt:at,result:text(data.result??'','Результат',500,false)};
 if(kind==='cancel'&&['planned','active'].includes(before.status))return {...before,status:'cancelled',finishedAt:at,result:text(data.reason,'Причина отмены',500)};
 throw Error('Недопустимый переход статуса аирдропа');
});}
const append=(row,kind,data)=>{
 const now=new Date(Math.max(Date.now(),Date.parse(row.updatedAt))).toISOString();
 const next={...row,updatedAt:now,history:[...row.history,eventRow(kind,data,now)]};
 if(next.history.length>AIRDROP_LIMITS.history)throw Error('Достигнут лимит истории аирдропа');
 return next;
};
export function newAirdropPoint(profileId,fields){const now=new Date().toISOString(),row=makeHeader(profileId,now);return cleanAirdropPoint({...row,history:[eventRow('create',fields,now)]});}
export function changeAirdropPoint(row,kind,fields){return cleanAirdropPoint(append(cleanAirdropPoint(row),kind,fields));}
export function newAirdropEvent(profileId,fields){const now=new Date().toISOString(),row=makeHeader(profileId,now);return cleanAirdropEvent({...row,history:[eventRow('create',fields,now)]});}
export function changeAirdropEvent(row,kind,fields={}){return cleanAirdropEvent(append(cleanAirdropEvent(row),kind,fields));}
export function validateAirdrops(points,events,profileIds=null){
 if(!Array.isArray(points)||!Array.isArray(events)||points.length>AIRDROP_LIMITS.points||events.length>AIRDROP_LIMITS.events)throw Error('Превышен размер реестра аирдропов');
 const permitted=profileIds===null?null:new Set(profileIds),ids=new Set(),names=new Set();
 const p=points.map(row=>{const r=cleanAirdropPoint(row);if(permitted&&!permitted.has(r.profileId))throw Error('Чужой профиль точки');if(ids.has(r.id))throw Error('Повторный ID точки');ids.add(r.id);
  const key=r.profileId+':'+r.name.toLocaleLowerCase('ru');if(names.has(key))throw Error('Повторное название точки');names.add(key);return r;});
 const byPoint=new Map(p.map(x=>[x.id,x])),eventIds=new Set();
 const ev=events.map(row=>{const r=cleanAirdropEvent(row);if(permitted&&!permitted.has(r.profileId))throw Error('Чужой профиль аирдропа');if(eventIds.has(r.id))throw Error('Повторный ID аирдропа');eventIds.add(r.id);
 const point=byPoint.get(r.pointId);if(!point||point.profileId!==r.profileId)throw Error('Точка появления отсутствует в профиле');return r;});
 return {points:p,events:ev};
}
export function airdropTimer(event,now=Date.now()){
 const time=typeof now==='number'?now:Date.parse(now),start=Date.parse(event.scheduledAt),end=(event.startedAt?Date.parse(event.startedAt):start)+event.durationMinutes*60000;
 if(event.status==='completed'||event.status==='cancelled'||event.status==='claimed')return {phase:event.status,seconds:0};
 if(event.status==='planned')return {phase:time<start?'upcoming':'due',seconds:Math.max(0,Math.ceil((start-time)/1000))};
 return {phase:time<end?'active':'overdue',seconds:Math.ceil((end-time)/1000)};
}
export function airdropCsv(points,events,profileId){const name=new Map(points.map(x=>[x.id,x.name]));const quote=value=>{let raw=String(value??'');if(/^[\s]*[=+@-]/.test(raw))raw="'"+raw;return '"'+raw.replaceAll('"','""')+'"';};return '\uFEFF'+[['ID','Точка','Название','Время','Длительность, мин','Статус','Участники','Получатель','Награда','Результат'],...events.filter(x=>x.profileId===profileId).map(x=>[x.id,name.get(x.pointId)||'',x.title,x.scheduledAt,x.durationMinutes,x.status,x.participants.join('; '),x.winner,x.reward,x.result])].map(row=>row.map(quote).join(',')).join('\r\n');}
export function airdropPackage(points,events,profileId){const rows={format:'majestic-airdrop-operations',version:1,profileId,exportedAt:new Date().toISOString(),points:points.filter(x=>x.profileId===profileId),events:events.filter(x=>x.profileId===profileId)};validateAirdrops(rows.points,rows.events,[profileId]);return rows;}
export function parseAirdropPackage(raw,profileId){if(!raw||raw.format!=='majestic-airdrop-operations'||raw.version!==1||raw.profileId!==profileId)throw Error('Файл аирдропов не соответствует активному RP-профилю');return validateAirdrops(raw.points,raw.events,[profileId]);}
