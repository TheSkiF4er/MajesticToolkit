#!/usr/bin/env python3
"""Tactical Map 2.2.3 browser E2E with browser Canvas and mock persistent storage."""
import asyncio
import json
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
    # Tactical Planning 2.2.6: create a plan tied to a real SHA-256 map, assign a squad,
    # select positions on Canvas, assemble a route, fork an alternative, export and isolate.
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="planning"][role="tab"]').click()
    board=page.locator('#tactical-planning-root')
    await board.locator('#plan-create-form').wait_for(timeout=10000)
    await board.locator('#plan-create-form [name="title"]').fill('План тестового капта')
    await board.locator('#plan-create-form [name="brief"]').fill('Точка сбора и движение группы')
    await board.locator('#plan-create-form button[type="submit"]').click()
    await expect(board.locator('h3').first).to_contain_text('Tactical Planning')
    await expect(board.locator('#plan-edit-form [name="title"]')).to_have_value('План тестового капта')
    squad=board.locator('#plan-squad-form')
    await squad.locator('[name="name"]').fill('Команда А')
    await squad.locator('[name="leader"]').fill('Player Alpha')
    await squad.locator('[name="role"]').fill('Сбор на базе')
    await squad.locator('[name="participants"]').fill('Player Alpha\nPlayer Beta')
    await squad.locator('button[type="submit"]').click()
    await expect(board).to_contain_text('Команда А')
    canvas=board.locator('#tactical-plan-canvas')
    await canvas.wait_for(timeout=10000)
    await canvas.click(position={'x':150,'y':150})
    first=board.locator('#plan-point-form')
    await first.locator('[name="name"]').fill('Точка сбора')
    await first.locator('[name="kind"]').select_option('rally')
    await first.locator('[name="squadId"]').select_option(index=1)
    await first.locator('button[type="submit"]').click()
    await expect(board).to_contain_text('Точка сбора')
    await board.locator('#tactical-plan-canvas').click(position={'x':350,'y':190})
    second=board.locator('#plan-point-form')
    await second.locator('[name="name"]').fill('Контрольная точка')
    await second.locator('[name="kind"]').select_option('objective')
    await second.locator('button[type="submit"]').click()
    await expect(board).to_contain_text('Контрольная точка')
    await board.locator('[data-plan-action="route-append"]').nth(0).click()
    await board.locator('[data-plan-action="route-append"]').nth(1).click()
    route=board.locator('#plan-route-form')
    await route.locator('[name="name"]').fill('Маршрут А')
    await route.locator('[name="speed"]').fill('100')
    await route.locator('button[type="submit"]').click()
    await expect(board).to_contain_text('Маршрут А')
    await expect(board).to_contain_text('пиксел')
    await board.locator('[data-plan-action="edit-route"]').click()
    route=board.locator('#plan-route-form')
    await route.locator('[name="speed"]').fill('80')
    await route.locator('button[type="submit"]').click()
    await expect(board).to_contain_text('Маршрут А')
    async with page.expect_download() as task:
        await board.locator('[data-plan-action="export-one"]').click()
    exported=json.loads((await (await task.value).path()).read_text())
    assert exported['state']['routes'][0]['name']=='Маршрут А' and exported['state']['routes'][0]['speed']==80
    assert len(exported['state']['squads'][0]['participants'])==2
    page.once('dialog',lambda dialog: asyncio.create_task(dialog.accept()))
    await board.locator('[data-plan-action="fork"]').click()
    await expect(board).to_contain_text('вариант')
    assert await board.locator('[data-plan-action="select"]').count()==2
    # Tactical Simulation 2.2.7 — real user flow on saved alternative plans.
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="simulations"]').click()
    sim=page.locator('#tactical-simulation-root')
    await sim.locator('#tactical-simulation-form').wait_for(timeout=10000)
    await sim.locator('#tactical-simulation-form [name="title"]').fill('RP Simulation Base')
    await sim.locator('#tactical-simulation-form [name="planId"]').select_option(index=1)
    await sim.locator('#tactical-simulation-form [name="iterations"]').fill('20')
    await sim.locator('#tactical-simulation-form [name="speedVariation"]').fill('0.2')
    await sim.locator('#tactical-simulation-form button[type="submit"]').click()
    await expect(sim).to_contain_text('RP Simulation Base')
    await sim.locator('#tactical-sim-canvas').wait_for()
    await expect(sim).to_contain_text('Временная шкала маршрутов')
    first=await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-simulation-store.mjs');return await s.listTacticalSimulations('profile_majest');}""")
    assert len(first)==1 and first[0]['result']['statistics']['runs']==20
    assert first[0]['result']['primary']['routes'][0]['name']=='Маршрут А'
    await sim.locator('#tactical-simulation-form [name="title"]').fill('RP Simulation Variant')
    await sim.locator('#tactical-simulation-form [name="planId"]').select_option(index=2)
    await sim.locator('#tactical-simulation-form [name="speedMultiplier"]').fill('2')
    await sim.locator('#tactical-simulation-form button[type="submit"]').click()
    await expect(sim).to_contain_text('RP Simulation Variant')
    await expect(sim.locator('[data-sim-action="select"]')).to_have_count(2)
    await sim.locator('#tactical-sim-compare').select_option(index=1)
    await expect(sim).to_contain_text('Сравнение с RP Simulation Base')
    async with page.expect_download() as download:
        await sim.locator('[data-sim-action="export-one"]').click()
    result=json.loads((await (await download.value).path()).read_text())
    assert result['result']['model']=='route-timeline-v1'
    assert result['result']['primary']['routes']
    assert len(await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-planning-store.mjs');return await s.listTacticalPlans('profile_majest');}"""))==2
    await sim.locator('#tactical-sim-time').fill('1')
    await expect(sim.locator('#tactical-sim-time-label')).to_contain_text('1 мин')
    # Snapshot ownership prevents map deletion even after active plans are archived.
    protected=await page.evaluate("""async()=>{const plans=await import('mt:lib/tactical-planning-store.mjs');const maps=await import('mt:lib/tactical-map-store.mjs');
      for(const row of await plans.listTacticalPlans('profile_majest'))await plans.editTacticalPlan(row.id,'profile_majest','archive',{archived:true});
      try{await maps.removeTacticalMap('profile_majest');return false;}catch(error){return /симуляцией|тактическим планом/.test(error.message);}}
    """)
    assert protected, 'Saved simulations must prevent losing their background map'
    tamper=await page.evaluate("""async()=>{const s=await import('mt:lib/tactical-simulation-store.mjs');
      const run=(await s.listTacticalSimulations('profile_majest'))[0],key='mtTacticalSimulationV227:'+run.id;
      window.__data[key].result.primary.durationMinutes+=5;
      let caught=false;try{await s.listTacticalSimulations('profile_majest');}catch(error){caught=true;}
      window.__data[key]=run;return caught;}
    """)
    assert tamper, 'Modified simulation outcome must be rejected'
    await page.locator('#workspace-profile').select_option('profile_russia')
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="planning"][role="tab"]').click()
    await expect(page.locator('#tactical-planning-root')).to_contain_text('Планов пока нет')
    assert 'План тестового капта' not in await page.locator('#tactical-planning-root').inner_text()
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="simulations"]').click()
    await expect(page.locator('#tactical-simulation-root')).to_contain_text('Запусков пока нет')

    assert not errors,errors
    await context.close();return 1

async def main():
    async with async_playwright() as p:
        binary='/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**({'executable_path':binary} if binary else {}))
        try:
            count=await economy_browser_smoke(browser)
            print(f'Tactical Simulation 2.2.7 Chromium E2E: {count} full flow passed')
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
