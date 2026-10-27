import test from 'node:test';
import assert from 'node:assert/strict';
const db=new Map();
globalThis.browser={storage:{local:{async get(k){return k===null?Object.fromEntries(db):Object.fromEntries([k].filter(x=>db.has(x)).map(k=>[k,db.get(k)]));},async set(v){for(const [k,val]of Object.entries(v))db.set(k,val);},async remove(k){db.delete(k);}}},permissions:{async contains(){return false;}},runtime:{getURL:v=>v}};
const UI=await import('../src/ui/knowledge-page.mjs');
const {addLink}=await import('../src/lib/integration-store.mjs');
const profile='profile_abcdefgh',state={activeProfileId:profile,profiles:[{id:profile,name:'Test Project',project:'majestic',server:'1'}]};
test('knowledge UI renders the correct official project portal and escaped bookmark notes',async()=>{
 await addLink({title:'<img src=x onerror=alert(1)>',url:'https://docossum.com/guides',notes:'<script>alert(1)</script>'});
 await UI.refreshKnowledge([profile]);
 const html=UI.knowledgeSection(state);
 assert.match(html,/www\.fletcher-wiki\.com\/majestic/);
 assert.match(html,/https:\/\/docossum\.com/);
 assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/Создать связь/);
});
test('Google resource can be stored and viewed through the actual submit handler',async()=>{
 const form={id:'knowledge-google-form',getAttribute:name=>name==='id'?'knowledge-google-form':null};
 const original=globalThis.FormData;
 globalThis.FormData=class {constructor(){this.entries=()=>[['kind','google-doc'],['title','Google шаблон'],['googleUrl','Google_file_id_01234'],['notes','Моя ссылка']][Symbol.iterator]();}};
 try{await UI.handleKnowledgeSubmit(form,state,()=>{},()=>{});}
 finally{globalThis.FormData=original;}
 const html=UI.knowledgeSection(state);
 assert.match(html,/Google шаблон/);
 assert.match(html,/Создать копию/);
});
test('knowledge workspace changes link base by project, without leaking saved Google records',()=>{
 const other={activeProfileId:'profile_other_123',profiles:[{id:'profile_other_123',name:'Russia Online',project:'russia-online'}]};
 const html=UI.knowledgeSection(other);
 assert.match(html,/www\.fletcher-wiki\.com\/russiaonline/);
 assert.doesNotMatch(html,/Google шаблон/);
});
