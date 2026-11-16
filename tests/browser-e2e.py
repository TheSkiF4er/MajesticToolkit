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
  window.__sent=[]; window.__listeners=[]; window.__settings={{}}; window.__allowed=true; window.__extraTemplates=[]; window.__usage={{}}; window.__extraLinks=[]; window.__history=[]; window.__reading='';
  window.__deliver=message=>{{for(const listener of window.__listeners)listener(message,{{}},()=>{{}});}};
  window.browser={{
    runtime:{{id:'fixture-extension-id',getURL:path=>'chrome-extension://fixture-extension-id/'+path,
      onMessage:{{addListener:fn=>window.__listeners.push(fn)}},async sendMessage(message){{window.__sent.push(message);
      if(message.type==='RP_NEXUS_FORUM_DATA'){{const profile=hostName.includes('russia')?p2:p1;return {{ok:true,value:{{profile,templates:[a,b,...window.__extraTemplates].filter(t=>t.profileId===profile.id),usage:window.__usage,links:[...links,...window.__extraLinks].filter(t=>t.profileId===profile.id||t.profileId==='*'),navigationHistory:window.__history,settings:window.__settings,allowed:window.__allowed}}}};}}
      if(message.type==='MT_FORUM_READING'){{if(message.action==='save')window.__reading=message.postId;if(message.action==='clear')window.__reading='';return {{ok:true,value:window.__reading}};}}
      if(message.type==='MT_NAVIGATION_ACTION'){{
        if(message.action==='bookmark'){{const item={{id:'bookmark_fixture1',profileId:p1.id,title:'Сохранённая тема',url:'https://forum.majestic-rp.ru/threads/test.123/',kind:'bookmark',host:'forum.majestic-rp.ru',placement:'panel',createdAt:date}};if(!window.__extraLinks.some(x=>x.id===item.id))window.__extraLinks.push(item);return {{ok:true,value:item}};}}
        if(message.action==='visit'){{window.__history=[{{url:'https://forum.majestic-rp.ru/threads/test.123/',title:'Тестовая тема',visitedAt:Date.now()}}];return {{ok:true,value:window.__history}};}}
        if(message.action==='clear-history'){{window.__history=[];return {{ok:true,value:true}};}}
        if(message.action==='search')return {{ok:true,value:[{{key:'forum:tpl_majestic_01',title:'Ответ Majestic',type:'forum',view:'forum',url:''}}]}};
      }}
      if(message.type==='MT_BINDER_ACTION'&&message.action==='use')window.__usage[message.id]=Date.now();
      if(message.type==='MT_BINDER_ACTION'&&message.action==='favorite'){{const t=[a,b,...window.__extraTemplates].find(t=>t.id===message.id);t.favorite=message.favorite;return {{ok:true,value:t}};}}
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

async def inject(page, member=False, canonical_override=True):
    for part in ['lib/safe-dom.js','lib/forum-core.js','lib/xenforo-core.js','lib/complaints-core.js','lib/forum-customization.js','content/forum/context.js','content/forum/editors.js','content/forum/navigation.js','content/forum/lifecycle.js','content/forum/customization.js','content/forum.js']:
        if part=='content/forum.js' and canonical_override:
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
    await page.set_content('''<!doctype html><form id="xf-navigation-form"><input name="id" type="hidden"><input name="title" required value="Правила"><input name="url" type="url" required value="https://example.com"><button type="submit">Сохранить ссылку</button></form>''')
    await page.add_script_tag(content='''globalThis.__calls=0;
       globalThis.state={profiles:[]};globalThis.render=()=>{};globalThis.feedback=()=>{};
       globalThis.handleForumSubmit=async event=>{globalThis.__calls++;globalThis.__prevented=event.defaultPrevented;};''')
    await page.add_script_tag(content="document.addEventListener('submit', event => {"+block)
    assert await page.locator('form').evaluate('(f) => f.id !== f.getAttribute("id")')
    await page.locator('button[type=submit]').click()
    await page.wait_for_function('globalThis.__calls === 1')
    assert await page.evaluate('globalThis.__prevented') is True
    count+=1
    await context.close()

    # Regression: hidden name=id used to shadow HTMLFormElement.id, allowing a
    # native GET navigation instead of persisting the binder's new template.
    context=await browser.new_context()
    page=await context.new_page()
    await page.set_content('''<!doctype html><form id="forum-template-form"><input name="id" type="hidden"><input name="label" required value="Test reply"><textarea name="text" required>Hello</textarea><button type="submit">Сохранить шаблон</button></form>''')
    await page.add_script_tag(content='''globalThis.__calls=0;
       globalThis.state={profiles:[]};globalThis.render=()=>{};globalThis.feedback=()=>{};
       globalThis.handleForumSubmit=async event=>{globalThis.__calls++;globalThis.__prevented=event.defaultPrevented;};''')
    await page.add_script_tag(content="document.addEventListener('submit', event => {"+block)
    assert await page.locator('form').evaluate('(f) => f.id !== f.getAttribute("id")')
    await page.locator('button[type=submit]').click()
    await page.wait_for_function('globalThis.__calls === 1')
    assert await page.evaluate('globalThis.__prevented') is True
    count+=1
    await context.close()

    # Regression for other named `id` controls in the complaint and Google
    # import forms: they must dispatch without triggering a default GET request.
    context=await browser.new_context()
    page=await context.new_page()
    await page.set_content('''<!doctype html><form id="complaint-form"><input type="hidden" name="id"><input name="title" required value="Case"><button type="submit">Сохранить жалобу</button></form><form id="google-import-doc-form"><input name="id" required value="abcdefghi12345"><button type="submit">Импорт</button></form>''')
    await page.add_script_tag(content='''globalThis.__complaint=0;globalThis.__google=0;
       globalThis.state={};globalThis.render=()=>{};globalThis.feedback=()=>{};
       globalThis.lawRecords=()=>[];
       globalThis.handleComplaintSubmit=async e=>{globalThis.__complaint++;globalThis.__complaintPrevented=e.defaultPrevented;};
       globalThis.handleIntegrationSubmit=async form=>{globalThis.__google++;};''')
    await page.add_script_tag(content="document.addEventListener('submit', event => {"+block+"document.addEventListener('submit',e=>{if(e.target.getAttribute('id')==='google-import-doc-form')globalThis.__googlePrevented=e.defaultPrevented;});")
    assert await page.locator('#complaint-form').evaluate('(f)=>f.id !== f.getAttribute("id")')
    assert await page.locator('#google-import-doc-form').evaluate('(f)=>f.id !== f.getAttribute("id")')
    await page.locator('#complaint-form button[type=submit]').click()
    await page.locator('#google-import-doc-form button[type=submit]').click()
    await page.wait_for_function('globalThis.__complaint === 1 && globalThis.__google === 1')
    assert await page.evaluate('globalThis.__complaintPrevented && globalThis.__googlePrevented')
    count+=1
    await context.close()

    # A real click-driven Chromium/Firefox DOM check for transient activation ordering.
    # Firefox's actual permissions API still requires a device-level acceptance test.
    context=await browser.new_context()
    page=await context.new_page()
    await page.set_content('<button id="grant">Разрешить Majestic RP</button><button id="revoke">Отозвать</button><div id="status"></div>')
    flow=(ROOT/'src/lib/permission-flow.mjs').read_text().replace('export function changeHostPermission','function changeHostPermission')
    await page.add_script_tag(content=flow+"""
      globalThis.__events=[];
      let activated=false;
      const origins=['https://forum.majestic-rp.ru/*'];
      const permissions={
        request({origins}){globalThis.__events.push('request');if(!activated)throw Error('permissions.request may only be called from a user input handler');return Promise.resolve(true);},
        remove(){globalThis.__events.push('remove');return Promise.resolve(true);}
      };
      document.getElementById('grant').addEventListener('click',()=>{
        activated=true;
        const pending=changeHostPermission(permissions,origins,false);
        activated=false;
        pending.then(()=>document.getElementById('status').textContent='granted');
      });
      document.getElementById('revoke').addEventListener('click',()=>{
        changeHostPermission(permissions,origins,true).then(()=>document.getElementById('status').textContent='revoked');
      });
    """)
    await page.locator('#grant').click()
    await page.wait_for_function("document.getElementById('status').textContent === 'granted'")
    await page.locator('#revoke').click()
    await page.wait_for_function("document.getElementById('status').textContent === 'revoked'")
    assert await page.evaluate('globalThis.__events')==['request','remove']
    count+=1
    await context.close()
    # Offline XenForo fixture with the supported canonical context.
    context=await browser.new_context(ignore_https_errors=True)
    page=await context.new_page()
    await page.set_content(fixture(),wait_until='domcontentloaded')
    await page.evaluate('('+MOCK_JS.format(host=repr('forum.majestic-rp.ru'))+')('+repr('forum.majestic-rp.ru')+')')
    await page.evaluate("""() => {const form=document.querySelector('form');form.insertAdjacentHTML('beforeend','<textarea id="unrelated" name="bio"></textarea><textarea id="second" name="message"></textarea>');} """)
    await inject(page)
    root=page.locator('#rp-nexus-forum-020')
    await root.evaluate("x=>x.shadowRoot.querySelector('.launcher').click()")
    await root.evaluate("x=>x.shadowRoot.querySelector('[data-insert]').click()")
    assert await page.locator('textarea[name=message]').first.input_value()==''
    assert await page.locator('#second').input_value()==''
    await page.locator('#unrelated').focus()
    await page.keyboard.press('Alt+Shift+1')
    assert await page.locator('#unrelated').input_value()==''
    await page.locator('#second').fill('left RIGHT end')
    await page.locator('#second').evaluate("x=>{x.focus();x.setSelectionRange(5,10)}")
    await root.evaluate("x=>x.shadowRoot.querySelector('[data-insert]').click()")
    assert (await page.locator('#second').input_value()).startswith('left [b]Привет[/b]')
    assert 'RIGHT' not in await page.locator('#second').input_value()
    assert await page.locator('textarea[name=message]').first.input_value()==''
    # Picker and start/end insertion modes work on the actual panel.
    await root.evaluate("x=>{const s=x.shadowRoot.querySelector('#rpn-editor');s.value='0';s.dispatchEvent(new Event('change',{bubbles:true}));const m=x.shadowRoot.querySelector('#rpn-mode');m.value='start';m.dispatchEvent(new Event('change',{bubbles:true}));}")
    await page.locator('textarea[name=message]').first.fill('tail')
    await root.evaluate("x=>x.shadowRoot.querySelector('[data-insert]').click()")
    assert (await page.locator('textarea[name=message]').first.input_value()).endswith('tail'), await page.locator('textarea[name=message]').first.input_value()
    count+=1
    # AJAX editor and navigation replacement; desktop/mobile duplicate-free reconciliation.
    await page.evaluate("""() => {document.querySelector('nav').outerHTML='<nav class="p-nav"><ul class="p-nav-list"><li>New</li></ul></nav>';const mobile=document.createElement('div');mobile.className='offCanvasMenu-list';document.body.append(mobile);}""")
    await page.wait_for_function("document.querySelectorAll('[data-mt-xf-nav]').length===2")
    await page.evaluate("document.querySelector('nav ul [data-mt-xf-nav]').remove()")
    await page.wait_for_function("document.querySelectorAll('[data-mt-xf-nav]').length===2")
    await page.evaluate("document.querySelector('#second').remove();document.querySelector('textarea[name=message]').remove();const form=document.querySelector('form');const n=document.createElement('textarea');n.name='message';n.id='replacement';form.append(n)")
    await page.wait_for_timeout(200)
    await root.evaluate("x=>x.shadowRoot.querySelector('[data-insert]').click()")
    assert await page.locator('#replacement').input_value()==''
    await page.locator('#replacement').focus()
    await root.evaluate("x=>x.shadowRoot.querySelector('[data-insert]').click()")
    assert 'Привет' in await page.locator('#replacement').input_value()
    count+=1
    # Settings update, disable/enable, revoke, BFCache, and no duplicate launcher.
    await page.evaluate("window.__settings={panelPosition:'left',appearance:'light',density:'compact',navigationEnabled:false,binderEnabled:false};window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await page.wait_for_function("document.querySelectorAll('[data-mt-xf-nav]').length===0 && document.querySelector('#rp-nexus-forum-020').dataset.appearance==='light'")
    assert await root.evaluate("x=>x.style.left")=='18px'
    assert await root.evaluate("x=>x.shadowRoot.querySelectorAll('[data-insert]').length")==0
    await page.evaluate("window.__settings={enabled:false};window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await root.wait_for(state='detached')
    await page.evaluate("window.__settings={};window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await root.wait_for()
    await page.wait_for_function("document.querySelectorAll('[data-mt-xf-nav]').length===2")
    await page.evaluate("window.__deliver({type:'RP_NEXUS_FORUM_PERMISSION_REVOKED',hosts:['forum.russia.online']})")
    assert await root.count()==1
    await page.evaluate("window.__allowed=false;window.__deliver({type:'RP_NEXUS_FORUM_PERMISSION_REVOKED',hosts:['forum.majestic-rp.ru']})")
    await root.wait_for(state='detached')
    assert await page.locator('[data-mt-xf-nav]').count()==0
    await page.evaluate("window.__allowed=true;window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await root.wait_for()
    await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))")
    await root.wait_for(state='detached')
    await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
    await root.wait_for()
    assert await root.count()==1
    count+=1
    await context.close()
    # Binder 2.0: actual dynamic fields, preview, insertion, favorite and recent filter.
    context=await browser.new_context(ignore_https_errors=True)
    page=await context.new_page()
    await page.set_content(fixture(),wait_until='domcontentloaded')
    await page.evaluate('('+MOCK_JS.format(host=repr('forum.majestic-rp.ru'))+')('+repr('forum.majestic-rp.ru')+')')
    await page.evaluate("""() => {window.__extraTemplates=[{id:'tpl_binder_157',profileId:'p_majestic_1234',label:'Решение',category:'Жалобы/Суд',tags:['проверено'],text:'[b]{{decision}}[/b] {{comment}}',format:'bbcode',shortcut:2,createdAt:'2026-11-15T00:00:00Z',updatedAt:'2026-11-15T00:00:00Z',variables:[{key:'decision',label:'Решение',type:'select',required:true,options:['Да','Нет']},{key:'comment',label:'Комментарий',type:'multiline',required:true}]}];}""")
    await inject(page)
    root=page.locator('#rp-nexus-forum-020')
    await root.locator('.launcher').click()
    await root.locator('[data-insert="tpl_binder_157"]').click()
    await root.locator('#rpn-fill button[type=submit]').click()
    assert await page.locator('textarea[name=message]').input_value()==''
    await root.locator('#rpn-fill select[name=decision]').select_option('Да')
    await root.locator('#rpn-fill textarea[name=comment]').fill('Проверка [b]текста[/b]')
    await root.locator('[data-act=preview]').click()
    assert await root.locator('#rpn-filled-preview strong').inner_text()=='Да'
    await page.evaluate("window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await page.wait_for_timeout(150)
    assert await root.locator('#rpn-fill textarea[name=comment]').input_value()=='Проверка [b]текста[/b]'
    await root.locator('#rpn-fill button[type=submit]').click()
    assert await page.locator('textarea[name=message]').input_value()=='[b]Да[/b] Проверка ［b］текста［/b］'
    await root.locator('[data-favorite="tpl_binder_157"]').click()
    await root.locator('[data-filter=favorite]').click()
    assert await root.locator('[data-insert]').count()==1
    await root.locator('[data-filter=recent]').click()
    assert await root.locator('[data-insert="tpl_binder_157"]').count()==1
    count+=1
    await context.close()
    # Exercise the real module and workspace dialog against in-memory WebExtension storage.
    # Navigation 2.0: real DOM menu groups, panel, bookmark, history, local search and revoke.
    context=await browser.new_context(ignore_https_errors=True)
    page=await context.new_page()
    await page.set_content(fixture(),wait_until='domcontentloaded')
    await page.evaluate('('+MOCK_JS.format(host=repr('forum.majestic-rp.ru'))+')('+repr('forum.majestic-rp.ru')+')')
    await page.evaluate("""()=>{window.__settings={navigationHistory:true};const base={profileId:'p_majestic_1234',createdAt:'2026-11-15T00:00:00Z',url:'https://example.org/rules'};window.__extraLinks=[{...base,id:'link_group_001',title:'Регламент',group:'Работа/Суд',target:'current',placement:'both',pinned:true},{...base,id:'link_panel_001',title:'Только панель',placement:'panel'},{...base,id:'link_other_001',title:'Чужой форум',host:'forum.russia.online'}];}""")
    await inject(page)
    await page.wait_for_function("document.querySelectorAll('[data-mt-xf-nav]').length===2")
    assert await page.locator('[data-mt-xf-nav="group:Работа"] details summary').first.inner_text()=='Работа'
    assert await page.locator('[data-mt-xf-nav="group:Работа"] a').get_attribute('target')=='_self'
    assert 'Чужой форум' not in await page.locator('nav').inner_text()
    root=page.locator('#rp-nexus-forum-020')
    await page.keyboard.press('Alt+Shift+N')
    await root.locator('#rpn-nav-panel').wait_for(state='visible')
    assert await root.locator('#rpn-nav-panel').get_by_text('Только панель').count()==1
    await root.locator('[data-nav-act=bookmark]').click()
    await root.locator('#rpn-nav-panel').get_by_text('Сохранённая тема').wait_for()
    await root.locator('#rpn-nav-search').fill('Ответ')
    await root.locator('[data-nav-result="0"]').wait_for()
    await root.locator('[data-nav-result="0"]').click()
    await page.wait_for_function("document.querySelector('textarea[name=message]').value.includes('Привет')")
    assert await root.locator('#rpn-binder-panel').is_visible()
    await root.locator('[data-nav-act=navigation]').click()
    await root.locator('#rpn-nav-search').fill('')
    await root.locator('[data-nav-act=clear-history]').click()
    await page.wait_for_function('window.__history.length===0')
    await page.evaluate("window.__settings.navigationEnabled=false;window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await page.wait_for_function("document.querySelectorAll('[data-mt-xf-nav]').length===0")
    assert not await root.locator('#rpn-nav-panel').is_visible()
    count+=1
    await context.close()

    context=await browser.new_context()
    page=await context.new_page()
    # Data-module import map keeps the entire real module graph offline (no navigation).
    import base64, json, re
    modules={}
    def add_module(path):
        path=path.resolve();key='mt:'+path.relative_to(ROOT/'src').as_posix()
        if key in modules:return key
        modules[key]=''
        source=path.read_text()
        def rewrite(match):
            target=(path.parent/match.group(2)).resolve()
            return match.group(1)+add_module(target)+match.group(1)
        source=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,source)
        modules[key]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
        return key
    add_module(ROOT/'src/lib/model.mjs');add_module(ROOT/'src/ui/forum-page.mjs');add_module(ROOT/'src/ui/customization-page.mjs')
    await page.set_content('<html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><div id="app"></div></body></html>')
    await page.evaluate("""async()=>{
      const data={};window.__data=data;window.browser={storage:{local:{async get(k){return k===null?{...data}:{[k]:data[k]};},async set(x){Object.assign(data,structuredClone(x));},async remove(k){for(const id of Array.isArray(k)?k:[k])delete data[id];}}}};
      const model=await import('mt:lib/model.mjs'),ui=await import('mt:ui/forum-page.mjs');window.__state=model.defaultState();window.__ui=ui;const custom=await import('mt:ui/customization-page.mjs');data.rpNexusStateV1=window.__state;
      await ui.refreshBinderProfile(window.__state.activeProfileId);await ui.refreshForum();
      window.__render=()=>{MTSafeDOM.replaceHtml(document.querySelector('#app'),ui.forumSection(window.__state));custom.mountCustomization(document.querySelector('#forum-customization'),window.__state,next=>{window.__state=next;window.__render();},(msg,error)=>{if(error)window.__error=msg;});};window.__render();
      document.addEventListener('submit',e=>{if(['forum-template-form','xf-navigation-form'].includes(e.target.getAttribute('id'))){e.preventDefault();ui.handleForumSubmit(e,window.__state,window.__render,()=>{}).catch(err=>window.__error=err.message);}});
      document.addEventListener('click',e=>{const b=e.target.closest('[data-forum-action]');if(b)ui.handleForumAction(b,window.__state,window.__render,()=>{}).catch(err=>window.__error=err.message);});
    }""")
    await page.locator('[data-forum-action=create]').click()
    await page.locator('#forum-template-form [name=label]').fill('Шаблон E2E')
    await page.locator('#forum-template-form [name=category]').fill('Жалобы/Суд')
    await page.locator('#forum-template-form [name=tags]').fill('QA, E2E')
    await page.locator('#forum-template-form [name=text]').fill('[b]{{decision}}[/b]')
    await page.locator('[data-variable-key=decision] [data-type]').select_option('select')
    await page.locator('[data-variable-key=decision] [data-options]').fill('Да\nНет')
    await page.locator('#forum-template-form button[type=submit]').click()
    await page.wait_for_function("Object.values(window.__data).some(x=>x.label==='Шаблон E2E')")
    assert await page.evaluate("Object.values(window.__data).find(x=>x.label==='Шаблон E2E').variables[0].options.join(',')")=='Да,Нет'
    await page.locator('[data-template-card] [data-forum-action=edit]').click()
    await page.locator('#forum-template-form [name=label]').fill('Шаблон E2E v2')
    await page.locator('#forum-template-form button[type=submit]').click()
    await page.wait_for_function("Object.values(window.__data).some(x=>x.label==='Шаблон E2E v2'&&x.history?.length===1)")
    assert not await page.evaluate('Boolean(window.__error)')
    await page.locator('#xf-navigation-form [name=title]').fill('Меню E2E')
    await page.locator('#xf-navigation-form [name=url]').fill('https://example.org/rules')
    await page.locator('#xf-navigation-form [name=group]').fill('Работа/Суд')
    await page.locator('#xf-navigation-form [name=target]').select_option('current')
    await page.locator('#xf-navigation-form [name=placement]').select_option('panel')
    await page.locator('#xf-navigation-form [name=pinned]').check()
    await page.locator('#xf-navigation-form button[type=submit]').click()
    await page.wait_for_function("window.__error||Object.values(window.__data).some(x=>x.title==='Меню E2E')",timeout=5000)
    assert not await page.evaluate('window.__error'),await page.evaluate('window.__error')
    assert await page.evaluate("Object.values(window.__data).some(x=>x.title==='Меню E2E'&&x.group==='Работа/Суд'&&x.pinned&&x.target==='current'&&x.placement==='panel')"),await page.evaluate("Object.values(window.__data).find(x=>x.title==='Меню E2E')")
    await page.locator('[data-nav-row] [data-forum-action=edit-link]').click()
    await page.locator('#xf-navigation-form [name=title]').fill('Меню E2E v2')
    await page.locator('#xf-navigation-form button[type=submit]').click()
    await page.wait_for_function("Object.values(window.__data).some(x=>x.title==='Меню E2E v2'&&x.group==='Работа/Суд')")
    assert not await page.evaluate('Boolean(window.__error)')
    count+=1
    count+=1
    studio=page.locator('#forum-customization')
    await studio.locator('[name=theme]').select_option('custom')
    await studio.locator('[name=color-background]').fill('#223344')
    await studio.locator('[name=sidebar]').select_option('left')
    await studio.locator('[name=fontSize]').fill('18')
    assert await studio.locator('[data-theme-preview]').evaluate("x=>x.style.getPropertyValue('--mt-preview-background')")=='#223344'
    await studio.locator('button[type=submit]').click()
    await page.wait_for_function("window.__data.rpNexusStateV1.preferences.forum?.customization?.global.theme==='custom'")
    await studio.locator('[name=presetName]').fill('E2E theme')
    await studio.locator('[data-theme-action=save-preset]').click()
    await page.wait_for_function("window.__data.rpNexusStateV1.preferences.forum.customization.presets.length===1")
    await studio.locator('[name=scope]').select_option('forum.majestic-rp.ru')
    await studio.locator('[name=theme]').select_option('oled')
    await studio.locator('button[type=submit]').click()
    await page.wait_for_function("window.__data.rpNexusStateV1.preferences.forum.customization.sites['forum.majestic-rp.ru']?.theme==='oled'")
    await studio.locator('[data-theme-action=undo]').click()
    await page.wait_for_function("!window.__data.rpNexusStateV1.preferences.forum.customization.sites['forum.majestic-rp.ru']")
    assert not await page.evaluate('Boolean(window.__error)'),await page.evaluate('window.__error')
    count+=1
    await context.close()
    # Real theme studio and content engine in a browser, with dynamic XenForo fixtures.
    context=await browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':900})
    page=await context.new_page()
    await page.evaluate('('+MOCK_JS.format(host=repr('forum.majestic-rp.ru'))+')('+repr('forum.majestic-rp.ru')+')')
    await page.set_content(fixture()+'''<div class="p-body-main"><div class="p-body-content"><article class="message" id="js-post-100"><div class="message-body"><div class="bbWrapper">Example <blockquote class="bbCodeBlock--quote">Quoted text</blockquote></div></div><div class="message-signature">Signature</div></article><article class="message" id="js-post-200"><div class="message-body">Second</div></article><div class="blockMessage blockMessage--error" id="security-message">Important notice</div></div><aside class="p-body-sidebar">Sidebar</aside></div>''')
    await inject(page)
    await page.evaluate("window.__settings={customization:{theme:'midnight',sidebar:'left',signatures:'collapse',quotes:'collapse',reading:true,rememberReading:true}};window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await page.wait_for_function("document.querySelector('[data-mt-forum-style]') && getComputedStyle(document.body).backgroundColor==='rgb(11, 21, 48)'")
    assert await page.locator('[data-mt-fold-button]').count()==2
    assert await page.locator('.p-body-sidebar').evaluate("x=>getComputedStyle(x).order")=='-1'
    assert await page.locator('#security-message').is_visible()
    await page.locator('[data-mt-fold-button]').first.click()
    assert await page.locator('[data-mt-fold-button]').first.get_attribute('aria-expanded')=='true'
    await page.locator('#rp-nexus-forum-020').evaluate("x=>x.shadowRoot.querySelector('.launcher').click()")
    await page.locator('[data-nav-act=design]').click()
    assert await page.locator('#rpn-reading select option').count()==3
    await page.locator('#rpn-reading').get_by_text('Запомнить место',exact=True).click()
    await page.wait_for_function("window.__reading==='js-post-100' || window.__reading==='js-post-200'")
    await page.locator('#rpn-reading').get_by_text('Вернуться к сохранённому',exact=True).wait_for()
    await page.locator('#rpn-reading').get_by_text('Очистить место',exact=True).click()
    await page.wait_for_function("window.__reading===''")
    await page.evaluate("document.querySelector('.p-body-content').insertAdjacentHTML('beforeend','<article class=\"message\" id=\"js-post-300\"><div class=\"message-signature\">New signature</div></article>')")
    await page.wait_for_function("document.querySelectorAll('[data-mt-fold-button]').length===3")
    await page.evaluate("window.__settings={customization:{theme:'original'}};window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await page.wait_for_function("!document.querySelector('[data-mt-forum-style]') && !document.querySelector('[data-mt-fold-button]')")
    assert await page.locator('.p-body-main').get_attribute('data-mt-layout') is None
    assert await page.locator('#security-message').is_visible()
    await page.evaluate("window.__settings={customization:{theme:'dark'}};window.__deliver({type:'RP_NEXUS_REFRESH_FORUM_DATA'})")
    await page.wait_for_function("document.querySelector('[data-mt-forum-style]')")
    await page.evaluate("window.__deliver({type:'RP_NEXUS_FORUM_PERMISSION_REVOKED',hosts:['forum.majestic-rp.ru']})")
    await page.wait_for_function("!document.querySelector('[data-mt-forum-style]') && !document.querySelector('#rp-nexus-forum-020')")
    count+=1
    await context.close()
    return count

async def experience_workspace(browser):
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
      window.browser={runtime:{id:'fixture',getURL:path=>'http://localhost:8765/'+path,onMessage:event,async sendMessage(){return {ok:true,value:[]};}},permissions:{async contains(){return false;},onAdded:event,onRemoved:event},tabs:{async create(x){window.__tabs.push(x);return x;},async query(){return[];}},storage:{onChanged:{addListener(fn){listeners.push(fn);}},local:{async get(k){if(k===null)return structuredClone(data);if(Array.isArray(k))return Object.fromEntries(k.map(x=>[x,data[x]]));if(typeof k==='object')return {...k,...Object.fromEntries(Object.keys(k).filter(x=>x in data).map(x=>[x,data[x]]))};return {[k]:data[k]};},async set(x){const changes={};for(const [k,v] of Object.entries(x)){changes[k]={oldValue:data[k],newValue:v};data[k]=structuredClone(v);}notify(changes);},async remove(keys){const changes={};for(const k of Array.isArray(keys)?keys:[keys]){changes[k]={oldValue:data[k]};delete data[k];}notify(changes);}}}};
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
    await page.locator('.ws-widgets').wait_for(timeout=8000)
    assert await page.locator('.ws-widget').count()==6
    assert await page.locator('.ws-nav-group').count()==4
    # Actual stores, not mocked dashboard counts.
    await page.evaluate('''async()=>{const f=await import('mt:lib/forum-store.mjs'),x=await import('mt:lib/xenforo-store.mjs');await f.upsertTemplate({label:'QA Majestic binder',text:'Hello',format:'plain',category:'QA',profileId:'profile_majest',shortcut:0,favorite:true});await f.upsertTemplate({label:'QA Russia binder',text:'Other',format:'plain',category:'QA',profileId:'profile_russia',shortcut:0,favorite:true});await x.saveCurrentBookmark('profile_majest','https://forum.majestic-rp.ru/threads/test.42/','QA bookmark');}''')
    await page.get_by_text('QA Majestic binder',exact=True).wait_for(timeout=5000)
    assert not await page.get_by_text('QA Russia binder',exact=True).count()
    await page.get_by_text('QA bookmark',exact=True).wait_for()
    await page.locator('[data-action=dashboard-bookmark]').click()
    await page.wait_for_function("window.__tabs.some(x=>x.url==='https://forum.majestic-rp.ru/threads/test.42/')")
    await page.locator('.ws-dashboard details summary').click()
    await page.locator('[data-widget-toggle=timers]').uncheck()
    await page.wait_for_function("window.__data.rpNexusStateV1.preferences.workspace.hidden.includes('timers')")
    await page.wait_for_function("document.querySelectorAll('.ws-widget').length===5")
    await page.locator('[data-action=widget-order][data-id=bookmarks][data-direction=up]').click()
    await page.wait_for_function("window.__data.rpNexusStateV1.preferences.workspace.order[0]==='bookmarks'")
    await page.locator('#workspace-profile').select_option('profile_russia')
    await page.get_by_text('QA Russia binder',exact=True).wait_for()
    assert not await page.get_by_text('QA Majestic binder',exact=True).count()
    assert not await page.get_by_text('QA bookmark',exact=True).count()
    await page.locator('.ws-tile[data-pane=customization]').click()
    await page.locator('#forum-customization').wait_for(state='visible')
    assert not await page.locator('#forum-search').is_visible()
    await page.locator('[data-action=forum-pane][data-pane=navigation]').click()
    assert await page.locator('#navigation-2').is_visible()
    await page.locator('[data-action=forum-pane][data-pane=binder]').click()
    assert await page.locator('#forum-search').is_visible()
    await page.locator('[data-action=forum-pane][data-pane=settings]').click()
    assert await page.locator('[data-forum-settings=global]').is_visible()
    saved=await page.evaluate('window.__data');route=page.url
    await page.close();page=await context.new_page();page.on('pageerror',lambda err:errors.append(str(err)));await boot(page,saved,route)
    await page.locator('[data-forum-settings=global]').wait_for(state='visible')
    assert await page.locator('#workspace-profile').input_value()=='profile_russia'
    await page.locator('.nav [data-view=home]').click()
    await page.wait_for_function("document.querySelectorAll('.ws-widget').length===5")
    assert await page.locator('.ws-widget h3').first.inner_text()=='Закладки'
    # Rules Database: create from actual editor, revision, source candidates, search and isolation.
    await page.locator('#workspace-profile').select_option('profile_majest')
    await page.locator('.nav [data-view=rules]').click()
    await page.locator('[data-rules-action=new]').click()
    form=page.locator('#rules-form')
    for name,value in {'code':'5.1','title':'QA DM','category':'Основные','text':'Тестовая формулировка','sourceUrl':'https://forum.majestic-rp.ru/threads/test.42/','aliases':'Deathmatch'}.items():
        await form.locator('[name='+name+']').fill(value)
    await form.locator('[data-rules-action=add-sanction]').click()
    await form.locator('[name=min]').fill('30')
    await form.locator('[name=max]').fill('60')
    await form.locator('button[type=submit]').click()
    await page.locator('#rules-detail').get_by_text('5.1 — QA DM',exact=True).wait_for()
    await page.locator('[data-rules-action=edit]').click()
    await form.locator('[name=text]').fill('Новая редакция QA')
    await form.locator('button[type=submit]').click()
    await page.locator('#rules-detail').get_by_text('Новая редакция QA',exact=True).wait_for()
    await page.locator('#rules-revision').select_option(index=0)
    await page.locator('[data-rules-action=compare]').click()
    assert await page.locator('#rules-compare').get_by_text('Новая редакция QA',exact=True).is_visible()
    await page.locator('[data-rules-action=activate]').click()
    await page.wait_for_function("window.__data.majesticToolkitRulesV1[0].activeRevisionId===window.__data.majesticToolkitRulesV1[0].revisions[0].id")
    await page.locator('#rules-query').fill('Deathmatch')
    assert await page.locator('#rules-list article').count()==1
    await page.locator('#rules-type').select_option('ban')
    assert await page.locator('#rules-list article').count()==0
    await page.locator('#rules-type').select_option('')
    await page.evaluate("async()=>{const m=await import('mt:lib/source-library.mjs');await m.saveSource({profileId:'profile_majest',kind:'forum',title:'QA источник',url:'https://forum.majestic-rp.ru/threads/test.42/',body:'5.1. Первая формулировка правила. 5.2. Вторая формулировка правила.'});}")
    await page.locator('[data-rules-action=refresh]').click()
    await page.locator('#rules-source').select_option(label='QA источник')
    await page.locator('[data-rules-action=source]').click()
    await page.locator('[data-rules-action=candidate][data-id="0"]').click()
    assert await form.locator('[name=code]').input_value()=='5.1'
    assert await form.locator('[name=text]').input_value()=='Первая формулировка правила.'
    await form.locator('[data-rules-action=cancel]').click()
    await page.locator('.nav [data-view=search]').click()
    await page.locator('#productivity-search').fill('Deathmatch')
    await page.locator('.productivity-hit').get_by_text('5.1 — QA DM',exact=True).wait_for()
    await page.locator('#workspace-profile').select_option('profile_russia')
    await page.locator('.nav [data-view=rules]').click()
    await page.locator('#rules-list').wait_for()
    assert await page.locator('#rules-list article').count()==0
    await page.locator('#workspace-profile').select_option('profile_majest')
    await page.locator('#rules-list article').wait_for()
    assert await page.locator('#rules-list article').count()==1
    # Structured import through the actual file chooser and confirmation dialog.
    await page.locator('#rules-root [data-action=nav][data-view=forum]').click()
    await page.locator('#forum-search').wait_for(state='visible')
    legacy={'bindFolders':[{'id':'folder_qa','name':'QA правила','color':'blue'}],
        'binds':[{'id':'bind_qa01','folderId':'folder_qa','color':'blue','titelOutput':'QA PG','textOutput':'','punish':{'on':True,'reasonText':'PG','link':'https://forum.majestic-rp.ru/threads/test.42/#:~:text=5.5%20PG','t':{'demorgan':{'min':35,'max':90}},'warn':True}}],
        'customLinks':[{'name':'QA ссылка','url':'https://forum.majestic-rp.ru/forums/test.42/'}],
        'calcSettings':{'banDays':2,'idColor':'#9365b8','idColorOn':True,'limit':135,'stepEvery':60,'stepFrom':200,'warnBanDays':2}}
    async def import_legacy():
        async with page.expect_file_chooser() as chooser:
            await page.locator('[data-forum-action=import-pack]').click()
        await (await chooser.value).set_files({'name':'binds_and_links.json','mimeType':'application/json','buffer':json.dumps(legacy).encode()})
        dlg=page.locator('dialog.binder-task-dialog')
        await dlg.get_by_text('Rules & Binds Import',exact=True).wait_for()
        await dlg.locator('[name=mode]').select_option('merge')
        await dlg.locator('button[type=submit]').click()
        await dlg.wait_for(state='detached')
    await import_legacy()
    await page.wait_for_function("window.__data.majesticToolkitRulesV1.length===2 && !!window.__data.rpNexusStateV1.profiles[0].rulesImport")
    await page.locator('[data-forum-action=open-rule]').wait_for()
    await page.locator('[data-forum-action=open-rule]').click()
    assert await page.evaluate("window.__tabs.at(-1).url.includes('?rule=legacy_rule_')")
    await import_legacy()
    await page.wait_for_function("window.__data.majesticToolkitRecoveryV1.status==='ready'")
    assert await page.evaluate("window.__data.majesticToolkitRulesV1.length===2")
    await page.locator('.nav [data-view=rules]').click()
    await page.locator('#rules-import-settings').wait_for()
    await page.locator('#rules-import-settings [name=limit]').fill('150')
    await page.locator('#rules-import-settings button[type=submit]').click()
    await page.wait_for_function("window.__data.rpNexusStateV1.profiles[0].rulesImport.calcSettings.limit===150")
    await page.locator('#rules-query').fill('QA PG')
    await page.locator('#rules-list article').get_by_text('5.5 — QA PG',exact=True).wait_for()
    await page.locator('#rules-list [data-rules-action=open]').click()
    await page.locator('#rules-detail').get_by_text('Связанный бинд: QA PG · bind_qa01',exact=True).wait_for()
    await page.set_viewport_size({'width':375,'height':780})
    assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
    assert not errors,errors
    await context.close()
    return 3


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
                cases+=await experience_workspace(browser)
                print(f'{name} browser E2E: {cases} scenarios passed (offline XenForo DOM fixtures)')
            finally:await browser.close()

if __name__=='__main__':asyncio.run(main())
