/** MajesticToolkit 0.10: persisted, integrity-checked recovery point for multi-store imports. */
import { api } from './browser.mjs';
export const RECOVERY_KEY = 'majesticToolkit:recovery:v10';
export const RECOVERY_MAX_BYTES = 20 * 1024 * 1024;
const managed = /^(?:rpNexusStateV1|majesticToolkitProductivityV9|majesticToolkit:externalLinks:v8|rpnForumTemplateV2:[\w-]+|rpnComplaintV3:[\w-]+|rpnEconomyV4:[\w-]+|majesticLawV5:[\w-]+|majesticGovernmentV6:[\w-]+|majesticDocumentV7:[\w-]+)$/;
const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
function canonicalEntries(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error('Неверный снимок данных');
  return Object.fromEntries(Object.entries(source).filter(([key]) => managed.test(key)).sort(([a],[b]) => a.localeCompare(b)));
}
export function managedKeys(raw) { return Object.keys(raw).filter(key => managed.test(key)); }
async function digest(data) {
  if (!globalThis.crypto?.subtle) throw Error('Для проверки целостности требуется Web Crypto');
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(data))));
}
async function verify(point) {
  if (!point || point.version !== 1 || !['pending', 'ready'].includes(point.phase) || !Number.isFinite(Date.parse(point.createdAt))) throw Error('Недопустимый формат точки восстановления');
  const entries = canonicalEntries(point.entries);
  if (Object.keys(entries).length !== Object.keys(point.entries).length) throw Error('Недопустимые ключи точки восстановления');
  const json = JSON.stringify(entries);
  if (encoder.encode(json).length > RECOVERY_MAX_BYTES) throw Error('Снимок восстановления превышает допустимый размер');
  if (await digest(json) !== point.sha256) throw Error('Нарушена целостность точки восстановления');
  return entries;
}
export async function getRecoveryStatus(storage = api.storage.local) {
  const point = (await storage.get(RECOVERY_KEY))[RECOVERY_KEY];
  if (!point) return null;
  await verify(point);
  return {phase:point.phase,createdAt:point.createdAt,count:Object.keys(point.entries).length};
}
export async function captureRecovery(storage = api.storage.local) {
  const prior = (await storage.get(RECOVERY_KEY))[RECOVERY_KEY];
  if (prior?.phase === 'pending') throw Error('Предыдущий импорт был прерван. Сначала восстановите данные.');
  const entries = canonicalEntries(await storage.get(null));
  const json = JSON.stringify(entries);
  const bytes = encoder.encode(json).length;
  if (bytes > RECOVERY_MAX_BYTES) throw Error('Локальные данные слишком велики для безопасной точки восстановления (20 МиБ). Сначала скачайте резервную копию.');
  const point = {version:1,phase:'pending',createdAt:new Date().toISOString(),sha256:await digest(json),entries};
  await storage.set({[RECOVERY_KEY]:point});
  await verify((await storage.get(RECOVERY_KEY))[RECOVERY_KEY]);
  return {bytes,count:Object.keys(entries).length};
}
export async function commitRecovery(storage = api.storage.local) {
  const point=(await storage.get(RECOVERY_KEY))[RECOVERY_KEY];
  await verify(point);
  await storage.set({[RECOVERY_KEY]:{...point,phase:'ready'}});
}
export async function restoreRecovery(storage = api.storage.local) {
  const point=(await storage.get(RECOVERY_KEY))[RECOVERY_KEY];
  const entries=await verify(point); // Always validate before changing anything.
  const current=await storage.get(null);
  // Write restored values before deleting new records. If an API call fails, the point remains.
  if(Object.keys(entries).length)await storage.set(entries);
  const stale=managedKeys(current).filter(k=>!Object.hasOwn(entries,k));
  if(stale.length)await storage.remove(stale);
  await storage.remove(RECOVERY_KEY);
  return {restored:Object.keys(entries).length,removed:stale.length};
}
export async function discardRecovery(storage = api.storage.local) {
  const point=(await storage.get(RECOVERY_KEY))[RECOVERY_KEY];
  if(point?.phase==='pending')throw Error('Сначала восстановите прерванный импорт');
  await storage.remove(RECOVERY_KEY);
}
