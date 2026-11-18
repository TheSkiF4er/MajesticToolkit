"""End-to-end AI 2.0 streaming recovery and explicit consent against real UI modules."""
import base64
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

async def ai_release_browser(browser):
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
      const a='profile_200_A',b='profile_200_B';window.__profiles=[{id:a,project:'majestic',server:'A'},{id:b,project:'majestic',server:'B'}];
      window.__store={};window.__calls=[];window.__round=0;window.__granted=false;
      window.confirm=()=>true;
      window.browser={permissions:{async request(){window.__granted=true;return true;},async contains(){return window.__granted;}},storage:{local:{async get(k){return k===null?structuredClone(window.__store):{[k]:structuredClone(window.__store[k])};},async set(x){Object.assign(window.__store,structuredClone(x));},async remove(k){delete window.__store[k];}}}};
      window.fetch=async(url,options={})=>{
       if(!url.endsWith('/v1/chat'))throw Error('Unexpected '+url);
       const body=JSON.parse(options.body);window.__calls.push(body);window.__round++;
       const enc=new TextEncoder();const incomplete=window.__round===1;
       const chunks=['event: ready\ndata: {"model":"test"}\n\n','event: delta\ndata: {"text":"'+(incomplete?'Неполный ответ':'Полный ответ')+'"}\n\n'];
       if(!incomplete)chunks.push('event: complete\ndata: {"usage":{"inputTokens":10,"outputTokens":8}}\n\n');
       return new Response(new ReadableStream({start(c){for(const s of chunks)c.enqueue(enc.encode(s.replaceAll('\\n','\n')));c.close();}}),{status:200});
      };
      window.__AI=await import('mt:ui/ai-page.mjs');
      window.__mount=async id=>{const app=document.querySelector('#app');app.innerHTML=window.__AI.aiSection();await window.__AI.mountAI(app.querySelector('#ai-connection'),{activeProfileId:id,profiles:window.__profiles},()=>{});};
      await window.__mount(a);
    }''')
    try:
        await page.locator('#ai-enabled').check()
        await page.locator('#ai-token').fill('token_only_in_memory')
        await page.locator('[data-ai-mode=chat]').click()
        await page.locator('#ai-question').fill('Пробный вопрос')
        await page.locator('#ai-confirm').check()
        await page.locator('#ai-send').click()
        await page.get_by_text('Поток ответа прерван',exact=False).wait_for(timeout=8000)
        assert await page.locator('#ai-replies article').count()==0
        assert await page.evaluate('window.__calls.length')==1
        assert 'mtAiWorkspaceV195:profile_200_A' not in (await page.evaluate('window.__store'))
        await page.locator('#ai-question').fill('Повторная проверка')
        assert '"history"' not in (await page.locator('#ai-preview').inner_text())
        await page.locator('#ai-confirm').check()
        await page.locator('#ai-send').click()
        await page.get_by_text('Полный ответ',exact=True).wait_for(timeout=8000)
        assert (await page.evaluate('window.__calls[1]'))=={'question':'Повторная проверка'}
        await page.locator('[data-ai-mode=saved]').click()
        await page.locator('#ai-workspace-save-chat').click()
        await page.get_by_text('Диалог сохранён локально по вашему запросу.').wait_for(timeout=6000)
        saved=await page.evaluate('window.__store["mtAiWorkspaceV195:profile_200_A"]')
        assert saved['conversations'][0]['messages']==[{'role':'user','text':'Повторная проверка'},{'role':'assistant','text':'Полный ответ'}]
        await page.evaluate('window.__mount("profile_200_B")')
        await page.locator('#ai-workspace-conversations').get_by_text('Диалоги не сохранены.').wait_for(timeout=5000)
        assert await page.locator('#ai-token').input_value()==''
        assert not await page.locator('#ai-enabled').is_checked()
        assert not errors,errors
        return 1
    finally:
        await context.close()
