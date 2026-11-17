import {getActiveProfile} from '../lib/model.mjs';
import {loadState,modifyState} from '../lib/state.mjs';
import {listCases} from '../lib/complaints-store.mjs';
import {exportSectionData} from '../lib/section-monitor-store.mjs';
import {exportRegistryData} from '../lib/punishment-registry-store.mjs';
import {moderationOpsFor} from '../lib/moderation-ops-store.mjs';
import {analytics} from '../lib/moderation-ops-core.mjs';
import {CENTER_TABS,CENTER_PERIODS,cleanModerationCenter} from '../lib/moderation-center-prefs.mjs';
import {mountSectionMonitor} from './section-monitor-page.mjs';
import {mountRegistry} from './punishment-registry-page.mjs';
import {focusComplaintCase} from './complaints-page.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';

const NAMES={overview:'Обзор',cases:'Жалобы и очередь',inbox:'Мониторинг и входящие',registry:'Реестр и экспорт',analytics:'Аналитика, SLA и журнал'};
const date=v=>v?new Date(v).toLocaleString('ru-RU'):'—';
const isScoped=(item,p)=>item.profileId===p.id&&(!item.project||item.project===p.project)&&(!item.server||item.server===p.server);
export function moderationCenterSnapshot(p,cases,sectionData,registryData,ops,{days=7,now=Date.now()}={}){
 if(!CENTER_PERIODS.includes(days))throw Error('Некорректный период сводки');
 const own=cases.filter(c=>c.profileId===p.id&&(!c.moderation||isScoped(c.moderation,p)));
 const subscriptions=sectionData.subscriptions.filter(s=>isScoped(s,p));
 const incoming=sectionData.inbox.filter(item=>item.profileId===p.id&&subscriptions.some(s=>s.id===item.subscriptionId));
 const records=registryData.records.filter(r=>isScoped(r,p));
 const stats=analytics(own,p.id,{days,now});
 const active=own.filter(c=>c.status!=='done'&&c.triage?.queue!=='archived');
 const due=active.filter(c=>c.deadline&&Date.parse(c.deadline)<now);
 const upcoming=active.filter(c=>c.deadline&&Date.parse(c.deadline)>=now&&Date.parse(c.deadline)<=now+3600000);
 return {profile:p.id,days,stats,subscriptions:subscriptions.length,pending:incoming.filter(i=>i.status==='pending').length,updates:incoming.filter(i=>i.status==='pending'&&i.kind==='reply').length,records:records.length,active:active.length,overdue:due.length,dueSoon:upcoming.length,reviewed:records.filter(r=>r.status==='reviewed').length,batch:p.moderationBatch??[],cases:active.slice().sort((a,b)=>(a.deadline?Date.parse(a.deadline):Infinity)-(b.deadline?Date.parse(b.deadline):Infinity)||b.updatedAt.localeCompare(a.updatedAt)).slice(0,8),events:incoming.filter(i=>i.status==='pending').sort((a,b)=>b.at.localeCompare(a.at)).slice(0,6),audit:ops.audit.slice(-6).reverse()};
}
export function moderationCenterSection(state,complaintsHtml){
 const profile=getActiveProfile(state),selected=cleanModerationCenter(profile.moderationCenter);
 return `<div class="stack mc-center" id="moderation-center"><section class="card stack mc-intro"><div class="row spread"><div><h3>Advanced Moderation · 1.8.0</h3><p class="lead">Очереди жалоб, мониторинг разделов, решения и санкции — единый локальный центр модерации.</p></div><span class="tag">${e(profile.name)} · ${e(profile.server)}</span></div><p class="subtle">Серверные действия, публикация и исполнение наказаний не производятся автоматически.</p><nav class="mc-tabs" aria-label="Разделы центра модерации" role="tablist">${CENTER_TABS.map(t=>`<button type="button" role="tab" class="button secondary" data-mc-tab="${t}" aria-controls="mc-panel-${t}" aria-selected="false">${e(NAMES[t])}</button>`).join('')}</nav></section><div id="mc-panel-overview" role="tabpanel" data-mc-panel="overview"><section class="card stack" id="mc-summary" aria-live="polite">Загрузка актуальных показателей…</section></div><div id="mc-panel-cases" role="tabpanel" data-mc-panel="cases">${complaintsHtml}</div><div id="mc-panel-inbox" role="tabpanel" data-mc-panel="inbox"><div id="mc-inbox"></div></div><div id="mc-panel-registry" role="tabpanel" data-mc-panel="registry"><div id="punishment-registry"></div></div><div id="mc-panel-analytics" role="tabpanel" data-mc-panel="analytics"><div id="mc-analytics"></div></div></div>`;
}
export function mountModerationCenter(root,state,feedback){
 if(!root)return;const profile=getActiveProfile(state),settings=cleanModerationCenter(profile.moderationCenter);
 const monitor=root.querySelector('#section-monitor-root'),inbox=root.querySelector('#mc-inbox');
 const analyticsNode=root.querySelector('.moderation-analytics'),analyticsTarget=root.querySelector('#mc-analytics');
 if(!monitor||!inbox||!analyticsNode||!analyticsTarget)throw Error('Не удалось подключить разделы центра модерации');
 inbox.append(monitor);analyticsTarget.append(analyticsNode);
 mountSectionMonitor(monitor,state,feedback);
 mountRegistry(root.querySelector('#punishment-registry'),state,feedback);
 const doc=root.ownerDocument,summary=root.querySelector('#mc-summary');let epoch=0,days=settings.days;
 const el=(tag,text,cls)=>{const item=doc.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
 const button=(title,fn)=>{const b=el('button',title,'button secondary');b.type='button';b.addEventListener('click',fn);return b;};
 async function persist(patch){
  await modifyState(s=>{const current=getActiveProfile(s);if(current.id!==profile.id||current.project!==profile.project||current.server!==profile.server)throw Error('Профиль изменился');return {...s,profiles:s.profiles.map(p=>p.id===profile.id?{...p,moderationCenter:cleanModerationCenter({...cleanModerationCenter(p.moderationCenter),...patch})}:p)};});
 }
 const currentTab=()=>{const fromUrl=new URLSearchParams(location.search).get('moderationTab');return CENTER_TABS.includes(fromUrl)?fromUrl:settings.tab;};
 let tab=currentTab();
 function show(next,save=true){
  if(!CENTER_TABS.includes(next))throw Error('Неизвестная вкладка модерации');tab=next;
  for(const t of CENTER_TABS){root.querySelector('#mc-panel-'+t).hidden=t!==next;const b=root.querySelector('[data-mc-tab="'+t+'"]');b.setAttribute('aria-selected',String(t===next));b.classList.toggle('primary',t===next);b.classList.toggle('secondary',t!==next);b.tabIndex=t===next?0:-1;}
  if(save){const u=new URL(location.href);u.searchParams.set('moderationTab',next);history.replaceState(null,'',u.href);void persist({tab:next}).catch(err=>feedback(err.message,true));}
  if(next==='overview')void refresh();
 }
 async function refresh(){const token=++epoch;try{
  const live=await loadState(),p=getActiveProfile(live);if(p.id!==profile.id||p.project!==profile.project||p.server!==profile.server)throw Error('Активный профиль изменился');
  const [cases,sections,registry,ops]=await Promise.all([listCases(),exportSectionData(live.profiles),exportRegistryData(live.profiles),moderationOpsFor(p)]);
  if(!root.isConnected||token!==epoch)return;
  const data=moderationCenterSnapshot(p,cases,sections,registry,ops,{days});summary.replaceChildren();
  const heading=el('div',undefined,'row spread');const head=el('div');head.append(el('h3','Сводка модерации'),el('p',p.name+' · '+p.server,'subtle'));heading.append(head);
  const select=el('select');select.setAttribute('aria-label','Период статистики');for(const x of CENTER_PERIODS){const o=el('option',x+' дней');o.value=String(x);o.selected=x===days;select.append(o);}select.addEventListener('change',()=>{days=Number(select.value);void persist({days}).catch(err=>feedback(err.message,true));void refresh();});heading.append(select);summary.append(heading);
  const grid=el('div',undefined,'mc-metrics');for(const [label,value,target] of [['Входящие',data.pending,'inbox'],['В работе',data.active,'cases'],['Просрочено',data.overdue,'cases'],['Срок ≤ 1 часа',data.dueSoon,'cases'],['Решения в реестре',data.records,'registry'],['Подписки',data.subscriptions,'inbox'],['Новые ответы',data.updates,'inbox'],['Обработано за период',data.stats.counts.completed,'analytics']]){
   const b=el('button',undefined,'mc-metric');b.type='button';b.append(el('strong',String(value)),el('span',label));b.addEventListener('click',()=>show(target));grid.append(b);
  }summary.append(grid);
  const actions=el('div',undefined,'row wrap');for(const [label,target] of [['Открыть жалобы','cases'],['Входящая очередь','inbox'],['Реестр и экспорт','registry'],['Аналитика и SLA','analytics']])actions.append(button(label,()=>show(target)));summary.append(actions);
  const lists=el('div',undefined,'mc-overview-lists');const casesBox=el('section',undefined,'card stack');casesBox.append(el('h4','Ближайшие дела'));for(const c of data.cases){const b=button(c.title+' · '+(c.deadline?date(c.deadline):'без срока'),()=>{show('cases');focusComplaintCase(c.id);root.querySelector('[data-case-card][data-id="'+CSS.escape(c.id)+'"]')?.scrollIntoView({block:'nearest'});});casesBox.append(b);}if(!data.cases.length)casesBox.append(el('p','Нет открытых жалоб.','subtle'));lists.append(casesBox);
  const eventsBox=el('section',undefined,'card stack');eventsBox.append(el('h4','Входящие события'));for(const x of data.events)eventsBox.append(button((x.kind==='new'?'Новая тема: ':x.kind==='reply'?'Новые ответы: ':'Изменение: ')+(x.row?.title??'Тема')+' · '+date(x.at),()=>show('inbox')));if(!data.events.length)eventsBox.append(el('p','Нет необработанных событий.','subtle'));lists.append(eventsBox);summary.append(lists);
  const batch=el('p','Пакетная очередь: '+data.batch.length+' дел. Последних локальных событий: '+ops.audit.length+'.','subtle');summary.append(batch,button('Обновить показатели',()=>void refresh()));
 }catch(err){if(root.isConnected&&token===epoch){summary.replaceChildren(el('p','Не удалось загрузить показатели: '+err.message,'subtle'),button('Повторить',()=>void refresh()));}}}
 root.addEventListener('click',ev=>{const b=ev.target.closest('[data-mc-tab]');if(b&&root.contains(b)){ev.preventDefault();ev.stopPropagation();show(b.dataset.mcTab);}});
 root.addEventListener('keydown',ev=>{const b=ev.target.closest('[data-mc-tab]');if(!b||!['ArrowRight','ArrowLeft','Home','End'].includes(ev.key))return;ev.preventDefault();const i=CENTER_TABS.indexOf(b.dataset.mcTab),next=ev.key==='Home'?0:ev.key==='End'?CENTER_TABS.length-1:(i+(ev.key==='ArrowRight'?1:-1)+CENTER_TABS.length)%CENTER_TABS.length;show(CENTER_TABS[next]);root.querySelector('[data-mc-tab="'+CENTER_TABS[next]+'"]').focus();});
 root.addEventListener('moderation-refresh',()=>{if(tab==='overview')void refresh();});show(tab,false);
}
