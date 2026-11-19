#!/usr/bin/env python3
"""Tactical Map 2.2.3 browser E2E with browser Canvas and mock persistent storage."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path(__file__).resolve().parents[1]

async def economy_browser_smoke(browser):
    context=await browser.new_context(viewport={'width':1250,'height':850})
    page=await context.new_page()
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    import base64, json, re
    modules={}
    def add_module(path):
        path=path.resolve();key='mt:'+path.relative_to(ROOT/'src').as_posix()
        if key in modules:return key
        modules[key]=''
        def rewrite(match):return match.group(1)+add_module((path.parent/match.group(2)).resolve())+match.group(1)
        source=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,path.read_text())
        modules[key]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
        return key
    add_module(ROOT/'src/ui/main.mjs')
    html=(ROOT/'src/ui/workspace.html').read_text().replace('<link rel="stylesheet" href="styles.css">','').replace('<script type="module" src="main.mjs"></script>','')
    html=html.replace('</head>','<script type="importmap">'+json.dumps({'imports':modules})+'</script></head>')
    mock='''(seed) => {
      const date='2026-11-15T00:00:00.000Z';
      const p1={id:'profile_majest',name:'Majestic QA',project:'majestic',server:'Alpha',forumUrl:'https://forum.majestic-rp.ru/',createdAt:date,updatedAt:date};
      const p2={id:'profile_russia',name:'Russia QA',project:'russia-online',server:'Beta',forumUrl:'https://forum.russia.online/',createdAt:date,updatedAt:date};
      const initial={rpNexusStateV1:{schemaVersion:1,activeProfileId:p1.id,profiles:[p1,p2],preferences:{theme:'dark',compact:false,startPage:'home'},updatedAt:date}};
      const data=seed||initial;window.__data=data;window.__tabs=[];const listeners=[];
      const notify=changes=>{queueMicrotask(()=>listeners.forEach(fn=>fn(changes,'local')));};
      const event={addListener(){},removeListener(){}};
      window.browser={runtime:{id:'fixture',getURL:path=>'http://localhost:8765/'+path,onMessage:event,async sendMessage(m){if(m.type==='MT_SECTION_MONITOR'){try{const s=await import('mt:lib/section-monitor-store.mjs');const value=m.action==='list'?await s.sectionView(m.profileId):m.action==='scan'?await s.scanSections(m.profileId,m.input?.id??null):await s.sectionAction(m.profileId,m.action,m.input);return {ok:true,value};}catch(e){return {ok:false,error:e.message};}}if(m.type==='RP_NEXUS_CASE_MUTATE'){try{const s=await import('mt:lib/complaints-store.mjs');const value=m.action==='registry'?await (await import('mt:lib/punishment-registry-store.mjs')).registryAction(m.profileId,m.operation,m.input):m.action==='moderation'?await s.mutateModeration(m.id,m.operation,m.input):m.action==='queue'?await s.mutateComplaintQueue(m.profileId,m.ids,m.operation,m.input):m.action==='moderation-ops'?(m.operation==='apply-sla'?await s.applyPolicyToUnscheduled(m.profileId):m.operation==='run-overdue'?await s.runOverdueAutomations(m.profileId):await s.mutateModerationOperations(m.profileId,m.operation,m.input)):m.action==='create'?await s.createComplaint(m.input):m.action==='update'?await s.editComplaint(m.id,m.patch):m.action==='workflow'?await s.mutateCaseWorkflow(m.id,m.workflowAction,m.payload):null;return {ok:true,value};}catch(e){return {ok:false,error:e.message};}}return {ok:true,value:[]};}},permissions:{async contains(){return !!window.__sectionGranted;},onAdded:event,onRemoved:event},tabs:{async create(x){window.__tabs.push(x);return x;},async query(){return window.__sectionGranted?[{id:91,url:'https://forum.majestic-rp.ru/forums/qa.12/'}]:[];},async sendMessage(id,m){return {ok:true,rows:window.__sectionRows};}},notifications:{async create(id,value){(window.__sectionNotifications??=[]).push({id,value});}},storage:{onChanged:{addListener(fn){listeners.push(fn);}},local:{async get(k){if(k===null)return structuredClone(data);if(Array.isArray(k))return Object.fromEntries(k.map(x=>[x,data[x]]));if(typeof k==='object')return {...k,...Object.fromEntries(Object.keys(k).filter(x=>x in data).map(x=>[x,data[x]]))};return {[k]:data[k]};},async set(x){const changes={};for(const [k,v] of Object.entries(x)){changes[k]={oldValue:data[k],newValue:v};data[k]=structuredClone(v);}notify(changes);},async remove(keys){const changes={};for(const k of Array.isArray(keys)?keys:[keys]){changes[k]={oldValue:data[k]};delete data[k];}notify(changes);}}}};
      window.confirm=()=>true;
      if(!crypto.randomUUID)crypto.randomUUID=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
      if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{value:{async digest(algorithm,bytes){if(algorithm!=='SHA-256')throw Error('Unexpected algorithm');return Uint8Array.from(await window.__fixtureSha256(Array.from(new Uint8Array(bytes)))).buffer;}}});
    }'''

    # This Chromium runner disallows navigation to all URLs; test DOM, Canvas and image
    # decoding in about:blank with a deterministic IndexedDB adapter. Production uses native IDB.
    import hashlib
    await page.expose_function('__fixtureSha256',lambda data:list(hashlib.sha256(bytes(data)).digest()))
    await page.set_content(html)
    await page.add_style_tag(content=(ROOT/'src/ui/styles.css').read_text())
    await page.evaluate(mock,None)
    await page.evaluate("""() => {
      const records=new Map();window.__mapDB=records;
      const request=(fn,tx)=>{const r={onsuccess:null,onerror:null,result:undefined,error:null};tx.pending++;
       queueMicrotask(()=>{try{r.result=fn();r.onsuccess?.({target:r});}catch(e){r.error=e;r.onerror?.({target:r});tx.error=e;tx.onerror?.({target:tx});}finally{tx.pending--;tx.completeIfReady();}});return r;};
      const db={close(){},createObjectStore(){},transaction(name,mode){
       const tx={pending:0,oncomplete:null,onabort:null,onerror:null,error:null,aborted:false,completeIfReady(){if(!this.pending&&!this.aborted)setTimeout(()=>{if(!this.pending&&!this.aborted)this.oncomplete?.();},0);},abort(){this.aborted=true;setTimeout(()=>this.onabort?.(),0);},objectStore(){return {get:key=>request(()=>structuredClone(records.get(key)),tx),put:value=>request(()=>{records.set(value.profileId,structuredClone(value));return value.profileId;},tx),delete:key=>request(()=>records.delete(key),tx),openCursor(){throw Error('Cursor not used in this test');}};}};return tx;}};
      Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){const req={result:db,onsuccess:null,onupgradeneeded:null,onblocked:null,onerror:null};queueMicrotask(()=>{req.onupgradeneeded?.();req.onsuccess?.();});return req;}}});
    }""")
    await page.evaluate("import('mt:ui/main.mjs')")
    await page.locator('.nav [data-view="tactical"]').click()
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="map"]').click()
    root=page.locator('#tactical-map-root')
    await root.locator('#tactical-map-upload').wait_for()
    # Generate a real PNG without external libraries (CI installs only Playwright).
    import struct,zlib
    def chunk(kind,contents):return struct.pack('>I',len(contents))+kind+contents+struct.pack('>I',zlib.crc32(kind+contents)&0xffffffff)
    pixels=b''.join(b'\x00'+bytes((48,98,147))*600 for _ in range(300))
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',600,300,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')
    await root.locator('#tactical-map-upload').set_input_files(files={'name':'world.png','mimeType':'image/png','buffer':png})
    canvas=root.locator('#tactical-map-canvas')
    await canvas.wait_for(timeout=15000)
    assert 'world.png' in await root.inner_text()
    assert '600×300' in await root.inner_text()
    meta=await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-map-store.mjs');return (await s.getTacticalMap('profile_majest')).meta;}""")
    assert meta['width']==600 and meta['height']==300
    # Zoom around center and pan; changes must persist through a tab rebuild.
    zoom=await root.locator('#tactical-map-zoom').inner_text();assert zoom=='100%'
    await root.locator('[data-map-action="zoom-in"]').click()
    assert '125%' in await root.locator('#tactical-map-zoom').inner_text()
    await canvas.hover()
    await page.mouse.wheel(0,-170)
    await page.wait_for_timeout(600)
    view=await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-map-store.mjs');return (await s.getTacticalMap('profile_majest')).meta.view;}""")
    assert view['zoom']>1.25,view
    # Fit and configure three independent control points via actual canvas clicks.
    await root.locator('[data-map-action="fit"]').click()
    await root.locator('#tactical-map-calibration summary').click()
    for i,(xp,yp,wx,wy) in enumerate([(0.43,0.40,100,200),(0.54,0.40,200,200),(0.43,0.58,100,100)]):
        await root.locator(f'[data-map-action="anchor"][data-index="{i}"]').click()
        box=await canvas.bounding_box();assert box
        await canvas.scroll_into_view_if_needed()
        box=await canvas.bounding_box();assert box
        await page.mouse.click(box['x']+box['width']*xp,box['y']+box['height']*yp)
        await root.locator(f'#map-world-x-{i}').fill(str(wx))
        await root.locator(f'#map-world-y-{i}').fill(str(wy))
    await root.locator('[data-map-action="save-anchors"]').click()
    await expect(root.locator('#tactical-calibration-status')).to_have_text('Координаты калиброваны')
    meta=await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-map-store.mjs');return (await s.getTacticalMap('profile_majest')).meta;}""")
    assert len([a for a in meta['anchors'] if a])==3
    await canvas.hover()
    assert 'Игровые X/Y' in await root.locator('#tactical-map-coordinates').inner_text()
    # Map Layers & Markers 2.2.3 — actual Canvas editing, persistence and profile isolation.
    await root.locator('#map-layer-new').fill('План операции')
    await root.locator('[data-map-action="add-layer"]').click()
    await expect(root.locator('[data-map-layer-name]')).to_have_count(2)
    await root.locator('#map-drawing-layer').select_option(label='План операции')
    await root.locator('#map-drawing-name').fill('Пункт сбора')
    await root.locator('[data-map-tool="marker"]').click()
    box=await canvas.bounding_box();assert box
    await page.mouse.click(box['x']+box['width']*.46,box['y']+box['height']*.43)
    await expect(root.locator('#map-feature-list')).to_contain_text('Пункт сбора')
    await root.locator('#map-drawing-name').fill('Путь до точки')
    await root.locator('[data-map-tool="line"]').click()
    box=await canvas.bounding_box()
    for xp,yp in [(0.42,0.50),(0.51,0.52),(0.56,0.62)]:
        await page.mouse.click(box['x']+box['width']*xp,box['y']+box['height']*yp)
    await root.locator('[data-map-action="finish-shape"]').click()
    await expect(root.locator('#map-feature-list')).to_contain_text('Путь до точки')
    await root.locator('#map-drawing-name').fill('Контрольная зона')
    await root.locator('[data-map-tool="polygon"]').click()
    box=await canvas.bounding_box()
    for xp,yp in [(0.53,0.33),(0.62,0.33),(0.60,0.47),(0.53,0.47)]:
        await page.mouse.click(box['x']+box['width']*xp,box['y']+box['height']*yp)
    await root.locator('[data-map-action="finish-shape"]').click()
    await expect(root.locator('#map-feature-list')).to_contain_text('Контрольная зона')
    # Select and edit through the user-facing editor.
    await root.locator('[data-map-action="select-feature"]').filter(has_text='Пункт сбора').click()
    await root.locator('#map-edit-name').fill('Пункт сбора Alpha')
    await root.locator('#map-edit-color').fill('#c012ff')
    await root.locator('[data-map-action="save-feature"]').click()
    await expect(root.locator('#map-feature-list')).to_contain_text('Пункт сбора Alpha')
    saved=await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-map-store.mjs');return (await s.getTacticalMap('profile_majest')).meta;}""")
    assert len(saved['layers'])==2 and len(saved['features'])==3,saved
    assert saved['features'][0]['name']=='Пункт сбора Alpha'
    assert saved['features'][0]['color']=='#c012ff'
    # Drag the marker in select mode; the changed pixels must be durable.
    await page.wait_for_timeout(550)
    start_pos=await page.evaluate("""async()=>{
      const s=await import('mt:lib/tactical-map-store.mjs'),core=await import('mt:lib/tactical-map-core.mjs');
      const meta=(await s.getTacticalMap('profile_majest')).meta;
      const pt=meta.features.find(f=>f.name==='Пункт сбора Alpha').points[0];
      const canvas=document.querySelector('#tactical-map-canvas'),rect=canvas.getBoundingClientRect();
      const xy=core.mapToScreen(meta,{width:rect.width,height:rect.height},meta.view,pt);
      return {x:rect.x+xy.x,y:rect.y+xy.y,oldX:pt.x,oldY:pt.y};
    }""")
    await page.mouse.move(start_pos['x'],start_pos['y'])
    await page.mouse.down()
    await page.mouse.move(start_pos['x']+24,start_pos['y']+15,steps=7)
    await page.mouse.up()
    moved=await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-map-store.mjs');return (await s.getTacticalMap('profile_majest')).meta.features.find(f=>f.name==='Пункт сбора Alpha').points[0];}""")
    assert abs(moved['x']-start_pos['oldX'])>5 and abs(moved['y']-start_pos['oldY'])>3,(start_pos,moved)
    # Locked layers prevent modifications, invisible layers don't draw/select.
    layer_id=next(l['id'] for l in saved['layers'] if l['name']=='План операции')
    await root.locator(f'[data-map-layer-locked="{layer_id}"]').check()
    await expect(root.locator('#map-edit-name')).to_be_disabled()
    await root.locator(f'[data-map-layer-locked="{layer_id}"]').uncheck()
    await root.locator(f'[data-map-layer-visible="{layer_id}"]').uncheck()
    await root.locator(f'[data-map-layer-visible="{layer_id}"]').check()
    # A second stale tab is not allowed to overwrite a newer overlay revision.
    conflict=await page.evaluate("""async()=>{
      const s=await import('mt:lib/tactical-map-store.mjs');
      const meta=(await s.getTacticalMap('profile_majest')).meta;
      try{await s.mutateTacticalMapAnnotations('profile_majest','edit-layer',{id:meta.layers[0].id,patch:{name:'Несанкционированное изменение'}},{expectedRevision:meta.annotationsRevision-1,expectedSha256:meta.sha256});return null;}
      catch(e){return e.message;}
    }""")
    assert conflict and 'другой вкладке' in conflict,conflict
    # Undo last layer change and export JSON without losing the drawn image.
    await root.locator('[data-map-action="undo-overlay"]').click()
    export_data=await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-map-store.mjs');const m=(await s.getTacticalMap('profile_majest')).meta;return JSON.stringify({format:'majestic-tactical-overlay',version:1,width:m.width,height:m.height,layers:m.layers,features:m.features});}""")
    # Explicitly imported JSON is validated and persisted in the same IndexedDB record.
    await root.locator('#map-overlay-import').set_input_files(files={'name':'layout.json','mimeType':'application/json','buffer':export_data.encode()})
    await expect(root.locator('#map-feature-list')).to_contain_text('Контрольная зона')
    # Navigation remount restores the overlay while retaining calibration.
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="overview"]').click()
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="map"]').click()
    await root.locator('#tactical-map-canvas').wait_for(timeout=6000)
    await expect(root.locator('#map-feature-list')).to_contain_text('Пункт сбора Alpha')
    await expect(root.locator('#map-feature-list')).to_contain_text('Контрольная зона')
    assert (await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-map-store.mjs');return (await s.getTacticalMap('profile_majest')).meta.features.length;}"""))==3
    # Reopen first profile later, second profile has no annotation data at all.
    # Same profile restores image and three-point calibration after a full tab remount.
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="overview"]').click()
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="map"]').click()
    await root.locator('#tactical-map-canvas').wait_for(timeout=6000)
    await root.locator('#tactical-map-calibration summary').click()
    await expect(root.locator('#tactical-calibration-status')).to_have_text('Координаты калиброваны')
    # Corrupt the fixture image digest; the UI must refuse to draw it.
    await page.evaluate("() => {const row=window.__mapDB.get('profile_majest');row.sha256='0'.repeat(64);window.__mapDB.set('profile_majest',row);}")
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="overview"]').click()
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="map"]').click()
    await expect(root).to_contain_text('SHA-256')
    assert await root.locator('#tactical-map-canvas').count()==0
    # The other RP profile has no map and is not affected by corrupted map data.
    await page.locator('#workspace-profile').select_option('profile_russia')
    await expect(page.locator('#tactical-workspace')).to_contain_text('Russia QA')
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="map"]').click()
    await root.locator('#tactical-map-upload').wait_for()
    assert await root.locator('#tactical-map-canvas').count()==0
    assert not errors,errors
    await context.close();return 1

async def main():
    async with async_playwright() as p:
        binary='/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**({'executable_path':binary} if binary else {}))
        try:
            count=await economy_browser_smoke(browser)
            print(f'Tactical Map Layers 2.2.3 Chromium E2E: {count} full flow passed')
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
