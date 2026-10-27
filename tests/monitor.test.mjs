import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCatalog,normalizeLive,validateMonitor,emptyMonitor,toggleFavorite,saveCard,deleteCard,applyCatalog,applyLive,validatePublicCard} from '../src/lib/monitor-core.mjs';
const serverResponse={code:200,status:true,result:{servers:[{id:'RU1',name:'New York',region:'RU'},{id:'RU19',name:'Memphis',region:'RU'},{id:'RO1',name:'Арбатский',region:'RU'},{id:'DE1',name:'Berlin',region:'DE'}]}};
const catalog=normalizeCatalog(serverResponse);
const rawCard={profileId:'profile_majestic',url:'https://forum.majestic-rp.ru/members/real-player.12345/',name:'Real Player',subtitle:'Участник',stats:[{label:'Сообщения',value:'45'}]};
test('official mixed-project catalog preserves IDs, project association and region',()=>{
 assert.deepEqual(catalog.map(x=>x.project),['majestic','majestic','russia-online','majestic']);
 assert.equal(catalog[2].name,'Арбатский');
 assert.throws(()=>normalizeCatalog({result:{servers:[{id:'RO1',name:'One'},{id:'RO1',name:'Two'}]}}),/Повторный/);
 assert.throws(()=>normalizeCatalog({result:{servers:[{id:'fake',name:'Nonsense'}]}}),/идентификатор/);
 assert.throws(()=>normalizeCatalog({result:{servers:[]}}),/корректный/);
});
test('live figures require explicit numeric facts and accepted IDs',()=>{
 const v=normalizeLive({result:{servers:[{id:'RU1',online:123,queue:2,status:'online'},{id:'RO1',players:44,queueCount:0,status:'offline'},{id:'NOT-VALID',players:555}]}},catalog);
 assert.deepEqual(v,[{id:'RU1',online:123,queue:2,availability:'online'},{id:'RO1',online:44,queue:0,availability:'offline'}]);
 assert.equal(normalizeLive({result:{servers:[{id:'RU1',online:'123'}]}},catalog)[0].online,123);
 assert.throws(()=>normalizeLive({result:{servers:[{id:'RU1',online:'12x'}]}},catalog),/подтверждённых/);
 assert.throws(()=>normalizeLive({},catalog),/не предоставил/);
});
test('favorites and cached samples survive offline without manufacturing statistics',()=>{
 let d=applyCatalog(emptyMonitor(),catalog,'2026-10-22T12:00:00.000Z');
 assert.equal(d.live.length,0);assert.equal(d.liveAt,null);
 d=toggleFavorite(d,'RU1');assert.deepEqual(d.favorites,['RU1']);d=toggleFavorite(d,'RU1');assert.deepEqual(d.favorites,[]);
 d=applyLive(d,[{id:'RO1',online:15,queue:0,availability:'online'}],'2026-10-22T12:01:00.000Z');
 assert.equal(validateMonitor(d).live[0].online,15);
 d=applyCatalog(d,[catalog[0]],'2026-10-22T12:02:00.000Z');assert.equal(d.live.length,0);
});
test('public player cards are strictly constrained to visible XenForo member URLs',()=>{
 const card=validatePublicCard(rawCard);assert.equal(card.stats.length,1);
 assert.throws(()=>validatePublicCard({...rawCard,url:'https://evil.example/members/real-player.12345/'}),/публичн/);
 assert.throws(()=>validatePublicCard({...rawCard,url:'https://forum.majestic-rp.ru/account/'}),/публичн/);
 assert.throws(()=>validatePublicCard({...rawCard,url:'http://forum.majestic-rp.ru/members/foo/'}),/публичн/);
 assert.throws(()=>validatePublicCard({...rawCard,name:'<'.repeat(300)}),/длину|строковое/);
});
test('player cards update by profile and URL and cannot be deleted across profiles',()=>{
 let s=saveCard(emptyMonitor(),rawCard);
 s=saveCard(s,{...rawCard,profileId:'profile_2'});
 s=saveCard(s,{...rawCard,name:'Updated',stats:[]});
 assert.equal(s.players.length,2);
 assert.equal(s.players.find(x=>x.profileId==='profile_majestic').name,'Updated');
 s=deleteCard(s,'profile_majestic',rawCard.url);
 assert.equal(s.players.length,1);assert.equal(s.players[0].profileId,'profile_2');
});
test('storage schema rejects duplicate favorites and oversized player lists',()=>{
 assert.throws(()=>validateMonitor({...emptyMonitor(),favorites:['RO1','ro1']}),/Повторный/);
 assert.throws(()=>validateMonitor({...emptyMonitor(),players:Array(251).fill(rawCard)}),/лимит/);
});
