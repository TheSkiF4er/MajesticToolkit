import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditEconomyDataset} from '../src/lib/economy-ga.mjs';
import {createRecord} from '../src/lib/economy-core.mjs';
import {newMarketRecord} from '../src/lib/marketplace-core.mjs';
import {newFamily} from '../src/lib/family-core.mjs';
import {newOrganization} from '../src/lib/organization-core.mjs';
import {newFinanceEvent,financeSnapshot} from '../src/lib/finance-core.mjs';

const profileId='profile_aaa001';
const other='profile_bbb002';
const base=()=>({legacy:[],marketplace:[],inventory:[],families:[],organizations:[],crime:{territories:[],operations:[]},finance:[],links:[],documents:[],evidenceVault:[]});

test('GA acceptance certifies eight empty but valid persisted registries',()=>{
 const report=auditEconomyDataset(base(),[profileId]);
 assert.equal(report.ok,true);assert.equal(report.checked,8);assert.equal(report.issues.length,0);
 assert.ok(report.results.every(x=>x.ok&&x.count===0));
});

test('GA certification detects corrupt legacy, cross-profile marketplace and orphan finance owners independently',()=>{
 const data=base();
 data.legacy=[createRecord('cash',profileId,{date:'2026-11-19',kind:'income',title:'Касса',amount:120})];
 data.legacy[0].amount=-1;
 data.marketplace=[newMarketRecord('product',other,{name:'Автомобиль',category:'Транспорт',variant:'',unit:'шт.',note:''})];
 data.finance=[{profileId,events:[newFinanceEvent(profileId,'account-open',{name:'Счёт семьи',ownerType:'family',ownerId:'family_unknown',openingBalance:0})]}];
 const report=auditEconomyDataset(data,[profileId]);
 assert.equal(report.ok,false);assert.deepEqual(report.issues.map(x=>x.key).sort(),['finance','legacy','marketplace','inventory','links'].sort());
 assert.ok(report.results.find(x=>x.key==='families').ok);
});

test('GA certification validates real family, organization, marketplace and financial journal together',()=>{
 const data=base();
 const family=newFamily(profileId,{name:'Fletcher',tag:'FL',description:''});
 const organization=newOrganization(profileId,{name:'Business',tag:'BUS',type:'business',description:''});
 data.families.push(family);data.organizations.push(organization);
 data.marketplace.push(newMarketRecord('product',profileId,{name:'Товар',category:'Другое',variant:'',unit:'шт.',note:''}));
 data.finance=[{profileId,events:[newFinanceEvent(profileId,'account-open',{name:'Family Cash',ownerType:'family',ownerId:family.id,openingBalance:500})]}];
 const report=auditEconomyDataset(data,[profileId]);
 assert.equal(report.ok,true,JSON.stringify(report.issues));
 assert.equal(report.results.find(x=>x.key==='organizations').count,1);
 assert.equal(report.results.find(x=>x.key==='finance').count,1);
});

test('GA audit detects link pointing to another profile, without mutating source',()=>{
 const data=base();
 const product=newMarketRecord('product',profileId,{name:'Продукт',category:'Другое',variant:'',unit:'шт.',note:''});data.marketplace.push(product);
 const snapshot=JSON.stringify(data);
 data.links.push({id:'link_12345678',profileId,entityType:'product',entityId:product.id,sourceType:'evidence',sourceId:'evidence_12345678',note:'',createdAt:'2026-11-19T10:00:00.000Z'});
 const report=auditEconomyDataset(data,[profileId]);
 assert.equal(report.ok,false);assert.deepEqual(report.issues.map(x=>x.key),['links']);
 data.links.pop();assert.equal(JSON.stringify(data),snapshot);
});

test('budget spend aggregates case-insensitive categories and ignores reversed expense',()=>{
 const budgetId='budget_12345678';
 const opened=newFinanceEvent(profileId,'account-open',{name:'Касса',ownerType:'personal',openingBalance:10000});
 const accountId=opened.accountId;
 const events=[
  opened,
  newFinanceEvent(profileId,'budget-set',{accountId,budgetId,category:'Аренда',month:'2026-11',limit:200}),
  newFinanceEvent(profileId,'expense',{accountId,amount:80,category:'аренда',date:'2026-11-01'}),
  newFinanceEvent(profileId,'expense',{accountId,amount:60,category:'АРЕНДА',date:'2026-11-02'}),
 ];
 const r=financeSnapshot({profileId,events});
 assert.equal(r.budgets[0].used,140);assert.equal(r.budgets[0].remaining,60);
});
