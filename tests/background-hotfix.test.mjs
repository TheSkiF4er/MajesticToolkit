import test from 'node:test';
import assert from 'node:assert/strict';
const registrations=[];
const executions=[];
const listeners={};
const granted=new Set();
const callbacks={addListener(fn){listeners[this.name]=fn;}};
const event=name=>({addListener(fn){listeners[name]=fn;}});
const local={async get(){return {};},async set(){},async remove(){},async setAccessLevel(){}};
globalThis.browser={
 runtime:{id:'test-ext-id',getURL:(path)=>'moz-extension://test-ext-id/'+path,onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')},
 scripting:{
  async getRegisteredContentScripts(){return registrations.map(r=>({...r}));},
  async unregisterContentScripts({ids}){for(const id of ids){const at=registrations.findIndex(r=>r.id===id);if(at>=0)registrations.splice(at,1);}},
  async registerContentScripts(xs){registrations.push(...xs);},
  async executeScript({target,files}){executions.push({target,files});}
 },
 permissions:{async contains({origins}){return origins.every(x=>granted.has(x));},onAdded:event('added'),onRemoved:event('removed')},
 tabs:{async query({url}={}){if(url?.includes('https://forum.majestic-rp.ru/*'))return [{id:42,url:'https://forum.majestic-rp.ru/threads/test.100/'}];return [];},async sendMessage(){},async create(){}},
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
 assert.deepEqual(installed.files,['lib/safe-dom.js','lib/forum-core.js','lib/xenforo-core.js','lib/complaints-core.js','content/forum.js']);
 assert.ok(registrations.some(x=>x.matches[0]==='https://forum.majestic-rp.ru/*'));
});
test('revoking site permission unregisters the persistent content script',async()=>{
 granted.delete('https://forum.majestic-rp.ru/*');
 listeners.removed();
 await wait(()=>!registrations.some(x=>x.matches[0]==='https://forum.majestic-rp.ru/*'));
});
