import test from 'node:test';
import assert from 'node:assert/strict';
// Stand-alone simulated browser API; no network is requested during UI rendering.
const db=new Map();
globalThis.browser={storage:{local:{async get(k){return k===null?Object.fromEntries(db):Object.fromEntries([k].filter(x=>db.has(x)).map(x=>[x,db.get(x)]));},async set(x){for(const [k,v] of Object.entries(x))db.set(k,v);},async remove(k){db.delete(k);}}},permissions:{async contains(){return true;},async request(){return true;}}};
const {saveCard,applyCatalog,emptyMonitor}=await import('../src/lib/monitor-core.mjs');
const {replaceMonitor}=await import('../src/lib/monitor-store.mjs');
const UI=await import('../src/ui/monitor-page.mjs');
const state={activeProfileId:'majestic_0001'};
test('UI displays verified server list, favorites, and correctly escaped saved player data',async()=>{
 let d=applyCatalog(emptyMonitor(),[{id:'RU1',name:'New York',region:'RU',project:'majestic'},{id:'RO1',name:'Арбатский',region:'RU',project:'russia-online'}]);
 d=saveCard(d,{profileId:state.activeProfileId,url:'https://forum.majestic-rp.ru/members/fred.123/',name:'<img src=x onerror=alert(1)>',subtitle:'Hello',stats:[{label:'Posts',value:'12'}]});
 await replaceMonitor(d);await UI.refreshMonitor();
 const html=UI.monitorSection(state);
 assert.match(html,/New York/);assert.match(html,/Арбатский/);assert.match(html,/Сохраните|Карточки пользователей/);
 assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
 UI.setMonitorFilter('russia-online');assert.doesNotMatch(UI.monitorSection(state),/New York <small>/);
 UI.setMonitorFilter('all');
});
test('favorite action persists immediately and auto refresh setting can be disabled',async()=>{
 await UI.handleMonitorAction({dataset:{monitorAction:'favorite',id:'RU1'}},state,()=>{},()=>{});
 assert.match(UI.monitorSection(state),/★ Убрать/);
 await UI.setMonitorAutoRefresh(true);
 assert.match(UI.monitorSection(state),/checked/);
 await UI.setMonitorAutoRefresh(false);
});
