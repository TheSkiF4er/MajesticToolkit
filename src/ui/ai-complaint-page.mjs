/** Real, user-mediated complaint review; no automatic dispatch or forum changes. */
import {api} from '../lib/browser.mjs';
import {listCases,getCase} from '../lib/complaints-store.mjs';
import {listRules} from '../lib/rules-store.mjs';
import {complaintContext,complaintWire,validateComplaintAnalysis,complaintAnalysisText} from '../lib/ai-complaint-core.mjs';
import {getAISettings,hasAIPermission,streamComplaintAI} from '../lib/ai-connection.mjs';
let activeAbort=null;
export function stopComplaintAI(){activeAbort?.abort();activeAbort=null;}
export function complaintAISection(){return `<section class="card stack" id="ai-complaint-root" aria-label="AI Complaint Analysis">
 <h3>AI Complaint Analysis · предварительный разбор жалобы</h3>
 <p class="subtle">Выберите конкретное дело и материалы. Ссылки, названия и заметки не означают, что AI просмотрел видео или файл. Никаких вложений или сообщений форума автоматически не отправляется. AI не определяет виновность, не назначает санкции и не публикует решения.</p>
 <label class="field">Жалоба текущего профиля<select id="ai-case-select" aria-label="Выбрать жалобу"><option value="">— Выберите дело —</option></select></label>
 <div id="ai-case-details" class="stack"></div>
 <div class="grid"><div><h4>Доказательства (до 6)</h4><div id="ai-case-evidence" class="stack"></div></div><div><h4>События (до 12)</h4><div id="ai-case-events" class="stack"></div></div></div>
 <h4>Правила текущего проекта (до 5)</h4><label class="field">Найти правило по коду или названию<input id="ai-case-rule-filter" type="search" maxlength="120" placeholder="Номер или название правила"></label><div id="ai-case-rules" class="stack"></div>
 <div class="row"><label class="check"><input id="ai-case-notes" type="checkbox">Включить заметку жалобы</label><label class="check"><input id="ai-case-draft" type="checkbox">Включить существующий черновик</label></div>
 <div class="row"><label class="check"><input id="ai-case-names" type="checkbox">Включить имена/ID участников</label><label class="check"><input id="ai-case-links" type="checkbox">Включить URL доказательств</label></div>
 <form class="stack" id="ai-case-form"><label class="field">Вопрос / задача для анализа<textarea id="ai-case-question" maxlength="2000" rows="3" required>Проанализируй предоставленные материалы жалобы. Отдели факты от предположений, найди противоречия, возможные применимые правила и недостающие доказательства. Предложи вопросы для проверки и предварительный черновик ответа.</textarea></label>
 <button class="button secondary" id="ai-case-prepare" type="button">Подготовить предпросмотр</button>
 <div id="ai-case-send-panel" class="stack" hidden><h4>Точный JSON, передаваемый OpenAI</h4><pre id="ai-case-preview" class="ai-preview"></pre><label class="check"><input id="ai-case-consent" type="checkbox" required>Я проверил текст и материалы и разрешаю передать только показанные данные в OpenAI через локальный шлюз.</label><div class="row"><button id="ai-case-send" class="button primary" type="submit">Анализировать с AI</button><button id="ai-case-cancel" class="button secondary" type="button" disabled>Отменить</button></div></div></form>
 <p id="ai-case-status" role="status" class="subtle"></p><div id="ai-case-answer" class="stack" aria-live="polite"></div>
 </section>`;}
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
export async function mountComplaintAI(root,state,feedback,{getToken}={}){
 if(!root)return;const profile=state.profiles.find(x=>x.id===state.activeProfileId);if(!profile)return;
 const select=root.querySelector('#ai-case-select'),details=root.querySelector('#ai-case-details'),eBox=root.querySelector('#ai-case-evidence'),tBox=root.querySelector('#ai-case-events'),rBox=root.querySelector('#ai-case-rules'),form=root.querySelector('#ai-case-form'),panel=root.querySelector('#ai-case-send-panel'),preview=root.querySelector('#ai-case-preview'),consent=root.querySelector('#ai-case-consent'),status=root.querySelector('#ai-case-status'),answer=root.querySelector('#ai-case-answer'),send=root.querySelector('#ai-case-send'),cancel=root.querySelector('#ai-case-cancel');
 let cases=[],rules=[],c=null,snapshot='',wire=null,report=null,busy=false,availableRules=[],selectedRules=new Set();
 try{[cases,rules]=await Promise.all([listCases(),listRules()]);}catch(err){status.textContent='Ошибка чтения данных: '+err.message;return;}
 if(!root.isConnected||state.activeProfileId!==profile.id)return;
 cases=cases.filter(x=>x.profileId===profile.id&&new URL(x.url).hostname===(profile.project==='majestic'?'forum.majestic-rp.ru':'forum.russia.online'));
 for(const item of cases){const opt=node('option',`${item.title} · ${item.status}`);opt.value=item.id;select.append(opt);}
 const defaultCase=new URLSearchParams(location.search).get('aiCase');if(defaultCase&&cases.some(x=>x.id===defaultCase))select.value=defaultCase;
 const invalidate=()=>{snapshot='';wire=null;report=null;consent.checked=false;panel.hidden=true;preview.textContent='';answer.replaceChildren();};
 const checked=(container)=>container===rBox?[...selectedRules]:[...container.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);
 function addBoxes(container,items,label,limit){container.replaceChildren();if(!items.length){container.append(node('p','Нет доступных материалов','subtle'));return;}for(const item of items.slice(0,limit*8)){const labelEl=node('label',undefined,'check'),input=node('input');input.type='checkbox';input.value=item.id;input.setAttribute('aria-label',`${label}: ${item.title}`);input.addEventListener('change',()=>{if(checked(container).length>limit){input.checked=false;status.textContent=`Лимит: ${limit} записей`;}invalidate();});labelEl.append(input,document.createTextNode(' '+item.title.slice(0,125)));container.append(labelEl);}}
 function showRules(){rBox.replaceChildren();const query=root.querySelector('#ai-case-rule-filter').value.trim().toLocaleLowerCase('ru');const found=availableRules.filter(x=>(x.title+' '+x.code).toLocaleLowerCase('ru').includes(query));
  if(!found.length){rBox.append(node('p','Правила не найдены','subtle'));return;}
  for(const item of found.slice(0,60)){
   const row=node('label',undefined,'check'),input=node('input');input.type='checkbox';input.value=item.id;input.checked=selectedRules.has(item.id);input.setAttribute('aria-label','Правило: '+item.title);input.addEventListener('change',()=>{if(input.checked){if(selectedRules.size>=5){input.checked=false;status.textContent='Можно выбрать максимум 5 правил';return;}selectedRules.add(item.id);}else selectedRules.delete(item.id);invalidate();});row.append(input,document.createTextNode(' '+item.code+' — '+item.title));rBox.append(row);
  }
 }
 root.querySelector('#ai-case-rule-filter').addEventListener('input',()=>{showRules();invalidate();});
 async function loadCase(){invalidate();selectedRules.clear();availableRules=[];root.querySelector('#ai-case-rule-filter').value='';c=cases.find(x=>x.id===select.value)||null;details.replaceChildren();eBox.replaceChildren();tBox.replaceChildren();rBox.replaceChildren();if(!c){status.textContent='Выберите жалобу';return;}
  details.append(node('p',`${c.title} · ${c.status} · ${c.evidence.length} доказательств · ${c.timeline.length} событий`,'subtle'));
  addBoxes(eBox,c.evidence,'Доказательство',6);addBoxes(tBox,c.timeline,'Событие',12);
  const active=rules.filter(x=>x.profileId===profile.id&&x.project===profile.project&&!x.archived&&(!x.server||x.server===profile.server));
  const used=new Set((c.moderation?.players||[]).flatMap(p=>p.items.map(i=>i.ruleId)));
  active.sort((a,b)=>Number(used.has(b.id))-Number(used.has(a.id)));
  availableRules=active.map(r=>({id:r.id,code:r.revisions.find(x=>x.id===r.activeRevisionId)?.code||'',title:r.revisions.find(x=>x.id===r.activeRevisionId)?.title||'Правило'}));showRules();
  status.textContent='Отметьте только необходимые материалы и проверьте настройки приватности.';
 }
 select.addEventListener('change',()=>{void loadCase();});
 for(const selector of ['#ai-case-notes','#ai-case-draft','#ai-case-names','#ai-case-links','#ai-case-question'])root.querySelector(selector).addEventListener('input',invalidate);
 async function freshContext(){if(!c)throw Error('Выберите жалобу');const latest=await getCase(c.id);if(latest.profileId!==profile.id||latest.updatedAt!==c.updatedAt)throw Error('Жалоба изменена. Повторно выберите дело и материалы.');
  const currentRules=await listRules();return complaintContext(profile,latest,currentRules,{evidenceIds:checked(eBox),eventIds:checked(tBox),ruleIds:checked(rBox),includeNotes:root.querySelector('#ai-case-notes').checked,includeDraft:root.querySelector('#ai-case-draft').checked,includeNames:root.querySelector('#ai-case-names').checked,includeLinks:root.querySelector('#ai-case-links').checked});}
 root.querySelector('#ai-case-prepare').addEventListener('click',async()=>{try{const ctx=await freshContext();wire=complaintWire(root.querySelector('#ai-case-question').value,ctx);snapshot=JSON.stringify(wire);preview.textContent=JSON.stringify(wire,null,2);panel.hidden=false;consent.checked=false;answer.replaceChildren();status.textContent='Просмотрите полный JSON. Текст источников недоверенный; файлы не отправляются.';}catch(err){invalidate();status.textContent=err.message;}});
 cancel.addEventListener('click',()=>{activeAbort?.abort();status.textContent='Запрос отменён';});
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;send.disabled=true;cancel.disabled=false;let ctl;
  try{
   if(!consent.checked||!snapshot||!wire)throw Error('Требуется отдельное согласие после предпросмотра');
   if(!await getAISettings(profile.id).then(x=>x.enabled)||!await hasAIPermission())throw Error('Включите AI и разрешите шлюз');
   if(!root.isConnected||state.activeProfileId!==profile.id)throw Error('Профиль или раздел изменился');
   const token=getToken?.();if(!token)throw Error('Введите токен шлюза в AI Connection');
   const context=await freshContext();const payload=complaintWire(root.querySelector('#ai-case-question').value,context);
   if(JSON.stringify(payload)!==snapshot)throw Error('Материалы изменились, подготовьте предпросмотр заново');
   ctl=new AbortController();activeAbort=ctl;answer.replaceChildren();const text=node('pre','','ai-response');answer.append(node('p','AI отвечает… Предварительный отчёт.','subtle'),text);status.textContent='Запрос отправлен после согласия.';
   const raw=await streamComplaintAI(payload.question,token,payload.case,{signal:ctl.signal,onDelta:(_chunk,full)=>{if(root.isConnected)text.textContent=full;}});
   report=validateComplaintAnalysis(raw,payload.case);
   const formatted=complaintAnalysisText(report,payload.case);text.textContent=formatted;
   const references=node('div',undefined,'stack');references.append(node('h4','Исходные материалы для самостоятельной проверки'));
   for(const ev of payload.case.evidence){const original=c.evidence.find(x=>x.id===ev.ref);if(!original)continue;const row=node('div',undefined,'row');row.append(node('span',`Доказательство ${ev.ref}: ${original.title}`));if(original.url){const a=node('a','Открыть первоисточник ↗');a.href=original.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}references.append(row);}
   for(const rule of payload.case.rules){const row=node('div',undefined,'row');row.append(node('span',`Правило ${rule.code}: ${rule.revisionId}`));const a=node('a','Открыть правило ↗');a.href=rule.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';row.append(a);references.append(row);}
   answer.append(references);
   if(!root.isConnected||state.activeProfileId!==profile.id)throw Error('Раздел закрыт');
   const edit=node('textarea',report.draftResponse,'ai-response');edit.id='ai-case-draft-edit';edit.maxLength=12000;edit.rows=7;edit.setAttribute('aria-label','Редактировать AI-черновик');answer.append(node('h4','Редактируемый черновик — сохранение только вручную'),edit);
   const save=node('button','Сохранить черновик в жалобу','button secondary');save.type='button';save.id='ai-case-save-draft';answer.append(save);
   save.addEventListener('click',async()=>{save.disabled=true;try{if(!confirm('Сохранить вручную проверенный черновик? Существующий текст жалобы будет заменён. Публикация на форуме не выполняется.'))return;
     const text=edit.value.trim();if(!text||text.length>12000)throw Error('Некорректный черновик');
     const message=await api.runtime.sendMessage({type:'RP_NEXUS_CASE_MUTATE',action:'ai-draft',id:c.id,expectedAt:payload.case.caseVersion,profileId:profile.id,text});if(!message?.ok)throw Error(message?.error||'Не удалось сохранить черновик');
     status.textContent='Черновик сохранён локально; требуется самостоятельная проверка и публикация.';c=message.value;
    }catch(err){status.textContent='Ошибка сохранения: '+err.message;}finally{save.disabled=false;}});
   const copy=node('button','Копировать отчёт','button secondary');copy.type='button';copy.addEventListener('click',()=>navigator.clipboard.writeText(formatted).then(()=>status.textContent='Отчёт скопирован').catch(err=>status.textContent=err.message));answer.append(copy);
   consent.checked=false;status.textContent='Отчёт получен. Ссылки на материалы представлены только ID записей. Проверьте первоисточники.';
  }catch(err){status.textContent=err.name==='AbortError'?'Запрос отменён':'Ошибка анализа: '+err.message;feedback?.(err.message,err.name!=='AbortError');}
  finally{if(activeAbort===ctl)activeAbort=null;busy=false;if(root.isConnected){send.disabled=false;cancel.disabled=true;}}
 });
 if(select.value)await loadCase();
}
