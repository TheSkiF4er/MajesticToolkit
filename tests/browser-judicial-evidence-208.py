#!/usr/bin/env python3
"""2.0.8 Judicial Evidence & Dossier: real Chromium forms and IndexedDB."""
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
        await page.evaluate("""()=>{
          const tables=new Map();
          const schedule=(fn)=>setTimeout(fn,0);
          const factory={open(name){
            const request={result:null};schedule(()=>{
              const fresh=!tables.has(name);if(fresh)tables.set(name,new Map());const table=tables.get(name);
              const db={createObjectStore(){return {createIndex(){}};},close(){},transaction(){
                const tx={oncomplete:null,onerror:null,pending:0,finished:false};
                const finish=()=>{if(tx.pending!==0||tx.finished)return;tx.finished=true;schedule(()=>tx.oncomplete?.());};
                const wrap=(value)=>{const r={result:null};tx.pending++;schedule(()=>{try{r.result=value();r.onsuccess?.();}catch(error){window.__idbErr=String(error)+' '+error?.stack;r.error=error;tx.onerror?.();}finally{tx.pending--;finish();}});return r;};
                const api={get(id){return wrap(()=>table.get(id));},add(value){return wrap(()=>{if(table.has(value.id))throw Error('ConstraintError');table.set(value.id,structuredClone(value));});},put(value){return wrap(()=>table.set(value.id,structuredClone(value)));},delete(id){return wrap(()=>table.delete(id));},index(){return {getAll(profile){return wrap(()=>[...table.values()].filter(x=>x.profileId===profile).map(x=>structuredClone(x)));},openCursor(profile){
                  const values=[...table.values()].filter(x=>profile==null||x.profileId===profile);let pos=0;
                  const r={result:null};const step=()=>{tx.pending++;schedule(()=>{r.result=pos<values.length?{value:values[pos],continue(){pos++;step();},delete(){table.delete(values[pos].id);}}:null;r.onsuccess?.();tx.pending--;finish();});};step();return r;
                }};}};
                api.openCursor=()=>api.index().openCursor(null);
                tx.objectStore=()=>api;return tx;
              }};request.result=db;if(fresh)request.onupgradeneeded?.();request.onsuccess?.();
            });return request;
          }};
          Object.defineProperty(window,'indexedDB',{value:factory,configurable:true});
          if(!crypto.randomUUID)crypto.randomUUID=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
          if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{value:{async digest(algorithm,buffer){if(algorithm!=='SHA-256')throw Error('SHA-256 expected');return Uint8Array.from(await window.__fixtureSha256(Array.from(new Uint8Array(buffer)))).buffer;}}});
        }""")
        await page.evaluate(mock,seed)
        await page.evaluate('route=>history.replaceState(null,"",route)',route)
        await page.evaluate("import('mt:ui/main.mjs')")
    await boot(page)
    await page.locator('.nav [data-view=justice]').click()
    await page.locator('.justice-tabs').wait_for(timeout=15000)
    await page.locator('[data-government-action=new-department]').first.click()
    await page.locator('#government-form [name=name]').fill('QA Evidence District Court')
    await page.locator('#government-form [name=code]').fill('QA-J208')
    await page.locator('#government-form [name=officer]').fill('Chief Justice')
    await page.locator('#government-form [name=position]').fill('Судья')
    await page.locator('#government-form button[type=submit]').click()
    await page.locator('#government-dialog').wait_for(state='detached')
    await page.locator('.justice-tabs [data-tab=courts]').click()
    await page.locator('.judicial-panel [data-court-action=new-court]').first.click()
    await page.locator('#judicial-form [name=departmentId]').select_option(label='QA Evidence District Court (QA-J208)')
    await page.locator('#judicial-form [name=level]').select_option('first')
    await page.locator('#judicial-form button[type=submit]').click()
    await page.locator('#judicial-dialog').wait_for(state='detached')
    await page.locator('.justice-tabs [data-tab=cases]').click()
    await page.locator('.court-case-panel [data-court-case-action=new]').click()
    await page.locator('#court-case-form [name=number]').fill('QA-208')
    await page.locator('#court-case-form [name=title]').fill('Материалы судебного производства')
    await page.locator('#court-case-form [name=category]').fill('Гражданское')
    await page.locator('#court-case-form [name=territory]').fill('Los Santos')
    await page.locator('#court-case-form button[type=submit]').click()
    await page.locator('#court-case-dialog').wait_for(state='detached')
    await page.locator('.court-evidence-panel').wait_for()
    assert await page.locator('.court-evidence-row').count()==0
    await page.locator('.court-evidence-add summary').click()
    await page.locator('#court-evidence-link-form [name=title]').fill('Запись происшествия')
    await page.locator('#court-evidence-link-form [name=url]').fill('https://example.org/qa-208')
    await page.locator('#court-evidence-link-form [name=note]').fill('Видео с места')
    await page.locator('#court-evidence-link-form button[type=submit]').click()
    await page.locator('.court-evidence-row').filter(has_text='Запись происшествия').wait_for(timeout=12000)
    await page.locator('.court-evidence-row [data-court-evidence-action=verify]').click()
    await page.locator('.court-evidence-row [data-court-evidence-action=edit]').click()
    await page.locator('#court-evidence-edit-form [name=title]').fill('Запись происшествия (проверено)')
    await page.locator('#court-evidence-edit-form [name=category]').select_option('video')
    await page.locator('#court-evidence-edit-form button[type=submit]').click()
    await page.locator('.court-evidence-row').get_by_text('Запись происшествия (проверено)',exact=True).wait_for(timeout=12000)
    # Native IndexedDB + browser SHA-256; a real local text file is persisted and verified.
    await page.locator('.court-evidence-add summary').click()
    await page.locator('#court-evidence-file-form [name=file]').set_input_files({'name':'proof.txt','mimeType':'text/plain','buffer':b'Judicial evidence QA 208'})
    await page.locator('#court-evidence-file-form [name=title]').fill('Материал в файле')
    await page.locator('#court-evidence-file-form button[type=submit]').click()
    await page.locator('.court-evidence-row').filter(has_text='Материал в файле').wait_for(timeout=12000)
    assert await page.locator('.court-evidence-row').count()==2
    await page.locator('.court-evidence-row').filter(has_text='Материал в файле').locator('[data-court-evidence-action=verify]').click()
    case=await page.evaluate("Object.values(window.__data).find(x=>x?.type==='case')")
    assert len(case['evidence'])==2 and case['revision']==len(case['history'])
    file_meta=[x['snapshot'] for x in case['evidence'] if x['snapshot']['kind']=='file'][0]
    assert len(file_meta['sha256'])==64
    # Vault deletion is blocked while the evidence remains attached to the case.
    error=await page.evaluate('''async(id)=>{try{await (await import('mt:lib/evidence-vault.mjs')).deleteVaultRecord(id,'profile_majest');return null;}catch(e){return e.message;}}''',file_meta['id'])
    assert 'судебному делу' in error,error
    # Actual ZIP download and round-trip verification in page using the application verifier.
    await page.locator('.court-evidence-panel [data-court-evidence-action=dossier]').click()
    await page.locator('#court-evidence-dossier-dialog').wait_for()
    async with page.expect_download(timeout=18000) as download_info:
        await page.locator('#court-evidence-dossier-dialog button').filter(has_text='Проверить и скачать').click()
    download=await download_info.value
    assert download.suggested_filename.endswith('.zip')
    info=await page.evaluate('''async()=>{const g=await import('mt:lib/government-store.mjs'),s=await import('mt:lib/document-store.mjs'),d=await import('mt:lib/judicial-dossier.mjs');const gov=await g.listGovernment();const c=gov.find(x=>x.type==='case');const report=d.assembleJudicialDossier(c,gov,await s.listDocumentRecords());const zip=await d.createJudicialDossierArchive(report);const checked=await d.verifyJudicialDossierArchive(zip.blob);return {missing:checked.manifest.attachments.filter(x=>x.status==='missing').length,included:checked.manifest.attachments.filter(x=>x.status==='included').length};}''')
    assert info=={'missing':0,'included':1},info
    await page.locator('#court-evidence-dossier-dialog [data-court-evidence-action=close-dialog]').click()
    # 2.1.0 GA: real overdue court deadline appears on the shared dashboard.
    await page.evaluate("""async()=>{
      const g=await import('mt:lib/government-store.mjs');
      const row=(await g.listGovernment()).find(x=>x.type==='case'&&x.number==='QA-208');
      await g.mutateCourtCaseParticipant(row.id,'add',{name:'GA witness',role:'claimant',notes:''});
      await g.setCourtCaseStatus(row.id,'filed','Заявление подано');
      await g.setCourtCaseStatus(row.id,'accepted','Принято');
      await g.mutateCourtCaseDeadline(row.id,'add',{title:'Проверить материалы дела GA',dueOn:'2026-11-01',description:'Срок для проверки'});
    }""")
    await page.locator('.justice-tabs [data-tab=overview]').click()
    await page.get_by_text('Проверить материалы дела GA',exact=False).wait_for(timeout=15000)
    assert await page.locator('.justice-workspace').get_by_text('Просрочено').count()>=1
    await page.locator('[data-justice-action=integrity]').click()
    await page.get_by_text('Нарушений не обнаружено.',exact=False).wait_for(timeout=20000)
    await page.locator('.justice-workspace [data-justice-action=open][data-kind=case]').first.click()
    await page.locator('.court-case-detail').wait_for()
    assert await page.locator('.court-case-detail').get_by_text('QA-208',exact=False).count()>0
    # Export uses the current v21 serializer and preserves historical judicial links and files.
    await page.locator('.nav [data-view=backup]').click()
    import json
    async with page.expect_download(timeout=20000) as exported:
        await page.locator('[data-action=export]').click()
    artifact=await exported.value
    backup=json.loads(Path(await artifact.path()).read_text())
    assert backup['schemaVersion']==21 and any(x.get('number')=='QA-208' for x in backup['government'])
    assert len(backup['evidenceVault'])>=2
    # The portable backup contains real Vault bytes and verifies them on roundtrip.
    async with page.expect_download(timeout=20000) as portable:
        await page.locator('[data-action=backup-portable-export]').click()
    assert (await portable.value).suggested_filename.endswith('.zip')
    await page.locator('.nav [data-view=justice]').click()
    await page.locator('.justice-tabs [data-tab=cases]').click()
    await page.locator('#workspace-profile').select_option('profile_russia')
    await page.locator('.court-case-detail').wait_for(state='detached')
    assert not await page.locator('.court-evidence-row').count()
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
            print(f'Judicial Evidence Chromium E2E: {count} full flow passed')
        finally:
            await browser.close()

if __name__=='__main__':asyncio.run(main())
