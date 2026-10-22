import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
const mem=new Map();let fail=false;
const clone=v=>structuredClone(v);
globalThis.browser={storage:{local:{
 async get(keys){const selected=keys===null?[...mem.keys()]:Array.isArray(keys)?keys:[keys];return Object.fromEntries(selected.filter(k=>mem.has(k)).map(k=>[k,clone(mem.get(k))]));},
 async set(data){if(fail){fail=false;throw Error('quota exceeded');}for(const [k,v]of Object.entries(data))mem.set(k,clone(v));},
 async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])mem.delete(k);}
}}};
const store=await import('../src/lib/complaints-store.mjs');
const u='https://forum.majestic-rp.ru/threads/for-workflow.8888/';
beforeEach(()=>{mem.clear();fail=false;});
test('persisted transitions and evidence coexist without lost updates',async()=>{
 const c=await store.createComplaint({profileId:'profile_a_01',title:'Жалоба на действия',url:u});
 const [step,evidence]=await Promise.all([
  store.mutateCaseWorkflow(c.id,'check',{stage:'intake',done:true}),
  store.addComplaintEvidence(c.id,{title:'Видео',url:'https://youtube.com/watch?v=abc',seconds:40})
 ]);
 const result=await store.getCase(c.id);
 assert.equal(result.evidence.length,1);assert.equal(result.workflow.checks.intake,true);
 assert.equal(result.workflow.history.length,2);
 await store.mutateCaseWorkflow(c.id,'next');
 assert.equal((await store.getCase(c.id)).workflow.stage,'facts');
});
test('failed storage set cannot falsely advance persisted workflow',async()=>{
 const c=await store.createComplaint({profileId:'profile_a_01',title:'Оспариваемый вопрос',url:u});
 fail=true;
 await assert.rejects(store.mutateCaseWorkflow(c.id,'check',{stage:'intake',done:true}),/quota exceeded/);
 assert.equal((await store.getCase(c.id)).workflow.checks.intake,false);
 await store.mutateCaseWorkflow(c.id,'check',{stage:'intake',done:true});
 assert.equal((await store.getCase(c.id)).workflow.checks.intake,true);
});
test('replacement from backup preserves journal and rejects corrupt states atomically',async()=>{
 const c=await store.createComplaint({profileId:'profile_a_01',title:'Жалоба',url:u});
 await store.mutateCaseWorkflow(c.id,'note',{text:'Ожидаем видео'});
 const before=await store.listCases();
 await assert.rejects(store.replaceCases([{...before[0],workflow:{...before[0].workflow,stage:'bad'}}]));
 assert.deepEqual(await store.listCases(),before);
 await store.replaceCases(before);
 assert.deepEqual(await store.listCases(),before);
});
