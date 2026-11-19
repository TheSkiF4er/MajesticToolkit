/** Tactical Analytics & Replay 2.2.8.
 * The Crime and Airdrop ledgers are authoritative. Replay never writes them and
 * never guesses unrecorded player movements or the outcome of a simulated match.
 */
import {validateCrime} from './crime-core.mjs';
import {validateAirdrops} from './tactical-airdrop-core.mjs';
import {cleanTacticalSimulation} from './tactical-simulation-core.mjs';

export const REPLAY_MAX_EVENTS=1500;
const idOk=x=>typeof x==='string'&&/^[\w-]{8,120}$/.test(x);
const validDate=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const day=x=>x.slice(0,10);
const groupKey=g=>g?.type&&g.type!=='none'?`${g.type}:${g.id}`:'';
const jsonCopy=x=>structuredClone(x);
const initialOwners=territories=>Object.fromEntries(territories.map(t=>[t.id,jsonCopy(t.initialOwner)]));
const categories=Object.freeze(['capture','battle','rp','airdrop']);
export function cleanReplayRange({from='',to='',category='all'}={}){
 if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw Error('Неверный диапазон дат воспроизведения');
 if(category!=='all'&&!categories.includes(category))throw Error('Неизвестный фильтр тактических событий');
 return {from,to,category};
}
function rowsFromCrime(rows,profileId){
 return rows.filter(x=>x.profileId===profileId&&['completed','cancelled'].includes(x.status)).map(op=>({
  id:`crime:${op.id}`,sourceId:op.id,at:op.date+'T12:00:00.000Z',date:op.date,
  category:op.kind,kind:op.status==='cancelled'?'cancel':'result',
  title:op.title,status:op.status,territoryId:op.territoryId||'',winner:op.winner,
  attacker:jsonCopy(op.attacker),defender:jsonCopy(op.defender),
  participants:jsonCopy(op.participants),pointId:'',reward:'',point:null
 }));
}
function rowsFromAirdrops(points,rows,profileId){
 const byPoint=new Map(points.map(p=>[p.id,p]));const accepted=new Set(['start','claim','finish','cancel']);
 return rows.filter(x=>x.profileId===profileId).flatMap(op=>op.history.filter(x=>accepted.has(x.kind)).map(change=>({
  id:`airdrop:${op.id}:${change.id}`,sourceId:op.id,at:change.at,date:day(change.at),category:'airdrop',kind:change.kind,
  title:op.title,status:change.kind,territoryId:'',winner:change.kind==='claim'?change.data.winner:'',
  attacker:null,defender:null,participants:[],pointId:op.pointId,
  reward:change.kind==='claim'?change.data.reward||'':'',
  point:(()=>{const p=byPoint.get(op.pointId);return p?{x:p.x,y:p.y,mapSha256:p.mapSha256,name:p.name}:null;})()
 })));
}
const order=(a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id);
const applyOwner=(owners,row)=>{if(row.category==='capture'&&row.kind==='result'&&row.winner==='attacker')owners[row.territoryId]=jsonCopy(row.attacker);};
/** Build a verified time series with a complete pre-period ownership baseline. */
export function buildTacticalAnalytics({territories=[],operations=[],airdropPoints=[],airdropEvents=[],families=[],organizations=[],simulations=[]},profileId,range={}){
 if(!idOk(profileId))throw Error('Недопустимый RP-профиль');
 const filter=cleanReplayRange(range),crime=validateCrime(territories,operations,null,families,organizations),air=validateAirdrops(airdropPoints,airdropEvents);
 const all=[...rowsFromCrime(crime.operations,profileId),...rowsFromAirdrops(air.points,air.events,profileId)].sort(order);
 const shown=all.filter(item=>(!filter.from||item.date>=filter.from)&&(!filter.to||item.date<=filter.to)&&(filter.category==='all'||item.category===filter.category));
 const baseline=initialOwners(crime.territories.filter(x=>x.profileId===profileId));
 const ownerEvents=all.filter(x=>x.category==='capture'&&x.kind==='result'&&x.winner==='attacker').map(x=>({at:x.at,territoryId:x.territoryId,attacker:x.attacker}));
 if(filter.from)for(const change of ownerEvents)if(change.at<filter.from+'T00:00:00.000Z')applyOwner(baseline,{...change,category:'capture',kind:'result',winner:'attacker'});
 if(shown.length>REPLAY_MAX_EVENTS)throw Error(`Слишком много событий (${shown.length}). Сузьте период: максимум ${REPLAY_MAX_EVENTS} для воспроизведения`);
 const groupNames=new Map([...families.filter(x=>x.profileId===profileId).map(x=>['family:'+x.id,x.name]),...organizations.filter(x=>x.profileId===profileId).map(x=>['organization:'+x.id,x.name])]);
 const names=new Map(crime.territories.filter(x=>x.profileId===profileId).map(x=>[x.id,x.name]));
 const groups=new Map(),players=new Map(),days=new Map();let captures=0,battles=0,airdrops=0,claims=0,cancellations=0,kills=0,deaths=0,damage=0;
 for(const item of shown){
  const d=days.get(item.date)||{date:item.date,captures:0,battles:0,airdrops:0,claims:0};
  if(item.kind==='cancel')cancellations++;
  if(item.category==='airdrop'){
   if(item.kind==='finish'){airdrops++;d.airdrops++;}
   if(item.kind==='claim'){claims++;d.claims++;}
  }else if(item.kind==='result'){
   if(item.category==='capture'){captures++;d.captures++;}
   else{battles++;d.battles++;}
   const winner=item.winner;
   for(const [side,group] of [['attacker',item.attacker],['defender',item.defender]]){
    const key=groupKey(group);if(!key)continue;
    const g=groups.get(key)||{key,name:groupNames.get(key)||key,events:0,wins:0,losses:0,draws:0,kills:0,deaths:0,damage:0};
    g.events++;
    if(winner==='draw')g.draws++;
    else if(winner===side)g.wins++;
    else g.losses++;
    for(const p of item.participants.filter(x=>x.side===side)){
     g.kills+=p.kills;g.deaths+=p.deaths;g.damage+=p.damage;kills+=p.kills;deaths+=p.deaths;damage+=p.damage;
     const playerKey=key+'/'+p.player.toLocaleLowerCase('ru'),entry=players.get(playerKey)||{player:p.player,group:g.name,events:0,kills:0,deaths:0,damage:0};
     entry.events++;entry.kills+=p.kills;entry.deaths+=p.deaths;entry.damage+=p.damage;players.set(playerKey,entry);
    }
    groups.set(key,g);
   }
  }
  days.set(item.date,d);
 }
 const runs=simulations.filter(x=>x.profileId===profileId).map(cleanTacticalSimulation);
 const eventLabels=shown.map(x=>({...x,territoryName:names.get(x.territoryId)||'',attackerName:groupNames.get(groupKey(x.attacker))||'',defenderName:groupNames.get(groupKey(x.defender))||''}));
 return {profileId,range:filter,events:eventLabels,baselineOwners:baseline,ownerEvents,territories:crime.territories.filter(x=>x.profileId===profileId).map(x=>({id:x.id,name:x.name,initialOwner:x.initialOwner,archived:x.archived})),
  groupNames:Object.fromEntries(groupNames),trend:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),groups:[...groups.values()].sort((a,b)=>b.wins-a.wins||b.damage-a.damage||a.key.localeCompare(b.key)),
  players:[...players.values()].sort((a,b)=>b.kills-a.kills||b.damage-a.damage||a.player.localeCompare(b.player)),
  simulations:runs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
  stats:{captures,battles,airdrops,claims,cancellations,kills,deaths,damage,recordedEvents:shown.length}
 };
}
/** index=-1 is the baseline, subsequent indices represent recorded event steps. */
export function tacticalReplayFrame(report,index){
 if(!Number.isInteger(index)||index< -1||index>=report.events.length)throw Error('Шаг воспроизведения вне истории');
 const owners=jsonCopy(report.baselineOwners);const until=index<0?(report.range.from?report.range.from+'T00:00:00.000Z':''):report.events[index].at;
 if(until)for(const entry of report.ownerEvents)if(entry.at<=until&&(!report.range.from||entry.at>=report.range.from+'T00:00:00.000Z'))owners[entry.territoryId]=jsonCopy(entry.attacker);
 return {index,total:report.events.length,event:index<0?null:report.events[index],owners};
}
const csvCell=value=>{let x=String(value??'');if(/^[\s\x00-\x1f]*[=+@-]/.test(x))x="'"+x;return '"'+x.replaceAll('"','""')+'"';};
export function tacticalAnalyticsCsv(report){
 const rows=[['Дата','Категория','Событие','Действие','Территория','Победитель','Награда'],...report.events.map(x=>[x.at,x.category,x.title,x.kind,x.territoryName,x.winner,x.reward])];
 return '\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
/** Side-by-side facts vs model estimates, deliberately not a "win predictor". */
export function tacticalSimulationContext(report,simulationId){
 const run=report.simulations.find(x=>x.id===simulationId);if(!run)throw Error('Сохранённая симуляция отсутствует в профиле');
 return {title:run.title,planTitle:run.plan.state.title,seed:run.settings.seed,modelDurationMinutes:run.result.primary.durationMinutes,modelDistancePixels:run.result.primary.totalDistancePixels,modelConflicts:run.result.primary.conflictCount,
  observedCaptures:report.stats.captures,observedAirdrops:report.stats.airdrops,observedClaims:report.stats.claims,hasObservedMovement:false};
}
