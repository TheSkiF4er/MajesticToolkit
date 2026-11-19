import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRecord} from '../src/lib/economy-core.mjs';
import {newMarketRecord} from '../src/lib/marketplace-core.mjs';
import {newInventoryEvent,inventorySnapshot} from '../src/lib/inventory-core.mjs';
import {newFinanceEvent,financeSnapshot} from '../src/lib/finance-core.mjs';
import {analyzeEconomy,analyticsCsv} from '../src/lib/advanced-economy-analytics.mjs';
const pid='profile_analytics218',other='profile_other218',from='2026-11-01',to='2026-11-30';
const f=(kind,values)=>newFinanceEvent(pid,kind,{...values,date:values.date??'2026-11-05'});
function setup(){
 const product=newMarketRecord('product',pid,{name:'Car X',category:'Транспорт',variant:'',unit:'шт.',note:''});
 const price=(date,kind,value)=>newMarketRecord('price',pid,{productId:product.id,date,kind,price:value,quantity:1,source:'Observed',url:'',note:''});
 const market=[product,price('2026-11-05','completed',500),price('2026-11-05','completed',1000),price('2026-11-07','completed',900),price('2026-11-08','ask',5000),newMarketRecord('listing',pid,{productId:product.id,kind:'sell',status:'active',postedAt:'2026-11-08',expiresAt:'',price:1100,quantity:2,seller:'Trader',source:'Manual',url:'',note:''})];
 const open=f('account-open',{name:'Касса А',ownerType:'personal',ownerId:'',openingBalance:100});
 const otherOpen=f('account-open',{name:'Касса B',ownerType:'personal',ownerId:'',openingBalance:0});
 const older=f('income',{accountId:open.accountId,category:'Trade',amount:25,date:'2026-10-16'});
 const income=f('income',{accountId:open.accountId,category:'Sales',amount:1000});
 const transfer=f('transfer',{accountId:open.accountId,toAccountId:otherOpen.accountId,amount:500,category:'Other'});
 const spending=f('expense',{accountId:otherOpen.accountId,category:'Supplies',amount:200,date:'2026-11-06'});
 const finance=financeSnapshot({profileId:pid,events:[open,otherOpen,older,income,transfer,spending]});
 const purchase=newInventoryEvent(pid,'purchase',{date:'2026-11-05',productId:product.id,quantity:3,ownerType:'personal',ownerName:'',unitPrice:100,fee:30,assetTag:''});
 const sale=newInventoryEvent(pid,'sale',{date:'2026-11-07',productId:product.id,lotId:purchase.id,quantity:2,ownerType:'personal',ownerName:'',unitPrice:180,fee:20});
 const writeoff=newInventoryEvent(pid,'writeoff',{date:'2026-11-08',productId:product.id,lotId:purchase.id,quantity:1,ownerType:'personal',ownerName:''});
 const inventory=inventorySnapshot([purchase,sale,writeoff],pid,market);
 const legacy=[createRecord('deal',pid,{date:'2026-11-08',title:'Other deal',category:'Транспорт',status:'closed',quantity:1,buyPrice:100,salePrice:200,buyFee:0,saleFee:0,note:''}),createRecord('cash',pid,{date:'2026-11-09',kind:'income',title:'cash',amount:50,note:''}),createRecord('cash',other,{date:'2026-11-09',kind:'income',title:'secret',amount:999999,note:''})];
 return {product,market,finance,inventory,legacy,report:()=>analyzeEconomy({profileId:pid,from,to,market,finance,inventory,legacy})};
}
test('finance money flow excludes internal transfers, holds lifetime balance and compares equal prior period',()=>{
 const r=setup().report();assert.equal(r.finance.income,1000);assert.equal(r.finance.expense,200);assert.equal(r.finance.net,800);assert.equal(r.finance.balance,925);assert.equal(r.finance.transfers.volume,500);assert.equal(r.finance.transfers.internal,500);
 assert.equal(r.finance.previous.income,25);assert.equal(r.finance.comparison.income.absolute,975);assert.equal(r.finance.comparison.income.percent,3900);
 assert.equal(r.finance.categories.find(x=>x.name==='Расход · Supplies')?.value,200);
 assert.equal(r.finance.daily.length,2);assert.equal(r.period.days,30);
});
test('legacy, warehouse, finance are separated; warehouses include real cost and writeoffs',()=>{
 const r=setup().report();assert.equal(r.legacy.revenue,250);assert.equal(r.legacy.cost,100);assert.equal(r.legacy.net,150);
 assert.equal(r.inventory.sales,340);assert.equal(r.inventory.cogs,220);assert.equal(r.inventory.writeoffs,110);assert.equal(r.inventory.profit,10);
 assert.equal(r.inventory.units,0);assert.equal(r.inventory.value,0);assert.equal(r.separateLedgers,true);
 assert.notEqual(r.finance.net+r.legacy.net+r.inventory.profit,r.finance.net);
});
test('price median selects completed transactions, groups by day, and shows best active ask',()=>{
 const {report}=setup(),r=report(),p=r.market.products[0];assert.equal(p.observations,4);assert.equal(p.completed,3);assert.equal(p.median,900);assert.equal(p.first,750);assert.equal(p.last,900);assert.equal(p.change,20);assert.deepEqual(p.series.map(x=>x.value),[750,900]);assert.equal(p.bestAsk,1100);assert.equal(p.bestBid,null);
});
test('market filtering by product, owner scope and missing ID protection',()=>{
 const {product,finance,market,inventory,legacy}=setup();
 const narrowed=analyzeEconomy({profileId:pid,from,to,productId:product.id,owner:'personal',market,finance,inventory,legacy});
 assert.equal(narrowed.market.products.length,1);assert.equal(narrowed.finance.income,1000);
 const hidden=analyzeEconomy({profileId:pid,from,to,owner:'organization:organization_0099',market,finance,inventory,legacy});assert.equal(hidden.finance.income,0);assert.equal(hidden.finance.balance,0);
 assert.throws(()=>analyzeEconomy({profileId:pid,from,to,productId:'product_ghost000',market,finance,inventory,legacy}),/Товар отсутствует/);
 assert.throws(()=>analyzeEconomy({profileId:other,from,to,market,finance,inventory,legacy}),/Чужой финансовый/);
});
test('dates, corrupt market and integer overflow fail closed',()=>{
 const x=setup(),base={profileId:pid,from,to,finance:x.finance,market:x.market,inventory:x.inventory,legacy:x.legacy};
 assert.throws(()=>analyzeEconomy({...base,from:'2026-11-31'}),/дат/);
 assert.throws(()=>analyzeEconomy({...base,from:'2026-12-01'}),/дат/);
 assert.throws(()=>analyzeEconomy({...base,market:[{...x.market[0],name:'Changed'},...x.market]}),/Повторяющийся/);
 assert.throws(()=>analyzeEconomy({...base,owner:'hacker'}),/фильтр/);
});
test('CSV is complete, UTF-8 BOM, and retains distinct sources',()=>{
 const csv=analyticsCsv(setup().report());assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/Кассы/);assert.match(csv,/История цен/);assert.match(csv,/Склад/);assert.match(csv,/Старый журнал/);assert.match(csv,/\r\n/);
});
