import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {makeBackupV18,parseBackupV18,validateAIBackup,replaceAIWorkspaces,disableAIOnRestore} from '../src/lib/ai-backup.mjs';
import {makeBackupV17,makePortableBackup,parsePortableBackup} from '../src/lib/dossier-backup.mjs';
import {emptyAIWorkspace,cleanAIWorkspace,aiWorkspaceKey} from '../src/lib/ai-workspace-store.mjs';
import {createGateway} from '../ai-gateway/server.mjs';
import {streamAI,AI_GATEWAY} from '../src/lib/ai-connection.mjs';
import '../src/lib/complaints-core.js';
import '../src/lib/forum-core.js';
const state=validateState(defaultState());const profile=state.profiles[0];
const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];
const punishment={version:1,calculators:[],drafts:[]},sections={version:1,subscriptions:[],inbox:[]},registry={version:1,records:[]},ops={version:1,profiles:[]};
const make18=(rows)=>makeBackupV18(args,punishment,sections,registry,ops,[],rows);
const make17=()=>makeBackupV17(args,punishment,sections,registry,ops,[]);
const parse=text=>parseBackupV18(text,validateState,globalThis.RPNForumCore.cleanTemplate);
const aiData={...emptyAIWorkspace(),conversations:[{id:'dialog_200_sample',title:'Правила',updatedAt:'2026-11-18T09:00:00Z',messages:[{role:'user',text:'Можно ли DM?'},{role:'assistant',text:'Проверьте актуальные правила.'}]}],drafts:[{id:'draft_200_sample',title:'Черновик',text:'Только после ручной проверки',updatedAt:'2026-11-18T09:00:00Z'}]};
const rows=[{profileId:profile.id,workspace:aiData}];
test('Backup v18 excludes AI conversations unless explicitly selected',()=>{
 const text=make18(null),raw=JSON.parse(text);assert.equal(raw.schemaVersion,18);assert.equal(raw.aiWorkspace,null);
 assert.doesNotMatch(text,/Можно ли DM|Только после ручной проверки|sk-SECRET/);
 const parsed=parse(text);assert.equal(parsed.schemaVersion,18);assert.equal(parsed.aiWorkspace,null);assert.deepEqual(parsed.state.profiles,state.profiles);
});
test('Backup v18 round-trips explicitly consented AI history, contexts and drafts by profile',()=>{
 const json=make18(rows),parsed=parse(json);assert.equal(parsed.aiWorkspace.length,1);assert.deepEqual(parsed.aiWorkspace,rows);
 assert.equal(JSON.parse(json).payload.activeProfileId,state.activeProfileId);
 assert.doesNotMatch(json,/MT_AI_GATEWAY_TOKEN|OPENAI_API_KEY|Bearer /);
});
test('Backup v18 parses v17 and old copies without touching AI workspace',()=>{
 const old=parse(make17());assert.equal(old.schemaVersion,17);assert.equal(old.aiWorkspace,null);
 const parsed=parse(make18([]));assert.deepEqual(parsed.aiWorkspace,[]);
});
test('Backup v18 rejects cross-profile, duplicates and forbidden token metadata before restore',()=>{
 assert.throws(()=>make18([{profileId:'other_200_profile',workspace:aiData}]),/профилю/);
 assert.throws(()=>make18([...rows,...rows]),/повторному|Некорректная история/);
 assert.throws(()=>parse(JSON.stringify({...JSON.parse(make18(rows)),aiWorkspace:[{profileId:profile.id,workspace:{...aiData,gatewayToken:'private'}}]})),/Некорректное локальное хранилище AI/);
 assert.throws(()=>cleanAIWorkspace({...aiData,conversations:[{...aiData.conversations[0],messages:[{role:'user',text:'OK',apiKey:'sk-secret'}]}]}),/роль/);
 assert.throws(()=>cleanAIWorkspace({...aiData,drafts:[{...aiData.drafts[0],gatewayToken:'secret'}]}),/AI-черновик/);
});
test('Backup v18 has an independently verified portable ZIP roundtrip',async()=>{
 const json=make18(rows),{blob,manifest}=await makePortableBackup(json,[]),read=await parsePortableBackup(blob);
 assert.equal(manifest.format,'majestictoolkit-portable-backup');assert.equal(read.json,json);
 assert.deepEqual(parse(read.json).aiWorkspace,rows);assert.equal(read.files.size,0);
});
test('AI restore validates all rows before writing and isolates profiles',async()=>{
 const stored={},storage={async set(x){Object.assign(stored,structuredClone(x));}};
 await replaceAIWorkspaces(rows,state.profiles,storage);assert.deepEqual(stored[aiWorkspaceKey(profile.id)],aiData);
 const old=structuredClone(stored);
 await assert.rejects(replaceAIWorkspaces([{profileId:'foreign_200',workspace:aiData}],state.profiles,storage),/профилю/);
 assert.deepEqual(stored,old);await replaceAIWorkspaces(null,state.profiles,storage);assert.deepEqual(stored,old);
});
test('AI consent does not migrate: restored profiles have cloud AI disabled',async()=>{
 const storageMap={mtAiConnectionV191:{[profile.id]:{enabled:true},other_profile_200:{enabled:true}}};
 const storage={async get(k){return {[k]:storageMap[k]};},async set(x){Object.assign(storageMap,structuredClone(x));}};
 await disableAIOnRestore(state.profiles,storage);
 assert.equal(storageMap.mtAiConnectionV191[profile.id].enabled,false);
 assert.equal(storageMap.mtAiConnectionV191.other_profile_200.enabled,true);
 assert.equal(JSON.stringify(storageMap).includes('secret'),false);
});
test('AI gateway never exposes provider secret and refuses non-extension callers',async()=>{
 const env={OPENAI_API_KEY:'sk-'+'S'.repeat(40),MT_AI_GATEWAY_TOKEN:'T'.repeat(40)};
 let upstreamBody;
 const upstream=[{type:'response.output_text.delta',delta:'Ответ по правилам'},{type:'response.completed',response:{usage:{input_tokens:15,output_tokens:7}}}];
 const gateway=createGateway({env,fetchImpl:async(_url,options)=>{upstreamBody=JSON.parse(options.body);return new Response(new ReadableStream({start(ctrl){for(const item of upstream)ctrl.enqueue(new TextEncoder().encode('data: '+JSON.stringify(item)+'\n\n'));ctrl.close();}}),{status:200});}});
 await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+gateway.address().port;
 try{
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://forum.majestic-rp.ru',Authorization:`Bearer ${env.MT_AI_GATEWAY_TOKEN}`}})).status,403);
  const fetchImpl=(url,options)=>fetch(url.replace(AI_GATEWAY,base),{...options,headers:{...options.headers,Origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop'}});
  const text=await streamAI('Могу ли я получить объяснение?',env.MT_AI_GATEWAY_TOKEN,{fetchImpl});assert.equal(text,'Ответ по правилам');
  assert.equal(upstreamBody.store,false);assert.equal(upstreamBody.stream,true);assert.equal(upstreamBody.tools,undefined);
  assert.equal(JSON.stringify(upstreamBody).includes(env.MT_AI_GATEWAY_TOKEN),false);
 }finally{await new Promise(resolve=>gateway.close(resolve));}
});
test('AI streamed response rejects interrupted output even after partial tokens',async()=>{
 const events=['event: ready\ndata: {"model":"test"}\n\n','event: delta\ndata: {"text":"partial only"}\n\n'];
 const fetchImpl=async()=>new Response(new ReadableStream({start(c){events.forEach(x=>c.enqueue(new TextEncoder().encode(x)));c.close();}}),{status:200});
 await assert.rejects(()=>streamAI('hi','token',{fetchImpl}),/прерван/);
});
