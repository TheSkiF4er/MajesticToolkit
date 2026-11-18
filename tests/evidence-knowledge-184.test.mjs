import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyKnowledge,validateKnowledge} from '../src/lib/knowledge-core.mjs';
import {emptyGraph,addEvidenceQuote,addEvidenceLink,removeEvidenceGraphItem,quoteAvailability,evidenceGraphNodes,graphLinksForCase} from '../src/lib/evidence-knowledge-graph.mjs';
import {sourceDigest,validateSource} from '../src/lib/source-library.mjs';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {makeModerationBackup,parseModerationBackup} from '../src/lib/moderation-backup.mjs';
import '../src/lib/forum-core.js';import '../src/lib/complaints-core.js';
const seed=validateState(defaultState());const p=seed.profiles[0];
const other='profile-184-other';
const src=validateSource({id:'source_184_graph',profileId:p.id,kind:'forum',title:'Проверенные правила',url:'https://forum.majestic-rp.ru/threads/rules.184/',body:'Первый пункт запрещает опасное действие. Второй пункт требует дополнительной проверки.',capturedAt:'2026-11-18T03:40:00Z',sha256:await sourceDigest('Первый пункт запрещает опасное действие. Второй пункт требует дополнительной проверки.')});
const date='2026-11-18T03:41:00Z';
const c={id:'case-184-main',profileId:p.id,title:'Проверка фактов',url:'https://forum.majestic-rp.ru/threads/report.184/',evidence:[{id:'evidence-184-test',title:'Видео',url:'https://youtu.be/example'}],timeline:[{id:'event-184-test',title:'Событие в видео'}]};
async function citation(){return addEvidenceQuote(emptyGraph(),p.id,src,src.id,'Первый пункт запрещает опасное действие.','Важно');}
test('literal quote is anchored to exact saved revision and sha256',async()=>{
 const g=await citation(),q=g.quotes[0];assert.equal(q.start,0);assert.equal(q.end,q.quote.length);assert.equal(q.sha256,await sourceDigest(src.body));assert.equal(q.revisionId,src.id);assert.equal(quoteAvailability(q,[src]),'available');
 await assert.rejects(()=>addEvidenceQuote(g,p.id,src,src.id,'Отсутствующий в тексте фрагмент'),/отсутствует/);
 await assert.rejects(()=>addEvidenceQuote(g,other,src,src.id,'Первый пункт'),/другого профиля/);
 const altered={...src,sha256:'a'.repeat(64)};await assert.rejects(()=>addEvidenceQuote(g,p.id,altered,altered.id,'Первый пункт'),/SHA-256/);
});
test('citation survives source revisions and historical edition pruning without rewriting snapshot',async()=>{
 const g=await citation(),q=g.quotes[0],changed={...src,body:'Новый текст заменил действующее правило. Другая редакция.',sha256:await sourceDigest('Новый текст заменил действующее правило. Другая редакция.'),revisions:[{id:'historic-184-one',title:src.title,body:src.body,capturedAt:src.capturedAt,sha256:await sourceDigest(src.body)}]};
 assert.equal(quoteAvailability(q,[changed]),'available');assert.equal(quoteAvailability(q,[{...changed,revisions:[]}]),'snapshot');assert.equal(quoteAvailability(q,[]),'missing');assert.equal(q.quote,'Первый пункт запрещает опасное действие.');
 const fromHistorical=await addEvidenceQuote(g,p.id,changed,'historic-184-one','Первый пункт');assert.equal(fromHistorical.quotes[1].revisionId,'historic-184-one');
});
test('live evidence/event/rule/decision nodes and links are scoped; reverse links traverse case graph',async()=>{
 let g=await citation();const nodes=evidenceGraphNodes(p,{cases:[c,{...c,id:'another-case-184',profileId:other}],rules:[],registry:[],graph:g});
 assert.ok(nodes.some(n=>n.kind==='evidence'&&n.id==='evidence-184-test'));assert.ok(nodes.some(n=>n.kind==='event'&&n.id==='event-184-test'));assert.ok(!nodes.some(n=>n.profileId===other));
 const q={kind:'quote',id:g.quotes[0].id},ev={kind:'event',id:'event-184-test'},e={kind:'evidence',id:'evidence-184-test'},cs={kind:'case',id:c.id};
 g=addEvidenceLink(g,p.id,ev,q,'cites','Пункт к событию',nodes);
 g=addEvidenceLink(g,p.id,e,ev,'supports','Материал подтверждает',nodes);
 g=addEvidenceLink(g,p.id,cs,e,'related','Связано с жалобой',nodes);
 assert.equal(graphLinksForCase(g,p.id,c.id,nodes).length,3);
 assert.throws(()=>addEvidenceLink(g,p.id,ev,q,'cites','dup',nodes),/уже существует/);
 assert.throws(()=>addEvidenceLink(g,other,ev,q,'cites','',nodes),/другому профилю/);
 assert.throws(()=>addEvidenceLink(g,p.id,ev,{kind:'case',id:'unknown-184-case'},'related','',nodes),/отсутствует/);
 assert.throws(()=>removeEvidenceGraphItem(g,p.id,'quote',q.id),/Сначала удалите связи/);
 g=removeEvidenceGraphItem(g,p.id,'link',g.links[0].id);assert.equal(g.links.length,2);
 assert.throws(()=>removeEvidenceGraphItem(g,other,'link',g.links[0].id),/не найдена/);
});
test('graph validation blocks cross-profile quote links, duplicate claims and forged hashes',async()=>{
 let g=await citation(),q=g.quotes[0];assert.deepEqual(validateKnowledge({...emptyKnowledge(),evidenceGraph:g},[p.id]).evidenceGraph,g);
 assert.throws(()=>validateKnowledge({...emptyKnowledge(),evidenceGraph:{...g,quotes:[{...q,profileId:other}]}},[p.id]),/профиль/);
 assert.throws(()=>validateKnowledge({...emptyKnowledge(),evidenceGraph:{...g,quotes:[{...q,sha256:'abc'}]}},[p.id]),/цитата/);
 assert.throws(()=>validateKnowledge({...emptyKnowledge(),evidenceGraph:{...g,quotes:[{...q,quote:q.quote+'!' }]}},[p.id]),/Длина цитаты/);
 const invalidLink={id:'link-184-invalid',profileId:p.id,from:{kind:'quote',id:q.id},to:{kind:'case',id:c.id},relation:'cites',note:'',createdAt:date};
 assert.throws(()=>validateKnowledge({...emptyKnowledge(),evidenceGraph:{...g,links:[{...invalidLink,from:{kind:'quote',id:'missing-184-quote'}}]}},[p.id]),/другого профиля/);
 assert.throws(()=>validateKnowledge({...emptyKnowledge(),evidenceGraph:{...g,links:[invalidLink,invalidLink]}},[p.id]),/Неверная связь/);
});
test('Backup v16 persists exact citation snapshots and typed edges; legacy backup without graph remains readable',async()=>{
 let graph=await citation();const nodes=evidenceGraphNodes(p,{cases:[c],graph});graph=addEvidenceLink(graph,p.id,{kind:'quote',id:graph.quotes[0].id},{kind:'case',id:c.id},'cites','Основание',nodes);
 const knowledge={...emptyKnowledge(),evidenceGraph:graph},s=seed;
 const args=k=>[s,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),k,globalThis.RPNForumCore.cleanTemplate,[{...src,profileId:p.id}],[]];
 const raw=makeModerationBackup(args(knowledge),{version:1,calculators:[],drafts:[]},{version:1,subscriptions:[],inbox:[]},{version:1,records:[]},{version:1,profiles:[]});
 const restored=parseModerationBackup(raw,validateState,globalThis.RPNForumCore.cleanTemplate);assert.equal(restored.schemaVersion,16);assert.deepEqual(restored.knowledgeWorkspace.evidenceGraph,graph);
 const legacy=JSON.parse(raw);delete legacy.knowledgeWorkspace.evidenceGraph;const old=parseModerationBackup(JSON.stringify(legacy),validateState,globalThis.RPNForumCore.cleanTemplate);assert.deepEqual(old.knowledgeWorkspace.evidenceGraph,emptyGraph());
 const tampered=JSON.parse(raw);tampered.knowledgeWorkspace.evidenceGraph.quotes[0].end=15000;assert.throws(()=>parseModerationBackup(JSON.stringify(tampered),validateState,globalThis.RPNForumCore.cleanTemplate),/Длина цитаты/);
});

test('rule links pin active rule revision independently of later edits',async()=>{
 const graph=await citation();const nodes=evidenceGraphNodes(p,{cases:[c],rules:[{id:'rule-184-link',profileId:p.id,project:p.project,server:p.server,activeRevisionId:'revision-184-original',revisions:[{id:'revision-184-original',title:'Запрет',code:'5.1',sourceUrl:'https://forum.majestic-rp.ru/threads/rules.184/'}]}],graph});
 const linked=addEvidenceLink(graph,p.id,{kind:'quote',id:graph.quotes[0].id},{kind:'rule',id:'rule-184-link'},'applies','До изменения',nodes);
 assert.equal(linked.links[0].to.revisionId,'revision-184-original');
 assert.equal(validateKnowledge({...emptyKnowledge(),evidenceGraph:linked},[p.id]).evidenceGraph.links[0].to.revisionId,'revision-184-original');
 assert.throws(()=>validateKnowledge({...emptyKnowledge(),evidenceGraph:{...linked,links:[{...linked.links[0],to:{...linked.links[0].to,revisionId:'bad'}}]}},[p.id]),/редакция/);
});
