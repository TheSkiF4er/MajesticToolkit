import test from 'node:test';
import assert from 'node:assert/strict';
import {newTerritory,newCrimeEvent,changeCrimeEvent,validateCrime} from '../src/lib/crime-core.mjs';
import {applyMapAnnotationAction,BASE_LAYER_ID} from '../src/lib/tactical-map-layers.mjs';
import {cleanMapMeta} from '../src/lib/tactical-map-core.mjs';
import {cleanTerritoryLinks,changeTerritoryLinks,captureOwnershipAt,buildTerritoryMap,territoryOwnerColor,NO_OWNER_COLOR} from '../src/lib/tactical-territory-core.mjs';
const profile='profile_225_test';
const family={type:'family',id:'family_alpha_01'},organization={type:'organization',id:'organization_beta_02'};
const groupRows={families:[{id:family.id,profileId:profile,name:'Alpha'}],organizations:[{id:organization.id,profileId:profile,name:'Beta'}]};
const polygon={id:'polygon_225_a',type:'polygon',layerId:BASE_LAYER_ID,name:'Северный район',description:'',color:'#20a2f4',points:[{x:10,y:10},{x:110,y:10},{x:110,y:80},{x:10,y:80}]};
const meta=()=>cleanMapMeta({profileId:profile,name:'Земля RP',mime:'image/png',size:150,width:500,height:400,sha256:'a'.repeat(64),updatedAt:new Date().toISOString(),layers:[{id:BASE_LAYER_ID,name:'Основной',visible:true,locked:false}],features:[polygon]});
const fixtures=()=>{
 const territory=newTerritory(profile,{name:'Север',region:'Город',ownerType:'family',ownerId:family.id});
 let c1=newCrimeEvent(profile,{title:'Первый капт',eventKind:'capture',territoryId:territory.id,date:'2026-11-10',attackerType:'organization',attackerId:organization.id,defenderType:'family',defenderId:family.id});
 c1=changeCrimeEvent(c1,'finish',{winner:'attacker'});
 let c2=newCrimeEvent(profile,{title:'Ответный капт',eventKind:'capture',territoryId:territory.id,date:'2026-11-11',attackerType:'family',attackerId:family.id,defenderType:'organization',defenderId:organization.id});
 c2=changeCrimeEvent(c2,'finish',{winner:'defender'});
 const c3=newCrimeEvent(profile,{title:'Будущий капт',eventKind:'capture',territoryId:territory.id,date:'2026-11-28',attackerType:'family',attackerId:family.id,defenderType:'organization',defenderId:organization.id});
 return {territories:[territory],operations:[c1,c2,c3],territory};
};
test('old 2.2.4 map is readable without any territory bindings',()=>{
 const m=meta();assert.deepEqual(m.territoryLinks,[]);assert.deepEqual(cleanTerritoryLinks(undefined,m.features),[]);
});
test('polygon binding updates real territory and respects unique assignments',()=>{
 const {territory}=fixtures();const m=meta();
 const next=changeTerritoryLinks(m,'link',{featureId:polygon.id,territoryId:territory.id},[territory]);
 assert.deepEqual(next,[{territoryId:territory.id,featureId:polygon.id}]);
 assert.throws(()=>cleanTerritoryLinks([...next,...next],m.features),/привязана/);
 assert.throws(()=>changeTerritoryLinks({...m,territoryLinks:next},'link',{featureId:'missing_22',territoryId:territory.id},[territory]),/полигон/);
 assert.deepEqual(changeTerritoryLinks({...m,territoryLinks:next},'unlink',{featureId:polygon.id},[territory]),[]);
});
test('polygon bindings reject foreign and archived territories',()=>{
 const {territory}=fixtures();const m=meta();
 assert.throws(()=>changeTerritoryLinks(m,'link',{featureId:polygon.id,territoryId:territory.id},[{...territory,profileId:'profile_foreign'}]),/профиле/);
 assert.throws(()=>changeTerritoryLinks(m,'link',{featureId:polygon.id,territoryId:territory.id},[{...territory,archived:true}]),/архивирована/);
 const illegal={id:'marker_225_a',type:'marker',layerId:BASE_LAYER_ID,name:'Метка',description:'',color:'#ffffff',points:[{x:10,y:20}]};
 assert.throws(()=>cleanTerritoryLinks([{territoryId:territory.id,featureId:illegal.id}],[polygon,illegal]),/полигон/);
});
test('ownership changes only after completed capturable events, can rewind by date',()=>{
 const {territories,operations,territory}=fixtures();validateCrime(territories,operations,[profile],groupRows.families,groupRows.organizations);
 assert.deepEqual(captureOwnershipAt(territories,operations,profile,'2026-11-09').get(territory.id),family);
 assert.deepEqual(captureOwnershipAt(territories,operations,profile,'2026-11-10').get(territory.id),organization);
 assert.deepEqual(captureOwnershipAt(territories,operations,profile,'2026-11-11').get(territory.id),organization);
 assert.deepEqual(captureOwnershipAt(territories,operations,profile).get(territory.id),organization);
 assert.throws(()=>captureOwnershipAt(territories,operations,profile,'2026-02-30'),/дата/);
});
test('map snapshot colours ownership, shows capture history, respects profile',()=>{
 const {territories,operations,territory}=fixtures(),m={...meta(),territoryLinks:[{territoryId:territory.id,featureId:polygon.id}]};
 const early=buildTerritoryMap(m,{territories,operations},profile,'2026-11-09',groupRows.families,groupRows.organizations),late=buildTerritoryMap(m,{territories,operations},profile,'2026-11-11',groupRows.families,groupRows.organizations);
 assert.equal(early.linked[0].ownerName,'Alpha');assert.equal(late.linked[0].ownerName,'Beta');
 assert.equal(late.linked[0].color,territoryOwnerColor(organization));assert.equal(late.linked[0].events.length,2);
 assert.equal(early.linked[0].events.length,0);assert.equal(late.byFeature.get(polygon.id).territory.id,territory.id);
 assert.equal(territoryOwnerColor({type:'none',id:''}),NO_OWNER_COLOR);
 const other=buildTerritoryMap(m,{territories,operations},'profile_foreign');assert.equal(other.linked[0].territory,undefined);
});
test('link integrity rejects replacement overlay that removes its bound polygon',()=>{
 const {territory}=fixtures();const m={...meta(),territoryLinks:[{territoryId:territory.id,featureId:polygon.id}]};
 const removed=applyMapAnnotationAction(m,'remove-feature',{id:polygon.id},500,400);
 assert.throws(()=>cleanTerritoryLinks(m.territoryLinks,removed.features),/полигон/);
 const replacement=applyMapAnnotationAction(m,'replace',{layers:m.layers,features:[]},500,400);
 assert.throws(()=>cleanTerritoryLinks(m.territoryLinks,replacement.features),/полигон/);
});
