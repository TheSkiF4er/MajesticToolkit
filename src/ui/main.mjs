import '../lib/safe-dom.js';
const { replaceHtml, insertHtml } = globalThis.MTSafeDOM;
import { api, openSidePanel, openTab, openWorkspace } from '../lib/browser.mjs';
import { createRestorePoint, completeRestorePoint, examineRestorePoint, applyRestorePoint, discardRestorePoint } from '../lib/recovery.mjs';
import { addProfile, deleteProfile, editProfile, getActiveProfile, projectLabel, savePreferences, selectProfile } from '../lib/model.mjs';
import { loadState, modifyState, restoreState, STORAGE_KEY } from '../lib/state.mjs';
import { BOOKMARKS, FORUM_SITE, RUSSIA_FORUM, escapeHtml as e } from '../lib/sites.mjs';
import { forumSection, refreshForum, handleForumAction, handleForumSubmit, filterForum } from './forum-page.mjs';
import { listTemplates, replaceTemplates } from '../lib/forum-store.mjs';
import { validateState } from '../lib/model.mjs';
import { complaintsSection, refreshComplaints, handleComplaintAction, handleComplaintSubmit, setComplaintQuery, setComplaintFilter, scheduleDraftSave, handleComplaintWorkflowChange } from './complaints-page.mjs';
import { listCases } from '../lib/complaints-store.mjs';
import '../lib/complaints-core.js';
import '../lib/forum-core.js';
import { economySection, refreshEconomy, handleEconomyAction, handleEconomySubmit, setEconomyFilter, setEconomySearch } from './economy-page.mjs';
import { replaceEconomy, listEconomy as listEconomyRecords } from '../lib/economy-store.mjs';
import {makeBackupV13,parseBackupV13} from '../lib/workflow-backup.mjs';
import {KNOWLEDGE_KEY,emptyKnowledge} from '../lib/knowledge-core.mjs';
import {loadKnowledge,replaceKnowledge} from '../lib/knowledge-store.mjs';
import {knowledgeSection,knowledgeSnapshot,refreshKnowledge,handleKnowledgeAction,handleKnowledgeSubmit,setKnowledgeQuery,setKnowledgeKind} from './knowledge-page.mjs';
import {loadMonitor,replaceMonitor} from '../lib/monitor-store.mjs';
import {MONITOR_KEY,emptyMonitor,validateMonitor} from '../lib/monitor-core.mjs';
import {monitorSection,refreshMonitor,monitorRecords,setMonitorFilter,setMonitorAutoRefresh,tickMonitor,handleMonitorAction} from './monitor-page.mjs';
import {listXenForoLinks,replaceXenForoLinks} from '../lib/xenforo-store.mjs';
import { lawSection, refreshLaw, lawRecords, handleLawAction, handleLawSubmit, importLawFile, setLawQuery, setLawFavOnly, setLawEdition } from './law-page.mjs';
import { replaceLawRecords } from '../lib/law-store.mjs';
import { governmentSection, refreshGovernment, governmentRecords, handleGovernmentAction, handleGovernmentLawChange, handleGovernmentSubmit } from './government-page.mjs';
import { replaceGovernment } from '../lib/government-store.mjs';
import {documentSection,refreshDocuments,documentRecords,handleDocumentAction,handleDocumentSubmit,handleDocumentInput} from './document-page.mjs';
import {replaceDocumentRecords} from '../lib/document-store.mjs';
import {integrationsSection,refreshIntegrations,externalLinks,handleIntegrationAction,handleIntegrationSubmit} from './integrations-page.mjs';
import {replaceLinks} from '../lib/integration-store.mjs';
import {LINK_KEY} from '../lib/integration-core.mjs';
import {productivitySection,refreshProductivitySearch,clearProductivityCache,renderSearchResults,setSearchQuery,setSearchCategory,setSearchScope,searchFocus,handleProductivityAction,answerProductivity} from './productivity-page.mjs';
import {defaultProductivity,PRODUCTIVITY_KEY,validateProductivity} from '../lib/productivity-core.mjs';
import {loadProductivity,saveProductivity,replaceProductivity} from '../lib/productivity-store.mjs';
const app = document.getElementById('app');
const notice = document.getElementById('notice');
const dialog = document.getElementById('profile-dialog');
const mode = document.body.dataset.mode;
const popup = mode === 'popup';
let state;
let productivity = defaultProductivity();
let view = 'home';
let permissionGranted = false;
let russiaPermissionGranted = false;
let videoPermissionGranted = false;
const VIDEO_ORIGINS = ['https://www.youtube.com/*','https://rutube.ru/*','https://www.twitch.tv/*'];
let timeout;
const NAV = [ ['home','Обзор','⌂'], ['search','Поиск и помощник','⌕'], ['forum','Форум','▤'], ['monitor','Серверы и игроки','◈'], ['complaints','Жалобы','◷'], ['economy','Экономика','▥'], ['law','Законы','⚖'], ['government','Ведомства','§'], ['documents','Документы','▣'], ['integrations','Интеграции','↗'], ['knowledge','Центр знаний','◇'], ['profiles','Профили','◉'], ['sites','Сайты и доступ','↗'], ['settings','Настройки','⚙'], ['backup','Резервные копии','⇩'] ];

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
  return `<div class="stack"><section class="card hero"><div class="eyebrow">Активный профиль</div><h3>${e(active.name)}</h3><p>${e(projectLabel(active.project))} · ${e(active.server)}</p><div class="row" style="margin-top:17px"><button class="button" data-action="edit" data-id="${e(active.id)}">Настроить профиль</button>${active.forumUrl ? `<button class="button" data-url="${e(active.forumUrl)}">Открыть форум ↗</button>` : ''}</div></section><div class="grid"><section class="card"><p class="eyebrow">Профили</p><div class="stat">${state.profiles.length}</div><p class="subtle">Отдельные RP-проекты и серверы</p><button class="button secondary" data-action="nav" data-view="profiles">Управлять профилями</button></section><section class="card"><p class="eyebrow">Интеграция с форумом</p><div class="stat">${permissionGranted ? 'Включена' : 'Выключена'}</div><p class="subtle">Кнопка MajesticToolkit на официальном форуме Majestic RP</p><button class="button secondary" data-action="nav" data-view="sites">Настроить доступ</button></section></div><section class="card"><h3>Forum Toolkit · Economy · Law Codex · Government Tools · Document Studio · Integrations 1.5.0</h3><p class="lead">Биндер, жалобы, доказательства, экономика, законодательство, процессуальные решения и ведомства.</p><div class="row"><button class="button primary" data-action="nav" data-view="search">Единый поиск</button><button class="button primary" data-action="nav" data-view="forum">Открыть биндер</button><button class="button secondary" data-action="nav" data-view="monitor">Мониторинг серверов</button><button class="button secondary" data-action="nav" data-view="complaints">Менеджер жалоб</button><button class="button secondary" data-action="nav" data-view="economy">Экономика и аналитика</button><button class="button secondary" data-action="nav" data-view="law">Law Codex</button><button class="button secondary" data-action="nav" data-view="government">Government Tools</button><button class="button secondary" data-action="nav" data-view="documents">Document Studio</button><button class="button secondary" data-action="nav" data-view="integrations">Интеграции Google</button><button class="button primary" data-action="nav" data-view="knowledge">Центр знаний</button></div></section><section class="card"><h3>Быстрый доступ</h3><p class="subtle">Переход на сайты без автоматического сбора данных</p><div class="row">${BOOKMARKS.map(link => `<button class="button secondary" data-url="${e(link.url)}">${e(link.name)} ↗</button>`).join('')}</div></section></div>`;
}
function sectionProfiles() {
  return `<div class="stack"><div class="row spread"><p class="lead">Храните разные игровые профили локально. Сервер и ссылка на форум задаются отдельно.</p><button class="button primary" data-action="create">+ Новый профиль</button></div>${state.profiles.map(profileRow).join('')}</div>`;
}
function sectionSites() {
  return `<div class="stack"><section class="card"><div class="row spread"><h3>Встраивание в форум Majestic RP</h3><span class="site-status ${permissionGranted ? 'on' : 'off'}">${permissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span></div><p class="lead">${e(FORUM_SITE.description)}</p><p class="subtle">Домен: forum.majestic-rp.ru. Доступ запрашивается только по нажатию кнопки и может быть отозван в любой момент.</p><div class="row"><button class="button ${permissionGranted ? 'danger' : 'primary'}" data-action="permission">${permissionGranted ? 'Отозвать доступ' : 'Разрешить на сайте'}</button><button class="button secondary" data-url="${e(FORUM_SITE.url)}">Открыть форум ↗</button></div></section><section class="card"><h3>Forum Toolkit для Russia Online</h3><p class="subtle">Доступ к forum.russia.online запрашивается отдельно.</p><div class="row"><span class="site-status ${russiaPermissionGranted ? 'on' : 'off'}">${russiaPermissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span><button class="button ${russiaPermissionGranted ? 'danger' : 'primary'}" data-action="permission" data-site="${e(RUSSIA_FORUM.origin)}">${russiaPermissionGranted ? 'Отозвать доступ' : 'Разрешить на сайте'}</button><button class="button secondary" data-url="${e(RUSSIA_FORUM.url)}">Открыть форум ↗</button></div></section><section class="card"><h3>Видеооверлей для доказательств</h3><p class="subtle">На YouTube, Rutube и Twitch можно сохранить ссылку на видео и текущий таймкод в выбранную жалобу. MajesticToolkit не загружает видеозаписи и не отправляет данные на свой сервер.</p><div class="row"><span class="site-status ${videoPermissionGranted ? 'on' : 'off'}">${videoPermissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span><button class="button ${videoPermissionGranted ? 'danger' : 'primary'}" data-action="video-permission">${videoPermissionGranted ? 'Отозвать доступ к видео' : 'Разрешить видеооверлей'}</button></div></section><h3>Разрешённые сайты и закладки</h3>${BOOKMARKS.map(x => `<div class="card link-card"><div><h3>${e(x.name)}</h3><p class="subtle">${e(x.detail)}</p></div><button class="button secondary" data-url="${e(x.url)}">Открыть ↗</button></div>`).join('')}<div class="card"><h3>Конфиденциальность</h3><p class="lead">Fletcher Wiki, Docossum, Google Docs и Sheets открываются как обычные сайты. MajesticToolkit не считывает с них данные, не получает файлы и не отправляет запросы от вашего имени.</p></div></div>`;
}
function sectionSettings() {
  const p = state.preferences;
  return `<div class="stack"><section class="card stack"><div class="control"><div><h3>Тема интерфейса</h3><p class="subtle">Влияет на popup, боковую панель и рабочее пространство</p></div><select aria-label="Тема" data-setting="theme"><option value="system" ${p.theme === 'system' ? 'selected' : ''}>Системная</option><option value="light" ${p.theme === 'light' ? 'selected' : ''}>Светлая</option><option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>Тёмная</option><option value="sepia" ${p.theme === 'sepia' ? 'selected' : ''}>Сепия</option><option value="contrast" ${p.theme === 'contrast' ? 'selected' : ''}>Высокая контрастность</option></select></div><div class="divider"></div><div class="control"><div><h3>Начальный раздел</h3><p class="subtle">Выбирается при новом открытии расширения</p></div><select aria-label="Стартовый экран" data-setting="startPage">${NAV.map(([id,label]) => `<option value="${id}" ${p.startPage === id ? 'selected' : ''}>${e(label)}</option>`).join('')}</select></div><div class="divider"></div><div class="control"><div><h3>Компактный интерфейс</h3><p class="subtle">Уменьшает отступы в карточках</p></div><label class="check"><input type="checkbox" data-setting="compact" ${p.compact ? 'checked' : ''}><span>Включить</span></label></div></section><section class="card stack"><h3>Productivity 0.9.0</h3><div class="control"><div><strong>Цветовой акцент</strong><p class="subtle">Для всех окон расширения</p></div><select aria-label="Цветовой акцент" data-productivity-setting="accent">${[['blue','Синий'],['teal','Бирюзовый'],['violet','Фиолетовый'],['amber','Янтарный']].map(([id,label])=>`<option value="${id}" ${productivity.accent===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="control"><div><strong>Горячие клавиши</strong><p class="subtle">Alt+1–8 в окнах MajesticToolkit. Ctrl/⌘+K — поиск.</p></div><label class="check"><input type="checkbox" data-productivity-setting="shortcutsEnabled" ${productivity.shortcutsEnabled?'checked':''}>Включить</label></div><div class="productivity-shortcuts">${productivity.shortcuts.map((target,index)=>`<label class="field">Alt+${index+1}<select data-productivity-shortcut="${index}">${NAV.map(([id,label])=>`<option value="${id}" ${target===id?'selected':''}>${e(label)}</option>`).join('')}</select></label>`).join('')}</div><div class="row"><button class="button secondary" data-productivity-action="reset-shortcuts">Сбросить сочетания</button></div></section></div>`;
}
function sectionBackup() {
  return `<div class="stack"><section class="card"><h3>Скачать резервную копию</h3><p class="lead">JSON-файл с профилями, шаблонами, жалобами, экономическими операциями, сделками, результатами игроков локальной базой законов и Government Tools и документами Document Studio. Авторизационные данные сайтов и содержимое страниц не сохраняются.</p><div class="row" style="margin-top:14px"><button class="button primary" data-action="export">Скачать JSON</button></div></section><section class="card"><h3>Восстановить из файла</h3><p class="lead">Данные проверяются до применения. Импорт заменит текущие профили и настройки. Максимальный размер — 48 МиБ. Поддерживаются копии v1–v12. Формат v13 также сохраняет этапы рассмотрения жалоб, журнал действий, связи Центра знаний, ссылки XenForo и Server Monitor. При импорте старой копии новые записи сохраняются, если профили совместимы.</p><div style="margin-top:14px"><label class="field">Выберите .json<input id="backup-file" type="file" accept=".json,application/json"></label></div></section><section class="card"><h3>Точка восстановления после импорта</h3><p class="lead">Перед импортом создаётся проверенный снимок текущих данных (не более 20 МиБ). Он переживает закрытие браузера. OAuth-токены и данные других расширений в снимок не входят.</p><div class="row" style="margin-top:12px"><button class="button secondary" data-action="restore-point">Восстановить предыдущие данные</button><button class="button danger" data-action="discard-point">Удалить точку</button></div></section><section class="card"><h3>Где хранятся данные</h3><p class="lead">В локальном хранилище браузерного расширения. MajesticToolkit не имеет аккаунта, собственного сервера и телеметрии. Перед удалением расширения скачайте копию.</p></section></div>`;
}
const titles = {knowledge:['Центр знаний','Связи документов, законов, шаблонов и внешних справочников'],search:['Поиск и локальный помощник','Быстрый индекс всех локальных разделов, ответы с указанием источников'],integrations:['Интеграции','Google Docs, Sheets, Drive, Fletcher Wiki и Docossum'],documents:['Document Studio','Редактор, формы, шаблоны, история локальных версий и PDF'],government:['Government Tools','Конструктор решений, правовые основания, процессуальные шаблоны и ведомства'],law:['Law Codex','Законы, неизменяемые редакции, статьи, избранное и памятки'],economy:['Экономика и аналитика','Сделки, денежные операции, калькуляторы, игроки и семьи'],complaints:['Жалобы и доказательства','Отслеживание тем, сроки, черновики и таймкоды'],monitor:['Server Monitor','Официальный каталог серверов и сохранённые публичные карточки игроков'],forum:['Forum Toolkit','Шаблоны ответов, BBCode и инструменты на форуме'],home:['Обзор','Рабочая среда под ваши RP-проекты'],profiles:['Профили','Переключение между игровыми серверами'],sites:['Сайты и разрешения','Вы контролируете, где работает расширение'],settings:['Настройки','Настройте интерфейс под себя'],backup:['Резервные копии','Перенос данных между браузерами']};
function renderPopup() {
  const p = getActiveProfile(state);
  return `<div class="popup-shell stack"><div class="brand"><span class="logo">MT</span><div><h1>MajesticToolkit</h1><p>Версия 1.5.0</p></div></div><div class="card stack"><div class="row spread"><strong>Активный профиль</strong>${tag(projectLabel(p.project))}</div><select aria-label="Выбрать профиль" id="popup-profile">${state.profiles.map(x => `<option value="${e(x.id)}" ${x.id === state.activeProfileId ? 'selected' : ''}>${e(x.name)} · ${e(x.server)}</option>`).join('')}</select><p class="subtle">${e(p.server)}</p>${p.forumUrl ? `<button class="button secondary" data-url="${e(p.forumUrl)}">Открыть форум ↗</button>` : ''}</div><div class="row"><button class="button primary" data-action="panel">Боковая панель</button><button class="button secondary" data-action="workspace">Рабочее пространство ↗</button></div><div class="row"><button class="button link" data-action="popup-search">Поиск</button><button class="button link" data-action="popup-forum">Шаблоны форума</button><button class="button link" data-action="popup-monitor">Серверы и игроки</button><button class="button link" data-action="popup-complaints">Жалобы</button><button class="button link" data-action="popup-economy">Экономика</button><button class="button link" data-action="popup-law">Законы</button><button class="button link" data-action="popup-government">Ведомства</button><button class="button link" data-action="popup-documents">Документы</button><button class="button link" data-action="popup-integrations">Интеграции</button><button class="button link" data-action="popup-knowledge">Центр знаний</button><button class="button link" data-action="popup-settings">Настройки и профили</button><button class="button link" data-url="https://docossum.com/">Docossum ↗</button><button class="button link" data-url="https://fletcher-wiki.com/">Fletcher ↗</button></div></div>`;
}
function render() {
  if (!state) return;
  document.documentElement.dataset.theme = state.preferences.theme;
  document.documentElement.dataset.accent = productivity.accent;
  document.body.dataset.compact = String(state.preferences.compact);
  if (popup) { replaceHtml(app, renderPopup()); return; }
  const title = titles[view];
  const contents = { home: sectionHome, search: () => productivitySection(state), forum: () => forumSection(state), monitor: () => monitorSection(state), complaints: () => complaintsSection(state), economy: () => economySection(state), law: () => lawSection(state), government: () => governmentSection(state), documents: () => documentSection(state), integrations: () => integrationsSection(state), knowledge:()=>knowledgeSection(state), profiles: sectionProfiles, sites: sectionSites, settings: sectionSettings, backup: sectionBackup };
  replaceHtml(app, `<div class="layout"><aside class="side"><div class="brand"><div class="logo">MT</div><div><h1>MajesticToolkit</h1><p>Версия 1.5.0</p></div></div><nav class="nav" aria-label="Разделы">${NAV.map(([id, label, icon]) => `<button type="button" data-action="nav" data-view="${id}" class="${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${e(label)}</button>`).join('')}</nav><div class="side-footer">Локальные данные · Без облачной регистрации</div></aside><main class="main"><header class="topline"><div><p class="eyebrow">MajesticToolkit / ${e(title[0])}</p><h2>${e(title[0])}</h2><p class="lead">${e(title[1])}</p></div>${mode === 'sidebar' ? '' : '<span class="tag">v1.5.0</span>'}</header>${contents[view]()}</main></div>`);
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
  const documents = documentRecords();
  const text = makeBackupV13(validateState(state), templates, cases, economy, laws, government, documents, externalLinks(), productivity, await listXenForoLinks(), await loadMonitor(), await loadKnowledge(state.profiles.map(p=>p.id)), globalThis.RPNForumCore.cleanTemplate);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `majestictoolkit-backup-v1.5.0-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  feedback(`Копия: ${templates.length} шаблонов, ${cases.length} жалоб, ${economy.length} операций/матчей, ${laws.length} записей законодательства, ${government.length} ведомственных записей, ${documents.length} документов/шаблонов, ${externalLinks().length} внешних закладок`);
}
async function createBackupText(){
  return makeBackupV13(validateState(state),await listTemplates(),await listCases(),await listEconomyRecords(),lawRecords(),governmentRecords(),documentRecords(),externalLinks(),productivity,await listXenForoLinks(),await loadMonitor(),await loadKnowledge(state.profiles.map(p=>p.id)),globalThis.RPNForumCore.cleanTemplate);
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
  if (action === 'nav') { view = button.dataset.view; if (view === 'search') await refreshProductivitySearch(); if(view==='knowledge')await refreshKnowledge(state.profiles.map(p=>p.id)); if (view === 'forum') await refreshForum(); if(view==='monitor') await refreshMonitor(); if(view==='complaints') await refreshComplaints(); if(view==='economy') await refreshEconomy(); if(view==='law') await refreshLaw(); if(view==='government') await refreshGovernment(); if(view==='documents') await refreshDocuments(); if(view==='integrations') await refreshIntegrations(); render(); return; }
  if (action === 'popup-monitor') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#monitor')});return;}
  if (action === 'popup-search') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#search')});return;}
  if (action === 'create') { openEditor(null); return; }
  if (action === 'edit') { openEditor(id); return; }
  if (action === 'close-dialog') { dialog.close(); return; }
  if (action === 'activate') { state = await modifyState(s => selectProfile(s, id)); feedback('Активный профиль изменён'); render(); return; }
  if (action === 'delete') {
    const p = state.profiles.find(x => x.id === id);
    if (!p) return;
    const previousXfLinks=await listXenForoLinks();
    const previousMonitor=await loadMonitor();
    const previousKnowledge=await loadKnowledge(state.profiles.map(p=>p.id));
    const previousTemplates = await listTemplates();
    const dependent = previousTemplates.filter(t => t.profileId === id);
    const previousCases = await listCases();
    const related = previousCases.filter(c => c.profileId === id);
    const previousEconomy = await listEconomyRecords();
    const relatedEconomy = previousEconomy.filter(r => r.profileId === id);
    const previousLaws = lawRecords().slice();
    const relatedLaws = previousLaws.filter(r=>r.profileId===id);
    const previousGovernment = governmentRecords().slice();
    const previousDocuments = documentRecords().slice();
    const relatedDocuments = previousDocuments.filter(r=>r.profileId===id);
    const relatedGovernment = previousGovernment.filter(r=>r.profileId===id);
    if (!confirm(`Удалить профиль «${p.name}» и связанных с ним шаблонов: ${dependent.length}, жалоб: ${related.length}, записей экономики: ${relatedEconomy.length}, записей законодательства: ${relatedLaws.length}, ведомственных записей: ${relatedGovernment.length}, документов: ${relatedDocuments.length}? Это действие нельзя отменить без резервной копии.`)) return;
    try {
      await replaceXenForoLinks(previousXfLinks.filter(x=>x.profileId!==id));
      if (dependent.length) await replaceTemplates(previousTemplates.filter(t => t.profileId !== id));
      if (related.length) await requestCaseReplacement(previousCases.filter(c => c.profileId !== id));
      if (relatedEconomy.length) await replaceEconomy(previousEconomy.filter(r => r.profileId !== id));
      if (relatedLaws.length) await replaceLawRecords(previousLaws.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      if (relatedDocuments.length) await replaceDocumentRecords(previousDocuments.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id),previousGovernment.filter(r=>r.profileId!==id));
      await replaceMonitor({...previousMonitor,players:previousMonitor.players.filter(x=>x.profileId!==id)});
      await replaceKnowledge({...previousKnowledge,resources:previousKnowledge.resources.filter(r=>r.profileId!==id),relations:previousKnowledge.relations.filter(r=>r.profileId!==id)},state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      if (relatedGovernment.length) await replaceGovernment(previousGovernment.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      state = await modifyState(s => deleteProfile(s, id));
    } catch (error) {
      await replaceXenForoLinks(previousXfLinks);
      await replaceMonitor(previousMonitor);
      await replaceKnowledge(previousKnowledge,state.profiles.map(p=>p.id));
      if (dependent.length) await replaceTemplates(previousTemplates);
      if (related.length) await requestCaseReplacement(previousCases);
      if (relatedEconomy.length) await replaceEconomy(previousEconomy);
      if (relatedLaws.length) await replaceLawRecords(previousLaws,state.profiles.map(p=>p.id));
      if (relatedGovernment.length) await replaceGovernment(previousGovernment,state.profiles.map(p=>p.id));
      if (relatedDocuments.length) await replaceDocumentRecords(previousDocuments,state.profiles.map(p=>p.id),previousGovernment);
      throw error;
    }
    await Promise.all([refreshForum(),refreshComplaints(),refreshEconomy(),refreshLaw(),refreshGovernment(),refreshDocuments()]); feedback('Профиль и связанные записи удалены'); render(); return;
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
  if (action === 'restore-point') {
    const snapshot = await examineRestorePoint(api.storage.local);
    if (!snapshot) throw Error('Точка восстановления отсутствует');
    if (!confirm(`Восстановить данные из ${new Date(snapshot.createdAt).toLocaleString('ru-RU')}? Текущие записи MajesticToolkit будут заменены.`)) return;
    await applyRestorePoint(api.storage.local);
    location.reload(); return;
  }
  if (action === 'discard-point') {
    if (!await examineRestorePoint(api.storage.local)) throw Error('Точка восстановления отсутствует');
    if (!confirm('Удалить сохранённую точку восстановления?')) return;
    await discardRestorePoint(api.storage.local); feedback('Точка удалена'); return;
  }
  if (action === 'export') { await exportBackup(); return; }
  if (action === 'panel') { await openSidePanel(); return; }
  if(action==='popup-knowledge'){await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#knowledge')});return;}
  if (action === 'popup-integrations') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#integrations')});return;}
  if (action === 'popup-documents') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#documents')});return;}
  if (action === 'popup-government') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#government')});return;}
  if (action === 'popup-law') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#law')});return;}
  if (action === 'popup-economy') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#economy')});return;}
  if (action === 'popup-complaints') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#complaints')});return;}
  if (action === 'popup-forum') { await api.tabs.create({ url: api.runtime.getURL('ui/workspace.html#forum') }); return; }
  if (action === 'workspace' || action === 'popup-settings') { await openWorkspace(); return; }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-productivity-action],button[data-action],button[data-url],button[data-forum-action],button[data-case-action],button[data-economy-action],button[data-law-action],button[data-government-action],button[data-document-action],button[data-integration-action],button[data-monitor-action],button[data-knowledge-action]');
  if (!button || button.disabled) return;
  if(button.dataset.productivityAction==='reset-shortcuts'){
    const task=saveProductivity({shortcuts:[...defaultProductivity().shortcuts]}).then(next=>{productivity=next;render();feedback('Горячие клавиши сброшены');});
    void task.catch(err=>feedback(err.message,true));return;
  }
  if(button.dataset.productivityAction){
    void handleProductivityAction(button,state,target=>{view=target;render();},feedback).catch(err=>feedback(err.message,true));return;
  }
  const task = button.dataset.knowledgeAction ? handleKnowledgeAction(button,state,render,feedback,target=>{view=target;render();}) : button.dataset.monitorAction ? handleMonitorAction(button,state,render,feedback) : button.dataset.integrationAction ? handleIntegrationAction(button,state,render,feedback,createBackupText) : button.dataset.forumAction
    ? handleForumAction(button, state, render, feedback)
    : button.dataset.caseAction ? handleComplaintAction(button,state,render,feedback)
    : button.dataset.economyAction ? handleEconomyAction(button,state,render,feedback)
    : button.dataset.lawAction ? handleLawAction(button,state,render,feedback) : button.dataset.governmentAction ? handleGovernmentAction(button,state,render,feedback,lawRecords()) : button.dataset.documentAction ? handleDocumentAction(button,state,render,feedback) : executeAction(button);
  void task.catch(err => feedback(err?.message || 'Ошибка выполнения операции', true));
});
document.addEventListener('input', event => {
  handleDocumentInput(event);
  if(event.target.id==='knowledge-search'){const pos=event.target.selectionStart;setKnowledgeQuery(event.target.value);render();const el=document.getElementById('knowledge-search');el?.focus();el?.setSelectionRange(pos,pos);return;}
  if(event.target.id==='productivity-search') {setSearchQuery(event.target.value,state);return;}
  if (event.target.id === 'forum-search') filterForum(event.target.value);
  if (event.target.id === 'complaint-search') setComplaintQuery(event.target.value);
  if (event.target.id === 'law-search') {const pos=event.target.selectionStart;setLawQuery(event.target.value);render();const el=document.getElementById('law-search');el?.focus();el?.setSelectionRange(pos,pos);return;}
  if (event.target.id === 'economy-search') {setEconomySearch(event.target.value); const caret=event.target.selectionStart; render(); const input=document.getElementById('economy-search'); input?.focus(); input?.setSelectionRange(caret,caret);}
  if (event.target.matches('[data-case-draft]')) scheduleDraftSave(event.target,feedback);
});
document.addEventListener('change', event => {
  const el = event.target;
  if(el.dataset.caseWorkflowCheck!==undefined||el.dataset.caseDecision!==undefined){void handleComplaintWorkflowChange(el,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(el.id==='knowledge-kind'){setKnowledgeKind(el.value);render();return;}
  if(event.target.id==='monitor-filter'){setMonitorFilter(el.value);render();return;}
  if(el.id==='monitor-auto-refresh'){void setMonitorAutoRefresh(el.checked).then(render).catch(err=>feedback(err.message,true));return;}
  if(el.id==='productivity-category'){setSearchCategory(el.value,state);return;}
  if(el.id==='productivity-all-profiles'){setSearchScope(el.checked,state);return;}
  if(el.dataset.productivitySetting){
    const value=el.type==='checkbox'?el.checked:el.value;
    void saveProductivity({[el.dataset.productivitySetting]:value}).then(next=>{productivity=next;render();feedback('Настройка сохранена');}).catch(err=>feedback(err.message,true));return;
  }
  if(el.dataset.productivityShortcut!==undefined){
    const index=Number(el.dataset.productivityShortcut);const shortcuts=[...productivity.shortcuts];shortcuts[index]=el.value;
    void saveProductivity({shortcuts}).then(next=>{productivity=next;feedback('Сочетание клавиш сохранено');}).catch(err=>feedback(err.message,true));return;
  }
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
    if (file.size > 48 * 1024 * 1024) { feedback('Файл больше 48 МиБ', true); el.value = ''; return; }
    void file.text().then(text => {
      const backup = parseBackupV13(text, validateState, globalThis.RPNForumCore.cleanTemplate);
      const replacing = backup.schemaVersion >= 3 ? `, ${backup.cases.length} жалоб` : '';
      const economyCount = backup.schemaVersion >= 4 ? `, ${backup.economy.length} записей экономики` : '';
      const lawCount = backup.schemaVersion >= 5 ? `, ${backup.lawRecords.length} записей Law Codex` : '';
      const govCount = backup.schemaVersion >= 6 ? `, ${backup.government.length} ведомственных записей` : '';
      const documentsCount = backup.schemaVersion >= 7 ? `, ${backup.documents.length} документов/шаблонов` : '';
      const linksCount = backup.schemaVersion >= 8 ? `, ${backup.siteLinks.length} внешних закладок` : '';
      const xfCount=backup.schemaVersion>=10?`, ${backup.xenforoNavigation.length} ссылок XenForo`:'';
      const knowledgeCount=backup.schemaVersion>=12?`, ${backup.knowledgeWorkspace.relations.length} связей Центра знаний`:'';
      const monitorCount=backup.schemaVersion>=11?`, ${backup.serverMonitor.players.length} карточек игроков`:'';
      if (!confirm(`Восстановить ${backup.state.profiles.length} профилей, ${backup.templates.length} шаблонов${replacing}${economyCount}${lawCount}${govCount}${documentsCount}${linksCount}${xfCount}${monitorCount}${knowledgeCount}? Данные, отсутствующие в старом формате копии, сохранятся.`)) return;
      return (async () => {
        const beforeState = state;
        const beforeTemplates = await listTemplates();
        const beforeCases = await listCases();
        const beforeEconomy = await listEconomyRecords();
        const beforeLaws = lawRecords().slice();
        const beforeGovernment = governmentRecords().slice();
        const beforeDocuments = documentRecords().slice();
        const beforeLinks = externalLinks().slice();
        const beforeProductivity = productivity;
        const beforeXfLinks = await listXenForoLinks();
        const beforeMonitor=await loadMonitor();
        const beforeKnowledge=await loadKnowledge(beforeState.profiles.map(p=>p.id));
        try {
          if (backup.schemaVersion < 3 && beforeCases.some(c => !backup.state.profiles.some(p => p.id === c.profileId))) {
            throw Error('Старая копия содержит другой набор профилей. Сначала экспортируйте данные 0.3.0, чтобы не потерять доступ к существующим жалобам.');
          }
          if (backup.schemaVersion < 4 && beforeEconomy.some(r => !backup.state.profiles.some(p => p.id === r.profileId))) throw Error('Старая копия содержит другой набор профилей. Экспортируйте копию 0.5.0 перед импортом.');
          if (backup.schemaVersion < 5 && beforeLaws.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId))) throw Error('Старая копия содержит другие профили. Экспортируйте полную копию перед импортом.');
          if (backup.schemaVersion < 6 && beforeGovernment.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId))) throw Error('Старая копия содержит другие профили. Сначала экспортируйте данные Government Tools.');
          if (backup.schemaVersion < 7 && beforeDocuments.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId))) throw Error('Старая копия содержит другие профили. Сначала экспортируйте документы.');
          if (backup.schemaVersion < 10 && (await listXenForoLinks()).some(x=>x.profileId!=='*'&&!backup.state.profiles.some(p=>p.id===x.profileId)))throw Error('Старая копия содержит другой набор профилей. Сначала экспортируйте все пользовательские ссылки XenForo.');
          if (backup.schemaVersion < 11 && beforeMonitor.players.some(x=>!backup.state.profiles.some(p=>p.id===x.profileId)))throw Error('Старая копия содержит другие профили. Сначала экспортируйте карточки игроков.');
          if (backup.schemaVersion < 12 && [...beforeKnowledge.resources,...beforeKnowledge.relations].some(x=>!backup.state.profiles.some(p=>p.id===x.profileId)))throw Error('Старая копия содержит другие профили. Сначала экспортируйте связи Центра знаний.');
          await createRestorePoint(api.storage.local);
          if (backup.schemaVersion >= 2) await replaceTemplates(backup.templates);
          if (backup.schemaVersion >= 3) await requestCaseReplacement(backup.cases);
          if (backup.schemaVersion >= 4) await replaceEconomy(backup.economy);
          if (backup.schemaVersion >= 5) await replaceLawRecords(backup.lawRecords,backup.state.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 6) await replaceGovernment(backup.government,backup.state.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 7) await replaceDocumentRecords(backup.documents,backup.state.profiles.map(p=>p.id),backup.government);
          if (backup.schemaVersion >= 8) await replaceLinks(backup.siteLinks);
          if (backup.schemaVersion >= 9) productivity = await replaceProductivity(backup.productivity);
          if (backup.schemaVersion >= 10) await replaceXenForoLinks(backup.xenforoNavigation);
          if (backup.schemaVersion >= 11) await replaceMonitor(backup.serverMonitor);
          if (backup.schemaVersion >= 12) await replaceKnowledge(backup.knowledgeWorkspace,backup.state.profiles.map(p=>p.id));
          state = await restoreState(backup.state);
          await completeRestorePoint(api.storage.local);
        } catch (error) {
          if (backup.schemaVersion >= 2) await replaceTemplates(beforeTemplates);
          if (backup.schemaVersion >= 3) await requestCaseReplacement(beforeCases);
          if (backup.schemaVersion >= 4) await replaceEconomy(beforeEconomy);
          if (backup.schemaVersion >= 5) await replaceLawRecords(beforeLaws,beforeState.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 6) await replaceGovernment(beforeGovernment,beforeState.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 7) await replaceDocumentRecords(beforeDocuments,beforeState.profiles.map(p=>p.id),beforeGovernment);
          if (backup.schemaVersion >= 8) await replaceLinks(beforeLinks);
          if (backup.schemaVersion >= 9) productivity = await replaceProductivity(beforeProductivity);
          if (backup.schemaVersion >= 10) await replaceXenForoLinks(beforeXfLinks);
          if (backup.schemaVersion >= 11) await replaceMonitor(beforeMonitor);
          if (backup.schemaVersion >= 12) await replaceKnowledge(beforeKnowledge,beforeState.profiles.map(p=>p.id));
          await restoreState(beforeState);
          throw error;
        }
        await Promise.all([refreshForum(),refreshComplaints(),refreshEconomy(),refreshLaw(),refreshGovernment(),refreshDocuments(),refreshIntegrations()]);
        view = state.preferences.startPage;
        clearProductivityCache();render(); feedback('Резервная копия восстановлена');
      })();
    }).catch(err => feedback(err.message, true)).finally(() => { if (el.isConnected) el.value = ''; });

  }
});
document.addEventListener('submit', event => {
  if(['knowledge-google-form','knowledge-relation-form','knowledge-bookmark-form'].includes(event.target.id)){event.preventDefault();void handleKnowledgeSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(event.target.id==='productivity-assistant-form'){
    event.preventDefault();void answerProductivity(event.target.elements.namedItem('question').value,state).catch(err=>feedback(err.message,true));return;
  }
  if(['google-config-form','site-link-form','google-import-doc-form','google-read-sheet-form'].includes(event.target.id)){event.preventDefault();void handleIntegrationSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(event.target.id==='document-form'){event.preventDefault();void handleDocumentSubmit(event,state,render,feedback).catch(err=>feedback(err.message,true));return;}
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
document.addEventListener('keydown', event => {
  if(popup || event.isComposing || event.repeat)return;
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&event.code==='KeyK'){
    event.preventDefault();if(view!=='search'){view='search';void refreshProductivitySearch().then(()=>{render();searchFocus();}).catch(err=>feedback(err.message,true));}
    else searchFocus();return;
  }
  const editable=event.target.closest?.('input,textarea,select,[contenteditable=true]');
  if(editable)return;
  if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&/^Digit[1-8]$/.test(event.code)&&productivity.shortcutsEnabled){
    const target=productivity.shortcuts[Number(event.code.slice(-1))-1];if(!target)return;
    event.preventDefault();view=target;
    if(target==='search')void refreshProductivitySearch().then(()=>{render();searchFocus();}).catch(err=>feedback(err.message,true));
    else render();
  }
});
api.storage.onChanged.addListener((changes, area) => {
  if(area==='local' && changes[PRODUCTIVITY_KEY]?.newValue){
    try{productivity=validateProductivity(changes[PRODUCTIVITY_KEY].newValue);if(view==='settings')render();else document.documentElement.dataset.accent=productivity.accent;}
    catch(err){feedback(err.message,true);}
  }
  if(area==='local'&&Object.keys(changes).some(k=>/^(rpnForumTemplateV2:|rpnComplaintV3:|rpnEconomyV4:|majesticLawV5:|majesticGovernmentV6:|majesticDocumentV7:)/.test(k)||k===LINK_KEY)){
    clearProductivityCache();
    if(view==='search')void refreshProductivitySearch().then(()=>renderSearchResults(state)).catch(err=>feedback(err.message,true));
  }
  if(area==='local'&&changes[MONITOR_KEY]){void refreshMonitor().then(()=>{if(view==='monitor')render();}).catch(err=>feedback(err.message,true));}
  if(area==='local'&&changes[KNOWLEDGE_KEY]){void refreshKnowledge(state?.profiles?.map(p=>p.id)).then(()=>{if(view==='knowledge')render();}).catch(err=>feedback(err.message,true));}
  if(area==='local'&&changes[LINK_KEY]){void refreshIntegrations().then(()=>{if(view==='integrations')render();if(view==='knowledge')void refreshKnowledge(state.profiles.map(p=>p.id)).then(render);}).catch(err=>feedback(err.message,true));}
  if(area==='local'&&Object.keys(changes).some(k=>k.startsWith('majesticDocumentV7:'))){void refreshDocuments().then(()=>{if(view==='documents'&&!document.getElementById('studio-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if(area==='local' && Object.keys(changes).some(k=>k.startsWith('majesticGovernmentV6:'))) {void refreshGovernment().then(()=>{if(view==='government'&&!document.getElementById('government-dialog')?.open&&!document.getElementById('government-document-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if (area==='local' && Object.keys(changes).some(k=>k.startsWith('majesticLawV5:'))) {void refreshLaw().then(()=>{if(view==='law'&&!document.getElementById('law-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('rpnEconomyV4:'))) {
    void refreshEconomy().then(() => { if (view === 'economy' && !document.getElementById('economy-dialog')?.open) render(); }).catch(err=>feedback(err.message,true));
  }
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('rpnComplaintV3:'))) {
    void refreshComplaints().then(() => {if(view==='complaints' && !document.activeElement?.matches?.('[data-case-draft]')) render();}).catch(err=>feedback(err.message,true));
  }
  if (area === 'local' && Object.keys(changes).some(k => (k.startsWith('rpnForumTemplateV2:')||k.startsWith('majesticToolkitXfNavV11:')))) {
    void refreshForum().then(() => { if (view === 'forum') render(); }).catch(err => feedback(err.message, true));
  }
  if (area !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
  void loadState().then(next => { state = next; render(); }).catch(err => feedback(err.message, true));
});
if(!popup)setInterval(()=>{if(view==='monitor')void tickMonitor().then(changed=>{if(changed)render();}).catch(err=>feedback(err.message,true));},60000);
api.permissions.onAdded.addListener(() => { void refreshPermission().then(render); });
api.permissions.onRemoved.addListener(() => { void refreshPermission().then(render); });
try { [state,productivity] = await Promise.all([loadState(),loadProductivity()]); await Promise.all([refreshForum(),refreshComplaints(),refreshEconomy(),refreshLaw(),refreshGovernment(),refreshDocuments(),refreshIntegrations(),refreshMonitor(),refreshKnowledge(state.profiles.map(p=>p.id))]); await refreshPermission(); view = ['#search','#forum','#monitor','#complaints','#economy','#law','#government','#documents','#integrations','#knowledge'].includes(location.hash) ? location.hash.slice(1) : state.preferences.startPage; if(view==='search')await refreshProductivitySearch();render(); }
catch (err) {
  app.textContent = '';
  const message=document.createElement('p');message.textContent=`Не удалось открыть данные MajesticToolkit: ${err.message}. Данные не удалены.`;app.append(message);
  try { const point=await examineRestorePoint(api.storage.local);
    if(point){ const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent='Восстановить данные из сохранённой точки';button.addEventListener('click',()=>{
      if(!confirm('Вернуть предыдущие данные? Текущие записи MajesticToolkit будут заменены.'))return;
      void applyRestorePoint(api.storage.local).then(()=>location.reload()).catch(error=>feedback(error.message,true));
    });app.append(button);}
  } catch(error){const warning=document.createElement('p');warning.textContent=`Точка восстановления недействительна: ${error.message}`;app.append(warning);}
  feedback(err.message,true);
}
