import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/forum-core.js';
import '../src/lib/complaints-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge,validateKnowledge,addKnowledgeCollection,setKnowledgeCollectionMember,removeKnowledgeCollection} from '../src/lib/knowledge-core.mjs';
import {searchKnowledgeLibrary,compareSourceTexts} from '../src/lib/knowledge-search.mjs';
const P='profile_183_main',OTHER='profile_183_other';
const local=new Map();
globalThis.browser={storage:{local:{async get(k){return k===null?Object.fromEntries(local):Object.fromEntries([k].filter(x=>local.has(x)).map(k=>[k,local.get(k)]));},async set(v){for(const [k,x]of Object.entries(v))local.set(k,structuredClone(x));},async remove(k){local.delete(k);}}},runtime:{getURL:x=>x}};
const {validateSource,validateSources,saveSource,listSources,updateSourceMetadata,restoreSourceRevision,sourceDigest,SOURCE_KEY}=await import('../src/lib/source-library.mjs');
const {makeModerationBackup,parseModerationBackup}=await import('../src/lib/moderation-backup.mjs');
const baseline={id:'source_183_test',profileId:P,kind:'forum',title:'Правила организации',url:'https://forum.majestic-rp.ru/threads/rules.183/',body:'Первая редакция. Запрещено использовать служебные автомобили без разрешения.',capturedAt:'2026-11-18T02:00:00Z'};
const emptySections={version:1,subscriptions:[],inbox:[]},emptyRegistry={version:1,records:[]},emptyOps={version:1,profiles:[]};
const emptyP={version:1,calculators:[],drafts:[]};
const args=(state,knowledge,sources)=>[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),knowledge,globalThis.RPNForumCore.cleanTemplate,sources,[]];
test('legacy source rows are preserved and accepted as unverified revision zero',()=>{
 const row=validateSource(baseline);assert.equal(row.revisions.length,0);assert.equal(row.status,'unverified');assert.equal(row.favorite,false);assert.equal(row.notes,'');
 assert.deepEqual(validateSources([row])[0],row);
 assert.throws(()=>validateSource({...baseline,sha256:'not a checksum'}),/SHA-256/);
 assert.throws(()=>validateSource({...baseline,revisions:[{id:'bad',body:'123'}]}),/редакция/);
});
test('import same page creates revisions only when title or text changes, and stores SHA-256',async()=>{
 const first=await saveSource({...baseline,id:undefined});assert.match(first.sha256,/^[a-f0-9]{64}$/);assert.equal(first.revisions.length,0);
 const same=await saveSource({...baseline});assert.equal(same.id,first.id);assert.equal(same.revisions.length,0);assert.equal(same.capturedAt,first.capturedAt);
 const next=await saveSource({...baseline,body:'Вторая редакция. Запрещено оставлять автомобиль за пределами парковки.',title:'Обновлённые правила организации'});
 assert.equal(next.id,first.id);assert.equal(next.revisions.length,1);assert.equal(next.revisions[0].body,first.body);assert.equal(next.revisions[0].sha256,await sourceDigest(first.body));assert.equal(next.status,'unverified');
 assert.equal((await listSources())[0].title,'Обновлённые правила организации');
});
test('metadata updates never overwrite history, new captures reset review, and restoration creates a new snapshot',async()=>{
 const [row]=await listSources();const changed=await updateSourceMetadata(row.id,P,{notes:'Проверить с ответственным',tags:['Устав','Процедуры'],status:'reviewed',favorite:true});
 assert.equal(changed.revisions.length,1);
 const repeated=await saveSource({...baseline,body:row.body,title:row.title});assert.equal(repeated.status,'reviewed');assert.deepEqual(repeated.tags,['Устав','Процедуры']);
 const restored=await restoreSourceRevision(row.id,P,row.revisions[0].id);assert.equal(restored.body,row.revisions[0].body);assert.equal(restored.status,'unverified');assert.equal(restored.revisions.length,2);assert.equal(restored.revisions.at(-1).body,row.body);
 assert.equal(restored.notes,'Проверить с ответственным');assert.equal(restored.favorite,true);
 await assert.rejects(()=>restoreSourceRevision(row.id,OTHER,row.revisions[0].id),/не найдена/);
});
test('tampered history cannot be silently restored and malformed collections are rejected',async()=>{
 const [row]=await listSources();const corrupted=structuredClone(row);corrupted.revisions[0].body+=' tampered';
 local.set(SOURCE_KEY,[corrupted]);
 await assert.rejects(()=>restoreSourceRevision(row.id,P,corrupted.revisions[0].id),/Контрольная сумма/);
 local.set(SOURCE_KEY,[row]);
 assert.throws(()=>validateKnowledge({...emptyKnowledge(),collections:[{id:'collection_fake',profileId:OTHER,title:'Чужая',createdAt:'2026-11-18T01:00:00Z',notes:'',members:[]}]},[P]),/чужая/);
});
test('collections have true persistable membership, ownership checks, and duplicate prevention',()=>{
 let knowledge=addKnowledgeCollection(emptyKnowledge(),P,{title:'Нормативные источники',notes:'Для модератора'});
 const id=knowledge.collections[0].id;
 knowledge=setKnowledgeCollectionMember(knowledge,P,id,{kind:'external',id:'source_183_test'},true);
 assert.deepEqual(knowledge.collections[0].members,['external:source_183_test']);
 knowledge=setKnowledgeCollectionMember(knowledge,P,id,{kind:'external',id:'source_183_test'},true);assert.equal(knowledge.collections[0].members.length,1);
 assert.throws(()=>setKnowledgeCollectionMember(knowledge,OTHER,id,{kind:'external',id:'source_183_test'},true),/не найдена/);
 assert.throws(()=>addKnowledgeCollection(knowledge,P,{title:'Нормативные источники'}),/существует/);
 assert.throws(()=>validateKnowledge({...knowledge,collections:[...knowledge.collections,knowledge.collections[0]]}),/Повторная/);
 knowledge=setKnowledgeCollectionMember(knowledge,P,id,{kind:'external',id:'source_183_test'},false);assert.equal(knowledge.collections[0].members.length,0);
 assert.equal(removeKnowledgeCollection(knowledge,P,id).collections.length,0);
});
test('local search indexes content, tags, statuses, favorites and membership without profile leakage',async()=>{
 const [row]=await listSources();const k=addKnowledgeCollection(emptyKnowledge(),P,{title:'Коллекция'}),col=k.collections[0].id;
 const scoped=setKnowledgeCollectionMember(k,P,col,{kind:'external',id:row.id},true);
 assert.equal(searchKnowledgeLibrary([row],scoped,P,{query:'автомобили',status:'all'}).length,1);
 assert.equal(searchKnowledgeLibrary([row],scoped,P,{query:'неподходящий запрос'}).length,0);
 assert.equal(searchKnowledgeLibrary([row],scoped,P,{collectionId:col}).length,1);
 assert.equal(searchKnowledgeLibrary([row],scoped,P,{tag:'Устав',favorites:true}).length,1);
 assert.equal(searchKnowledgeLibrary([row],scoped,OTHER,{}).length,0);
 assert.equal(searchKnowledgeLibrary([row],scoped,P,{status:'reviewed'}).length,0);
});
test('revision diff preserves original text and classifies removed and added words',()=>{
 const text='Старый пункт 5.1 запрещает действие.';const revised='Новый пункт 5.1 разрешает действие.';
 const diff=compareSourceTexts(text,revised);
 assert.equal(diff.filter(x=>x.type!=='added').map(x=>x.text).join(''),text);
 assert.equal(diff.filter(x=>x.type!=='removed').map(x=>x.text).join(''),revised);
 assert.ok(diff.some(x=>x.type==='removed'));assert.ok(diff.some(x=>x.type==='added'));
 const long='x '.repeat(3000);assert.equal(compareSourceTexts(long,long).map(x=>x.text).join(''),long);
});
test('Backup v16 preserves revisions, metadata and collections; legacy v16 with old rows remains compatible',async()=>{
 const state=defaultState();const profileId=state.profiles[0].id;
 const row=validateSource({...baseline,profileId});
 const withRevision=validateSource({...row,sha256:await sourceDigest(row.body),revisions:[{id:'revision_183_a',title:row.title,body:row.body,capturedAt:row.capturedAt,sha256:await sourceDigest(row.body)}],tags:['Политика'],status:'reviewed',notes:'Проверено локально'});
 const collections=addKnowledgeCollection(emptyKnowledge(),profileId,{title:'Официальные источники'});
 const linked=setKnowledgeCollectionMember(collections,profileId,collections.collections[0].id,{kind:'external',id:row.id},true);
 const serialized=makeModerationBackup(args(validateState(state),linked,[withRevision]),emptyP,emptySections,emptyRegistry,emptyOps);
 const parsed=parseModerationBackup(serialized,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.schemaVersion,16);assert.equal(parsed.sourceLibrary[0].revisions.length,1);assert.equal(parsed.sourceLibrary[0].status,'reviewed');
 assert.deepEqual(parsed.knowledgeWorkspace.collections[0].members,['external:source_183_test']);
 const old=makeModerationBackup(args(validateState(state),emptyKnowledge(),[row]),emptyP,emptySections,emptyRegistry,emptyOps);
 const legacy=JSON.parse(old);delete legacy.knowledgeWorkspace.collections;for(const r of legacy.sourceLibrary){delete r.revisions;delete r.status;delete r.tags;delete r.notes;delete r.sha256;delete r.checkedAt;delete r.favorite;}
 const again=parseModerationBackup(JSON.stringify(legacy),validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(again.knowledgeWorkspace.collections.length,0);assert.equal(again.sourceLibrary[0].revisions.length,0);
});
