import '../lib/safe-dom.js';
const { replaceHtml, insertHtml } = globalThis.MTSafeDOM;
import { api } from '../lib/browser.mjs';
import '../lib/forum-core.js';
import { listTemplates, upsertTemplate, removeTemplate } from '../lib/forum-store.mjs';
import '../lib/xenforo-core.js';
import {listXenForoLinks,saveXenForoLink,deleteXenForoLink} from '../lib/xenforo-store.mjs';
const C = globalThis.RPNForumCore;
let templates = [];
let forumLinks = [];
const XF=globalThis.MTXenForo;
export const xenforoLinks=()=>forumLinks;
let search = '';
const e = C.esc;
export async function refreshForum() { [templates,forumLinks] = await Promise.all([listTemplates(),listXenForoLinks()]); }
export function forumSection(state) {
  const current = state.profiles.find(x => x.id === state.activeProfileId);
  const matching = C.selectTemplates(templates, current.id);
  return `<div class="stack"><section class="card"><div class="row spread"><div><h3>Биндер ответов</h3><p class="subtle">BBCode, переменные, категории, горячие клавиши Alt+Shift+1…9. Шаблоны привязываются к профилю или доступны глобально.</p></div><button class="button primary" data-forum-action="create">+ Новый шаблон</button></div><div class="row"><input id="forum-search" type="search" placeholder="Поиск по названию, категории или тексту" value="${e(search)}" aria-label="Поиск шаблонов" style="flex:1;min-width:220px"><span class="tag">${matching.length} доступно · ${templates.length} всего</span></div></section>
  <div id="forum-items" class="stack">${matching.length ? matching.map(t => `<article class="card" data-template-card data-filter="${e([t.label,t.category,t.text].join(' ').toLocaleLowerCase('ru'))}"><div class="row spread"><div><strong>${e(t.label)}</strong><p class="subtle">${e(t.category || 'Без категории')} · ${t.profileId === '*' ? 'Все профили' : (current.id === t.profileId ? 'Активный профиль' : 'Другой профиль')} · ${e(t.format.toUpperCase())}</p></div>${t.shortcut ? `<span class="tag">Alt+Shift+${t.shortcut}</span>` : ''}</div><pre class="template-text">${e(t.text)}</pre><div class="row"><button class="button secondary" data-forum-action="copy" data-id="${e(t.id)}">Копировать</button><button class="button secondary" data-forum-action="insert" data-id="${e(t.id)}">Вставить в форум</button><button class="button secondary" data-forum-action="edit" data-id="${e(t.id)}">Редактировать</button><button class="button danger" data-forum-action="delete" data-id="${e(t.id)}">Удалить</button></div></article>`).join('') : '<section class="card empty">Пока нет шаблонов для текущего профиля. Создайте шаблон, выбрав этот профиль или «Все профили».</section>'}</div>
  <section class="card stack"><h3>Пользовательская навигация XenForo</h3><p class="subtle">Ссылки появятся в шапке форума выбранного проекта после разрешения доступа. Используются только HTTPS-адреса, открываются в новой вкладке. Ограничение: 60 записей.</p>
    <form id="xf-navigation-form" class="stack"><input type="hidden" name="id" value=""><div class="grid"><label>Название ссылки<input name="title" maxlength="70" placeholder="Правила сервера" required></label><label>Адрес HTTPS<input name="url" type="url" maxlength="2048" placeholder="https://example.com/rules" required></label></div><label>Профиль<select name="profileId"><option value="*">Все профили</option>${state.profiles.map(p=>`<option value="${e(p.id)}" ${p.id===state.activeProfileId?'selected':''}>${e(p.name)} · ${e(p.server)}</option>`).join('')}</select></label><div class="row"><button class="button primary" type="submit">Сохранить ссылку</button><button class="button secondary" type="button" data-forum-action="clear-link-form">Отмена редактирования</button></div></form>
    ${forumLinks.filter(x=>x.profileId==='*'||x.profileId===state.activeProfileId).map(x=>`<article class="row spread"><div><strong>${e(x.title)}</strong><p class="subtle">${e(x.url)}</p></div><div class="row"><button class="button secondary" data-forum-action="edit-link" data-id="${e(x.id)}">Изменить</button><button class="button danger" data-forum-action="remove-link" data-id="${e(x.id)}">Удалить</button></div></article>`).join('')||'<p class="subtle">Пользовательских ссылок пока нет.</p>'}</section>
  <section class="card"><h3>Публичные профили XenForo</h3><p class="subtle">На открытой странице /members/ плавающая панель отображает имя, статус и общедоступные показатели, присутствующие в DOM. Данные не запрашиваются с закрытых страниц и не сохраняются.</p></section>
  <section class="card"><h3>Подстановка переменных</h3><p class="lead"><code>{{nickname}}</code>, <code>{{reason}}</code>, <code>{{server}}</code>, <code>{{project}}</code>, <code>{{thread}}</code>, <code>{{url}}</code>, <code>{{date}}</code>, <code>{{time}}</code>, <code>{{selection}}</code></p><p class="subtle">На форуме {{nickname}} и {{reason}} заполняются в панели MajesticToolkit, {{selection}} берётся из выделения редактора. Неизвестные переменные остаются в шаблоне, а сообщения не отправляются автоматически.</p></section>
  <section class="card"><h3>Инструменты модерации</h3><p class="lead">В плавающей панели на странице темы доступны переходы к штатным действиям закрытия/открытия и перемещения. Они отображаются при наличии таких действий в интерфейсе форума и исполняются только через механизмы сайта. Отдельно подтвердите завершение операции на форуме.</p><p class="subtle">Для работы разрешите доступ в разделе «Сайты и доступ», затем обновите открытую вкладку форума.</p><button class="button secondary" data-action="nav" data-view="sites">Управлять разрешениями</button></section></div>`;
}
function ensureDialog(state) {
  let dlg = document.getElementById('forum-template-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'forum-template-dialog';
    replaceHtml(dlg, `<form id="forum-template-form"><h2 id="forum-template-title">Шаблон</h2><input name="id" type="hidden"><label>Название<input name="label" maxlength="90" required placeholder="Одобрение жалобы"></label><label>Категория<input name="category" maxlength="60" placeholder="Жалобы / Суд / Общие"></label><label>Профиль<select name="profileId"></select></label><div class="grid"><label>Формат<select name="format"><option value="bbcode">BBCode</option><option value="plain">Простой текст</option></select></label><label>Горячая клавиша<select name="shortcut"><option value="0">Без сочетания</option>${Array.from({length:9},(_,i)=>`<option value="${i+1}">Alt+Shift+${i+1}</option>`).join('')}</select></label></div><label>Текст шаблона<textarea name="text" maxlength="16000" rows="8" required spellcheck="true" placeholder="Здравствуйте, {{nickname}}!"></textarea></label><div class="row"><button class="button secondary" type="button" data-bb="b">B</button><button class="button secondary" type="button" data-bb="i">I</button><button class="button secondary" type="button" data-bb="u">U</button><button class="button secondary" type="button" data-bb="url">Ссылка</button><button class="button secondary" type="button" data-bb="quote">Цитата</button></div><div class="preview-area"><p class="subtle">Предпросмотр BBCode</p><div id="forum-preview"></div></div><div class="dialog-actions"><button type="button" class="button secondary" data-forum-action="cancel">Отмена</button><button class="button primary" type="submit">Сохранить шаблон</button></div></form>`);
    document.body.append(dlg);
    dlg.addEventListener('input', () => showPreview(dlg));
    dlg.addEventListener('change', () => showPreview(dlg));
    dlg.addEventListener('click', ev => {
      const tag = ev.target.closest('button[data-bb]')?.dataset.bb;
      if (!tag) return;
      const area = dlg.querySelector('textarea[name="text"]');
      const start = area.selectionStart, end = area.selectionEnd;
      const value = area.value, selection = value.slice(start, end);
      const opening = tag === 'url' ? '[url=https://example.org]' : `[${tag}]`;
      const closing = `[/${tag}]`;
      area.setRangeText(opening + selection + closing, start, end, 'end');
      area.focus(); showPreview(dlg);
    });
  }
  const select = dlg.querySelector('select[name="profileId"]');
  replaceHtml(select, `<option value="*">Все профили</option>` + state.profiles.map(p => `<option value="${e(p.id)}">${e(p.name)} · ${e(p.server)}</option>`).join(''));
  return dlg;
}
function showPreview(dlg) {
  const text = dlg.querySelector('textarea[name="text"]').value;
  const format = dlg.querySelector('[name="format"]').value;
  const preview = dlg.querySelector('#forum-preview');
  replaceHtml(preview, format === 'bbcode' ? C.bbcodeToHtml(text) : e(text).replace(/\r?\n/g, '<br>'));
}
function editDialog(state, id = null) {
  const dialog = ensureDialog(state);
  const original = id ? templates.find(t => t.id === id) : null;
  if (id && !original) throw new Error('Шаблон не найден');
  const form = dialog.querySelector('form'); form.reset();
  form.elements.namedItem('id').value = original?.id ?? '';
  form.elements.namedItem('label').value = original?.label ?? '';
  form.elements.namedItem('category').value = original?.category ?? '';
  form.elements.namedItem('profileId').value = original?.profileId ?? state.activeProfileId;
  form.elements.namedItem('format').value = original?.format ?? 'bbcode';
  form.elements.namedItem('shortcut').value = String(original?.shortcut ?? 0);
  form.elements.namedItem('text').value = original?.text ?? '';
  dialog.querySelector('#forum-template-title').textContent = original ? 'Редактировать шаблон' : 'Новый шаблон';
  showPreview(dialog); dialog.showModal(); form.elements.namedItem('label').focus();
}
function resultText(t, state) {
  const profile = state.profiles.find(x => x.id === state.activeProfileId);
  const ts = new Date();
  return C.interpolate(t.text, { project: profile?.project ?? '', server: profile?.server ?? '', date: ts.toLocaleDateString('ru-RU'), time: ts.toLocaleTimeString('ru-RU') });
}
export async function handleForumAction(button, state, rerender, feedback) {
  const action = button.dataset.forumAction;
  if (!action) return false;
  const id = button.dataset.id;
  if (action === 'create') { editDialog(state); return true; }
  if (action === 'edit') { editDialog(state, id); return true; }
  if (action === 'cancel') { document.getElementById('forum-template-dialog')?.close(); return true; }
  if (action === 'clear-link-form') {document.getElementById('xf-navigation-form')?.reset();return true;}
  if (action === 'edit-link') {
    const link=forumLinks.find(x=>x.id===id);if(!link)throw Error('Ссылка не найдена');
    const form=document.getElementById('xf-navigation-form');
    for(const field of ['id','title','url','profileId'])form.elements.namedItem(field).value=link[field];
    form.elements.namedItem('title').focus();return true;
  }
  if (action === 'remove-link') {
    if(!forumLinks.some(x=>x.id===id))throw Error('Ссылка не найдена');
    if(!confirm('Удалить ссылку из меню форума?'))return true;
    await deleteXenForoLink(id);await refreshForum();rerender();feedback('Пользовательская ссылка удалена');return true;
  }
  const t = templates.find(x => x.id === id);
  if (!t) throw new Error('Шаблон не найден');
  if (action === 'delete') {
    if (!confirm(`Удалить шаблон «${t.label}»?`)) return true;
    await removeTemplate(id); await refreshForum(); rerender(); feedback('Шаблон удалён'); return true;
  }
  if (action === 'copy') {
    await navigator.clipboard.writeText(resultText(t, state)); feedback('Шаблон скопирован'); return true;
  }
  if (action === 'insert') {
    // The workspace is usually the active tab, so a forum tab is normally inactive.
    // Restrict selection to the profile that owns the template to avoid cross-project insertion.
    const profileId = t.profileId === '*' ? state.activeProfileId : t.profileId;
    const profile = state.profiles.find(p => p.id === profileId);
    if (!profile) throw Error('Профиль шаблона не найден');
    const host = (() => {
      try { return new URL(profile.forumUrl).hostname.toLowerCase(); }
      catch { return ''; }
    })();
    const allowedHosts = new Set(['forum.majestic-rp.ru','forum.russia.online']);
    if (!allowedHosts.has(host)) {
      feedback('Для вставки выберите профиль официального форума Majestic RP или Russia Online.', true);
      return true;
    }
    const origin = `https://${host}/*`;
    if (!await api.permissions.contains({origins:[origin]})) {
      feedback('Сначала разрешите доступ к этому форуму в разделе «Сайты и доступ».', true);
      return true;
    }
    const tabs = await api.tabs.query({url:[origin]});
    const candidates = tabs.filter(tab => tab.id && (()=>{
      try { return new URL(tab.url).hostname.toLowerCase() === host; }
      catch { return false; }
    })());
    // Prefer the current window, then the most recently visited matching forum tab.
    candidates.sort((a,b)=>Number(Boolean(b.active))-Number(Boolean(a.active)) ||
      Number(Boolean(b.currentWindow))-Number(Boolean(a.currentWindow)) ||
      (b.lastAccessed||0)-(a.lastAccessed||0));
    if (!candidates.length) {
      feedback('Откройте соответствующий форум и редактор ответа, затем повторите вставку.',true);
      return true;
    }
    let response;
    try { response = await api.tabs.sendMessage(candidates[0].id,{type:'RP_NEXUS_APPLY_TEMPLATE',id}); }
    catch (error) { throw Error('Нет связи с панелью форума. Проверьте разрешение на сайт и обновите вкладку, затем повторите.'); }
    if (!response?.ok) throw new Error(response?.error || 'Вставка не подтверждена страницей форума');
    feedback('Шаблон вставлен в редактор форума'); return true;
  }
  return true;
}
export async function handleForumSubmit(event, state, rerender, feedback) {
  if (event.target.getAttribute('id')==='xf-navigation-form') {
    event.preventDefault();const elements=event.target.elements;
    const profileId=elements.namedItem('profileId').value;
    if(profileId!=='*'&&!state.profiles.some(x=>x.id===profileId))throw Error('Профиль не найден');
    const id=elements.namedItem('id').value;
    await saveXenForoLink({title:elements.namedItem('title').value,url:elements.namedItem('url').value,profileId},id||null);
    await refreshForum();rerender();feedback('Ссылка сохранена для XenForo');return true;
  }
  if (event.target.getAttribute('id') !== 'forum-template-form') return false;
  event.preventDefault();
  const form = event.target.elements;
  const id = form.namedItem('id').value;
  const input = Object.fromEntries(['label','category','profileId','format','shortcut','text'].map(key => [key, form.namedItem(key).value]));
  if (input.profileId !== '*' && !state.profiles.some(p => p.id === input.profileId)) throw new Error('Профиль не существует');
  if (input.shortcut !== '0' && templates.some(x => x.id !== id && x.shortcut === Number(input.shortcut) && x.profileId === input.profileId)) throw new Error('Сочетание клавиш уже занято шаблоном в этом профиле');
  await upsertTemplate(input, id || null);
  await refreshForum();
  document.getElementById('forum-template-dialog').close();
  rerender(); feedback('Шаблон сохранён'); return true;
}
export function filterForum(query) {
  search = query;
  const q = search.trim().toLocaleLowerCase('ru');
  for (const card of document.querySelectorAll('[data-template-card]')) card.hidden = !card.dataset.filter.includes(q);
}
