/** Trading & Inventory 2.1.3: real warehouse journal UI over inventory-store. */
import '../lib/safe-dom.js';
import {escapeHtml as escape} from '../lib/sites.mjs';
import {formatCurrency} from '../lib/economy-core.mjs';
import {listMarketplace} from '../lib/marketplace-store.mjs';
import {loadInventory,inventoryAction} from '../lib/inventory-store.mjs';
import {inventoryCsv} from '../lib/inventory-core.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
let snapshot=null,products=[],activeProfile='',query='';
const e=escape,m=formatCurrency;
const today=()=>{const x=new Date();return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');};
const kindLabels={purchase:'Закупка',sale:'Продажа',transfer:'Передача',reserve:'Резерв',release:'Снятие резерва',writeoff:'Списание',void:'Отмена записи'};
const ownerLabels={personal:'Личное',family:'Семья',organization:'Организация'};
function field(name,title,value='',type='text',extra=''){return `<label class="field">${e(title)}<input type="${type}" name="${e(name)}" value="${e(String(value))}" ${extra}></label>`;}
function choose(name,title,values,value=''){return `<label class="field">${e(title)}<select name="${e(name)}">${values.map(([id,label])=>`<option value="${e(id)}" ${value===id?'selected':''}>${e(label)}</option>`).join('')}</select></label>`;}
const ownerOptions=Object.entries(ownerLabels);
const clip=(v,n=16)=>v.length>n?v.slice(0,n)+'…':v;
function costLabel(item){return `${m(item.unitCost)} × ${item.quantity}`;}
export async function refreshTrading(profileId){activeProfile=profileId;[products,snapshot]=await Promise.all([listMarketplace(profileId),loadInventory(profileId)]);}
export function tradingSection(state){const pid=state.activeProfileId;
 if(pid!==activeProfile||!snapshot)return '<section class="card"><p>Загрузка склада…</p></section>';
 const names=new Map(products.filter(p=>p.type==='product').map(p=>[p.id,`${p.name}${p.variant?' · '+p.variant:''}`]));
 const display=String(query).trim().toLocaleLowerCase('ru');
 const stock=snapshot.stock.filter(r=>!display||[names.get(r.productId),r.assetTag,r.ownerName,r.lotId,r.ownerType].some(v=>String(v??'').toLocaleLowerCase('ru').includes(display)));
 const t=snapshot.totals;
 const counts=`<div class="economy-stats"><div><small>На складе</small><strong>${t.stockUnits} шт.</strong></div><div><small>Зарезервировано</small><strong>${t.reservedUnits} шт.</strong></div><div><small>Себестоимость остатков</small><strong>${e(m(t.stockValue))}</strong></div><div><small>Реализованная прибыль</small><strong>${e(m(t.tradingProfit))}</strong></div><div><small>Списания</small><strong>${e(m(t.writeoffCost))}</strong></div><div><small>Результат с потерями</small><strong>${e(m(t.realizedProfit))}</strong></div></div>`;
 const cells=stock.length?stock.slice(0,200).map(r=>`<tr><td>${e(names.get(r.productId)||r.productId)}${r.assetTag?`<p class="subtle">Имущество № ${e(r.assetTag)}</p>`:''}<small>${e(clip(r.lotId))}</small></td><td>${e(ownerLabels[r.ownerType])}${r.ownerName?` · ${e(r.ownerName)}`:''}</td><td>${r.quantity} / ${r.available} / ${r.reserved}</td><td>${e(costLabel(r))}</td><td><div class="row inventory-actions">${r.available?`<button class="button secondary" data-trading-action="new" data-kind="sale" data-lot="${e(r.lotId)}" data-owner="${e(r.ownerType)}" data-owner-name="${e(r.ownerName)}">Продать</button><button class="button secondary" data-trading-action="new" data-kind="transfer" data-lot="${e(r.lotId)}" data-owner="${e(r.ownerType)}" data-owner-name="${e(r.ownerName)}">Передать</button><button class="button secondary" data-trading-action="new" data-kind="reserve" data-lot="${e(r.lotId)}" data-owner="${e(r.ownerType)}" data-owner-name="${e(r.ownerName)}">Резерв</button><button class="button secondary" data-trading-action="new" data-kind="writeoff" data-lot="${e(r.lotId)}" data-owner="${e(r.ownerType)}" data-owner-name="${e(r.ownerName)}">Списать</button>`:''}${r.reserved?`<button class="button secondary" data-trading-action="new" data-kind="release" data-lot="${e(r.lotId)}" data-owner="${e(r.ownerType)}" data-owner-name="${e(r.ownerName)}">Снять резерв</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="5" class="subtle">Остатки не найдены. Добавьте закупку из каталога.</td></tr>';
 const latest=snapshot.events.slice(-100).reverse();
 const movementById=new Map(snapshot.movements.map(x=>[x.id,x]));
 const rows=latest.map(r=>{const movement=movementById.get(r.id),cancel=snapshot.voided.has(r.id),isVoided=r.kind==='void';
  const canUndo=!cancel&&!isVoided&&!snapshot.events.some(x=>x.kind!=='void'&&x.lotId===r.lotId&&snapshot.events.indexOf(x)>snapshot.events.indexOf(r)&&!snapshot.voided.has(x.id));
  return `<tr><td>${e(r.date)}</td><td>${e(kindLabels[r.kind])}${cancel?' (отменено)':''}</td><td>${e(names.get(r.productId)||r.reversesId||'—')}</td><td>${r.quantity??'—'}</td><td>${movement?.profit===undefined?'—':e(m(movement.profit))}</td><td>${e(r.note||'')}${canUndo?`<button class="button secondary" data-trading-action="void" data-id="${e(r.id)}">Отменить</button>`:''}</td></tr>`;}).join('');
 return `<section class="card stack"><div class="row spread"><div><h3>Trading & Inventory</h3><p class="subtle">Учёт партий, резерва, собственности и реализованной прибыли. Отдельный от старых сделок и денежного журнала.</p></div><div class="row"><button class="button primary" data-trading-action="new" data-kind="purchase">Закупка / имущество</button><button class="button secondary" data-trading-action="csv">CSV движений</button></div></div>${counts}<label class="field">Поиск по товару, владельцу, номеру имущества или партии<input id="trading-search" type="search" maxlength="160" value="${e(query)}" placeholder="Товар, семья, организация, инвентарный №"></label><h4>Складские остатки (всего / доступно / резерв)</h4><div class="market-table-scroll"><table class="economy-table"><thead><tr><th>Товар / партия</th><th>Владелец</th><th>Количество</th><th>Цена закупки</th><th>Операции</th></tr></thead><tbody>${cells}</tbody></table></div>${stock.length>200?'<p class="subtle">Показаны первые 200 позиций; уточните поиск.</p>':''}<h4>Журнал операций (последние 100)</h4><div class="market-table-scroll"><table class="economy-table"><thead><tr><th>Дата</th><th>Операция</th><th>Товар</th><th>Количество</th><th>Результат</th><th>Описание / отмена</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Операций пока нет.</td></tr>'}</tbody></table></div><p class="subtle">Себестоимость учитывает закупочную комиссию пропорционально реализованным единицам. Передачи владельца не создают выручку; списания учитываются отдельным убытком. Изменить историю можно только отменой последней операции партии.</p></section><dialog id="trading-dialog" aria-label="Движение склада"><form id="trading-form" class="stack"><input type="hidden" name="kind"><input type="hidden" name="lotId"><input type="hidden" name="productId"><input type="hidden" name="ownerType"><input type="hidden" name="ownerName"><h3 id="trading-title">Складская операция</h3><div id="trading-fields" class="economy-fields"></div><div class="row spread"><button class="button secondary" type="button" data-trading-action="cancel">Отмена</button><button class="button primary" type="submit">Сохранить операцию</button></div></form></dialog>`;
}
export function setTradingSearch(value){query=String(value).slice(0,160);}
function editor(kind,stock=null){
 const dlg=document.getElementById('trading-dialog');if(!dlg)throw Error('Откройте вкладку «Склад и имущество»');
 const form=dlg.querySelector('form');form.reset();for(const key of ['kind','lotId','productId','ownerType','ownerName'])form.elements.namedItem(key).value=key==='kind'?kind:key==='lotId'?stock?.lotId??'':key==='productId'?stock?.productId??'':key==='ownerType'?stock?.ownerType??'personal':stock?.ownerName??'';
 dlg.querySelector('#trading-title').textContent=kindLabels[kind];
 let html=field('date','Дата операции',today(),'date','required');
 if(kind==='purchase'){
  const list=products.filter(p=>p.type==='product'&&!p.archived);
  if(!list.length)throw Error('Сначала создайте активный товар в каталоге рынка');
  html+=choose('chosenProduct','Товар из каталога',list.map(p=>[p.id,`${p.name}${p.variant?' · '+p.variant:''}`]));
  html+=choose('chosenOwnerType','Владелец',ownerOptions,'personal')+field('chosenOwnerName','Название семьи или организации (для личного не требуется)','','text','maxlength="100"');
  html+=field('assetTag','Инвентарный № уникального имущества (необязательно)','','text','maxlength="100"');
 }else html+=`<p class="subtle">Партия ${e(clip(stock.lotId,36))} · ${e(stock.ownerName||ownerLabels[stock.ownerType])} · ${stock.available} доступно, ${stock.reserved} в резерве</p>`;
 html+=field('quantity','Количество',1,'number',`min="1" max="${kind==='release'?stock?.reserved??1000000:kind==='purchase'?1000000:stock?.available??1000000}" step="1" required`);
 if(kind==='purchase'||kind==='sale')html+=field('unitPrice',kind==='purchase'?'Стоимость закупки за 1 шт.':'Цена продажи за 1 шт.',0,'number','min="0" max="1000000000000" step="1" required')+field('fee','Комиссия за операцию',0,'number','min="0" max="1000000000000" step="1" required');
 if(kind==='transfer')html+=choose('toOwnerType','Новый владелец',ownerOptions,'family')+field('toOwnerName','Название нового владельца','','text','maxlength="100"');
 html+=`<label class="field">Основание / примечание<textarea name="note" maxlength="1000" rows="2"></textarea></label>`;
 replaceHtml(dlg.querySelector('#trading-fields'),html);dlg.showModal();
}
export async function handleTradingAction(button,state,render,feedback){const kind=button.dataset.kind,action=button.dataset.tradingAction,pid=state.activeProfileId;
 if(action==='cancel'){document.getElementById('trading-dialog')?.close();return;}
 if(action==='new'){
  if(kind==='purchase'){editor(kind);return;}
  const row=snapshot.stock.find(r=>r.lotId===button.dataset.lot&&r.ownerType===button.dataset.owner&&r.ownerName===button.dataset.ownerName);
  if(!row||pid!==activeProfile)throw Error('Партия не найдена или профиль изменился');editor(kind,row);return;
 }
 if(action==='void'){
  const row=snapshot.events.find(r=>r.id===button.dataset.id);if(!row||pid!==activeProfile)throw Error('Операция не найдена');
  if(!confirm(`Отменить операцию ${kindLabels[row.kind]} от ${row.date}? История сохранится.`))return;
  await inventoryAction(pid,'void',{date:today(),reversesId:row.id,note:'Отмена пользователем'});
  await refreshTrading(pid);render();feedback('Операция отменена, журнал пересчитан');return;
 }
 if(action==='csv'){
  const csv=inventoryCsv(snapshot),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`inventory-${today()}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);feedback('Журнал склада выгружен');
 }
}
export async function handleTradingSubmit(form,state,render,feedback){
 const values=Object.fromEntries(new FormData(form).entries()),pid=state.activeProfileId,kind=values.kind;
 if(pid!==activeProfile)throw Error('Активный профиль изменился: откройте редактор заново');
 if(kind==='purchase'){
  values.productId=values.chosenProduct;values.ownerType=values.chosenOwnerType;values.ownerName=values.chosenOwnerName;
 }else{
  const stock=snapshot.stock.find(r=>r.lotId===values.lotId&&r.ownerType===values.ownerType&&r.ownerName===values.ownerName);
  if(!stock||stock.productId!==values.productId)throw Error('Складской остаток изменился: обновите страницу');
 }
 const result=await inventoryAction(pid,kind,values);
 form.closest('dialog').close();await refreshTrading(pid);render();feedback(`Операция «${kindLabels[kind]}» сохранена · ${result.event.id.slice(0,8)}`);
}
