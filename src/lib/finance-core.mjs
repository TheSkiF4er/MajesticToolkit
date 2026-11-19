/** Financial Management 2.1.7 — validated, replayable local account ledger.
 * Legacy deal/cash and inventory P&L are intentionally not posted automatically.
 * Each mutation appends to one per-profile journal written in a single storage.set.
 */
export const FINANCE_PREFIX='mtFinancialV217:';
export const MAX_FINANCE_EVENTS=12000;
export const MAX_MONEY=1_000_000_000_000;
const types=['personal','family','organization'];
const kinds=['account-open','account-edit','account-close','budget-set','budget-close','income','expense','transfer','reverse'];
const uid=()=>globalThis.crypto?.randomUUID?.()??'fin-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);
const id=(v,n='ID')=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{8,120}$/.test(v))throw Error(`${n}: неверный идентификатор`);return v;};
const text=(v,n,max,required=true)=>{if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw Error(`${n}: неверное значение`);return v.trim();};
const money=(v,n='Сумма',zero=true)=>{if(typeof v==='boolean'||v===null||v===undefined||v===''||!/^(?:0|[1-9]\d*)$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)>MAX_MONEY||(!zero&&Number(v)===0))throw Error(`${n}: требуется целая сумма от ${zero?0:1} до ${MAX_MONEY}`);return Number(v);};
const sum=(a,b)=>{const r=a+b;if(!Number.isSafeInteger(r)||Math.abs(r)>MAX_MONEY)throw Error('Переполнение остатка счёта');return r;};
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('Некорректная дата');return v;};
const stamp=v=>{if(typeof v!=='string'||Number.isNaN(Date.parse(v))||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v))throw Error('Некорректное время');return new Date(v).toISOString();};
export function cleanFinanceEvent(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!kinds.includes(raw.kind))throw Error('Неизвестное финансовое действие');
 const base={id:id(raw.id),kind:raw.kind,profileId:id(raw.profileId,'Профиль'),at:stamp(raw.at),date:date(raw.date),note:text(raw.note??'','Комментарий',500,false)};
 switch(raw.kind){
  case 'account-open':{
   if(!types.includes(raw.ownerType))throw Error('Неверный владелец счёта');
   return {...base,accountId:id(raw.accountId),name:text(raw.name,'Счёт',80),ownerType:raw.ownerType,ownerId:raw.ownerType==='personal'?'':id(raw.ownerId,'Владелец'),openingBalance:money(raw.openingBalance??0,'Начальный остаток')};
  }
  case 'account-edit':return {...base,accountId:id(raw.accountId),name:text(raw.name,'Название счёта',80)};
  case 'account-close':return {...base,accountId:id(raw.accountId),closed:raw.closed===true};
  case 'budget-set':{
   if(typeof raw.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month))throw Error('Неверный бюджетный месяц');
   return {...base,budgetId:id(raw.budgetId),accountId:id(raw.accountId),category:text(raw.category,'Категория',80),month:raw.month,limit:money(raw.limit,'Лимит бюджета')};
  }
  case 'budget-close':return {...base,budgetId:id(raw.budgetId),closed:raw.closed===true};
  case 'reverse':return {...base,reversesId:id(raw.reversesId)};
  default:{
   const x={...base,accountId:id(raw.accountId),amount:money(raw.amount,'Сумма',false),category:text(raw.category??'Прочее','Категория',80)};
   if(raw.kind==='transfer')x.toAccountId=id(raw.toAccountId,'Счёт получателя');
   return x;
  }
 }
}
export function newFinanceEvent(profileId,kind,values={}){const now=new Date().toISOString();return cleanFinanceEvent({...values,id:uid(),accountId:kind==='account-open'?uid():values.accountId,budgetId:kind==='budget-set'&&!values.budgetId?uid():values.budgetId,profileId,kind,at:now,date:values.date||now.slice(0,10)});}
/** Replay refuses tampering, broken references, double reversals and overdrafts. */
export function financeSnapshot(batch,owners=null){
 if(!batch||typeof batch!=='object'||Array.isArray(batch))throw Error('Отсутствует финансовый журнал');
 const profileId=id(batch.profileId,'Профиль');if(!Array.isArray(batch.events)||batch.events.length>MAX_FINANCE_EVENTS)throw Error('Повреждён финансовый журнал или превышен лимит');
 const events=batch.events.map(cleanFinanceEvent),ids=new Set(),reversed=new Set(),accounts=new Map(),budgets=new Map(),movements=[];
 let previous='';
 const ownerIds={family:new Set((owners?.families??[]).filter(x=>x.profileId===profileId).map(x=>x.id)),organization:new Set((owners?.organizations??[]).filter(x=>x.profileId===profileId).map(x=>x.id))};
 for(const e of events){
  if(ids.has(e.id)||e.profileId!==profileId||e.at<previous)throw Error('Повреждена последовательность финансового журнала');ids.add(e.id);previous=e.at;
  if(e.kind==='account-open'){
   if(accounts.has(e.accountId)||[...accounts.values()].some(a=>a.name.toLocaleLowerCase('ru')===e.name.toLocaleLowerCase('ru')))throw Error('Счёт с таким названием уже существует');
   if(owners&&e.ownerType!=='personal'&&!ownerIds[e.ownerType].has(e.ownerId))throw Error('Владелец счёта отсутствует в профиле');
   accounts.set(e.accountId,{id:e.accountId,profileId,name:e.name,ownerType:e.ownerType,ownerId:e.ownerId,openingBalance:e.openingBalance,balance:e.openingBalance,closed:false});
  }else if(e.kind==='account-edit'){
   const a=accounts.get(e.accountId);if(!a||a.closed||[...accounts.values()].some(x=>x.id!==a.id&&x.name.toLocaleLowerCase('ru')===e.name.toLocaleLowerCase('ru')))throw Error('Невозможно изменить счёт');a.name=e.name;
  }else if(e.kind==='account-close'){
   const a=accounts.get(e.accountId);if(!a||a.closed===e.closed||e.closed&&a.balance!==0)throw Error('Закрыть можно только счёт с нулевым остатком');a.closed=e.closed;
  }else if(e.kind==='budget-set'){
   const a=accounts.get(e.accountId);if(!a||a.closed)throw Error('Бюджет привязан к отсутствующему или закрытому счёту');
   const b=budgets.get(e.budgetId);if(b&&(b.accountId!==e.accountId||b.month!==e.month||b.category!==e.category||b.closed))throw Error('Нельзя переписать чужой или закрытый бюджет');
   if([...budgets.values()].some(x=>x.id!==e.budgetId&&x.accountId===e.accountId&&x.month===e.month&&x.category.toLocaleLowerCase('ru')===e.category.toLocaleLowerCase('ru')&&!x.closed))throw Error('Дублирующийся бюджет');
   budgets.set(e.budgetId,{id:e.budgetId,accountId:e.accountId,month:e.month,category:e.category,limit:e.limit,closed:false});
  }else if(e.kind==='budget-close'){
   const b=budgets.get(e.budgetId);if(!b||b.closed===e.closed)throw Error('Неизвестный бюджет или состояние не меняется');b.closed=e.closed;
  }else if(e.kind==='reverse'){
   const active=movements.filter(x=>!reversed.has(x.id));const last=active.at(-1);
   if(!last||last.id!==e.reversesId)throw Error('Отменить можно только последнюю финансовую операцию');
   reversed.add(last.id);
   // Inverting the last movement cannot change intervening balances: no subsequent money movements exist.
   const a=accounts.get(last.accountId),to=last.kind==='transfer'?accounts.get(last.toAccountId):null;
   if(a.closed||to?.closed)throw Error('Нельзя отменить движение закрытого счёта');
   const diff=last.kind==='income'?-last.amount:last.amount;
   a.balance=sum(a.balance,diff);if(a.balance<0)throw Error('Отмена создаёт отрицательный баланс');
   if(to){to.balance=sum(to.balance,-last.amount);if(to.balance<0)throw Error('Недостаточно денег для отмены перевода');}
  }else{
   const a=accounts.get(e.accountId),to=e.kind==='transfer'?accounts.get(e.toAccountId):null;
   if(!a||a.closed||e.kind==='transfer'&&(!to||to.closed||to.id===a.id))throw Error('Указан закрытый, отсутствующий или одинаковый счёт');
   const debit=e.kind==='income'?e.amount:-e.amount;
   a.balance=sum(a.balance,debit);if(a.balance<0)throw Error('Недостаточно средств на счёте');
   if(to)to.balance=sum(to.balance,e.amount);
   movements.push(e);
  }
 }
 const active=movements.filter(e=>!reversed.has(e.id));
 const totals={income:0,expense:0,transfers:0};
 for(const e of active)totals[e.kind==='income'?'income':e.kind==='expense'?'expense':'transfers']=sum(totals[e.kind==='income'?'income':e.kind==='expense'?'expense':'transfers'],e.amount);
 const resultBudgets=[...budgets.values()].map(b=>{const used=active.filter(e=>e.kind==='expense'&&e.accountId===b.accountId&&e.category.toLocaleLowerCase('ru')===b.category.toLocaleLowerCase('ru')&&e.date.slice(0,7)===b.month).reduce((n,e)=>sum(n,e.amount),0);return {...b,used,remaining:b.limit-used,overLimit:used>b.limit};});
 return {profileId,events,accounts:[...accounts.values()],budgets:resultBudgets,movements:active,totals,totalBalance:[...accounts.values()].reduce((n,a)=>sum(n,a.balance),0),reversed:[...reversed]};
}
export function validateFinanceBatches(batches,profileIds=null,owners=null){
 if(!Array.isArray(batches)||batches.length>3000)throw Error('Неверный список финансовых журналов');const ids=new Set();return batches.map(b=>{
  const snapshot=financeSnapshot(b,owners);if(ids.has(snapshot.profileId)||profileIds&&!profileIds.includes(snapshot.profileId))throw Error('Дубликат финансового профиля или профиль отсутствует');ids.add(snapshot.profileId);return {profileId:snapshot.profileId,events:snapshot.events};
 });
}
export function financeCSV(snapshot){const esc=s=>{let value=String(s??'');if(/^[\s]*[=+@\-]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};return '\ufeff'+[['Дата','Тип','Счёт','Получатель','Категория','Сумма','Комментарий'],...snapshot.movements.map(e=>[e.date,e.kind,e.accountId,e.toAccountId||'',e.category,e.amount,e.note])].map(row=>row.map(esc).join(';')).join('\r\n');}
