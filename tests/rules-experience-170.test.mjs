import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,validateState,addProfile} from '../src/lib/model.mjs';
import {createRule,updateRule} from '../src/lib/rules-core.mjs';
import {calculatePunishments,defaultPolicy} from '../src/lib/punishment-calculator.mjs';
import {validatePunishmentBackup,punishmentBackupFromStorage,punishmentStorageRecords,makeRulesExperienceBackup,parseRulesExperienceBackup} from '../src/lib/punishment-backup.mjs';
import {makeBackupV15} from '../src/lib/rules-backup.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {isOwnedKey} from '../src/lib/recovery.mjs';
import {initialRulesTab,rulesExperienceSnapshot} from '../src/ui/rules-experience.mjs';
import {workspacePreferences,WIDGETS} from '../src/lib/workspace-preferences.mjs';
import {dashboardSnapshot,dashboardWidgets} from '../src/ui/workspace-page.mjs';
import '../src/lib/forum-core.js';
const state=defaultState(),p=state.profiles[0];
const rule=createRule(p,{code:'5.1',title:'DM',category:'Основные',text:'Тест',aliases:[],sourceUrl:'https://forum.majestic-rp.ru/threads/test.123/',verification:'unverified',sanctions:[{type:'demorgan',unit:'minutes',min:30,max:60,condition:''}]});
const item={ruleId:rule.id,revisionId:rule.activeRevisionId,index:0,amount:45};
const result=calculatePunishments([{id:'123',nickname:'Player',items:[item]}],[rule],p,defaultPolicy());
const data={version:1,calculators:[{profileId:p.id,project:p.project,server:p.server,policy:defaultPolicy(),history:[{id:'history_123',result}]}],drafts:[{profileId:p.id,project:p.project,threads:[{thread:'forum.majestic-rp.ru:123',items:[item]}]}]};
const args=[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[rule]];
test('Rules & Punishments full backup round-trip preserves calculator snapshots, policy and overlay drafts',()=>{
 const text=makeRulesExperienceBackup(args,data);const parsed=parseRulesExperienceBackup(text,validateState,globalThis.RPNForumCore.cleanTemplate);assert.deepEqual(parsed.punishments,data);assert.deepEqual(parsed.rules,[rule]);
 const raw=punishmentStorageRecords(data,state.profiles);assert.ok(Object.keys(raw).every(isOwnedKey));assert.deepEqual(punishmentBackupFromStorage(raw,state.profiles),data);
 assert.equal(parseRulesExperienceBackup(makeBackupV15(...args),validateState,globalThis.RPNForumCore.cleanTemplate).punishments,null);
});
test('historical calculator snapshots are not recomputed on rule revision or archive; bad scopes and malformed amounts are rejected',()=>{
 const changed=structuredClone(data);changed.calculators[0].history[0].result.players[0].entries[0].amount=-1;assert.throws(()=>validatePunishmentBackup(changed,state.profiles));
 const wrong=structuredClone(data);wrong.drafts[0].threads[0].thread='forum.russia.online:123';assert.throws(()=>validatePunishmentBackup(wrong,state.profiles));
 const bad=structuredClone(data);bad.calculators[0].history[0].result.profileId='other_profile';assert.throws(()=>validatePunishmentBackup(bad,state.profiles));
 const duplicate=structuredClone(data);duplicate.calculators.push(duplicate.calculators[0]);assert.throws(()=>validatePunishmentBackup(duplicate,state.profiles));
 assert.throws(()=>validatePunishmentBackup(data,[{...p,project:'russia-online'}]));
 const text=makeRulesExperienceBackup([...args.slice(0,-1),[updateRule(rule,{archived:true})]],data);assert.deepEqual(parseRulesExperienceBackup(text,validateState,globalThis.RPNForumCore.cleanTemplate).punishments,data);
});
test('legacy dashboard preferences migrate without losing widget order and hidden state',()=>{
 const old={order:WIDGETS.slice(0,6).reverse(),hidden:['timers']};const next=workspacePreferences(old);assert.deepEqual(next.order.slice(0,6),old.order);assert.deepEqual(next.hidden,['timers','rules','calculations','violations']);assert.deepEqual(workspacePreferences(next),next);
});
test('hub routes deep links and filters rules and cases by active project, profile and server',()=>{
 assert.equal(initialRulesTab(new URLSearchParams('rule=abc')),'library');assert.equal(initialRulesTab(new URLSearchParams('calculator=1&caseId=abc')),'calculator');assert.equal(initialRulesTab(new URLSearchParams('rulesTab=overview')),'overview');
 const foreign={...rule,id:'foreign_rule',profileId:'foreign_profile'};const wrongServer={...rule,id:'wrong_server',server:'Other'};
 const cases=[{id:'case_one',profileId:p.id,url:'https://forum.majestic-rp.ru/threads/test.123/',status:'new',moderation:{project:p.project,server:p.server,status:'draft'}},{id:'case_two',profileId:p.id,url:'https://forum.russia.online/threads/test.123/',status:'new'}];
 const d=rulesExperienceSnapshot(p,[rule,foreign,wrongServer],[{profileId:p.id,legacy:{}}],cases,{policy:defaultPolicy(),history:[]},[]);assert.deepEqual(d.rules.map(r=>r.id),[rule.id]);assert.equal(d.cases.length,1);assert.equal(d.templates.length,1);
 const dashboard=dashboardSnapshot(state,{rules:[updateRule(rule,{favorite:true,lastOpened:new Date().toISOString()}),foreign],complaints:cases});assert.equal(dashboard.rules.length,1);assert.equal(dashboard.violations.length,1);assert.equal(dashboard.calculations.length,1);assert.match(dashboardWidgets(state,{data:dashboard,errors:[]}),/Избранные правила/);
});
