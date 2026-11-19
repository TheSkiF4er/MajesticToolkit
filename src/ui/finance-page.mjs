/** Financial Management 2.1.7 — real account, transfer and monthly budget UI. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {financeAction,loadFinance} from '../lib/finance-store.mjs';
import {financeCSV} from '../lib/finance-core.mjs';
import {listFamilies} from '../lib/family-store.mjs';
import {listOrganizations} from '../lib/organization-store.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
const today=()=>new Date().toISOString().slice(0,10);
const fmt=n=>new Intl.NumberFormat('ru-RU').format(n)+' $';
const field=(n,label,value='',type='text',attrs='')=>`<label class="field">${e(label)}<input name="${e(n)}" type="${type}" value="${e(String(value))}" ${attrs}></label>`;
const select=(n,label,items,val='')=>`<label class="field">${e(label)}<select name="${e(n)}">${items.map(([id,name])=>`<option value="${e(id)}" ${id===val?'selected':''}>${e(name)}</option>`).join('')}</select></label>`;
const button=(kind,title,attrs='',cls='secondary')=>`<button type="button" class="button ${cls}" data-finance-action="${kind}" ${attrs}>${e(title)}</button>`;
const attr=id=>`data-id="${e(id)}"`;
let data=null,profile='',families=[],organizations=[],query=new Map();
export async function refreshFinance(pid){const [snapshot,fs,os]=await Promise.all([loadFinance(pid),listFamilies(pid),listOrganizations(pid)]);profile=pid;data=snapshot;families=fs;organizations=os;return snapshot;}
export function setFinanceQuery(pid,value){query.set(pid,String(value||'').slice(0,120));}
export function financeSection(state){
 const pid=state.activeProfileId,s=data&&profile===pid?data:null;
 if(!s)return `<section class="card stack"><h3>Кассы, счета и бюджеты</h3><p class="subtle">Загрузка финансовых операций…</p></section>`;
 const accounts=s.accounts,open=accounts.filter(a=>!a.closed),q=(query.get(pid)||'').toLocaleLowerCase('ru');
 const accountsShown=accounts.filter(a=>!q||[a.name,a.ownerType,a.ownerId].some(v=>v.toLocaleLowerCase('ru').includes(q)));
 const acct=id=>accounts.find(a=>a.id===id)?.name||'Счёт отсутствует';
 const owner=a=>a.ownerType==='personal'?'Личный':a.ownerType==='family'?`Семья: ${families.find(x=>x.id===a.ownerId)?.name||'Архив'}`:`Организация: ${organizations.find(x=>x.id===a.ownerId)?.name||'Архив'}`;
 return `<section class="card stack" id="finance-ledger"><div class="row spread"><div><h3>Financial Management · 2.1.7</h3><p class="subtle">Локальные счета и кассы. Операции не дублируют старый журнал сделок и складской P&L.</p></div>${button('account-open','+ Счёт','','primary')}</div>
 <div class="economy-stats"><div><small>Всего на счетах</small><strong>${e(fmt(s.totalBalance))}</strong></div><div><small>Поступления</small><strong>${e(fmt(s.totals.income))}</strong></div><div><small>Расходы</small><strong>${e(fmt(s.totals.expense))}</strong></div><div><small>Переводы</small><strong>${e(fmt(s.totals.transfers))}</strong></div></div>
 <div class="row">${button('income','+ Поступление')}${button('expense','− Расход')}${button('transfer','⇄ Перевод')}${button('budget-set','+ Бюджет')}${button('csv','CSV')}</div>
 ${field('financialSearch','Поиск по счетам и кассам',query.get(pid)||'','search','id="finance-search" maxlength="120"')}
 <div class="table-scroll"><table class="economy-table"><thead><tr><th>Счёт / касса</th><th>Владелец</th><th>Остаток</th><th>Действия</th></tr></thead><tbody>${accountsShown.map(a=>`<tr><td>${e(a.name)}${a.closed?' · закрыт':''}</td><td>${e(owner(a))}</td><td>${e(fmt(a.balance))}</td><td>${a.closed?button('account-close','Открыть',`${attr(a.id)} data-closed="false"`):button('account-edit','Изменить',attr(a.id))+button('account-close','Закрыть',`${attr(a.id)} data-closed="true"`)}</td></tr>`).join('')||'<tr><td colspan="4">Счетов пока нет</td></tr>'}</tbody></table></div></section>
 <section class="card stack"><div class="row spread"><h3>Бюджеты по месяцам</h3><span class="tag">${s.budgets.length}</span></div><div class="table-scroll"><table class="economy-table"><thead><tr><th>Месяц</th><th>Счёт / категория</th><th>Лимит</th><th>Потрачено</th><th>Остаток</th><th></th></tr></thead><tbody>${s.budgets.map(b=>`<tr><td>${e(b.month)}</td><td>${e(acct(b.accountId))} / ${e(b.category)} ${b.closed?'(архив)':''}</td><td>${e(fmt(b.limit))}</td><td>${e(fmt(b.used))}</td><td>${b.overLimit?'<strong>Превышен: </strong>':''}${e(fmt(b.remaining))}</td><td>${!b.closed?button('budget-set','Изменить',attr(b.id))+button('budget-close','Архив',attr(b.id)):''}</td></tr>`).join('')||'<tr><td colspan="6">Планов пока нет</td></tr>'}</tbody></table></div></section>
 <section class="card stack"><div class="row spread"><h3>Финансовый журнал (${s.movements.length})</h3>${s.movements.length?button('reverse','Отменить последнюю операцию'):''}</div><div class="table-scroll"><table class="economy-table"><thead><tr><th>Дата</th><th>Операция</th><th>Счёт</th><th>Сумма</th><th>Категория</th><th>Примечание</th></tr></thead><tbody>${s.movements.slice(-100).reverse().map(m=>`<tr><td>${e(m.date)}</td><td>${e(m.kind==='income'?'Приход':m.kind==='expense'?'Расход':'Перевод')}</td><td>${e(acct(m.accountId))}${m.toAccountId?' → '+e(acct(m.toAccountId)):''}</td><td>${e(fmt(m.amount))}</td><td>${e(m.category)}</td><td>${e(m.note)}</td></tr>`).join('')||'<tr><td colspan="6">Операций пока нет</td></tr>'}</tbody></table></div><p class="subtle">История хранится без редактирования: корректировка выполняется отменой последней операции и внесением новой. Крупные журналы доступны в CSV.</p></section>
 <dialog id="finance-dialog" aria-label="Финансовая операция"><form id="finance-form" class="stack"><input type="hidden" name="kind"><input type="hidden" name="targetId"><h3 id="finance-dialog-title">Операция</h3><div id="finance-fields" class="economy-fields"></div>${field('note','Комментарий','','text','maxlength="500"')}<div class="row spread">${button('cancel','Отмена')}<button class="button primary" type="submit">Сохранить</button></div></form></dialog>`;
}
function formFields(kind,obj){
 const accounts=data.accounts,open=accounts.filter(a=>!a.closed),choices=open.map(a=>[a.id,`${a.name} (${fmt(a.balance)})`]);
 if(kind==='account-open')return field('name','Название кассы/счёта','','text','required maxlength="80"')+select('ownerRef','Владелец',[['personal:','Личный'],...families.filter(f=>!f.archived).map(f=>['family:'+f.id,'Семья: '+f.name]),...organizations.filter(o=>!o.archived).map(o=>['organization:'+o.id,'Организация: '+o.name])])+field('openingBalance','Начальный остаток',0,'number','required min="0" max="1000000000000" step="1"');
 if(kind==='account-edit')return field('name','Название',obj.name,'text','required maxlength="80"');
 if(kind==='budget-set')return select('accountId','Счёт',choices,obj?.accountId)+field('month','Месяц',obj?.month||today().slice(0,7),'month','required')+field('category','Категория',obj?.category||'Операционные','text','required maxlength="80"')+field('limit','Лимит',obj?.limit??0,'number','required min="0" max="1000000000000" step="1"');
 return field('date','Дата',today(),'date','required')+select('accountId','Счёт списания / зачисления',choices)+ (kind==='transfer'?select('toAccountId','Счёт получателя',choices):'')+field('amount','Сумма',1,'number','required min="1" max="1000000000000" step="1"')+(kind==='transfer'?'':field('category','Категория',kind==='income'?'Доход':'Расход','text','required maxlength="80"'));
}
function downloadCSV(snapshot){const blob=new Blob([financeCSV(snapshot)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`finance-${today()}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function handleFinanceAction(button,state,render,feedback){
 const kind=button.dataset.financeAction,pid=state.activeProfileId;if(profile!==pid)await refreshFinance(pid);
 if(kind==='cancel'){document.getElementById('finance-dialog')?.close();return;}
 if(kind==='csv'){downloadCSV(data);feedback('Финансовый журнал сохранён в CSV');return;}
 if(kind==='reverse'){const last=data.movements.at(-1);if(!last)throw Error('Нет операции для отмены');if(!confirm('Отменить последнюю финансовую операцию? Запись останется в аудите.'))return;await financeAction(pid,'reverse',{reversesId:last.id,note:'Отмена пользователем'});await refreshFinance(pid);render();feedback('Последняя операция отменена');return;}
 if(kind==='account-close'||kind==='budget-close'){if(!confirm('Подтвердить изменение статуса?'))return;await financeAction(pid,kind,{[kind==='account-close'?'accountId':'budgetId']:button.dataset.id,closed:kind==='budget-close'||button.dataset.closed==='true'});await refreshFinance(pid);render();feedback('Статус обновлён');return;}
 const obj=kind==='account-edit'?data.accounts.find(a=>a.id===button.dataset.id):kind==='budget-set'?data.budgets.find(b=>b.id===button.dataset.id):null;
 if(kind==='account-edit'&&!obj||button.dataset.id&&kind==='budget-set'&&!obj)throw Error('Запись не найдена');
 const dialog=document.getElementById('finance-dialog'),form=dialog?.querySelector('form');if(!form)throw Error('Откройте вкладку Финансы');
 form.reset();form.elements.namedItem('kind').value=kind;form.elements.namedItem('targetId').value=obj?.id||'';dialog.querySelector('#finance-dialog-title').textContent=kind;
 replaceHtml(dialog.querySelector('#finance-fields'),formFields(kind,obj));dialog.showModal();
}
export async function handleFinanceSubmit(form,state,render,feedback){
 const values=Object.fromEntries(new FormData(form).entries()),kind=values.kind,pid=state.activeProfileId,targetId=values.targetId;
 delete values.kind;delete values.targetId;
 if(kind==='account-open'){const [ownerType,ownerId]=String(values.ownerRef||'').split(':');delete values.ownerRef;values.ownerType=ownerType;values.ownerId=ownerId||'';}
 if(kind==='account-edit')values.accountId=targetId;
 if(kind==='budget-set'&&targetId)values.budgetId=targetId;
 await financeAction(pid,kind,values);form.closest('dialog').close();await refreshFinance(pid);render();feedback('Финансовая операция сохранена');
}
