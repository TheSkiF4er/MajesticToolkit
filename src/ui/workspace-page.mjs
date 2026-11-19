import {escapeHtml as e} from '../lib/sites.mjs';
import {workspacePreferences} from '../lib/workspace-preferences.mjs';
import {listRules} from '../lib/rules-store.mjs';
import {currentRevision,searchRules} from '../lib/rules-core.mjs';
import {listTemplates,binderUsage} from '../lib/forum-store.mjs';
import {listXenForoLinks} from '../lib/xenforo-store.mjs';
import {listCases} from '../lib/complaints-store.mjs';
import {listTimers} from '../lib/timers-store.mjs';
import {listDocumentRecords} from '../lib/document-store.mjs';
import {loadMonitor} from '../lib/monitor-store.mjs';
import {remainingLabel} from '../lib/timers-core.mjs';
import {projectLabel,getActiveProfile} from '../lib/model.mjs';
import '../lib/xenforo-core.js';
export const NAV_GROUPS=[['Рабочее пространство',['home','search','ai','forum','timers']],['Модерация',['moderation','complaints','rules']],['Работа с делами',['evidence','knowledge','law','justice','documents']],['RP и интеграции',['monitor','economy','tactical','integrations']],['Система',['profiles','sites','settings','backup']]];
export const FORUM_TABS=[['binder','Биндер'],['navigation','Навигация'],['customization','Оформление'],['settings','Настройки форума']];
const labels={binder:'Шаблоны',bookmarks:'Закладки',complaints:'Жалобы и сроки',timers:'Активные таймеры',documents:'Документы',servers:'Избранные серверы',rules:'Избранные правила',calculations:'Незавершённые расчёты',violations:'Недавние нарушения'};
const date=x=>x?new Date(x).toLocaleString('ru-RU'):'—';
const go=(view,label,pane='')=>`<button type="button" class="button secondary" data-action="nav" data-view="${view}" ${pane?`data-pane="${pane}"`:''}>${e(label)}</button>`;
const line=(title,detail,action='')=>`<div class="ws-item"><div><strong>${e(title)}</strong><p class="subtle">${e(detail)}</p></div>${action}</div>`;
export function dashboardSnapshot(state,raw,now=Date.now()){
  const p=getActiveProfile(state),id=p.id,belongs=x=>x.profileId===id||x.profileId==='*';
  const host=globalThis.MTXenForo.domain(p.forumUrl);
  const usage=raw.usage||{};
  const templates=(raw.binder||[]).filter(belongs).filter(t=>t.favorite||usage[t.id]).sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite)||(usage[b.id]||0)-(usage[a.id]||0));
  const bookmarks=globalThis.MTXenForo.selectNavigation(raw.bookmarks||[],id,host).filter(x=>x.kind==='bookmark').sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||String(b.lastOpened||b.createdAt).localeCompare(String(a.lastOpened||a.createdAt)));
  const cases=(raw.complaints||[]).filter(x=>x.profileId===id&&x.status!=='done').sort((a,b)=>(a.deadline?Date.parse(a.deadline):Infinity)-(b.deadline?Date.parse(b.deadline):Infinity));
  const timers=(raw.timers||[]).filter(x=>x.status==='active').sort((a,b)=>a.expiresAt-b.expiresAt);
  const documents=(raw.documents||[]).filter(x=>x.profileId===id&&x.type==='document').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const m=raw.servers;const servers=(m?.catalog||[]).filter(x=>m.favorites.includes(x.id)).map(x=>({...x,live:m.live.find(y=>y.id===x.id),liveAt:m.liveAt}));
  const rules=searchRules(raw.rules||[],{profileId:id,project:p.project,server:p.server});
  const calculations=cases.filter(c=>c.moderation?.status==='draft'&&c.moderation.project===p.project&&c.moderation.server===p.server);
  const violations=rules.filter(r=>r.lastOpened).sort((a,b)=>b.lastOpened.localeCompare(a.lastOpened));
  return {templates,bookmarks,cases,timers,documents,servers,rules:rules.filter(r=>r.favorite),calculations,violations,now};
}
export async function loadDashboard(state){
  const results=await Promise.allSettled([listTemplates(),binderUsage(state.activeProfileId),listXenForoLinks(),listCases(),listTimers(),listDocumentRecords(),loadMonitor(),listRules()]);
  const keys=['binder','usage','bookmarks','complaints','timers','documents','servers','rules'];const raw={},errors=[];
  results.forEach((r,i)=>{if(r.status==='fulfilled')raw[keys[i]]=r.value;else errors.push(keys[i]);});
  return {data:dashboardSnapshot(state,raw),errors};
}
export function dashboardShell(state,granted){const p=getActiveProfile(state);return `<div class="stack ws-dashboard"><section class="ws-welcome card"><div><p class="eyebrow">Evidence & Knowledge / 1.9.0</p><h3>${e(p.name)}</h3><p class="lead">${e(projectLabel(p.project))} · ${e(p.server)}</p><p class="subtle">${granted?'Доступ к форуму предоставлен':'Доступ к форуму не предоставлен'}</p></div><div class="row">${p.forumUrl?`<button class="button primary" data-url="${e(p.forumUrl)}">Открыть форум ↗</button>`:''}${go('moderation','Центр модерации')}${go('evidence','Evidence & Knowledge')}${go('justice','Government & Justice')}${go('rules','Правила и наказания')}${go('sites','Разрешения')}${go('search','Поиск · Ctrl+K')}</div></section><section class="ws-quick grid">${[['binder','Биндер 2.0','Шаблоны и быстрые ответы'],['navigation','Navigation 2.0','Ссылки и закладки'],['customization','Оформление','Темы и режим чтения'],['settings','Forum Core','Настройки интеграции']].map(([id,title,desc])=>`<button class="card ws-tile" data-action="nav" data-view="forum" data-pane="${id}"><strong>${title}</strong><span class="subtle">${desc}</span><span aria-hidden="true">↗</span></button>`).join('')}</section><section class="card stack"><div class="row spread"><h3>Мой рабочий стол</h3><button class="button secondary" data-action="dashboard-refresh">Обновить</button></div><details><summary>Настроить виджеты</summary><div class="stack ws-widget-settings">${workspacePreferences(state.preferences.workspace).order.map(id=>`<div class="row spread"><label class="check"><input type="checkbox" data-widget-toggle="${id}" ${workspacePreferences(state.preferences.workspace).hidden.includes(id)?'':'checked'}>${labels[id]}</label><div class="row"><button class="button secondary" data-action="widget-order" data-id="${id}" data-direction="up" aria-label="${labels[id]}: выше">↑</button><button class="button secondary" data-action="widget-order" data-id="${id}" data-direction="down" aria-label="${labels[id]}: ниже">↓</button></div></div>`).join('')}<button class="button secondary" data-action="widget-reset">Сбросить виджеты</button></div></details><div id="ws-widgets" aria-live="polite"><p class="subtle">Загрузка локальных данных…</p></div></section></div>`;}
export function dashboardWidgets(state,{data:d,errors}){
  const prefs=workspacePreferences(state.preferences.workspace),empty='<p class="subtle">Нет записей.</p>';
  const items={binder:d.templates.slice(0,5).map(t=>line(t.label,t.category||'Без папки',`<button class="button secondary" data-action="dashboard-template" data-id="${e(t.id)}">Копировать</button>`)),bookmarks:d.bookmarks.slice(0,5).map(t=>line(t.title,t.group||'Закладки',`<button class="button secondary" data-action="dashboard-bookmark" data-id="${e(t.id)}">Открыть ↗</button>`)),complaints:d.cases.slice(0,5).map(t=>line(t.title,t.deadline?`${Date.parse(t.deadline)<d.now?'Просрочено · ':''}${date(t.deadline)}`:'Без срока')),timers:d.timers.slice(0,5).map(t=>line(t.title,`До ${date(t.expiresAt)}`,`<span class="tag" data-timer-until="${t.expiresAt}">${e(remainingLabel(t.expiresAt-d.now))}</span>`)),documents:d.documents.slice(0,5).map(t=>line(t.versions.at(-1)?.title||'Документ',`Версия ${t.currentVersion} · ${date(t.updatedAt)}`)),servers:d.servers.slice(0,5).map(t=>line(t.name||t.id,`${t.live?.online??'—'} онлайн · ${t.live&&t.liveAt?'Данные '+date(t.liveAt):'Нет подтверждённых данных'}`))};
  items.rules=d.rules.slice(0,5).map(r=>{const x=currentRevision(r);return line(x.code+' — '+x.title,x.category,`<button type="button" class="button secondary" data-action="dashboard-rule" data-id="${e(r.id)}">Открыть ↗</button>`);});
  items.calculations=d.calculations.slice(0,5).map(c=>line(c.title,'Незавершённое рассмотрение',`<button type="button" class="button secondary" data-action="dashboard-case" data-id="${e(c.id)}">Продолжить ↗</button>`));
  items.violations=d.violations.slice(0,5).map(r=>{const x=currentRevision(r);return line(x.code+' — '+x.title,date(r.lastOpened));});
  const routes={rules:['rules','library'],calculations:['rules','calculator'],violations:['rules','library'],binder:['forum','binder'],bookmarks:['forum','navigation'],complaints:['complaints'],timers:['timers'],documents:['documents'],servers:['monitor']};
  return `<div class="ws-widgets">${prefs.order.filter(id=>!prefs.hidden.includes(id)).map(id=>`<section class="ws-widget"><div class="row spread"><h3>${labels[id]}</h3>${go(routes[id][0],'Все ↗',routes[id][1])}</div>${errors.includes(id)||(id==='binder'&&errors.includes('usage'))||(id==='violations'&&errors.includes('rules'))||(id==='calculations'&&errors.includes('complaints'))?'<p class="subtle" role="alert">Данные временно недоступны.</p>':items[id].join('')||empty}</section>`).join('')||'<p class="subtle">Все виджеты скрыты. Включите нужные в настройках.</p>'}</div>`;
}
