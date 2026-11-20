#!/usr/bin/env python3
"""2.3.6 Chromium DOM: real forms, draft transitions, local source UI, HTML escaping."""
import asyncio, base64, json, re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
    modules={}
    def add_module(path):
        path=path.resolve();key='mt:'+path.relative_to(ROOT/'src').as_posix()
        if key in modules:return key
        modules[key]=''
        def rewrite(m):return m.group(1)+add_module((path.parent/m.group(2)).resolve())+m.group(1)
        source=re.sub(r"(['\"])(\.{1,2}/[^'\"\n]+\.m?js)\1",rewrite,path.read_text())
        modules[key]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
        return key
    add_module(ROOT/'src/ui/cloud-knowledge-page.mjs')
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            page=await browser.new_page();errors=[]
            page.on('pageerror',lambda err:errors.append(str(err)))
            await page.set_content('<!doctype html><html><head><script type="importmap">'+json.dumps({'imports':modules})+'</script></head><body><main id="root"></main></body></html>')
            await page.evaluate("""()=>{
              window.confirm=()=>true;
              window.browser={storage:{local:{async get(k){if(k===null)return {};return {[k]:undefined};}}}};
              const teamId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',cloudId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
              window.__team={id:teamId,role:'editor'};
              window.__storage={profiles:[{id:cloudId,name:'Team RP'}],remote:{id:cloudId,name:'Team RP'},chosen:{id:'local-profile-0001'}};
              window.__items=[];window.__id=0;window.__audit=[];window.__collections=[];window.__membership=new Set();
              const fmt=item=>({...item,publishedRevision:item.publishedRevision||null,sha256:'a'.repeat(64),status:item.status||'draft',revision:item.revision||1});
              window.__rpc=async(action,input)=>{
                 if(action==='knowledgeList')return {items:__items.map(fmt),nextCursor:null};
                 if(action==='knowledgeCollections')return {collections:__collections};
                 if(action==='knowledgeCollectionGet')return {collection:__collections.find(x=>x.id===input.collectionId),items:__items.filter(x=>__membership.has(x.id)).map(x=>({id:x.id,title:x.title}))};
                 if(action==='knowledgeCollectionCreate'){const c={id:'cccccccc-cccc-cccc-cccc-cccccccccccc',title:input.title,notes:input.notes,version:1};__collections=[c];return {collection:c};}
                 if(action==='knowledgeCollectionAdd'){__membership.add(input.itemId);const c=__collections[0];c.version++;return {collection:c};}
                 if(action==='knowledgeCollectionRemove'){__membership.delete(input.itemId);const c=__collections[0];c.version++;return {collection:c};}
                 if(action==='knowledgeCollectionDelete'){__collections=[];return {ok:true};}
                 if(action==='knowledgeCreate') {const item=fmt({...input,id:'00000000-0000-0000-0000-'+String(++__id).padStart(12,'0')});__items.push(item);return {item};}
                 if(action==='knowledgeGet')return {item:fmt(__items.find(x=>x.id===input.itemId))};
                 if(action==='knowledgeHistory')return {revisions:__items.filter(x=>x.id===input.itemId).map(x=>({revision:x.revision,title:x.title,body:x.body,sha256:'a'.repeat(64),createdAt:new Date().toISOString()}))};
                 if(action==='knowledgeEvents')return {events:[]};
                 if(action==='knowledgeEdit'){let item=__items.find(x=>x.id===input.itemId);Object.assign(item,input,{revision:item.revision+1});return {item:fmt(item)};}
                 if(action==='knowledgeSubmit'){let item=__items.find(x=>x.id===input.itemId);item.status='review';return {item:fmt(item)};}
                 if(action==='knowledgeReview'){let item=__items.find(x=>x.id===input.itemId);item.status=input.decision==='approve'?'approved':'rejected';return {item:fmt(item)};}
                 if(action==='knowledgePublish'){let item=__items.find(x=>x.id===input.itemId);item.status='published';item.publishedRevision=item.revision;return {item:fmt(item)};}
                 throw Error('Unexpected '+action);
              };
            }""")
            await page.evaluate("""async()=>{
              window.__ui=await import('mt:ui/cloud-knowledge-page.mjs');
              window.__render=async()=>{const data=await __ui.loadSharedKnowledge(__team,__storage,__rpc);document.getElementById('root').innerHTML=__ui.sharedKnowledgePanel(data);};
              await __render();
            }""")
            assert await page.locator('#cloud-knowledge-create-form').count()==1
            await page.locator('#cloud-knowledge-collection-create-form input[name=title]').fill('Общая коллекция')
            await page.evaluate("""async()=>{await __ui.handleSharedKnowledgeSubmit(document.querySelector('#cloud-knowledge-collection-create-form'),()=>{},__rpc);await __render();}""")
            assert 'Общая коллекция' in await page.locator('.shared-collections').inner_text()
            await page.locator('#cloud-knowledge-create-form input[name=title]').fill('<img src=x onerror=alert(1)>')
            await page.locator('#cloud-knowledge-create-form textarea[name=body]').fill('<script>alert(1)</script>')
            await page.evaluate("""async()=>{await __ui.handleSharedKnowledgeSubmit(document.querySelector('#cloud-knowledge-create-form'),()=>{},__rpc);await __render();}""")
            assert await page.locator('#cloud-knowledge-edit-form').count()==1
            await page.evaluate("""async()=>{await __ui.handleSharedKnowledgeAction(document.querySelector('[data-cloud-action=knowledgeCollectionAdd]'),()=>{},__rpc);await __render();}""")
            assert await page.locator('[data-cloud-action=knowledgeCollectionRemove]').count()==1
            assert await page.locator('#root img').count()==0
            assert await page.locator('#root script').count()==0
            assert '&lt;script&gt;' in await page.locator('#cloud-knowledge-edit-form textarea').input_value() or '<script>' in await page.locator('#cloud-knowledge-edit-form textarea').input_value()
            await page.locator('#cloud-knowledge-edit-form textarea').fill('Редакция 2')
            await page.evaluate("""async()=>{await __ui.handleSharedKnowledgeSubmit(document.querySelector('#cloud-knowledge-edit-form'),()=>{},__rpc);await __render();}""")
            assert await page.locator('.shared-knowledge-detail').count()==1
            await page.evaluate("""async()=>{await __ui.handleSharedKnowledgeAction(document.querySelector('[data-cloud-action=knowledgeSubmit]'),()=>{},__rpc);await __render();}""")
            assert 'На согласовании' in await page.locator('.shared-knowledge-detail').inner_text()
            await page.evaluate("""async()=>{__team.role='admin';await __render();}""")
            await page.locator('#cloud-knowledge-review-form select[name=decision]').select_option('approve')
            await page.evaluate("""async()=>{await __ui.handleSharedKnowledgeSubmit(document.querySelector('#cloud-knowledge-review-form'),()=>{},__rpc);await __render();}""")
            await page.evaluate("""async()=>{await __ui.handleSharedKnowledgeAction(document.querySelector('[data-cloud-action=knowledgePublish]'),()=>{},__rpc);await __render();}""")
            assert 'Опубликовано' in await page.locator('.shared-knowledge-detail').inner_text()
            assert not errors,errors
            print('Shared Knowledge & Templates 2.3.6 Chromium DOM: PASS')
        finally:await browser.close()
if __name__=='__main__':asyncio.run(main())
