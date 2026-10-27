import test from 'node:test';
import assert from 'node:assert/strict';
const values={};const operations=[];
let snapshot={url:'https://forum.majestic-rp.ru/threads/proceeding.221/',title:'Судебное заседание',body:'Заявитель предоставил доказательства эвакуации и письменное пояснение. Документы рассматриваются судом в установленном порядке.'};
const tabs=[{id:42,url:snapshot.url,active:false,lastAccessed:100}];
let userInput=false;
globalThis.browser={
 storage:{local:{async get(key){return {[key]:values[key]};},async set(updates){Object.assign(values,updates);}}},
 permissions:{contains({origins}){operations.push('contains');return Promise.resolve(origins.every(o=>o.includes('forum.majestic-rp.ru')));},request({origins}){operations.push('request');if(!userInput)throw Error('permissions.request may only be called from a user input handler');return Promise.resolve(origins.every(o=>o.includes('fletcher-wiki.com')));}},
 tabs:{query(options){operations.push('tabs');return Promise.resolve(tabs);}},
 scripting:{executeScript({target,func}){operations.push('execute');assert.equal(target.tabId,42);assert.equal(typeof func,'function');return Promise.resolve([{result:snapshot}]);}}
};
const {importOpenedPage}=await import('../src/lib/source-capture.mjs');
const {listSources,removeSource}=await import('../src/lib/source-library.mjs');
const profile={id:'profile-abcdefgh',project:'majestic',name:'Test',server:'Seattle'};
test('forum source import reads only an explicitly permitted opened tab and persists searchable text',async()=>{
 const row=await importOpenedPage('forum',profile);assert.equal(row.title,snapshot.title);
 assert.equal((await listSources())[0].url,snapshot.url);
 assert.deepEqual(operations,['contains','tabs','execute']);
 snapshot={...snapshot,title:'Судебное заседание — обновление'};
 const again=await importOpenedPage('forum',profile);assert.equal(again.id,row.id);
 assert.equal((await listSources()).length,1);
 await removeSource(row.id,profile.id);
 assert.equal((await listSources()).length,0);
});
test('Fletcher permission is requested directly in user-gesture handler before any other async API',async()=>{
 operations.length=0;
 snapshot={url:'https://fletcher-wiki.com/majestic',title:'Fletcher Wiki',body:'Игровая энциклопедия транспорта с большим количеством моделей, названий и характеристик, доступных игрокам.'};
 tabs[0].url=snapshot.url;userInput=true;
 const pending=importOpenedPage('fletcher',profile);userInput=false;
 const row=await pending;
 assert.equal(row.kind,'fletcher');assert.deepEqual(operations,['request','tabs','execute']);
});
test('anti-bot challenge content is refused rather than stored as encyclopedic knowledge',async()=>{
 operations.length=0;
 snapshot={url:'https://fletcher-wiki.com/',title:'Checking your browser',body:'Automated protection: Checking your browser. This takes a moment and happens automatically.'};
 userInput=true;const pending=importOpenedPage('fletcher',profile);userInput=false;
 await assert.rejects(pending,/защищён/);
 assert.equal((await listSources()).length,1);
});
