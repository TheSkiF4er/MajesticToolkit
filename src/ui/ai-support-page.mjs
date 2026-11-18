/** Working offline-first technical support, optional user-approved OpenAI assistance. */
import {getAISettings,hasAIPermission,streamSupportAI} from '../lib/ai-connection.mjs';
import {runSupportDiagnostics} from '../lib/ai-support-diagnostics.mjs';
import {SUPPORT_TOPICS,SUPPORT_CHECKS,localSupportSteps,buildSupportWire,validateSupportAnswer,supportReport} from '../lib/ai-support-core.mjs';
let activeAbort=null;
export function stopSupportAI(){activeAbort?.abort();activeAbort=null;}
export function supportAISection(){return `<section class="card stack" id="ai-support-root" aria-label="AI Technical Support">
<h3>AI Technical Support · диагностика и помощь</h3><p class="subtle">Диагностика выполняется на вашем устройстве только по кнопке. Не читает содержимое жалоб, ключи, файлы или приватные настройки. Локальные инструкции доступны без OpenAI. Для облачной помощи сначала проверьте весь JSON и отдельно подтвердите передачу.</p>
<label class="field">Область проблемы<select id="ai-support-category" aria-label="Категория техподдержки">${Object.entries(SUPPORT_TOPICS).map(([id,title])=>`<option value="${id}">${title}</option>`).join('')}</select></label>
<label class="field">Описание ошибки<textarea id="ai-support-issue" maxlength="2000" rows="3" placeholder="Опишите ошибку и действия, при которых она возникает. Не вставляйте секреты и персональные данные."></textarea></label>
<div class="row"><button type="button" id="ai-support-scan" class="button secondary">Проверить расширение локально</button><label class="check"><input id="ai-support-gateway-check" type="checkbox">Проверить соединение с шлюзом (без AI-ответа)</label></div>
<p id="ai-support-scan-status" class="subtle" role="status">Проверки ещё не запускались.</p><div id="ai-support-checks" class="stack"></div>
<div class="row"><button type="button" id="ai-support-report" class="button secondary" disabled>Скачать безопасный диагностический отчёт JSON</button><button type="button" id="ai-support-local" class="button secondary">Показать локальные инструкции</button></div>
<div id="ai-support-steps" class="stack" aria-live="polite"></div>
<form id="ai-support-form" class="stack"><button type="button" id="ai-support-prepare" class="button secondary">Подготовить AI-запрос</button>
<div id="ai-support-panel" class="stack" hidden><h4>Предпросмотр отправляемого JSON</h4><p class="subtle">Передаются только ваше описание проблемы (с маскировкой типичных секретов), категория, версия и коды статусов проверок. Локальные детали, токены, URL, содержимое файлов и жалобы исключены.</p>
<pre id="ai-support-preview" class="ai-preview"></pre><label class="check"><input type="checkbox" required id="ai-support-consent">Я проверил показанный JSON и разрешаю отправить именно его через локальный шлюз в OpenAI API.</label><div class="row"><button type="submit" id="ai-support-send" class="button primary">Спросить AI Support</button><button type="button" id="ai-support-cancel" class="button secondary" disabled>Отменить</button></div></div></form>
<p id="ai-support-ai-status" class="subtle" role="status"></p><div id="ai-support-answer" class="stack" aria-live="polite"></div>
<p class="subtle">Остались проблемы? Скачайте локальный отчёт и проверьте его перед публикацией в <a href="https://github.com/TheSkiF4er/MajesticToolkit/issues/new" target="_blank" rel="noopener noreferrer">GitHub Issues ↗</a>. Отправка отчёта не автоматическая.</p>
</section>`;}
const el=(name,text,cls)=>{const item=document.createElement(name);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
function downloadReport(text){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`majestictoolkit-support-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function mountSupportAI(root,state,feedback,{getToken}={}){
 if(!root)return;const category=root.querySelector('#ai-support-category'),issue=root.querySelector('#ai-support-issue'),scan=root.querySelector('#ai-support-scan'),gateway=root.querySelector('#ai-support-gateway-check'),scanStatus=root.querySelector('#ai-support-scan-status'),checksBox=root.querySelector('#ai-support-checks'),localBox=root.querySelector('#ai-support-steps'),reportButton=root.querySelector('#ai-support-report'),panel=root.querySelector('#ai-support-panel'),preview=root.querySelector('#ai-support-preview'),consent=root.querySelector('#ai-support-consent'),form=root.querySelector('#ai-support-form'),send=root.querySelector('#ai-support-send'),cancel=root.querySelector('#ai-support-cancel'),status=root.querySelector('#ai-support-ai-status'),answer=root.querySelector('#ai-support-answer');
 let diagnostics=null,snapshot='',busy=false,scanBusy=false;
 const reset=()=>{snapshot='';panel.hidden=true;consent.checked=false;preview.textContent='';answer.replaceChildren();status.textContent='';};
 const local=()=>{localBox.replaceChildren();const heading=el('h4','Локальные рекомендации');const list=el('ol');for(const line of localSupportSteps(category.value,diagnostics?.checks||[],issue.value)){const li=el('li',line);list.append(li);}localBox.append(heading,list);};
 const display=()=>{checksBox.replaceChildren();if(!diagnostics)return;for(const x of diagnostics.checks){const row=el('div',undefined,'row');row.append(el('strong',SUPPORT_CHECKS[x.id]),el('span',`${x.status.toUpperCase()} — ${x.detail}`,'subtle'));checksBox.append(row);}};
 scan.addEventListener('click',async()=>{if(scanBusy)return;scanBusy=true;scan.disabled=true;reset();scanStatus.textContent='Проверяются только доступные локальные функции…';try{
   diagnostics=await runSupportDiagnostics({token:getToken?.()||'',includeGateway:gateway.checked});if(!root.isConnected)return;
   display();local();reportButton.disabled=false;scanStatus.textContent=`Диагностика завершена: ${diagnostics.checks.length} проверок. Нет автоматической отправки данных.`;
  }catch(err){scanStatus.textContent='Ошибка диагностики: '+err.message;}finally{scanBusy=false;scan.disabled=false;}});
 reportButton.addEventListener('click',()=>{if(!diagnostics)throw Error('Сначала выполните диагностику');downloadReport(supportReport({category:category.value,version:diagnostics.version,checks:diagnostics.checks.map(({id,status})=>({id,status}))}));});
 root.querySelector('#ai-support-local').addEventListener('click',local);
 for(const input of [category,issue,gateway])input.addEventListener('input',()=>{reset();if(input===gateway)diagnostics=null;if(input===gateway){checksBox.replaceChildren();reportButton.disabled=true;scanStatus.textContent='Настройка изменена — повторите диагностику.';}});
 root.querySelector('#ai-support-prepare').addEventListener('click',()=>{reset();try{
   const context={category:category.value,version:diagnostics?.version||'0.0.0',checks:(diagnostics?.checks||[]).map(({id,status})=>({id,status}))};
   const payload=buildSupportWire(issue.value,context);snapshot=JSON.stringify(payload);preview.textContent=JSON.stringify(payload,null,2);panel.hidden=false;status.textContent='Просмотрите передаваемые сведения и подтвердите отправку отдельно.';
  }catch(err){status.textContent=err.message;}});
 cancel.addEventListener('click',()=>{activeAbort?.abort();status.textContent='Запрос отменён';});
 form.addEventListener('submit',async ev=>{ev.preventDefault();if(busy)return;busy=true;send.disabled=true;cancel.disabled=false;const id=state.activeProfileId;let ctrl;
  try{
   if(!snapshot||!consent.checked)throw Error('Проверьте JSON и подтвердите отправку');
   if(!await getAISettings(id).then(x=>x.enabled)||!await hasAIPermission())throw Error('Сначала включите AI и разрешите доступ к шлюзу');
   const token=getToken?.();if(!token)throw Error('Введите токен шлюза выше');
   const context={category:category.value,version:diagnostics?.version||'0.0.0',checks:(diagnostics?.checks||[]).map(({id,status})=>({id,status}))};
   const payload=buildSupportWire(issue.value,context);if(JSON.stringify(payload)!==snapshot)throw Error('Диагностика или описание изменились — проверьте данные заново');
   if(!root.isConnected||id!==state.activeProfileId)throw Error('Профиль изменился');
   ctrl=new AbortController();activeAbort=ctrl;answer.replaceChildren();status.textContent='OpenAI формирует рекомендацию…';
   const full=await streamSupportAI(payload.question,token,payload.diagnostics,{signal:ctrl.signal});if(!root.isConnected||id!==state.activeProfileId)return;
   const value=validateSupportAnswer(JSON.parse(full));const title=el('h4','Предварительная AI-диагностика');answer.append(title,el('p',value.summary),el('p',`Возможная причина: ${value.possibleCause}`));
   const steps=el('ol');for(const step of value.steps)steps.append(el('li',step));answer.append(steps);
   if(value.additionalQuestions.length){answer.append(el('h4','Что уточнить'));const questions=el('ul');for(const q of value.additionalQuestions)questions.append(el('li',q));answer.append(questions);}
   answer.append(el('p','Результат модели не подтверждает фактическое устранение ошибки. Все действия выполняйте самостоятельно.','subtle'));
   status.textContent='Ответ получен. Диагностические данные и история не сохраняются.';consent.checked=false;
  }catch(err){status.textContent=err.name==='AbortError'?'Запрос отменён':'Ошибка AI Support: '+err.message;feedback?.(err.message,err.name!=='AbortError');}
  finally{if(activeAbort===ctrl)activeAbort=null;busy=false;if(root.isConnected){send.disabled=false;cancel.disabled=true;}}
 });
}
