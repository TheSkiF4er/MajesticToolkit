/** User-mediated Rules & Knowledge AI: searches local stores, never sends silently. */
import {listRules} from '../lib/rules-store.mjs';
import {listSources} from '../lib/source-library.mjs';
import {findAIRulesSources,confirmAIRulesSelection,rulesWireSources,MAX_RULES_SOURCES,markUnsupportedCitations} from '../lib/ai-rules-core.mjs';
import {assertQuestion,getAISettings,hasAIPermission,streamRulesAI} from '../lib/ai-connection.mjs';
let pending=null,abort=null;
export function prefillAIRules(kind,id,query){if(!['rule','source'].includes(kind)||typeof id!=='string')throw Error('Неверный контекст AI');pending={kind,id,query:String(query||'').slice(0,5000)};}
export function stopRulesAI(){abort?.abort();abort=null;pending=null;}
export function rulesAISection(){return `<section class="card stack" id="ai-rules-root" aria-label="AI по правилам и источникам">
 <h3>Rules & Knowledge AI · ответы по источникам</h3>
 <p class="subtle">Локальный поиск по выбранному профилю. По умолчанию используются только редакции, проверенные вами. Модель получает исключительно выбранные выдержки после просмотра полного текста запроса и отдельного согласия. Применимость правил и санкций проверяйте по первоисточнику.</p>
 <form id="ai-rules-search-form" class="stack"><label class="field">Вопрос о правилах или сохранённых статьях<textarea id="ai-rules-question" rows="3" maxlength="5000" required placeholder="Например: какое наказание указано за DM?"></textarea></label>
 <div class="row"><label class="check"><input type="checkbox" id="ai-rules-unverified">Включить непроверенные источники</label><label class="check"><input type="checkbox" id="ai-rules-history">Искать в предыдущих редакциях</label></div>
 <button class="button secondary" type="submit" id="ai-rules-search">Найти локальные источники</button></form>
 <p id="ai-rules-status" class="subtle" role="status"></p><div id="ai-rules-results" class="stack"></div>
 <form id="ai-rules-send-form" class="stack" hidden><h4>Точный предпросмотр передачи</h4><p class="subtle">Ни профиль, ни полная библиотека, ни заметки к источникам автоматически не передаются. В тексте цитат могут быть персональные данные: проверьте их перед отправкой.</p>
 <pre id="ai-rules-preview" class="ai-preview"></pre>
 <label class="check"><input type="checkbox" id="ai-rules-consent" required>Подтверждаю отправку показанного вопроса и выбранных фрагментов через локальный шлюз в OpenAI API.</label>
 <div class="row"><button type="submit" class="button primary" id="ai-rules-send">Спросить AI по источникам</button><button type="button" class="button secondary" id="ai-rules-cancel" disabled>Отменить запрос</button></div></form>
 <div id="ai-rules-answer" class="stack" aria-live="polite"></div>
 </section>`;}
const element=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
export async function mountRulesAI(root,state,feedback,{getToken}={}){
 if(!root)return;
 const profile=state.profiles?.find(p=>p.id===state.activeProfileId);
 if(!profile)throw Error('Профиль не найден');
 const q=root.querySelector('#ai-rules-question'),unverified=root.querySelector('#ai-rules-unverified'),history=root.querySelector('#ai-rules-history'),results=root.querySelector('#ai-rules-results'),status=root.querySelector('#ai-rules-status'),sendForm=root.querySelector('#ai-rules-send-form'),preview=root.querySelector('#ai-rules-preview'),consent=root.querySelector('#ai-rules-consent'),answer=root.querySelector('#ai-rules-answer'),send=root.querySelector('#ai-rules-send'),cancel=root.querySelector('#ai-rules-cancel');
 const preset=pending;pending=null;if(preset)q.value=preset.query;
 let candidates=[],selected=new Set(),snapshot='',busy=false;
 function invalidate(){consent.checked=false;snapshot='';sendForm.hidden=true;preview.textContent='';}
 const selectedSources=()=>candidates.filter(s=>selected.has(s.key)).slice(0,MAX_RULES_SOURCES);
 function drawPreview(){const chosen=selectedSources();invalidate();if(!chosen.length)return;
  const payload={question:assertQuestion(q.value),mode:'rules',sources:rulesWireSources(chosen)};
  snapshot=JSON.stringify(payload);preview.textContent=JSON.stringify(payload,null,2);sendForm.hidden=false;
 }
 function drawCandidates(){results.replaceChildren();if(!candidates.length){results.append(element('p','Подходящих источников нет. Проверьте редакции или уточните вопрос.','subtle'));return;}
  results.append(element('p',`Найдено ${candidates.length}. Выберите до ${MAX_RULES_SOURCES} записей (клик по карточке не отправляет данные).`,'subtle'));
  for(const x of candidates){const card=element('article',undefined,'card stack');const head=element('div',undefined,'row');const label=element('label',undefined,'check');const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(x.key);input.setAttribute('aria-label',`Использовать источник ${x.title}`);
   input.addEventListener('change',()=>{if(input.checked&&selected.size>=MAX_RULES_SOURCES){input.checked=false;status.textContent=`Можно выбрать не больше ${MAX_RULES_SOURCES} источников`;return;}if(input.checked)selected.add(x.key);else selected.delete(x.key);try{drawPreview();status.textContent=`Выбрано: ${selected.size}`;}catch(err){invalidate();status.textContent=err.message;}});
   label.append(input,document.createTextNode(' '+x.title));head.append(label);
   const link=element('a','Первоисточник ↗');link.href=x.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';head.append(link);card.append(head);
   card.append(element('p',`${x.kind==='rule'?'Правило':'Сохранённая статья'} · редакция ${x.revisionId} · ${x.capturedAt.slice(0,10)} · ${x.verification==='reviewed'?'проверено пользователем':'не проверено'}${x.historical?' · историческая':''}`,'subtle'));
   const excerpt=element('pre',x.text,'ai-preview');card.append(excerpt);results.append(card);
  }
 }
 async function search(){if(busy)return;invalidate();answer.replaceChildren();status.textContent='Поиск в локальной базе…';try{const [rules,sources]=await Promise.all([listRules(),listSources()]);if(!root.isConnected)return;
   candidates=findAIRulesSources(profile,assertQuestion(q.value),rules,sources,{includeUnverified:unverified.checked,includeHistory:history.checked,limit:15});selected=new Set();if(preset){const match=candidates.find(x=>x.kind===preset.kind&&x.id===preset.id);if(match)selected.add(match.key);}drawCandidates();drawPreview();status.textContent=`Найдено: ${candidates.length}. Данные остаются на устройстве до подтверждения.`;
  }catch(err){status.textContent=err.message;results.replaceChildren();}}
 root.querySelector('#ai-rules-search-form').addEventListener('submit',event=>{event.preventDefault();void search();});
 for(const field of [q,unverified,history])field.addEventListener('input',()=>{invalidate();if(candidates.length){status.textContent='Условия изменились. Найдите источники повторно.';candidates=[];selected.clear();results.replaceChildren();}});
 cancel.addEventListener('click',()=>{abort?.abort();status.textContent='Запрос отменён';});
 sendForm.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;send.disabled=true;cancel.disabled=false;const profileId=state.activeProfileId;let ctl;
  try{
   if(!consent.checked||!snapshot)throw Error('Подтвердите предпросмотр перед отправкой');
   if(!await getAISettings(profileId).then(s=>s.enabled)||!await hasAIPermission())throw Error('Облачный AI отключён или нет разрешения');
   if(!root.isConnected)throw Error('Раздел AI закрыт');
   const token=getToken?.();if(!token)throw Error('Введите токен шлюза в настройках AI выше');
   const [rules,sources]=await Promise.all([listRules(),listSources()]);const checked=await confirmAIRulesSelection(profile,selectedSources(),rules,sources,{includeUnverified:unverified.checked});
   const wire={question:assertQuestion(q.value),mode:'rules',sources:rulesWireSources(checked)};
   if(JSON.stringify(wire)!==snapshot)throw Error('Источники или вопрос изменились. Подтвердите передачу заново.');
   if(!root.isConnected)throw Error('Раздел AI закрыт');
   ctl=new AbortController();abort=ctl;status.textContent='OpenAI формирует ответ…';answer.replaceChildren();
   const note=element('p','Предварительный AI-ответ: проверяйте каждое утверждение по перечисленным ниже источникам.','subtle');const out=element('pre','','ai-response');answer.append(note,out);let usage=null;
   const full=await streamRulesAI(wire.question,token,wire.sources,{signal:ctl.signal,onDelta:(_chunk,all)=>{if(root.isConnected)out.textContent=all;},onComplete:payload=>{usage=payload.usage;}});
   const inspected=markUnsupportedCitations(full,checked.length);out.textContent=inspected.text;
   if(inspected.invalid)answer.append(element('p','В ответе были ссылки на несуществующие номера источников — они помечены как неподтверждённые.','subtle'));
   const refs=element('div',undefined,'stack');refs.append(element('h4','Использованные источники из локальной базы'));
   checked.forEach((s,i)=>{const row=element('div',undefined,'row');row.append(element('strong',`[${i+1}] ${s.title} · ${s.revisionId} · ${s.verification==='reviewed'?'проверено вами':'не проверено'}`));const link=element('a','Открыть первоисточник ↗');link.href=s.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';row.append(link);refs.append(row);});answer.append(refs);
   status.textContent=`Ответ получен. Входящие токены: ${usage?.inputTokens??'—'}, выходящие: ${usage?.outputTokens??'—'}.`;
   consent.checked=false;
  }catch(err){status.textContent=err.name==='AbortError'?'Запрос отменён':'Ошибка AI: '+err.message;feedback?.(err.message,err.name!=='AbortError');}
  finally{if(abort===ctl)abort=null;busy=false;if(root.isConnected){send.disabled=false;cancel.disabled=true;}}
 });
 if(preset&&q.value)await search();
}
