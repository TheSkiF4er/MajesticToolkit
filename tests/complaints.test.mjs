import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
import {defaultState, validateState} from '../src/lib/model.mjs';
const C = globalThis.RPNComplaints;
const F = globalThis.RPNForumCore;
const mem = new Map();
function clone(x) {return structuredClone(x);}
globalThis.browser = {storage:{local:{
  async get(keys) {
    if (keys===null) return Object.fromEntries([...mem].map(([k,v])=>[k,clone(v)]));
    const input=Array.isArray(keys)?keys:[keys];
    return Object.fromEntries(input.filter(k=>mem.has(k)).map(k=>[k,clone(mem.get(k))]));
  },
  async set(records) {for(const [k,v] of Object.entries(records)) mem.set(k,clone(v));},
  async remove(keys) {for(const key of Array.isArray(keys)?keys:[keys]) mem.delete(key);}
}}};
const S = await import('../src/lib/complaints-store.mjs');
let state, profileId;
const urlA='https://forum.majestic-rp.ru/threads/test-case.376/';
const urlB='https://forum.russia.online/threads/test-case.726/';
beforeEach(() => {mem.clear();state=defaultState();profileId=state.activeProfileId;});
const seed=(over={})=>C.createCase({profileId,title:'Жалоба №376',url:urlA,...over});
test('canonical thread key ignores query, case slug, pages and anchors',()=>{
  assert.equal(C.threadKey('https://forum.majestic-rp.ru/threads/foo.376/page-2?x=y#last'),C.threadKey(urlA));
  assert.equal(C.threadKey('https://forum.majestic-rp.ru/threads/anything.376/'),C.threadKey(urlA));
});
test('rejects external, HTTP, credentialed, script, and non-thread complaint URLs',()=>{
  for (const url of ['http://forum.majestic-rp.ru/threads/1','https://evil.example/threads/1','https://bob:secret@forum.majestic-rp.ru/threads/1','javascript:alert(1)','https://forum.majestic-rp.ru/forums/1']) assert.throws(()=>C.canonicalThreadUrl(url));
});
test('creates case with scoped profile, timestamp, editable data and zero evidence',()=>{
  const c=seed(); assert.equal(c.profileId,profileId);assert.equal(c.status,'new');assert.deepEqual(c.evidence,[]);assert.equal(c.watching,true);assert.equal(c.unread,false);
  assert.equal(C.cleanCase(c).id,c.id);
});
test('only approved fields may be patched; id and url immutable',()=>{
  const c=seed(); const n=C.updateCase(c,{status:'waiting',note:'Проверить видео',id:'evil',profileId:'evil',url:urlB});
  assert.equal(n.status,'waiting');assert.equal(n.note,'Проверить видео');assert.equal(n.id,c.id);assert.equal(n.url,c.url);assert.equal(n.profileId,c.profileId);
});
test('evidence records preserve URL and exact seconds and validate schemes',()=>{
  const c=seed(), n=C.addEvidence(c,{url:'https://www.youtube.com/watch?v=abc',seconds:125,title:'Видеозапись'});
  assert.equal(n.evidence.length,1);assert.equal(n.evidence[0].seconds,125);assert.equal(C.timecode(125),'02:05');assert.equal(c.evidence.length,0);
  assert.throws(()=>C.addEvidence(c,{url:'javascript:alert(1)',title:'x'}));
  assert.throws(()=>C.addEvidence(c,{url:'https://www.youtube.com/watch?v=123',seconds:1.3,title:'x'}));
});
test('invalid status, dates, evidence limits and oversized drafts rejected',()=>{
  const c=seed();for(const patch of [{status:'deleted'},{deadline:'2025-42-99'},{draft:'a'.repeat(30001)}]) assert.throws(()=>C.updateCase(c,patch));
  assert.throws(()=>C.cleanCase({...c,evidence:Array(61).fill(null)}));
});
test('monitor establishes baseline silently and signals strictly newer post IDs',()=>{
  const c=seed();let r=C.observeCase(c,123,'2026-10-21T09:00:00Z');assert.equal(r.changed,false);assert.equal(r.item.lastSeenPostId,123);
  r=C.observeCase(r.item,124,'2026-10-21T09:01:00Z');assert.equal(r.changed,true);assert.equal(r.item.unread,true);
  r=C.observeCase(r.item,123,'2026-10-21T09:02:00Z');assert.equal(r.changed,false);assert.equal(r.item.lastSeenPostId,124);
});
test('monitor ignores disabled subscriptions and missing numeric post ID',()=>{
  let c=seed({watching:false});let r=C.observeCase(c,550);assert.equal(r.item.lastSeenPostId,null);
  c=seed();r=C.observeCase(c,null);assert.equal(r.item.lastSeenPostId,null);assert.equal(r.changed,false);
});
test('case mutations persist and isolated profiles do not clobber records',async()=>{
  const a=await S.createComplaint({profileId,title:'First',url:urlA});
  const b=await S.createComplaint({profileId:'second-profile',title:'Second',url:urlA});
  await S.editComplaint(a.id,{status:'in-progress',draft:'Draft test'});
  const result=await S.listCases();assert.equal(result.length,2);
  assert.equal((await S.getCase(a.id)).draft,'Draft test');assert.equal((await S.getCase(b.id)).status,'new');
});
test('duplicate thread per profile is rejected regardless of display slug or query',async()=>{
  await S.createComplaint({profileId,title:'A',url:urlA});
  await assert.rejects(S.createComplaint({profileId,title:'B',url:'https://forum.majestic-rp.ru/threads/other.376/?page=1'}));
});
test('evidence add/remove preserves complaint and other fields',async()=>{
  const c=await S.createComplaint({profileId,title:'A',url:urlA});
  const withEvidence=await S.addComplaintEvidence(c.id,{title:'Video',url:'https://rutube.ru/video/abcd/',seconds:60});
  assert.equal(withEvidence.evidence.length,1);
  const clean=await S.removeComplaintEvidence(c.id,withEvidence.evidence[0].id);
  assert.equal(clean.evidence.length,0);assert.equal(clean.title,'A');
});
test('observing thread updates only matching watched cases and returns changed list',async()=>{
  const a=await S.createComplaint({profileId,title:'A',url:urlA});
  const b=await S.createComplaint({profileId,title:'B',url:urlB});
  assert.deepEqual(await S.observeThread(urlA,50),[]);
  const updates=await S.observeThread('https://forum.majestic-rp.ru/threads/changed.376/',51);
  assert.equal(updates.length,1);assert.equal(updates[0].id,a.id);assert.equal((await S.getCase(b.id)).lastSeenPostId,null);
});
test('delete only selected case',async()=>{
  const a=await S.createComplaint({profileId,title:'A',url:urlA});await S.createComplaint({profileId,title:'B',url:urlB});
  await S.removeComplaint(a.id);assert.equal((await S.listCases()).length,1);
});
test('backup v3 round-trips all cases, drafts, evidence and templates',async()=>{
  let c=seed();c=C.addEvidence(c,{title:'Video',url:'https://youtube.com/watch?v=1',seconds:75});c=C.updateCase(c,{draft:'Набросок',deadline:'2026-12-15T20:00:00Z'});
  const backup=S.makeCompleteBackup(state,[],[c],F.cleanTemplate), parsed=S.parseCompleteBackup(backup,validateState,F.cleanTemplate);
  assert.equal(parsed.schemaVersion,3);assert.deepEqual(parsed.cases,[c]);assert.deepEqual(parsed.templates,[]);
});
test('backup accepts v1/v2 without replacing new complaints',()=>{
  const old=JSON.stringify({format:'rp-nexus-backup',schemaVersion:1,exportedAt:new Date().toISOString(),payload:state});
  const parsed=S.parseCompleteBackup(old,validateState,F.cleanTemplate);
  assert.equal(parsed.schemaVersion,1);assert.deepEqual(parsed.cases,[]);
});
test('backup rejects duplicate IDs, duplicate thread/profile, orphan profiles, and malformed evidence',()=>{
  const c=seed();
  const make = records => JSON.stringify({format:'rp-nexus-backup',schemaVersion:3,exportedAt:new Date().toISOString(),payload:state,forumTemplates:[],complaints:records});
  for(const cases of [[c,c],[c,{...c,id:'different_id_abcdefgh'}],[{...c,profileId:'no-profile'}],[{...c,evidence:[{title:'x',url:'javascript:bad',id:'ev-1',seconds:1,createdAt:new Date().toISOString()}]}]]) assert.throws(()=>S.parseCompleteBackup(make(cases),validateState,F.cleanTemplate));
});
test('replaceCases leaves existing storage untouched when input invalid',async()=>{
  const one=await S.createComplaint({profileId,title:'One',url:urlA});
  await assert.rejects(S.replaceCases([one,{...one,title:'Repeated'}]));
  assert.equal((await S.listCases()).length,1);
});
test('replaceCases stores a replacement snapshot and clears old keys',async()=>{
  await S.createComplaint({profileId,title:'One',url:urlA});
  const other=seed({url:urlB,title:'Replacement'});
  await S.replaceCases([other]);
  assert.deepEqual((await S.listCases()).map(x=>x.title),['Replacement']);
});
