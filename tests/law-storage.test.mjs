import test from 'node:test';
import assert from 'node:assert/strict';
const raw={};
globalThis.chrome={storage:{local:{
  async get(key){if(key===null)return {...raw};if(typeof key==='string')return Object.hasOwn(raw,key)?{[key]:raw[key]}:{};return Object.fromEntries(key.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,raw[k]]));},
  async set(objects){Object.assign(raw,structuredClone(objects));},
  async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete raw[key];}
}}};
const {newLawBook,newLawEdition,chooseLawEdition,newLawMemo,editLawMemo,toggleLawFavorite,removeLawRecord,listLawRecords,replaceLawRecords,getLawRecord}=await import('../src/lib/law-store.mjs');
const {lawSection,refreshLaw}=await import('../src/ui/law-page.mjs');
const {createBook}=await import('../src/lib/law-core.mjs');
const profile='account-111111111';
const fields={title:'УК',category:'Уголовный кодекс',label:'Редакция A',effectiveDate:'2026-10-01',articlesText:'Статья 1. Закон\nТекст закона о правонарушении.'};
for(const k of Object.keys(raw))delete raw[k];
const state={activeProfileId:profile,profiles:[{id:profile,name:'Seattle'}]};
test('persist new book, add version and restore old version',async()=>{
 const b=await newLawBook(profile,fields);assert.equal((await listLawRecords()).length,1);assert.equal((await getLawRecord(b.id)).title,'УК');
 const edited=await newLawEdition(b.id,{label:'Редакция B',effectiveDate:'2026-10-10',articlesText:'Статья 1. Закон\nОбновлённый текст.'});assert.equal(edited.editions.length,2);assert.equal((await getLawRecord(b.id)).activeEditionId,edited.activeEditionId);
 await chooseLawEdition(b.id,b.activeEditionId);assert.equal((await getLawRecord(b.id)).activeEditionId,b.activeEditionId);
});
test('fav toggle, memo edit and rendering',async()=>{
 const [b]=await listLawRecords();await toggleLawFavorite(profile,b.id,'1');const m=await newLawMemo(profile,{title:'Правила проверки',body:'Оригинальное содержание',bookId:b.id,articleKey:'1'});
 await editLawMemo(m.id,{title:'Новая памятка',body:'Новая инструкция',category:'Практика'});
 await refreshLaw();const html=lawSection(state);assert.match(html,/УК/);assert.match(html,/★ Избранное/);assert.match(html,/Текст закона/);
 assert.equal((await listLawRecords()).filter(x=>x.type==='favorite').length,1);await toggleLawFavorite(profile,b.id,'1');assert.equal((await listLawRecords()).filter(x=>x.type==='favorite').length,0);
});
test('reject invalid imports before clearing local storage',async()=>{
 const before=await listLawRecords();const bad=structuredClone(before);bad.find(r=>r.type==='book').editions[0].articles[0].text='';await assert.rejects(()=>replaceLawRecords(bad,[profile]),/Текст статьи/);assert.deepEqual(await listLawRecords(),before);
});
test('replaceLawRecords changes real stored contents and removes stale entries',async()=>{
 const before=await listLawRecords();await replaceLawRecords(before.filter(r=>r.type==='book'),[profile]);assert.equal((await listLawRecords()).length,1);
});
test('book deletion cascades linked memo and favorites',async()=>{
 const [b]=await listLawRecords();await newLawMemo(profile,{title:'Сборник',body:'Текст',bookId:b.id});await toggleLawFavorite(profile,b.id,'1');await removeLawRecord(b.id);assert.equal((await listLawRecords()).length,0);
});
test('profile isolation through store and UI',async()=>{
 const other='account-222222222';await newLawBook(other,{...fields,title:'Секретный другой сервер'});await refreshLaw();const html=lawSection(state);assert.doesNotMatch(html,/Секретный другой сервер/);await replaceLawRecords([],[profile,other]);
});
test('untrusted law content is HTML-escaped in rendered cards',async()=>{
 const source=createBook(profile,{...fields,title:'<img src=x onerror="alert(1)">',articlesText:'Статья 1. Опасная\n<script>alert(1)</script>'});
 await replaceLawRecords([source],[profile]);await refreshLaw();const html=lawSection(state);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/&lt;img src=x onerror=/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 await replaceLawRecords([],[profile]);
});
