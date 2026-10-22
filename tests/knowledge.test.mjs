import test from 'node:test';
import assert from 'node:assert/strict';
import {KNOWLEDGE_PORTALS,emptyKnowledge,validateKnowledge,addKnowledgeResource,addKnowledgeRelation,sourceNodes,nodeKey,relatedLinks,visibleKnowledge,googleResourceId,googleResourceUrl} from '../src/lib/knowledge-core.mjs';
import {makeBackupV12,parseBackupV12} from '../src/lib/knowledge-backup.mjs';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {makeBackupV11} from '../src/lib/monitor-backup.mjs';
const A='profile_a_001',B='profile_b_002';
const D='document_00001',L='law_book_00001';
const t='2026-10-22T10:00:00Z';
const node=(kind,id)=>({kind,id});
test('portal links distinguish Majestic RP and Russia Online without fetching',()=>{
 assert.deepEqual(KNOWLEDGE_PORTALS.majestic.map(x=>x.url),['https://www.fletcher-wiki.com/majestic','https://docossum.com/']);
 assert.deepEqual(KNOWLEDGE_PORTALS['russia-online'].map(x=>x.url),['https://www.fletcher-wiki.com/russiaonline','https://docossum.com/']);
});
test('only strict Google HTTPS links of the expected type may be registered',()=>{
 const id='Google_file_id_01234';
 assert.equal(googleResourceId('google-doc',`https://docs.google.com/document/d/${id}/edit?usp=sharing`),id);
 assert.equal(googleResourceId('google-sheet',`https://docs.google.com/spreadsheets/d/${id}/edit`),id);
 assert.equal(googleResourceUrl('google-doc',id),`https://docs.google.com/document/d/${id}/edit`);
 for(const url of [`https://evil.google.com/document/d/${id}/edit`,`javascript:alert(1)`,`https://docs.google.com/spreadsheets/d/${id}/edit`,`https://docs.google.com@evil.example/document/d/${id}/edit`])assert.throws(()=>googleResourceId('google-doc',url));
});
test('Google templates are profile isolated and cannot be duplicated',()=>{
 const base=emptyKnowledge();const options={kind:'google-doc',googleUrl:'Google_file_id_01234',title:'Process template',notes:'Demo'};
 const result=addKnowledgeResource(base,A,options);
 assert.equal(result.resources[0].profileId,A);
 assert.throws(()=>addKnowledgeResource(result,A,options),/уже сохранён/);
 assert.equal(addKnowledgeResource(result,B,options).resources.length,2);
 assert.throws(()=>validateKnowledge(result,[B]),/отсутствующему профилю/);
});
test('bidirectional local references, reverse links, searching and inverse duplicate prevention',()=>{
 const nodes=sourceNodes(A,{documents:[{id:D,profileId:A,type:'document',versions:[{title:'Моё постановление'}]},{id:'document_00002',profileId:B,type:'document',versions:[{title:'Чужой документ'}]}],laws:[{id:L,profileId:A,type:'book',title:'УК Сан Андреас'}]});
 assert.equal(nodes.length,2);
 const next=addKnowledgeRelation(emptyKnowledge(),A,{from:node('document',D),to:node('law',L),label:'Основание',notes:'Статья 1'});
 assert.equal(relatedLinks(next.relations,node('law',L),A).length,1);
 assert.equal(relatedLinks(next.relations,node('document',D),A).length,1);
 assert.equal(visibleKnowledge(next,A,nodes,'УК')[0].title,'УК Сан Андреас');
 assert.equal(visibleKnowledge(next,A,nodes,'', 'law').length,1);
 assert.throws(()=>addKnowledgeRelation(next,A,{from:node('law',L),to:node('document',D),label:'Наоборот'}),/уже существует/);
 assert.throws(()=>addKnowledgeRelation(next,A,{from:node('law',L),to:node('law',L),label:'Сам к себе'}),/с собой/);
});
test('forged cross-profile Google resource links and duplicate IDs are refused',()=>{
 const root=addKnowledgeResource(emptyKnowledge(),A,{kind:'google-doc',title:'Template',googleUrl:'Google_file_id_01234'});
 const bad={...root,relations:[{id:'relation_001',profileId:B,from:node('google-doc',root.resources[0].id),to:node('document',D),label:'Fake',notes:'',createdAt:t}]};
 assert.throws(()=>validateKnowledge(bad,[A,B]),/другого профиля/);
 assert.throws(()=>validateKnowledge({...root,resources:[...root.resources,...root.resources]},[A]),/Дублирующийся/);
});
test('older backup formats retain knowledge if absent, v12 validates strict profile isolation',()=>{
 const state=defaultState();const prof=state.profiles[0].id;
 const backup=makeBackupV12(state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),x=>x);
 assert.equal(JSON.parse(backup).schemaVersion,12);
 const restored=parseBackupV12(backup,validateState,x=>x);
 assert.equal(restored.schemaVersion,12);
 assert.deepEqual(restored.knowledgeWorkspace,emptyKnowledge());
 const older=makeBackupV11(state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),x=>x);
 assert.equal(parseBackupV12(older,validateState,x=>x).knowledgeWorkspace,null);
 // malformed backups must fail validation rather than silently omit knowledge.
 assert.throws(()=>parseBackupV12(backup.replace('"knowledgeWorkspace": {','"knowledgeWorkspace": null'),validateState,x=>x));
});
