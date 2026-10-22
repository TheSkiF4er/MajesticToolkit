import test from 'node:test';
import assert from 'node:assert/strict';
const memory=new Map();let rejectWrite=false;
globalThis.browser={storage:{local:{
 async get(key){return key===null?Object.fromEntries(memory):Object.fromEntries([key].filter(k=>memory.has(k)).map(k=>[k,memory.get(k)]));},
 async set(entries){if(rejectWrite){rejectWrite=false;throw Error('Disk full');}for(const [k,v]of Object.entries(entries))memory.set(k,v);},
 async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])memory.delete(k);}
 }},runtime:{getURL:s=>s},permissions:{async contains(){return true;}}};
const store=await import('../src/lib/knowledge-store.mjs');
const {KNOWLEDGE_KEY}=await import('../src/lib/knowledge-core.mjs');
const P='profile_one_01',P2='profile_two_02',profiles=[P,P2];
test('knowledge resources and relations are actually persisted by local storage',async()=>{
 const empty=await store.loadKnowledge(profiles);assert.equal(empty.version,1);
 const doc=await store.saveKnowledgeResource(P,{kind:'google-doc',title:'Постановление',googleUrl:'Google_file_id_01234'},profiles);
 assert.equal(doc.resources.length,1);
 const a=doc.resources[0];
 const withRelation=await store.saveKnowledgeRelation(P,{from:{kind:'google-doc',id:a.id},to:{kind:'law',id:'my_law_0001'},label:'Нормативное основание'},profiles);
 assert.equal(withRelation.relations[0].label,'Нормативное основание');
 assert.deepEqual((await store.loadKnowledge(profiles)).relations,withRelation.relations);
 assert.ok(memory.has(KNOWLEDGE_KEY));
});
test('write error preserves last stored snapshot without partial state',async()=>{
 const before=await store.loadKnowledge(profiles);rejectWrite=true;
 await assert.rejects(()=>store.saveKnowledgeResource(P2,{kind:'google-sheet',title:'Экономика',googleUrl:'Google_sheet_id_01234'},profiles),/Disk full/);
 assert.deepEqual(await store.loadKnowledge(profiles),before);
});
test('deleting a Google resource also removes its local inbound and outbound links',async()=>{
 const before=await store.loadKnowledge(profiles);
 const next=await store.deleteKnowledgeResource(before.resources[0].id,profiles);
 assert.equal(next.resources.length,0);assert.equal(next.relations.length,0);
});
test('profile removal can clean resources and relations without losing other profiles',async()=>{
 let snapshot=await store.saveKnowledgeResource(P2,{kind:'google-sheet',title:'Отчёт',googleUrl:'Google_sheet_id_01234'},profiles);
 snapshot=await store.saveKnowledgeResource(P,{kind:'google-doc',title:'Письмо',googleUrl:'Google_document_id_001'},profiles);
 const reduced=await store.replaceKnowledge({version:1,resources:snapshot.resources.filter(r=>r.profileId!==P),relations:[]},[P2]);
 assert.equal(reduced.resources.length,1);
 assert.equal(reduced.resources[0].profileId,P2);
});
