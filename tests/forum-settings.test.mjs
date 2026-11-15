import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,validateState,makeBackup,parseBackup,savePreferences,addProfile,deleteProfile} from '../src/lib/model.mjs';
import {FORUM_DEFAULTS,validateForumSettings,forumSettingsFor,updateForumSettings} from '../src/lib/forum-settings.mjs';
const m='forum.majestic-rp.ru',r='forum.russia.online';
test('1.5.5 state remains valid and gets identical default forum behavior',()=>{
 const legacy=defaultState();assert.deepEqual(validateState(legacy),legacy);
 assert.deepEqual(forumSettingsFor(legacy.preferences.forum,m),FORUM_DEFAULTS);
});
test('forum options inherit global → site → profile, and reset restores inheritance',()=>{
 let s=updateForumSettings(undefined,'global',{...FORUM_DEFAULTS,panelPosition:'left'});
 s=updateForumSettings(s,m,{enabled:false,appearance:'light'});
 s=updateForumSettings(s,'profile:profile-a',{enabled:true,density:'compact'});
 assert.equal(forumSettingsFor(s,m,'profile-a').enabled,true);
 assert.equal(forumSettingsFor(s,m,'profile-b').enabled,false);
 assert.equal(forumSettingsFor(s,r).panelPosition,'left');
 assert.equal(forumSettingsFor(s,r).appearance,'dark');
 s=updateForumSettings(s,'profile:profile-a',null);
 assert.equal(forumSettingsFor(s,m,'profile-a').enabled,false);
 s=updateForumSettings(s,m,null);assert.equal(forumSettingsFor(s,m).enabled,true);
});
test('settings are preserved in state backups and deleted profile settings are pruned',()=>{
 let state=defaultState();const id=state.activeProfileId;
 const prefs=updateForumSettings(undefined,'profile:'+id,{density:'compact'});
 state=validateState(savePreferences(state,{forum:prefs}));
 assert.deepEqual(parseBackup(makeBackup(state)),state);
 state=addProfile(state,{name:'Russia',project:'russia-online',server:'Beta',forumUrl:'https://forum.russia.online/'});
 state=validateState(deleteProfile(state,id));assert.deepEqual(state.preferences.forum.profiles,{});
});
test('invalid enums, types, versions and prototype keys are not accepted as preferences',()=>{
 assert.throws(()=>updateForumSettings(undefined,m,{panelPosition:'javascript:alert(1)'}));
 assert.throws(()=>updateForumSettings(undefined,m,{enabled:'false'}));
 assert.throws(()=>validateForumSettings({schemaVersion:2,sites:{}}));
 const settings=updateForumSettings(undefined,m,{appearance:'light',script:'alert(1)'});
 assert.equal(Object.hasOwn(settings.sites[m],'script'),false);
 const input=JSON.parse('{"schemaVersion":1,"global":{},"sites":{},"profiles":{"__proto__":{"enabled":false}}}');
 assert.equal(forumSettingsFor(input,m,'__proto__').enabled,false);
 assert.equal({}.enabled,undefined);
});
