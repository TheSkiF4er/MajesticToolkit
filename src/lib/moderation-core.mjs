import './complaints-core.js';
import './forum-core.js';
import {calculatePunishments,eligibleRules,validatePolicy,calculationText} from './punishment-calculator.mjs';
import {selectSanction} from './punishment-overlay-store.mjs';
import {currentRevision,SANCTIONS,UNITS} from './rules-core.mjs';
const C=globalThis.RPNComplaints,F=globalThis.RPNForumCore;
const now=()=>new Date().toISOString();
export function assertCaseScope(c,p){
 const host=p?.project==='majestic'?'forum.majestic-rp.ru':p?.project==='russia-online'?'forum.russia.online':null;
 if(!host||c.profileId!==p.id||new URL(c.url).hostname!==host)throw Error('Жалоба не принадлежит активному профилю и проекту');
 if(c.moderation&&(c.moderation.project!==p.project||c.moderation.server!==p.server))throw Error('Сервер жалобы изменился. Переключитесь на исходный сервер.');
}
export function moderationReport(result,players,c){
 const lines=['Доказательства и замечания по нарушениям:'];
 for(const [i,p] of players.entries())for(const [j,item] of p.items.entries()){
  const entry=result.players[i].entries[j];lines.push(`${p.id} · ${entry.code} — ${entry.title}`);
  for(const id of item.evidenceIds){const e=c.evidence.find(e=>e.id===id);lines.push(`${e.title}: ${e.url}${e.seconds===null?'':' (таймкод '+C.timecode(e.seconds)+')'}`);}
  if(!item.evidenceIds.length)lines.push('Доказательства не привязаны.');if(item.note)lines.push('Комментарий: '+item.note);
 }
 return calculationText(result)+'\n\n'+lines.join('\n');
}
export function saveModerationRecord(c,p,input,rows){
 assertCaseScope(c,p);if(c.status==='done')throw Error('Жалоба завершена. Откройте рассмотрение заново.');
 if((c.moderation?.revision??null)!==input.expected)throw Error('Рассмотрение изменилось в другой вкладке. Откройте жалобу заново.');
 const policy=validatePolicy(input.policy,p.project),stamp=now();
 let record=C.cleanModeration({version:1,revision:crypto.randomUUID(),project:p.project,server:p.server,players:input.players,policy:JSON.stringify(policy),status:'draft',history:c.moderation?.history??[],note:input.note??'',draftFormat:c.moderation?.draftFormat??'plain',decisionSnapshotId:c.moderation?.decisionSnapshotId??null,updatedAt:stamp},c.evidence);
 const rules=eligibleRules(rows,p);
 for(const player of record.players)for(const item of player.items){const rule=rules.find(r=>r.id===item.ruleId);if(!rule)throw Error('Правило недоступно');selectSanction(rule,item.revisionId,item.index,item.amount);}
 if(input.calculate===true){
  const result=calculatePunishments(record.players,rules,p,policy);
  if(input.review===true&&result.players.some(x=>x.unresolved))throw Error('Сначала разрешите неоднозначности расчёта');
  const status=input.review===true?'reviewed':'calculated';
  const snapshot={id:crypto.randomUUID(),at:stamp,text:moderationReport(result,record.players,c)+(record.note?'\n\nКомментарий к рассмотрению: '+record.note:''),status};
  const history=[snapshot,...record.history].slice(0,5);while(JSON.stringify({...record,history}).length>300000&&history.length>1)history.pop();
  record=C.cleanModeration({...record,status,history},c.evidence);
 }
 return C.cleanCase({...c,moderation:record,updatedAt:stamp});
}
// Recalculate on decision creation: old snapshots remain readable, but stale rules cannot create a new decision.
export function decisionContext(c,p,rows){
 assertCaseScope(c,p);const m=c.moderation;if(!m||m.status==='draft')throw Error('Сначала сохраните расчёт жалобы');
 const result=calculatePunishments(m.players,rows,p,JSON.parse(m.policy));
 const entries=result.players.flatMap(x=>x.entries),rules=eligibleRules(rows,p);
 const context={nickname:result.players.map(x=>x.nickname||x.id).join(', '),player_id:result.players.map(x=>x.id).join(', '),rule_code:entries.map(e=>e.code).join(', '),rule_title:entries.map(e=>e.title).join('; '),rule_text:entries.map(e=>currentRevision(rules.find(r=>r.id===e.ruleId)).text).join('\n'),rule_source:entries.map(e=>e.source).join('\n'),punishment:result.players.map(x=>x.id+': '+x.totals.map(t=>SANCTIONS[t.type]+' '+t.amount+' '+UNITS[t.unit]).join('; ')).join('\n'),punishment_reason:m.note||entries.map(e=>e.title).join('; '),evidence:[...new Set(m.players.flatMap(p=>p.items.flatMap(i=>i.evidenceIds)))].map(id=>{const e=c.evidence.find(x=>x.id===id);return e.title+' — '+e.url;}).join('\n'),decision:C.DECISION_KINDS[c.workflow.decision],server:p.server,project:p.name,thread:c.title,url:c.url,date:now().slice(0,10),time:now().slice(11,16),reason:m.note,selection:''};
 return {context,result,report:moderationReport(result,m.players,c)};
}
export function prepareDecision(c,p,rows,template,supplied={}){
 if(c.status==='done')throw Error('Жалоба завершена');
 const {context,report}=decisionContext(c,p,rows);let text,format='plain';
 if(template){if(template.profileId!=='*'&&template.profileId!==p.id)throw Error('Шаблон другого профиля');format=template.format;const extra=Object.fromEntries(Object.entries(supplied).filter(([k])=>!Object.hasOwn(context,k)));for(const k of F.variableNames(template.text))if(Object.hasOwn(context,k)&&context[k].length>2000)throw Error('Значение '+k+' слишком длинное. Используйте стандартный черновик.');text=F.renderTemplate(template,context,extra);if(F.variableNames(text).length)throw Error('Остались незаполненные переменные');}
 else text=C.draftDecision(c);
 // Append complete calculation/evidence even if the template only includes some variables.
 const suffix='\n\n'+report+'\n\nРезультат локального рассмотрения; публикация и назначение наказания только вручную.';
 text+=format==='bbcode'?suffix.replace(/\[/g,'［').replace(/\]/g,'］'):suffix;
 if(text.length>30000)throw Error('Черновик превышает 30 000 символов. Уменьшите расчёт.');return {text,format};
}

export function assertDecisionReady(c,p,rows){
 if(!c.moderation)return;
 if(c.moderation.status==='draft'||!c.moderation.history[0]||c.moderation.decisionSnapshotId!==c.moderation.history[0].id)throw Error('Подготовьте черновик решения для актуального расчёта');
 return decisionContext(c,p,rows);
}
