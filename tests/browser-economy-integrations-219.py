#!/usr/bin/env python3
"""Economy Integrations 2.1.9: import dry-run, confirmed write, links and profile separation."""
import asyncio, base64, hashlib, json, os, re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def smoke(browser):
    context=await browser.new_context(accept_downloads=True,viewport={'width':1320,'height':920})
    page=await context.new_page()
    errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
    modules={}
    def add(path):
        path=path.resolve();key='mt:'+path.relative_to(ROOT/'src').as_posix()
        if key in modules:return key
        modules[key]=''
        def rewrite(m):return m.group(1)+add((path.parent/m.group(2)).resolve())+m.group(1)
        body=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,path.read_text())
        modules[key]='data:text/javascript;base64,'+base64.b64encode(body.encode()).decode()
        return key
    add(ROOT/'src/ui/main.mjs')
    vault_stub = """
let rows=[];
export const VAULT_LIMITS={itemsPerProfile:1000,fileBytes:32000000,totalBytes:256000000};
export const cleanVaultMetadata=x=>x;
export const listVault=async profileId=>rows.filter(r=>r.profileId===profileId);
export const addVaultLink=async (profileId,input)=>{const r={id:crypto.randomUUID(),profileId,kind:'link',title:input.title,note:input.note??'',url:input.url,seconds:null,createdAt:new Date().toISOString()};rows.push(r);return r;};
export async function deleteVaultRecord(id,profileId){const stored=await browser.storage.local.get(null);if(Object.entries(stored).some(([k,v])=>k.startsWith('mtEconomyLinkV219:')&&v.sourceId===id&&v.profileId===profileId))throw Error('Доказательство связано с экономическим объектом');rows=rows.filter(x=>x.id!==id);}
export const getVaultRecord=async id=>({meta:rows.find(r=>r.id===id),blob:null});
export const verifyVaultFile=async id=>{throw Error('Fixture does not have binary files');};
export const downloadVaultFile=verifyVaultFile;
export const addVaultFile=verifyVaultFile;
export const clearVaultProfile=async id=>{rows=rows.filter(x=>x.profileId!==id);};
export const editVaultMetadata=async()=>{};
export const importVaultPackage=async()=>[];
export const rollbackVaultPackage=async()=>{};
"""
    modules['mt:lib/evidence-vault.mjs']='data:text/javascript;base64,'+base64.b64encode(vault_stub.encode()).decode()
    html=(ROOT/'src/ui/workspace.html').read_text().replace('<link rel="stylesheet" href="styles.css">','').replace('<script type="module" src="main.mjs"></script>','')
    html=html.replace('</head>','<script type="importmap">'+json.dumps({'imports':modules})+'</script></head>')
    await page.set_content(html)
    # about:blank has no native IndexedDB; use only a platform adapter here.
    # Native IndexedDB is covered by browser-tactical-ga-230.py.
    await page.evaluate((ROOT/'tests/browser-idb-fixture.js').read_text())
    await page.add_style_tag(content=(ROOT/'src/ui/styles.css').read_text())
    await page.expose_function('__sha256',lambda data:list(hashlib.sha256(bytes(data)).digest()))
    await page.evaluate('''() => {
       const now='2026-11-15T00:00:00.000Z';
       const p1={id:'profile_majest',name:'Majestic QA',project:'majestic',server:'Alpha',forumUrl:'https://forum.majestic-rp.ru/',createdAt:now,updatedAt:now};
       const p2={id:'profile_russia',name:'Russia QA',project:'russia-online',server:'Beta',forumUrl:'https://forum.russia.online/',createdAt:now,updatedAt:now};
       const storage={rpNexusStateV1:{schemaVersion:1,activeProfileId:p1.id,profiles:[p1,p2],preferences:{theme:'dark',compact:false,startPage:'home'},updatedAt:now}};
       window.__storage=storage;const listeners=[];
       const notify=changes=>queueMicrotask(()=>listeners.forEach(fn=>fn(changes,'local')));
       const event={addListener(){},removeListener(){}};
       window.browser={runtime:{id:'fixture',getURL:x=>'http://127.0.0.1:8765/'+x,onMessage:event,async sendMessage(){return {ok:true,value:[]};}},permissions:{async contains(){return false;},onAdded:event,onRemoved:event},tabs:{async create(){return {};},async query(){return [];},async sendMessage(){return {}; }},storage:{onChanged:{addListener(fn){listeners.push(fn);}},local:{async get(k){if(k===null)return structuredClone(storage);if(Array.isArray(k))return Object.fromEntries(k.map(x=>[x,storage[x]]));if(typeof k==='object')return {...k,...Object.fromEntries(Object.keys(k).filter(x=>x in storage).map(x=>[x,storage[x]]))};return {[k]:storage[k]};},async set(x){const changes={};for(const [k,v] of Object.entries(x)){changes[k]={oldValue:storage[k],newValue:v};storage[k]=structuredClone(v);}notify(changes);},async remove(keys){const changes={};for(const k of Array.isArray(keys)?keys:[keys]){changes[k]={oldValue:storage[k]};delete storage[k];}notify(changes);}}}};
       window.confirm=()=>true;
       if(!crypto.randomUUID)crypto.randomUUID=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
       if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{value:{async digest(alg,data){if(alg!=='SHA-256')throw Error('wrong algorithm');return Uint8Array.from(await window.__sha256(Array.from(new Uint8Array(data)))).buffer;}}});
    }''')
    await page.evaluate("import('mt:ui/main.mjs')")
    await page.evaluate('''async()=>{
      const market=await import('mt:lib/marketplace-store.mjs');const vault=await import('mt:lib/evidence-vault.mjs');
      const pid='profile_majest';
      const p=await market.addMarketplace('product',pid,{name:'Warehouse car',category:'Транспорт',variant:'T1',unit:'шт.',note:''});
      const a=await market.addMarketplace('price',pid,{productId:p.id,date:'2026-11-17',kind:'completed',price:100,quantity:1,source:'Forum',url:'',note:''});
      window.__product=p;
      const source=await vault.addVaultLink(pid,{title:'Proof: forum',url:'https://forum.example.com/posts/123'});window.__source=source;
      const transfer=await import('mt:lib/economy-transfer.mjs');
      const newer={...a,id:crypto.randomUUID(),date:'2026-11-18',price:150};
      window.__csv=transfer.exportMarketData([p,a,newer],pid);
    }''')
    await page.locator('[data-view="economy"]').first.click()
    await page.locator('[data-economy-action="tab"][data-tab="exchange"]').click()
    assert await page.locator('#economy-integrations').count()==1
    assert await page.locator('#econ-int-link-form option').filter(has_text='Warehouse car').count()==1
    await page.locator('#econ-int-link-form [name=source]').select_option(label='Evidence Vault: Proof: forum')
    await page.locator('#econ-int-link-form [name=note]').fill('Purchase evidence')
    await page.locator('#econ-int-link-form button[type=submit]').click()
    await page.get_by_text('Purchase evidence').wait_for()
    assert await page.evaluate('''async()=>{
      const s=await import('mt:lib/economy-links-store.mjs');return (await s.listEconomyLinks('profile_majest')).length;
    }''')==1
    # Source cannot be deleted until the link is explicitly removed.
    assert await page.evaluate('''async()=>{
      const v=await import('mt:lib/evidence-vault.mjs');try{await v.deleteVaultRecord(window.__source.id,'profile_majest');return false;}catch(e){return /связано/.test(e.message);}
    }''')
    csv=await page.evaluate('window.__csv')
    await page.locator('#econ-int-file').set_input_files({'name':'market.csv','mimeType':'text/csv','buffer':csv.encode()})
    await page.locator('#econ-import-preview').get_by_text('новые товары:',exact=False).wait_for()
    before=await page.evaluate("(async()=> (await (await import('mt:lib/marketplace-store.mjs')).listMarketplace('profile_majest')).length)()")
    assert before==2
    assert 'цены: 1' in await page.locator('#econ-import-preview').inner_text()
    await page.locator('[data-econ-int-action=commit]').click()

    await page.wait_for_function("async()=> (await (await import('mt:lib/marketplace-store.mjs')).listMarketplace('profile_majest')).length===3")
    await page.locator('[data-econ-int-action=export][data-format=json]').click()

    parsed=json.loads(await page.evaluate("(async()=>{const s=await import('mt:lib/economy-transfer.mjs');const m=await import('mt:lib/marketplace-store.mjs');return s.exportMarketData(await m.listMarketplace(),'profile_majest','json')})()"))
    assert parsed['format']=='majestictoolkit-market-import' and len(parsed['rows'])==3
    await page.locator('#workspace-profile').select_option('profile_russia')
    await page.locator('[data-economy-action=tab][data-tab=exchange]').click()
    assert 'Purchase evidence' not in await page.locator('#economy-tab-panel').inner_text()
    await page.locator('#workspace-profile').select_option('profile_majest')
    await page.locator('[data-economy-action=tab][data-tab=exchange]').click()
    assert 'Purchase evidence' in await page.locator('#economy-tab-panel').inner_text()
    await page.locator('[data-view=backup]').first.click()
    async with page.expect_download(timeout=20000) as download:
        await page.locator('[data-action=export]').click()
    backup_text=Path(await (await download.value).path()).read_text(encoding='utf8')
    restored=json.loads(backup_text)
    assert restored['schemaVersion']==21 and len(restored['economyLinks'])==1
    assert len(restored['marketplace'])==3 and len(restored['evidenceVault'])==1
    await page.evaluate('''async(text)=>{
      const {parseBackupV21}=await import('mt:lib/tactical-backup-v21.mjs');
      const {validateState}=await import('mt:lib/model.mjs');
      const back=await parseBackupV21(text,validateState,globalThis.RPNForumCore.cleanTemplate);
      if(back.economyLinks.length!==1||back.schemaVersion!==21)throw Error('Backup v21 failed round trip');
    }''',backup_text)
    await page.locator('[data-view=economy]').first.click()
    await page.locator('[data-economy-action=tab][data-tab=exchange]').click()
    await page.locator('[data-econ-int-action=unlink]').click()
    assert await page.evaluate("(async()=> (await (await import('mt:lib/economy-links-store.mjs')).listEconomyLinks('profile_majest')).length)()") == 0
    assert not errors,errors
    await context.close()
    return 1
async def main():
    async with async_playwright() as p:
        binary=os.environ.get('MAJESTIC_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**({'executable_path':binary} if binary else {}))
        try:print(f'Economy Integrations 2.1.9 Chromium E2E: {await smoke(browser)} completed scenario')
        finally:await browser.close()
if __name__=='__main__':asyncio.run(main())
