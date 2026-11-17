import './complaints-core.js';
import {cleanRevision,currentRevision,SANCTIONS,UNITS} from './rules-core.mjs';
import {calculatePunishments,validatePolicy} from './punishment-calculator.mjs';
import {assertCaseScope,assertDecisionReady,moderationReport} from './moderation-core.mjs';
const C=globalThis.RPNComplaints;
export const REGISTRY_KEY='mtPunishmentRegistryV1';
export const REGISTRY_STATES={reviewed:'Проверено пользователем',published:'Публикация отмечена пользователем',executed:'Исполнение отмечено пользователем',cancelled:'Отменено / пересмотрено'};
const fail=()=>{throw Error('Некорректная запись реестра наказаний');};
const str=(v,n,required=false)=>{if(typeof v!=='string'||v.length>n||(required&&!v.trim()))fail();return v;};
const id=v=>{if(typeof v!=='string'||!/^[-\w]{8,128}$/.test(v))fail();return v;};
const date=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))fail();return new Date(v).toISOString();};
const arr=(v,n)=>{if(!Array.isArray(v)||v.length>n)fail();return v;};
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const scope=(r,p)=>r.profileId===p.id&&r.project===p.project&&r.server===p.server;
export const registryStatus=r=>r.events.at(-1).state;
export function cleanRegistryRecord(r,profiles){
 if(!r||!['majestic','russia-online'].includes(r.project))fail();
 const p={id:id(r.profileId),project:r.project,server:str(r.server,90,true)};
 if(profiles&&!profiles.some(x=>x.id===p.id&&x.project===p.project))fail();
 const url=C.canonicalThreadUrl(r.url).url;if(new URL(url).hostname!==(p.project==='majestic'?'forum.majestic-rp.ru':'forum.russia.online'))fail();
 if(!['satisfied','partial'].includes(r.decision))fail();
 const evidence=arr(r.evidence,60).map(C.cleanEvidence);if(new Set(evidence.map(x=>x.id)).size!==evidence.length)fail();
 const rules=arr(r.rules,200).map(x=>({id:id(x.id),revision:cleanRevision(x.revision,p.project)}));if(new Set(rules.map(x=>x.id)).size!==rules.length)fail();
 const policy=validatePolicy(r.policy,p.project), snapshotId=id(r.snapshotId), reviewedAt=date(r.reviewedAt);
 // Reuse the existing case validator for player inputs and evidence references.
 const m=C.cleanModeration({version:1,revision:snapshotId,project:p.project,server:p.server,players:r.players,policy:JSON.stringify(policy),status:'draft',history:[],note:r.note??'',updatedAt:reviewedAt},evidence);
 const synthetic=rules.map(x=>({id:x.id,profileId:p.id,project:p.project,server:p.server,archived:false,favorite:false,updatedAt:x.revision.createdAt,activeRevisionId:x.revision.id,revisions:[x.revision]}));
 const result=calculatePunishments(m.players,synthetic,p,policy);if(result.players.some(x=>x.unresolved))fail();result.createdAt=reviewedAt;
 if(!r.result||canonical(r.result)!==canonical(result))fail();
 if(rules.some(x=>!m.players.some(p=>p.items.some(i=>i.ruleId===x.id))))fail();
 const events=arr(r.events,30).map(e=>({state:str(e.state,20,true),at:date(e.at),note:str(e.note,1000)}));
 if(!events.length||events[0].state!=='reviewed')fail();
 for(let i=1;i<events.length;i++){const prev=events[i-1],next=events[i];if(!allowedTransition(prev.state,next.state)||next.at<prev.at||!next.note.trim())fail();}
 const out={id:id(r.id),profileId:p.id,project:p.project,server:p.server,caseId:id(r.caseId),snapshotId,supersedes:r.supersedes==null?null:id(r.supersedes),url,title:str(r.title,240,true),decision:r.decision,reviewedAt,registeredAt:date(r.registeredAt),players:m.players,policy,rules,evidence,note:m.note,decisionText:str(r.decisionText,30000,true),result,events};
 if(bytes(out)>1024*1024)throw Error('Запись реестра превышает 1 МиБ');return out;
}
function allowedTransition(from,to){return from!=='cancelled'&&(to==='cancelled'||from==='reviewed'&&to==='published'||from==='published'&&to==='executed');}
export function validateRegistry(value,profiles){if(!value||value.version!==1)fail();const records=arr(value.records,1000).map(r=>cleanRegistryRecord(r,profiles));const ids=new Set(),keys=new Set(),active=new Set();for(const r of records){const k=r.profileId+':'+r.caseId+':'+r.snapshotId,caseKey=r.profileId+':'+r.caseId;if(ids.has(r.id)||keys.has(k))fail();ids.add(r.id);keys.add(k);if(registryStatus(r)!=='cancelled'){if(active.has(caseKey))fail();active.add(caseKey);}}for(const r of records){if(r.supersedes){const old=records.find(x=>x.id===r.supersedes);if(!old||old.id===r.id||old.caseId!==r.caseId||old.profileId!==r.profileId||old.project!==r.project||old.server!==r.server||registryStatus(old)!=='cancelled'||old.registeredAt>r.registeredAt)fail();}}
 for(const r of records){const chain=new Set([r.id]);let next=r.supersedes;while(next){if(chain.has(next))fail();chain.add(next);next=records.find(x=>x.id===next)?.supersedes;}}
 const out={version:1,records};if(bytes(out)>8*1024*1024)throw Error('Реестр превышает 8 МиБ. Экспортируйте архив.');return out;
}
export function registerDecision(c,p,rows,records,expected){
 assertCaseScope(c,p);const m=c.moderation;if(c.status!=='done'||c.workflow.stage!=='closed'||m?.status!=='reviewed'||!['satisfied','partial'].includes(c.workflow.decision)||!Object.values(c.workflow.checks).every(Boolean)||!c.draft.trim())throw Error('Завершите проверенное рассмотрение с решением о наказании');
 if(m.history[0]?.id!==expected)throw Error('Расчёт изменился. Обновите список жалоб.');
 const existing=records.find(r=>scope(r,p)&&r.caseId===c.id&&r.snapshotId===expected);if(existing)return existing;
 const previous=records.filter(r=>scope(r,p)&&r.caseId===c.id).sort((a,b)=>b.registeredAt.localeCompare(a.registeredAt))[0];if(previous&&registryStatus(previous)!=='cancelled')throw Error('Сначала отмените предыдущую запись реестра с указанием причины');
 const {result}=assertDecisionReady(c,p,rows);if(result.players.some(x=>x.unresolved))throw Error('Расчёт содержит неоднозначности');
 const report=moderationReport(result,m.players,c)+(m.note?'\n\nКомментарий к рассмотрению: '+m.note:'');if(report.trim()!==m.history[0].text)throw Error('Снимок расчёта изменился. Повторите проверку рассмотрения.');
 const selected=new Set(m.players.flatMap(p=>p.items.map(i=>i.ruleId))),refs=new Set(m.players.flatMap(p=>p.items.flatMap(i=>i.evidenceIds)));
 const stamp=new Date().toISOString();return cleanRegistryRecord({id:crypto.randomUUID(),profileId:p.id,project:p.project,server:p.server,caseId:c.id,snapshotId:expected,supersedes:previous?.id??null,url:c.url,title:c.title,decision:c.workflow.decision,reviewedAt:m.history[0].at,registeredAt:stamp,players:m.players,policy:result.policy,result:{...result,createdAt:m.history[0].at},rules:rows.filter(r=>selected.has(r.id)).map(r=>({id:r.id,revision:currentRevision(r)})),evidence:c.evidence.filter(e=>refs.has(e.id)),note:m.note,decisionText:c.draft,events:[{state:'reviewed',at:stamp,note:'Локальная проверка; исполнение не подтверждено'}]},[p]);
}
export function transitionRegistry(r,state,note,expected){if(registryStatus(r)!==expected)throw Error('Запись изменилась. Обновите реестр.');if(!allowedTransition(expected,state)||!String(note??'').trim())throw Error('Недопустимый переход или отсутствует причина');return cleanRegistryRecord({...r,events:[...r.events,{state,at:new Date().toISOString(),note:str(note,1000,true)}]});}
export function filterRegistry(records,p,f={}){const q=String(f.query??'').trim().toLowerCase();return records.filter(r=>scope(r,p)&&(!f.status||registryStatus(r)===f.status)&&(!f.type||r.result.players.some(x=>x.totals.some(t=>t.type===f.type)))&&(!f.from||r.reviewedAt.slice(0,10)>=f.from)&&(!f.to||r.reviewedAt.slice(0,10)<=f.to)&&(!q||[r.title,r.url,r.caseId,...r.players.flatMap(x=>[x.id,x.nickname]),...r.rules.flatMap(x=>[x.revision.code,x.revision.title])].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.registeredAt.localeCompare(a.registeredAt));}
export function exportRegistry(records,format,options={}){
 if(!['csv','json','txt','bbcode'].includes(format))throw Error('Неизвестный формат экспорта');if(!records.length)throw Error('Нет записей для экспорта');
 const {nicknames=false,evidence=false,sources=true}=options;
 const rows=records.map(r=>({id:r.id,caseId:r.caseId,snapshotId:r.snapshotId,supersedes:r.supersedes,project:r.project,server:r.server,thread:r.url,decision:r.decision,reviewedAt:r.reviewedAt,registeredAt:r.registeredAt,history:r.events.map(e=>({state:e.state,at:e.at})),status:registryStatus(r),statusLabel:REGISTRY_STATES[registryStatus(r)],players:r.result.players.map(p=>({id:p.id,...(nicknames?{nickname:p.nickname}:{}),sanctions:p.totals.map(t=>({type:t.type,amount:t.amount,unit:t.unit})),violations:p.entries.map(e=>({code:e.code,title:e.title,revisionId:e.revisionId,...(sources?{source:e.source}:{})})),...(evidence?{evidence:r.evidence.filter(e=>r.players.find(x=>x.id===p.id).items.some(i=>i.evidenceIds.includes(e.id))).map(e=>({title:e.title,url:e.url,seconds:e.seconds,...(e.kind==='file'?{sha256:e.sha256,size:e.size,mime:e.mime,vaultId:e.vaultId}:{})}))}:{})})),policy:{name:r.policy.name,mode:r.policy.mode,...(sources?{source:r.policy.source}:{})}}));
 if(format==='json')return JSON.stringify({format:'majestic-punishment-export',version:1,records:rows},null,2);
 const flat=rows.flatMap(r=>r.players.flatMap(p=>p.sanctions.map(t=>[r.id,r.caseId,r.project,r.server,r.reviewedAt,r.status,r.decision,r.policy.name,r.snapshotId,r.thread,p.id,...(nicknames?[p.nickname]:[]),t.type,t.amount,t.unit,p.violations.map(v=>v.code+' '+v.title).join('; '),...(sources?[p.violations.map(v=>v.source).join('; ')]:[]),...(evidence?[p.evidence.map(e=>e.title+' '+(e.kind==='file'?'SHA-256 '+e.sha256:e.url)+(e.seconds==null?'':' @'+e.seconds+'s')).join('; ')]:[])])));
 if(format==='csv'){const cell=v=>{let s=String(v??'');if(/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/u.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return '\uFEFF'+[['record_id','case_id','project','server','reviewed_at','status','decision','policy','snapshot_id','thread','player_id',...(nicknames?['nickname']:[]),'sanction','amount','unit','violations',...(sources?['sources']:[]),...(evidence?['evidence']:[])],...flat].map(r=>r.map(cell).join(',')).join('\r\n');}
 const text=rows.map(r=>[`${r.statusLabel} · ${r.server} · ${r.reviewedAt}`,r.thread,`Решение: ${C.DECISION_KINDS[r.decision]} · Политика: ${r.policy.name}`, ...r.players.map(p=>[`Игрок: ${p.id}${p.nickname?' — '+p.nickname:''}`,p.violations.map(v=>v.code+' '+v.title+(v.source?' · '+v.source:'')).join('\n'),p.sanctions.map(t=>SANCTIONS[t.type]+' '+t.amount+(t.unit==='none'?' шт.':' '+UNITS[t.unit])).join('; '),...(evidence?p.evidence.map(e=>e.title+' '+(e.kind==='file'?'SHA-256 '+e.sha256:e.url)+(e.seconds==null?'':' @'+e.seconds+'s')):[])].join('\n'))].join('\n')).join('\n\n');return format==='bbcode'?'[b]Локальный реестр наказаний[/b]\n'+text.replace(/\[/g,'［').replace(/\]/g,'］'):'Локальный реестр наказаний\n'+text;
}
