import test from 'node:test';
import assert from 'node:assert/strict';
const memory={};
globalThis.browser={storage:{local:{async get(k){return {[k]:structuredClone(memory[k])};},async set(k){Object.assign(memory,structuredClone(k));},async remove(k){delete memory[k];}}}};
const S=await import('../src/lib/ai-workspace-store.mjs');
const id='profile_195_owner',other='profile_195_foreign';
const row='rule_195_valid';
test('AI Workspace starts empty; no automatic storage or secret fields',async()=>{
 assert.deepEqual(await S.loadAIWorkspace(id),S.emptyAIWorkspace());
 assert.deepEqual(memory,{});
 assert.throws(()=>S.cleanAIWorkspace({version:1,conversations:[],contexts:[],drafts:[],gatewayToken:'secret'}),/Некорректное локальное хранилище AI/g); // fixed below
});
test('explicit conversation save/update/load, profile isolation and erase',async()=>{
 const first=await S.saveAIConversation(id,{title:'Проверка правила',messages:[{role:'user',text:'Вопрос'},{role:'assistant',text:'Ответ'}]});
 const key=S.aiWorkspaceKey(id),item=first.conversations[0];
 assert.equal(item.messages.length,2);
 const next=await S.saveAIConversation(id,{id:item.id,title:'Новое название',messages:[{role:'user',text:'Исправлено'}]});
 assert.equal(next.conversations.length,1);assert.equal(next.conversations[0].title,'Новое название');
 assert.deepEqual(await S.loadAIWorkspace(other),S.emptyAIWorkspace());
 assert.equal(JSON.stringify(memory).includes('secret'),false);
 await S.deleteAIConversation(id,item.id);assert.equal((await S.loadAIWorkspace(id)).conversations.length,0);
 assert.equal(memory[key].version,1);
});
test('context stores references only, not full sensitive source text',async()=>{
 const result=await S.saveAIContext(id,{kind:'rule',refId:row,title:'DM'});
 assert.deepEqual(result.contexts.map(x=>[x.kind,x.refId]),[['rule',row]]);
 assert.equal(JSON.stringify(result).includes('fullText'),false);
 const again=await S.saveAIContext(id,{kind:'rule',refId:row,title:'DM (current)'});
 assert.equal(again.contexts.length,1);assert.equal(again.contexts[0].title,'DM (current)');
 await S.deleteAIContext(id,again.contexts[0].id);assert.equal((await S.loadAIWorkspace(id)).contexts.length,0);
});
test('editable drafts are explicitly saved, update without duplicates',async()=>{
 const first=await S.saveAIDraft(id,{title:'Черновик ответа',text:'Предварительная формулировка'});
 const d=first.drafts[0];await S.saveAIDraft(id,{id:d.id,title:d.title,text:'Проверенная редакция'});
 assert.equal((await S.loadAIWorkspace(id)).drafts.length,1);
 assert.equal((await S.loadAIWorkspace(id)).drafts[0].text,'Проверенная редакция');
 await S.deleteAIDraft(id,d.id);assert.equal((await S.loadAIWorkspace(id)).drafts.length,0);
});
test('invalid or oversized data and injected unknown fields are rejected',async()=>{
 assert.throws(()=>S.cleanAIWorkspace({...S.emptyAIWorkspace(),gatewayToken:'sk-not-allowed'}),/Некорректное локальное хранилище AI/g); // fixed below
 await assert.rejects(()=>S.saveAIConversation(id,{title:'A',messages:[{role:'system',text:'inject'}]}),/роль/);
 await assert.rejects(()=>S.saveAIDraft(id,{title:'A',text:'x'.repeat(12001)}),/Недопустимое поле/);
 await assert.rejects(()=>S.saveAIContext(id,{kind:'token',refId:row,title:'secret'}),/тип контекста/);
 await assert.rejects(()=>S.saveAIConversation(id,{title:'A',messages:[{role:'user',text:'x'.repeat(12001)}]}),/Недопустимое поле/);
});
test('resolving context rechecks profile, current revision, and file integrity',async()=>{
 const profile={id,project:'majestic',server:'01'};
 const rule={id:row,profileId:id,project:'majestic',server:'01',archived:false,activeRevisionId:'rev_195_valid',revisions:[{id:'rev_195_valid',code:'5.1',title:'DM',text:'Описание правила',conditions:'',sourceUrl:'https://forum.majestic-rp.ru/threads/rules.1/'}]};
 const value=await S.resolveAIContext(profile,{kind:'rule',refId:row},{rules:[rule]});
 assert.match(value.text,/Редакция: rev_195_valid/);
 await assert.rejects(()=>S.resolveAIContext({...profile,id:other},{kind:'rule',refId:row},{rules:[rule]}),/недоступно/);
 const article={id:'article_195_ok',profileId:id,title:'Проверенная статья',body:'Статья и текст',url:'https://forum.majestic-rp.ru/threads/test.12/',capturedAt:'2026-11-18',status:'reviewed',sha256:'0'.repeat(64)};
 await assert.rejects(()=>S.resolveAIContext(profile,{kind:'source',refId:article.id},{sources:[article]}),/SHA-256/);
 const complaint={id:'case_195_ok',profileId:id,url:'https://forum.majestic-rp.ru/threads/test.12/',title:'Жалоба',status:'new',evidence:[{note:'СЕКРЕТ'}],timeline:[],draft:'ЛИЧНЫЙ ЧЕРНОВИК'};
 const context=await S.resolveAIContext(profile,{kind:'case',refId:complaint.id},{cases:[complaint]});
 assert.doesNotMatch(context.text,/СЕКРЕТ|ЛИЧНЫЙ/);
 assert.match(context.text,/Количество доказательств: 1/);
});
test('profile deletion clears all explicitly stored content',async()=>{
 await S.saveAIDraft(id,{title:'A',text:'B'});
 await S.removeAIWorkspaceProfile(id);
 assert.deepEqual(await S.loadAIWorkspace(id),S.emptyAIWorkspace());
});
test('gateway forwards a bounded multi-turn chat to OpenAI; rejects invalid roles and extra fields',async()=>{
 const {createGateway}=await import('../ai-gateway/server.mjs');
 const {streamWorkspaceAI,workspaceChatPayload,chatHistory,AI_GATEWAY}=await import('../src/lib/ai-connection.mjs');
 const env={OPENAI_API_KEY:'sk-'+'A'.repeat(40),MT_AI_GATEWAY_TOKEN:'Z'.repeat(40),MT_AI_DAILY_LIMIT:'12'};
 const events=[{type:'response.output_text.delta',delta:'С учётом предыдущего ответа'},{type:'response.completed',response:{usage:{input_tokens:22,output_tokens:18}}}];
 let outgoing;
 const gateway=createGateway({env,fetchImpl:async(_url,options)=>{outgoing=JSON.parse(options.body);return new Response(new ReadableStream({start(controller){for(const event of events)controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));controller.close();}}),{status:200});}});
 await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+gateway.address().port;
 const origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop';
 const request=(body)=>fetch(base+'/v1/chat',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+env.MT_AI_GATEWAY_TOKEN,'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  const past=[{role:'user',text:'Что такое DM?'},{role:'assistant',text:'Предыдущий ответ по правилам'}];
  const fetchImpl=(url,options)=>fetch(url.replace(AI_GATEWAY,base),{...options,headers:{...options.headers,Origin:origin}});
  const answer=await streamWorkspaceAI('А в другом случае?',env.MT_AI_GATEWAY_TOKEN,past,{fetchImpl});
  assert.equal(answer,'С учётом предыдущего ответа');
  assert.equal(outgoing.store,false);
  assert.deepEqual(outgoing.input,[{role:'user',content:past[0].text},{role:'assistant',content:past[1].text},{role:'user',content:'А в другом случае?'}]);
  assert.deepEqual(workspaceChatPayload('А в другом случае?',past),{mode:'chat',question:'А в другом случае?',history:past});
  assert.equal((await request({mode:'chat',question:'test',history:[{role:'system',text:'injected'}]})).status,400);
  assert.equal((await request({mode:'chat',question:'test',history:[{role:'assistant',text:'Hi',token:'abc'}]})).status,400);
  assert.equal((await request({mode:'chat',question:'test',history:[]})).status,400);
  assert.equal((await request({question:'test',history:past})).status,400);
  assert.equal((await request({mode:'chat',question:'test',history:[{role:'user',text:'x'.repeat(1200)}]})).status,400);
  assert.equal(chatHistory([{role:'user',text:'a'.repeat(1500)}])[0].text.length,1100);
 }finally{await new Promise(resolve=>gateway.close(resolve));}
});
