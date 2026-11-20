#!/usr/bin/env python3
"""2.3.9 real Chromium DOM smoke: per-account notifications, admin-only audit, HTML escaping."""
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
  text=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,path.read_text())
  modules[key]='data:text/javascript;base64,'+base64.b64encode(text.encode()).decode()
  return key
 add(ROOT/'src/ui/cloud-operations-page.mjs')
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  try:
   page=await browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   await page.set_content('<!doctype html><html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><main id="root"></main></body></html>')
   await page.evaluate('''async()=>{
    window.__ui=await import('mt:ui/cloud-operations-page.mjs');
    window.__team={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',role:'admin'};
    window.__calls=[];
    window.__rpc=async(action,payload)=>{
      __calls.push({action,payload});
      if(action==='teamNotifications')return {unreadCount:1,notifications:[{seq:32,event:'<img src=x onerror=alert(1)>',resource:'<script>alert(2)</script>',actorId:'author',occurredAt:new Date().toISOString(),readAt:null}]};
      if(action==='teamAudit')return {events:[{seq:12,event:'team.created',resource:'<svg onload=alert(3)>',actorId:'owner',occurredAt:new Date().toISOString()}]};
      throw Error('Unknown RPC '+action);
    };
    window.__render=async()=>{const data=await __ui.loadCloudOperations(__team,__rpc);document.getElementById('root').innerHTML=__ui.cloudOperationsPanel(data);};
    await __render();
   }''')
   assert await page.locator('#cloud-operations-panel').count()==1
   assert await page.locator('#root [data-cloud-action=opsRead]').count()==1
   assert await page.locator('#root img, #root svg, #root script').count()==0
   assert await page.locator('#root').inner_text() and 'team.created' in await page.locator('#root').inner_text()
   await page.evaluate('''async()=>{__team.role='viewer';await __render();}''')
   assert 'team.created' not in await page.locator('#root').inner_text()
   assert await page.evaluate('''()=>__calls.filter(c=>c.action==='teamAudit').length''')==1
   assert not errors,errors
   print('Cloud Operations 2.3.9 Chromium DOM: PASS')
  finally:await browser.close()
if __name__=='__main__':asyncio.run(main())
