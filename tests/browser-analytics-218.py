#!/usr/bin/env python3
"""Advanced Economy Analytics 2.1.8: stored data, filters, owner isolation and CSV."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]

async def analytics_browser_smoke(browser):
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
    await page.evaluate("""async()=>{
      const pid='profile_majest';
      const finance=await import('mt:lib/finance-store.mjs');
      const market=await import('mt:lib/marketplace-store.mjs');
      const stock=await import('mt:lib/inventory-store.mjs');
      const legacy=await import('mt:lib/economy-store.mjs');
      const a=await finance.financeAction(pid,'account-open',{name:'Analytic Cash',ownerType:'personal',ownerId:'',openingBalance:500});
      const b=await finance.financeAction(pid,'account-open',{name:'Reserve Cash',ownerType:'personal',ownerId:'',openingBalance:0});
      await finance.financeAction(pid,'income',{accountId:a.event.accountId,amount:300,category:'Goods',date:'2026-11-18'});
      await finance.financeAction(pid,'transfer',{accountId:a.event.accountId,toAccountId:b.event.accountId,amount:50,date:'2026-11-18'});
      await finance.financeAction(pid,'expense',{accountId:a.event.accountId,amount:70,category:'Fuel',date:'2026-11-18'});
      const p=await market.addMarketplace('product',pid,{name:'Analytic vehicle',category:'Транспорт',variant:'Custom',unit:'шт.',note:''});
      await market.addMarketplace('price',pid,{productId:p.id,date:'2026-11-18',kind:'completed',price:100,quantity:1,source:'Manual',url:'',note:''});
      await market.addMarketplace('price',pid,{productId:p.id,date:'2026-11-18',kind:'completed',price:200,quantity:1,source:'Manual',url:'',note:''});
      const lot=await stock.inventoryAction(pid,'purchase',{date:'2026-11-17',productId:p.id,ownerType:'personal',ownerName:'',quantity:2,unitPrice:100,fee:20,assetTag:''});
      await stock.inventoryAction(pid,'sale',{date:'2026-11-18',productId:p.id,lotId:lot.event.id,ownerType:'personal',ownerName:'',quantity:1,unitPrice:200,fee:10});
      await legacy.addEconomy('deal',pid,{date:'2026-11-18',title:'Separate deal',category:'Транспорт',status:'closed',quantity:1,buyPrice:50,salePrice:125,buyFee:0,saleFee:0,note:''});
    }""")
    await page.locator('.nav [data-view="economy"]').click()
    await page.locator('.economy-tabs [data-tab="analytics"]').click()
    await page.locator('#economy-analytics').wait_for(timeout=30000)
    text=await page.locator('#economy-analytics').inner_text()
    for expected in ['Advanced Economy Analytics','Analytic Cash','Reserve Cash','Analytic vehicle','230 $','80 $','150 $','75 $']:
        assert expected in text,(expected,text[-1700:])
    assert 'без двойного' in text.lower() or 'независимы' in text.lower()
    assert await page.locator('#economy-analytics .economy-chart').count() >= 2
    await page.locator('#analytics-productId').select_option(label='Analytic vehicle · Custom')
    assert await page.locator('#economy-analytics').count()==1
    # The saved product selector persists after navigating away and back.
    await page.locator('.economy-tabs [data-tab="finance"]').click()
    await page.locator('.economy-tabs [data-tab="analytics"]').click()
    assert await page.locator('#analytics-productId').input_value()!='all'
    async with page.expect_download() as dl:
        await page.locator('[data-analytics-action="csv"]').click()
    csv=Path(await (await dl.value).path()).read_text(encoding='utf-8-sig')
    assert 'Analytic vehicle' in csv and 'Старый журнал' in csv and 'История цен' in csv
    await page.locator('#workspace-profile').select_option('profile_russia')
    # Switching profile must show no records or prices of the previous profile.
    await page.locator('.economy-tabs [data-tab="analytics"]').click()
    other_text=await page.locator('#economy-analytics').inner_text()
    assert 'Analytic Cash' not in other_text and 'Analytic vehicle' not in other_text
    await page.locator('#workspace-profile').select_option('profile_majest')
    await page.locator('.economy-tabs [data-tab="analytics"]').click()
    assert 'Analytic Cash' in await page.locator('#economy-analytics').inner_text()
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
            count=await analytics_browser_smoke(browser)
            print(f'Advanced Economy Analytics 2.1.8 Chromium E2E: {count} full flow passed')
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
