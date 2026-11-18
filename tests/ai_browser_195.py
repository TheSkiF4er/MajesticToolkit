"""Chromium E2E of the real AI 1.9.5 unified workspace and explicit local persistence."""
import base64
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

async def ai_workspace_browser(browser):
    modules={}
    def add(path):
        path=path.resolve();name='mt:'+path.relative_to(ROOT/'src').as_posix()
        if name in modules:return name
        modules[name]=''
        def sub(m):return m.group(1)+add((path.parent/m.group(2)).resolve())+m.group(1)
        code=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",sub,path.read_text())
        modules[name]='data:text/javascript;base64,'+base64.b64encode(code.encode()).decode()
        return name
    add(ROOT/'src/ui/ai-page.mjs')
    context=await browser.new_context()
    page=await context.new_page()
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.set_content('<html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><div id="app"></div></body></html>')
    await page.evaluate(r'''async()=>{
      window.__store={};window.__calls=[];window.__granted=false;
      const a='profile_195_active',b='profile_195_other';
      window.__profiles=[{id:a,project:'majestic',server:'Alpha'},{id:b,project:'majestic',server:'Beta'}];
      const source={id:'source_195_example',profileId:a,kind:'forum',url:'https://forum.majestic-rp.ru/threads/qa.195/',title:'Правила QA',body:'Сохранённый текст правил QA для проверки контекстного диалога.',capturedAt:'2026-11-18T08:00:00.000Z',notes:'ПРИВАТНАЯ ЗАМЕТКА',sha256:null};
      window.__store['majesticToolkitSourceLibraryV154']=[source];
      window.browser={permissions:{async request(){window.__granted=true;return true;},async contains(){return !!window.__granted;}},storage:{local:{async get(k){return k===null?structuredClone(window.__store):{[k]:structuredClone(window.__store[k])};},async set(x){Object.assign(window.__store,structuredClone(x));},async remove(k){delete window.__store[k];}}}};
      window.confirm=()=>true;
      const enc=new TextEncoder();window.fetch=async(url,opts={})=>{
       if(url.endsWith('/health'))return new Response(JSON.stringify({ok:true,model:'fixture',remaining:20,dailyLimit:30}),{status:200});
       if(!url.endsWith('/v1/chat'))throw Error('Unexpected network: '+url);
       const p=JSON.parse(opts.body);window.__calls.push(p);
       const frames=['event: ready\ndata: {"model":"fixture"}\n\n','event: delta\ndata: {"text":"Предварительный ответ QA"}\n\n','event: complete\ndata: {"usage":{"inputTokens":10,"outputTokens":30}}\n\n'];
       return new Response(new ReadableStream({start(c){for(const f of frames)c.enqueue(enc.encode(f.replaceAll('\\n','\n')));c.close();}}),{status:200});
      };
      window.__AI=await import('mt:ui/ai-page.mjs');
      window.__mount=async id=>{const root=document.querySelector('#app');root.innerHTML=window.__AI.aiSection();await window.__AI.mountAI(root.querySelector('#ai-connection'),{activeProfileId:id,profiles:window.__profiles},()=>{});};
      await window.__mount(a);
    }''')
    try:
        await page.locator('#ai-workspace-context-kind').wait_for(timeout=10000)
        await page.locator('[data-ai-mode="saved"]').click()
        assert await page.locator('#ai-workspace-root').is_visible()
        assert not await page.locator('#ai-chat-panel').is_visible()
        await page.locator('#ai-workspace-context-kind').select_option('source')
        await page.wait_for_function('document.querySelector("#ai-workspace-context-item").value==="source_195_example"',timeout=7000)
        await page.locator('#ai-workspace-pin').click()
        await page.get_by_text('Контекстная ссылка сохранена локально.').wait_for(timeout=6000)
        assert 'ПРИВАТНАЯ ЗАМЕТКА' not in str(await page.evaluate('window.__store["mtAiWorkspaceV195:profile_195_active"]'))
        await page.locator('#ai-workspace-apply').click()
        await page.wait_for_function('!document.querySelector("#ai-workspace-context-preview").hidden')
        assert await page.locator('#ai-chat-panel').is_visible()
        await page.locator('#ai-question').fill('Объясни правила QA')
        preview=await page.locator('#ai-preview').inner_text()
        assert 'Сохранённый текст правил QA' in preview
        assert 'ПРИВАТНАЯ' not in preview
        assert await page.evaluate('window.__calls.length')==0
        await page.locator('#ai-enabled').check()
        await page.locator('#ai-token').fill('LOCAL_GATEWAY_ONLY')
        await page.locator('#ai-confirm').check()
        await page.locator('#ai-send').click()
        await page.get_by_text('Предварительный ответ QA').wait_for(timeout=10000)
        assert await page.evaluate('window.__calls.length')==1
        sent=await page.evaluate('window.__calls[0]')
        assert 'Сохранённый текст правил QA' in sent['question'] and 'ПРИВАТНАЯ' not in sent['question']
        # A second turn must include bounded prior user+assistant messages in an explicit preview.
        await page.locator('#ai-question').fill('Уточни предыдущий ответ')
        second_preview=await page.locator('#ai-preview').inner_text()
        assert '"history"' in second_preview and 'Предварительный ответ QA' in second_preview
        await page.locator('#ai-confirm').check()
        await page.locator('#ai-send').click()
        await page.wait_for_function('window.__calls.length===2')
        assert (await page.evaluate('window.__calls[1]'))['mode']=='chat'
        assert len((await page.evaluate('window.__calls[1]'))['history'])==2
        await page.locator('[data-ai-mode="saved"]').click()
        await page.locator('#ai-workspace-save-chat').click()
        await page.get_by_text('Диалог сохранён локально по вашему запросу.').wait_for(timeout=7000)
        await page.locator('#ai-workspace-from-reply').click()
        await page.locator('#ai-workspace-draft-title').fill('QA AI Binder')
        await page.locator('#ai-workspace-draft-text').fill('Исправленный вручную ответ QA')
        await page.locator('#ai-workspace-save-draft').click()
        await page.get_by_text('Черновик сохранён локально по вашему запросу.').wait_for(timeout=7000)
        await page.locator('#ai-workspace-to-binder').click()
        await page.get_by_text('Шаблон Binder сохранён:',exact=False).wait_for(timeout=8000)
        assert await page.evaluate('Object.values(window.__store).some(x=>x?.label==="QA AI Binder"&&x.text==="Исправленный вручную ответ QA")')
        await page.evaluate('window.__mount("profile_195_other")')
        await page.locator('#ai-workspace-root').wait_for(timeout=8000)
        assert await page.locator('#ai-token').input_value()==''
        assert not await page.locator('#ai-enabled').is_checked()
        assert await page.locator('#ai-workspace-conversations').get_by_text('Диалоги не сохранены.').count()==1
        assert await page.locator('#ai-workspace-contexts').get_by_text('Сохранённых контекстов нет.').count()==1
        await page.evaluate('window.__mount("profile_195_active")')
        await page.locator('#ai-workspace-conversations').get_by_text('Объясни правила QA',exact=False).first.wait_for(timeout=8000)
        await page.locator('#ai-workspace-conversations').get_by_text('Открыть',exact=True).first.click()
        await page.wait_for_function('document.querySelector("#ai-workspace-status").textContent.includes("Диалог загружен в память.")',timeout=5000)
        assert 'Предварительный ответ QA' in await page.locator('#ai-replies').inner_text()
        assert await page.evaluate('window.__calls.length')==2
        assert not errors,errors
        return 1
    finally:await context.close()

if __name__=='__main__':
    import asyncio
    from playwright.async_api import async_playwright
    async def main():
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            try:print('AI Workspace Chromium:',await ai_workspace_browser(browser),'passed')
            finally:await browser.close()
    asyncio.run(main())
