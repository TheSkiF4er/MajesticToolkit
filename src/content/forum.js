/* Forum Core 1.5.6: local binder + editor integration. No automated posting or moderation requests. */
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
  let insertionMode='cursor', editorChoices=[];
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
  style.textContent = `:host{all:initial}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #8faaff;outline-offset:2px}.launcher{width:48px;height:48px;border-radius:15px;background:#273b98;color:white;border:1px solid #8e9deb;font:bold 15px system-ui;box-shadow:0 8px 24px #0005;float:right}.panel{clear:both;display:none;width:min(370px,calc(100vw - 30px));max-height:min(580px,calc(100vh - 96px));overflow:auto;padding:14px;background:#111a2f;color:#f4f7ff;font:13px/1.45 system-ui;border:1px solid #46567b;border-radius:13px;box-shadow:0 10px 34px #0009;margin-bottom:9px}.panel.open{display:block}.bar{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:11px}.name{font-size:16px;font-weight:750}.sub{font-size:11px;color:#adbad7}.field{display:block;width:100%;margin:7px 0;background:#1d2a46;color:#fff;border:1px solid #46567b;padding:9px;border-radius:8px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.btn{background:#334789;color:#fff;border:1px solid #596cac;border-radius:8px;padding:7px 10px}.btn:hover{background:#405cb3}.btn.secondary{background:#26334c}.btn:disabled{opacity:.5;cursor:not-allowed}.item{background:#192743;border:1px solid #34466e;border-radius:9px;padding:10px;margin:8px 0}.item-head{display:flex;justify-content:space-between;gap:10px}.item-title{font-weight:700;overflow-wrap:anywhere}.item-body{white-space:pre-wrap;overflow-wrap:anywhere;color:#c5d0e5;font-size:11px;max-height:62px;overflow:hidden;margin:6px 0}.msg{margin-top:8px;color:#a8e2bf;min-height:16px;font-size:11px}.empty{padding:12px;color:#b0bdd8;border:1px dashed #506180;border-radius:8px}.section{border-top:1px solid #394968;padding-top:10px;margin-top:11px}`;
  style.textContent += `:host([data-density="compact"]) .item{padding:6px;margin:4px 0}:host([data-density="compact"]) .panel{padding:9px}:host([data-appearance="light"]) .panel{background:#f6f8ff;color:#18223a;border-color:#aab7d2}:host([data-appearance="light"]) .item,:host([data-appearance="light"]) .field{background:#fff;color:#18223a;border-color:#aab7d2}:host([data-appearance="light"]) .sub,:host([data-appearance="light"]) .item-body{color:#495770}@media(prefers-color-scheme:light){:host([data-appearance="system"]) .panel{background:#f6f8ff;color:#18223a}:host([data-appearance="system"]) .item,:host([data-appearance="system"]) .field{background:#fff;color:#18223a}:host([data-appearance="system"]) .sub,:host([data-appearance="system"]) .item-body{color:#495770}}`;
  shadow.append(style);
  const panel = document.createElement('section');
  panel.className = 'panel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'MajesticToolkit Forum Toolkit');
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'launcher'; launcher.textContent = 'MT'; launcher.setAttribute('aria-label', 'Открыть MajesticToolkit Forum Toolkit');
  shadow.append(panel, launcher);
  // Mount only after the background has confirmed permission and settings.
  globalThis.MTForumSession = true;
  const activeProfile = () => state?.profiles?.find(p => p.id === state.activeProfileId);
  function notify(message) {
    const target = panel.querySelector('.msg');
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
  async function applyTemplate(item) {
    if(!enabled||!settings.binderEnabled)return false;
    const editor = findEditor();
    const text = C.interpolate(item.text, makeVariables(editor));
    if (!editor) { notify('Выберите редактор ответа или скопируйте шаблон.'); return false; }
    try {
      editors.insert(editor,text,item.format,insertionMode);
      notify(`«${item.label}» вставлен. Отправка только вручную.`);
      return true;
    } catch (error) { console.error('MajesticToolkit: editor insert', error); notify('Редактор не принял текст. Используйте копирование.'); return false; }
  }
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
    navigation.update(context()?.host,customLinks.filter(x=>x.profileId==='*'||x.profileId===profile?.id).slice(0,30));
  }
  function publicMemberCard() {
    const member=XF.memberProfile(document,location.href);
    if(!member)return '<p class="sub">Откройте публичную страницу пользователя XenForo (/members/…), чтобы увидеть сведения, доступные без дополнительных запросов.</p>';
    return `<div class="item"><strong>${C.esc(member.name)}</strong>${member.subtitle?`<p>${C.esc(member.subtitle)}</p>`:''}<div class="sub">${C.esc(member.site)} · данные открытой страницы</div>${member.stats.map(x=>`<div class="bar"><span>${C.esc(x.label)}</span><strong>${C.esc(x.value)}</strong></div>`).join('')}</div>`;
  }
  function draw() {
    if (!expanded) { panel.classList.remove('open'); launcher.setAttribute('aria-expanded', 'false'); return; }
    panel.classList.add('open'); launcher.setAttribute('aria-expanded', 'true');
    const profile = activeProfile();
    const previous={search:panel.querySelector('#rpn-search')?.value||'',nickname:panel.querySelector('#rpn-nickname')?.value||'',reason:panel.querySelector('#rpn-reason')?.value||''};
    replaceHtml(panel, `<div class="bar"><div><div class="name">MajesticToolkit · Forum</div><div class="sub">${C.esc(profile?.name || 'Без профиля')} · ${C.esc(profile?.server || '')}</div></div><button class="btn secondary" data-act="workspace" title="Управление шаблонами">Настроить ↗</button></div>
      <label class="sub" for="rpn-search">Быстрый ответ</label><input class="field" id="rpn-search" type="search" autocomplete="off" placeholder="Поиск по шаблонам">
      <div class="bar"><input class="field" id="rpn-nickname" placeholder="{{nickname}} (необязательно)" maxlength="200" style="width:50%;margin:3px 0"><input class="field" id="rpn-reason" placeholder="{{reason}}" maxlength="200" style="width:50%;margin:3px 0"></div>
      <div class="bar"><label class="sub" for="rpn-editor">Редактор</label><select class="field" id="rpn-editor" aria-label="Редактор ответа"></select></div><label class="sub" for="rpn-mode">Вставка</label><select class="field" id="rpn-mode"><option value="cursor">В курсор / вместо выделения</option><option value="start">В начало</option><option value="end">В конец</option></select>
      <div id="rpn-template-list"></div>
      <div class="section"><div class="bar"><b>Пользовательские ссылки</b><span class="sub">${customLinks.filter(x=>x.profileId==='*'||x.profileId===profile?.id).length}</span></div><div class="actions">${customLinks.filter(x=>x.profileId==='*'||x.profileId===profile?.id).slice(0,15).map(x=>`<button class="btn secondary" data-link="${C.esc(x.id)}">${C.esc(x.title)}</button>`).join('')||'<span class="sub">Добавьте ссылки в рабочем пространстве.</span>'}</div></div>
      <div class="section"><div class="bar"><b>Публичный профиль XenForo</b></div>${publicMemberCard()}${XF.memberProfile(document,location.href)?'<button class="btn secondary" data-act="save-member">Сохранить карточку</button>':''}</div>
      <div class="section"><div class="bar"><b>Управление темой</b><span class="sub">Только штатные функции форума</span></div><div class="actions"><button class="btn secondary" data-act="close">Закрыть / открыть</button><button class="btn secondary" data-act="move">Переместить</button></div></div>
      <div class="section"><div class="bar"><b>Жалобы и доказательства</b></div><div class="actions"><button class="btn" data-act="track">Отслеживать текущую тему</button><button class="btn secondary" data-act="complaints">Все жалобы ↗</button></div></div><div class="actions"><button class="btn secondary" data-act="workspace">Все шаблоны ↗</button><button class="btn secondary" data-act="hide">Скрыть</button></div><div class="msg" role="status" aria-live="polite"></div>`);
    for(const key of ['search','nickname','reason'])panel.querySelector('#rpn-'+key).value=previous[key];
    panel.querySelector('#rpn-mode').value=insertionMode;
    renderEditorPicker();renderList(previous.search);
    if(!settings.binderEnabled){for(const node of panel.querySelectorAll('#rpn-search,#rpn-nickname,#rpn-reason,#rpn-editor,#rpn-mode'))node.disabled=true;}
  }
  function renderList(query) {
    const target = panel.querySelector('#rpn-template-list');
    if (!target) return;
    if(!settings.binderEnabled){target.textContent='Биндер отключён в настройках форума.';return;}
    const p = activeProfile();
    const visible = C.selectTemplates(templates, p?.id ?? '', query);
    replaceHtml(target, visible.length ? visible.slice(0, 75).map(t => `<article class="item"><div class="item-head"><span class="item-title">${C.esc(t.label)}</span><span class="sub">${t.shortcut ? 'Alt+Shift+' + t.shortcut : C.esc(t.category || t.format)}</span></div><div class="item-body">${C.esc(t.text.slice(0, 200))}</div><div class="actions"><button class="btn" data-insert="${C.esc(t.id)}">Вставить</button><button class="btn secondary" data-copy="${C.esc(t.id)}">Копировать</button></div></article>`).join('') : '<div class="empty">Шаблонов нет. Создайте их в разделе «Форум» рабочего пространства.</div>');
  }
  const lifecycle=globalThis.MTForumLifecycle.create(document,changed=>{
    if(changed){lastScan=0;lastObserved=null;clearTimeout(delayedScan);delayedScan=null;editors.stop();editors.start();if(expanded)draw();}
    if(!root.isConnected)(document.body??document.documentElement).append(root);
    mountNavigation();if(expanded)renderEditorPicker();scheduleScan();
  });
  function deactivate(){
    enabled=false;clearTimeout(retryTimer);editors.stop();lifecycle.stop();navigation.clear();root.remove();
    document.removeEventListener('keydown',shortcut,true);clearTimeout(delayedScan);delayedScan=null;clearTimeout(notificationTimer);
    expanded=false;panel.classList.remove('open');launcher.setAttribute('aria-expanded','false');
  }
  function activate(){
    if(!enabled){enabled=true;editors.start();lifecycle.start();document.addEventListener('keydown',shortcut,true);}
    if(!root.isConnected)(document.body??document.documentElement).append(root);
    root.style.left=settings.panelPosition==='left'?'18px':'auto';root.style.right=settings.panelPosition==='left'?'auto':'18px';
    root.dataset.appearance=settings.appearance;root.dataset.density=settings.density;launcher.style.float=settings.panelPosition==='left'?'left':'right';
    mountNavigation();if(expanded)draw();scheduleScan();
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
      templates = (payload.templates||[]).map(C.cleanTemplate);
      customLinks = XF.validateLinks(payload.links||[]);
      settings={enabled:true,binderEnabled:true,navigationEnabled:true,panelPosition:'right',appearance:'dark',density:'comfortable',...payload.settings};
      if(prior!==activeProfile()?.id){panel.replaceChildren();insertionMode='cursor';}
      if(payload.allowed===false||!settings.enabled){deactivate();return;}
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
  panel.addEventListener('change',ev=>{if(ev.target.id==='rpn-editor'){const el=editorChoices[Number(ev.target.value)];if(ev.target.value!==''&&el)editors.choose(el);}if(ev.target.id==='rpn-mode')insertionMode=ev.target.value;});
  panel.addEventListener('input', ev => { if (ev.target.id === 'rpn-search') renderList(ev.target.value); });
  panel.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b || !enabled) return;
    if (b.dataset.link) { const link=customLinks.find(x=>x.id===b.dataset.link); if(link){ const a=document.createElement('a');a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';a.click();}return; }
    if (!settings.binderEnabled && (b.dataset.insert||b.dataset.copy))return;
    if (b.dataset.insert) { const t = templates.find(x => x.id === b.dataset.insert); if (t) void applyTemplate(t); return; }
    if (b.dataset.copy) { const t = templates.find(x => x.id === b.dataset.copy); if (!t) return;
      const body = C.interpolate(t.text, makeVariables(findEditor() ?? document.body));
      void (navigator.clipboard?.writeText(body)??Promise.reject(Error('Clipboard unavailable'))).then(() => notify('Текст скопирован')).catch(() => notify('Копирование запрещено браузером')); return;
    }
    if (b.dataset.act === 'save-member') {
      const card=XF.memberProfile(document,location.href);
      if(!card){notify('Откройте публичную страницу /members/');return;}
      void api.runtime.sendMessage({type:'MAJESTIC_SAVE_PUBLIC_PLAYER',card}).then(result=>notify(result?.ok?'Публичная карточка сохранена в «Серверы и игроки».':(result?.error||'Не удалось сохранить карточку'))).catch(err=>notify(err.message));
      return;
    }
    if (b.dataset.act === 'workspace') { try { api.runtime.sendMessage({ type: 'RP_NEXUS_OPEN_WORKSPACE', view: 'forum' }); } catch { notify('Не удалось открыть настройки'); } return; }
    if (b.dataset.act === 'track') {
      if (!threadPage()) { notify('Для добавления откройте страницу темы форума'); return; }
      void api.runtime.sendMessage({type:'RP_NEXUS_TRACK_CURRENT_THREAD',url:location.href,title:(document.querySelector('h1.p-title-value,h1')?.textContent || document.title).trim().slice(0,240)}).then(response => {
        notify(response?.ok ? 'Жалоба добавлена. Откройте раздел «Жалобы».' : (response?.error || 'Не удалось добавить жалобу'));
        if (response?.ok) void scanThread();
      }).catch(err => notify(err.message));
      return;
    }
    if (b.dataset.act === 'complaints') { void api.runtime.sendMessage({type:'RP_NEXUS_OPEN_WORKSPACE',view:'complaints'}); return; }
    if (b.dataset.act === 'hide') { expanded = false; draw(); return; }
    if (['close', 'move'].includes(b.dataset.act)) void openNative(b.dataset.act);
  });
  function shortcut(ev) {
    if(!enabled||!settings.binderEnabled)return;
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
    if (message?.type !== 'RP_NEXUS_APPLY_TEMPLATE') return;
    if(message.profileId&&message.profileId!==activeProfile()?.id){sendResponse({ok:false,error:'Активный профиль форума изменился'});return;}
    if(!enabled||!settings.binderEnabled){sendResponse({ok:false,error:'Биндер отключён'});return;}
    const p = activeProfile();
    const t = C.selectTemplates(templates, p?.id ?? '').find(item => item.id === message.id);
    if (!t) { sendResponse({ ok: false, error: 'Шаблон не найден' }); return; }
    void applyTemplate(t).then(ok => sendResponse({ ok, error: ok ? undefined : 'Поле ответа не найдено или редактор отклонил вставку' })).catch(err => sendResponse({ ok: false, error: err.message }));
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
