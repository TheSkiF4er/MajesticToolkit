import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {newInventoryEvent,inventorySnapshot,inventoryCsv,validateInventoryBatches,INVENTORY_PREFIX} from '../src/lib/inventory-core.mjs';
const mem=new Map(),clone=structuredClone;
globalThis.browser={storage:{local:{
 async get(k){if(k===null)return Object.fromEntries([...mem].map(([id,v])=>[id,clone(v)]));const list=Array.isArray(k)?k:[k];return Object.fromEntries(list.filter(id=>mem.has(id)).map(id=>[id,clone(mem.get(id))]));},
 async set(data){for(const [id,value] of Object.entries(data))mem.set(id,clone(value));},
 async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])mem.delete(key);}
}}};
const market=await import('../src/lib/marketplace-store.mjs');
const store=await import('../src/lib/inventory-store.mjs');
const backup=await import('../src/lib/justice-backup.mjs');
const state=defaultState(),profile=state.activeProfileId,foreign='profile_other_213';
const product={name:'Машина <script>alert(1)</script>',category:'Транспорт',variant:'QA',unit:'шт.',note:''};
const purchase={date:'2026-11-18',quantity:10,ownerType:'personal',ownerName:'',unitPrice:100,fee:20,note:'Закупка'};
let p,lot;
beforeEach(async()=>{mem.clear();p=await market.addMarketplace('product',profile,product);lot=(await store.inventoryAction(profile,'purchase',{...purchase,productId:p.id})).event;});
test('actual partial sales allocate purchase fee once, preserve cost of remaining stock',async()=>{
 const sold=await store.inventoryAction(profile,'sale',{date:'2026-11-19',productId:p.id,lotId:lot.id,ownerType:'personal',ownerName:'',quantity:4,unitPrice:150,fee:10,note:''});
 assert.equal(sold.snapshot.totals.purchases,1020);assert.equal(sold.snapshot.totals.sales,590);
 assert.equal(sold.snapshot.totals.cogs,408);assert.equal(sold.snapshot.totals.tradingProfit,182);
 assert.equal(sold.snapshot.totals.stockValue,612);assert.equal(sold.snapshot.stock[0].available,6);
 assert.equal((await store.loadInventory(profile)).totals.tradingProfit,182);
});
test('transfers, reserves and releases do not sell stock or double count value',async()=>{
 await store.inventoryAction(profile,'transfer',{date:purchase.date,productId:p.id,lotId:lot.id,quantity:3,ownerType:'personal',ownerName:'',toOwnerType:'family',toOwnerName:'Fletcher',note:''});
 let data=await store.loadInventory(profile);
 assert.equal(data.stock.length,2);assert.equal(data.totals.stockValue,1020);
 await store.inventoryAction(profile,'reserve',{date:purchase.date,productId:p.id,lotId:lot.id,quantity:2,ownerType:'family',ownerName:'Fletcher',note:''});
 await assert.rejects(store.inventoryAction(profile,'sale',{date:purchase.date,productId:p.id,lotId:lot.id,quantity:2,ownerType:'family',ownerName:'Fletcher',unitPrice:300,fee:0,note:''}),/Недостаточно/);
 await store.inventoryAction(profile,'release',{date:purchase.date,productId:p.id,lotId:lot.id,quantity:1,ownerType:'family',ownerName:'Fletcher',note:''});
 await store.inventoryAction(profile,'sale',{date:purchase.date,productId:p.id,lotId:lot.id,quantity:2,ownerType:'family',ownerName:'Fletcher',unitPrice:150,fee:0,note:''});
 data=await store.loadInventory(profile);
 assert.equal(data.totals.cogs,204);assert.equal(data.totals.tradingProfit,96);
 assert.equal(data.totals.stockValue,816);assert.equal(data.stock.find(x=>x.ownerType==='family').quantity,1);
});
test('writeoff is loss, not revenue; undo is auditable and disallows dependent changes',async()=>{
 const writeoff=(await store.inventoryAction(profile,'writeoff',{date:purchase.date,productId:p.id,lotId:lot.id,ownerType:'personal',ownerName:'',quantity:1,note:'Утрачен'})).event;
 assert.equal((await store.loadInventory(profile)).totals.realizedProfit,-102);
 await store.inventoryAction(profile,'void',{date:purchase.date,reversesId:writeoff.id,note:'Исправление'});
 const corrected=await store.loadInventory(profile);
 assert.equal(corrected.totals.realizedProfit,0);assert.equal(corrected.totals.stockUnits,10);assert.equal(corrected.events.length,3);assert.ok(corrected.voided.has(writeoff.id));
 await assert.rejects(store.inventoryAction(profile,'void',{date:purchase.date,reversesId:writeoff.id,note:''}),/Недопустимая/);
 await store.inventoryAction(profile,'sale',{date:purchase.date,productId:p.id,lotId:lot.id,quantity:1,ownerType:'personal',ownerName:'',unitPrice:150,fee:0,note:''});
 await assert.rejects(store.inventoryAction(profile,'void',{date:purchase.date,reversesId:lot.id,note:''}),/после которого/);
});
test('unique-asset register, safe number arithmetic, cross-profile and invalid movements',async()=>{
 const asset=(await store.inventoryAction(profile,'purchase',{...purchase,quantity:1,productId:p.id,assetTag:'VIN-123'})).event;
 await assert.rejects(store.inventoryAction(profile,'purchase',{...purchase,quantity:1,productId:p.id,assetTag:'vin-123'}),/уже используется/);
 await assert.rejects(store.inventoryAction(profile,'purchase',{...purchase,productId:p.id,assetTag:'VIN-999'}),/количество 1/);
 await assert.rejects(store.inventoryAction(foreign,'sale',{date:purchase.date,productId:p.id,lotId:asset.id,quantity:1,ownerType:'personal',ownerName:'',unitPrice:1,fee:0,note:''}),/Товар отсутствует/);
 await assert.rejects(store.inventoryAction(profile,'purchase',{...purchase,quantity:1000000,unitPrice:1000000000000,productId:p.id}),/Переполнение/);
 await assert.rejects(store.inventoryAction(profile,'sale',{date:purchase.date,productId:p.id,lotId:asset.id,quantity:2,ownerType:'personal',ownerName:'',unitPrice:1,fee:0,note:''}),/Недостаточно/);
 assert.equal((await store.loadInventory(profile)).stockUnits,undefined);
 assert.equal((await store.loadInventory(profile)).totals.stockUnits,11);
});
test('cannot delete referenced product, archive still permits liquidation',async()=>{
 await assert.rejects(market.removeMarketplace(p.id,profile),/складских/);
 await assert.rejects(market.replaceMarketplace([],[profile]),/складским/);
 await market.updateMarketplace(p.id,profile,{archived:true});
 await assert.rejects(store.inventoryAction(profile,'purchase',{...purchase,productId:p.id}),/архивный/);
 await store.inventoryAction(profile,'sale',{date:purchase.date,productId:p.id,lotId:lot.id,quantity:1,ownerType:'personal',ownerName:'',unitPrice:120,fee:0,note:''});
 assert.equal((await store.loadInventory(profile)).totals.stockUnits,9);
});
test('restore validates all linked profiles/products, rolls back interrupted storage write',async()=>{
 const before=await store.listInventory();assert.equal(before.length,1);
 await assert.rejects(store.replaceInventory([{profileId:foreign,events:before[0].events}], [profile],await market.listMarketplace()),/отсутствующему/);
 await assert.rejects(store.replaceInventory([{profileId:profile,events:[{...lot,productId:'nonexistent_item'}]}],[profile],await market.listMarketplace()),/отсутствует/);
 const previousRemove=globalThis.browser.storage.local.remove;let count=0;
 globalThis.browser.storage.local.remove=async rows=>{await previousRemove(rows);if(++count===1)throw Error('Interrupted');};
 try{await assert.rejects(store.replaceInventory([], [profile],await market.listMarketplace()),/Interrupted/);}finally{globalThis.browser.storage.local.remove=previousRemove;}
 assert.deepEqual(await store.listInventory(),before);
 assert.throws(()=>validateInventoryBatches([before[0],before[0]]),/Повторяется/);
});
test('Backup v19 roundtrip validates stock and retains historical import without new inventory',async()=>{
 const {defaultProductivity}=await import('../src/lib/productivity-core.mjs');
 const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const punishment={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},operations={version:1,profiles:[]};
 const products=await market.listMarketplace(),batches=await store.listInventory();
 const serialized=await backup.makeBackupV19(args,punishment,sections,registry,operations,[],null,products,batches);
 const parsed=await backup.parseBackupV19(serialized,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.deepEqual(parsed.tradingInventory,batches);
 const corrupt=JSON.parse(serialized);corrupt.tradingInventory[0].events[0].productId='missing_product_id';
 await assert.rejects(backup.parseBackupV19(JSON.stringify(corrupt),validateState,globalThis.RPNForumCore.cleanTemplate),/отсутствует/);
 delete corrupt.tradingInventory;
 const legacy=await backup.parseBackupV19(JSON.stringify(corrupt),validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(legacy.tradingInventory,null);
});
test('view escapes user-owned values; CSV serializes cancellation and blocks formulas',async()=>{
 const view=await import('../src/ui/trading-page.mjs');await view.refreshTrading(profile);
 const html=view.tradingSection(state);
 assert.match(html,/Trading & Inventory/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
 const formula=(await store.inventoryAction(profile,'sale',{date:purchase.date,productId:p.id,lotId:lot.id,quantity:1,ownerType:'personal',ownerName:'',unitPrice:120,fee:0,note:'=HYPERLINK("danger")'})).event;
 const csv=inventoryCsv(await store.loadInventory(profile));assert.match(csv,/"'=HYPERLINK/);
 await store.inventoryAction(profile,'void',{date:purchase.date,reversesId:formula.id,note:'исправлено'});
 assert.match(inventoryCsv(await store.loadInventory(profile)),/cancelled/);assert.match(inventoryCsv(await store.loadInventory(profile)),/yes/);
});
