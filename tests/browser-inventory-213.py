#!/usr/bin/env python3
"""Trading & Inventory 2.1.3: full Chromium purchase, sale, transfer, asset and profile flow."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]

async def inventory_browser_smoke(browser):
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
    async def boot(page,seed=None,route='about:blank'):
        # about:blank is not a secure extension origin; use actual SHA-256 through the test host.
        import hashlib
        await page.expose_function('__fixtureSha256',lambda data:list(hashlib.sha256(bytes(data)).digest()))
        await page.set_content(html)
        await page.add_style_tag(content=(ROOT/'src/ui/styles.css').read_text())
        await page.evaluate(mock,seed)
        await page.evaluate('route=>history.replaceState(null,"",route)',route)
        await page.evaluate("import('mt:ui/main.mjs')")
    await boot(page)
    await page.locator('.nav [data-view="economy"]').click()
    await page.locator('.economy-tabs [data-tab="market"]').click()
    await page.locator('[data-market-action="new"][data-type="product"]').click()
    market=page.locator('#marketplace-form')
    await market.locator('[name="name"]').fill('Спорткар <script>QA</script>')
    await market.locator('[name="category"]').select_option('Транспорт')
    await market.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(r=>r?.type==="product"&&r.name.startsWith("Спорткар"))')
    await page.locator('.economy-tabs [data-tab="inventory"]').click()
    await page.locator('[data-trading-action="new"][data-kind="purchase"]').click()
    form=page.locator('#trading-form')
    await form.locator('[name="quantity"]').fill('10')
    await form.locator('[name="unitPrice"]').fill('100')
    await form.locator('[name="fee"]').fill('20')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.length===1&&v.events[0].kind==="purchase")')
    assert 'Спорткар' in await page.locator('#economy-tab-panel').inner_text()
    assert '<script>' not in await page.locator('#economy-tab-panel').inner_html()
    assert '1 020' in (await page.locator('#economy-tab-panel').inner_text()).replace('\u00a0',' ')
    await page.locator('[data-trading-action="new"][data-kind="sale"]').first.click()
    await form.locator('[name="quantity"]').fill('4')
    await form.locator('[name="unitPrice"]').fill('150')
    await form.locator('[name="fee"]').fill('10')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.length===2&&v.events[1].kind==="sale")')
    assert '182' in await page.locator('#economy-tab-panel').inner_text()
    await page.locator('[data-trading-action="new"][data-kind="transfer"]').first.click()
    await form.locator('[name="quantity"]').fill('2')
    await form.locator('[name="toOwnerType"]').select_option('organization')
    await form.locator('[name="toOwnerName"]').fill('Организация QA')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.length===3&&v.events[2].kind==="transfer")')
    assert 'Организация QA' in await page.locator('#economy-tab-panel').inner_text()
    await page.locator('[data-trading-action="new"][data-kind="reserve"]').first.click()
    await form.locator('[name="quantity"]').fill('1')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.length===4&&v.events[3].kind==="reserve")')
    await page.locator('[data-trading-action="new"][data-kind="purchase"]').click()
    await form.locator('[name="quantity"]').fill('1')
    await form.locator('[name="assetTag"]').fill('VIN-213-QA')
    await form.locator('[name="unitPrice"]').fill('50000')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.length===5&&v.events[4].assetTag==="VIN-213-QA")')
    assert 'VIN-213-QA' in await page.locator('#economy-tab-panel').inner_text()
    async with page.expect_download() as dl:
        await page.locator('[data-trading-action="csv"]').click()
    file=await dl.value
    csv=Path(await file.path()).read_text(encoding='utf-8-sig')
    assert 'purchase' in csv and 'sale' in csv and 'VIN-213-QA' in csv
    await page.locator('#workspace-profile').select_option('profile_russia')
    await page.locator('.economy-tabs [data-tab="inventory"]').click()
    await page.wait_for_function('()=>document.querySelector("#economy-tab-panel")?.textContent?.includes("На складе")')
    assert 'VIN-213-QA' not in await page.locator('#economy-tab-panel').inner_text()
    await page.locator('#workspace-profile').select_option('profile_majest')
    await page.locator('.economy-tabs [data-tab="inventory"]').click()
    assert 'VIN-213-QA' in await page.locator('#economy-tab-panel').inner_text()
    assert not errors,errors
    await context.close()
    return 1

async def main():
    async with async_playwright() as p:
        import os
        binary=os.environ.get('MAJESTIC_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)
        options={'executable_path':binary} if binary else {}
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**options)
        try:
            count=await inventory_browser_smoke(browser)
            print(f'Trading & Inventory 2.1.3 Chromium E2E: {count} full flow passed')
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
