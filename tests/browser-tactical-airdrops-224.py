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
    # Airdrop Operations 2.2.4 on the uploaded real PNG.
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="airdrops"][role="tab"]').click()
    board=page.locator('#tactical-airdrop-root')
    await board.locator('#airdrop-map-canvas').wait_for(timeout=12000)
    canvas=board.locator('#airdrop-map-canvas')
    box=await canvas.bounding_box();assert box
    await canvas.click(position={'x':box['width']*.5,'y':box['height']*.5})
    form=board.locator('#airdrop-point-form')
    assert 0.0<float(await form.locator('[name="x"]').input_value())<1.0
    assert 0.0<float(await form.locator('[name="y"]').input_value())<1.0
    await form.locator('[name="name"]').fill('Airport drop point QA')
    await form.locator('[name="description"]').fill('North airfield')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.history?.[0]?.data?.name==="Airport drop point QA")')
    assert 'Airport drop point QA' in await board.inner_text()
    point=await page.evaluate('()=>Object.values(window.__data).find(v=>v?.history?.[0]?.data?.name==="Airport drop point QA")')
    assert point['profileId']=='profile_majest' and point['mapSha256']==meta['sha256']
    eventform=board.locator('#airdrop-event-form')
    await eventform.locator('[name="pointId"]').select_option(point['id'])
    await eventform.locator('[name="title"]').fill('Airdrop QA East')
    await eventform.locator('[name="scheduledAt"]').fill('2026-11-20T12:30')
    await eventform.locator('[name="durationMinutes"]').fill('45')
    await eventform.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.history?.[0]?.data?.title==="Airdrop QA East")')
    ev=await page.evaluate('()=>Object.values(window.__data).find(v=>v?.history?.[0]?.data?.title==="Airdrop QA East")')
    assert ev['status']=='planned' and ev['pointId']==point['id']
    await board.locator('#airdrop-participant-form [name="name"]').fill('Pilot QA')
    await board.locator('#airdrop-participant-form button[type="submit"]').click()
    await expect(board).to_contain_text('Pilot QA')
    await board.locator('[data-airdrop-action="event-start"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.id && v.history?.[0]?.data?.title==="Airdrop QA East" && v.history?.at(-1)?.kind==="start")')
    await page.evaluate("() => { window.prompt = message => message.includes('Кто') ? 'Pilot QA' : message.includes('Награда') ? 'Box 41' : 'Done'; }")
    await board.locator('[data-airdrop-action="event-claim"]').click()
    await expect(board).to_contain_text('Box 41')
    await board.locator('[data-airdrop-action="event-finish"]').click()
    await expect(board).to_contain_text('Завершён')
    final=await page.evaluate('()=>Object.values(window.__data).find(v=>v.history?.[0]?.data?.title==="Airdrop QA East")')
    assert final['history'][-1]['kind']=='finish' and final['winner']=='Pilot QA',final
    assert len(final['history'])==5,final['history']
    # On-screen search and filters use real saved entries.
    await board.locator('#airdrop-filter').select_option('completed')
    assert await board.locator('[data-airdrop-action="choose-event"]').count()==1
    await board.locator('#airdrop-search').fill('wrong phrase')
    await expect(board).to_contain_text('Нет аирдропов по выбранным условиям.')
    await board.locator('#airdrop-search').fill('Airdrop QA East')
    await expect(board).to_contain_text('Airdrop QA East')
    async with page.expect_download() as dl:
        await board.locator('[data-airdrop-action="export-json"]').click()
    downloaded=await dl.value
    assert downloaded.suggested_filename.startswith('airdrop-profile_majest')
    import json
    backup=json.loads((await downloaded.path()).read_text())
    assert backup['format']=='majestic-airdrop-operations' and len(backup['events'])==1
    # Import and re-open records, preserving their history.
    await board.locator('#airdrop-import').set_input_files(files={'name':'airdrop.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
    await expect(board).to_contain_text('Airdrop QA East')
    await page.locator('#workspace-profile').select_option('profile_russia')
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="airdrops"][role="tab"]').click()
    await expect(page.locator('#tactical-airdrop-root')).to_contain_text('Точек появления пока нет')
    assert 'Airdrop QA East' not in await page.locator('#tactical-airdrop-root').inner_text()
    assert not errors,errors
    await context.close();return 1

async def main():
    async with async_playwright() as p:
        binary='/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**({'executable_path':binary} if binary else {}))
        try:
            count=await economy_browser_smoke(browser)
            print(f'Airdrop Operations 2.2.4 Chromium E2E: {count} full flow passed')
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
