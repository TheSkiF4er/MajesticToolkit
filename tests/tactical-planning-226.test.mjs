import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlan,mutatePlan,cleanPlan,duplicatePlan,routeDistance,planExport,PLAN_LIMITS} from '../src/lib/tactical-planning-core.mjs';
const profile='profile_tactics_one',other='profile_tactics_two',sha='a'.repeat(64);
const make=()=>createPlan(profile,{title:'Штурм RP',brief:'Контроль территории',mapSha256:sha,group:{type:'organization',id:'org_tactics_test'}});
const squad={id:'squad_alpha_test',name:'Группа А',role:'Наблюдение',leader:'Alpha',participants:['Alpha','Bravo']};
const a={id:'waypoint_alpha_1',name:'Сбор',kind:'rally',x:.25,y:.5,squadId:squad.id};
const b={id:'waypoint_beta_2',name:'Цель',kind:'objective',x:.75,y:.5,squadId:squad.id};
const assembled=()=>{let p=make();p=mutatePlan(p,'add-squad',squad);p=mutatePlan(p,'add-point',a);p=mutatePlan(p,'add-point',b);p=mutatePlan(p,'add-route',{id:'route_ab_1234',name:'Маршрут А',pointIds:[a.id,b.id],speed:50,squadId:squad.id});return p;};
test('RP plan, group assignments, positions and ordered route are saved as replayable operations',()=>{
 const plan=assembled();assert.equal(cleanPlan(plan).state.squads[0].participants.length,2);assert.equal(plan.state.points.length,2);assert.equal(plan.history.length,5);assert.equal(plan.state.routes[0].pointIds[0],a.id);
 const m=routeDistance(plan,'route_ab_1234',1000,600);assert.equal(m.distancePixels,500);assert.equal(m.minutes,10);
});
test('plan can edit squads and point positions and guard dependent deletion',()=>{
 let p=assembled();p=mutatePlan(p,'edit-point',{...b,x:.8});assert.equal(p.state.points[1].x,.8);
 assert.throws(()=>mutatePlan(p,'remove-point',{id:a.id}),/маршрутом/);
 assert.throws(()=>mutatePlan(p,'remove-squad',{id:squad.id}),/используется/);
 p=mutatePlan(p,'remove-route',{id:'route_ab_1234'});p=mutatePlan(p,'remove-point',{id:a.id});assert.equal(p.state.routes.length,0);assert.equal(p.state.points.length,1);
});
test('reject invalid profile, forged coordinates, duplicate participants and route references',()=>{
 assert.throws(()=>createPlan('bad',{title:'Bad',mapSha256:sha}),/профиль/);
 assert.throws(()=>createPlan(profile,{title:'Bad',mapSha256:'bad'}),/подложки/);
 assert.throws(()=>mutatePlan(make(),'add-point',{...a,x:1.5,squadId:''}),/Координаты/);
 assert.throws(()=>mutatePlan(make(),'add-squad',{...squad,participants:['Ivan','ivan']}),/Повторяющиеся/);
 assert.throws(()=>mutatePlan(make(),'add-route',{name:'X',pointIds:[a.id,b.id],speed:25}),/существующие точки/);
});
test('versioned alternatives preserve original and have distinct identities',()=>{
 const original=assembled(),fork=duplicatePlan(original,{title:'Вариант Б'});
 assert.notEqual(fork.id,original.id);assert.equal(fork.state.parentPlanId,original.id);assert.equal(fork.state.routes[0].name,'Маршрут А');
 const edited=mutatePlan(fork,'edit',{title:'Вариант В',brief:'Новый план',scheduledAt:'',group:original.state.group});
 assert.equal(original.state.title,'Штурм RP');assert.equal(edited.state.title,'Вариант В');
});
test('tampering with replayed record and timestamps fails closed',()=>{
 const p=assembled(),forged=structuredClone(p);forged.state.points[0].x=.99;assert.throws(()=>cleanPlan(forged),/повреждены/);
 const swapped=structuredClone(p);swapped.history[0].at='2027-01-01T00:00:00.000Z';assert.throws(()=>cleanPlan(swapped));
 const duplicate=structuredClone(p);duplicate.history[1].id=duplicate.history[0].id;assert.throws(()=>cleanPlan(duplicate),/порядок/);
});
test('archive blocks mutations; restoration retains history',()=>{
 let p=assembled();p=mutatePlan(p,'archive',{archived:true});assert.throws(()=>mutatePlan(p,'add-point',a),/Архивный/);
 p=mutatePlan(p,'archive',{archived:false});assert.equal(p.state.archived,false);assert.equal(p.state.routes.length,1);
});
test('exports are strictly profile isolated and preserve replayable plans',()=>{
 const p=assembled(),pack=planExport([p],profile);assert.equal(pack.version,1);assert.equal(cleanPlan(pack.plans[0]).id,p.id);assert.equal(planExport([p],other).plans.length,0);
});
test('bounded planning journal, coordinates and member roster limits are enforced',()=>{
 assert.equal(PLAN_LIMITS.squads,24);
 assert.throws(()=>mutatePlan(make(),'add-squad',{...squad,participants:Array.from({length:70},(_,i)=>'Player'+i)}),/лимит/);
 assert.throws(()=>mutatePlan(make(),'add-point',{...a,x:NaN,squadId:''}),/Координаты/);
});

test('generated IDs for unsupplied squad, point and route names are deterministic in replay',()=>{
 let p=make();p=mutatePlan(p,'add-squad',{name:'Группа',role:'',leader:'',participants:[]});const squadId=p.state.squads[0].id;
 p=mutatePlan(p,'add-point',{name:'A',kind:'rally',x:0,y:.2,squadId});
 p=mutatePlan(p,'add-point',{name:'B',kind:'objective',x:1,y:.8,squadId});
 p=mutatePlan(p,'add-route',{name:'Маршрут',pointIds:p.state.points.map(x=>x.id),squadId,speed:15});
 assert.equal(cleanPlan(structuredClone(p)).history.length,5);
 const r=p.state.routes[0];p=mutatePlan(p,'edit-route',{...r,name:'Обновлённый маршрут',speed:30});assert.equal(cleanPlan(p).state.routes[0].speed,30);
});
