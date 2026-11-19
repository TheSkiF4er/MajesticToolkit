/** Crime & Territory Operations: validated, replayable RP territory and event ledger. */
export const TERRITORY_PREFIX='mtTerritoriesV216:';
export const CRIME_EVENT_PREFIX='mtCrimeEventsV216:';
export const MAX_TERRITORIES=1000;
export const MAX_CRIME_EVENTS=5000;
const uid=()=>globalThis.crypto?.randomUUID?.()??`crime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,15)}`;
const id=v=>{if(typeof v!=='string'||!/^[\w-]{8,120}$/.test(v))throw Error('Неверный идентификатор RP-события');return v;};
const optionalId=v=>v===''?'':id(v);
const text=(v,label,max,optional=false)=>{if(typeof v!=='string'||v.trim().length>max||!optional&&!v.trim())throw Error(`${label}: некорректное значение`);return v.trim();};
const timestamp=v=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Неверное время события');return new Date(v).toISOString();};
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('Некорректная дата RP-события');return v;};
const enumOf=(value,options,label)=>{if(!options.includes(value))throw Error('Неверное значение: '+label);return value;};
const groupType=v=>enumOf(v,['none','family','organization'],'тип владельца');
const owner=(type,ref)=>{type=groupType(type);return {type,id:type==='none'?'':id(ref)};};
const side=v=>enumOf(v,['attacker','defender'],'сторона участника');
const amount=(v,max=1_000_000_000)=>{if(v===''||v==null||typeof v==='boolean'||!Number.isSafeInteger(Number(v))||Number(v)<0||Number(v)>max)throw Error('Некорректная статистика');return Number(v);};
const cleanPart=v=>({id:id(v.id),side:side(v.side),player:text(v.player,'Участник',80),kills:amount(v.kills,10000),deaths:amount(v.deaths,10000),damage:amount(v.damage,100000000)});
const cleanLog=raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Повреждён журнал');return {id:id(raw.id),at:timestamp(raw.at),kind:text(raw.kind,'Действие',30),reason:text(raw.reason??'','Основание',400,true)};};
const identity=raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.events)||raw.events.length<1||raw.events.length>2000)throw Error('Повреждённая запись Crime & Territory');const head={id:id(raw.id),profileId:id(raw.profileId),createdAt:timestamp(raw.createdAt),updatedAt:timestamp(raw.updatedAt)};if(head.createdAt>head.updatedAt)throw Error('Нарушено время записи');return head;};
const replay=(raw,handler)=>{const head=identity(raw),seen=new Set();let last=head.createdAt,projection=null;for(const item of raw.events){const ev=cleanLog(item);if(seen.has(ev.id)||ev.at<last||ev.at>head.updatedAt)throw Error('Нарушена хронология событий');seen.add(ev.id);last=ev.at;projection=handler(projection,ev,item);}if(!projection||last!==head.updatedAt)throw Error('Повреждена последняя редакция');return {...head,...projection,events:raw.events.map(x=>structuredClone(x))};};
export function cleanTerritory(raw){return replay(raw,(previous,ev,input)=>{
 if(!previous){if(ev.kind!=='create')throw Error('Нет регистрации территории');const first=owner(input.ownerType??'none',input.ownerId??'');return {name:text(input.name,'Территория',100),region:text(input.region??'','Район',120,true),notes:text(input.notes??'','Описание',1000,true),initialOwner:first,archived:false};}
 if(ev.kind==='edit'&&!previous.archived)return {...previous,name:text(input.name,'Территория',100),region:text(input.region??'','Район',120,true),notes:text(input.notes??'','Описание',1000,true)};
 if(ev.kind==='archive'&&typeof input.archived==='boolean'&&previous.archived!==input.archived)return {...previous,archived:input.archived};
 throw Error('Недопустимая операция с территорией');
 });}
export function cleanCrimeEvent(raw){return replay(raw,(previous,ev,input)=>{
 if(!previous){if(ev.kind!=='create')throw Error('Нет регистрации события');const attacker=owner(input.attackerType,input.attackerId),defender=owner(input.defenderType??'none',input.defenderId??'');if(attacker.type==='none'||attacker.type===defender.type&&attacker.id===defender.id)throw Error('Недопустимые стороны противостояния');return {title:text(input.title,'Название события',120),kind:enumOf(input.eventKind,['capture','battle','rp'],'тип RP-события'),territoryId:optionalId(input.territoryId??''),date:date(input.date),attacker,defender,notes:text(input.notes??'','Описание события',1000,true),status:'planned',winner:'',participants:[]};}
 if(previous.status!=='planned')throw Error('Завершённое или отменённое событие нельзя изменить');
 if(ev.kind==='edit'){return {...previous,title:text(input.title,'Название события',120),date:date(input.date),notes:text(input.notes??'','Описание',1000,true)};}
 if(ev.kind==='participant-add'){const part=cleanPart({...input, id:input.participantId});if(previous.participants.some(p=>p.side===part.side&&p.player.toLocaleLowerCase('ru')===part.player.toLocaleLowerCase('ru')))throw Error('Участник уже зарегистрирован на этой стороне');return {...previous,participants:[...previous.participants,part]};}
 if(ev.kind==='participant-remove'){const participantId=id(input.participantId);if(!previous.participants.some(p=>p.id===participantId))throw Error('Участник отсутствует');return {...previous,participants:previous.participants.filter(p=>p.id!==participantId)};}
 if(ev.kind==='finish')return {...previous,status:'completed',winner:enumOf(input.winner,['attacker','defender','draw'],'результат')};
 if(ev.kind==='cancel')return {...previous,status:'cancelled'};
 throw Error('Недопустимое действие с RP-событием');
 });}
function createRecord(profileId,kind,fields,clean){const now=new Date().toISOString();return clean({id:uid(),profileId:id(profileId),createdAt:now,updatedAt:now,events:[{id:uid(),at:now,kind:'create',reason:'Регистрация',...fields}]});}
export const newTerritory=(profileId,fields)=>createRecord(profileId,'territory',fields,cleanTerritory);
export const newCrimeEvent=(profileId,fields)=>createRecord(profileId,'event',fields,cleanCrimeEvent);
function append(raw,kind,fields,clean){const current=clean(raw),now=new Date().toISOString();if(current.events.length>=2000)throw Error('Достигнут лимит журнала');return clean({...current,updatedAt:now,events:[...current.events,{id:uid(),at:now,kind,reason:'',...fields}]});}
export const changeTerritory=(raw,kind,fields)=>append(raw,kind,fields,cleanTerritory);
export const changeCrimeEvent=(raw,kind,fields)=>append(raw,kind,kind==='participant-add'?{...fields,participantId:uid()}:fields,cleanCrimeEvent);
const equal=(a,b)=>a.type===b.type&&a.id===b.id;
const groupKey=group=>group.type+':'+group.id;
export function validateCrime(territories,operations,profileIds=null,families=null,organizations=null){
 if(!Array.isArray(territories)||!Array.isArray(operations)||territories.length>MAX_TERRITORIES||operations.length>MAX_CRIME_EVENTS)throw Error('Превышен лимит территорий или RP-событий');
 const profiles=profileIds?new Set(profileIds):null,groups=new Map(),ts=new Map(),seen=new Set(),names=new Set();
 for(const row of families??[])groups.set('family:'+row.id,row.profileId);
 for(const row of organizations??[])groups.set('organization:'+row.id,row.profileId);
 const checkGroup=(group,profile)=>{if(group.type!=='none'&&groups.size>=0&&(families!==null||organizations!==null)&&groups.get(groupKey(group))!==profile)throw Error('Семья или организация отсутствует в профиле');};
 const cleanT=territories.map(raw=>{const t=cleanTerritory(raw),key=t.profileId+'\u001f'+t.name.toLocaleLowerCase('ru');if(seen.has(t.id)||names.has(key)||profiles&&!profiles.has(t.profileId))throw Error('Дубликат территории или отсутствует профиль');checkGroup(t.initialOwner,t.profileId);seen.add(t.id);names.add(key);ts.set(t.id,t);return t;});
 const cleanO=operations.map(raw=>{const op=cleanCrimeEvent(raw);if(seen.has(op.id)||profiles&&!profiles.has(op.profileId))throw Error('Повтор события или отсутствует профиль');seen.add(op.id);checkGroup(op.attacker,op.profileId);checkGroup(op.defender,op.profileId);if(op.territoryId){const t=ts.get(op.territoryId);if(!t||t.profileId!==op.profileId)throw Error('Территория отсутствует в профиле');}if(op.kind==='capture'&&!op.territoryId)throw Error('Капт требует территорию');return op;});
 const ownership=new Map(cleanT.map(t=>[t.id,t.initialOwner]));
 for(const op of cleanO.filter(o=>o.status==='completed'&&o.kind==='capture').sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){const current=ownership.get(op.territoryId);if(!equal(current,op.defender))throw Error('Защитник капта не соответствует владельцу территории на дату события');if(op.winner==='attacker')ownership.set(op.territoryId,op.attacker);}
 return {territories:cleanT,operations:cleanO,owners:ownership};
}
export function crimeSummary(territories,operations,profileId,families=[],organizations=[]){const validated=validateCrime(territories,operations,null,families,organizations);const people=new Map(),groups=new Map();for(const op of validated.operations.filter(x=>x.profileId===profileId&&x.status==='completed')){for(const [group,side] of [[op.attacker,'attacker'],[op.defender,'defender']]){if(group.type==='none')continue;const key=groupKey(group),g=groups.get(key)||{type:group.type,id:group.id,events:0,wins:0,losses:0,draws:0,kills:0,deaths:0,damage:0};g.events++;if(op.winner==='draw')g.draws++;else if(op.winner===side)g.wins++;else g.losses++;for(const p of op.participants.filter(x=>x.side===side)){g.kills+=p.kills;g.deaths+=p.deaths;g.damage+=p.damage;const playerKey=groupKey(group)+'/'+p.player.toLocaleLowerCase('ru'),v=people.get(playerKey)||{player:p.player,group:key,events:0,kills:0,deaths:0,damage:0};v.events++;v.kills+=p.kills;v.deaths+=p.deaths;v.damage+=p.damage;people.set(playerKey,v);}groups.set(key,g);}}return {territories:validated.territories.filter(t=>t.profileId===profileId).map(t=>({...t,owner:validated.owners.get(t.id)})),operations:validated.operations.filter(op=>op.profileId===profileId),groups:[...groups.values()].sort((a,b)=>b.wins-a.wins||b.damage-a.damage),players:[...people.values()].sort((a,b)=>b.kills-a.kills||b.damage-a.damage)};}
export function crimeCsv(territories,operations,profileId){const quote=x=>{let s=String(x??'');if(/^[\s\x00-\x1f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const rows=[['Тип','ID','Дата','Название','Статус','Результат','Территория','Участники'],...territories.filter(t=>t.profileId===profileId).map(t=>['Территория',t.id,t.createdAt.slice(0,10),t.name,t.archived?'Архив':'Активная','','','']),...operations.filter(o=>o.profileId===profileId).map(o=>['Событие',o.id,o.date,o.title,o.status,o.winner,o.territoryId,o.participants.map(p=>p.player).join(', ')])];return '\ufeff'+rows.map(r=>r.map(quote).join(';')).join('\r\n')+'\r\n';}
