import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  parseLawText,createBook,addEdition,updateBookMetadata,editionAtDate,applicability,
  compareLawEditions,articleProvisions,searchLaws,makeLawCitation,setEditionSourceVerification,
  exportVerifiedLawDataset,parseVerifiedLawDataset,exportLawDataset,parseLawDataset,cleanLawRecord
} from '../src/lib/law-core.mjs';
const profile='qa-profile-2026';
const source='https://example.org/acts/law/a';
const v1=`Вводная часть акта.
Раздел I. Общие положения
Глава 1. Основания
Статья 1. Право на защиту
1. Гарантируется защита.
1.1. Обязанности сторон.
Статья 2. Процесс
1. Ходатайство рассматривается.`;
const v2=`Вводная часть акта изменена.
Раздел I. Общие положения
Глава 1. Основания
Статья 1. Право на защиту
1. Гарантируется право на защиту.
1.1. Обязанности сторон.
1.2. Представительство допускается.
Глава 2. Судебные гарантии
Статья 3. Новый порядок
1. Представляются доказательства.`;
const fields={title:'Судебный кодекс',category:'СК',sourceUrl:source,effectiveDate:'2026-01-01',label:'Ранняя редакция',articlesText:v1,sourceChecked:true,amendmentNote:'Принятие акта'};
const mk=()=>createBook(profile,fields);
test('preserves real preamble and nested headings in parsed editions',()=>{
 const parsed=parseLawText(v1);assert.equal(parsed.preamble,'Вводная часть акта.');
 assert.deepEqual(parsed.articles.map(x=>x.key),['1','2']);
 assert.equal(parsed.articles[0].section,'Раздел I. Общие положения');
 assert.equal(parsed.articles[1].chapter,'Глава 1. Основания');
 assert.match(parsed.articles[0].text,/1\.1\. Обязанности сторон\./);
 const book=mk();assert.equal(book.editions[0].preamble,parsed.preamble);
});
test('dates select proper edition for event including future revisions',()=>{
 const a=mk(),b=addEdition(a,{label:'Поздняя редакция',effectiveDate:'2026-11-30',articlesText:v2,sourceUrl:'https://example.org/revision'});
 assert.equal(editionAtDate(b,'2025-12-31'),null);
 assert.equal(editionAtDate(b,'2026-04-20').id,a.activeEditionId);
 assert.equal(editionAtDate(b,'2026-11-29').id,a.activeEditionId);
 assert.equal(editionAtDate(b,'2026-11-30').id,b.activeEditionId);
 assert.equal(searchLaws([b],profile,'гарантируется',{asOfDate:'2026-11-29'})[0].article.text.includes('право на защиту'),false);
 assert.equal(searchLaws([b],profile,'представляются',{asOfDate:'2026-11-29'}).length,0);
 assert.equal(searchLaws([b],profile,'представляются',{asOfDate:'2026-12-01'}).length,1);
 assert.equal(searchLaws([b],'wrong-profile','представляются',{asOfDate:'2026-12-01'}).length,0);
});
test('explicit exclusive expiration does not revive an older edition and repeal overrides all',()=>{
 const a=mk();const b=addEdition(a,{label:'Временная',effectiveDate:'2026-07-01',expiresAt:'2026-08-01',articlesText:v2});
 assert.equal(editionAtDate(b,'2026-08-01'),null);
 assert.equal(applicability(b,'2026-08-31').status,'gap');
 const c=updateBookMetadata(b,{repealedAt:'2026-10-01'});
 assert.equal(editionAtDate(c,'2026-10-01'),null);
 assert.equal(applicability(c,'2026-10-01').status,'repealed');
 assert.equal(applicability(c,'2025-01-01').status,'upcoming');
 assert.equal(updateBookMetadata(c,{repealedAt:''}).repealedAt,undefined);
});
test('revision diffs identify added removed and changed articles/numbered clauses',()=>{
 const a=mk(),b=addEdition(a,{label:'Поздняя',effectiveDate:'2026-09-01',articlesText:v2});
 const diff=compareLawEditions(b,a.activeEditionId,b.activeEditionId);
 assert.deepEqual([diff.added,diff.changed,diff.removed],[1,1,1]);
 const one=diff.differences.find(item=>item.key==='1');
 assert.ok(one.provisions.some(x=>x.key==='1.2'&&x.kind==='added'));
 assert.ok(one.provisions.some(x=>x.key==='1'&&x.kind==='changed'));
 assert.equal(articleProvisions(a.editions[0].articles[0]).filter(x=>x.key).length,2);
 assert.equal(a.editions.length,1);assert.equal(a.editions[0].articles[0].text.includes('право на защиту'),false);
});
test('source link is pinned per edition despite metadata updates',()=>{
 const b=mk(),next=addEdition(b,{label:'Вторая',effectiveDate:'2026-06-01',articlesText:v2,sourceUrl:'https://example.org/acts/law/b'});
 const updated=updateBookMetadata(next,{sourceUrl:'https://example.org/acts/law/c'});
 assert.equal(updated.editions[0].sourceUrl,source);
 assert.equal(updated.editions[1].sourceUrl,'https://example.org/acts/law/b');
 assert.equal(b.sourceUrl,source);
});
test('manual source check changes only verification metadata, not edition content',()=>{
 const b=mk(),copy=structuredClone(b);const checked=setEditionSourceVerification(b,b.activeEditionId,true);
 assert.ok(checked.editions[0].sourceCheckedAt);
 assert.deepEqual(checked.editions[0].articles,copy.editions[0].articles);
 const unchecked=setEditionSourceVerification(checked,b.activeEditionId,false);
 assert.equal(unchecked.editions[0].sourceCheckedAt,undefined);
 const {sourceCheckedAt,sourceUrl,...other}=b.editions[0];
 const legacy=cleanLawRecord({...b,editions:[other]});
 assert.equal(legacy.editions[0].sourceUrl,undefined);
 assert.throws(()=>setEditionSourceVerification(legacy,legacy.activeEditionId,true),/ссылка/);
});
test('historical article citation includes immutable edition id, actual text and SHA-256 digest',async()=>{
 const b=mk();const citation=await makeLawCitation(b,b.activeEditionId,'1');
 assert.equal(citation.sha256,createHash('sha256').update(JSON.stringify(citation.snapshot)).digest('hex'));
 assert.match(citation.citation,/Гарантируется защита/);
 assert.match(citation.citation,/SHA-256 снимка:/);
 assert.equal(citation.snapshot.sourceUrl,source);
 const altered=updateBookMetadata(b,{sourceUrl:'https://example.org/new',title:'Другое название'});
 assert.equal((await makeLawCitation(altered,b.activeEditionId,'1')).sha256,citation.sha256);
 await assert.rejects(()=>makeLawCitation(b,b.activeEditionId,'900'),/не найдена/);
});
test('sealed JSON roundtrip verifies integrity; tampering and invalid signatures are rejected',async()=>{
 const b=mk();const sealed=await exportVerifiedLawDataset([b],[profile]);
 assert.match(sealed,/"algorithm": "SHA-256"/);
 assert.deepEqual(await parseVerifiedLawDataset(sealed,[profile]),[b]);
 assert.throws(()=>parseLawDataset(sealed,[profile]),/SHA-256/);
 const forged=sealed.replace('Гарантируется защита.','Изменено без подписи.');
 await assert.rejects(()=>parseVerifiedLawDataset(forged,[profile]),/не совпадает/);
 await assert.rejects(()=>parseVerifiedLawDataset(sealed,['foreign']),/профилю/);
 const legacy=JSON.parse(exportLawDataset([b],[profile]));legacy.schemaVersion=1;
 assert.deepEqual(await parseVerifiedLawDataset(JSON.stringify(legacy),[profile]),[b]);
});
test('invalid dates, invalid source URLs and identical effective dates are rejected',()=>{
 const b=mk();
 assert.throws(()=>editionAtDate(b,'2026-02-30'),/дата/);
 assert.throws(()=>addEdition(b,{label:'Конфликт',effectiveDate:'2026-01-01',articlesText:v2}),/редакция/);
 assert.throws(()=>addEdition(b,{label:'Короткая',effectiveDate:'2026-01-15',expiresAt:'2026-01-15',articlesText:v2}),/прекращения/);
 assert.throws(()=>addEdition(b,{label:'Подмена',effectiveDate:'2026-01-15',sourceUrl:'javascript:alert(1)',articlesText:v2}),/HTTPS/);
 assert.throws(()=>createBook(profile,{...fields,sourceUrl:'',sourceChecked:true}),/источника/);
});
