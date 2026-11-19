/** 2.2.7: reproducible RP plan simulations. No game telemetry or changes to actual captures. */
import {cleanPlan} from './tactical-planning-core.mjs';
export const SIMULATION_PREFIX='mtTacticalSimulationV227:';
export const SIMULATION_LIMITS=Object.freeze({perProfile:60,routes:18,waypoints:45,iterations:80,bytes:600000});
const finite=(value,name,min,max,integer=false)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw Error(`Недопустимый параметр симуляции: ${name}`);return value;};
const ident=x=>{if(typeof x!=='string'||!/^[\w-]{8,120}$/.test(x))throw Error('Неверный ID симуляции');return x;};
const iso=x=>{if(typeof x!=='string'||!Number.isFinite(Date.parse(x))||new Date(x).toISOString()!==x)throw Error('Неверная дата симуляции');return x;};
const hash=x=>{if(typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x))throw Error('Некорректная контрольная сумма карты');return x;};
const uid=()=>globalThis.crypto?.randomUUID?.()??`sim-${Date.now()}-${Math.random().toString(36).slice(2,14)}`;
export function normalizeSimulationSettings(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Неверные настройки симуляции');
 return {
  departureMinutes:finite(input.departureMinutes??0,'начало',0,240),
  speedMultiplier:finite(input.speedMultiplier??1,'множитель скорости',.1,5),
  waypointWaitMinutes:finite(input.waypointWaitMinutes??0,'остановка',0,30),
  collisionRadiusPixels:finite(input.collisionRadiusPixels??12,'радиус пересечения',0,200),
  speedVariation:finite(input.speedVariation??0,'разброс скорости',0,.5),
  seed:finite(input.seed??1,'seed',0,4294967295,true),
  iterations:finite(input.iterations??1,'число повторов',1,SIMULATION_LIMITS.iterations,true)
 };
}
function randomGenerator(seed){let x=(seed>>>0)||0x6d2b79f5;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function pos(segment,t){if(segment.end<=segment.start)return segment.b;const f=Math.max(0,Math.min(1,(t-segment.start)/(segment.end-segment.start)));return {x:segment.a.x+(segment.b.x-segment.a.x)*f,y:segment.a.y+(segment.b.y-segment.a.y)*f};}
function closest(a,b,from,to){const a0=pos(a,from),a1=pos(a,to),b0=pos(b,from),b1=pos(b,to),dx=a0.x-b0.x,dy=a0.y-b0.y,vx=(a1.x-b1.x)-dx,vy=(a1.y-b1.y)-dy,den=vx*vx+vy*vy;const u=den?Math.max(0,Math.min(1,-(dx*vx+dy*vy)/den)):0;return {minute:from+(to-from)*u,distance:Math.hypot(dx+vx*u,dy+vy*u)};}
function conflictsBetween(a,b,radius){let i=0,j=0,best=null;while(i<a.segments.length&&j<b.segments.length){const x=a.segments[i],y=b.segments[j],from=Math.max(x.start,y.start),to=Math.min(x.end,y.end);if(to>=from){const candidate=closest(x,y,from,to);if(!best||candidate.distance<best.distance)best=candidate;}if(x.end<y.end)i++;else if(y.end<x.end)j++;else{i++;j++;}}
 return best&&best.distance<=radius?{routeA:a.routeId,routeB:b.routeId,minute:rounded(best.minute),distancePixels:rounded(best.distance)}:null;
}
const rounded=n=>Math.round(n*1000)/1000;
function singleRun(state,settings,map,random){
 const points=new Map(state.points.map(p=>[p.id,{x:p.x*map.width,y:p.y*map.height,name:p.name}]));
 const routes=[];
 for(const r of state.routes){
  const speed=r.speed*settings.speedMultiplier*(1+settings.speedVariation*(random()*2-1));
  let t=settings.departureMinutes,dist=0;const pts=r.pointIds.map(id=>points.get(id)),segments=[],arrivals=[{pointId:r.pointIds[0],minute:rounded(t)}];
  for(let k=1;k<pts.length;k++){
   const a=pts[k-1],b=pts[k],d=Math.hypot(b.x-a.x,b.y-a.y),duration=d/speed;
   if(duration>0)segments.push({start:t,end:t+duration,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}});
   t+=duration;dist+=d;
   arrivals.push({pointId:r.pointIds[k],minute:rounded(t)});
   if(k<pts.length-1&&settings.waypointWaitMinutes>0){segments.push({start:t,end:t+settings.waypointWaitMinutes,a:{x:b.x,y:b.y},b:{x:b.x,y:b.y}});t+=settings.waypointWaitMinutes;}
  }
  if(t>10080)throw Error('Маршрут длится более 7 дней. Увеличьте условную скорость');
  routes.push({routeId:r.id,name:r.name,squadId:r.squadId,distancePixels:rounded(dist),startedMinute:rounded(settings.departureMinutes),finishedMinute:rounded(t),durationMinutes:rounded(t-settings.departureMinutes),arrivals,segments});
 }
 const conflicts=[];for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){if(routes[i].squadId&&routes[i].squadId===routes[j].squadId)continue;const c=conflictsBetween(routes[i],routes[j],settings.collisionRadiusPixels);if(c)conflicts.push(c);}
 conflicts.sort((a,b)=>a.minute-b.minute||a.routeA.localeCompare(b.routeA)||a.routeB.localeCompare(b.routeB));
 return {durationMinutes:rounded(Math.max(...routes.map(x=>x.finishedMinute))),totalDistancePixels:rounded(routes.reduce((n,x)=>n+x.distancePixels,0)),conflictCount:conflicts.length,routes:routes.map(({segments,...x})=>x),conflicts};
}
const quantile=(values,p)=>{const s=[...values].sort((a,b)=>a-b),v=(s.length-1)*p,lo=Math.floor(v),hi=Math.ceil(v);return rounded(s[lo]+(s[hi]-s[lo])*(v-lo));};
/** All calculations are in image pixels and relative minutes. They are estimates, not predictions of a match. */
export function runTacticalSimulation(plan,rawSettings,mapDimensions){
 const p=cleanPlan(plan),s=normalizeSimulationSettings(rawSettings);
 if(p.state.routes.length<1||p.state.routes.length>SIMULATION_LIMITS.routes)throw Error('Симуляция требует 1–18 маршрутов');
 for(const r of p.state.routes)if(r.pointIds.length>SIMULATION_LIMITS.waypoints)throw Error('Маршрут слишком длинный для симуляции');
 if(!mapDimensions||!Number.isInteger(mapDimensions.width)||!Number.isInteger(mapDimensions.height)||mapDimensions.width<1||mapDimensions.height<1||mapDimensions.width>16384||mapDimensions.height>16384)throw Error('Некорректный размер карты');
 const map={width:mapDimensions.width,height:mapDimensions.height},rng=randomGenerator(s.seed),first=singleRun(p.state,s,map,rng);
 const runs=[first];for(let i=1;i<s.iterations;i++)runs.push(singleRun(p.state,s,map,rng));
 const durations=runs.map(x=>x.durationMinutes),counts=runs.map(x=>x.conflictCount);
 return {model:'route-timeline-v1',planId:p.id,planUpdatedAt:p.updatedAt,mapSha256:p.state.mapSha256,map,settings:s,primary:first,statistics:{runs:runs.length,durationP10:quantile(durations,.1),durationMedian:quantile(durations,.5),durationP90:quantile(durations,.9),conflictsMean:rounded(counts.reduce((a,b)=>a+b,0)/counts.length),runsWithConflicts:counts.filter(n=>n>0).length}};
}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
/** Stored runs embed an immutable validated plan snapshot. Recalculate to detect modified results. */
export function cleanTacticalSimulation(raw){
 if(!raw||typeof raw!=='object')throw Error('Повреждена симуляция');
 const id=ident(raw.id),profileId=ident(raw.profileId),createdAt=iso(raw.createdAt);
 const title=typeof raw.title==='string'&&raw.title.trim()&&raw.title.length<=120?raw.title.trim():(()=>{throw Error('Недопустимое название симуляции');})();
 const plan=cleanPlan(raw.plan);if(plan.profileId!==profileId)throw Error('Симуляция принадлежит другому RP-профилю');
 if(raw.result?.planId!==plan.id||raw.result?.mapSha256!==hash(plan.state.mapSha256))throw Error('Нарушена привязка симуляции к карте и плану');
 const expected=runTacticalSimulation(plan,raw.settings,raw.map);
 if(!equal(expected,raw.result)||!equal(expected.settings,raw.settings))throw Error('Результат симуляции изменён или повреждён');
 return {id,profileId,createdAt,title,plan,settings:expected.settings,map:expected.map,result:expected};
}
export function createTacticalSimulation(profileId,plan,title,settings,map){
 const p=cleanPlan(plan);if(p.profileId!==profileId)throw Error('План другого RP-профиля');
 const row={id:uid(),profileId,createdAt:new Date().toISOString(),title,plan:p,settings:normalizeSimulationSettings(settings),map:{width:map.width,height:map.height}};
 row.result=runTacticalSimulation(row.plan,row.settings,row.map);
 return cleanTacticalSimulation(row);
}
export function compareTacticalSimulations(rawA,rawB){
 const a=cleanTacticalSimulation(rawA),b=cleanTacticalSimulation(rawB);
 if(a.profileId!==b.profileId||a.result.mapSha256!==b.result.mapSha256)throw Error('Сравнение возможно только внутри одного профиля и одной подложки карты');
 const one=a.result.primary,two=b.result.primary;
 return {first:a.id,second:b.id,deltaDurationMinutes:rounded(two.durationMinutes-one.durationMinutes),deltaDistancePixels:rounded(two.totalDistancePixels-one.totalDistancePixels),deltaConflicts:two.conflictCount-one.conflictCount};
}
export function simulationExport(rows,profileId){const valid=rows.map(cleanTacticalSimulation).filter(x=>x.profileId===profileId);return {format:'majestic-tactical-simulations',version:1,profileId,exportedAt:new Date().toISOString(),runs:valid};}
