/** Interactive offline Tactical Map 2.2.3, using a real decoded image with an origin-local binary store. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {getTacticalMap,saveTacticalMapImage,updateTacticalMap,removeTacticalMap,mutateTacticalMapAnnotations,mutateTacticalTerritoryLinks} from '../lib/tactical-map-store.mjs';
import {MAP_LIMITS,cleanMapView,screenToMap,mapLayout,mapToWorld,solveMapCalibration,moveMap,zoomMapAt} from '../lib/tactical-map-core.mjs';
import {listCrime} from '../lib/crime-store.mjs';
import {listFamilies} from '../lib/family-store.mjs';
import {listOrganizations} from '../lib/organization-store.mjs';
import {buildTerritoryMap} from '../lib/tactical-territory-core.mjs';
import {BASE_LAYER_ID,cleanMapAnnotations,hitMapFeature,mapFeatureBounds,polygonArea} from '../lib/tactical-map-layers.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
let mounted=null;
const fixed=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
const actions=`<div class="row tactical-map-actions"><button class="button secondary" data-map-action="zoom-out" type="button" aria-label="Уменьшить">−</button><button class="button secondary" data-map-action="zoom-in" type="button" aria-label="Увеличить">+</button><button class="button secondary" data-map-action="fit" type="button">Вписать карту</button><button class="button secondary" data-map-action="fullscreen" type="button">На весь экран</button><span id="tactical-map-zoom" class="tag">100%</span></div>`;
const empty=`<section class="card stack"><h3>Интерактивная карта</h3><p class="subtle">Загрузите собственную подложку игрового мира — PNG, JPEG или WebP до 25 МиБ, не более 64 млн пикселей. Файл хранится только на этом устройстве, отдельно для каждого RP-профиля.</p><label class="field">Файл карты<input type="file" id="tactical-map-upload"></label></section>`;
function anchorHTML(anchors){return [0,1,2].map(i=>{
 const p=anchors[i];return `<div class="tactical-map-anchor"><button class="button secondary" type="button" data-map-action="anchor" data-index="${i}" aria-pressed="false">Точка ${i+1}</button><span class="subtle" id="map-anchor-pixel-${i}">${p?`${fixed(p.mapX)} / ${fixed(p.mapY)} px`:'Не установлена'}</span><label>Игровой X<input id="map-world-x-${i}" type="number" step="any" min="-1000000000" max="1000000000" value="${p?.worldX??''}"></label><label>Игровой Y<input id="map-world-y-${i}" type="number" step="any" min="-1000000000" max="1000000000" value="${p?.worldY??''}"></label></div>`;}).join('');}
function full(meta){return `<section class="card stack tactical-map-workspace"><div class="row spread"><div><h3>Интерактивная карта · территории и капты</h3><p class="subtle">${e(meta.name)} · ${meta.width}×${meta.height} px · ${fixed(meta.size/1048576)} МиБ · локальная подложка</p></div><span class="tag">Офлайн</span></div>${actions}<div class="row tactical-map-toolbox" role="toolbar" aria-label="Инструменты разметки">${[['hand','Рука'],['select','Выбор / перемещение'],['marker','Метка'],['line','Линия'],['polygon','Зона']].map(([key,name])=>`<button type="button" class="button secondary" data-map-tool="${key}" aria-pressed="${key==='hand'}">${name}</button>`).join('')}<button class="button secondary" type="button" data-map-action="finish-shape" hidden>Завершить линию / зону</button><button class="button secondary" type="button" data-map-action="back-point" hidden>Убрать вершину</button><button class="button secondary" type="button" data-map-action="cancel-shape" hidden>Отмена</button><button class="button secondary" type="button" data-map-action="undo-overlay" disabled>Отменить изменение</button></div><div class="tactical-map-editor-layout"><div class="stack tactical-map-canvas-panel"><div class="tactical-map-viewport" id="tactical-map-viewport" role="group" aria-label="Интерактивная карта, перемещение и масштабирование"><div id="tactical-map-canvas-host"></div></div><div class="row spread"><output id="tactical-map-coordinates" aria-live="off">Укажите точку карты</output><span class="subtle" id="map-tool-help">Рука — панорамирование. Выбор — перемещение объектов и вершин.</span></div></div><aside class="stack tactical-map-sidebar" aria-label="Управление слоями и объектами"><div class="stack"><h4>Слои карты</h4><div id="map-layer-list" class="stack"></div><div class="row"><input id="map-layer-new" maxlength="80" placeholder="Новый слой" aria-label="Название нового слоя"><button class="button secondary" type="button" data-map-action="add-layer">Добавить</button></div><label class="field">Слой для новой разметки<select id="map-drawing-layer"></select></label></div><div class="stack"><h4>Новая метка / линия / зона</h4><label class="field">Название<input id="map-drawing-name" maxlength="120" placeholder="Название объекта"></label><label class="field">Описание<textarea id="map-drawing-description" maxlength="500" rows="2"></textarea></label><label class="field">Цвет<input type="color" id="map-drawing-color" value="#18a9ce"></label></div><div class="stack"><h4>Объекты</h4><input type="search" id="map-feature-search" maxlength="120" placeholder="Поиск по объектам" aria-label="Поиск по объектам"><div id="map-feature-list" class="stack"></div></div><div class="stack" id="map-feature-editor" hidden><h4>Выбранный объект</h4><label class="field">Название<input id="map-edit-name" maxlength="120"></label><label class="field">Описание<textarea id="map-edit-description" maxlength="500" rows="2"></textarea></label><label class="field">Цвет<input type="color" id="map-edit-color"></label><label class="field">Слой<select id="map-edit-layer"></select></label><div class="row"><button class="button primary" type="button" data-map-action="save-feature">Сохранить</button><button class="button danger" type="button" data-map-action="remove-feature">Удалить</button></div><output id="map-feature-measure" class="subtle"></output></div><section class="stack tactical-territory-panel" aria-label="Территории и капты"><h4>Территории и капты на карте</h4><p class="subtle">Свяжите существующую территорию с полигоном. Владельцы и капты берутся из Crime & Territory.</p><div id="map-territory-content" class="stack"></div></section></aside></div><div class="row"><button class="button secondary" type="button" data-map-action="export-overlay">Экспорт разметки JSON</button><label class="field tactical-map-import">Импорт разметки JSON<input type="file" id="map-overlay-import" accept="application/json,.json"></label><button class="button secondary" type="button" data-map-action="reload-overlay">Обновить разметку</button></div><details id="tactical-map-calibration"><summary>Калибровка игровых координат (3 точки)</summary><div class="stack"><p class="subtle">Выберите «Точка 1», нажмите на нужное место карты, укажите соответствующие игровые X и Y. Повторите для трёх непараллельных точек и сохраните. Без калибровки показываются только пиксели изображения.</p><div id="tactical-map-anchor-list" class="stack">${anchorHTML(meta.anchors)}</div><div class="row"><button type="button" class="button primary" data-map-action="save-anchors">Сохранить калибровку</button><button type="button" class="button secondary" data-map-action="clear-anchors">Сбросить точки</button><span id="tactical-calibration-status" class="subtle"></span></div></div></details><div class="row"><label class="field tactical-map-replace">Заменить подложку<input type="file" id="tactical-map-upload"></label><button type="button" class="button danger" data-map-action="delete">Удалить карту этого профиля</button></div><p class="subtle">Изображение и разметка сохраняются в IndexedDB, отдельно для каждого RP-профиля. При замене изображения разметка сбрасывается. Backup v20 пока не включает карту, её слои и связи с территориями.</p></section>`;}

export function disposeTacticalMap(){if(mounted){mounted.dispose();mounted=null;}}
export async function mountTacticalMap(root,state,feedback,openExisting=null){
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
  let annotations=record?{layers:record.meta.layers,features:record.meta.features}:cleanMapAnnotations({},1,1);
  let drawingTool='hand',drawingLayer=BASE_LAYER_ID,draft=[],selectedFeatureId=null,dragInfo=null,dragPreview=null;
  let actionQueue=Promise.resolve(),undoStack=[],query='';
  let crime={territories:[],operations:[]},families=[],organizations=[],territoryDate='',territoryMap={linked:[],byFeature:new Map(),unlinked:[],allEvents:[]};
  const rebuildTerritory=()=>{if(record)territoryMap=buildTerritoryMap(record.meta,crime,profileId,territoryDate,families,organizations);};
  const reloadCrime=async()=>{[crime,families,organizations]=await Promise.all([listCrime(),listFamilies(),listOrganizations()]);rebuildTerritory();};
  function territoryControls(){
   const host=root.querySelector('#map-territory-content');if(!host||!record)return;
   const selected=annotations.features.find(f=>f.id===selectedFeatureId),bound=selected&&territoryMap.byFeature.get(selected.id);
   const available=territoryMap.unlinked;
   const selectedInfo=selected?.type==='polygon'?
    `<div class="stack"><strong>Выбрана зона: ${e(selected.name)}</strong>${bound?`<p class="subtle">Связь: ${e(bound.territory?.name||'Территория отсутствует')} · ${e(bound.ownerName)}</p><div class="row"><button type="button" class="button secondary" data-map-action="territory-open" data-territory-id="${e(bound.territoryId)}" ${bound.territory?'':'disabled'}>Карточка территории</button><button type="button" class="button danger" data-map-action="territory-unlink" data-feature-id="${e(selected.id)}">Отвязать</button></div>`:`<label class="field">Связать с территорией<select id="map-territory-picker"><option value="">Выберите территорию</option>${available.map(t=>`<option value="${e(t.id)}">${e(t.name)} · ${e(t.region)}</option>`).join('')}</select></label><button type="button" class="button primary" data-map-action="territory-link" data-feature-id="${e(selected.id)}" ${available.length?'':'disabled'}>Привязать полигон</button>`}</div>`:
    '<p class="subtle">Выберите полигон инструментом «Выбор» или из списка объектов, чтобы привязать территорию.</p>';
   const rows=territoryMap.linked.map(link=>`<div class="tactical-territory-row"><span class="tactical-territory-swatch" style="background:${link.color}"></span><div><strong>${e(link.territory?.name||'Отсутствующая территория')}</strong><small class="subtle">${e(link.ownerName)} · ${link.events.filter(x=>x.kind==='capture'&&x.status==='completed').length} каптов</small></div><button type="button" class="button secondary" data-map-action="territory-focus" data-feature-id="${e(link.featureId)}">На карте</button></div>`).join('');
   const events=bound?.events??[];
   const history=events.slice(0,60).map(op=>`<div class="tactical-territory-event"><span class="subtle">${e(op.date)} · ${e(op.status==='completed'?'Завершён':op.status==='planned'?'Запланирован':'Отменён')}</span><strong>${e(op.title)}</strong><span class="subtle">${e(op.kind==='capture'?'Капт':op.kind==='battle'?'Противостояние':'RP-событие')} · ${e(op.winner==='attacker'?'Победа атакующих':op.winner==='defender'?'Победа защитников':op.winner==='draw'?'Ничья':'Результат не указан')}</span><button type="button" class="button secondary" data-map-action="territory-event-open" data-event-id="${e(op.id)}">Открыть событие</button></div>`).join('');
   replaceHtml(host,`<label class="field">Владение на дату (пусто — текущий результат)<input type="date" id="map-territory-date" value="${e(territoryDate)}"></label><div class="row"><button type="button" class="button secondary" data-map-action="territory-refresh">Обновить капты</button><span class="tag">${territoryMap.linked.length} зон</span></div>${selectedInfo}<h4>Зоны контроля</h4><div class="stack tactical-territory-list">${rows||'<p class="subtle">Ни одна территория ещё не привязана к полигону.</p>'}</div>${bound?`<h4>История выбранной территории</h4><div class="stack">${history||'<p class="subtle">Событий пока нет.</p>'}</div>`:''}<p class="subtle">Цвет показывает владельца на выбранную дату. Запланированные капты не изменяют контроль территории.</p>`);
  }

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
   // Draw back-to-front in layer order. Hidden layers do not hit-test or render.
   const overlay=dragPreview?{...annotations,features:annotations.features.map(f=>f.id===dragPreview.id?dragPreview:f)}:annotations;
   for(const layer of overlay.layers)if(layer.visible)for(const feature of overlay.features)if(feature.layerId===layer.id){
    const pts=feature.points.map(p=>({x:layout.left+p.x*layout.scale,y:layout.top+p.y*layout.scale})),chosen=feature.id===selectedFeatureId,territory=territoryMap.byFeature.get(feature.id);
    ctx.save();ctx.strokeStyle=territory?territory.color:feature.color;ctx.fillStyle=territory?territory.color:feature.color;ctx.lineWidth=chosen?3.5:territory?2.75:2;ctx.lineJoin='round';ctx.lineCap='round';
    if(feature.type==='marker'){
     ctx.beginPath();ctx.arc(pts[0].x,pts[0].y,chosen?8:6,0,2*Math.PI);ctx.fill();
    }else{
     ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(const point of pts.slice(1))ctx.lineTo(point.x,point.y);
     if(feature.type==='polygon'){ctx.closePath();ctx.globalAlpha=territory?.territory?.archived?0.10:territory?.territory?0.30:0.2;ctx.fill();ctx.globalAlpha=1;}
     ctx.stroke();
    }
    if(chosen){ctx.fillStyle='#fff';ctx.strokeStyle='#151b2b';ctx.lineWidth=1.5;for(const p of pts){ctx.fillRect(p.x-4,p.y-4,8,8);ctx.strokeRect(p.x-4,p.y-4,8,8);}}
    if(territory?.territory){const at={x:layout.left+territory.center.x*layout.scale,y:layout.top+territory.center.y*layout.scale};ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText(territory.territory.name,at.x,at.y-7,Math.max(35,layout.width*.25));ctx.font='11px sans-serif';ctx.fillText(territory.ownerName,at.x,at.y+8,Math.max(35,layout.width*.25));}
    else if(feature.type==='marker'||chosen){const at=pts[0];ctx.font='12px sans-serif';ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillStyle='#fff';ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText(feature.name,at.x+9,at.y-7);}
    ctx.restore();
   }
   if(draft.length){const pts=draft.map(p=>({x:layout.left+p.x*layout.scale,y:layout.top+p.y*layout.scale}));ctx.save();ctx.strokeStyle=root.querySelector('#map-drawing-color')?.value||'#18a9ce';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);for(const p of pts){ctx.beginPath();ctx.arc(p.x,p.y,4,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();}ctx.restore();}
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
  const annotationStatus=message=>{const output=root.querySelector('#map-tool-help');if(output)output.textContent=message;};
  function chosen(){return annotations.features.find(f=>f.id===selectedFeatureId)||null;}
  function syncOverlay(){
   const previous=selectedFeatureId;const layerList=root.querySelector('#map-layer-list'),features=root.querySelector('#map-feature-list'),drawSelect=root.querySelector('#map-drawing-layer'),editSelect=root.querySelector('#map-edit-layer');
   if(!layerList)return;
   if(!annotations.layers.some(l=>l.id===drawingLayer))drawingLayer=annotations.layers[0].id;
   replaceHtml(layerList,annotations.layers.map((l,i)=>`<div class="tactical-layer-row"><label title="Показывать слой"><input type="checkbox" data-map-layer-visible="${e(l.id)}" ${l.visible?'checked':''} aria-label="Показать ${e(l.name)}"></label><label title="Заблокировать редактирование"><input type="checkbox" data-map-layer-locked="${e(l.id)}" ${l.locked?'checked':''} aria-label="Заблокировать ${e(l.name)}"></label><input value="${e(l.name)}" data-map-layer-name="${e(l.id)}" maxlength="80" aria-label="Название слоя"><button type="button" class="button secondary" data-map-action="rename-layer" data-id="${e(l.id)}" title="Сохранить имя">✓</button><button type="button" class="button secondary" data-map-action="layer-up" data-id="${e(l.id)}" ${i===annotations.layers.length-1?'disabled':''} title="Слой выше">↑</button><button type="button" class="button secondary" data-map-action="layer-down" data-id="${e(l.id)}" ${i===0?'disabled':''} title="Слой ниже">↓</button><button type="button" class="button danger" data-map-action="remove-layer" data-id="${e(l.id)}" title="Удалить пустой слой">×</button></div>`).join(''));
   const options=annotations.layers.map(l=>`<option value="${e(l.id)}">${e(l.name)}${l.locked?' (закрыт)':''}</option>`).join('');
   replaceHtml(drawSelect,options);drawSelect.value=drawingLayer;replaceHtml(editSelect,options);
   if(!annotations.features.some(f=>f.id===selectedFeatureId))selectedFeatureId=null;
   const q=query.trim().toLocaleLowerCase('ru'),found=annotations.features.filter(f=>(f.name+' '+f.description).toLocaleLowerCase('ru').includes(q));
   replaceHtml(features,found.slice(0,150).map(f=>{const l=annotations.layers.find(l=>l.id===f.layerId);return `<div class="tactical-feature-row"><button type="button" class="button ${f.id===selectedFeatureId?'primary':'secondary'}" data-map-action="select-feature" data-id="${e(f.id)}" title="Выбрать и показать">${e(f.type==='marker'?'●':f.type==='line'?'↗':'⬡')} ${e(f.name)}</button><span class="subtle">${e(l?.name||'')}</span></div>`;}).join('')+(found.length>150?'<p class="subtle">Показаны первые 150 объектов. Уточните поиск.</p>':'')+(found.length===0?'<p class="subtle">Объекты не найдены.</p>':''));
   const f=chosen(),editor=root.querySelector('#map-feature-editor');editor.hidden=!f;
   if(f){root.querySelector('#map-edit-name').value=f.name;root.querySelector('#map-edit-description').value=f.description;root.querySelector('#map-edit-color').value=f.color;editSelect.value=f.layerId;
    const l=annotations.layers.find(l=>l.id===f.layerId),disabled=!!l?.locked;
    for(const b of editor.querySelectorAll('input,textarea,select,button'))b.disabled=disabled;
    const total=f.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-f.points[i].x,p.y-f.points[i].y),0)+(f.type==='polygon'?Math.hypot(f.points[0].x-f.points.at(-1).x,f.points[0].y-f.points.at(-1).y):0);
    let note=`${f.points.length} точек · ${fixed(total)} пикселей`;if(f.type==='polygon')note+=` · Площадь ${fixed(polygonArea(f.points))} px²`;
    try{const matrix=solveMapCalibration(anchors),world=f.points.map(p=>mapToWorld(matrix,p));note+=` · Игровые единицы: ${fixed(world.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-world[i].x,p.y-world[i].y),0))}`;}catch{}
    root.querySelector('#map-feature-measure').textContent=note;
   }
   const undo=root.querySelector('[data-map-action="undo-overlay"]');if(undo)undo.disabled=!undoStack.length;
   rebuildTerritory();territoryControls();draw();
  }
  function updateTool(){
   for(const button of root.querySelectorAll('[data-map-tool]'))button.setAttribute('aria-pressed',String(button.dataset.mapTool===drawingTool));
   const isShape=['line','polygon'].includes(drawingTool),enough=draft.length>=(drawingTool==='polygon'?3:2);
   for(const a of ['finish-shape','back-point','cancel-shape']){const b=root.querySelector(`[data-map-action="${a}"]`);if(b){b.hidden=!isShape;b.disabled=a==='finish-shape'?!enough:!draft.length;}}
   if(canvas)canvas.style.cursor=drawingTool==='hand'?'grab':drawingTool==='select'?'pointer':'crosshair';
   if(isShape)annotationStatus(`Нажимайте на карту для вершин ${drawingTool==='line'?'линии':'зоны'}, затем «Завершить». Esc — отмена.`);
   else if(drawingTool==='select')annotationStatus('Выберите объект, перетаскивайте вершины или фигуру целиком.');
   else if(drawingTool==='marker')annotationStatus('Нажмите на карту, чтобы создать метку.');
   else annotationStatus('Перетаскивание — панорамирование. Колесо или жест — масштаб.');
  }
  async function applyOverlay(action,payload,{undo=true}={}){
   const job=actionQueue.then(async()=>{
    const before=structuredClone(annotations);
    const result=await mutateTacticalMapAnnotations(profileId,action,payload,{expectedRevision:record.meta.annotationsRevision,expectedSha256:record.meta.sha256});
    if(!active())return;
    if(undo){undoStack.push(before);if(undoStack.length>20)undoStack.shift();}
    record.meta=result;annotations={layers:result.layers,features:result.features};syncOverlay();
   });actionQueue=job.catch(()=>{});return job;
  }
  function focusFeature(f){const bounds=mapFeatureBounds(f),centerX=(bounds.minX+bounds.maxX)/2/record.meta.width,centerY=(bounds.minY+bounds.maxY)/2/record.meta.height;setView({...view,centerX,centerY,zoom:Math.max(view.zoom,2)});}
  function validPoint(p){return p.x>=0&&p.y>=0&&p.x<=record.meta.width&&p.y<=record.meta.height;}
  function commitDraft(){
   if(!draft.length)return;
   const type=drawingTool,points=draft.map(p=>({...p}));draft=[];updateTool();draw();
   const payload={id:crypto.randomUUID(),layerId:drawingLayer,type,points,name:root.querySelector('#map-drawing-name').value.trim()||({marker:'Метка',line:'Маршрут',polygon:'Зона'}[type]),description:root.querySelector('#map-drawing-description').value,color:root.querySelector('#map-drawing-color').value};
   void applyOverlay('add-feature',payload).then(()=>{root.querySelector('#map-drawing-name').value='';root.querySelector('#map-drawing-description').value='';feedback('Объект карты сохранён');}).catch(err=>{draft=points;updateTool();draw();feedback(err.message,true);});
  }
  const zoomAt=(multiplier,point)=>{setView(zoomMapAt(record.meta,getSize(),view,view.zoom*multiplier,point));cursorAt(point);};
  function pointerDown(ev){
   if(ev.button!==0&&ev.pointerType==='mouse')return;
   ev.preventDefault();canvas.setPointerCapture(ev.pointerId);const p=screenPoint(ev);
   pointers.set(ev.pointerId,p);moving=false;pointerStart={x:ev.clientX,y:ev.clientY};
   if(pointers.size===2){const pts=[...pointers.values()];gesture={distance:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};dragInfo=null;return;}
   if(drawingTool!=='select'||selected>=0)return;
   const m=screenToMap(record.meta,getSize(),view,p),hit=hitMapFeature(annotations,m,10/mapLayout(record.meta,getSize(),view).scale);
   selectedFeatureId=hit?.id||null;dragPreview=null;
   const layer=hit&&annotations.layers.find(x=>x.id===hit.layerId);
   if(hit&&layer&&!layer.locked){
    const tolerance=11/mapLayout(record.meta,getSize(),view).scale;
    const index=hit.points.findIndex(v=>Math.hypot(v.x-m.x,v.y-m.y)<=tolerance);
    dragInfo={id:hit.id,start:m,index,base:hit.points.map(v=>({...v}))};
   }else dragInfo=null;
   syncOverlay();
  }
  function pointerMove(ev){
   const p=screenPoint(ev),old=pointers.get(ev.pointerId);
   if(old){pointers.set(ev.pointerId,p);
    if(pointers.size===1){
     const distance=Math.hypot(ev.clientX-pointerStart.x,ev.clientY-pointerStart.y);if(distance>3)moving=true;
     if(drawingTool==='hand'||selected>=0)setView(moveMap(record.meta,getSize(),view,p.x-old.x,p.y-old.y));
     else if(drawingTool==='select'&&dragInfo&&moving){
      const at=screenToMap(record.meta,getSize(),view,p),dx=at.x-dragInfo.start.x,dy=at.y-dragInfo.start.y;
      const base=dragInfo.base,pts=base.map((v,i)=>dragInfo.index<0||i===dragInfo.index?{x:v.x+dx,y:v.y+dy}:{...v});
      if(pts.every(validPoint))dragPreview={...chosen(),points:pts};draw();
     }
    }else if(pointers.size===2){moving=true;const pts=[...pointers.values()],distance=Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y));const center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};if(gesture)zoomAt(distance/Math.max(1,gesture.distance),center);gesture={distance};}
   }cursorAt(p);
  }
  function pointerUp(ev){
   const p=screenPoint(ev),wasSingle=pointers.size===1;
   pointers.delete(ev.pointerId);if(pointers.size<2)gesture=null;
   if(wasSingle&&drawingTool==='select'&&dragPreview){
    const update={id:dragPreview.id,patch:{points:dragPreview.points}};dragPreview=null;void applyOverlay('edit-feature',update).catch(error=>feedback(error.message,true));
   }else if(wasSingle&&!moving){
    const m=screenToMap(record.meta,getSize(),view,p);
    if(validPoint(m)){
     if(selected>=0){const wx=root.querySelector(`#map-world-x-${selected}`)?.value,wy=root.querySelector(`#map-world-y-${selected}`)?.value;
      anchors[selected]={mapX:m.x,mapY:m.y,worldX:wx===''?null:Number(wx),worldY:wy===''?null:Number(wy)};updateAnchorControls();
     }else if(['marker','line','polygon'].includes(drawingTool)){
      if(annotations.layers.find(l=>l.id===drawingLayer)?.locked){feedback('Слой заблокирован',true);return;}
      draft.push(m);if(drawingTool==='marker')commitDraft();else{updateTool();draw();}
     }
    }
   }
   if(pointers.size===0){moving=false;pointerStart=null;dragInfo=null;}
  }
  async function mountCanvas(){
   view=cleanMapView(record.meta.view);anchors=record.meta.anchors;annotations={layers:record.meta.layers,features:record.meta.features};selected=-1;drawingLayer=annotations.layers[0].id;selectedFeatureId=null;undoStack=[];draft=[];
   await reloadCrime();viewport=root.querySelector('#tactical-map-viewport');host=root.querySelector('#tactical-map-canvas-host');
   canvas=document.createElement('canvas');canvas.id='tactical-map-canvas';canvas.setAttribute('aria-label','Игровая карта');canvas.tabIndex=0;host.append(canvas);
   life.observer?.disconnect();life.url=URL.createObjectURL(record.blob);image=new Image();image.decoding='async';image.src=life.url;
   try{await image.decode();}catch{throw Error('Не удалось открыть изображение карты');}
   if(!active())return;
   canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',ev=>{pointers.delete(ev.pointerId);moving=false;gesture=null;});
   canvas.addEventListener('wheel',ev=>{ev.preventDefault();zoomAt(Math.exp(-ev.deltaY*.0012),screenPoint(ev));},{passive:false});
   canvas.addEventListener('keydown',ev=>{const actions={ArrowLeft:[35,0],ArrowRight:[-35,0],ArrowUp:[0,35],ArrowDown:[0,-35]};if(actions[ev.key]){ev.preventDefault();const [dx,dy]=actions[ev.key];setView(moveMap(record.meta,getSize(),view,dx,dy));}if(ev.key==='+'||ev.key==='='){ev.preventDefault();zoomAt(1.25,{x:getSize().width/2,y:getSize().height/2});}if(ev.key==='-'){ev.preventDefault();zoomAt(.8,{x:getSize().width/2,y:getSize().height/2});}if(ev.key==='Escape'){draft=[];dragPreview=null;selected=-1;updateTool();draw();}});
   life.observer=new ResizeObserver(draw);life.observer.observe(viewport);updateAnchorControls();syncOverlay();updateTool();draw();
  }
  root.addEventListener('input',ev=>{
   if(ev.target.id==='map-feature-search'){query=ev.target.value;syncOverlay();return;}
   if(ev.target.id==='map-drawing-layer'){drawingLayer=ev.target.value;return;}
  });
  root.addEventListener('click',ev=>{
   const button=ev.target.closest('[data-map-tool]');if(!button||!record||!active())return;
   drawingTool=button.dataset.mapTool;selected=-1;draft=[];dragPreview=null;updateTool();draw();
  });
  root.addEventListener('change',ev=>{
   const v=ev.target.dataset.mapLayerVisible,k=ev.target.dataset.mapLayerLocked;
   if(v||k)void applyOverlay('edit-layer',{id:v||k,patch:v?{visible:ev.target.checked}:{locked:ev.target.checked}}).catch(err=>feedback(err.message,true));
   if(ev.target.id==='map-territory-date'){
    territoryDate=ev.target.value;try{rebuildTerritory();territoryControls();draw();}catch(error){territoryDate='';rebuildTerritory();territoryControls();draw();feedback(error.message,true);}return;
   }
   if(ev.target.id==='map-drawing-layer')drawingLayer=ev.target.value;
  });
  root.addEventListener('input',ev=>{
   const match=ev.target.id?.match(/^map-world-([xy])-([012])$/);if(!match)return;
   const i=Number(match[2]);if(!anchors[i])return;
   anchors[i]={...anchors[i],[match[1]==='x'?'worldX':'worldY']:ev.target.value===''?null:Number(ev.target.value)};
  });
  root.addEventListener('change',async ev=>{
   if(ev.target.id==='map-overlay-import'){
    const file=ev.target.files?.[0];if(!file)return;
    try{
     if(file.size>2*1024*1024)throw Error('Файл разметки превышает 2 МиБ');
     const data=JSON.parse(await file.text());
     if(data.format!=='majestic-tactical-overlay'||data.version!==1||data.width!==record.meta.width||data.height!==record.meta.height)throw Error('Файл разметки предназначен для другой версии или размера карты');
     const cleaned=cleanMapAnnotations(data,record.meta.width,record.meta.height);
     if(!confirm(`Заменить текущую разметку (${annotations.features.length} объектов) на импортируемую (${cleaned.features.length} объектов)?`))return;
     await applyOverlay('replace',cleaned);feedback('Разметка импортирована');
    }catch(err){feedback(err.message,true);}finally{ev.target.value='';}
    return;
   }
   if(ev.target.id!=='tactical-map-upload')return;
   const file=ev.target.files?.[0];if(!file)return;
   try{if(record&&!confirm('Заменить карту? Подложка, калибровка, метки, линии и зоны будут удалены.')){ev.target.value='';return;}
    if(life.timeout){clearTimeout(life.timeout);life.timeout=null;}life.flush=null;await saveTacticalMapImage(profileId,file);if(!active())return;view=cleanMapView();await show();feedback('Карта загружена и сохранена локально');
   }catch(error){feedback(error.message,true);ev.target.value='';}
  });
  root.addEventListener('click',async ev=>{
   const button=ev.target.closest('button[data-map-action]');if(!button||!active()||!record)return;
   const action=button.dataset.mapAction;try{
    if(action==='territory-refresh'){await reloadCrime();territoryControls();draw();feedback('Владельцы и события обновлены');return;}
    if(action==='territory-focus'){
     const link=territoryMap.byFeature.get(button.dataset.featureId);if(!link)throw Error('Привязанный полигон не найден');
     selectedFeatureId=link.featureId;drawingTool='select';syncOverlay();updateTool();focusFeature(link.feature);return;
    }
    if(action==='territory-open'||action==='territory-event-open'){
     if(!openExisting)throw Error('Редактор территории недоступен');
     const kind=action==='territory-open'?'territory':'event',id=kind==='territory'?button.dataset.territoryId:button.dataset.eventId;
     const found=kind==='territory'?crime.territories.some(t=>t.id===id&&t.profileId===profileId):crime.operations.some(op=>op.id===id&&op.profileId===profileId);
     if(!found)throw Error('Запись отсутствует в RP-профиле');await openExisting(kind,id,'open');return;
    }
    if(action==='territory-link'||action==='territory-unlink'){
     const featureId=button.dataset.featureId,kind=action==='territory-link'?'link':'unlink';
     const territoryId=root.querySelector('#map-territory-picker')?.value;
     if(kind==='link'&&!territoryId)throw Error('Выберите территорию для привязки');
     const result=await mutateTacticalTerritoryLinks(profileId,kind,{featureId,territoryId},{expectedRevision:record.meta.annotationsRevision,expectedSha256:record.meta.sha256});
     if(!active())return;
     record.meta=result;rebuildTerritory();territoryControls();draw();feedback(kind==='link'?'Территория связана с полигоном':'Связь с территорией удалена');return;
    }
    if(action==='add-layer'){const input=root.querySelector('#map-layer-new');await applyOverlay('add-layer',{id:crypto.randomUUID(),name:input.value.trim()});input.value='';return;}
    if(action==='rename-layer'){const id=button.dataset.id,name=root.querySelector(`[data-map-layer-name="${id}"]`)?.value;await applyOverlay('edit-layer',{id,patch:{name}});return;}
    if(action==='remove-layer'){if(confirm('Удалить пустой слой?'))await applyOverlay('remove-layer',{id:button.dataset.id});return;}
    if(action==='layer-up'||action==='layer-down'){await applyOverlay('move-layer',{id:button.dataset.id,direction:action==='layer-up'?1:-1});return;}
    if(action==='select-feature'){
     selectedFeatureId=button.dataset.id;drawingTool='select';draft=[];syncOverlay();updateTool();const f=chosen();if(f)focusFeature(f);return;
    }
    if(action==='save-feature'&&chosen()){
     await applyOverlay('edit-feature',{id:selectedFeatureId,patch:{name:root.querySelector('#map-edit-name').value,description:root.querySelector('#map-edit-description').value,color:root.querySelector('#map-edit-color').value,layerId:root.querySelector('#map-edit-layer').value}});feedback('Объект обновлён');return;
    }
    if(action==='remove-feature'&&chosen()){if(confirm('Удалить выбранный объект?')){await applyOverlay('remove-feature',{id:selectedFeatureId});selectedFeatureId=null;syncOverlay();}return;}
    if(action==='finish-shape'){commitDraft();return;}
    if(action==='back-point'){draft.pop();updateTool();draw();return;}
    if(action==='cancel-shape'){draft=[];updateTool();draw();return;}
    if(action==='undo-overlay'){
     if(!undoStack.length)return;const prior=undoStack.at(-1);await applyOverlay('replace',prior,{undo:false});undoStack.pop();syncOverlay();feedback('Последнее изменение отменено');return;
    }
    if(action==='reload-overlay'){await show();undoStack=[];feedback('Разметка обновлена из хранилища');return;}
    if(action==='export-overlay'){
     const payload={format:'majestic-tactical-overlay',version:1,width:record.meta.width,height:record.meta.height,layers:annotations.layers,features:annotations.features};
     const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
     try{const link=document.createElement('a');link.href=url;link.download='majestic-map-overlay.json';link.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),2000);}
     return;
    }
    if(action==='zoom-in'||action==='zoom-out'){zoomAt(action==='zoom-in'?1.25:.8,{x:getSize().width/2,y:getSize().height/2});return;}
    if(action==='fit'){setView(cleanMapView());return;}
    if(action==='fullscreen'){if(!document.fullscreenElement)await viewport.requestFullscreen();else await document.exitFullscreen();draw();return;}
    if(action==='anchor'){selected=Number(button.dataset.index);for(const btn of root.querySelectorAll('[data-map-action="anchor"]'))btn.setAttribute('aria-pressed',String(Number(btn.dataset.index)===selected));draw();return;}
    if(action==='clear-anchors'){anchors=[null,null,null];selected=-1;await updateTacticalMap(profileId,{anchors});updateAnchorControls();feedback('Опорные точки удалены');return;}
    if(action==='save-anchors'){
     const next=anchors.map((p,i)=>p?{...p,worldX:root.querySelector(`#map-world-x-${i}`).value===''?null:Number(root.querySelector(`#map-world-x-${i}`).value),worldY:root.querySelector(`#map-world-y-${i}`).value===''?null:Number(root.querySelector(`#map-world-y-${i}`).value)}:null);
     solveMapCalibration(next);const meta=await updateTacticalMap(profileId,{anchors:next});anchors=meta.anchors;selected=-1;updateAnchorControls();feedback('Игровая калибровка сохранена');return;
    }
    if(action==='delete'){if(!confirm('Удалить картографическую подложку, калибровку и всю разметку этого RP-профиля?'))return;if(life.timeout){clearTimeout(life.timeout);life.timeout=null;}life.flush=null;await removeTacticalMap(profileId);if(!active())return;await show();feedback('Карта профиля удалена');return;}
   }catch(error){feedback(error.message,true);}
  });
  if(record){replaceHtml(root,full(record.meta));root.querySelector('#tactical-map-upload')?.setAttribute('accept','image/png,image/jpeg,image/webp');await mountCanvas();}else replaceHtml(root,empty);
 }catch(error){if(active()){
  replaceHtml(root,`<section class="card stack"><p class="subtle">Не удалось открыть карту: ${e(error.message)}</p><button type="button" class="button danger" data-map-action="recover">Удалить повреждённую карту</button></section>`);
  root.addEventListener('click',async event=>{if(event.target.closest('[data-map-action="recover"]')&&confirm('Удалить повреждённую карту этого RP-профиля?')){try{await removeTacticalMap(profileId);if(active())await mountTacticalMap(root,state,feedback);}catch(err){feedback(err.message,true);}}});
  feedback(error.message,true);
 }}
}
