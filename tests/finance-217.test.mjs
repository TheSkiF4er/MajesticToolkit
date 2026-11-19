import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {FINANCE_PREFIX,financeSnapshot,validateFinanceBatches,financeCSV} from '../src/lib/finance-core.mjs';
const mem=new Map(),clone=structuredClone;
globalThis.browser={storage:{local:{
 async get(key){if(key===null)return Object.fromEntries([...mem].map(([k,v])=>[k,clone(v)]));return Object.fromEntries((Array.isArray(key)?key:[key]).filter(k=>mem.has(k)).map(k=>[k,clone(mem.get(k))]));},
 async set(values){for(const [k,v] of Object.entries(values))mem.set(k,clone(v));},
 async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])mem.delete(k);}
}}};
const store=await import('../src/lib/finance-store.mjs'),families=await import('../src/lib/family-store.mjs'),organizations=await import('../src/lib/organization-store.mjs'),backup=await import('../src/lib/justice-backup.mjs');
const state=defaultState(),pid=state.activeProfileId;
const action=async(kind,values)=>store.financeAction(pid,kind,values);
beforeEach(()=>mem.clear());
test('create cash accounts, deposit, withdraw, transfer balances and no double-counting',async()=>{
 const a=(await action('account-open',{name:'Касса',ownerType:'personal',openingBalance:200})).snapshot.accounts[0];
 const b=(await action('account-open',{name:'Резерв',ownerType:'personal',openingBalance:0})).snapshot.accounts[1];
 await action('income',{accountId:a.id,amount:100,date:'2026-11-19',category:'Продажи'});
 await action('expense',{accountId:a.id,amount:25,date:'2026-11-19',category:'Расходы'});
 const s=(await action('transfer',{accountId:a.id,toAccountId:b.id,amount:50,date:'2026-11-19'})).snapshot;
 assert.equal(s.accounts.find(x=>x.id===a.id).balance,225);assert.equal(s.accounts.find(x=>x.id===b.id).balance,50);
 assert.equal(s.totalBalance,275);assert.deepEqual(s.totals,{income:100,expense:25,transfers:50});
 assert.equal(s.movements.length,3);assert.match(financeCSV(s),/Продажи/);
 await assert.rejects(action('expense',{accountId:b.id,amount:51}),/Недостаточно/);
 await assert.rejects(action('transfer',{accountId:b.id,toAccountId:b.id,amount:1}),/одинаковый/);
 assert.equal((await store.loadFinance(pid)).movements.length,3);
});
test('budget month/category/account tracking, overspend alert and update',async()=>{
 const account=(await action('account-open',{name:'Транспорт',ownerType:'personal'})).snapshot.accounts[0];
 await action('income',{accountId:account.id,amount:3000});
 const b=(await action('budget-set',{accountId:account.id,category:'Топливо',month:'2026-11',limit:100})).snapshot.budgets[0];
 await action('expense',{accountId:account.id,amount:115,category:'Топливо',date:'2026-11-19'});
 await action('expense',{accountId:account.id,amount:99,category:'Топливо',date:'2026-12-19'});
 let snap=await store.loadFinance(pid);assert.equal(snap.budgets[0].used,115);assert.equal(snap.budgets[0].overLimit,true);
 snap=(await action('budget-set',{budgetId:b.id,accountId:account.id,category:'Топливо',month:'2026-11',limit:200})).snapshot;
 assert.equal(snap.budgets[0].remaining,85);assert.equal(snap.budgets[0].overLimit,false);
 await assert.rejects(action('budget-set',{accountId:account.id,category:'Топливо',month:'2026-11',limit:30}),/Дублирующийся/);
 await action('budget-close',{budgetId:b.id,closed:true});
 await assert.rejects(action('budget-set',{budgetId:b.id,accountId:account.id,category:'Топливо',month:'2026-11',limit:5}),/закрытый/);
});
test('reverse only last operation with audit, no invalid balances, account closure',async()=>{
 const a=(await action('account-open',{name:'Основной',ownerType:'personal'})).snapshot.accounts[0];
 const b=(await action('account-open',{name:'Второй',ownerType:'personal'})).snapshot.accounts[1];
 const inc=(await action('income',{accountId:a.id,amount:60})).event;
 const trans=(await action('transfer',{accountId:a.id,toAccountId:b.id,amount:40})).event;
 await assert.rejects(action('reverse',{reversesId:inc.id}),/последнюю/);
 const reversed=(await action('reverse',{reversesId:trans.id})).snapshot;
 assert.equal(reversed.accounts.find(x=>x.id===b.id).balance,0);assert.equal(reversed.accounts.find(x=>x.id===a.id).balance,60);
 await assert.rejects(action('reverse',{reversesId:trans.id}),/последнюю/);
 await assert.rejects(action('account-close',{accountId:a.id,closed:true}),/нулевым/);
 await action('reverse',{reversesId:inc.id});
 await action('account-close',{accountId:a.id,closed:true});
 await assert.rejects(action('income',{accountId:a.id,amount:2}),/закрытый/);
 await action('account-close',{accountId:a.id,closed:false});
 assert.equal((await store.loadFinance(pid)).events.length,8);
});
test('linked owner IDs, profile isolation and tampering detection',async()=>{
 const family=await families.addFamily(pid,{name:'Red Family',tag:'RED'});
 const org=await organizations.addOrganization(pid,{name:'Finance Org',type:'business'});
 const a=(await action('account-open',{name:'Семейная касса',ownerType:'family',ownerId:family.id})).snapshot.accounts[0];
 const b=(await action('account-open',{name:'Бюджет организации',ownerType:'organization',ownerId:org.id})).snapshot.accounts[1];
 assert.equal(a.ownerId,family.id);assert.equal(b.ownerId,org.id);
 await assert.rejects(action('account-open',{name:'Чужой счёт',ownerType:'family',ownerId:'missing_family_id'}),/отсутствует/);
 assert.equal((await store.loadFinance('other-profile')).accounts.length,0);
 const raw=clone(mem.get(FINANCE_PREFIX+pid));raw.events[0].ownerId='missing_family_id';
 assert.throws(()=>financeSnapshot(raw,{families:[family],organizations:[org]}),/отсутствует/);
 assert.throws(()=>validateFinanceBatches([raw],['different-profile']),/профиль|отсутствует/);
 mem.set(FINANCE_PREFIX+'wrong-profile',raw);await assert.rejects(store.listFinance(),/ключ/);
});
test('replacement is prevalidated and rolls back partially failed writes',async()=>{
 const acc=(await action('account-open',{name:'Безопасная касса',ownerType:'personal',openingBalance:50})).snapshot.accounts[0];
 const before=await store.listFinance();
 const corrupt=clone(before);corrupt[0].events.push({...corrupt[0].events[0],id:'duplicate_new_id',accountId:acc.id});
 await assert.rejects(store.replaceFinance(corrupt,[pid]),/уже существует/);
 const oldSet=globalThis.browser.storage.local.set;let failed=false;
 globalThis.browser.storage.local.set=async values=>{await oldSet(values);if(!failed){failed=true;throw Error('interrupted');}};
 try{await assert.rejects(store.replaceFinance([...before,{profileId:'other-profile',events:[]}],[pid,'other-profile']),/interrupted/);}finally{globalThis.browser.storage.local.set=oldSet;}
 assert.deepEqual(await store.listFinance(),before);
});
test('Backup v19 round-trip includes ledgers, rejects altered account transfer and retains legacy backup',async()=>{
 const family=await families.addFamily(pid,{name:'Finance Family'});
 const a=(await action('account-open',{name:'Касса семьи',ownerType:'family',ownerId:family.id,openingBalance:400})).snapshot.accounts[0];
 await action('expense',{accountId:a.id,amount:100,date:'2026-11-19',category:'Склад'});
 const rows=await store.listFinance();
 const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const p={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},operations={version:1,profiles:[]};
 const txt=await backup.makeBackupV19(args,p,sections,registry,operations,[],null,[],[],[family],[],[],[],rows);
 const parsed=await backup.parseBackupV19(txt,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.deepEqual(parsed.financeLedger,rows);
 const forged=JSON.parse(txt);forged.financeLedger[0].events.at(-1).amount=500;
 await assert.rejects(backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate),/Недостаточно/);
 delete forged.financeLedger;
 const old=await backup.parseBackupV19(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate);assert.equal(old.financeLedger,null);
});

test('financial owner dependencies block deletion, archive remains allowed',async()=>{
 const f=await families.addFamily(pid,{name:'Family Ledger'}),o=await organizations.addOrganization(pid,{name:'Org Ledger',type:'business'});
 await action('account-open',{name:'Family account',ownerType:'family',ownerId:f.id,openingBalance:0});
 await action('account-open',{name:'Org account',ownerType:'organization',ownerId:o.id,openingBalance:0});
 await assert.rejects(families.removeFamily(f.id,pid),/финансовом журнале/);
 await assert.rejects(organizations.removeOrganization(o.id,pid),/финансовом журнале/);
 const family=await families.updateFamily(f.id,pid,'archive',{archived:true,reason:'Archived'});assert.equal(family.archived,true);
});
test('failed single-ledger write after mutation is rolled back',async()=>{
 const originalSet=globalThis.browser.storage.local.set;let failures=0;
 globalThis.browser.storage.local.set=async values=>{await originalSet(values);if(++failures===1)throw Error('disk error');};
 try{await assert.rejects(action('account-open',{name:'Must rollback',ownerType:'personal'}),/disk error/);}finally{globalThis.browser.storage.local.set=originalSet;}
 assert.equal((await store.loadFinance(pid)).accounts.length,0);
});

test('view renders real balances and escapes user text',async()=>{
 await action('account-open',{name:'<script>alert(1)</script>',ownerType:'personal',openingBalance:123});
 const view=await import('../src/ui/finance-page.mjs');await view.refreshFinance(pid);
 const html=view.financeSection(state);assert.match(html,/123/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
});
