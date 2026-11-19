#!/usr/bin/env python3
"""Cloud Identity 2.3.2 Chromium UI smoke (isolated extension API adapter)."""
import asyncio,base64,json,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]

async def main():
    modules={}
    def add_module(path):
        path=path.resolve()
        key='mt:'+path.relative_to(ROOT/'src').as_posix()
        if key in modules:return key
        modules[key]=''
        def rewrite(m):return m.group(1)+add_module((path.parent/m.group(2)).resolve())+m.group(1)
        source=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,path.read_text())
        modules[key]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
        return key
    add_module(ROOT/'src/ui/cloud-identity-page.mjs')
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            page=await browser.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            await page.set_content('<!doctype html><html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><div id="root"></div></body></html>')
            await page.add_style_tag(content=(ROOT/'src/ui/styles.css').read_text())
            await page.evaluate("""() => {
              window.__calls=[];window.__auth={configured:false,origin:'',authenticated:false};window.__teams=[];window.__teamInvite=null;
              window.browser={runtime:{async sendMessage({type,action,input}){
                if(type!=='MT_CLOUD_IDENTITY')throw Error('unexpected RPC');__calls.push({action,input:action==='register'||action==='login'?{username:input.username,deviceName:input.deviceName}:input});
                const s=__auth;
                if(action==='configure'){s.configured=true;s.origin=input.origin;return {ok:true,value:{configured:true,origin:s.origin}};}
                if(action==='register'||action==='login'){s.authenticated=true;s.account={id:'account1',username:input.username};return {ok:true,value:{authenticated:true,account:s.account}};}
                if(action==='status')return {ok:true,value:{...s}};
                if(action==='teams')return {ok:true,value:{teams:__teams}};
                if(action==='teamCreate'){
                  const t={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:input.name,role:'owner',memberCount:1};__teams.push(t);return {ok:true,value:{team:t}};
                }
                if(action==='teamMembers')return {ok:true,value:{members:[{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',username:'<img src=x onerror=alert(1)>',role:'owner',joinedAt:new Date().toISOString()}]}};
                if(action==='teamInvitations')return {ok:true,value:{invitations:__teamInvite?[__teamInvite]:[]}};
                if(action==='teamInvite'){
                  __teamInvite={id:'cccccccc-cccc-cccc-cccc-cccccccccccc',role:input.role,status:'active',expiresAt:new Date(Date.now()+604800000).toISOString()};
                  return {ok:true,value:{token:'a'.repeat(43),invitation:__teamInvite}};
                }
                if(action==='teamInviteRevoke'){__teamInvite.status='revoked';return {ok:true,value:{ok:true}};}
                if(action==='teamDelete'){__teams.length=0;return {ok:true,value:{ok:true}};}
                if(action==='sessions')return {ok:true,value:{sessions:[{id:'00000000-0000-0000-0000-000000000001',deviceName:'PC <b>untrusted</b>',createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),expiresAt:new Date().toISOString(),current:true}]}};
                if(action==='logout'){s.authenticated=false;return {ok:true,value:{ok:true}};}
                return {ok:false,error:'unsupported'};
              }},permissions:{async request({origins}){window.__requestedOrigins=origins;return true;}}};
              window.confirm=()=>true;
            }""")
            await page.evaluate("""async()=>{
              const ui=await import('mt:ui/cloud-identity-page.mjs');window.__ui=ui;
              document.getElementById('root').innerHTML=ui.cloudSection();
              await ui.mountCloudIdentity(document.getElementById('cloud-identity-root'),()=>{});
            }""")
            assert await page.locator('#cloud-config-form').count()==1
            await page.locator('#cloud-config-form input[name=origin]').fill('http://127.0.0.1:8787')
            await page.evaluate("""async()=>__ui.handleCloudSubmit(document.getElementById('cloud-config-form'),()=>{})""")
            assert await page.locator('#cloud-register-form').count()==1
            await page.locator('#cloud-register-form input[name=username]').fill('test-user')
            await page.locator('#cloud-register-form input[name=password]').fill('example-password-strong')
            await page.evaluate("""async()=>__ui.handleCloudSubmit(document.getElementById('cloud-register-form'),()=>{})""")
            assert await page.locator('#cloud-login-form').count()==0
            assert await page.locator('.cloud-session [data-cloud-action=revoke]').count()==1
            assert await page.locator('.cloud-session b').count()==0,'server-supplied device name must be escaped'
            assert 'PC <b>untrusted</b>' in await page.locator('.cloud-session').inner_text()
            assert await page.locator('#cloud-team-create-form').count()==1
            await page.locator('#cloud-team-create-form input[name=name]').fill('Watch & Team')
            await page.evaluate("""async()=>__ui.handleCloudSubmit(document.getElementById('cloud-team-create-form'),()=>{})""")
            assert 'Watch & Team' in await page.locator('.cloud-team-detail h4').first.inner_text()
            assert await page.locator('.cloud-team-row img').count()==0,'member names must be escaped'
            await page.locator('#cloud-team-invite-form select[name=role]').select_option('editor')
            await page.evaluate("""async()=>__ui.handleCloudSubmit(document.getElementById('cloud-team-invite-form'),()=>{})""")
            assert await page.locator('.cloud-invite-secret input').input_value()=='a'*43
            await page.evaluate("""async()=>__ui.handleCloudAction(document.querySelector('[data-cloud-action=teamInviteRevoke]'),()=>{})""")
            assert await page.locator('[data-cloud-action=teamInviteRevoke]').count()==0
            await page.evaluate("""async()=>__ui.handleCloudAction(document.querySelector('[data-cloud-action=teamDelete]'),()=>{})""")
            assert await page.locator('.cloud-team-detail').count()==0
            await page.evaluate("""async()=>__ui.handleCloudAction(document.querySelector('[data-cloud-action=logout]'),()=>{})""")
            assert await page.locator('#cloud-login-form').count()==1
            details=await page.evaluate("""() => ({origins:__requestedOrigins,calls:__calls.map(c=>c.action)})""")
            assert details['origins']==['http://127.0.0.1/*'],details
            assert details['calls'].count('teamMembers')>=2 and 'teamInvite' in details['calls'] and 'teamDelete' in details['calls'],details
            assert not errors,errors
            print('Cloud Identity Chromium UI: PASS',details)
        finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
