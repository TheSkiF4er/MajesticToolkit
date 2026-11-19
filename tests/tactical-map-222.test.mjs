import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP_LIMITS,cleanMapMeta,cleanMapView,cleanMapAnchors,imageSignature,solveMapCalibration,mapToWorld,worldToMap,mapLayout,screenToMap,mapToScreen,zoomMapAt,moveMap} from '../src/lib/tactical-map-core.mjs';
const p='profile_map_test',sha='a'.repeat(64);
const meta=cleanMapMeta({profileId:p,name:'Город и район',mime:'image/png',size:150,width:1000,height:500,sha256:sha,updatedAt:'2026-11-19T05:00:00.000Z',view:{centerX:.5,centerY:.5,zoom:1},anchors:[]});
test('metadata validates profiles, encoded MIME, dimensions and corrupt storage',()=>{
 assert.equal(meta.profileId,p);assert.equal(meta.anchors.length,3);
 for(const invalid of [{profileId:'../escape'}, {mime:'image/svg+xml'}, {width:0},{width:20000},{sha256:'0'}, {size:MAP_LIMITS.bytes+1},{name:'<'.repeat(181)},{height:16000,width:16000}])assert.throws(()=>cleanMapMeta({...meta,...invalid}));
 assert.deepEqual(cleanMapView({zoom:NaN,centerX:100,centerY:-1}),{centerX:.5,centerY:.5,zoom:1});
 assert.throws(()=>cleanMapAnchors([{mapX:-1,mapY:20}],1000,500));
});
test('PNG JPEG WEBP signature validation rejects unsupported or mismatched bytes',()=>{
 const png=Uint8Array.of(137,80,78,71,13,10,26,10,0,0,0,0),jpg=Uint8Array.of(255,216,255,0,0,0,0,0,0,0,0,0);
 const webp=Uint8Array.from('RIFFxxxxWEBP'.split('').map(c=>c.charCodeAt(0)));
 assert.equal(imageSignature(png,'image/png'),true);assert.equal(imageSignature(jpg,'image/jpeg'),true);assert.equal(imageSignature(webp,'image/webp'),true);
 assert.equal(imageSignature(jpg,'image/png'),false);assert.equal(imageSignature(webp,'image/svg+xml'),false);assert.throws(()=>imageSignature(new Uint8Array(3),'image/png'));
});
test('affine calibration handles translation, rotation, skew and inverse coordinates',()=>{
 const anchors=[{mapX:0,mapY:0,worldX:500,worldY:-200},{mapX:100,mapY:0,worldX:700,worldY:-100},{mapX:0,mapY:50,worldX:450,worldY:-50}];
 const transform=solveMapCalibration(anchors),point={x:34,y:29};
 assert.deepEqual(mapToWorld(transform,{x:100,y:50}),{x:650,y:50});
 const world=mapToWorld(transform,point),inverse=worldToMap(transform,world);
 assert.ok(Math.abs(inverse.x-point.x)<1e-10&&Math.abs(inverse.y-point.y)<1e-10);
 assert.throws(()=>solveMapCalibration([anchors[0],anchors[1],null]));
 assert.throws(()=>solveMapCalibration([anchors[0],anchors[0],anchors[2]]),/треугольник/);
 assert.throws(()=>solveMapCalibration(anchors.map((a,i)=>({...a,worldX:i*100,worldY:0}))),/обратимое/);
});
test('viewport centers fitted images and is reversible at zoom and pan',()=>{
 const viewport={width:700,height:700},v={centerX:.5,centerY:.5,zoom:1};
 const fitted=mapLayout(meta,viewport,v);assert.equal(fitted.scale,.7);assert.equal(fitted.left,0);assert.equal(fitted.top,175);
 const m={x:236,y:117},s=mapToScreen(meta,viewport,v,m),back=screenToMap(meta,viewport,v,s);
 assert.ok(Math.abs(m.x-back.x)<1e-8&&Math.abs(m.y-back.y)<1e-8);
 const anchor={x:300,y:350},pre=screenToMap(meta,viewport,v,anchor),zoomed=zoomMapAt(meta,viewport,v,2.5,anchor),post=screenToMap(meta,viewport,zoomed,anchor);
 assert.ok(Math.abs(pre.x-post.x)<1e-8&&Math.abs(pre.y-post.y)<1e-8);
 const moved=moveMap(meta,viewport,zoomed,80,-30);assert.equal(moved.zoom,zoomed.zoom);assert.notEqual(moved.centerX,zoomed.centerX);
 assert.equal(zoomMapAt(meta,viewport,v,100,anchor).zoom,MAP_LIMITS.zoomMax);
});
