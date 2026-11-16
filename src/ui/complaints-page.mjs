import '../lib/safe-dom.js';
const { replaceHtml, insertHtml } = globalThis.MTSafeDOM;
import '../lib/complaints-core.js';
import { api } from '../lib/browser.mjs';
import {insertCaseDecision} from '../lib/forum-document.mjs';
import {getActiveProfile} from '../lib/model.mjs';
import {assertDecisionReady} from '../lib/moderation-core.mjs';
import {listRules} from '../lib/rules-store.mjs';
import {QUEUES,SORTS,cleanFilter,cleanSavedViews,selectCases,matchesQueue} from '../lib/complaint-queue.mjs';
import {modifyState} from '../lib/state.mjs';
import { listCases } from '../lib/complaints-store.mjs';
import { escapeHtml as e } from '../lib/sites.mjs';
const C = globalThis.RPNComplaints;
const LABELS = {new:'Новая', 'in-progress':'В работе', waiting:'Ожидает', done:'Завершена'};
let cases = [], rules=[], query = '', filter = 'all', selected = null, activeState, currentProfile, page=0, savedViewId='';
let criteria=cleanFilter(), checked=new Set();
const PAGE_SIZE=25;
const pendingDrafts=new Map();
const esc = value => e(value ?? '');
const safeDate = iso => iso ? new Date(iso).toLocaleString('ru-RU', { dateStyle:'short',timeStyle:'short'}) : 'Не указан';
const request = async (action, data = {}) => {
  const response = await api.runtime.sendMessage({type:'RP_NEXUS_CASE_MUTATE', action, ...data});
  if (!response?.ok) throw Error(response?.error || 'Операция не завершена');
  return response.value;
};
export async function refreshComplaints() { cases = await listCases(); rules=await listRules().catch(()=>[]); }
function visible(state) {return selectCases(cases,state.activeProfileId,{...criteria,query,queue:filter},rules);}
function opts(map,value){return Object.entries(map).map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');}
function triageFields(t={}){return `<div class="grid"><label>Приоритет<select name="priority">${opts(C.PRIORITY_LABELS,t.priority??'normal')}</select></label><label>Категория<input name="category" maxlength="80" value="${esc(t.category)}" placeholder="STATE / CRIME"></label><label>Раздел<input name="section" maxlength="180" value="${esc(t.section)}"></label><label>Ответственный (локально)<input name="assignee" maxlength="100" value="${esc(t.assignee)}"></label></div><label>Теги через запятую<input name="tags" maxlength="819" value="${esc(t.tags?.join(', '))}"></label>`;}
function triageInput(form){return {priority:form.priority.value,category:form.category.value,section:form.section.value,assignee:form.assignee.value,tags:form.tags.value.split(',').map(x=>x.trim()).filter(Boolean)};}
function deadline(c) {
  if (!c.deadline || c.status === 'done') return '';
  const minutes = (Date.parse(c.deadline) - Date.now()) / 60000;
  return `<span class="tag ${minutes <= 0 ? 'case-overdue' : minutes <= 15 ? 'case-soon' : ''}">${minutes <= 0 ? 'Просрочено' : minutes <= 15 ? 'Скоро срок' : 'До срока'} · ${esc(safeDate(c.deadline))}</span>`;
}
function linkForEvidence(item) {
  const url = new URL(item.url);
  if (item.seconds !== null && ['youtube.com','www.youtube.com','youtu.be'].includes(url.hostname)) url.searchParams.set('t', String(item.seconds) + 's');
  return url.href;
}
function evidenceList(c) {
  return c.evidence.length ? c.evidence.map(it => `<div class="case-evidence"><div><strong>${esc(it.title)}</strong> ${it.seconds !== null ? `<span class="tag">${C.timecode(it.seconds)}</span>` : ''}<p class="subtle">${esc(it.note)}</p></div><div class="row"><button class="button secondary" data-url="${esc(linkForEvidence(it))}">Открыть ↗</button><button class="button danger" data-case-action="delete-evidence" data-id="${esc(c.id)}" data-evidence-id="${esc(it.id)}">Удалить</button></div></div>`).join('') : '<p class="subtle">Доказательства пока не прикреплены.</p>';
}
function workflowPanel(c){
  const w=c.workflow,stage=w.stage,stages=C.WORKFLOW_STAGES,index=stages.indexOf(stage);
  const label=C.WORKFLOW_LABELS[stage],done=w.checks[stage]??false;
  const checks=stages.slice(0,-1).map((name,i)=>`<div class="workflow-check ${i>index?'workflow-locked':''}"><span>${i+1}. ${esc(C.WORKFLOW_LABELS[name])}</span><label class="check"><input type="checkbox" data-case-workflow-check="${esc(name)}" data-id="${esc(c.id)}" ${w.checks[name]?'checked':''} ${i>index?'disabled':''}> ${esc(C.WORKFLOW_CHECKS[name])}</label></div>`).join('');
  const history=w.history.slice(-30).reverse().map(row=>`<li><small>${esc(safeDate(row.at))}</small> · ${esc(row.text)}</li>`).join('');
  return `<section class="workflow-panel"><div class="row spread"><h3>Процесс рассмотрения · ${esc(label)}</h3><span class="tag">Шаг ${index+1}/${stages.length}</span></div><p class="subtle">${c.moderation?'Расчёт санкций: '+(c.moderation.status==='reviewed'?'проверен пользователем':'требует проверки')+'. ':''}Каждый этап выполняется вручную. Отметки означают проверку пользователем; MajesticToolkit не устанавливает обстоятельства автоматически.</p>
    <div class="workflow-checks">${checks}</div>
    <div class="row"><button class="button secondary" data-case-action="workflow-previous" data-id="${esc(c.id)}" ${index===0?'disabled':''}>← Назад</button><button class="button primary" data-case-action="workflow-next" data-id="${esc(c.id)}" ${index===stages.length-1||!done?'disabled':''}>${index===stages.length-2?'Завершить рассмотрение':'Следующий этап →'}</button></div>
    <div class="workflow-draft"><label class="field">Тип проекта решения<select data-case-decision="${esc(c.id)}">${Object.entries(C.DECISION_KINDS).map(([key,title])=>`<option value="${esc(key)}" ${key===w.decision?'selected':''}>${esc(title)}</option>`).join('')}</select></label><p class="subtle">Сначала выберите тип решения, затем создайте черновик. Текст необходимо проверить и дополнить самостоятельно.</p><div class="row"><button class="button secondary" data-case-action="workflow-generate" data-id="${esc(c.id)}">Создать черновик решения</button><button class="button secondary" data-case-action="workflow-copy" data-id="${esc(c.id)}">Скопировать журнал</button></div></div>
    <label class="field">Запись в журнале<textarea data-case-note="${esc(c.id)}" maxlength="500" rows="2" placeholder="Результат проверки, причина задержки, следующий шаг"></textarea></label><div class="row"><button class="button secondary" data-case-action="workflow-note" data-id="${esc(c.id)}">Добавить запись</button></div>
    <details><summary>Журнал действий (${w.history.length})</summary><ol class="workflow-history">${history||'<li>Событий пока нет</li>'}</ol></details>
    <p class="subtle">Уведомления о сроках формируются для открытых жалоб (за сутки, час, 15 минут и после истечения срока) при запущенном браузере. Рассылка и модерация на форуме не выполняются.</p>
  </section>`;
}
export function complaintsSection(state) {
  activeState=state;if(currentProfile!==state.activeProfileId){currentProfile=state.activeProfileId;criteria=cleanFilter();query='';filter='all';selected=null;checked.clear();page=0;savedViewId='';}
  const own = cases.filter(c => c.profileId === state.activeProfileId);
  for(const id of checked)if(!own.some(c=>c.id===id))checked.delete(id);
  const rows = visible(state);
  const totals = {count:own.length, open:own.filter(c => c.status !== 'done').length, unread:own.filter(c => c.unread).length, due:own.filter(c => c.deadline && c.status !== 'done' && Date.parse(c.deadline) <= Date.now()+15*60000).length};
  return `<div class="stack"><section class="card"><div class="row spread"><div><h3>Complaint Manager 2.0 · 1.7.1</h3><p class="lead">Жалобы, черновики и доказательства для активного профиля. Данные сохраняются только в вашем браузере.</p></div><button class="button primary" data-case-action="create">+ Добавить жалобу</button></div><div class="case-stats"><div><strong>${totals.count}</strong><small>Всего</small></div><div><strong>${totals.open}</strong><small>Активных</small></div><div><strong>${totals.unread}</strong><small>Новые сообщения</small></div><div><strong>${totals.due}</strong><small>Срок ≤15 мин</small></div></div><div class="row"><input style="flex:1;min-width:185px" id="complaint-search" type="search" aria-label="Поиск жалоб" maxlength="240" placeholder="Тема, игрок, правило, тег…" value="${esc(query)}"><select id="complaint-filter" aria-label="Статус жалоб" style="max-width:165px">${opts(QUEUES,filter)}</select><button class="button secondary" data-case-action="scan">Проверить открытые вкладки</button></div><p class="subtle">Проверка выполняется при открытии темы и периодически в открытых вкладках форума. В закрытом браузере и для закрытых вкладок мониторинг не работает.</p></section>
  ${queueControls(state)}<div id="complaint-list" class="stack">${rowsMarkup(rows)}</div></div>`;
}
function rowsMarkup(all){
 const pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));page=Math.min(page,pages-1);const rows=all.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 return `<div class="row spread"><small>Найдено: ${all.length} · Страница ${page+1}/${pages}</small><div class="row"><button class="button secondary" data-case-action="page-prev" ${page===0?'disabled':''}>←</button><button class="button secondary" data-case-action="page-next" ${page+1>=pages?'disabled':''}>→</button></div></div>${rows.length ? rows.map(c => `<article class="card case-card" data-case-card data-id="${esc(c.id)}" data-status="${esc(c.status)}" data-unread="${c.unread}"><div class="row spread"><div><label class="check"><input type="checkbox" data-case-select="${esc(c.id)}" ${checked.has(c.id)?'checked':''}> Выбрать</label><h3>${esc(c.title)} ${c.unread ? '<span class="tag case-soon">Есть новые сообщения</span>' : ''}</h3><p class="subtle">${esc(c.url)}</p></div><div class="row"><span class="tag">${LABELS[c.status]}</span>${deadline(c)}<span class="tag">${esc(C.PRIORITY_LABELS[c.triage.priority])}</span>${c.triage.queue!=='active'?`<span class="tag">${esc(QUEUES[c.triage.queue]??c.triage.queue)}</span>`:''}</div></div><p class="subtle">${esc([c.triage.category,c.triage.section,c.triage.assignee,c.triage.tags.join(', '),c.triage.reason].filter(Boolean).join(' · '))} · Форум: ${esc(c.forumState.state==='open'?'наблюдалась открытая тема':c.forumState.state==='closed'?'наблюдалась закрытая тема':'статус не подтверждён')}${c.forumState.observedAt?' · '+esc(safeDate(c.forumState.observedAt)):''}</p><p class="case-note">${esc(c.note || 'Нет заметок')}</p><div class="row"><button class="button secondary" data-url="${esc(c.url)}">Открыть тему ↗</button><button class="button secondary" data-case-action="edit" data-id="${esc(c.id)}">Редактировать</button><button class="button secondary" data-case-action="draft" data-id="${esc(c.id)}">Черновик</button><button class="button secondary" data-case-action="evidence" data-id="${esc(c.id)}">Доказательства (${c.evidence.length})</button><button class="button secondary" data-case-action="moderation" data-id="${esc(c.id)}">Нарушения и наказания ↗</button><button class="button secondary" data-case-action="workflow-open" data-id="${esc(c.id)}">Этапы / журнал</button>${c.unread ? `<button class="button secondary" data-case-action="read" data-id="${esc(c.id)}">Прочитано</button>` : ''}${c.status==='done'?`<button class="button secondary" data-case-action="queue-${c.triage.queue==='archived'?'restore':'archive'}" data-id="${esc(c.id)}">${c.triage.queue==='archived'?'Из архива':'В архив'}</button><button class="button secondary" data-case-action="queue-reopen" data-id="${esc(c.id)}">Открыть повторно</button>`:`<button class="button secondary" data-case-action="queue-${c.status==='waiting'?'resume':'wait'}" data-id="${esc(c.id)}">${c.status==='waiting'?'Продолжить':'Ожидание'}</button><button class="button secondary" data-case-action="queue-refer" data-id="${esc(c.id)}">Передать</button><button class="button secondary" data-case-action="queue-recheck" data-id="${esc(c.id)}">На перепроверку</button>`}<button class="button danger" data-case-action="delete" data-id="${esc(c.id)}">Удалить</button></div>${selected === c.id ? `<div class="case-expanded"><label class="field">Черновик ответа (сохраняется автоматически)<textarea data-case-draft="${esc(c.id)}" maxlength="30000" rows="7" placeholder="Ваш ответ на жалобу…">${esc(pendingDrafts.get(c.id)??c.draft)}</textarea></label><div class="row"><button class="button secondary" data-case-action="save-draft" data-id="${esc(c.id)}">Сохранить сейчас</button><button class="button secondary" data-case-action="copy-draft" data-id="${esc(c.id)}">Копировать текст</button><button class="button primary" data-case-action="new-evidence" data-id="${esc(c.id)}">+ Доказательство</button></div><h3>Доказательства</h3>${evidenceList(c)}<section class="workflow-panel"><h3>Нарушения и наказания</h3><p class="subtle">${c.moderation?`${c.moderation.players.length} участников · ${c.moderation.players.reduce((n,p)=>n+p.items.length,0)} санкций · ${esc(c.moderation.status==='reviewed'?'Проверено пользователем':c.moderation.status==='calculated'?'Предварительный расчёт':'Черновик')}`:'Расчёт пока не привязан.'}</p><div class="row"><button class="button primary" data-case-action="moderation" data-id="${esc(c.id)}">Открыть рассмотрение ↗</button><button class="button secondary" data-case-action="insert-decision" data-id="${esc(c.id)}">Вставить черновик в тему</button></div></section>${workflowPanel(c)}</div>` : ''}</article>`).join('') : '<section class="card empty">Жалобы не найдены. Добавьте тему форума или измените фильтр.</section>'}`;
}
function queueControls(state){
 const own=cases.filter(c=>c.profileId===state.activeProfileId),views=getActiveProfile(state).complaintViews??[];
 return `<section class="card stack"><div class="row wrap">${Object.entries(QUEUES).map(([key,label])=>`<button class="button ${filter===key?'primary':'secondary'}" data-case-action="queue-filter" data-queue="${key}">${esc(label)} · ${own.filter(c=>matchesQueue(c,key)).length}</button>`).join('')}</div><div class="grid"><label>Приоритет<select id="case-priority-filter">${opts({all:'Все',...C.PRIORITY_LABELS},criteria.priority)}</select></label><label>Сортировка<select id="case-sort">${opts(SORTS,criteria.sort)}</select></label><label>Категория<input id="case-category-filter" maxlength="80" value="${esc(criteria.category)}"></label><label>Ответственный<input id="case-assignee-filter" maxlength="100" value="${esc(criteria.assignee)}"></label><label>Тег<input id="case-tag-filter" maxlength="40" value="${esc(criteria.tag)}"></label></div><div class="row"><select id="case-saved-view" aria-label="Сохранённые фильтры"><option value="">Сохранённые фильтры</option>${views.map(v=>`<option value="${esc(v.id)}" ${savedViewId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select><button class="button secondary" data-case-action="save-view">Сохранить фильтр</button><button class="button secondary" data-case-action="delete-view">Удалить фильтр</button><button class="button secondary" data-case-action="reset-filter">Сбросить</button></div><div class="row"><button class="button secondary" data-case-action="select-page">Выбрать страницу</button><button class="button secondary" data-case-action="clear-selection">Снять выбор</button><button class="button primary" data-case-action="batch">Пакетные операции (<span id="case-selection-count">${checked.size}</span>)</button></div></section>`;
}

function createDialog() {
  let dlg = document.getElementById('complaint-dialog');
  if (dlg) return dlg;
  dlg = document.createElement('dialog'); dlg.id = 'complaint-dialog';
  replaceHtml(dlg, `<form id="complaint-form"><h2 id="complaint-dialog-title">Добавить жалобу</h2><input type="hidden" name="id"><label>Название<input name="title" required maxlength="240" placeholder="Жалоба на игрока / судебное дело"></label><label>HTTPS-ссылка на тему форума<input type="url" name="url" required maxlength="2048" placeholder="https://forum.majestic-rp.ru/threads/.../"></label><div class="grid"><label>Статус<select name="status">${Object.entries(LABELS).map(([id,label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><label>Срок рассмотрения<input name="deadline" type="datetime-local"></label></div>${triageFields()}<label class="check"><input name="watching" type="checkbox" checked> Проверять новые сообщения в открытых вкладках</label><label>Заметки<textarea name="note" rows="3" maxlength="12000" placeholder="Что необходимо проверить"></textarea></label><div class="dialog-actions"><button type="button" class="button secondary" data-case-action="cancel">Отмена</button><button type="submit" class="button primary">Сохранить</button></div></form>`);
  document.body.append(dlg);
  return dlg;
}
function evidenceDialog() {
  let dlg = document.getElementById('evidence-dialog');
  if (dlg) return dlg;
  dlg = document.createElement('dialog'); dlg.id = 'evidence-dialog';
  replaceHtml(dlg, `<form id="complaint-evidence-form"><h2>Добавить доказательство</h2><input type="hidden" name="caseId"><label>Название<input name="title" required maxlength="180" placeholder="Видеозапись №1"></label><label>HTTPS-ссылка<input name="url" type="url" required maxlength="2048" placeholder="https://www.youtube.com/watch?v=..."></label><label>Таймкод (секунды, необязательно)<input name="seconds" type="number" min="0" max="86400" step="1" placeholder="125"></label><label>Комментарий<textarea name="note" maxlength="1000" rows="3"></textarea></label><div class="dialog-actions"><button type="button" class="button secondary" data-case-action="cancel-evidence">Отмена</button><button type="submit" class="button primary">Прикрепить</button></div></form>`);
  document.body.append(dlg);
  return dlg;
}
function formatDatetime(iso) {
  if (!iso) return '';
  const d = new Date(iso), local = new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}
export function filterComplaintUI() {if(activeState){const list=document.getElementById('complaint-list');if(list)replaceHtml(list,rowsMarkup(visible(activeState)));}}
export function setComplaintQuery(value) {query=value;page=0;filterComplaintUI();}
export function setComplaintFilter(value) {filter=value;page=0;filterComplaintUI();document.querySelectorAll('[data-case-action=queue-filter]').forEach(b=>{b.classList.toggle('primary',b.dataset.queue===filter);b.classList.toggle('secondary',b.dataset.queue!==filter);});}
export function handleComplaintQueueChange(el,state,render){
 if(el.dataset.caseSelect){if(el.checked){if(checked.size>=100){el.checked=false;return true;}checked.add(el.dataset.caseSelect);}else checked.delete(el.dataset.caseSelect);document.getElementById('case-selection-count').textContent=checked.size;return true;}
 const fields={'case-priority-filter':'priority','case-sort':'sort','case-category-filter':'category','case-assignee-filter':'assignee','case-tag-filter':'tag'};
 if(fields[el.id]){criteria=cleanFilter({...criteria,[fields[el.id]]:el.value});page=0;filterComplaintUI();return true;}
 if(el.id==='case-saved-view'){const view=getActiveProfile(state).complaintViews?.find(v=>v.id===el.value);if(view){savedViewId=view.id;criteria=cleanFilter(view.filter);query=criteria.query;filter=criteria.queue;page=0;render();document.getElementById('case-saved-view').value=view.id;}return true;}return false;
}
function batchDialog(){let dlg=document.getElementById('case-batch-dialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='case-batch-dialog';document.body.append(dlg);}replaceHtml(dlg,`<form id="case-batch-form"><h2>Пакетные локальные операции · ${checked.size}</h2><p class="subtle">Применяется только выбранное поле. Не отправляет действия на форум.</p><label>Операция<select name="operation"><option value="priority">Приоритет</option><option value="category">Категория</option><option value="section">Раздел</option><option value="assignee">Ответственный</option><option value="tags">Заменить теги</option><option value="watching-on">Включить отслеживание</option><option value="watching-off">Выключить отслеживание</option><option value="finish">Завершить проверенные дела</option><option value="archive">В архив (завершённые)</option><option value="restore">Из архива</option></select></label><label>Приоритет<select name="priority">${opts(C.PRIORITY_LABELS,'normal')}</select></label><label>Текстовое значение (для категории, раздела, ответственного, тегов)<input name="text" maxlength="819"></label><div class="dialog-actions"><button type="button" class="button secondary" data-case-action="batch-cancel">Отмена</button><button class="button primary" type="submit">Применить</button></div></form>`);return dlg;}
export async function handleComplaintAction(button, state, render, feedback) {
  const action = button.dataset.caseAction, id = button.dataset.id;
  if(action==='queue-filter'){filter=button.dataset.queue;page=0;render();return;}
  if(action==='page-prev'||action==='page-next'){page=Math.max(0,page+(action==='page-next'?1:-1));filterComplaintUI();return;}
  if(action==='select-page'||action==='clear-selection'){if(action==='clear-selection')checked.clear();else for(const c of visible(state).slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){if(checked.size<100)checked.add(c.id);}render();return;}
  if(action==='reset-filter'){savedViewId='';criteria=cleanFilter();query='';filter='all';page=0;render();return;}
  if(action==='batch-cancel'){document.getElementById('case-batch-dialog')?.close();return;}
  if(action==='batch'){if(!checked.size)throw Error('Выберите жалобы');batchDialog().showModal();return;}
  if(action==='save-view'||action==='delete-view'){
    const profileId=state.activeProfileId,viewId=document.getElementById('case-saved-view')?.value;
    const name=action==='save-view'?prompt('Название фильтра','Мои жалобы'):null;if(action==='save-view'&&!name?.trim())return;if(action==='delete-view'&&(!viewId||!confirm('Удалить сохранённый фильтр?')))return;
    const next=await modifyState(s=>{if(s.activeProfileId!==profileId)throw Error('Активный профиль изменился');return {...s,profiles:s.profiles.map(p=>p.id!==profileId?p:{...p,complaintViews:cleanSavedViews(action==='save-view'?[...(p.complaintViews??[]),{id:crypto.randomUUID(),name:name.trim(),filter:{...criteria,queue:filter,query}}]:(p.complaintViews??[]).filter(v=>v.id!==viewId))})};});state.profiles=next.profiles;if(action==='delete-view')savedViewId='';render();feedback('Фильтры сохранены');return;
  }

  if (action === 'create' || action === 'edit') {
    const dlg = createDialog(), form = dlg.querySelector('form'), item = id ? cases.find(c => c.id === id) : null;
    if (id && !item) throw Error('Жалоба не найдена');
    form.reset(); form.elements.namedItem('id').value = item?.id || '';
    form.elements.title.value = item?.title || '';
    form.elements.url.value = item?.url || '';
    form.elements.status.value = item?.status || 'new';
    form.elements.status.querySelector('option[value=done]').disabled = item?.workflow.stage!=='closed';
    form.elements.deadline.value = formatDatetime(item?.deadline);
    form.elements.watching.checked = item?.watching ?? true;
    form.elements.note.value = item?.note ?? '';
    const t=item?.triage??C.cleanTriage();for(const k of ['priority','category','section','assignee'])form.elements[k].value=t[k];form.elements.tags.value=t.tags.join(', ');
    form.elements.url.readOnly = Boolean(item);
    dlg.querySelector('h2').textContent = item ? 'Изменить жалобу' : 'Добавить жалобу';
    dlg.showModal(); form.elements.title.focus(); return;
  }
  if (action === 'cancel') { document.getElementById('complaint-dialog')?.close(); return; }
  if (action === 'cancel-evidence') { document.getElementById('evidence-dialog')?.close(); return; }
  if (action === 'scan') {
    const response = await api.runtime.sendMessage({type:'RP_NEXUS_SCAN_OPEN_TABS'});
    if (!response?.ok) throw Error(response?.error || 'Проверка не удалась');
    await refreshComplaints(); render(); feedback(`Проверено открытых вкладок: ${response.value ?? 0}`); return;
  }
  const item = cases.find(c => c.id === id);
  if (!item || item.profileId!==state.activeProfileId) throw Error('Жалоба не найдена в текущем профиле');
  if(action.startsWith('queue-')){const operation=action.slice(6);const reason=['wait','refer','reopen','recheck'].includes(operation)?prompt('Причина изменения очереди',''):'';if(reason===null)return;await flushDraftIfDirty(item);await request('queue',{profileId:state.activeProfileId,ids:[id],operation,input:{reason}});await refreshComplaints();render();feedback('Очередь обновлена');return;}
  if(action==='moderation'){await flushDraftIfDirty(item);const params=new URLSearchParams({calculator:'1',calcProfile:item.profileId,caseId:item.id,thread:item.threadKey});await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?'+params+'#rules')});return;}
  if(action==='insert-decision'){await flushDraftIfDirty(item);await refreshComplaints();const fresh=cases.find(c=>c.id===id),profile=getActiveProfile(state);assertDecisionReady(fresh,profile,await listRules());if(await insertCaseDecision(profile,fresh))feedback('Черновик вставлен. Отправка вручную.');return;}
  if (action === 'delete') {
    if (!confirm(`Удалить «${item.title}», черновик и ${item.evidence.length} доказательств?`)) return;
    clearTimeout(draftTimers.get(id));draftTimers.delete(id);pendingDrafts.delete(id);checked.delete(id);await request('delete', {id}); if (selected === id) selected = null;
    await refreshComplaints(); render(); feedback('Жалоба удалена'); return;
  }
  if (action === 'read') { await request('update', {id, patch:{unread:false}}); await refreshComplaints(); render(); feedback('Отмечено как прочитанное'); return; }
  if(action?.startsWith('workflow-') && action!=='workflow-open'){
    await flushDraftIfDirty(item);
    if(action==='workflow-generate'){
      if(item.moderation){const params=new URLSearchParams({calculator:'1',calcProfile:item.profileId,caseId:item.id});await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?'+params+'#rules')});return;}
      const liveDraft=document.querySelector(`[data-case-draft="${CSS.escape(id)}"]`)?.value ?? item.draft;
      if(liveDraft && !confirm('Заменить существующий черновик новым шаблоном решения?'))return;
      const draft=C.draftDecision(item);
      await request('update',{id,patch:{draft}});
      await refreshComplaints();selected=id;render();feedback('Черновик создан. Проверьте все факты и нормы перед использованием.');return;
    }
    if(action==='workflow-copy'){
      await navigator.clipboard.writeText(item.workflow.history.map(row=>`${safeDate(row.at)} — ${row.text}`).join('\n'));
      feedback('Журнал скопирован');return;
    }
    if(action==='workflow-note'){
      const input=document.querySelector(`[data-case-note="${CSS.escape(id)}"]`);
      await request('workflow',{id,workflowAction:'note',payload:{text:input?.value||''}});
    } else {
      const previous=action==='workflow-previous';
      const confirmFinish=action==='workflow-next'&&item.workflow.stage==='decision';
      if(confirmFinish&&!confirm('Завершить рассмотрение? Действие изменит статус жалобы, но ничего не отправит на форум.'))return;
      await request('workflow',{id,workflowAction:previous?'previous':'next',payload:{confirm:confirmFinish}});
    }
    await refreshComplaints();selected=id;render();feedback('Процесс рассмотрения обновлён');return;
  }
  if (action === 'draft' || action === 'evidence' || action === 'workflow-open') {
    selected = selected === id ? null : id; render();
    if (selected && action === 'draft') document.querySelector(`[data-case-draft="${CSS.escape(id)}"]`)?.focus();
    return;
  }
  if (action === 'new-evidence') { const dlg = evidenceDialog(), form = dlg.querySelector('form'); form.reset(); form.elements.caseId.value = id; dlg.showModal(); form.elements.title.focus(); return; }
  if (action === 'delete-evidence') {
    if (!confirm('Удалить доказательство из жалобы?')) return;
    await request('removeEvidence', {id, evidenceId:button.dataset.evidenceId}); await refreshComplaints(); render(); feedback('Доказательство удалено'); return;
  }
  if (action === 'save-draft') {
    clearTimeout(draftTimers.get(id));
    await saveDraft(id); await refreshComplaints(); feedback('Черновик сохранён'); return;
  }
  if (action === 'copy-draft') {
    const value = document.querySelector(`[data-case-draft="${CSS.escape(id)}"]`)?.value ?? item.draft;
    await navigator.clipboard.writeText(value); feedback('Черновик скопирован'); return;
  }
}
async function flushDraftIfDirty(item){
  const area=document.querySelector(`[data-case-draft="${CSS.escape(item.id)}"]`);const value=pendingDrafts.get(item.id)??area?.value;
  if(value===undefined||value===item.draft)return;
  clearTimeout(draftTimers.get(item.id));draftTimers.delete(item.id);await saveDraft(item.id,value);
}
async function saveDraft(id,value=pendingDrafts.get(id)??document.querySelector(`[data-case-draft="${CSS.escape(id)}"]`)?.value) {
 if(value===undefined)return;await request('update',{id,patch:{draft:value}});if(pendingDrafts.get(id)===value)pendingDrafts.delete(id);
}
const draftTimers=new Map();
export function scheduleDraftSave(textarea, feedback) {
 const id=textarea.dataset.caseDraft,value=textarea.value;pendingDrafts.set(id,value);clearTimeout(draftTimers.get(id));
 draftTimers.set(id,setTimeout(()=>{draftTimers.delete(id);void saveDraft(id,value).then(()=>feedback('Черновик сохранён')).catch(error=>feedback(error.message,true));},700));
}
export async function handleComplaintSubmit(event, state, render, feedback) {
  event.preventDefault();
  const form = event.target.elements;
  if(event.target.getAttribute('id')==='case-batch-form'){
    const op=form.operation.value, text=form.text.value, input=op==='priority'?{priority:form.priority.value}:op==='tags'?{tags:text.split(',').map(x=>x.trim()).filter(Boolean)}:op.startsWith('watching-')?{watching:op==='watching-on'}:{[op]:text};
    if(!confirm(`Применить локальную операцию к ${checked.size} жалобам?`))return;for(const c of cases.filter(c=>checked.has(c.id)))await flushDraftIfDirty(c);
    const operation=['archive','restore','finish'].includes(op)?op:'triage';if(op==='finish')input.confirm=true;await request('queue',{profileId:state.activeProfileId,ids:[...checked],operation,input});checked.clear();document.getElementById('case-batch-dialog')?.close();await refreshComplaints();render();feedback('Пакетная операция завершена');return;
  }

  if (event.target.getAttribute('id') === 'complaint-form') {
    const id = form.namedItem('id').value;
    const input = {title:form.title.value, url:form.url.value, status:form.status.value, note:form.note.value,
      deadline:form.deadline.value ? new Date(form.deadline.value).toISOString() : null, watching:form.watching.checked,triage:triageInput(form)};
    if (id) await request('update',{id,patch:input});
    else await request('create',{input:{...input,profileId:state.activeProfileId}});
    document.getElementById('complaint-dialog')?.close();
    await refreshComplaints(); render(); feedback(id ? 'Жалоба обновлена':'Жалоба добавлена'); return;
  }
  if (event.target.getAttribute('id') === 'complaint-evidence-form') {
    const caseId = form.caseId.value;
    const input = {url:form.url.value,title:form.title.value,seconds:form.seconds.value === '' ? null : Number(form.seconds.value),note:form.note.value};
    await request('addEvidence',{id:caseId,input});
    document.getElementById('evidence-dialog')?.close(); selected = caseId;
    await refreshComplaints(); render(); feedback('Доказательство прикреплено');
  }
}

export async function handleComplaintWorkflowChange(input,state,render,feedback){
  const id=input.dataset.caseWorkflowCheck||input.dataset.caseDecision;
  if(!id)return false;
  const item=cases.find(c=>c.id===input.dataset.id||c.id===input.dataset.caseDecision);
  if(!item||item.profileId!==state.activeProfileId)throw Error('Жалоба не найдена в активном профиле');
  const check=Boolean(input.dataset.caseWorkflowCheck);
  try{
    await flushDraftIfDirty(item);
    await request('workflow',{id:item.id,workflowAction:check?'check':'decision',payload:check?{stage:input.dataset.caseWorkflowCheck,done:input.checked}:{kind:input.value}});
  }catch(error){if(check)input.checked=!input.checked;throw error;}
  await refreshComplaints();selected=item.id;render();feedback('Настройка рассмотрения сохранена');return true;
}
