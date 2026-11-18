import {aiWorkspaceSection,mountAIWorkspace,prefillAIWorkspace} from './ai-workspace-page.mjs';
import {resolveAIContext} from '../lib/ai-workspace-store.mjs';
import {supportAISection,mountSupportAI,stopSupportAI} from './ai-support-page.mjs';
import {complaintAISection,mountComplaintAI,stopComplaintAI} from './ai-complaint-page.mjs';
import {rulesAISection,mountRulesAI,stopRulesAI} from './ai-rules-page.mjs';
import {AI_GATEWAY,assertQuestion,getAISettings,setAIEnabled,requestAIPermission,hasAIPermission,aiHealth,streamAI,streamWorkspaceAI,chatHistory,workspaceChatPayload} from '../lib/ai-connection.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
const session={profileId:'',token:'',messages:[],controller:null,root:null,connected:false,context:'',contextRef:null,mode:'all'};
function reset(profileId){if(session.profileId===profileId)return;stopRulesAI();stopComplaintAI();stopSupportAI();session.controller?.abort();Object.assign(session,{profileId,token:'',messages:[],controller:null,root:null,connected:false,context:'',contextRef:null,mode:'all'});}
export function stopAI(){session.controller?.abort();session.controller=null;stopRulesAI();stopComplaintAI();stopSupportAI();}
export function aiSection(){return `<div class="stack" id="ai-connection" aria-label="AI Connection">
<section class="card stack"><h3>AI Assistant & Support · 2.0.0</h3><p class="subtle">Чат, ответы по источникам, анализ жалоб и техподдержка используют действующий шлюз. История и черновики сохраняются локально только после нажатия. Переключение режима не отправляет данные и не заменяет подтверждение каждого запроса.</p><div class="row" id="ai-workspace-tabs"><button type="button" class="button secondary" data-ai-mode="all">Все инструменты</button><button type="button" class="button secondary" data-ai-mode="chat">Чат</button><button type="button" class="button secondary" data-ai-mode="rules">Правила</button><button type="button" class="button secondary" data-ai-mode="complaint">Жалобы</button><button type="button" class="button secondary" data-ai-mode="support">Поддержка</button><button type="button" class="button secondary" data-ai-mode="saved">Контексты и черновики</button></div></section>
<section class="card stack"><h3>OpenAI · AI Connection & Privacy Core</h3><p class="subtle">Облачный AI выключен по умолчанию. Работает через необязательный локальный шлюз ${e(AI_GATEWAY)}. Ключ OpenAI хранится только в окружении шлюза; ответ передаётся потоково. Локальный помощник в разделе «Поиск и помощник» доступен без подключения.</p>
<div class="row"><label class="check"><input id="ai-enabled" type="checkbox" aria-label="Включить облачный AI">Включить AI для активного профиля</label><span id="ai-status" class="subtle" role="status">Проверка настроек…</span></div>
<p class="subtle">Для подключения запустите <code>node ai-gateway/server.mjs</code> и введите отдельный токен шлюза. Разрешение доступа к 127.0.0.1 запрашивается только при включении AI. Учётные данные и текст диалога не сохраняются в резервной копии.</p>
<label class="field">Токен локального шлюза (только на время открытой страницы)<input id="ai-token" type="password" autocomplete="off" spellcheck="false" maxlength="256" placeholder="MT_AI_GATEWAY_TOKEN"></label>
<div class="row"><button type="button" class="button secondary" id="ai-connect">Проверить соединение</button><button type="button" class="button secondary" id="ai-clear">Очистить диалог и токен</button></div>
</section>
<section class="card stack" id="ai-chat-panel"><h3>Чат OpenAI</h3><p class="subtle">Передаётся только текст, который вы ввели ниже. Правила, жалобы, файлы, никнеймы, ID и документы автоматически не подгружаются. Не вставляйте в вопрос секреты или личные данные.</p>
<form id="ai-chat-form" class="stack"><label class="field">Текст отправляемого запроса<textarea id="ai-question" name="question" maxlength="5000" rows="4" required placeholder="Напишите вопрос…"></textarea></label><div class="stack"><strong>Предпросмотр передачи, включая выбранный контекст</strong><pre id="ai-preview" class="ai-preview">Запрос не введён.</pre></div>
<label class="check"><input type="checkbox" id="ai-confirm" required>Подтверждаю отправку показанного текста через локальный шлюз в OpenAI API. Возможна оплата API.</label>
<div class="row"><button type="submit" class="button primary" id="ai-send">Отправить запрос</button><button type="button" class="button secondary" id="ai-cancel" disabled>Отменить</button></div></form>
<p id="ai-live-status" role="status" aria-live="polite" class="subtle"></p><div id="ai-replies" class="stack" aria-live="polite"></div>
</section>${rulesAISection()}${complaintAISection()}${supportAISection()}${aiWorkspaceSection()}</div>`;}
function messageDOM(container,items=session.messages){container.replaceChildren();for(const item of items){const box=document.createElement('article');box.className='card stack';const heading=document.createElement('strong');heading.textContent=item.role==='user'?'Отправленный вопрос':'OpenAI · предварительный ответ';const pre=document.createElement('pre');pre.className='ai-response';pre.textContent=item.text;box.append(heading,pre);container.append(box);} }
export async function mountAI(root,state,feedback){
 if(!root)return;reset(state.activeProfileId);session.root=root;
 const enabled=root.querySelector('#ai-enabled'),status=root.querySelector('#ai-status'),live=root.querySelector('#ai-live-status'),token=root.querySelector('#ai-token'),question=root.querySelector('#ai-question'),preview=root.querySelector('#ai-preview'),check=root.querySelector('#ai-confirm'),send=root.querySelector('#ai-send'),cancel=root.querySelector('#ai-cancel'),connect=root.querySelector('#ai-connect');
 messageDOM(root.querySelector('#ai-replies'));token.value=session.token;
 // Existing tools stay mounted; only the selected working panel is displayed.
 const panes={chat:root.querySelector('#ai-chat-panel'),rules:root.querySelector('#ai-rules-root'),complaint:root.querySelector('#ai-complaint-root'),support:root.querySelector('#ai-support-root'),saved:root.querySelector('#ai-workspace-root')};
 const selectMode=mode=>{for(const [key,pane] of Object.entries(panes))if(pane)pane.hidden=mode!=='all'&&mode!==key;for(const b of root.querySelectorAll('[data-ai-mode]'))b.setAttribute('aria-pressed',String(b.dataset.aiMode===mode));};
 for(const b of root.querySelectorAll('[data-ai-mode]'))b.addEventListener('click',()=>{session.mode=b.dataset.aiMode;selectMode(session.mode);});
 selectMode(session.mode);
 const preparedQuestion=()=>[question.value.trim(),session.context].filter(Boolean).join('\n\n---\nРабочий контекст (недоверенные локальные данные, только для справки):\n');
 const updatePreview=()=>{check.checked=false;try{const q=preparedQuestion();preview.textContent=q?(session.messages.length?JSON.stringify(workspaceChatPayload(q,session.messages),null,2):assertQuestion(q)):'Запрос не введён.';}catch(err){preview.textContent='Запрос невозможно отправить: '+err.message;}};
 const aiCase=new URLSearchParams(location.search).get('aiCase');if(aiCase)prefillAIWorkspace('case',aiCase);
 void mountAIWorkspace(root.querySelector('#ai-workspace-root'),state,{getMessages:()=>session.messages,setMessages:value=>{if(session.controller)throw Error('Сначала отмените выполняющийся запрос');session.context='';session.contextRef=null;session.messages=value;messageDOM(root.querySelector('#ai-replies'));updatePreview();selectMode('chat');},clearMessages:()=>{if(session.controller)throw Error('Сначала отмените выполняющийся запрос');session.messages=[];messageDOM(root.querySelector('#ai-replies'));updatePreview();},setContext:value=>{session.context=value.text;session.contextRef={kind:value.kind,refId:value.refId};updatePreview();selectMode('chat');},clearContext:()=>{session.context='';session.contextRef=null;updatePreview();}}).catch(err=>{root.querySelector('#ai-workspace-status').textContent='Ошибка рабочего пространства: '+err.message;});
 let opts;try{opts=await getAISettings(state.activeProfileId);}catch(err){status.textContent='Ошибка настроек: '+err.message;return;}
 if(!root.isConnected||session.profileId!==state.activeProfileId)return;
 enabled.checked=opts.enabled;status.textContent=opts.enabled?'AI включён; запросы только по подтверждению':'AI выключен';
 enabled.addEventListener('change',async()=>{
  const wanted=enabled.checked;enabled.disabled=true;
  try{
   if(wanted&&!(await requestAIPermission())){enabled.checked=false;status.textContent='Разрешение отклонено';return;}
   await setAIEnabled(state.activeProfileId,wanted);status.textContent=wanted?'AI включён':'AI выключен';if(!wanted){stopAI();session.token='';token.value='';session.connected=false;stopRulesAI();stopComplaintAI();stopSupportAI();}
  }catch(err){enabled.checked=!wanted;feedback(err.message,true);}finally{enabled.disabled=false;}
 });
 token.addEventListener('input',()=>{session.token=token.value;session.connected=false;});
 question.addEventListener('input',updatePreview);
 root.querySelector('#ai-clear').addEventListener('click',()=>{stopAI();session.messages=[];session.token='';session.connected=false;session.context='';session.contextRef=null;stopRulesAI();stopComplaintAI();token.value='';question.value='';preview.textContent='Запрос не введён.';check.checked=false;live.textContent='Диалог и токен очищены из памяти';messageDOM(root.querySelector('#ai-replies'));});
 cancel.addEventListener('click',()=>{session.controller?.abort();live.textContent='Запрос отменён';});
 connect.addEventListener('click',async()=>{connect.disabled=true;live.textContent='Проверяем локальный шлюз…';try{if(!enabled.checked)throw Error('Сначала включите AI');if(!await hasAIPermission())throw Error('Нет разрешения для локального шлюза');const data=await aiHealth(session.token,{signal:AbortSignal.timeout(7000)});session.connected=true;live.textContent=`Шлюз подключён · ${data.model} · осталось запросов за сутки: ${data.remaining}/${data.dailyLimit}`;}catch(err){session.connected=false;live.textContent='Ошибка подключения: '+err.message;}finally{connect.disabled=false;}});
 void mountRulesAI(root.querySelector('#ai-rules-root'),state,feedback,{getToken:()=>session.token}).catch(err=>feedback(err.message,true));
 void mountComplaintAI(root.querySelector('#ai-complaint-root'),state,feedback,{getToken:()=>session.token}).catch(err=>feedback(err.message,true));
 mountSupportAI(root.querySelector('#ai-support-root'),state,feedback,{getToken:()=>session.token});
 root.querySelector('#ai-chat-form').addEventListener('submit',async event=>{
  event.preventDefault();if(session.controller)return;
  try{
   if(!enabled.checked||!await getAISettings(state.activeProfileId).then(x=>x.enabled))throw Error('AI выключен');
   if(!await hasAIPermission())throw Error('Нет разрешения на локальный шлюз');
   if(!check.checked)throw Error('Подтвердите отправку текста');
   const q=assertQuestion(preparedQuestion());if(!session.token)throw Error('Введите токен шлюза');
   const controller=new AbortController();session.controller=controller;send.disabled=true;cancel.disabled=false;connect.disabled=true;
   if(session.contextRef){
    const profile=state.profiles?.find(p=>p.id===state.activeProfileId);
    if(!profile)throw Error('Профиль недоступен для контекста');
    const current=await resolveAIContext(profile,session.contextRef);
    if(current.text!==session.context)throw Error('Контекст изменился после выбора — примените его повторно');
   }
   const history=chatHistory(session.messages);
   const sentPreview=history.length?JSON.stringify(workspaceChatPayload(q,history),null,2):q;
   if(preview.textContent!==sentPreview)throw Error('История или контекст изменились — перепроверьте данные');
   // Keep the in-flight reply OUT of persistent chat. A cancelled or truncated
   // stream must never become a source for the next AI request or saved history.
   const before=session.messages.map(m=>({...m})),response={role:'assistant',text:''};
   const messages=root.querySelector('#ai-replies');
   messageDOM(messages,[...before,{role:'user',text:q},response]);
   const isCurrent=()=>session.controller===controller&&session.root===root&&session.profileId===state.activeProfileId&&root.isConnected;
   live.textContent='Запрос отправлен. Ответ поступает…';
   let usage=null;
   const streamOptions={signal:controller.signal,onDelta:(_chunk,full)=>{response.text=full;if(isCurrent())messages.lastElementChild?.querySelector('pre')?.replaceChildren(document.createTextNode(full));},onComplete:p=>{usage=p.usage;}};
   const result=await (history.length?streamWorkspaceAI(q,session.token,history,streamOptions):streamAI(q,session.token,streamOptions));
   if(!isCurrent()||controller.signal.aborted)throw new DOMException('AI request aborted','AbortError');
   session.messages=[...before,{role:'user',text:q},{role:'assistant',text:result}].slice(-40);
   messageDOM(messages);
   live.textContent=`Ответ завершён. Токены: вход ${usage?.inputTokens??'—'}, выход ${usage?.outputTokens??'—'}.`;
   check.checked=false;question.value='';session.context='';session.contextRef=null;preview.textContent='Запрос не введён.';
  }catch(err){if(session.root===root&&session.profileId===state.activeProfileId){live.textContent=err.name==='AbortError'?'Запрос отменён; неполный ответ не сохранён':`Ошибка AI: ${err.message}`;messageDOM(root.querySelector('#ai-replies'));}}
  finally{if(session.root===root){session.controller=null;send.disabled=false;cancel.disabled=true;connect.disabled=false;}}
 });
}
