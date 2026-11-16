import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModerationBatch,batchTransition,cleanModerationBatch} from '../src/lib/moderation-batch.mjs';
import {defaultState,validateState,makeBackup,parseBackup,editProfile} from '../src/lib/model.mjs';
const state=defaultState(),p=state.profiles[0],date='2026-11-16T00:00:00.000Z';
const a={id:'case_000001',profileId:p.id,url:'https://forum.majestic-rp.ru/threads/a.12/',triage:{queue:'active'}},b={...a,id:'case_000002',url:'https://forum.majestic-rp.ru/threads/b.13/'};
test('batch preserves explicit order and rejects foreign, archived, missing and repeated cases',()=>{
 const q=buildModerationBatch([b.id,a.id],[a,b],p,date);assert.deepEqual(q.map(x=>x.caseId),[b.id,a.id]);assert.throws(()=>buildModerationBatch([a.id,a.id],[a],p));assert.throws(()=>buildModerationBatch([b.id],[a],p));assert.throws(()=>buildModerationBatch([a.id],[{...a,profileId:'other'}],p));assert.throws(()=>buildModerationBatch([a.id],[{...a,triage:{queue:'archived'}}],p));assert.throws(()=>buildModerationBatch([a.id],[{...a,url:'https://forum.russia.online/threads/a.12/'}],p));
});
test('queue transitions require matching state and cannot claim completion before insertion',()=>{
 let q=buildModerationBatch([a.id,b.id],[a,b],p,date);assert.throws(()=>batchTransition(q,a.id,'done','pending'));q=batchTransition(q,a.id,'opened','pending');assert.throws(()=>batchTransition(q,a.id,'inserted','pending'));q=batchTransition(q,a.id,'inserted','opened');q=batchTransition(q,a.id,'done','inserted');assert.equal(q[1].status,'pending');assert.throws(()=>batchTransition(q,a.id,'inserted','done'));q=batchTransition(q,a.id,'pending','done');assert.equal(q[0].status,'pending');
});
test('profile queue survives validated backup, rejects malformed records and clears on scope change',()=>{
 const q=buildModerationBatch([a.id],[a],p,date);const s=validateState({...state,profiles:[{...p,moderationBatch:q}]});assert.deepEqual(parseBackup(makeBackup(s)).profiles[0].moderationBatch,q);assert.throws(()=>cleanModerationBatch([...q,...q]));assert.throws(()=>cleanModerationBatch([{...q[0],status:'published'}]));assert.deepEqual(editProfile(s,p.id,{...p,server:'New'}).profiles[0].moderationBatch,[]);
});
