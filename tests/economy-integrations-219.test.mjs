import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {newMarketRecord} from '../src/lib/marketplace-core.mjs';
import {exportMarketData,parseMarketImport,previewMarketImport,verifyImportBaseline} from '../src/lib/economy-transfer.mjs';
import {newEconomyLink,validateEconomyLinks} from '../src/lib/economy-links-core.mjs';
const state=defaultState(),pid=state.activeProfileId,other='profile_219_other';
const mem=new Map(),clone=structuredClone;
globalThis.browser={storage:{local:{
 async get(k){if(k===null)return Object.fromEntries([...mem].map(([id,v])=>[id,clone(v)]));const keys=Array.isArray(k)?k:[k];return Object.fromEntries(keys.filter(id=>mem.has(id)).map(id=>[id,clone(mem.get(id))]));},
 async set(data){for(const [k,v] of Object.entries(data))mem.set(k,clone(v));},async remove(k){for(const key of Array.isArray(k)?k:[k])mem.delete(key);}
}}};
const {makeBackupV20,parseBackupV20}=await import('../src/lib/economy-backup-v20.mjs');
const {makeBackupV19}=await import('../src/lib/justice-backup.mjs');
const marketStore=await import('../src/lib/marketplace-store.mjs');
const linksStore=await import('../src/lib/economy-links-store.mjs');
const productInput={name:'Truck; "Special"',category:'Транспорт',variant:'Limited',unit:'шт.',note:'==formula'};
const priceInput={date:'2026-11-18',kind:'completed',price:300,quantity:2,source:'Forum QA',url:'https://forum.example/a',note:'Примечание\nстрока'};
const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
const punish={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},ops={version:1,profiles:[]};
beforeEach(()=>mem.clear());
function sample(){const product=newMarketRecord('product',pid,productInput);const price=newMarketRecord('price',pid,{...priceInput,productId:product.id});const listing=newMarketRecord('listing',pid,{productId:product.id,kind:'sell',status:'active',postedAt:'2026-11-18',expiresAt:'',price:350,quantity:1,seller:'Seller',source:'Forum QA',url:'',note:''});return [product,price,listing];}
const refs=(marketplace=[],documents=[],evidenceVault=[])=>({marketplace,families:[],organizations:[],territories:[],documents,evidenceVault});
test('CSV/JSON exports round-trip products, observed prices, offers, quotes, BOM and Unicode',()=>{
 const rows=sample();for(const format of ['csv','json']){
  const body=exportMarketData(rows,pid,format),imported=parseMarketImport(body,format);
  assert.equal(imported.length,3);
  const dry=previewMarketImport(imported,pid,[]);
  assert.deepEqual(dry.counts,{product:1,price:1,listing:1,skipped:0});
  assert.equal(dry.added.find(x=>x.type==='product').name,productInput.name);
  assert.equal(dry.added.find(x=>x.type==='price').note,priceInput.note);
  assert.equal(previewMarketImport(imported,pid,dry.added).counts.skipped,3);
  if(format==='csv')assert.ok(body.startsWith('\ufeff'));
 }
});
test('export sorts products before price records and preserves leading apostrophe and formulas',()=>{
 const [p,price,listing]=sample();const r={...p,name:'=IMPORTXML("http://example")',note:"'=original"};
 const csv=exportMarketData([listing,price,r],pid,'csv');
 assert.match(csv,/\'=IMPORTXML/);
 const raw=parseMarketImport(csv,'csv');
 assert.deepEqual(raw.map(x=>x.type),['product','listing','price']);
 assert.equal(raw[0].name,r.name);
 assert.equal(raw[0].note,r.note);
 assert.equal(previewMarketImport(raw,pid,[]).counts.product,1);
});
test('CSV import validates quoting, partial files, references, overflow and foreign data',()=>{
 const rows=sample(),csv=exportMarketData(rows,pid);
 assert.throws(()=>parseMarketImport('type;name\nprice;Bad'),/Заголовок/);
 assert.throws(()=>parseMarketImport(csv+'"unclosed'),/Незакрытая|число полей/);
 assert.throws(()=>parseMarketImport(csv.replace('type;name','kind;name')),/Заголовок/);
});
test('import dry run rejects missing products, impossible dates and mutated marketplace before commit',()=>{
 const rows=sample(),csv=exportMarketData(rows,pid);
 const imported=parseMarketImport(csv,'csv'),preview=previewMarketImport(imported,pid,[]);
 assert.equal(preview.total,3);
 assert.throws(()=>verifyImportBaseline(preview,[rows[0]]),/изменился/);
 assert.throws(()=>previewMarketImport(imported.slice(1),pid,[]),/Товар отсутствует/);
 assert.throws(()=>previewMarketImport(imported.map(x=>x.type==='price'?{...x,date:'2026-02-31'}:x),pid,[]),/дат/);
 assert.throws(()=>parseMarketImport('{"format":"wrong","rows":[]}', 'json'),/формат/);
 assert.throws(()=>parseMarketImport('x'.repeat(2*1024*1024+1)),/2 МиБ/);
});
test('market import append is atomic, rejects outdated previews, never removes concurrent records',async()=>{
 const [product,oldPrice]=sample();
 await marketStore.replaceMarketplace([product,oldPrice],[pid]);
 const incoming=newMarketRecord('price',pid,{...priceInput,date:'2026-11-19',price:999,productId:product.id});
 const saved=await marketStore.listMarketplace();
 const plan=previewMarketImport(parseMarketImport(exportMarketData([product,oldPrice,incoming],pid)),pid,saved);
 assert.equal(plan.added.length,1);
 await marketStore.appendMarketplaceImport(plan.added,plan.baseline,[pid]);
 assert.equal((await marketStore.listMarketplace()).length,3);
 await assert.rejects(marketStore.appendMarketplaceImport([newMarketRecord('price',pid,{...priceInput,productId:product.id,price:401})],plan.baseline,[pid]),/изменился/);
 const now=await marketStore.listMarketplace();const rollbackPlan=previewMarketImport(parseMarketImport(exportMarketData([product,oldPrice,incoming,newMarketRecord('price',pid,{...priceInput,date:'2026-11-20',price:3000,productId:product.id})],pid)),pid,now);
 const original=globalThis.browser.storage.local.set;let fail=true;
 globalThis.browser.storage.local.set=async x=>{await original(x);if(fail){fail=false;throw Error('storage failed');}};
 try{await assert.rejects(marketStore.appendMarketplaceImport(rollbackPlan.added,rollbackPlan.baseline,[pid]),/storage failed/);}finally{globalThis.browser.storage.local.set=original;}
 assert.deepEqual((await marketStore.listMarketplace()).map(x=>x.id).sort(),now.map(x=>x.id).sort());
});
test('link validation enforces exact profile, stable IDs, unique pairs and existing source/object',()=>{
 const [product]=sample();const doc={id:'document_219001',profileId:pid,type:'document'},vault={id:'vault_219001',profileId:pid,kind:'link'};
 const a=newEconomyLink(pid,{entityType:'product',entityId:product.id,sourceType:'document',sourceId:doc.id,note:'Receipt'});
 const b=newEconomyLink(pid,{entityType:'product',entityId:product.id,sourceType:'evidence',sourceId:vault.id,note:'Evidence'});
 assert.deepEqual(validateEconomyLinks([a,b],[pid],refs([product],[doc],[vault])),[a,b]);
 assert.throws(()=>validateEconomyLinks([a,a],[pid],refs([product],[doc],[vault])),/Повтор/);
 assert.throws(()=>validateEconomyLinks([a,{...a,id:'link_new_000219'}],[pid],refs([product],[doc],[vault])),/Повтор/);
 assert.throws(()=>validateEconomyLinks([a],[pid],refs([product],[],[vault])),/доказательство|документ/);
 assert.throws(()=>validateEconomyLinks([a],[pid],refs([product],[{...doc,profileId:other}],[vault])),/другой профиль/);
 assert.throws(()=>validateEconomyLinks([a],[pid],refs([],[doc],[vault])),/отсутствующий объект/);
 assert.throws(()=>validateEconomyLinks([{...a,profileId:other}],[pid],refs([product],[doc],[vault])),/профиль/);
 assert.throws(()=>newEconomyLink(pid,{entityType:'x',entityId:product.id,sourceType:'document',sourceId:doc.id}),/тип/);
});
test('link store writes and removes validated rows; failure restores exact original data',async()=>{
 const [p]=sample();const d={id:'document_219001',profileId:pid,type:'document'},r=refs([p],[d]);
 const link=newEconomyLink(pid,{entityType:'product',entityId:p.id,sourceType:'document',sourceId:d.id});
 await linksStore.replaceEconomyLinks([link],[pid],r);
 assert.deepEqual(await linksStore.listEconomyLinks(pid),[link]);
 await assert.rejects(linksStore.removeEconomyLink(other,link.id));
 const original=globalThis.browser.storage.local.set;let fail=true;
 globalThis.browser.storage.local.set=async values=>{await original(values);if(fail){fail=false;throw Error('disk full');}};
 try{await assert.rejects(linksStore.replaceEconomyLinks([{...link,note:'Changed'}],[pid],r),/disk full|Ошибка/);}finally{globalThis.browser.storage.local.set=original;}
 assert.deepEqual(await linksStore.listEconomyLinks(pid),[link]);
 await linksStore.removeEconomyLink(pid,link.id);assert.deepEqual(await linksStore.listEconomyLinks(pid),[]);
});
test('real Evidence Vault refuses removing sources still linked to economy objects',async()=>{
 const [product]=sample();const evidenceId='evidence_219_source';const link=newEconomyLink(pid,{entityType:'product',entityId:product.id,sourceType:'evidence',sourceId:evidenceId});
 mem.set('mtEconomyLinkV219:'+link.id,link);
 const vault=await import('../src/lib/evidence-vault.mjs');
 await assert.rejects(vault.deleteVaultRecord(evidenceId,pid),/связано с экономическим объектом/);
});
test('Backup v20 round-trip saves economy references, v19 imports without deleting links',async()=>{
 const market=sample(),doc={id:'document_219001',profileId:pid,type:'document'};
 // Full document validation requires the actual Studio schema; v20 must support empty documents.
 const json=await makeBackupV20(args,punish,sections,registry,ops,[],null,market,[],[],[],[],[],[],[]);
 const result=await parseBackupV20(json,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(result.schemaVersion,20);assert.deepEqual(result.marketplace,market);assert.deepEqual(result.economyLinks,[]);
 const bad=JSON.parse(json);bad.economyLinks=[newEconomyLink(pid,{entityType:'product',entityId:market[0].id,sourceType:'document',sourceId:doc.id})];
 await assert.rejects(parseBackupV20(JSON.stringify(bad),validateState,globalThis.RPNForumCore.cleanTemplate),/доказательство|документ/);
 const legacy=await makeBackupV19(args,punish,sections,registry,ops,[],null,market);
 const parsed=await parseBackupV20(legacy,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.schemaVersion,19);assert.equal(parsed.economyLinks,null);
 const forged=JSON.parse(json);forged.marketplace[0].profileId=other;
 await assert.rejects(parseBackupV20(JSON.stringify(forged),validateState,globalThis.RPNForumCore.cleanTemplate));
});
test('Backup v20 retains validated evidence links, refuses tampered source and missing entity',async()=>{
 const [product]=sample();const evidence={id:'evidence_219001',profileId:pid,kind:'link',title:'Price screenshot',note:'',url:'https://forum.example/screenshot',seconds:null,createdAt:new Date().toISOString()};
 const link=newEconomyLink(pid,{entityType:'product',entityId:product.id,sourceType:'evidence',sourceId:evidence.id,note:'Purchase proof'});
 const text=await makeBackupV20(args,punish,sections,registry,ops,[evidence],null,[product],[],[],[],[],[],[],[link]);
 const parsed=await parseBackupV20(text,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.deepEqual(parsed.economyLinks,[link]);
 const tamper=JSON.parse(text);tamper.economyLinks[0].sourceId='removed_file_219';
 await assert.rejects(parseBackupV20(JSON.stringify(tamper),validateState,globalThis.RPNForumCore.cleanTemplate),/доказательство|документ/);
 const lost=JSON.parse(text);lost.marketplace=[];
 await assert.rejects(parseBackupV20(JSON.stringify(lost),validateState,globalThis.RPNForumCore.cleanTemplate),/объект/);
});
test('export only includes current profile and escapes leading formula cells',()=>{
 const [p]=sample(),foreign=newMarketRecord('product',other,{name:'=HYPERLINK("evil")',category:'Транспорт',variant:'',unit:'шт.',note:''});
 const csv=exportMarketData([p,foreign],other);assert.match(csv,/\'=HYPERLINK/);assert.doesNotMatch(csv,/Truck/);
 assert.equal(parseMarketImport(csv)[0].name,'=HYPERLINK("evil")');
});
