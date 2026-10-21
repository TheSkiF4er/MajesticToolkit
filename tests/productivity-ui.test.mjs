import test from 'node:test';
import assert from 'node:assert/strict';
const records={};
globalThis.browser={storage:{local:{
 async get(keys){if(keys===null)return {...records};if(typeof keys==='string')return {[keys]:records[keys]};return {};},
 async set(values){Object.assign(records,values);},
 async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete records[k];}
}}};
const elements={
 'productivity-results':{innerHTML:''},
 'productivity-answer':{innerHTML:''},
 'productivity-search':{focus(){this.focused=true;},select(){this.selected=true;}}
};
globalThis.document={getElementById:id=>elements[id]||null};
const {upsertTemplate}=await import('../src/lib/forum-store.mjs');
const {productivitySection,refreshProductivitySearch,setSearchQuery,answerProductivity,searchFocus}=await import('../src/ui/productivity-page.mjs');
const state={activeProfileId:'profile_test_abcdefgh'};
test('rendered search and assistant have real controls for workspace',()=>{
 const html=productivitySection(state);
 for(const id of ['productivity-search','productivity-category','productivity-all-profiles','productivity-assistant-form']) assert.ok(html.includes(id));
});
test('search UI renders stored results, never executes HTML from imported template',async()=>{
 await upsertTemplate({label:'<svg onload=alert(1)> Локальная справка',category:'Суд',profileId:state.activeProfileId,format:'bbcode',shortcut:1,text:'Пример локального поиска'});
 await refreshProductivitySearch();
 setSearchQuery('справка',state);
 await new Promise(r=>setTimeout(r,170));
 const html=elements['productivity-results'].innerHTML;
 assert.ok(html.includes('&lt;svg'));assert.ok(!html.includes('<svg'));
 assert.ok(html.includes('Просмотреть'));
});
test('assistant uses a real stored record and renders source text safely',async()=>{
 const answer=await answerProductivity('локальная справка',state);
 assert.equal(answer.refs.length,1);
 assert.ok(elements['productivity-answer'].innerHTML.includes('&lt;svg'));
 searchFocus();assert.equal(elements['productivity-search'].focused,true);
});
