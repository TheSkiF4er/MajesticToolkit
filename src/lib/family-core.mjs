/** Local RP family registry: validated rosters, ranks, aliases and append-only change history. */
export const FAMILY_PREFIX='mtFamiliesV214:';
export const MAX_FAMILIES=2000;
export const MAX_FAMILY_EVENTS=5000;
const text=(value,label,max,optional=false)=>{if(typeof value!=='string')throw Error(`${label}: нужен текст`);const s=value.trim();if(s.length>max||(!optional&&!s))throw Error(`${label}: неверная длина`);return s;};
const id=x=>{if(typeof x!=='string'||!/^[\w-]{8,120}$/.test(x))throw Error('Неверный идентификатор семьи');return x;};
const day=x=>{if(typeof x!=='string'||!/^\d{4}-\d\d-\d\d$/.test(x)||!Number.isFinite(Date.parse(x+'T00:00:00Z'))||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)throw Error('Неверная дата события семьи');return x;};
const stamp=x=>{if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x)||!Number.isFinite(Date.parse(x)))throw Error('Неверное время семейной записи');return new Date(x).toISOString();};
const key=x=>x.toLocaleLowerCase('ru-RU');
export const memberKey=key;
const uid=()=>globalThis.crypto?.randomUUID?.()??`family-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,14)}`;
const KIND=['rank-add','rank-edit','rank-remove','join','rank-change','leave','alias-add','alias-remove','family-edit','archive'];
const eventClean=raw=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!KIND.includes(raw.kind))throw Error('Неизвестное действие в истории семьи');
 const base={id:id(raw.id),kind:raw.kind,at:stamp(raw.at),reason:text(raw.reason??'','Основание',400,true)};
 if(raw.kind==='rank-add'||raw.kind==='rank-edit')return {...base,rankId:id(raw.rankId),rankName:text(raw.rankName,'Ранг',60),priority:positiveOrder(raw.priority)};
 if(raw.kind==='rank-remove')return {...base,rankId:id(raw.rankId)};
 if(raw.kind==='join')return {...base,memberId:id(raw.memberId),player:text(raw.player,'Участник',80),rankId:id(raw.rankId),date:day(raw.date)};
 if(raw.kind==='rank-change')return {...base,memberId:id(raw.memberId),rankId:id(raw.rankId),date:day(raw.date)};
 if(raw.kind==='leave')return {...base,memberId:id(raw.memberId),date:day(raw.date)};
 if(raw.kind==='alias-add'||raw.kind==='alias-remove')return {...base,alias:text(raw.alias,'Название семьи в старых матчах',80)};
 if(raw.kind==='family-edit')return {...base,name:text(raw.name,'Семья',80),tag:text(raw.tag??'','Тег',24,true),description:text(raw.description??'','Описание',800,true)};
 return {...base,archived:raw.archived===true};
};
function positiveOrder(x){const n=Number(x);if(!Number.isSafeInteger(n)||n<1||n>1000||x===''||x===null||typeof x==='boolean')throw Error('Приоритет ранга от 1 до 1000');return n;}
export function cleanFamily(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Повреждённая запись семьи');
 const family={id:id(raw.id),profileId:id(raw.profileId),createdAt:stamp(raw.createdAt),updatedAt:stamp(raw.updatedAt),events:[]};
 if(!Array.isArray(raw.events)||raw.events.length<2||raw.events.length>MAX_FAMILY_EVENTS)throw Error('Повреждена история семьи');
 const seen=new Set(),ranks=new Map(),members=new Map(),aliases=new Set();let name='',tag='',description='',archived=false,lastAt=family.createdAt;
 for(const input of raw.events){
  const ev=eventClean(input);if(seen.has(ev.id))throw Error('Дублирование события семьи');seen.add(ev.id);
  if(ev.at<lastAt||ev.at>family.updatedAt)throw Error('Нарушена хронология семьи');lastAt=ev.at;
  switch(ev.kind){
   case 'family-edit': if(archived)throw Error('Архивная семья не редактируется');name=ev.name;tag=ev.tag;description=ev.description;break;
   case 'archive': archived=ev.archived;break;
   case 'rank-add': if(archived||ranks.has(ev.rankId)||[...ranks.values()].some(r=>key(r.name)===key(ev.rankName)))throw Error('Ранг уже существует или семья в архиве');ranks.set(ev.rankId,{id:ev.rankId,name:ev.rankName,priority:ev.priority});break;
   case 'rank-edit': if(archived||!ranks.has(ev.rankId)||[...ranks.values()].some(r=>r.id!==ev.rankId&&key(r.name)===key(ev.rankName)))throw Error('Невозможно изменить ранг');ranks.set(ev.rankId,{id:ev.rankId,name:ev.rankName,priority:ev.priority});break;
   case 'rank-remove': if(archived||!ranks.has(ev.rankId)||[...members.values()].some(m=>m.active&&m.rankId===ev.rankId)||ranks.size<=1)throw Error('Ранг используется или удалить нельзя');ranks.delete(ev.rankId);break;
   case 'join': if(archived||!ranks.has(ev.rankId)||members.has(ev.memberId)||[...members.values()].some(m=>key(m.player)===key(ev.player)&&(m.active||m.leftOn>ev.date)))throw Error('Участник уже состоит в семье или дата вступления раньше предыдущего выхода');members.set(ev.memberId,{id:ev.memberId,player:ev.player,rankId:ev.rankId,joinedOn:ev.date,active:true,leftOn:''});break;
   case 'rank-change': {const m=members.get(ev.memberId);if(archived||!m?.active||!ranks.has(ev.rankId)||ev.date<m.joinedOn)throw Error('Недоступно изменение ранга');members.set(m.id,{...m,rankId:ev.rankId});break;}
   case 'leave': {const m=members.get(ev.memberId);if(archived||!m?.active||ev.date<m.joinedOn)throw Error('Участник уже вышел или неверная дата');members.set(m.id,{...m,active:false,leftOn:ev.date});break;}
   case 'alias-add': if(archived||aliases.has(key(ev.alias))||key(ev.alias)===key(name))throw Error('Дублирующийся псевдоним семьи');aliases.add(key(ev.alias));break;
   case 'alias-remove': if(archived||!aliases.has(key(ev.alias)))throw Error('Псевдоним отсутствует');aliases.delete(key(ev.alias));break;
  }
  family.events.push(ev);
 }
 if(!name||!ranks.size)throw Error('Не задано название или ранги семьи');
 return {...family,name,tag,description,archived,ranks:[...ranks.values()].sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name,'ru')),members:[...members.values()],aliases:[...aliases]};
}
export function newFamily(profileId,fields){
 const now=new Date().toISOString(),ev=(kind,extra)=>({id:uid(),kind,at:now,reason:'Создание семьи',...extra});
 return cleanFamily({id:uid(),profileId,createdAt:now,updatedAt:now,events:[ev('family-edit',{name:fields.name,tag:fields.tag??'',description:fields.description??''}),ev('rank-add',{rankId:uid(),rankName:'Глава',priority:1}),ev('rank-add',{rankId:uid(),rankName:'Участник',priority:10})]});
}
export function applyFamily(family,kind,fields={}){
 const previous=cleanFamily(family),at=new Date().toISOString();if(previous.events.length>=MAX_FAMILY_EVENTS)throw Error('Достигнут лимит истории семьи');
 const event={id:uid(),kind,at,reason:fields.reason??'',...fields};
 // Only explicit keys are cleaned by eventClean; never accept caller-provided event IDs.
 event.id=uid();event.at=at;event.kind=kind;
 if(kind==='rank-add')event.rankId=uid();
 if(kind==='join')event.memberId=uid();
 return cleanFamily({...previous,updatedAt:at,events:[...previous.events,event]});
}
export function validateFamilies(rows,profileIds=null){
 if(!Array.isArray(rows)||rows.length>MAX_FAMILIES)throw Error('Слишком много семей');
 const ids=new Set(),names=new Set(),aliases=new Set(),profiles=profileIds&&new Set(profileIds);
 return rows.map(row=>{const f=cleanFamily(row);if(ids.has(f.id))throw Error('Повтор ID семьи');ids.add(f.id);if(profiles&&!profiles.has(f.profileId))throw Error('Семья отсутствующего профиля');const keyName=f.profileId+'|'+key(f.name);if(names.has(keyName)||aliases.has(keyName))throw Error('Семья с таким именем уже существует');names.add(keyName);return f;}).map(f=>{for(const label of f.aliases){const k=f.profileId+'|'+label;if(names.has(k)||aliases.has(k))throw Error('Название или псевдоним используется другой семьёй');aliases.add(k);}return f;});
}
export function familyMatchStats(families,matches){
 const byAlias=new Map();for(const f of families)for(const alias of [f.name,...f.aliases])byAlias.set(f.profileId+'|'+key(alias),f.id);
 const map=new Map(families.map(f=>[f.id,{familyId:f.id,matches:0,wins:0,losses:0,kills:0,deaths:0,damage:0}]));
 for(const m of matches){if(m.type!=='match'||!m.family)continue;const familyId=byAlias.get(m.profileId+'|'+key(m.family.trim()));if(!familyId)continue;const row=map.get(familyId);row.matches++;row.wins+=Number(m.result==='win');row.losses+=Number(m.result==='loss');row.kills+=m.kills;row.deaths+=m.deaths;row.damage+=m.damage;}
 return map;
}
