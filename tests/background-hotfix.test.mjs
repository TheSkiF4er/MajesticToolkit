import test from 'node:test';
import assert from 'node:assert/strict';
const registrations=[];
const executions=[];
const messages=[];
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
 tabs:{async query({url}={}){if(!url||url?.includes('https://forum.majestic-rp.ru/*'))return [{id:42,url:'https://forum.majestic-rp.ru/threads/test.100/'}];return [];},async sendMessage(id,message){messages.push({id,message});},async create(){}},
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
 assert.deepEqual(installed.files,['lib/safe-dom.js','lib/forum-core.js','lib/xenforo-core.js','lib/complaints-core.js','content/forum/context.js','content/forum/editors.js','content/forum/navigation.js','content/forum/lifecycle.js','content/forum.js']);
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
