#!/usr/bin/env python3
"""Tactical GA: real Chromium IndexedDB, image integrity and dependent-record lifecycle."""
import asyncio
import functools
import struct
import threading
import zlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def png(rgb):
    def chunk(kind, contents):
        return struct.pack('>I', len(contents)) + kind + contents + struct.pack('>I', zlib.crc32(kind+contents)&0xffffffff)
    pixels = b''.join(b'\0' + bytes(rgb)*32 for _ in range(16))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',32,16,8,2,0,0,0))
            + chunk(b'IDAT',zlib.compress(pixels)) + chunk(b'IEND',b''))

async def run(browser,origin):
    context=await browser.new_context()
    page=await context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    await page.goto(origin+'/',wait_until='domcontentloaded')
    await page.evaluate('''() => {
      const data={};window.__gaData=data;
      window.browser={storage:{local:{
       async get(keys){if(keys===null)return structuredClone(data);if(Array.isArray(keys))return Object.fromEntries(keys.filter(k=>k in data).map(k=>[k,structuredClone(data[k])]));return {[keys]:structuredClone(data[keys])};},
       async set(rows){for(const [key,value] of Object.entries(rows))data[key]=structuredClone(value);},
       async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}
      }}};
    }''')
    result=await page.evaluate('''async args=>{
      const [one,two]=args;
      const p='profile_tactical_ga230',orphan='profile_ga_orphan230';
      const maps=await import('/lib/tactical-map-store.mjs');
      const plans=await import('/lib/tactical-planning-store.mjs');
      const airdrops=await import('/lib/tactical-airdrop-store.mjs');
      const links=await import('/lib/tactical-links-store.mjs');
      const linkCore=await import('/lib/tactical-links-core.mjs');
      const fail=async(job,part)=>{try{await job();throw Error('Operation unexpectedly succeeded: '+part);}catch(err){if(String(err.message).includes('unexpectedly succeeded'))throw err;}};
      const bytes=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
      const image=(b64,name)=>new File([bytes(b64)],name,{type:'image/png'});
      const first=await maps.saveTacticalMapImage(p,image(one,'original.png'));
      if(!(await maps.getTacticalMap(p))||first.width!==32||first.height!==16)throw Error('Native IndexedDB image save failed');
      const annotated=await maps.mutateTacticalMapAnnotations(p,'add-feature',{
       id:'ga_marker_230',layerId:'layer-main',type:'marker',name:'Point',description:'',color:'#cc4411',points:[{x:8,y:8}]
      },{expectedRevision:first.annotationsRevision,expectedSha256:first.sha256});
      const identical=await maps.saveTacticalMapImage(p,image(one,'same.png'));
      if(identical.annotationsRevision!==annotated.annotationsRevision||identical.features.length!==1)throw Error('Same-image reupload cleared annotations');
      const second=await maps.saveTacticalMapImage(orphan,image(two,'other.png'));
      const all=await maps.snapshotAllTacticalMaps();
      if(all.maps.length!==2||all.files.get(orphan).length!==bytes(two).length)throw Error('Snapshot omitted existing profile');
      const plan=await plans.addTacticalPlan(p,{title:'Archived model plan',mapSha256:first.sha256});
      await plans.editTacticalPlan(plan.id,p,'archive',{archived:true});
      await fail(()=>maps.removeTacticalMap(p),'archived plan removal must be blocked');
      await fail(()=>maps.saveTacticalMapImage(p,image(two,'different.png')),'archived plan image change must be blocked');
      const restored=await maps.saveTacticalMapImage(p,image(one,'original-again.png'));
      if(restored.sha256!==first.sha256||restored.features.length!==1)throw Error('Original image was not preserved');
      const point=await airdrops.addAirdropPoint(p,{name:'Bound zone',x:.4,y:.4,mapSha256:first.sha256});
      const event=await airdrops.addAirdropEvent(p,{title:'Drop',pointId:point.id,scheduledAt:'2026-11-19T12:00:00.000Z',durationMinutes:30});
      await airdrops.updateAirdropEvent(event.id,p,'cancel',{reason:'Cancelled'});
      const link=linkCore.newTacticalLink(p,{entityType:'airdrop',entityId:event.id,sourceType:'evidence',sourceId:'evidence_ga230'});
      await browser.storage.local.set({[linkCore.TACTICAL_LINK_PREFIX+link.id]:link});
      await fail(()=>airdrops.deleteAirdropEvent(p,event.id),'event with evidence must not be deleted');
      await links.removeTacticalLink(p,link.id);
      await airdrops.updateAirdropPoint(point.id,p,'archive',{archived:true});
      await fail(()=>airdrops.deleteAirdropPoint(p,point.id),'point with event must not be deleted');
      await airdrops.deleteAirdropEvent(p,event.id);
      await airdrops.deleteAirdropPoint(p,point.id);
      await plans.deleteTacticalPlan(p,plan.id);
      await maps.removeTacticalMap(p);
      if(await maps.getTacticalMap(p))throw Error('Map was not removed');
      const survivor=await maps.getTacticalMap(orphan);
      if(survivor?.meta.sha256!==second.sha256)throw Error('Unrelated profile image changed');
      return {nativeIndexedDB:true,images:2,restoredImageHash:restored.sha256,changesPreserved:true,linkedRecordsProtected:true,profileIsolation:true};
    }''', [__import__('base64').b64encode(png((40,110,170))).decode(), __import__('base64').b64encode(png((90,50,180))).decode()])
    assert result['nativeIndexedDB'] and result['profileIsolation'] and not errors,(result,errors)
    await context.close()
    return result

async def main():
    handler=functools.partial(QuietHandler,directory=str(ROOT/'src'))
    server=ThreadingHTTPServer(('127.0.0.1',0),handler)
    worker=threading.Thread(target=server.serve_forever,daemon=True)
    worker.start()
    try:
        async with async_playwright() as playwright:
            binary='/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None
            browser=await playwright.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**({'executable_path':binary} if binary else {}))
            try:
                result=await run(browser,f'http://127.0.0.1:{server.server_port}')
                print(f'Tactical GA 2.3.0 Chromium native IndexedDB E2E: PASS {result}')
            finally:await browser.close()
    finally:
        server.shutdown();server.server_close();worker.join(timeout=5)

if __name__=='__main__':asyncio.run(main())
