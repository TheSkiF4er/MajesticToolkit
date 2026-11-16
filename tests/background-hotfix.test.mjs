import test from 'node:test';
import assert from 'node:assert/strict';
const registrations=[];
const executions=[];
const messages=[];
const openedTabs=[];
const data={};
const listeners={};
const granted=new Set();
const callbacks={addListener(fn){listeners[this.name]=fn;}};
const event=name=>({addListener(fn){listeners[name]=fn;}});
const local={async get(key){return key===null||key===undefined?{...data}:{[key]:data[key]};},async set(value){Object.assign(data,value);},async remove(key){for(const k of Array.isArray(key)?key:[key])delete data[k];},async setAccessLevel(){}};
globalThis.browser={
 runtime:{id:'test-ext-id',getURL:(path)=>'moz-extension://test-ext-id/'+path,onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')},
 scripting:{
  async getRegisteredContentScripts(){return registrations.map(r=>({...r}));},
  async unregisterContentScripts({ids}){for(const id of ids){const at=registrations.findIndex(r=>r.id===id);if(at>=0)registrations.splice(at,1);}},
  async registerContentScripts(xs){registrations.push(...xs);},
  async executeScript({target,files}){executions.push({target,files});}
 },
 permissions:{async contains({origins}){return origins.every(x=>granted.has(x));},onAdded:event('added'),onRemoved:event('removed')},
 tabs:{async query({url}={}){if(!url||url?.includes('https://forum.majestic-rp.ru/*'))return [{id:42,url:'https://forum.majestic-rp.ru/threads/test.100/'}];return [];},async sendMessage(id,message){messages.push({id,message});},async create(x){openedTabs.push(x);return x;}},
 notifications:{onClicked:event('clicked'),async clear(){},async create(){}},
 alarms:{onAlarm:event('alarm'),async create(){}},
 storage:{local,onChanged:event('storage')}
};
await import('../src/background/background.js');
const wait=async fn=>{for(let i=0;i<60&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert.ok(fn(),'timed out waiting for browser API calls');};
test('grant on an already open XenForo tab injects real binder scripts immediately',async()=>{
 granted.add('https://forum.majestic-rp.ru/*');
 listeners.added();
 await wait(()=>executions.some(x=>x.target.tabId===42));
 const installed=executions.find(x=>x.target.tabId===42);
 assert.deepEqual(installed.files,['lib/safe-dom.js','lib/forum-core.js','lib/xenforo-core.js','lib/complaints-core.js','lib/forum-customization.js','content/forum/context.js','content/forum/editors.js','content/forum/navigation.js','content/forum/lifecycle.js','content/forum/customization.js','content/forum/punishment-overlay.js','lib/section-monitor-core.js','content/forum/section-scanner.js','content/forum.js']);
 assert.ok(registrations.some(x=>x.matches[0]==='https://forum.majestic-rp.ru/*'));
});
test('revoking site permission unregisters the persistent content script',async()=>{
 granted.delete('https://forum.majestic-rp.ru/*');
 listeners.removed();
 await wait(()=>!registrations.some(x=>x.matches[0]==='https://forum.majestic-rp.ru/*'));
 await wait(()=>messages.some(x=>x.id===42&&x.message.type==='RP_NEXUS_FORUM_PERMISSION_REVOKED'&&x.message.hosts.includes('forum.majestic-rp.ru')));
});

const send=(url,message,frameId=0)=>new Promise(resolve=>listeners.message(message,{id:'test-ext-id',url,frameId,tab:{id:42}},resolve));
test('forum data is permission-checked and profile/site-scoped in the actual background handler',async()=>{
 const origin='https://forum.majestic-rp.ru/*',url='https://forum.majestic-rp.ru/threads/test.100/';
 const date='2026-11-15T00:00:00.000Z',a={id:'profile-majestic',name:'Majestic',project:'majestic',server:'Alpha',forumUrl:'https://forum.majestic-rp.ru/'},b={id:'profile-russia',name:'Russia',project:'russia-online',server:'Beta',forumUrl:'https://forum.russia.online/'};
 data.rpNexusStateV1={activeProfileId:b.id,profiles:[a,b],preferences:{forum:{schemaVersion:1,global:{},sites:{'forum.majestic-rp.ru':{panelPosition:'left'}},profiles:{[a.id]:{binderEnabled:false}}}}};
 for(const p of [a,b]){const id='tpl_'+p.id;data['rpnForumTemplateV2:'+id]={id,profileId:p.id,label:p.name,text:'Hello',category:'',format:'plain',shortcut:1,createdAt:date,updatedAt:date};}
 granted.add(origin);
 let response=await send(url,{type:'RP_NEXUS_FORUM_DATA'});
 assert.equal(response.ok,true);assert.equal(response.value.profile.id,a.id);assert.equal(response.value.settings.panelPosition,'left');assert.equal(response.value.settings.binderEnabled,false);assert.deepEqual(response.value.templates.map(t=>t.profileId),[a.id]);
 response=await send(url,{type:'RP_NEXUS_FORUM_DATA'},1);assert.equal(response.ok,false);
 granted.delete(origin);response=await send(url,{type:'RP_NEXUS_FORUM_DATA'});assert.equal(response.value.allowed,false);assert.deepEqual(response.value.templates,[]);
 response=await send(url,{type:'RP_NEXUS_OPEN_WORKSPACE',view:'forum'});assert.equal(response.ok,false);
});

test('Navigation 2.0 authorizes current-page bookmark/history and rejects other profile or frame',async()=>{
 const origin='https://forum.majestic-rp.ru/*',url='https://forum.majestic-rp.ru/threads/test.100/?token=secret';
 granted.add(origin);const profileId='profile-majestic';
 const action=(name,extra={})=>send(url,{type:'MT_NAVIGATION_ACTION',action:name,profileId,...extra});
 let response=await action('bookmark',{title:'Тестовая тема',url:'https://forum.russia.online/threads/other.42/'});
 assert.equal(response.ok,true);assert.equal(response.value.url,'https://forum.majestic-rp.ru/threads/test.100/');
 assert.equal((await action('bookmark',{title:'Дубликат'})).value.id,response.value.id);
 assert.equal((await action('bookmark',{profileId:'profile-russia'})).ok,false);
 assert.equal((await action('switch-profile',{id:'profile-russia'})).ok,false);
 assert.deepEqual((await action('visit',{title:'Тестовая тема'})).value,[]);
 data.rpNexusStateV1.preferences.forum.global.navigationHistory=true;
 response=await action('visit',{title:'Тестовая тема'});assert.equal(response.ok,true);assert.equal(response.value[0].url,'https://forum.majestic-rp.ru/threads/test.100/');
 assert.equal((await action('clear-history')).ok,true);
 assert.equal((await send(url,{type:'MT_NAVIGATION_ACTION',action:'bookmark',profileId,title:'evil'},1)).ok,false);
 granted.delete(origin);assert.equal((await action('bookmark',{title:'No access'})).ok,false);
});

test('reading positions are private, opt-in, profile-scoped, and permission-checked',async()=>{
 const {defaultState,savePreferences}=await import('../src/lib/model.mjs');
 const {validateForumSettings}=await import('../src/lib/forum-settings.mjs');
 const M=globalThis.MTForumCustomization,origin='https://forum.majestic-rp.ru/*',url='https://forum.majestic-rp.ru/threads/test.100/';
 let state=defaultState(),id=state.activeProfileId;data.rpNexusStateV1=state;granted.add(origin);
 const act=(action,extra={})=>send(url,{type:'MT_FORUM_READING',profileId:id,action,...extra});
 assert.equal((await act('save',{postId:'js-post-123'})).ok,false);
 const forum=validateForumSettings(undefined);forum.customization=M.update(undefined,'global',{rememberReading:true});data.rpNexusStateV1=savePreferences(state,{forum});
 assert.equal((await act('save',{postId:'js-post-123'})).value,'js-post-123');assert.equal((await act('get')).value,'js-post-123');
 assert.equal((await act('save',{postId:'<script>'})).ok,false);assert.equal((await act('get',{profileId:'another'})).ok,false);
 assert.equal((await send(url+'?token=private',{type:'MT_FORUM_READING',profileId:id,action:'get'})).value,'js-post-123');
 assert.equal((await act('clear')).value,'');assert.equal((await act('get')).value,'');
 granted.delete(origin);assert.equal((await act('get')).ok,false);
});

test('Punishment Overlay authorizes rules, validates selections and keeps drafts separate by thread and profile',async()=>{
 const {createRule,reviseRule,RULES_KEY,currentRevision}=await import('../src/lib/rules-core.mjs');
 const {defaultState}=await import('../src/lib/model.mjs');
 const state=defaultState(),p=state.profiles[0],origin='https://forum.majestic-rp.ru/*',url='https://forum.majestic-rp.ru/threads/test.100/';
 data.rpNexusStateV1=state;granted.add(origin);
 const fields={code:'5.5',title:'PG',category:'Основные',text:'Правило',aliases:['Power Gaming'],sourceUrl:'https://forum.majestic-rp.ru/threads/rules.123/',verification:'unverified',sanctions:[{type:'demorgan',unit:'minutes',min:35,max:90},{type:'warn',unit:'none',min:null,max:null}]};
 const r=createRule(p,fields),foreign=createRule({...p,id:'another-profile'},fields),otherServer=createRule(p,{...fields,server:'Another server'});
 data[RULES_KEY]=[r,foreign,otherServer];
 const act=(action,extra={},page=url,frame=0)=>send(page,{type:'MT_PUNISHMENT_OVERLAY',action,profileId:p.id,...extra},frame);
 const select={ruleId:r.id,revisionId:r.activeRevisionId,index:0,amount:60};
 let res=await act('list');assert.equal(res.ok,true);assert.deepEqual(res.value.rules.map(x=>x.id),[r.id]);
 assert.equal((await act('list',{profileId:'another-profile'})).ok,false);assert.equal((await act('list',{},url,1)).ok,false);
 assert.equal((await act('add',{...select,amount:91})).ok,false);assert.equal((await act('add',{...select,ruleId:foreign.id})).ok,false);
 res=await act('add',select);assert.equal(res.ok,true);assert.equal(res.value.entries[0].sanction,'Demorgan 60 мин.');
 assert.equal((await act('add',select)).value.entries.length,1);
 assert.equal((await act('list',{},url+'page-2?token=ignored')).value.entries.length,1);
 assert.equal((await act('list',{},'https://forum.majestic-rp.ru/threads/test.101/')).value.entries.length,0);
 assert.match((await act('preview')).value,/Требует проверки/);
 assert.equal((await act('add',{...select,index:1,amount:1})).ok,false);
 assert.equal((await act('add',{...select,index:1,amount:null})).value.entries[0].sanction,'WARN');
 assert.equal((await act('favorite',{ruleId:r.id,favorite:true})).value.favorite,true);
 data[RULES_KEY]=[reviseRule(r,{...fields,title:'Updated'},r.activeRevisionId),foreign,otherServer];
 assert.equal((await act('list')).value.entries[0].stale,true);assert.equal((await act('preview')).ok,false);
 assert.equal((await act('remove',{ruleId:r.id})).value.entries.length,0);
 assert.equal((await act('add',select)).ok,false);
 state.preferences.forum={schemaVersion:1,global:{punishmentEnabled:false},sites:{},profiles:{}};
 assert.equal((await act('list')).ok,false);granted.delete(origin);assert.equal((await act('list')).ok,false);
});


test('Calculator workspace route uses trusted forum thread/profile and rejects revoked permission',async()=>{
 const {defaultState}=await import('../src/lib/model.mjs');const state=defaultState();data.rpNexusStateV1=state;const origin='https://forum.majestic-rp.ru/*',url='https://forum.majestic-rp.ru/threads/test.100/page-2?secret=1#post-3';granted.add(origin);
 const res=await send(url,{type:'RP_NEXUS_OPEN_WORKSPACE',view:'calculator',thread:'forged',calcProfile:'forged'});assert.equal(res.ok,true);const opened=new URL(openedTabs.at(-1).url);assert.equal(opened.hash,'#rules');assert.equal(opened.searchParams.get('thread'),'forum.majestic-rp.ru:100');assert.equal(opened.searchParams.get('calcProfile'),state.activeProfileId);assert.equal(opened.searchParams.get('calculator'),'1');assert.ok(!opened.href.includes('secret'));
 granted.delete(origin);assert.equal((await send(url,{type:'RP_NEXUS_OPEN_WORKSPACE',view:'calculator'})).ok,false);
});

test('Section Monitor is extension-only, uses active profile and opens inbox from notification',async()=>{
 const {defaultState}=await import('../src/lib/model.mjs');const state=defaultState();data.rpNexusStateV1=state;const p=state.profiles[0],url='https://forum.majestic-rp.ru/forums/qa.77/';
 const action={type:'MT_SECTION_MONITOR',profileId:p.id,action:'add',input:{url,name:'QA section',interval:5,notify:true}};
 const content=await send(url,action);assert.equal(content.ok,false);
 const ext='moz-extension://test-ext-id/ui/workspace.html';const res=await send(ext,action);assert.equal(res.ok,true);const id=res.value.subscriptions[0].id;
 assert.equal((await send(ext,{type:'MT_SECTION_MONITOR',action:'list',profileId:'other-profile'})).ok,false);
 listeners.clicked('mt_section_'+id);await wait(()=>openedTabs.some(t=>t.url.includes('sectionMonitor='+encodeURIComponent(p.id)+'#complaints')));
});

test('native moderation requires permission, exact forum thread and matching profile',async()=>{
 const origin='https://forum.majestic-rp.ru/*',url='https://forum.majestic-rp.ru/threads/test.100/';granted.add(origin);
 const p=data.rpNexusStateV1.profiles.find(x=>x.forumUrl.startsWith('https://forum.majestic-rp.ru/'));
 const message={type:'MT_NATIVE_MODERATION',profileId:p.id,action:'edit'};
 assert.equal((await send(url,message)).ok,true);assert.equal((await send(url,{...message,action:'delete'})).ok,false);assert.equal((await send(url,{...message,profileId:'foreign'})).ok,false);assert.equal((await send('https://forum.majestic-rp.ru/forums/test.1/',message)).ok,false);assert.equal((await send(url,message,1)).ok,false);assert.equal((await send(url+'edit',message)).ok,false);
 granted.delete(origin);assert.equal((await send(url,message)).ok,false);
});
