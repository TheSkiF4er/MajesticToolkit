import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_LAYER_ID,DRAW_LIMITS,cleanMapAnnotations,applyMapAnnotationAction,hitMapFeature,mapFeatureBounds,pointInPolygon,segmentDistance,polygonArea} from '../src/lib/tactical-map-layers.mjs';
import {cleanMapMeta} from '../src/lib/tactical-map-core.mjs';
const W=1000,H=800;
const make=(type,points,id='object-one',layerId=BASE_LAYER_ID)=>({id,layerId,type,name:'Объект',description:'RP-тактика',color:'#12a4ce',points});
const a=()=>cleanMapAnnotations({},W,H);
const act=(state,name,payload)=>applyMapAnnotationAction(state,name,payload,W,H);
test('legacy 2.2.2 map metadata safely initializes an editable default layer',()=>{
 const meta=cleanMapMeta({profileId:'profile_test',name:'Карта',mime:'image/png',size:150,width:W,height:H,sha256:'a'.repeat(64),updatedAt:new Date().toISOString()});
 assert.equal(meta.layers.length,1);assert.deepEqual(meta.features,[]);assert.equal(meta.annotationsRevision,0);
});
test('create, edit, reorder, lock, hide and remove actual layers',()=>{
 let s=a();s=act(s,'add-layer',{id:'layer-second',name:'Складские зоны'});
 assert.equal(s.layers.length,2);
 s=act(s,'move-layer',{id:'layer-second',direction:-1});assert.equal(s.layers[0].id,'layer-second');
 s=act(s,'edit-layer',{id:'layer-second',patch:{visible:false,locked:true,name:'Скрытый'}});
 assert.equal(s.layers[0].visible,false);
 assert.throws(()=>act(s,'add-feature',make('marker',[{x:10,y:10}],'test-object','layer-second')),/заблокирован/);
 assert.equal(s.layers[0].name,'Скрытый');
});
test('real features permit metadata editing, moving vertices and changing layers',()=>{
 let s=a();const line=make('line',[{x:12,y:10},{x:200,y:250}]);
 s=act(s,'add-feature',line);assert.equal(s.features.length,1);
 s=act(s,'edit-feature',{id:line.id,patch:{name:'Маршрут север',color:'#FFFFFF',points:[{x:12,y:10},{x:250,y:250}]}});
 assert.deepEqual(s.features[0].points[1],{x:250,y:250});assert.equal(s.features[0].color,'#ffffff');
 const old=s;
 assert.throws(()=>act(s,'edit-feature',{id:line.id,patch:{points:[{x:-1,y:1},{x:20,y:20}]}}),/границы/);
 assert.deepEqual(s,old);
 s=act(s,'add-layer',{id:'layer-next',name:'Новый'});
 s=act(s,'edit-feature',{id:line.id,patch:{layerId:'layer-next'}});assert.equal(s.features[0].layerId,'layer-next');
 assert.throws(()=>act(s,'remove-layer',{id:'layer-next'}),/объекты/);
 s=act(s,'remove-feature',{id:line.id});s=act(s,'remove-layer',{id:'layer-next'});assert.equal(s.layers.length,1);
 assert.throws(()=>act(s,'remove-layer',{id:BASE_LAYER_ID}),/последний/);
});
test('geometry rejects invalid zones, crossing polygon edges and corrupt JSON',()=>{
 assert.throws(()=>act(a(),'add-feature',make('polygon',[{x:0,y:0},{x:30,y:30},{x:0,y:30},{x:30,y:0}])),/пересекаться|площадь/);
 assert.throws(()=>act(a(),'add-feature',make('polygon',[{x:1,y:1},{x:2,y:2},{x:3,y:3}])),/площадь/);
 assert.throws(()=>act(a(),'add-feature',make('line',[{x:1,y:1}])),/Недостаточно/);
 assert.throws(()=>act(a(),'add-feature',make('marker',[{x:1001,y:0}])),/границы/);
 assert.throws(()=>cleanMapAnnotations({layers:[...a().layers,...a().layers],features:[]},W,H),/повторный/);
 assert.throws(()=>cleanMapAnnotations({layers:a().layers,features:[{...make('marker',[{x:2,y:2}]),color:'url(https://bad)'}]},W,H),/цвет/);
 assert.throws(()=>cleanMapAnnotations({layers:a().layers,features:[{...make('marker',[{x:2,y:2}]),name:'<svg onload=alert(1)>'.repeat(40)}]},W,H),/Название/);
 assert.throws(()=>cleanMapAnnotations({layers:null,features:[]},W,H),/слоёв/);
 assert.throws(()=>cleanMapAnnotations({layers:a().layers,features:null},W,H),/объектов/);
 assert.equal(DRAW_LIMITS.layers,32);
});
test('layer visibility and topmost hit tests respect drawing order',()=>{
 let s=a();s=act(s,'add-feature',make('polygon',[{x:10,y:10},{x:130,y:10},{x:130,y:130},{x:10,y:130}],'area-one'));
 s=act(s,'add-feature',make('marker',[{x:60,y:60}],'point-one'));
 assert.equal(hitMapFeature(s,{x:60,y:60},5).id,'point-one');
 assert.equal(hitMapFeature(s,{x:40,y:40},5).id,'area-one');
 assert.ok(pointInPolygon({x:50,y:50},s.features[0].points));assert.equal(polygonArea(s.features[0].points),14400);
 assert.ok(segmentDistance({x:10,y:20},{x:0,y:0},{x:0,y:40})===10);
 assert.deepEqual(mapFeatureBounds(s.features[0]),{minX:10,minY:10,maxX:130,maxY:130});
 s=act(s,'edit-layer',{id:BASE_LAYER_ID,patch:{visible:false}});assert.equal(hitMapFeature(s,{x:60,y:60}),null);
 s=act(s,'edit-layer',{id:BASE_LAYER_ID,patch:{visible:true,locked:true}});
 assert.throws(()=>act(s,'remove-feature',{id:'point-one'}),/заблокирован/);
});
test('import replacement validates every feature before accepting it',()=>{
 const s=act(a(),'add-feature',make('marker',[{x:25,y:35}]));
 const json=JSON.parse(JSON.stringify(s));const imported=act(a(),'replace',json);
 assert.deepEqual(imported,s);
 json.features[0].points[0].x=99999;
 assert.throws(()=>act(s,'replace',json),/границы/);
 assert.equal(s.features[0].points[0].x,25);
});
