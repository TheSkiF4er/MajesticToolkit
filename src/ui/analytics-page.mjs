/** Interactive financial and marketplace analytics over real persisted local records. */
import {api} from '../lib/browser.mjs';
import {listEconomy} from '../lib/economy-store.mjs';
import {listMarketplace} from '../lib/marketplace-store.mjs';
import {loadInventory} from '../lib/inventory-store.mjs';
import {loadFinance} from '../lib/finance-store.mjs';
import {listFamilies} from '../lib/family-store.mjs';
import {listOrganizations} from '../lib/organization-store.mjs';
import {analyzeEconomy,analyticsCsv} from '../lib/advanced-economy-analytics.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';

const KEY='mtEconomyAnalyticsV218';
const saved=new Map(),cache=new Map();
const fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
const money=n=>`${fmt(n)} $`;
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const fromDays=(end,n)=>new Date(Date.parse(end+'T00:00:00Z')-(n-1)*86400000).toISOString().slice(0,10);
const defaults=()=>{const to=today();return {from:fromDays(to,90),to,owner:'all',productId:'all'};};
const allowedKey=new Set(['from','to','owner','productId']);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function cleanPrefs(p,ids){const valid=new Set(ids);return Object.fromEntries(Object.entries(p&&typeof p==='object'&&!Array.isArray(p)?p:{}).filter(([id])=>valid.has(id)).map(([id,r])=>{const row={...defaults(),...Object.fromEntries(Object.entries(r&&typeof r==='object'&&!Array.isArray(r)?r:{}).filter(([key,v])=>allowedKey.has(key)&&typeof v==='string'&&v.length<=128))};if(!validDate(row.from)||!validDate(row.to)||row.from>row.to){row.from=defaults().from;row.to=defaults().to;}if(!/^(all|personal|(family|organization):[\w-]{8,120})$/.test(row.owner))row.owner='all';if(row.productId!=='all'&&!/^[\w-]{8,120}$/.test(row.productId))row.productId='all';return [id,row];}));}
export async function loadAnalyticsPreferences(ids){const stored=(await api.storage.local.get(KEY))[KEY];saved.clear();for(const [key,value] of Object.entries(cleanPrefs(stored,ids)))saved.set(key,value);cache.clear();}
export async function forgetAnalyticsProfiles(ids){const clean=cleanPrefs(Object.fromEntries(saved),ids);saved.clear();for(const [key,value] of Object.entries(clean))saved.set(key,value);for(const id of cache.keys())if(!ids.includes(id))cache.delete(id);await api.storage.local.set({[KEY]:clean});}
const filters=pid=>saved.get(pid)??defaults();
export async function setAnalyticsFilter(pid,key,value){
 if(!allowedKey.has(key)||typeof value!=='string'||value.length>128)throw Error('Недопустимый фильтр аналитики');
 const next={...filters(pid),[key]:value};const old=saved.get(pid);
 saved.set(pid,next);try{await api.storage.local.set({[KEY]:Object.fromEntries(saved)});}catch(error){if(old)saved.set(pid,old);else saved.delete(pid);throw error;}
}
export async function refreshAnalytics(pid){
 // Storage loaders validate each journal and references. Do not silently skip corrupt records.
 const [legacy,market,inventory,finance,families,organizations]=await Promise.all([listEconomy(),listMarketplace(pid),loadInventory(pid),loadFinance(pid),listFamilies(pid),listOrganizations(pid)]);
 const data={legacy,market,inventory,finance,families,organizations};cache.set(pid,data);const f=filters(pid);if(f.productId!=='all'&&!market.some(p=>p.type==='product'&&p.id===f.productId))await setAnalyticsFilter(pid,'productId','all');if(!['all','personal'].includes(f.owner)&&![...families.map(x=>'family:'+x.id),...organizations.map(x=>'organization:'+x.id)].includes(f.owner))await setAnalyticsFilter(pid,'owner','all');return data;
}
function run(pid){const data=cache.get(pid);if(!data)return null;const p=filters(pid);return analyzeEconomy({...data,profileId:pid,...p});}
const choose=(id,label,options,value)=>`<label class="field">${e(label)}<select id="${e(id)}" data-analytics-filter="${e(id.replace('analytics-',''))}">${options.map(([key,name])=>`<option value="${e(key)}" ${key===value?'selected':''}>${e(name)}</option>`).join('')}</select></label>`;
const num=(value,suffix='')=>value===null?'—':fmt(value)+suffix;
function svgChart(rows,key,label){
 if(!rows.length)return `<p class="subtle">Для этого показателя пока нет данных за выбранный период.</p>`;
 const points=rows.slice(-180),values=points.map(x=>x[key]),low=Math.min(0,...values),high=Math.max(0,...values),w=700,h=196,l=65,r=18,t=18,b=38,range=Math.max(1,high-low);
 const xy=points.map((p,i)=>[l+(points.length===1?(w-l-r)/2:(w-l-r)*i/(points.length-1)),t+(high-p[key])*(h-t-b)/range]);
 const polyline=xy.map(([x,y])=>x.toFixed(1)+','+y.toFixed(1)).join(' '),baseline=t+high*(h-t-b)/range;
 return `<svg class="economy-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${e(label)}: ${e(num(values.at(-1)))}"><line x1="${l}" y1="${baseline.toFixed(2)}" x2="${w-r}" y2="${baseline.toFixed(2)}" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="5 5"/><polyline points="${polyline}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>${xy.map(([x,y],i)=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="var(--accent)"><title>${e(points[i].date+' · '+money(values[i]))}</title></circle>`).join('')}<text x="5" y="${t+11}" fill="currentColor" font-size="11">${e(fmt(high))}</text><text x="5" y="${h-b}" fill="currentColor" font-size="11">${e(fmt(low))}</text><text x="${l}" y="${h-10}" fill="currentColor" font-size="11">${e(points[0].date)}</text><text x="${w-r}" y="${h-10}" text-anchor="end" fill="currentColor" font-size="11">${e(points.at(-1).date)}</text></svg>`;
}
const cards=rows=>`<div class="economy-stats">${rows.map(([title,value,foot])=>`<div><small>${e(title)}</small><strong>${e(value)}</strong>${foot?`<small>${e(foot)}</small>`:''}</div>`).join('')}</div>`;
const table=(heads,body,empty='Нет данных за выбранный период')=>`<div class="market-table-scroll"><table class="economy-table"><thead><tr>${heads.map(h=>`<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${body||`<tr><td colspan="${heads.length}" class="subtle">${e(empty)}</td></tr>`}</tbody></table></div>`;
const comparison=change=>change.percent===null?`Δ ${money(change.absolute)} · нет базы сравнения`:`Δ ${money(change.absolute)} (${num(change.percent,'%')})`;
export function analyticsSection(state){
 const pid=state.activeProfileId,p=filters(pid),data=cache.get(pid),report=data?run(pid):null;
 if(!report)return '<section class="card stack"><h3>Advanced Economy Analytics · 2.1.8</h3><p class="subtle">Данные аналитики ещё не загружены. Перейдите во вкладку повторно или нажмите «Обновить».</p><button class="button secondary" data-analytics-action="refresh">Загрузить аналитику</button></section>';
 const ownerOptions=[['all','Все счета'],['personal','Личные счета'],...data.families.map(f=>['family:'+f.id,'Семья: '+f.name]),...data.organizations.map(o=>['organization:'+o.id,'Организация: '+o.name])];
 const productOptions=[['all','Все товары'],...data.market.filter(x=>x.type==='product').map(x=>[x.id,x.name+(x.variant?' · '+x.variant:'')])];
 const finance=report.finance,inv=report.inventory,old=report.legacy,market=report.market;
 const financeRows=finance.accounts.map(a=>`<tr><td>${e(a.name)}</td><td>${e(a.ownerType==='personal'?'Личный':a.ownerType)}</td><td>${e(money(a.flow.income))}</td><td>${e(money(a.flow.expense))}</td><td>${e(money(a.balance))}</td></tr>`).join('');
 const categories=finance.categories.slice(0,30).map(r=>`<tr><td>${e(r.name)}</td><td>${e(money(r.value))}</td></tr>`).join('');
 const budgetRows=finance.budgets.map(b=>`<tr><td>${e(b.month)}</td><td>${e(finance.accounts.find(a=>a.id===b.accountId)?.name||b.accountId)}</td><td>${e(b.category)}</td><td>${e(money(b.limit))}</td><td>${e(money(b.used))}</td><td>${b.overLimit?'<strong>Превышен</strong>':e(money(b.remaining))}</td></tr>`).join('');
 const productRows=market.products.filter(x=>x.observations||x.bestAsk!==null||x.bestBid!==null).sort((a,b)=>b.observations-a.observations||a.name.localeCompare(b.name,'ru')).slice(0,100).map(x=>`<tr><td>${e(x.name)}${x.variant?' · '+e(x.variant):''}</td><td>${x.observations} / ${x.completed}</td><td>${e(x.basis)}</td><td>${e(x.median===null?'—':money(x.median))}</td><td>${e(x.change===null?'—':num(x.change,'%'))}</td><td>${e(x.bestBid===null?'—':money(x.bestBid))} / ${e(x.bestAsk===null?'—':money(x.bestAsk))}</td></tr>`).join('');
 const invNames=new Map(data.market.filter(x=>x.type==='product').map(x=>[x.id,x.name]));
 const invRows=inv.byProduct.slice(0,100).map(x=>`<tr><td>${e(invNames.get(x.productId)||x.productId)}</td><td>${e(fmt(x.quantity))}</td><td>${e(money(x.sales))}</td><td>${e(money(x.cogs))}</td><td>${e(money(x.writeoffs))}</td><td>${e(money(x.profit))}</td></tr>`).join('');
 const selected=market.products.find(x=>x.id===p.productId)||market.products.find(x=>x.series.length)||null;
 return `<section class="card stack" id="economy-analytics"><div class="row spread"><div><h3>Advanced Economy Analytics · 2.1.8</h3><p class="subtle">Локальные журналы. Без внешних котировок, автопроводок и двойного суммирования.</p></div><div class="row"><button type="button" class="button secondary" data-analytics-action="refresh">Обновить</button><button type="button" class="button secondary" data-analytics-action="csv">Экспорт CSV</button></div></div>
 <div class="economy-filter"> <label class="field">С<input type="date" id="analytics-from" data-analytics-filter="from" value="${e(p.from)}"></label><label class="field">По<input type="date" id="analytics-to" data-analytics-filter="to" value="${e(p.to)}"></label>${choose('analytics-owner','Владелец кассы',ownerOptions,p.owner)}${choose('analytics-productId','Товар (рынок / склад)',productOptions,p.productId)}</div><p class="subtle">Сравнение с предыдущими ${report.period.days} календарными днями (${e(finance.previous.from)} — ${e(finance.previous.to)}). Финансовый владелец фильтрует только счета; складские владельцы пока хранятся по названию.</p>
 <h4>Кассы и счета — денежные потоки</h4>${cards([['Поступления',money(finance.income),comparison(finance.comparison.income)],['Расходы',money(finance.expense),comparison(finance.comparison.expense)],['Чистый поток',money(finance.net),comparison(finance.comparison.net)],['Текущий остаток',money(finance.balance),'Остаток на сегодня, не на дату отчёта'],['Переводы',money(finance.transfers.volume),'Перемещения, не доход/расход']])}
 ${svgChart(finance.daily,'net','Дневной денежный поток')}<h4>Счета</h4>${table(['Счёт','Тип владельца','Приход','Расход','Текущий остаток'],financeRows,'В выбранной категории владельцев нет счетов')}
 <div class="economy-workspace-columns"><section class="stack"><h4>Категории поступлений и расходов</h4>${table(['Категория','Сумма'],categories)}</section><section class="stack"><h4>Месячные бюджеты</h4>${table(['Месяц','Счёт','Категория','Лимит','Израсходовано','Остаток'],budgetRows)}</section></div>
 <h4>Склад: реализованный результат</h4>${cards([['Выручка после комиссии',money(inv.sales)],['Себестоимость проданного',money(inv.cogs)],['Стоимость списаний',money(inv.writeoffs)],['Результат с потерями',money(inv.profit),comparison(inv.comparison)],['Текущий остаток',fmt(inv.units)+' шт.'],['Себестоимость остатков',money(inv.value),'Текущая, без повторов при передаче']])}
 ${svgChart(inv.daily,'profit','Результат продаж и списаний за день')}${table(['Товар','Продано, шт.','Выручка','Себестоимость','Списания','Результат'],invRows)}
 <h4>Рынок: наблюдения и объявления</h4>${cards([['Ценовых наблюдений',fmt(market.observations)],['Активных сейчас (с учётом дат)',fmt(market.active)],['Товаров в каталоге',fmt(market.products.length)]])}
 ${table(['Товар','Наблюдений / сделок','Основа медианы','Медиана','Изменение первой/последней цены','Лучший спрос / предложение'],productRows)}
 ${selected?`<h4>История цен: ${e(selected.name)}</h4><p class="subtle">${e(selected.basis)}; дневная медиана по записям, не объёмно-взвешенная биржевая котировка.</p>${svgChart(selected.series,'value','Дневная медиана цены товара')}`:''}
 <h4>Исторический журнал (отдельный учёт)</h4>${cards([['Поступления и закрытые сделки',money(old.revenue)],['Расходы и себестоимость сделок',money(old.cost)],['Результат',money(old.net),comparison(old.comparison)],['Открытые сделки: вложено',money(old.openCapital)]])}
 <p class="subtle">Итоги по старым сделкам, складскому P&amp;L и финансовым счетам независимы. Они могут описывать одни и те же события; объединённая прибыль не рассчитывается. Цены основаны на пользовательских наблюдениях.</p></section>`;
}
export async function handleAnalyticsAction(button,state,render,feedback){
 const pid=state.activeProfileId,action=button.dataset.analyticsAction;
 if(action==='refresh'){await refreshAnalytics(pid);render();feedback('Аналитика пересчитана по сохранённым данным');return;}
 if(action==='csv'){
  if(!cache.has(pid))await refreshAnalytics(pid);
  const report=run(pid),blob=new Blob([analyticsCsv(report)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`economy-analytics-${report.period.from}-${report.period.to}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);feedback('Отчёт сохранён в CSV');return;
 }
 throw Error('Неизвестное действие аналитики');
}
export async function handleAnalyticsFilter(el,state,render){const pid=state.activeProfileId,key=el.dataset.analyticsFilter,value=el.value,p={...filters(pid),[key]:value};if(!validDate(p.from)||!validDate(p.to)||p.from>p.to)throw Error('Начальная дата должна быть не позднее конечной');const data=cache.get(pid);if(data)analyzeEconomy({...data,profileId:pid,...p});await setAnalyticsFilter(pid,key,value);render();}
