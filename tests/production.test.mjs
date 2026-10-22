import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import {contentSender,extensionPageSender,matchingForumProfile,validatePayloadSize} from '../src/lib/message-security.mjs';
const ext={id:'test-extension-123',getURL:path=>'chrome-extension://test-extension-123/'+path};
const sender=url=>({id:ext.id,url,frameId:0});

test('content bridge rejects spoofed origins, nested frames, credentials, and extension-page impersonation',()=>{
 assert.ok(contentSender(sender('https://forum.majestic-rp.ru/threads/test.42/'),ext.id,'forum'));
 assert.ok(contentSender(sender('https://forum.russia.online/members/user.13/'),ext.id,'forum'));
 assert.ok(contentSender(sender('https://www.youtube.com/watch?v=abc'),ext.id,'video'));
 for(const url of ['https://forum.majestic-rp.ru.attacker.org/threads/a.1/','http://forum.majestic-rp.ru/threads/a.1/','https://user:pass@forum.majestic-rp.ru/','https://forum.majestic-rp.ru:8443/','https://example.net/','javascript:alert(1)']){
  assert.equal(contentSender(sender(url),ext.id,'forum'),false,url);
 }
 assert.equal(contentSender({...sender('https://forum.majestic-rp.ru/'),frameId:1},ext.id,'forum'),false);
 assert.equal(contentSender({...sender('https://forum.majestic-rp.ru/'),id:'other'},ext.id,'forum'),false);
 assert.equal(extensionPageSender(sender('chrome-extension://test-extension-123/ui/workspace.html'),ext),true);
 assert.equal(extensionPageSender(sender('chrome-extension://test-extension-123/other/page.html'),ext),false);
 assert.equal(extensionPageSender(sender('https://forum.majestic-rp.ru/'),ext),false);
});
test('forum-scoped profiles never use active profile of another project',async()=>{
 await import('../src/lib/xenforo-core.js');const xf=globalThis.MTXenForo;
 const state={activeProfileId:'profile-russia',profiles:[
  {id:'profile-majestic',forumUrl:'https://forum.majestic-rp.ru/'},
  {id:'profile-russia',forumUrl:'https://forum.russia.online/'}]};
 assert.equal(matchingForumProfile(state,'https://forum.majestic-rp.ru/threads/a.1/',xf).id,'profile-majestic');
 assert.equal(matchingForumProfile(state,'https://forum.russia.online/threads/a.1/',xf).id,'profile-russia');
 assert.throws(()=>matchingForumProfile(state,'https://example.com/',xf),/Нет профиля/);
});
test('oversize and cyclic messages fail before storage or network operations',()=>{
 assert.doesNotThrow(()=>validatePayloadSize({type:'x',text:'A'.repeat(1000)}));
 assert.throws(()=>validatePayloadSize({type:'x',text:'B'.repeat(66000)}),/Слишком большой/);
 const cyclic={};cyclic.self=cyclic;
 assert.throws(()=>validatePayloadSize(cyclic),/Некорректное сообщение/);
});

test('persisted content script registrations are reconciled on version changes',async()=>{
 const bg=await readFile(new URL('../src/background/background.js',import.meta.url),'utf8');
 assert.match(bg,/const obsolete=current&&/);
 assert.match(bg,/obsolete\)\)await api\.scripting\.unregisterContentScripts/);
 assert.match(bg,/\(!current\|\|obsolete\)\)await api\.scripting\.registerContentScripts/);
 assert.match(bg,/current\.profileId!==state\?\.activeProfileId/);
 assert.match(bg,/matchingForumProfile\(saved,sender\.url/);
});

const values=new Map();let writes=0;
globalThis.browser={storage:{local:{async get(arg){const pairs=Object.fromEntries(values);if(arg===null)return pairs;if(typeof arg==='string')return {[arg]:values.get(arg)};return Object.fromEntries(arg.map(k=>[k,values.get(k)]));},async set(v){writes+=Object.keys(v).length;for(const [k,x]of Object.entries(v))values.set(k,x);},async remove(arg){for(const k of Array.isArray(arg)?arg:[arg])values.delete(k);}}}};
test('observing unchanged posts avoids redundant storage writes; new posts are persisted',async()=>{
 const store=await import('../src/lib/complaints-store.mjs');
 const url='https://forum.majestic-rp.ru/threads/integration.321/';
 const c=await store.createComplaint({profileId:'profile-majestic',url,title:'Test workflow'});
 let got=await store.observeThread(url,20,'profile-majestic');assert.equal(got.length,0);
 const count=writes;
 await store.observeThread(url,20,'profile-majestic');assert.equal(writes,count);
 got=await store.observeThread(url,21,'profile-majestic');assert.equal(got.length,1);
 assert.equal((await store.getCase(c.id)).unread,true);
 const second=await store.createComplaint({profileId:'profile-russia',url,title:'Other profile'});
 const savedBefore=await store.getCase(second.id);
 await store.observeThread(url,25,'profile-majestic');
 assert.equal((await store.getCase(second.id)).lastSeenPostId,savedBefore.lastSeenPostId);
 await store.removeComplaint(c.id);await store.removeComplaint(second.id);
});
test('case list remains responsive for moderate local workloads',async()=>{
 const store=await import('../src/lib/complaints-store.mjs');
 const start=performance.now();
 const seed=(await import('../src/lib/complaints-store.mjs'));
 const rows=Array.from({length:250},(_,i)=>`https://forum.majestic-rp.ru/threads/perftest.${1000+i}/`);
 for(const url of rows)await store.createComplaint({profileId:'profile-majestic',url,title:'Load test'});
 const list=await store.listCases();
 assert.ok(list.length>=250);
 assert.ok(performance.now()-start<10000,'250 sequential records should be manageable');
 // A single browser-extension storage clear in test scope; no persisted user data is touched.
 values.clear();
});
