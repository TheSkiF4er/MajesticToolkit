/** Binary image maps live in IndexedDB, independently of chrome.storage.local quotas. */
import {api} from './browser.mjs';
import {PLAN_PREFIX,cleanPlan} from './tactical-planning-core.mjs';
import {applyMapAnnotationAction} from './tactical-map-layers.mjs';
import {cleanTerritoryLinks,changeTerritoryLinks} from './tactical-territory-core.mjs';
import {listCrime} from './crime-store.mjs';
import {MAP_DB,MAP_LIMITS,validMapProfile,cleanMapMeta,cleanMapView,cleanMapAnchors,imageSignature,solveMapCalibration} from './tactical-map-core.mjs';
const requireProfile=id=>{if(!validMapProfile(id))throw Error('Недопустимый профиль карты');return id;};
const digest=async bytes=>{if(!globalThis.crypto?.subtle)throw Error('SHA-256 недоступен');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');};
function openDB(){return new Promise((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('Для сохранения карты требуется IndexedDB'));return;}
 const req=indexedDB.open(MAP_DB,1);req.onupgradeneeded=()=>req.result.createObjectStore('maps',{keyPath:'profileId'});
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Не удалось открыть хранилище карты'));req.onblocked=()=>reject(Error('Хранилище карты заблокировано другой вкладкой'));
});}
async function transact(mode,callback){const db=await openDB();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('maps',mode),store=tx.objectStore('maps');let value,reason;
 tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||Error('Ошибка хранения карты'));tx.onabort=()=>reject(reason||tx.error||Error('Операция с картой отменена'));
 try{callback(store,tx,v=>{value=v;},error=>{reason=error;tx.abort();});}catch(error){try{tx.abort();}catch{}reject(error);}
});}finally{db.close();}}
export async function getTacticalMap(profileId,{verify=true}={}){
 requireProfile(profileId);
 const raw=await transact('readonly',(s,tx,done)=>{const req=s.get(profileId);req.onsuccess=()=>done(req.result);});if(!raw)return null;
 const meta=cleanMapMeta(raw);if(!(raw.blob instanceof Blob)||raw.blob.size!==meta.size||raw.blob.type!==meta.mime)throw Error('Файл карты отсутствует или повреждён');
 if(verify){const bytes=await raw.blob.arrayBuffer();if(!imageSignature(new Uint8Array(bytes.slice(0,16)),meta.mime)||await digest(bytes)!==meta.sha256)throw Error('SHA-256 карты не совпадает: изображение повреждено');}
 return {meta,blob:raw.blob};
}
async function decodeImage(blob){
 if(typeof createImageBitmap==='function'){const bitmap=await createImageBitmap(blob);try{return {width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}}
 if(typeof Image==='undefined'||typeof URL?.createObjectURL!=='function')throw Error('В браузере недоступно чтение размеров изображения');
 const url=URL.createObjectURL(blob);try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>reject(Error('Не удалось декодировать изображение'));img.src=url;});}finally{URL.revokeObjectURL(url);}
}
async function assertNoActivePlansOnMap(profileId){
 const all=await api.storage.local.get(null);
 for(const [key,raw] of Object.entries(all)){
  if(!key.startsWith(PLAN_PREFIX))continue;
  const plan=cleanPlan(raw);
  if(key!==PLAN_PREFIX+plan.id)throw Error('Повреждён ключ тактического плана');
  if(plan.profileId===profileId&&!plan.state.archived)throw Error('Карта используется действующим тактическим планом. Архивируйте планы перед заменой или удалением подложки');
 }
}
export async function saveTacticalMapImage(profileId,file){
 requireProfile(profileId);
 if(!(file instanceof Blob)||file.size<32||file.size>MAP_LIMITS.bytes)throw Error('Размер карты должен быть от 32 байт до 25 МиБ');
 const mime=file.type;if(!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('Загрузите PNG, JPEG или WebP');
 const bytes=await file.arrayBuffer();if(!imageSignature(new Uint8Array(bytes.slice(0,16)),mime))throw Error('Файл не соответствует формату изображения');
 const {width,height}=await decodeImage(file);
 if(width>MAP_LIMITS.dimension||height>MAP_LIMITS.dimension||width*height>MAP_LIMITS.pixels||width<1||height<1)throw Error('Изображение слишком большое: максимум 16384 px по стороне и 64 млн пикселей');
 await assertNoActivePlansOnMap(profileId);
 const meta=cleanMapMeta({profileId,name:(file.name||'world-map').slice(0,180),mime,size:file.size,width,height,sha256:await digest(bytes),updatedAt:new Date().toISOString(),view:cleanMapView(),anchors:[],annotationsRevision:0});
 await transact('readwrite',(s)=>s.put({...meta,blob:new Blob([bytes],{type:mime})}));return meta;
}
export async function updateTacticalMap(profileId,{view,anchors}={}){
 requireProfile(profileId);
 return transact('readwrite',(s,tx,done,fail)=>{const req=s.get(profileId);req.onsuccess=()=>{
  if(!req.result){tx.abort();return;}
  try{const previous=cleanMapMeta(req.result),next={...previous,view:view===undefined?previous.view:cleanMapView(view),anchors:anchors===undefined?previous.anchors:cleanMapAnchors(anchors,previous.width,previous.height),updatedAt:new Date().toISOString()};
   if(anchors!==undefined&&next.anchors.every(Boolean)&&next.anchors.every(p=>p.worldX!==null&&p.worldY!==null))solveMapCalibration(next.anchors);
   s.put({...next,blob:req.result.blob});done(next);
  }catch(error){fail(error);}
 };});
}
/** A single read-modify-write transaction prevents competing map editor tabs losing updates. */
export async function mutateTacticalMapAnnotations(profileId,action,payload,{expectedRevision,expectedSha256}={}){
 requireProfile(profileId);
 return transact('readwrite',(store,tx,done,fail)=>{
  const req=store.get(profileId);req.onsuccess=()=>{
   try{
    if(!req.result)throw Error('Сначала загрузите подложку карты');
    const previous=cleanMapMeta(req.result);
    if((expectedRevision!==undefined&&previous.annotationsRevision!==expectedRevision)||(expectedSha256!==undefined&&previous.sha256!==expectedSha256))throw Error('Разметка или подложка изменена в другой вкладке. Перезагрузите карту перед редактированием');
    const nextData=applyMapAnnotationAction(previous,action,payload,previous.width,previous.height);
    cleanTerritoryLinks(previous.territoryLinks,nextData.features); // Do not remove a bound polygon with an overlay import/edit.
    const next={...previous,...nextData,annotationsRevision:previous.annotationsRevision+1,updatedAt:new Date().toISOString()};
    store.put({...next,blob:req.result.blob});done(next);
   }catch(error){fail(error);}
  };
 });
}
export async function removeTacticalMap(profileId){requireProfile(profileId);await assertNoActivePlansOnMap(profileId);return transact('readwrite',s=>s.delete(profileId));}
export async function clearOrphanTacticalMaps(activeProfileIds){const ids=new Set(activeProfileIds);return transact('readwrite',s=>{const req=s.openCursor();req.onsuccess=()=>{const cursor=req.result;if(cursor){if(!ids.has(cursor.key))cursor.delete();cursor.continue();}};});}

/** Atomic map-binding edit with optimistic concurrency; the Crime registry remains the only source for ownership. */
export async function mutateTacticalTerritoryLinks(profileId,action,payload,{expectedRevision,expectedSha256}={}){
 requireProfile(profileId);
 const {territories}=await listCrime();
 return transact('readwrite',(store,tx,done,fail)=>{
  const req=store.get(profileId);req.onsuccess=()=>{
   try{
    if(!req.result)throw Error('Сначала загрузите карту');
    const previous=cleanMapMeta(req.result);
    if((expectedRevision!==undefined&&previous.annotationsRevision!==expectedRevision)||(expectedSha256!==undefined&&previous.sha256!==expectedSha256))throw Error('Привязки карты изменены в другой вкладке. Обновите карту');
    const links=changeTerritoryLinks(previous,action,payload,territories);
    const next={...previous,territoryLinks:links,annotationsRevision:previous.annotationsRevision+1,updatedAt:new Date().toISOString()};
    store.put({...next,blob:req.result.blob});done(next);
   }catch(error){fail(error);}
  };
 });
}
