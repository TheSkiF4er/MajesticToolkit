"""Real Rules & Knowledge AI UI: local retrieval, user consent, gateway stream and profile isolation."""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

async def ai_rules_browser(browser):
    modules = {}
    def add(path):
        path = path.resolve()
        name = 'mt:' + path.relative_to(ROOT/'src').as_posix()
        if name in modules: return name
        modules[name] = ''
        def sub(m): return m.group(1) + add((path.parent/m.group(2)).resolve()) + m.group(1)
        code = re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1", sub, path.read_text())
        modules[name] = 'data:text/javascript;base64,' + base64.b64encode(code.encode()).decode()
        return name
    add(ROOT/'src/ui/ai-page.mjs')
    context = await browser.new_context()
    page = await context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    await page.set_content('<html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><div id="app"></div></body></html>')
    await page.evaluate(r'''async()=>{
      const store={};window.__store=store;window.__calls=[];
      const a='profile_192_active',b='profile_192_other';
      window.__profiles=[{id:a,project:'majestic',name:'Alpha',server:'Alpha'},{id:b,project:'majestic',name:'Other',server:'Other'}];
      window.browser={permissions:{async request(){window.__granted=true;return true},async contains(){return !!window.__granted}},storage:{local:{async get(key){return {[key]:structuredClone(store[key])};},async set(value){Object.assign(store,structuredClone(value));}}}};
      const r={id:'rule_192_demo',profileId:a,project:'majestic',server:'',favorite:false,archived:false,note:'private note never transmit',updatedAt:'2026-11-18T07:00:00.000Z',lastOpened:null,activeRevisionId:'revision_192_demo',revisions:[{id:'revision_192_demo',createdAt:'2026-11-18T07:00:00.000Z',code:'5.1',title:'Deathmatch DM',category:'Правила',text:'Запрещено нападение без RP причины. Наказание 30–60 минут при выполнении условий.',aliases:['DM'],sourceUrl:'https://forum.majestic-rp.ru/threads/rules.192/',sourceTitle:'Правила',verification:'reviewed',sanctions:[{type:'demorgan',unit:'minutes',min:30,max:60,condition:''}],conditions:'Нужно проверить доказательства',changeNote:''}]};
      store.majesticToolkitRulesV1=[r];window.__rule=r;
      store.majesticToolkitSourceLibraryV154=[{id:'source_192_guide',profileId:a,kind:'forum',url:'https://forum.majestic-rp.ru/threads/guide.192/',title:'Обзор DM',body:'Объяснение DM на сервере: запрещено нападать на игроков без причины, применяется пункт 5.1.',capturedAt:'2026-11-18T07:00:00Z',status:'reviewed',sha256:null,notes:'Личная заметка: не отправлять в OpenAI',revisions:[]}];
      const enc=new TextEncoder();
      window.fetch=async (url,opts={})=>{
        if(!window.__granted)throw Error('Permission missing');
        if(url.endsWith('/v1/chat')){
          const body=JSON.parse(opts.body);window.__calls.push(body);
          const chunks=['event: ready\ndata: {"model":"fixture"}\n\n','event: delta\ndata: {"text":"По правилу DM [1] "}\n\n','event: delta\ndata: {"text":"нет источника [9]."}\n\n','event: complete\ndata: {"usage":{"inputTokens":85,"outputTokens":22}}\n\n'];
          return new Response(new ReadableStream({start(c){chunks.forEach(x=>c.enqueue(enc.encode(x)));c.close();}}),{status:200});
        }
        throw Error('Unexpected route '+url);
      };
      window.__AI=await import('mt:ui/ai-page.mjs');
      window.__mount=async (id)=>{
        const root=document.getElementById('app');root.innerHTML=window.__AI.aiSection();
        await window.__AI.mountAI(root.querySelector('#ai-connection'),{activeProfileId:id,profiles:window.__profiles},(msg,err)=>{window.__feedback={msg,err};});
      };
      await window.__mount(a);
    }''')
    try:
        await page.locator('#ai-enabled').check()
        await page.wait_for_function('window.__store.mtAiConnectionV191?.profile_192_active?.enabled===true')
        await page.locator('#ai-token').fill('mocked-gateway-token')
        await page.locator('#ai-rules-question').fill('Какие санкции за DM?')
        await page.locator('#ai-rules-search').click()
        await page.locator('#ai-rules-results').get_by_text('5.1 — Deathmatch DM',exact=False).first.wait_for(timeout=5000)
        assert await page.locator('#ai-rules-consent').is_checked()==False
        assert await page.evaluate('window.__calls.length')==0
        rule_checkbox=page.locator('#ai-rules-results input[type=checkbox]').first
        await rule_checkbox.check()
        preview=await page.locator('#ai-rules-preview').inner_text()
        assert '5.1' in preview and 'https://forum.majestic-rp.ru' in preview
        assert 'Личная заметка' not in preview and 'profile_192_active' not in preview
        await page.locator('#ai-rules-consent').check()
        await page.locator('#ai-rules-send').click()
        await page.locator('#ai-rules-answer').get_by_text('По правилу DM',exact=False).first.wait_for(timeout=6000)
        await page.wait_for_function('window.__calls.length===1')
        calls=await page.evaluate('window.__calls')
        assert calls[0]['mode']=='rules' and len(calls[0]['sources'])==1
        assert calls[0]['sources'][0]['revisionId']
        assert 'notes' not in json.dumps(calls)
        assert 'неподтверждённая ссылка' in await page.locator('#ai-rules-answer').inner_text()
        assert await page.locator('#ai-rules-answer a[href="https://forum.majestic-rp.ru/threads/rules.192/"]').count()==1
        await page.evaluate('window.__mount("profile_192_other")')
        await page.locator('#ai-rules-question').fill('Какие санкции за DM?')
        await page.locator('#ai-rules-search').click()
        await page.locator('#ai-rules-results').get_by_text('Подходящих источников нет').wait_for(timeout=5000)
        assert not await page.locator('#ai-enabled').is_checked()
        assert await page.locator('#ai-token').input_value()==''
        assert not await page.locator('#ai-rules-answer a').count()
        assert not errors, errors
        return 1
    finally:
        await context.close()

if __name__=='__main__':
    import asyncio
    from playwright.async_api import async_playwright
    async def main():
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            try:print('AI Rules Chromium:',await ai_rules_browser(browser),'passed')
            finally:await browser.close()
    asyncio.run(main())
