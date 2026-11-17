import './complaints-core.js';
const C=globalThis.RPNComplaints;
export const MOD_OPS_PREFIX='mtModerationOpsV175:';
export const TRIGGERS=Object.freeze({create:'При создании',update:'При изменении',reply:'При новом ответе',overdue:'При просрочке'});
export const AUTOMATION_ACTIONS=Object.freeze({tag:'Добавить локальный тег',priority:'Установить приоритет'});
const ts=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():(()=>{throw Error('Некорректная дата аудита');})();
const text=(v,n,required=false)=>{if(typeof v!=='string'||v.length>n||(required&&!v.trim()))throw Error('Некорректный текст');return v.trim();};
const hours=v=>{if(!Number.isInteger(v)||v<1||v>2160)throw Error('SLA должен быть от 1 до 2160 часов');return v;};
export function defaultPolicy(){return {enabled:false,defaultHours:24,priorityHours:{low:72,normal:24,high:8,urgent:1},categories:[],pauseWaiting:true,notifications:true,alerts:[1440,60,15,0]};}
export function cleanPolicy(v=defaultPolicy()){
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Некорректная политика SLA');
 const src=defaultPolicy(),priorityHours={};
 if(typeof v.enabled!=='boolean'||typeof v.pauseWaiting!=='boolean'||typeof v.notifications!=='boolean')throw Error('Некорректные переключатели SLA');
 for(const k of C.PRIORITIES)priorityHours[k]=hours(v.priorityHours?.[k]);
 if(!Array.isArray(v.categories)||v.categories.length>30)throw Error('До 30 правил SLA по категориям');
 const seen=new Set(),categories=v.categories.map(c=>{const name=text(c?.name,80,true);if(seen.has(name.toLocaleLowerCase('ru')))throw Error('Повторная категория SLA');seen.add(name.toLocaleLowerCase('ru'));return {name,hours:hours(c.hours)};});
 if(!Array.isArray(v.alerts)||v.alerts.length>8||new Set(v.alerts).size!==v.alerts.length||v.alerts.some(n=>!Number.isInteger(n)||n<0||n>10080))throw Error('Некорректные пороги уведомлений');
 return {enabled:v.enabled,defaultHours:hours(v.defaultHours??src.defaultHours),priorityHours,categories,pauseWaiting:v.pauseWaiting,notifications:v.notifications,alerts:[...v.alerts].sort((a,b)=>b-a)};
}
export function cleanRule(r){
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Некорректное правило автоматизации');
 const id=text(r.id,120,true),name=text(r.name,90,true),trigger=r.trigger,field=r.field,action=r.action,value=text(r.value,100,true),equals=text(r.equals,100,true);
 if(!/^[\w-]{8,120}$/.test(id)||!Object.hasOwn(TRIGGERS,trigger)||!['category','priority','status'].includes(field)||!Object.hasOwn(AUTOMATION_ACTIONS,action)||typeof r.enabled!=='boolean')throw Error('Некорректные параметры автоматизации');
 if(action==='priority'&&!C.PRIORITIES.includes(value)||action==='tag'&&value.length>40||field==='priority'&&!C.PRIORITIES.includes(equals)||field==='status'&&!C.STATUS.includes(equals))throw Error('Некорректное условие или действие');
 return {id,name,enabled:r.enabled,trigger,field,equals,action,value};
}
export function cleanOperations(raw,profile){
 if(raw===undefined)return {version:1,profileId:profile.id,project:profile.project,server:profile.server,policy:defaultPolicy(),rules:[],audit:[],fired:[]};
 if(!raw||raw.version!==1||raw.profileId!==profile.id||raw.project!==profile.project||raw.server!==profile.server)throw Error('Настройки модерации другого профиля/сервера');
 if(!Array.isArray(raw.rules)||raw.rules.length>30||!Array.isArray(raw.audit)||raw.audit.length>500||!Array.isArray(raw.fired)||raw.fired.length>500)throw Error('Превышен лимит автоматизации или аудита');
 const rules=raw.rules.map(cleanRule),ids=new Set(rules.map(r=>r.id));if(ids.size!==rules.length)throw Error('Повторная автоматизация');
 const audit=raw.audit.map(a=>{if(!a||!['case','workflow','triage','evidence','calculation','rule','sla','automation','notification','system'].includes(a.action))throw Error('Некорректный аудит');const id=text(a.id,120,true),caseId=a.caseId===null?null:text(a.caseId,120,true);if(!/^[\w-]{8,120}$/.test(id)||caseId!==null&&!/^[\w-]{8,120}$/.test(caseId))throw Error('Некорректный ID аудита');return {id,caseId,action:a.action,description:text(a.description,300,true),at:ts(a.at)};});
 if(new Set(audit.map(a=>a.id)).size!==audit.length)throw Error('Повторное событие аудита');
 const fired=raw.fired.map(x=>text(x,320,true));if(new Set(fired).size!==fired.length)throw Error('Повторный ключ автоматизации');
 const output={version:1,profileId:profile.id,project:profile.project,server:profile.server,policy:cleanPolicy(raw.policy),rules,audit,fired};
 if(new TextEncoder().encode(JSON.stringify(output)).length>600000)throw Error('Журнал модерации превышает лимит');return output;
}
export function auditEvent(ops,action,description,caseId=null,at=new Date().toISOString()){
 const item={id:globalThis.crypto?.randomUUID?.()??'event-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),caseId,action,description:text(description,300,true),at:ts(at)};
 return {...ops,audit:[...ops.audit,item].slice(-500)};
}
export function slaHours(c,policy){const named=policy.categories.find(x=>x.name.toLocaleLowerCase('ru')===c.triage.category.toLocaleLowerCase('ru'));return named?.hours??policy.priorityHours[c.triage.priority]??policy.defaultHours;}
export function applySla(previous,current,policy,now=new Date().toISOString()){
 const c=C.cleanCase(current),before=previous?C.cleanCase(previous):null;
 if(!policy.enabled&&!(before?.sla?.pausedAt&&c.status!=='waiting'))return c;
 const time=Date.parse(now);if(!Number.isFinite(time))throw Error('Некорректное время SLA');
 // A manually edited deadline is authoritative; never override it with an automatic policy.
 if(before&&c.deadline!==before.deadline&&c.sla?.managed!==true)return c;
 if(!before){if(c.deadline)return c;const duration=slaHours(c,policy)*3600000;return C.cleanCase({...c,deadline:new Date(Date.parse(c.createdAt)+duration).toISOString(),sla:{managed:true,pausedAt:null,remainingMs:null}});}
 if(!before.sla?.managed)return c;
 if(c.status==='done')return c;
 const meta=before.sla;
 if(policy.pauseWaiting&&c.status==='waiting'&&before.status!=='waiting'&&!meta.pausedAt){const remaining=Math.max(0,Date.parse(before.deadline)-time);return C.cleanCase({...c,deadline:null,sla:{managed:true,pausedAt:now,remainingMs:remaining}});}
 if(meta.pausedAt&&c.status!=='waiting'){return C.cleanCase({...c,deadline:new Date(time+meta.remainingMs).toISOString(),sla:{managed:true,pausedAt:null,remainingMs:null}});}
 return c;
}
export function applyRules(c,ops,trigger,at=new Date().toISOString()){
 let item=C.cleanCase(c),config=ops;const applied=[];
 for(const r of config.rules){if(!r.enabled||r.trigger!==trigger)continue;
  const field=r.field==='category'?item.triage.category:r.field==='priority'?item.triage.priority:item.status;
  if(field.toLocaleLowerCase('ru')!==r.equals.toLocaleLowerCase('ru'))continue;
  const marker=`${item.id}:${r.id}:${trigger}:${trigger==='reply'?item.lastSeenPostId??'none':trigger==='overdue'?item.deadline??'none':'once'}`;
  if(config.fired.includes(marker))continue;
  let patch=null;
  if(r.action==='tag'&&!item.triage.tags.includes(r.value))patch={tags:[...item.triage.tags,r.value]};
  if(r.action==='priority'&&item.triage.priority!==r.value)patch={priority:r.value};
  if(!patch)continue;
  item=C.updateCase(item,{triage:patch});config=auditEvent(config,'automation',`${r.name}: ${AUTOMATION_ACTIONS[r.action]} (${r.value})`,item.id,at);
  config={...config,fired:[...config.fired,marker].slice(-500)};applied.push(r.id);
 }
 return {item,ops:config,applied};
}
export function analytics(cases,profileId,{now=Date.now(),days=7}={}){
 if(!Number.isInteger(days)||days<1||days>90)throw Error('Период аналитики: 1–90 дней');
 const rows=cases.filter(c=>c.profileId===profileId),from=now-days*86400000;
 const completedAt=c=>{const events=c.workflow?.history??[];return events.filter(x=>x.type==='step'&&x.text.includes('Завершено')).at(-1)?.at??(c.status==='done'?c.updatedAt:null);};
 const created=rows.filter(c=>Date.parse(c.createdAt)>=from&&Date.parse(c.createdAt)<=now),finished=rows.filter(c=>{const d=completedAt(c);return d&&Date.parse(d)>=from&&Date.parse(d)<=now;});
 const counts={total:rows.length,created:created.length,completed:finished.length,active:rows.filter(c=>c.status!=='done').length,waiting:rows.filter(c=>c.status==='waiting').length,overdue:rows.filter(c=>c.status!=='done'&&c.deadline&&Date.parse(c.deadline)<now).length,reopened:rows.filter(c=>c.triage.queue==='recheck').length,reviewed:rows.filter(c=>c.moderation?.status==='reviewed').length};
 const turnaround=finished.map(c=>Math.max(0,Date.parse(completedAt(c))-Date.parse(c.createdAt))).filter(Number.isFinite);counts.averageHours=turnaround.length?Math.round(turnaround.reduce((s,v)=>s+v,0)/turnaround.length/3600000*10)/10:null;
 const series=Array.from({length:days},(_,i)=>{const d=new Date(now-(days-1-i)*86400000).toISOString().slice(0,10);return {day:d,created:created.filter(c=>c.createdAt.slice(0,10)===d).length,completed:finished.filter(c=>completedAt(c).slice(0,10)===d).length};});
 const categories=Object.entries(rows.reduce((a,c)=>{const k=c.triage.category||'Без категории';a[k]=(a[k]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>({name,count}));
 const decisions=Object.entries(finished.reduce((a,c)=>{const k=c.workflow.decision;a[k]=(a[k]||0)+1;return a;},{})).map(([name,count])=>({name,count}));
 return {periodDays:days,counts,series,categories,decisions};
}
