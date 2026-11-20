#!/usr/bin/env python3
"""2.3.7 Chromium DOM: tactical collaboration, publishing, editing, and safe rendering."""
import asyncio,base64,json,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
    modules={}
    def add_module(path):
        path=path.resolve();key='mt:'+path.relative_to(ROOT/'src').as_posix()
        if key in modules:return key
        modules[key]=''
        def rewrite(m):return m.group(1)+add_module((path.parent/m.group(2)).resolve())+m.group(1)
        source=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,path.read_text())
        modules[key]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
        return key
    add_module(ROOT/'src/ui/cloud-tactical-page.mjs')
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            page=await browser.new_page();errors=[]
            page.on('pageerror',lambda err:errors.append(str(err)))
            await page.set_content('<!doctype html><html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><main id="root"></main></body></html>')
            await page.evaluate('''()=>{
              window.confirm=()=>true;
              window.__calls=[];
              window.__team={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Team <img src=x onerror=alert(9)>',role:'editor'};
              const cloud='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
              window.__storage={remote:{id:cloud,name:'Tactical RP'},chosen:{id:'profile-test-237'}};
              window.__items=[];
              window.__rpc=async(action,input)=>{
                __calls.push({action,input});
                if(action==='tacticalList')return {records:__items,nextCursor:null};
                if(action==='tacticalChanges')return {changes:[],hasMore:false,cursor:0};
                if(action==='tacticalLocalChoices')return {choices:[{kind:'territory',id:'territory-test-237',title:'Local territory'}]};
                if(action==='tacticalGet'){
                  const item=__items.find(x=>x.kind===input.kind&&x.id===input.id);
                  if(!item)throw Error('Запись не найдена');return {entry:item};
                }
                if(action==='tacticalPublishLocal'){
                  const row={kind:'territory',id:input.id,version:1,updatedBy:'user-1',updatedAt:new Date().toISOString(),record:{id:input.id,name:'<script>alert(1)</script>',region:'Center',notes:'',archived:false,events:[]}};
                  __items=[row];return {version:1};
                }
                if(action==='tacticalEdit'){
                  const row=__items.find(x=>x.id===input.id);row.record.name=input.fields.name;row.version++;
                  return {version:row.version};
                }
                if(action==='tacticalImportRemote')return {imported:true};
                throw Error('Unexpected action '+action);
              };
            }''')
            await page.evaluate('''async()=>{
              window.__ui=await import('mt:ui/cloud-tactical-page.mjs');
              window.__render=async()=>{const data=await __ui.loadTeamTactical(__team,__storage,__rpc);document.querySelector('#root').innerHTML=__ui.teamTacticalPanel(data);};
              await __render();
            }''')
            assert await page.locator('#cloud-tactical-publish-form').count()==1
            await page.evaluate('''async()=>{await __ui.handleTacticalForm(document.querySelector('#cloud-tactical-publish-form'),()=>{},__rpc);await __render();}''')
            assert await page.locator('#cloud-tactical-edit-form').count()==1
            assert await page.locator('#root script').count()==0
            assert await page.locator('#root img').count()==0
            await page.locator('#cloud-tactical-edit-form input[name=name]').fill('Updated Territory')
            await page.evaluate('''async()=>{await __ui.handleTacticalForm(document.querySelector('#cloud-tactical-edit-form'),()=>{},__rpc);await __render();}''')
            assert 'Updated Territory' in await page.locator('#cloud-tactical-panel').inner_text()
            await page.evaluate('''async()=>{await __ui.handleTacticalAction(document.querySelector('[data-cloud-action=tacticalImport]'),()=>{},__rpc);}''')
            assert (await page.evaluate('''()=>__calls.some(c=>c.action==='tacticalImportRemote')'''))
            await page.evaluate('''async()=>{__team.role='viewer';await __render();}''')
            assert await page.locator('#cloud-tactical-publish-form').count()==0
            assert await page.locator('#cloud-tactical-edit-form').count()==0
            assert not errors,errors
            print('Collaborative Tactical Workspace 2.3.7 Chromium DOM: PASS')
        finally:await browser.close()
if __name__=='__main__':asyncio.run(main())
