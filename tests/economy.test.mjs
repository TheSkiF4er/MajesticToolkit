import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import { PREFIX,cleanRecord,createRecord,editRecord,resaleCalc,craftCalc,workCalc,dealTotals,summarizeEconomy,summarizeMatches,toCsv,validateRecords } from '../src/lib/economy-core.mjs';
const mem=new Map();
const clone=x=>structuredClone(x);
globalThis.browser={storage:{local:{
 async get(keys){if(keys===null)return Object.fromEntries([...mem].map(([k,v])=>[k,clone(v)]));const arr=Array.isArray(keys)?keys:[keys];return Object.fromEntries(arr.filter(k=>mem.has(k)).map(k=>[k,clone(mem.get(k))]));},
 async set(data){for(const [k,v] of Object.entries(data))mem.set(k,clone(v));},
 async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])mem.delete(k);}
}}};
const store=await import('../src/lib/economy-store.mjs');
const backup=await import('../src/lib/economy-backup.mjs');
let state,pid;
const deal={date:'2026-10-21',title:'Автомобиль',category:'Транспорт',quantity:2,buyPrice:1000,salePrice:1400,buyFee:100,saleFee:50,note:''};
const cash={date:'2026-10-21',kind:'expense',title:'Аренда',amount:300,note:''};
const match={date:'2026-10-21',player:'William Bailey',family:'Fletcher',opponent:'Rivals',mode:'Капт',result:'win',kills:4,deaths:2,damage:950,note:''};
beforeEach(()=>{mem.clear();state=defaultState();pid=state.activeProfileId;});
test('deal calculation includes fees, item count and ROI',()=>{const r=resaleCalc({quantity:2,buyPrice:1000,salePrice:1400,buyFee:100,saleFee:50});assert.deepEqual(r,{invested:2100,revenue:2750,profit:650,roi:650/2100*100});});
test('zero investment has nullable ROI; loss represented correctly',()=>{const n=resaleCalc({quantity:1,buyPrice:1500,salePrice:1000,buyFee:0,saleFee:10});assert.equal(n.profit,-510);assert.equal(resaleCalc({quantity:1,buyPrice:0,salePrice:1}).roi,null);});
test('craft expected costs account for probability',()=>{const r=craftCalc({units:10,successPercent:50,materialCost:100,feePerAttempt:25,salePrice:300});assert.equal(r.attempts,20);assert.equal(r.spent,2500);assert.equal(r.profit,500);assert.equal(r.breakEven,250);});
test('work calculator returns profit per hour and net values',()=>{const r=workCalc({runs:6,minutesPerRun:20,incomePerRun:1000,costPerRun:200});assert.equal(r.profit,4800);assert.equal(r.hours,2);assert.equal(r.perHour,2400);});
test('invalid numeric inputs, dates, results and category rejected',()=>{
 for(const patch of [{date:'2026-02-30'}, {quantity:0},{quantity:1.5},{buyPrice:'1e5'},{salePrice:-1},{category:'<script>'},{status:'evil'},{title:'x'.repeat(121)}])assert.throws(()=>createRecord('deal',pid,{...deal,...patch}));
 for(const patch of [{result:'unknown'},{deaths:-1},{damage:Infinity}])assert.throws(()=>createRecord('match',pid,{...match,...patch}));
 for(const pct of ['0','101','wat','0.001'])assert.throws(()=>craftCalc({units:1,successPercent:pct,materialCost:1}));
});
test('records validate and patch with immutable type/profile/id',()=>{const r=createRecord('deal',pid,deal);const n=editRecord(r,{title:'Обновлено',type:'cash',profileId:'other',id:'evil',buyPrice:1100});assert.equal(n.id,r.id);assert.equal(n.type,'deal');assert.equal(n.profileId,pid);assert.equal(n.buyPrice,1100);assert.equal(n.title,'Обновлено');assert.ok(n.updatedAt);});
test('aggregates cash flow + closed deals by date, ignoring match records',()=>{const rows=[createRecord('deal',pid,deal),createRecord('cash',pid,cash),createRecord('match',pid,match)];const t=summarizeEconomy(rows);assert.equal(t.revenue,2750);assert.equal(t.costs,2400);assert.equal(t.profit,350);assert.equal(t.deals,1);assert.equal(t.positive,1);assert.equal(t.days.length,1);assert.equal(t.days[0].profit,350);});
test('groups repeated player and family performances accurately',()=>{const a=createRecord('match',pid,match),b=createRecord('match',pid,{...match,result:'loss',kills:1,deaths:4,damage:500});const p=summarizeMatches([a,b]);assert.equal(p[0].matches,2);assert.equal(p[0].winRate,50);assert.equal(p[0].kd,5/6);assert.equal(p[0].avgDamage,725);assert.equal(summarizeMatches([a,b],'family')[0].name,'Fletcher');});
test('CSV handles quotes and prevents spreadsheet formula injection',()=>{const a=createRecord('deal',pid,{...deal,title:'=IMPORTXML("http://unsafe")',note:'"bad";newline\nline'});const text=toCsv([a],'deal');assert.ok(text.startsWith('\ufeff'));assert.match(text,/"'=IMPORTXML/);assert.match(text,/""bad""/);assert.ok(!text.includes('javascript:'));});
test('storage isolates profiles, persists create/update/remove and rehydrates',async()=>{const a=await store.addEconomy('deal',pid,deal);const b=await store.addEconomy('cash','another-profile',cash);assert.equal((await store.listEconomy()).length,2);
 await store.updateEconomy(a.id,{buyPrice:1500});assert.equal((await store.getEconomy(a.id)).buyPrice,1500);await store.removeEconomy(a.id);assert.deepEqual((await store.listEconomy()).map(r=>r.id),[b.id]);});
test('storage refuses corrupt entry, duplicate snapshots and oversized counts',async()=>{const item=await store.addEconomy('deal',pid,deal);mem.set(PREFIX+'bad-identifier',{...item,id:'bad'});assert.equal((await store.listEconomy()).length,1);
 await assert.rejects(store.replaceEconomy([item,item]));assert.equal((await store.listEconomy()).length,1);assert.throws(()=>validateRecords([item,item]));});
test('replace records removes obsolete keys and keeps snapshot on invalid replacement',async()=>{await store.addEconomy('deal',pid,deal);const x=createRecord('cash',pid,cash);await store.replaceEconomy([x]);assert.deepEqual((await store.listEconomy()).map(r=>r.id),[x.id]);await assert.rejects(store.replaceEconomy([{...x,amount:-1}]));assert.deepEqual((await store.listEconomy()).map(r=>r.id),[x.id]);});
test('v4 backup round-trip includes economy and v3 artifacts',()=>{const r=createRecord('deal',pid,deal);const json=backup.makeBackupV4(state,[],[],[r],globalThis.RPNForumCore.cleanTemplate);const parsed=backup.parseBackupV4(json,validateState,globalThis.RPNForumCore.cleanTemplate);assert.equal(parsed.schemaVersion,4);assert.deepEqual(parsed.economy,[r]);assert.deepEqual(parsed.cases,[]);});
test('v1 and v3 backup migration reads without economy records',()=>{const ts=new Date().toISOString();for(const schemaVersion of [1,3]){const data=JSON.stringify({format:'rp-nexus-backup',schemaVersion,exportedAt:ts,payload:state,...(schemaVersion>=3?{forumTemplates:[],complaints:[]}: {})});const parsed=backup.parseBackupV4(data,validateState,globalThis.RPNForumCore.cleanTemplate);assert.deepEqual(parsed.economy,[]);assert.equal(parsed.schemaVersion,schemaVersion);}});
test('backup rejects orphan economy records, duplicate IDs and malformed amounts',()=>{const r=createRecord('deal',pid,deal);const text=backup.makeBackupV4(state,[],[],[r],globalThis.RPNForumCore.cleanTemplate);for(const economy of [[r,r],[{...r,profileId:'missing'}],[{...r,buyPrice:-4}]]){const payload=JSON.parse(text);payload.economy=economy;assert.throws(()=>backup.parseBackupV4(JSON.stringify(payload),validateState,globalThis.RPNForumCore.cleanTemplate));}});
test('excludes unapproved fields from imported records',()=>{const input=createRecord('cash',pid,cash);assert.equal(Object.hasOwn(cleanRecord({...input,script:'<evil>',cookie:'private'}),'script'),false);});

test('open positions are tracked as capital and excluded from realized P&L',()=>{const open=createRecord('deal',pid,{...deal,status:'open'});const summary=summarizeEconomy([open]);assert.equal(summary.profit,0);assert.equal(summary.deals,0);assert.equal(summary.openDeals,1);assert.equal(summary.openCapital,2100);assert.equal(summary.days.length,0);const sold=editRecord(open,{status:'closed'});assert.equal(summarizeEconomy([sold]).profit,650);});

test('rejects positions exceeding integer-safe arithmetic before persistence',()=>{assert.throws(()=>createRecord('deal',pid,{...deal,quantity:1000000,buyPrice:1000000000000}));});

test('renders actual statistics into the view and HTML-escapes user-controlled labels',async()=>{const ui=await import('../src/ui/economy-page.mjs');await store.addEconomy('deal',pid,{...deal,title:'<img src=x onerror=alert(1)>'});await store.addEconomy('match',pid,match);await ui.refreshEconomy();const html=ui.economySection(state);assert.ok(html.includes('650'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('economy-chart'));assert.ok(html.includes('economy-bars'));assert.ok(html.includes('economy-form'));});
