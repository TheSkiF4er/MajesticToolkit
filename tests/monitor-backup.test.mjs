import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/forum-core.js';
import {makeBackupV11,parseBackupV11} from '../src/lib/monitor-backup.mjs';
import {makeBackupV10} from '../src/lib/xenforo-backup.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {saveCard,emptyMonitor,toggleFavorite} from '../src/lib/monitor-core.mjs';
const state=defaultState();const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[]];
const C=globalThis.RPNForumCore;
const card={profileId:state.activeProfileId,url:'https://forum.majestic-rp.ru/members/someone.123/',name:'Someone',stats:[]};
const data=toggleFavorite(saveCard(emptyMonitor(),card),'RU1');
test('v11 backup round-trips selected servers and public profile cards',()=>{
 const txt=makeBackupV11(...args,data,C.cleanTemplate);
 const parsed=parseBackupV11(txt,validateState,C.cleanTemplate);
 assert.equal(parsed.schemaVersion,11);assert.deepEqual(parsed.serverMonitor,data);
});
test('v11 backup rejects player cards bound to absent profiles',()=>{
 const txt=makeBackupV11(...args,data,C.cleanTemplate);
 const raw=JSON.parse(txt);raw.serverMonitor.players[0].profileId='not-present';
 assert.throws(()=>parseBackupV11(JSON.stringify(raw),validateState,C.cleanTemplate),/удалённым профилем/);
});
test('v10 backup retains current monitor state when imported',()=>{
 const old=makeBackupV10(...args,C.cleanTemplate);
 const parsed=parseBackupV11(old,validateState,C.cleanTemplate);
 assert.equal(parsed.schemaVersion,10);assert.equal(parsed.serverMonitor,null);
});
