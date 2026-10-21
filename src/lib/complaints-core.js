/* MajesticToolkit 0.3 — standalone validation and deterministic case/evidence transformations. */
(function (root) {
  'use strict';
  const PREFIX = 'rpnComplaintV3:';
  const MAX_CASES = 500;
  const MAX_EVIDENCE = 60;
  const STATUS = Object.freeze(['new', 'in-progress', 'waiting', 'done']);
  const ALLOWED_HOSTS = Object.freeze(['forum.majestic-rp.ru', 'forum.russia.online']);
  const VIDEO_HOSTS = Object.freeze(['www.youtube.com','youtube.com','youtu.be','rutube.ru','www.rutube.ru','www.twitch.tv','twitch.tv']);
  function str(value, name, max, optional = false) {
    if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw Error(`${name}: неверное значение`);
    return value.trim();
  }
  function date(value, name, nullable = false) {
    if (nullable && (value === null || value === '')) return null;
    if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw Error(`${name}: неверная дата`);
    return new Date(value).toISOString();
  }
  function uuid() { return root.crypto?.randomUUID?.() ?? `rpn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
  function httpsUrl(value, name, hostList = null) {
    if (typeof value !== 'string' || value.length > 2048) throw Error(`${name}: неверная ссылка`);
    let url;
    try { url = new URL(value); } catch { throw Error(`${name}: неверная ссылка`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname.endsWith('.') || (hostList && !hostList.includes(url.hostname))) throw Error(`${name}: разрешены только подходящие HTTPS-ссылки`);
    url.hash = '';
    return url;
  }
  function canonicalThreadUrl(value) {
    const url = httpsUrl(value, 'Тема', ALLOWED_HOSTS);
    // URL may include a path before /threads/ on XenForo deployments.
    const match = url.pathname.match(/(?:^|\/)threads\/([^/]+)(?:\/|$)/i);
    if (!match) throw Error('Нужна HTTPS-ссылка на тему форума (/threads/)');
    const key = match[1].match(/\.(\d+)$/)?.[1] || (match[1].match(/^\d+$/)?.[0] ?? match[1].toLowerCase());
    if (!/^[\p{L}\p{N}_.%-]{1,180}$/u.test(key)) throw Error('Некорректный идентификатор темы');
    return { url: `${url.origin}${url.pathname.replace(/\/?$/, '/')}`, key: `${url.hostname}:${key}` };
  }
  function threadKey(value) { return canonicalThreadUrl(value).key; }
  function videoLink(value, seconds = null) {
    const url = httpsUrl(value, 'Доказательство');
    if (seconds !== null) {
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) throw Error('Неверный таймкод');
      // Store the time independently; never destructively change the original link.
    }
    return url.href;
  }
  function cleanEvidence(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Некорректное доказательство');
    const seconds = data.seconds === null || data.seconds === undefined || data.seconds === '' ? null : Number(data.seconds);
    if (!/^[\w-]{8,120}$/.test(data.id)) throw Error('Некорректный ID доказательства');
    const result = {
      id: str(data.id, 'ID доказательства', 120),
      url: videoLink(data.url, seconds), seconds,
      title: str(data.title, 'Название доказательства', 180),
      note: str(data.note ?? '', 'Заметка к доказательству', 1000, true),
      createdAt: date(data.createdAt, 'Дата доказательства')
    };
    return result;
  }
  function cleanCase(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Некорректная жалоба');
    if (!/^[\w-]{8,120}$/.test(data.id)) throw Error('Некорректный ID жалобы');
    const thread = canonicalThreadUrl(data.url);
    if (!STATUS.includes(data.status)) throw Error('Неизвестный статус');
    if (!Array.isArray(data.evidence) || data.evidence.length > MAX_EVIDENCE) throw Error('Слишком много доказательств');
    const evidence = data.evidence.map(cleanEvidence);
    if (new Set(evidence.map(e => e.id)).size !== evidence.length) throw Error('Дублирование доказательств');
    if (typeof data.watching !== 'boolean' || typeof data.unread !== 'boolean') throw Error('Некорректные настройки жалобы');
    if (!(data.lastSeenPostId === null || (Number.isSafeInteger(data.lastSeenPostId) && data.lastSeenPostId >= 0))) throw Error('Некорректный ID сообщения');
    return {
      id: str(data.id, 'ID жалобы', 120), profileId: str(data.profileId, 'Профиль', 128),
      url: thread.url, threadKey: thread.key,
      title: str(data.title, 'Название жалобы', 240), status: data.status,
      note: str(data.note, 'Заметка', 12000, true), draft: str(data.draft, 'Черновик', 30000, true),
      deadline: date(data.deadline, 'Срок', true), watching: data.watching,
      lastSeenPostId: data.lastSeenPostId,
      lastCheckedAt: date(data.lastCheckedAt, 'Дата проверки', true),
      unread: data.unread, evidence,
      createdAt: date(data.createdAt, 'Дата создания'), updatedAt: date(data.updatedAt, 'Дата изменения')
    };
  }
  function createCase(data) {
    const now = new Date().toISOString();
    return cleanCase({ id: uuid(), profileId: data.profileId, title: data.title, url: data.url, status: data.status || 'new', note: data.note ?? '', draft: data.draft ?? '', deadline: data.deadline || null, watching: data.watching ?? true, lastSeenPostId: null, lastCheckedAt: null, unread: false, evidence: [], createdAt: now, updatedAt: now });
  }
  function updateCase(old, fields) {
    const allowed = ['title','status','note','draft','deadline','watching','unread'];
    const values = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key)));
    return cleanCase({ ...cleanCase(old), ...values, updatedAt: new Date().toISOString() });
  }
  function addEvidence(old, input) {
    const item = cleanCase(old);
    if (item.evidence.length >= MAX_EVIDENCE) throw Error('Максимум доказательств достигнут');
    const next = { id: uuid(), url: input.url, seconds: input.seconds ?? null, title: input.title || 'Доказательство', note: input.note ?? '', createdAt: new Date().toISOString() };
    return cleanCase({ ...item, evidence: [...item.evidence, next], updatedAt: new Date().toISOString() });
  }
  function removeEvidence(old, id) {
    const item = cleanCase(old);
    if (!item.evidence.some(e => e.id === id)) throw Error('Доказательство не найдено');
    return cleanCase({ ...item, evidence: item.evidence.filter(e => e.id !== id), updatedAt: new Date().toISOString() });
  }
  function observeCase(old, postId, checkedAt = new Date().toISOString()) {
    const item = cleanCase(old);
    if (!item.watching) return { item, changed: false };
    const n = postId === null ? null : Number(postId);
    if (n !== null && (!Number.isSafeInteger(n) || n < 0)) throw Error('Некорректный номер сообщения');
    const changed = n !== null && item.lastSeenPostId !== null && n > item.lastSeenPostId;
    const lastSeenPostId = n === null ? item.lastSeenPostId : Math.max(n, item.lastSeenPostId ?? 0);
    return { item: cleanCase({ ...item, lastSeenPostId, lastCheckedAt: checkedAt, unread: item.unread || changed, updatedAt: checkedAt }), changed };
  }
  function timecode(seconds) {
    if (seconds === null || seconds === undefined) return '';
    const s = Number(seconds);
    if (!Number.isInteger(s) || s < 0) return '';
    return `${Math.floor(s/3600) ? Math.floor(s/3600) + ':' : ''}${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }
  root.RPNComplaints = Object.freeze({ PREFIX, MAX_CASES, MAX_EVIDENCE, STATUS, ALLOWED_HOSTS, VIDEO_HOSTS, cleanCase, createCase, updateCase, addEvidence, removeEvidence, observeCase, canonicalThreadUrl, threadKey, cleanEvidence, videoLink, timecode });
})(globalThis);
