#!/usr/bin/env python3
"""Real Chromium 2.0.5: judicial hierarchy plus court case management."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]

async def judicial_browser_smoke(browser):
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
    await page.locator('.nav [data-view=justice]').click()
    await page.locator('.justice-tabs').wait_for(timeout=12000)
    async def create_department(name,code):
        await page.locator('[data-government-action=new-department]').first.click()
        await page.locator('#government-form [name=name]').fill(name)
        await page.locator('#government-form [name=code]').fill(code)
        await page.locator('#government-form [name=officer]').fill('QA Chief Judge')
        await page.locator('#government-form [name=position]').fill('Председатель')
        await page.locator('#government-form button[type=submit]').click()
        await page.locator('#government-dialog').wait_for(state='detached',timeout=10000)
    await create_department('QA Appeals Tribunal','QA-APP')
    await create_department('QA District Tribunal','QA-DIS')
    await page.locator('.justice-tabs [data-tab=courts]').click()
    await page.locator('.judicial-panel').wait_for()
    await page.locator('.judicial-panel [data-court-action=new-court]').first.click()
    await page.locator('#judicial-form [name=departmentId]').select_option(label='QA Appeals Tribunal (QA-APP)')
    await page.locator('#judicial-form [name=level]').select_option('appeal')
    await page.locator('#judicial-form [name=venue]').fill('Appeals Courtroom')
    await page.locator('#judicial-form button[type=submit]').click()
    await page.locator('#judicial-dialog').wait_for(state='detached')
    assert await page.locator('.judicial-court').count()==1
    await page.locator('.judicial-panel [data-court-action=new-court]').first.click()
    await page.locator('#judicial-form [name=departmentId]').select_option(label='QA District Tribunal (QA-DIS)')
    await page.locator('#judicial-form [name=level]').select_option('first')
    await page.locator('#judicial-form [name=parentCourtId]').select_option(label='QA Appeals Tribunal')
    await page.locator('#judicial-form button[type=submit]').click()
    await page.locator('#judicial-dialog').wait_for(state='detached')
    assert await page.locator('.judicial-court').count()==2
    await page.locator('.judicial-court').filter(has_text='QA District Tribunal').locator('[data-court-action=new-rule]').click()
    await page.locator('#judicial-form [name=category]').fill('Гражданское')
    await page.locator('#judicial-form [name=territory]').fill('Los Santos')
    await page.locator('#judicial-form [name=stage]').select_option('first')
    await page.locator('#judicial-form [name=legalBasis]').fill('RP Кодекс, статья 1')
    await page.locator('#judicial-form button[type=submit]').click()
    await page.locator('#judicial-dialog').wait_for(state='detached')
    await page.locator('.judicial-court').filter(has=page.get_by_text('QA Appeals Tribunal (QA-APP)',exact=True)).locator('[data-court-action=new-rule]').click()
    await page.locator('#judicial-form [name=category]').fill('Гражданское')
    await page.locator('#judicial-form [name=territory]').fill('*')
    await page.locator('#judicial-form [name=stage]').select_option('appeal')
    await page.locator('#judicial-form [name=legalBasis]').fill('RP Кодекс, статья 2')
    await page.locator('#judicial-form button[type=submit]').click()
    await page.locator('#judicial-dialog').wait_for(state='detached')
    await page.locator('.judicial-panel [data-court-action=tab][data-tab=jurisdiction]').click()
    assert await page.locator('.judicial-panel [data-court-action=edit-rule]').count()==2
    await page.locator('.judicial-panel [data-court-action=tab][data-tab=route]').click()
    await page.locator('#court-route-form [name=stage]').select_option('first')
    await page.locator('#court-route-form [name=category]').fill('Гражданское')
    await page.locator('#court-route-form [name=territory]').fill('Los Santos')
    await page.locator('#court-route-form button[type=submit]').click()
    await page.get_by_text('Найденные варианты: 1').wait_for()
    assert await page.locator('#justice-panel').get_by_text('QA District Tribunal',exact=False).count()>0
    await page.locator('#court-route-form [name=stage]').select_option('appeal')
    await page.locator('#court-route-form [name=originCourtId]').select_option(label='QA District Tribunal')
    await page.locator('#court-route-form button[type=submit]').click()
    await page.get_by_text('RP Кодекс, статья 2',exact=False).wait_for(timeout=10000)
    await page.locator('.justice-tabs [data-tab=overview]').click()
    await page.locator('#justice-search').fill('RP Кодекс, статья 2')
    assert await page.locator('#justice-results .justice-result').count()==1
    # 2.0.5: Document Studio and Court Case Management in the same active profile.
    await page.locator('#justice-panel [data-document-action=new-document]').click()
    await page.locator('#document-form [name=title]').fill('Заявление QA-205')
    await page.locator('#document-form [name=body]').fill('Процессуальное заявление к делу QA-205')
    await page.locator('#document-form button[type=submit]').click()
    await page.locator('#studio-dialog').wait_for(state='detached')
    await page.locator('.justice-tabs [data-tab=cases]').click()
    await page.locator('.court-case-panel [data-court-case-action=new]').click()
    await page.locator('#court-case-dialog').wait_for()
    await page.locator('#court-case-form [name=courtId]').select_option(label='QA District Tribunal')
    await page.locator('#court-case-form [name=number]').fill('QA-205')
    await page.locator('#court-case-form [name=title]').fill('Проверка судебного иска')
    await page.locator('#court-case-form [name=category]').fill('Гражданское')
    await page.locator('#court-case-form [name=territory]').fill('Los Santos')
    await page.locator('#court-case-form [name=summary]').fill('Исковые требования QA')
    await page.locator('#court-case-form button[type=submit]').click()
    await page.locator('#court-case-dialog').wait_for(state='detached')
    await page.locator('.court-case-detail').wait_for()
    assert await page.locator('.court-case-row').count()==1
    await page.locator('#court-case-participant-form [name=name]').fill('QA Claimant')
    await page.locator('#court-case-participant-form [name=role]').select_option('claimant')
    await page.locator('#court-case-participant-form button[type=submit]').click()
    await page.locator('.court-case-detail').get_by_text('QA Claimant',exact=True).wait_for(timeout=10000)
    await page.locator('#court-case-document-form [name=link]').select_option(index=0)
    await page.locator('#court-case-document-form button[type=submit]').click()
    await page.locator('.court-case-detail').get_by_text('Заявление QA-205',exact=True).wait_for(timeout=10000)
    async def change_status(expected):
        await page.locator('#court-case-status-form [name=status]').select_option(expected)
        await page.locator('#court-case-status-form [name=reason]').fill('Постановление для проверки QA')
        await page.locator('#court-case-status-form button[type=submit]').click()
        await page.locator('.court-case-detail').get_by_text({'filed':'Подано','accepted':'Принято','hearing':'Рассматривается','closed':'Завершено','archived':'Архив'}[expected],exact=False).first.wait_for(timeout=10000)
    # 2.0.6: live proceedings rendered and persisted through Government Store.
    for status in ['filed','accepted']:
        await change_status(status)
    await page.locator('[data-proceeding-action=hearing-add]').click()
    await page.locator('#court-proceeding-form [name=title]').fill('Первое заседание QA-206')
    await page.locator('#court-proceeding-form [name=startsAt]').fill('2026-11-16T10:00')
    await page.locator('#court-proceeding-form [name=endsAt]').fill('2026-11-16T11:00')
    await page.locator('#court-proceeding-form [name=location]').fill('Зал суда QA')
    await page.locator('#court-proceeding-form [name=agenda]').fill('Рассмотрение иска по существу')
    await page.locator('#court-proceeding-form button[type=submit]').click()
    await page.locator('#court-proceeding-dialog').wait_for(state='detached',timeout=12000)
    assert await page.locator('.court-proceeding-item').filter(has_text='Первое заседание QA-206').count()==1
    await page.locator('[data-proceeding-action=hearing-edit]').click()
    await page.locator('#court-proceeding-form [name=startsAt]').fill('2026-11-17T10:00')
    await page.locator('#court-proceeding-form [name=endsAt]').fill('2026-11-17T11:00')
    await page.locator('#court-proceeding-form button[type=submit]').click()
    await page.locator('#court-proceeding-dialog').wait_for(state='detached',timeout=12000)
    await page.locator('[data-proceeding-action=motion-file]').click()
    await page.locator('#court-proceeding-form [name=kind]').select_option('request')
    await page.locator('#court-proceeding-form [name=title]').fill('Ходатайство об экспертизе')
    await page.locator('#court-proceeding-form [name=request]').fill('Назначить экспертизу по делу QA-206')
    await page.locator('#court-proceeding-form button[type=submit]').click()
    await page.locator('#court-proceeding-dialog').wait_for(state='detached',timeout=12000)
    assert await page.locator('[data-proceeding-action=motion-resolve]').count()==1
    await page.locator('[data-proceeding-action=motion-resolve]').click()
    await page.locator('#court-proceeding-form [name=status]').select_option('granted')
    await page.locator('#court-proceeding-form [name=resolution]').fill('Экспертиза необходима')
    await page.locator('#court-proceeding-form button[type=submit]').click()
    await page.locator('#court-proceeding-dialog').wait_for(state='detached',timeout=12000)
    assert not await page.locator('[data-proceeding-action=motion-resolve]').count()
    await page.locator('[data-proceeding-action=deadline-add]').click()
    await page.locator('#court-proceeding-form [name=title]').fill('Представить документы')
    await page.locator('#court-proceeding-form [name=dueOn]').fill('2026-11-17')
    await page.locator('#court-proceeding-form [name=description]').fill('Исполнение определения суда')
    await page.locator('#court-proceeding-form button[type=submit]').click()
    await page.locator('#court-proceeding-dialog').wait_for(state='detached',timeout=12000)
    assert await page.locator('.court-proceedings .court-overdue').count()>0
    await page.locator('[data-proceeding-action=deadline-edit]').click()
    await page.locator('#court-proceeding-form [name=dueOn]').fill('2026-12-27')
    await page.locator('#court-proceeding-form [name=reason]').fill('Продление судом')
    await page.locator('#court-proceeding-form button[type=submit]').click()
    await page.locator('#court-proceeding-dialog').wait_for(state='detached',timeout=12000)
    await page.locator('[data-proceeding-action=deadline-complete]').click()
    await page.locator('#court-proceeding-form [name=result]').fill('Все материалы представлены')
    await page.locator('#court-proceeding-form button[type=submit]').click()
    await page.locator('#court-proceeding-dialog').wait_for(state='detached',timeout=12000)
    await change_status('hearing')
    await page.locator('[data-proceeding-action=hearing-held]').click()
    await page.locator('#court-proceeding-form [name=minutes]').fill('Заседание состоялось, показания заслушаны')
    await page.locator('#court-proceeding-form button[type=submit]').click()
    await page.locator('#court-proceeding-dialog').wait_for(state='detached',timeout=12000)
    assert not await page.locator('[data-proceeding-action=hearing-held]').count()
    for status in ['closed','archived']:
        await change_status(status)
    assert await page.locator('.court-case-history li').count()>=15
    stored=await page.evaluate("Object.values(window.__data).filter(x=>x?.type==='case')")
    assert len(stored)==1 and len(stored[0]['hearings'])==1 and stored[0]['hearings'][0]['status']=='held',stored
    assert stored[0]['motions'][0]['status']=='granted' and stored[0]['deadlines'][0]['status']=='completed'

    assert not await page.locator('#court-case-participant-form').count()
    await page.locator('.court-case-history').locator('xpath=..').locator('summary').click(timeout=5000)
    assert await page.locator('.court-case-history li').count()>=8
    await page.locator('#workspace-profile').select_option('profile_russia')
    assert not await page.locator('.court-case-row').count()
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
            count=await judicial_browser_smoke(browser)
            print(f'Judicial Proceedings Chromium E2E: {count} full flow passed')
        finally:
            await browser.close()

if __name__=='__main__':asyncio.run(main())
