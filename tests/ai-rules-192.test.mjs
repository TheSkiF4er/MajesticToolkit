import test from 'node:test';
import assert from 'node:assert/strict';
import {createRule,reviseRule} from '../src/lib/rules-core.mjs';
import {validateSource,sourceDigest} from '../src/lib/source-library.mjs';
import {findAIRulesSources,confirmAIRulesSelection,rulesWireSources,markUnsupportedCitations} from '../src/lib/ai-rules-core.mjs';
import {createGateway} from '../ai-gateway/server.mjs';
import {streamRulesAI,AI_GATEWAY} from '../src/lib/ai-connection.mjs';
const profile={id:'profile_192_real',name:'Test',project:'majestic',server:'Alpha'};
const another={...profile,id:'profile_192_other'};
const fields={code:'5.1',title:'Deathmatch (DM)',category:'Игровые правила',text:'Запрещено нападение без причины. Санкция определяется по условиям правила.',aliases:['DM'],sourceUrl:'https://forum.majestic-rp.ru/threads/rules.192/',sourceTitle:'Форум',verification:'reviewed',sanctions:[{type:'demorgan',unit:'minutes',min:30,max:60,condition:''}],conditions:'Только при установлении обстоятельств',server:''};
const rule=createRule(profile,fields),other=createRule(another,fields),serverOnly=createRule(profile,{...fields,server:'Beta'}),unreviewed=createRule(profile,{...fields,verification:'unverified'});
const source=validateSource({id:'source_192_demo',profileId:profile.id,url:'https://forum.majestic-rp.ru/threads/knowledge.192/',kind:'forum',title:'Справочник нарушений',body:'Руководство объясняет последствия нарушения DM и общие условия применения санкций для игровой ситуации.',capturedAt:'2026-11-18T06:00:00Z',status:'reviewed',revisions:[]});
const wiki=validateSource({...source,id:'source_192_wiki',url:'https://www.fletcher-wiki.com/majestic/guide',kind:'fletcher'});
const cross=validateSource({...source,id:'source_192_foreign',profileId:another.id});
test('local retrieval ranks exact rule code and alias and separates profiles, servers and unverified sources',()=>{
 const found=findAIRulesSources(profile,'DM наказание',[rule,other,serverOnly,unreviewed],[source,wiki,cross]);
 assert.ok(found.length>=2);assert.equal(found[0].id,rule.id);assert.ok(found.every(x=>x.id!==other.id&&x.id!==serverOnly.id&&x.id!==unreviewed.id&&x.id!==cross.id));
 assert.ok(found.find(x=>x.kind==='source'&&x.id===source.id));
 assert.equal(findAIRulesSources(another,'DM наказание',[rule,serverOnly],[source]).length,0);
 assert.ok(findAIRulesSources(profile,'DM',[unreviewed],[],{includeUnverified:true}).length===1);
 assert.equal(findAIRulesSources(profile,'несуществующая терминология',[rule],[source]).length,0);
});
test('current and historical revisions are distinguishable and context does not include private notes',async()=>{
 const revised=reviseRule(rule,{...fields,text:'Новая редакция — DM запрещён в другом объёме.'},rule.activeRevisionId);
 const history=findAIRulesSources(profile,'DM',[revised],[],{includeHistory:true});assert.equal(history.length,2);
 const old=history.find(x=>x.revisionId===rule.activeRevisionId);assert.equal(old.historical,true);
 const selected=await confirmAIRulesSelection(profile,[old],[revised],[]);
 assert.equal(selected[0].revisionId,rule.activeRevisionId);
 const wire=rulesWireSources(selected);assert.equal(wire[0].ref,1);assert.equal(wire[0].code,'5.1');assert.ok(!JSON.stringify(wire).includes('profile_192_real'));
 assert.ok(!JSON.stringify(wire).includes('Личная заметка'));
 await assert.rejects(()=>confirmAIRulesSelection(another,[old],[revised],[]),/недоступны/);
});
test('source revision hash is checked immediately before cloud transmission and stale source text is rejected',async()=>{
 const original={...source,sha256:await sourceDigest(source.body)};
 const candidate=findAIRulesSources(profile,'DM',[],[original])[0];
 assert.equal((await confirmAIRulesSelection(profile,[candidate],[],[original]))[0].revisionId,original.id);
 await assert.rejects(()=>confirmAIRulesSelection(profile,[candidate],[],[{...original,body:original.body+' edited'}]),/SHA-256/);
 await assert.rejects(()=>confirmAIRulesSelection(profile,[candidate],[],[{...original,title:'Заменённый заголовок'}]),/изменился/);
 const unverifiedCandidate=findAIRulesSources(profile,'DM',[],[{...original,status:'unverified'}],{includeUnverified:true})[0];
 await assert.rejects(()=>confirmAIRulesSelection(profile,[unverifiedCandidate],[],[{...original,status:'unverified'}]),/проверки/);
});
test('citations never invent source URLs; invalid [N] markers are marked, not converted to links',()=>{
 const a=markUnsupportedCitations('Правило [1], другое [9], третье [0].',2);
 assert.equal(a.invalid,true);assert.ok(a.text.includes('[1]'));assert.ok(!a.text.includes('[9]'));
 assert.throws(()=>rulesWireSources([]),/источники/);
 assert.throws(()=>rulesWireSources([{kind:'rule',text:'x',sourceUrl:'javascript:alert(1)',title:'bad'}]),/источник/);
 assert.throws(()=>rulesWireSources(Array(6).fill({})),/источники/);
});
test('gateway sends user-confirmed, size-limited citations to Responses API without keys or profile metadata',async()=>{
 const env={OPENAI_API_KEY:'sk-'+'z'.repeat(40),MT_AI_GATEWAY_TOKEN:'Q'.repeat(40),OPENAI_MODEL:'gpt-6-luna'};
 const origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop';let upstream;
 const mock=async (_url,options)=>{upstream=JSON.parse(options.body);const data=[{type:'response.output_text.delta',delta:'DM описан в [1].'},{type:'response.completed',response:{usage:{input_tokens:58,output_tokens:8}}}].map(x=>'data: '+JSON.stringify(x)+'\n\n').join('');return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(data));c.close();}}),{status:200});};
 const server=createGateway({env,fetchImpl:mock});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const chosen=await confirmAIRulesSelection(profile,findAIRulesSources(profile,'DM',[rule],[]),[rule],[]);const sources=rulesWireSources(chosen);
  const f=(url,opt)=>fetch(url.replace(AI_GATEWAY,base),{...opt,headers:{...opt.headers,Origin:origin}});
  let last;
  const answer=await streamRulesAI('Какое наказание за DM?',env.MT_AI_GATEWAY_TOKEN,sources,{fetchImpl:f,onComplete:p=>last=p});
  assert.match(answer,/\[1\]/);assert.equal(last.usage.inputTokens,58);
  const payload=JSON.parse(upstream.input[0].content[0].text);assert.equal(payload.sources.length,1);assert.equal(payload.sources[0].ref,1);
  assert.match(upstream.instructions,/untrusted/);assert.equal(upstream.store,false);assert.equal(upstream.stream,true);assert.ok(!JSON.stringify(upstream).includes(env.OPENAI_API_KEY));assert.ok(!JSON.stringify(upstream).includes(profile.id));
  for(const invalid of [{question:'x',mode:'rules',sources:[]},{question:'x',mode:'rules',sources:[{...sources[0],sourceUrl:'http://127.0.0.1/'}]},{question:'x',mode:'rules',sources:[{...sources[0],ref:3}]},{question:'x',mode:'rules',sources:[{...sources[0],text:'x'.repeat(2000)}]},{question:'x',sources},{question:'x',mode:'rules',sources,privateProfile:'secret'}]){
   const res=await fetch(base+'/v1/chat',{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${env.MT_AI_GATEWAY_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(invalid)});
   assert.equal(res.status,400,JSON.stringify(invalid).slice(0,80));
  }
 }finally{await new Promise(ok=>server.close(ok));}
});
