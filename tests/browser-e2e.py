#!/usr/bin/env python3
"""Real-browser DOM E2E against deterministic XenForo-compatible fixtures.
Run: python -m pip install playwright==1.57.0; python -m playwright install chromium firefox
Then: MAJESTIC_E2E_BROWSERS=chromium,firefox python tests/browser-e2e.py
Does not claim tests against logged-in live forums or installed extension backgrounds.
"""
import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

MOCK_JS = r'''(host) => {{
  const hostName=host;
  const p1={{id:'p_majestic_1234',name:'Majestic',project:'majestic',server:'Alpha',forumUrl:'https://forum.majestic-rp.ru/'}};
  const p2={{id:'p_russia_1234',name:'Russia',project:'russia-online',server:'Beta',forumUrl:'https://forum.russia.online/'}};
  const date='2026-10-22T00:00:00.000Z';
  const a={{id:'tpl_majestic_01',profileId:p1.id,label:'Ответ Majestic',text:'[b]Привет[/b] {{{{nickname}}}}',category:'',shortcut:1,format:'bbcode',createdAt:date,updatedAt:date}};
  const b={{id:'tpl_russia_01',profileId:p2.id,label:'Ответ Russia',text:'Здравствуйте!',category:'',shortcut:1,format:'plain',createdAt:date,updatedAt:date}};
  const links=[{{id:'link_majestic_01',profileId:p1.id,title:'Наш справочник',url:'https://example.com/help',createdAt:date}},{{id:'link_russia_01',profileId:p2.id,title:'Russia Wiki',url:'https://example.com/wiki',createdAt:date}}];
  window.__sent=[];
  window.browser={{
    runtime:{{id:'fixture-extension-id',getURL:path=>'chrome-extension://fixture-extension-id/'+path,
      onMessage:{{addListener:()=>{{}}}},async sendMessage(message){{window.__sent.push(message);
      if(message.type==='RP_NEXUS_FORUM_DATA'){{const profile=hostName.includes('russia')?p2:p1;return {{ok:true,value:{{profile,templates:[a,b].filter(t=>t.profileId===profile.id),links:links.filter(t=>t.profileId===profile.id)}}}};}}
      return {{ok:true,value:{{}}}};
    }}}},
    storage:{{onChanged:{{addListener:()=>{{}}}}}}
  }};
  window.confirm=()=>true;
}}'''

def fixture(host='majestic',editor='textarea',member=False,moderation=False):
    body=''
    if member:
        body='<section class="memberHeader-main"><h1 class="memberHeader-name">Test Member</h1></section><div class="memberHeader-stats"><dl class="pairs"><dt>Messages</dt><dd>42</dd></dl></div>'
    else:
        body='<h1 class="p-title-value">Тестовая тема</h1>'
        if editor=='textarea':body+='<form><textarea name="message" style="display:block;width:350px;height:90px"></textarea></form>'
        else:body+='<div class="fr-box"><div class="fr-element" contenteditable="true" style="display:block;min-height:50px;border:1px solid #aaa"></div></div>'
        if moderation:body+='<div class="block-outer"><button data-xf-click="menu" id="tools">Инструменты темы</button><div class="menu"><button id="close">Закрыть тему</button><button id="move">Переместить тему</button></div></div>'
    return f'<!doctype html><html><head><meta charset="utf-8"><meta name="generator" content="XenForo 2.2"></head><body><nav class="p-nav"><ul class="p-nav-list"><li>Форум</li></ul></nav>{body}</body></html>'

async def inject(page, member=False):
    for part in ['lib/safe-dom.js','lib/forum-core.js','lib/xenforo-core.js','lib/complaints-core.js','content/forum.js']:
        if part=='content/forum.js':
            await page.evaluate("""member => { const xf=globalThis.MTXenForo; const path = member ? '/members/test.42/' : '/threads/test.123/'; const canonical='https://forum.majestic-rp.ru'+path; globalThis.MTXenForo=Object.freeze({...xf, identify:(href,doc)=>xf.identify(canonical,doc), memberProfile:(doc,href)=>xf.memberProfile(doc,canonical), moderationAction:(doc,href,action)=>xf.moderationAction(doc,canonical,action)}); }""", member)
        await page.add_script_tag(content=(ROOT/'src'/part).read_text())
    await page.locator('#rp-nexus-forum-020').wait_for(timeout=4000)
    await page.wait_for_function("document.querySelector('[data-mt-xf-nav]') !== null")

async def exercise(browser):
    count=0
    for host in ['forum.majestic-rp.ru','forum.russia.online']:
        context=await browser.new_context(ignore_https_errors=True)
        page=await context.new_page()
        await page.evaluate('('+MOCK_JS.format(host=repr(host))+')('+repr(host)+')')
        await page.set_content(fixture(host),wait_until='domcontentloaded')
        await inject(page)
        await page.locator('#rp-nexus-forum-020').evaluate("x => x.shadowRoot.querySelector('.launcher').click()")
        assert await page.locator('[data-mt-xf-nav]').count()==1
        html=await page.locator('nav').inner_text()
        assert ('Наш справочник' in html)==('majestic' in host)
        assert ('Russia Wiki' in html)==('russia' in host)
        await page.locator('#rp-nexus-forum-020').evaluate("x=>x.shadowRoot.querySelector('[data-insert]').click()")
        await page.wait_for_timeout(200)
        value=await page.locator('textarea[name="message"]').input_value()
        assert ('Привет' in value)==('majestic' in host),value
        assert ('Здравствуйте' in value)==('russia' in host),value
        assert await page.locator('form').evaluate('(x)=>x.dataset.submitted??""')==''
        count+=1
        await context.close()
    context=await browser.new_context(ignore_https_errors=True)
    page=await context.new_page()
    await page.evaluate('('+MOCK_JS.format(host=repr('forum.majestic-rp.ru'))+')(' +repr('forum.majestic-rp.ru')+')')
    await page.set_content(fixture(editor='rich',moderation=True),wait_until='domcontentloaded')
    await inject(page)
    await page.locator('#rp-nexus-forum-020').evaluate("x=>x.shadowRoot.querySelector('.launcher').click()")
    await page.locator('#rp-nexus-forum-020').evaluate("x=>x.shadowRoot.querySelector('[data-insert]').click()")
    await page.wait_for_timeout(200)
    txt=await page.locator('.fr-element').inner_text()
    assert 'Привет' in txt,txt
    assert await page.locator('.fr-element strong').count()==1
    assert await page.evaluate("() => !!globalThis.MTXenForo.moderationAction(document,'https://forum.majestic-rp.ru/threads/test.123/','close')")
    assert await page.evaluate("() => !!globalThis.MTXenForo.moderationAction(document,'https://forum.majestic-rp.ru/threads/test.123/','move')")
    count+=1
    await context.close()
    context=await browser.new_context(ignore_https_errors=True)
    page=await context.new_page()
    await page.evaluate('('+MOCK_JS.format(host=repr('forum.majestic-rp.ru'))+')(' +repr('forum.majestic-rp.ru')+')')
    await page.set_content(fixture(member=True),wait_until='domcontentloaded')
    await inject(page,member=True)
    await page.locator('#rp-nexus-forum-020').evaluate("x=>x.shadowRoot.querySelector('.launcher').click()")
    await page.locator('#rp-nexus-forum-020').evaluate("x=>x.shadowRoot.querySelector('[data-act=save-member]').click()")
    await page.wait_for_function('window.__sent.some(x=>x.type==="MAJESTIC_SAVE_PUBLIC_PLAYER")')
    card=await page.evaluate('window.__sent.find(x=>x.type==="MAJESTIC_SAVE_PUBLIC_PLAYER").card')
    assert card['name']=='Test Member' and card['stats'][0]['value']=='42',card
    count+=1
    await context.close()
    context=await browser.new_context()
    page=await context.new_page()
    await page.set_content('<main id=target></main>')
    await page.add_script_tag(content=(ROOT/'src/lib/safe-dom.js').read_text())
    result=await page.evaluate("""() => {
      const target=document.getElementById('target');
      globalThis.MTSafeDOM.replaceHtml(target,'<div>Safe <img src=x onerror=alert(1)><script>window.hacked=true</script><a href=javascript:alert(1)>bad</a><strong>text</strong></div>');
      return {scripts:target.querySelectorAll('script,img').length,href:target.querySelector('a')?.getAttribute('href'),text:target.textContent,hacked:window.hacked||false};
    }""")
    assert result['scripts']==0 and not result['href'] and not result['hacked'] and 'Safe' in result['text'],result
    count+=1
    await context.close()

    # Exercise the real workspace submit-delegation code (not a recreated handler).
    # Persistence is covered independently by functional-hotfix.test.mjs.
    source=(ROOT/'src/ui/main.mjs').read_text()
    block=source.split("document.addEventListener('submit', event => {",1)[1].split("document.addEventListener('keydown', event => {",1)[0]
    context=await browser.new_context()
    page=await context.new_page()
    await page.set_content('''<!doctype html><form id="xf-navigation-form"><input name="title" required value="Правила"><input name="url" type="url" required value="https://example.com"><button type="submit">Сохранить ссылку</button></form>''')
    await page.add_script_tag(content='''globalThis.__calls=0;
       globalThis.state={profiles:[]};globalThis.render=()=>{};globalThis.feedback=()=>{};
       globalThis.handleForumSubmit=async event=>{globalThis.__calls++;globalThis.__prevented=event.defaultPrevented;};''')
    await page.add_script_tag(content="document.addEventListener('submit', event => {"+block)
    await page.locator('button[type=submit]').click()
    await page.wait_for_function('globalThis.__calls === 1')
    assert await page.evaluate('globalThis.__prevented') is True
    count+=1
    await context.close()
    return count

async def main():
    names=os.environ.get('MAJESTIC_E2E_BROWSERS','chromium').split(',')
    async with async_playwright() as p:
        for name in names:
            if name not in ('chromium','firefox'):
                raise ValueError('Only chromium or firefox browser E2E supported')
            engine=getattr(p,name)
            override=os.environ.get('MAJESTIC_CHROMIUM') if name=='chromium' else os.environ.get('MAJESTIC_FIREFOX')
            if name=='chromium' and not override and os.environ.get('MAJESTIC_PLAYWRIGHT_ONLY')!='1' and Path('/usr/bin/chromium').is_file():
                override='/usr/bin/chromium'
            kwargs={'executable_path':override} if override else {}
            if name=='chromium':kwargs['args']=['--no-sandbox','--disable-dev-shm-usage']
            browser=await engine.launch(headless=True,**kwargs)
            try:
                cases=await exercise(browser)
                print(f'{name} browser E2E: {cases} scenarios passed (offline XenForo DOM fixtures)')
            finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
