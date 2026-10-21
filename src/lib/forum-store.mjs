import './forum-core.js';
import { api } from './browser.mjs';
const C = globalThis.RPNForumCore;
const prefix = C.KEY_PREFIX;
let mutations = Promise.resolve();
function serialize(callback) {
  const job = mutations.then(callback);
  mutations = job.catch(() => {});
  return job;
}
function fromStorage(value) {
  const out = [];
  for (const [key, object] of Object.entries(value)) {
    if (!key.startsWith(prefix)) continue;
    try { const record = C.cleanTemplate(object); if (key === prefix + record.id) out.push(record); }
    catch (error) { console.warn('MajesticToolkit: invalid template skipped', key, error); }
  }
  return out;
}
export async function listTemplates() { return fromStorage(await api.storage.local.get(null)); }
export async function upsertTemplate(input, id = null) {
  return serialize(async () => {
    const records = await listTemplates();
    const old = id ? records.find(x => x.id === id) : null;
    if (id && !old) throw new Error('Шаблон не найден или повреждён');
    if (!old && records.length >= C.MAX_TEMPLATES) throw new Error('Достигнут лимит шаблонов');
    const item = C.createTemplate(input, old);
    await api.storage.local.set({ [prefix + item.id]: item });
    return item;
  });
}
export async function removeTemplate(id) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new Error('Неверный ID');
  return serialize(() => api.storage.local.remove(prefix + id));
}
export async function replaceTemplates(records) {
  return serialize(async () => {
    if (!Array.isArray(records) || records.length > C.MAX_TEMPLATES) throw new Error('Превышен лимит шаблонов');
    const seen = new Set(), validated = records.map(item => {
      const record = C.cleanTemplate(item);
      if (seen.has(record.id)) throw new Error('Повторяющиеся шаблоны');
      seen.add(record.id);
      return record;
    });
    const old = await api.storage.local.get(null);
    const oldKeys = Object.keys(old).filter(k => k.startsWith(prefix));
    const update = Object.fromEntries(validated.map(t => [prefix + t.id, t]));
    // Pre-write new values, then remove stale keys. If storage fails, restore the original records.
    try {
      if (Object.keys(update).length) await api.storage.local.set(update);
      const remove = oldKeys.filter(k => !Object.hasOwn(update, k));
      if (remove.length) await api.storage.local.remove(remove);
    } catch (error) {
      const previous = Object.fromEntries(oldKeys.map(k => [k, old[k]]));
      if (oldKeys.length) await api.storage.local.set(previous);
      const introduced = Object.keys(update).filter(k => !oldKeys.includes(k));
      if (introduced.length) await api.storage.local.remove(introduced);
      throw error;
    }
  });
}
export function makeFullBackup(profileState, templates) {
  const checked = templates.map(C.cleanTemplate);
  if (checked.length > C.MAX_TEMPLATES) throw new Error('Слишком много шаблонов');
  return JSON.stringify({ format: 'rp-nexus-backup', schemaVersion: 2, exportedAt: new Date().toISOString(), payload: profileState, forumTemplates: checked }, null, 2);
}
export function parseFullBackup(text, validateState) {
  if (typeof text !== 'string' || text.length > 8 * 1024 * 1024) throw new Error('Размер копии превышает 8 МиБ');
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('Некорректный JSON'); }
  if (obj?.format !== 'rp-nexus-backup' || !Number.isFinite(Date.parse(obj.exportedAt))) throw new Error('Неверный формат копии');
  if (obj.schemaVersion !== 1 && obj.schemaVersion !== 2) throw new Error('Неподдерживаемая версия копии');
  const profiles = validateState(obj.payload);
  const templates = obj.schemaVersion === 2 ? obj.forumTemplates : [];
  if (!Array.isArray(templates) || templates.length > C.MAX_TEMPLATES) throw new Error('Некорректные шаблоны');
  const seen = new Set();
  const validTemplates = templates.map(t => {
    const x = C.cleanTemplate(t);
    if (seen.has(x.id)) throw new Error('Повторяющийся ID шаблона');
    seen.add(x.id);
    if (x.profileId !== '*' && !profiles.profiles.some(p => p.id === x.profileId)) throw new Error('Шаблон связан с отсутствующим профилем');
    return x;
  });
  return { state: profiles, templates: validTemplates, legacy: obj.schemaVersion === 1 };
}
