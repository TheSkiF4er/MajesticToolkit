import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultState, addProfile} from '../src/lib/model.mjs';

const records = new Map();
const sent = [];
const queries = [];
const allowedOrigins = new Set(['https://forum.majestic-rp.ru/*','https://forum.russia.online/*']);
let tabList=[];
const storage = {
  async get(key){if(key===null)return Object.fromEntries(records);if(typeof key==='string')return {[key]:records.get(key)};return {};},
  async set(items){for(const [k,v] of Object.entries(items))records.set(k,v);},
  async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])records.delete(key);}
};
globalThis.browser={runtime:{id:'test-extension'},storage:{local:storage},permissions:{contains:async({origins})=>origins.every(o=>allowedOrigins.has(o))},tabs:{
  async query(q){queries.push(q);if(q.url)return tabList;return tabList.filter(x=>x.active);},
  async sendMessage(tabId,message){sent.push({tabId,message});return {ok:true};}
}};
const {upsertTemplate,listTemplates} = await import('../src/lib/forum-store.mjs');
const page = await import('../src/ui/forum-page.mjs');
let state=defaultState();
const majestic=state.profiles[0];
state=addProfile(state,{name:'Russia RP',project:'russia-online',server:'Beta',forumUrl:'https://forum.russia.online/'});
const russian=state.profiles.find(p=>p.project==='russia-online');
const mt=await upsertTemplate({profileId:majestic.id,label:'MT reply',category:'',format:'bbcode',text:'Test',shortcut:0});
const rt=await upsertTemplate({profileId:russian.id,label:'Russia reply',category:'',format:'bbcode',text:'Hello',shortcut:0});
const feedbacks=[];
const feedback=(msg,error)=>feedbacks.push({msg,error});
const insert=id=>page.handleForumAction({dataset:{forumAction:'insert',id}},state,()=>{},feedback);

// Assert that the real workspace's submit dispatch includes the navigation form,
// then exercise the actual handler with a browser-storage implementation.
test('workspace dispatch actually routes XenForo navigation submits (not just template form)',async()=>{
 const main=await readFile(new URL('../src/ui/main.mjs',import.meta.url),'utf8');
 assert.match(main,/document\.addEventListener\('submit', event => \{/);
 assert.match(main,/\['forum-template-form', 'xf-navigation-form'\]\.includes\(event\.target\.id\)/);
 await page.refreshForum();
 const values={id:'',title:'Правила сервера',url:'https://forum.majestic-rp.ru/pages/rules/',profileId:majestic.id};
 const form={id:'xf-navigation-form',elements:{namedItem:n=>({value:values[n]})}};
 let prevented=0,rendered=0;
 assert.equal(await page.handleForumSubmit({target:form,preventDefault(){prevented++;}},state,()=>rendered++,feedback),true);
 assert.equal(prevented,1);assert.equal(rendered,1);
 const list=page.xenforoLinks();
 assert.ok(list.some(x=>x.title==='Правила сервера'&&x.profileId===majestic.id));
});

test('insertion finds an inactive forum tab while the workspace is active',async()=>{
 tabList=[
  {id:101,url:'https://forum.majestic-rp.ru/threads/test.123/',active:false,currentWindow:true,lastAccessed:10},
  {id:102,url:'https://forum.russia.online/threads/test.123/',active:false,currentWindow:true,lastAccessed:20}
 ];
 sent.length=0;
 await insert(mt.id);
 assert.equal(sent.length,1);assert.equal(sent[0].tabId,101);
 assert.equal(sent[0].message.id,mt.id);
 assert.ok(queries.at(-1).url.includes('https://forum.majestic-rp.ru/*'));
});

test('insertion from a different project targets its own forum and never the other project',async()=>{
 sent.length=0;
 await insert(rt.id);
 assert.equal(sent.length,1);assert.equal(sent[0].tabId,102);
});

test('no site permission stops insertion with actionable error',async()=>{
 allowedOrigins.delete('https://forum.majestic-rp.ru/*');sent.length=0;
 await insert(mt.id);
 assert.equal(sent.length,0);
 assert.match(feedbacks.at(-1).msg,/Сайты и доступ/);
 allowedOrigins.add('https://forum.majestic-rp.ru/*');
});

test('no matching tab does not post to another forum',async()=>{
 tabList=[{id:102,url:'https://forum.russia.online/threads/other.123/',active:false,currentWindow:true}];sent.length=0;
 await insert(mt.id);
 assert.equal(sent.length,0);
 assert.match(feedbacks.at(-1).msg,/Откройте соответствующий форум/);
});
