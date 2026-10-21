import test from 'node:test';
import assert from 'node:assert/strict';
import { createBook,cleanLawRecord,createMemo,cleanArticle,parseArticles,addEdition,switchEdition,activeEdition,searchLaws,makeFavorite,validateLawRecords,exportLawDataset,parseLawDataset,updateBookMetadata, LIMITS } from '../src/lib/law-core.mjs';
import {makeBackupV5,parseBackupV5} from '../src/lib/law-backup.mjs';
import {defaultState,validateState,makeBackup} from '../src/lib/model.mjs';
import '../src/lib/forum-core.js';
const profile='11111111-2222-4333-8444-555555555555';
const fields={title:'Уголовный кодекс',category:'УК',label:'Первая редакция',effectiveDate:'2026-09-20',sourceUrl:'https://example.org/legal',articlesText:'Статья 1. Основания\nНаказание за нарушение.\n\nСтатья 1.1. Исключения\nНе допускается наказание без состава.'};
const mk=()=>createBook(profile,fields);
test('parse common Cyrillic article headers and stable compound numbers',()=>{
 const rows=parseArticles(fields.articlesText);assert.deepEqual(rows.map(r=>r.key),['1','1.1']);assert.match(rows[0].text,/Наказание/);
});
test('new book has active validated edition and correct profile',()=>{
 const book=mk();assert.equal(book.profileId,profile);assert.equal(activeEdition(book).articles.length,2);assert.equal(cleanLawRecord(book).id,book.id);
});
test('immutable edition history and current switching',()=>{
 const old=mk();const next=addEdition(old,{label:'Редакция II',effectiveDate:'2026-10-10',articlesText:'Статья 1. Основания\nИзменение.\nСтатья 2. Новая\nТекст новой'});
 assert.equal(next.editions.length,2);assert.equal(old.editions.length,1);assert.equal(activeEdition(next).articles[0].text,'Изменение.');assert.match(activeEdition(old).articles[0].text,/Наказание/);
 const reverted=switchEdition(next,old.activeEditionId);assert.match(activeEdition(reverted).articles[0].text,/Наказание/);
});
test('duplicate article numbers are forbidden',()=>assert.throws(()=>parseArticles('Статья 1. Один\nОдин\nСтатья 1. Два\nДва'),/Дублируется/));
test('empty / unsuitable text rejects instead of silently creating placeholder',()=>assert.throws(()=>parseArticles('Глава 1 - нет нумерации'),/Не найдены/));
test('validates suspicious URLs',()=>{assert.throws(()=>createBook(profile,{...fields,sourceUrl:'javascript:alert(1)'}),/HTTPS/);assert.throws(()=>createBook(profile,{...fields,sourceUrl:'https://u:p@example.org'}),/HTTPS/);});
test('search by key, title, text, case and letter ё',()=>{const book=mk(),fav=makeFavorite(profile,book.id,'1');const rows=[book,fav];assert.equal(searchLaws(rows,profile,'1.1')[0].article.key,'1.1');assert.equal(searchLaws(rows,profile,'НАКАЗАНИЕ').length,2);assert.equal(searchLaws(rows,profile,'уголовный основания').length,1);assert.equal(searchLaws(rows,profile,'', {favoritesOnly:true}).length,1);assert.equal(searchLaws(rows,'11111111-2222-4333-8444-999999999999','').length,0);});
test('memo validation and dependent favorite graph',()=>{const book=mk(),memo=createMemo(profile,{title:'Памятка',body:'Внимательно проверить доказательства',bookId:book.id,articleKey:'1'});assert.equal(validateLawRecords([book,memo,makeFavorite(profile,book.id,'1')],[profile]).length,3);assert.throws(()=>validateLawRecords([memo],[profile]),/отсутствующий закон/);});
test('rejects foreign profile and duplicate record identifiers',()=>{const book=mk();assert.throws(()=>validateLawRecords([book],['not-in-profile']),/профилю/);assert.throws(()=>validateLawRecords([book,book],[profile]),/Повторяющийся/);});
test('editions cap is enforced and record updates retain history',()=>{let b=mk();const changed=updateBookMetadata(b,{title:'Кодекс обновлён'});assert.equal(changed.editions[0].id,b.editions[0].id);assert.equal(b.title,'Уголовный кодекс');assert.throws(()=>cleanLawRecord({...b,editions:Array.from({length:LIMITS.editions+1},()=>b.editions[0])}),/редакций/);});
test('law-only round trip validates schema and all records',()=>{const b=mk(),r=[b,makeFavorite(profile,b.id,'1')];const data=exportLawDataset(r,[profile]);assert.deepEqual(parseLawDataset(data,[profile]),r);assert.throws(()=>parseLawDataset(data.replace('majestictoolkit-law-dataset','other'),[profile]),/формат/);});
test('backup v5 preserves 0.4 data and law records',()=>{const state=defaultState();const b=createBook(state.activeProfileId,fields);const backup=makeBackupV5(state,[],[],[],[b],globalThis.RPNForumCore.cleanTemplate);const recovered=parseBackupV5(backup,validateState,globalThis.RPNForumCore.cleanTemplate);assert.equal(recovered.schemaVersion,5);assert.equal(recovered.lawRecords[0].editions[0].articles[0].key,'1');assert.deepEqual(recovered.economy,[]);});
test('backup v5 loads legacy v1 without deleting law data automatically',()=>{const state=defaultState();const old=parseBackupV5(makeBackup(state),validateState,globalThis.RPNForumCore.cleanTemplate);assert.equal(old.schemaVersion,1);assert.deepEqual(old.lawRecords,[]);});
test('v5 backup rejects missing edition and cross-profile law',()=>{const state=defaultState();const b=createBook(profile,fields);assert.throws(()=>makeBackupV5(state,[],[],[],[b],globalThis.RPNForumCore.cleanTemplate),/профилю/);});
test('article XSS is text data, not markup',()=>{const a=cleanArticle({key:'2',title:'Проверка',text:'<img src=x onerror=alert(1)>'});assert.equal(a.text,'<img src=x onerror=alert(1)>');});
