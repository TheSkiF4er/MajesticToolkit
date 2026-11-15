import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/forum-customization.js';
import '../src/content/forum/customization.js';
import {defaultState,validateState,savePreferences,makeBackup,parseBackup,addProfile,deleteProfile} from '../src/lib/model.mjs';
import {validateForumSettings,updateForumSettings} from '../src/lib/forum-settings.mjs';
const M=globalThis.MTForumCustomization,maj='forum.majestic-rp.ru',rus='forum.russia.online';
test('original defaults are inert, and each built-in palette has readable contrast',()=>{
 assert.equal(M.colors(M.clean()),null);
 for(const theme of ['dark','light','midnight','oled','system'])for(const dark of [true,false]){const p=M.colors(M.clean({theme}),dark);assert.ok(M.contrast(p.text,p.surface)>=4.5);assert.ok(M.contrast(p.accent,p.surface)>=4.5);assert.ok(M.contrast(p.muted,p.surface)>=4.5);}
});
test('global, forum and profile customization scope, reset and undo are independent',()=>{
 let c=M.update(undefined,'global',{theme:'light'});c=M.update(c,maj,{theme:'dark',sidebar:'left'});c=M.update(c,'profile:p1',{theme:'oled'});
 assert.equal(M.resolve(c,maj,'p1').theme,'oled');assert.equal(M.resolve(c,maj,'p2').theme,'dark');assert.equal(M.resolve(c,rus,'p2').theme,'light');
 c=M.update(c,'profile:p1',null);assert.equal(M.resolve(c,maj,'p1').theme,'dark');c=M.undo(c,'profile:p1');assert.equal(M.resolve(c,maj,'p1').theme,'oled');c=M.undo(c,'profile:p1');assert.equal(M.resolve(c,maj,'p1').theme,'dark');
 c=M.update(c,'global',null);assert.equal(M.resolve(c,rus).theme,'original');assert.equal(M.resolve(c,maj).theme,'dark');
});
test('strict theme schema rejects CSS, URLs, arbitrary fonts and invalid numbers',()=>{
 for(const raw of [{theme:'evil'},{font:'url(x)'},{palette:{background:'#123456;display:none'}},{radius:21},{fontSize:'15'},{reading:'true'},{sidebar:'hide-all'}])assert.throws(()=>M.clean(raw));
 assert.equal(Object.hasOwn(M.clean({css:'body{display:none}',script:'evil'}),'css'),false);
 assert.throws(()=>M.importPreset(JSON.stringify({format:'majestic-forum-theme',schemaVersion:2,settings:{}})));
 assert.throws(()=>M.importPreset('x'.repeat(32769)));
 const raw=JSON.parse('{"schemaVersion":1,"profiles":{"__proto__":{"theme":"oled"}}}');assert.equal(M.resolve(raw,maj,'__proto__').theme,'oled');assert.equal({}.theme,undefined);
});
test('preset export, import, replace, deletion and scope undo roundtrip',()=>{
 const s=M.clean({theme:'custom',palette:{accent:'#ccddff'},font:'serif',reading:true});assert.deepEqual(M.importPreset(M.exportPreset(s)),s);
 let c=M.savePreset(undefined,'My theme',s);c=M.savePreset(c,'My theme',{theme:'light'});assert.equal(c.presets.length,1);assert.equal(c.presets[0].settings.theme,'light');assert.equal(M.deletePreset(c,'My theme').presets.length,0);
});
test('theme data roundtrips through legacy state backup and survives Forum Core settings edits',()=>{
 let state=defaultState(),id=state.activeProfileId,forum=validateForumSettings(undefined);
 forum.customization=M.update(undefined,'profile:'+id,{theme:'midnight',quotes:'collapse'});forum.customization=M.savePreset(forum.customization,'My preset',{theme:'oled'});
 forum=updateForumSettings(forum,maj,{enabled:true,density:'compact'});state=validateState(savePreferences(state,{forum}));assert.deepEqual(parseBackup(makeBackup(state)),state);assert.equal(state.preferences.forum.customization.presets.length,1);
 state=addProfile(state,{name:'Russia',project:'russia-online',server:'Beta',forumUrl:'https://forum.russia.online/'});state=validateState(deleteProfile(state,id));assert.equal(Object.keys(state.preferences.forum.customization.profiles).length,0);assert.equal(Object.keys(state.preferences.forum.customization.previous).length,0);
});
test('generated CSS only contains validated tokens and scoped rules, not arbitrary user CSS',()=>{
 const s=M.clean({theme:'custom',palette:{accent:'#aabbcc'},sidebar:'left',header:'sticky',reading:true});const css=globalThis.MTForumStyle.css(s,false);assert.match(css,/--mt-f-accent:#aabbcc/);assert.match(css,/html\[data-mt-forum-custom\] \.p-body-main\[data-mt-layout\]/);assert.doesNotMatch(css,/url\(|@import|display:none/);
});
