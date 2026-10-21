import test from 'node:test';import assert from 'node:assert/strict';
import {makeBackupV8,parseBackupV8} from '../src/lib/integration-backup.mjs';
import {defaultState,validateState} from '../src/lib/model.mjs';
import '../src/lib/forum-core.js';
const core=globalThis.RPNForumCore;
test('v8 backup includes links and excludes Google credentials',()=>{
 const state=defaultState();const links=[{id:'abcdefgh1234',title:'Docossum',url:'https://docossum.com/legal',notes:'Отмечено'}];
 const text=makeBackupV8(state,[],[],[],[],[],[],links,core.cleanTemplate);
 const restored=parseBackupV8(text,validateState,core.cleanTemplate);
 assert.equal(restored.schemaVersion,8);assert.equal(restored.siteLinks.length,1);
 assert.equal(restored.siteLinks[0].url,'https://docossum.com/legal');
 assert.ok(!text.includes('access_token')&&!text.includes('googleClientId'));
});
test('v8 backup rejects unsafe site links',()=>{
 const state=defaultState();assert.throws(()=>makeBackupV8(state,[],[],[],[],[],[],[{id:'abcdefgh1234',title:'Bad',url:'https://evil.test'}],core.cleanTemplate));
});
