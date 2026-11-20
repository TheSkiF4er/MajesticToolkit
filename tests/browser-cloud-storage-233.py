#!/usr/bin/env python3
"""Cloud Storage 2.3.3: real Chromium DOM, local-store and migration UI smoke."""
import asyncio,base64,json,re,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
    fixture=subprocess.check_output(['node','--input-type=module','-e',"import {newFamily} from './src/lib/family-core.mjs';import {newOrganization} from './src/lib/organization-core.mjs';let id='local-profile-0001';console.log(JSON.stringify({family:newFamily(id,{name:'Alpha Family'}),organization:newOrganization(id,{name:'Organization Alpha'})}));"],cwd=ROOT,text=True)
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
            await page.evaluate("""records=>{
              window.confirm=()=>true;
              const id='local-profile-0001';let now=new Date().toISOString();
              window.__local={'rpNexusStateV1':{schemaVersion:1,activeProfileId:id,updatedAt:now,profiles:[{id,name:'Client Profile',project:'majestic',server:'1',forumUrl:'https://forum.majestic-rp.ru/',createdAt:now,updatedAt:now}],preferences:{theme:'system',compact:false,startPage:'home'}},['mtFamiliesV214:'+records.family.id]:records.family,['mtOrganizationsV215:'+records.organization.id]:records.organization};
              window.browser={storage:{local:{async get(key){if(key===null)return {...__local};return {[key]:__local[key]};},async set(data){Object.assign(__local,data);},async remove(key){delete __local[key];}}}};
              window.__remote=[];window.__bindings={};window.__migrated=[];
              window.__rpc=async(action,input)=>{
                if(action==='cloudBindings')return {bindings:__bindings,profiles:__remote};
                if(action==='syncStatus')return {enabled:false,pending:0,conflicts:[],initialized:false};
                if(action==='cloudProfileCreate'){const p={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:input.name,project:input.project,server:input.server};__remote.push(p);return {profile:p};}
                if(action==='cloudBind'){__bindings[input.localProfileId]=input.cloudProfileId;return {bindings:__bindings};}
                if(action==='cloudUnbind'){delete __bindings[input.localProfileId];return {bindings:__bindings};}
                if(action==='cloudDirectory')return {kind:input.kind,entries:[],nextCursor:null};
                if(action==='cloudRecords')return {records:[]};
                if(action==='cloudImport'){__migrated.push(...input.records);return {imported:input.records.length,unchanged:0};}
                throw Error('Unexpected '+action);
              };
            }""",records)
            await page.evaluate("""async()=>{
              window.__ui=await import('mt:ui/cloud-storage-page.mjs');
              window.__team={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Team',role:'owner'};
              window.__render=async()=>{const data=await __ui.loadCloudWorkspace(__team,__rpc);document.getElementById('root').innerHTML=__ui.cloudStoragePanel(data);};
              await __render();
            }""")
            assert await page.locator('#cloud-profile-create-form').count()==1
            await page.evaluate("""async()=>{await __ui.handleCloudStorageSubmit(document.querySelector('#cloud-profile-create-form'),()=>{},__rpc);await __render();}""")
            assert await page.locator('#cloud-profile-import-form').count()==1
            assert await page.locator('input[name=record]').count()==2
            await page.locator('input[name=record]').first.check()
            await page.evaluate("""async()=>{await __ui.handleCloudStorageSubmit(document.querySelector('#cloud-profile-import-form'),()=>{},__rpc);}""")
            result=await page.evaluate("""()=>({migration:__migrated,original:Object.values(__local).filter(x=>x?.events?.length&&x?.profileId==='local-profile-0001').length})""")
            assert len(result['migration'])==1,result
            assert result['original']==2,result
            assert result['migration'][0]['record']['profileId']=='local-profile-0001'
            await page.evaluate("""async()=>{await __ui.handleCloudStorageAction(document.querySelector('[data-cloud-action=cloudUnbind]'),()=>{},__rpc);await __render();}""")
            assert await page.locator('#cloud-profile-import-form').count()==0
            assert not errors,errors
            print('Cloud Storage 2.3.3 Chromium DOM: PASS')
        finally:await browser.close()
if __name__=='__main__':asyncio.run(main())
