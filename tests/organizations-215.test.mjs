import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {ORGANIZATION_PREFIX,newOrganization,applyOrganization,cleanOrganization,validateOrganizations,organizationAssetsCsv} from '../src/lib/organization-core.mjs';
const mem=new Map(),clone=structuredClone;
globalThis.browser={storage:{local:{
 async get(key){if(key===null)return Object.fromEntries([...mem].map(([k,v])=>[k,clone(v)]));const keys=Array.isArray(key)?key:[key];return Object.fromEntries(keys.filter(k=>mem.has(k)).map(k=>[k,clone(mem.get(k))]));},
 async set(values){for(const [k,v] of Object.entries(values))mem.set(k,clone(v));},
 async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])mem.delete(key);}
}}};
const store=await import('../src/lib/organization-store.mjs'),backup=await import('../src/lib/justice-backup.mjs');
const state=defaultState(),pid=state.activeProfileId,base={name:'Org QA',type:'business',tag:'OQA',description:'Основная организация'};
beforeEach(()=>mem.clear());
const change=(org,kind,values)=>applyOrganization(org,kind,{reason:'Контроль',...values});
test('organization CRUD, units, positions, member transfer and append-only history',async()=>{
 let o=await store.addOrganization(pid,base);assert.equal(o.positions.length,2);
 const original=o.events.map(e=>e.id);
 o=await store.updateOrganization(o.id,pid,'unit-add',{name:'Снабжение',parentId:''});
 const unit=o.units[0];
 o=await store.updateOrganization(o.id,pid,'unit-add',{name:'Закупки',parentId:unit.id});
 const nested=o.units.at(-1);
 await assert.rejects(store.updateOrganization(o.id,pid,'unit-edit',{unitId:unit.id,name:'Снабжение',parentId:nested.id}),/цикл/);
 o=await store.updateOrganization(o.id,pid,'position-add',{name:'Кладовщик',unitId:nested.id,priority:3});
 const pos=o.positions.find(p=>p.name==='Кладовщик');
 o=await store.updateOrganization(o.id,pid,'member-join',{player:'Player QA',positionId:pos.id,date:'2026-11-19'});
 const member=o.members[0];
 await assert.rejects(store.updateOrganization(o.id,pid,'position-archive',{positionId:pos.id,archived:true}),/занята/);
 o=await store.updateOrganization(o.id,pid,'member-position',{memberId:member.id,positionId:o.positions.find(p=>p.name==='Руководитель').id,date:'2026-11-20'});
 o=await store.updateOrganization(o.id,pid,'position-archive',{positionId:pos.id,archived:true});
 await assert.rejects(store.updateOrganization(o.id,pid,'unit-archive',{unitId:unit.id,archived:true}),/используется/);
 o=await store.updateOrganization(o.id,pid,'member-leave',{memberId:member.id,date:'2026-11-21'});
 assert.equal(o.members[0].active,false);
 assert.deepEqual(o.events.slice(0,3).map(e=>e.id),original);
 assert.equal((await store.getOrganization(o.id,pid)).events.length,o.events.length);
 await assert.rejects(store.removeOrganization(o.id,pid),/история/);
 o=await store.updateOrganization(o.id,pid,'archive',{archived:true});
 await assert.rejects(store.updateOrganization(o.id,pid,'unit-add',{name:'Нельзя',parentId:''}),/архив|Архив/);
 o=await store.updateOrganization(o.id,pid,'archive',{archived:false});assert.equal(o.archived,false);
});
test('assets, assigned custodians, unique tags, retirement and CSV protection',async()=>{
 let o=await store.addOrganization(pid,base);
 o=await store.updateOrganization(o.id,pid,'member-join',{player:'Owner',positionId:o.positions[0].id,date:'2026-11-19'});
 o=await store.updateOrganization(o.id,pid,'asset-add',{name:'Vehicle',assetType:'vehicle',assetTag:'CAR-0001',value:'1500000',note:'Участник <script>'});
 const a=o.assets[0],m=o.members[0];
 await assert.rejects(store.updateOrganization(o.id,pid,'asset-add',{name:'Dup',assetType:'vehicle',assetTag:'car-0001',value:1}),/номер/);
 o=await store.updateOrganization(o.id,pid,'asset-custodian',{assetId:a.id,memberId:m.id});
 await assert.rejects(store.updateOrganization(o.id,pid,'member-leave',{memberId:m.id,date:'2026-11-21'}),/передайте/);
 await assert.rejects(store.updateOrganization(o.id,pid,'archive',{archived:true}),/активами|составом/);
 o=await store.updateOrganization(o.id,pid,'asset-edit',{assetId:a.id,name:'Vehicle Updated',assetType:'vehicle',assetTag:'CAR-0001',value:100,note:'<script>'});
 assert.equal(o.assets[0].value,100);assert.match(organizationAssetsCsv(o),/Vehicle Updated/);
 o=await store.updateOrganization(o.id,pid,'asset-retire',{assetId:a.id,retired:true});
 o=await store.updateOrganization(o.id,pid,'member-leave',{memberId:m.id,date:'2026-11-21'});
 o=await store.updateOrganization(o.id,pid,'archive',{archived:true});assert.equal(o.archived,true);
});
test('duplicate names, invalid dates, unauthorized profiles and forged replay are rejected',async()=>{
 const first=await store.addOrganization(pid,base);
 await assert.rejects(store.addOrganization(pid,{...base,name:'org qa'}),/Повтор/);
 const other=await store.addOrganization('other-profile',base);
 assert.equal((await store.listOrganizations('other-profile')).length,1);
 await assert.rejects(store.getOrganization(first.id,other.profileId));
 await assert.rejects(store.updateOrganization(first.id,other.profileId,'org-edit',base));
 assert.throws(()=>change(first,'member-join',{player:'U',positionId:first.positions[0].id,date:'2026-02-30'}));
 assert.throws(()=>change(first,'asset-add',{name:'S',assetType:'other',assetTag:'ID',value:'1.2'}));
 const forged=clone(first);forged.events.push({...first.events[0]});assert.throws(()=>cleanOrganization(forged));
 assert.throws(()=>validateOrganizations([first,first]));
 assert.throws(()=>validateOrganizations([first],['other-profile']));
});
test('warehouse references prevent rename, archive and delete without losing legacy inventory',async()=>{
 const org=await store.addOrganization(pid,base);
 mem.set('mtInventoryV213:'+pid,{profileId:pid,events:[]});
 // An unrelated legacy warehouse owner must not prevent new organization operations.
 const market=await import('../src/lib/marketplace-store.mjs'),inventory=await import('../src/lib/inventory-store.mjs');
 const product=await market.addMarketplace('product',pid,{name:'Item QA',category:'Транспорт',unit:'шт.'});
 await inventory.inventoryAction(pid,'purchase',{date:'2026-11-19',productId:product.id,ownerType:'organization',ownerName:org.name,quantity:2,unitPrice:100,fee:0,note:''});
 await assert.rejects(store.updateOrganization(org.id,pid,'org-edit',{name:'New name',tag:'',type:'business',description:''}),/складском|складе/);
 await assert.rejects(store.updateOrganization(org.id,pid,'archive',{archived:true}),/складском|складе/);
 await assert.rejects(store.removeOrganization(org.id,pid),/складские/);
 const stock=await inventory.loadInventory(pid);
 const lot=stock.stock.find(r=>r.ownerName===org.name);
 await inventory.inventoryAction(pid,'sale',{date:'2026-11-20',productId:product.id,lotId:lot.lotId,ownerType:'organization',ownerName:org.name,quantity:2,unitPrice:150,fee:0,note:'Sold out'});
 const archived=await store.updateOrganization(org.id,pid,'archive',{archived:true,reason:'Склад пуст'});
 assert.equal(archived.archived,true);
 await assert.rejects(store.updateOrganization(org.id,pid,'org-edit',{name:'Another name',tag:'',type:'business',description:''}),/архив|Архив/);
 assert.equal((await store.getOrganization(org.id,pid)).name,base.name);
});
test('replacement rollback on interrupted storage and damaged keys fail closed',async()=>{
 const a=await store.addOrganization(pid,base),b=await store.addOrganization(pid,{...base,name:'Other'});
 const original=globalThis.browser.storage.local.set;let calls=0;
 globalThis.browser.storage.local.set=async values=>{await original(values);if(++calls===1)throw Error('interrupted');};
 try{await assert.rejects(store.replaceOrganizations([a],[pid]),/interrupted/);}finally{globalThis.browser.storage.local.set=original;}
 assert.deepEqual((await store.listOrganizations(pid)).map(x=>x.id).sort(),[a.id,b.id].sort());
 mem.set(ORGANIZATION_PREFIX+'broken',{profileId:pid});await assert.rejects(store.listOrganizations(),/Повреждённая|Неверный/);
});
test('backup v19 round trip organizations, missing field preserves legacy, corrupt data rejected',async()=>{
 const org=await store.addOrganization(pid,base);
 const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const p={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},operations={version:1,profiles:[]};
 const text=await backup.makeBackupV19(args,p,sections,registry,operations,[],null,[],[],[],[org]);
 const parsed=await backup.parseBackupV19(text,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.organizations[0].name,base.name);
 const invalid=JSON.parse(text);invalid.organizations[0].profileId='unknown-profile';
 await assert.rejects(backup.parseBackupV19(JSON.stringify(invalid),validateState,globalThis.RPNForumCore.cleanTemplate));
 delete invalid.organizations;const old=await backup.parseBackupV19(JSON.stringify(invalid),validateState,globalThis.RPNForumCore.cleanTemplate);assert.equal(old.organizations,null);
});
test('organization HTML escaping, hierarchy and warehouse counters',async()=>{
 let org=await store.addOrganization(pid,{name:'<img src=x onerror=alert(1)>',type:'criminal'});
 org=await store.updateOrganization(org.id,pid,'asset-add',{name:'<script>alert(1)</script>',assetType:'other',assetTag:'INV-1',value:100,note:''});
 const ui=await import('../src/ui/organization-page.mjs');await ui.refreshOrganizations(pid);
 const html=ui.organizationSection(state);
 assert.match(html,/organizations-root/);assert.match(html,/100/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);assert.doesNotMatch(html,/<img src=x/);
});
