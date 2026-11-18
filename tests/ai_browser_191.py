"""Browser DOM test of the real AI connection UI with an in-memory network fixture."""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

async def ai_connection_browser(browser):
    context = await browser.new_context()
    page = await context.new_page()
    # Reuse the exact production modules; mock only WebExtension storage/permissions
    # and the network response from a local self-hosted gateway.
    modules = {}
    def add(path):
        path = path.resolve()
        name = 'mt:' + path.relative_to(ROOT/'src').as_posix()
        if name in modules: return name
        modules[name] = ''
        def sub(match): return match.group(1) + add((path.parent/match.group(2)).resolve()) + match.group(1)
        code = re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",sub,path.read_text())
        modules[name] = 'data:text/javascript;base64,' + base64.b64encode(code.encode()).decode()
        return name
    add(ROOT/'src/ui/ai-page.mjs')
    await page.set_content('<html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><div id="app"></div></body></html>')
    await page.evaluate(r'''() => {
      const store={},calls=[];window.__store=store;window.__calls=calls;
      window.browser={permissions:{async request(x){if(!x.origins.includes('http://127.0.0.1/*'))throw Error('Wrong permission');window.__granted=true;return true;},async contains(){return !!window.__granted;}},storage:{local:{async get(k){return {[k]:store[k]};},async set(x){Object.assign(store,structuredClone(x));}}}};
      const enc=new TextEncoder();window.fetch=async(url,opts={})=>{
       if(!window.__granted)throw Error('Permission not granted');
       if(url.endsWith('/health'))return new Response(JSON.stringify({ok:true,model:'test-model',remaining:29,dailyLimit:30}),{status:200});
       if(url.endsWith('/v1/chat')){
        calls.push(JSON.parse(opts.body));
        const events=['event: ready\ndata: {"model":"test-model"}\n\n','event: delta\ndata: {"text":"Привет "}\n\n','event: delta\ndata: {"text":"из AI"}\n\n','event: complete\ndata: {"usage":{"inputTokens":12,"outputTokens":9}}\n\n'];
        return new Response(new ReadableStream({start(c){events.forEach(x=>c.enqueue(enc.encode(x)));c.close();}}),{status:200,headers:{'Content-Type':'text/event-stream'}});
       }
       throw Error('Wrong route');
      };
    }''')
    await page.evaluate('''async()=>{window.__AI=await import('mt:ui/ai-page.mjs');window.__mount=async id=>{const root=document.getElementById('app');root.innerHTML=window.__AI.aiSection();await window.__AI.mountAI(root.querySelector('#ai-connection'),{activeProfileId:id},()=>{});};await window.__mount('first');}''')
    try:
        assert not await page.locator('#ai-enabled').is_checked()
        await page.locator('#ai-enabled').check()
        await page.wait_for_function('window.__store.mtAiConnectionV191?.first?.enabled===true')
        await page.locator('#ai-token').fill('fake-gateway-token-only')
        await page.locator('#ai-connect').click()
        await page.get_by_text('Шлюз подключён',exact=False).wait_for(timeout=3000)
        await page.locator('#ai-question').fill('Текст с согласием')
        assert await page.locator('#ai-preview').inner_text()=='Текст с согласием'
        assert await page.evaluate('window.__calls.length')==0
        await page.locator('#ai-confirm').check()
        await page.locator('#ai-send').click()
        await page.get_by_text('Привет из AI',exact=True).wait_for(timeout=3000)
        assert await page.evaluate('window.__calls')==[{'question':'Текст с согласием'}]
        await page.evaluate('window.__mount("second")')
        assert await page.locator('#ai-token').input_value()==''
        assert not await page.locator('#ai-enabled').is_checked()
        assert not await page.get_by_text('Привет из AI',exact=True).count()
        # The only persisted property is enabled; no API key, token or question.
        assert await page.evaluate('JSON.stringify(window.__store)')=='{"mtAiConnectionV191":{"first":{"enabled":true}}}'
        return 1
    finally:
        await context.close()

if __name__=='__main__':
    import asyncio
    from playwright.async_api import async_playwright
    async def run():
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            try: print('AI DOM browser E2E:',await ai_connection_browser(browser),'passed')
            finally: await browser.close()
    asyncio.run(run())
