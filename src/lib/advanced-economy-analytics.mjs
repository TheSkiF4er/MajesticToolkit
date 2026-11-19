/** Advanced Economy Analytics 2.1.8.
 * Read-only projections of verified, local profile data. Ledger, legacy and inventory
 * amounts are deliberately NOT summed: the same economic activity can occur in all three.
 */
import {cleanRecord,dealTotals} from './economy-core.mjs';
import {financeSnapshot} from './finance-core.mjs';
import {inventorySnapshot} from './inventory-core.mjs';
import {validateMarketplace} from './marketplace-core.mjs';

const checked=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw Error('Сумма аналитики превышает безопасный диапазон');return n;};
const add=(obj,key,value)=>{obj[key]=checked(obj[key]??0,value);};
const addMap=(map,key,value)=>map.set(key,checked(map.get(key)??0,value));
const day=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const inRange=(date,from,to)=>date>=from&&date<=to;
const median=values=>{if(!values.length)return null;const v=values.slice().sort((a,b)=>a-b),n=v.length;return n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2;};
const growth=(first,last)=>first===null||last===null||first===0?null:Math.round((last-first)/first*10000)/100;
const sortedEntries=map=>[...map].map(([name,value])=>({name,value})).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)||a.name.localeCompare(b.name,'ru'));
const delta=(actual,previous)=>({absolute:actual-previous,percent:previous===0?null:Math.round((actual-previous)/Math.abs(previous)*10000)/100});
function resolvePeriod(from,to){
 if(!day(from)||!day(to)||from>to)throw Error('Укажите корректные даты начала и конца периода');
 const days=Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000)+1;
 if(days>3660)throw Error('Период не может превышать 10 лет');
 const priorEnd=new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const priorStart=new Date(Date.parse(from+'T00:00:00Z')-86400000*days).toISOString().slice(0,10);
 return {from,to,days,priorStart,priorEnd};
}
/** @param {object} input finance is a validated journal batch or loadFinance snapshot;
 * inventory is an array of events or a loadInventory snapshot.
 */
export function analyzeEconomy(input){
 const {profileId,from,to,owner='all',productId='all'}=input??{};
 if(typeof profileId!=='string'||!profileId||profileId.length>128)throw Error('Профиль аналитики не определён');
 const period=resolvePeriod(from,to);
 const market=validateMarketplace(input.market??[]).filter(r=>r.profileId===profileId);
 const products=market.filter(r=>r.type==='product');
 if(productId!=='all'&&!products.some(p=>p.id===productId))throw Error('Товар отсутствует в активном профиле');
 const accountsSnapshot=input.finance?.accounts&&input.finance?.movements?input.finance:financeSnapshot(input.finance??{profileId,events:[]});
 if(accountsSnapshot.profileId!==profileId)throw Error('Чужой финансовый журнал');
 const accounts=accountsSnapshot.accounts.filter(a=>owner==='all'||owner==='personal'&&a.ownerType==='personal'||owner===`${a.ownerType}:${a.ownerId}`);
 if(owner!=='all'&&owner!=='personal'&&!/^(family|organization):[\w-]{8,120}$/.test(owner))throw Error('Недопустимый фильтр владельца');
 const accountIds=new Set(accounts.map(a=>a.id));
 const financeEvents=accountsSnapshot.movements.filter(m=>{
  if(m.profileId!==profileId)throw Error('Финансовое движение другого профиля');
  return m.kind!=='transfer'&&accountIds.has(m.accountId);
 });
 const legacy=(input.legacy??[]).map(cleanRecord).filter(r=>r.profileId===profileId);
 const inv=input.inventory?.stock&&input.inventory?.movements?input.inventory:inventorySnapshot(input.inventory??[],profileId,market);
 // loadInventory returns a profile-specific snapshot. No owner inference from free-text names.
 if(inv.events.some(e=>e.profileId!==profileId))throw Error('Складской журнал другого профиля');
 const moneyWindow=(start,end)=>{
  const buckets=new Map(),categories=new Map(),perAccount=new Map();let income=0,expense=0;
  for(const m of financeEvents){if(!inRange(m.date,start,end))continue;
   const isIncome=m.kind==='income',amount=m.amount;
   if(isIncome)income=checked(income,amount);else expense=checked(expense,amount);
   const b=buckets.get(m.date)||{date:m.date,income:0,expense:0,net:0};
   add(b,isIncome?'income':'expense',amount);add(b,'net',isIncome?amount:-amount);buckets.set(m.date,b);
   const a=perAccount.get(m.accountId)||{id:m.accountId,income:0,expense:0,net:0};
   add(a,isIncome?'income':'expense',amount);add(a,'net',isIncome?amount:-amount);perAccount.set(m.accountId,a);
   addMap(categories,`${isIncome?'Доход':'Расход'} · ${m.category}`,amount);
  }
  return {income,expense,net:checked(income,-expense),daily:[...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date)),categories:sortedEntries(categories),perAccount:[...perAccount.values()]};
 };
 const fin=moneyWindow(from,to),previous=moneyWindow(period.priorStart,period.priorEnd);
 fin.comparison={income:delta(fin.income,previous.income),expense:delta(fin.expense,previous.expense),net:delta(fin.net,previous.net)};
 fin.previous={from:period.priorStart,to:period.priorEnd,income:previous.income,expense:previous.expense,net:previous.net};
 const transfers=accountsSnapshot.movements.filter(m=>m.kind==='transfer'&&inRange(m.date,from,to)&&(accountIds.has(m.accountId)||accountIds.has(m.toAccountId)));
 fin.transfers=transfers.reduce((totals,m)=>{add(totals,'volume',m.amount);const source=accountIds.has(m.accountId),destination=accountIds.has(m.toAccountId);add(totals,source&&destination?'internal':source?'externalOut':'externalIn',m.amount);return totals;},{volume:0,internal:0,externalIn:0,externalOut:0});
 fin.accounts=accounts.map(a=>({...a,flow:fin.perAccount.find(x=>x.id===a.id)??{income:0,expense:0,net:0}}));
 fin.balance=accounts.reduce((n,a)=>checked(n,a.balance),0);
 // Balances are current (lifetime); budgets refer to their own calendar month.
 fin.budgets=accountsSnapshot.budgets.filter(b=>accountIds.has(b.accountId)&&b.month>=from.slice(0,7)&&b.month<=to.slice(0,7));
 const legacyWindow=(start,end)=>{
  const byDay=new Map();let revenue=0,cost=0,openCapital=0,closed=0;
  for(const r of legacy){if(!inRange(r.date,start,end)||r.type==='match')continue;
   let inAmount=0,outAmount=0;
   if(r.type==='deal'){
    const t=dealTotals(r);
    if(r.status==='open'){openCapital=checked(openCapital,t.invested);continue;}
    closed++;inAmount=t.revenue;outAmount=t.invested;
   }else if(r.kind==='income')inAmount=r.amount;else outAmount=r.amount;
   revenue=checked(revenue,inAmount);cost=checked(cost,outAmount);
   const b=byDay.get(r.date)||{date:r.date,income:0,expense:0,net:0};add(b,'income',inAmount);add(b,'expense',outAmount);add(b,'net',checked(inAmount,-outAmount));byDay.set(r.date,b);
  }
  return {revenue,cost,net:checked(revenue,-cost),closed,openCapital,daily:[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date))};
 };
 const old=legacyWindow(from,to),oldPrevious=legacyWindow(period.priorStart,period.priorEnd);
 old.comparison=delta(old.net,oldPrevious.net);
 const stockWindow=(start,end)=>{
  const byProduct=new Map(),byDay=new Map();let sales=0,cogs=0,writeoffs=0,profit=0;
  for(const m of inv.movements){if(!inRange(m.date,start,end)||!['sale','writeoff'].includes(m.kind)||productId!=='all'&&m.productId!==productId)continue;
   const p=byProduct.get(m.productId)||{productId:m.productId,quantity:0,sales:0,cogs:0,writeoffs:0,profit:0};
   const b=byDay.get(m.date)||{date:m.date,sales:0,cogs:0,writeoffs:0,profit:0};
   if(m.kind==='sale'){
    sales=checked(sales,m.proceeds);cogs=checked(cogs,m.cost);profit=checked(profit,m.profit);
    add(p,'quantity',m.quantity);add(p,'sales',m.proceeds);add(p,'cogs',m.cost);add(p,'profit',m.profit);
    add(b,'sales',m.proceeds);add(b,'cogs',m.cost);add(b,'profit',m.profit);
   }else{
    writeoffs=checked(writeoffs,m.cost);profit=checked(profit,-m.cost);
    add(p,'writeoffs',m.cost);add(p,'profit',-m.cost);add(b,'writeoffs',m.cost);add(b,'profit',-m.cost);
   }
   byProduct.set(m.productId,p);byDay.set(m.date,b);
  }
  return {sales,cogs,writeoffs,profit,byProduct:[...byProduct.values()].sort((a,b)=>b.profit-a.profit),daily:[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date))};
 };
 const stock=stockWindow(from,to),stockPrior=stockWindow(period.priorStart,period.priorEnd);
 stock.comparison=delta(stock.profit,stockPrior.profit);
 stock.onHand=inv.stock.filter(s=>productId==='all'||s.productId===productId);
 stock.value=inv.lots.filter(lot=>productId==='all'||lot.productId===productId).reduce((n,lot)=>checked(n,checked(checked(lot.quantity*lot.unitCost,lot.purchaseFee),-lot.allocatedCost)),0); // Each lot counted once, even when split among owners
 stock.units=stock.onHand.reduce((n,s)=>checked(n,s.quantity),0);
 const prices=market.filter(r=>r.type==='price'&&inRange(r.date,from,to)&& (productId==='all'||r.productId===productId));
 const listings=market.filter(r=>r.type==='listing'&&r.status==='active'&&r.postedAt<=to&&(!r.expiresAt||r.expiresAt>=to)&& (productId==='all'||r.productId===productId));
 const byProduct=new Map();for(const p of products.filter(p=>productId==='all'||p.id===productId))byProduct.set(p.id,{id:p.id,name:p.name,variant:p.variant,category:p.category,observations:0,completed:0,median:null,first:null,last:null,change:null,bestAsk:null,bestBid:null,series:[]});
 const priceGroups=new Map(),listingGroups=new Map();
 for(const record of prices){const group=priceGroups.get(record.productId)??[];group.push(record);priceGroups.set(record.productId,group);}
 for(const record of listings){const group=listingGroups.get(record.productId)??[];group.push(record);listingGroups.set(record.productId,group);}
 for(const p of byProduct.values()){
  const records=(priceGroups.get(p.id)??[]).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  const completed=records.filter(r=>r.kind==='completed');const basis=completed.length?completed:records;
  p.observations=records.length;p.completed=completed.length;p.basis=completed.length?'Фактические сделки':'Наблюдения (не сделки)';
  p.median=median(basis.map(r=>r.price));
  const grouped=new Map();for(const r of basis){const y=grouped.get(r.date)||[];y.push(r.price);grouped.set(r.date,y);}
  p.series=[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([date,values])=>({date,value:median(values),count:values.length}));
  p.first=p.series.length?p.series[0].value:null;p.last=p.series.length?p.series.at(-1).value:null;p.change=growth(p.first,p.last);
  const productListings=listingGroups.get(p.id)??[],sell=productListings.filter(r=>r.kind==='sell').map(r=>r.price),buy=productListings.filter(r=>r.kind==='buy').map(r=>r.price);
  p.bestAsk=sell.length?Math.min(...sell):null;p.bestBid=buy.length?Math.max(...buy):null;
 }
 return {profileId,period,filter:{owner,productId},finance:fin,legacy:old,inventory:stock,market:{products:[...byProduct.values()],observations:prices.length,active:listings.length},sources:{finance:financeEvents.length,legacy:legacy.length,inventory:inv.events.length,market:market.length},separateLedgers:true};
}

const csvCell=value=>{let s=String(value??'');if(/^[\s\x00-\x1f]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function analyticsCsv(report){
 const rows=[['Раздел','Период / ID','Показатель','Значение'],
 ['Кассы',report.period.from+'—'+report.period.to,'Поступления',report.finance.income],
 ['Кассы',report.period.from+'—'+report.period.to,'Расходы',report.finance.expense],
 ['Кассы',report.period.from+'—'+report.period.to,'Чистый поток',report.finance.net],
 ['Кассы','Текущий баланс','Остаток',report.finance.balance],
 ['Кассы','Переводы','Оборот без двойного учёта',report.finance.transfers.volume],
 ['Склад','Текущий остаток','Себестоимость',report.inventory.value],
 ['Старый журнал','Отдельный учёт','Результат',report.legacy.net],
 ['Склад','Отдельный учёт','Реализованный результат с потерями',report.inventory.profit],
 ...report.finance.daily.map(r=>['Кассы',r.date,'Поступления',r.income]),
 ...report.finance.daily.map(r=>['Кассы',r.date,'Расходы',r.expense]),
 ...report.finance.categories.map(r=>['Категории',r.name,'Сумма',r.value]),
 ...report.finance.accounts.map(r=>['Счета',r.name,'Остаток',r.balance]),
 ...report.inventory.byProduct.map(r=>['Склад',r.productId,'Прибыль / убыток',r.profit]),
 ...report.market.products.map(r=>['Рынок',r.id+' · '+r.name,'Медианная цена',r.median??'']),
 ...report.market.products.flatMap(p=>p.series.map(r=>['История цен',p.id+' · '+r.date,'Медиана за день',r.value]))];
 return '\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
