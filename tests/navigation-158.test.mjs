import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/xenforo-core.js';
import {buildSearchRecords,searchRecords} from '../src/lib/productivity-core.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import '../src/lib/forum-core.js';
const XF=globalThis.MTXenForo,host='forum.majestic-rp.ru',other='forum.russia.online';
const date='2026-11-15T00:00:00.000Z';
const row=(id,extra={})=>({id:'nav_'+id,profileId:'profile-a',title:id,url:'https://'+host+'/threads/topic.12/',createdAt:date,...extra});
const data={};globalThis.browser={storage:{local:{async get(key){return key===null?{...data}:{[key]:data[key]};},async set(items){Object.assign(data,structuredClone(items));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}}}};
const store=await import('../src/lib/xenforo-store.mjs');
const {defaultState,validateState}=await import('../src/lib/model.mjs');
const {makeBackupV10,parseBackupV10}=await import('../src/lib/xenforo-backup.mjs');
test('legacy links keep their exact representation; new links validate every configurable field',()=>{
 const legacy=row('legacy123');assert.deepEqual(XF.validateLink(legacy),legacy);
 const link=XF.validateLink(row('new_link',{group:'Работа / Жалобы',placement:'header',target:'current',pinned:true,order:5,tags:['QA','QA'],icon:'law',note:'note',host}));
 assert.equal(link.group,'Работа/Жалобы');assert.deepEqual(link.tags,['QA']);
 for(const invalid of [{group:'a//b'},{placement:'html'},{target:'script'},{order:-1},{pinned:'yes'},{host:'evil.test'},{icon:'<img>'},{tags:Array(13).fill('a')}])assert.throws(()=>XF.validateLink({...link,...invalid}));
});
test('navigation filters profile, host and placement; pinned entries lead ordered menu',()=>{
 const rows=[row('regular01',{order:1}),row('pinned001',{pinned:true,order:100}),row('foreign01',{profileId:'profile-b'}),row('hostonly1',{profileId:'*',host:other}),row('panelonly',{placement:'panel'}),row('bookmark1',{kind:'bookmark',placement:'panel',host,tags:['суд']})].map(XF.validateLink);
 assert.deepEqual(XF.selectNavigation(rows,'profile-a',host,'header').map(x=>x.id),['nav_pinned001','nav_regular01']);
 assert.deepEqual(XF.selectNavigation(rows,'profile-a',host,'panel','суд').map(x=>x.id),['nav_bookmark1']);
 assert.ok(!XF.selectNavigation(rows,'profile-a',other).some(x=>x.kind==='bookmark'));
});
test('bookmarks and history strip sensitive query parameters and reject action URLs',()=>{
 assert.equal(XF.pageUrl('https://'+host+'/threads/topic.12/page-2?token=secret#post-42'),'https://'+host+'/threads/topic.12/page-2#post-42');
 for(const path of ['/login/','/threads/topic.12/delete','/account/','/threads/topic.12/reply','/threads/topic.12/move'])assert.throws(()=>XF.pageUrl('https://'+host+path));
 assert.throws(()=>XF.validateLink(row('bookmark2',{kind:'bookmark',profileId:'*'})));
 assert.throws(()=>XF.validateLink(row('bookmark2',{kind:'bookmark',host:other})));
});
test('menu and bookmark quotas are independent; duplicates rejected',()=>{
 const links=Array.from({length:60},(_,i)=>row('menu'+String(i).padStart(5,'0')));
 const bookmarks=Array.from({length:300},(_,i)=>row('book'+String(i).padStart(5,'0'),{kind:'bookmark'}));
 assert.equal(XF.validateLinks([...links,...bookmarks]).length,360);
 assert.throws(()=>XF.validateLinks([...links,row('extralink')]));assert.throws(()=>XF.validateLinks([...bookmarks,row('extrabook',{kind:'bookmark'})]));
});
test('storage saves current page once, tracks explicit open and isolates history; reorder is persisted',async()=>{
 const url='https://'+host+'/threads/topic.12/?token=secret';
 const first=await store.saveCurrentBookmark('profile-a',url,'Тема');const second=await store.saveCurrentBookmark('profile-a',url,'Дубликат');assert.equal(first.id,second.id);
 const marked=await store.markNavigationOpened(first.id,'profile-a',host);assert.ok(marked.lastOpened);await assert.rejects(()=>store.markNavigationOpened(first.id,'profile-b',host));
 await store.recordNavigationVisit('profile-a',url,'Тема');await store.recordNavigationVisit('profile-a',url,'Тема');assert.equal((await store.navigationHistory('profile-a')).length,1);assert.equal((await store.navigationHistory('profile-b')).length,0);
 await store.clearNavigationHistory('profile-a');assert.deepEqual(await store.navigationHistory('profile-a'),[]);
 const link=await store.saveXenForoLink({profileId:'profile-a',title:'Правила',url:'https://example.org/',group:'Работа'});
 await store.reorderNavigation([link.id,first.id],'profile-a',host);assert.deepEqual(XF.selectNavigation(await store.listXenForoLinks(),'profile-a',host).map(x=>x.id),[link.id,first.id]);
 await assert.rejects(()=>store.reorderNavigation([link.id,link.id],'profile-a',host));
});
test('backup round-trips metadata and local search respects forum and profile',()=>{
 const state=defaultState(),id=state.activeProfileId;
 const records=[XF.validateLink(row('backup123',{profileId:id,group:'Суд/Темы',kind:'bookmark',note:'тестовый источник',tags:['суд'],pinned:true,order:2,lastOpened:date})),XF.validateLink(row('backup456',{profileId:'*',host:other,title:'тестовый чужой'}))];
 const c=globalThis.RPNForumCore;const text=makeBackupV10(state,[],[],[],[],[],[],[],defaultProductivity(),records,c.cleanTemplate);
 assert.deepEqual(parseBackupV10(text,validateState,c.cleanTemplate).xenforoNavigation,records);
 const index=buildSearchRecords({navigation:records});assert.deepEqual(searchRecords(index,'тестовый',{profileId:id,host}).map(x=>x.id),[records[0].id]);
});

test('full Backup v14 round-trips Navigation 2.0 without including browsing history',async()=>{
 const {makeBackupV14,parseBackupV14}=await import('../src/lib/source-backup.mjs');
 const {emptyMonitor}=await import('../src/lib/monitor-core.mjs'),{emptyKnowledge}=await import('../src/lib/knowledge-core.mjs');
 const state=defaultState(),record=XF.validateLink(row('backup_v14',{profileId:state.activeProfileId,kind:'bookmark',group:'Работа/Суд',pinned:true,order:10,tags:['суд'],lastOpened:date}));
 const raw=makeBackupV14(state,[],[],[],[],[],[],[],defaultProductivity(),[record],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[]);
 assert.equal(JSON.parse(raw).schemaVersion,14);assert.deepEqual(parseBackupV14(raw,validateState,globalThis.RPNForumCore.cleanTemplate).xenforoNavigation,[record]);
 assert.ok(!raw.includes('mtNavigationHistory:'));
});
