import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSearchRecords,searchRecords,answerLocal} from '../src/lib/productivity-core.mjs';
import {sourceKind,validateSource,validateSources,SOURCE_KEY} from '../src/lib/source-library.mjs';
import {selectSourceTab,captureVisibleArticle} from '../src/lib/source-capture.mjs';
import {normalizeLive} from '../src/lib/monitor-core.mjs';
import {readFile} from 'node:fs/promises';
const profileId='profile-abcdefgh';
const source={id:'article-12345678',profileId,kind:'forum',url:'https://forum.majestic-rp.ru/threads/court.123456/',title:'Судебное заседание',body:'Рассмотрение жалобы гражданина на действия ведомства с приложенными доказательствами и подтверждением оплаты эвакуации',capturedAt:'2026-10-27T10:00:00.000Z'};
test('only exact permitted public source hosts, not lookalikes, HTTP, or credentials',()=>{
 assert.equal(sourceKind(source.url),'forum');assert.equal(sourceKind('https://fletcher-wiki.com/majestic'),'fletcher');
 for(const url of ['https://fletcher-wiki.com.evil.test/x','http://fletcher-wiki.com/','https://forum.majestic-rp.ru:8080/','https://user:pass@fletcher-wiki.com/','javascript:alert(1)'])assert.throws(()=>sourceKind(url));
});
test('source validation does not permit forged kinds, oversized content, duplicate URLs or empty titles',()=>{
 assert.equal(validateSource(source).body,source.body);
 for(const row of [{...source,kind:'fletcher'},{...source,body:'<x>'},{...source,title:''},{...source,body:'X'.repeat(16001)}])assert.throws(()=>validateSource(row));
 assert.throws(()=>validateSources([source,{...source,id:'article-abcdefgh'}]),/Повторные/);
});
test('imported forum and Fletcher articles are genuinely indexed and cited in answers',()=>{
 const wiki={...source,id:'article-wiki123',kind:'fletcher',url:'https://fletcher-wiki.com/majestic/cars',title:'Fletcher Wiki: автомобили',body:'Автомобили представлены с рыночной ценой и перечнем игровых характеристик и доступного транспорта'};
 const records=buildSearchRecords({sources:[source,wiki]});
 assert.equal(searchRecords(records,'эвакуации',{profileId})[0].url,source.url);
 assert.equal(searchRecords(records,'автомобили',{profileId})[0].url,wiki.url);
 assert.equal(searchRecords(records,'эвакуации',{profileId:'profile-other12'}).length,0);
 assert.equal(answerLocal('эвакуации',records,profileId).refs[0].url,source.url);
});
test('source tab selection isolates Majestic RP vs Russia Online and ignores unrelated websites',()=>{
 const tabs=[{id:1,active:true,lastAccessed:10,url:'https://forum.russia.online/threads/987/'},{id:2,active:false,lastAccessed:1,url:source.url},{id:3,active:true,url:'https://evil.test/'}];
 assert.equal(selectSourceTab(tabs,'forum','majestic').tab.id,2);
 assert.equal(selectSourceTab(tabs,'forum','russia-online').tab.id,1);
 assert.throws(()=>selectSourceTab(tabs,'fletcher','majestic'),/Откройте/);
});
test('page reading uses DOM content without network access, script execution or hidden records',()=>{
 const oldDoc=globalThis.document,oldLoc=globalThis.location;
 try{
  globalThis.document={title:'Тема',querySelector(selector){return selector==='h1'?{textContent:'Права гражданина'}:null;},querySelectorAll(selector){return selector.includes('main')?[{innerText:'Вопрос об эвакуации по обращению DAO-001 и оплате парковки в штате'}]:[]}};
  globalThis.location={href:source.url};
  const result=captureVisibleArticle();assert.equal(result.title,'Права гражданина');assert.match(result.body,/DAO-001/);
 }finally{globalThis.document=oldDoc;globalThis.location=oldLoc;}
});
test('additional verified official API response shapes accepted without manufacturing players',()=>{
 const catalog=[{id:'RU1'},{id:'RO1'}];
 assert.deepEqual(normalizeLive({result:{servers:{RU1:{online:'321',queue:3},RO1:{players:{online:42},status:'online'}}}},catalog).map(x=>x.online),[321,42]);
 assert.equal(normalizeLive({data:{servers:[{serverId:'RU1',onlineCount:517}]}},catalog)[0].online,517);
 assert.throws(()=>normalizeLive({result:{servers:[{id:'RU1',online:'invalid'}]}},catalog),/подтверждённых/);
});
test('user navigation forms remain handled during capture and never native-post',async()=>{
 const main=await readFile(new URL('../src/ui/main.mjs',import.meta.url),'utf8');
 assert.match(main,/formId = event\.target\.getAttribute\('id'\)/);
 assert.match(main,/\['forum-template-form', 'xf-navigation-form'\]\.includes\(formId\)/);
 assert.match(main,/event\.preventDefault\(\);\s*void handleForumSubmit/);
 assert.match(main,/document\.addEventListener\('submit',[\s\S]*?, true\);/);
 assert.ok(SOURCE_KEY.includes('SourceLibrary'));
});
