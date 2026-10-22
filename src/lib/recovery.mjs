/** Crash-survivable rollback of extension-owned local records. Never includes OAuth/session tokens. */
export const RECOVERY_KEY = 'majesticToolkitRecoveryV1';
export const RECOVERY_LIMIT = 20 * 1024 * 1024;
const OWNED_KEYS = new Set(['rpNexusStateV1', 'majesticToolkitProductivityV9', 'majesticToolkit:externalLinks:v8', 'majesticToolkitMonitorV12', 'majesticToolkitKnowledgeV13']);
const OWNED_PREFIXES = ['rpnForumTemplateV2:', 'rpnComplaintV3:', 'rpnEconomyV4:', 'majesticLawV5:', 'majesticGovernmentV6:', 'majesticDocumentV7:', 'majesticToolkitXfNavV11:'];
export const isOwnedKey = key => OWNED_KEYS.has(key) || OWNED_PREFIXES.some(prefix => key.startsWith(prefix));
const serialize = value => JSON.stringify(value);
const utf8 = value => new TextEncoder().encode(value);
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
export async function checksum(records) {
  const bytes = utf8(serialize(records));
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}
export function ownedRecords(raw) {
  return Object.fromEntries(Object.entries(raw).filter(([key]) => isOwnedKey(key)));
}
export async function examineRestorePoint(storage) {
  const candidate = (await storage.get(RECOVERY_KEY))[RECOVERY_KEY];
  if (candidate === undefined) return null;
  if (!candidate || candidate.version !== 1 || !['pending', 'ready'].includes(candidate.status) || !candidate.records ||
      Array.isArray(candidate.records) || typeof candidate.records !== 'object' || typeof candidate.hash !== 'string' ||
      !Number.isFinite(Date.parse(candidate.createdAt))) throw Error('Повреждена точка восстановления');
  if (Object.keys(candidate.records).some(key => !isOwnedKey(key))) throw Error('Точка содержит посторонние ключи');
  const bytes = utf8(serialize(candidate.records));
  if (bytes.length > RECOVERY_LIMIT || await checksum(candidate.records) !== candidate.hash) throw Error('Контрольная сумма точки восстановления не совпадает');
  return candidate;
}
export async function createRestorePoint(storage) {
  const existing = await examineRestorePoint(storage);
  if (existing?.status === 'pending') throw Error('Есть незавершённое восстановление. Сначала восстановите или удалите предыдущую точку.');
  const data = ownedRecords(await storage.get(null));
  if (utf8(serialize(data)).length > RECOVERY_LIMIT) throw Error('Локальные данные больше 20 МиБ. Экспортируйте JSON вручную перед импортом.');
  const point = { version: 1, createdAt: new Date().toISOString(), status: 'pending', hash: await checksum(data), records: data };
  await storage.set({ [RECOVERY_KEY]: point });
  await examineRestorePoint(storage);
  return point;
}
export async function completeRestorePoint(storage) {
  const point = await examineRestorePoint(storage);
  if (!point) throw Error('Точка восстановления отсутствует');
  await storage.set({ [RECOVERY_KEY]: { ...point, status: 'ready' } });
}
export async function applyRestorePoint(storage) {
  const point = await examineRestorePoint(storage); // checksum is verified before any mutation
  if (!point) throw Error('Точка восстановления отсутствует');
  const previous = ownedRecords(await storage.get(null));
  const extra = Object.keys(previous).filter(key => !Object.hasOwn(point.records, key));
  // Write first. If interrupted, the pending recovery marker and hash remain intact for retry.
  if (Object.keys(point.records).length) await storage.set(point.records);
  if (extra.length) await storage.remove(extra);
  await storage.set({ [RECOVERY_KEY]: { ...point, status: 'ready' } });
  return Object.keys(point.records).length;
}
export async function discardRestorePoint(storage) {
  await storage.remove(RECOVERY_KEY);
}
