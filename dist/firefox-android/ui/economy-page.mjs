import { listEconomy, addEconomy, updateEconomy, removeEconomy, getEconomy } from '../lib/economy-store.mjs';
import { resaleCalc, craftCalc, workCalc, dealTotals, summarizeEconomy, summarizeMatches, formatCurrency, DEAL_CATEGORIES, toCsv } from '../lib/economy-core.mjs';
import { escapeHtml as e } from '../lib/sites.mjs';
let entries=[];
let selectedType='all', search='', visible=40;
export async function refreshEconomy(){entries=await listEconomy();}
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
export function economySection(state){
  const rows=entries.filter(r=>r.profileId===state.activeProfileId);
  const stats=summarizeEconomy(rows),matchRows=rows.filter(r=>r.type==='match'),players=summarizeMatches(matchRows),families=summarizeMatches(matchRows,'family');
  const filtered=rows.filter(r=>(selectedType==='all'||r.type===selectedType)&&(!search||[r.title,r.player,r.family,r.opponent,r.note,r.category].some(s=>String(s||'').toLocaleLowerCase('ru').includes(search))));
  return `<div class="stack"><section class="card"><div class="row spread"><div><h3>Учёт и аналитика</h3><p class="subtle">Все данные принадлежат активному профилю. Статистика вводится вручную, без подключения к игровому API.</p></div><span class="tag">${rows.length} записей</span></div>${statGrid(stats,matchRows)}<div class="row"><button class="button primary" data-economy-action="new" data-type="deal">+ Сделка</button><button class="button secondary" data-economy-action="new" data-type="cash">+ Доход / расход</button><button class="button secondary" data-economy-action="new" data-type="match">+ Результат игрока</button></div></section>
  <section class="card stack"><h3>Финансовая динамика</h3><p class="subtle">Накопленная прибыль/убыток по завершённым сделкам и денежным операциям (открытые сделки учитываются как вложенный капитал)</p>${chart(stats.days)}</section>
  <section class="card stack"><h3>Игроки и семьи</h3><div class="economy-analysis"><div><h4>Урон по игрокам</h4>${bars(players)}${players.length?`<div class="table-scroll"><table class="economy-table"><thead><tr><th>Игрок</th><th>Матчи</th><th>Победы</th><th>Winrate</th><th>K/D</th><th>Ср. урон</th></tr></thead><tbody>${players.map(p=>`<tr><td>${e(p.name)}</td><td>${p.matches}</td><td>${p.wins}</td><td>${e(number(p.winRate))}%</td><td>${e(number(p.kd))}</td><td>${e(number(p.avgDamage))}</td></tr>`).join('')}</tbody></table></div>`:''}</div><div><h4>Рейтинг семей</h4>${families.length?`<div class="table-scroll"><table class="economy-table"><thead><tr><th>Семья</th><th>Матчи</th><th>Победы</th><th>Winrate</th><th>Урон</th></tr></thead><tbody>${families.map(p=>`<tr><td>${e(p.name)}</td><td>${p.matches}</td><td>${p.wins}</td><td>${e(number(p.winRate))}%</td><td>${e(number(p.damage))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="subtle">Данные появятся после записи результатов.</p>'}</div></div></section>
  ${calcSection()}
  <section class="card stack"><div class="row spread"><h3>Журнал операций и матчей</h3><div class="row"><button class="button secondary" data-economy-action="csv" data-type="deal">CSV сделок</button><button class="button secondary" data-economy-action="csv" data-type="cash">CSV операций</button><button class="button secondary" data-economy-action="csv" data-type="match">CSV матчей</button></div></div><div class="economy-filter"><label class="field">Тип<select id="economy-filter"><option value="all" ${selectedType==='all'?'selected':''}>Все</option>${Object.entries(formTypes).map(([k,v])=>`<option value="${k}" ${selectedType===k?'selected':''}>${e(v)}</option>`).join('')}</select></label><label class="field">Поиск<input id="economy-search" type="search" value="${e(search)}" placeholder="Название, игрок, семья"></label></div>${listing(filtered)}</section>
  <dialog id="economy-dialog" aria-label="Запись экономики"><form id="economy-form" class="stack"><input type="hidden" name="recordId"><input type="hidden" name="recordType"><h3 id="economy-dialog-title">Новая запись</h3><div id="economy-fields" class="economy-fields"></div><div class="row spread"><button class="button secondary" type="button" data-economy-action="cancel">Отмена</button><button class="button primary" type="submit">Сохранить</button></div></form></dialog></div>`;
}
function download(filename,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function openEditor(type,item=null){const dialog=document.getElementById('economy-dialog');if(!dialog)throw Error('Откройте раздел экономики');
  const form=dialog.querySelector('form');form.reset();form.elements.namedItem('recordId').value=item?.id||'';form.elements.namedItem('recordType').value=type;
  dialog.querySelector('#economy-dialog-title').textContent=(item?'Изменить: ':'Добавить: ')+formTypes[type];
  dialog.querySelector('#economy-fields').innerHTML=formFields(type,item||{});dialog.showModal();}
export async function handleEconomyAction(button,state,render,feedback){const action=button.dataset.economyAction;
  if(action==='new'){openEditor(button.dataset.type);return;}
  if(action==='cancel'){document.getElementById('economy-dialog')?.close();return;}
  if(action==='more'){visible+=40;render();return;}
  if(action==='edit'){const item=await getEconomy(button.dataset.id);if(item.profileId!==state.activeProfileId)throw Error('Запись другого профиля');openEditor(item.type,item);return;}
  if(action==='remove'){const item=await getEconomy(button.dataset.id);if(item.profileId!==state.activeProfileId)throw Error('Запись другого профиля');if(!confirm('Удалить выбранную запись? Восстановление возможно только из резервной копии.'))return;
    await removeEconomy(item.id);await refreshEconomy();render();feedback('Запись удалена');return;}
  if(action==='csv'){const type=button.dataset.type;const records=entries.filter(r=>r.profileId===state.activeProfileId);download(`rp-nexus-${type}-${new Date().toISOString().slice(0,10)}.csv`,toCsv(records,type),'text/csv;charset=utf-8');feedback('CSV выгружен');}
}
export async function handleEconomySubmit(event,state,render,feedback){const form=event.target;
  const values=Object.fromEntries(new FormData(form).entries());
  if(form.id==='economy-form'){
    const id=values.recordId,type=values.recordType;delete values.recordId;delete values.recordType;
    if(id){const original=await getEconomy(id);if(original.profileId!==state.activeProfileId || original.type!==type)throw Error('Профиль или тип записи изменился');await updateEconomy(id,values);}
    else await addEconomy(type,state.activeProfileId,values);
    form.closest('dialog').close();await refreshEconomy();render();feedback(id?'Запись обновлена':'Запись добавлена');return;
  }
  if(form.dataset.economyCalc){let result,lines;
    if(form.dataset.economyCalc==='resale'){result=resaleCalc(values);lines=[`Вложено: ${money(result.invested)}`,`Выручка: ${money(result.revenue)}`,`Чистая прибыль: ${money(result.profit)}`,`ROI: ${result.roi===null?'—':number(result.roi)+'%'}`];}
    else if(form.dataset.economyCalc==='craft'){result=craftCalc(values);lines=[`Ожидаемое число попыток: ${number(result.attempts)}`,`Ожидаемые затраты: ${money(result.spent)}`,`Порог окупаемости за 1 шт.: ${money(result.breakEven)}`,`Ожидаемая прибыль: ${money(result.profit)}`];}
    else {result=workCalc(values);lines=[`Выручка: ${money(result.revenue)}`,`Расходы: ${money(result.spent)}`,`Чистая прибыль: ${money(result.profit)}`,`Прибыль в час: ${money(result.perHour)}`];}
    form.querySelector('output').textContent=lines.join('\n');return;
  }
}
export function setEconomyFilter(value){selectedType=value;visible=40;}
export function setEconomySearch(value){search=value.toLocaleLowerCase('ru').trim();visible=40;}
