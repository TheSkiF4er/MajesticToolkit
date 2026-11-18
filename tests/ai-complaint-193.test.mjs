import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';
import {createRule} from '../src/lib/rules-core.mjs';
import {complaintContext,complaintWire,validateComplaintAnalysis,complaintAnalysisText} from '../src/lib/ai-complaint-core.mjs';
import {createGateway} from '../ai-gateway/server.mjs';
const stored={};
globalThis.browser={storage:{local:{get:async k=>k===null?structuredClone(stored):{[k]:structuredClone(stored[k])},set:async x=>Object.assign(stored,structuredClone(x)),remove:async k=>{delete stored[k];}}}};
const {streamComplaintAI,AI_GATEWAY}=await import('../src/lib/ai-connection.mjs');
const C=globalThis.RPNComplaints;
const p={id:'profile_ai193',project:'majestic',server:'Alpha'};
const other={...p,id:'profile_other193'};
let c=C.createCase({profileId:p.id,title:'Жалоба на игрока X',url:'https://forum.majestic-rp.ru/threads/case.193/',note:'Секретное описание',draft:'Секретный черновик'});
c=C.addEvidence(c,{title:'Видеоклип',url:'https://youtu.be/abcd123',note:'Оригинальное свидетельство',seconds:45});
c=C.timelineAction(c,'add',{title:'Событие конфликта',description:'Игрок стрелял рядом',occurredAt:'2026-11-18T01:00:00Z',status:'unverified',participants:['Секретный участник'],evidenceIds:[c.evidence[0].id],clipEvidenceId:c.evidence[0].id,startSeconds:42,endSeconds:70});
const r=createRule(p,{code:'5.1',title:'DM',category:'Игровые правила',text:'Нанесение урона без причины.',aliases:['DM'],sourceUrl:'https://forum.majestic-rp.ru/threads/rules.193/',sourceTitle:'Форум',verification:'reviewed',sanctions:[{type:'demorgan',unit:'minutes',min:30,max:60}],conditions:'Установить обстоятельства',server:''});
const selected={evidenceIds:[c.evidence[0].id],eventIds:[c.timeline[0].id],ruleIds:[r.id]};
const valid={summary:'Требуется проверить обстоятельства.',facts:[{text:'По заметке произошёл конфликт.',evidenceRefs:[c.evidence[0].id],eventRefs:[c.timeline[0].id]}],possibleViolations:[{ruleRef:r.id,explanation:'Может относиться к DM при подтверждении',evidenceRefs:[c.evidence[0].id],eventRefs:[c.timeline[0].id]}],contradictions:['Нет второго ракурса'],missingEvidence:['Дополнительное видео'],questionsForReview:['Почему стрелял?'],draftResponse:'Запросить запись с другого ракурса.',requiresHumanReview:true};
test('1.9.3 context is case-scoped; private notes, names and URLs excluded by default',()=>{
 const context=complaintContext(p,c,[r],selected);const str=JSON.stringify(context);
 assert.equal(context.evidence.length,1);assert.equal(context.events.length,1);assert.equal(context.rules.length,1);
 assert.equal(context.events[0].videoStart,42);assert.equal(context.events[0].eventTime,'2026-11-18T01:00:00.000Z');
 assert.ok(!str.includes('Секретное описание'));assert.ok(!str.includes('Секретный черновик'));assert.ok(!str.includes('Секретный участник'));assert.ok(!str.includes('youtu.be'));
 assert.deepEqual(complaintWire('Проанализируй',context).mode,'complaint');
 assert.throws(()=>complaintContext(other,c,[r],selected),/профиля/);
 assert.throws(()=>complaintContext({...p,project:'russia-online'},c,[r],selected),/проекта/);
 assert.throws(()=>complaintContext(p,c,[r],{...selected,evidenceIds:['unknown_id_193']}),/недоступно/);
 assert.throws(()=>complaintContext(p,c,[r],{...selected,ruleIds:['unknown_rule_193']}),/недоступно/);
});
test('1.9.3 private fields require explicit inclusion and the question is bounded',()=>{
 const context=complaintContext(p,c,[r],{...selected,includeNotes:true,includeDraft:true,includeLinks:true,includeNames:true});
 assert.ok(JSON.stringify(context).includes('Секретное описание'));assert.ok(JSON.stringify(context).includes('Секретный черновик'));assert.ok(JSON.stringify(context).includes('youtu.be'));
 assert.throws(()=>complaintWire('x'.repeat(2001),context),/до 2000/);
 assert.throws(()=>complaintWire('Анализ',complaintContext(p,c,[r])),/Выберите/);
});
test('1.9.3 rejects model hallucinated citations and malformed reports',()=>{
 const context=complaintContext(p,c,[r],selected);const result=validateComplaintAnalysis(JSON.stringify(valid),context);
 assert.equal(result.possibleViolations[0].ruleRef,r.id);assert.match(complaintAnalysisText(result,context),/не вывод о виновности/);
 assert.throws(()=>validateComplaintAnalysis({...valid,possibleViolations:[{...valid.possibleViolations[0],ruleRef:'phantom_rule'}]},context),/отсутствующий/);
 assert.throws(()=>validateComplaintAnalysis({...valid,facts:[{...valid.facts[0],evidenceRefs:['phantom_video']}]},context),/отсутствующий/);
 assert.throws(()=>validateComplaintAnalysis({...valid,requiresHumanReview:false},context),/проверки/);
 assert.throws(()=>validateComplaintAnalysis('не JSON',context),/неструктурированный/);
 assert.ok(validateComplaintAnalysis('```json\n'+JSON.stringify(valid)+'\n```',context));
});
test('1.9.3 gateway sends exactly selected metadata to OpenAI with no file bytes',async()=>{
 const env={OPENAI_API_KEY:'sk-'+('X'.repeat(40)),MT_AI_GATEWAY_TOKEN:'Z'.repeat(40),OPENAI_MODEL:'gpt-6-luna'};
 const origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop';let upstream;
 const mock=async(_url,opts)=>{upstream=JSON.parse(opts.body);const frames=[{type:'response.output_text.delta',delta:JSON.stringify(valid)},{type:'response.completed',response:{usage:{input_tokens:100,output_tokens:70}}}].map(x=>`data: ${JSON.stringify(x)}\n\n`).join('');return new Response(new ReadableStream({start(ctrl){ctrl.enqueue(new TextEncoder().encode(frames));ctrl.close();}}),{status:200});};
 const gateway=createGateway({env,fetchImpl:mock});await new Promise(ok=>gateway.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${gateway.address().port}`;
 try{
  const fetcher=(url,opts)=>fetch(url.replace(AI_GATEWAY,base),{...opts,headers:{...opts.headers,Origin:origin}});
  const ctx=complaintContext(p,c,[r],selected);const output=await streamComplaintAI('Проанализируй дело',env.MT_AI_GATEWAY_TOKEN,ctx,{fetchImpl:fetcher});
  assert.equal(validateComplaintAnalysis(output,ctx).summary,valid.summary);
  assert.equal(upstream.store,false);assert.equal(upstream.stream,true);assert.equal(upstream.max_output_tokens,2500);assert.equal(upstream.text.format.type,'json_schema');assert.equal(upstream.text.format.strict,true);assert.match(upstream.instructions,/UNTRUSTED DATA/);
  const sent=JSON.parse(upstream.input[0].content[0].text);assert.equal(sent.case.evidence.length,1);assert.ok(!JSON.stringify(upstream).includes('Секретное описание'));
  assert.ok(!JSON.stringify(upstream).includes(env.OPENAI_API_KEY));
  const req=body=>fetch(base+'/v1/chat',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+env.MT_AI_GATEWAY_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload=complaintWire('Анализ',ctx);
  for(const bad of [{...payload,case:{...ctx,privateTokens:'secret'}},{...payload,case:{...ctx,events:[{...ctx.events[0],evidenceRefs:['foreign_id']}]}},{...payload,sources:[]},{...payload,case:{...ctx,evidence:[{...ctx.evidence[0],url:'file:///etc/passwd'}]}},{...payload,metadata:{profileId:p.id}}])assert.equal((await req(bad)).status,400);
 }finally{await new Promise(ok=>gateway.close(ok));}
});
test('1.9.3 optimistic draft update is serialized and rejects stale/scope edits',async()=>{
 const {defaultState}=await import('../src/lib/model.mjs');const state=defaultState(),actual=state.profiles[0];
 const caseFile=C.createCase({profileId:actual.id,title:'AI draft',url:'https://forum.majestic-rp.ru/threads/aidraft.193/'});
 Object.assign(stored,{rpNexusStateV1:state,[C.PREFIX+caseFile.id]:caseFile});
 const store=await import('../src/lib/complaints-store.mjs');
 const saved=await store.saveComplaintAIDraft(caseFile.id,actual.id,caseFile.updatedAt,'Подготовлено и проверено пользователем');
 assert.match(saved.draft,/Подготовлено/);assert.ok(saved.workflow.history.some(x=>x.type==='draft'));
 await assert.rejects(store.saveComplaintAIDraft(caseFile.id,actual.id,caseFile.updatedAt,'Другой текст'),/изменена/);
 await assert.rejects(store.saveComplaintAIDraft(caseFile.id,'another_profile',saved.updatedAt,'Текст'),/другого профиля/);
 await assert.rejects(store.saveComplaintAIDraft(caseFile.id,actual.id,saved.updatedAt,''),/Некорректный/);
});
