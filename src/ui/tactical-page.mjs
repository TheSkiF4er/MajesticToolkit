/** Tactical Workspace 2.2.3: live cross-navigation to existing Crime, Families and Organizations editors. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {api} from '../lib/browser.mjs';
import {listCrime} from '../lib/crime-store.mjs';
import {listFamilies} from '../lib/family-store.mjs';
import {listOrganizations} from '../lib/organization-store.mjs';
import {listAirdrops} from '../lib/tactical-airdrop-store.mjs';
import {TACTICAL_UI_KEY,TACTICAL_TABS,TACTICAL_TAB_LABELS,TACTICAL_FILTERS,cleanTacticalUI,changeTacticalPreference,changeTacticalRecord,tacticalSnapshot} from '../lib/tactical-workspace-core.mjs';
let ui=cleanTacticalUI(),rows={territories:[],operations:[],families:[],organizations:[],airdropPoints:[],airdropEvents:[]};
let serial=Promise.resolve();
const profiles=state=>state.profiles.map(x=>x.id);
async function store(change){const job=serial.then(async()=>{const next=change(ui);await api.storage.local.set({[TACTICAL_UI_KEY]:next});ui=next;return next;});serial=job.catch(()=>{});return job;}
export async function loadTacticalWorkspace(state){ui=cleanTacticalUI((await api.storage.local.get(TACTICAL_UI_KEY))[TACTICAL_UI_KEY],profiles(state));await refreshTacticalWorkspace();}
export async function refreshTacticalWorkspace(){const [crime,families,organizations,airdrops]=await Promise.all([listCrime(),listFamilies(),listOrganizations(),listAirdrops()]);rows={territories:crime.territories,operations:crime.operations,families,organizations,airdropPoints:airdrops.points,airdropEvents:airdrops.events};return rows;}
export async function forgetTacticalProfiles(state){await store(previous=>cleanTacticalUI(previous,profiles(state)));}
export function tacticalSnapshotFor(state){return tacticalSnapshot(rows,state.activeProfileId,ui);}
const b=(action,label,attrs='',variant='secondary')=>`<button type="button" class="button ${variant}" data-tactical-action="${action}" ${attrs}>${e(label)}</button>`;
const kindName={territory:'Территория',event:'Событие',family:'Семья',organization:'Организация'};
function recordRow(row,snapshot,profileId){
 const favorite=snapshot.favorites.some(x=>x.kind===row.kind&&x.id===row.id),args=`data-kind="${e(row.kind)}" data-id="${e(row.id)}"`;
 const detail=row.kind==='event'?`${row.detail} · ${row.source.status==='planned'?'Запланировано':row.source.status==='completed'?'Завершено':'Отменено'}`:row.detail;
 return `<article class="economy-hit tactical-record" data-tactical-kind="${e(row.kind)}" data-tactical-id="${e(row.id)}"><div><small class="subtle">${e(kindName[row.kind])}</small><strong>${e(row.name)}</strong><p class="subtle">${e(detail)}</p></div><div class="row">${b('favorite',favorite?'★ Избранное':'☆ В избранное',args)}${b('open','Открыть',args,'primary')}</div></article>`;
}
function recordsList(list,snapshot,profileId,empty){return list.length?`<div class="economy-list">${list.slice(0,100).map(row=>recordRow(row,snapshot,profileId)).join('')}</div>${list.length>100?`<p class="subtle">Показаны первые 100 из ${list.length}. Уточните поиск.</p>`:''}`:`<p class="subtle">${e(empty)}</p>`;}
export function tacticalSection(state){
 const pid=state.activeProfileId,p=state.profiles.find(x=>x.id===pid),snap=tacticalSnapshotFor(state),tab=ui.tabs[pid]||'overview',q=ui.queries[pid]||'',filter=ui.filters[pid]||'all';
 const isSearching=!!q.trim(),stats=snap.stats;
 const favRows=snap.favorites.map(x=>snap.records.find(r=>r.kind===x.kind&&r.id===x.id)).filter(Boolean);
 const recentRows=snap.recent.map(x=>snap.records.find(r=>r.kind===x.kind&&r.id===x.id)).filter(Boolean);
 const items=tab==='territories'?snap.matched.filter(x=>x.kind==='territory'):tab==='events'?snap.matched.filter(x=>x.kind==='event'):tab==='groups'?snap.matched.filter(x=>x.kind==='family'||x.kind==='organization'):tab==='recent'?recentRows.filter(x=>snap.matched.includes(x)):snap.matched;
 const cards=[['Территории',stats.territories,'territories','all'],['Запланированные события',stats.planned,'events','planned'],['Просроченные события',stats.overdue,'events','overdue'],['Завершённые события',stats.completed,'events','completed'],['Семьи',stats.families,'groups','all'],['Организации',stats.organizations,'groups','all'],['Аирдропы',rows.airdropEvents.filter(x=>x.profileId===pid&&['planned','active','claimed'].includes(x.status)).length,'airdrops','all']];
 const summary=`<div class="economy-stats tactical-stats">${cards.map(([label,count,target,filterTarget])=>`<button type="button" data-tactical-action="tab" data-tab="${target}" data-filter="${filterTarget}" aria-label="${e(label)}: ${count}"><small>${e(label)}</small><strong>${count}</strong></button>`).join('')}</div>`;
 const actions=`<div class="row">${b('create','+ Территория','data-kind="territory"','primary')}${b('create','+ Капт / RP-событие','data-kind="event"','primary')}${b('go','Семьи','data-kind="family"')}${b('go','Организации','data-kind="organization"')}${b('reload','Обновить')}</div>`;
 const tabs=TACTICAL_TABS.map(id=>b('tab',TACTICAL_TAB_LABELS[id],`data-tab="${id}" role="tab" aria-selected="${id===tab}"`,id===tab?'primary':'secondary')).join('');
 const controls=`<div class="row tactical-filters"><label class="field tactical-query">Поиск по территориям, каптам, участникам и группам<input type="search" id="tactical-search" maxlength="140" autocomplete="off" placeholder="Название, игрок, район, владелец…" value="${e(q)}"></label><label class="field">Статус RP-события<select id="tactical-filter">${TACTICAL_FILTERS.map(f=>`<option value="${f}" ${f===filter?'selected':''}>${{all:'Все',planned:'Запланировано',overdue:'Просрочено',completed:'Завершено',cancelled:'Отменено'}[f]}</option>`).join('')}</select></label></div>`;
 const upcoming=snap.planned.slice(0,8).map(op=>snap.records.find(r=>r.kind==='event'&&r.id===op.id)).filter(Boolean);
 const selectedArea=tab==='overview'&&!isSearching?`<div class="tactical-columns"><section class="card stack"><div class="row spread"><h3>Ближайшие RP-события</h3>${b('tab','Все события','data-tab="events"')}</div>${recordsList(upcoming,snap,pid,'Запланированных событий пока нет.')}</section><section class="card stack"><div class="row spread"><h3>Избранные объекты</h3>${b('tab','Недавние','data-tab="recent"')}</div>${recordsList(favRows.slice(0,8),snap,pid,'Добавьте территорию, событие, семью или организацию в избранное.')}</section></div>`:'';
 const listSection=tab==='map'?'<div id="tactical-map-root"></div>':tab==='airdrops'?'<div id="tactical-airdrop-root"></div>':tab==='planning'?'<div id="tactical-planning-root"></div>':tab==='simulations'?'<div id="tactical-simulation-root"></div>':tab==='analytics'?'<div id="tactical-analytics-root"></div>':tab==='links'?'<div id="tactical-links-root"></div>':tab==='overview'&&!isSearching?`<section class="card stack"><div class="row spread"><h3>Недавно открытые</h3>${b('tab','Все записи','data-tab="recent"')}</div>${recordsList(recentRows.slice(0,8),snap,pid,'Откройте объект, чтобы сохранить его в истории.')}</section>`:`<section class="card stack"><div class="row spread"><h3>${e(isSearching?'Результаты поиска':TACTICAL_TAB_LABELS[tab])}</h3><span class="tag">${items.length} записей</span></div>${recordsList(items,snap,pid,'Записей по выбранным условиям не найдено.')}</section>`;
 return `<div id="tactical-workspace" class="stack tactical-workspace"><section class="card stack"><div class="row spread"><div><h3>Tactical Workspace · 2.2.9</h3><p class="subtle">${e(p?.name||'Профиль')} · ${e(p?.server||'')} · Реестр территорий, каптов и групп. Данные обновляются из Economy & Crime.</p></div><span class="tag">Локальный режим</span></div>${actions}${summary}<p class="subtle">Карта, аирдропы, планы, симуляции и replay доступны в отдельных вкладках. Локальный режим без игровой телеметрии.</p></section><section class="card stack"><nav class="economy-tabs" aria-label="Тактические разделы" role="tablist">${tabs}</nav>${['map','airdrops','planning','simulations','analytics','links'].includes(tab)?'':controls}</section>${selectedArea}${listSection}</div>`;
}
export async function changeTacticalTab(state,tab){await store(previous=>changeTacticalPreference(previous,state.activeProfileId,'tab',tab,profiles(state)));}
export async function changeTacticalSearch(state,query){await store(previous=>changeTacticalPreference(previous,state.activeProfileId,'query',query,profiles(state)));}
export async function changeTacticalFilter(state,filter){await store(previous=>changeTacticalPreference(previous,state.activeProfileId,'filter',filter,profiles(state)));}
export async function handleTacticalAction(button,state,render,feedback,openExisting){
 const action=button.dataset.tacticalAction,pid=state.activeProfileId,kind=button.dataset.kind,id=button.dataset.id;
 if(action==='tab'){await changeTacticalTab(state,button.dataset.tab);if(button.dataset.filter)await changeTacticalFilter(state,button.dataset.filter);render();return;}
 if(action==='reload'){await refreshTacticalWorkspace();render();feedback('Тактические данные обновлены');return;}
 if(['favorite','open'].includes(action)){
   const snapshot=tacticalSnapshotFor(state),record=snapshot.records.find(x=>x.kind===kind&&x.id===id);
   if(!record)throw Error('Тактическая запись отсутствует в активном профиле');
   await store(previous=>changeTacticalRecord(previous,pid,kind,id,action,profiles(state)));
   if(action==='favorite'){render();feedback('Избранное обновлено');return;}
   await openExisting(kind,id,'open');return;
 }
 if(action==='create'||action==='go'){
   if(!['territory','event','family','organization'].includes(kind))throw Error('Неизвестный тактический объект');
   await openExisting(kind,'',action);return;
 }
 throw Error('Неизвестное тактическое действие');
}
