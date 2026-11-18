/** Explicitly scoped, consent-driven complaint analysis. No media bytes or network. */
import './complaints-core.js';
import {currentRevision,formatSanction} from './rules-core.mjs';
const C=globalThis.RPNComplaints;
const trim=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const MAX_EVIDENCE=6,MAX_EVENTS=12,MAX_RULES=5;
export function complaintContext(profile,raw,rules=[],options={}){
 if(!profile||!raw||raw.profileId!==profile.id)throw Error('Жалоба другого профиля');
 const c=C.cleanCase(raw);
 const host=new URL(c.url).hostname;
 if(host!==(profile.project==='majestic'?'forum.majestic-rp.ru':'forum.russia.online'))throw Error('Жалоба другого проекта');
 const opts={includeNotes:options.includeNotes===true,includeDraft:options.includeDraft===true,includeNames:options.includeNames===true,includeLinks:options.includeLinks===true};
 const evIds=new Set(options.evidenceIds??[]),eventIds=new Set(options.eventIds??[]),ruleIds=new Set(options.ruleIds??[]);
 for(const [value,limit,label] of [[evIds,MAX_EVIDENCE,'доказательств'],[eventIds,MAX_EVENTS,'событий'],[ruleIds,MAX_RULES,'правил']])if(value.size>limit)throw Error('Слишком много выбранных '+label);
 for(const id of evIds)if(!c.evidence.some(x=>x.id===id))throw Error('Доказательство больше недоступно');
 for(const id of eventIds)if(!c.timeline.some(x=>x.id===id))throw Error('Событие больше недоступно');
 if(!Array.isArray(rules))throw Error('Некорректная база правил');
 const ruleRows=[];
 for(const id of ruleIds){const r=rules.find(x=>x.id===id&&x.profileId===profile.id&&x.project===profile.project&&!x.archived&&(!x.server||x.server===profile.server));
  if(!r)throw Error('Выбранное правило другого профиля или недоступно');
  const rev=currentRevision(r);if(!rev)throw Error('Редакция правила недоступна');
  ruleRows.push({ref:r.id,revisionId:rev.id,code:trim(rev.code,80),title:trim(rev.title,200),text:trim(rev.text,1200),conditions:trim(rev.conditions,350),sanctions:trim(rev.sanctions?.map(formatSanction).join('; ')||'',500),verification:rev.verification,sourceUrl:rev.sourceUrl});
 }
 const evidence=c.evidence.filter(x=>evIds.has(x.id)).map(x=>({ref:x.id,type:x.kind==='file'?'local-file':'link',title:trim(x.title,180),description:trim(x.note,380),seconds:x.seconds??null,...(opts.includeLinks&&x.url?{url:trim(x.url,800)}:{})}));
 const events=c.timeline.filter(x=>eventIds.has(x.id)).map(x=>({ref:x.id,title:trim(x.title,200),description:trim(x.description,550),eventTime:x.occurredAt??null,videoStart:x.startSeconds??null,videoEnd:x.endSeconds??null,evidenceRefs:x.evidenceIds.filter(id=>evIds.has(id)),...(opts.includeNames?{participants:x.participants.slice(0,8)}:{})}));
 const context={caseRef:c.id,caseVersion:c.updatedAt,caseStatus:c.status,caseTitle:trim(c.title,200),project:profile.project,server:trim(profile.server,80),decisionType:c.workflow.decision,evidence,events,rules:ruleRows,
  ...(opts.includeNotes?{caseNotes:trim(c.note,1200)}:{}),...(opts.includeDraft?{existingDraft:trim(c.draft,1400)}:{})};
 if(opts.includeNames)context.participants=(c.moderation?.players??[]).slice(0,8).map(p=>({id:trim(p.playerId??p.id,80),nickname:trim(p.nickname??p.name,80)}));
 const size=JSON.stringify(context).length;if(size>16000)throw Error('Материалов слишком много для одного AI-запроса');
 return context;
}
export function complaintWire(question,context){
 if(typeof question!=='string'||!question.trim()||question.length>2000)throw Error('Введите вопрос до 2000 символов');
 if(!context||!Array.isArray(context.evidence)||!Array.isArray(context.events)||!Array.isArray(context.rules))throw Error('Выберите материалы для анализа');
 if(!context.evidence.length&&!context.events.length&&!context.rules.length&&!context.caseNotes)throw Error('Выберите доказательства, события, правила или заметку');
 return {mode:'complaint',question:question.trim(),case:context};
}
const text=(value,max,name)=>{if(typeof value!=='string'||value.length>max)throw Error('Некорректное поле анализа: '+name);return value.trim();};
const arr=(data,name,max)=>{if(!Array.isArray(data)||data.length>max)throw Error('Некорректный раздел анализа: '+name);return data;};
const knownRefs=(ids,known,name)=>{const values=arr(ids,name,12);if(!values.every(x=>typeof x==='string'&&known.has(x))||new Set(values).size!==values.length)throw Error('AI сослался на отсутствующий материал: '+name);return values;};
export function validateComplaintAnalysis(raw,context){
 let source=raw;
 if(typeof raw==='string'){
  const str=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{source=JSON.parse(str);}catch{throw Error('AI вернул неструктурированный ответ. Проверьте запрос и повторите анализ.');}
 }
 if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Неверный AI-отчёт');
 const e=new Set(context.evidence.map(x=>x.ref)),v=new Set(context.events.map(x=>x.ref)),r=new Set(context.rules.map(x=>x.ref));
 if(source.requiresHumanReview!==true)throw Error('AI-отчёт должен требовать проверки человеком');
 const facts=arr(source.facts,'facts',12).map(x=>({text:text(x?.text,700,'fact'),evidenceRefs:knownRefs(x?.evidenceRefs,e,'evidenceRefs'),eventRefs:knownRefs(x?.eventRefs,v,'eventRefs')}));
 const possibleViolations=arr(source.possibleViolations,'possibleViolations',10).map(x=>({ruleRef:knownRefs(x?.ruleRef?[x.ruleRef]:[],r,'ruleRef')[0]??'',explanation:text(x?.explanation,700,'explanation'),evidenceRefs:knownRefs(x?.evidenceRefs,e,'evidenceRefs'),eventRefs:knownRefs(x?.eventRefs,v,'eventRefs')}));
 const contradictions=arr(source.contradictions,'contradictions',10).map(x=>text(x,500,'contradiction'));
 const missingEvidence=arr(source.missingEvidence,'missingEvidence',10).map(x=>text(x,500,'missingEvidence'));
 const questionsForReview=arr(source.questionsForReview,'questionsForReview',10).map(x=>text(x,500,'questionsForReview'));
 const result={summary:text(source.summary,2500,'summary'),facts,possibleViolations,contradictions,missingEvidence,questionsForReview,draftResponse:text(source.draftResponse,5500,'draftResponse'),requiresHumanReview:true};
 if(!result.summary)throw Error('Отчёт не содержит выводов');
 if(JSON.stringify(result).length>20000)throw Error('AI-отчёт слишком велик');
 return result;
}
export function complaintAnalysisText(report,context){
 const data=validateComplaintAnalysis(report,context);
 const lines=['ПРЕДВАРИТЕЛЬНЫЙ AI-АНАЛИЗ — требуется самостоятельная проверка','Жалоба: '+context.caseRef,'',data.summary,''];
 const list=(name,rows)=>{lines.push(name);for(const x of rows)lines.push('• '+x);lines.push('');};
 list('Факты (только по предоставленному контексту)',data.facts.map(x=>x.text+` [доказательства: ${x.evidenceRefs.join(', ')||'нет'}; события: ${x.eventRefs.join(', ')||'нет'}]`));
 list('Возможные нарушения — не вывод о виновности',data.possibleViolations.map(x=>`${x.ruleRef||'не определено'}: ${x.explanation} [доказательства: ${x.evidenceRefs.join(', ')||'нет'}]`));
 list('Противоречия',data.contradictions);list('Недостающие материалы',data.missingEvidence);list('Вопросы для проверки',data.questionsForReview);
 lines.push('ПРЕДЛАГАЕМЫЙ ЧЕРНОВИК (не опубликован):',data.draftResponse,'','AI не проверял внешние URL или файлы, не отправленные в запрос. Проверить все выводы по оригиналам.');
 return lines.join('\n').slice(0,25000);
}
