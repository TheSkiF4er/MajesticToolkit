import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import {cleanVaultMetadata,validateFileSignature,VAULT_LIMITS} from '../src/lib/evidence-vault.mjs';
import {makeModerationBackup,parseModerationBackup} from '../src/lib/moderation-backup.mjs';
import {defaultState,validateState} from '../src/lib/model.mjs';
import '../src/lib/forum-core.js';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
const C=globalThis.RPNComplaints;
const base='2026-11-17T19:00:00Z';
const profile='profile_evidence_01';
const link={id:'evidence_abc123',profileId:profile,kind:'link',title:'Материал',note:'Комментарий',createdAt:base,url:'https://youtu.be/example?t=32#fragment',seconds:32};
const file={id:'vault_file_abc123',profileId:profile,kind:'file',title:'Снимок',note:'Контекст',createdAt:base,name:'photo.png',mime:'image/png',size:100,sha256:'a'.repeat(64)};

test('1.8.1 Evidence Vault validates and canonicalizes HTTPS link metadata',()=>{
 const result=cleanVaultMetadata(link);assert.equal(result.url,'https://youtu.be/example?t=32');assert.equal(result.seconds,32);
 for(const wrong of [{...link,url:'javascript:alert(1)'},{...link,url:'http://example.com'},{...link,seconds:-1},{...link,profileId:'bad'},{...link,title:''},{...link,url:'https://u:p@example.com/test'}])assert.throws(()=>cleanVaultMetadata(wrong));
});
test('1.8.1 Evidence Vault rejects tampered file metadata and signatures',()=>{
 assert.deepEqual(cleanVaultMetadata(file),file);
 for(const wrong of [{...file,sha256:'f'.repeat(63)},{...file,size:VAULT_LIMITS.fileBytes+1},{...file,mime:'text/html'},{...file,profileId:'wrong'},{...file,name:''}])assert.throws(()=>cleanVaultMetadata(wrong));
 assert.ok(validateFileSignature(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),'image/png'));
 assert.throws(()=>validateFileSignature(Uint8Array.from([0x3c,0x73,0x63,0x72,0x69,0x70,0x74]),'image/png'));
 assert.throws(()=>validateFileSignature(new Uint8Array([0,1,2]),'text/plain'));
});
test('1.8.1 linked file evidence persists through complaint validation and updates',()=>{
 const c=C.createCase({profileId:profile,url:'https://forum.majestic-rp.ru/threads/test.101/',title:'Тест жалобы'});
 const attached=C.addEvidence(c,{...file,vaultId:file.id});assert.equal(attached.evidence.length,1);
 assert.equal(attached.evidence[0].sha256,file.sha256);assert.equal(attached.evidence[0].url,null);
 assert.deepEqual(C.cleanCase(attached).evidence,attached.evidence);
 assert.equal(C.updateCase(attached,{note:'Другое'}).evidence[0].vaultId,file.id);
 assert.equal(C.removeEvidence(attached,attached.evidence[0].id).evidence.length,0);
});
test('1.8.1 legacy evidence retains original format and link references',()=>{
 const c=C.createCase({profileId:profile,url:'https://forum.majestic-rp.ru/threads/test.102/',title:'Тест старой жалобы'});
 const old=C.addEvidence(c,{title:'Таймкод',url:'https://www.youtube.com/watch?v=123',seconds:42,note:''});
 assert.equal(old.evidence[0].url,'https://www.youtube.com/watch?v=123');assert.ok(!('kind' in old.evidence[0]));
 const linked=C.addEvidence(old,{...link,vaultId:link.id});
 assert.equal(linked.evidence[1].vaultId,link.id);assert.equal(linked.evidence[1].seconds,32);
});
test('1.8.1 file integrity metadata remains in Backup v16 without embedding binary blobs',()=>{
 const state=defaultState(),p=state.profiles[0],c=C.addEvidence(C.createCase({profileId:p.id,url:'https://forum.majestic-rp.ru/threads/test.103/',title:'Тест копии'}),{...file,vaultId:file.id});
 const args=[state,[],[c],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
 const text=makeModerationBackup(args,{version:1,calculators:[],drafts:[]},{version:1,subscriptions:[],inbox:[]},{version:1,records:[]},{version:1,profiles:[]});
 const parsed=parseModerationBackup(text,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.schemaVersion,16);assert.equal(parsed.cases[0].evidence[0].sha256,file.sha256);assert.equal(parsed.cases[0].evidence[0].vaultId,file.id);
 assert.ok(!text.includes('data:image/png;base64'));
});

test('1.8.1 migrating legacy evidence retains ID, timecode and moderation references',()=>{
 const c=C.createCase({profileId:profile,url:'https://forum.majestic-rp.ru/threads/test.105/',title:'Миграция старого дела'});
 const linked=C.addEvidence(c,{title:'Видео',url:'https://youtu.be/example',seconds:42,note:'Событие'});
 const id=linked.evidence[0].id;
 const migrated=C.linkLegacyEvidence(linked,id,'vault_link_12345');
 assert.equal(migrated.evidence[0].id,id);assert.equal(migrated.evidence[0].url,linked.evidence[0].url);
 assert.equal(migrated.evidence[0].vaultId,'vault_link_12345');assert.equal(migrated.evidence[0].seconds,42);
 assert.throws(()=>C.linkLegacyEvidence(migrated,id,'vault_other_12345'));
 assert.deepEqual(C.cleanCase(migrated).evidence,migrated.evidence);
});
