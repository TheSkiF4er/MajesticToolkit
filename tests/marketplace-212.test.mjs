import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {MARKET_PREFIX,newMarketRecord,changeMarketRecord,cleanMarketRecord,validateMarketplace,compareProductPrices,marketStats} from '../src/lib/marketplace-core.mjs';
const mem=new Map(),clone=structuredClone;
globalThis.browser={storage:{local:{
 async get(k){if(k===null)return Object.fromEntries([...mem].map(([id,v])=>[id,clone(v)]));const list=Array.isArray(k)?k:[k];return Object.fromEntries(list.filter(id=>mem.has(id)).map(id=>[id,clone(mem.get(id))]));},
 async set(values){for(const [key,v] of Object.entries(values))mem.set(key,clone(v));},
 async remove(k){for(const key of Array.isArray(k)?k:[k])mem.delete(key);}
}}};
const store=await import('../src/lib/marketplace-store.mjs');
const backup=await import('../src/lib/justice-backup.mjs');
const state=defaultState(),profile=state.activeProfileId;
const product={name:'Спорткар <script>alert(1)</script>',category:'Транспорт',variant:'Sport',unit:'шт.',note:'Проверка'};
const price={date:'2026-11-17',kind:'ask',price:100000,quantity:2,source:'Форум',url:'https://forum.example.com/offer/123',note:''};
const listing={kind:'sell',status:'active',postedAt:'2026-11-18',expiresAt:'2026-11-30',price:110000,quantity:1,seller:'Seller QA',source:'Объявление',url:'',note:''};
beforeEach(()=>mem.clear());
test('catalog and verified-price observations persist, edit and link to real products',async()=>{
 const p=await store.addMarketplace('product',profile,product);
 const x=await store.addMarketplace('price',profile,{...price,productId:p.id});
 const y=await store.addMarketplace('listing',profile,{...listing,productId:p.id});
 assert.equal((await store.listMarketplace(profile)).length,3);
 assert.equal((await store.getMarketplace(p.id,profile)).name,product.name);
 const edit=await store.updateMarketplace(x.id,profile,{price:120000,productId:'evil',profileId:'evil'});
 assert.equal(edit.productId,p.id);assert.equal(edit.price,120000);
 const stats=compareProductPrices(await store.listMarketplace(),profile,p.id);
 assert.equal(stats.median,120000);assert.equal(stats.bestAsk,110000);assert.equal(stats.active.length,1);
 await assert.rejects(store.removeMarketplace(p.id,profile),/используется/);
 await assert.rejects(store.updateMarketplace(p.id,profile,{archived:true}),/объявления/);
 await store.updateMarketplace(y.id,profile,{status:'closed'});await store.updateMarketplace(p.id,profile,{archived:true});assert.equal((await store.getMarketplace(p.id,profile)).archived,true);
 await store.removeMarketplace(x.id,profile);await store.removeMarketplace(y.id,profile);
 await store.removeMarketplace(p.id,profile);assert.equal((await store.listMarketplace()).length,0);
});
test('source and quantity validation refuses malformed data, non-HTTPS and bad dates',()=>{
 const p=newMarketRecord('product',profile,product);
 for(const patch of [{url:'javascript:alert(1)'},{url:'http://forum.example.com'},{url:'https://user:pass@forum.example.com'},{date:'2026-02-30'},{price:-1},{price:'1e6'},{quantity:0},{source:'\n'}])assert.throws(()=>newMarketRecord('price',profile,{...price,productId:p.id,...patch}));
 assert.throws(()=>newMarketRecord('listing',profile,{...listing,productId:p.id,expiresAt:'2026-11-01'}));
 assert.equal(cleanMarketRecord({...p,untrusted:'bad'}).untrusted,undefined);
});
test('cross-profile references, duplicate identifiers and orphan observations are blocked',async()=>{
 const p=await store.addMarketplace('product',profile,product);
 await assert.rejects(store.addMarketplace('price','other-profile',{...price,productId:p.id}),/отсутствующий|чужой/);
 await assert.rejects(store.addMarketplace('listing',profile,{...listing,productId:'non-existing-item'}));
 await assert.rejects(store.addMarketplace('product',profile,{...product,name:product.name.toUpperCase()}),/уже существует/);
 await assert.rejects(store.updateMarketplace(p.id,'other-profile',{name:'mine'}));
 await assert.rejects(store.removeMarketplace(p.id,'other-profile'));
 assert.throws(()=>validateMarketplace([p,p]));
 assert.throws(()=>validateMarketplace([p],['other-profile']));
});
test('descriptive analytics compare bids, asks, history, median and exclude expired offers',()=>{
 const p=newMarketRecord('product',profile,product);
 const obs=[
  newMarketRecord('price',profile,{...price,productId:p.id,price:100,date:'2026-11-01',kind:'ask'}),
  newMarketRecord('price',profile,{...price,productId:p.id,price:140,date:'2026-11-08',kind:'completed'}),
  newMarketRecord('price',profile,{...price,productId:p.id,price:160,date:'2026-11-18',kind:'completed'}),
  newMarketRecord('price',profile,{...price,productId:p.id,price:1000,date:'2027-11-18',kind:'completed'})
 ];
 const bid=newMarketRecord('listing',profile,{...listing,productId:p.id,kind:'buy',price:145});
 const ask=newMarketRecord('listing',profile,{...listing,productId:p.id,price:170});
 const expired=newMarketRecord('listing',profile,{...listing,productId:p.id,postedAt:'2026-11-01',expiresAt:'2026-11-12',price:1});
 const stats=compareProductPrices([p,...obs,bid,ask,expired],profile,p.id);
 assert.equal(stats.median,150);assert.equal(stats.bestAsk,170);assert.equal(stats.bestBid,145);assert.equal(stats.spread,25);assert.equal(stats.history.length,3);
 assert.equal(marketStats([p,...obs],profile,p.id,'2026-11-03').observations,1);
});
test('replacement validates associations before mutating and rolls back partial storage failure',async()=>{
 const p=await store.addMarketplace('product',profile,product);
 const x=await store.addMarketplace('price',profile,{...price,productId:p.id});
 await assert.rejects(store.replaceMarketplace([x],[profile]));
 assert.equal((await store.listMarketplace()).length,2);
 const originalSet=globalThis.browser.storage.local.set;
 let failures=0;
 globalThis.browser.storage.local.set=async updates=>{await originalSet(updates);if(++failures===1)throw Error('write interrupted');};
 try{await assert.rejects(store.replaceMarketplace([p],[profile]),/interrupted/);}finally{globalThis.browser.storage.local.set=originalSet;}
 assert.deepEqual((await store.listMarketplace()).map(r=>r.id).sort(),[p.id,x.id].sort());
});
test('backup v19 round-trip preserves verified catalog, prices and listings',async()=>{
 const p=await store.addMarketplace('product',profile,product),x=await store.addMarketplace('price',profile,{...price,productId:p.id});
  const before=await store.listMarketplace();
 const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const punishment={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},operations={version:1,profiles:[]};
 const json=await backup.makeBackupV19(args,punishment,sections,registry,operations,[],null,before);
 const parsed=await backup.parseBackupV19(json,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.deepEqual(parsed.marketplace,before);
 const forged=JSON.parse(json);forged.marketplace.find(x=>x.type==='price').productId='missing_product_id';
 await assert.rejects(backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate));
 delete forged.marketplace;const legacy=await backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(legacy.marketplace,null);
});
test('marketplace view escapes names and displays data persisted by store',async()=>{
 const p=await store.addMarketplace('product',profile,product);
 await store.addMarketplace('price',profile,{...price,productId:p.id});
 const view=await import('../src/ui/marketplace-page.mjs');await view.refreshMarketplace();
 const html=view.marketplaceSection(state);
 assert.match(html,/marketplace-form/);assert.match(html,/100\s?000/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
});
