/* Forum Toolkit v0.2: local binder + editor integration. No automated posting or moderation requests. */
(() => {
  'use strict';
  if (document.getElementById('rp-nexus-forum-020')) return;
  const api = globalThis.browser ?? globalThis.chrome;
  const C = globalThis.RPNForumCore;
  if (!api?.runtime?.id || !C) return;
  const STORAGE = 'rpNexusStateV1';
  let state = null, templates = [], activeEditor = null, savedRange = null, expanded = false;
  let notificationTimer;
  const root = document.createElement('div');
  root.id = 'rp-nexus-forum-020';
  root.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;color-scheme:light';
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #8faaff;outline-offset:2px}.launcher{width:48px;height:48px;border-radius:15px;background:#273b98;color:white;border:1px solid #8e9deb;font:bold 15px system-ui;box-shadow:0 8px 24px #0005;float:right}.panel{clear:both;display:none;width:min(370px,calc(100vw - 30px));max-height:min(580px,calc(100vh - 96px));overflow:auto;padding:14px;background:#111a2f;color:#f4f7ff;font:13px/1.45 system-ui;border:1px solid #46567b;border-radius:13px;box-shadow:0 10px 34px #0009;margin-bottom:9px}.panel.open{display:block}.bar{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:11px}.name{font-size:16px;font-weight:750}.sub{font-size:11px;color:#adbad7}.field{display:block;width:100%;margin:7px 0;background:#1d2a46;color:#fff;border:1px solid #46567b;padding:9px;border-radius:8px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.btn{background:#334789;color:#fff;border:1px solid #596cac;border-radius:8px;padding:7px 10px}.btn:hover{background:#405cb3}.btn.secondary{background:#26334c}.btn:disabled{opacity:.5;cursor:not-allowed}.item{background:#192743;border:1px solid #34466e;border-radius:9px;padding:10px;margin:8px 0}.item-head{display:flex;justify-content:space-between;gap:10px}.item-title{font-weight:700;overflow-wrap:anywhere}.item-body{white-space:pre-wrap;overflow-wrap:anywhere;color:#c5d0e5;font-size:11px;max-height:62px;overflow:hidden;margin:6px 0}.msg{margin-top:8px;color:#a8e2bf;min-height:16px;font-size:11px}.empty{padding:12px;color:#b0bdd8;border:1px dashed #506180;border-radius:8px}.section{border-top:1px solid #394968;padding-top:10px;margin-top:11px}`;
  shadow.append(style);
  const panel = document.createElement('section');
  panel.className = 'panel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'RP Nexus Forum Toolkit');
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'launcher'; launcher.textContent = 'RN'; launcher.setAttribute('aria-label', 'Открыть RP Nexus Forum Toolkit');
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
    if (validEditor(activeEditor) && activeEditor.isConnected) return activeEditor;
    const selectors = [
      '.fr-element[contenteditable="true"]', '.js-editor[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]', '.message-editor [contenteditable="true"]',
      'form textarea[name="message"]', 'textarea[name="message"]', '.js-quickReply textarea',
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
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      if (!range || !el.contains(range.commonAncestorContainer)) throw new Error('Не удалось определить курсор редактора');
      range.deleteContents();
      const fragment = range.createContextualFragment(richHtml);
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
    } catch (error) { console.error('RP Nexus: editor insert', error); notify('Редактор не принял текст. Откройте режим BBCode или используйте копирование.'); return false; }
  }
  function threadPage() { return /\/threads\//i.test(location.pathname); }
  function nativeActions() {
    if (!threadPage()) return [];
    const links = [...document.querySelectorAll('a[href],button')].filter(n => !n.closest('#rp-nexus-forum-020'));
    const kinds = [
      { id: 'close', title: 'Закрыть / открыть тему', href: /\/(?:lock|unlock|close|open)(?:[\/?#]|$)/i, text: /^(?:закрыть|открыть|заблокировать|разблокировать)(?:\s+(?:тему|обсуждение))?$/i },
      { id: 'move', title: 'Переместить тему', href: /\/(?:move|move-thread)(?:[\/?#]|$)/i, text: /^(?:переместить|перенести)(?:\s+(?:тему|обсуждение))?$/i },
    ];
    return kinds.map(kind => {
      const match = links.find(el => {
        const href = el.getAttribute('href') ?? '';
        if (href && !href.startsWith('#')) {
          let u; try { u = new URL(href, location.href); } catch { return false; }
          if (u.origin !== location.origin) return false;
        }
        return kind.href.test(href) || kind.text.test(el.textContent.trim());
      });
      return { ...kind, node: match };
    }).filter(x => x.node);
  }
  function nativeMenu() {
    return [...document.querySelectorAll('button,a')].find(x => !x.closest('#rp-nexus-forum-020') && /(?:инструменты\s*темы|управление\s*темой|thread\s*tools|moderation)/i.test(x.textContent.trim()));
  }
  async function openNative(action) {
    if (!threadPage()) { notify('Откройте страницу конкретной темы.'); return; }
    let result = nativeActions().find(x => x.id === action);
    if (!result?.node) {
      const menu = nativeMenu();
      if (menu) { menu.click(); await new Promise(r => setTimeout(r, 180)); result = nativeActions().find(x => x.id === action); }
    }
    if (!result?.node) { notify('Действие не доступно в интерфейсе форума или нет прав.'); return; }
    if (!confirm(`Открыть штатное действие форума «${result.title}»? Подтвердите операцию на самом сайте.`)) return;
    result.node.click();
    notify('Открыто штатное действие форума. Завершите его на сайте.');
  }
  function draw() {
    if (!expanded) { panel.classList.remove('open'); launcher.setAttribute('aria-expanded', 'false'); return; }
    panel.classList.add('open'); launcher.setAttribute('aria-expanded', 'true');
    const profile = activeProfile();
    const visible = C.selectTemplates(templates, profile?.id ?? '', '');
    panel.innerHTML = `<div class="bar"><div><div class="name">RP Nexus · Forum</div><div class="sub">${C.esc(profile?.name || 'Без профиля')} · ${C.esc(profile?.server || '')}</div></div><button class="btn secondary" data-act="workspace" title="Управление шаблонами">Настроить ↗</button></div>
      <label class="sub" for="rpn-search">Быстрый ответ</label><input class="field" id="rpn-search" type="search" autocomplete="off" placeholder="Поиск по шаблонам">
      <div class="bar"><input class="field" id="rpn-nickname" placeholder="{{nickname}} (необязательно)" maxlength="200" style="width:50%;margin:3px 0"><input class="field" id="rpn-reason" placeholder="{{reason}}" maxlength="200" style="width:50%;margin:3px 0"></div>
      <div id="rpn-template-list"></div>
      <div class="section"><div class="bar"><b>Управление темой</b><span class="sub">Только штатные функции форума</span></div><div class="actions"><button class="btn secondary" data-act="close">Закрыть / открыть</button><button class="btn secondary" data-act="move">Переместить</button></div></div>
      <div class="actions"><button class="btn secondary" data-act="workspace">Все шаблоны ↗</button><button class="btn secondary" data-act="hide">Скрыть</button></div><div class="msg" role="status" aria-live="polite"></div>`;
    renderList('');
  }
  function renderList(query) {
    const target = panel.querySelector('#rpn-template-list');
    if (!target) return;
    const p = activeProfile();
    const visible = C.selectTemplates(templates, p?.id ?? '', query);
    target.innerHTML = visible.length ? visible.slice(0, 75).map(t => `<article class="item"><div class="item-head"><span class="item-title">${C.esc(t.label)}</span><span class="sub">${t.shortcut ? 'Alt+Shift+' + t.shortcut : C.esc(t.category || t.format)}</span></div><div class="item-body">${C.esc(t.text.slice(0, 200))}</div><div class="actions"><button class="btn" data-insert="${C.esc(t.id)}">Вставить</button><button class="btn secondary" data-copy="${C.esc(t.id)}">Копировать</button></div></article>`).join('') : '<div class="empty">Шаблонов нет. Создайте их в разделе «Форум» рабочего пространства.</div>';
  }
  async function readStorage() {
    try {
      const items = await api.storage.local.get(null);
      state = items[STORAGE] ?? null;
      templates = Object.entries(items).filter(([k]) => k.startsWith(C.KEY_PREFIX)).flatMap(([key, value]) => {
        try { const t = C.cleanTemplate(value); return key === C.KEY_PREFIX + t.id ? [t] : []; } catch { return []; }
      });
      if (expanded) draw();
    } catch (err) { console.warn('RP Nexus: binder storage unavailable', err); }
  }
  launcher.addEventListener('click', () => { expanded = !expanded; draw(); });
  panel.addEventListener('input', ev => { if (ev.target.id === 'rpn-search') renderList(ev.target.value); });
  panel.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.insert) { const t = templates.find(x => x.id === b.dataset.insert); if (t) void applyTemplate(t); return; }
    if (b.dataset.copy) { const t = templates.find(x => x.id === b.dataset.copy); if (!t) return;
      const body = C.interpolate(t.text, makeVariables(findEditor() ?? document.body));
      void navigator.clipboard.writeText(body).then(() => notify('Текст скопирован')).catch(() => notify('Копирование запрещено браузером')); return;
    }
    if (b.dataset.act === 'workspace') { try { api.runtime.sendMessage({ type: 'RP_NEXUS_OPEN_WORKSPACE', view: 'forum' }); } catch { notify('Не удалось открыть настройки'); } return; }
    if (b.dataset.act === 'hide') { expanded = false; draw(); return; }
    if (['close', 'move'].includes(b.dataset.act)) void openNative(b.dataset.act);
  });
  document.addEventListener('keydown', ev => {
    if (ev.repeat || ev.isComposing || !ev.altKey || !ev.shiftKey || ev.ctrlKey || ev.metaKey || !/^Digit[1-9]$/.test(ev.code)) return;
    const slot = Number(ev.code.slice(-1));
    const p = activeProfile();
    const item = C.slotTemplates(templates, p?.id ?? '').get(slot);
    if (!item || !findEditor()) return;
    ev.preventDefault(); ev.stopPropagation();
    void applyTemplate(item);
  }, true);
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  void readStorage();
})();
