import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState} from '../src/lib/model.mjs';
const records={};
globalThis.browser={runtime:{id:'test'},storage:{local:{
 async get(keys){if(keys===null)return {...records};return Object.fromEntries([keys].filter(k=>k in records).map(k=>[k,records[k]]));},
 async set(obj){Object.assign(records,obj);},
 async remove(key){delete records[key];}
}}};
const page=await import('../src/ui/forum-page.mjs');
const state=defaultState();
test('Forum Toolkit exposes real XenForo navigation edit UI',async()=>{
 await page.refreshForum();
 const html=page.forumSection(state);
 assert.match(html,/id="xf-navigation-form"/);
 assert.match(html,/name="profileId"/);
 assert.match(html,/Пользовательская навигация XenForo/);
 assert.match(html,/Публичные профили XenForo/);
});
test('submitted navigation is persisted and appears in Forum Toolkit list',async()=>{
 const values={id:'',title:'Тестовая ссылка',url:'https://forum.majestic-rp.ru/pages/rules/',profileId:state.activeProfileId};
 const fields={namedItem:key=>({value:values[key]})};
 const event={target:{id:{name:'id'},getAttribute:name=>name==='id'?'xf-navigation-form':null,elements:fields},preventDefault(){}};
 let rendered=0,message='';
 assert.equal(await page.handleForumSubmit(event,state,()=>rendered++,text=>message=text),true);
 assert.equal(rendered,1);
 assert.match(message,/сохранена/);
 const html=page.forumSection(state);
 assert.match(html,/Тестовая ссылка/);
 assert.match(html,/data-forum-action="edit-link"/);
 assert.match(html,/data-forum-action="remove-link"/);
});
