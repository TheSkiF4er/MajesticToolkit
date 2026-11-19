/** Tactical World Map 2.2.2: validated image coordinates, viewport math and three-point affine calibration. */
export const MAP_DB='majestictoolkit-tactical-map-v222';
export const MAP_LIMITS=Object.freeze({bytes:25*1024*1024,dimension:16384,pixels:64*1024*1024,zoomMin:.5,zoomMax:16});
const idPattern=/^[\w-]{8,120}$/;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const between=(x,min,max)=>finite(x)&&x>=min&&x<=max;
export const validMapProfile=id=>typeof id==='string'&&idPattern.test(id);
const bounded=(x,min,max)=>Math.max(min,Math.min(max,x));
export function cleanMapView(input={}){
 const v=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 return {centerX:between(v.centerX,0,1)?v.centerX:.5,centerY:between(v.centerY,0,1)?v.centerY:.5,zoom:between(v.zoom,MAP_LIMITS.zoomMin,MAP_LIMITS.zoomMax)?v.zoom:1};
}
export function cleanMapAnchors(input,width,height){
 if(!Array.isArray(input)||input.length>3)throw Error('Допускается не более трёх опорных точек');
 return [0,1,2].map(i=>{
  const p=input[i];if(p==null)return null;
  if(!p||typeof p!=='object'||!between(p.mapX,0,width)||!between(p.mapY,0,height))throw Error('Опорная точка находится вне карты');
  const worldX=p.worldX==null?null:Number(p.worldX),worldY=p.worldY==null?null:Number(p.worldY);
  if((worldX!=null&&!between(worldX,-1e9,1e9))||(worldY!=null&&!between(worldY,-1e9,1e9)))throw Error('Игровые координаты должны быть конечными числами');
  return {mapX:p.mapX,mapY:p.mapY,worldX,worldY};
 });
}
export function cleanMapMeta(raw){
 if(!raw||typeof raw!=='object'||!validMapProfile(raw.profileId))throw Error('Неверный профиль карты');
 if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>180)throw Error('Неверное название карты');
 if(!['image/png','image/jpeg','image/webp'].includes(raw.mime)||!Number.isSafeInteger(raw.size)||raw.size<32||raw.size>MAP_LIMITS.bytes)throw Error('Неподдерживаемое изображение карты');
 if(!Number.isSafeInteger(raw.width)||!Number.isSafeInteger(raw.height)||raw.width<1||raw.height<1||raw.width>MAP_LIMITS.dimension||raw.height>MAP_LIMITS.dimension||raw.width*raw.height>MAP_LIMITS.pixels)throw Error('Недопустимые размеры карты');
 if(typeof raw.sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.sha256))throw Error('Нет корректной контрольной суммы карты');
 if(typeof raw.updatedAt!=='string'||!Number.isFinite(Date.parse(raw.updatedAt)))throw Error('Неверная дата изменения карты');
 return {profileId:raw.profileId,name:raw.name.trim(),mime:raw.mime,size:raw.size,width:raw.width,height:raw.height,sha256:raw.sha256,updatedAt:raw.updatedAt,view:cleanMapView(raw.view),anchors:cleanMapAnchors(raw.anchors||[],raw.width,raw.height)};
}
export function imageSignature(bytes,mime){
 if(!(bytes instanceof Uint8Array)||bytes.length<12)throw Error('Повреждённое изображение');
 const starts=(...sig)=>sig.every((v,i)=>bytes[i]===v);
 const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
 if(mime==='image/png')return starts(137,80,78,71,13,10,26,10);
 if(mime==='image/jpeg')return starts(255,216,255);
 if(mime==='image/webp')return ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
 return false;
}
export function solveMapCalibration(anchors){
 if(!Array.isArray(anchors)||anchors.length!==3||anchors.some(p=>!p||![p.mapX,p.mapY,p.worldX,p.worldY].every(finite)))throw Error('Для калибровки укажите три точки на карте и их игровые X/Y');
 const [a,b,c]=anchors,dx1=b.mapX-a.mapX,dy1=b.mapY-a.mapY,dx2=c.mapX-a.mapX,dy2=c.mapY-a.mapY,det=dx1*dy2-dx2*dy1;
 if(Math.abs(det)<1e-7)throw Error('Опорные точки карты должны образовывать треугольник');
 const basis=axis=>{
  const d1=b[axis]-a[axis],d2=c[axis]-a[axis];
  const x=(d1*dy2-d2*dy1)/det,y=(dx1*d2-dx2*d1)/det;
  return [x,y,a[axis]-x*a.mapX-y*a.mapY];
 };
 const [xx,xy,x0]=basis('worldX'),[yx,yy,y0]=basis('worldY');
 if(Math.abs(xx*yy-xy*yx)<1e-12)throw Error('Игровые координаты точек не определяют обратимое преобразование');
 return {xx,xy,x0,yx,yy,y0};
}
export function mapToWorld(matrix,p){return {x:matrix.xx*p.x+matrix.xy*p.y+matrix.x0,y:matrix.yx*p.x+matrix.yy*p.y+matrix.y0};}
export function worldToMap(matrix,p){const det=matrix.xx*matrix.yy-matrix.xy*matrix.yx;if(!finite(det)||Math.abs(det)<1e-12)throw Error('Неверная калибровка');const x=p.x-matrix.x0,y=p.y-matrix.y0;return {x:(x*matrix.yy-y*matrix.xy)/det,y:(matrix.xx*y-matrix.yx*x)/det};}
export function mapLayout(meta,viewport,view=meta.view){
 const {width:vw,height:vh}=viewport;
 if(!finite(vw)||!finite(vh)||vw<=0||vh<=0)throw Error('Карта ещё не получила размеры окна');
 const v=cleanMapView(view),scale=Math.min(vw/meta.width,vh/meta.height)*v.zoom;
 // Keep at least one edge of the image visible and center images smaller than the viewport.
 const halfX=vw/(2*scale*meta.width),halfY=vh/(2*scale*meta.height);
 const cx=halfX>=.5?.5:bounded(v.centerX,halfX,1-halfX);
 const cy=halfY>=.5?.5:bounded(v.centerY,halfY,1-halfY);
 return {scale,centerX:cx,centerY:cy,left:vw/2-cx*meta.width*scale,top:vh/2-cy*meta.height*scale,width:meta.width*scale,height:meta.height*scale};
}
export function screenToMap(meta,viewport,view,point){const layout=mapLayout(meta,viewport,view);return {x:(point.x-layout.left)/layout.scale,y:(point.y-layout.top)/layout.scale};}
export function mapToScreen(meta,viewport,view,point){const layout=mapLayout(meta,viewport,view);return {x:layout.left+point.x*layout.scale,y:layout.top+point.y*layout.scale};}
export function moveMap(meta,viewport,view,dx,dy){const layout=mapLayout(meta,viewport,view);return cleanMapView({centerX:layout.centerX-dx/(meta.width*layout.scale),centerY:layout.centerY-dy/(meta.height*layout.scale),zoom:view.zoom});}
export function zoomMapAt(meta,viewport,view,nextZoom,point){
 const before=screenToMap(meta,viewport,view,point),zoom=bounded(nextZoom,MAP_LIMITS.zoomMin,MAP_LIMITS.zoomMax),scale=Math.min(viewport.width/meta.width,viewport.height/meta.height)*zoom;
 const proposed=cleanMapView({centerX:(before.x-(point.x-viewport.width/2)/scale)/meta.width,centerY:(before.y-(point.y-viewport.height/2)/scale)/meta.height,zoom});
 const constrained=mapLayout(meta,viewport,proposed);return {centerX:constrained.centerX,centerY:constrained.centerY,zoom};
}
