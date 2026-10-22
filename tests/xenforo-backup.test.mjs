import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/forum-core.js';
import {makeBackupV10,parseBackupV10} from '../src/lib/xenforo-backup.mjs';
import {makeBackupV9} from '../src/lib/productivity-backup.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {defaultState,validateState} from '../src/lib/model.mjs';
const C=globalThis.RPNForumCore;
const state=defaultState(),profile=state.profiles[0];
const record={id:'xf_test123',profileId:profile.id,title:'Правила',url:'https://forum.majestic-rp.ru/pages/rules/',createdAt:new Date().toISOString()};
const args=[state,[],[],[],[],[],[],[],defaultProductivity()];
test('v10 backup restores custom navigation with state and rejects invalid references',()=>{
 const exported=makeBackupV10(...args,[record],C.cleanTemplate);
 const parsed=parseBackupV10(exported,validateState,C.cleanTemplate);
 assert.equal(parsed.schemaVersion,10);
 assert.deepEqual(parsed.xenforoNavigation,[record]);
 const bad=JSON.parse(exported);bad.xenforoNavigation[0].profileId='unknown123';
 assert.throws(()=>parseBackupV10(JSON.stringify(bad),validateState,C.cleanTemplate),/отсутствующим профилем/);
});
test('backups from v9 retain existing navigation instead of deleting it',()=>{
 const legacy=makeBackupV9(...args,C.cleanTemplate);
 const parsed=parseBackupV10(legacy,validateState,C.cleanTemplate);
 assert.equal(parsed.xenforoNavigation,null);
 assert.equal(parsed.schemaVersion,9);
});
