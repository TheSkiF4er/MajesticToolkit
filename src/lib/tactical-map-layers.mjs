/** Tactical Map 2.2.3: validated editable vector overlays in image-pixel coordinates. */
export const DRAW_LIMITS=Object.freeze({layers:32,features:2500,vertices:256,totalVertices:30000});
export const BASE_LAYER_ID='layer-main';
export const DEFAULT_LAYERS=Object.freeze([{id:BASE_LAYER_ID,name:'Основной слой',visible:true,locked:false}]);
const idOk=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{6,120}$/.test(x);
const string=(x,max,label,{required=true}={})=>{
 if(typeof x!=='string'||x.length>max||(required&&!x.trim()))throw Error(`Некорректное поле «${label}»`);
 return x.trim();
};
const colorOk=x=>typeof x==='string'&&/^#[0-9a-fA-F]{6}$/.test(x);
const point=(p,width,height)=>{
 if(!p||typeof p!=='object'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>width||p.y>height)throw Error('Координаты объекта выходят за границы карты');
 return {x:p.x,y:p.y};
};
const dist2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a,b,c,d){
 const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);
 const on=(a,b,t)=>t.x>=Math.min(a.x,b.x)-1e-9&&t.x<=Math.max(a.x,b.x)+1e-9&&t.y>=Math.min(a.y,b.y)-1e-9&&t.y<=Math.max(a.y,b.y)+1e-9;
 if((p>1e-9&&q< -1e-9||p< -1e-9&&q>1e-9)&&(r>1e-9&&s< -1e-9||r< -1e-9&&s>1e-9))return true;
 return (Math.abs(p)<1e-9&&on(a,b,c))||(Math.abs(q)<1e-9&&on(a,b,d))||(Math.abs(r)<1e-9&&on(c,d,a))||(Math.abs(s)<1e-9&&on(c,d,b));
}
export function polygonArea(points){return Math.abs(points.reduce((n,p,i)=>n+p.x*points[(i+1)%points.length].y-p.y*points[(i+1)%points.length].x,0))/2;}
function geometry(type,raw,width,height){
 if(!Array.isArray(raw)||raw.length>DRAW_LIMITS.vertices)throw Error('Слишком много вершин');
 if(!['marker','line','polygon'].includes(type))throw Error('Неизвестный тип объекта');
 if(raw.length<(type==='marker'?1:type==='line'?2:3)||(type==='marker'&&raw.length!==1))throw Error('Недостаточно точек для объекта');
 const pts=raw.map(p=>point(p,width,height));
 for(let i=1;i<pts.length;i++)if(dist2(pts[i-1],pts[i])<1e-8)throw Error('Совпадающие вершины недопустимы');
 if(type==='polygon'){
  if(dist2(pts[0],pts.at(-1))<1e-8||polygonArea(pts)<4)throw Error('Зона должна иметь ненулевую площадь');
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
   if(j===i+1||(i===0&&j===pts.length-1))continue;
   if(intersects(pts[i],pts[(i+1)%pts.length],pts[j],pts[(j+1)%pts.length]))throw Error('Границы зоны не должны пересекаться');
  }
 }
 return pts;
}
export function cleanMapAnnotations(raw,width,height){
 const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const srcLayers=Object.hasOwn(input,'layers')?input.layers:DEFAULT_LAYERS,srcFeatures=Object.hasOwn(input,'features')?input.features:[];
 if(!Array.isArray(srcLayers)||srcLayers.length<1||srcLayers.length>DRAW_LIMITS.layers)throw Error('Некорректный список слоёв карты');
 if(!Array.isArray(srcFeatures)||srcFeatures.length>DRAW_LIMITS.features)throw Error('Превышен лимит объектов карты');
 const seen=new Set();const layers=srcLayers.map(l=>{
  if(!l||!idOk(l.id)||seen.has(l.id))throw Error('Некорректный или повторный ID слоя');seen.add(l.id);
  if(typeof l.visible!=='boolean'||typeof l.locked!=='boolean')throw Error('Некорректное состояние слоя');
  return {id:l.id,name:string(l.name,80,'Название слоя'),visible:l.visible,locked:l.locked};
 });
 const featureIDs=new Set();let totalVertices=0;
 const features=srcFeatures.map(f=>{
  if(!f||!idOk(f.id)||featureIDs.has(f.id))throw Error('Некорректный или повторный ID объекта');featureIDs.add(f.id);
  if(!seen.has(f.layerId))throw Error('Объект ссылается на отсутствующий слой');
  if(!colorOk(f.color))throw Error('Некорректный цвет объекта');
  const points=geometry(f.type,f.points,width,height);totalVertices+=points.length;
  if(totalVertices>DRAW_LIMITS.totalVertices)throw Error('Слишком много вершин на карте');
  return {id:f.id,layerId:f.layerId,type:f.type,name:string(f.name,120,'Название объекта'),description:string(f.description??'',500,'Описание',{required:false}),color:f.color.toLowerCase(),points};
 });
 return {layers,features};
}
export function applyMapAnnotationAction(current,action,payload,width,height){
 const data=cleanMapAnnotations(current,width,height),layers=data.layers,features=data.features;
 const layer=id=>{const found=layers.find(l=>l.id===id);if(!found)throw Error('Слой не найден');return found;};
 const editable=id=>{const l=layer(id);if(l.locked)throw Error('Слой заблокирован');return l;};
 const feature=id=>{const f=features.find(f=>f.id===id);if(!f)throw Error('Объект не найден');return f;};
 switch(action){
  case 'add-layer':
   if(layers.length>=DRAW_LIMITS.layers)throw Error('Достигнут лимит слоёв');
   layers.push({id:payload.id,name:payload.name,visible:true,locked:false});break;
  case 'edit-layer':{
   const l=layer(payload.id);for(const key of ['name','visible','locked'])if(key in (payload.patch||{}))l[key]=payload.patch[key];break;
  }
  case 'move-layer':{
   const i=layers.findIndex(x=>x.id===payload.id),next=i+payload.direction;
   if(i<0||![-1,1].includes(payload.direction)||next<0||next>=layers.length)throw Error('Нельзя переместить слой');
   [layers[i],layers[next]]=[layers[next],layers[i]];break;
  }
  case 'remove-layer':{
   layer(payload.id);if(layers.length===1)throw Error('Нельзя удалить последний слой');
   if(features.some(f=>f.layerId===payload.id))throw Error('Сначала удалите или перенесите объекты слоя');
   layers.splice(layers.findIndex(l=>l.id===payload.id),1);break;
  }
  case 'add-feature':
   editable(payload.layerId);features.push({...payload});break;
  case 'edit-feature':{
   const f=feature(payload.id);editable(f.layerId);if(payload.patch?.layerId)editable(payload.patch.layerId);
   for(const key of ['name','description','color','points','layerId'])if(key in (payload.patch||{}))f[key]=payload.patch[key];break;
  }
  case 'remove-feature':{
   const f=feature(payload.id);editable(f.layerId);features.splice(features.indexOf(f),1);break;
  }
  case 'replace':return cleanMapAnnotations(payload,width,height);
  default:throw Error('Неизвестная операция редактирования карты');
 }
 return cleanMapAnnotations({layers,features},width,height);
}
export function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));}
export function pointInPolygon(p,vertices){let inside=false;for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
 const a=vertices[i],b=vertices[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside;}
export function hitMapFeature(data,p,tolerance=8){
 const visible=new Set(data.layers.filter(l=>l.visible).map(l=>l.id));
 // Render order: layer order first and then insertion order, so pick topmost first.
 for(const l of [...data.layers].reverse())if(visible.has(l.id))for(const f of [...data.features].reverse())if(f.layerId===l.id){
  const verts=f.points;
  if(f.type==='marker'){if(Math.hypot(p.x-verts[0].x,p.y-verts[0].y)<=tolerance)return f;continue;}
  for(let i=1;i<verts.length;i++)if(segmentDistance(p,verts[i-1],verts[i])<=tolerance)return f;
  if(f.type==='polygon'&&(segmentDistance(p,verts.at(-1),verts[0])<=tolerance||pointInPolygon(p,verts)))return f;
 }return null;
}
export function mapFeatureBounds(f){const xs=f.points.map(p=>p.x),ys=f.points.map(p=>p.y);return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};}
