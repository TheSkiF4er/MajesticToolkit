import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {defaultState} from '../src/lib/model.mjs';
import {createRecord} from '../src/lib/economy-core.mjs';
import {ECONOMY_UI_KEY,ECONOMY_TABS,cleanEconomyUI,selectEconomyTab,setEconomyPref,rememberEconomyRecord,economySearch,economySnapshot} from '../src/lib/economy-workspace-core.mjs';
const memory=new Map(),clone=value=>structuredClone(value);
globalThis.browser={storage:{local:{async get(keys){if(keys===null)return Object.fromEntries([...memory].map(([k,v])=>[k,clone(v)]));const list=Array.isArray(keys)?keys:[keys];return Object.fromEntries(list.filter(k=>memory.has(k)).map(k=>[k,clone(memory.get(k))]));},async set(data){for(const [key,value]of Object.entries(data))memory.set(key,clone(value));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])memory.delete(key);}}}};
const store=await import('../src/lib/economy-store.mjs');
const page=await import('../src/ui/economy-page.mjs');
let state,a,b;
const deal={date:'2026-11-18',title:'Машина <script>alert(1)</script>',category:'Транспорт',status:'closed',quantity:2,buyPrice:200,salePrice:450,buyFee:10,saleFee:20,note:'Buy and sell'};
const cash={date:'2026-11-18',kind:'income',title:'Рыночная комиссия',amount:100,note:'Bank'};
const match={date:'2026-11-18',player:'Pilot QA',family:'Family Red',opponent:'Family Blue',mode:'Капт',result:'win',kills:4,deaths:1,damage:900,note:'Match'};
beforeEach(async()=>{memory.clear();state=defaultState();a=state.activeProfileId;b='profile-other211';state.profiles.push({...state.profiles[0],id:b,name:'Other profile',server:'Other'});await page.loadEconomyWorkspace(state);});
test('prefs clean corrupt/foreign input and bound values, never leak profiles',()=>{
 const raw={tabs:{[a]:'market',[b]:'groups',other:'finance'},filters:{[a]:'evil',[b]:'match'},queries:{[a]:'a'.repeat(300),other:'secret'},recent:[{profileId:a,id:'record_0001'},{profileId:a,id:'record_0001'},{profileId:'other',id:'record_0002'},{profileId:b,id:'bad'}]};
 const prefs=cleanEconomyUI(raw,[a,b]);assert.equal(prefs.tabs[a],'market');assert.equal(prefs.tabs[b],'groups');assert.equal(prefs.tabs.other,undefined);assert.equal(prefs.filters[a],undefined);assert.equal(prefs.queries[a].length,160);assert.equal(prefs.recent.length,1);
});
test('tab selection and filter reject unknown states, retain other profiles',()=>{
 const ids=[a,b];let prefs=cleanEconomyUI(null,ids);prefs=selectEconomyTab(prefs,a,'market',ids);prefs=selectEconomyTab(prefs,b,'groups',ids);prefs=setEconomyPref(prefs,a,'filters','cash',ids);
 assert.equal(prefs.tabs[a],'market');assert.equal(prefs.tabs[b],'groups');assert.equal(prefs.filters[a],'cash');
 assert.throws(()=>selectEconomyTab(prefs,a,'debug',ids));assert.throws(()=>setEconomyPref(prefs,a,'filters','all;DROP',ids));assert.throws(()=>selectEconomyTab(prefs,'another','market',ids));
 assert.equal(ECONOMY_TABS.length,10);assert.ok(ECONOMY_TABS.includes("inventory"));
});
test('recent is deduplicated, limited, follows profile and drops removed profile',()=>{
 const ids=[a,b];let prefs=cleanEconomyUI(null,ids);
 for(let i=0;i<35;i++)prefs=rememberEconomyRecord(prefs,a,'record_'+String(i).padStart(8,'0'),ids);
 prefs=rememberEconomyRecord(prefs,b,'record_00000000',ids);
 prefs=rememberEconomyRecord(prefs,a,'record_00000007',ids);
 assert.equal(prefs.recent.length,24);assert.deepEqual(prefs.recent[0],{id:'record_00000007',profileId:a});
 assert.equal(cleanEconomyUI(prefs,[b]).recent.length,1);
 assert.throws(()=>rememberEconomyRecord(prefs,a,'<script>',ids));
});
test('live search matches name, family, date, category, notes and respects profile',()=>{
 const rows=[createRecord('deal',a,deal),createRecord('cash',a,cash),createRecord('match',a,match),createRecord('match',b,{...match,player:'Hidden Person'})];
 assert.equal(economySearch(rows,a,'транспорт').length,1);assert.equal(economySearch(rows,a,'family red').length,1);assert.equal(economySearch(rows,a,'2026-11-18').length,3);assert.equal(economySearch(rows,a,'Bank').length,1);
 assert.equal(economySearch(rows,a,'Hidden Person').length,0);
 assert.equal(economySearch(rows,a,'','cash').length,1);
 assert.throws(()=>economySearch(rows,a,'','oops'));
});
test('overview derives real aggregates, no simulated cash flow or other-profile matches',()=>{
 const rows=[createRecord('deal',a,deal),createRecord('cash',a,cash),createRecord('match',a,match),createRecord('match',b,{...match,family:'Private'})];
 const snap=economySnapshot(rows,a);
 assert.equal(snap.stats.profit,570);assert.equal(snap.stats.revenue,980);assert.equal(snap.stats.costs,410);assert.equal(snap.families[0].name,'Family Red');assert.equal(snap.matches.length,1);assert.equal(snap.rows.length,3);
});
test('workspace stores tabs, queries, filters and recent edits across reload',async()=>{
 const record=await store.addEconomy('deal',a,deal);await page.refreshEconomy();
 await page.changeEconomyTab(state,'journal');await page.setEconomyFilter('deal',state);await page.setEconomySearch('Машина',state);await page.rememberEconomyOpen(state,record.id);
 const saved=memory.get(ECONOMY_UI_KEY);assert.equal(saved.tabs[a],'journal');assert.equal(saved.filters[a],'deal');assert.equal(saved.queries[a],'Машина');assert.equal(saved.recent[0].id,record.id);
 await page.loadEconomyWorkspace(state);assert.equal(page.currentEconomyTab(a),'journal');assert.ok(page.economySection(state).includes('Машина'));
 assert.equal((await store.getEconomy(record.id)).title,deal.title);
});
test('workspace renders actionable tabs, detailed groups, safe search and never exposes foreign entries',async()=>{
 await store.addEconomy('deal',a,deal);await store.addEconomy('match',a,match);await store.addEconomy('cash',b,{...cash,title:'Secret other profile'});
 await page.refreshEconomy();let html=page.economySection(state);assert.match(html,/Economy & Crime/);assert.match(html,/economy-tabs/);assert.match(html,/data-economy-action="new"/);assert.match(html,/data-economy-action="edit"/);assert.match(html,/economy-chart/);assert.match(html,/economy-bars/);assert.doesNotMatch(html,/Secret other profile/);assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 page.setEconomyLookup('Машина',state);html=page.economyLookupHTML(state);assert.match(html,/Машина/);assert.match(html,/&lt;script&gt;/);
 await page.changeEconomyTab(state,'groups');html=page.economySection(state);assert.match(html,/Family Red/);assert.match(html,/data-economy-action="family"/);
 await page.changeEconomyTab(state,'calculators');html=page.economySection(state);assert.match(html,/data-economy-calc="resale"/);
});
test('profile isolation for saved tabs, recent, search and cleanup',async()=>{
 await page.changeEconomyTab(state,'market');await page.setEconomySearch('needle',state);
 state.activeProfileId=b;await page.changeEconomyTab(state,'groups');await page.setEconomySearch('other',state);
 assert.equal(page.currentEconomyTab(a),'market');assert.equal(page.currentEconomyTab(b),'groups');
 state.profiles=state.profiles.filter(p=>p.id!==a);await page.forgetEconomyProfile(state);
 assert.equal(memory.get(ECONOMY_UI_KEY).tabs[a],undefined);assert.equal(memory.get(ECONOMY_UI_KEY).tabs[b],'groups');
});
