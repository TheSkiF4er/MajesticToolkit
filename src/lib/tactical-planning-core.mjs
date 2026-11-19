/** Tactical Planning 2.2.6: replayable user-authored RP plans, never live game telemetry. */
import {validMapProfile} from './tactical-map-core.mjs';
export const PLAN_PREFIX='mtTacticalPlanV226:';
export const PLAN_LIMITS=Object.freeze({plans:200,history:400,squads:24,points:250,routes:70,participants:60});
const uid=()=>globalThis.crypto?.randomUUID?.()??`plan-${Date.now()}-${Math.random().toString(36).slice(2,14)}`;
const id=x=>{if(typeof x!=='string'||!/^[\w-]{8,120}$/.test(x))throw Error('Неверный идентификатор плана');return x;};
const text=(x,label,n,required=true)=>{if(typeof x!=='string'||x.length>n||(required&&!x.trim()))throw Error(`Некорректное поле: ${label}`);return x.trim();};
const date=x=>{if(typeof x!=='string'||!Number.isFinite(Date.parse(x))||new Date(x).toISOString()!==x)throw Error('Недопустимая дата плана');return x;};
const point=x=>{if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)throw Error('Координаты должны быть от 0 до 1');return x;};
const sha=x=>{if(typeof x!=='string'||!/^[a-f\d]{64}$/.test(x))throw Error('План требует контрольную сумму подложки карты');return x;};
const group=x=>{if(x==null||x.type==='none')return null;if(!x||!['family','organization'].includes(x.type))throw Error('Неверный тип группы');return {type:x.type,id:id(x.id)};};
const stamp=()=>new Date().toISOString();
const fresh=(profileId,fields)=>({profileId:id(profileId),title:text(fields.title,'Название',120),brief:text(fields.brief??'','Описание',1500,false),scheduledAt:fields.scheduledAt?date(fields.scheduledAt):'',group:group(fields.group),mapSha256:sha(fields.mapSha256),parentPlanId:fields.parentPlanId?id(fields.parentPlanId):'',archived:false,squads:[],points:[],routes:[]});
const squad=(x)=>({id:id(x.id),name:text(x.name,'Название группы',80),role:text(x.role??'','Задача группы',200,false),leader:text(x.leader??'','Командир',80,false),participants:Array.isArray(x.participants)?[...new Set(x.participants.map(v=>text(v,'Участник',80)))]:[]});
const coordinate=(x)=>({id:id(x.id),name:text(x.name,'Название точки',100),kind:['rally','position','objective'].includes(x.kind)?x.kind:(()=>{throw Error('Недопустимый тип точки');})(),x:point(x.x),y:point(x.y),squadId:x.squadId?id(x.squadId):''});
const route=(x)=>({id:id(x.id),name:text(x.name,'Название маршрута',100),pointIds:Array.isArray(x.pointIds)?x.pointIds.map(id):[],squadId:x.squadId?id(x.squadId):'',speed:Number(x.speed)});
function checkState(p){
 if(p.squads.length>PLAN_LIMITS.squads||p.points.length>PLAN_LIMITS.points||p.routes.length>PLAN_LIMITS.routes)throw Error('Превышен лимит объектов плана');
 const unique=(rows,label)=>{const ids=new Set(rows.map(x=>x.id));if(ids.size!==rows.length)throw Error('Повторяется идентификатор: '+label);return ids;};
 const squads=unique(p.squads,'группа'),points=unique(p.points,'точка');unique(p.routes,'маршрут');
 for(const s of p.squads){if(s.participants.length>PLAN_LIMITS.participants||new Set(s.participants.map(x=>x.toLowerCase())).size!==s.participants.length)throw Error('Повторяющиеся участники или лимит состава');}
 for(const x of p.points)if(x.squadId&&!squads.has(x.squadId))throw Error('Точка связана с отсутствующей группой');
 for(const x of p.routes){if(x.pointIds.length<2||x.pointIds.length>80||new Set(x.pointIds).size!==x.pointIds.length||x.pointIds.some(t=>!points.has(t)))throw Error('Маршрут требует минимум две различные существующие точки');if(x.squadId&&!squads.has(x.squadId))throw Error('Маршрут ссылается на отсутствующую группу');if(!Number.isFinite(x.speed)||x.speed<=0||x.speed>100000)throw Error('Недопустимая скорость маршрута');}
 return p;
}
export function applyPlanAction(state,action,data){
 if(!state){if(action!=='create')throw Error('Нет регистрации плана');return checkState(fresh(data.profileId,data));}
 const p=structuredClone(state),get=(rows,key)=>{const i=rows.findIndex(x=>x.id===data.id);if(i<0)throw Error('Объект отсутствует: '+key);return i;};
 if(action==='edit'){if(p.archived)throw Error('Архивный план нельзя изменить');p.title=text(data.title,'Название',120);p.brief=text(data.brief??'','Описание',1500,false);p.scheduledAt=data.scheduledAt?date(data.scheduledAt):'';p.group=group(data.group);}
 else if(action==='archive'){if(p.archived===data.archived||typeof data.archived!=='boolean')throw Error('Неверное изменение архива');p.archived=data.archived;}
 else if(!p.archived){
  if(action==='add-squad'){const s=squad({...data,id:data.id||uid()});if(p.squads.some(x=>x.id===s.id))throw Error('Группа уже существует');p.squads.push(s);}
  else if(action==='edit-squad'){const i=get(p.squads,'группа');p.squads[i]=squad({...data,id:p.squads[i].id});}
  else if(action==='remove-squad'){const i=get(p.squads,'группа');if(p.points.some(x=>x.squadId===data.id)||p.routes.some(x=>x.squadId===data.id))throw Error('Группа используется точками или маршрутами');p.squads.splice(i,1);}
  else if(action==='add-point'){const v=coordinate({...data,id:data.id||uid()});if(p.points.some(x=>x.id===v.id))throw Error('Точка уже существует');p.points.push(v);}
  else if(action==='edit-point'){const i=get(p.points,'точка');p.points[i]=coordinate({...data,id:p.points[i].id});}
  else if(action==='remove-point'){const i=get(p.points,'точка');if(p.routes.some(x=>x.pointIds.includes(data.id)))throw Error('Точка используется маршрутом');p.points.splice(i,1);}
  else if(action==='add-route'){const r=route({...data,id:data.id||uid()});if(p.routes.some(x=>x.id===r.id))throw Error('Маршрут уже существует');p.routes.push(r);}
  else if(action==='edit-route'){const i=get(p.routes,'маршрут');p.routes[i]=route({...data,id:p.routes[i].id});}
  else if(action==='remove-route')p.routes.splice(get(p.routes,'маршрут'),1);
  else throw Error('Неизвестная операция с планом');
 }else throw Error('Архивный план нельзя изменить');
 return checkState(p);
}
export function cleanPlan(raw){
 if(!raw||!Array.isArray(raw.history)||raw.history.length<1||raw.history.length>PLAN_LIMITS.history)throw Error('Повреждён журнал тактического плана');
 const idValue=id(raw.id),profileId=id(raw.profileId),createdAt=date(raw.createdAt),updatedAt=date(raw.updatedAt);
 let state=null,previousTime=createdAt;const seen=new Set();
 for(const entry of raw.history){if(!entry||!entry.action)throw Error('Повреждена операция плана');id(entry.id);const at=date(entry.at);if(seen.has(entry.id)||at<previousTime||at>updatedAt)throw Error('Неверный порядок истории плана');seen.add(entry.id);previousTime=at;
  state=applyPlanAction(state,entry.action,entry.data);if(state.profileId!==profileId)throw Error('Нарушена изоляция профиля плана');
 }
 if(updatedAt!==previousTime||createdAt!==raw.history[0].at||JSON.stringify(state)!==JSON.stringify(raw.state))throw Error('История или содержимое плана повреждены');
 return {id:idValue,profileId,createdAt,updatedAt,history:structuredClone(raw.history),state};
}
export function createPlan(profileId,fields){if(!validMapProfile(profileId))throw Error('Недопустимый RP-профиль');const at=stamp(),entry={id:uid(),at,action:'create',data:{...fields,profileId}};return cleanPlan({id:uid(),profileId,createdAt:at,updatedAt:at,history:[entry],state:applyPlanAction(null,'create',entry.data)});}
export function mutatePlan(raw,action,data={}){const p=cleanPlan(raw);if(p.history.length>=PLAN_LIMITS.history)throw Error('Журнал плана заполнен');const at=stamp();const payload=structuredClone(data);if(['add-squad','add-point','add-route'].includes(action)&&!payload.id)payload.id=uid();const entry={id:uid(),at,action,data:payload},state=applyPlanAction(p.state,action,entry.data);return cleanPlan({...p,updatedAt:at,history:[...p.history,entry],state});}
export function duplicatePlan(raw,{title}={}){const src=cleanPlan(raw);let next=createPlan(src.profileId,{...src.state,title:title||src.state.title+' — вариант',parentPlanId:src.id});for(const s of src.state.squads)next=mutatePlan(next,'add-squad',s);for(const p of src.state.points)next=mutatePlan(next,'add-point',p);for(const r of src.state.routes)next=mutatePlan(next,'add-route',r);return next;}
export function routeDistance(plan,routeId,mapWidth,mapHeight){const p=cleanPlan(plan).state,r=p.routes.find(x=>x.id===routeId);if(!r)throw Error('Маршрут не найден');if(!Number.isFinite(mapWidth)||mapWidth<=0||!Number.isFinite(mapHeight)||mapHeight<=0)throw Error('Неверный размер карты');const rows=new Map(p.points.map(x=>[x.id,x]));let total=0;for(let i=1;i<r.pointIds.length;i++){const a=rows.get(r.pointIds[i-1]),b=rows.get(r.pointIds[i]);total+=Math.hypot((a.x-b.x)*mapWidth,(a.y-b.y)*mapHeight);}return {distancePixels:total,minutes:total/r.speed};}
export function planExport(plans,profileId){if(!validMapProfile(profileId))throw Error('Неверный профиль');const rows=plans.map(cleanPlan).filter(p=>p.profileId===profileId);return {format:'majestic-tactical-plans',version:1,profileId,exportedAt:stamp(),plans:rows};}
