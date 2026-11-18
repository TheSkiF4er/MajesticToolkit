// MajesticToolkit 0.6.0 — local, server-scoped Government Tools.
// Every decision retains its source law edition and quoted article at creation time.
import {cleanJudicialCase,validateCaseRelations,CASE_LIMITS} from './judicial-case-core.mjs';
export const GOV_PREFIX = 'majesticGovernmentV6:';
export const GOV_LIMITS = Object.freeze({ records: 1600, departments: 80, templates: 300, decisions: 1200, references: 25, units: 320, positions: 400, competences: 500, assignments: 600, courts: 80, jurisdictions: 600, cases: CASE_LIMITS.cases });
const now = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() ?? `gov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
function text(v, name, max, optional = false) {if(typeof v !== 'string') throw Error(`Неверный тип: ${name}`); const s=v.trim(); if(s.length>max||(!optional&&!s)) throw Error(`Заполните «${name}» (до ${max} символов)`); return s;}
function identifier(s){const id=text(s,'ID',128);if(!/^[\w-]{8,128}$/.test(id))throw Error('Недопустимый ID');return id;}
function time(t){const val=text(t,'Время',40);if(!Number.isFinite(Date.parse(val)))throw Error('Некорректная дата');return val;}
function requiredObject(x){if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Некорректная запись Government Tools');return x;}
const agencyStatus=s=>{const value=s??'active';if(value!=='active'&&value!=='archived')throw Error('Недопустимый статус реестра');return value;};
const dateOnly=(s,label,optional=false)=>{if(optional&&(s===undefined||s===''))return '';const v=text(s,label,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00.000Z'))||new Date(v+'T00:00:00.000Z').toISOString().slice(0,10)!==v)throw Error(`Некорректная дата: ${label}`);return v;};
const shortCode=(s,label)=>{const value=text(s,label,35);if(!/^[\p{L}\p{N}_.-]+$/u.test(value))throw Error(`Некорректный код: ${label}`);return value;};
const idList=(raw,label,limit=80)=>{if(!Array.isArray(raw)||raw.length>limit)throw Error(`Некорректные связи: ${label}`);const items=raw.map(identifier);if(new Set(items).size!==items.length)throw Error(`Повторяющиеся связи: ${label}`);return items;};

// Explicit judicial records share Government Tools storage and follow existing profile/department boundaries.
export const COURT_LEVELS = Object.freeze({first:'Первая инстанция',appeal:'Апелляционная инстанция',cassation:'Кассационная инстанция',supreme:'Высшая инстанция',special:'Специализированный суд'});
export const COURT_STAGES = Object.freeze({first:'Первоначальное рассмотрение',appeal:'Апелляция',cassation:'Кассация',review:'Пересмотр'});
const courtEnum=(value,values,name)=>{if(typeof value!=='string'||!Object.hasOwn(values,value))throw Error(`Недопустимое значение: ${name}`);return value;};
const courtToken=(value,name)=>{const valueString=text(value,name,120);if(valueString==='*')return '*';if(valueString.includes('*')||/[\r\n\t]/u.test(valueString))throw Error(`Недопустимая категория или территория: ${name}`);return valueString;};
export const PLACEHOLDERS = Object.freeze(['agency','agencyCode','jurisdiction','officer','position','caseNumber','subject','date','facts','articles','sanction','reason','notes']);
export const DEFAULT_TEMPLATE = 'ВЕДОМСТВО: {agency}\nДело № {caseNumber}\nДата: {date}\nДолжностное лицо: {officer}, {position}\nЛицо: {subject}\n\nОБСТОЯТЕЛЬСТВА\n{facts}\n\nПРИМЕНИМЫЕ НОРМЫ\n{articles}\n\nРЕШЕНИЕ\n{sanction}\n\nОБОСНОВАНИЕ\n{reason}\n\nПРИМЕЧАНИЯ\n{notes}';
export function cleanReference(raw){requiredObject(raw);return {bookId:identifier(raw.bookId),editionId:identifier(raw.editionId),bookTitle:text(raw.bookTitle,'Название закона',170),editionLabel:text(raw.editionLabel,'Редакция',100),effectiveDate:text(raw.effectiveDate,'Дата редакции',10),articleKey:text(raw.articleKey,'Номер статьи',50),articleTitle:text(raw.articleTitle,'Название статьи',220),articleText:text(raw.articleText,'Текст статьи',12000),sourceUrl:(()=>{const link=text(raw.sourceUrl??'','Источник',1000,true);if(link){let u;try{u=new URL(link);}catch{throw Error('Неверная ссылка на закон');}if(u.protocol!=='https:'||u.username||u.password)throw Error('Допустимы только HTTPS-источники');}return link;})()};}
export function resolveReferences(laws, profileId, selections){
 if(!Array.isArray(selections)||selections.length>GOV_LIMITS.references)throw Error('Максимум 25 статей');const unique=new Set();return selections.map(sel=>{requiredObject(sel);const b=laws.find(x=>x.type==='book'&&x.id===sel.bookId&&x.profileId===profileId);if(!b)throw Error('Нормативный акт отсутствует в текущем профиле');const ed=b.editions.find(x=>x.id===(sel.editionId||b.activeEditionId));const a=ed?.articles.find(x=>x.key===sel.articleKey);if(!a)throw Error(`Статья ${sel.articleKey} отсутствует в выбранной редакции`);const key=`${b.id}/${ed.id}/${a.key}`;if(unique.has(key))throw Error('Повторяющаяся статья');unique.add(key);return cleanReference({bookId:b.id,editionId:ed.id,bookTitle:b.title,editionLabel:ed.label,effectiveDate:ed.effectiveDate,articleKey:a.key,articleTitle:a.title,articleText:a.text,sourceUrl:Object.hasOwn(ed,'sourceUrl')?ed.sourceUrl:b.sourceUrl});});
}
export function referenceId(ref){return `${ref.bookId}/${ref.editionId}/${ref.articleKey}`;}
export const PENALTY_TYPES = Object.freeze({fine:'Штраф',custody:'Заключение',warning:'Предупреждение',other:'Иная мера'});
export function cleanPenalty(raw){requiredObject(raw);const kind=text(raw.kind,'Вид санкции',20);if(!Object.hasOwn(PENALTY_TYPES,kind))throw Error('Неизвестный вид санкции');const number=(v,label,max)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)throw Error(`Недопустимое значение «${label}»`);return v;};const amount=number(raw.amount??0,'Штраф',1e9),minutes=number(raw.minutes??0,'Срок',1e6);if(kind==='fine'&&(amount<=0||minutes!==0)||kind==='custody'&&(minutes<=0||amount!==0)||!['fine','custody'].includes(kind)&&(amount!==0||minutes!==0))throw Error('Укажите сумму штрафа или срок в соответствии с типом санкции');return {referenceId:text(raw.referenceId,'Ссылка на статью',400),kind,amount,minutes,details:text(raw.details??'','Примечание к санкции',500,true)};}
export function penaltyTotals(penalties){const rows=penalties.map(cleanPenalty);return {fine:rows.reduce((n,x)=>n+x.amount,0),minutes:rows.reduce((n,x)=>n+x.minutes,0)};}
export function formatPenalties(penalties,references){const rows=penalties.map(cleanPenalty);if(!rows.length)return '';const lines=rows.map((row,i)=>{const ref=references.find(r=>referenceId(r)===row.referenceId);if(!ref)throw Error('Статья для санкции не найдена');return `${i+1}. ${PENALTY_TYPES[row.kind]}${row.kind==='fine'?`: $${row.amount.toLocaleString('ru-RU')}`:''}${row.kind==='custody'?`: ${row.minutes} мин.`:''} — ${ref.bookTitle}, ст. ${ref.articleKey}${row.details?' ('+row.details+')':''}`;});const totals=penaltyTotals(rows);return 'САНКЦИИ ПО СТАТЬЯМ\n'+lines.join('\n')+`\nИтого: штраф $${totals.fine.toLocaleString('ru-RU')}, срок ${totals.minutes} мин. (параметры введены пользователем)`;}
export function cleanGovernment(raw){requiredObject(raw);const base={id:identifier(raw.id),profileId:identifier(raw.profileId),createdAt:time(raw.createdAt),updatedAt:time(raw.updatedAt)};
 if(raw.type==='case')return cleanJudicialCase(raw);
 if(raw.type==='department')return {...base,type:'department',name:text(raw.name,'Ведомство',110),code:text(raw.code,'Сокращение',35),jurisdiction:text(raw.jurisdiction??'','Юрисдикция',120,true),officer:text(raw.officer,'ФИО',110),position:text(raw.position,'Должность',110),...(Object.hasOwn(raw,'description')?{description:text(raw.description??'','Описание ведомства',2000,true)}:{}),...(Object.hasOwn(raw,'status')?{status:agencyStatus(raw.status)}:{})};
 if(raw.type==='unit')return {...base,type:'unit',departmentId:identifier(raw.departmentId),parentUnitId:raw.parentUnitId?identifier(raw.parentUnitId):'',name:text(raw.name,'Подразделение',120),code:shortCode(raw.code,'Код подразделения'),description:text(raw.description??'','Описание подразделения',2000,true),status:agencyStatus(raw.status)};
 if(raw.type==='competence')return {...base,type:'competence',departmentId:identifier(raw.departmentId),code:shortCode(raw.code,'Код компетенции'),title:text(raw.title,'Компетенция',140),description:text(raw.description,'Описание полномочия',3000),legalBasis:text(raw.legalBasis??'','Правовое основание',1500,true),status:agencyStatus(raw.status)};
 if(raw.type==='position')return {...base,type:'position',departmentId:identifier(raw.departmentId),unitId:raw.unitId?identifier(raw.unitId):'',title:text(raw.title,'Должность',120),rank:text(raw.rank??'','Звание/уровень',90,true),description:text(raw.description??'','Обязанности',2000,true),competenceIds:idList(raw.competenceIds??[],'Компетенции'),status:agencyStatus(raw.status)};
 if(raw.type==='assignment'){
  const startedAt=dateOnly(raw.startedAt,'Дата назначения'),endedAt=dateOnly(raw.endedAt,'Дата окончания',true);
  if(endedAt&&endedAt<startedAt)throw Error('Дата окончания раньше назначения');
  const history=raw.history??[];
  if(!Array.isArray(history)||history.length>60)throw Error('Слишком длинная история назначений');
  return {...base,type:'assignment',departmentId:identifier(raw.departmentId),positionId:identifier(raw.positionId),officer:text(raw.officer,'Сотрудник',120),startedAt,endedAt,notes:text(raw.notes??'','Примечание',1500,true),status:agencyStatus(raw.status),history:history.map(h=>{requiredObject(h);return {changedAt:time(h.changedAt),positionId:identifier(h.positionId),officer:text(h.officer,'Сотрудник',120),startedAt:dateOnly(h.startedAt,'Дата назначения'),endedAt:dateOnly(h.endedAt,'Дата окончания',true),status:agencyStatus(h.status),reason:text(h.reason??'','Причина изменения',500,true)};})};
 }
 if(raw.type==='court')return {...base,type:'court',departmentId:identifier(raw.departmentId),parentCourtId:raw.parentCourtId?identifier(raw.parentCourtId):'',level:courtEnum(raw.level,COURT_LEVELS,'Инстанция'),venue:text(raw.venue??'','Место заседаний',180,true),description:text(raw.description??'','Описание суда',2000,true),status:agencyStatus(raw.status??'active')};
 if(raw.type==='jurisdiction')return {...base,type:'jurisdiction',courtId:identifier(raw.courtId),category:courtToken(raw.category,'Категория дел'),territory:courtToken(raw.territory,'Территория'),stage:courtEnum(raw.stage,COURT_STAGES,'Стадия производства'),legalBasis:text(raw.legalBasis,'Правовое основание',1500),priority:(()=>{const n=raw.priority??0;if(!Number.isSafeInteger(n)||n<0||n>100)throw Error('Приоритет должен быть от 0 до 100');return n;})(),status:agencyStatus(raw.status??'active')};
 if(raw.type==='template') {const body=text(raw.body,'Шаблон',14000);const unknown=[...body.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map(m=>m[1]).filter(x=>!PLACEHOLDERS.includes(x));if(unknown.length)throw Error(`Неизвестные переменные шаблона: ${unknown.join(', ')}`);return {...base,type:'template',departmentId:raw.departmentId?identifier(raw.departmentId):'',title:text(raw.title,'Название шаблона',120),category:text(raw.category||'Процессуальный документ','Категория',80),body};}
 if(raw.type==='decision') {const refs=raw.references;if(!Array.isArray(refs)||refs.length>GOV_LIMITS.references)throw Error('Некорректные ссылки на статьи');const references=refs.map(cleanReference);const ids=new Set();for(const ref of references){const key=`${ref.bookId}/${ref.editionId}/${ref.articleKey}`;if(ids.has(key))throw Error('Дублирующаяся статья');ids.add(key);}
 const penalties=(raw.penalties??[]);if(!Array.isArray(penalties)||penalties.length>60)throw Error('Не более 60 санкций');const cleanedPenalties=penalties.map(item=>cleanPenalty(item));for(const penalty of cleanedPenalties){if(!references.some(ref=>referenceId(ref)===penalty.referenceId))throw Error('Санкция ссылается на отсутствующую статью');}
 const status=raw.status;if(!['draft','final'].includes(status))throw Error('Некорректный статус');return {...base,type:'decision',departmentId:identifier(raw.departmentId),caseNumber:text(raw.caseNumber,'Номер дела',100),subject:text(raw.subject,'Лицо',150),facts:text(raw.facts,'Обстоятельства',9000),sanction:text(raw.sanction??'','Решение/санкция',4000,cleanedPenalties.length>0),reason:text(raw.reason,'Обоснование',6000),notes:text(raw.notes??'','Заметки',4000,true),references,penalties:cleanedPenalties, status,finalizedAt:status==='final'?time(raw.finalizedAt):null};}
 throw Error('Неизвестный тип записи Government Tools');
}
export function validateGovernment(raw,profileIds){if(!Array.isArray(raw)||raw.length>GOV_LIMITS.records)throw Error('Слишком много записей Government Tools');const ps=profileIds?new Set(profileIds):null;const ids=new Set();const records=raw.map(cleanGovernment);for(const r of records){if(ids.has(r.id))throw Error('Дублируется ID записи');ids.add(r.id);if(ps&&!ps.has(r.profileId))throw Error('Запись относится к отсутствующему профилю');}
 const departments=new Map(records.filter(x=>x.type==='department').map(x=>[x.id,x]));
 if(departments.size>GOV_LIMITS.departments||Object.entries({template:GOV_LIMITS.templates,decision:GOV_LIMITS.decisions,unit:GOV_LIMITS.units,position:GOV_LIMITS.positions,competence:GOV_LIMITS.competences,assignment:GOV_LIMITS.assignments,court:GOV_LIMITS.courts,jurisdiction:GOV_LIMITS.jurisdictions,case:GOV_LIMITS.cases}).some(([t,max])=>records.filter(x=>x.type===t).length>max))throw Error('Превышен лимит Government Tools');
 const byId=new Map(records.map(r=>[r.id,r]));
 const unique=new Set();
 for(const r of records){
  if(r.departmentId){const dep=departments.get(r.departmentId);if(!dep||dep.profileId!==r.profileId)throw Error('Ведомство отсутствует или принадлежит другому профилю');}
  if(r.type==='case'){validateCaseRelations(r,records);const key=`case:${r.profileId}:${r.number.toLocaleLowerCase('ru')}`;if(unique.has(key))throw Error('Номер судебного дела уже занят в этом профиле');unique.add(key);}
  if(r.type==='unit'){
   if(r.parentUnitId){const parent=byId.get(r.parentUnitId);if(parent?.type!=='unit'||parent.profileId!==r.profileId||parent.departmentId!==r.departmentId)throw Error('Родительское подразделение отсутствует или принадлежит другому ведомству');}
   const key=`unit:${r.departmentId}:${r.code.toLocaleLowerCase('ru')}`;if(unique.has(key))throw Error('Код подразделения уже занят');unique.add(key);
  }
  if(r.type==='competence'){const key=`competence:${r.departmentId}:${r.code.toLocaleLowerCase('ru')}`;if(unique.has(key))throw Error('Код компетенции уже занят');unique.add(key);}
  if(r.type==='position'){
   if(r.unitId){const unit=byId.get(r.unitId);if(unit?.type!=='unit'||unit.profileId!==r.profileId||unit.departmentId!==r.departmentId)throw Error('Подразделение должности отсутствует или принадлежит другому ведомству');}
   for(const id of r.competenceIds){const c=byId.get(id);if(c?.type!=='competence'||c.departmentId!==r.departmentId||c.profileId!==r.profileId)throw Error('Компетенция должности отсутствует или принадлежит другому ведомству');}
  }
  if(r.type==='court'){
   const dep=departments.get(r.departmentId);
   if(dep?.status==='archived'&&r.status==='active')throw Error('Нельзя активировать суд архивного ведомства');
   const key=`court:${r.departmentId}`;if(unique.has(key))throw Error('Для ведомства уже существует судебный профиль');unique.add(key);
   if(r.parentCourtId){const parent=byId.get(r.parentCourtId);if(parent?.type!=='court'||parent.profileId!==r.profileId)throw Error('Вышестоящий суд не найден в текущем профиле');if(r.status==='active'&&parent.status!=='active')throw Error('Вышестоящий суд должен быть действующим');}
  }
  if(r.type==='jurisdiction'){
   const court=byId.get(r.courtId);
   if(court?.type!=='court'||court.profileId!==r.profileId)throw Error('Правило подсудности ссылается на отсутствующий суд или другой профиль');
   if(r.status==='active'&&court.status!=='active')throw Error('Нельзя активировать подсудность архивного суда');
   const key=`jurisdiction:${r.courtId}:${r.stage}:${r.category.toLocaleLowerCase('ru')}:${r.territory.toLocaleLowerCase('ru')}`;
   if(unique.has(key))throw Error('Такое правило подсудности уже существует');unique.add(key);
  }
  if(r.type==='assignment'){
   const pos=byId.get(r.positionId);if(pos?.type!=='position'||pos.profileId!==r.profileId||pos.departmentId!==r.departmentId)throw Error('Должность сотрудника отсутствует или принадлежит другому ведомству');
   if(r.status==='active'&&!r.endedAt&&pos.status!=='active')throw Error('Нельзя назначать на архивную должность');
   const key=`assignment:${r.positionId}:${r.officer.toLocaleLowerCase('ru')}`;
   if(r.status==='active'&&!r.endedAt){if(unique.has(key))throw Error('Сотрудник уже назначен на эту должность');unique.add(key);}
  }
 }
 // A judge cannot conduct overlapping scheduled hearings across different cases.
 const assigned=new Map();for(const c of records.filter(x=>x.type==='case'&&x.judgeAssignmentId))for(const h of c.hearings){if(h.status!=='scheduled')continue;const rows=assigned.get(c.judgeAssignmentId)||[];if(rows.some(x=>x.startsAt<h.endsAt&&h.startsAt<x.endsAt))throw Error('У назначенного судьи пересекаются заседания по разным делам');rows.push(h);assigned.set(c.judgeAssignmentId,rows);}
 // A self-reference and any deeper cycle must be rejected on import and edit.
 for(const unit of records.filter(r=>r.type==='unit')){
  const visited=new Set([unit.id]);let current=unit;
  while(current.parentUnitId){if(visited.has(current.parentUnitId))throw Error('Цикл в структуре подразделений');visited.add(current.parentUnitId);current=byId.get(current.parentUnitId);}
 }
 for(const court of records.filter(r=>r.type==='court')){
  const visited=new Set([court.id]);let current=court;
  while(current.parentCourtId){if(visited.has(current.parentCourtId))throw Error('Цикл в судебной иерархии');visited.add(current.parentCourtId);current=byId.get(current.parentCourtId);}
 }
 return records;}
export function createDepartment(profileId,fields){const t=now();return cleanGovernment({id:uid(),profileId,type:'department',createdAt:t,updatedAt:t,...fields});}
export function editDepartment(old,fields){const r=cleanGovernment(old);if(r.type!=='department')throw Error('Это не ведомство');return cleanGovernment({...r,...fields,id:r.id,profileId:r.profileId,type:r.type,createdAt:r.createdAt,updatedAt:now()});}
export function createTemplate(profileId,fields){const t=now();return cleanGovernment({id:uid(),profileId,type:'template',createdAt:t,updatedAt:t,...fields});}
export function editTemplate(old,fields){const r=cleanGovernment(old);if(r.type!=='template')throw Error('Это не шаблон');return cleanGovernment({...r,...fields,id:r.id,profileId:r.profileId,type:r.type,createdAt:r.createdAt,updatedAt:now()});}
export function createDecision(profileId,fields,laws){const t=now();return cleanGovernment({id:uid(),profileId,type:'decision',status:'draft',finalizedAt:null,createdAt:t,updatedAt:t,...fields,references:resolveReferences(laws,profileId,fields.selections||[]),penalties:fields.penalties||[]});}
export function editDecision(old,fields,laws){const r=cleanGovernment(old);if(r.type!=='decision'||r.status!=='draft')throw Error('Утверждённое решение нельзя редактировать');return cleanGovernment({...r,...fields,id:r.id,profileId:r.profileId,type:r.type,createdAt:r.createdAt,updatedAt:now(),status:'draft',finalizedAt:null,references:(fields.selections||[]).map(sel=>r.references.find(ref=>ref.bookId===sel.bookId&&ref.editionId===sel.editionId&&ref.articleKey===sel.articleKey) ?? resolveReferences(laws,r.profileId,[sel])[0]),penalties:fields.penalties||[]});}
export function finalizeDecision(old){const r=cleanGovernment(old);if(r.type!=='decision'||r.status==='final')throw Error('Решение уже утверждено');if(!r.references.length)throw Error('Нельзя утвердить решение без статей законодательства');const date=now();return cleanGovernment({...r,status:'final',finalizedAt:date,updatedAt:date});}
export function cloneDecision(old,laws){const r=cleanGovernment(old);if(r.type!=='decision')throw Error('Решение не найдено');const t=now();return cleanGovernment({...r,id:uid(),caseNumber:`${r.caseNumber} (копия)`.slice(0,100),status:'draft',finalizedAt:null,createdAt:t,updatedAt:t});}
export function renderDocument(template,department,decision){const t=cleanGovernment(template),dep=cleanGovernment(department),d=cleanGovernment(decision);if(t.type!=='template'||dep.type!=='department'||d.type!=='decision'||dep.id!==d.departmentId||t.profileId!==d.profileId||dep.profileId!==d.profileId||(t.departmentId&&t.departmentId!==dep.id))throw Error('Несовместимые профиль/ведомство/шаблон');
 const vars={agency:dep.name,agencyCode:dep.code,jurisdiction:dep.jurisdiction,officer:dep.officer,position:dep.position,caseNumber:d.caseNumber,subject:d.subject,date:d.finalizedAt?.slice(0,10)||d.createdAt.slice(0,10),facts:d.facts,articles:d.references.length?d.references.map(ref=>`${ref.bookTitle} — статья ${ref.articleKey}. ${ref.articleTitle} (${ref.editionLabel}, ${ref.effectiveDate})`).join('\n'):'Статьи не выбраны',sanction:[d.sanction,formatPenalties(d.penalties,d.references)].filter(Boolean).join('\n'),reason:d.reason,notes:d.notes};return t.body.replace(/\{([a-zA-Z][\w]*)\}/g,(_,key)=>vars[key]??'');
}
export function exportDecisionText(decision,department){const d=cleanGovernment(decision),dep=cleanGovernment(department);if(d.type!=='decision'||dep.type!=='department'||d.departmentId!==dep.id)throw Error('Некорректное ведомство');return `${dep.name} (${dep.code})\n${dep.jurisdiction}\n\nДело № ${d.caseNumber}\nСтатус: ${d.status==='final'?'Утверждено':'Черновик'}${d.finalizedAt?' · '+d.finalizedAt:''}\nСотрудник: ${dep.officer}, ${dep.position}\nЛицо: ${d.subject}\n\nОБСТОЯТЕЛЬСТВА\n${d.facts}\n\nПРИМЕНИМЫЕ СТАТЬИ\n${d.references.map(r=>`${r.bookTitle} — статья ${r.articleKey}. ${r.articleTitle}; ${r.editionLabel} (${r.effectiveDate})\n${r.articleText}${r.sourceUrl?'\nИсточник: '+r.sourceUrl:''}`).join('\n\n')||'Не выбраны'}\n\nРЕШЕНИЕ\n${[d.sanction,formatPenalties(d.penalties,d.references)].filter(Boolean).join('\n')}\n\nОБОСНОВАНИЕ\n${d.reason}\n\nПРИМЕЧАНИЯ\n${d.notes}\n`;
}

// Agency records use the SAME Government Tools store and backup, not a parallel registry.
function createAgencyRecord(profileId,type,fields){const t=now();return cleanGovernment({id:uid(),profileId,type,createdAt:t,updatedAt:t,...fields});}
function editAgencyRecord(old,type,fields){const record=cleanGovernment(old);if(record.type!==type)throw Error('Неверный тип записи ведомства');return cleanGovernment({...record,...fields,id:record.id,profileId:record.profileId,type,createdAt:record.createdAt,updatedAt:now()});}
export const createAgencyUnit=(profileId,fields)=>createAgencyRecord(profileId,'unit',fields);
export const editAgencyUnit=(old,fields)=>editAgencyRecord(old,'unit',fields);
export const createAgencyPosition=(profileId,fields)=>createAgencyRecord(profileId,'position',fields);
export const editAgencyPosition=(old,fields)=>editAgencyRecord(old,'position',fields);
export const createAgencyCompetence=(profileId,fields)=>createAgencyRecord(profileId,'competence',fields);
export const editAgencyCompetence=(old,fields)=>editAgencyRecord(old,'competence',fields);
export const createAgencyAssignment=(profileId,fields)=>createAgencyRecord(profileId,'assignment',{...fields,history:[]});
export function editAgencyAssignment(old,fields){
 const r=cleanGovernment(old);if(r.type!=='assignment')throw Error('Не назначение');
 const event={changedAt:now(),positionId:r.positionId,officer:r.officer,startedAt:r.startedAt,endedAt:r.endedAt,status:r.status,reason:typeof fields.reason==='string'?fields.reason:''};
 // Historical events cannot be rewritten by a form submission.
 return editAgencyRecord(r,'assignment',{...fields,history:[...r.history,event].slice(-60)});
}
export function agencyRoster(records,departmentId){
 const rows=validateGovernment(records).filter(r=>r.departmentId===departmentId);
 const positions=new Map(rows.filter(r=>r.type==='position').map(r=>[r.id,r]));
 const units=new Map(rows.filter(r=>r.type==='unit').map(r=>[r.id,r]));
 const competences=new Map(rows.filter(r=>r.type==='competence').map(r=>[r.id,r]));
 return rows.filter(r=>r.type==='assignment').map(r=>({...r,position:positions.get(r.positionId),unit:units.get(positions.get(r.positionId)?.unitId)||null,competences:(positions.get(r.positionId)?.competenceIds||[]).map(id=>competences.get(id)).filter(Boolean)}));
}

// Court routing returns evidence for each match; it never makes an unverified legal determination.
const normalizeCourtTerm=value=>String(value??'').trim().toLocaleLowerCase('ru');
export function findCourtJurisdiction(records,profileId,{stage,category,territory,originCourtId=''}={}){
 courtEnum(stage,COURT_STAGES,'Стадия');const cat=courtToken(category,'Категория дел'),region=courtToken(territory,'Территория');
 const all=validateGovernment(records).filter(r=>r.profileId===profileId),byId=new Map(all.map(r=>[r.id,r]));
 let allowed=null;
 if(originCourtId){const origin=byId.get(originCourtId);if(origin?.type!=='court')throw Error('Исходный суд отсутствует в текущем профиле');if(stage==='first')throw Error('Первоначальное рассмотрение не требует исходного суда');allowed=new Set();let ancestor=origin;while(ancestor.parentCourtId){ancestor=byId.get(ancestor.parentCourtId);allowed.add(ancestor.id);}}
 return all.filter(r=>r.type==='jurisdiction'&&r.status==='active'&&r.stage===stage&&(r.category==='*'||normalizeCourtTerm(r.category)===normalizeCourtTerm(cat))&&(r.territory==='*'||normalizeCourtTerm(r.territory)===normalizeCourtTerm(region)))
  .map(rule=>({rule,court:byId.get(rule.courtId)})).filter(({court})=>court?.status==='active'&&byId.get(court.departmentId)?.status!=='archived'&&(!allowed||allowed.has(court.id)))
  .map(row=>({...row,department:byId.get(row.court.departmentId),score:(row.rule.category==='*'?0:2)+(row.rule.territory==='*'?0:1)}))
  .sort((a,b)=>b.score-a.score||b.rule.priority-a.rule.priority||a.department.name.localeCompare(b.department.name,'ru'));
}
export const createCourt=(profileId,fields)=>createAgencyRecord(profileId,'court',fields);
export const editCourt=(old,fields)=>editAgencyRecord(old,'court',fields);
export const createCourtJurisdiction=(profileId,fields)=>createAgencyRecord(profileId,'jurisdiction',fields);
export const editCourtJurisdiction=(old,fields)=>editAgencyRecord(old,'jurisdiction',fields);
