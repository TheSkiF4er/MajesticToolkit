/** Airdrop Operations 2.2.4: editable spawn locations, live timers, participants and audited status changes. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {getTacticalMap} from '../lib/tactical-map-store.mjs';
import {listAirdrops,addAirdropPoint,updateAirdropPoint,addAirdropEvent,updateAirdropEvent,importAirdrops} from '../lib/tactical-airdrop-store.mjs';
import {airdropTimer,airdropCsv,airdropPackage} from '../lib/tactical-airdrop-core.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
const statusLabels={planned:'Запланирован',active:'Активен',claimed:'Получен',completed:'Завершён',cancelled:'Отменён'};
const clock=iso=>new Date(iso).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'});
const localTime=iso=>{const d=iso?new Date(iso):new Date(Date.now()+300000);const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
const isoTime=value=>{if(!value||!Number.isFinite(new Date(value).getTime()))throw Error('Укажите дату и время аирдропа');return new Date(value).toISOString();};
const btn=(action,label,attrs='',cls='secondary')=>`<button type="button" class="button ${cls}" data-airdrop-action="${action}" ${attrs}>${e(label)}</button>`;
const options=(rows,sel='')=>rows.map(x=>`<option value="${e(x.id)}" ${x.id===sel?'selected':''}>${e(x.name)}${x.archived?' (архив)':''}</option>`).join('');
const download=(name,data,mime)=>{const blob=new Blob([data],{type:mime}),url=URL.createObjectURL(blob);try{const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}};
let mounted=null;
export function disposeTacticalAirdrops(){if(mounted){mounted.dispose();mounted=null;}}
export async function mountTacticalAirdrops(root,state,feedback){
 disposeTacticalAirdrops();if(!root)return;
 const profileId=state.activeProfileId;
 const life={live:true,url:null,tick:null,searchTimer:null,observer:null,dispose(){this.live=false;if(this.tick)clearInterval(this.tick);if(this.searchTimer)clearTimeout(this.searchTimer);this.observer?.disconnect();if(this.url)URL.revokeObjectURL(this.url);}};
 mounted=life;const active=()=>life.live&&mounted===life&&root.isConnected;
 let rows={points:[],events:[]},map=null,img=null,selectedEvent='',selectedPoint='',pointEditing='',eventEditing='',filter='all',term='';
 const pickPoint=id=>rows.points.find(p=>p.id===id);
 const pickEvent=id=>rows.events.find(x=>x.id===id);
 const currentPoint=()=>pickPoint(pointEditing);
 const targetMapHash=()=>map?.meta.sha256??'';
 const validMapPoint=p=>!p.mapSha256||p.mapSha256===targetMapHash();
 async function reload(){rows=await listAirdrops(profileId);if(!active())return;selectedPoint=pickPoint(selectedPoint)?selectedPoint:'';selectedEvent=pickEvent(selectedEvent)?selectedEvent:'';}
 async function drawMap(){
  const canvas=root.querySelector('#airdrop-map-canvas');if(!canvas||!map||!img||!active())return;
  const box=canvas.getBoundingClientRect(),width=Math.max(100,box.width||600),height=Math.max(100,box.height||340),ratio=Math.min(window.devicePixelRatio||1,3);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#172537';ctx.fillRect(0,0,width,height);
  const scale=Math.min(width/map.meta.width,height/map.meta.height),dw=map.meta.width*scale,dh=map.meta.height*scale,l=(width-dw)/2,t=(height-dh)/2;
  ctx.drawImage(img,l,t,dw,dh);
  for(const [i,p] of rows.points.entries()){
   if(p.archived||!validMapPoint(p))continue;
   const x=l+p.x*dw,y=t+p.y*dh;ctx.beginPath();ctx.arc(x,y,selectedPoint===p.id?9:6,0,2*Math.PI);ctx.fillStyle=selectedPoint===p.id?'#f7c96b':'#39d5ed';ctx.fill();ctx.strokeStyle='#122234';ctx.lineWidth=2;ctx.stroke();
   ctx.font='12px sans-serif';ctx.fillStyle='white';ctx.fillText(String(i+1),x+10,y-7);
  }
  const p=selectedPoint&&pickPoint(selectedPoint);if(p&&validMapPoint(p)){const x=l+p.x*dw,y=t+p.y*dh;ctx.strokeStyle='#ffca63';ctx.lineWidth=2;ctx.strokeRect(x-12,y-12,24,24);}
  // Projection retained for pointer mapping (same fit as the drawn image).
  canvas._airdropViewport={l,t,dw,dh};
 }
 async function refresh({keepSelection=true}={}){
  if(!active())return;await reload();if(!active())return;
  const now=Date.now(),planned=rows.events.filter(x=>x.status==='planned').length,live=rows.events.filter(x=>x.status==='active').length,done=rows.events.filter(x=>x.status==='completed'||x.status==='claimed').length;
  const pointList=rows.points.filter(x=>!term||`${x.name} ${x.description}`.toLocaleLowerCase('ru').includes(term.toLocaleLowerCase('ru')));
  const events=rows.events.filter(x=>(filter==='all'||x.status===filter)&&(!term||`${x.title} ${pickPoint(x.pointId)?.name||''} ${x.participants.join(' ')}`.toLocaleLowerCase('ru').includes(term.toLocaleLowerCase('ru')))).sort((a,b)=>b.scheduledAt.localeCompare(a.scheduledAt));
  const point=currentPoint(),event=pickEvent(selectedEvent),canEdit=event?.status==='planned';
  const pointOptions=rows.points.filter(x=>!x.archived||x.id===point?.id);
  const mapNote=map?`${e(map.meta.name)} · ${map.meta.width} × ${map.meta.height}px · кликните для координат`:'Карта не загружена. Откройте вкладку «Карта» и добавьте изображение; координаты можно ввести вручную в долях 0–1.';
  const summary=`<div class="economy-stats"><div><small>Точки появления</small><strong>${rows.points.filter(p=>!p.archived).length}</strong></div><div><small>Запланировано</small><strong>${planned}</strong></div><div><small>Активно</small><strong>${live}</strong></div><div><small>Получено / завершено</small><strong>${done}</strong></div></div>`;
  const pointForm=`<form id="airdrop-point-form" class="stack"><h4>${point?'Редактировать точку':'Новая точка появления'}</h4><div class="row"><label class="field">Название<input name="name" maxlength="100" required value="${e(point?.name||'')}"></label><label class="field">Описание<input name="description" maxlength="500" value="${e(point?.description||'')}"></label></div><div class="row"><label class="field">X, доля изображения<input name="x" type="number" step="0.000001" min="0" max="1" required value="${point?.x??''}"></label><label class="field">Y, доля изображения<input name="y" type="number" step="0.000001" min="0" max="1" required value="${point?.y??''}"></label></div><p class="subtle">${point?'Место точки с историей событий перемещать нельзя.':'Нажмите на картографическую подложку для установки X/Y.'}</p><div class="row"><button class="button primary" type="submit">${point?'Сохранить изменения':'Создать точку'}</button>${point?btn('clear-point','Новая точка'):''}</div></form>`;
  const eventForm=`<form id="airdrop-event-form" class="stack"><h4>${canEdit&&eventEditing===event.id?'Редактировать аирдроп':'Запланировать аирдроп'}</h4><label class="field">Точка появления<select name="pointId" required><option value="">Выберите точку</option>${options(pointOptions.filter(x=>!x.archived),canEdit&&eventEditing===event?.id?event.pointId:selectedPoint)}</select></label><div class="row"><label class="field">Название<input name="title" maxlength="120" required value="${e(canEdit&&eventEditing===event?.id?event.title:'Аирдроп')}"></label><label class="field">Время появления<input name="scheduledAt" type="datetime-local" required value="${localTime(canEdit&&eventEditing===event?.id?event.scheduledAt:null)}"></label><label class="field">Длительность, мин<input name="durationMinutes" type="number" min="1" max="1440" required value="${canEdit&&eventEditing===event?.id?event.durationMinutes:30}"></label></div><label class="field">Описание<input name="notes" maxlength="1000" value="${e(canEdit&&eventEditing===event?.id?event.notes:'')}"></label><div class="row"><button type="submit" class="button primary">${canEdit&&eventEditing===event?.id?'Сохранить':'Создать событие'}</button>${eventEditing?btn('clear-event','Новое событие'):''}</div></form>`;
  const eventList=events.slice(0,120).map(x=>`<article class="economy-hit"><div><strong>${e(x.title)}</strong><small class="subtle">${e(pickPoint(x.pointId)?.name||'')} · ${clock(x.scheduledAt)}</small><p class="subtle">${e(statusLabels[x.status])} · ${x.durationMinutes} мин · ${x.participants.length} участников</p><span class="tag" data-airdrop-timer="${e(x.id)}"></span></div>${btn('choose-event','Открыть',`data-id="${e(x.id)}"`,x.id===selectedEvent?'primary':'secondary')}</article>`).join('')||'<p class="subtle">Нет аирдропов по выбранным условиям.</p>';
  const pointRows=pointList.map((p,i)=>`<article class="economy-hit"><div><strong>${e(p.name)}</strong><small class="subtle">${p.archived?'Архив · ':''}X ${(p.x*100).toFixed(2)}% / Y ${(p.y*100).toFixed(2)}%</small><p class="subtle">${e(p.description)} ${!validMapPoint(p)?'· подложка карты изменена':''}</p></div><div class="row">${btn('choose-point','Выбрать',`data-id="${e(p.id)}"`)}${btn('edit-point','Изменить',`data-id="${e(p.id)}"`)}${btn('archive-point',p.archived?'Восстановить':'Архив',`data-id="${e(p.id)}"`)}</div></article>`).join('')||'<p class="subtle">Точек появления пока нет.</p>';
  const detail=event?`<section class="card stack"><h4>${e(event.title)} · ${e(statusLabels[event.status])}</h4><p class="subtle">${e(pickPoint(event.pointId)?.name||'')} · ${clock(event.scheduledAt)} · ${event.durationMinutes} мин · ${e(event.notes)}</p><div class="row">${event.status==='planned'?btn('edit-event','Редактировать',`data-id="${e(event.id)}"`)+btn('event-start','Начать',`data-id="${e(event.id)}"`,'primary'):''}${event.status==='active'?btn('event-claim','Получен',`data-id="${e(event.id)}"`,'primary')+btn('event-finish','Завершить',`data-id="${e(event.id)}"`):''}${event.status==='claimed'?btn('event-finish','Завершить',`data-id="${e(event.id)}"`,'primary'):''}${['planned','active'].includes(event.status)?btn('event-cancel','Отменить',`data-id="${e(event.id)}"`,'danger'):''}</div><div class="row"><strong>Участники (${event.participants.length})</strong>${event.participants.map(p=>`<span class="tag">${e(p)} ${['planned','active'].includes(event.status)?btn('participant-remove','×',`data-name="${e(p)}" data-id="${e(event.id)}"`):''}</span>`).join('')}</div>${['planned','active'].includes(event.status)?`<form id="airdrop-participant-form" class="row"><input name="name" required maxlength="80" placeholder="Имя игрока"><button class="button secondary" type="submit">Добавить участника</button></form>`:''}${event.winner?`<p><strong>Получатель:</strong> ${e(event.winner)} · <strong>Награда:</strong> ${e(event.reward)}</p>`:''}${event.result?`<p><strong>Итог:</strong> ${e(event.result)}</p>`:''}<details><summary>История операций (${event.history.length})</summary><div class="stack">${event.history.map(h=>`<small class="subtle">${clock(h.at)} · ${e(h.kind)}${h.data.reason?' · '+e(h.data.reason):''}</small>`).join('')}</div></details></section>`:'';
  replaceHtml(root,`<div class="stack tactical-airdrops"><section class="card stack"><div class="row spread"><div><h3>Airdrop Operations · 2.2.4</h3><p class="subtle">Локальный журнал наблюдений и игровых событий. Таймеры строятся по введённому расписанию, а не по серверной телеметрии.</p></div>${btn('reload','Обновить')}</div>${summary}<div class="row"><label class="field">Поиск<input type="search" id="airdrop-search" value="${e(term)}" placeholder="Точка, игрок, событие"></label><label class="field">Статус<select id="airdrop-filter">${Object.entries({all:'Все',...statusLabels}).map(([k,v])=>`<option value="${k}" ${filter===k?'selected':''}>${e(v)}</option>`).join('')}</select></label></div><div class="row">${btn('export-json','Экспорт JSON')}${btn('export-csv','Экспорт CSV')}<label class="field">Импорт JSON (замена данных профиля)<input id="airdrop-import" type="file" accept=".json,application/json"></label></div></section><div class="tactical-airdrop-grid"><section class="card stack"><h4>Карта мест появления</h4><p class="subtle">${mapNote}</p>${map?'<div id="airdrop-map-host"></div>':''}${pointForm}<h4>Места появления (${pointList.length})</h4><div class="economy-list">${pointRows}</div></section><section class="card stack">${eventForm}<h4>События (${events.length})</h4><div class="economy-list">${eventList}</div>${detail}</section></div></div>`);
  const host=root.querySelector('#airdrop-map-host');if(host){const created=document.createElement('canvas');created.id='airdrop-map-canvas';created.tabIndex=0;created.setAttribute('aria-label','Выберите место появления аирдропа');host.append(created);}const canvas=root.querySelector('#airdrop-map-canvas');if(canvas){canvas.addEventListener('click',ev=>{const box=canvas.getBoundingClientRect(),v=canvas._airdropViewport;if(!v)return;const x=(ev.clientX-box.left-v.l)/v.dw,y=(ev.clientY-box.top-v.t)/v.dh;if(x<0||x>1||y<0||y>1)return;
   const form=root.querySelector('#airdrop-point-form');form.elements.namedItem('x').value=x.toFixed(6);form.elements.namedItem('y').value=y.toFixed(6);
   const near=rows.points.find(p=>!p.archived&&validMapPoint(p)&&Math.hypot(p.x-x,p.y-y)<.018);
   if(near){selectedPoint=near.id;root.querySelector('#airdrop-event-form [name="pointId"]').value=near.id;void drawMap();}
  });await drawMap();}
  updateTimers();
 }
 function updateTimers(){if(!active())return;for(const element of root.querySelectorAll('[data-airdrop-timer]')){const event=pickEvent(element.dataset.airdropTimer);if(!event)continue;const timer=airdropTimer(event),t=Math.abs(timer.seconds),h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;
  element.textContent=timer.phase==='upcoming'?`До появления ${h}ч ${m}м ${s}с`:timer.phase==='due'?'Время появления наступило':timer.phase==='active'?`До окончания ${h}ч ${m}м ${s}с`:timer.phase==='overdue'?`Время истекло ${h}ч ${m}м назад`:e(statusLabels[event.status]);}}
 async function run(job,message){try{await job();if(!active())return;await refresh();feedback(message);}catch(error){feedback(error.message,true);}}
 root.addEventListener('click',ev=>{const button=ev.target.closest('[data-airdrop-action]');if(!button||!active())return;
  const action=button.dataset.airdropAction,id=button.dataset.id;
  if(action==='reload'){void run(async()=>{map=await getTacticalMap(profileId);},'Данные аирдропов обновлены');return;}
  if(action==='choose-point'){selectedPoint=id;pointEditing='';void refresh();return;}
  if(action==='edit-point'){selectedPoint=id;pointEditing=id;void refresh();return;}
  if(action==='choose-event'){selectedEvent=id;eventEditing='';void refresh();return;}
  if(action==='edit-event'){selectedEvent=id;eventEditing=id;void refresh();return;}
  if(action==='clear-point'){selectedPoint='';pointEditing='';void refresh();return;}
  if(action==='clear-event'){eventEditing='';selectedEvent='';void refresh();return;}
  if(action==='archive-point'){const p=pickPoint(id);if(!p)return;void run(()=>updateAirdropPoint(id,profileId,'archive',{archived:!p.archived}),p.archived?'Точка восстановлена':'Точка архивирована');return;}
  if(action==='participant-remove'){void run(()=>updateAirdropEvent(id,profileId,'participant-remove',{name:button.dataset.name}),'Участник исключён');return;}
  if(action==='export-json'){download(`airdrop-${profileId}.json`,JSON.stringify(airdropPackage(rows.points,rows.events,profileId),null,2),'application/json');return;}
  if(action==='export-csv'){download(`airdrop-${profileId}.csv`,airdropCsv(rows.points,rows.events,profileId),'text/csv;charset=utf-8');return;}
  const data={};if(action==='event-claim'){const winner=prompt('Кто получил аирдроп?');if(winner===null)return;const reward=prompt('Награда (необязательно):')??'';data.winner=winner;data.reward=reward;}
  if(action==='event-cancel'){const reason=prompt('Причина отмены:');if(reason===null)return;data.reason=reason;}
  if(action==='event-finish'){const result=prompt('Итог события (необязательно):');if(result===null)return;data.result=result;}
  const kind={'event-start':'start','event-claim':'claim','event-finish':'finish','event-cancel':'cancel'}[action];if(kind)void run(()=>updateAirdropEvent(id,profileId,kind,data),'Статус события обновлён');
 });
 root.addEventListener('submit',ev=>{if(!['airdrop-point-form','airdrop-event-form','airdrop-participant-form'].includes(ev.target.id))return;ev.preventDefault();const form=ev.target,values=form.elements;
  if(form.id==='airdrop-point-form'){const coords={x:Number(values.namedItem('x').value),y:Number(values.namedItem('y').value)};
   const current=currentPoint(),fields={name:values.namedItem('name').value,description:values.namedItem('description').value,...coords,mapSha256:current?.mapSha256??targetMapHash()};
   void run(async()=>{const row=pointEditing?await updateAirdropPoint(pointEditing,profileId,'edit',fields):await addAirdropPoint(profileId,fields);selectedPoint=row.id;pointEditing='';},'Точка появления сохранена');
  }else if(form.id==='airdrop-event-form'){const fields={pointId:values.namedItem('pointId').value,title:values.namedItem('title').value,scheduledAt:values.namedItem('scheduledAt').value,durationMinutes:Number(values.namedItem('durationMinutes').value),notes:values.namedItem('notes').value};
   void run(async()=>{fields.scheduledAt=isoTime(fields.scheduledAt);const row=eventEditing?await updateAirdropEvent(eventEditing,profileId,'edit',fields):await addAirdropEvent(profileId,fields);selectedEvent=row.id;eventEditing='';},'Аирдроп сохранён');
  }else{void run(()=>updateAirdropEvent(selectedEvent,profileId,'participant-add',{name:values.namedItem('name').value}),'Участник добавлен');}
 });
 root.addEventListener('input',ev=>{if(ev.target.id==='airdrop-search'){term=ev.target.value;const pos=ev.target.selectionStart;clearTimeout(life.searchTimer);life.searchTimer=setTimeout(()=>{if(!active())return;void refresh().then(()=>{const field=root.querySelector('#airdrop-search');field?.focus();field?.setSelectionRange(Math.min(pos,field.value.length),Math.min(pos,field.value.length));}).catch(error=>feedback(error.message,true));},160);return;}});
 root.addEventListener('change',ev=>{if(ev.target.id==='airdrop-filter'){filter=ev.target.value;void refresh();}});
 root.addEventListener('change',async ev=>{if(ev.target.id!=='airdrop-import')return;const file=ev.target.files?.[0];if(!file)return;try{
  if(file.size>3*1024*1024)throw Error('Импорт превышает 3 МиБ');const obj=JSON.parse(await file.text());
  if(!confirm(`Заменить точки и события текущего RP-профиля данными из файла? Эта операция заменит ${rows.points.length} точек и ${rows.events.length} событий.`))return;
  await importAirdrops(profileId,obj);selectedPoint='';selectedEvent='';await refresh();feedback('Аирдропы импортированы');
 }catch(error){feedback(error.message,true);}finally{ev.target.value='';}});
 try{
  map=await getTacticalMap(profileId);if(map){life.url=URL.createObjectURL(map.blob);img=new Image();img.src=life.url;await img.decode();}
  if(!active())return;await refresh();
  if(!active())return;life.tick=setInterval(updateTimers,1000);
  if(typeof ResizeObserver==='function'&&map){life.observer=new ResizeObserver(()=>{void drawMap();});life.observer.observe(root);}
 }catch(error){if(active()){map=null;feedback('Аирдропы: '+error.message,true);await refresh();}}
}
