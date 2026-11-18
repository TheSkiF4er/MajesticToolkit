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
    await page.evaluate("""async () => {
      const core=await import('mt:lib/government-core.mjs');
      const cases=await import('mt:lib/judicial-case-core.mjs');
      const profile='profile_majest';
      const superiorDep=core.createDepartment(profile,{name:'Appeals Tribunal 209',code:'A209',officer:'Appeal Judge',position:'Judge'});
      const districtDep=core.createDepartment(profile,{name:'District Tribunal 209',code:'D209',officer:'District Judge',position:'Judge'});
      const superior=core.createCourt(profile,{departmentId:superiorDep.id,level:'appeal',status:'active'});
      const district=core.createCourt(profile,{departmentId:districtDep.id,level:'first',parentCourtId:superior.id,status:'active'});
      const jurisdiction=core.createCourtJurisdiction(profile,{courtId:superior.id,stage:'appeal',category:'*',territory:'*',legalBasis:'Rules 209',priority:0,status:'active'});
      let record=cases.createJudicialCase(profile,{courtId:district.id,number:'CASE-209',title:'Judicial review E2E',category:'civil',territory:'Los Santos',summary:'Facts to review'});
      record=cases.mutateCaseParticipants(record,'add',{role:'claimant',name:'QA Claimant 209',notes:''});
      record=cases.changeCaseStatus(record,'filed','Received');
      record=cases.changeCaseStatus(record,'accepted','Admitted');
      record=cases.changeCaseStatus(record,'closed','Hearings completed');
      const records=[superiorDep,districtDep,superior,district,jurisdiction,record];
      core.validateGovernment(records);
      await browser.storage.local.set(Object.fromEntries(records.map(row=>[core.GOV_PREFIX+row.id,row])));
    }""")
    await page.locator('.nav [data-view=justice]').click()
    await page.locator('.justice-tabs [data-tab=cases]').click()
    await page.locator('.court-case-row').filter(has_text='CASE-209').get_by_role('button',name='Открыть').click()
    await page.locator('.court-judgments').wait_for(timeout=15000)
    await page.locator('.court-judgments summary').filter(has_text='Подготовить судебное решение').click()
    for name,value in [('facts','Facts established'),('legalBasis','Law 209 article 5'),('reasoning','Evidence evaluated'),('resolution','Claims granted'),('signer','Judge QA')]:
        await page.locator(f'#court-judgment-draft-form [name={name}]').fill(value)
    await page.locator('#court-judgment-draft-form button[type=submit]').click()
    await page.locator('.court-judgments [data-judgment-action=approve]').wait_for(timeout=15000)
    await page.locator('.court-judgments [data-judgment-action=approve]').click()
    await page.locator('.court-judgments [data-judgment-action=verify]').wait_for(timeout=15000)
    await page.locator('.court-judgments [data-judgment-action=verify]').click()
    await page.locator('.court-judgments summary').filter(has_text='Подать апелляцию').click()
    await page.locator('#court-appeal-file-form [name=number]').fill('APP-209')
    await page.locator('#court-appeal-file-form [name=grounds]').fill('Wrong interpretation of statute')
    await page.locator('#court-appeal-file-form button[type=submit]').click()
    await page.locator('.court-case-detail').get_by_text('Дело № APP-209',exact=False).wait_for(timeout=15000)
    for status in ['filed','accepted','closed']:
        await page.locator('#court-case-status-form [name=status]').select_option(status)
        await page.locator('#court-case-status-form [name=reason]').fill('Review phase '+status)
        await page.locator('#court-case-status-form button[type=submit]').click()
        await page.wait_for_function('(s)=>Object.values(window.__data).some(r=>r?.type==="case"&&r.number==="APP-209"&&r.status===s)',arg=status,timeout=15000)
    await page.locator('.court-judgments summary').filter(has_text='Подготовить судебное решение').click()
    for name,value in [('facts','Appeal facts'),('legalBasis','Higher court rules'),('reasoning','Lower court reasoning incorrect'),('resolution','Overturn original decision'),('signer','Appeal Judge QA')]:
        await page.locator(f'#court-judgment-draft-form [name={name}]').fill(value)
    await page.locator('#court-judgment-draft-form button[type=submit]').click()
    await page.locator('.court-judgments [data-judgment-action=approve]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(r=>r?.type==="case"&&r.number==="APP-209"&&r.judgments?.length===1)',timeout=15000)
    await page.locator('.court-judgments [data-court-case-action=open-linked]').click()
    await page.locator('#court-appeal-resolution-form [name=outcome]').select_option('overturned')
    await page.locator('#court-appeal-resolution-form [name=resolution]').fill('Original judgment overturned by the appeals tribunal')
    await page.locator('#court-appeal-resolution-form button[type=submit]').click()
    await page.wait_for_function('()=>Object.values(window.__data).some(r=>r?.type==="case"&&r.number==="CASE-209"&&r.appeals[0]?.status==="overturned")',timeout=15000)
    original=await page.evaluate('Object.values(window.__data).find(r=>r?.type==="case"&&r.number==="CASE-209")')
    child=await page.evaluate('Object.values(window.__data).find(r=>r?.type==="case"&&r.number==="APP-209")')
    assert len(original['judgments'])==1 and len(original['appeals'])==1
    assert original['appeals'][0]['reviewJudgmentId']==child['judgments'][0]['id']
    assert child['origin']['caseId']==original['id']
    # AI can resolve current case by ID and show a preview without sending it.
    await page.locator('.nav [data-view=ai]').click()
    await page.locator('#ai-workspace-context-kind').wait_for(timeout=15000)
    await page.locator('#ai-workspace-context-kind').select_option('judicial')
    await page.wait_for_function('()=>document.querySelector("#ai-workspace-context-item")?.options.length===2',timeout=15000)
    await page.locator('#ai-workspace-context-item').select_option(original['id'])
    await page.locator('#ai-workspace-apply').click()
    await page.wait_for_function('()=>document.querySelector("#ai-preview")?.textContent.includes("CASE-209")',timeout=15000)
    preview=await page.locator('#ai-preview').inner_text()
    assert 'CASE-209' in preview and 'QA Claimant 209' not in preview
    assert not await page.locator('#ai-confirm').is_checked()
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
            print(f'Decisions & Appeals Chromium E2E: {count} full flow passed')
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
