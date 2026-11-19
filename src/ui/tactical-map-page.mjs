/** Interactive offline Tactical Map 2.2.2, using a real decoded image with an origin-local binary store. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {getTacticalMap,saveTacticalMapImage,updateTacticalMap,removeTacticalMap} from '../lib/tactical-map-store.mjs';
import {MAP_LIMITS,cleanMapView,screenToMap,mapLayout,mapToWorld,solveMapCalibration,moveMap,zoomMapAt} from '../lib/tactical-map-core.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
let mounted=null;
const fixed=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
const actions=`<div class="row tactical-map-actions"><button class="button secondary" data-map-action="zoom-out" type="button" aria-label="Уменьшить">−</button><button class="button secondary" data-map-action="zoom-in" type="button" aria-label="Увеличить">+</button><button class="button secondary" data-map-action="fit" type="button">Вписать карту</button><button class="button secondary" data-map-action="fullscreen" type="button">На весь экран</button><span id="tactical-map-zoom" class="tag">100%</span></div>`;
const empty=`<section class="card stack"><h3>Интерактивная карта</h3><p class="subtle">Загрузите собственную подложку игрового мира — PNG, JPEG или WebP до 25 МиБ, не более 64 млн пикселей. Файл хранится только на этом устройстве, отдельно для каждого RP-профиля.</p><label class="field">Файл карты<input type="file" id="tactical-map-upload"></label></section>`;
function anchorHTML(anchors){return [0,1,2].map(i=>{
 const p=anchors[i];return `<div class="tactical-map-anchor"><button class="button secondary" type="button" data-map-action="anchor" data-index="${i}" aria-pressed="false">Точка ${i+1}</button><span class="subtle" id="map-anchor-pixel-${i}">${p?`${fixed(p.mapX)} / ${fixed(p.mapY)} px`:'Не установлена'}</span><label>Игровой X<input id="map-world-x-${i}" type="number" step="any" min="-1000000000" max="1000000000" value="${p?.worldX??''}"></label><label>Игровой Y<input id="map-world-y-${i}" type="number" step="any" min="-1000000000" max="1000000000" value="${p?.worldY??''}"></label></div>`;}).join('');}
function full(meta){return `<section class="card stack tactical-map-workspace"><div class="row spread"><div><h3>Интерактивная карта</h3><p class="subtle">${e(meta.name)} · ${meta.width}×${meta.height} px · ${fixed(meta.size/1048576)} МиБ · локальная подложка</p></div><span class="tag">Офлайн</span></div>${actions}<div class="tactical-map-viewport" id="tactical-map-viewport" role="group" aria-label="Интерактивная карта, перемещение и масштабирование"><div id="tactical-map-canvas-host"></div></div><div class="row spread"><output id="tactical-map-coordinates" aria-live="off">Укажите точку карты</output><span class="subtle">Колёсико / щипок: масштаб · перетаскивание: перемещение</span></div><details id="tactical-map-calibration"><summary>Калибровка игровых координат (3 точки)</summary><div class="stack"><p class="subtle">Выберите «Точка 1», нажмите на нужное место карты, укажите соответствующие игровые X и Y. Повторите для трёх непараллельных точек и сохраните. Без калибровки показываются только пиксели изображения.</p><div id="tactical-map-anchor-list" class="stack">${anchorHTML(meta.anchors)}</div><div class="row"><button type="button" class="button primary" data-map-action="save-anchors">Сохранить калибровку</button><button type="button" class="button secondary" data-map-action="clear-anchors">Сбросить точки</button><span id="tactical-calibration-status" class="subtle"></span></div></div></details><div class="row"><label class="field tactical-map-replace">Заменить подложку<input type="file" id="tactical-map-upload"></label><button type="button" class="button danger" data-map-action="delete">Удалить карту этого профиля</button></div><p class="subtle">Подложка и калибровка сохраняются в IndexedDB браузера. Они не входят в Backup v20; перенос картографических ресурсов запланирован для Backup v21.</p></section>`;}
export function disposeTacticalMap(){if(mounted){mounted.dispose();mounted=null;}}
export async function mountTacticalMap(root,state,feedback){
 disposeTacticalMap();if(!root)return;
 const profileId=state.activeProfileId;
 const life={live:true,url:null,observer:null,timeout:null,root,profileId,dispose(){if(this.timeout){clearTimeout(this.timeout);void this.flush?.().catch(()=>{});}this.live=false;this.observer?.disconnect();if(this.url)URL.revokeObjectURL(this.url);}};
 mounted=life;
 const active=()=>life.live&&mounted===life&&root.isConnected;
 try{
  let record=await getTacticalMap(profileId);
  if(!active())return;
  const show=async()=>{if(!active())return;record=await getTacticalMap(profileId);if(!active())return;life.url&&URL.revokeObjectURL(life.url);life.url=null;replaceHtml(root,record?full(record.meta):empty);root.querySelector('#tactical-map-upload')?.setAttribute('accept','image/png,image/jpeg,image/webp');if(record)await mountCanvas();};
  let view=cleanMapView(record?.meta.view),anchors=record?.meta.anchors??[null,null,null],selected=-1;
  let image,canvas,host,viewport,ctx,moving=false,pointerStart=null,gesture=null;
  const pointers=new Map();
  const getSize=()=>({width:viewport?.clientWidth||1,height:viewport?.clientHeight||1});
  const screenPoint=event=>{const box=canvas.getBoundingClientRect();return {x:event.clientX-box.left,y:event.clientY-box.top};};
  const saveViewport=()=>{if(!record)return;clearTimeout(life.timeout);life.flush=()=>updateTacticalMap(profileId,{view:{...view}});life.timeout=setTimeout(()=>{life.timeout=null;if(active())void life.flush().catch(error=>feedback(error.message,true));},350);};
  const setView=next=>{view=next;draw();saveViewport();};
  const draw=()=>{
   if(!active()||!canvas||!image||!image.complete||!image.naturalWidth)return;
   const size=getSize(),ratio=Math.min(window.devicePixelRatio||1,3),dw=Math.max(1,Math.round(size.width*ratio)),dh=Math.max(1,Math.round(size.height*ratio));
   if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}ctx=canvas.getContext('2d');if(!ctx)return;
   ctx.setTransform(dw/size.width,0,0,dh/size.height,0,0);ctx.clearRect(0,0,size.width,size.height);
   ctx.fillStyle='#111a29';ctx.fillRect(0,0,size.width,size.height);
   const layout=mapLayout(record.meta,size,view);
   view={...view,centerX:layout.centerX,centerY:layout.centerY};
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,layout.left,layout.top,layout.width,layout.height);
   for(let i=0;i<3;i++)if(anchors[i]){
    const p=anchors[i],x=layout.left+p.mapX*layout.scale,y=layout.top+p.mapY*layout.scale;
    ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fillStyle=i===selected?'#fbbf24':'#4ad5db';ctx.fill();ctx.strokeStyle='#071a2b';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#071a2b';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),x,y+.5);
   }
   const status=root.querySelector('#tactical-map-zoom');if(status)status.textContent=`${Math.round(view.zoom*100)}%`;
  };
  const cursorAt=p=>{
    if(!record)return;const m=screenToMap(record.meta,getSize(),view,p),inside=m.x>=0&&m.y>=0&&m.x<=record.meta.width&&m.y<=record.meta.height;
    const output=root.querySelector('#tactical-map-coordinates');if(!output)return;
    if(!inside){output.textContent='За пределами карты';return;}
    let label=`Пиксель: ${fixed(m.x)}, ${fixed(m.y)}`;
    try{const w=mapToWorld(solveMapCalibration(anchors),m);label+=` · Игровые X/Y: ${fixed(w.x)}, ${fixed(w.y)}`;}catch{}
    output.textContent=label;
  };
  function updateAnchorControls(){
   const list=root.querySelector('#tactical-map-anchor-list');if(list)replaceHtml(list,anchorHTML(anchors));
   for(const btn of root.querySelectorAll('[data-map-action="anchor"]'))btn.setAttribute('aria-pressed',String(Number(btn.dataset.index)===selected));
   const status=root.querySelector('#tactical-calibration-status');if(status){try{solveMapCalibration(anchors);status.textContent='Координаты калиброваны';}catch{status.textContent='Для игровых координат нужны три точки';}}
   draw();
  }
  const zoomAt=(multiplier,point)=>{setView(zoomMapAt(record.meta,getSize(),view,view.zoom*multiplier,point));cursorAt(point);};
  function pointerDown(ev){if(ev.button!==0&&ev.pointerType==='mouse')return;ev.preventDefault();canvas.setPointerCapture(ev.pointerId);pointers.set(ev.pointerId,screenPoint(ev));moving=false;pointerStart={x:ev.clientX,y:ev.clientY};if(pointers.size===2){const pts=[...pointers.values()];gesture={distance:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};} }
  function pointerMove(ev){const p=screenPoint(ev),old=pointers.get(ev.pointerId);if(old){pointers.set(ev.pointerId,p);if(pointers.size===1){const distance=Math.hypot(ev.clientX-pointerStart.x,ev.clientY-pointerStart.y);if(distance>3)moving=true;setView(moveMap(record.meta,getSize(),view,p.x-old.x,p.y-old.y));}else if(pointers.size===2){moving=true;const pts=[...pointers.values()],distance=Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y));const center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};if(gesture){zoomAt(distance/Math.max(1,gesture.distance),center);}gesture={distance};}}
   cursorAt(p);
  }
  function pointerUp(ev){const p=screenPoint(ev),wasSingle=pointers.size===1;pointers.delete(ev.pointerId);if(pointers.size<2)gesture=null;
   if(wasSingle&&!moving&&selected>=0){const m=screenToMap(record.meta,getSize(),view,p);if(m.x>=0&&m.x<=record.meta.width&&m.y>=0&&m.y<=record.meta.height){const wx=root.querySelector(`#map-world-x-${selected}`)?.value,wy=root.querySelector(`#map-world-y-${selected}`)?.value;
    anchors[selected]={mapX:m.x,mapY:m.y,worldX:wx===''?null:Number(wx),worldY:wy===''?null:Number(wy)};updateAnchorControls();}}
   if(pointers.size===0){moving=false;pointerStart=null;}
  }
  async function mountCanvas(){
   view=cleanMapView(record.meta.view);anchors=record.meta.anchors;selected=-1;
   viewport=root.querySelector('#tactical-map-viewport');host=root.querySelector('#tactical-map-canvas-host');
   canvas=document.createElement('canvas');canvas.id='tactical-map-canvas';canvas.setAttribute('aria-label','Игровая карта');canvas.tabIndex=0;host.append(canvas);
   life.observer?.disconnect();life.url=URL.createObjectURL(record.blob);image=new Image();image.decoding='async';image.src=life.url;
   try{await image.decode();}catch{throw Error('Не удалось открыть изображение карты');}
   if(!active())return;
   canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',ev=>{pointers.delete(ev.pointerId);moving=false;gesture=null;});
   canvas.addEventListener('wheel',ev=>{ev.preventDefault();zoomAt(Math.exp(-ev.deltaY*.0012),screenPoint(ev));},{passive:false});
   canvas.addEventListener('keydown',ev=>{const actions={ArrowLeft:[35,0],ArrowRight:[-35,0],ArrowUp:[0,35],ArrowDown:[0,-35]};if(actions[ev.key]){ev.preventDefault();const [dx,dy]=actions[ev.key];setView(moveMap(record.meta,getSize(),view,dx,dy));}if(ev.key==='+'||ev.key==='='){ev.preventDefault();zoomAt(1.25,{x:getSize().width/2,y:getSize().height/2});}if(ev.key==='-'){ev.preventDefault();zoomAt(.8,{x:getSize().width/2,y:getSize().height/2});}});
   life.observer=new ResizeObserver(draw);life.observer.observe(viewport);updateAnchorControls();draw();
  }
  root.addEventListener('input',ev=>{
   const match=ev.target.id?.match(/^map-world-([xy])-([012])$/);if(!match)return;
   const i=Number(match[2]);if(!anchors[i])return;
   anchors[i]={...anchors[i],[match[1]==='x'?'worldX':'worldY']:ev.target.value===''?null:Number(ev.target.value)};
  });
  root.addEventListener('change',async ev=>{
   if(ev.target.id!=='tactical-map-upload')return;
   const file=ev.target.files?.[0];if(!file)return;
   try{if(record&&!confirm('Заменить карту? Старая подложка и её калибровка будут удалены.')){ev.target.value='';return;}
    if(life.timeout){clearTimeout(life.timeout);life.timeout=null;}life.flush=null;await saveTacticalMapImage(profileId,file);if(!active())return;view=cleanMapView();await show();feedback('Карта загружена и сохранена локально');
   }catch(error){feedback(error.message,true);ev.target.value='';}
  });
  root.addEventListener('click',async ev=>{
   const button=ev.target.closest('button[data-map-action]');if(!button||!active()||!record)return;
   const action=button.dataset.mapAction;try{
    if(action==='zoom-in'||action==='zoom-out'){zoomAt(action==='zoom-in'?1.25:.8,{x:getSize().width/2,y:getSize().height/2});return;}
    if(action==='fit'){setView(cleanMapView());return;}
    if(action==='fullscreen'){if(!document.fullscreenElement)await viewport.requestFullscreen();else await document.exitFullscreen();draw();return;}
    if(action==='anchor'){selected=Number(button.dataset.index);for(const btn of root.querySelectorAll('[data-map-action="anchor"]'))btn.setAttribute('aria-pressed',String(Number(btn.dataset.index)===selected));draw();return;}
    if(action==='clear-anchors'){anchors=[null,null,null];selected=-1;await updateTacticalMap(profileId,{anchors});updateAnchorControls();feedback('Опорные точки удалены');return;}
    if(action==='save-anchors'){
     const next=anchors.map((p,i)=>p?{...p,worldX:root.querySelector(`#map-world-x-${i}`).value===''?null:Number(root.querySelector(`#map-world-x-${i}`).value),worldY:root.querySelector(`#map-world-y-${i}`).value===''?null:Number(root.querySelector(`#map-world-y-${i}`).value)}:null);
     solveMapCalibration(next);const meta=await updateTacticalMap(profileId,{anchors:next});anchors=meta.anchors;selected=-1;updateAnchorControls();feedback('Игровая калибровка сохранена');return;
    }
    if(action==='delete'){if(!confirm('Удалить картографическую подложку и калибровку этого RP-профиля?'))return;if(life.timeout){clearTimeout(life.timeout);life.timeout=null;}life.flush=null;await removeTacticalMap(profileId);if(!active())return;await show();feedback('Карта профиля удалена');return;}
   }catch(error){feedback(error.message,true);}
  });
  if(record){replaceHtml(root,full(record.meta));root.querySelector('#tactical-map-upload')?.setAttribute('accept','image/png,image/jpeg,image/webp');await mountCanvas();}else replaceHtml(root,empty);
 }catch(error){if(active()){
  replaceHtml(root,`<section class="card stack"><p class="subtle">Не удалось открыть карту: ${e(error.message)}</p><button type="button" class="button danger" data-map-action="recover">Удалить повреждённую карту</button></section>`);
  root.addEventListener('click',async event=>{if(event.target.closest('[data-map-action="recover"]')&&confirm('Удалить повреждённую карту этого RP-профиля?')){try{await removeTacticalMap(profileId);if(active())await mountTacticalMap(root,state,feedback);}catch(err){feedback(err.message,true);}}});
  feedback(error.message,true);
 }}
}
