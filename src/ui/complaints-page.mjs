import '../lib/safe-dom.js';
const { replaceHtml, insertHtml } = globalThis.MTSafeDOM;
import '../lib/complaints-core.js';
import { api } from '../lib/browser.mjs';
import { listCases } from '../lib/complaints-store.mjs';
import { escapeHtml as e } from '../lib/sites.mjs';
const C = globalThis.RPNComplaints;
const LABELS = {new:'Новая', 'in-progress':'В работе', waiting:'Ожидает', done:'Завершена'};
let cases = [], query = '', filter = 'all', selected = null;
let draftTimer;
const esc = value => e(value ?? '');
const safeDate = iso => iso ? new Date(iso).toLocaleString('ru-RU', { dateStyle:'short',timeStyle:'short'}) : 'Не указан';
const request = async (action, data = {}) => {
  const response = await api.runtime.sendMessage({type:'RP_NEXUS_CASE_MUTATE', action, ...data});
  if (!response?.ok) throw Error(response?.error || 'Операция не завершена');
  return response.value;
};
export async function refreshComplaints() { cases = await listCases(); }
function visible(state) {
  const q = query.toLocaleLowerCase('ru');
  return cases.filter(c => c.profileId === state.activeProfileId && (filter === 'all' || (filter === 'unread' ? c.unread : c.status === filter)) && [c.title,c.url,c.note,c.draft].some(t => t.toLocaleLowerCase('ru').includes(q)));
}
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
  return `<section class="workflow-panel"><div class="row spread"><h3>Процесс рассмотрения · ${esc(label)}</h3><span class="tag">Шаг ${index+1}/${stages.length}</span></div><p class="subtle">Каждый этап выполняется вручную. Отметки означают проверку пользователем; MajesticToolkit не устанавливает обстоятельства автоматически.</p>
    <div class="workflow-checks">${checks}</div>
    <div class="row"><button class="button secondary" data-case-action="workflow-previous" data-id="${esc(c.id)}" ${index===0?'disabled':''}>← Назад</button><button class="button primary" data-case-action="workflow-next" data-id="${esc(c.id)}" ${index===stages.length-1||!done?'disabled':''}>${index===stages.length-2?'Завершить рассмотрение':'Следующий этап →'}</button></div>
    <div class="workflow-draft"><label class="field">Тип проекта решения<select data-case-decision="${esc(c.id)}">${Object.entries(C.DECISION_KINDS).map(([key,title])=>`<option value="${esc(key)}" ${key===w.decision?'selected':''}>${esc(title)}</option>`).join('')}</select></label><p class="subtle">Сначала выберите тип решения, затем создайте черновик. Текст необходимо проверить и дополнить самостоятельно.</p><div class="row"><button class="button secondary" data-case-action="workflow-generate" data-id="${esc(c.id)}">Создать черновик решения</button><button class="button secondary" data-case-action="workflow-copy" data-id="${esc(c.id)}">Скопировать журнал</button></div></div>
    <label class="field">Запись в журнале<textarea data-case-note="${esc(c.id)}" maxlength="500" rows="2" placeholder="Результат проверки, причина задержки, следующий шаг"></textarea></label><div class="row"><button class="button secondary" data-case-action="workflow-note" data-id="${esc(c.id)}">Добавить запись</button></div>
    <details><summary>Журнал действий (${w.history.length})</summary><ol class="workflow-history">${history||'<li>Событий пока нет</li>'}</ol></details>
    <p class="subtle">Уведомления о сроках формируются для открытых жалоб (за сутки, час, 15 минут и после истечения срока) при запущенном браузере. Рассылка и модерация на форуме не выполняются.</p>
  </section>`;
}
export function complaintsSection(state) {
  const own = cases.filter(c => c.profileId === state.activeProfileId);
  const rows = visible(state);
  const totals = {count:own.length, open:own.filter(c => c.status !== 'done').length, unread:own.filter(c => c.unread).length, due:own.filter(c => c.deadline && c.status !== 'done' && Date.parse(c.deadline) <= Date.now()+15*60000).length};
  return `<div class="stack"><section class="card"><div class="row spread"><div><h3>Complaint Manager 1.5.0</h3><p class="lead">Жалобы, черновики и доказательства для активного профиля. Данные сохраняются только в вашем браузере.</p></div><button class="button primary" data-case-action="create">+ Добавить жалобу</button></div><div class="case-stats"><div><strong>${totals.count}</strong><small>Всего</small></div><div><strong>${totals.open}</strong><small>Активных</small></div><div><strong>${totals.unread}</strong><small>Новые сообщения</small></div><div><strong>${totals.due}</strong><small>Срок ≤15 мин</small></div></div><div class="row"><input style="flex:1;min-width:185px" id="complaint-search" type="search" aria-label="Поиск жалоб" placeholder="Найти жалобу" value="${esc(query)}"><select id="complaint-filter" aria-label="Статус жалоб" style="max-width:165px"><option value="all">Все статусы</option>${Object.entries(LABELS).map(([id,label]) => `<option value="${id}" ${filter === id ? 'selected':''}>${label}</option>`).join('')}<option value="unread" ${filter === 'unread'?'selected':''}>Непрочитанные</option></select><button class="button secondary" data-case-action="scan">Проверить открытые вкладки</button></div><p class="subtle">Проверка выполняется при открытии темы и периодически в открытых вкладках форума. В закрытом браузере и для закрытых вкладок мониторинг не работает.</p></section>
  <div class="stack" id="complaint-list">${rows.length ? rows.map(c => `<article class="card case-card" data-case-card data-filter="${esc([c.title,c.url,c.note,c.draft].join(' ').toLocaleLowerCase('ru'))}" data-status="${esc(c.status)}" data-unread="${c.unread}"><div class="row spread"><div><h3>${esc(c.title)} ${c.unread ? '<span class="tag case-soon">Есть новые сообщения</span>' : ''}</h3><p class="subtle">${esc(c.url)}</p></div><div class="row"><span class="tag">${LABELS[c.status]}</span>${deadline(c)}</div></div><p class="case-note">${esc(c.note || 'Нет заметок')}</p><div class="row"><button class="button secondary" data-url="${esc(c.url)}">Открыть тему ↗</button><button class="button secondary" data-case-action="edit" data-id="${esc(c.id)}">Редактировать</button><button class="button secondary" data-case-action="draft" data-id="${esc(c.id)}">Черновик</button><button class="button secondary" data-case-action="evidence" data-id="${esc(c.id)}">Доказательства (${c.evidence.length})</button><button class="button secondary" data-case-action="workflow-open" data-id="${esc(c.id)}">Этапы / журнал</button>${c.unread ? `<button class="button secondary" data-case-action="read" data-id="${esc(c.id)}">Прочитано</button>` : ''}<button class="button danger" data-case-action="delete" data-id="${esc(c.id)}">Удалить</button></div>${selected === c.id ? `<div class="case-expanded"><label class="field">Черновик ответа (сохраняется автоматически)<textarea data-case-draft="${esc(c.id)}" maxlength="30000" rows="7" placeholder="Ваш ответ на жалобу…">${esc(c.draft)}</textarea></label><div class="row"><button class="button secondary" data-case-action="save-draft" data-id="${esc(c.id)}">Сохранить сейчас</button><button class="button secondary" data-case-action="copy-draft" data-id="${esc(c.id)}">Копировать текст</button><button class="button primary" data-case-action="new-evidence" data-id="${esc(c.id)}">+ Доказательство</button></div><h3>Доказательства</h3>${evidenceList(c)}${workflowPanel(c)}</div>` : ''}</article>`).join('') : '<section class="card empty">Жалобы не найдены. Добавьте тему форума или измените фильтр.</section>'}</div></div>`;
}
function createDialog() {
  let dlg = document.getElementById('complaint-dialog');
  if (dlg) return dlg;
  dlg = document.createElement('dialog'); dlg.id = 'complaint-dialog';
  replaceHtml(dlg, `<form id="complaint-form"><h2 id="complaint-dialog-title">Добавить жалобу</h2><input type="hidden" name="id"><label>Название<input name="title" required maxlength="240" placeholder="Жалоба на игрока / судебное дело"></label><label>HTTPS-ссылка на тему форума<input type="url" name="url" required maxlength="2048" placeholder="https://forum.majestic-rp.ru/threads/.../"></label><div class="grid"><label>Статус<select name="status">${Object.entries(LABELS).map(([id,label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><label>Срок рассмотрения<input name="deadline" type="datetime-local"></label></div><label class="check"><input name="watching" type="checkbox" checked> Проверять новые сообщения в открытых вкладках</label><label>Заметки<textarea name="note" rows="3" maxlength="12000" placeholder="Что необходимо проверить"></textarea></label><div class="dialog-actions"><button type="button" class="button secondary" data-case-action="cancel">Отмена</button><button type="submit" class="button primary">Сохранить</button></div></form>`);
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
export function filterComplaintUI() {
  document.querySelectorAll('[data-case-card]').forEach(el => {
    el.hidden = !el.dataset.filter.includes(query.toLocaleLowerCase('ru')) || (filter !== 'all' && (filter === 'unread' ? el.dataset.unread !== 'true' : el.dataset.status !== filter));
  });
}
export function setComplaintQuery(value) { query = value; filterComplaintUI(); }
export function setComplaintFilter(value) { filter = value; filterComplaintUI(); }
export async function handleComplaintAction(button, state, render, feedback) {
  const action = button.dataset.caseAction, id = button.dataset.id;
  if (action === 'create' || action === 'edit') {
    const dlg = createDialog(), form = dlg.querySelector('form'), item = id ? cases.find(c => c.id === id) : null;
    if (id && !item) throw Error('Жалоба не найдена');
    form.reset(); form.elements.id.value = item?.id || '';
    form.elements.title.value = item?.title || '';
    form.elements.url.value = item?.url || '';
    form.elements.status.value = item?.status || 'new';
    form.elements.status.querySelector('option[value=done]').disabled = item?.workflow.stage!=='closed';
    form.elements.deadline.value = formatDatetime(item?.deadline);
    form.elements.watching.checked = item?.watching ?? true;
    form.elements.note.value = item?.note ?? '';
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
  if (action === 'delete') {
    if (!confirm(`Удалить «${item.title}», черновик и ${item.evidence.length} доказательств?`)) return;
    await request('delete', {id}); if (selected === id) selected = null;
    await refreshComplaints(); render(); feedback('Жалоба удалена'); return;
  }
  if (action === 'read') { await request('update', {id, patch:{unread:false}}); await refreshComplaints(); render(); feedback('Отмечено как прочитанное'); return; }
  if(action?.startsWith('workflow-') && action!=='workflow-open'){
    await flushDraftIfDirty(item);
    if(action==='workflow-generate'){
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
    clearTimeout(draftTimer);
    await saveDraft(id); await refreshComplaints(); feedback('Черновик сохранён'); return;
  }
  if (action === 'copy-draft') {
    const value = document.querySelector(`[data-case-draft="${CSS.escape(id)}"]`)?.value ?? item.draft;
    await navigator.clipboard.writeText(value); feedback('Черновик скопирован'); return;
  }
}
async function flushDraftIfDirty(item){
  const area=document.querySelector(`[data-case-draft="${CSS.escape(item.id)}"]`);
  if(!area || area.value===item.draft)return;
  clearTimeout(draftTimer);
  await request('update',{id:item.id,patch:{draft:area.value}});
}
async function saveDraft(id) {
  const area = document.querySelector(`[data-case-draft="${CSS.escape(id)}"]`);
  if (!area) return;
  await request('update', {id, patch:{draft:area.value}});
}
export function scheduleDraftSave(textarea, feedback) {
  clearTimeout(draftTimer);
  const id = textarea.dataset.caseDraft;
  draftTimer = setTimeout(() => { void saveDraft(id).then(() => feedback('Черновик сохранён')).catch(error => feedback(error.message, true)); }, 700);
}
export async function handleComplaintSubmit(event, state, render, feedback) {
  event.preventDefault();
  const form = event.target.elements;
  if (event.target.id === 'complaint-form') {
    const id = form.id.value;
    const input = {title:form.title.value, url:form.url.value, status:form.status.value, note:form.note.value,
      deadline:form.deadline.value ? new Date(form.deadline.value).toISOString() : null, watching:form.watching.checked};
    if (id) await request('update',{id,patch:input});
    else await request('create',{input:{...input,profileId:state.activeProfileId}});
    document.getElementById('complaint-dialog')?.close();
    await refreshComplaints(); render(); feedback(id ? 'Жалоба обновлена':'Жалоба добавлена'); return;
  }
  if (event.target.id === 'complaint-evidence-form') {
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
