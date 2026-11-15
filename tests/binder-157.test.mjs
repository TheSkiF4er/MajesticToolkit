import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
const C=globalThis.RPNForumCore;
const data={};globalThis.browser={storage:{local:{async get(k){return k==null?{...data}:{[k]:data[k]};},async set(v){Object.assign(data,structuredClone(v));},async remove(k){for(const x of Array.isArray(k)?k:[k])delete data[x];}}}};
const S=await import('../src/lib/forum-store.mjs');
const base={profileId:'profile-a',label:'Ответ',category:'Жалобы/Ответы',format:'bbcode',text:'[b]{{decision}}[/b] {{amount}} {{when}} {{link}} {{toggle}} {{note}}',shortcut:1,tags:['проверено'],favorite:true,order:2,variables:[{key:'decision',type:'select',label:'Решение',required:true,options:['Да','Нет']},{key:'amount',type:'number',required:true},{key:'when',type:'date',required:true},{key:'link',type:'url',required:true},{key:'toggle',type:'boolean',required:true},{key:'note',type:'multiline'}]};
const values={decision:'Да',amount:'12.5',when:'2026-11-15',link:'https://example.com/',toggle:'Нет',note:'[b]literal[/b]\nsecond'};
test('typed variables enforce required, options, date and safe link; BBCode values cannot inject tags',()=>{
 const t=C.createTemplate(base);assert.equal(C.fieldsFor(t).length,6);
 assert.throws(()=>C.renderTemplate(t,{},{}),/Заполните/);
 for(const [key,bad] of Object.entries({decision:'Maybe',amount:'NaN',when:'2026-02-30',link:'javascript:alert(1)',toggle:'true'}))assert.throws(()=>C.renderTemplate(t,{}, {...values,[key]:bad}));
 const result=C.renderTemplate(t,{},values);assert.match(result,/\[b\]Да\[\/b\]/);assert.match(result,/［b］literal［\/b］/);assert.match(result,/second/);
 assert.throws(()=>C.cleanTemplate({...t,variables:[{key:'missing',type:'text'}]}),/отсутствующая/);
 assert.throws(()=>C.cleanTemplate({...t,variables:[{key:'decision',type:'select',options:[]}]}),/варианты/);
});
test('unknown fields become required, prototype names are not inherited and legacy builtins resolve',()=>{
 const t=C.createTemplate({...base,variables:[],text:'{{constructor}} {{server}}'});
 assert.throws(()=>C.renderTemplate(t,{server:'Alpha'}),/Заполните/);assert.equal(C.renderTemplate(t,{server:'Alpha'},{constructor:'x'}),'x Alpha');
});
test('safe BBCode supports nested list, quote, quoted URL and spoiler, rejects executable attributes',()=>{
 const html=C.bbcodeToHtml("[URL='https://example.com/']link[/URL][list][*][b]A[/b][*]B[/list][spoiler=Info]C[/spoiler][url=javascript:alert(1)]bad[/url]<img src=x onerror=alert(1)>");
 assert.match(html,/<a href="https:\/\/example.com\/"/);assert.match(html,/<ul><li><strong>A<\/strong><\/li><li>B<\/li><\/ul>/);assert.match(html,/<details><summary>Info<\/summary>C<\/details>/);assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));
});
test('storage preserves metadata, saves bounded versions, refuses conflicting slots and scopes favorites and usage',async()=>{
 const t=await S.upsertTemplate(base);const e=await S.upsertTemplate({...base,label:'Изменён'},t.id);assert.equal(e.history[0].label,t.label);assert.equal(e.id,t.id);assert.deepEqual(e.tags,['проверено']);
 await assert.rejects(S.upsertTemplate({...base,label:'Conflict'}),/занято/);
 await S.recordBinderUsage('profile-a',t.id);assert.ok((await S.binderUsage('profile-a'))[t.id]);assert.deepEqual(await S.binderUsage('profile-b'),{});
 await assert.rejects(S.recordBinderUsage('profile-b',t.id),/недоступен/);await assert.rejects(S.setBinderFavorite(t.id,'profile-b',false),/недоступен/);
 const f=await S.setBinderFavorite(t.id,'profile-a',false);assert.equal(f.favorite,false);assert.equal(f.history.length,1);
 assert.equal(C.libraryTemplates(await S.listTemplates(),'profile-a','проверено','recent',await S.binderUsage('profile-a'),'Жалобы').length,1);
 assert.equal(C.libraryTemplates(await S.listTemplates(),'profile-a','','favorite').length,0);
});
test('legacy pack converts punishment-only binds and HTTPS links, imports with recovery and conflict handling',async()=>{
 const legacy=JSON.stringify({bindFolders:[{id:'folder1',name:'Правила'}],binds:[{id:'binder01',folderId:'folder1',titelOutput:'DM',textOutput:'',color:'blue',punish:{on:true,reasonText:'DM',t:{ban:{min:3,max:30},warn:true},link:'https://example.com/rules'}}],customLinks:[{name:'Правила',url:'https://example.com/rules'}],calcSettings:{secret:'not imported'}});
 const parsed=C.parseImport(legacy,'profile-a');assert.match(parsed.templates[0].text,/Ban: 3–30/);assert.match(parsed.templates[0].text,/WARN/);assert.equal(parsed.links.length,1);
 let r=await S.importBinderPack(legacy,'profile-a','skip');assert.equal(r.imported,1);assert.equal(r.linksImported,1);assert.equal(data.majesticToolkitRecoveryV1.status,'ready');
 r=await S.importBinderPack(legacy,'profile-a','skip');assert.equal(r.skipped,1);assert.equal(r.linksImported,0);
 assert.throws(()=>C.parseImport(legacy.replace('https://example.com/rules"}],','javascript:alert(1)"}],'),'profile-a'),/HTTPS/);
 const t=(await S.listTemplates()).find(x=>x.label==='DM');await S.bulkBinderTemplates([t.id],'profile-a','move','Правила/DM');assert.equal((await S.listTemplates()).find(x=>x.id===t.id).category,'Правила/DM');await assert.rejects(S.bulkBinderTemplates([t.id],'profile-b','delete'),/недоступен/);await S.bulkBinderTemplates([t.id],'profile-a','delete');assert.ok(!(await S.listTemplates()).some(x=>x.id===t.id));
});
test('native pack round trip retains metadata and histories, strips unknown executable fields',async()=>{
 const t=(await S.listTemplates()).find(x=>x.label==='Изменён');const parsed=C.parseImport(C.exportPack([t]),'profile-b');assert.equal(parsed.templates[0].profileId,'profile-b');assert.deepEqual(parsed.templates[0].variables,t.variables);assert.equal(parsed.templates[0].history.length,1);
 const result=await S.importBinderPack(C.exportPack([t]),'profile-b','add');assert.equal(result.imported,1);const copy=(await S.listTemplates()).find(x=>x.profileId==='profile-b');assert.equal(copy.history.length,1);
 const state=defaultState();const legacy=C.createTemplate({...base,profileId:state.activeProfileId});const backup=S.makeFullBackup(state,[legacy]);assert.deepEqual(S.parseFullBackup(backup,validateState).templates[0].variables,legacy.variables);
});
