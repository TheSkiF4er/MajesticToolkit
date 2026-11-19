import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,addProfile,selectProfile,savePreferences,validateState,makeBackup,parseBackup} from '../src/lib/model.mjs';
import {WIDGETS,workspacePreferences,changeWidget} from '../src/lib/workspace-preferences.mjs';
import {dashboardSnapshot,dashboardWidgets,NAV_GROUPS,FORUM_TABS} from '../src/ui/workspace-page.mjs';
test('workspace widget configuration is validated, persisted and backward compatible',()=>{
 const legacy=defaultState();assert.equal(legacy.preferences.workspace,undefined);assert.deepEqual(workspacePreferences(),{order:[...WIDGETS],hidden:[]});
 let pref=changeWidget(undefined,'bookmarks','up');pref=changeWidget(pref,'timers','toggle');assert.equal(pref.order[0],'bookmarks');assert.deepEqual(pref.hidden,['timers']);
 const state=validateState(savePreferences(legacy,{workspace:pref}));assert.deepEqual(parseBackup(makeBackup(state)),state);
 assert.throws(()=>workspacePreferences({order:Array(6).fill('binder'),hidden:[]}));assert.throws(()=>workspacePreferences({order:[...WIDGETS],hidden:['unknown']}));assert.throws(()=>changeWidget(pref,'binder','unknown'));
 assert.equal(NAV_GROUPS.flatMap(x=>x[1]).length,22);assert.ok(NAV_GROUPS.flatMap(x=>x[1]).includes('cloud'));assert.equal(FORUM_TABS.length,4);
});
test('dashboard filters profiles and domains, retains global timers, and escapes local text',()=>{
 const initial=defaultState(),id=initial.activeProfileId;
 const state=selectProfile(addProfile(initial,{name:'Russia',project:'russia-online',server:'Beta',forumUrl:'https://forum.russia.online/'}),id);
 const other=state.profiles[1].id,now=Date.now(),date=new Date(now).toISOString();
 const raw={binder:[{id:'a',profileId:id,label:'<img src=x onerror=alert(1)>',favorite:true},{id:'b',profileId:other,label:'private',favorite:true},{id:'c',profileId:'*',label:'shared',favorite:true}],bookmarks:[{id:'a',profileId:id,kind:'bookmark',host:'forum.majestic-rp.ru',title:'mine',url:'https://forum.majestic-rp.ru/threads/test.1/',createdAt:date},{id:'b',profileId:other,kind:'bookmark',host:'forum.russia.online',title:'private',url:'https://forum.russia.online/threads/test.1/',createdAt:date}],complaints:[{profileId:id,title:'mine',status:'new',deadline:date},{profileId:other,title:'private',status:'new'},{profileId:id,title:'done',status:'done'}],timers:[{status:'active',title:'timer',expiresAt:now+1000},{status:'done',title:'finished'}],documents:[{profileId:id,type:'document',updatedAt:date,currentVersion:1,versions:[{title:'mine'}]},{profileId:other,type:'document',updatedAt:date,versions:[{title:'private'}]}]};
 const d=dashboardSnapshot(state,raw,now);assert.deepEqual(d.templates.map(t=>t.id),['a','c']);assert.equal(d.bookmarks.length,1);assert.equal(d.cases.length,1);assert.equal(d.documents.length,1);assert.equal(d.timers.length,1);
 const html=dashboardWidgets(state,{data:d,errors:[]});assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x|private/);assert.match(html,/timer/);
});
