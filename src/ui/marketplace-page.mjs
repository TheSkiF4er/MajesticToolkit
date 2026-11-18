/** Functional Marketplace & Price Intelligence UI. No automatic or unverified quotes. */
import '../lib/safe-dom.js';
import {listMarketplace,addMarketplace,updateMarketplace,removeMarketplace,getMarketplace} from '../lib/marketplace-store.mjs';
import {DEAL_CATEGORIES,formatCurrency} from '../lib/economy-core.mjs';
import {compareProductPrices,marketStats} from '../lib/marketplace-core.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
let records=[],query='',chosen='',showArchived=false;
const d=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};
const money=n=>formatCurrency(n);
const num=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
const f=(name,label,value='',type='text',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${e(String(value))}" ${extra}></label>`;
const sel=(name,label,options,value)=>`<label class="field">${label}<select name="${name}">${options.map(([v,t])=>`<option value="${e(v)}" ${v===value?'selected':''}>${e(t)}</option>`).join('')}</select></label>`;
const note=(value='')=>`<label class="field">Примечание<textarea name="note" maxlength="1000" rows="2">${e(value)}</textarea></label>`;
const productName=(item,products)=>products.get(item.productId)?.name??'Удалённый товар';
const link=row=>row.url?`<a href="${e(row.url)}" target="_blank" rel="noopener noreferrer">Источник ↗</a>`:'';
function editorFields(type,item={},products=[]){
 if(type==='product')return `${f('name','Название товара',item.name??'','text','maxlength="120" required')}${sel('category','Категория',DEAL_CATEGORIES.map(x=>[x,x]),item.category??'Предметы')}${f('variant','Модель / вариант',item.variant??'','text','maxlength="100"')}${f('unit','Единица измерения',item.unit??'шт.','text','maxlength="30" required')}${note(item.note??'')}${sel('archived','Состояние',[['false','Активен'],['true','В архиве']],String(item.archived??false))}`;
 const fixedProduct=item.productId;
 const productField=fixedProduct?`<p class="subtle">Товар: <strong>${e(products.find(p=>p.id===fixedProduct)?.name??'Не найден')}</strong></p>`:sel('productId','Товар',products.filter(x=>!x.archived).map(p=>[p.id,`${p.name}${p.variant?' · '+p.variant:''}`]),products.find(x=>!x.archived)?.id);
 const price=f('price','Цена за единицу, $',item.price??0,'number','min="0" max="1000000000000" step="1" required');
 const quantity=f('quantity','Количество',item.quantity??1,'number','min="1" max="1000000" step="1" required');
 const source=f('source','Источник (название)',item.source??'Личное наблюдение','text','maxlength="160" required');
 const url=f('url','HTTPS-ссылка (необязательно)',item.url??'','url','maxlength="800" placeholder="https://…"');
 if(type==='price')return `${productField}${f('date','Дата наблюдения',item.date??d(),'date','required')}${sel('kind','Тип цены',[['ask','Предложение продажи'],['bid','Предложение покупки'],['completed','Фактическая сделка']],item.kind??'ask')}${price}${quantity}${source}${url}${note(item.note??'')}`;
 return `${productField}${sel('kind','Тип объявления',[['sell','Продажа'],['buy','Покупка']],item.kind??'sell')}${sel('status','Статус',[['active','Активно'],['closed','Завершено'],['cancelled','Отменено']],item.status??'active')}${f('postedAt','Дата публикации',item.postedAt??d(),'date','required')}${f('expiresAt','Действует до (необязательно)',item.expiresAt??'','date')}${price}${quantity}${f('seller','Контакт / игрок',item.seller??'','text','maxlength="120"')}${source}${url}${note(item.note??'')}`;
}
function priceChart(history){
 if(!history.length)return '<p class="subtle">Добавьте наблюдения цен: график строится только по сохранённым данным.</p>';
 const points=history.slice(-100);const lo=Math.min(...points.map(p=>p.price)),hi=Math.max(...points.map(p=>p.price)),range=Math.max(1,hi-lo),left=60,right=18,top=14,bottom=38,w=700,h=200;
 const coords=points.map((p,i)=>[left+(points.length===1?(w-left-right)/2:(w-left-right)*i/(points.length-1)),top+(hi-p.price)*(h-top-bottom)/range]);
 const labels=`<text x="6" y="${top+12}" font-size="11" fill="currentColor">${e(num(hi))}</text><text x="6" y="${h-bottom}" font-size="11" fill="currentColor">${e(num(lo))}</text><text x="${left}" y="${h-10}" font-size="11" fill="currentColor">${e(points[0].date)}</text><text x="${w-right}" y="${h-10}" text-anchor="end" font-size="11" fill="currentColor">${e(points.at(-1).date)}</text>`;
 return `<svg class="economy-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="История ${points.length} наблюдений цен"><polyline points="${coords.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>${coords.map(([x,y],i)=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--accent)"><title>${e(points[i].date+' · '+money(points[i].price)+' · '+points[i].source)}</title></circle>`).join('')}${labels}</svg>`;
}
export async function refreshMarketplace(){records=await listMarketplace();if(chosen&&!records.some(x=>x.id===chosen&&x.type==='product'))chosen='';}
export function marketRecords(){return records;}
export function marketplaceSection(state){
 const pid=state.activeProfileId;
 const products=records.filter(x=>x.profileId===pid&&x.type==='product');
 const activeProducts=products.filter(x=>showArchived||!x.archived);
 const productMap=new Map(products.map(p=>[p.id,p]));
 const filtered=activeProducts.filter(p=>[p.name,p.variant,p.category,p.note].some(v=>String(v??'').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))));
 const detailId=chosen&&productMap.has(chosen)?chosen:(filtered[0]?.id??'');
 const selected=productMap.get(detailId);
 const stats=marketStats(records,pid);const comparison=selected?compareProductPrices(records,pid,selected.id):null;
 const overview=`<div class="economy-stats"><div><small>Товары / активные</small><strong>${products.length} / ${products.filter(x=>!x.archived).length}</strong></div><div><small>Наблюдения цен</small><strong>${stats.observations}</strong></div><div><small>Активные объявления</small><strong>${stats.active.length}</strong></div><div><small>Закрытые объявления</small><strong>${stats.listings.filter(x=>x.status==='closed').length}</strong></div></div>`;
 const productsHTML=filtered.length?filtered.map(p=>`<article class="market-product ${p.id===detailId?'market-selected':''}"><div><strong>${e(p.name)}</strong>${p.variant?` <small>· ${e(p.variant)}</small>`:''}<p class="subtle">${e(p.category)} · ${e(p.unit)} ${p.archived?'· Архив':''}</p></div><div class="row"><button class="button ${p.id===detailId?'primary':'secondary'}" data-market-action="focus" data-id="${e(p.id)}">Цены</button><button class="button secondary" data-market-action="edit" data-id="${e(p.id)}">Изменить</button></div></article>`).join(''):'<p class="subtle">Нет товаров по выбранному фильтру.</p>';
 const selectedHTML=selected?`<section class="card stack"><div class="row spread"><div><h3>${e(selected.name)}</h3><p class="subtle">${e(selected.category)} · ${e(selected.variant||'Без варианта')} · ${e(selected.unit)}</p></div><div class="row"><button class="button secondary" data-market-action="new" data-type="price" data-product="${e(selected.id)}">Добавить цену</button>${selected.archived?'':`<button class="button secondary" data-market-action="new" data-type="listing" data-product="${e(selected.id)}">Добавить объявление</button>`}</div></div>${selected.note?`<p>${e(selected.note)}</p>`:''}
 <div class="economy-stats"><div><small>Медиана (${comparison.priceType==='completed'?'сделки':'наблюдения'})</small><strong>${comparison.median===null?'—':e(money(comparison.median))}</strong></div><div><small>Диапазон наблюдений</small><strong>${comparison.min===null?'—':e(money(comparison.min))+' — '+e(money(comparison.max))}</strong></div><div><small>Лучшая цена продажи / покупки</small><strong>${comparison.bestAsk===null?'—':e(money(comparison.bestAsk))} / ${comparison.bestBid===null?'—':e(money(comparison.bestBid))}</strong></div><div><small>Изменение наблюдений</small><strong>${comparison.change===null?'—':e(money(comparison.change))}${comparison.changePercent===null?'':` (${e(num(comparison.changePercent))}%)`}</strong></div></div>
 <p class="subtle">Медиана рассчитывается по фактическим сделкам при их наличии; иначе — по всем типам наблюдений. Это пользовательские данные, не подтверждённые котировки сервера.</p><h4>История цен</h4>${priceChart(comparison.history)}<div class="market-table-scroll"><table class="economy-table"><thead><tr><th>Дата</th><th>Тип</th><th>Цена</th><th>Источник</th><th>Действия</th></tr></thead><tbody>${comparison.history.slice().reverse().slice(0,80).map(p=>`<tr><td>${e(p.date)}</td><td>${p.kind==='completed'?'Сделка':p.kind==='ask'?'Продажа':'Покупка'}</td><td>${e(money(p.price))} × ${p.quantity}</td><td>${e(p.source)} ${link(p)}</td><td><button class="button secondary" data-market-action="edit" data-id="${e(p.id)}">Изменить</button> <button class="button danger" data-market-action="remove" data-id="${e(p.id)}">Удалить</button></td></tr>`).join('')}</tbody></table></div>
 <h4>Объявления</h4><div class="market-table-scroll"><table class="economy-table"><thead><tr><th>Опубликовано</th><th>Операция</th><th>Цена</th><th>Статус</th><th>Контакт / источник</th><th>Действия</th></tr></thead><tbody>${comparison.listings.slice().sort((a,b)=>b.postedAt.localeCompare(a.postedAt)).slice(0,80).map(p=>`<tr><td>${e(p.postedAt)}${p.expiresAt?` · до ${e(p.expiresAt)}`:''}</td><td>${p.kind==='buy'?'Покупка':'Продажа'}</td><td>${e(money(p.price))} × ${p.quantity}</td><td>${p.status==='active'&&p.expiresAt&&p.expiresAt<d()?'Истекло':p.status==='active'?'Активно':p.status==='closed'?'Завершено':'Отменено'}</td><td>${e(p.seller||p.source)} ${link(p)}</td><td><button class="button secondary" data-market-action="edit" data-id="${e(p.id)}">Изменить</button> <button class="button danger" data-market-action="remove" data-id="${e(p.id)}">Удалить</button></td></tr>`).join('')}</tbody></table></div></section>`:'<section class="card"><p class="subtle">Создайте товар, чтобы записывать цены, сравнивать объявления и строить историю.</p></section>';
 return `<section class="card stack"><div class="row spread"><div><h3>Marketplace & Price Intelligence</h3><p class="subtle">Локальный каталог, объявления и проверяемые источники цен.</p></div><div class="row"><button class="button primary" data-market-action="new" data-type="product">Добавить товар</button><button class="button secondary" data-market-action="csv">Экспорт CSV</button></div></div>${overview}<div class="economy-filter"><label class="field">Найти товар<input id="market-search" maxlength="160" value="${e(query)}" placeholder="Название, категория, вариант"></label><label class="field"><span>Архивные товары</span><input id="market-archived" type="checkbox" ${showArchived?'checked':''}></label></div><div class="market-products">${productsHTML}</div></section>${selectedHTML}<dialog id="marketplace-dialog" aria-label="Запись рынка"><form id="marketplace-form" class="stack"><input type="hidden" name="recordId"><input type="hidden" name="recordType"><input type="hidden" name="linkedProductId"><h3 id="marketplace-dialog-title">Рыночная запись</h3><div class="economy-fields" id="marketplace-fields"></div><div class="row spread"><button class="button secondary" type="button" data-market-action="cancel">Отмена</button><button class="button primary" type="submit">Сохранить</button></div></form></dialog>`;
}
function editor(type,item=null,productId=''){
 const dialog=document.getElementById('marketplace-dialog');if(!dialog)throw Error('Откройте вкладку «Рынок и сделки»');
 const form=dialog.querySelector('form'),profiles=records.filter(r=>r.type==='product'&&r.profileId===currentProfile);
 form.reset();form.elements.namedItem('recordId').value=item?.id??'';form.elements.namedItem('recordType').value=type;form.elements.namedItem('linkedProductId').value=item?.productId??productId;
 dialog.querySelector('#marketplace-dialog-title').textContent=(item?'Изменить: ':'Новая запись: ')+({product:'Товар',price:'Цена',listing:'Объявление'}[type]);
 replaceHtml(dialog.querySelector('#marketplace-fields'),editorFields(type,item??(productId?{productId}:{}),profiles));dialog.showModal();
}
let currentProfile='';
export function setMarketplaceQuery(value){query=String(value).slice(0,160);}
export function setMarketplaceArchived(value){showArchived=value===true;}
export async function handleMarketplaceAction(button,state,render,feedback){
 currentProfile=state.activeProfileId;const action=button.dataset.marketAction;
 if(action==='new'){
  const type=button.dataset.type,linked=button.dataset.product??'';
  if(!['product','price','listing'].includes(type))throw Error('Неизвестная операция рынка');
  const products=records.filter(p=>p.type==='product'&&p.profileId===currentProfile);
  if(type!=='product'&&(!products.length||linked&&!products.some(p=>p.id===linked)))throw Error('Сначала создайте товар текущего профиля');
  if(type==='listing'&&linked&&products.find(p=>p.id===linked)?.archived)throw Error('Для архивного товара нельзя создавать объявления');
  if(type==='listing'&&!linked&&!products.some(p=>!p.archived))throw Error('Нет активных товаров для нового объявления');
  editor(type,null,linked);return;
 }
 if(action==='cancel'){document.getElementById('marketplace-dialog')?.close();return;}
 if(action==='focus'){const row=await getMarketplace(button.dataset.id,currentProfile);if(row.type!=='product')throw Error('Товар не найден');chosen=row.id;render();return;}
 if(action==='edit'){const row=await getMarketplace(button.dataset.id,currentProfile);editor(row.type,row);return;}
 if(action==='remove'){const row=await getMarketplace(button.dataset.id,currentProfile);if(!confirm(`Удалить запись «${row.type==='product'?row.name:row.source}»?`))return;await removeMarketplace(row.id,currentProfile);await refreshMarketplace();render();feedback('Рыночная запись удалена');return;}
 if(action==='csv'){
  const rows=records.filter(r=>r.profileId===currentProfile);const cols=['type','name','category','variant','productId','date','postedAt','kind','status','price','quantity','source','url','seller','expiresAt','note'];
  const safe=x=>{let t=String(x??'');if(/^[\s\x00-\x1f]*[=+@-]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';};
  const csv='\ufeff'+[cols.map(safe).join(';'),...rows.map(r=>cols.map(k=>safe(r[k])).join(';'))].join('\r\n')+'\r\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`marketplace-${d()}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);feedback('CSV рынка выгружен');
 }
}
export async function handleMarketplaceSubmit(form,state,render,feedback){
 const fields=Object.fromEntries(new FormData(form).entries()),recordId=fields.recordId,type=fields.recordType,linkedProductId=fields.linkedProductId;delete fields.recordId;delete fields.recordType;delete fields.linkedProductId;
 const productId=linkedProductId||fields.productId;delete fields.productId;
 if(type==='product')fields.archived=fields.archived==='true';
 else {if(!productId)throw Error('Не выбран товар');if(!recordId)fields.productId=productId;}
 const saved=recordId?await updateMarketplace(recordId,state.activeProfileId,fields):await addMarketplace(type,state.activeProfileId,fields);
 if(saved.type==='product')chosen=saved.id;else chosen=saved.productId;
 form.closest('dialog').close();await refreshMarketplace();render();feedback(recordId?'Рыночная запись обновлена':'Рыночная запись добавлена');
}
