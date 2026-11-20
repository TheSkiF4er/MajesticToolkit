#!/usr/bin/env python3
"""2.3.8 Chromium UI: private-by-default upload, shared visibility, revisions, attachments, safe escaping."""
import asyncio,base64,json,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
 modules={}
 def add(path):
  path=path.resolve();key='mt:'+path.relative_to(ROOT/'src').as_posix()
  if key in modules:return key
  modules[key]=''
  def rewrite(m):return m.group(1)+add((path.parent/m.group(2)).resolve())+m.group(1)
  source=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,path.read_text())
  modules[key]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode();return key
 add(ROOT/'src/ui/cloud-files-page.mjs')
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  try:
   page=await browser.new_page();errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
   await page.set_content('<!doctype html><html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><main id="root"></main></body></html>')
   await page.evaluate('''()=>{
    window.confirm=()=>true;window.__calls=[];window.__files=[];
    window.__team={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Team',role:'editor'};
    window.__storage={remote:{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Profile'},chosen:{id:'profile-files-test'}};
    window.__rpc=async(action,input)=>{
     __calls.push({action,input});
     if(action==='fileList')return {files:__files,nextCursor:null};
     if(action==='fileVersions')return {versions:[{version:1,title:'First',size:50,sha256:'1'.repeat(64),createdAt:new Date().toISOString()}]};
     if(action==='fileLinks')return {links:[]};
     if(action==='fileLocalChoices')return {choices:[{id:'vault-file-238',kind:'file',name:'proof.txt',title:'Local evidence'}]};
     if(action==='fileUpload'){
      const f={id:'cccccccc-cccc-cccc-cccc-cccccccccccc',title:'<img src=x onerror=alert(9)>',name:'proof.txt',note:'<script>alert(1)</script>',size:50,mime:'text/plain',sha256:'1'.repeat(64),visibility:input.visibility,version:1,authorId:'u'};
      __files=[f];return {file:f};
     }
     if(action==='fileGet')return {file:__files[0]};
     if(action==='fileMeta'){__files[0].visibility=input.visibility;__files[0].version++;return {file:__files[0]};}
     if(action==='fileImportLocal')return {record:{title:'Imported evidence'}};
     if(action==='fileDelete'){__files=[];return {ok:true};}
     throw Error('Unexpected action '+action);
    };
   }''')
   await page.evaluate('''async()=>{
    window.__ui=await import('mt:ui/cloud-files-page.mjs');
    window.__render=async()=>{const d=await __ui.loadCloudFiles(__team,__storage,__rpc);document.querySelector('#root').innerHTML=__ui.cloudFilesPanel(d);};
    await __render();
   }''')
   assert await page.locator('#cloud-files-upload-form').count()==1
   await page.evaluate('''async()=>{await __ui.handleCloudFilesSubmit(document.querySelector('#cloud-files-upload-form'),()=>{},__rpc);await __render();}''')
   assert await page.locator('#cloud-files-meta-form').count()==1
   assert await page.locator('#root img').count()==0
   assert await page.locator('#root script').count()==0
   assert await page.locator('select[name=visibility]').count()==2
   await page.locator('#cloud-files-meta-form select[name=visibility]').select_option('team')
   await page.evaluate('''async()=>{await __ui.handleCloudFilesSubmit(document.querySelector('#cloud-files-meta-form'),()=>{},__rpc);await __render();}''')
   assert await page.locator('[data-cloud-action=fileImportVersion]').count()==1
   await page.evaluate('''async()=>{await __ui.handleCloudFilesAction(document.querySelector('[data-cloud-action=fileImportVersion]'),()=>{},__rpc);}''')
   assert await page.evaluate('''()=>__calls.some(c=>c.action==='fileImportLocal'&&c.input.version===1)''')
   await page.evaluate('''async()=>{__team.role='viewer';await __render();}''')
   assert await page.locator('#cloud-files-upload-form').count()==0
   assert await page.locator('#cloud-files-meta-form').count()==0
   assert await page.locator('[data-cloud-action=fileImport]').count()==1
   assert not errors,errors
   print('Cloud Files & Evidence 2.3.8 Chromium DOM: PASS')
  finally:await browser.close()
if __name__=='__main__':asyncio.run(main())
