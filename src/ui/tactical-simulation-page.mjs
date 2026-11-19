/** Interactive local RP simulations with snapshot-based replay and variant comparison. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {listTacticalPlans} from '../lib/tactical-planning-store.mjs';
import {listTacticalSimulations,addTacticalSimulation,deleteTacticalSimulation,compareSavedSimulations,exportTacticalSimulations} from '../lib/tactical-simulation-store.mjs';
import {getTacticalMap} from '../lib/tactical-map-store.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
let mounted=null;
const btn=(act,title,attrs='',variant='secondary')=>`<button type="button" class="button ${variant}" data-sim-action="${act}" ${attrs}>${e(title)}</button>`;
const number=(v,digits=1)=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:digits});
function download(filename,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function disposeTacticalSimulations(){if(mounted){mounted.live=false;mounted.observer?.disconnect();if(mounted.url)URL.revokeObjectURL(mounted.url);mounted=null;}}
export async function mountTacticalSimulations(root,state,feedback){
 disposeTacticalSimulations();if(!root)return;
 const pid=state.activeProfileId,life={live:true,url:'',observer:null};mounted=life;
 const active=()=>life.live&&mounted===life&&root.isConnected;
 let plans=[],runs=[],map=null,image=null,selectedId='',compareId='',busy=false,timeCursor=0;
 const chosen=()=>runs.find(x=>x.id===selectedId);
 const positionOnRoute=(run,route,minute)=>{
  const original=run.plan.state.routes.find(x=>x.id===route.routeId),points=new Map(run.plan.state.points.map(x=>[x.id,x]));
  if(!original||minute<route.startedMinute)return null;
  const ids=original.pointIds,arrivals=route.arrivals,wait=run.settings.waypointWaitMinutes;
  for(let i=1;i<ids.length;i++){
   const previous=points.get(ids[i-1]),next=points.get(ids[i]);
   if(!previous||!next)return null;
   const moveAt=arrivals[i-1].minute+(i===1?0:wait),arrived=arrivals[i].minute;
   if(minute<=moveAt)return previous;
   if(minute<=arrived){const fraction=arrived>moveAt?Math.max(0,Math.min(1,(minute-moveAt)/(arrived-moveAt))):1;return {x:previous.x+(next.x-previous.x)*fraction,y:previous.y+(next.y-previous.y)*fraction};}
  }
  return points.get(ids.at(-1))||null;
 };
 function chart(){const canvas=root.querySelector('#tactical-sim-canvas'),record=chosen();if(!canvas||!record)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;const w=Math.max(300,Math.round(canvas.clientWidth||650)),h=Math.max(220,Math.round(canvas.clientHeight||380)),ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#152238';ctx.fillRect(0,0,w,h);
  const s=record.plan.state,dim=record.map,fit=Math.min(w/dim.width,h/dim.height),dw=dim.width*fit,dh=dim.height*fit,l=(w-dw)/2,t=(h-dh)/2;
  if(image&&map?.meta.sha256===s.mapSha256)ctx.drawImage(image,l,t,dw,dh);else{ctx.fillStyle='#233957';ctx.fillRect(l,t,dw,dh);}
  const pts=new Map(s.points.map(p=>[p.id,p]));
  const colors=['#46dbc4','#f2b35e','#d6a3ff','#9ec9ff','#e8e989','#ffa5b3'];
  record.result.primary.routes.forEach((r,i)=>{const orig=s.routes.find(x=>x.id===r.routeId);if(!orig)return;
   ctx.beginPath();orig.pointIds.forEach((id,index)=>{const p=pts.get(id);if(!p)return;const x=l+p.x*dw,y=t+p.y*dh;if(index)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=3;ctx.stroke();
   for(const id of orig.pointIds){const p=pts.get(id);if(!p)continue;const x=l+p.x*dw,y=t+p.y*dh;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=colors[i%colors.length];ctx.fill();}
   const at=positionOnRoute(record,r,timeCursor);if(at){ctx.beginPath();ctx.arc(l+at.x*dw,t+at.y*dh,9,0,Math.PI*2);ctx.fillStyle=colors[i%colors.length];ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#10192b';ctx.stroke();ctx.font='bold 12px sans-serif';ctx.fillStyle='#fff';ctx.fillText(r.name,l+at.x*dw+13,t+at.y*dh-12);}
  });
  for(const conflict of record.result.primary.conflicts){if(Math.abs(timeCursor-conflict.minute)>1)continue;
   const a=record.result.primary.routes.find(x=>x.routeId===conflict.routeA),b=record.result.primary.routes.find(x=>x.routeId===conflict.routeB);
   if(!a||!b)continue;const pa=positionOnRoute(record,a,conflict.minute),pb=positionOnRoute(record,b,conflict.minute);if(!pa||!pb)continue;
   const x=l+(pa.x+pb.x)*dw/2,y=t+(pa.y+pb.y)*dh/2;ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.strokeStyle='#ff5252';ctx.lineWidth=3;ctx.stroke();
  }
 }
 function view(){if(!active())return;const chosenRun=chosen(),res=chosenRun?.result,first=res?.primary;
  const form=`<section class="card stack"><h3>Новая симуляция</h3><p class="subtle">Модель движения по маршрутам в пикселях карты и условных минутах. Не предсказывает исход настоящего капта.</p><form id="tactical-simulation-form" class="stack"><label class="field">Название<input name="title" maxlength="120" required value="Тест маршрутов"></label><label class="field">Исходный тактический план<select name="planId" required><option value="">Выберите план</option>${plans.map(x=>`<option value="${e(x.id)}">${e(x.state.title)} · ${x.state.routes.length} маршрутов</option>`).join('')}</select></label><div class="row"><label class="field">Начало (мин)<input name="departureMinutes" type="number" min="0" max="240" step="1" value="0" required></label><label class="field">Скорость ×<input name="speedMultiplier" type="number" min="0.1" max="5" step="0.1" value="1" required></label><label class="field">Остановка в точках (мин)<input name="waypointWaitMinutes" type="number" min="0" max="30" step="0.5" value="0" required></label></div><div class="row"><label class="field">Радиус пересечения (px)<input name="collisionRadiusPixels" type="number" min="0" max="200" step="1" value="12" required></label><label class="field">Разброс скорости (0–0.5)<input name="speedVariation" type="number" min="0" max="0.5" step="0.05" value="0" required></label><label class="field">Seed<input name="seed" type="number" min="0" max="4294967295" step="1" value="12345" required></label><label class="field">Прогонов (1–80)<input name="iterations" type="number" min="1" max="80" step="1" value="1" required></label></div><button class="button primary" type="submit" ${plans.length?'':'disabled'}>Запустить и сохранить</button></form></section>`;
  const listing=`<section class="card stack"><div class="row spread"><h3>Сохранённые сценарии (${runs.length})</h3>${btn('export-all','Экспорт JSON')}</div><div class="economy-list">${runs.map(x=>`<article class="economy-hit"><div><strong>${e(x.title)}</strong><p class="subtle">${e(x.plan.state.title)} · ${new Date(x.createdAt).toLocaleString('ru-RU')} · ${number(x.result.primary.durationMinutes)} мин · ${x.result.primary.conflictCount} пересечений</p></div><div class="row">${btn('select','Результат',`data-id="${e(x.id)}"`,x.id===selectedId?'primary':'secondary')}${btn('delete','Удалить',`data-id="${e(x.id)}"`,'danger')}</div></article>`).join('')||'<p class="subtle">Запусков пока нет.</p>'}</div></section>`;
  let detail='';if(chosenRun){const stat=res.statistics,available=runs.filter(x=>x.id!==selectedId&&x.result.mapSha256===res.mapSha256);
   const timeline=first.routes.map(r=>`<tr><td>${e(r.name)}</td><td>${number(r.distancePixels)} px</td><td>${number(r.startedMinute)}</td><td>${number(r.finishedMinute)}</td><td>${number(r.durationMinutes)} мин</td></tr>`).join('');
   const conflict=first.conflicts.map(c=>{const a=first.routes.find(x=>x.routeId===c.routeA),b=first.routes.find(x=>x.routeId===c.routeB);return `<li>${e(a?.name||c.routeA)} / ${e(b?.name||c.routeB)} · мин ${number(c.minute)} · ${number(c.distancePixels)} px</li>`;}).join('');
   const diff=compareId&&available.find(x=>x.id===compareId);
   const comparison=diff?`<div class="card stack"><strong>Сравнение с ${e(diff.title)}</strong><p>Время: ${number(first.durationMinutes)} → ${number(diff.result.primary.durationMinutes)} мин (Δ ${number(diff.result.primary.durationMinutes-first.durationMinutes)})</p><p>Дистанция: ${number(first.totalDistancePixels)} → ${number(diff.result.primary.totalDistancePixels)} px</p><p>Пересечения: ${first.conflictCount} → ${diff.result.primary.conflictCount}</p><p class="subtle">Сравнение двух сохранённых запусков, а не вероятностей победы.</p></div>`:'';
   detail=`<section class="card stack"><div class="row spread"><h3>${e(chosenRun.title)}</h3><div class="row">${btn('export-one','Экспорт результата JSON')}${btn('export-csv','Таймлайн CSV')}</div></div><p class="subtle">План: ${e(chosenRun.plan.state.title)}, версия ${chosenRun.plan.history.length} · снимок ${e(res.mapSha256.slice(0,12))}… · seed ${res.settings.seed} · разброс ${number(res.settings.speedVariation*100,0)}%</p><div class="economy-stats"><div><small>Длительность</small><strong>${number(first.durationMinutes)} мин</strong></div><div><small>Дистанция</small><strong>${number(first.totalDistancePixels)} px</strong></div><div><small>Пересечения маршрутов</small><strong>${first.conflictCount}</strong></div><div><small>Прогонов</small><strong>${stat.runs}</strong></div></div><div id="tactical-simulation-canvas-host"></div><label class="field">Время симуляции: <output id="tactical-sim-time-label">${number(timeCursor)} мин</output><input id="tactical-sim-time" type="range" min="0" max="${Math.max(1,Math.ceil(first.durationMinutes))}" step="0.5" value="${Math.min(timeCursor,Math.ceil(first.durationMinutes))}"></label><p class="subtle">Отображаются зафиксированные маршруты исходного плана; цвета различают пути. Без автоматического управления игровыми персонажами.</p><h4>Временная шкала маршрутов</h4><div class="table-wrap"><table><thead><tr><th>Маршрут</th><th>Длина</th><th>Старт</th><th>Финиш</th><th>В пути</th></tr></thead><tbody>${timeline}</tbody></table></div><p>Диапазон длительности P10 / медиана / P90: ${number(stat.durationP10)} / ${number(stat.durationMedian)} / ${number(stat.durationP90)} мин. Прогонов с пересечениями: ${stat.runsWithConflicts} из ${stat.runs}.</p><h4>Возможные пространственно-временные пересечения (${first.conflictCount})</h4>${conflict?`<ul>${conflict}</ul>`:'<p class="subtle">Пересечений при заданном радиусе не обнаружено.</p>'}<label class="field">Сравнить с сохранённым сценарием<select id="tactical-sim-compare"><option value="">Не выбрано</option>${available.map(x=>`<option value="${e(x.id)}" ${x.id===compareId?'selected':''}>${e(x.title)}</option>`).join('')}</select></label>${comparison}<details><summary>Модель и ограничения</summary><p>Участники перемещаются линейно между точками маршрута. Скорости заданы вручную в пикселях/мин; разброс генерируется детерминированным PRNG. Пересечения вычисляются по минимальному расстоянию при одновременном движении. Модель не учитывает препятствия, дороги, игровые механики или противодействие.</p></details></section>`;
  }
  replaceHtml(root,`<div class="stack tactical-simulation-workspace"><section class="card stack"><div class="row spread"><div><h3>Tactical Simulation Engine · 2.2.7</h3><p class="subtle">Сравнение альтернативных планов и воспроизводимые расчёты. История каптов не изменяется.</p></div>${btn('reload','Обновить')}</div></section><div class="tactical-plan-grid"><div class="stack">${form}${listing}</div><div class="stack">${detail||'<section class="card"><p class="subtle">Выберите результат, чтобы увидеть таймлайн, расчёты и сравнение.</p></section>'}</div></div></div>`);
  const host=root.querySelector('#tactical-simulation-canvas-host');if(host){const c=document.createElement('canvas');c.id='tactical-sim-canvas';c.setAttribute('aria-label','Маршруты сохранённой симуляции');c.style.width='100%';c.style.height='330px';host.append(c);}chart();
 }
 async function refresh(){[plans,runs]=await Promise.all([listTacticalPlans(pid),listTacticalSimulations(pid)]);if(!runs.some(x=>x.id===selectedId))selectedId=runs[0]?.id||'';if(!active())return;view();}
 async function perform(fn,success){if(busy)return;busy=true;try{await fn();if(!active())return;await refresh();feedback(success);}catch(error){feedback(error.message,true);}finally{busy=false;}}
 root.addEventListener('submit',event=>{if(event.target.id!=='tactical-simulation-form')return;event.preventDefault();const el=event.target.elements,v=name=>el.namedItem(name).value;void perform(async()=>{const run=await addTacticalSimulation(pid,{planId:v('planId'),title:v('title'),settings:{departureMinutes:Number(v('departureMinutes')),speedMultiplier:Number(v('speedMultiplier')),waypointWaitMinutes:Number(v('waypointWaitMinutes')),collisionRadiusPixels:Number(v('collisionRadiusPixels')),speedVariation:Number(v('speedVariation')),seed:Number(v('seed')),iterations:Number(v('iterations'))}});selectedId=run.id;compareId='';timeCursor=0;},'Симуляция выполнена и сохранена');});
 root.addEventListener('input',ev=>{if(ev.target.id==='tactical-sim-time'){timeCursor=Number(ev.target.value);const output=root.querySelector('#tactical-sim-time-label');if(output)output.textContent=number(timeCursor)+' мин';chart();}});
 root.addEventListener('change',ev=>{if(ev.target.id==='tactical-sim-compare'){compareId=ev.target.value;view();}});
 root.addEventListener('click',ev=>{const b=ev.target.closest('button[data-sim-action]');if(!b||!active())return;const action=b.dataset.simAction,id=b.dataset.id;
  if(action==='select'){selectedId=id;compareId='';timeCursor=0;view();return;}
  if(action==='reload'){void perform(async()=>{map=await getTacticalMap(pid);},'Сценарии обновлены');return;}
  if(action==='delete'){if(!confirm('Удалить сохранённый результат симуляции?'))return;void perform(()=>deleteTacticalSimulation(pid,id),'Симуляция удалена');return;}
  if(action==='export-all'){void exportTacticalSimulations(pid).then(x=>download(`tactical-simulations-${pid}.json`,JSON.stringify(x,null,2),'application/json')).catch(error=>feedback(error.message,true));return;}
  const row=chosen();if(!row)return;
  if(action==='export-one')download(`tactical-simulation-${row.id}.json`,JSON.stringify(row,null,2),'application/json');
  if(action==='export-csv'){const head='route;distance_px;start_min;finish_min;duration_min',body=row.result.primary.routes.map(x=>[x.name,x.distancePixels,x.startedMinute,x.finishedMinute,x.durationMinutes].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');download(`tactical-timeline-${row.id}.csv`,head+'\n'+body,'text/csv;charset=utf-8');}
 });
 try{map=await getTacticalMap(pid,{verify:false});if(map){life.url=URL.createObjectURL(map.blob);image=new Image();image.src=life.url;await image.decode();}if(!active())return;await refresh();if(typeof ResizeObserver==='function'){life.observer=new ResizeObserver(()=>chart());life.observer.observe(root);}}
 catch(error){if(active()){feedback(error.message,true);await refresh();}}
}
