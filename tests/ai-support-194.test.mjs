import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPPORT_TOPICS,buildSupportWire,sanitizeSupportQuestion,validateSupportContext,validateSupportAnswer,localSupportSteps,supportReport} from '../src/lib/ai-support-core.mjs';
import {runSupportDiagnostics} from '../src/lib/ai-support-diagnostics.mjs';
import {streamSupportAI,AI_GATEWAY} from '../src/lib/ai-connection.mjs';
import {createGateway} from '../ai-gateway/server.mjs';
const env={OPENAI_API_KEY:'sk-'+'x'.repeat(40),MT_AI_GATEWAY_TOKEN:'T'.repeat(40),OPENAI_MODEL:'gpt-6-luna'};
const ORIGIN='chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const context={category:'backup',version:'1.9.4',checks:[{id:'localStorage',status:'ok'},{id:'indexedDB',status:'warn'}]};
const text='При загрузке копии ошибка восстановления';
const answer={summary:'Проверка не завершена.',possibleCause:'Неполный ZIP.',steps:['Проверьте формат резервной копии.'],additionalQuestions:['Какая версия копии?'],severity:'warning',requiresHumanReview:true};
const wire=buildSupportWire(text,context);
function upstream(){let sent;return {get sent(){return sent;},fetch:async(url,opts)=>{sent=JSON.parse(opts.body);const stream=new ReadableStream({start(c){for(const x of [{type:'response.output_text.delta',delta:JSON.stringify(answer)},{type:'response.completed',response:{usage:{input_tokens:60,output_tokens:50}}}])c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(x)+'\n\n'));c.close();}});return new Response(stream,{status:200});}};}
async function server(mock){const gw=createGateway({env,fetchImpl:mock.fetch});await new Promise(ok=>gw.listen(0,'127.0.0.1',ok));return {base:`http://127.0.0.1:${gw.address().port}`,close:()=>new Promise(ok=>gw.close(ok))};}
const post=(url,payload)=>fetch(url,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',Authorization:`Bearer ${env.MT_AI_GATEWAY_TOKEN}`},body:JSON.stringify(payload)});
test('support payload strips typical secrets and never includes raw diagnostic details',()=>{
 assert.deepEqual(Object.keys(SUPPORT_TOPICS),['general','forum','backup','evidence','ai','integrations']);
 const q=sanitizeSupportQuestion('Ошибка при OPENAI_API_KEY=sk-projectsecret12345, email test@example.com, URL https://example.org/sensitive?token=abc, путь C:\\Users\\Name\\private');
 assert.doesNotMatch(q,/sk-projectsecret|test@example|example.org|Name\\private/);
 assert.ok(q.includes('СКРЫТ'));
 assert.deepEqual(buildSupportWire(text,context),wire);
 assert.deepEqual(Object.keys(wire).sort(),['diagnostics','mode','question']);
 assert.ok(!JSON.stringify(wire).includes('private'));
 assert.match(supportReport(context),/MajesticToolkit Support/);
 assert.doesNotMatch(supportReport(context),/secret|password|Bearer/);
});
test('support schema refuses unknown status IDs, custom debug messages and oversized contexts',()=>{
 for(const x of [ {...context,checks:[{id:'sensitiveField',status:'ok'}]}, {...context,checks:[{id:'indexedDB',status:'fail',detail:'secret'}]}, {...context,checks:[{id:'indexedDB',status:'ok'},{id:'indexedDB',status:'warn'}]}, {...context,token:'secret'}, {...context,version:'browser-dev'} ])assert.throws(()=>validateSupportContext(x));
 for(const x of [' ', 'x'.repeat(2001)])assert.throws(()=>buildSupportWire(x,context));
 assert.ok(localSupportSteps('backup',context.checks).some(x=>x.includes('резервную')));
 assert.ok(localSupportSteps('ai',[],'HTTP 429: rate limit').some(x=>x.includes('HTTP 429')));
 assert.ok(localSupportSteps('backup',[],'Ошибка SHA-256 в ZIP').some(x=>x.includes('целостности')));
});
test('read-only local diagnostics report bounded statuses; secrets never present',async()=>{
 const mock={runtime:{getManifest:()=>({version:'1.9.4'})},storage:{local:{get:async()=>({'mtAiConnectionV191':{personal:'secret'}})}},permissions:{contains:async({origins})=>!origins[0].includes('russia.online')}};
 const data=await runSupportDiagnostics({apiImpl:mock,indexedDBImpl:{open(){}},storageManager:{estimate:async()=>({quota:100,usage:94})},includeGateway:true,token:'TOKENSECRET',health:async()=>{throw Error('Bearer TOKENSECRET denied');}});
 assert.equal(data.version,'1.9.4');assert.equal(data.checks.find(x=>x.id==='indexedDB').status,'ok');assert.equal(data.checks.find(x=>x.id==='storageQuota').status,'warn');assert.equal(data.checks.find(x=>x.id==='forumRussia').status,'warn');assert.equal(data.checks.find(x=>x.id==='gatewayConnection').status,'warn');
 assert.doesNotMatch(supportReport({category:'ai',version:data.version,checks:data.checks.map(({id,status})=>({id,status}))}),/TOKENSECRET|personal|"quota"|"usage"/);
});
test('AI support gateway actually forwards strict diagnostics through OpenAI Responses SSE',async()=>{
 const mock=upstream(),g=await server(mock);
 try{const fetchImpl=(url,opts)=>fetch(url.replace(AI_GATEWAY,g.base),{...opts,headers:{...opts.headers,Origin:ORIGIN}});
  const response=await streamSupportAI(text,env.MT_AI_GATEWAY_TOKEN,context,{fetchImpl});const parsed=validateSupportAnswer(JSON.parse(response));assert.equal(parsed.severity,'warning');
  assert.equal(mock.sent.store,false);assert.equal(mock.sent.stream,true);assert.equal(mock.sent.max_output_tokens,1900);
  assert.equal(mock.sent.text.format.name,'support_diagnosis');assert.ok(!mock.sent.tools);
  const forwarded=JSON.parse(mock.sent.input[0].content[0].text);assert.deepEqual(forwarded,{question:text,diagnostics:context});
  assert.doesNotMatch(JSON.stringify(mock.sent),/TOKENSECRET|private-notes/);
 }finally{await g.close();}
});
test('gateway rejects unsolicited private payload, wrong IDs, long issue and unredacted credentials',async()=>{
 const mock=upstream(),g=await server(mock);try{
  const invalid=[{...wire,diagnostics:{...context,logs:'raw secrets'}},{...wire,diagnostics:{...context,checks:[{id:'accessToken',status:'ok'}]}},{...wire,case:{notes:'private'}},{...wire,sources:[{text:'private'}]},{...wire,question:'password=abcDEF12345678'},{...wire,question:'x'.repeat(2001)},{...wire,mode:'unavailable'}];
  for(const x of invalid)assert.equal((await post(g.base+'/v1/chat',x)).status,400,JSON.stringify(x).slice(0,50));
  assert.equal((await post(g.base+'/v1/chat',wire)).status,200);
  assert.equal((await fetch(g.base+'/v1/chat',{method:'POST',headers:{Origin:'https://example.org',Authorization:`Bearer ${env.MT_AI_GATEWAY_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(wire)})).status,403);
 }finally{await g.close();}
});
test('support AI validates structured answer and refuses malformed or autonomous advice records',()=>{
 assert.deepEqual(validateSupportAnswer(answer),answer);
 for(const invalid of [{...answer,requiresHumanReview:false},{...answer,severity:'resolved'},{...answer,steps:['x'.repeat(1201)]},{...answer,secret:'not allowed'},null])assert.throws(()=>validateSupportAnswer(invalid));
});
