import test from 'node:test';
import assert from 'node:assert/strict';
const database={};const changes=[];
globalThis.browser={storage:{local:{
  async get(keys){if(keys===null)return {...database};if(typeof keys==='string')return {[keys]:database[keys]};if(Array.isArray(keys))return Object.fromEntries(keys.map(k=>[k,database[k]]));return {...database};},
  async set(items){Object.assign(database,items);changes.push(items);},
  async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete database[key];}
}}};
const {defaultProductivity,PRODUCTIVITY_KEY}=await import('../src/lib/productivity-core.mjs');
const {loadProductivity,saveProductivity,replaceProductivity}=await import('../src/lib/productivity-store.mjs');
const {getLocalIndex,invalidateSearch}=await import('../src/lib/productivity-search.mjs');
const {upsertTemplate}=await import('../src/lib/forum-store.mjs');
const {searchRecords}=await import('../src/lib/productivity-core.mjs');
test('preferences persist and concurrent patches do not lose fields',async()=>{
  assert.deepEqual(await loadProductivity(),defaultProductivity());
  await Promise.all([saveProductivity({accent:'amber'}),saveProductivity({shortcutsEnabled:false})]);
  const actual=await loadProductivity();assert.equal(actual.accent,'amber');assert.equal(actual.shortcutsEnabled,false);
  assert.ok(changes.some(x=>x[PRODUCTIVITY_KEY]));
});
test('malformed productivity changes leave previous stored values untouched',async()=>{
  const before=await loadProductivity();
  await assert.rejects(saveProductivity({accent:'<script>'}),/палитра/);
  assert.deepEqual(await loadProductivity(),before);
});
test('replace applies a fully validated version, not untrusted object fields',async()=>{
  const next=await replaceProductivity({...defaultProductivity(),accent:'violet',injected:'no'});
  assert.deepEqual(Object.keys(next).sort(),['accent','shortcuts','shortcutsEnabled'].sort());
  assert.equal((await loadProductivity()).accent,'violet');
});
test('search index is created lazily from real browser storage and invalidated on updates',async()=>{
  const first=await getLocalIndex();assert.deepEqual(first,[]);
  const linksKey='majesticToolkitSiteLinksV8';
  database[linksKey]=[];
  const inserted=await upsertTemplate({label:'Поисковый документ',category:'Документы',profileId:'profile_test_12345',format:'bbcode',shortcut:1,text:'Точный текст локального поиска'});
  assert.equal((await getLocalIndex()).length,0,'cached index remains stable until invalidated');
  invalidateSearch();const after=await getLocalIndex();assert.equal(after.length,1);
  assert.equal(searchRecords(after,'Точный текст',{profileId:'profile_test_12345'})[0].id,inserted.id);
});
