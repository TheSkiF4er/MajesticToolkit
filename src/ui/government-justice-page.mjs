import {escapeHtml as e} from '../lib/sites.mjs';
import {api} from '../lib/browser.mjs';
import {justiceSnapshot,justiceSearch,cleanJusticeUI,selectJusticeTab,rememberJusticeRecord,JUSTICE_UI_KEY,JUSTICE_TABS} from '../lib/government-justice-core.mjs';
import {governmentRecords,governmentSection} from './government-page.mjs';
import {lawRecords,lawSection} from './law-page.mjs';
import {documentRecords,documentSection} from './document-page.mjs';
import {courtRegistrySection} from './judicial-page.mjs';
const LABELS={overview:'Обзор',courts:'Суды',agencies:'Ведомства',law:'Законодательство',decisions:'Решения',documents:'Документы'};
let ui={tabs:{},recent:[]},query='',cache=null;
function snapshot(state){
  const gov=governmentRecords(),laws=lawRecords(),docs=documentRecords(),profileId=state.activeProfileId;
  if(cache&&cache.profileId===profileId&&cache.gov===gov&&cache.laws===laws&&cache.docs===docs)return cache.value;
  const value=justiceSnapshot(profileId,gov,laws,docs);cache={profileId,gov,laws,docs,value};return value;
}
const profileIds=state=>state.profiles.map(p=>p.id);
export async function loadJusticeWorkspace(state){ui=cleanJusticeUI((await api.storage.local.get(JUSTICE_UI_KEY))[JUSTICE_UI_KEY],profileIds(state));}
export function currentJusticeTab(profileId){return JUSTICE_TABS.includes(ui.tabs[profileId])?ui.tabs[profileId]:'overview';}
export async function changeJusticeTab(state,tab){ui=selectJusticeTab(ui,state.activeProfileId,tab,profileIds(state));await api.storage.local.set({[JUSTICE_UI_KEY]:ui});}
export async function rememberJusticeOpen(state,kind,id){ui=rememberJusticeRecord(ui,state.activeProfileId,kind,id,profileIds(state));await api.storage.local.set({[JUSTICE_UI_KEY]:ui});}
export function setJusticeQuery(value){query=String(value).slice(0,160);}
export function justiceRecord(state,kind,id){return snapshot(state).rows.find(x=>x.kind===kind&&x.id===id)||null;}
const action=(label,operation,kind,id,style='secondary')=>`<button type="button" class="button ${style}" data-justice-action="${operation}" ${kind?`data-kind="${e(kind)}"`:''} ${id?`data-id="${e(id)}"`:''}>${e(label)}</button>`;
function rowsHTML(rows,empty='Записей нет.',withKind=true){return rows.length?rows.map(row=>`<div class="justice-result"><div><strong>${e(row.title)}</strong><p class="subtle">${e(row.description)}${withKind?` · ${e(LABELS[row.tab])}`:''}</p></div>${action('Открыть','open',row.kind,row.id)}</div>`).join(''):`<p class="empty">${e(empty)}</p>`;}
export function justiceSearchHTML(state){const snap=snapshot(state);const hits=justiceSearch(snap,query);return `<p class="subtle" role="status">${query?`Совпадений: ${hits.length}${hits.length===80?' (показаны первые 80)':''}`:'Последние обновлённые записи'} · Только активный профиль</p>${rowsHTML(hits,query?'Совпадений не найдено.':'Пока нет записей.')} `;}
function overview(state,snap){
  const recent=ui.recent.filter(r=>r.profileId===state.activeProfileId).map(r=>snap.rows.find(x=>x.kind===r.kind&&x.id===r.id)).filter(Boolean).slice(0,8);
  return `<section class="justice-stats" aria-label="Сводка Government & Justice">
   ${[['Суды',snap.courts.length,'courts'],['Ведомства',snap.departments.length,'agencies'],['Нормативные акты',snap.books.length,'law'],['Решения',snap.decisions.length,'decisions'],['Документы',snap.documents.length,'documents'],['Шаблоны',snap.documentTemplates.length+snap.governmentTemplates.length,'documents']].map(([label,count,tab])=>`<button type="button" class="justice-stat" data-justice-action="tab" data-tab="${tab}"><span class="subtle">${label}</span><strong>${count}</strong></button>`).join('')}
   </section><section class="card stack"><h3>Быстрые действия</h3><div class="row justice-actions">
    <button type="button" class="button primary" data-government-action="new-department">+ Ведомство / суд</button>
    <button type="button" class="button secondary" data-government-action="new-decision" ${snap.departments.length?'':'disabled title="Сначала создайте ведомство"'}>+ Решение</button>
    <button type="button" class="button secondary" data-law-action="new-book">+ Закон</button>
    <button type="button" class="button secondary" data-document-action="new-document">+ Документ</button>
    <button type="button" class="button secondary" data-government-action="new-template">+ Процессуальный шаблон</button>
    </div><p class="subtle">Создание открывает действующие редакторы, все записи сохраняются в исходных модулях.</p></section>
   <section class="card stack"><div class="row spread"><h3>Поиск по государственным и судебным материалам</h3>${action('Обновить данные','refresh')}</div>
    <label class="field">Поиск по названию, номеру, участнику, статье, тексту документа<input id="justice-search" type="search" autocomplete="off" maxlength="160" value="${e(query)}" placeholder="Название суда, номер решения, статья закона…"></label>
    <div id="justice-results" class="stack justice-results">${justiceSearchHTML(state)}</div></section>
   <section class="card stack"><h3>Недавно открытые записи</h3>${rowsHTML(recent,'Откройте запись из поиска или реестра, чтобы она появилась здесь.',false)}</section>`;
}
function courts(state,snap){return courtRegistrySection(state,governmentRecords());}
function documentTemplates(snap){return `<section class="card stack"><div class="row spread"><h3>Процессуальные шаблоны Government Tools (${snap.governmentTemplates.length})</h3><button class="button secondary" data-government-action="new-template">+ Процессуальный шаблон</button></div>${snap.governmentTemplates.length?snap.governmentTemplates.map(t=>`<article class="justice-result"><div><strong>${e(t.title)}</strong><p class="subtle">${e(t.category)} · ${e(snap.departments.find(d=>d.id===t.departmentId)?.name||'Все ведомства')}</p></div><button type="button" class="button secondary" data-government-action="edit-template" data-id="${e(t.id)}">Редактировать</button></article>`).join(''):'<p class="empty">Процессуальных шаблонов пока нет.</p>'}</section>`;}
export function governmentJusticeSection(state){const snap=snapshot(state),tab=currentJusticeTab(state.activeProfileId);
 return `<div class="stack justice-workspace"><section class="card stack justice-header"><div class="row spread"><div><h3>Government & Justice · 2.0.4</h3><p class="subtle">${e(state.profiles.find(p=>p.id===state.activeProfileId)?.name||'Профиль')} · Единое рабочее пространство Law Codex, Government Tools и Document Studio.</p></div><span class="tag">Локально · ${e(state.profiles.find(p=>p.id===state.activeProfileId)?.server||'')}</span></div>
 <nav class="justice-tabs" role="tablist" aria-label="Разделы Government & Justice">${JUSTICE_TABS.map(id=>`<button type="button" role="tab" aria-selected="${id===tab}" class="button ${id===tab?'primary':'secondary'}" data-justice-action="tab" data-tab="${id}">${e(LABELS[id])}</button>`).join('')}</nav></section>
 <div role="tabpanel" aria-label="${e(LABELS[tab])}" class="stack" id="justice-panel">
 ${tab==='overview'?overview(state,snap):tab==='courts'?courts(state,snap):tab==='agencies'?governmentSection(state,'departments'):tab==='law'?lawSection(state):tab==='decisions'?`<section class="card"><p class="subtle">Это существующие ведомственные решения Government Tools, а не отдельный судебный реестр дел (запланирован на 2.0.5).</p></section>${governmentSection(state,'decisions')}`:documentTemplates(snap)+documentSection(state)}
 </div></div>`;
}
