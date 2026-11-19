import '../lib/safe-dom.js';
import {marketplaceSection,refreshMarketplace} from './marketplace-page.mjs';
import {tradingSection,refreshTrading} from './trading-page.mjs';
import {familiesSection,refreshFamilies} from './family-page.mjs';
import {organizationSection,refreshOrganizations} from './organization-page.mjs';
import {crimeSection,refreshCrime} from './crime-page.mjs';
import {financeSection,refreshFinance} from './finance-page.mjs';
const { replaceHtml, insertHtml } = globalThis.MTSafeDOM;
import { listEconomy, addEconomy, updateEconomy, removeEconomy, getEconomy } from '../lib/economy-store.mjs';
import { resaleCalc, craftCalc, workCalc, dealTotals, summarizeEconomy, summarizeMatches, formatCurrency, DEAL_CATEGORIES, toCsv } from '../lib/economy-core.mjs';
import { escapeHtml as e } from '../lib/sites.mjs';
import {api} from '../lib/browser.mjs';
import {ECONOMY_UI_KEY,ECONOMY_TABS,ECONOMY_TAB_LABELS,cleanEconomyUI,selectEconomyTab,setEconomyPref,rememberEconomyRecord,economySearch,economySnapshot} from '../lib/economy-workspace-core.mjs';
let entries=[];
let ui={tabs:{},filters:{},queries:{},recent:[]},visible=40;
const lookups=new Map();
let serial=Promise.resolve();
function persist(change){const job=serial.then(async()=>{const next=change(ui);await api.storage.local.set({[ECONOMY_UI_KEY]:next});ui=next;return next;});serial=job.catch(()=>{});return job;}
const profiles=state=>state.profiles.map(p=>p.id);
export async function loadEconomyWorkspace(state){ui=cleanEconomyUI((await api.storage.local.get(ECONOMY_UI_KEY))[ECONOMY_UI_KEY],profiles(state));lookups.clear();visible=40;await Promise.all([refreshTrading(state.activeProfileId),refreshFamilies(),refreshOrganizations(state.activeProfileId),refreshCrime(),refreshFinance(state.activeProfileId)]);}
export const currentEconomyTab=profileId=>ECONOMY_TABS.includes(ui.tabs[profileId])?ui.tabs[profileId]:'overview';
export async function changeEconomyTab(state,tab){await persist(previous=>selectEconomyTab(previous,state.activeProfileId,tab,profiles(state)));visible=40;}
export async function rememberEconomyOpen(state,id){await persist(previous=>rememberEconomyRecord(previous,state.activeProfileId,id,profiles(state)));}
export async function forgetEconomyProfile(state){for(const id of lookups.keys())if(!profiles(state).includes(id))lookups.delete(id);await persist(previous=>cleanEconomyUI(previous,profiles(state)));}

export async function refreshEconomy(){[entries]=await Promise.all([listEconomy(),refreshMarketplace(),refreshFamilies(),refreshOrganizations(),refreshCrime()]);}
export function currentEconomy(){return entries;}
const money = value=>formatCurrency(value);
const number = value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value);
const x = (n)=>Math.round(n*10)/10;
function chart(points){
  if(!points.length)return '<p class="subtle">После сохранения операций появится график прибыли.</p>';
  let running=0;const values=points.map(p=>(running+=p.profit));
  const lo=Math.min(0,...values),hi=Math.max(0,...values),range=Math.max(1,hi-lo);
  const step=Math.max(1,Math.ceil(values.length/160));
  const indices=values.map((_,i)=>i).filter(i=>i%step===0||i===values.length-1);
  const w=660,h=210,left=58,right=18,top=12,bottom=37,available=w-left-right,height=h-top-bottom;
  const coords=indices.map(i=>[left+(values.length===1?available/2:available*i/(values.length-1)),top+(hi-values[i])*height/range]);
  const base=top+hi*height/range;
  const line=coords.map(([xx,yy])=>`${x(xx)},${x(yy)}`).join(' ');
  const baseline=`<line x1="${left}" y1="${x(base)}" x2="${w-right}" y2="${x(base)}" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="5 5"/>`;
  const dates=[points[0].date,points[points.length-1].date];
  return `<svg class="economy-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Накопленная прибыль по датам: ${e(money(values.at(-1)))}"><line x1="${left}" y1="${top}" x2="${left}" y2="${h-bottom}" stroke="currentColor" stroke-opacity=".3"/>${baseline}<polyline fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${line}"/>${coords.map(([xx,yy],i)=>`<circle cx="${x(xx)}" cy="${x(yy)}" r="3" fill="var(--accent)"><title>${e(points[indices[i]].date+' · '+money(values[indices[i]]))}</title></circle>`).join('')}<text x="8" y="${top+12}" font-size="11" fill="currentColor">${e(number(hi))}</text><text x="8" y="${h-bottom}" font-size="11" fill="currentColor">${e(number(lo))}</text><text x="${left}" y="${h-10}" font-size="11" fill="currentColor">${e(dates[0])}</text><text x="${w-right}" y="${h-10}" text-anchor="end" font-size="11" fill="currentColor">${e(dates[1])}</text></svg>`;
}
function bars(rows){
  if(!rows.length)return '<p class="subtle">Добавьте результат игрока, чтобы увидеть сравнение.</p>';
  const max=Math.max(1,...rows.slice(0,8).map(r=>r.damage));
  return `<div class="economy-bars" role="img" aria-label="Сравнение нанесённого урона по игрокам">${rows.slice(0,8).map(r=>`<div class="economy-bar"><span title="${e(r.name)}">${e(r.name)}</span><div class="economy-track"><div style="width:${x(100*r.damage/max)}%"></div></div><strong>${e(number(r.damage))}</strong></div>`).join('')}</div>`;
}
function dateNow(){const d=new Date();const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function f(name,label,value='',type='text',extra=''){return `<label class="field">${label}<input name="${name}" type="${type}" value="${e(String(value))}" ${extra}></label>`;}
function select(name,label,values,value){return `<label class="field">${label}<select name="${name}">${values.map(([v,title])=>`<option value="${e(v)}" ${v===value?'selected':''}>${e(title)}</option>`).join('')}</select></label>`;}
function formFields(type,item={}){
  const date=f('date','Дата',item.date||dateNow(),'date','required');
  const note=`<label class="field">Примечание<textarea name="note" maxlength="1000" rows="2">${e(item.note||'')}</textarea></label>`;
  const price=(name,label,defaultValue=0)=>f(name,label,item[name]??defaultValue,'number','min="0" max="1000000000000" step="1" required');
  if(type==='deal')return `${date}${f('title','Предмет или название сделки',item.title||'','text','maxlength="120" required')}${select('category','Категория',DEAL_CATEGORIES.map(c=>[c,c]),item.category||'Транспорт')}${select('status','Статус сделки',[['open','Покупка (ещё не продано)'],['closed','Продано']],item.status||'closed')}${price('quantity','Количество',1)}${price('buyPrice','Покупка за единицу')}${price('salePrice','Продажа за единицу')}${price('buyFee','Расходы на покупку')}${price('saleFee','Расходы на продажу')}${note}`;
  if(type==='cash')return `${date}${select('kind','Тип операции',[['income','Поступление'],['expense','Расход']],item.kind||'income')}${f('title','Источник/категория',item.title||'','text','maxlength="120" required')}${f('amount','Сумма',item.amount??0,'number','min="1" max="1000000000000" step="1" required')}${note}`;
  return `${date}${f('player','Имя игрока',item.player||'','text','maxlength="80" required')}${f('family','Семья',item.family||'','text','maxlength="80"')}${f('opponent','Противник',item.opponent||'','text','maxlength="100"')}${f('mode','Режим',item.mode||'Капт','text','maxlength="60" required')}${select('result','Результат',[['win','Победа'],['loss','Поражение'],['draw','Ничья']],item.result||'win')}${f('kills','Убийства',item.kills??0,'number','min="0" max="10000" required')}${f('deaths','Смерти',item.deaths??0,'number','min="0" max="10000" required')}${f('damage','Урон',item.damage??0,'number','min="0" max="10000000" required')}${note}`;
}
const formTypes={deal:'Сделка',cash:'Доход / расход',match:'Результат игрока'};
function calcSection(){
  return `<section class="card stack"><h3>Калькуляторы</h3><p class="subtle">Расчёты выполняются локально. Суммы указываются в целых игровых долларах, комиссии — за всю операцию.</p><div class="economy-calc-grid">
  <form data-economy-calc="resale" class="economy-calc card stack"><h3>Перекуп</h3>${f('quantity','Количество',1,'number','min="1" step="1" required')}${f('buyPrice','Цена покупки, шт.',0,'number','min="0" step="1" required')}${f('salePrice','Цена продажи, шт.',0,'number','min="0" step="1" required')}${f('buyFee','Расходы покупки',0,'number','min="0" step="1" required')}${f('saleFee','Расходы продажи',0,'number','min="0" step="1" required')}<button class="button primary" type="submit">Рассчитать</button><output class="economy-output" aria-live="polite">Введите значения.</output></form>
  <form data-economy-calc="craft" class="economy-calc card stack"><h3>Крафт</h3>${f('units','Нужное количество',1,'number','min="1" step="1" required')}${f('successPercent','Шанс успеха, %',100,'number','min="0.01" max="100" step="0.01" required')}${f('materialCost','Ресурсы на попытку',0,'number','min="0" step="1" required')}${f('feePerAttempt','Прочие расходы на попытку',0,'number','min="0" step="1" required')}${f('salePrice','Цена продажи результата',0,'number','min="0" step="1" required')}<button class="button primary" type="submit">Рассчитать</button><output class="economy-output" aria-live="polite">Расчёт математического ожидания.</output></form>
  <form data-economy-calc="work" class="economy-calc card stack"><h3>Работы и рейсы</h3>${f('runs','Количество рейсов',1,'number','min="1" step="1" required')}${f('minutesPerRun','Минут на рейс',15,'number','min="1" step="1" required')}${f('incomePerRun','Доход за рейс',0,'number','min="0" step="1" required')}${f('costPerRun','Расход за рейс',0,'number','min="0" step="1" required')}<button class="button primary" type="submit">Рассчитать</button><output class="economy-output" aria-live="polite">Доход за час и весь период.</output></form></div></section>`;
}
function statGrid(stats, matches){return `<div class="economy-stats">
  <div><small>Чистый результат</small><strong>${e(money(stats.profit))}</strong></div>
  <div><small>Поступления</small><strong>${e(money(stats.revenue))}</strong></div>
  <div><small>Затраты</small><strong>${e(money(stats.costs))}</strong></div>
  <div><small>Сделки / прибыльные</small><strong>${stats.deals} / ${stats.positive}</strong></div>
  <div><small>Записано матчей</small><strong>${matches.length}</strong></div><div><small>Открытые сделки</small><strong>${stats.openDeals} / ${e(money(stats.openCapital))}</strong></div>
</div>`;}
function listing(records){if(!records.length)return '<p class="empty">Записей для выбранного фильтра нет.</p>';
return `<div class="economy-list">${records.slice(0,visible).map(item=>{
  let subtitle='', amount='';
  if(item.type==='deal'){const v=dealTotals(item);subtitle=`${e(item.category)} · ${item.quantity} шт. · ${item.status==='open'?'Ещё не продано':'ROI '+(v.roi===null?'—':e(number(v.roi))+'%')}`;amount=item.status==='open'?'Вложено: '+money(v.invested):money(v.profit);}
  else if(item.type==='cash'){subtitle=item.kind==='income'?'Поступление':'Расход';amount=(item.kind==='income'?'+':'−')+money(item.amount);}
  else {subtitle=`${e(item.mode)} · ${item.result==='win'?'Победа':item.result==='loss'?'Поражение':'Ничья'} · K/D ${item.kills}/${item.deaths} · ${e(number(item.damage))} урона`;amount=e(item.family||'Без семьи');}
  return `<article class="economy-record"><div><small class="subtle">${e(item.date)} · ${e(formTypes[item.type])}</small><h4>${e(item.type==='match'?item.player:item.title)}</h4><p class="subtle">${subtitle}</p>${item.note?`<p class="subtle">${e(item.note)}</p>`:''}</div><div class="economy-record-actions"><strong>${e(amount)}</strong><div class="row"><button class="button secondary" data-economy-action="edit" data-id="${e(item.id)}">Изменить</button><button class="button danger" data-economy-action="remove" data-id="${e(item.id)}">Удалить</button></div></div></article>`;
}).join('')}</div>${records.length>visible?`<button type="button" class="button secondary" data-economy-action="more">Ещё ${Math.min(40,records.length-visible)} записей</button>`:''}`;}
const recordTitle=item=>item.type==='match'?item.player:item.title;
const recordDescription=item=>item.type==='deal'?`${item.category} · ${item.status==='open'?'Не продано':'Продано'} · ${item.quantity} шт.`:item.type==='cash'?`${item.kind==='income'?'Поступление':'Расход'} · ${money(item.amount)}`:`${item.family||'Без семьи'} · ${item.mode} · ${item.result==='win'?'Победа':item.result==='loss'?'Поражение':'Ничья'}`;
function lookupHTML(state){
 const lookup=lookups.get(state.activeProfileId)||'';
 const hits=economySearch(entries,state.activeProfileId,lookup,'all',60);
 return `<p class="subtle" role="status">${lookup?`Найдено: ${hits.length}${hits.length===60?' (первые 60)':''}`:'Недавно изменённые записи'}</p>${hits.length?hits.slice(0,12).map(item=>`<article class="economy-hit"><div><strong>${e(recordTitle(item))}</strong><p class="subtle">${e(item.date)} · ${e(formTypes[item.type])} · ${e(recordDescription(item))}</p></div><button type="button" class="button secondary" data-economy-action="edit" data-id="${e(item.id)}">Открыть</button></article>`).join(''):'<p class="empty">Записей не найдено.</p>'}`;
}
export function economyLookupHTML(state){return lookupHTML(state);}
export function setEconomyLookup(value,state){lookups.set(state.activeProfileId,String(value??'').slice(0,160));}
function quickActions(){return `<div class="row economy-shortcuts"><button type="button" class="button primary" data-economy-action="new" data-type="deal">+ Сделка</button><button type="button" class="button secondary" data-economy-action="new" data-type="cash">+ Доход / расход</button><button type="button" class="button secondary" data-economy-action="new" data-type="match">+ Матч игрока</button></div>`;}
function recentSection(state){
 const inProfile=new Map(entries.filter(r=>r.profileId===state.activeProfileId).map(r=>[r.id,r]));
 const recently=ui.recent.filter(r=>r.profileId===state.activeProfileId).map(r=>inProfile.get(r.id)).filter(Boolean).slice(0,8);
 return `<section class="card stack"><h3>Недавно открытые записи</h3>${recently.length?recently.map(item=>`<article class="economy-hit"><div><strong>${e(recordTitle(item))}</strong><p class="subtle">${e(item.date)} · ${e(recordDescription(item))}</p></div><button class="button secondary" data-economy-action="edit" data-id="${e(item.id)}">Открыть</button></article>`).join(''):'<p class="subtle">Откройте сделку, операцию или матч, чтобы запись появилась в истории профиля.</p>'}</section>`;
}
function groupsSection(snap){return `<section class="card stack"><div class="row spread"><h3>Игроки и семьи</h3><span class="tag">${snap.matches.length} матчей · ${snap.families.length} групп</span></div><p class="subtle">Исторические группы по тексту поля «Семья» сохраняются без изменений; связывание с семейным реестром выполняется по имени или вручную добавленному псевдониму.</p><div class="economy-analysis"><div><h4>Урон по игрокам</h4>${bars(snap.players)}${snap.players.length?`<div class="table-scroll"><table class="economy-table"><thead><tr><th>Игрок</th><th>Матчи</th><th>Победы</th><th>Winrate</th><th>K/D</th><th>Ср. урон</th></tr></thead><tbody>${snap.players.map(p=>`<tr><td>${e(p.name)}</td><td>${p.matches}</td><td>${p.wins}</td><td>${e(number(p.winRate))}%</td><td>${e(number(p.kd))}</td><td>${e(number(p.avgDamage))}</td></tr>`).join('')}</tbody></table></div>`:''}</div><div><h4>Рейтинг семей и групп</h4>${snap.families.length?`<div class="table-scroll"><table class="economy-table"><thead><tr><th>Семья / группа</th><th>Матчи</th><th>Победы</th><th>Winrate</th><th>Урон</th><th>Матчи группы</th></tr></thead><tbody>${snap.families.map(p=>`<tr><td>${e(p.name)}</td><td>${p.matches}</td><td>${p.wins}</td><td>${e(number(p.winRate))}%</td><td>${e(number(p.damage))}</td><td><button type="button" class="button secondary" data-economy-action="family" data-family="${e(p.name)}">Показать</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="subtle">Данные появятся после записи результатов матчей.</p>'}</div></div></section>`;}
function journalSection(state,tab){
 const type=tab==='market'?'deal':tab==='finance'?'cash':tab==='groups'?'match':(ui.filters[state.activeProfileId]||'all');
 const query=ui.queries[state.activeProfileId]||'';
 const count=entries.filter(r=>r.profileId===state.activeProfileId&&(type==='all'||r.type===type)&&(!query||economySearch([r],state.activeProfileId,query).length)).length;
 // Keep the existing 40-record paging for ordinary journals, without including other profiles.
 const all=entries.filter(r=>r.profileId===state.activeProfileId&&(type==='all'||r.type===type)&&(!query||economySearch([r],state.activeProfileId,query).length));
 return `<section class="card stack"><div class="row spread"><h3>${tab==='market'?'Реестр рыночных сделок':tab==='finance'?'Денежные операции':tab==='groups'?'История матчей':'Журнал операций и матчей'} (${count})</h3><div class="row"><button class="button secondary" data-economy-action="csv" data-type="deal">CSV сделок</button><button class="button secondary" data-economy-action="csv" data-type="cash">CSV операций</button><button class="button secondary" data-economy-action="csv" data-type="match">CSV матчей</button></div></div><div class="economy-filter">${tab==='journal'?`<label class="field">Тип<select id="economy-filter"><option value="all" ${type==='all'?'selected':''}>Все</option>${Object.entries(formTypes).map(([k,v])=>`<option value="${k}" ${type===k?'selected':''}>${e(v)}</option>`).join('')}</select></label>`:''}<label class="field">Поиск<input id="economy-search" type="search" maxlength="160" autocomplete="off" value="${e(query)}" placeholder="Название, игрок, семья, дата"></label></div>${listing(all)}</section>`;
}
export function economySection(state){
 const snap=economySnapshot(entries,state.activeProfileId),tab=currentEconomyTab(state.activeProfileId),p=state.profiles.find(x=>x.id===state.activeProfileId);
 const tabButtons=ECONOMY_TABS.map(id=>`<button type="button" class="button ${id===tab?'primary':'secondary'}" role="tab" aria-selected="${id===tab}" data-economy-action="tab" data-tab="${id}">${e(ECONOMY_TAB_LABELS[id])}</button>`).join('');
 const header=`<section class="card stack economy-workspace-header"><div class="row spread"><div><h3>Economy & Crime · 2.1.7</h3><p class="subtle">${e(p?.name||'Профиль')} · ${e(p?.server||'')} · Локальный учёт рынка, финансов и результатов семей.</p></div><span class="tag">${snap.rows.length} записей</span></div><nav class="economy-tabs" aria-label="Разделы экономики" role="tablist">${tabButtons}</nav></section>`;
 const overview=`<section class="card stack"><div class="row spread"><h3>Финансовая сводка</h3><button type="button" class="button secondary" data-economy-action="refresh">Обновить</button></div>${statGrid(snap.stats,snap.matches)}${quickActions()}<p class="subtle">Результат учитывает закрытые сделки и денежные операции. Открытые сделки выделены как вложенный капитал.</p></section><div class="economy-workspace-columns"><section class="card stack"><h3>Накопленный финансовый результат</h3>${chart(snap.stats.days)}<button class="button secondary" data-economy-action="tab" data-tab="finance">К финансам</button></section><section class="card stack"><h3>Активность игроков и семей</h3>${bars(snap.players)}<p class="subtle">${snap.families.length} семей / групп, ${snap.matches.length} матчей</p><button class="button secondary" data-economy-action="tab" data-tab="groups">К статистике</button></section></div><section class="card stack"><h3>Поиск по всем операциям профиля</h3><label class="field">Название, игрок, семья, категория, дата, примечание<input id="economy-global-search" type="search" maxlength="160" autocomplete="off" value="${e(lookups.get(state.activeProfileId)||'')}" placeholder="Найти сделку, игрока, семейную группу…"></label><div id="economy-global-results">${lookupHTML(state)}</div></section>${recentSection(state)}`;
 const content=tab==='overview'?overview:tab==='market'?`<section class="card stack"><h3>Торговля и рыночные сделки</h3>${statGrid(snap.stats,snap.matches)}${quickActions()}<p class="subtle">Реальные сохранённые покупки и продажи; рыночные котировки без источника не генерируются.</p></section>${marketplaceSection(state)}${journalSection(state,tab)}`:tab==='inventory'?tradingSection(state):tab==='finance'?financeSection(state)+`<section class="card stack"><h3>Старый журнал доходов / расходов (без повторного учёта в кассах)</h3>${quickActions()}</section>${journalSection(state,tab)}`:tab==='groups'?familiesSection(state,entries)+groupsSection(snap)+quickActions()+journalSection(state,tab):tab==='organizations'?organizationSection(state):tab==='territories'?crimeSection(state):tab==='calculators'?calcSection():`<section class="card stack"><h3>Все записи активного профиля</h3>${quickActions()}</section>${journalSection(state,tab)}`;
 return `<div class="stack economy-workspace">${header}<div id="economy-tab-panel" role="tabpanel" aria-label="${e(ECONOMY_TAB_LABELS[tab])}" class="stack">${content}</div><dialog id="economy-dialog" aria-label="Запись экономики"><form id="economy-form" class="stack"><input type="hidden" name="recordId"><input type="hidden" name="recordType"><h3 id="economy-dialog-title">Новая запись</h3><div id="economy-fields" class="economy-fields"></div><div class="row spread"><button class="button secondary" type="button" data-economy-action="cancel">Отмена</button><button class="button primary" type="submit">Сохранить</button></div></form></dialog></div>`;
}
function download(filename,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function openEditor(type,item=null){const dialog=document.getElementById('economy-dialog');if(!dialog)throw Error('Откройте раздел экономики');
  const form=dialog.querySelector('form');form.reset();form.elements.namedItem('recordId').value=item?.id||'';form.elements.namedItem('recordType').value=type;
  dialog.querySelector('#economy-dialog-title').textContent=(item?'Изменить: ':'Добавить: ')+formTypes[type];
  replaceHtml(dialog.querySelector('#economy-fields'), formFields(type,item||{}));dialog.showModal();}
export async function handleEconomyAction(button,state,render,feedback){const action=button.dataset.economyAction;
  if(action==='tab'){await changeEconomyTab(state,button.dataset.tab);if(button.dataset.tab==='inventory')await refreshTrading(state.activeProfileId);if(button.dataset.tab==='organizations')await refreshOrganizations(state.activeProfileId);if(button.dataset.tab==='territories')await refreshCrime();if(button.dataset.tab==='finance')await refreshFinance(state.activeProfileId);render();return;}
  if(action==='refresh'){await refreshEconomy();render();feedback('Данные экономики обновлены');return;}
  if(action==='family'){await persist(previous=>setEconomyPref(previous,state.activeProfileId,'queries',button.dataset.family||'',profiles(state)));await changeEconomyTab(state,'groups');visible=40;render();document.getElementById('economy-search')?.focus();return;}
  if(action==='new'){openEditor(button.dataset.type);return;}
  if(action==='cancel'){document.getElementById('economy-dialog')?.close();return;}
  if(action==='more'){visible+=40;render();return;}
  if(action==='edit'){const item=await getEconomy(button.dataset.id);if(item.profileId!==state.activeProfileId)throw Error('Запись другого профиля');try{await rememberEconomyOpen(state,item.id);}catch(error){console.warn('Economy: не удалось сохранить историю открытий',error);}openEditor(item.type,item);return;}
  if(action==='remove'){const item=await getEconomy(button.dataset.id);if(item.profileId!==state.activeProfileId)throw Error('Запись другого профиля');if(!confirm('Удалить выбранную запись? Восстановление возможно только из резервной копии.'))return;
    await removeEconomy(item.id);await refreshEconomy();render();feedback('Запись удалена');return;}
  if(action==='csv'){const type=button.dataset.type;const records=entries.filter(r=>r.profileId===state.activeProfileId);download(`rp-nexus-${type}-${new Date().toISOString().slice(0,10)}.csv`,toCsv(records,type),'text/csv;charset=utf-8');feedback('CSV выгружен');}
}
export async function handleEconomySubmit(event,state,render,feedback){const form=event.target;
  const values=Object.fromEntries(new FormData(form).entries());
  if(form.getAttribute('id')==='economy-form'){
    const id=values.recordId,type=values.recordType;delete values.recordId;delete values.recordType;
    let saved;
    if(id){const original=await getEconomy(id);if(original.profileId!==state.activeProfileId || original.type!==type)throw Error('Профиль или тип записи изменился');saved=await updateEconomy(id,values);}
    else saved=await addEconomy(type,state.activeProfileId,values);
    try{await rememberEconomyOpen(state,saved.id);}catch(error){console.warn('Economy: запись сохранена, история открытий недоступна',error);}
    form.closest('dialog').close();await refreshEconomy();render();feedback(id?'Запись обновлена':'Запись добавлена');return;
  }
  if(form.dataset.economyCalc){let result,lines;
    if(form.dataset.economyCalc==='resale'){result=resaleCalc(values);lines=[`Вложено: ${money(result.invested)}`,`Выручка: ${money(result.revenue)}`,`Чистая прибыль: ${money(result.profit)}`,`ROI: ${result.roi===null?'—':number(result.roi)+'%'}`];}
    else if(form.dataset.economyCalc==='craft'){result=craftCalc(values);lines=[`Ожидаемое число попыток: ${number(result.attempts)}`,`Ожидаемые затраты: ${money(result.spent)}`,`Порог окупаемости за 1 шт.: ${money(result.breakEven)}`,`Ожидаемая прибыль: ${money(result.profit)}`];}
    else {result=workCalc(values);lines=[`Выручка: ${money(result.revenue)}`,`Расходы: ${money(result.spent)}`,`Чистая прибыль: ${money(result.profit)}`,`Прибыль в час: ${money(result.perHour)}`];}
    form.querySelector('output').textContent=lines.join('\n');return;
  }
}
export async function setEconomyFilter(value,state){await persist(previous=>setEconomyPref(previous,state.activeProfileId,'filters',value,profiles(state)));visible=40;}
export async function setEconomySearch(value,state){await persist(previous=>setEconomyPref(previous,state.activeProfileId,'queries',value,profiles(state)));visible=40;}
