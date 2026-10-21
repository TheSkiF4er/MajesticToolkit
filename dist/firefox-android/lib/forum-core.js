/* MajesticToolkit Forum Toolkit shared runtime (extension pages + isolated content scripts). */
(() => {
  'use strict';
  const MAX_TEMPLATES = 500;
  const KEY_PREFIX = 'rpnForumTemplateV2:';
  const ID_RE = /^[a-zA-Z0-9_-]{8,100}$/;
  const trim = (v, name, max, optional = false) => {
    if (typeof v !== 'string') throw new Error(`Поле «${name}» должно быть строкой`);
    const x = v.trim();
    if ((!optional && !x) || x.length > max) throw new Error(`Недопустимая длина поля «${name}» (до ${max})`);
    return x;
  };
  const cleanTemplate = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Неверный формат шаблона');
    const id = trim(obj.id, 'ID', 100);
    if (!ID_RE.test(id)) throw new Error('Недопустимый ID шаблона');
    const profileId = trim(obj.profileId, 'Профиль', 128);
    const label = trim(obj.label, 'Название', 90);
    const category = trim(obj.category ?? '', 'Категория', 60, true);
    const text = trim(obj.text, 'Текст', 16000);
    const shortcut = Number(obj.shortcut ?? 0);
    if (!Number.isInteger(shortcut) || shortcut < 0 || shortcut > 9) throw new Error('Клавиша: от 0 до 9');
    const format = obj.format ?? 'bbcode';
    if (!['bbcode', 'plain'].includes(format)) throw new Error('Неизвестный формат');
    const createdAt = trim(obj.createdAt, 'Дата создания', 40);
    const updatedAt = trim(obj.updatedAt, 'Дата изменения', 40);
    if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Неправильная дата');
    return { id, profileId, label, category, text, shortcut, format, createdAt, updatedAt };
  };
  const makeId = () => 'tpl_' + (globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
  const createTemplate = (input, original = null) => cleanTemplate({
    id: original?.id ?? makeId(), profileId: input.profileId, label: input.label,
    category: input.category ?? '', text: input.text, shortcut: Number(input.shortcut ?? 0),
    format: input.format ?? 'bbcode', createdAt: original?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  function interpolate(source, values = {}) {
    const map = Object.create(null);
    for (const [key, value] of Object.entries(values)) if (/^[a-z][a-z0-9_]*$/i.test(key)) map[key.toLowerCase()] = String(value ?? '').slice(0, 500);
    return String(source).replace(/\{\{([a-z][a-z0-9_]*)\}\}/gi, (all, key) => Object.hasOwn(map, key.toLowerCase()) ? map[key.toLowerCase()] : all);
  }
  function safeURL(input) {
    try { const u = new URL(input); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
    catch { return null; }
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Whitelisted BBCode -> HTML for contenteditable rich editors. No arbitrary HTML is trusted.
  function bbcodeToHtml(raw) {
    let html = esc(raw);
    const simple = { b: 'strong', i: 'em', u: 'u', s: 's', quote: 'blockquote', code: 'pre' };
    for (const [tag, output] of Object.entries(simple)) {
      html = html.replace(new RegExp(`\\[${tag}\\]`, 'gi'), `<${output}>`).replace(new RegExp(`\\[/${tag}\\]`, 'gi'), `</${output}>`);
    }
    html = html.replace(/\[url=(https?:\/\/[^\]\s]+)\]([\s\S]*?)\[\/url\]/gi, (full, url, label) => {
      const href = safeURL(url.replaceAll('&amp;', '&'));
      return href ? `<a href="${esc(href)}" rel="nofollow noopener noreferrer">${label}</a>` : full;
    });
    html = html.replace(/\[color=(#[0-9a-f]{3,8}|[a-z]{3,18})\]([\s\S]*?)\[\/color\]/gi, (all, color, body) => `<span style="color:${color}">${body}</span>`);
    return html.replace(/\r?\n/g, '<br>');
  }
  function selectTemplates(all, profileId, query = '') {
    const q = query.trim().toLocaleLowerCase('ru');
    return all.filter(t => t.profileId === '*' || t.profileId === profileId).filter(t => !q || [t.label, t.category, t.text].some(x => x.toLocaleLowerCase('ru').includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.label.localeCompare(b.label, 'ru'));
  }
  function slotTemplates(all, profileId) {
    const slots = new Map();
    for (const t of selectTemplates(all, profileId)) if (t.shortcut && (!slots.has(t.shortcut) || (slots.get(t.shortcut).profileId === '*' && t.profileId !== '*'))) slots.set(t.shortcut, t);
    return slots;
  }
  globalThis.RPNForumCore = Object.freeze({ MAX_TEMPLATES, KEY_PREFIX, cleanTemplate, createTemplate, interpolate, bbcodeToHtml, selectTemplates, slotTemplates, esc, safeURL });
})();
