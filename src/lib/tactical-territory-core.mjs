/** Territory & Capture Mapping: one polygon per Crime territory, ownership replay from the Crime ledger. */
import {pointInPolygon} from './tactical-map-layers.mjs';
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,120}$/.test(value);
const same=(a,b)=>a.type===b.type&&a.id===b.id;
const ownersPalette=['#22a6b3','#e67e22','#9b59b6','#2ecc71','#e84393','#3498db','#f1c40f','#e74c3c','#16a085','#a3cb38','#c56cf0','#f19066'];
export const NO_OWNER_COLOR='#8492a6';
export function territoryOwnerColor(owner){
 if(!owner||owner.type==='none')return NO_OWNER_COLOR;
 const key=`${owner.type}:${owner.id}`;let hash=2166136261;
 for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619)>>>0;
 return ownersPalette[hash%ownersPalette.length];
}
/** Structural validation deliberately permits orphaned territory IDs so users can unlink after restoring old backups. */
export function cleanTerritoryLinks(raw,features){
 const links=raw===undefined?[]:raw;
 if(!Array.isArray(links)||links.length>1000)throw Error('Неверный список привязок территорий');
 const byFeature=new Map(features.map(f=>[f.id,f]));const territoryIds=new Set(),featureIds=new Set();
 return links.map(input=>{
  if(!input||typeof input!=='object'||!validId(input.territoryId)||!validId(input.featureId))throw Error('Повреждена привязка территории');
  if(territoryIds.has(input.territoryId)||featureIds.has(input.featureId))throw Error('Территория или зона уже привязана');
  if(byFeature.get(input.featureId)?.type!=='polygon')throw Error('Привязка территории требует существующий полигон');
  territoryIds.add(input.territoryId);featureIds.add(input.featureId);
  return {territoryId:input.territoryId,featureId:input.featureId};
 });
}
export function changeTerritoryLinks(meta,kind,payload,territories){
 const current=cleanTerritoryLinks(meta.territoryLinks,meta.features);
 if(kind==='unlink'){
  if(!current.some(x=>x.featureId===payload.featureId))throw Error('Выбранная зона не связана с территорией');
  return current.filter(x=>x.featureId!==payload.featureId);
 }
 if(kind!=='link')throw Error('Неизвестная операция с территориальной картой');
 const territory=territories.find(x=>x.id===payload.territoryId&&x.profileId===meta.profileId);
 if(!territory||territory.archived)throw Error('Территория отсутствует в активном профиле или архивирована');
 if(meta.features.find(x=>x.id===payload.featureId)?.type!=='polygon')throw Error('Выберите полигон карты');
 const rest=current.filter(x=>x.featureId!==payload.featureId);
 if(rest.some(x=>x.territoryId===payload.territoryId))throw Error('Эта территория уже привязана к другой зоне');
 return cleanTerritoryLinks([...rest,{featureId:payload.featureId,territoryId:payload.territoryId}],meta.features);
}
const validDate=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Неверная дата истории территорий');return value;};
export function captureOwnershipAt(territories,operations,profileId,asOf=''){
 if(asOf)validDate(asOf);
 const local=territories.filter(x=>x.profileId===profileId),byId=new Map(local.map(t=>[t.id,t])),owners=new Map(local.map(t=>[t.id,t.initialOwner]));
 const completed=operations.filter(x=>x.profileId===profileId&&x.kind==='capture'&&x.status==='completed'&&(!asOf||x.date<=asOf)).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 for(const event of completed){
  if(!byId.has(event.territoryId))throw Error('Капт ссылается на отсутствующую территорию');
  const existing=owners.get(event.territoryId);
  if(!same(existing,event.defender))throw Error('История каптов нарушает последовательность владения');
  if(event.winner==='attacker')owners.set(event.territoryId,event.attacker);
 }
 return owners;
}
function polygonCenter(points){
 // Average centroid, with guaranteed interior fallback for concave shapes.
 const average={x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};
 if(pointInPolygon(average,points))return average;
 for(let i=1;i<points.length-1;i++){
  const p={x:(points[0].x+points[i].x+points[i+1].x)/3,y:(points[0].y+points[i].y+points[i+1].y)/3};
  if(pointInPolygon(p,points))return p;
 }
 return {...points[0]};
}
export function buildTerritoryMap(meta,{territories,operations},profileId,asOf='',families=[],organizations=[]){
 const links=cleanTerritoryLinks(meta.territoryLinks,meta.features),owners=captureOwnershipAt(territories,operations,profileId,asOf),byTerritory=new Map(territories.filter(t=>t.profileId===profileId).map(t=>[t.id,t]));
 const nameOf=group=>group.type==='family'?families.find(x=>x.profileId===profileId&&x.id===group.id)?.name??'Неизвестная семья':group.type==='organization'?organizations.find(x=>x.profileId===profileId&&x.id===group.id)?.name??'Неизвестная организация':'Без владельца';
 const linked=links.map(link=>{
  const territory=byTerritory.get(link.territoryId),feature=meta.features.find(f=>f.id===link.featureId),owner=owners.get(link.territoryId);
  const events=operations.filter(x=>x.profileId===profileId&&x.territoryId===link.territoryId&&(!asOf||x.date<=asOf)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  return {...link,territory,feature,owner:owner??{type:'none',id:''},ownerName:owner?nameOf(owner):'Территория отсутствует',color:territory?territoryOwnerColor(owner):NO_OWNER_COLOR,center:polygonCenter(feature.points),events};
 });
 return {linked,byFeature:new Map(linked.map(x=>[x.featureId,x])),unlinked:territories.filter(t=>t.profileId===profileId&&!t.archived&&!links.some(x=>x.territoryId===t.id)),allEvents:operations.filter(x=>x.profileId===profileId&&(!asOf||x.date<=asOf))};
}
