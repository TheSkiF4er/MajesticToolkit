/** Tactical Analytics & Replay 2.2.8: recorded RP events and opt-in model comparison. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {api} from '../lib/browser.mjs';
import {listCrime} from '../lib/crime-store.mjs';
import {listFamilies} from '../lib/family-store.mjs';
import {listOrganizations} from '../lib/organization-store.mjs';
import {listAirdrops} from '../lib/tactical-airdrop-store.mjs';
import {listTacticalSimulations} from '../lib/tactical-simulation-store.mjs';
import {getTacticalMap} from '../lib/tactical-map-store.mjs';
import {territoryOwnerColor} from '../lib/tactical-territory-core.mjs';
import {buildTacticalAnalytics,tacticalReplayFrame,cleanReplayRange,tacticalAnalyticsCsv,tacticalSimulationContext} from '../lib/tactical-analytics-core.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
const PREF_KEY='mtTacticalReplayPrefsV228';
const dateText=x=>x?new Date(x).toLocaleString('ru-RU',{timeZone:'UTC'}):'';
const num=x=>Number(x).toLocaleString('ru-RU',{maximumFractionDigits:2});
const button=(action,label,attrs='',variant='secondary')=>`<button type="button" class="button ${variant}" data-replay-action="${action}" ${attrs}>${e(label)}</button>`;
const validPid=x=>typeof x==='string'&&/^[\w-]{8,120}$/.test(x);
let mounted=null;
export function disposeTacticalAnalytics(){if(!mounted)return;mounted.live=false;if(mounted.timer)clearInterval(mounted.timer);if(mounted.imageUrl)URL.revokeObjectURL(mounted.imageUrl);mounted=null;}
function download(name,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function readPreferences(profileId){const data=(await api.storage.local.get(PREF_KEY))[PREF_KEY];const x=data&&typeof data==='object'&&!Array.isArray(data)?data[profileId]:null;try{return cleanReplayRange(x||{});}catch{return cleanReplayRange();}}
let preferencesQueue=Promise.resolve();
async function writePreferences(profileId,range){const task=preferencesQueue.then(async()=>{const data=(await api.storage.local.get(PREF_KEY))[PREF_KEY];const next=data&&typeof data==='object'&&!Array.isArray(data)?{...data}:{};next[profileId]=cleanReplayRange(range);await api.storage.local.set({[PREF_KEY]:next});});preferencesQueue=task.catch(()=>{});return task;}
export async function clearOrphanTacticalReplayPreferences(profileIds){const ids=new Set(profileIds.filter(validPid));const data=(await api.storage.local.get(PREF_KEY))[PREF_KEY];if(!data||typeof data!=='object')return;const next=Object.fromEntries(Object.entries(data).filter(([id])=>ids.has(id)));await api.storage.local.set({[PREF_KEY]:next});}
export async function mountTacticalAnalytics(root,state,feedback){
 disposeTacticalAnalytics();if(!root)return;
 const profileId=state.activeProfileId,life={live:true,timer:null,imageUrl:''};mounted=life;
 const active=()=>life.live&&mounted===life&&root.isConnected;
 let range=await readPreferences(profileId),report=null,crime=null,airdrops=null,map=null,image=null,step=-1,selectedSimulation='',busy=false;
 function stop(){if(life.timer)clearInterval(life.timer);life.timer=null;}
 function frame(){return tacticalReplayFrame(report,step);}
 function renderMap(){const canvas=root.querySelector('#tactical-replay-canvas');if(!canvas||!report)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const w=Math.max(300,Math.round(canvas.clientWidth||650)),h=320,dpr=Math.min(globalThis.devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#14253b';ctx.fillRect(0,0,w,h);
  if(!map){ctx.fillStyle='#e5ebf3';ctx.font='14px sans-serif';ctx.fillText('Загрузите карту для пространственного replay',16,35);return;}
  const meta=map.meta,scale=Math.min(w/meta.width,h/meta.height),left=(w-meta.width*scale)/2,top=(h-meta.height*scale)/2;
  if(image)ctx.drawImage(image,left,top,meta.width*scale,meta.height*scale);
  else{ctx.fillStyle='#2c4058';ctx.fillRect(left,top,meta.width*scale,meta.height*scale);}
  const ownership=frame().owners,features=new Map(meta.features.map(x=>[x.id,x]));
  for(const link of meta.territoryLinks){const polygon=features.get(link.featureId);if(!polygon||polygon.type!=='polygon')continue;
   const owner=ownership[link.territoryId]||{type:'none',id:''};ctx.beginPath();polygon.points.forEach((p,i)=>{const x=left+p.x*scale,y=top+p.y*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fillStyle=territoryOwnerColor(owner)+'88';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=territoryOwnerColor(owner);ctx.stroke();
  }
  for(const p of airdrops.points.filter(x=>x.profileId===profileId&&(!x.mapSha256||x.mapSha256===meta.sha256))){
   const x=left+p.x*meta.width*scale,y=top+p.y*meta.height*scale;ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fillStyle='#ffd18a';ctx.fill();ctx.strokeStyle='#182a39';ctx.stroke();
  }
  const current=frame().event;
  if(current?.category==='airdrop'&&current.point&&(!current.point.mapSha256||current.point.mapSha256===meta.sha256)){
   ctx.beginPath();ctx.arc(left+current.point.x*meta.width*scale,top+current.point.y*meta.height*scale,10,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#ffb84e';ctx.stroke();
  }
  if(selectedSimulation){const run=report.simulations.find(x=>x.id===selectedSimulation);if(run&&run.result.mapSha256===meta.sha256){
   const pts=new Map(run.plan.state.points.map(x=>[x.id,x]));ctx.setLineDash([7,5]);ctx.strokeStyle='#80ffcb';ctx.lineWidth=2;
   for(const route of run.plan.state.routes){ctx.beginPath();route.pointIds.forEach((id,i)=>{const p=pts.get(id);if(!p)return;const x=left+p.x*meta.width*scale,y=top+p.y*meta.height*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}ctx.setLineDash([]);
  }}
 }
 function renderActivity(){const c=root.querySelector('#tactical-replay-activity-canvas');if(!c||!report)return;
  const ctx=c.getContext('2d');if(!ctx)return;const w=Math.max(280,Math.round(c.clientWidth||650)),h=190,dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#172a3d';ctx.fillRect(0,0,w,h);
  const items=report.trend;if(!items.length){ctx.fillStyle='#dde7f2';ctx.font='13px sans-serif';ctx.fillText('Нет событий для графика',16,32);return;}
  const bins=items.length>60?Array.from({length:60},(_,i)=>items.slice(Math.floor(i*items.length/60),Math.floor((i+1)*items.length/60))):items.map(x=>[x]);
  const totals=bins.map(list=>list.reduce((sum,x)=>sum+x.captures+x.battles+x.airdrops+x.claims,0)),max=Math.max(1,...totals),gap=3,padding=20,usable=w-2*padding,barWidth=usable/bins.length;
  ctx.strokeStyle='#7a90a8';ctx.beginPath();ctx.moveTo(padding,h-24);ctx.lineTo(w-padding,h-24);ctx.stroke();
  const colors=[['captures','#64b7fd'],['battles','#c4a6ed'],['airdrops','#f6bc68'],['claims','#68dcc4']];
  bins.forEach((list,i)=>{let y=h-25;for(const [key,color] of colors){const count=list.reduce((n,x)=>n+x[key],0),bh=count/max*(h-47);if(!bh)continue;y-=bh;ctx.fillStyle=color;ctx.fillRect(padding+i*barWidth,y,Math.max(1,barWidth-gap),bh);}});
  ctx.fillStyle='#dce7f4';ctx.font='11px sans-serif';ctx.fillText(items[0].date,padding,h-7);const last=items.at(-1).date,measure=ctx.measureText(last).width;ctx.fillText(last,w-padding-measure,h-7);
 }
 function updateStep(){if(!report||!active())return;const current=frame().event;
  const label=root.querySelector('#tactical-replay-step-label');if(label)label.textContent=current?`${step+1}/${report.events.length} · ${dateText(current.at)} · ${current.title} (${current.kind})`:`Начальная известная конфигурация · 0/${report.events.length}`;
  const slider=root.querySelector('#tactical-replay-slider');if(slider)slider.value=String(step+1);
  const owners=root.querySelector('#tactical-replay-owner-list');if(owners){const snapshot=frame().owners;owners.textContent=report.territories.map(t=>{const owner=snapshot[t.id],key=owner?.type&&owner.type!=='none'?`${owner.type}:${owner.id}`:'';return `${t.name}: ${report.groupNames[key]||'Без владельца'}`;}).join(' · ')||'Территории отсутствуют';}
  renderMap();
 }
 function view(){if(!active()||!report)return;
  const stats=report.stats,sim=selectedSimulation?report.simulations.find(x=>x.id===selectedSimulation):null;
  const comparison=sim?tacticalSimulationContext(report,sim.id):null;
  const sum=`<div class="economy-stats">${[['Капты',stats.captures],['Другие RP-события',stats.battles],['Аирдропы завершены',stats.airdrops],['Награды получены',stats.claims],['Отмены',stats.cancellations],['K/D',stats.deaths?num(stats.kills/stats.deaths):stats.kills?'∞':'0'],['Урон',num(stats.damage)]].map(([n,v])=>`<div><small>${e(n)}</small><strong>${e(String(v))}</strong></div>`).join('')}</div>`;
  const form=`<form id="tactical-replay-filter" class="row"><label class="field">С даты<input type="date" name="from" value="${e(range.from)}"></label><label class="field">По дату<input type="date" name="to" value="${e(range.to)}"></label><label class="field">Тип<select name="category">${[['all','Все'],['capture','Капты'],['battle','Бои'],['rp','RP-события'],['airdrop','Аирдропы']].map(([key,label])=>`<option value="${key}" ${range.category===key?'selected':''}>${label}</option>`).join('')}</select></label><button class="button primary" type="submit">Применить</button>${button('reset','Сбросить')}</form>`;
  const list=report.events.slice(Math.max(0,step-5),Math.min(report.events.length,Math.max(14,step+10)));
  const events=`<div class="economy-list">${list.map(x=>`<article class="economy-hit"><div><strong>${e(x.title)}</strong><p class="subtle">${e(x.date)} · ${e(x.category)} · ${e(x.kind)}${x.territoryName?' · '+e(x.territoryName):''}</p></div>${button('jump','Перейти',`data-index="${report.events.indexOf(x)}"`)}</article>`).join('')||'<p class="subtle">Нет событий за выбранный период.</p>'}</div>`;
  const groups=`<div class="table-wrap"><table><thead><tr><th>Семья / организация</th><th>События</th><th>Победы</th><th>Поражения</th><th>K/D</th><th>Урон</th></tr></thead><tbody>${report.groups.slice(0,30).map(x=>`<tr><td>${e(x.name)}</td><td>${x.events}</td><td>${x.wins}</td><td>${x.losses}</td><td>${x.deaths?num(x.kills/x.deaths):x.kills?'∞':'0'}</td><td>${num(x.damage)}</td></tr>`).join('')||'<tr><td colspan="6">Нет завершённых противостояний.</td></tr>'}</tbody></table></div>`;
  const players=`<div class="table-wrap"><table><thead><tr><th>Игрок</th><th>Группа</th><th>События</th><th>K/D</th><th>Урон</th></tr></thead><tbody>${report.players.slice(0,50).map(x=>`<tr><td>${e(x.player)}</td><td>${e(x.group)}</td><td>${x.events}</td><td>${x.deaths?num(x.kills/x.deaths):x.kills?'∞':'0'}</td><td>${num(x.damage)}</td></tr>`).join('')||'<tr><td colspan="5">Нет статистики участников.</td></tr>'}</tbody></table></div>`;
  const daily=`<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Капты</th><th>События</th><th>Аирдропы</th><th>Получения</th></tr></thead><tbody>${report.trend.map(x=>`<tr><td>${e(x.date)}</td><td>${x.captures}</td><td>${x.battles}</td><td>${x.airdrops}</td><td>${x.claims}</td></tr>`).join('')||'<tr><td colspan="5">Нет записей.</td></tr>'}</tbody></table></div>`;
  replaceHtml(root,`<div class="stack tactical-analytics-workspace"><section class="card stack"><div class="row spread"><div><h3>Tactical Analytics & Replay · 2.2.8</h3><p class="subtle">Факты из Crime & Territory и Airdrop Operations. Нет серверной телеметрии и выдуманных перемещений.</p></div><div class="row">${button('reload','Обновить')}${button('export-csv','CSV')}${button('export-json','JSON')}</div></div>${form}${sum}</section><div class="tactical-plan-grid"><section class="card stack"><h3>Воспроизведение (${report.events.length} шагов)</h3><div id="tactical-replay-canvas-host"></div><div class="row">${button('previous','Назад')}${button('play',life.timer?'Пауза':'Воспроизвести')}${button('next','Вперёд')}</div><label class="field">Положение в истории<input id="tactical-replay-slider" type="range" min="0" max="${report.events.length}" value="${step+1}"></label><p id="tactical-replay-step-label" class="subtle"></p><p id="tactical-replay-owner-list" class="subtle"></p><p class="subtle">Цвет полигона — владелец по записи каптов. Жёлтые точки — места аирдропов; зелёные штрихи — только модельный маршрут.</p></section><section class="card stack"><h3>Хронология событий</h3>${events}</section></div><section class="card stack"><h3>Статистика групп</h3>${groups}</section><section class="card stack"><h3>Игроки</h3>${players}</section><section class="card stack"><h3>Динамика по дням</h3><p class="subtle">Капты · RP-события · завершения и получения аирдропов</p><div id="tactical-replay-activity-host"></div>${daily}</section><section class="card stack"><h3>Сохранённые симуляции и зарегистрированные результаты</h3><label class="field">Модельный сценарий<select id="tactical-replay-model"><option value="">Без сравнения</option>${report.simulations.map(x=>`<option value="${e(x.id)}" ${x.id===selectedSimulation?'selected':''}>${e(x.title)}</option>`).join('')}</select></label>${comparison?`<div class="economy-stats"><div><small>Расчётное время маршрутов</small><strong>${num(comparison.modelDurationMinutes)} мин</strong></div><div><small>Расчётное расстояние</small><strong>${num(comparison.modelDistancePixels)} px</strong></div><div><small>Модельные пересечения</small><strong>${comparison.modelConflicts}</strong></div><div><small>Фактические капты в периоде</small><strong>${comparison.observedCaptures}</strong></div><div><small>Завершённые аирдропы</small><strong>${comparison.observedAirdrops}</strong></div></div><p class="subtle">Это сопоставление разных типов сведений, а не точная оценка ошибки модели: реальные маршруты и время движения не записывались.</p>`:'<p class="subtle">Выберите сохранённую симуляцию для параллельного просмотра расчётных и фактических показателей.</p>'}</section></div>`);
  const host=root.querySelector('#tactical-replay-canvas-host');if(host){const c=document.createElement('canvas');c.id='tactical-replay-canvas';c.style.width='100%';c.style.height='320px';c.setAttribute('role','img');c.setAttribute('aria-label','Историческая карта владения и точки аирдропов');host.append(c);}const chartHost=root.querySelector('#tactical-replay-activity-host');if(chartHost){const chart=document.createElement('canvas');chart.id='tactical-replay-activity-canvas';chart.style.width='100%';chart.style.height='190px';chart.setAttribute('role','img');chart.setAttribute('aria-label','Динамика записанных тактических событий');chartHost.append(chart);}updateStep();renderActivity();
 }
 async function reload(){const [c,a,f,o,s]=await Promise.all([listCrime(),listAirdrops(),listFamilies(),listOrganizations(),listTacticalSimulations(profileId)]);if(!active())return;
  crime=c;airdrops=a;report=buildTacticalAnalytics({territories:c.territories,operations:c.operations,airdropPoints:a.points,airdropEvents:a.events,families:f,organizations:o,simulations:s},profileId,range);
  if(!report.simulations.some(x=>x.id===selectedSimulation))selectedSimulation='';step=report.events.length-1;
  try{const found=await getTacticalMap(profileId);if(map?.meta.sha256!==found?.meta.sha256){if(life.imageUrl)URL.revokeObjectURL(life.imageUrl);life.imageUrl='';image=null;}map=found;
   if(map&&!image){life.imageUrl=URL.createObjectURL(map.blob);const pic=new Image();pic.src=life.imageUrl;await pic.decode();image=pic;}
  }catch(error){map=null;image=null;feedback('Карта недоступна: '+error.message,true);}
  if(active())view();
 }
 const safely=async(fn)=>{if(busy)return;busy=true;try{await fn();}catch(error){if(active())feedback(error.message,true);}finally{busy=false;}};
 root.addEventListener('submit',event=>{if(event.target.id!=='tactical-replay-filter')return;event.preventDefault();const form=event.target;void safely(async()=>{const next=cleanReplayRange({from:form.elements.namedItem('from').value,to:form.elements.namedItem('to').value,category:form.elements.namedItem('category').value});range=next;await writePreferences(profileId,next);stop();await reload();});});
 root.addEventListener('input',event=>{if(event.target.id==='tactical-replay-slider'&&report){stop();step=Number(event.target.value)-1;updateStep();}});
 root.addEventListener('change',event=>{if(event.target.id==='tactical-replay-model'){selectedSimulation=event.target.value;view();}});
 root.addEventListener('click',event=>{const el=event.target.closest('button[data-replay-action]');if(!el||!active())return;const action=el.dataset.replayAction;
  if(action==='reset'){void safely(async()=>{range=cleanReplayRange();await writePreferences(profileId,range);stop();await reload();});return;}
  if(action==='reload'){void safely(async()=>{stop();await reload();feedback('Тактическая история обновлена');});return;}
  if(action==='export-csv'&&report){download(`tactical-analytics-${profileId}.csv`,tacticalAnalyticsCsv(report),'text/csv;charset=utf-8');return;}
  if(action==='export-json'&&report){download(`tactical-analytics-${profileId}.json`,JSON.stringify({format:'majestic-tactical-analytics',version:1,profileId,exportedAt:new Date().toISOString(),range:report.range,events:report.events,stats:report.stats,trend:report.trend,groups:report.groups},null,2),'application/json');return;}
  if(!report)return;
  if(action==='previous'){stop();step=Math.max(-1,step-1);updateStep();return;}
  if(action==='next'){stop();step=Math.min(report.events.length-1,step+1);updateStep();return;}
  if(action==='jump'){stop();step=Number(el.dataset.index);updateStep();return;}
  if(action==='play'){
   if(life.timer){stop();view();return;}
   if(!report.events.length)return;
   if(step>=report.events.length-1)step=-1;
   life.timer=setInterval(()=>{if(!active()){stop();return;}step++;if(step>=report.events.length-1){stop();view();return;}updateStep();},850);
   view();
  }
 });
 try{await reload();}catch(error){if(active()){feedback(error.message,true);replaceHtml(root,`<section class="card stack"><h3>Аналитика недоступна</h3><p>${e(error.message)}</p>${button('reload','Повторить')}</section>`);}}
}
