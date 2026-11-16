import './complaints-core.js';
const C=globalThis.RPNComplaints;
export const QUEUES=Object.freeze({all:'Все (без архива)',new:'Новые','in-progress':'В работе',waiting:'Ожидание',assigned:'Назначенные',unread:'Непрочитанные',overdue:'Просроченные',due:'Срок ≤ 1 часа',recheck:'Повторная проверка',referred:'Переданные',done:'Завершённые',archived:'Архив'});
export const SORTS=Object.freeze({priority:'Приоритет → срок',deadline:'Ближайший срок',updated:'Последние изменения',created:'Новые сначала'});
const txt=(v,n)=>{if(typeof v!=='string'||v.length>n)throw Error('Некорректный фильтр жалоб');return v.trim();};
export function cleanFilter(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректный фильтр жалоб');
 const queue=raw.queue??'all',priority=raw.priority??'all',sort=raw.sort??'priority';
 if(!Object.hasOwn(QUEUES,queue)||!['all',...C.PRIORITIES].includes(priority)||!Object.hasOwn(SORTS,sort))throw Error('Неизвестный фильтр жалоб');
 return {queue,priority,sort,query:txt(raw.query??'',240),category:txt(raw.category??'',80),assignee:txt(raw.assignee??'',100),tag:txt(raw.tag??'',40)};
}
export function cleanSavedViews(raw=[]){
 if(!Array.isArray(raw)||raw.length>50)throw Error('До 50 сохранённых фильтров');
 const seen=new Set();return raw.map(v=>{const id=txt(v?.id,120),name=txt(v?.name,80);if(!/^[\w-]{8,120}$/.test(id)||!name||seen.has(id))throw Error('Некорректный сохранённый фильтр');seen.add(id);return {id,name,filter:cleanFilter(v.filter)};});
}
const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
export function caseSearchText(c,rules=[]){const t=C.cleanTriage(c.triage), entries=c.moderation?.players?.flatMap(p=>[p.id,p.nickname,...p.items.flatMap(i=>{const r=rules instanceof Map?rules.get(i.ruleId):rules.find(x=>x.id===i.ruleId);const rev=r?.revisions?.find(x=>x.id===i.revisionId);return [i.ruleId,i.note,rev?.code,rev?.title];})])??[];return norm([c.title,c.url,c.threadKey,c.id,c.note,c.draft,c.status,t.priority,t.category,t.section,t.assignee,t.reason,...t.tags,...entries,...c.evidence.flatMap(e=>[e.title,e.note])].join(' '));}
export function matchesQueue(c,q,now=Date.now()){
 const t=C.cleanTriage(c.triage);if(q==='archived')return t.queue==='archived';if(t.queue==='archived')return false;
 if(q==='all')return true;if(q==='assigned')return !!t.assignee&&c.status!=='done';if(q==='unread')return c.unread;
 if(q==='overdue'||q==='due')return c.status!=='done'&&!!c.deadline&&Date.parse(c.deadline)<=(q==='due'?now+3600000:now)&&(q!=='due'||Date.parse(c.deadline)>now);
 if(q==='recheck'||q==='referred')return t.queue===q&&c.status!=='done';return c.status===q;
}
export function selectCases(cases,profileId,filter={},rules=[],now=Date.now()){
 const f=cleanFilter(filter),deadline=c=>c.deadline?Date.parse(c.deadline):Infinity, rank=c=>C.PRIORITIES.indexOf(C.cleanTriage(c.triage).priority);
 const tokens=norm(f.query).split(/\s+/).filter(Boolean),ruleMap=new Map(rules.map(r=>[r.id,r]));
 const rows=cases.filter(c=>c.profileId===profileId&&matchesQueue(c,f.queue,now)).filter(c=>{const t=C.cleanTriage(c.triage);return (f.priority==='all'||t.priority===f.priority)&&(!f.category||norm(t.category).includes(norm(f.category)))&&(!f.assignee||norm(t.assignee).includes(norm(f.assignee)))&&(!f.tag||t.tags.some(x=>norm(x).includes(norm(f.tag))))&&(!tokens.length||(()=>{const text=caseSearchText(c,ruleMap);return tokens.every(q=>text.includes(q));})());});
 return rows.sort((a,b)=>(f.sort==='priority'?rank(b)-rank(a)||deadline(a)-deadline(b):f.sort==='deadline'?deadline(a)-deadline(b):f.sort==='created'?b.createdAt.localeCompare(a.createdAt):b.updatedAt.localeCompare(a.updatedAt))||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
}
