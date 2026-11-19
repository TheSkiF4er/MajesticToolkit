import {handleJudgmentAction,handleJudgmentSubmit} from './court-decisions-page.mjs';
import {prefillAIWorkspace} from './ai-workspace-page.mjs';
import {prefillAIRules} from './ai-rules-page.mjs';
import {aiSection,mountAI,stopAI} from './ai-page.mjs';
import {removeAIProfile} from '../lib/ai-connection.mjs';
import {handleGraphSubmit,handleGraphAction,setGraphCaseFilter,setGraphQuery} from './knowledge-graph-page.mjs';
import {clearVaultProfile} from '../lib/evidence-vault.mjs';
import {mountEvidenceVault} from './evidence-vault-page.mjs';
import {moderationOpsKey,exportModerationOps,replaceModerationOps,validateModerationOpsBackup} from '../lib/moderation-ops-store.mjs';
import {REGISTRY_KEY,exportRegistryData,replaceRegistryData,validateRegistry,removeRegistryProfile} from '../lib/punishment-registry-store.mjs';
import {mountSectionMonitor} from './section-monitor-page.mjs';
import {moderationCenterSection,mountModerationCenter} from './moderation-center.mjs';
import {evidenceKnowledgeSection,mountEvidenceKnowledge} from './evidence-knowledge-center.mjs';
import {SECTION_KEY,exportSectionData,replaceSectionData,validateSectionData} from '../lib/section-monitor-store.mjs';
import {removeCalculatorProfile} from '../lib/punishment-calculator-store.mjs';
import {removePunishmentProfile} from '../lib/punishment-overlay-store.mjs';
import {rulesSection,mountRules} from './rules-page.mjs';
import {RULES_KEY} from '../lib/rules-core.mjs';
import {listRules,replaceRules,removeRuleProfile} from '../lib/rules-store.mjs';
import {NAV_GROUPS,FORUM_TABS,dashboardShell,dashboardWidgets,loadDashboard} from './workspace-page.mjs';
import {changeWidget,workspacePreferences} from '../lib/workspace-preferences.mjs';
import {mountCustomization} from './customization-page.mjs';
import {updateForumSettings,FORUM_DEFAULTS} from '../lib/forum-settings.mjs';
import '../lib/safe-dom.js';
const { replaceHtml, insertHtml } = globalThis.MTSafeDOM;
import { api, openSidePanel, openTab, openWorkspace } from '../lib/browser.mjs';
import { changeHostPermission } from '../lib/permission-flow.mjs';
import { createRestorePoint, completeRestorePoint, examineRestorePoint, applyRestorePoint, discardRestorePoint } from '../lib/recovery.mjs';
import { addProfile, deleteProfile, editProfile, getActiveProfile, projectLabel, savePreferences, selectProfile } from '../lib/model.mjs';
import { loadState, modifyState, restoreState, STORAGE_KEY } from '../lib/state.mjs';
import { BOOKMARKS, FORUM_SITE, RUSSIA_FORUM, escapeHtml as e } from '../lib/sites.mjs';
import {importOpenedPage} from '../lib/source-capture.mjs';
import {removeSource,SOURCE_KEY,listSources,replaceSources} from '../lib/source-library.mjs';
import { forumSection, refreshForum, handleForumAction, handleForumSubmit, filterForum, setBinderFilter, refreshBinderProfile } from './forum-page.mjs';
import { listTemplates, replaceTemplates } from '../lib/forum-store.mjs';
import { validateState } from '../lib/model.mjs';
import { complaintsSection, refreshComplaints, handleComplaintAction, handleComplaintSubmit, setComplaintQuery, setComplaintFilter, scheduleDraftSave, handleComplaintWorkflowChange, handleComplaintQueueChange } from './complaints-page.mjs';
import { listCases } from '../lib/complaints-store.mjs';
import '../lib/complaints-core.js';
import '../lib/forum-core.js';
import {handleAnalyticsAction,handleAnalyticsFilter} from './analytics-page.mjs';
import {economySection,refreshEconomy,loadEconomyWorkspace,changeEconomyTab,handleEconomyAction,handleEconomySubmit,setEconomyFilter,setEconomySearch,setEconomyLookup,economyLookupHTML,forgetEconomyProfile} from './economy-page.mjs';
import {tacticalSection,loadTacticalWorkspace,refreshTacticalWorkspace,forgetTacticalProfiles,handleTacticalAction,changeTacticalSearch,changeTacticalFilter} from './tactical-page.mjs';
import {mountTacticalMap,disposeTacticalMap} from './tactical-map-page.mjs';
import {mountTacticalAirdrops,disposeTacticalAirdrops} from './tactical-airdrop-page.mjs';
import {mountTacticalPlanning,disposeTacticalPlanning} from './tactical-planning-page.mjs';
import {clearOrphanTacticalPlans} from '../lib/tactical-planning-store.mjs';
import {mountTacticalSimulations,disposeTacticalSimulations} from './tactical-simulation-page.mjs';
import {clearOrphanTacticalSimulations} from '../lib/tactical-simulation-store.mjs';
import {mountTacticalAnalytics,disposeTacticalAnalytics,clearOrphanTacticalReplayPreferences} from './tactical-analytics-page.mjs';
import {mountTacticalLinks} from './tactical-links-page.mjs';
import {listTacticalLinks,clearOrphanTacticalLinks} from '../lib/tactical-links-store.mjs';
import {TACTICAL_LINK_PREFIX} from '../lib/tactical-links-core.mjs';
import {clearOrphanAirdrops} from '../lib/tactical-airdrop-store.mjs';
import {clearOrphanTacticalMaps} from '../lib/tactical-map-store.mjs';
import { replaceEconomy, listEconomyStrict as listEconomyRecords } from '../lib/economy-store.mjs';
import {listMarketplace,replaceMarketplace} from '../lib/marketplace-store.mjs';
import {handleMarketplaceAction,handleMarketplaceSubmit,setMarketplaceQuery,setMarketplaceArchived} from './marketplace-page.mjs';
import {handleTradingAction,handleTradingSubmit,refreshTrading,setTradingSearch} from './trading-page.mjs';
import {listInventory,replaceInventory} from '../lib/inventory-store.mjs';
import {listFamilies,replaceFamilies} from '../lib/family-store.mjs';
import {handleFamilyAction,handleFamilySubmit,refreshFamilies,setFamilyQuery} from './family-page.mjs';
import {listOrganizations,replaceOrganizations} from '../lib/organization-store.mjs';
import {handleOrganizationAction,handleOrganizationSubmit,refreshOrganizations,setOrganizationQuery} from './organization-page.mjs';
import {listCrime,replaceCrime} from '../lib/crime-store.mjs';
import {validateCrime} from '../lib/crime-core.mjs';
import {handleCrimeAction,handleCrimeSubmit,refreshCrime,setCrimeQuery} from './crime-page.mjs';
import {listFinance,replaceFinance} from '../lib/finance-store.mjs';
import {validateFinanceBatches} from '../lib/finance-core.mjs';
import {handleFinanceAction,handleFinanceSubmit,refreshFinance,setFinanceQuery} from './finance-page.mjs';
import {exportPunishmentData,replacePunishmentData,validatePunishmentBackup} from '../lib/punishment-backup.mjs';
import {inventoryAllVault,makePortableBackup,parsePortableBackup} from '../lib/dossier-backup.mjs';
import {exportAIWorkspaces,replaceAIWorkspaces,disableAIOnRestore} from '../lib/ai-backup.mjs';
import {makeBackupV21,parseBackupV21,validateTacticalSnapshot} from '../lib/tactical-backup-v21.mjs';
import {collectTacticalBackup,replaceTacticalBackup,resolveTacticalFiles} from '../lib/tactical-backup-store.mjs';
import {listEconomyLinks,replaceEconomyLinks} from '../lib/economy-links-store.mjs';
import {validateEconomyLinks} from '../lib/economy-links-core.mjs';
import {handleEconomyIntegrationAction,handleEconomyIntegrationSubmit,handleEconomyIntegrationFile,refreshEconomyIntegrations} from './economy-integrations-page.mjs';
import {verifyJusticeStorageRows} from '../lib/government-justice-ga.mjs';
import {importVaultPackage,rollbackVaultPackage} from '../lib/evidence-vault.mjs';
import {mountRulesExperience} from './rules-experience.mjs';
import {KNOWLEDGE_KEY,emptyKnowledge} from '../lib/knowledge-core.mjs';
import {loadKnowledge,replaceKnowledge} from '../lib/knowledge-store.mjs';
import {knowledgeSection,knowledgeSnapshot,knowledgeSourceRows,knowledgeNodes,refreshKnowledge,handleKnowledgeAction,handleKnowledgeSubmit,setKnowledgeQuery,setKnowledgeKind} from './knowledge-page.mjs';
import {handleLibraryAction,handleLibrarySubmit,setLibraryQuery,setLibraryFilter} from './knowledge-library-page.mjs';
import {loadMonitor,replaceMonitor} from '../lib/monitor-store.mjs';
import {MONITOR_KEY,emptyMonitor,validateMonitor} from '../lib/monitor-core.mjs';
import {monitorSection,refreshMonitor,monitorRecords,setMonitorFilter,setMonitorAutoRefresh,tickMonitor,handleMonitorAction} from './monitor-page.mjs';
import {listXenForoLinks,clearNavigationHistory,replaceXenForoLinks} from '../lib/xenforo-store.mjs';
import { lawSection, refreshLaw, lawRecords, handleLawAction, handleLawSubmit, importLawFile, setLawQuery, setLawFavOnly, setLawEdition, setLawAsOfDate, setLawCategory, setLawCompareEdition } from './law-page.mjs';
import { replaceLawRecords } from '../lib/law-store.mjs';
import { governmentSection, refreshGovernment, governmentRecords, handleGovernmentAction, handleGovernmentLawChange, handleGovernmentSubmit, setGovernmentSection, setGovernmentDecisionDepartment } from './government-page.mjs';
import {handleAgencyAction,handleAgencySubmit,setAgencyFilter,setAgencyQuery,setAgencyTab,agencyListHTML} from './agency-page.mjs';
import { replaceGovernment } from '../lib/government-store.mjs';
import {documentSection,refreshDocuments,documentRecords,handleDocumentAction,handleDocumentSubmit,handleDocumentInput,setDocumentTab,handleDocumentApprovalSubmit} from './document-page.mjs';
import {governmentJusticeSection,loadJusticeWorkspace,changeJusticeTab,justiceSearchHTML,setJusticeQuery,justiceRecord,rememberJusticeOpen,checkJusticeWorkspace} from './government-justice-page.mjs';
import {handleCourtAction,handleCourtSubmit,setCourtTab} from './judicial-page.mjs';
import {caseListHTML,handleCourtCaseAction,handleCourtCaseSubmit,openCourtCase,setCourtCaseFilter} from './court-case-page.mjs';
import {handleCourtEvidenceAction,handleCourtEvidenceSubmit} from './court-evidence-page.mjs';
import {handleProceedingAction,handleProceedingSubmit} from './judicial-proceedings-page.mjs';
import {replaceDocumentRecords} from '../lib/document-store.mjs';
import {integrationsSection,refreshIntegrations,externalLinks,handleIntegrationAction,handleIntegrationSubmit} from './integrations-page.mjs';
import {replaceLinks} from '../lib/integration-store.mjs';
import {LINK_KEY} from '../lib/integration-core.mjs';
import {productivitySection,refreshProductivitySearch,clearProductivityCache,renderSearchResults,setSearchQuery,setSearchCategory,setSearchScope,searchFocus,handleProductivityAction,answerProductivity} from './productivity-page.mjs';
import {defaultProductivity,PRODUCTIVITY_KEY,validateProductivity} from '../lib/productivity-core.mjs';
import {timersSection,refreshTimers,submitTimer,handleTimerAction,tickTimers} from './timers-page.mjs';
import {TIMERS_KEY} from '../lib/timers-core.mjs';
import {loadProductivity,saveProductivity,replaceProductivity} from '../lib/productivity-store.mjs';
const app = document.getElementById('app');
const notice = document.getElementById('notice');
const dialog = document.getElementById('profile-dialog');
const mode = document.body.dataset.mode;
const popup = mode === 'popup';
let state;
let productivity = defaultProductivity();
let view = 'home';
let forumPane='binder', dashboardEpoch=0, dashboardTimer, economySearchTimer, dashboardConfigOpen=false;
function readForumPane(){const pane=new URLSearchParams(location.search).get('section');return FORUM_TABS.some(([id])=>id===pane)?pane:'binder';}
function setForumPane(pane){if(!FORUM_TABS.some(([id])=>id===pane))return;forumPane=pane;if(!popup&&view==='forum'){const url=new URL(location.href);url.searchParams.set('section',pane);url.hash='forum';history.replaceState(null,'',url.href);}}
async function refreshDashboard(){const root=document.getElementById('ws-widgets');if(!root||!state)return;const epoch=++dashboardEpoch, snapshot=state;try{const data=await loadDashboard(snapshot);if(epoch===dashboardEpoch&&root.isConnected&&view==='home'&&state.activeProfileId===snapshot.activeProfileId)replaceHtml(root,dashboardWidgets(state,data));}catch(err){if(epoch===dashboardEpoch&&root.isConnected)root.textContent='Не удалось загрузить рабочий стол: '+err.message;}}
function scheduleDashboard(){clearTimeout(dashboardTimer);dashboardTimer=setTimeout(()=>{void refreshDashboard();},100);}
async function updateWidgets(fn){state=await modifyState(current=>savePreferences(current,{workspace:fn(current.preferences.workspace)}));dashboardConfigOpen=true;render();feedback('Рабочий стол сохранён');}
function profileSelect(id='workspace-profile'){return `<label class="ws-profile">Активный профиль<select id="${id}" aria-label="Активный профиль">${state.profiles.map(p=>`<option value="${e(p.id)}" ${p.id===state.activeProfileId?'selected':''}>${e(p.name)} · ${e(p.server)}</option>`).join('')}</select></label>`;}
function groupedNav(){return NAV_GROUPS.map(([label,ids])=>`<div class="ws-nav-group"><p class="ws-nav-label">${e(label)}</p>${ids.map(id=>{const [,name,icon]=NAV.find(x=>x[0]===id);return `<button type="button" data-action="nav" data-view="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${e(name)}</button>`;}).join('')}</div>`).join('');}
let permissionGranted = false;
let russiaPermissionGranted = false;
let videoPermissionGranted = false;
let moduleErrors = [];
const VIDEO_ORIGINS = ['https://www.youtube.com/*','https://rutube.ru/*','https://www.twitch.tv/*'];
let timeout;
const NAV = [ ['home','Обзор','⌂'], ['search','Поиск и помощник','⌕'], ['ai','AI / Поддержка','◎'], ['forum','Форум','▤'], ['monitor','Серверы и игроки','◈'], ['complaints','Жалобы','◷'], ['moderation','Центр модерации','▣'], ['timers','Таймеры','◴'], ['economy','Economy & Crime','▥'], ['tactical','Tactical Toolkit','◎'], ['rules','Правила и наказания','§'], ['law','Законы','⚖'], ['justice','Government & Justice','⚖'], ['government','Ведомства','§'], ['documents','Документы','▣'], ['integrations','Интеграции','↗'], ['evidence','Evidence & Knowledge','◇'], ['knowledge','Центр знаний','◇'], ['profiles','Профили','◉'], ['sites','Сайты и доступ','↗'], ['settings','Настройки','⚙'], ['backup','Резервные копии','⇩'] ];

function feedback(message, isError = false) {
  notice.textContent = message;
  notice.className = isError ? 'error notice' : 'notice';
  clearTimeout(timeout);
  timeout = setTimeout(() => { notice.textContent = ''; notice.className = ''; }, isError ? 7000 : 4500);
}
function navigateTo(target,pane) {
  if (!NAV.some(([id])=>id===target)) return false;
  if(view==='ai'&&target!=='ai')stopAI();
  view=target;
  if(!popup){const url=new URL(location.href);url.hash=view;if(view!=='rules'){for(const k of ['rulesTab','rule','calculator','calcProfile','caseId','thread'])url.searchParams.delete(k);}if(view!=='moderation')url.searchParams.delete('moderationTab');if(view!=='evidence'){url.searchParams.delete('evidenceTab');url.searchParams.delete('evidenceCase');}if(view==='forum'){if(pane&&FORUM_TABS.some(([id])=>id===pane))forumPane=pane;url.searchParams.set('section',forumPane);}else {url.searchParams.delete('section');if(view==='rules'&&pane)url.searchParams.set('rulesTab',pane);if(view==='moderation'&&pane)url.searchParams.set('moderationTab',pane);if(view==='evidence'&&pane)url.searchParams.set('evidenceTab',pane);}if(url.href!==location.href)history.replaceState(null,'',url.href);}
  return true;
}
function tag(text) { return `<span class="tag">${e(text)}</span>`; }
function profileRow(p) {
  const active = state.activeProfileId === p.id;
  return `<article class="card profile-card ${active ? 'active' : ''}"><div class="profile-title"><strong>${e(p.name)}</strong>${active ? tag('Активный') : ''}</div><p class="subtle">${e(projectLabel(p.project))} · ${e(p.server)}</p><div class="row">${!active ? `<button class="button primary" data-action="activate" data-id="${e(p.id)}">Выбрать</button>` : ''}<button class="button secondary" data-action="edit" data-id="${e(p.id)}">Изменить</button><button class="button danger" data-action="delete" data-id="${e(p.id)}" ${state.profiles.length === 1 ? 'disabled' : ''}>Удалить</button></div></article>`;
}
function sectionHome() {
  const active=getActiveProfile(state);let host='';try{host=new URL(active.forumUrl).hostname;}catch{}
  return dashboardShell(state,host==='forum.majestic-rp.ru'?permissionGranted:host==='forum.russia.online'?russiaPermissionGranted:false);
}
function sectionProfiles() {
  return `<div class="stack"><div class="row spread"><p class="lead">Храните разные игровые профили локально. Сервер и ссылка на форум задаются отдельно.</p><button class="button primary" data-action="create">+ Новый профиль</button></div>${state.profiles.map(profileRow).join('')}</div>`;
}
function sectionSites() {
  return `<div class="stack"><section class="card"><div class="row spread"><h3>Встраивание в форум Majestic RP</h3><span class="site-status ${permissionGranted ? 'on' : 'off'}">${permissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span></div><p class="lead">${e(FORUM_SITE.description)}</p><p class="subtle">Домен: forum.majestic-rp.ru. Доступ запрашивается только по нажатию кнопки и может быть отозван в любой момент.</p><div class="row"><button class="button ${permissionGranted ? 'danger' : 'primary'}" data-action="permission">${permissionGranted ? 'Отозвать доступ' : 'Разрешить на сайте'}</button><button class="button secondary" data-url="${e(FORUM_SITE.url)}">Открыть форум ↗</button></div></section><section class="card"><h3>Forum Toolkit для Russia Online</h3><p class="subtle">Доступ к forum.russia.online запрашивается отдельно.</p><div class="row"><span class="site-status ${russiaPermissionGranted ? 'on' : 'off'}">${russiaPermissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span><button class="button ${russiaPermissionGranted ? 'danger' : 'primary'}" data-action="permission" data-site="${e(RUSSIA_FORUM.origin)}">${russiaPermissionGranted ? 'Отозвать доступ' : 'Разрешить на сайте'}</button><button class="button secondary" data-url="${e(RUSSIA_FORUM.url)}">Открыть форум ↗</button></div></section><section class="card"><h3>Видеооверлей для доказательств</h3><p class="subtle">На YouTube, Rutube и Twitch можно сохранить ссылку на видео и текущий таймкод в выбранную жалобу. MajesticToolkit не загружает видеозаписи и не отправляет данные на свой сервер.</p><div class="row"><span class="site-status ${videoPermissionGranted ? 'on' : 'off'}">${videoPermissionGranted ? '● Доступ предоставлен' : '○ Доступ выключен'}</span><button class="button ${videoPermissionGranted ? 'danger' : 'primary'}" data-action="video-permission">${videoPermissionGranted ? 'Отозвать доступ к видео' : 'Разрешить видеооверлей'}</button></div></section><h3>Разрешённые сайты и закладки</h3>${BOOKMARKS.map(x => `<div class="card link-card"><div><h3>${e(x.name)}</h3><p class="subtle">${e(x.detail)}</p></div><button class="button secondary" data-url="${e(x.url)}">Открыть ↗</button></div>`).join('')}<div class="card"><h3>Конфиденциальность</h3><p class="lead">Данные форума и Fletcher Wiki импортируются только после вашего нажатия в Центре знаний, с отдельным разрешением на Fletcher Wiki. Текст хранится локально. Docossum открывается только по ссылке; Google имеет отдельные разрешения.</p></div></div>`;
}
function sectionSettings() {
  const p = state.preferences;
  return `<div class="stack"><section class="card stack"><div class="control"><div><h3>Тема интерфейса</h3><p class="subtle">Влияет на popup, боковую панель и рабочее пространство</p></div><select aria-label="Тема" data-setting="theme"><option value="system" ${p.theme === 'system' ? 'selected' : ''}>Системная</option><option value="light" ${p.theme === 'light' ? 'selected' : ''}>Светлая</option><option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>Тёмная</option><option value="sepia" ${p.theme === 'sepia' ? 'selected' : ''}>Сепия</option><option value="contrast" ${p.theme === 'contrast' ? 'selected' : ''}>Высокая контрастность</option></select></div><div class="divider"></div><div class="control"><div><h3>Начальный раздел</h3><p class="subtle">Выбирается при новом открытии расширения</p></div><select aria-label="Стартовый экран" data-setting="startPage">${NAV.map(([id,label]) => `<option value="${id}" ${p.startPage === id ? 'selected' : ''}>${e(label)}</option>`).join('')}</select></div><div class="divider"></div><div class="control"><div><h3>Компактный интерфейс</h3><p class="subtle">Уменьшает отступы в карточках</p></div><label class="check"><input type="checkbox" data-setting="compact" ${p.compact ? 'checked' : ''}><span>Включить</span></label></div></section><section class="card stack"><h3>AI Technical Support</h3><p class="subtle">Проверьте разрешения, хранилища и локальный AI-шлюз. Диагностика работает без облачного AI; отправка в OpenAI только по отдельному согласию.</p><button class="button secondary" data-action="ai-support">Открыть диагностику и техподдержку</button></section><section class="card stack"><h3>Productivity 0.9.0</h3><div class="control"><div><strong>Цветовой акцент</strong><p class="subtle">Для всех окон расширения</p></div><select aria-label="Цветовой акцент" data-productivity-setting="accent">${[['blue','Синий'],['teal','Бирюзовый'],['violet','Фиолетовый'],['amber','Янтарный']].map(([id,label])=>`<option value="${id}" ${productivity.accent===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="control"><div><strong>Горячие клавиши</strong><p class="subtle">Alt+1–8 в окнах MajesticToolkit. Ctrl/⌘+K — поиск.</p></div><label class="check"><input type="checkbox" data-productivity-setting="shortcutsEnabled" ${productivity.shortcutsEnabled?'checked':''}>Включить</label></div><div class="productivity-shortcuts">${productivity.shortcuts.map((target,index)=>`<label class="field">Alt+${index+1}<select data-productivity-shortcut="${index}">${NAV.map(([id,label])=>`<option value="${id}" ${target===id?'selected':''}>${e(label)}</option>`).join('')}</select></label>`).join('')}</div><div class="row"><button class="button secondary" data-productivity-action="reset-shortcuts">Сбросить сочетания</button></div></section></div>`;
}
function sectionBackup() {
  return `<div class="stack"><section class="card stack"><h3>Скачать резервную копию · Backup v21</h3><p class="lead">JSON содержит профили, данные Toolkit, тактические журналы, разметку и метаданные карт; для переноса изображений и файлов Evidence Vault используйте ZIP v21. История AI и черновики по умолчанию исключены. Секреты, токены и согласия никогда не экспортируются.</p>
<label class="check"><input type="checkbox" id="backup-include-ai"><span>Я осознанно включаю сохранённые AI-диалоги, контекстные ссылки и черновики ВСЕХ профилей в экспорт (могут содержать личные данные)</span></label>
<div class="row"><button class="button primary" data-action="export">Скачать JSON v21</button><button class="button secondary" data-action="backup-portable-export">Скачать переносимый ZIP v21 с файлами</button></div></section>
<section class="card stack"><h3>Восстановить из файла</h3><p class="lead">Поддерживаются Backup v1–v21. Импорт проверяется до применения. Для v18–v21 история AI восстанавливается только если она включена в копию; иначе существующая история не заменяется. При восстановлении AI-ключи, токены и согласия не импортируются. Для бинарных файлов требуется переносимый ZIP.</p><label class="field">Файл JSON<input id="backup-file" type="file" accept=".json,application/json"></label><label class="field">Переносимый ZIP<input id="backup-package-file" type="file" accept=".zip,application/zip"></label></section>
<section class="card stack"><h3>Точка восстановления</h3><p class="lead">Перед импортом создаётся проверенный снимок локальных данных, включая сохранённую AI-историю, если она есть. Лимит 20 МиБ. Бинарные карты IndexedDB не включаются в точку восстановления: для полного отката используйте ZIP v21.</p><div class="row"><button class="button secondary" data-action="restore-point">Восстановить предыдущие данные</button><button class="button danger" data-action="discard-point">Удалить точку</button></div></section></div>`;
}

const titles = {justice:['Government & Justice','Единый интерфейс судов, ведомств, нормативных актов, решений и документов'],ai:['AI Assistant & Support · Workspace & Productivity','AI-ответы по правилам, анализ жалоб, техническая поддержка и диагностика'],evidence:['Evidence & Knowledge','Материалы, таймлайны, источники, цитаты, граф и досье'],moderation:['Moderation Center','Жалобы, входящие темы, реестр решений, SLA, автоматизация и журнал'],rules:['Правила и наказания','База правил, калькулятор и рассмотрение жалоб'],knowledge:['Центр знаний','Цитаты редакций, доказательства, события, правила и решения'],search:['Поиск и локальный помощник','Быстрый индекс всех локальных разделов, ответы с указанием источников'],integrations:['Интеграции','Google Docs, Sheets, Drive, Fletcher Wiki и Docossum'],documents:['Document Studio','Редактор, формы, шаблоны, история локальных версий и PDF'],government:['Government Tools','Конструктор решений, правовые основания, процессуальные шаблоны и ведомства'],law:['Law Codex','Законы, неизменяемые редакции, статьи, избранное и памятки'],economy:['Economy & Crime','Рынок, финансовые операции, статистика игроков, семей и калькуляторы'],tactical:['Tactical Toolkit','Интерактивная локальная карта, территории, капты и составы активного профиля'],complaints:['Жалобы · Evidence Timeline','Дела, хронология событий, видеофрагменты, файлы SHA-256 и ссылки'],timers:['Таймеры','Локальные таймеры с системными уведомлениями'],monitor:['Server Monitor','Официальный каталог серверов и сохранённые публичные карточки игроков'],forum:['Forum Experience','Биндер, персональная навигация и оформление в едином пространстве'],home:['Обзор','Рабочая среда под ваши RP-проекты'],profiles:['Профили','Переключение между игровыми серверами'],sites:['Сайты и разрешения','Вы контролируете, где работает расширение'],settings:['Настройки','Настройте интерфейс под себя'],backup:['Резервные копии','Перенос данных между браузерами']};
function moduleWarning() {
  if (!moduleErrors.length) return '';
  return `<section class="card stack" role="alert"><h3>Часть разделов временно недоступна</h3><p class="subtle">${e(moduleErrors.map(x=>x.name).join(', '))}. Остальные разделы и локальные данные доступны.</p><button type="button" class="button secondary" data-action="retry-modules">Повторить загрузку</button></section>`;
}
async function refreshAllModules() {
  const tasks = [
    ['Форум',refreshForum],['Жалобы',refreshComplaints],['Экономика',refreshEconomy],
    ['Законы',refreshLaw],['Ведомства',refreshGovernment],['Документы',refreshDocuments],
    ['Интеграции',refreshIntegrations],['Серверы и игроки',refreshMonitor],
    ['Центр знаний',()=>refreshKnowledge(state.profiles.map(p=>p.id))],['Таймеры',refreshTimers]
  ];
  const results = await Promise.allSettled(tasks.map(([,fn])=>fn()));
  moduleErrors = results.flatMap((r,i)=>r.status==='rejected'?[{name:tasks[i][0],reason:r.reason?.message||String(r.reason)}]:[]);
  if (moduleErrors.length) console.warn('MajesticToolkit: часть модулей не загружена',moduleErrors);
}
function renderPopup() {
  const p = getActiveProfile(state);
  return `<div class="popup-shell stack ws-popup"><div class="brand"><span class="logo" aria-label="Логотип MajesticToolkit">MT</span><div><h1>MajesticToolkit</h1><p>Tactical Toolkit · 2.3.0</p></div></div><div class="card stack"><div class="row spread"><strong>Активный профиль</strong>${tag(projectLabel(p.project))}</div><select aria-label="Выбрать профиль" id="popup-profile">${state.profiles.map(x => `<option value="${e(x.id)}" ${x.id === state.activeProfileId ? 'selected' : ''}>${e(x.name)} · ${e(x.server)}</option>`).join('')}</select><p class="subtle">${e(p.server)}</p>${p.forumUrl ? `<button class="button secondary" data-url="${e(p.forumUrl)}">Открыть форум ↗</button>` : ''}</div><div class="row"><button class="button primary" data-action="panel">Боковая панель</button><button class="button secondary" data-action="workspace">Рабочее пространство ↗</button></div><div class="ws-popup-grid"><button class="button secondary" data-action="popup-search">Поиск</button><button class="button secondary" data-action="popup-forum">Биндер</button><button class="button secondary" data-action="popup-navigation">Навигация</button><button class="button secondary" data-action="popup-customization">Оформление</button><button class="button secondary" data-action="popup-monitor">Серверы и игроки</button><button class="button secondary" data-action="popup-moderation">Центр модерации</button><button class="button secondary" data-action="popup-complaints">Жалобы</button><button class="button secondary" data-action="popup-timers">Таймеры</button><button class="button secondary" data-action="popup-economy">Экономика</button><button class="button secondary" data-action="popup-tactical">Tactical Toolkit</button><button class="button secondary" data-action="popup-rules">Правила проекта</button><button class="button secondary" data-action="popup-law">Законы</button><button class="button secondary" data-action="popup-government">Ведомства</button><button class="button secondary" data-action="popup-justice">Government & Justice</button><button class="button secondary" data-action="popup-documents">Документы</button><button class="button secondary" data-action="popup-integrations">Интеграции</button><button class="button secondary" data-action="popup-knowledge">Центр знаний</button><button class="button secondary" data-action="popup-settings">Настройки и профили</button><button class="button link" data-url="https://docossum.com/">Docossum ↗</button><button class="button link" data-url="https://fletcher-wiki.com/">Fletcher ↗</button></div><footer class="copyright">© <a href="https://github.com/TheSkiF4er" target="_blank" rel="noopener noreferrer">SkiF4er</a></footer></div>`;
}
function render() {
  if (!state) return;
  disposeTacticalMap();
  disposeTacticalAirdrops();
  disposeTacticalPlanning();
  disposeTacticalSimulations();
  disposeTacticalAnalytics();
  document.documentElement.dataset.theme = state.preferences.theme;
  document.documentElement.dataset.accent = productivity.accent;
  document.body.dataset.compact = String(state.preferences.compact);
  if (popup) { replaceHtml(app, moduleWarning() + renderPopup()); return; }
  if(view!=='ai')stopAI();
  const title = titles[view];
  const contents = {ai:aiSection,evidence:()=>evidenceKnowledgeSection(state,complaintsSection(state),knowledgeSection(state)),moderation:()=>moderationCenterSection(state,complaintsSection(state)), rules: rulesSection, home: sectionHome, timers: timersSection, search: () => productivitySection(state), forum: () => forumSection(state), monitor: () => monitorSection(state), complaints: () => complaintsSection(state), economy: () => economySection(state), tactical: () => tacticalSection(state), law: () => lawSection(state), justice: () => governmentJusticeSection(state), government: () => governmentSection(state), documents: () => documentSection(state), integrations: () => integrationsSection(state), knowledge:()=>knowledgeSection(state), profiles: sectionProfiles, sites: sectionSites, settings: sectionSettings, backup: sectionBackup };
  const wasOpen=document.querySelector('.ws-dashboard details')?.open; if(wasOpen!==undefined)dashboardConfigOpen=wasOpen;
  replaceHtml(app, `<div class="layout ws-layout"><aside class="side"><div class="brand"><div class="logo" aria-label="Логотип MajesticToolkit">MT</div><div><h1>MajesticToolkit</h1><p>Tactical Toolkit · 2.3.0</p></div></div>${profileSelect()}<nav class="nav" aria-label="Разделы">${groupedNav()}</nav><div class="side-footer">Локальные данные · AI только по согласию<div class="copyright">© <a href="https://github.com/TheSkiF4er" target="_blank" rel="noopener noreferrer">SkiF4er</a></div></div></aside><main class="main" id="workspace-main"><header class="topline"><div><p class="eyebrow">MajesticToolkit / ${e(title[0])}</p><h2>${e(title[0])}</h2><p class="lead">${e(title[1])}</p></div><button class="button secondary ws-search" data-action="nav" data-view="search" aria-label="Единый поиск">⌕ Поиск <kbd>Ctrl K</kbd></button></header>${moduleWarning()}${view==='forum'?`<nav class="ws-forum-tabs" aria-label="Разделы форума">${FORUM_TABS.map(([id,label])=>`<button class="button ${forumPane===id?'primary':'secondary'}" data-action="forum-pane" data-pane="${id}" aria-pressed="${forumPane===id}">${label}</button>`).join('')}</nav>`:''}${contents[view]()}</main></div>`);
  if(view==='tactical'){void mountTacticalMap(document.getElementById('tactical-map-root'),state,feedback,openFromTactical);void mountTacticalAirdrops(document.getElementById('tactical-airdrop-root'),state,feedback);void mountTacticalPlanning(document.getElementById('tactical-planning-root'),state,feedback);void mountTacticalSimulations(document.getElementById('tactical-simulation-root'),state,feedback);void mountTacticalAnalytics(document.getElementById('tactical-analytics-root'),state,feedback);void mountTacticalLinks(document.getElementById('tactical-links-root'),state,feedback);}
  if(view==='ai')void mountAI(document.getElementById('ai-connection'),state,feedback).catch(error=>feedback(error.message,true));
  if(view==='complaints'){
    mountSectionMonitor(document.getElementById('section-monitor-root'),state,feedback);
    void mountEvidenceVault(document.getElementById('evidence-vault-root'),state,feedback,async()=>{await refreshComplaints();render();}).catch(error=>feedback(error.message,true));
  }
  if(view==='evidence')mountEvidenceKnowledge(document.getElementById('evidence-knowledge-center'),state,feedback,async()=>{await refreshComplaints();render();});
  if(view==='moderation')mountModerationCenter(document.getElementById('moderation-center'),state,feedback);
  if(view==='rules'){mountRulesExperience(document.getElementById('rules-experience'),state,feedback);void mountRules(document.getElementById('rules-root'),state,feedback).catch(err=>feedback(err.message,true));}
  if(view==='forum'){
    for(const el of document.querySelectorAll('[data-forum-pane]'))el.hidden=el.dataset.forumPane!==forumPane;
    if(forumPane==='customization')mountCustomization(document.getElementById('forum-customization'),state,next=>{state=next;render();},feedback);
  }
  if(view==='home'){const details=document.querySelector('.ws-dashboard details');if(details)details.open=dashboardConfigOpen;void refreshDashboard();}

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
  const market = await listMarketplace();
  const trading = await listInventory();
  const familyRows = await listFamilies();
  const organizations = await listOrganizations();
  const crime = await listCrime();
  const finance = await listFinance();
  const laws = lawRecords();
  const government = governmentRecords();
  const documents = documentRecords();
  const text = await createBackupText();
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `majestictoolkit-backup-v2.3.0-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  feedback(`Копия: ${templates.length} шаблонов, ${cases.length} жалоб, ${economy.length} операций/матчей, ${market.length} товаров/наблюдений/объявлений, ${trading.reduce((n,b)=>n+b.events.length,0)} складских операций, ${familyRows.length} семей, ${organizations.length} организаций, ${crime.territories.length} территорий и ${crime.operations.length} RP-событий, ${finance.reduce((n,b)=>n+b.events.length,0)} финансовых событий, ${laws.length} записей законодательства, ${government.length} ведомственных записей, ${documents.length} документов/шаблонов, ${externalLinks().length} внешних закладок`);
}
async function createBackupText({includeAI=document.getElementById('backup-include-ai')?.checked===true,tacticalBundle=null}={}){
  verifyJusticeStorageRows(await api.storage.local.get(null));
  const {territories,operations}=await listCrime();
  const backupArgs=[[validateState(state),await listTemplates(),await listCases(),await listEconomyRecords(),lawRecords(),governmentRecords(),documentRecords(),externalLinks(),productivity,await listXenForoLinks(),await loadMonitor(),await loadKnowledge(state.profiles.map(p=>p.id)),globalThis.RPNForumCore.cleanTemplate,await listSources(),await listRules()],await exportPunishmentData(state.profiles),await exportSectionData(state.profiles),await exportRegistryData(state.profiles),await exportModerationOps(state.profiles),await inventoryAllVault(state.profiles),includeAI?await exportAIWorkspaces(state.profiles):null,await listMarketplace(),await listInventory(),await listFamilies(),await listOrganizations(),territories,operations,await listFinance(),await listEconomyLinks()];
  const tactical=tacticalBundle??await collectTacticalBackup(state.profiles);
  return makeBackupV21(backupArgs,tactical.snapshot);
}
async function requestCaseReplacement(cases) {
  const result=await api.runtime.sendMessage({type:'RP_NEXUS_CASE_MUTATE',action:'replace',cases});
  if(!result?.ok) throw Error(result?.error || 'Не удалось восстановить жалобы');
}

async function changePermission(site = FORUM_SITE.origin) {
  if (site !== FORUM_SITE.origin && site !== RUSSIA_FORUM.origin) throw Error('Неизвестный домен форума');
  // Cached permissions are updated by onAdded/onRemoved and initial refresh.
  // A contains() call here would lose transient user activation in Firefox Android.
  const granted = site === FORUM_SITE.origin ? permissionGranted : russiaPermissionGranted;
  const operation = changeHostPermission(api.permissions, [site], granted);
  const result = await operation;
  await refreshPermission();
  render();
  const nowGranted = site === FORUM_SITE.origin ? permissionGranted : russiaPermissionGranted;
  if (!granted && nowGranted) feedback('Доступ предоставлен. Панель появится на вкладке форума.');
  else if (granted && !nowGranted) feedback('Доступ отозван.');
  else if (!result && !granted) feedback('Разрешение не предоставлено', true);
  else feedback('Состояние доступа обновлено.');
}

async function executeAction(button) {
  if (button.dataset.url) { await openTab(button.dataset.url); return; }
  const { action, id } = button.dataset;
  if(action==='forum-pane'){setForumPane(button.dataset.pane);render();document.querySelector(`[data-action="forum-pane"][data-pane="${forumPane}"]`)?.focus();return;}
  if(action==='backup-portable-export'){
    const tacticalBundle=await collectTacticalBackup(state.profiles);
    const json=await createBackupText({tacticalBundle});
    const inventory=await inventoryAllVault(state.profiles);
    const registry=await exportRegistryData(state.profiles);
    const referenced=new Set([...(await listCases()).flatMap(c=>c.evidence.map(x=>x.vaultId).filter(Boolean)),...registry.records.flatMap(r=>r.evidence.map(x=>x.vaultId).filter(Boolean))]);
    const known=new Set(inventory.map(x=>x.id));
    const missing=[...referenced].filter(id=>!known.has(id));
    if(missing.length)throw Error(`Невозможно создать полную переносимую копию: ${missing.length} материалов отсутствуют в Evidence Vault. Восстановите или удалите несвязанные записи перед экспортом.`);
    const {blob,manifest}=await makePortableBackup(json,inventory,tacticalBundle.files);
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`majestictoolkit-portable-backup-v2.3.0-${new Date().toISOString().slice(0,10)}.zip`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    feedback(`Переносимая копия: ${manifest.files.length} файлов Evidence Vault и ${manifest.maps.length} карт, проверены SHA-256`);return;
  }
  if(action==='ai-support'){navigateTo('ai');render();document.getElementById('ai-support-root')?.scrollIntoView?.({block:'start'});return;}
  if(action==='ai-rule'||action==='ai-source'){
    const p=getActiveProfile(state);
    if(action==='ai-rule'){
      const r=(await listRules()).find(x=>x.id===id&&x.profileId===p.id&&x.project===p.project&&!x.archived&&(!x.server||x.server===p.server));
      if(!r)throw Error('Правило недоступно в выбранном профиле');
      const revision=r.revisions.find(v=>v.id===r.activeRevisionId);
      prefillAIWorkspace('rule',r.id);prefillAIRules('rule',r.id,`Что означает пункт ${revision.code} — ${revision.title}? Укажи источник и возможные санкции.`);
    }else{
      const source=(await listSources()).find(x=>x.id===id&&x.profileId===p.id);
      if(!source)throw Error('Источник недоступен в выбранном профиле');
      prefillAIWorkspace('source',source.id);prefillAIRules('source',source.id,`Объясни содержание сохранённого источника «${source.title}» с цитатами.`);
    }
    navigateTo('ai');render();return;
  }
  if(action==='dashboard-refresh'){await refreshDashboard();return;}
  if(action==='case-knowledge-graph'){const c=(await listCases()).find(x=>x.id===id&&x.profileId===state.activeProfileId);if(!c)throw Error('Жалоба не найдена');setGraphCaseFilter(c.id);await refreshKnowledge(state.profiles.map(p=>p.id));navigateTo('evidence','graph');const u=new URL(location.href);u.searchParams.set('evidenceCase',c.id);history.replaceState(null,'',u.href);render();document.getElementById('evidence-knowledge-graph')?.scrollIntoView?.({block:'start'});return;}
  if(action==='dashboard-rule'){const p=getActiveProfile(state);const rule=(await listRules()).find(r=>r.id===id&&r.profileId===p.id&&r.project===p.project&&!r.archived&&(!r.server||r.server===p.server));if(!rule)throw Error('Правило недоступно');await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?rule='+encodeURIComponent(id)+'#rules')});return;}
  if(action==='dashboard-case'){const p=getActiveProfile(state);const c=(await listCases()).find(x=>x.id===id&&x.profileId===p.id&&x.status!=='done'&&x.moderation?.project===p.project&&x.moderation?.server===p.server);if(!c)throw Error('Жалоба недоступна');await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?calculator=1&calcProfile='+encodeURIComponent(p.id)+'&caseId='+encodeURIComponent(c.id)+'#rules')});return;}
  if(action==='widget-order'){await updateWidgets(v=>changeWidget(v,id,button.dataset.direction));return;}
  if(action==='widget-reset'){await updateWidgets(()=>workspacePreferences());return;}
  if(action==='dashboard-template'){const t=(await listTemplates()).find(x=>x.id===id&&['*',state.activeProfileId].includes(x.profileId));if(!t)throw Error('Шаблон недоступен');await refreshForum();await handleForumAction({dataset:{forumAction:'copy',id}},state,render,feedback);return;}
  if(action==='dashboard-bookmark'){const p=getActiveProfile(state),host=globalThis.MTXenForo.domain(p.forumUrl);const row=globalThis.MTXenForo.selectNavigation(await listXenForoLinks(),p.id,host).find(x=>x.id===id&&x.kind==='bookmark');if(!row)throw Error('Закладка недоступна');await refreshForum();await handleForumAction({dataset:{forumAction:'open-link',id}},state,render,feedback);return;}
  if(action==='popup-navigation'||action==='popup-customization'){await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?section='+(action==='popup-navigation'?'navigation':'customization')+'#forum')});return;}
  if (action === 'retry-modules') { await refreshBinderProfile(state.activeProfileId);
  await refreshAllModules(); render(); if(!moduleErrors.length)feedback('Разделы загружены'); else feedback('Не все разделы удалось загрузить',true); return; }
  if (action === 'nav') { if(!navigateTo(button.dataset.view,button.dataset.pane))throw Error('Раздел не найден'); if (view === 'search') await refreshProductivitySearch(); if(['knowledge','evidence'].includes(view))await refreshKnowledge(state.profiles.map(p=>p.id)); if (view === 'forum') {await refreshBinderProfile(state.activeProfileId);await refreshForum();} if(view==='monitor') await refreshMonitor(); if(['complaints','evidence'].includes(view)) await refreshComplaints(); if(view==='timers') await refreshTimers(); if(view==='economy') await Promise.all([refreshEconomy(),refreshTrading(state.activeProfileId),refreshFamilies(),refreshOrganizations(state.activeProfileId)]); if(view==='tactical')await refreshTacticalWorkspace(); if(view==='law') await refreshLaw(); if(view==='government') await refreshGovernment(); if(view==='justice') await Promise.all([refreshGovernment(),refreshLaw(),refreshDocuments()]); if(view==='documents') await refreshDocuments(); if(view==='integrations') await refreshIntegrations(); render(); return; }
  if(action==='popup-tactical'){await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#tactical')});return;}
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
    const previousSources=await listSources();
    const previousRules=await listRules();
    const previousTemplates = await listTemplates();
    const dependent = previousTemplates.filter(t => t.profileId === id);
    const previousCases = await listCases();
    const previousRegistry=await exportRegistryData(state.profiles);
    const related = previousCases.filter(c => c.profileId === id);
    const previousEconomy = await listEconomyRecords();
    const relatedEconomy = previousEconomy.filter(r => r.profileId === id);
    const previousMarket = await listMarketplace();
    const previousTrading = await listInventory();
    const relatedTrading = previousTrading.filter(b=>b.profileId===id);
    const relatedMarket = previousMarket.filter(r=>r.profileId===id);
    const previousFamilies = await listFamilies();
    const previousOrganizations = await listOrganizations();
    const previousCrime = await listCrime();
    const previousFinance = await listFinance();
    const previousEconomyLinks=await listEconomyLinks();
    const previousTacticalLinks=await listTacticalLinks();
    const relatedTacticalLinks=previousTacticalLinks.filter(r=>r.profileId===id);
    const relatedEconomyLinks=previousEconomyLinks.filter(r=>r.profileId===id);
    const relatedFinance = previousFinance.filter(b=>b.profileId===id);
    const relatedCrime = [...previousCrime.territories,...previousCrime.operations].filter(r=>r.profileId===id);
    const relatedOrganizations = previousOrganizations.filter(r=>r.profileId===id);
    const relatedFamilies = previousFamilies.filter(r=>r.profileId===id);
    const previousLaws = lawRecords().slice();
    const relatedLaws = previousLaws.filter(r=>r.profileId===id);
    const previousGovernment = governmentRecords().slice();
    const previousDocuments = documentRecords().slice();
    const relatedDocuments = previousDocuments.filter(r=>r.profileId===id);
    const relatedGovernment = previousGovernment.filter(r=>r.profileId===id);
    if (!confirm(`Удалить профиль «${p.name}» и связанных с ним шаблонов: ${dependent.length}, жалоб: ${related.length}, записей экономики: ${relatedEconomy.length}, товаров и рыночных записей: ${relatedMarket.length}, складских журналов: ${relatedTrading.length}, семей: ${relatedFamilies.length}, организаций: ${relatedOrganizations.length}, территорий / RP-событий: ${relatedCrime.length}, финансовых журналов: ${relatedFinance.length}, экономических связей: ${relatedEconomyLinks.length}, тактических связей: ${relatedTacticalLinks.length}, записей законодательства: ${relatedLaws.length}, ведомственных записей: ${relatedGovernment.length}, документов: ${relatedDocuments.length}, правил: ${previousRules.filter(r=>r.profileId===id).length}, записей реестра: ${previousRegistry.records.filter(r=>r.profileId===id).length}? Это действие нельзя отменить без резервной копии.`)) return;
    try {
      // Detach the removed profile's source links before deleting its documents.
      if(relatedTacticalLinks.length)await api.storage.local.remove(relatedTacticalLinks.map(x=>TACTICAL_LINK_PREFIX+x.id));
      if(relatedEconomyLinks.length)await replaceEconomyLinks(previousEconomyLinks.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id),{marketplace:previousMarket.filter(r=>r.profileId!==id),families:previousFamilies.filter(r=>r.profileId!==id),organizations:previousOrganizations.filter(r=>r.profileId!==id),territories:previousCrime.territories.filter(r=>r.profileId!==id),documents:previousDocuments.filter(r=>r.profileId!==id),evidenceVault:await inventoryAllVault(state.profiles.filter(p=>p.id!==id))});
      await replaceXenForoLinks(previousXfLinks.filter(x=>x.profileId!==id));
      if (dependent.length) await replaceTemplates(previousTemplates.filter(t => t.profileId !== id));
      if (related.length) await requestCaseReplacement(previousCases.filter(c => c.profileId !== id));
      if (relatedEconomy.length) await replaceEconomy(previousEconomy.filter(r => r.profileId !== id));
      if (relatedFinance.length) await replaceFinance(previousFinance.filter(b=>b.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id),{families:previousFamilies.filter(f=>f.profileId!==id),organizations:previousOrganizations.filter(o=>o.profileId!==id)});
      if (relatedCrime.length) await replaceCrime(previousCrime.territories.filter(r=>r.profileId!==id),previousCrime.operations.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      if (relatedFamilies.length) await replaceFamilies(previousFamilies.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      if (relatedOrganizations.length) await replaceOrganizations(previousOrganizations.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      if (relatedTrading.length) await replaceInventory(previousTrading.filter(b=>b.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id),previousMarket.filter(r=>r.profileId!==id));
      if (relatedMarket.length) await replaceMarketplace(previousMarket.filter(r=>r.profileId!==id));
      if (relatedLaws.length) await replaceLawRecords(previousLaws.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      // Court cases reference Studio documents. Remove their Government records first
      // so Document Studio can validate and safely remove the profile's linked files.
      if (relatedGovernment.length) await replaceGovernment(previousGovernment.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      if (relatedDocuments.length) await replaceDocumentRecords(previousDocuments.filter(r=>r.profileId!==id),state.profiles.filter(p=>p.id!==id).map(p=>p.id),previousGovernment.filter(r=>r.profileId!==id));
      await replaceMonitor({...previousMonitor,players:previousMonitor.players.filter(x=>x.profileId!==id)});
      await replaceSources(previousSources.filter(x=>x.profileId!==id));
      await removeRuleProfile(id);
      await replaceKnowledge({...previousKnowledge,resources:previousKnowledge.resources.filter(r=>r.profileId!==id),relations:previousKnowledge.relations.filter(r=>r.profileId!==id),evidenceGraph:previousKnowledge.evidenceGraph?{...previousKnowledge.evidenceGraph,quotes:previousKnowledge.evidenceGraph.quotes.filter(q=>q.profileId!==id),links:previousKnowledge.evidenceGraph.links.filter(l=>l.profileId!==id)}:undefined,collections:(previousKnowledge.collections||[]).filter(c=>c.profileId!==id)},state.profiles.filter(p=>p.id!==id).map(p=>p.id));
      await removeRegistryProfile(id);
      await removeAIProfile(id);
      state = await modifyState(s => deleteProfile(s, id));
      await replaceSectionData(await exportSectionData(state.profiles),state.profiles).catch(error=>console.warn('MajesticToolkit: не удалось очистить подписки',error));
      await removeCalculatorProfile(id).catch(error=>console.warn('MajesticToolkit: не удалось очистить расчёты',error));
      await removePunishmentProfile(id).catch(error=>console.warn('MajesticToolkit: не удалось очистить черновики удалённого профиля',error));
      await forgetEconomyProfile(state).catch(error=>console.warn('MajesticToolkit: не удалось обновить экономические вкладки профилей',error));
      await forgetTacticalProfiles(state).catch(error=>console.warn('MajesticToolkit: не удалось очистить тактические настройки профиля',error));
      await clearOrphanTacticalMaps(state.profiles.map(p=>p.id)).catch(error=>console.warn('MajesticToolkit: не удалось очистить карту удалённого профиля',error));
      await clearOrphanAirdrops(state.profiles.map(p=>p.id)).catch(error=>console.warn('MajesticToolkit: не удалось очистить аирдропы удалённого профиля',error));
      await clearOrphanTacticalPlans(state.profiles.map(p=>p.id)).catch(error=>console.warn('MajesticToolkit: не удалось очистить планы удалённого профиля',error));
      await clearOrphanTacticalSimulations(state.profiles.map(p=>p.id)).catch(error=>console.warn('MajesticToolkit: не удалось очистить симуляции удалённого профиля',error));
      await clearOrphanTacticalLinks(state.profiles.map(p=>p.id)).catch(error=>console.warn('MajesticToolkit: не удалось очистить связи удалённого профиля',error));
      await clearOrphanTacticalReplayPreferences(state.profiles.map(p=>p.id)).catch(error=>console.warn('MajesticToolkit: не удалось очистить настройки replay',error));
      await clearNavigationHistory(id).catch(error=>console.warn('MajesticToolkit: не удалось очистить историю удалённого профиля',error));
      await clearVaultProfile(id).catch(error=>console.warn('MajesticToolkit: не удалось удалить файлы удалённого профиля',error));
      await api.storage.local.remove(moderationOpsKey(id)).catch(error=>console.warn('MajesticToolkit: не удалось удалить локальный аудит профиля',error));
    } catch (error) {
      if(relatedTacticalLinks.length)await api.storage.local.set(Object.fromEntries(relatedTacticalLinks.map(x=>[TACTICAL_LINK_PREFIX+x.id,x])));
      await replaceRegistryData(previousRegistry,state.profiles);
      await replaceXenForoLinks(previousXfLinks);
      await replaceMonitor(previousMonitor);
      await replaceSources(previousSources);
      await replaceRules(previousRules);
      await replaceKnowledge(previousKnowledge,state.profiles.map(p=>p.id));
      if (dependent.length) await replaceTemplates(previousTemplates);
      if (related.length) await requestCaseReplacement(previousCases);
      if (relatedEconomy.length) await replaceEconomy(previousEconomy);
      if (relatedFinance.length) await replaceFinance(previousFinance,state.profiles.map(p=>p.id),{families:previousFamilies,organizations:previousOrganizations});
      if (relatedCrime.length) await replaceCrime(previousCrime.territories,previousCrime.operations,state.profiles.map(p=>p.id));
      if (relatedFamilies.length) await replaceFamilies(previousFamilies,state.profiles.map(p=>p.id));
      if (relatedOrganizations.length) await replaceOrganizations(previousOrganizations,state.profiles.map(p=>p.id));
      if (relatedMarket.length) await replaceMarketplace(previousMarket);
      if (relatedTrading.length) await replaceInventory(previousTrading,state.profiles.map(p=>p.id),previousMarket);
      if (relatedLaws.length) await replaceLawRecords(previousLaws,state.profiles.map(p=>p.id));
      if (relatedGovernment.length) await replaceGovernment(previousGovernment,state.profiles.map(p=>p.id));
      if (relatedDocuments.length) await replaceDocumentRecords(previousDocuments,state.profiles.map(p=>p.id),previousGovernment);
      if(relatedEconomyLinks.length)await replaceEconomyLinks(previousEconomyLinks,state.profiles.map(p=>p.id),{marketplace:previousMarket,families:previousFamilies,organizations:previousOrganizations,territories:previousCrime.territories,documents:previousDocuments,evidenceVault:await inventoryAllVault(state.profiles)});
      throw error;
    }
    await Promise.all([refreshForum(),refreshComplaints(),refreshEconomy(),refreshLaw(),refreshGovernment(),refreshDocuments()]); feedback('Профиль и связанные записи удалены'); render(); return;
  }
  if (action === 'video-permission') {
    // Permission request originates directly from the user click.
    const granted = videoPermissionGranted;
    const result = await changeHostPermission(api.permissions, VIDEO_ORIGINS, granted);
    await refreshPermission();render();
    if(!granted && videoPermissionGranted)feedback('Видеооверлей разрешён. Если он не появился — обновите вкладку видео.');
    else if(granted && !videoPermissionGranted)feedback('Разрешения отозваны.');
    else if(!result&&!granted)feedback('Разрешение не предоставлено',true);
    else feedback('Состояние разрешения обновлено.');
    return;
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
  if(action==='popup-knowledge'){await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?evidenceTab=library#evidence')});return;}
  if (action === 'popup-integrations') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#integrations')});return;}
  if (action === 'popup-documents') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#documents')});return;}
  if (action === 'popup-justice') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#justice')});return;}
  if (action === 'popup-government') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#government')});return;}
  if (action === 'popup-rules') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#rules')});return;}
  if (action === 'popup-law') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#law')});return;}
  if (action === 'popup-economy') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#economy')});return;}
  if (action === 'popup-timers') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#timers')});return;}
  if (action === 'popup-moderation') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#moderation')});return;}
  if (action === 'popup-complaints') {await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#complaints')});return;}
  if (action === 'popup-forum') { await api.tabs.create({ url: api.runtime.getURL('ui/workspace.html#forum') }); return; }
  if (action === 'popup-settings') { await api.tabs.create({url:api.runtime.getURL('ui/workspace.html#settings')}); return; }
  if (action === 'workspace') { await openWorkspace(); return; }
}
async function handleJusticeAction(button){
  const kind=button.dataset.kind, id=button.dataset.id, action=button.dataset.justiceAction;
  if(action==='profiles'){navigateTo('profiles');render();return;}
  if(action==='refresh'){await Promise.all([refreshGovernment(),refreshLaw(),refreshDocuments()]);render();feedback('Сведения обновлены');return;}
  if(action==='integrity'){const result=await checkJusticeWorkspace(state);render();feedback(result.error?'Проверка выявила проблему: '+result.error:'Целостность судебных данных подтверждена',!!result.error);return;}
  if(action==='tab'){
    const tab=button.dataset.tab;
    await changeJusticeTab(state,tab);
    if(tab==='agencies')setGovernmentSection('departments');
    if(tab==='decisions')setGovernmentSection('decisions');
    if(tab==='documents')setDocumentTab('documents');
    render();return;
  }
  if(action==='agency-details'){const row=justiceRecord(state,'department',id);if(!row||row.tab!=='courts')throw Error('Суд не найден');setAgencyFilter(id);setAgencyTab('units');await changeJusticeTab(state,'agencies');render();return;}
  if(action==='court-decisions'){
    const row=justiceRecord(state,'department',id);
    if(!row||row.tab!=='courts')throw Error('Суд не найден в текущем профиле');
    await changeJusticeTab(state,'decisions');setGovernmentDecisionDepartment(id);render();return;
  }
  if(action!=='open')throw Error('Неизвестная операция Government & Justice');
  const row=justiceRecord(state,kind,id);
  if(!row)throw Error('Запись удалена или относится к другому профилю');
  await changeJusticeTab(state,row.tab);
  if(kind==='case'){openCourtCase(id);await rememberJusticeOpen(state,kind,id);render();return;}
  if(kind==='court'||kind==='jurisdiction'){setCourtTab(kind==='jurisdiction'?'jurisdiction':'registry');}
  if(kind==='department'||['unit','position','competence','assignment'].includes(kind)){setGovernmentSection('departments');if(kind!=='department')setAgencyTab(({unit:'units',position:'positions',competence:'competences',assignment:'assignments'})[kind]);}
  else if(kind==='decision')setGovernmentSection('decisions');
  else if(kind==='government-template')setGovernmentSection('templates');
  else if(kind==='document-template')setDocumentTab('templates');
  else if(kind==='document')setDocumentTab('documents');
  await rememberJusticeOpen(state,kind,id);
  render();
  const buttonLike={dataset:{id}};
  if(['court','jurisdiction'].includes(kind)){
    buttonLike.dataset.courtAction=kind==='court'?'edit-court':'edit-rule';
    await handleCourtAction(buttonLike,state,governmentRecords(),refreshGovernment,render,feedback);
  }else if(['unit','position','competence','assignment'].includes(kind)){
    buttonLike.dataset.agencyAction='edit';buttonLike.dataset.type=kind;
    await handleAgencyAction(buttonLike,state,governmentRecords(),refreshGovernment,render,feedback);
  }else if(kind==='department'||kind==='decision'||kind==='government-template'){
    buttonLike.dataset.governmentAction=kind==='department'?'edit-department':kind==='decision'?'view-decision':'edit-template';
    await handleGovernmentAction(buttonLike,state,render,feedback,lawRecords());
  }else if(kind==='book'||kind==='memo'){
    buttonLike.dataset.lawAction=kind==='book'?'open-book':'edit-memo';
    await handleLawAction(buttonLike,state,render,feedback);
  }else{
    buttonLike.dataset.documentAction=kind==='document'?'view':'edit-template';
    await handleDocumentAction(buttonLike,state,render,feedback);
  }
}
async function openFromTactical(kind,id,mode){
  const tab=kind==='family'?'groups':kind==='organization'?'organizations':'territories';
  await changeEconomyTab(state,tab);
  await refreshEconomy();
  if(kind==='territory'||kind==='event')await refreshCrime();
  if(kind==='family')await refreshFamilies();
  if(kind==='organization')await refreshOrganizations(state.activeProfileId);
  navigateTo('economy');render();
  if(mode==='go')return;
  if(mode==='create'){
    if(kind==='territory'||kind==='event')await handleCrimeAction({dataset:{crimeAction:kind==='territory'?'territory-new':'event-new'}},state,render,feedback);
    else if(kind==='family')await handleFamilyAction({dataset:{familyAction:'new'}},state,render,feedback);
    else await handleOrganizationAction({dataset:{orgAction:'new'}},state,render,feedback);
    return;
  }
  if(mode!=='open')throw Error('Неизвестная операция перехода');
  if(kind==='territory'||kind==='event')await handleCrimeAction({dataset:{crimeAction:kind==='territory'?'territory-select':'event-details',id}},state,render,feedback);
  else if(kind==='family')await handleFamilyAction({dataset:{familyAction:'select',id}},state,render,feedback);
  else await handleOrganizationAction({dataset:{orgAction:'select',id}},state,render,feedback);
}
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-judgment-action],button[data-court-evidence-action],button[data-proceeding-action],button[data-court-case-action],button[data-court-action],button[data-agency-action],button[data-timer-action],button[data-productivity-action],button[data-action],button[data-url],button[data-forum-action],button[data-case-action],button[data-economy-action],button[data-tactical-action],button[data-econ-int-action],button[data-market-action],button[data-trading-action],button[data-family-action],button[data-org-action],button[data-crime-action],button[data-finance-action],button[data-analytics-action],button[data-law-action],button[data-government-action],button[data-document-action],button[data-justice-action],button[data-integration-action],button[data-monitor-action],button[data-knowledge-action],button[data-source-action],button[data-library-action],button[data-graph-action]');
  if (!button || button.disabled) return;
  if(button.dataset.judgmentAction){void handleJudgmentAction(button,state,refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.proceedingAction){void handleProceedingAction(button,state,governmentRecords()).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.courtEvidenceAction){void handleCourtEvidenceAction(button,state,refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.courtCaseAction){void handleCourtCaseAction(button,state,governmentRecords(),refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.courtAction){void handleCourtAction(button,state,governmentRecords(),refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.agencyAction){void handleAgencyAction(button,state,governmentRecords(),refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.tacticalAction){void handleTacticalAction(button,state,render,feedback,openFromTactical).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.familyAction){void handleFamilyAction(button,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.orgAction){void handleOrganizationAction(button,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.crimeAction){void handleCrimeAction(button,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.econIntAction){void handleEconomyIntegrationAction(button,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.financeAction){void handleFinanceAction(button,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.timerAction){void handleTimerAction(button,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.sourceAction){
    const action=button.dataset.sourceAction;
    const active=getActiveProfile(state);
    const task=action==='delete' ? removeSource(button.dataset.id,active.id).then(()=>feedback('Импортированная статья удалена')) : importOpenedPage(action,active).then(row=>feedback('Сохранён текст страницы: '+row.title));
    void task.then(async()=>{clearProductivityCache();await refreshKnowledge(state.profiles.map(p=>p.id));if(view==='search')await refreshProductivitySearch();render();}).catch(err=>feedback(err.message,true));
    return;
  }
  if(view==='evidence'&&button.dataset.graphAction==='quote-source')document.querySelector('[data-ek-tab=graph]')?.click();
  if(view==='evidence'&&button.dataset.caseAction==='vault-focus')document.querySelector('[data-ek-tab=vault]')?.click();
  if(button.dataset.graphAction){void handleGraphAction(button,state,knowledgeSnapshot(),()=>refreshKnowledge(state.profiles.map(p=>p.id)),render,feedback,target=>{navigateTo(target);render();}).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.libraryAction){
    void handleLibraryAction(button,state,knowledgeSourceRows(),knowledgeSnapshot(),()=>refreshKnowledge(state.profiles.map(p=>p.id)),render,feedback)
      .then(()=>{clearProductivityCache();}).catch(err=>feedback(err.message,true));return;
  }
  if(button.dataset.productivityAction==='reset-shortcuts'){
    const task=saveProductivity({shortcuts:[...defaultProductivity().shortcuts]}).then(next=>{productivity=next;render();feedback('Горячие клавиши сброшены');});
    void task.catch(err=>feedback(err.message,true));return;
  }
  if(button.dataset.productivityAction){
    void handleProductivityAction(button,state,target=>{navigateTo(target);render();},feedback).catch(err=>feedback(err.message,true));return;
  }
  if(button.dataset.forumAction==='reset-settings'){
    const scope=button.dataset.id;void modifyState(current=>savePreferences(current,{forum:updateForumSettings(current.preferences.forum,scope,scope==='global'?FORUM_DEFAULTS:null)})).then(next=>{state=next;render();feedback('Настройки форума сброшены');}).catch(err=>feedback(err.message,true));return;
  }
  if(button.dataset.analyticsAction){void handleAnalyticsAction(button,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.marketAction){void handleMarketplaceAction(button,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.tradingAction){void handleTradingAction(button,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(button.dataset.justiceAction){void handleJusticeAction(button).catch(err=>feedback(err.message,true));return;}
  const recentKind=button.dataset.governmentAction&&({ 'edit-department':'department','view-decision':'decision','edit-decision':'decision','edit-template':'government-template'}[button.dataset.governmentAction])||button.dataset.lawAction&&({'open-book':'book','edit-memo':'memo'}[button.dataset.lawAction])||button.dataset.documentAction&&({'view':'document','edit-document':'document','edit-template':'document-template'}[button.dataset.documentAction]);
  if(view==='justice'&&recentKind&&button.dataset.id)void rememberJusticeOpen(state,recentKind,button.dataset.id).catch(err=>feedback(err.message,true));
  const task = button.dataset.knowledgeAction ? handleKnowledgeAction(button,state,render,feedback,target=>{navigateTo(target);render();}) : button.dataset.monitorAction ? handleMonitorAction(button,state,render,feedback) : button.dataset.integrationAction ? handleIntegrationAction(button,state,render,feedback,createBackupText) : button.dataset.forumAction
    ? handleForumAction(button, state, render, feedback)
    : button.dataset.caseAction ? handleComplaintAction(button,state,render,feedback)
    : button.dataset.economyAction ? handleEconomyAction(button,state,render,feedback)
    : button.dataset.lawAction ? handleLawAction(button,state,render,feedback) : button.dataset.governmentAction ? handleGovernmentAction(button,state,render,feedback,lawRecords()) : button.dataset.documentAction ? handleDocumentAction(button,state,render,feedback) : executeAction(button);
  void task.catch(err => feedback(err?.message || 'Ошибка выполнения операции', true));
});
document.addEventListener('input', event => {
  handleDocumentInput(event);
  if(event.target.id==='agency-search'){setAgencyQuery(event.target.value);const target=document.getElementById('agency-results');if(target)replaceHtml(target,agencyListHTML(state,governmentRecords()));return;}
  if(event.target.id==='court-case-search'){setCourtCaseFilter('query',event.target.value);const target=document.getElementById('court-case-list');if(target)replaceHtml(target,caseListHTML(state,governmentRecords()));return;}
  if(event.target.id==='justice-search'){setJusticeQuery(event.target.value);const target=document.getElementById('justice-results');if(target)replaceHtml(target,justiceSearchHTML(state));return;}
  if(event.target.id==='knowledge-search'){const pos=event.target.selectionStart;setKnowledgeQuery(event.target.value);render();const el=document.getElementById('knowledge-search');el?.focus();el?.setSelectionRange(pos,pos);return;}
  if(event.target.id==='knowledge-graph-search'){const pos=event.target.selectionStart;setGraphQuery(event.target.value);render();const el=document.getElementById('knowledge-graph-search');el?.focus();el?.setSelectionRange(pos,pos);return;}
  if(event.target.id==='knowledge-library-search'){
    const pos=event.target.selectionStart;setLibraryQuery(event.target.value);render();const node=document.getElementById('knowledge-library-search');node?.focus();node?.setSelectionRange(pos,pos);return;
  }
  if(event.target.id==='productivity-search') {setSearchQuery(event.target.value,state);return;}
  if (event.target.id === 'forum-search') {filterForum(event.target.value);return;}
  if (event.target.id === 'complaint-search') setComplaintQuery(event.target.value);
  if (event.target.id === 'law-search') {const pos=event.target.selectionStart;setLawQuery(event.target.value);render();const el=document.getElementById('law-search');el?.focus();el?.setSelectionRange(pos,pos);return;}
  if(event.target.id==='trading-search'){setTradingSearch(event.target.value);const pos=event.target.selectionStart;render();const el=document.getElementById('trading-search');el?.focus();el?.setSelectionRange(Math.min(pos,el.value.length),Math.min(pos,el.value.length));return;}
  if(event.target.id==='market-search'){setMarketplaceQuery(event.target.value);const pos=event.target.selectionStart;render();const el=document.getElementById('market-search');el?.focus();el?.setSelectionRange(Math.min(pos,el.value.length),Math.min(pos,el.value.length));return;}
  if(event.target.id==='economy-global-search'){setEconomyLookup(event.target.value,state);const el=document.getElementById('economy-global-results');if(el)replaceHtml(el,economyLookupHTML(state));return;}
  if(event.target.id==='finance-search'){const value=event.target.value,caret=event.target.selectionStart,profileId=state.activeProfileId;setFinanceQuery(profileId,value);clearTimeout(economySearchTimer);economySearchTimer=setTimeout(()=>{if(view!=='economy'||state.activeProfileId!==profileId)return;const before=document.getElementById('finance-search');if(!before||before.value!==value)return;render();const after=document.getElementById('finance-search');after?.focus();after?.setSelectionRange(Math.min(caret,after.value.length),Math.min(caret,after.value.length));},130);return;}
  if(event.target.id==='tactical-search'){const value=event.target.value,caret=event.target.selectionStart,profileId=state.activeProfileId;clearTimeout(economySearchTimer);economySearchTimer=setTimeout(()=>{if(view!=='tactical'||state.activeProfileId!==profileId)return;void changeTacticalSearch(state,value).then(()=>{if(view!=='tactical'||state.activeProfileId!==profileId)return;render();const el=document.getElementById('tactical-search');el?.focus();el?.setSelectionRange(Math.min(caret,el.value.length),Math.min(caret,el.value.length));}).catch(err=>feedback(err.message,true));},120);return;}
  if(event.target.id==='crime-search'){const value=event.target.value,caret=event.target.selectionStart,profileId=state.activeProfileId;setCrimeQuery(profileId,value);clearTimeout(economySearchTimer);economySearchTimer=setTimeout(()=>{if(view!=='economy'||state.activeProfileId!==profileId)return;const before=document.getElementById('crime-search');if(!before||before.value!==value)return;render();const after=document.getElementById('crime-search');after?.focus();after?.setSelectionRange(Math.min(caret,after.value.length),Math.min(caret,after.value.length));},160);return;}
  if(event.target.id==='organization-search'){const value=event.target.value,caret=event.target.selectionStart,profileId=state.activeProfileId;setOrganizationQuery(profileId,value);clearTimeout(economySearchTimer);economySearchTimer=setTimeout(()=>{if(view!=='economy'||state.activeProfileId!==profileId)return;const before=document.getElementById('organization-search');if(!before||before.value!==value)return;render();const after=document.getElementById('organization-search');after?.focus();after?.setSelectionRange(Math.min(caret,after.value.length),Math.min(caret,after.value.length));},160);return;}
  if(event.target.id==='families-search'){const value=event.target.value,caret=event.target.selectionStart,profileId=state.activeProfileId;setFamilyQuery(profileId,value);clearTimeout(economySearchTimer);economySearchTimer=setTimeout(()=>{if(view!=='economy'||state.activeProfileId!==profileId)return;const before=document.getElementById('families-search');if(!before||before.value!==value)return;render();const after=document.getElementById('families-search');after?.focus();after?.setSelectionRange(Math.min(caret,after.value.length),Math.min(caret,after.value.length));},160);return;}
  if(event.target.id==='economy-search'){const value=event.target.value,caret=event.target.selectionStart,profileId=state.activeProfileId;clearTimeout(economySearchTimer);economySearchTimer=setTimeout(()=>{if(view!=='economy'||state.activeProfileId!==profileId)return;void setEconomySearch(value,state).then(()=>{if(view!=='economy'||state.activeProfileId!==profileId)return;const current=document.getElementById('economy-search');if(!current||current.value!==value)return;render();const input=document.getElementById('economy-search');input?.focus();input?.setSelectionRange(Math.min(caret,input.value.length),Math.min(caret,input.value.length));}).catch(err=>feedback(err.message,true));},150);return;}
  if (event.target.matches('[data-case-draft]')) scheduleDraftSave(event.target,feedback);
});
async function restoreBackupText(text,portable=null){

      const backup = await parseBackupV21(text, validateState, globalThis.RPNForumCore.cleanTemplate);
      if(portable && (![17,18,19,20,21].includes(backup.schemaVersion)||JSON.stringify(backup.evidenceVault)!==JSON.stringify(portable.inventory)))throw Error('Данные ZIP не совпадают с Backup v17–v21');
      const replacing = backup.schemaVersion >= 3 ? `, ${backup.cases.length} жалоб` : '';
      const economyCount = backup.schemaVersion >= 4 ? `, ${backup.economy.length} записей экономики` : '';
      const familyCount=backup.families===null?'':`, ${backup.families.length} семей`;
      const orgCount=backup.organizations===null?'':`, ${backup.organizations.length} организаций`;
      const crimeCount=backup.territories===null?'':`, ${backup.territories.length} территорий и ${backup.crimeEvents.length} RP-событий`;
      const lawCount = backup.schemaVersion >= 5 ? `, ${backup.lawRecords.length} записей Law Codex` : '';
      const govCount = backup.schemaVersion >= 6 ? `, ${backup.government.length} ведомственных записей` : '';
      const documentsCount = backup.schemaVersion >= 7 ? `, ${backup.documents.length} документов/шаблонов` : '';
      const linksCount = backup.schemaVersion >= 8 ? `, ${backup.siteLinks.length} внешних закладок` : '';
      const xfCount=backup.schemaVersion>=10?`, ${backup.xenforoNavigation.length} ссылок XenForo`:'';
      const knowledgeCount=backup.schemaVersion>=12?`, ${backup.knowledgeWorkspace.relations.length} связей Центра знаний`:'';
      const rulesCount=backup.rules===null?'':`, ${backup.rules.length} правил проекта`;
      const sourcesCount=backup.schemaVersion>=14?`, ${backup.sourceLibrary.length} статей форума и Wiki`:'';
      const monitorCount=backup.schemaVersion>=11?`, ${backup.serverMonitor.players.length} карточек игроков`:'';
      const attachmentCount=backup.evidenceVault?.filter(x=>x.kind==='file').length??0;
      const mapNotice=backup.tactical?.maps.length&&!portable?` Backup v21 содержит ${backup.tactical.maps.length} карт без изображений: на этом устройстве должны быть идентичные подложки, иначе используйте ZIP v21.`:'';
      const aiNotice=backup.aiWorkspace!==null?` Будут восстановлены сохранённые диалоги и черновики ${backup.aiWorkspace.length} профилей.`:' История AI останется без изменений.';
      const filesNotice=portable?` ZIP включает ${portable.files.size} вложений и ${portable.maps?.size??0} карт.`:attachmentCount?` ВНИМАНИЕ: JSON не содержит ${attachmentCount} бинарных вложений; они могут отсутствовать на этом устройстве. Для полного восстановления используйте ZIP.`:'';
      if (!confirm(`Восстановить ${backup.state.profiles.length} профилей, ${backup.templates.length} шаблонов${replacing}${economyCount}${familyCount}${orgCount}${crimeCount}${lawCount}${govCount}${documentsCount}${linksCount}${xfCount}${monitorCount}${knowledgeCount}${sourcesCount}${rulesCount}? Данные, отсутствующие в старом формате копии, сохранятся.${filesNotice}${mapNotice}${aiNotice}`)) return;
      return (async () => {
        const beforeState = state;
        const beforeTemplates = await listTemplates();
        const beforeCases = await listCases();
        const beforeEconomy = await listEconomyRecords();
        const beforeMarket = await listMarketplace();
        const beforeTrading = await listInventory();
        const beforeFamilies = await listFamilies();
        const beforeOrganizations = await listOrganizations();
        const beforeCrime = await listCrime();
        const beforeFinance = await listFinance();
        const beforeEconomyLinks = await listEconomyLinks();
        const beforeLaws = lawRecords().slice();
        const beforeGovernment = governmentRecords().slice();
        const beforeDocuments = documentRecords().slice();
        const beforeLinks = externalLinks().slice();
        const beforeProductivity = productivity;
        const beforeXfLinks = await listXenForoLinks();
        const beforeMonitor=await loadMonitor();
        const beforeSources=await listSources();
        const beforeRules=await listRules();
        const beforePunishments=await exportPunishmentData(beforeState.profiles);
        const beforeSections=await exportSectionData(beforeState.profiles);
        const beforeRegistry=await exportRegistryData(beforeState.profiles);
        const beforeModerationOps=await exportModerationOps(beforeState.profiles);
        const beforeKnowledge=await loadKnowledge(beforeState.profiles.map(p=>p.id));
        const beforeAIWorkspaces=backup.aiWorkspace===null?null:await exportAIWorkspaces(beforeState.profiles);
        const beforeAISettings=(await api.storage.local.get('mtAiConnectionV191')).mtAiConnectionV191||{};
        const beforeTactical=await collectTacticalBackup(beforeState.profiles);
        let newlyInstalledVault=[];
        try {
          if (backup.schemaVersion < 3 && beforeCases.some(c => !backup.state.profiles.some(p => p.id === c.profileId))) {
            throw Error('Старая копия содержит другой набор профилей. Сначала экспортируйте данные 0.3.0, чтобы не потерять доступ к существующим жалобам.');
          }
          if (backup.schemaVersion < 4 && beforeEconomy.some(r => !backup.state.profiles.some(p => p.id === r.profileId))) throw Error('Старая копия содержит другой набор профилей. Экспортируйте копию 0.5.0 перед импортом.');
          if (backup.financeLedger===null && beforeFinance.some(b=>!backup.state.profiles.some(p=>p.id===b.profileId)))throw Error('Старая копия не содержит финансовый журнал отсутствующего профиля. Сначала экспортируйте Backup 2.1.7.');
          if (backup.financeLedger===null)validateFinanceBatches(beforeFinance,backup.state.profiles.map(p=>p.id),{families:backup.families??beforeFamilies,organizations:backup.organizations??beforeOrganizations});
          if (backup.territories===null && [...beforeCrime.territories,...beforeCrime.operations].some(r=>!backup.state.profiles.some(p=>p.id===r.profileId)))throw Error('Старая копия не содержит территории для отсутствующего профиля. Сначала экспортируйте Backup 2.1.6.');
          if (backup.territories===null)validateCrime(beforeCrime.territories,beforeCrime.operations,backup.state.profiles.map(p=>p.id),backup.families??beforeFamilies,backup.organizations??beforeOrganizations);
          if (backup.organizations===null && beforeOrganizations.some(o=>!backup.state.profiles.some(p=>p.id===o.profileId)))throw Error('Старая копия не содержит реестр организаций отсутствующего профиля. Экспортируйте Backup 2.1.5.');
          if (backup.families===null && beforeFamilies.some(f=>!backup.state.profiles.some(p=>p.id===f.profileId)))throw Error('Старая копия не содержит реестр семей для отсутствующего профиля. Сначала экспортируйте Backup 2.1.4.');
          if (backup.tradingInventory===null && beforeTrading.some(b=>!backup.state.profiles.some(p=>p.id===b.profileId)))throw Error('Старая копия не содержит складской журнал для отсутствующего профиля. Сначала экспортируйте копию 2.1.3.');
          if (backup.marketplace===null && beforeMarket.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId)))throw Error('Старая копия не содержит рыночный каталог, связанный с другими профилями. Сначала экспортируйте полную резервную копию 2.1.2.');
          if (backup.schemaVersion < 5 && beforeLaws.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId))) throw Error('Старая копия содержит другие профили. Экспортируйте полную копию перед импортом.');
          if (backup.schemaVersion < 6 && beforeGovernment.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId))) throw Error('Старая копия содержит другие профили. Сначала экспортируйте данные Government Tools.');
          if (backup.schemaVersion < 7 && beforeDocuments.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId))) throw Error('Старая копия содержит другие профили. Сначала экспортируйте документы.');
          if (backup.schemaVersion < 10 && (await listXenForoLinks()).some(x=>x.profileId!=='*'&&!backup.state.profiles.some(p=>p.id===x.profileId)))throw Error('Старая копия содержит другой набор профилей. Сначала экспортируйте все пользовательские ссылки XenForo.');
          if (backup.schemaVersion < 11 && beforeMonitor.players.some(x=>!backup.state.profiles.some(p=>p.id===x.profileId)))throw Error('Старая копия содержит другие профили. Сначала экспортируйте карточки игроков.');
          if (backup.schemaVersion < 14 && beforeSources.some(x=>!backup.state.profiles.some(p=>p.id===x.profileId)))throw Error('Старая копия не содержит тексты импортированных страниц, привязанные к другим профилям. Сначала экспортируйте копию v14.');
          if (backup.schemaVersion < 12 && [...beforeKnowledge.resources,...beforeKnowledge.relations].some(x=>!backup.state.profiles.some(p=>p.id===x.profileId)))throw Error('Старая копия содержит другие профили. Сначала экспортируйте связи Центра знаний.');
          if (backup.rules===null && beforeRules.some(r=>!backup.state.profiles.some(p=>p.id===r.profileId&&p.project===r.project)))throw Error('Старая копия несовместима с профилями базы правил. Сначала экспортируйте v15.');
          if (backup.punishments===null) validatePunishmentBackup(beforePunishments,backup.state.profiles);
          if (backup.sectionMonitor===null) validateSectionData(beforeSections,backup.state.profiles);
          if (backup.punishmentRegistry===null) validateRegistry(beforeRegistry,backup.state.profiles);
          if (backup.moderationOps===null) validateModerationOpsBackup(beforeModerationOps,backup.state.profiles);
          // Old backups keep existing links, so validate against the resulting dataset
          // before changing any store. New v20 replaces them after all referenced stores.
          if(backup.economyLinks===null){
            const futureVault=backup.evidenceVault??await inventoryAllVault(beforeState.profiles);
            validateEconomyLinks(beforeEconomyLinks,backup.state.profiles.map(p=>p.id),{
              marketplace:backup.marketplace??beforeMarket,families:backup.families??beforeFamilies,
              organizations:backup.organizations??beforeOrganizations,territories:backup.territories??beforeCrime.territories,
              documents:backup.schemaVersion>=7?backup.documents:beforeDocuments,evidenceVault:futureVault
            });
          }
          // Preflight all tactical references and image checksums before modifying any store.
          const nextTactical=backup.tactical??beforeTactical.snapshot;
          const expectedTactical=validateTacticalSnapshot(nextTactical,backup.state.profiles,{
            families:backup.families??beforeFamilies,organizations:backup.organizations??beforeOrganizations,territories:backup.territories??beforeCrime.territories,documents:backup.schemaVersion>=7?backup.documents:beforeDocuments,evidenceVault:backup.evidenceVault??await inventoryAllVault(beforeState.profiles)
          });
          const nextTacticalFiles=await resolveTacticalFiles(expectedTactical,portable?.maps??new Map(),beforeTactical.files);
          await createRestorePoint(api.storage.local);
          if(portable)newlyInstalledVault=await importVaultPackage(portable.inventory,portable.files);
          if(backup.economyLinks!==null)await replaceEconomyLinks([],beforeState.profiles.map(p=>p.id),{marketplace:beforeMarket,families:beforeFamilies,organizations:beforeOrganizations,territories:beforeCrime.territories,documents:beforeDocuments,evidenceVault:await inventoryAllVault(beforeState.profiles)});
          if (backup.schemaVersion >= 2) await replaceTemplates(backup.templates);
          if (backup.schemaVersion >= 3) await requestCaseReplacement(backup.cases);
          if (backup.schemaVersion >= 4) await replaceEconomy(backup.economy);
          if (backup.financeLedger !== null) await replaceFinance(backup.financeLedger,backup.state.profiles.map(p=>p.id),{families:backup.families??beforeFamilies,organizations:backup.organizations??beforeOrganizations});
          if (backup.families !== null) await replaceFamilies(backup.families,backup.state.profiles.map(p=>p.id));
          if (backup.organizations !== null) await replaceOrganizations(backup.organizations,backup.state.profiles.map(p=>p.id));
          if (backup.territories !== null) await replaceCrime(backup.territories,backup.crimeEvents,backup.state.profiles.map(p=>p.id));
          if (backup.marketplace !== null){
            if (backup.tradingInventory !== null) await replaceInventory([],beforeState.profiles.map(p=>p.id),beforeMarket);
            await replaceMarketplace(backup.marketplace,backup.state.profiles.map(p=>p.id));
          }
          if (backup.tradingInventory !== null) await replaceInventory(backup.tradingInventory,backup.state.profiles.map(p=>p.id),backup.marketplace??beforeMarket);
          if (backup.schemaVersion >= 5) await replaceLawRecords(backup.lawRecords,backup.state.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 6) await replaceGovernment(backup.government,backup.state.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 7) await replaceDocumentRecords(backup.documents,backup.state.profiles.map(p=>p.id),backup.government);
          if (backup.schemaVersion >= 8) await replaceLinks(backup.siteLinks);
          if (backup.schemaVersion >= 9) productivity = await replaceProductivity(backup.productivity);
          if (backup.schemaVersion >= 10) await replaceXenForoLinks(backup.xenforoNavigation);
          if (backup.schemaVersion >= 11) await replaceMonitor(backup.serverMonitor);
          if (backup.schemaVersion >= 12) await replaceKnowledge(backup.knowledgeWorkspace,backup.state.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 14) await replaceSources(backup.sourceLibrary);
          if (backup.rules!==null) await replaceRules(backup.rules,backup.state.profiles);
          state = await restoreState(backup.state);
          if (backup.punishments!==null) await replacePunishmentData(backup.punishments,backup.state.profiles);
          if (backup.sectionMonitor!==null) await replaceSectionData(backup.sectionMonitor,backup.state.profiles);
          if (backup.punishmentRegistry!==null) await replaceRegistryData(backup.punishmentRegistry,backup.state.profiles);
          if (backup.moderationOps!==null) await replaceModerationOps(backup.moderationOps,backup.state.profiles);
          if(backup.aiWorkspace!==null)await replaceAIWorkspaces(backup.aiWorkspace,backup.state.profiles,api.storage.local);
          if(backup.economyLinks!==null)await replaceEconomyLinks(backup.economyLinks,backup.state.profiles.map(p=>p.id),{marketplace:backup.marketplace,families:backup.families,organizations:backup.organizations,territories:backup.territories,documents:backup.documents,evidenceVault:backup.evidenceVault});
          await replaceTacticalBackup(expectedTactical,nextTacticalFiles,backup.state.profiles,{
            families:backup.families??beforeFamilies,organizations:backup.organizations??beforeOrganizations,territories:backup.territories??beforeCrime.territories,documents:backup.schemaVersion>=7?backup.documents:beforeDocuments,evidenceVault:backup.evidenceVault??await inventoryAllVault(beforeState.profiles)
          });
          await disableAIOnRestore(backup.state.profiles,api.storage.local);
          await completeRestorePoint(api.storage.local);
        } catch (error) {
          let vaultRollbackError=null;try{await rollbackVaultPackage(newlyInstalledVault);}catch(rollbackError){vaultRollbackError=rollbackError;}
          if (backup.schemaVersion >= 2) await replaceTemplates(beforeTemplates);
          if (backup.schemaVersion >= 3) await requestCaseReplacement(beforeCases);
          if (backup.schemaVersion >= 4) await replaceEconomy(beforeEconomy);
          if (backup.financeLedger !== null) await replaceFinance(beforeFinance,beforeState.profiles.map(p=>p.id),{families:beforeFamilies,organizations:beforeOrganizations});
          if (backup.families !== null) await replaceFamilies(beforeFamilies,beforeState.profiles.map(p=>p.id));
          if (backup.organizations !== null) await replaceOrganizations(beforeOrganizations,beforeState.profiles.map(p=>p.id));
          if (backup.territories !== null) await replaceCrime(beforeCrime.territories,beforeCrime.operations,beforeState.profiles.map(p=>p.id));
          if (backup.marketplace !== null){
            if (backup.tradingInventory !== null) await replaceInventory([],beforeState.profiles.map(p=>p.id),await listMarketplace());
            await replaceMarketplace(beforeMarket,beforeState.profiles.map(p=>p.id));
          }
          if (backup.tradingInventory !== null) await replaceInventory(beforeTrading,beforeState.profiles.map(p=>p.id),beforeMarket);
          if (backup.schemaVersion >= 5) await replaceLawRecords(beforeLaws,beforeState.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 6) await replaceGovernment(beforeGovernment,beforeState.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 7) await replaceDocumentRecords(beforeDocuments,beforeState.profiles.map(p=>p.id),beforeGovernment);
          if (backup.schemaVersion >= 8) await replaceLinks(beforeLinks);
          if (backup.schemaVersion >= 9) productivity = await replaceProductivity(beforeProductivity);
          if (backup.schemaVersion >= 10) await replaceXenForoLinks(beforeXfLinks);
          if (backup.schemaVersion >= 11) await replaceMonitor(beforeMonitor);
          if (backup.schemaVersion >= 12) await replaceKnowledge(beforeKnowledge,beforeState.profiles.map(p=>p.id));
          if (backup.schemaVersion >= 14) await replaceSources(beforeSources);
          if (backup.rules!==null) await replaceRules(beforeRules);
          await restoreState(beforeState);
          if (backup.punishments!==null) await replacePunishmentData(beforePunishments,beforeState.profiles);
          if (backup.sectionMonitor!==null) await replaceSectionData(beforeSections,beforeState.profiles);
          if (backup.punishmentRegistry!==null) await replaceRegistryData(beforeRegistry,beforeState.profiles);
          if (backup.moderationOps!==null) await replaceModerationOps(beforeModerationOps,beforeState.profiles);
          if(beforeAIWorkspaces!==null)await replaceAIWorkspaces(beforeAIWorkspaces,beforeState.profiles,api.storage.local);
          await api.storage.local.set({mtAiConnectionV191:beforeAISettings});
          if(backup.economyLinks!==null)await replaceEconomyLinks(beforeEconomyLinks,beforeState.profiles.map(p=>p.id),{marketplace:beforeMarket,families:beforeFamilies,organizations:beforeOrganizations,territories:beforeCrime.territories,documents:beforeDocuments,evidenceVault:await inventoryAllVault(beforeState.profiles)});
          let tacticalRollback=null;
          try{await replaceTacticalBackup(beforeTactical.snapshot,beforeTactical.files,beforeState.profiles,{
            families:beforeFamilies,organizations:beforeOrganizations,territories:beforeCrime.territories,documents:beforeDocuments,evidenceVault:await inventoryAllVault(beforeState.profiles)
          });}catch(failure){tacticalRollback=failure;}
          if(vaultRollbackError||tacticalRollback)throw new AggregateError([error,...[vaultRollbackError,tacticalRollback].filter(Boolean)],'Восстановление прервано; откат не завершён полностью');
          throw error;
        }
        await Promise.all([refreshForum(),refreshComplaints(),refreshEconomy(),refreshTrading(state.activeProfileId),refreshLaw(),refreshGovernment(),refreshDocuments(),refreshIntegrations()]);
        view = state.preferences.startPage;
        clearProductivityCache();render(); feedback('Резервная копия восстановлена');
      })();

}

document.addEventListener('change', event => {
  if(event.target.dataset.analyticsFilter){void handleAnalyticsFilter(event.target,state,render).catch(err=>feedback(err.message,true));return;}
  if(event.target.matches('#court-case-form [name=courtId]')){const court=governmentRecords().find(r=>r.type==='court'&&r.id===event.target.value&&r.profileId===state.activeProfileId);const assignmentSelect=event.target.form?.elements.namedItem('judgeAssignmentId');if(assignmentSelect){const options=[{id:'',title:'Не назначен'},...governmentRecords().filter(r=>r.type==='assignment'&&r.profileId===state.activeProfileId&&r.departmentId===court?.departmentId&&r.status==='active'&&!r.endedAt).map(r=>({id:r.id,title:r.officer}))];assignmentSelect.replaceChildren(...options.map(r=>{const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.title;return opt;}));}return;}
  if(event.target.id==='court-case-status-filter'){setCourtCaseFilter('status',event.target.value);const target=document.getElementById('court-case-list');if(target)replaceHtml(target,caseListHTML(state,governmentRecords()));return;}
  if(event.target.id==='court-case-court-filter'){setCourtCaseFilter('court',event.target.value);const target=document.getElementById('court-case-list');if(target)replaceHtml(target,caseListHTML(state,governmentRecords()));return;}
  if(event.target.id==='agency-filter'){setAgencyFilter(event.target.value);render();return;}
  if(event.target.id==='knowledge-graph-case-filter'){setGraphCaseFilter(event.target.value);render();return;}
  const el = event.target;
  if(handleComplaintQueueChange(el,state,render))return;
  if(['binder-category','binder-filter'].includes(el.id)){setBinderFilter(el.id,el.value);render();return;}
  if(el.dataset.caseWorkflowCheck!==undefined||el.dataset.caseDecision!==undefined){void handleComplaintWorkflowChange(el,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(['knowledge-library-kind','knowledge-library-status','knowledge-library-collection','knowledge-library-favorites'].includes(el.id)){
    setLibraryFilter(el.id.slice('knowledge-library-'.length),el.type==='checkbox'?el.checked:el.value);render();return;
  }
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
  if (el.id === 'law-effective-date') {setLawAsOfDate(el.value);render();return;}
  if (el.id === 'law-category') {setLawCategory(el.value);render();return;}
  if (el.id === 'law-compare-edition') {setLawCompareEdition(el.value);render();return;}
  if (el.id === 'law-import-file' && el.files?.[0]) {void importLawFile(el.files[0],state,render,feedback).catch(error=>feedback(error.message,true));return;}
  if (el.id === 'complaint-filter') {setComplaintFilter(el.value);return;}
  if(el.id==='econ-int-file'&&el.files?.[0]){void handleEconomyIntegrationFile(el.files[0],state,render,feedback).catch(err=>feedback(err.message,true)).finally(()=>{if(el.isConnected)el.value='';});return;}
  if(el.id==='market-archived'){setMarketplaceArchived(el.checked);render();return;}
  if(el.id==='tactical-filter'){void changeTacticalFilter(state,el.value).then(render).catch(err=>feedback(err.message,true));return;}
  if(el.id==='economy-filter'){void setEconomyFilter(el.value,state).then(render).catch(err=>feedback(err.message,true));return;}
  if(el.dataset.widgetToggle){void updateWidgets(v=>changeWidget(v,el.dataset.widgetToggle,'toggle')).catch(err=>feedback(err.message,true));return;}
  if (el.id === 'popup-profile'||el.id==='workspace-profile') {
    void modifyState(s => selectProfile(s, el.value)).then(next => { state = next; if(['moderation','evidence'].includes(view)){const url=new URL(location.href);url.searchParams.delete('moderationTab');url.searchParams.delete('evidenceTab');url.searchParams.delete('evidenceCase');history.replaceState(null,'',url.href);}void refreshBinderProfile(state.activeProfileId).then(refreshForum).then(render).catch(err=>feedback(err.message,true)); feedback('Профиль выбран'); }).catch(err => feedback(err.message, true));
  } else if (el.dataset.setting) {
    const value = el.type === 'checkbox' ? el.checked : el.value;
    void modifyState(s => savePreferences(s, { [el.dataset.setting]: value })).then(next => { state = next; render(); feedback('Настройки сохранены'); }).catch(err => feedback(err.message, true));
  } else if ((el.id === 'backup-file'||el.id==='backup-package-file') && el.files?.[0]) {
    const file = el.files[0],archive=el.id==='backup-package-file';
    if (file.size > (archive?300:48) * 1024 * 1024) {feedback('Файл превышает допустимый размер',true);el.value='';return;}
    void (async()=>{const portable=archive?await parsePortableBackup(file):null;await restoreBackupText(portable?.json??await file.text(),portable);})().catch(err=>feedback(err.message,true)).finally(()=>{if(el.isConnected)el.value='';});


  }
});
document.addEventListener('submit', event => {
  // A form input named `id` shadows HTMLFormElement.id in Chromium/Firefox.
  // Read the DOM attribute to prevent native form navigation and data loss.
  if(event.target.matches('form[data-forum-settings]')){
    event.preventDefault();const form=event.target,scope=form.dataset.forumSettings,fields=form.elements;
    const patch=scope!=='global'&&fields.namedItem('inherit').checked?null:{enabled:fields.namedItem('enabled').checked,binderEnabled:fields.namedItem('binderEnabled').checked,navigationEnabled:fields.namedItem('navigationEnabled').checked,navigationHistory:fields.namedItem('navigationHistory').checked,punishmentEnabled:fields.namedItem('punishmentEnabled').checked,panelPosition:fields.namedItem('panelPosition').value,appearance:fields.namedItem('appearance').value,density:fields.namedItem('density').value};
    void modifyState(current=>savePreferences(current,{forum:updateForumSettings(current.preferences.forum,scope,patch)})).then(next=>{state=next;render();feedback('Настройки форума сохранены');}).catch(err=>feedback(err.message,true));return;
  }
  const formId = event.target.getAttribute('id');
  if(['court-judgment-draft-form','court-appeal-file-form','court-appeal-resolution-form'].includes(formId)){event.preventDefault();void handleJudgmentSubmit(event.target,state,refreshGovernment,render,feedback,openCourtCase).catch(err=>feedback(err.message,true));return;}
  if(formId==='court-proceeding-form'){event.preventDefault();void handleProceedingSubmit(event.target,state,refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(['court-evidence-link-form','court-evidence-file-form','court-evidence-existing-form','court-evidence-edit-form'].includes(formId)){event.preventDefault();void handleCourtEvidenceSubmit(event.target,state,refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(['court-case-form','court-case-participant-form','court-case-participant-edit-form','court-case-document-form','court-case-status-form','court-case-note-form','procedural-generate-form'].includes(formId)){event.preventDefault();void handleCourtCaseSubmit(event.target,state,governmentRecords(),refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='judicial-form'||formId==='court-route-form'){event.preventDefault();void handleCourtSubmit(event.target,state,refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(['knowledge-source-meta-form','knowledge-collection-form','knowledge-collection-member-form'].includes(formId)){
    event.preventDefault();void handleLibrarySubmit(event.target,state,knowledgeSourceRows(),knowledgeSnapshot(),()=>refreshKnowledge(state.profiles.map(p=>p.id)),render,feedback,knowledgeNodes(state.activeProfileId)).then(()=>clearProductivityCache()).catch(err=>feedback(err.message,true));return;
  }
  if(['knowledge-quote-form','knowledge-graph-link-form'].includes(formId)){event.preventDefault();void handleGraphSubmit(event.target,state,knowledgeSnapshot(),knowledgeSourceRows(),()=>refreshKnowledge(state.profiles.map(p=>p.id)),render,feedback).catch(err=>feedback(err.message,true));return;}
  if(['knowledge-google-form','knowledge-relation-form','knowledge-bookmark-form'].includes(formId)){event.preventDefault();void handleKnowledgeSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='timer-create-form'){event.preventDefault();void submitTimer(event,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='productivity-assistant-form'){
    event.preventDefault();void answerProductivity(event.target.elements.namedItem('question').value,state).catch(err=>feedback(err.message,true));return;
  }
  if(['google-config-form','site-link-form','google-import-doc-form','google-read-sheet-form'].includes(formId)){event.preventDefault();void handleIntegrationSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='document-approval-form'){event.preventDefault();void handleDocumentApprovalSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='document-form'){event.preventDefault();void handleDocumentSubmit(event,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if (formId === 'agency-form') {event.preventDefault();void handleAgencySubmit(event,state,refreshGovernment,render,feedback).catch(err=>feedback(err.message,true));return;}
  if (formId === 'government-form') {event.preventDefault();void handleGovernmentSubmit(event,state,render,feedback,lawRecords()).catch(err=>feedback(err.message,true));return;}
  if (formId === 'law-form') {event.preventDefault();void handleLawSubmit(event,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='econ-int-link-form'){event.preventDefault();void handleEconomyIntegrationSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='finance-form'){event.preventDefault();void handleFinanceSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='crime-form'){event.preventDefault();void handleCrimeSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='organization-form'){event.preventDefault();void handleOrganizationSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='family-form'){event.preventDefault();void handleFamilySubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='trading-form'){event.preventDefault();void handleTradingSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if(formId==='marketplace-form'){event.preventDefault();void handleMarketplaceSubmit(event.target,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if (formId === 'economy-form' || event.target.matches('form[data-economy-calc]')) {event.preventDefault();void handleEconomySubmit(event,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if (['complaint-form','complaint-evidence-form','case-timeline-form','case-batch-form','moderation-policy-form','moderation-rule-form'].includes(formId)) {event.preventDefault();void handleComplaintSubmit(event,state,render,feedback).catch(err=>feedback(err.message,true));return;}
  if (['forum-template-form', 'xf-navigation-form'].includes(formId)) {
    event.preventDefault();
    void handleForumSubmit(event, state, render, feedback).catch(err => feedback(err.message, true));
    return;
  }
  if (formId !== 'profile-form') return;
  event.preventDefault();
  const f = event.target.elements;
  const id = f.namedItem('profileId').value;
  const data = { name: f.namedItem('name').value, project: f.namedItem('project').value, server: f.namedItem('server').value, forumUrl: f.namedItem('forumUrl').value };
  void (async()=>{if(id&&((await exportRegistryData(state.profiles)).records.some(r=>r.profileId===id&&r.project!==data.project)||(await listRules()).some(r=>r.profileId===id&&r.project!==data.project)||state.profiles.some(p=>p.id===id&&p.rulesImport&&p.project!==data.project)))throw Error('Нельзя изменить проект профиля с сохранёнными правилами. Создайте новый профиль.');return modifyState(s => id ? editProfile(s, id, data) : addProfile(s, data));})().then(async next => { const previous=state.profiles.find(p=>p.id===id); if(previous&&(previous.project!==data.project||previous.server!==data.server))await api.storage.local.remove(moderationOpsKey(id));state = next; dialog.close(); render(); feedback(id ? 'Профиль обновлён' : 'Профиль создан'); }).catch(err => feedback(err.message, true));
}, true);
document.addEventListener('keydown', event => {
  if(popup || event.isComposing || event.repeat)return;
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&event.code==='KeyK'){
    event.preventDefault();if(view!=='search'){navigateTo('search');void refreshProductivitySearch().then(()=>{render();searchFocus();}).catch(err=>feedback(err.message,true));}
    else searchFocus();return;
  }
  const editable=event.target.closest?.('input,textarea,select,[contenteditable=true]');
  if(editable)return;
  if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&/^Digit[1-8]$/.test(event.code)&&productivity.shortcutsEnabled){
    const target=productivity.shortcuts[Number(event.code.slice(-1))-1];if(!target)return;
    event.preventDefault();navigateTo(target);
    if(target==='search')void refreshProductivitySearch().then(()=>{render();searchFocus();}).catch(err=>feedback(err.message,true));
    else render();
  }
});
api.storage.onChanged.addListener((changes, area) => {
  if(area==='local'&&changes[SECTION_KEY])document.getElementById('section-monitor-root')?.dispatchEvent(new Event('section-refresh'));
  if(area==='local'&&view==='moderation'&&Object.keys(changes).some(k=>k===SECTION_KEY||k===REGISTRY_KEY||k.startsWith('rpnComplaintV3:')||k.startsWith('mtModerationOpsV175:')))document.getElementById('moderation-center')?.dispatchEvent(new Event('moderation-refresh'));
  if(area==='local'&&Object.keys(changes).some(k=>k===RULES_KEY||/^(mtPunishmentCalculatorV1:|mtPunishmentDraftV1:|rpnComplaintV3:|rpnForumTemplateV2:)/.test(k)))document.getElementById('rules-experience')?.dispatchEvent(new Event('rules-experience-refresh'));
  if(area==='local'&&changes[RULES_KEY]){document.getElementById('rules-root')?.dispatchEvent(new Event('rules-storage-change'));clearProductivityCache();if(view==='search')void refreshProductivitySearch().then(()=>renderSearchResults(state)).catch(err=>feedback(err.message,true));}
  if(area==='local'&&view==='home'&&state&&!popup&&Object.keys(changes).some(k=>[STORAGE_KEY,TIMERS_KEY,MONITOR_KEY,RULES_KEY].includes(k)||/^(rpnForumTemplateV2:|mtBinderUsage:|majesticToolkitXfNavV11:|rpnComplaintV3:|majesticDocumentV7:|mtPunishmentCalculatorV1:|mtPunishmentDraftV1:)/.test(k)))scheduleDashboard();
  if(area==='local' && changes[PRODUCTIVITY_KEY]?.newValue){
    try{productivity=validateProductivity(changes[PRODUCTIVITY_KEY].newValue);if(view==='settings')render();else document.documentElement.dataset.accent=productivity.accent;}
    catch(err){feedback(err.message,true);}
  }
  if(area==='local'&&Object.keys(changes).some(k=>/^(majesticToolkitXfNavV11:|rpnForumTemplateV2:|rpnComplaintV3:|rpnEconomyV4:|majesticLawV5:|majesticGovernmentV6:|majesticDocumentV7:)/.test(k)||k===LINK_KEY)){
    clearProductivityCache();
    if(view==='search')void refreshProductivitySearch().then(()=>renderSearchResults(state)).catch(err=>feedback(err.message,true));
  }
  if(area==='local'&&changes[SOURCE_KEY]){clearProductivityCache();if(view==='search')void refreshProductivitySearch().then(()=>renderSearchResults(state));if(['knowledge','evidence'].includes(view))void refreshKnowledge(state.profiles.map(p=>p.id)).then(render);}
  if(area==='local'&&changes[REGISTRY_KEY])document.getElementById('punishment-registry')?.dispatchEvent(new Event('registry-refresh'));
  if(area==='local'&&changes[TIMERS_KEY]){void refreshTimers().then(()=>{if(view==='timers')render();}).catch(err=>feedback(err.message,true));}
  if(area==='local'&&changes[MONITOR_KEY]){void refreshMonitor().then(()=>{if(view==='monitor')render();}).catch(err=>feedback(err.message,true));}
  if(area==='local'&&changes[KNOWLEDGE_KEY]){void refreshKnowledge(state?.profiles?.map(p=>p.id)).then(()=>{if(['knowledge','evidence'].includes(view))render();}).catch(err=>feedback(err.message,true));}
  if(area==='local'&&changes[LINK_KEY]){void refreshIntegrations().then(()=>{if(view==='integrations')render();if(['knowledge','evidence'].includes(view))void refreshKnowledge(state.profiles.map(p=>p.id)).then(render);}).catch(err=>feedback(err.message,true));}
  if(area==='local'&&Object.keys(changes).some(k=>k.startsWith('majesticDocumentV7:'))){void refreshDocuments().then(()=>{if(['documents','justice'].includes(view)&&!document.getElementById('studio-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if(area==='local' && Object.keys(changes).some(k=>k.startsWith('majesticGovernmentV6:'))) {void refreshGovernment().then(()=>{if(['government','justice'].includes(view)&&!document.getElementById('government-dialog')?.open&&!document.getElementById('government-document-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if (area==='local' && Object.keys(changes).some(k=>k.startsWith('majesticLawV5:'))) {void refreshLaw().then(()=>{if(['law','justice'].includes(view)&&!document.getElementById('law-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if(area==='local'&&Object.keys(changes).some(k=>k.startsWith('majesticToolkitXfNavV11:')||k.startsWith('mtNavigationHistory:'))){void refreshForum().then(()=>{if(view==='forum'&&!document.activeElement?.closest?.('#xf-navigation-form')&&!document.getElementById('forum-template-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if (area==='local'&&Object.keys(changes).some(k=>k.startsWith('mtFinancialV217:'))){void refreshFinance(state.activeProfileId).then(()=>{if(view==='economy'&&!document.getElementById('finance-dialog')?.open)render();}).catch(err=>feedback(err.message,true));}
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('mtInventoryV213:'))) {
    void refreshTrading(state.activeProfileId).then(()=>{if(view==='economy'&&!document.getElementById('trading-dialog')?.open)render();}).catch(err=>feedback(err.message,true));
  }
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('rpnEconomyV4:'))) {
    void refreshEconomy().then(() => { if (view === 'economy' && !document.getElementById('economy-dialog')?.open) render(); }).catch(err=>feedback(err.message,true));
  }
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('rpnComplaintV3:'))) {
    void refreshComplaints().then(() => {if(['complaints','moderation','evidence'].includes(view) && !document.activeElement?.matches?.('[data-case-draft]')&&!document.activeElement?.closest?.('#section-subscription-form')) render();}).catch(err=>feedback(err.message,true));
  }
  if (area === 'local' && Object.keys(changes).some(k => (k.startsWith('rpnForumTemplateV2:')||k.startsWith('majesticToolkitXfNavV11:')||k.startsWith('mtBinderUsage:')))) {
    void refreshForum().then(() => { if (view === 'forum'&&!document.getElementById('forum-template-dialog')?.open) render(); }).catch(err => feedback(err.message, true));
  }
  if (area !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
  // Switching Evidence & Knowledge tabs must not remount every live editor.
  // Other core mutations, especially profile switches, still refresh the shell.
  const previous=changes[STORAGE_KEY].oldValue,updated=changes[STORAGE_KEY].newValue;
  if(view==='evidence'&&previous?.activeProfileId===updated?.activeProfileId&&
     previous.profiles?.length===updated.profiles?.length&&
     JSON.stringify(previous.preferences)===JSON.stringify(updated.preferences)&&
     previous.profiles.every((p,i)=>JSON.stringify({...p,evidenceKnowledge:null})===JSON.stringify({...updated.profiles[i],evidenceKnowledge:null}))){
    try{state=validateState(updated);return;}catch(error){feedback(error.message,true);}
  }
  void loadState().then(async next => { state = next; await refreshBinderProfile(state.activeProfileId);if(view==='economy')await refreshTrading(state.activeProfileId);render(); }).catch(err => feedback(err.message, true));
});
if(!popup)setInterval(()=>{if(view==='timers'||view==='home')tickTimers();},1000);
if(!popup)setInterval(()=>{if(view==='monitor')void tickMonitor().then(changed=>{if(changed)render();}).catch(err=>feedback(err.message,true));},60000);
api.permissions.onAdded.addListener(() => { void refreshPermission().then(render); });
api.permissions.onRemoved.addListener(() => { void refreshPermission().then(render); });
try {
  state = await loadState(); // Invalid core profile data still invokes recovery UI.
  let productivityError;
  try { productivity = await loadProductivity(); }
  catch (error) { productivity = defaultProductivity(); productivityError = {name:'Настройки интерфейса',reason:error.message}; }
  await refreshBinderProfile(state.activeProfileId);
  await refreshAllModules();
  try{await loadJusticeWorkspace(state);}catch(error){moduleErrors.push({name:'Настройки Government & Justice',reason:error.message});}
  try{await loadEconomyWorkspace(state);}catch(error){moduleErrors.push({name:'Настройки Economy & Crime',reason:error.message});}
  try{await loadTacticalWorkspace(state);}catch(error){moduleErrors.push({name:'Tactical Workspace',reason:error.message});}
  if (productivityError) moduleErrors.push(productivityError);
  await refreshPermission();
  forumPane=readForumPane();
  view = NAV.some(([id])=>location.hash==='#'+id) ? location.hash.slice(1) : state.preferences.startPage;
  window.addEventListener('hashchange',()=>{if(!popup&&NAV.some(([id])=>location.hash==='#'+id)){forumPane=readForumPane();navigateTo(location.hash.slice(1));void (async()=>{if(['complaints','moderation','evidence'].includes(view))await refreshComplaints();if(view==='evidence')await refreshKnowledge(state.profiles.map(p=>p.id));if(view==='timers')await refreshTimers();if(view==='tactical')await refreshTacticalWorkspace();render();})().catch(err=>feedback(err.message,true));}});
  if (view === 'search') {
    try { await refreshProductivitySearch(); }
    catch (error) { moduleErrors.push({name:'Локальный поиск',reason:error.message}); }
  }
  render();
  
}
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

document.addEventListener('input',event=>{if(event.target.id==='xf-nav-filter'){const q=event.target.value.trim().toLocaleLowerCase('ru');for(const row of document.querySelectorAll('[data-nav-row]'))row.hidden=!row.dataset.navRow.includes(q);}});

// Drag sorting is an optional pointer shortcut; up/down controls remain keyboard accessible.
let draggingNavId=null;
document.addEventListener('dragstart',event=>{const handle=event.target.closest?.('[data-nav-drag]');if(!handle||!event.dataTransfer)return;draggingNavId=handle.dataset.navDrag;event.dataTransfer.setData('text/plain',draggingNavId);event.dataTransfer.effectAllowed='move';});
document.addEventListener('dragover',event=>{const row=event.target.closest?.('[data-nav-id]');if(draggingNavId&&row&&event.dataTransfer){event.preventDefault();event.dataTransfer.dropEffect='move';}});
document.addEventListener('drop',event=>{const row=event.target.closest?.('[data-nav-id]'),id=draggingNavId;draggingNavId=null;if(!id||!row||!state||event.dataTransfer?.getData('text/plain')!==id)return;event.preventDefault();void handleForumAction({dataset:{forumAction:'move-nav-drop',id,target:row.dataset.navId}},state,render,feedback).catch(e=>feedback(e.message,true));});
document.addEventListener('dragend',()=>{draggingNavId=null;});
