import {rulesAISection,mountRulesAI,stopRulesAI} from './ai-rules-page.mjs';
import {AI_GATEWAY,assertQuestion,getAISettings,setAIEnabled,requestAIPermission,hasAIPermission,aiHealth,streamAI} from '../lib/ai-connection.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
const session={profileId:'',token:'',messages:[],controller:null,root:null,connected:false};
function reset(profileId){if(session.profileId===profileId)return;stopRulesAI();session.controller?.abort();Object.assign(session,{profileId,token:'',messages:[],controller:null,root:null,connected:false});}
export function stopAI(){session.controller?.abort();session.controller=null;stopRulesAI();}
export function aiSection(){return `<div class="stack" id="ai-connection" aria-label="AI Connection">
<section class="card stack"><h3>OpenAI · AI Connection & Privacy Core</h3><p class="subtle">Облачный AI выключен по умолчанию. Работает через необязательный локальный шлюз ${e(AI_GATEWAY)}. Ключ OpenAI хранится только в окружении шлюза; ответ передаётся потоково. Локальный помощник в разделе «Поиск и помощник» доступен без подключения.</p>
<div class="row"><label class="check"><input id="ai-enabled" type="checkbox" aria-label="Включить облачный AI">Включить AI для активного профиля</label><span id="ai-status" class="subtle" role="status">Проверка настроек…</span></div>
<p class="subtle">Для подключения запустите <code>node ai-gateway/server.mjs</code> и введите отдельный токен шлюза. Разрешение доступа к 127.0.0.1 запрашивается только при включении AI. Учётные данные и текст диалога не сохраняются в резервной копии.</p>
<label class="field">Токен локального шлюза (только на время открытой страницы)<input id="ai-token" type="password" autocomplete="off" spellcheck="false" maxlength="256" placeholder="MT_AI_GATEWAY_TOKEN"></label>
<div class="row"><button type="button" class="button secondary" id="ai-connect">Проверить соединение</button><button type="button" class="button secondary" id="ai-clear">Очистить диалог и токен</button></div>
</section>
<section class="card stack"><h3>Вопрос к OpenAI</h3><p class="subtle">Передаётся только текст, который вы ввели ниже. Правила, жалобы, файлы, никнеймы, ID и документы автоматически не подгружаются. Не вставляйте в вопрос секреты или личные данные.</p>
<form id="ai-chat-form" class="stack"><label class="field">Текст отправляемого запроса<textarea id="ai-question" name="question" maxlength="5000" rows="4" required placeholder="Напишите вопрос…"></textarea></label><div class="stack"><strong>Предпросмотр передачи</strong><pre id="ai-preview" class="ai-preview">Запрос не введён.</pre></div>
<label class="check"><input type="checkbox" id="ai-confirm" required>Подтверждаю отправку показанного текста через локальный шлюз в OpenAI API. Возможна оплата API.</label>
<div class="row"><button type="submit" class="button primary" id="ai-send">Отправить запрос</button><button type="button" class="button secondary" id="ai-cancel" disabled>Отменить</button></div></form>
<p id="ai-live-status" role="status" aria-live="polite" class="subtle"></p><div id="ai-replies" class="stack" aria-live="polite"></div>
</section>${rulesAISection()}</div>`;}
function messageDOM(container){container.replaceChildren();for(const item of session.messages){const box=document.createElement('article');box.className='card stack';const heading=document.createElement('strong');heading.textContent=item.role==='user'?'Отправленный вопрос':'OpenAI · предварительный ответ';const pre=document.createElement('pre');pre.className='ai-response';pre.textContent=item.text;box.append(heading,pre);container.append(box);} }
export async function mountAI(root,state,feedback){
 if(!root)return;reset(state.activeProfileId);session.root=root;
 const enabled=root.querySelector('#ai-enabled'),status=root.querySelector('#ai-status'),live=root.querySelector('#ai-live-status'),token=root.querySelector('#ai-token'),question=root.querySelector('#ai-question'),preview=root.querySelector('#ai-preview'),check=root.querySelector('#ai-confirm'),send=root.querySelector('#ai-send'),cancel=root.querySelector('#ai-cancel'),connect=root.querySelector('#ai-connect');
 messageDOM(root.querySelector('#ai-replies'));token.value=session.token;
 let opts;try{opts=await getAISettings(state.activeProfileId);}catch(err){status.textContent='Ошибка настроек: '+err.message;return;}
 if(!root.isConnected||session.profileId!==state.activeProfileId)return;
 enabled.checked=opts.enabled;status.textContent=opts.enabled?'AI включён; запросы только по подтверждению':'AI выключен';
 enabled.addEventListener('change',async()=>{
  const wanted=enabled.checked;enabled.disabled=true;
  try{
   if(wanted&&!(await requestAIPermission())){enabled.checked=false;status.textContent='Разрешение отклонено';return;}
   await setAIEnabled(state.activeProfileId,wanted);status.textContent=wanted?'AI включён':'AI выключен';if(!wanted){stopAI();session.token='';token.value='';session.connected=false;stopRulesAI();}
  }catch(err){enabled.checked=!wanted;feedback(err.message,true);}finally{enabled.disabled=false;}
 });
 token.addEventListener('input',()=>{session.token=token.value;session.connected=false;});
 question.addEventListener('input',()=>{preview.textContent=question.value||'Запрос не введён.';check.checked=false;});
 root.querySelector('#ai-clear').addEventListener('click',()=>{stopAI();session.messages=[];session.token='';session.connected=false;stopRulesAI();token.value='';question.value='';preview.textContent='Запрос не введён.';check.checked=false;live.textContent='Диалог и токен очищены из памяти';messageDOM(root.querySelector('#ai-replies'));});
 cancel.addEventListener('click',()=>{session.controller?.abort();live.textContent='Запрос отменён';});
 connect.addEventListener('click',async()=>{connect.disabled=true;live.textContent='Проверяем локальный шлюз…';try{if(!enabled.checked)throw Error('Сначала включите AI');if(!await hasAIPermission())throw Error('Нет разрешения для локального шлюза');const data=await aiHealth(session.token,{signal:AbortSignal.timeout(7000)});session.connected=true;live.textContent=`Шлюз подключён · ${data.model} · осталось запросов за сутки: ${data.remaining}/${data.dailyLimit}`;}catch(err){session.connected=false;live.textContent='Ошибка подключения: '+err.message;}finally{connect.disabled=false;}});
 void mountRulesAI(root.querySelector('#ai-rules-root'),state,feedback,{getToken:()=>session.token}).catch(err=>feedback(err.message,true));
 root.querySelector('#ai-chat-form').addEventListener('submit',async event=>{
  event.preventDefault();if(session.controller)return;
  try{
   if(!enabled.checked||!await getAISettings(state.activeProfileId).then(x=>x.enabled))throw Error('AI выключен');
   if(!await hasAIPermission())throw Error('Нет разрешения на локальный шлюз');
   if(!check.checked)throw Error('Подтвердите отправку текста');
   const q=assertQuestion(question.value);if(!session.token)throw Error('Введите токен шлюза');
   const controller=new AbortController();session.controller=controller;send.disabled=true;cancel.disabled=false;connect.disabled=true;
   session.messages.push({role:'user',text:q});const response={role:'assistant',text:''};session.messages.push(response);const messages=root.querySelector('#ai-replies');messageDOM(messages);live.textContent='Запрос отправлен. Ответ поступает…';
   await streamAI(q,session.token,{signal:controller.signal,onDelta:(_chunk,full)=>{response.text=full;if(root.isConnected&&session.profileId===state.activeProfileId)messages.lastElementChild?.querySelector('pre')?.replaceChildren(document.createTextNode(full));},onComplete:(p)=>{live.textContent=`Ответ завершён. Токены: вход ${p.usage?.inputTokens??'—'}, выход ${p.usage?.outputTokens??'—'}.`}});
   check.checked=false;question.value='';preview.textContent='Запрос не введён.';
  }catch(err){live.textContent=err.name==='AbortError'?'Запрос отменён':`Ошибка AI: ${err.message}`;if(session.messages.at(-1)?.role==='assistant'&&!session.messages.at(-1).text)session.messages.pop();messageDOM(root.querySelector('#ai-replies'));}
  finally{session.controller=null;send.disabled=false;cancel.disabled=true;connect.disabled=false;}
 });
}
