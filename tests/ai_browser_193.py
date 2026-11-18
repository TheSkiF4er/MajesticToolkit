"""Real Chromium DOM for consent-driven AI complaint analysis and manual draft persistence."""
import base64
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

async def ai_complaint_browser(browser):
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
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    await page.set_content('<html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><div id="app"></div></body></html>')
    await page.evaluate(r'''async()=>{
      window.__calls=[];window.__granted=false;window.__store={};
      const a='profile_193_active',b='profile_193_foreign';
      window.__profiles=[{id:a,project:'majestic',name:'Alpha',server:'Alpha'},{id:b,project:'majestic',name:'Other',server:'Other'}];
      window.browser={permissions:{async request(){window.__granted=true;return true},async contains(){return window.__granted}},runtime:{async sendMessage(message){if(message.action!=='ai-draft')throw Error('Unexpected action');const key='rpnComplaintV3:'+message.id;const c=window.__store[key];if(c.profileId!==message.profileId||c.updatedAt!==message.expectedAt)return {ok:false,error:'Изменена жалоба'};const core=window.RPNComplaints;const updated=core.updateCase(c,{draft:message.text});window.__store[key]=updated;return {ok:true,value:updated};}},storage:{local:{async get(key){return key===null?structuredClone(window.__store):{[key]:structuredClone(window.__store[key])};},async set(x){Object.assign(window.__store,structuredClone(x));}}}};
      await import('mt:lib/complaints-core.js');
      const C=window.RPNComplaints;
      let c=C.createCase({profileId:a,title:'Жалоба на игрока',url:'https://forum.majestic-rp.ru/threads/ai-case.193/',note:'ПРИВАТНАЯ ЗАМЕТКА НЕ ОТПРАВЛЯТЬ'});
      c=C.addEvidence(c,{title:'Видеодоказательство',url:'https://youtu.be/testcase193',seconds:42,note:'Есть запись'});
      c=C.timelineAction(c,'add',{title:'Эпизод',description:'Предполагаемый конфликт',occurredAt:null,status:'unverified',participants:['Private Name'],evidenceIds:[c.evidence[0].id],clipEvidenceId:c.evidence[0].id,startSeconds:42,endSeconds:55});
      window.__case=c;window.__store['rpnComplaintV3:'+c.id]=c;
      const enc=new TextEncoder();
      window.fetch=async (url,options={})=>{if(!url.endsWith('/v1/chat'))throw Error('Unexpected '+url);const payload=JSON.parse(options.body);window.__calls.push(payload);
        const ref=payload.case.evidence[0].ref,evt=payload.case.events[0].ref;
        const report={summary:'Предварительный разбор: требуются дополнительные сведения.',facts:[{text:'Видеофрагмент соответствует эпизоду.',evidenceRefs:[ref],eventRefs:[evt]}],possibleViolations:[],contradictions:['Участники расходятся в показаниях'],missingEvidence:['Второй ракурс'],questionsForReview:['Есть ли другие записи?'],draftResponse:'Пожалуйста, предоставьте дополнительное видео.',requiresHumanReview:true};
        const chunks=['event: ready\ndata: {"model":"fixture"}\n\n','event: delta\ndata: '+JSON.stringify({text:JSON.stringify(report)})+'\n\n','event: complete\ndata: {"usage":{"inputTokens":25,"outputTokens":80}}\n\n'];
        return new Response(new ReadableStream({start(c){for(const s of chunks)c.enqueue(enc.encode(s));c.close();}}),{status:200});};
      window.__AI=await import('mt:ui/ai-page.mjs');
      window.__mount=async id=>{const root=document.querySelector('#app');root.innerHTML=window.__AI.aiSection();await window.__AI.mountAI(root.querySelector('#ai-connection'),{activeProfileId:id,profiles:window.__profiles},(message,isError)=>window.__feedback={message,isError});};
      window.confirm=()=>true;
      await window.__mount(a);
    }''')
    try:
        await page.locator('#ai-enabled').check()
        await page.locator('#ai-token').fill('test-gateway-token')
        await page.wait_for_function('document.querySelectorAll("#ai-case-select option").length===2',timeout=5000)
        await page.locator('#ai-case-select').select_option(await page.evaluate('window.__case.id'))
        await page.locator('#ai-case-evidence input').first.check()
        await page.locator('#ai-case-events input').first.check()
        await page.locator('#ai-case-prepare').click()
        preview=await page.locator('#ai-case-preview').inner_text()
        assert 'Видеодоказательство' in preview and 'Эпизод' in preview
        assert 'ПРИВАТНАЯ ЗАМЕТКА' not in preview and 'youtu.be' not in preview and 'Private Name' not in preview
        assert await page.evaluate('window.__calls.length')==0
        await page.locator('#ai-case-consent').check()
        await page.locator('#ai-case-send').click()
        await page.locator('#ai-case-save-draft').wait_for(timeout=6000)
        assert 'Второй ракурс' in await page.locator('#ai-case-answer').inner_text()
        assert await page.evaluate('window.__calls.length')==1
        assert (await page.evaluate('window.__calls[0]'))['mode']=='complaint'
        await page.locator('#ai-case-draft-edit').fill('Проверенный вручную запрос дополнительных материалов')
        await page.locator('#ai-case-save-draft').click()
        await page.wait_for_function('window.__store["rpnComplaintV3:"+window.__case.id].draft.includes("Проверенный вручную")')
        assert not await page.evaluate('window.__calls[0].case.participants')
        await page.evaluate('window.__mount("profile_193_foreign")')
        await page.locator('#ai-case-select').wait_for(timeout=5000)
        assert await page.locator('#ai-token').input_value()==''
        assert await page.locator('#ai-case-select option').count()==1
        assert not await page.locator('#ai-enabled').is_checked()
        assert not errors,errors
        return 1
    finally:
        await context.close()

if __name__=='__main__':
    import asyncio
    from playwright.async_api import async_playwright
    async def main():
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            try: print('AI Complaint Chromium:',await ai_complaint_browser(browser),'passed')
            finally:await browser.close()
    asyncio.run(main())
