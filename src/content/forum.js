const { replaceHtml, htmlFragment } = globalThis.MTSafeDOM;
/* Forum Toolkit v0.2: local binder + editor integration. No automated posting or moderation requests. */
(() => {
  'use strict';
  if (document.getElementById('rp-nexus-forum-020')) return;
  const api = globalThis.browser ?? globalThis.chrome;
  const C = globalThis.RPNForumCore;
  const XF = globalThis.MTXenForo;
  if (!XF?.identify(location.href,document)) return;
  if (!api?.runtime?.id || !C) return;
  const STORAGE = 'rpNexusStateV1';
  let state = null, templates = [], customLinks = [], activeEditor = null, savedRange = null, expanded = false;
  let notificationTimer;
  const root = document.createElement('div');
  root.id = 'rp-nexus-forum-020';
  root.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;color-scheme:light';
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #8faaff;outline-offset:2px}.launcher{width:48px;height:48px;border-radius:15px;background:#273b98;color:white;border:1px solid #8e9deb;font:bold 15px system-ui;box-shadow:0 8px 24px #0005;float:right}.panel{clear:both;display:none;width:min(370px,calc(100vw - 30px));max-height:min(580px,calc(100vh - 96px));overflow:auto;padding:14px;background:#111a2f;color:#f4f7ff;font:13px/1.45 system-ui;border:1px solid #46567b;border-radius:13px;box-shadow:0 10px 34px #0009;margin-bottom:9px}.panel.open{display:block}.bar{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:11px}.name{font-size:16px;font-weight:750}.sub{font-size:11px;color:#adbad7}.field{display:block;width:100%;margin:7px 0;background:#1d2a46;color:#fff;border:1px solid #46567b;padding:9px;border-radius:8px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.btn{background:#334789;color:#fff;border:1px solid #596cac;border-radius:8px;padding:7px 10px}.btn:hover{background:#405cb3}.btn.secondary{background:#26334c}.btn:disabled{opacity:.5;cursor:not-allowed}.item{background:#192743;border:1px solid #34466e;border-radius:9px;padding:10px;margin:8px 0}.item-head{display:flex;justify-content:space-between;gap:10px}.item-title{font-weight:700;overflow-wrap:anywhere}.item-body{white-space:pre-wrap;overflow-wrap:anywhere;color:#c5d0e5;font-size:11px;max-height:62px;overflow:hidden;margin:6px 0}.msg{margin-top:8px;color:#a8e2bf;min-height:16px;font-size:11px}.empty{padding:12px;color:#b0bdd8;border:1px dashed #506180;border-radius:8px}.section{border-top:1px solid #394968;padding-top:10px;margin-top:11px}`;
  shadow.append(style);
  const panel = document.createElement('section');
  panel.className = 'panel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'MajesticToolkit Forum Toolkit');
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'launcher'; launcher.textContent = 'MT'; launcher.setAttribute('aria-label', 'Открыть MajesticToolkit Forum Toolkit');
  shadow.append(panel, launcher);
  (document.body ?? document.documentElement).append(root);
  const activeProfile = () => state?.profiles?.find(p => p.id === state.activeProfileId);
  function notify(message) {
    const target = panel.querySelector('.msg');
    if (target) target.textContent = message;
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => { if (target) target.textContent = ''; }, 4500);
  }
  function validEditor(el) {
    if (!(el instanceof HTMLElement) || el.closest('#rp-nexus-forum-020')) return false;
    if (el.matches('textarea:not([disabled]):not([readonly])')) return true;
    return Boolean(el.isContentEditable && (el.getAttribute('contenteditable') !== 'false'));
  }
  function findEditor() {
    if (validEditor(activeEditor) && activeEditor.isConnected && activeEditor.getClientRects().length) return activeEditor;
    const selectors = [
      '.fr-element[contenteditable="true"]', '.js-editor[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]', '.message-editor [contenteditable="true"]',
      'form textarea[name="message"]', 'textarea[name="message"]', '.js-quickReply textarea',
      '.fr-box .fr-element[contenteditable]', '[data-xf-init~="editor"] .fr-element',
      '[data-xf-init="editor"] textarea', 'textarea[placeholder*="сообщен"]'
    ];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      for (const node of nodes) if (validEditor(node) && node.getClientRects().length) return node;
    }
    return null;
  }
  document.addEventListener('focusin', ev => {
    const target = ev.target;
    if (validEditor(target)) { activeEditor = target; if (!target.isContentEditable) savedRange = null; }
  }, true);
  document.addEventListener('selectionchange', () => {
    const selection = document.getSelection();
    if (selection?.rangeCount && activeEditor?.isContentEditable && activeEditor.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
  });
  function selectedContent(editor) {
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) return editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) return savedRange.toString();
    return document.getSelection()?.toString() ?? '';
  }
  function makeVariables(editor) {
    const ts = new Date();
    const p = activeProfile();
    return { nickname: panel.querySelector('#rpn-nickname')?.value?.trim() ?? '', reason: panel.querySelector('#rpn-reason')?.value?.trim() ?? '',
      server: p?.server ?? '', project: p?.project ?? '', date: ts.toLocaleDateString('ru-RU'),
      time: ts.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      thread: (document.querySelector('h1.p-title-value,h1')?.textContent ?? document.title).trim().slice(0, 250),
      url: location.href, selection: selectedContent(editor) };
  }
  function insertInInput(el, text) {
    const before = el.value;
    const start = el.selectionStart ?? before.length, end = el.selectionEnd ?? start;
    const after = before.slice(0, start) + text + before.slice(end);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, after); else el.value = after;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.setSelectionRange(start + text.length, start + text.length);
  }
  function insertInRich(el, text, format) {
    el.focus();
    const sel = document.getSelection();
    if (savedRange && el.contains(savedRange.commonAncestorContainer)) {
      sel.removeAllRanges(); sel.addRange(savedRange);
    }
    const richHtml = format === 'bbcode' ? C.bbcodeToHtml(text) : C.esc(text).replace(/\r?\n/g, '<br>');
    // XenForo's Froala editor listens to editing events; execCommand preserves its undo stack.
    let handled = false;
    try { handled = document.execCommand('insertHTML', false, richHtml); } catch { /* modern fallback below */ }
    if (!handled) {
      let range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      if (!range || !el.contains(range.commonAncestorContainer)) {
        range=document.createRange();range.selectNodeContents(el);range.collapse(false);
        if(sel){sel.removeAllRanges();sel.addRange(range);}
      }
      range.deleteContents();
      const fragment = htmlFragment(richHtml);
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) { range.setStartAfter(last); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
    }
    if (sel?.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
  }
  async function applyTemplate(item) {
    const editor = findEditor();
    if (!editor) { notify('Поле ответа не найдено: откройте редактор сообщения.'); return false; }
    const text = C.interpolate(item.text, makeVariables(editor));
    try {
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) insertInInput(editor, text);
      else insertInRich(editor, text, item.format);
      notify(`«${item.label}» вставлен. Отправка только вручную.`);
      return true;
    } catch (error) { console.error('MajesticToolkit: editor insert', error); notify('Редактор не принял текст. Откройте режим BBCode или используйте копирование.'); return false; }
  }
  function threadPage() { return /\/threads\//i.test(location.pathname); }
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
    if (!result?.node) { notify('Действие не доступно в интерфейсе форума или нет прав.'); return; }
    if (!confirm(`Открыть штатное действие форума «${result.title}»? Подтвердите операцию на самом сайте.`)) return;
    result.node.click();
    notify('Открыто штатное действие форума. Завершите его на сайте.');
  }
  // Insert user-owned links only into the current forum's visible XenForo navigation.
  let navSignature='';
  function mountNavigation() {
    const profile=activeProfile();
    const wanted=customLinks.filter(x=>x.profileId==='*'||x.profileId===profile?.id).slice(0,30);
    const host=XF.identify(location.href,document)?.host;
    const selectors=[...(XF.FORUMS[host]?.nav||[]),'.offCanvasMenu-list'];
    const containers=[...new Set(selectors.map(selector=>document.querySelector(selector)).filter(Boolean))];
    const signature=JSON.stringify(wanted.map(x=>[x.id,x.title,x.url]));
    if(navSignature===signature && containers.every(container=>container.querySelector('[data-mt-xf-nav]') || !wanted.length))return;
    for(const container of containers){
      container.querySelectorAll('[data-mt-xf-nav]').forEach(node=>node.remove());
      for(const link of wanted){
        const el=document.createElement(container.matches('.offCanvasMenu-list')?'div':'li');
        el.setAttribute('data-mt-xf-nav',link.id);
        el.className=container.matches('.offCanvasMenu-list')?'offCanvasMenu-linkHolder':'p-navEl';
        const a=document.createElement('a');a.className=container.matches('.offCanvasMenu-list')?'offCanvasMenu-link':'p-navEl-link';
        a.textContent=link.title;a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';
        a.title='Пользовательская ссылка MajesticToolkit';el.append(a);container.append(el);
      }
    }
    navSignature=signature;
  }
  function publicMemberCard() {
    const member=XF.memberProfile(document,location.href);
    if(!member)return '<p class="sub">Откройте публичную страницу пользователя XenForo (/members/…), чтобы увидеть сведения, доступные без дополнительных запросов.</p>';
    return `<div class="item"><strong>${C.esc(member.name)}</strong>${member.subtitle?`<p>${C.esc(member.subtitle)}</p>`:''}<div class="sub">${C.esc(member.site)} · данные открытой страницы</div>${member.stats.map(x=>`<div class="bar"><span>${C.esc(x.label)}</span><strong>${C.esc(x.value)}</strong></div>`).join('')}</div>`;
  }
  let navTimer;
  const navigationObserver=new MutationObserver(()=>{
    clearTimeout(navTimer);navTimer=setTimeout(mountNavigation,180);
  });
  navigationObserver.observe(document.querySelector('.p-header,.p-nav')||document.body,{subtree:true,childList:true});
  window.addEventListener('pagehide',()=>{navigationObserver.disconnect();clearTimeout(navTimer);},{once:true});
  function draw() {
    if (!expanded) { panel.classList.remove('open'); launcher.setAttribute('aria-expanded', 'false'); return; }
    panel.classList.add('open'); launcher.setAttribute('aria-expanded', 'true');
    const profile = activeProfile();
    const visible = C.selectTemplates(templates, profile?.id ?? '', '');
    replaceHtml(panel, `<div class="bar"><div><div class="name">MajesticToolkit · Forum</div><div class="sub">${C.esc(profile?.name || 'Без профиля')} · ${C.esc(profile?.server || '')}</div></div><button class="btn secondary" data-act="workspace" title="Управление шаблонами">Настроить ↗</button></div>
      <label class="sub" for="rpn-search">Быстрый ответ</label><input class="field" id="rpn-search" type="search" autocomplete="off" placeholder="Поиск по шаблонам">
      <div class="bar"><input class="field" id="rpn-nickname" placeholder="{{nickname}} (необязательно)" maxlength="200" style="width:50%;margin:3px 0"><input class="field" id="rpn-reason" placeholder="{{reason}}" maxlength="200" style="width:50%;margin:3px 0"></div>
      <div id="rpn-template-list"></div>
      <div class="section"><div class="bar"><b>Пользовательские ссылки</b><span class="sub">${customLinks.filter(x=>x.profileId==='*'||x.profileId===profile?.id).length}</span></div><div class="actions">${customLinks.filter(x=>x.profileId==='*'||x.profileId===profile?.id).slice(0,15).map(x=>`<button class="btn secondary" data-link="${C.esc(x.id)}">${C.esc(x.title)}</button>`).join('')||'<span class="sub">Добавьте ссылки в рабочем пространстве.</span>'}</div></div>
      <div class="section"><div class="bar"><b>Публичный профиль XenForo</b></div>${publicMemberCard()}${XF.memberProfile(document,location.href)?'<button class="btn secondary" data-act="save-member">Сохранить карточку</button>':''}</div>
      <div class="section"><div class="bar"><b>Управление темой</b><span class="sub">Только штатные функции форума</span></div><div class="actions"><button class="btn secondary" data-act="close">Закрыть / открыть</button><button class="btn secondary" data-act="move">Переместить</button></div></div>
      <div class="section"><div class="bar"><b>Жалобы и доказательства</b></div><div class="actions"><button class="btn" data-act="track">Отслеживать текущую тему</button><button class="btn secondary" data-act="complaints">Все жалобы ↗</button></div></div><div class="actions"><button class="btn secondary" data-act="workspace">Все шаблоны ↗</button><button class="btn secondary" data-act="hide">Скрыть</button></div><div class="msg" role="status" aria-live="polite"></div>`);
    renderList('');
  }
  function renderList(query) {
    const target = panel.querySelector('#rpn-template-list');
    if (!target) return;
    const p = activeProfile();
    const visible = C.selectTemplates(templates, p?.id ?? '', query);
    replaceHtml(target, visible.length ? visible.slice(0, 75).map(t => `<article class="item"><div class="item-head"><span class="item-title">${C.esc(t.label)}</span><span class="sub">${t.shortcut ? 'Alt+Shift+' + t.shortcut : C.esc(t.category || t.format)}</span></div><div class="item-body">${C.esc(t.text.slice(0, 200))}</div><div class="actions"><button class="btn" data-insert="${C.esc(t.id)}">Вставить</button><button class="btn secondary" data-copy="${C.esc(t.id)}">Копировать</button></div></article>`).join('') : '<div class="empty">Шаблонов нет. Создайте их в разделе «Форум» рабочего пространства.</div>');
  }
  async function readStorage() {
    try {
      const response = await api.runtime.sendMessage({type:'RP_NEXUS_FORUM_DATA'});
      if (!response?.ok) throw Error(response?.error || 'Не удалось прочитать шаблоны');
      const payload = response.value;
      state = payload.profile ? {activeProfileId:payload.profile.id,profiles:[payload.profile]} : null;
      templates = payload.templates.map(C.cleanTemplate);
      customLinks = XF.validateLinks(payload.links||[]);
      navSignature='';mountNavigation();
      if (expanded) draw();
    } catch (err) {
      console.warn('MajesticToolkit: binder storage unavailable', err);
      state=null;templates=[];customLinks=[];navSignature='';mountNavigation();
      if(expanded)draw();
      notify('Нет связи с фоновым процессом MajesticToolkit. Проверьте расширение и обновите вкладку.');
    }
  }
  launcher.addEventListener('click', () => { expanded = !expanded; draw(); });
  panel.addEventListener('input', ev => { if (ev.target.id === 'rpn-search') renderList(ev.target.value); });
  panel.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.link) { const link=customLinks.find(x=>x.id===b.dataset.link); if(link){ const a=document.createElement('a');a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';a.click();}return; }
    if (b.dataset.insert) { const t = templates.find(x => x.id === b.dataset.insert); if (t) void applyTemplate(t); return; }
    if (b.dataset.copy) { const t = templates.find(x => x.id === b.dataset.copy); if (!t) return;
      const body = C.interpolate(t.text, makeVariables(findEditor() ?? document.body));
      void navigator.clipboard.writeText(body).then(() => notify('Текст скопирован')).catch(() => notify('Копирование запрещено браузером')); return;
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
  document.addEventListener('keydown', ev => {
    if (ev.repeat || ev.isComposing || !ev.altKey || !ev.shiftKey || ev.ctrlKey || ev.metaKey || !/^Digit[1-9]$/.test(ev.code)) return;
    // Do not steal shortcuts while the user edits an unrelated form.
    if (ev.target instanceof HTMLElement && (ev.target.isContentEditable||ev.target.matches('input,textarea,select')) && !validEditor(ev.target)) return;
    const slot = Number(ev.code.slice(-1));
    const p = activeProfile();
    const item = C.slotTemplates(templates, p?.id ?? '').get(slot);
    if (!item || !findEditor()) return;
    ev.preventDefault(); ev.stopPropagation();
    void applyTemplate(item);
  }, true);
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'RP_NEXUS_REFRESH_FORUM_DATA') { void readStorage(); return; }
    if (message?.type !== 'RP_NEXUS_APPLY_TEMPLATE') return;
    const p = activeProfile();
    const t = C.selectTemplates(templates, p?.id ?? '').find(item => item.id === message.id);
    if (!t) { sendResponse({ ok: false, error: 'Шаблон не найден' }); return; }
    void applyTemplate(t).then(ok => sendResponse({ ok, error: ok ? undefined : 'Поле ответа не найдено или редактор отклонил вставку' })).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some(k => k === STORAGE || k.startsWith(C.KEY_PREFIX))) void readStorage();
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
    if (!threadPage()) return false;
    const response = await api.runtime.sendMessage({type:'RP_NEXUS_THREAD_OBSERVED',url:location.href,postId:findLastPostId()});
    return Boolean(response?.ok);
  }
  let lastScan = 0, delayedScan;
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'RP_NEXUS_SCAN_THREAD') return;
    void scanThread().then(ok => sendResponse({ok})).catch(err => sendResponse({ok:false,error:err.message}));
    return true;
  });
  if (threadPage()) {
    delayedScan = setTimeout(() => {lastScan=Date.now(); void scanThread().catch(()=>{});}, 1200);
    const observer = new MutationObserver(() => {
      if (Date.now()-lastScan < 60_000) return;
      lastScan=Date.now(); clearTimeout(delayedScan);
      delayedScan=setTimeout(()=>void scanThread().catch(()=>{}),1500);
    });
    observer.observe(document.querySelector('main') || document.body, {subtree:true,childList:true});
    window.addEventListener('pagehide',()=>{ observer.disconnect();clearTimeout(delayedScan); },{once:true});
  }
  void readStorage();
})();
