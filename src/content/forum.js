/* Forum Experience 1.6.0: local binder + editor integration. No automated posting or moderation requests. */
(() => {
  'use strict';
  if (globalThis.MTForumSession || document.getElementById('rp-nexus-forum-020')) return;
  const { replaceHtml } = globalThis.MTSafeDOM;
  const api = globalThis.browser ?? globalThis.chrome;
  const C = globalThis.RPNForumCore;
  const XF = globalThis.MTXenForo;
  if (!XF?.identify(location.href,document)) return;
  if (!api?.runtime?.id || !C) return;
  let state = null, templates = [], customLinks = [], expanded = false, enabled=false, suspended=false, revision=0, settings={};
  let insertionMode='cursor', editorChoices=[], usage={}, binderFilter='all', binderCategory='', pending=null;
  let binderLimit=30,currentCase=null;
  let extraPane="",navMode=false,navHistory=[],forumProfiles=[],navQuery='',navSearchTimer,navSearchEpoch=0,lastVisit='',navResults=[],navSearchDone=false;
  const navAction=(action,extra={})=>api.runtime.sendMessage({type:'MT_NAVIGATION_ACTION',action,profileId:activeProfile()?.id,...extra});
  const commands=[['binder','Биндер','forum'],['complaints','Жалобы','complaints'],['search','Единый поиск','search'],['knowledge','Центр знаний','knowledge'],['profile','Профили','profiles'],['timer','Таймеры','timers'],['documents','Документы','documents'],['rules','Правила проекта','rules'],['law','Законы','law'],['customize','Оформление форума','customization'],['monitor','Серверы и игроки','monitor']];
  function navError(r){if(!r?.ok)throw Error(r?.error||'Не удалось выполнить действие');return r.value;}
  function navLink(x){return `<a class="nav-link" data-nav-link="${C.esc(x.id||'')}" href="${C.esc(x.url)}" target="${x.target==='current'?'_self':'_blank'}" rel="noopener noreferrer" title="${C.esc(x.note||'')}">${x.pinned?'★ ':''}${C.esc(x.title)}</a>`;}
  function groupedLinks(rows){const tree={entries:[],groups:new Map()};for(const x of rows){let node=tree;for(const part of (x.group||'').split('/').filter(Boolean)){if(!node.groups.has(part)){const child={entries:[],groups:new Map()};node.groups.set(part,child);node.entries.push({name:part,child});}node=node.groups.get(part);}node.entries.push({link:x});}function render(node){return node.entries.map(entry=>entry.link?navLink(entry.link):`<details open><summary>${C.esc(entry.name)}</summary><div class="nav-group">${render(entry.child)}</div></details>`).join('');}return render(tree);}
  function renderNavigationPanel(){const target=panel.querySelector('#rpn-nav-content');if(!target)return;
    const p=activeProfile(),ctx=context();const rows=XF.selectNavigation(customLinks,p?.id,ctx?.host,'panel',navQuery);
    replaceHtml(target,`<div class="section"><b>Текущая страница</b><p class="sub">${C.esc(ctx?.title||'')} · ${C.esc(ctx?.section||ctx?.kind||'')}</p><div class="actions"><button class="btn" data-nav-act="bookmark">Сохранить в Toolkit</button><button class="btn secondary" data-nav-act="copy-url">Копировать ссылку</button>${ctx?.thread?'<button class="btn secondary" data-act="track">Добавить в жалобы</button>':''}${ctx?.member?'<button class="btn secondary" data-act="save-member">Сохранить карточку</button>':''}</div></div><div class="section"><b>Персональное меню</b>${groupedLinks(rows.filter(x=>x.kind!=='bookmark'))||'<p class="sub">Нет ссылок.</p>'}<b>Закладки</b>${groupedLinks(rows.filter(x=>x.kind==='bookmark'))||'<p class="sub">Нет закладок.</p>'}</div>${settings.navigationHistory?`<div class="section"><div class="bar"><b>Недавние страницы</b><button class="btn secondary" data-nav-act="clear-history">Очистить</button></div>${navHistory.filter(x=>!navQuery||x.title.toLocaleLowerCase('ru').includes(navQuery.toLocaleLowerCase('ru'))).slice(0,20).map(x=>navLink({...x,target:'current'})).join('')||'<p class="sub">История пуста.</p>'}</div>`:''}<div class="section"><b>Быстрые команды</b><div class="actions">${commands.filter(x=>!navQuery||x.join(' ').toLocaleLowerCase('ru').includes(navQuery.toLocaleLowerCase('ru'))).map(([id,label,view])=>`<button class="btn secondary" data-nav-command="${id}" data-view="${view}">${label}</button>`).join('')}</div></div><div class="section"><b>Результаты локального поиска</b><div id="rpn-nav-results"></div></div>`);
    renderNavResults();
  }
  function renderNavResults(){const target=panel.querySelector('#rpn-nav-results');if(!target)return;replaceHtml(target,navResults.length?navResults.map((x,i)=>`<div class="item"><b>${C.esc(x.title)}</b><div class="sub">${C.esc(x.type)}</div><button class="btn secondary" data-nav-result="${i}">Открыть</button></div>`).join(''):`<p class="sub">${navQuery.trim()?(navSearchDone?'Совпадений нет.':'Поиск…'):'Введите запрос для поиска по локальным записям.'}</p>`);}
  function searchNavigation(value){navQuery=String(value).slice(0,200);navResults=[];navSearchDone=false;renderNavigationPanel();clearTimeout(navSearchTimer);const epoch=++navSearchEpoch,profile=activeProfile()?.id;if(!navQuery.trim())return;navSearchTimer=setTimeout(()=>{void navAction('search',{query:navQuery}).then(navError).then(rows=>{if(epoch!==navSearchEpoch||profile!==activeProfile()?.id||!enabled||!settings.navigationEnabled)return;navResults=Array.isArray(rows)?rows:[];navSearchDone=true;renderNavResults();}).catch(e=>{if(epoch===navSearchEpoch)notify(e.message);});},180);}
  function visit(){if(!enabled||!settings.navigationEnabled||!settings.navigationHistory){lastVisit='';return;}const ctx=context(),p=activeProfile();if(!ctx||!p)return;const key=p.id+'|'+ctx.url;if(key===lastVisit)return;lastVisit=key;void navAction('visit',{title:ctx.title}).then(navError).then(rows=>{if(p.id===activeProfile()?.id&&key===lastVisit&&enabled&&settings.navigationEnabled&&settings.navigationHistory){navHistory=rows||[];if(navMode)renderNavigationPanel();}}).catch(()=>{});}
  function showNavigation(){if(!settings.navigationEnabled)return;if(pending&&!confirm('Закрыть незаполненный шаблон?'))return;expanded=true;extraPane="";navMode=true;draw();panel.querySelector('#rpn-nav-search')?.focus();}

  const binderAction=(action,item,extra={})=>api.runtime.sendMessage({type:'MT_BINDER_ACTION',action,id:item.id,profileId:activeProfile()?.id,...extra});
  function used(item){usage[item.id]=Date.now();if(binderFilter==='recent')renderList(panel.querySelector('#rpn-search')?.value||'');void binderAction('use',item).catch(()=>{});}
  const context=()=>globalThis.MTForumContext.read(document);
  const navigation=globalThis.MTForumNavigation.create(document);
  const editors=globalThis.MTForumEditors.create(document,{onChange:()=>{if(expanded) renderEditorPicker();}});
  const findEditor=editors.find;
  const validEditor=node=>Boolean(editors.resolve(node));
  const selectedContent=editors.selected;
  let notificationTimer, retryTimer;
  const root = document.createElement('div');
  root.id = 'rp-nexus-forum-020';
  root.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;color-scheme:light';
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #8faaff;outline-offset:2px}.launcher{width:48px;height:48px;border-radius:15px;background:#273b98;color:white;border:1px solid #8e9deb;font:bold 15px system-ui;box-shadow:0 8px 24px #0005;float:right}.panel{clear:both;display:none;width:min(370px,calc(100vw - 30px));max-height:min(580px,calc(100vh - 96px));overflow:auto;padding:14px;background:#111a2f;color:#f4f7ff;font:13px/1.45 system-ui;border:1px solid #46567b;border-radius:13px;box-shadow:0 10px 34px #0009;margin-bottom:9px}.panel.open{display:block}.bar{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:11px}.name{font-size:16px;font-weight:750}.sub{font-size:11px;color:#adbad7}.field{display:block;width:100%;margin:7px 0;background:#1d2a46;color:#fff;border:1px solid #46567b;padding:9px;border-radius:8px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.btn{background:#334789;color:#fff;border:1px solid #596cac;border-radius:8px;padding:7px 10px}.btn:hover{background:#405cb3}.btn.secondary{background:#26334c}.btn:disabled{opacity:.5;cursor:not-allowed}.item{background:#192743;border:1px solid #34466e;border-radius:9px;padding:10px;margin:8px 0}.item-head{display:flex;justify-content:space-between;gap:10px}.item-title{font-weight:700;overflow-wrap:anywhere}.item-body{white-space:pre-wrap;overflow-wrap:anywhere;color:#c5d0e5;font-size:11px;max-height:62px;overflow:hidden;margin:6px 0}.msg{margin-top:8px;color:#a8e2bf;min-height:16px;font-size:11px}.empty{padding:12px;color:#b0bdd8;border:1px dashed #506180;border-radius:8px}.btn[aria-pressed="true"]{outline:2px solid #8faaff}.section{border-top:1px solid #394968;padding-top:10px;margin-top:11px}`;
  style.textContent += `.nav-link{display:block;color:inherit;text-decoration:none;padding:7px 8px;border:1px solid #526181;border-radius:7px;margin:4px 0;overflow-wrap:anywhere}.nav-link:hover,.nav-link:focus-visible{background:#46567b;color:white}.nav-group{padding-left:12px}summary{cursor:pointer;padding:5px}.panel [hidden]{display:none!important}:host([data-density="compact"]) .item{padding:6px;margin:4px 0}:host([data-density="compact"]) .panel{padding:9px}:host([data-appearance="light"]) .panel{background:#f6f8ff;color:#18223a;border-color:#aab7d2}:host([data-appearance="light"]) .item,:host([data-appearance="light"]) .field{background:#fff;color:#18223a;border-color:#aab7d2}:host([data-appearance="light"]) .sub,:host([data-appearance="light"]) .item-body{color:#495770}@media(prefers-color-scheme:light){:host([data-appearance="system"]) .panel{background:#f6f8ff;color:#18223a}:host([data-appearance="system"]) .item,:host([data-appearance="system"]) .field{background:#fff;color:#18223a}:host([data-appearance="system"]) .sub,:host([data-appearance="system"]) .item-body{color:#495770}}`;
  shadow.append(style);
  style.textContent += `.workspace-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:10px 0;padding:5px;background:#26334c;border-radius:10px}.workspace-tabs .btn{font-size:11px;padding:7px 3px;overflow-wrap:anywhere}.workspace-tabs .btn[aria-pressed=true]{background:#536fce;color:#fff;outline:1px solid #9baeff}.panel{width:min(420px,calc(100vw - 30px));max-height:min(680px,calc(100vh - 96px))}.panel .bar .name{font-size:14px}`;
  const panel = document.createElement('section');
  panel.className = 'panel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'MajesticToolkit Forum Toolkit');
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'launcher'; launcher.textContent = 'MT'; launcher.setAttribute('aria-label', 'Открыть MajesticToolkit Forum Toolkit');
  shadow.append(panel, launcher);
  // Mount only after the background has confirmed permission and settings.
  globalThis.MTForumSession = true;
  const activeProfile = () => state?.profiles?.find(p => p.id === state.activeProfileId);
  function notify(message) {
    const target = panel.querySelector('#rpn-fill-error')||panel.querySelector('.msg');
    if (target) target.textContent = message;
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => { if (target) target.textContent = ''; }, 4500);
  }
  function makeVariables(editor) {
    const ts = new Date();
    const p = activeProfile();
    return { nickname: panel.querySelector('#rpn-nickname')?.value?.trim() ?? '', reason: panel.querySelector('#rpn-reason')?.value?.trim() ?? '',
      server: p?.server ?? '', project: p?.project ?? '', date: ts.toLocaleDateString('ru-RU'),
      time: ts.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      thread: context()?.title ?? '',
      url: location.href, selection: selectedContent(editor) };
  }
  function renderEditorPicker() {
    const select=panel.querySelector('#rpn-editor');if(!select)return;
    const list=editors.candidates(),selected=findEditor();
    if(list.length===editorChoices.length&&list.every((el,i)=>el===editorChoices[i])&&select.options.length===list.length+1){select.value=selected?String(list.indexOf(selected)):'';select.disabled=!list.length||!settings.binderEnabled;return;}
    editorChoices=list;
    const options=[new Option(list.length?'Выберите редактор':'Нет редактора','')];
    list.forEach((el,i)=>{const label=el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.closest('form,.overlay')?.querySelector('h1,h2,h3,.overlay-title')?.textContent?.trim()||'';options.push(new Option(`${el instanceof HTMLTextAreaElement?'BBCode / текст':'Визуальный редактор'} ${i+1}${label?' — '+label.slice(0,70):''}`,String(i)));});
    select.replaceChildren(...options);select.value=selected?String(list.indexOf(selected)):'';
    select.disabled=!list.length||!settings.binderEnabled;
  }
  async function finishTemplate(item,mode,editor,values={}) {
    if(!enabled||!settings.binderEnabled)return false;
    try{
      const text=C.renderTemplate(item,makeVariables(editor),values);
      if(mode==='copy'){
        await navigator.clipboard.writeText(text);notify('Текст скопирован');
      }else{
        if(!editor||!editors.candidates().includes(editor)){notify('Выберите редактор ответа или скопируйте шаблон.');return false;}
        editors.insert(editor,text,item.format,insertionMode);notify(`«${item.label}» вставлен. Отправка только вручную.`);
      }
      used(item);return true;
    }catch(error){notify(error.message||'Не удалось применить шаблон');return false;}
  }
  function closePending(){pending=null;panel.querySelector('#rpn-variable-form')?.replaceChildren();}
  function openVariables(item,mode,editor){
    expanded=true;if(navMode||extraPane||!panel.classList.contains('open')){extraPane="";navMode=false;draw();}
    pending={item,mode,editor,profile:activeProfile()?.id,url:location.href};
    const target=panel.querySelector('#rpn-variable-form');
    const values=makeVariables(editor);
    replaceHtml(target,`<form class="section" id="rpn-fill"><strong>${C.esc(item.label)} — заполнение</strong>${C.fieldsFor(item).map(f=>C.fieldMarkup(f,values[f.key]||f.defaultValue,'field')).join('')}<div class="actions"><button class="btn secondary" type="button" data-act="preview">Предпросмотр</button><button class="btn" type="submit">${mode==='copy'?'Копировать':'Вставить'}</button><button class="btn secondary" type="button" data-act="cancel-fill">Отмена</button></div><p class="sub" role="status" id="rpn-fill-error"></p><div id="rpn-filled-preview" class="item-body" style="max-height:180px"></div></form>`);
    target.querySelector('input,textarea,select')?.focus();
  }
  function fillValues(){const form=panel.querySelector('#rpn-fill');return Object.fromEntries(new FormData(form));}
  async function applyTemplate(item,mode='insert') {
    if(!enabled||!settings.binderEnabled)return false;
    const editor=findEditor();
    if(mode==='insert'&&!editor){notify('Выберите редактор ответа или скопируйте шаблон.');return false;}
    if(C.fieldsFor(item).length){openVariables(item,mode,editor);return 'pending';}
    return finishTemplate(item,mode,editor);
  }
  panel.addEventListener('submit',ev=>{
    if(ev.target.id!=='rpn-fill')return;ev.preventDefault();
    const p=pending;if(!p||p.profile!==activeProfile()?.id||p.url!==location.href){closePending();return;}
    const form=ev.target;if(!form.reportValidity()||p.busy)return;p.busy=true;
    const values=fillValues();
    void finishTemplate(p.item,p.mode,p.editor,values).then(ok=>{p.busy=false;if(ok&&pending===p){closePending();notify(p.mode==='copy'?'Текст скопирован':'Шаблон вставлен. Отправка только вручную.');}});
  });
  function threadPage() { return Boolean(context()?.thread); }
  function nativeActions() {
    return ['close','move'].map(id=>({id,title:id==='close'?'Закрыть / открыть тему':'Переместить тему',node:XF.moderationAction(document,location.href,id)})).filter(x=>x.node);
  }
  function nativeMenu() {
    // XenForo 2.x themes may hide the thread tools behind a textless menu trigger.
    const candidates=[...document.querySelectorAll('.block-outer-opposite [data-xf-click="menu"], .p-title-pageAction [data-xf-click="menu"], .block-outer [data-xf-click="menu"], .js-threadAction [data-xf-click="menu"], button,a')];
    return candidates.find(x=>!x.closest('#rp-nexus-forum-020') && x.getClientRects().length &&
      (x.matches('.block-outer-opposite [data-xf-click="menu"], .p-title-pageAction [data-xf-click="menu"], .block-outer [data-xf-click="menu"], .js-threadAction [data-xf-click="menu"]') ||
       /(?:инструменты\s*темы|управление\s*темой|thread\s*tools|moderation)/i.test(x.textContent.trim())));
  }
  async function openNative(action) {
    if (!threadPage()) { notify('Откройте страницу конкретной темы.'); return; }
    const initialURL=location.href;
    let result = nativeActions().find(x => x.id === action);
    if (!result?.node) {
      const menu = nativeMenu();
      if (menu) {
        menu.click();
        // XenForo overlays can animate and mount their entries asynchronously.
        for(let i=0;i<5&&!result?.node;i++){
          await new Promise(r=>setTimeout(r,120));
          result=nativeActions().find(x=>x.id===action);
        }
      }
    }
    if (!enabled || !threadPage() || location.href!==initialURL) return;
    if (!result?.node) { notify('Действие не доступно в интерфейсе форума или нет прав.'); return; }
    if (!confirm(`Открыть штатное действие форума «${result.title}»? Подтвердите операцию на самом сайте.`)) return;
    result.node.click();
    notify('Открыто штатное действие форума. Завершите его на сайте.');
  }
  function mountNavigation() {
    if(!enabled||!settings.navigationEnabled){navigation.clear();return;}
    const profile=activeProfile();
    navigation.update(context()?.host,XF.selectNavigation(customLinks,profile?.id,context()?.host,'header')); 
  }
  function publicMemberCard() {
    const member=XF.memberProfile(document,location.href);
    if(!member)return '<p class="sub">Откройте публичную страницу пользователя XenForo (/members/…), чтобы увидеть сведения, доступные без дополнительных запросов.</p>';
    return `<div class="item"><strong>${C.esc(member.name)}</strong>${member.subtitle?`<p>${C.esc(member.subtitle)}</p>`:''}<div class="sub">${C.esc(member.site)} · данные открытой страницы</div>${member.stats.map(x=>`<div class="bar"><span>${C.esc(x.label)}</span><strong>${C.esc(x.value)}</strong></div>`).join('')}</div>`;
  }
  function draw() {
    if (!expanded) { closePending();panel.classList.remove('open'); launcher.setAttribute('aria-expanded', 'false'); return; }
    panel.classList.add('open'); launcher.setAttribute('aria-expanded', 'true');
    const profile = activeProfile();
    if(!settings.navigationEnabled){navMode=false;navResults=[];navQuery='';clearTimeout(navSearchTimer);++navSearchEpoch;}
    if(!settings.binderEnabled&&!navMode&&!extraPane)extraPane=settings.navigationEnabled?"":"context";
    if(!settings.binderEnabled&&!extraPane&&settings.navigationEnabled)navMode=true;
    const previous={search:panel.querySelector('#rpn-search')?.value||'',nickname:panel.querySelector('#rpn-nickname')?.value||'',reason:panel.querySelector('#rpn-reason')?.value||''};
    closePending();
    replaceHtml(panel, `<div class="bar"><div><div class="name">MajesticToolkit · Forum Experience</div><div class="sub">${C.esc(profile?.name || 'Без профиля')} · ${C.esc(profile?.server || '')}</div></div><button class="btn secondary" data-act="workspace" title="Управление шаблонами">Настроить ↗</button></div>
      <div class="workspace-tabs" role="group" aria-label="Forum Workspace">${settings.binderEnabled?`<button class="btn secondary" data-nav-act="binder" aria-pressed="${!navMode&&!extraPane}">Биндер</button>`:''}${settings.navigationEnabled?`<button class="btn secondary" data-nav-act="navigation" aria-pressed="${navMode&&!extraPane}">Навигация</button>`:''}<button class="btn secondary" data-nav-act="context" aria-pressed="${extraPane==='context'}">Тема</button><button class="btn secondary" data-nav-act="design" aria-pressed="${extraPane==='design'}">Дизайн</button></div>${forumProfiles.length>1?`<label class="sub" for="rpn-nav-profile">Профиль форума</label><select class="field" id="rpn-nav-profile">${forumProfiles.map(p=>`<option value="${C.esc(p.id)}" ${p.id===profile?.id?'selected':''}>${C.esc(p.name+' · '+p.server)}</option>`).join('')}</select>`:''}
      <div id="rpn-nav-panel" ${navMode&&!extraPane?'':'hidden'}><label class="sub" for="rpn-nav-search">Навигация и быстрый поиск</label><input class="field" id="rpn-nav-search" type="search" maxlength="200" placeholder="Команда, тема, шаблон…" autocomplete="off"><div id="rpn-nav-content"></div></div>
      <div id="rpn-binder-panel" ${navMode||extraPane||!settings.binderEnabled?'hidden':''}><label class="sub" for="rpn-search">Быстрый ответ</label><input class="field" id="rpn-search" type="search" autocomplete="off" placeholder="Поиск по шаблонам"><div class="actions"><button class="btn secondary" data-filter="all">Все</button><button class="btn secondary" data-filter="favorite">Избранное</button><button class="btn secondary" data-filter="recent">Недавние</button><button class="btn secondary" data-act="last">Последний</button></div><label class="sub" for="rpn-category">Папка</label><select class="field" id="rpn-category"><option value="">Все папки</option>${[...new Set(templates.map(t=>t.category).filter(Boolean).flatMap(c=>c.split('/').map((_,i,a)=>a.slice(0,i+1).join('/'))))].sort().map(c=>`<option value="${C.esc(c)}">${C.esc(c)}</option>`).join('')}</select>
      <div class="bar"><input class="field" id="rpn-nickname" placeholder="{{nickname}} (необязательно)" maxlength="200" style="width:50%;margin:3px 0"><input class="field" id="rpn-reason" placeholder="{{reason}}" maxlength="200" style="width:50%;margin:3px 0"></div>
      <div class="bar"><label class="sub" for="rpn-editor">Редактор</label><select class="field" id="rpn-editor" aria-label="Редактор ответа"></select></div><label class="sub" for="rpn-mode">Вставка</label><select class="field" id="rpn-mode"><option value="cursor">В курсор / вместо выделения</option><option value="start">В начало</option><option value="end">В конец</option></select>
      <div id="rpn-variable-form"></div><div id="rpn-template-list"></div>
      </div><div ${navMode||extraPane?'hidden':''} class="section"><div class="bar"><b>Пользовательские ссылки</b><span class="sub">${customLinks.filter(x=>x.profileId==='*'||x.profileId===profile?.id).length}</span></div><div class="actions">${(settings.navigationEnabled?XF.selectNavigation(customLinks,profile?.id,context()?.host,'panel').filter(x=>x.kind!=='bookmark'):[]).slice(0,15).map(x=>`<button class="btn secondary" data-link="${C.esc(x.id)}">${C.esc(x.title)}</button>`).join('')||'<span class="sub">Добавьте ссылки в рабочем пространстве.</span>'}</div></div>
      <div class="section" ${extraPane==='design'?'':'hidden'}><div class="bar"><b>Оформление и чтение</b><button class="btn secondary" data-act="customization">Настроить ↗</button></div><div id="rpn-reading" class="actions"></div></div><div class="section" ${extraPane==='context'?'':'hidden'}><b>${C.esc(context()?.title||'Текущая страница')}</b><p class="sub">${C.esc(context()?.section||context()?.kind||'')}</p><div class="actions">${settings.navigationEnabled?'<button class="btn secondary" data-nav-act="context-bookmark">В закладки</button><button class="btn secondary" data-nav-act="context-copy-url">Копировать ссылку</button>':''}</div></div><div class="section" ${extraPane==='context'?'':'hidden'}><div class="bar"><b>Публичный профиль XenForo</b></div>${publicMemberCard()}${XF.memberProfile(document,location.href)?'<button class="btn secondary" data-act="save-member">Сохранить карточку</button>':''}</div>
      <div class="section" ${extraPane==='context'?'':'hidden'}><div class="bar"><b>Управление темой</b><span class="sub">Только штатные функции форума</span></div><div class="actions"><button class="btn secondary" data-act="close">Закрыть / открыть</button><button class="btn secondary" data-act="move">Переместить</button></div></div>
      <div class="section" ${extraPane==='context'?'':'hidden'}><div class="bar"><b>Жалобы и доказательства</b></div>${currentCase?`<p class="sub">${C.esc(currentCase.title)} · ${C.esc(({new:'Новая','in-progress':'На рассмотрении',waiting:'Ожидание',done:'Завершена'})[currentCase.status]||'')}</p>${currentCase.deadline?`<p class="sub">Срок: ${C.esc(new Date(currentCase.deadline).toLocaleString('ru-RU'))}</p>`:''}`:'<p class="sub">Нет сохранённой жалобы для этой темы.</p>'}<div class="actions"><button class="btn" data-act="track">Отслеживать текущую тему</button><button class="btn secondary" data-act="complaints">Все жалобы ↗</button></div></div><div class="actions"><button class="btn secondary" data-act="workspace">Все шаблоны ↗</button><button class="btn secondary" data-act="hide">Скрыть</button></div><div class="msg" role="status" aria-live="polite"></div>`);
    for(const key of ['search','nickname','reason'])panel.querySelector('#rpn-'+key).value=previous[key];
    panel.querySelector('#rpn-mode').value=insertionMode;panel.querySelector('#rpn-category').value=binderCategory;
    panel.querySelector('#rpn-nav-search').value=navQuery;if(settings.navigationEnabled)renderNavigationPanel();
    renderEditorPicker();renderList(previous.search);customization.renderControls(panel.querySelector('#rpn-reading'));
    if(!settings.binderEnabled){for(const node of panel.querySelectorAll('#rpn-search,#rpn-nickname,#rpn-reason,#rpn-editor,#rpn-mode'))node.disabled=true;}
  }
  function renderList(query) {
    const target = panel.querySelector('#rpn-template-list');
    if (!target) return;
    if(!settings.binderEnabled){target.textContent='Биндер отключён в настройках форума.';return;}
    const p = activeProfile();
    const visible = C.libraryTemplates(templates, p?.id ?? '', query,binderFilter,usage,binderCategory);
    for(const b of panel.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b.dataset.filter===binderFilter));
    replaceHtml(target, visible.length ? visible.slice(0, binderLimit).map(t => `<article class="item"><div class="item-head"><span class="item-title">${C.esc(t.label)}</span><span class="sub">${t.shortcut ? 'Alt+Shift+' + t.shortcut : C.esc(t.category || t.format)}</span></div><div class="item-body">${C.esc(t.text.slice(0, 200))}</div><div class="actions"><button class="btn secondary" data-favorite="${C.esc(t.id)}" aria-pressed="${!!t.favorite}">${t.favorite?'★':'☆'} Избранное</button><button class="btn" data-insert="${C.esc(t.id)}">Вставить</button><button class="btn secondary" data-copy="${C.esc(t.id)}">Копировать</button></div></article>`).join('')+(visible.length>binderLimit?'<button class="btn secondary" data-act="more">Показать ещё</button>':'') : '<div class="empty">Шаблонов нет. Создайте их в разделе «Форум» рабочего пространства.</div>');
  }
  const customization=globalThis.MTForumStyle.create(document,async(action,postId)=>navError(await api.runtime.sendMessage({type:'MT_FORUM_READING',action,postId,profileId:activeProfile()?.id})));
  const lifecycle=globalThis.MTForumLifecycle.create(document,changed=>{
    if(changed){lastScan=0;lastObserved=null;clearTimeout(delayedScan);delayedScan=null;editors.stop();editors.start();if(expanded)draw();}
    if(!root.isConnected)(document.body??document.documentElement).append(root);
    mountNavigation();customization.refresh();if(expanded){renderEditorPicker();customization.renderControls(panel.querySelector('#rpn-reading'));}visit();scheduleScan();
  });
  function deactivate(){
    enabled=false;closePending();clearTimeout(retryTimer);clearTimeout(navSearchTimer);++navSearchEpoch;navResults=[];navHistory=[];lastVisit='';editors.stop();lifecycle.stop();navigation.clear();customization.clear();root.remove();
    document.removeEventListener('keydown',shortcut,true);clearTimeout(delayedScan);delayedScan=null;clearTimeout(notificationTimer);
    expanded=false;panel.classList.remove('open');launcher.setAttribute('aria-expanded','false');
  }
  function activate(){
    if(!enabled){enabled=true;editors.start();lifecycle.start();document.addEventListener('keydown',shortcut,true);}
    if(!root.isConnected)(document.body??document.documentElement).append(root);
    root.style.left=settings.panelPosition==='left'?'18px':'auto';root.style.right=settings.panelPosition==='left'?'auto':'18px';
    root.dataset.appearance=settings.appearance;root.dataset.density=settings.density;launcher.style.float=settings.panelPosition==='left'?'left':'right';
    customization.update(settings.customization,activeProfile()?.id||'');mountNavigation();visit();if(expanded){if(pending&&settings.binderEnabled&&pending.profile===activeProfile()?.id&&pending.url===location.href&&templates.some(t=>t.id===pending.item.id&&t.updatedAt===pending.item.updatedAt)){renderEditorPicker();renderList(panel.querySelector('#rpn-search')?.value||'');}else draw();}if(expanded)customization.renderControls(panel.querySelector('#rpn-reading'));scheduleScan();
  }
  async function readStorage(retry=true) {
    if(suspended)return;clearTimeout(retryTimer);
    const request=++revision;
    try {
      const response = await api.runtime.sendMessage({type:'RP_NEXUS_FORUM_DATA'});
      if(request!==revision||suspended)return;
      if (!response?.ok) throw Error(response?.error || 'Не удалось прочитать шаблоны');
      const payload = response.value;
      const prior=activeProfile()?.id;
      state = payload.profile ? {activeProfileId:payload.profile.id,profiles:[payload.profile]} : null;
      templates = (payload.templates||[]).map(C.cleanTemplate);usage=payload.usage||{};
      currentCase=payload.currentCase||null;customLinks = XF.validateLinks(payload.links||[]);navHistory=payload.navigationHistory||[];forumProfiles=payload.forumProfiles||[];
      settings={enabled:true,binderEnabled:true,navigationEnabled:true,panelPosition:'right',appearance:'dark',density:'comfortable',...payload.settings};
      if(prior!==activeProfile()?.id){extraPane='';navMode=false;navQuery='';navResults=[];++navSearchEpoch;clearTimeout(navSearchTimer);lastVisit='';panel.replaceChildren();insertionMode='cursor';binderCategory='';binderFilter='all';binderLimit=30;closePending();}
      if(payload.allowed===false||!settings.enabled||!payload.profile){deactivate();return;}
      activate();
    } catch (err) {
      if(request!==revision||suspended)return;
      console.warn('MajesticToolkit: binder storage unavailable', err);
      state=null;templates=[];customLinks=[];deactivate();
      // One retry for transient worker startup errors; subsequent retry is on focus/refresh.
      if(retry)retryTimer=setTimeout(()=>void readStorage(false),1000);
    }
  }
  launcher.addEventListener('click', () => { expanded = !expanded; draw(); });
  panel.addEventListener('change',ev=>{if(ev.target.id==='rpn-nav-profile'){const id=ev.target.value;void navAction('switch-profile',{id}).then(navError).then(()=>readStorage()).catch(e=>notify(e.message));return;}if(ev.target.id==='rpn-editor'){const el=editorChoices[Number(ev.target.value)];if(ev.target.value!==''&&el){editors.choose(el);if(pending&&pending.mode==='insert')pending.editor=el;}}if(ev.target.id==='rpn-mode')insertionMode=ev.target.value;if(ev.target.id==='rpn-category'){binderCategory=ev.target.value;binderLimit=30;renderList(panel.querySelector('#rpn-search').value);}});
  panel.addEventListener('input', ev => { if(ev.target.id==='rpn-nav-search'){searchNavigation(ev.target.value);return;} if (ev.target.id === 'rpn-search') {binderLimit=30;renderList(ev.target.value);} });
  panel.addEventListener('click', ev => {
    const a=ev.target.closest('a[data-nav-link]');if(a&&enabled&&settings.navigationEnabled){const item=customLinks.find(x=>x.id===a.dataset.navLink);if(item?.kind==='bookmark')void navAction('opened',{id:item.id}).catch(()=>{});return;}
    const b = ev.target.closest('button'); if (!b || !enabled) return;
    if(b.dataset.navAct||b.dataset.navCommand||b.dataset.navResult!==undefined){
      const act=b.dataset.navAct;if(['binder','context','design'].includes(act)){if(act==='binder'&&!settings.binderEnabled)return;if(pending&&!confirm('Закрыть незаполненный шаблон?'))return;extraPane=act==='binder'?'':act;navMode=false;draw();return;}if(!settings.navigationEnabled)return;
      if(act==='navigation'){showNavigation();return;}
      if(act==='bookmark'||act==='context-bookmark'){void navAction('bookmark',{title:context()?.title}).then(navError).then(async()=>{await readStorage();notify('Страница сохранена в закладках');}).catch(e=>notify(e.message));return;}
      if(act==='copy-url'||act==='context-copy-url'){void navigator.clipboard.writeText(location.href).then(()=>notify('Ссылка скопирована')).catch(e=>notify(e.message));return;}
      if(act==='clear-history'){if(confirm('Очистить историю профиля?'))void navAction('clear-history').then(navError).then(()=>{navHistory=[];renderNavigationPanel();}).catch(e=>notify(e.message));return;}
      if(b.dataset.navCommand){if(b.dataset.navCommand==='binder'&&settings.binderEnabled){extraPane="";navMode=false;draw();return;}void api.runtime.sendMessage({type:'RP_NEXUS_OPEN_WORKSPACE',view:b.dataset.view}).then(navError).catch(e=>notify(e.message));return;}
      const result=navResults[Number(b.dataset.navResult)];if(result){if(result.type==='forum'){const t=templates.find(x=>'forum:'+x.id===result.key);if(t&&settings.binderEnabled){extraPane="";navMode=false;draw();void applyTemplate(t,findEditor()?'insert':'copy');return;}}if(result.url){const a=document.createElement('a');a.href=XF.safeLink(result.url);a.target='_blank';a.rel='noopener noreferrer';a.click();}else void api.runtime.sendMessage({type:'RP_NEXUS_OPEN_WORKSPACE',view:result.view}).then(navError).catch(e=>notify(e.message));}return;
    }
    if (b.dataset.link) { if(!settings.navigationEnabled)return; const link=customLinks.find(x=>x.id===b.dataset.link); if(link){ const a=document.createElement('a');a.href=link.url;a.target=link.target==='current'?'_self':'_blank';a.rel='noopener noreferrer';a.click();}return; }
    if (!settings.binderEnabled && (b.dataset.insert||b.dataset.copy))return;
    if (b.dataset.insert) { const t = templates.find(x => x.id === b.dataset.insert); if (t) void applyTemplate(t); return; }
    if(b.dataset.copy){const t=templates.find(x=>x.id===b.dataset.copy);if(t)void applyTemplate(t,'copy');return;}
    if(!settings.binderEnabled&&(b.dataset.filter||b.dataset.favorite||['last','preview','more'].includes(b.dataset.act)))return;
    if(b.dataset.filter){binderFilter=b.dataset.filter;binderLimit=30;renderList(panel.querySelector('#rpn-search').value);return;}
    if(b.dataset.favorite){const t=templates.find(x=>x.id===b.dataset.favorite);if(t)void binderAction('favorite',t,{favorite:!t.favorite}).then(r=>{if(!r?.ok)throw Error(r?.error||'Не удалось сохранить');if(r.value?.id===t.id){templates=templates.map(x=>x.id===t.id?C.cleanTemplate(r.value):x);renderList(panel.querySelector('#rpn-search').value);}}).catch(e=>notify(e.message));return;}
    if(b.dataset.act==='more'){binderLimit+=30;renderList(panel.querySelector('#rpn-search').value);return;}
    if(b.dataset.act==='last'){const t=C.libraryTemplates(templates,activeProfile()?.id??'','','recent',usage)[0];if(t)void applyTemplate(t);else notify('Нет недавно использованных шаблонов');return;}
    if(b.dataset.act==='cancel-fill'){closePending();return;}
    if(b.dataset.act==='preview'&&pending){try{const text=C.renderTemplate(pending.item,makeVariables(pending.editor),fillValues());const target=panel.querySelector('#rpn-filled-preview');replaceHtml(target,pending.item.format==='bbcode'?C.bbcodeToHtml(text):C.esc(text).replace(/\n/g,'<br>'));}catch(e){notify(e.message);}return;}
    if (b.dataset.act === 'save-member') {
      const card=XF.memberProfile(document,location.href);
      if(!card){notify('Откройте публичную страницу /members/');return;}
      void api.runtime.sendMessage({type:'MAJESTIC_SAVE_PUBLIC_PLAYER',card}).then(result=>notify(result?.ok?'Публичная карточка сохранена в «Серверы и игроки».':(result?.error||'Не удалось сохранить карточку'))).catch(err=>notify(err.message));
      return;
    }
    if(b.dataset.act==='customization'){void api.runtime.sendMessage({type:'RP_NEXUS_OPEN_WORKSPACE',view:'customization'}).then(navError).catch(err=>notify(err.message));return;}
    if (b.dataset.act === 'workspace') { try { api.runtime.sendMessage({ type: 'RP_NEXUS_OPEN_WORKSPACE', view: 'forum' }); } catch { notify('Не удалось открыть настройки'); } return; }
    if (b.dataset.act === 'track') {
      if (!threadPage()) { notify('Для добавления откройте страницу темы форума'); return; }
      void api.runtime.sendMessage({type:'RP_NEXUS_TRACK_CURRENT_THREAD',url:location.href,title:(document.querySelector('h1.p-title-value,h1')?.textContent || document.title).trim().slice(0,240)}).then(response => {
        notify(response?.ok ? 'Жалоба добавлена. Откройте раздел «Жалобы».' : (response?.error || 'Не удалось добавить жалобу'));
        if (response?.ok) {void scanThread();void readStorage();}
      }).catch(err => notify(err.message));
      return;
    }
    if (b.dataset.act === 'complaints') { void api.runtime.sendMessage({type:'RP_NEXUS_OPEN_WORKSPACE',view:'complaints'}); return; }
    if (b.dataset.act === 'hide') { expanded = false; draw(); return; }
    if (['close', 'move'].includes(b.dataset.act)) void openNative(b.dataset.act);
  });
  function shortcut(ev) {
    if(!enabled)return;
    if(settings.navigationEnabled&&ev.altKey&&ev.shiftKey&&!ev.ctrlKey&&!ev.metaKey&&!ev.repeat&&!ev.isComposing&&ev.code==='KeyN'&&!(ev.target instanceof HTMLElement&&(ev.target.isContentEditable||ev.target.matches('input,textarea,select'))&&!validEditor(ev.target))){ev.preventDefault();showNavigation();return;}
    if(!settings.binderEnabled)return;
    if(ev.altKey&&ev.shiftKey&&!ev.ctrlKey&&!ev.metaKey&&!ev.repeat&&!ev.isComposing&&ev.code==='KeyB'&&!(ev.target instanceof HTMLElement&&(ev.target.isContentEditable||ev.target.matches('input,textarea,select'))&&!validEditor(ev.target))){ev.preventDefault();expanded=true;extraPane="";navMode=false;draw();panel.querySelector('#rpn-search')?.focus();return;}
    if (ev.repeat || ev.isComposing || !ev.altKey || !ev.shiftKey || ev.ctrlKey || ev.metaKey || !/^Digit[1-9]$/.test(ev.code)) return;
    // Do not steal shortcuts while the user edits an unrelated form.
    if (ev.target instanceof HTMLElement && (ev.target.isContentEditable||ev.target.matches('input,textarea,select')) && !validEditor(ev.target)) return;
    const slot = Number(ev.code.slice(-1));
    const p = activeProfile();
    const item = C.slotTemplates(templates, p?.id ?? '').get(slot);
    if (!item || !findEditor()) return;
    ev.preventDefault(); ev.stopPropagation();
    void applyTemplate(item);
  }
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'RP_NEXUS_FORUM_PERMISSION_REVOKED') {if(message.hosts?.includes(context()?.host)){++revision;deactivate();state=null;templates=[];customLinks=[];panel.replaceChildren();}return;}
    if (message?.type === 'RP_NEXUS_REFRESH_FORUM_DATA') { void readStorage(); return; }
    if(message?.type==='MT_APPLY_DOCUMENT'){
      try{
        const expected=api.runtime.getURL('ui/');
        if(sender?.id!==api.runtime.id||typeof sender.url!=='string'||!sender.url.startsWith(expected))throw Error('Недоверенный источник документа');
        if(!enabled||message.profileId!==activeProfile()?.id)throw Error('Активный профиль форума изменился');
        if(typeof message.text!=='string'||!message.text.trim()||message.text.length>120000)throw Error('Некорректный текст документа');
        const editor=findEditor();if(!editor||!editors.candidates().includes(editor))throw Error('Выберите редактор ответа на форуме');
        // Document text is intentionally plain; editor engine escapes visual HTML.
        editors.insert(editor,message.text,'plain','cursor');notify('Документ вставлен. Отправка только вручную.');sendResponse({ok:true});
      }catch(err){sendResponse({ok:false,error:err.message});}return;
    }
    if (message?.type !== 'RP_NEXUS_APPLY_TEMPLATE') return;
    if(message.profileId&&message.profileId!==activeProfile()?.id){sendResponse({ok:false,error:'Активный профиль форума изменился'});return;}
    if(!enabled||!settings.binderEnabled){sendResponse({ok:false,error:'Биндер отключён'});return;}
    const p = activeProfile();
    const t = C.selectTemplates(templates, p?.id ?? '').find(item => item.id === message.id);
    if (!t) { sendResponse({ ok: false, error: 'Шаблон не найден' }); return; }
    void applyTemplate(t).then(ok => sendResponse({ ok:Boolean(ok), pending:ok==='pending', error: ok ? undefined : 'Поле ответа не найдено или редактор отклонил вставку' })).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  });
  function findLastPostId() {
    if (!threadPage()) return null;
    let result = null;
    // XenForo exposes stable numeric post IDs. A higher ID is evidence of a new reply.
    const posts = document.querySelectorAll('article.message, .message[data-content], [id^="js-post-"], article[id^="post-"]');
    for (const post of posts) {
      const candidates = [post.id, post.getAttribute('data-content'), post.querySelector('a[href*="/post-"]')?.getAttribute('href')];
      for (const value of candidates) {
        const match = String(value ?? '').match(/(?:^|\/|\b)(?:js-)?post-(\d+)/i);
        if (match) { const n=Number(match[1]); if (Number.isSafeInteger(n)) result=Math.max(n,result ?? 0); }
      }
    }
    return result;
  }
  async function scanThread() {
    if (!enabled || !threadPage()) return false;
    const response = await api.runtime.sendMessage({type:'RP_NEXUS_THREAD_OBSERVED',url:location.href,postId:findLastPostId()});
    return Boolean(response?.ok);
  }
  let lastScan=0,delayedScan=null,lastObserved=null;
  function scheduleScan(){
    if(!enabled||!threadPage()||delayedScan!==null)return;
    const postId=findLastPostId(),key=location.href+'|'+postId;
    if(lastObserved===key&&Date.now()-lastScan<60000)return;
    delayedScan=setTimeout(()=>{delayedScan=null;if(!enabled||!threadPage())return;lastScan=Date.now();lastObserved=location.href+'|'+findLastPostId();void scanThread().catch(()=>{});},Math.max(0,Math.min(60000,60000-(Date.now()-lastScan)))||1200);
  }
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'RP_NEXUS_SCAN_THREAD') return;
    void scanThread().then(ok => sendResponse({ok})).catch(err => sendResponse({ok:false,error:err.message}));
    return true;
  });
  window.addEventListener('focus',()=>{if(!suspended)void readStorage();});
  window.addEventListener('pagehide',()=>{suspended=true;++revision;deactivate();});
  window.addEventListener('pageshow',()=>{if(suspended){suspended=false;void readStorage();}});
  void readStorage();
})();
