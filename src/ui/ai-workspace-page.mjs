/** Unified AI productivity controls: explicit opt-in persistence, reusable references, Binder drafts. */
import {listRules} from '../lib/rules-store.mjs';
import {listSources} from '../lib/source-library.mjs';
import {listCases} from '../lib/complaints-store.mjs';
import {upsertTemplate} from '../lib/forum-store.mjs';
import {loadAIWorkspace,saveAIConversation,deleteAIConversation,saveAIContext,deleteAIContext,saveAIDraft,deleteAIDraft,resolveAIContext} from '../lib/ai-workspace-store.mjs';
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
let preset=null;
export function prefillAIWorkspace(kind,refId){if(!['rule','source','case'].includes(kind)||typeof refId!=='string')return;preset={kind,refId};}
export function aiWorkspaceSection(){return `<section class="card stack" id="ai-workspace-root" aria-label="AI Workspace & Productivity">
<h3>AI Workspace & Productivity · 1.9.5</h3><p class="subtle">Рабочие контексты сохраняются локально как ссылки на ваши записи. История AI и черновики сохраняются только по вашему нажатию. Токен шлюза, API-ключ, согласия и приватные файлы не записываются в историю или Backup v17.</p>
<div class="row"><button type="button" class="button secondary" id="ai-workspace-save-chat">Сохранить текущий диалог</button><button type="button" class="button secondary" id="ai-workspace-new-chat">Новый диалог</button></div>
<div class="stack"><h4>Сохранённые диалоги</h4><div id="ai-workspace-conversations" class="stack"></div></div>
<div class="divider"></div><h4>Контекст из рабочих модулей</h4><p class="subtle">В контексте хранятся только тип и ID. После выбора текст повторно читается из актуального профиля и отображается перед отправкой. Выберите конкретную запись и нажмите «Применить»; автоматически в AI ничего не передаётся.</p>
<div class="row"><label class="field">Тип данных<select id="ai-workspace-context-kind" aria-label="Тип рабочего контекста"><option value="rule">Правило</option><option value="source">Статья Центра знаний</option><option value="case">Жалоба</option></select></label><label class="field">Материал<select id="ai-workspace-context-item" aria-label="Выбрать запись контекста"></select></label></div>
<div class="row"><button type="button" class="button secondary" id="ai-workspace-apply">Применить контекст к чату</button><button type="button" class="button secondary" id="ai-workspace-pin">Сохранить ссылку</button><button type="button" class="button secondary" id="ai-workspace-unapply">Убрать из чата</button></div>
<p id="ai-workspace-context-status" role="status" class="subtle">Контекст не выбран.</p><pre id="ai-workspace-context-preview" class="ai-preview" hidden></pre><h4>Избранные контексты</h4><div id="ai-workspace-contexts" class="stack"></div>
<div class="divider"></div><h4>AI-черновики и Binder 2.0</h4><p class="subtle">Текст AI — предварительный. Перед сохранением в Binder проверьте факты, источники, имена и санкции. Автоматической публикации нет.</p>
<label class="field">Название черновика<input id="ai-workspace-draft-title" maxlength="100" placeholder="Например: запрос дополнительных материалов"></label>
<label class="field">Редактируемый текст<textarea id="ai-workspace-draft-text" rows="6" maxlength="12000" placeholder="Скопируйте или отредактируйте текст ответа…"></textarea></label>
<div class="row"><button type="button" class="button secondary" id="ai-workspace-from-reply">Вставить последний AI-ответ</button><button type="button" class="button secondary" id="ai-workspace-save-draft">Сохранить черновик локально</button><button type="button" class="button secondary" id="ai-workspace-to-binder">Сохранить в Binder 2.0</button></div><div id="ai-workspace-drafts" class="stack"></div><p id="ai-workspace-status" class="subtle" role="status"></p>
</section>`;}
const description=kind=>({rule:'Правило',source:'Источник',case:'Жалоба'}[kind]);
export async function mountAIWorkspace(root,state,{getMessages,setMessages,clearMessages,setContext,clearContext}={}){
 if(!root)return;
 const profile=state.profiles?.find(x=>x.id===state.activeProfileId);if(!profile){root.querySelector('#ai-workspace-status').textContent='Активный профиль недоступен';return;}
 const id=profile.id,kind=root.querySelector('#ai-workspace-context-kind'),item=root.querySelector('#ai-workspace-context-item'),contextStatus=root.querySelector('#ai-workspace-context-status'),contextPreview=root.querySelector('#ai-workspace-context-preview'),history=root.querySelector('#ai-workspace-conversations'),pins=root.querySelector('#ai-workspace-contexts'),draftList=root.querySelector('#ai-workspace-drafts'),draftText=root.querySelector('#ai-workspace-draft-text'),draftTitle=root.querySelector('#ai-workspace-draft-title'),status=root.querySelector('#ai-workspace-status');
 let db=await loadAIWorkspace(id);if(!root.isConnected)return;
 let lastDraftId=null,activeConversationId=null;let sourceRows=[];
 const notify=message=>{status.textContent=message;};
 const failed=error=>{notify('Ошибка: '+error.message);};
 const refresh=async()=>{db=await loadAIWorkspace(id);draw();};
 const actionButton=(label,handler)=>{const b=el('button',label,'button secondary');b.type='button';b.addEventListener('click',()=>Promise.resolve().then(handler).catch(failed));return b;};
 const entry=(label,descriptionText)=>{const row=el('div',undefined,'row');row.append(el('strong',label));if(descriptionText)row.append(el('span',descriptionText,'subtle'));return row;};
 function draw(){history.replaceChildren();pins.replaceChildren();draftList.replaceChildren();
  if(!db.conversations.length)history.append(el('p','Диалоги не сохранены.','subtle'));
  for(const c of db.conversations){const row=entry(c.title,`${c.messages.length} сообщений`);row.append(actionButton('Открыть',()=>{setMessages?.(c.messages.map(x=>({...x})));activeConversationId=c.id;notify('Диалог загружен в память. Новый запрос потребует нового согласия.');}),actionButton('Удалить',async()=>{if(!confirm('Удалить локальную историю этого диалога?'))return;await deleteAIConversation(id,c.id);await refresh();}));history.append(row);}
  if(!db.contexts.length)pins.append(el('p','Сохранённых контекстов нет.','subtle'));
  for(const c of db.contexts){const row=entry(`${description(c.kind)}: ${c.title}`);row.append(actionButton('Применить',()=>apply(c)),actionButton('Удалить',async()=>{await deleteAIContext(id,c.id);await refresh();}));pins.append(row);}
  if(!db.drafts.length)draftList.append(el('p','Черновиков нет.','subtle'));
  for(const d of db.drafts){const row=entry(d.title,`Изменён ${new Date(d.updatedAt).toLocaleDateString('ru')}`);row.append(actionButton('Редактировать',()=>{draftTitle.value=d.title;draftText.value=d.text;lastDraftId=d.id;notify('Черновик открыт для редактирования.');}),actionButton('Удалить',async()=>{if(!confirm('Удалить локальный черновик?'))return;await deleteAIDraft(id,d.id);if(lastDraftId===d.id)lastDraftId=null;await refresh();}));draftList.append(row);}
 }
 async function options(){const [rules,sources,cases]=await Promise.all([listRules(),listSources(),listCases()]);const ruleRows=rules.filter(r=>r.profileId===id&&r.project===profile.project&&!r.archived&&(!r.server||r.server===profile.server)).map(r=>({id:r.id,title:`${r.revisions.find(v=>v.id===r.activeRevisionId)?.code||''} — ${r.revisions.find(v=>v.id===r.activeRevisionId)?.title||'Правило'}`}));
 const sourceItems=sources.filter(s=>s.profileId===id).map(s=>({id:s.id,title:s.title}));
 const host=profile.project==='majestic'?'forum.majestic-rp.ru':profile.project==='russia-online'?'forum.russia.online':null;
 const caseItems=cases.filter(c=>c.profileId===id&&(!host||new URL(c.url).hostname===host)).map(c=>({id:c.id,title:c.title}));
 sourceRows=kind.value==='rule'?ruleRows:kind.value==='source'?sourceItems:caseItems;
 item.replaceChildren();for(const x of sourceRows.slice(0,500)){const o=el('option',x.title.slice(0,120));o.value=x.id;item.append(o);}if(!sourceRows.length)item.append(el('option','Нет доступных записей'));}
 const selection=()=>{const row=sourceRows.find(x=>x.id===item.value);if(!row)throw Error('Выберите доступный материал');return {kind:kind.value,refId:row.id,title:row.title};};
 async function apply(ref){const resolved=await resolveAIContext(profile,ref);if(!root.isConnected||state.activeProfileId!==id)return;contextPreview.textContent=resolved.text;contextPreview.hidden=false;contextStatus.textContent=`Применён: ${resolved.title}. Прочитайте содержимое в предпросмотре запроса. Контекст будет отправлен только после отдельного согласия.`;setContext?.(resolved);notify('Контекст применён к общему AI-чату.');}
 kind.addEventListener('change',()=>{contextPreview.hidden=true;void options().catch(failed);});
 root.querySelector('#ai-workspace-apply').addEventListener('click',()=>apply(selection()).catch(failed));
 root.querySelector('#ai-workspace-pin').addEventListener('click',async()=>{try{await saveAIContext(id,selection());await refresh();notify('Контекстная ссылка сохранена локально.');}catch(err){failed(err);}});
 root.querySelector('#ai-workspace-unapply').addEventListener('click',()=>{clearContext?.();contextPreview.hidden=true;contextStatus.textContent='Контекст удалён из текущего запроса';});
 root.querySelector('#ai-workspace-save-chat').addEventListener('click',async()=>{try{const messages=getMessages?.()||[];if(!messages.length)throw Error('Нет сообщений для сохранения');const title=(messages.find(x=>x.role==='user')?.text||'Диалог').slice(0,100);await saveAIConversation(id,{id:activeConversationId,title,messages:messages.slice(-40).map(x=>({role:x.role,text:x.text.slice(0,12000)}))});await refresh();activeConversationId=db.conversations[0]?.id||null;notify('Диалог сохранён локально по вашему запросу.');}catch(err){failed(err);}});
 root.querySelector('#ai-workspace-new-chat').addEventListener('click',()=>{if(!confirm('Очистить текущий несохранённый диалог из памяти?'))return;clearMessages?.();clearContext?.();activeConversationId=null;contextPreview.hidden=true;notify('Начат новый диалог. Сохранённая история не удалена.');});
 root.querySelector('#ai-workspace-from-reply').addEventListener('click',()=>{const last=[...(getMessages?.()||[])].reverse().find(x=>x.role==='assistant'&&x.text.trim());if(!last){notify('В текущем чате пока нет ответа AI');return;}draftText.value=last.text.slice(0,12000);if(!draftTitle.value)draftTitle.value='AI — черновик для проверки';lastDraftId=null;notify('Ответ скопирован в редактируемый черновик.');});
 root.querySelector('#ai-workspace-save-draft').addEventListener('click',async()=>{try{await saveAIDraft(id,{id:lastDraftId,title:draftTitle.value.trim(),text:draftText.value.trim()});lastDraftId=null;await refresh();notify('Черновик сохранён локально по вашему запросу.');}catch(err){failed(err);}});
 root.querySelector('#ai-workspace-to-binder').addEventListener('click',async()=>{try{const title=draftTitle.value.trim(),body=draftText.value.trim();if(!title||!body||body.length>12000)throw Error('Заполните название и текст черновика');if(!confirm('Сохранить отредактированный текст как отдельный шаблон Binder 2.0? На форум он не отправится.'))return;const saved=await upsertTemplate({profileId:id,label:title,category:'AI / Черновики',text:body,format:'plain',shortcut:0});notify(`Шаблон Binder сохранён: ${saved.label}. Проверьте его перед применением.`);}catch(err){failed(err);}});
 await options();
 const current=preset;preset=null;if(current){kind.value=current.kind;await options();if(sourceRows.some(x=>x.id===current.refId)){item.value=current.refId;contextStatus.textContent='Контекст из рабочего модуля выбран. Нажмите «Применить», затем подтвердите отправку отдельно.';}else contextStatus.textContent='Переданная ссылка недоступна в текущем профиле.';}
 draw();
}
