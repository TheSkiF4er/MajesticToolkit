#!/usr/bin/env python3
"""Tactical Backup v21: real browser ZIP export/restore of tactical map, airdrops, plans, simulations."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path(__file__).resolve().parents[1]

async def economy_browser_smoke(browser):
    context=await browser.new_context(viewport={'width':1250,'height':850},accept_downloads=True)
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
      const db={close(){},createObjectStore(){return {createIndex(){}};},transaction(name,mode){
       const tx={pending:0,oncomplete:null,onabort:null,onerror:null,error:null,aborted:false,completeIfReady(){if(!this.pending&&!this.aborted)setTimeout(()=>{if(!this.pending&&!this.aborted)this.oncomplete?.();},0);},abort(){this.aborted=true;setTimeout(()=>this.onabort?.(),0);},objectStore(){return {get:key=>request(()=>structuredClone(records.get(key)),tx),put:value=>request(()=>{records.set(value.profileId,structuredClone(value));return value.profileId;},tx),delete:key=>request(()=>records.delete(key),tx),clear:()=>request(()=>records.clear(),tx),openCursor:()=>request(()=>null,tx),index:()=>({getAll:()=>request(()=>[],tx)})};}};return tx;}};
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
    before=await page.evaluate("""async()=>{
      const p='profile_majest';
      const maps=await import('mt:lib/tactical-map-store.mjs');
      const a=await import('mt:lib/tactical-airdrop-store.mjs');
      const plans=await import('mt:lib/tactical-planning-store.mjs');
      const sims=await import('mt:lib/tactical-simulation-store.mjs');
      const {meta}=await maps.getTacticalMap(p);
      const point=await a.addAirdropPoint(p,{name:'Airdrop Echo',description:'Map location',x:.5,y:.5,mapSha256:meta.sha256});
      const event=await a.addAirdropEvent(p,{pointId:point.id,title:'Echo Drop',scheduledAt:'2026-11-19T10:00:00.000Z',durationMinutes:20,notes:''});
      let plan=await plans.addTacticalPlan(p,{title:'Plan Echo',mapSha256:meta.sha256});
      plan=await plans.editTacticalPlan(plan.id,p,'add-point',{id:'point_229_alpha',name:'First',kind:'rally',x:.1,y:.1,squadId:''});
      plan=await plans.editTacticalPlan(plan.id,p,'add-point',{id:'point_229_bravo',name:'Second',kind:'objective',x:.9,y:.9,squadId:''});
      plan=await plans.editTacticalPlan(plan.id,p,'add-route',{id:'route_229_alpha',name:'Main route',pointIds:['point_229_alpha','point_229_bravo'],speed:8,squadId:''});
      const sim=await sims.addTacticalSimulation(p,{planId:plan.id,title:'Simulation Echo',settings:{seed:7}});
      return {map:meta.sha256,point:point.id,event:event.id,plan:plan.id,sim:sim.id};
    }""")
    # Link a real Document Studio document to the saved airdrop through the UI.
    document_id=await page.evaluate("""async()=>{
      const d=await import('mt:lib/document-store.mjs');
      const record=await d.addStudioDocument('profile_majest',{title:'Airdrop RP Evidence',body:'Результат RP-события подтверждён',fields:[],values:{}},['profile_majest'],[]);
      return record.id;
    }""")
    await page.locator('#tactical-workspace [data-tactical-action="tab"][data-tab="links"]').click()
    form=page.locator('#tactical-link-form')
    await form.wait_for(timeout=15000)
    await form.locator('select[name="entity"]').select_option('airdrop:'+before['event'])
    await form.locator('select[name="source"]').select_option('document:'+document_id)
    await form.locator('input[name="note"]').fill('RP source for replay')
    await form.locator('button[type="submit"]').click()
    await expect(page.locator('#tactical-links-root')).to_contain_text('RP source for replay')
    blocked=await page.evaluate("""async(id)=>{
      try{await (await import('mt:lib/document-store.mjs')).removeDocumentRecord(id);return false;}
      catch(error){return /связан/.test(error.message);}
    }""",document_id)
    assert blocked, 'Source-linked Document Studio record was incorrectly removed'
    linked=await page.evaluate("""async()=>{
      const l=await import('mt:lib/tactical-links-store.mjs');
      return (await l.listTacticalLinks('profile_majest')).map(x=>x.id);
    }""")
    assert len(linked)==1
    await page.locator('.nav [data-view="backup"]').click()
    await expect(page.locator('.main')).to_contain_text('Backup v21')
    async with page.expect_download(timeout=30000) as task:
        await page.locator('[data-action="backup-portable-export"]').click()
    download=await task.value
    assert 'v2.2.9' in download.suggested_filename
    payload=(await download.path()).read_bytes()
    assert len(payload)>1000
    # Restore into a profile without tactical data; do not delete old UI state or old economic data.
    await page.evaluate("""async()=>{
      const b=await import('mt:lib/tactical-backup-store.mjs');
      const maps=await import('mt:lib/tactical-map-store.mjs');
      const local=window.__data;
      for(const key of Object.keys(local))if(/^(mtAirdropPointV224:|mtAirdropEventV224:|mtTacticalPlanV226:|mtTacticalSimulationV227:|mtTacticalLinkV229:)/.test(key))delete local[key];
      await maps.replaceTacticalMaps([],new Map());
    }""")
    check=await page.evaluate("""async()=>{
      const a=await import('mt:lib/tactical-airdrop-store.mjs');const m=await import('mt:lib/tactical-map-store.mjs');
      return {map:await m.getTacticalMap('profile_majest'),airdrops:await a.listAirdrops('profile_majest')};
    }""")
    assert check['map'] is None and len(check['airdrops']['events'])==0
    await page.locator('#backup-package-file').set_input_files(files={'name':'import-v21.zip','mimeType':'application/zip','buffer':payload})
    await expect(page.locator('body')).to_contain_text('Резервная копия восстановлена',timeout=30000)
    restored=await page.evaluate("""async()=>{
      const maps=await import('mt:lib/tactical-map-store.mjs');
      const a=await import('mt:lib/tactical-airdrop-store.mjs');
      const plans=await import('mt:lib/tactical-planning-store.mjs');
      const sim=await import('mt:lib/tactical-simulation-store.mjs');
      const m=await maps.getTacticalMap('profile_majest');
      const drop=await a.listAirdrops('profile_majest');
      const links=await import('mt:lib/tactical-links-store.mjs');return {map:m?.meta.sha256,points:drop.points.map(x=>x.id),events:drop.events.map(x=>x.id),plans:(await plans.listTacticalPlans('profile_majest')).map(x=>x.id),simulations:(await sim.listTacticalSimulations('profile_majest')).map(x=>x.id),links:(await links.listTacticalLinks('profile_majest')).map(x=>x.id)};
    }""")
    assert restored['map']==before['map']
    assert before['point'] in restored['points'] and before['event'] in restored['events']
    assert before['plan'] in restored['plans'] and before['sim'] in restored['simulations']
    assert linked[0] in restored['links'], 'Cross-module source link lost during ZIP restore'
    assert not errors,errors
    await context.close();return 1

async def main():
    async with async_playwright() as p:
        binary='/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**({'executable_path':binary} if binary else {}))
        try:
            count=await economy_browser_smoke(browser)
            print(f'Tactical Backup v21 Chromium E2E: {count} full flow passed')
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
