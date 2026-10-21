import { api, openSidePanel, openTab, openWorkspace } from '../lib/browser.mjs';
import { addProfile, deleteProfile, editProfile, getActiveProfile, projectLabel, savePreferences, selectProfile } from '../lib/model.mjs';
import { loadState, modifyState, restoreState, STORAGE_KEY } from '../lib/state.mjs';
import { BOOKMARKS, FORUM_SITE, RUSSIA_FORUM, escapeHtml as e } from '../lib/sites.mjs';
import { forumSection, refreshForum, handleForumAction, handleForumSubmit, filterForum } from './forum-page.mjs';
import { listTemplates, replaceTemplates } from '../lib/forum-store.mjs';
import { validateState } from '../lib/model.mjs';
import { complaintsSection, refreshComplaints, handleComplaintAction, handleComplaintSubmit, setComplaintQuery, setComplaintFilter, scheduleDraftSave } from './complaints-page.mjs';
import { listCases } from '../lib/complaints-store.mjs';
import '../lib/complaints-core.js';
import '../lib/forum-core.js';
import { economySection, refreshEconomy, handleEconomyAction, handleEconomySubmit, setEconomyFilter, setEconomySearch } from './economy-page.mjs';
import { replaceEconomy, listEconomy as listEconomyRecords } from '../lib/economy-store.mjs';
import { makeBackupV6, parseBackupV6 } from '../lib/government-backup.mjs';
import { lawSection, refreshLaw, lawRecords, handleLawAction, handleLawSubmit, importLawFile, setLawQuery, setLawFavOnly, setLawEdition } from './law-page.mjs';
import { replaceLawRecords } from '../lib/law-store.mjs';
import { governmentSection, refreshGovernment, governmentRecords, handleGovernmentAction, handleGovernmentLawChange, handleGovernmentSubmit } from './government-page.mjs';
import { replaceGovernment } from '../lib/government-store.mjs';
const app = document.getElementById('app');
const notice = document.getElementById('notice');
const dialog = document.getElementById('profile-dialog');
const mode = document.body.dataset.mode;
const popup = mode === 'popup';
let state;
let view = 'home';
let permissionGranted = false;
let russiaPermissionGranted = false;
let videoPermissionGranted = false;
const VIDEO_ORIGINS = ['https://www.youtube.com/*','https://rutube.ru/*','https://www.twitch.tv/*'];
let timeout;
const NAV = [ ['home','Обзор','⌂'], ['forum','Форум','▤'], ['complaints','Жалобы','◷'], ['economy','Экономика','▥'], ['law','Законы','⚖'], ['government','Ведомства','§'], ['profiles','Профили','◉'], ['sites','Сайты и доступ','↗'], ['settings','Настройки','⚙'], ['backup','Резервные копии','⇩'] ];

function feedback(message, isError = false) {
  notice.textContent = message;
  notice.className = isError ? 'error notice' : 'notice';
  clearTimeout(timeout);
  timeout = setTimeout(() => { notice.textContent = ''; notice.className = ''; }, isError ? 7000 : 4500);
}
function tag(text) { return `<span class="tag">${e(text)}</span>`; }
function profileRow(p) {
  const active = state.activeProfileId === p.id;
  return `<article class="card profile-card ${active ? 'active' : ''}"><div class="profile-title"><strong>${e(p.name)}</strong>${active ? tag('Активный') : ''}</div><p class="subtle">${e(projectLabel(p.project))} · ${e(p.server)}</p><div class="row">${!active ? `<button class="button primary" data-action="activate" data-id="${e(p.id)}">Выбрать</button>` : ''}<button class="button secondary" data-action="edit" data-id="${e(p.id)}">Изменить</button><button class="button danger" data-action="delete" data-id="${e(p.id)}" ${state.profiles.length === 1 ? 'disabled' : ''}>Удалить</button></div></article>`;
}
function sectionHome() {
  const active = getActiveProfile(state);
  return `<div class="stack"><section class="card hero"><div class="eyebrow">Активный профиль</div><h3>${e(active.name)}</h3><p>${e(projectLabel(active.project))} · ${e(active.server)}</p><div class="row" style="margin-top:17px"><button class="button" data-action="edit" data-id="${e(active.id)}">Настроить профиль</button>${active.forumUrl ? `<button class="button" data-url="${e(active.forumUrl)}">Открыть форум ↗</button>` : ''}</div></section><div class="grid"><section class="card"><p class="eyebrow">Профили</p><div class="stat">${state.profiles.length}</div><p class="subtle">Отдельные RP-проекты и серверы</p><button class="button secondary" data-action="nav" data-view="profiles">Управлять профилями</button></section><section class="card"><p class="eyebrow">Интеграция с форумом</p><div class="stat">${permissionGranted ? 'Включена' : 'Выключена'}</div><p class="subtle">Кнопка MajesticToolkit на официальном форуме Majestic RP</p><button class="button secondary" data-action="nav" data-view="sites">Настроить доступ</button></section></div><section class="card"><h3>Forum Toolkit · Economy · Law Codex · Government Tools 0.6.0</h3><p class="lead">Биндер, жалобы, доказательства, экономика, законодательство, процессуальные решения и ведомства.</p><div class="row"><button class="button primary" data-action="nav" data-view="forum">Открыть биндер</button><button class="button secondary" data-action="nav" data-view="complaints">Менеджер жалоб</button><button class="button secondary" data-action="nav" data-view="economy">Экономика и аналитика</button><button class="button secondary" data-action="nav" data-view="law">Law Codex</button><button class="button secondary" data-action="nav" data-view="government">Government Tools</button></div></section><section class="card"><h3>Быстрый доступ</h3><p class="subtle">Переход на сайты без автоматического сбора данных</p><div class="row">${BOOKMARKS.map(link => `<button class="button secondary" data-url="${e(link.url)}">${e(link.name)} ↗</button>`).join('')}</div></section></div>`;
}
function sectionProfiles() {
  return `<div class="stack"><div class="row spread"><p class="lead">Храните разные игровые профили локально. Сервер и ссылка на форум задаются отдельно.</p><button class="button primary" data-action="create">+ Новый профиль</button></div>${state.profiles.map(profileRow).join('')}</div>`;
}
function sectionSites() {
  return `<div class="stack"><section class="card"><div class="row spread"><h3>Встраивание в форум Majestic RP</h3><span class="site-status ${permissionGranted ? 'on' : 'off'}">${permissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span></div><p class="lead">${e(FORUM_SITE.description)}</p><p class="subtle">Домен: forum.majestic-rp.ru. Доступ запрашивается только по нажатию кнопки и может быть отозван в любой момент.</p><div class="row"><button class="button ${permissionGranted ? 'danger' : 'primary'}" data-action="permission">${permissionGranted ? 'Отозвать доступ' : 'Разрешить на сайте'}</button><button class="button secondary" data-url="${e(FORUM_SITE.url)}">Открыть форум ↗</button></div></section><section class="card"><h3>Forum Toolkit для Russia Online</h3><p class="subtle">Доступ к forum.russia.online запрашивается отдельно.</p><div class="row"><span class="site-status ${russiaPermissionGranted ? 'on' : 'off'}">${russiaPermissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span><button class="button ${russiaPermissionGranted ? 'danger' : 'primary'}" data-action="permission" data-site="${e(RUSSIA_FORUM.origin)}">${russiaPermissionGranted ? 'Отозвать доступ' : 'Разрешить на сайте'}</button><button class="button secondary" data-url="${e(RUSSIA_FORUM.url)}">Открыть форум ↗</button></div></section><section class="card"><h3>Видеооверлей для доказательств</h3><p class="subtle">На YouTube, Rutube и Twitch можно сохранить ссылку на видео и текущий таймкод в выбранную жалобу. MajesticToolkit не загружает видеозаписи и не отправляет данные на свой сервер.</p><div class="row"><span class="site-status ${videoPermissionGranted ? 'on' : 'off'}">${videoPermissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span><button class="button ${videoPermissionGranted ? 'danger' : 'primary'}" data-action="video-permission">${videoPermissionGranted ? 'Отозвать доступ к видео' : 'Разрешить видеооверлей'}</button></div></section><h3>Разрешённые сайты и закладки</h3>${BOOKMARKS.map(x => `<div class="card link-card"><div><h3>${e(x.name)}</h3><p class="subtle">${e(x.detail)}</p></div><button class="button secondary" data-url="${e(x.url)}">Открыть ↗</button></div>`).join('')}<div class="card"><h3>Конфиденциальность</h3><p class="lead">Fletcher Wiki, Docossum, Google Docs и Sheets открываются как обычные сайты. MajesticToolkit не считывает с них данные, не получает файлы и не отправляет запросы от вашего имени.</p></div></div>`;
}
function sectionSettings() {
  const p = state.preferences;
  return `<section class="card stack"><div class="control"><div><h3>Тема интерфейса</h3><p class="subtle">Влияет на popup, боковую панель и рабочее пространство</p></div><select aria-label="Тема" data-setting="theme"><option value="system" ${p.theme === 'system' ? 'selected' : ''}>Системная</option><option value="light" ${p.theme === 'light' ? 'selected' : ''}>Светлая</option><option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>Тёмная</option></select></div><div class="divider"></div><div class="control"><div><h3>Начальный раздел</h3><p class="subtle">Выбирается при новом открытии расширения</p></div><select aria-label="Стартовый экран" data-setting="startPage">${NAV.map(([id,label]) => `<option value="${id}" ${p.startPage === id ? 'selected' : ''}>${e(label)}</option>`).join('')}</select></div><div class="divider"></div><div class="control"><div><h3>Компактный интерфейс</h3><p class="subtle">Уменьшает отступы в карточках</p></div><label class="check"><input type="checkbox" data-setting="compact" ${p.compact ? 'checked' : ''}><span>Включить</span></label></div></section>`;
}
function sectionBackup() {
  return `<div class="stack"><section class="card"><h3>Скачать резервную копию</h3><p class="lead">JSON-файл с профилями, шаблонами, жалобами, экономическими операциями, сделками, результатами игроков локальной базой законов и Government Tools. Авторизационные данные сайтов и содержимое страниц не сохраняются.</p><div class="row" style="margin-top:14px"><button class="button primary" data-action="export">Скачать JSON</button></div></section><section class="card"><h3>Восстановить из файла</h3><p class="lead">Данные проверяются до применения. Импорт заменит текущие профили и настройки. Максимальный размер — 40 МиБ. Копии 0.1.0–0.5.0 поддерживаются. При импорте старой копии новые записи сохраняются, если профили совместимы.</p><div style="margin-top:14px"><label class="field">Выберите .json<input id="backup-file" type="file" accept=".json,application/json"></label></div></section><section class="card"><h3>Где хранятся данные</h3><p class="lead">В локальном хранилище браузерного расширения. MajesticToolkit не имеет аккаунта, собственного сервера и телеметрии. Перед удалением расширения скачайте копию.</p></section></div>`;
}
const titles = {government:['Government Tools','Конструктор решений, правовые основания, процессуальные шаблоны и ведомства'],law:['Law Codex','Законы, неизменяемые редакции, статьи, избранное и памятки'],economy:['Экономика и аналитика','Сделки, денежные операции, калькуляторы, игроки и семьи'],complaints:['Жалобы и доказательства','Отслеживание тем, сроки, черновики и таймкоды'],forum:['Forum Toolkit','Шаблоны ответов, BBCode и инструменты на форуме'],home:['Обзор','Рабочая среда под ваши RP-проекты'],profiles:['Профили','Переключение между игровыми серверами'],sites:['Сайты и разрешения','Вы контролируете, где работает расширение'],settings:['Настройки','Настройте интерфейс под себя'],backup:['Резервные копии','Перенос данных между браузерами']};
function renderPopup() {
  const p = getActiveProfile(state);
  return `<div class="popup-shell stack"><div class="brand"><span class="logo">MT</span><div><h1>MajesticToolkit</h1><p>Версия 0.6.0</p></div></div><div class="card stack"><div class="row spread"><strong>Активный профиль</strong>${tag(projectLabel(p.project))}</div><select aria-label="Выбрать профиль" id="popup-profile">${state.profiles.map(x => `<option value="${e(x.id)}" ${x.id === state.activeProfileId ? 'selected' : ''}>${e(x.name)} · ${e(x.server)}</option>`).join('')}</select><p class="subtle">${e(p.server)}</p>${p.forumUrl ? `<button class="button secondary" data-url="${e(p.forumUrl)}">Открыть форум ↗</button>` : ''}</div><div class="row"><button class="button primary" data-action="panel">Боковая панель</button><button class="button secondary" data-action="workspace">Рабочее пространство ↗</button></div><div class="row"><button class="button link" data-action="popup-forum">Шаблоны форума</button><button class="button link" data-action="popup-complaints">Жалобы</button><button class="button link" data-action="popup-economy">Экономика</button><button class="button link" data-action="popup-law">Законы</button><button class="button link" data-action="popup-government">Ведомства</button><button class="button link" data-action="popup-settings">Настройки и профили</button><button class="button link" data-url="https://docossum.com/">Docossum ↗</button><button class="button link" data-url="https://fletcher-wiki.com/">Fletcher ↗</button></div></div>`;
}
function render() {
  if (!state) return;
  document.documentElement.dataset.theme = state.preferences.theme;
  document.body.dataset.compact = String(state.preferences.compact);
  if (popup) { app.innerHTML = renderPopup(); return; }
  const title = titles[view];
  const contents = { home: sectionHome, forum: () => forumSection(state), complaints: () => complaintsSection(state), economy: () => economySection(state), law: () => lawSection(state), government: () => governmentSection(state), profiles: sectionProfiles, sites: sectionSites, settings: sectionSettings, backup: sectionBackup };
  app.innerHTML = `<div class="layout"><aside class="side"><div class="brand"><div class="logo">MT</div><div><h1>MajesticToolkit</h1><p>Версия 0.6.0</p></div></div><nav class="nav" aria-label="Разделы">${NAV.map(([id, label, icon]) => `<button type="button" data-action="nav" data-view="${id}" class="${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${e(label)}</button>`).join('')}</nav><div class="side-footer">Локальные данные · Без облачной регистрации</div></aside><main class="main"><header class="topline"><div><p class="eyebrow">MajesticToolkit / ${e(title[0])}</p><h2>${e(title[0])}</h2><p class="lead">${e(title[1])}</p></div>${mode === 'sidebar' ? '' : '<span class="tag">v0.6.0</span>'}</header>${contents[view]()}</main></div>`;
}
async function refreshPermission() {
  try { permissionGranted = await api.permissions.contains({ origins: [FORUM_SITE.origin] }); }
  catch { permissionGranted = false; }
  try { russiaPermissionGranted = await api.permissions.contains({ origins: [RUSSIA_FORUM.origin] }); } catch { russiaPermissionGranted = false; }
  try { videoPermissionGranted = await api.permissions.contains({origins:VIDEO_ORIGINS}); } catch {videoPermissionGranted=false;}
}
function openEditor(id) {
  if (!dialog) return;
  const p = id ? state.profiles.find(x => x.id === id) : null;
  if (id && !p) throw new Error('Профиль не найден');
  const form = document.getElementById('profile-form');
  form.reset();
  form.elements.namedItem('profileId').value = p?.id ?? '';
  form.elements.namedItem('name').value = p?.name ?? '';
  form.elements.namedItem('project').value = p?.project ?? 'majestic';
  form.elements.namedItem('server').value = p?.server === 'Не выбран' ? '' : p?.server ?? '';
  form.elements.namedItem('forumUrl').value = p?.forumUrl ?? '';
  document.getElementById('dialog-title').textContent = p ? 'Изменить профиль' : 'Создать профиль';
  dialog.showModal();
  form.elements.namedItem('name').focus();
}
async function exportBackup() {
  const templates = await listTemplates();
  const cases = await listCases();
  const economy = await listEconomyRecords();
  const laws = lawRecords();
  const government = governmentRecords();
  const text = makeBackupV6(validateState(state), templates, cases, economy, laws, government, globalThis.RPNForumCore.cleanTemplate);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `majestictoolkit-backup-v0.6.0-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  feedback(`Копия: ${templates.length} шаблонов, ${cases.length} жалоб, ${economy.length} операций/матчей, ${laws.length} записей законодательства, ${government.length} ведомственных записей`);
}
async function requestCaseReplacement(cases) {
  const result=await api.runtime.sendMessage({type:'RP_NEXUS_CASE_MUTATE',action:'replace',cases});
  if(!result?.ok) throw Error(result?.error || 'Не удалось восстановить жалобы');
}

async function changePermission(site = FORUM_SITE.origin) {
  // Begin request synchronously from an explicit user click.
  const granted = await api.permissions.contains({ origins: [site] });
  if (!granted) {
    if (!await api.permissions.request({ origins: [site] })) { feedback('Разрешение не предоставлено', true); return; }
    feedback('Доступ предоставлен. Обновите вкладку форума.');
  } else {
    await api.permissions.remove({ origins: [site] });
    feedback('Разрешение отозвано. Обновите вкладку форума.');
  }
  await refreshPermission(); render();
}

async function executeAction(button) {
  if (button.dataset.url) { await openTab(button.dataset.url); return; }
  const { action, id } = button.dataset;
  if (action === 'nav') { view = button.dataset.view; if (view === 'forum') await refreshForum(); if(view==='complaints') await refreshComplaints(); if(view==='economy') await refreshEconomy(); if(view==='law') await refreshLaw(); if(view==='government') await refreshGovernment(); render(); return; }
  if (action === 'create') { openEditor(null); return; }
  if (action === 'edit') { openEditor(id); return; }
  if (action === 'close-dialog') { dialog.close(); return; }
  if (action === 'activate') { state = await modifyState(s => selectProfile(s, id)); feedback('Активный профиль изменён'); render(); return; }
  if (action === 'delete') {
    const p = state.profiles.find(x => x.id === id);
    if (!p) return;
    const previousTemplates = await listTemplates();
    const dependent = previousTemplates.filter(t => t.profileId === id);
    const previousCases = await listCases();
    const related = previousCases.filter(c => c.profileId === id);
    const previousEconomy = await listEconomyRecords();
    const relatedEconomy = previousEconomy.filter(r => r.profileId === id);
    const previousLaws = lawRecords().slice();
    const relatedLaws = previousLaws.filter(r=>r.profileId===id);
    const previousGovernment = governmentRecords().slice();
    const relatedGovernment = previousGovernment.filter(r=>r.profileId===id);
    if (!confirm(`Удалить профиль «${p.name}» и связанных с ним шаблонов: ${dependent.length}, жалоб: ${related.length}, записей экономики: ${relatedEconomy.length}, записей законодательства: ${relatedLaws.length}, ведомственных записей: ${relatedGovernment.length}? Это действие нельзя отменить без резервной копии.`)) return;
    try {
      if (dependent.length) await replaceTemplates(previousTemplates.filter(t => t.profileId !== id));
      if (related.length) await requestCaseReplacement(previousCases.filter(c => c.profileId !== id));
      if (relatedEconomy.length) await replaceEconomy(previousEconomy.filter(r => r.profileId !== id));
      if (relatedLaws.length) await replaceLawRecords(previousLaws.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      if (relatedGovernment.length) await replaceGovernment(previousGovernment.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      state = await modifyState(s => deleteProfile(s, id));
    } catch (error) {
      if (dependent.length) await replaceTemplates(previousTemplates);
      if (related.length) await requestCaseReplacement(previousCases);
      if (relatedEconomy.length) await replaceEconomy(previousEconomy);
      if (relatedLaws.length) await replaceLawRecords(previousLaws,state.profiles.map(p=>p.id));
      if (relatedGovernment.length) await replaceGovernment(previousGovernment,state.profiles.map(p=>p.id));
      throw error;
    }
    await Promise.all([refreshForum(),refreshComplaints(),refreshEconomy(),refreshLaw(),refreshGovernment()]); feedback('Профиль и связанные записи удалены'); render(); return;
  }
  if (action === 'video-permission') {
    // Permission request originates directly from the user click.
    if (!videoPermissionGranted) {
      if (!await api.permissions.request({origins:VIDEO_ORIGINS})) { feedback('Разрешение не предоставлено',true); return; }
      feedback('Видеооверлей разрешён. Обновите вкладку видео.');
    } else {await api.permissions.remove({origins:VIDEO_ORIGINS}); feedback('Разрешения отозваны. Обновите вкладку видео.');}
    await refreshPermission();render();return;
  }
  if (action === 'permission') { await changePermission(button.dataset.site || FORUM_SITE.origin); return; }
  if (action === 'export') { await exportBackup(); return; }
  if (action === 'panel') { await openSidePanel(); return; }
  if (action === 'popup-government') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#government')});return;}
  if (action === 'popup-law') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#law')});return;}
  if (action === 'popup-economy') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#economy')});return;}
  if (action === 'popup-complaints') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#complaints')});return;}
  if (action === 'popup-forum') { await api.tabs.create({ url: api.runtime.getURL('ui/workspace.html#forum') }); return; }
  if (action === 'workspace' || action === 'popup-settings') { await openWorkspace(); return; }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action],button[data-url],button[data-forum-action],button[data-case-action],button[data-economy-action],button[data-law-action],button[data-government-action]');
  if (!button || button.disabled) return;
  const task = button.dataset.forumAction
    ? handleForumAction(button, state, render, feedback)
    : button.dataset.caseAction ? handleComplaintAction(button,state,render,feedback)
    : button.dataset.economyAction ? handleEconomyAction(button,state,render,feedback)
    : button.dataset.lawAction ? handleLawAction(button,state,render,feedback) : button.dataset.governmentAction ? handleGovernmentAction(button,state,render,feedback,lawRecords()) : executeAction(button);
  void task.catch(err => feedback(err?.message || 'Ошибка выполнения операции', true));
});
document.addEventListener('input', event => {
  if (event.target.id === 'forum-search') filterForum(event.target.value);
  if (event.target.id === 'complaint-search') setComplaintQuery(event.target.value);
  if (event.target.id === 'law-search') {const pos=event.target.selectionStart;setLawQuery(event.target.value);render();const el=document.getElementById('law-search');el?.focus();el?.setSelectionRange(pos,pos);return;}
  if (event.target.id === 'economy-search') {setEconomySearch(event.target.value); const caret=event.target.selectionStart; render(); const input=document.getElementById('economy-search'); input?.focus(); input?.setSelectionRange(caret,caret);}
  if (event.target.matches('[data-case-draft]')) scheduleDraftSave(event.target,feedback);
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'law-only-fav') {setLawFavOnly(el.checked);render();return;}
  if (el.id === 'gov-law-edition') {handleGovernmentLawChange(event,lawRecords(),state.activeProfileId);return;}
  if (el.id === 'law-edition') {setLawEdition(el.value);render();return;}
  if (el.id === 'law-import-file' && el.files?.[0]) {void importLawFile(el.files[0],state,render,feedback).catch(error=>feedback(error.message,true));return;}
  if (el.id === 'complaint-filter') {setComplaintFilter(el.value);return;}
  if (el.id === 'economy-filter') {setEconomyFilter(el.value);render();return;}
  if (el.id === 'popup-profile') {
    void modifyState(s => selectProfile(s, el.value)).then(next => { state = next; render(); feedback('Профиль выбран'); }).catch(err => feedback(err.message, true));
  } else if (el.dataset.setting) {
    const value = el.type === 'checkbox' ? el.checked : el.value;
    void modifyState(s => savePreferences(s, { [el.dataset.setting]: value })).then(next => { state = next; render(); feedback('Настройки сохранены'); }).catch(err => feedback(err.message, true));
  } else if (el.id === 'backup-file' && el.files?.[0]) {
    const file = el.files[0];
    if (file.size > 32 * 1024 * 1024) { feedback('Файл больше 32 МиБ', true); el.value = ''; return; }
    void file.text().then(text => {
      const backup = parseBackupV6(text, validateState, globalThis.RPNForumCore.cleanTemplate);
      const replacing = backup.schemaVersion >= 3 ? `, ${backup.cases.length} жалоб` : '';
      const economyCount = backup.schemaVersion >= 4 ? `, ${backup.economy.length} записей экономики` : '';
      const lawCount = backup.schemaVersion >= 5 ? `, ${backup.lawRecords.length} записей Law Codex` : '';
      const govCount = backup.schemaVersion >= 6 ? `, ${backup.government.length} ведомственных записей` : '';
      if (!confirm(`Восстановить ${backup.state.profiles.length} профилей, ${backup.templates.length} шаблонов${replacing}${economyCount}${lawCount}${govCount}? Данные, отсутствующие в старом формате копии, сохранятся.`)) return;
      return (async () => {
        const beforeState = state;
        const beforeTemplates = await listTemplates();
        const beforeCases = await listCases();
        const beforeEconomy = await listEconomyRecords();
        const beforeLaws = lawRecords().slice();
        const beforeGovernment = governmentRecords().slice();
        try {
          if (backup.schemaVersion < 3 && beforeCases.some(c => !backup.state.profiles.some(p => p.id === c.profileId))) {
            throw Error('Старая копия содержит другой набор профилей. Сначала экспортируйте данные 0.3.0, чтобы не потерять доступ к существующим жалобам.');
          }
          if (backup.schemaVersion < 4 && beforeEconomy.some(r => !backup.state.profiles.some(p => p.id === r.profileId))) throw Error('Старая копия содержит другой набор профилей. Экспортируйте копию 0.5.0 перед импортом.');
          if (backup.schemaVersion < 5 && beforeLaws.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId))) throw Error('Старая копия содержит другие профили. Экспортируйте полную копию перед импортом.');
          if (backup.schemaVersion < 6 && beforeGovernment.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId))) throw Error('Старая копия содержит другие профили. Сначала экспортируйте данные Government Tools.');
          if (backup.schemaVersion >= 2) await replaceTemplates(backup.templates);
          if (backup.schemaVersion >= 3) await requestCaseReplacement(backup.cases);
          if (backup.schemaVersion >= 4) await replaceEconomy(backup.economy);
          if (backup.schemaVersion >= 5) await replaceLawRecords(backup.lawRecords,backup.state.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 6) await replaceGovernment(backup.government,backup.state.profiles.map(p=>p.id));
          state = await restoreState(backup.state);
        } catch (error) {
          if (backup.schemaVersion >= 2) await replaceTemplates(beforeTemplates);
          if (backup.schemaVersion >= 3) await requestCaseReplacement(beforeCases);
          if (backup.schemaVersion >= 4) await replaceEconomy(beforeEconomy);
          if (backup.schemaVersion >= 5) await replaceLawRecords(beforeLaws,beforeState.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 6) await replaceGovernment(beforeGovernment,beforeState.profiles.map(p=>p.id));
          await restoreState(beforeState);
          throw error;
        }
        await Promise.all([refreshForum(),refreshComplaints(),refreshEconomy(),refreshLaw(),refreshGovernment()]);
        view = state.preferences.startPage;
        render(); feedback('Резервная копия восстановлена');
      })();
    }).catch(err => feedback(err.message, true)).finally(() => { if (el.isConnected) el.value = ''; });

  }
});
document.addEventListener('submit', event => {
  if (event.target.id === 'government-form') {event.preventDefault();void handleGovernmentSubmit(event,state,render,feedback,lawRecords()).catch(err=>feedback(err.message,true));return;}
  if (event.target.id === 'law-form') {event.preventDefault();void handleLawSubmit(event,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if (event.target.id === 'economy-form' || event.target.matches('form[data-economy-calc]')) {event.preventDefault();void handleEconomySubmit(event,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if (['complaint-form','complaint-evidence-form'].includes(event.target.id)) {event.preventDefault();void handleComplaintSubmit(event,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if (event.target.id === 'forum-template-form') {
    event.preventDefault();
    void handleForumSubmit(event, state, render, feedback).catch(err => feedback(err.message, true));
    return;
  }
  if (event.target.id !== 'profile-form') return;
  event.preventDefault();
  const f = event.target.elements;
  const id = f.namedItem('profileId').value;
  const data = { name: f.namedItem('name').value, project: f.namedItem('project').value, server: f.namedItem('server').value, forumUrl: f.namedItem('forumUrl').value };
  void modifyState(s => id ? editProfile(s, id, data) : addProfile(s, data)).then(next => { state = next; dialog.close(); render(); feedback(id ? 'Профиль обновлён' : 'Профиль создан'); }).catch(err => feedback(err.message, true));
});
api.storage.onChanged.addListener((changes, area) => {
  if(area==='local' && Object.keys(changes).some(k=>k.startsWith('majesticGovernmentV6:'))) {void refreshGovernment().then(()=>{if(view==='government'&&!document.getElementById('government-dialog')?.open&&!document.getElementById('government-document-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if (area==='local' && Object.keys(changes).some(k=>k.startsWith('majesticLawV5:'))) {void refreshLaw().then(()=>{if(view==='law'&&!document.getElementById('law-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('rpnEconomyV4:'))) {
    void refreshEconomy().then(() => { if (view === 'economy' && !document.getElementById('economy-dialog')?.open) render(); }).catch(err=>feedback(err.message,true));
  }
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('rpnComplaintV3:'))) {
    void refreshComplaints().then(() => {if(view==='complaints' && !document.activeElement?.matches?.('[data-case-draft]')) render();}).catch(err=>feedback(err.message,true));
  }
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('rpnForumTemplateV2:'))) {
    void refreshForum().then(() => { if (view === 'forum') render(); }).catch(err => feedback(err.message, true));
  }
  if (area !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
  void loadState().then(next => { state = next; render(); }).catch(err => feedback(err.message, true));
});
api.permissions.onAdded.addListener(() => { void refreshPermission().then(render); });
api.permissions.onRemoved.addListener(() => { void refreshPermission().then(render); });
try { state = await loadState(); await Promise.all([refreshForum(),refreshComplaints(),refreshEconomy(),refreshLaw(),refreshGovernment()]); await refreshPermission(); view = ['#forum','#complaints','#economy','#law','#government'].includes(location.hash) ? location.hash.slice(1) : state.preferences.startPage; render(); }
catch (err) { app.textContent = `Не удалось открыть данные MajesticToolkit: ${err.message}. Данные не удалены. Для восстановления проверьте настройки расширения.`; feedback(err.message, true); }
