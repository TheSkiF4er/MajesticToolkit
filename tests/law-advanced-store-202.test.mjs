import test from 'node:test';
import assert from 'node:assert/strict';
const raw={};
globalThis.chrome={storage:{local:{
  async get(keys){if(keys===null)return structuredClone(raw);const names=typeof keys==='string'?[keys]:keys;return Object.fromEntries(names.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,structuredClone(raw[k])]));},
  async set(records){Object.assign(raw,structuredClone(records));},
  async remove(names){for(const name of Array.isArray(names)?names:[names])delete raw[name];}
}}};
const {newLawBook,newLawEdition,editLawBook,markLawSourceChecked,getLawRecord,listLawRecords,replaceLawRecords}=await import('../src/lib/law-store.mjs');
const {exportVerifiedLawDataset,parseVerifiedLawDataset,editionAtDate}=await import('../src/lib/law-core.mjs');
const {lawSection,refreshLaw,setLawAsOfDate,setLawCategory}=await import('../src/ui/law-page.mjs');
const p1='profile-202-abc',p2='profile-202-other';
const form={title:'Процессуальный кодекс',category:'ПК',label:'Редакция 2026',effectiveDate:'2026-02-01',sourceUrl:'https://example.org/act/1',articlesText:'Введение\nРаздел 1. Процедуры\nГлава 1. Доказательства\nСтатья 1. Основания\n1. Обязательны доказательства.'};
const state={activeProfileId:p1,profiles:[{id:p1,name:'Суд'},{id:p2,name:'Сосед'}]};
test('real storage persists structured revisions and a source-check toggle across reload',async()=>{
 const book=await newLawBook(p1,form);
 const id=book.id;
 const checked=await markLawSourceChecked(id,book.activeEditionId,true);
 assert.ok(checked.editions[0].sourceCheckedAt);
 const next=await newLawEdition(id,{label:'Новая',effectiveDate:'2026-12-01',sourceUrl:'https://example.org/act/2',amendmentNote:'Законопроект',articlesText:'Глава 2. Новое\nСтатья 1. Основания\n1. Новая процедура.'});
 await editLawBook(id,{title:'Кодекс после переименования',sourceUrl:'https://example.org/act/3'});
 const loaded=await getLawRecord(id);
 assert.equal(loaded.editions[0].sourceUrl,form.sourceUrl);
 assert.equal(loaded.editions[1].sourceUrl,'https://example.org/act/2');
 assert.ok(loaded.editions[0].sourceCheckedAt);
 assert.equal(editionAtDate(loaded,'2026-11-30').id,book.activeEditionId);
 assert.equal(editionAtDate(loaded,'2026-12-01').id,next.activeEditionId);
 await markLawSourceChecked(id,book.activeEditionId,false);
 assert.equal((await getLawRecord(id)).editions[0].sourceCheckedAt,undefined);
});
test('UI date filter uses actual stored editions and maintains isolated profile',async()=>{
 await newLawBook(p2,{...form,title:'Секретный кодекс другого профиля'});
 await refreshLaw();setLawCategory('');setLawAsOfDate('2026-03-01');
 let html=lawSection(state);
 assert.match(html,/Обязательны доказательства/);
 assert.doesNotMatch(html,/Новая процедура/);
 assert.doesNotMatch(html,/Секретный кодекс другого профиля/);
 setLawAsOfDate('2026-12-01');html=lawSection(state);
 assert.match(html,/Новая процедура/);
 assert.doesNotMatch(html,/Обязательны доказательства/);
 assert.match(html,/Глава 2\. Новое/);
 setLawAsOfDate('');
});
test('verified export roundtrip and rejection preserve real records on failed import',async()=>{
 const before=await listLawRecords();const sealed=await exportVerifiedLawDataset(before,[p1,p2]);
 assert.deepEqual(await parseVerifiedLawDataset(sealed,[p1,p2]),before);
 const forged=sealed.replace('Новая процедура','Чужая процедура');
 await assert.rejects(()=>parseVerifiedLawDataset(forged,[p1,p2]),/не совпадает/);
 assert.deepEqual(await listLawRecords(),before);
 await replaceLawRecords(await parseVerifiedLawDataset(sealed,[p1,p2]),[p1,p2]);
 assert.deepEqual(await listLawRecords(),before);
});
