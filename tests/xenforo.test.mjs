import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const code=await readFile(new URL('../src/lib/xenforo-core.js',import.meta.url),'utf8');
const context={URL,Date,Set,Error,Number,Array,Object,globalThis:{}};
runInNewContext(code,context);
const XF=context.globalThis.MTXenForo;
const normalize=v=>JSON.parse(JSON.stringify(v));

function fakeNode({text='',href='',attrs={},within=[],children={}}={}){
  return {
    textContent:text,
    getAttribute:key=>key==='href'?href:attrs[key]??null,
    querySelector:selector=>Object.entries(children).find(([key])=>selector.split(',').some(s=>key===s.trim()))?.[1]||null,
    closest:selector=>within.some(s=>selector.split(',').some(k=>s===k.trim()))?{}:null,
    matches:()=>false
  };
}
function fakeDoc({match={},list={}}={}){
  return {
    querySelector:selector=>selector.split(',').map(s=>s.trim()).map(s=>match[s]).find(Boolean)||null,
    querySelectorAll:selector=>list[selector]||[]
  };
}

test('site adapters accept exact HTTPS forum origins only',()=>{
  assert.equal(XF.domain('https://forum.majestic-rp.ru/threads/test.123/'),'forum.majestic-rp.ru');
  assert.equal(XF.domain('https://forum.russia.online/members/example.10/'),'forum.russia.online');
  for(const url of ['https://forum.russia.online.evil.test/','http://forum.russia.online/','https://example.org/','https://foo@forum.majestic-rp.ru/','https://forum.russia.online:8443/'])assert.equal(XF.domain(url),null);
});

test('active profile cannot leak across forums',()=>{
  const profiles=[{id:'a',forumUrl:'https://forum.majestic-rp.ru/',project:'majestic'}, {id:'b',forumUrl:'https://forum.russia.online/',project:'russia-online'}, {id:'c',forumUrl:'https://forum.russia.online/',project:'russia-online'}];
  assert.equal(XF.matchingProfile(profiles,'a','https://forum.russia.online/threads/demo.3/').id,'b');
  assert.equal(XF.matchingProfile(profiles,'c','https://forum.russia.online/threads/demo.3/').id,'c');
  assert.equal(XF.matchingProfile(profiles,'b','https://forum.majestic-rp.ru/').id,'a');
  assert.equal(XF.matchingProfile(profiles,'a','https://forum.russia.online.evil.test/'),null);
  assert.equal(XF.matchingProfile([],null,'https://forum.majestic-rp.ru/'),null);
});

test('custom navigation validates HTTPS, IDs, duplicates and limits',()=>{
  const data={id:'xf_12345678',profileId:'p123',title:'Правила <script>',url:'https://example.org/rules?x=1'};
  const verified=normalize(XF.validateLink(data));assert.equal(verified.id,data.id);assert.equal(verified.title,data.title);assert.equal(verified.url,data.url);assert.ok(Number.isFinite(Date.parse(verified.createdAt)));
  for(const url of ['javascript:alert(1)','http://example.com','https://name:pwd@example.com/','https://example.com:8443/','data:text/html,hello'])assert.throws(()=>XF.safeLink(url));
  assert.throws(()=>XF.validateLink({...data,profileId:'../..'}));
  assert.throws(()=>XF.validateLinks([data,data]));
  assert.throws(()=>XF.validateLinks(Array.from({length:61},(_,i)=>({...data,id:'xf_'+String(i).padStart(8,'0')}))));
});

test('public member information is parsed only from the currently visible member page',()=>{
  const name=fakeNode({text:'  William  Bailey  '}),title=fakeNode({text:'Судья'});
  const row=fakeNode({children:{dt:fakeNode({text:'Сообщения'}),dd:fakeNode({text:'143'})}});
  const doc=fakeDoc({match:{'.memberHeader-name':name,'.memberHeader-blurb':title},list:{'.memberHeader-stats .pairs, .memberHeader-stats dl, .block-body .pairs, .memberHeader-info .pairs':[row]}});
  const member=normalize(XF.memberProfile(doc,'https://forum.majestic-rp.ru/members/william-bailey.3/?tab=latest'));
  assert.equal(member.name,'William Bailey');
  assert.equal(member.subtitle,'Судья');
  assert.deepEqual(member.stats,[{label:'Сообщения',value:'143'}]);
  assert.equal(member.url,'https://forum.majestic-rp.ru/members/william-bailey.3/');
  assert.equal(XF.memberProfile(doc,'https://forum.majestic-rp.ru/threads/example.2/'),null);
  assert.equal(XF.memberProfile(doc,'https://forum.majestic-rp.ru.evil.test/members/foo/'),null);
});

test('moderation opens only visible same-origin XenForo controls on thread pages',()=>{
  const close=fakeNode({text:'Закрыть тему',href:'/threads/topic.12/lock',within:['.menu']});
  const move=fakeNode({text:'Перенести тему',href:'/threads/topic.12/move',within:['.menu']});
  const hostile=fakeNode({text:'Закрыть тему',href:'https://evil.test/threads/topic.12/lock',within:['.menu']});
  const doc=fakeDoc({list:{'a[href],button[data-xf-click],button[data-href],.menu button':[hostile,close,move]}});
  const url='https://forum.russia.online/threads/topic.12/';
  assert.equal(XF.moderationAction(doc,url,'close'),close);
  assert.equal(XF.moderationAction(doc,url,'move'),move);
  assert.equal(XF.moderationAction(doc,'https://forum.russia.online/forums/','move'),null);
  assert.equal(XF.moderationAction(doc,url,'delete'),null);
  assert.equal(XF.moderationAction(fakeDoc({list:{'a[href],button[data-xf-click],button[data-href],.menu button':[hostile]}}),url,'close'),null);
});
