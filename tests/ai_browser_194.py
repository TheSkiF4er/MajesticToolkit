"""Chromium integration of the actual AI Support UI with a local mocked gateway."""
import base64
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
async def ai_support_browser(browser):
    context=await browser.new_context(accept_downloads=True)
    page=await context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    modules={}
    def add(path):
        path=path.resolve();name='mt:'+path.relative_to(ROOT/'src').as_posix()
        if name in modules:return name
        modules[name]=''
        def sub(match):return match.group(1)+add((path.parent/match.group(2)).resolve())+match.group(1)
        source=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",sub,path.read_text())
        modules[name]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
        return name
    add(ROOT/'src/ui/ai-page.mjs')
    await page.set_content('<html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><div id="app"></div></body></html>')
    await page.evaluate(r'''() => {
      const store={},calls=[];window.__store=store;window.__calls=calls;
      window.browser={runtime:{getManifest:()=>({version:'1.9.4'})},permissions:{async request(){window.__granted=true;return true},async contains({origins}){return origins.some(x=>x.includes('127.0.0.1'))?!!window.__granted:true;}},storage:{local:{async get(k){return k===null?structuredClone(store):{[k]:structuredClone(store[k])};},async set(x){Object.assign(store,structuredClone(x));}}}};
      const enc=new TextEncoder();window.fetch=async(url,opts={})=>{
       if(url.endsWith('/health'))return new Response(JSON.stringify({ok:true,model:'support-test-model',remaining:29,dailyLimit:30}),{status:200});
       if(!url.endsWith('/v1/chat'))throw Error('Unexpected network request '+url);
       const payload=JSON.parse(opts.body);calls.push(payload);
       const reply={summary:'Версия и разрешения проверены.',possibleCause:'Возможно, выбран неверный тип резервной копии.',steps:['Убедитесь, что для переноса файлов используется ZIP v17.'],additionalQuestions:['Какая ошибка в интерфейсе?'],severity:'warning',requiresHumanReview:true};
       const events=['event: ready\ndata: {"model":"fixture"}\n\n','event: delta\ndata: '+JSON.stringify({text:JSON.stringify(reply)})+'\n\n','event: complete\ndata: {"usage":{"inputTokens":20,"outputTokens":40}}\n\n'];
       return new Response(new ReadableStream({start(c){for(const s of events)c.enqueue(enc.encode(s));c.close();}}),{status:200});
      };
    }''')
    await page.evaluate('''async()=>{window.__AI=await import('mt:ui/ai-page.mjs');window.__mount=async(id)=>{let root=document.getElementById('app');root.innerHTML=window.__AI.aiSection();await window.__AI.mountAI(root.querySelector('#ai-connection'),{activeProfileId:id,profiles:[{id:'alpha',project:'majestic',server:'Alpha'},{id:'beta',project:'majestic',server:'Beta'}]},()=>{});};await window.__mount('alpha');}''')
    try:
        assert not await page.locator('#ai-enabled').is_checked()
        await page.locator('#ai-support-category').select_option('backup')
        await page.locator('#ai-support-issue').fill('Ошибка восстановления, пароль=private12345, test@example.com')
        await page.locator('#ai-support-local').click()
        assert 'резервную' in await page.locator('#ai-support-steps').inner_text()
        await page.locator('#ai-support-scan').click()
        await page.wait_for_function('document.querySelector("#ai-support-report").disabled===false')
        assert 'Хранилище' in await page.locator('#ai-support-checks').inner_text()
        async with page.expect_download() as event:
            await page.locator('#ai-support-report').click()
        download=await event.value
        assert download.suggested_filename.startswith('majestictoolkit-support-')
        report=json.loads((await download.path()).read_text())
        assert report['version']=='1.9.4' and report['category']=='backup'
        assert 'private12345' not in json.dumps(report)
        await page.locator('#ai-support-prepare').click()
        preview=await page.locator('#ai-support-preview').inner_text()
        assert 'СКРЫТ_СЕКРЕТ' in preview and 'private12345' not in preview and 'test@example.com' not in preview
        assert await page.evaluate('window.__calls.length')==0
        await page.locator('#ai-enabled').check()
        await page.locator('#ai-token').fill('local-gateway-only-token')
        await page.locator('#ai-support-consent').check()
        await page.locator('#ai-support-send').click()
        await page.get_by_text('Убедитесь, что для переноса файлов используется ZIP v17.').wait_for(timeout=7000)
        assert await page.evaluate('window.__calls.length')==1
        sent=await page.evaluate('window.__calls[0]')
        assert sent['mode']=='support' and sent['diagnostics']['category']=='backup'
        assert 'private12345' not in str(sent) and 'test@example.com' not in str(sent)
        assert set(sent['diagnostics'])=={'category','version','checks'}
        await page.evaluate('window.__mount("beta")')
        await page.locator('#ai-support-category').wait_for()
        assert await page.locator('#ai-token').input_value()==''
        assert not await page.locator('#ai-enabled').is_checked()
        assert await page.locator('#ai-support-checks').inner_text()==''
        assert not errors,errors
        return 1
    finally:await context.close()
if __name__=='__main__':
    import asyncio
    from playwright.async_api import async_playwright
    async def main():
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            try:print('AI Support Chromium:',await ai_support_browser(browser),'passed')
            finally:await browser.close()
    asyncio.run(main())
