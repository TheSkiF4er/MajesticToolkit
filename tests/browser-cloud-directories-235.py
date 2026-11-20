#!/usr/bin/env python3
"""2.3.5 Chromium DOM coverage: common directory search, paging, product migration and XSS escaping."""
import asyncio,base64,json,re,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
    fixture=subprocess.check_output(['node','--input-type=module','-e',"import {newFamily} from './src/lib/family-core.mjs';import {newOrganization} from './src/lib/organization-core.mjs';import {newMarketRecord} from './src/lib/marketplace-core.mjs';let id='local-profile-0001';console.log(JSON.stringify({family:newFamily(id,{name:'Local Family'}),organization:newOrganization(id,{name:'Local Organization'}),product:newMarketRecord('product',id,{name:'Local Product',category:'Предметы',variant:'',unit:'шт.',note:''})}));"],cwd=ROOT,text=True)
    records=json.loads(fixture)
    modules={}
    def add_module(path):
        path=path.resolve();key='mt:'+path.relative_to(ROOT/'src').as_posix()
        if key in modules:return key
        modules[key]=''
        def rewrite(m):return m.group(1)+add_module((path.parent/m.group(2)).resolve())+m.group(1)
        source=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,path.read_text())
        modules[key]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
        return key
    add_module(ROOT/'src/ui/cloud-storage-page.mjs')
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            page=await browser.new_page();errors=[]
            page.on('pageerror',lambda err:errors.append(str(err)))
            await page.set_content('<!doctype html><html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><main id="root"></main></body></html>')
            await page.evaluate("""r=>{
              window.confirm=()=>true;
              const id='local-profile-0001';let now=new Date().toISOString();
              window.__local={'rpNexusStateV1':{schemaVersion:1,activeProfileId:id,updatedAt:now,profiles:[{id,name:'Local Profile',project:'majestic',server:'One',forumUrl:'https://forum.majestic-rp.ru/',createdAt:now,updatedAt:now}],preferences:{theme:'system',compact:false,startPage:'home'}},['mtFamiliesV214:'+r.family.id]:r.family,['mtOrganizationsV215:'+r.organization.id]:r.organization,['mtMarketplaceV212:'+r.product.id]:r.product};
              window.browser={storage:{local:{async get(k){if(k===null)return {...__local};return {[k]:__local[k]};},async set(x){Object.assign(__local,x)},async remove(k){delete __local[k];}}}};
              window.__remote=[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Cloud Profile',project:'majestic',server:'One'}];window.__bindings={[id]:__remote[0].id};window.__imports=[];
              window.__rpc=async(action,input)=>{
                if(action==='cloudBindings')return {bindings:__bindings,profiles:__remote};
                if(action==='syncStatus')return {enabled:false,pending:0,conflicts:[],initialized:false};
                if(action==='cloudRecords')return {records:[]};
                if(action==='cloudDirectory')return {kind:input.kind,entries:[{id:'directory-12345',kind:input.kind,name:'<img src=x onerror=alert(1)>',sourceKind:'product',sourceId:'prod-12345',record:{category:'Предметы',variant:'',unit:'шт.',archived:false}}],nextCursor:input.after?null:'directory-12345'};
                if(action==='cloudImport'){__imports.push(...input.records);return {imported:input.records.length,unchanged:0};}
                throw Error('Unexpected '+action);
              };
            }""",records)
            await page.evaluate("""async()=>{
              window.__ui=await import('mt:ui/cloud-storage-page.mjs');
              window.__team={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Team',role:'owner'};
              window.__render=async()=>{const data=await __ui.loadCloudWorkspace(__team,__rpc);document.getElementById('root').innerHTML=__ui.cloudStoragePanel(data);};await __render();
            }""")
            assert await page.locator('input[name=record]').count()==3
            assert await page.locator('#cloud-directory-filter-form').count()==1
            assert await page.locator('#root img').count()==0,'cloud names must be escaped'
            await page.locator('#cloud-directory-filter-form select[name=kind]').select_option('product')
            await page.locator('#cloud-directory-filter-form input[name=q]').fill('Комплект')
            await page.evaluate("""async()=>{await __ui.handleCloudStorageSubmit(document.querySelector('#cloud-directory-filter-form'),()=>{},__rpc);await __render();}""")
            assert await page.locator('#cloud-directory-filter-form select[name=kind]').input_value()=='product'
            assert await page.locator('#cloud-directory-filter-form input[name=q]').input_value()=='Комплект'
            assert await page.locator('#root img').count()==0
            await page.evaluate("""async()=>{await __ui.handleCloudStorageAction(document.querySelector('[data-cloud-action=directoryNext]'),()=>{},__rpc);await __render();}""")
            assert await page.locator('[data-cloud-action=directoryFirst]').count()==1
            await page.locator('input[name=record][value^="product:"]').check()
            await page.evaluate("""async()=>{await __ui.handleCloudStorageSubmit(document.querySelector('#cloud-profile-import-form'),()=>{},__rpc);}""")
            imports=await page.evaluate('()=>__imports')
            assert len(imports)==1 and imports[0]['kind']=='product' and imports[0]['record']['name']=='Local Product',imports
            assert len(errors)==0,errors
            print('Cloud Directories 2.3.5 Chromium DOM: PASS')
        finally:await browser.close()
if __name__=='__main__':asyncio.run(main())
