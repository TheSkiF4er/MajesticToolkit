/** Organizations & Assets: replayable, validated local RP organizational registry. */
export const ORGANIZATION_PREFIX='mtOrganizationsV215:';
export const MAX_ORGANIZATIONS=2000;
export const MAX_ORGANIZATION_EVENTS=8000;
export const ORGANIZATION_TYPES=Object.freeze(['business','criminal','government','community','other']);
export const ASSET_TYPES=Object.freeze(['vehicle','property','equipment','other']);
const types=new Set(['org-edit','archive','unit-add','unit-edit','unit-archive','position-add','position-edit','position-archive','member-join','member-position','member-leave','asset-add','asset-edit','asset-custodian','asset-retire']);
const id=(v,optional=false)=>{if(optional&&(v===undefined||v===null||v===''))return '';if(typeof v!=='string'||!(/^[\w-]{8,120}$/).test(v))throw Error('Неверный идентификатор организации');return v;};
const text=(v,label,max,optional=false)=>{if(typeof v!=='string')throw Error(`${label}: требуется текст`);const s=v.trim();if(s.length>max||(!optional&&!s))throw Error(`${label}: неверная длина`);return s;};
const day=v=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('Неверная дата кадровой операции');return v;};
const stamp=v=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Неверная дата журнала организации');return new Date(v).toISOString();};
const cost=v=>{const n=Number(v);if(v===''||v===null||typeof v==='boolean'||!Number.isSafeInteger(n)||n<0||n>1_000_000_000_000)throw Error('Стоимость имущества должна быть целым числом от 0 до 1 трлн');return n;};
const order=v=>{const n=Number(v);if(v===''||v===null||typeof v==='boolean'||!Number.isSafeInteger(n)||n<1||n>1000)throw Error('Приоритет должности от 1 до 1000');return n;};
const lower=v=>v.toLocaleLowerCase('ru-RU');
const uid=()=>globalThis.crypto?.randomUUID?.()??`org-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,15)}`;
const EVENT_KEYS={
 'org-edit':{name:v=>text(v,'Название',100),tag:v=>text(v??'','Тег',24,true),type:v=>{if(!ORGANIZATION_TYPES.includes(v))throw Error('Недопустимый тип организации');return v;},description:v=>text(v??'','Описание',1000,true)},
 archive:{archived:v=>v===true},
 'unit-add':{unitId:id,name:v=>text(v,'Подразделение',80),parentId:v=>id(v,true)},
 'unit-edit':{unitId:id,name:v=>text(v,'Подразделение',80),parentId:v=>id(v,true)},
 'unit-archive':{unitId:id,archived:v=>v===true},
 'position-add':{positionId:id,name:v=>text(v,'Должность',80),unitId:v=>id(v,true),priority:order},
 'position-edit':{positionId:id,name:v=>text(v,'Должность',80),unitId:v=>id(v,true),priority:order},
 'position-archive':{positionId:id,archived:v=>v===true},
 'member-join':{memberId:id,player:v=>text(v,'Никнейм',80),positionId:id,date:day},
 'member-position':{memberId:id,positionId:id,date:day},
 'member-leave':{memberId:id,date:day},
 'asset-add':{assetId:id,name:v=>text(v,'Имущество',120),assetType:v=>{if(!ASSET_TYPES.includes(v))throw Error('Неизвестная категория имущества');return v;},assetTag:v=>text(v,'Инвентарный номер',100),value:cost,note:v=>text(v??'','Описание имущества',600,true)},
 'asset-edit':{assetId:id,name:v=>text(v,'Имущество',120),assetType:v=>{if(!ASSET_TYPES.includes(v))throw Error('Неизвестная категория имущества');return v;},assetTag:v=>text(v,'Инвентарный номер',100),value:cost,note:v=>text(v??'','Описание имущества',600,true)},
 'asset-custodian':{assetId:id,memberId:v=>id(v,true)},
 'asset-retire':{assetId:id,retired:v=>v===true}
};
const cleanEvent=raw=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!types.has(raw.kind))throw Error('Неизвестное действие в журнале организации');
 const value={id:id(raw.id),kind:raw.kind,at:stamp(raw.at),reason:text(raw.reason??'','Причина действия',400,true)};
 for(const [field,fn] of Object.entries(EVENT_KEYS[raw.kind]))value[field]=fn(raw[field]);
 return value;
};
function checkUnits(units){
 for(const u of units.values()){
  const seen=new Set([u.id]);let parent=u.parentId;
  while(parent){if(seen.has(parent))throw Error('Подразделения не могут образовывать цикл');seen.add(parent);const p=units.get(parent);if(!p)throw Error('Родительское подразделение отсутствует');if(!u.archived&&p.archived)throw Error('Активное подразделение не может быть в архивном');parent=p.parentId;}
 }
}
export function cleanOrganization(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Повреждённая организация');
 const org={id:id(raw.id),profileId:id(raw.profileId),createdAt:stamp(raw.createdAt),updatedAt:stamp(raw.updatedAt)};
 if(org.updatedAt<org.createdAt||!Array.isArray(raw.events)||raw.events.length<2||raw.events.length>MAX_ORGANIZATION_EVENTS)throw Error('Повреждённый журнал организации');
 const units=new Map(),positions=new Map(),members=new Map(),assets=new Map(),events=[],seen=new Set();
 let name='',tag='',type='other',description='',archived=false,last=org.createdAt;
 for(const input of raw.events){
  const ev=cleanEvent(input);if(seen.has(ev.id)||ev.at<last||ev.at>org.updatedAt)throw Error('Повтор события или нарушена история организации');seen.add(ev.id);last=ev.at;
  if(archived&&ev.kind!=='archive')throw Error('Архивную организацию нельзя редактировать');
  switch(ev.kind){
   case 'org-edit':name=ev.name;tag=ev.tag;type=ev.type;description=ev.description;break;
   case 'archive':if(ev.archived&&([...members.values()].some(m=>m.active)||[...assets.values()].some(a=>!a.retired)))throw Error('Нельзя архивировать организацию с составом или активами');archived=ev.archived;break;
   case 'unit-add':if(units.has(ev.unitId)||ev.parentId===ev.unitId||ev.parentId&&!units.has(ev.parentId)||[...units.values()].some(u=>u.parentId===ev.parentId&&lower(u.name)===lower(ev.name)))throw Error('Недопустимое или дублирующееся подразделение');units.set(ev.unitId,{id:ev.unitId,name:ev.name,parentId:ev.parentId,archived:false});break;
   case 'unit-edit':{const u=units.get(ev.unitId);if(!u||u.archived||[...units.values()].some(x=>x.id!==u.id&&x.parentId===ev.parentId&&lower(x.name)===lower(ev.name)))throw Error('Подразделение отсутствует, архивировано или повторяется');units.set(u.id,{...u,name:ev.name,parentId:ev.parentId});break;}
   case 'unit-archive':{const u=units.get(ev.unitId);if(!u)throw Error('Подразделение отсутствует');if(ev.archived&&([...units.values()].some(x=>x.parentId===u.id&&!x.archived)||[...positions.values()].some(x=>x.unitId===u.id&&!x.archived)))throw Error('Подразделение используется');units.set(u.id,{...u,archived:ev.archived});break;}
   case 'position-add':if(positions.has(ev.positionId)||ev.unitId&&(!units.has(ev.unitId)||units.get(ev.unitId).archived)||[...positions.values()].some(p=>p.unitId===ev.unitId&&lower(p.name)===lower(ev.name)))throw Error('Недопустимая или дублирующаяся должность');positions.set(ev.positionId,{id:ev.positionId,name:ev.name,unitId:ev.unitId,priority:ev.priority,archived:false});break;
   case 'position-edit':{const p=positions.get(ev.positionId);if(!p||p.archived||ev.unitId&&(!units.has(ev.unitId)||units.get(ev.unitId).archived)||[...positions.values()].some(x=>x.id!==p.id&&x.unitId===ev.unitId&&lower(x.name)===lower(ev.name)))throw Error('Должность отсутствует, повторяется или подразделение в архиве');positions.set(p.id,{...p,name:ev.name,unitId:ev.unitId,priority:ev.priority});break;}
   case 'position-archive':{const p=positions.get(ev.positionId);if(!p||ev.archived&&[...members.values()].some(m=>m.active&&m.positionId===p.id)||!ev.archived&&p.unitId&&units.get(p.unitId)?.archived)throw Error('Должность занята или подразделение архивировано');positions.set(p.id,{...p,archived:ev.archived});break;}
   case 'member-join':if(!positions.has(ev.positionId)||positions.get(ev.positionId).archived||members.has(ev.memberId)||[...members.values()].some(m=>m.active&&lower(m.player)===lower(ev.player)))throw Error('Сотрудник уже в составе или должность недоступна');members.set(ev.memberId,{id:ev.memberId,player:ev.player,positionId:ev.positionId,joinedOn:ev.date,leftOn:'',active:true});break;
   case 'member-position':{const m=members.get(ev.memberId),p=positions.get(ev.positionId);if(!m?.active||!p||p.archived||ev.date<m.joinedOn)throw Error('Невозможно изменить назначение');members.set(m.id,{...m,positionId:ev.positionId});break;}
   case 'member-leave':{const m=members.get(ev.memberId);if(!m?.active||ev.date<m.joinedOn||[...assets.values()].some(a=>!a.retired&&a.memberId===m.id))throw Error('Перед выходом сотрудника передайте закреплённое имущество');members.set(m.id,{...m,active:false,leftOn:ev.date});break;}
   case 'asset-add':if(assets.has(ev.assetId)||[...assets.values()].some(a=>lower(a.assetTag)===lower(ev.assetTag)))throw Error('Инвентарный номер уже используется');assets.set(ev.assetId,{id:ev.assetId,name:ev.name,type:ev.assetType,assetTag:ev.assetTag,value:ev.value,note:ev.note,memberId:'',retired:false});break;
   case 'asset-edit':{const a=assets.get(ev.assetId);if(!a||a.retired||[...assets.values()].some(x=>x.id!==a.id&&lower(x.assetTag)===lower(ev.assetTag)))throw Error('Имущество недоступно или номер занят');assets.set(a.id,{...a,name:ev.name,type:ev.assetType,assetTag:ev.assetTag,value:ev.value,note:ev.note});break;}
   case 'asset-custodian':{const a=assets.get(ev.assetId);if(!a||a.retired||ev.memberId&&!members.get(ev.memberId)?.active)throw Error('Имущество или ответственный недоступны');assets.set(a.id,{...a,memberId:ev.memberId});break;}
   case 'asset-retire':{const a=assets.get(ev.assetId);if(!a)throw Error('Имущество отсутствует');assets.set(a.id,{...a,retired:ev.retired,memberId:ev.retired?'':a.memberId});break;}
  }
  if(ev.kind==='unit-add'||ev.kind==='unit-edit'||ev.kind==='unit-archive')checkUnits(units);
  events.push(ev);
 }
 if(!name||!positions.size)throw Error('В организации не заданы название и должности');
 return {...org,name,tag,type,description,archived,events,units:[...units.values()],positions:[...positions.values()].sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name,'ru')),members:[...members.values()],assets:[...assets.values()]};
}
export function newOrganization(profileId,fields){
 const now=new Date().toISOString(),ev=(kind,values)=>({id:uid(),at:now,kind,reason:'Создание организации',...values});
 return cleanOrganization({id:uid(),profileId,createdAt:now,updatedAt:now,events:[ev('org-edit',{name:fields.name,tag:fields.tag??'',type:fields.type??'other',description:fields.description??''}),ev('position-add',{positionId:uid(),name:'Руководитель',unitId:'',priority:1}),ev('position-add',{positionId:uid(),name:'Сотрудник',unitId:'',priority:10})]});
}
export function applyOrganization(input,kind,fields={}){
 const old=cleanOrganization(input);if(old.events.length>=MAX_ORGANIZATION_EVENTS)throw Error('Превышен лимит истории организации');
 const now=new Date().toISOString(),event={...fields,id:uid(),kind,at:now};
 if(kind==='unit-add')event.unitId=uid();if(kind==='position-add')event.positionId=uid();if(kind==='member-join')event.memberId=uid();if(kind==='asset-add')event.assetId=uid();
 return cleanOrganization({...old,updatedAt:now,events:[...old.events,event]});
}
export function validateOrganizations(rows,profileIds=null){
 if(!Array.isArray(rows)||rows.length>MAX_ORGANIZATIONS)throw Error('Слишком много организаций');
 const profileSet=profileIds?new Set(profileIds):null,ids=new Set(),names=new Set();
 return rows.map(raw=>{
  const org=cleanOrganization(raw),key=org.profileId+'\u001f'+lower(org.name);
  if(ids.has(org.id)||names.has(key))throw Error('Повтор организации или названия в профиле');
  if(profileSet&&!profileSet.has(org.profileId))throw Error('Организация принадлежит отсутствующему профилю');
  ids.add(org.id);names.add(key);return org;
 });
}
export function organizationAssetsCsv(org,stock=[]){
 const quote=v=>{let s=String(v??'');if(/^[\s\x00-\x1f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const lines=[['Источник','Название','Номер/партия','Категория','Стоимость','Количество','Ответственный','Статус'],...org.assets.map(a=>['Реестр',a.name,a.assetTag,a.type,a.value,1,org.members.find(m=>m.id===a.memberId)?.player??'',a.retired?'Списано':'Активно']),...stock.map(s=>['Склад',s.productId,s.assetTag||s.lotId,'Товар',s.lotValue,s.quantity,'',s.reserved?'Резерв':'Остаток'])];
 return '\ufeff'+lines.map(line=>line.map(quote).join(';')).join('\r\n')+'\r\n';
}
