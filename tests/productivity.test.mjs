import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {buildSearchRecords,searchRecords,excerpt,answerLocal,tokenize,validateProductivity,defaultProductivity} from '../src/lib/productivity-core.mjs';
import {escapeHtml} from '../src/lib/sites.mjs';
import {defaultState,validateState,savePreferences,parseBackup,makeBackup} from '../src/lib/model.mjs';
import {makeBackupV9,parseBackupV9} from '../src/lib/productivity-backup.mjs';
import '../src/lib/forum-core.js';
const id='profile-abcdefgh';
const other='profile-otherxxx';
const data={
 templates:[{id:'t-12345678',profileId:id,label:'Ответ суда',category:'Шаблоны',text:'Постановление о проведении заседания'}],
 cases:[{id:'c-12345678',profileId:id,title:'Жалоба №376',status:'waiting',url:'https://forum.majestic-rp.ru/threads/376/',note:'Истец ожидает ответа',draft:'Проверить доказательства',evidence:[{title:'Запись заседания',note:'16:55'}]}],
 economy:[{id:'e-12345678',profileId:other,type:'deal',date:'2026-10-21',title:'Автомобиль',note:'Сделка'}],
 laws:[{id:'law-12345',profileId:id,type:'book',title:'Уголовный кодекс',category:'Закон',activeEditionId:'edition-123',editions:[{id:'edition-old',label:'Старая',effectiveDate:'2026-01-01',articles:[{key:'12',title:'Устаревшая статья',text:'Неактуальный текст'}]},{id:'edition-123',label:'Октябрь',effectiveDate:'2026-10-21',articles:[{key:'12',title:'Процедура задержания',text:'Должностное лицо обязано разъяснить права задержанного'},{key:'7.1',title:'Обыск',text:'Обыск проводится на основаниях статьи 7.1'}]}]},{id:'memo-1234',profileId:id,type:'memo',title:'Памятка о правах',category:'Памятка',body:'Процессуальный порядок'}],
 government:[{id:'g-12345678',profileId:id,type:'department',name:'Окружной суд',code:'DC',officer:'William Bailey',position:'Судья',jurisdiction:'Сан-Андреас'},{id:'g-template',profileId:id,type:'template',title:'Ордер',category:'Шаблон',body:'Закон и судебное постановление'}],
 documents:[{id:'d-12345678',profileId:id,type:'document',currentVersion:2,versions:[{title:'Первая',body:'Старое',fields:[]},{title:'Решение суда',body:'Об удовлетворении иска',fields:[]} ]},{id:'dt-12345678',profileId:id,type:'template',title:'Форма протокола',category:'Суд',body:'Номер дела'}],
 links:[{id:'link-12345',title:'Fletcher Wiki',url:'https://fletcher-wiki.com/',notes:'Игровая база'}]
};
const rows=buildSearchRecords(data);
test('indexes 7 local modules and active law editions, not archival articles',()=>{
  assert.equal(new Set(rows.map(x=>x.type)).size,7);
  assert.ok(rows.some(x=>x.title.includes('Процедура задержания')));
  assert.ok(!rows.some(x=>x.title.includes('Устаревшая статья')));
  assert.equal(rows.filter(x=>x.type==='law').length,4);
});
test('normalizes ё, uses terms together and finds article numbers',()=>{
  assert.deepEqual(tokenize('Ёж 7'),['еж','7']);
  assert.equal(searchRecords(rows,'7.1',{profileId:id,type:'law'}).length,1);
  assert.equal(searchRecords(rows,'обыск основаниях',{profileId:id})[0].title,'Статья 7.1. Обыск');
});
test('isolates different profile records but preserves global site bookmarks',()=>{
  const own=searchRecords(rows,'автомобиль',{profileId:id});assert.equal(own.length,0);
  assert.equal(searchRecords(rows,'автомобиль',{profileId:other}).length,1);
  assert.equal(searchRecords(rows,'Fletcher',{profileId:id}).length,1);
});
test('ranks exact title ahead of body-only references',()=>{
  const hits=searchRecords(rows,'Окружной суд',{profileId:id});assert.equal(hits[0].title,'Окружной суд');
});
test('filters only selected module and limits result count',()=>{
  const hits=searchRecords(rows,'закон',{profileId:id,type:'government',limit:1});assert.equal(hits.length,1);assert.equal(hits[0].type,'government');
  assert.throws(()=>searchRecords(rows,'закон',{type:'unsupported'}),/фильтр/);
});
test('extracts excerpts and safely escapes untrusted HTML',()=>{
  const attack=buildSearchRecords({templates:[{id:'xx',profileId:id,label:'<img src=x onerror=alert(1)>',text:'Тест внедрения'}]})[0];
  assert.match(excerpt(attack,'тест'),/Тест/);
  assert.ok(!escapeHtml(attack.title).includes('<img'));
  assert.ok(escapeHtml(attack.title).includes('&lt;img'));
});
test('assistant summarizes local data without producing fabricated legal guidance',()=>{
  const overview=answerLocal('Сколько записей?',rows,id);
  assert.match(overview.answer,/1 шаблон/);assert.match(overview.answer,/1 жалоб/);
  const answer=answerLocal('задержанного',rows,id);
  assert.ok(answer.refs.some(r=>r.title.includes('Процедура задержания')));
  const noMatch=answerLocal('несуществующий термин 999999',rows,id);
  assert.equal(noMatch.refs.length,0);assert.match(noMatch.answer,/нет подходящих/);
});
test('assistant refuses malformed oversized question',()=>{
  assert.throws(()=>answerLocal(' '.repeat(501),rows,id),/Вопрос|Введите/);
  assert.throws(()=>answerLocal('x'.repeat(501),rows,id),/500/);
});
test('validates accent and editable shortcut mapping, strips unexpected fields',()=>{
  const defaults=defaultProductivity();assert.equal(defaults.shortcuts.length,8);
  assert.deepEqual(validateProductivity({...defaults,unexpected:'<script>'}),defaults);
  assert.throws(()=>validateProductivity({...defaults,accent:'url(javascript:)'}),/палитра/);
  assert.throws(()=>validateProductivity({...defaults,shortcuts:['forum']}),/клавиш/);
  assert.throws(()=>validateProductivity({...defaults,shortcuts:Array(8).fill('javascript:')}),/клавиш/);
});
test('existing settings and backup remain valid with new theme and search page',()=>{
  let s=defaultState();s=savePreferences(s,{theme:'contrast',startPage:'search'});
  assert.equal(validateState(s).preferences.theme,'contrast');
  assert.equal(parseBackup(makeBackup(s)).preferences.startPage,'search');
});
test('index uses bounded memory fields for large input',()=>{
  const long=buildSearchRecords({templates:[{id:'b',profileId:id,label:'Large',text:'x'.repeat(300000)}]});
  assert.ok(long[0].body.length<=16000);
});
test('local search responds efficiently for five thousand short records',()=>{
  const many=buildSearchRecords({templates:Array.from({length:5000},(_,i)=>({id:'entry-'+i,profileId:id,label:`Документ ${i}`,text:`Содержание справки ${i}`}))});
  const start=performance.now();const hits=searchRecords(many,'документ 4999',{profileId:id});
  assert.equal(hits[0].title,'Документ 4999');assert.ok(performance.now()-start<2000);
});
test('backup v9 stores productivity but retains older version parsing',()=>{
  const state=defaultState(),settings={accent:'teal',shortcutsEnabled:false,shortcuts:['search','home','forum','complaints','economy','law','government','documents']};
  const clean=globalThis.RPNForumCore.cleanTemplate;
  const backup=makeBackupV9(state,[],[],[],[],[],[],[],settings,clean);
  const parsed=parseBackupV9(backup,validateState,clean);
  assert.equal(parsed.schemaVersion,9);assert.deepEqual(parsed.productivity,settings);
  assert.ok(!backup.includes('access_token'));
  const old=JSON.parse(backup);old.schemaVersion=8;delete old.productivity;
  const legacy=parseBackupV9(JSON.stringify(old),validateState,clean);assert.equal(legacy.schemaVersion,8);assert.equal(legacy.productivity.accent,'blue');
});
test('backup v9 rejects malicious preference payload before import',()=>{
  const s=defaultState(),clean=globalThis.RPNForumCore.cleanTemplate;
  const payload=JSON.parse(makeBackupV9(s,[],[],[],[],[],[],[],defaultProductivity(),clean));
  payload.productivity.shortcuts[1]='http://phishing.example';
  assert.throws(()=>parseBackupV9(JSON.stringify(payload),validateState,clean),/клавиш/);
});
