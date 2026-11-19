#!/usr/bin/env python3
"""Economy & Crime 2.1.1: real CRUD, tabs, search, profiles and persistence."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
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
    await page.locator('.economy-tabs [data-tab="groups"]').click()
    await page.locator('[data-family-action="new"]').click()
    form=page.locator('#family-form')
    await form.locator('[name="name"]').fill('Family QA')
    await form.locator('[name="tag"]').fill('FQA')
    await form.locator('[name="description"]').fill('Тестовый RP-состав')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.[0]?.kind==="family-edit"&&v.events[0].name==="Family QA")')
    assert 'Family QA' in await page.locator('#families-root').inner_text()
    await page.locator('#family-detail [data-family-action="rank-add"]').click()
    await form.locator('[name="rankName"]').fill('Заместитель')
    await form.locator('[name="priority"]').fill('2')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.some(e=>e.kind==="rank-add"&&e.rankName==="Заместитель"))')
    await page.locator('#family-detail [data-family-action="join"]').click()
    await form.locator('[name="player"]').fill('Player QA <script>')
    await form.locator('[name="date"]').fill('2026-11-18')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.some(e=>e.kind==="join"&&e.player==="Player QA <script>"))')
    assert '&lt;script&gt;' in await page.locator('#family-detail').inner_html()
    await page.locator('#family-detail [data-family-action="rank-change"]').click()
    rank=await form.locator('[name="rankId"] option').all()
    for option in rank:
        if 'Заместитель' in await option.inner_text():
            await form.locator('[name="rankId"]').select_option(await option.get_attribute('value'))
            break
    await form.locator('[name="date"]').fill('2026-11-19')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.some(e=>e.kind==="rank-change"))')
    await page.locator('[data-economy-action="new"][data-type="match"]').first.click()
    ef=page.locator('#economy-form')
    await ef.locator('[name="player"]').fill('Player QA')
    await ef.locator('[name="family"]').fill('Old Family QA')
    await ef.locator('[name="kills"]').fill('5')
    await ef.locator('[name="deaths"]').fill('1')
    await ef.locator('[name="damage"]').fill('1500')
    await ef.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.type==="match"&&v.family==="Old Family QA")')
    await page.locator('#family-detail [data-family-action="alias-add"]').click()
    await form.locator('[name="alias"]').fill('Old Family QA')
    await form.locator('button[type="submit"]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(v=>v?.events?.some(e=>e.kind==="alias-add"&&e.alias==="Old Family QA"))')
    assert '1' in await page.locator('#family-detail .economy-stats').inner_text()
    async with page.expect_download() as download:
        await page.locator('#family-detail [data-family-action="csv"]').click()
    assert 'Player QA' in Path(await (await download.value).path()).read_text(encoding='utf-8-sig')
    await page.locator('#workspace-profile').select_option('profile_russia')
    await page.locator('.economy-tabs [data-tab="groups"]').click()
    assert 'Family QA' not in await page.locator('#families-root').inner_text()
    await page.locator('#workspace-profile').select_option('profile_majest')
    await page.locator('.economy-tabs [data-tab="groups"]').click()
    assert 'Family QA' in await page.locator('#family-detail').inner_text()
    assert not errors, errors
    await context.close()
    return 1

async def main():
    async with async_playwright() as p:
        import os
        binary=os.environ.get('MAJESTIC_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)
        options={'executable_path':binary} if binary else {}
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**options)
        try:
            count=await economy_browser_smoke(browser)
            print(f'Families & Membership 2.1.4 Chromium E2E: {count} full flow passed')
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
