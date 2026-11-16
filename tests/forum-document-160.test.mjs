import test from 'node:test';
import assert from 'node:assert/strict';
const calls=[];let allowed=true,result={ok:true};
globalThis.browser={permissions:{async contains(){return allowed;}},tabs:{async query(){return [{id:1,url:'https://forum.majestic-rp.ru/threads/one.1/',title:'One'},{id:2,url:'https://forum.majestic-rp.ru/threads/two.2/',title:'Two',active:true},{id:3,url:'https://forum.russia.online/threads/three.3/',active:true}];},async sendMessage(id,msg){calls.push({id,msg});return result;}}};
const {insertForumDocument}=await import('../src/lib/forum-document.mjs');
const profile={id:'p',forumUrl:'https://forum.majestic-rp.ru/'};
test('document insertion requires permission, confirmation and matching tab; never submits',async()=>{
 allowed=false;await assert.rejects(insertForumDocument(profile,'text',()=>true),/разрешите/);allowed=true;
 assert.equal(await insertForumDocument(profile,'text',()=>false),false);assert.equal(calls.length,0);
 assert.equal(await insertForumDocument(profile,'<script>x</script>',prompt=>prompt.includes('Two')),true);
 assert.deepEqual(calls,[{id:2,msg:{type:'MT_APPLY_DOCUMENT',profileId:'p',text:'<script>x</script>'}}]);
 result={ok:false,error:'Профиль изменился'};await assert.rejects(insertForumDocument(profile,'text',()=>true),/Профиль изменился/);
 await assert.rejects(insertForumDocument(profile,'  ',()=>true),/пуст/);await assert.rejects(insertForumDocument({id:'p',forumUrl:'https://example.com/'},'text',()=>true),/поддерживаемого/);
});
