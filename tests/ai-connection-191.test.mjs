import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from '../ai-gateway/server.mjs';
import {AI_GATEWAY,AI_ORIGIN,assertQuestion,validateAISettings,streamAI,aiHealth} from '../src/lib/ai-connection.mjs';
const env={OPENAI_API_KEY:'sk-'+('A'.repeat(40)),MT_AI_GATEWAY_TOKEN:'T'.repeat(40),OPENAI_MODEL:'gpt-6-luna',MT_AI_DAILY_LIMIT:'5'};
const origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop';
function stream(parts){return new ReadableStream({start(c){for(const part of parts)c.enqueue(new TextEncoder().encode(part));c.close();}});}
const events=[{type:'response.output_text.delta',delta:'Привет '},{type:'response.output_text.delta',delta:'мир'},{type:'response.completed',response:{usage:{input_tokens:18,output_tokens:12}}}];
function mockUpstream(){let recorded;return {get recorded(){return recorded;},fetch:async(url,opts)=>{recorded={url,opts};return new Response(stream(events.map(e=>`data: ${JSON.stringify(e)}\r\n\r\n`)),{status:200,headers:{'content-type':'text/event-stream'}});}};}
async function setup(extra={}){const mock=mockUpstream(),gateway=createGateway({env:{...env,...extra},fetchImpl:mock.fetch});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${gateway.address().port}`;return {mock,gateway,base,close:()=>new Promise((resolve,reject)=>gateway.close(err=>err?reject(err):resolve()))};}
function req(url,{method='GET',token=env.MT_AI_GATEWAY_TOKEN,body,requestOrigin=origin,headers={}}={}){return fetch(url,{method,headers:{Origin:requestOrigin,Authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
test('AI preferences are strictly validated; local gateway is opt-in',()=>{assert.deepEqual(validateAISettings({enabled:false}),{enabled:false});assert.deepEqual(validateAISettings({enabled:true}),{enabled:true});for(const v of [null,{},[],{enabled:'yes'},{enabled:false,token:'leak'}])assert.throws(()=>validateAISettings(v));assert.match(AI_GATEWAY,/127\.0\.0\.1:32187/);assert.equal(AI_ORIGIN,'http://127.0.0.1/*');assert.equal(assertQuestion(' Привет '),'Привет');assert.throws(()=>assertQuestion(' '));assert.throws(()=>assertQuestion('x'.repeat(5001)));});
test('gateway refuses missing credentials, weak tokens and public origins',async()=>{
 assert.throws(()=>createGateway({env:{...env,OPENAI_API_KEY:'abc'}}));assert.throws(()=>createGateway({env:{...env,MT_AI_GATEWAY_TOKEN:'weak'}}));
 const g=await setup();try{
  assert.equal((await req(g.base+'/health',{requestOrigin:'https://evil.test'})).status,403);
  assert.equal((await req(g.base+'/health',{token:'invalid'})).status,401);
  assert.equal((await req(g.base+'/health')).status,200);
  assert.equal((await req(g.base+'/health',{requestOrigin:'null'})).status,403);
  assert.equal((await req(g.base+'/health',{requestOrigin:'moz-extension://abcdefghijklmnop'})).status,200);
  assert.equal((await req(g.base+'/not-found')).status,404);
 }finally{await g.close();}
});
test('gateway relays actual OpenAI Responses SSE; no provider key or client settings in body',async()=>{
 const g=await setup();try{
  const response=await req(g.base+'/v1/chat',{method:'POST',body:{question:'Здравствуйте'}});assert.equal(response.status,200);
  const wire=await response.text();assert.match(wire,/event: delta/);assert.match(wire,/Привет/);assert.match(wire,/event: complete/);
  assert.equal(g.mock.recorded.url,'https://api.openai.com/v1/responses');
  const outgoing=JSON.parse(g.mock.recorded.opts.body);assert.equal(outgoing.store,false);assert.equal(outgoing.stream,true);assert.equal(outgoing.model,env.OPENAI_MODEL);assert.equal(outgoing.max_output_tokens,700);assert.deepEqual(outgoing.input[0].content,[{type:'input_text',text:'Здравствуйте'}]);assert.ok(!outgoing.tools);assert.ok(!wire.includes(env.OPENAI_API_KEY));
  const invalid=await req(g.base+'/v1/chat',{method:'POST',body:{question:'hi',metadata:{profileId:'secret'}}});assert.equal(invalid.status,400);
 }finally{await g.close();}
});
test('gateway enforces per-minute rate limit and does not forward abusive payload',async()=>{
 const g=await setup();try{assert.equal((await req(g.base+'/v1/chat',{method:'POST',body:{question:'x'.repeat(5001)}})).status,400);
  for(let i=0;i<4;i++)assert.equal((await req(g.base+'/v1/chat',{method:'POST',body:{question:'hello '+i}})).status,200);
  assert.equal((await req(g.base+'/v1/chat',{method:'POST',body:{question:'fifth'}})).status,429);
  assert.equal((await req(g.base+'/health')).status,200);
 }finally{await g.close();}
});
test('gateway suppresses upstream internal errors and propagates HTTP codes',async()=>{
 const gateway=createGateway({env,fetchImpl:async()=>new Response('{"error":{"message":"sensitive internal upstream"}}',{status:429})});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));try{const response=await req(`http://127.0.0.1:${gateway.address().port}/v1/chat`,{method:'POST',body:{question:'test'}});assert.equal(response.status,429);assert.doesNotMatch(await response.text(),/sensitive internal/);}finally{await new Promise(r=>gateway.close(r));}
});
test('client parses split SSE frames, reports usage, and rejects incomplete streams',async()=>{
 const up=mockUpstream();const g=await setup();try{
  const f=async(url,opts)=>{const safe=url.replace(AI_GATEWAY,g.base);return fetch(safe,{...opts,headers:{...opts.headers,Origin:origin}});};
  let delta='',model='',usage;
  const content=await streamAI('  Привет  ',env.MT_AI_GATEWAY_TOKEN,{fetchImpl:f,onDelta:x=>delta+=x,onReady:x=>model=x.model,onComplete:x=>usage=x.usage});
  assert.equal(content,'Привет мир');assert.equal(delta,'Привет мир');assert.equal(model,env.OPENAI_MODEL);assert.deepEqual(usage,{inputTokens:18,outputTokens:12});
  const info=await aiHealth(env.MT_AI_GATEWAY_TOKEN,{fetchImpl:f});assert.equal(info.ok,true);assert.equal(info.remaining,4);
  await assert.rejects(()=>streamAI('Question','token',{fetchImpl:async()=>new Response(stream(['event: delta\ndata: {"text":"partial"}\n\n']),{status:200})}),/прерван/);
 }finally{await g.close();}
});
test('gateway rejects malformed payload, wrong content type and opaque origins',async()=>{const g=await setup();try{const r=await req(g.base+'/v1/chat',{method:'POST',body:{question:' hi '},headers:{'content-type':'text/plain'}});assert.equal(r.status,415);const bad=await fetch(g.base+'/v1/chat',{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${env.MT_AI_GATEWAY_TOKEN}`,'content-type':'application/json'},body:'not json'});assert.equal(bad.status,400);const cors=await fetch(g.base+'/v1/chat',{method:'OPTIONS',headers:{Origin:origin}});assert.equal(cors.status,204);assert.equal(cors.headers.get('access-control-allow-origin'),origin);}finally{await g.close();}});
