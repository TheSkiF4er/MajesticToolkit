export const SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'rp-nexus-backup';
export const MAX_PROFILES = 100;
export const PROJECTS = Object.freeze({ majestic: 'Majestic RP', 'russia-online': 'Russia Online', other: 'Другой проект' });
export const THEMES = Object.freeze(['system', 'dark', 'light']);
export const VIEWS = Object.freeze(['home', 'forum', 'complaints', 'economy', 'profiles', 'sites', 'settings', 'backup']);

function string(value, field, max = 90, allowEmpty = false) {
  if (typeof value !== 'string') throw new Error(`Неверное поле «${field}»`);
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > max) throw new Error(`Некорректная длина поля «${field}» (до ${max} символов)`);
  return result;
}
function secureURL(value) {
  if (value === undefined || value === null || value === '') return '';
  const raw = string(value, 'Адрес форума', 512);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Введите полный HTTPS-адрес форума'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error('Допускаются только HTTPS-ссылки без логина и пароля');
  return parsed.href;
}
function validProject(value) {
  if (!Object.hasOwn(PROJECTS, value)) throw new Error('Неизвестный RP-проект');
  return value;
}
function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
function now() { return new Date().toISOString(); }

export function defaultState() {
  const id = uuid();
  const ts = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    activeProfileId: id,
    profiles: [{ id, name: 'Основной профиль', project: 'majestic', server: 'Не выбран', forumUrl: 'https://forum.majestic-rp.ru/', createdAt: ts, updatedAt: ts }],
    preferences: { theme: 'system', compact: false, startPage: 'home' },
    updatedAt: ts
  };
}
export function validateProfileForm(data) {
  return { name: string(data.name, 'Название', 64), project: validProject(data.project), server: string(data.server, 'Сервер', 70), forumUrl: secureURL(data.forumUrl) };
}
export function validateState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.schemaVersion !== SCHEMA_VERSION) throw new Error('Неподдерживаемая версия данных');
  if (!Array.isArray(data.profiles) || data.profiles.length < 1 || data.profiles.length > MAX_PROFILES) throw new Error('Недопустимое количество профилей');
  const ids = new Set();
  const profiles = data.profiles.map((p) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Некорректная структура профиля');
    const id = string(p.id, 'ID', 128);
    if (ids.has(id)) throw new Error('Повторяющийся ID профиля');
    ids.add(id);
    const form = validateProfileForm(p);
    const createdAt = string(p.createdAt, 'Дата создания', 40);
    const updatedAt = string(p.updatedAt, 'Дата изменения', 40);
    if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Некорректная дата профиля');
    return { id, ...form, createdAt, updatedAt };
  });
  const activeProfileId = string(data.activeProfileId, 'Активный профиль', 128);
  if (!ids.has(activeProfileId)) throw new Error('Активный профиль отсутствует в списке');
  const prefs = data.preferences;
  if (!prefs || typeof prefs !== 'object' || !THEMES.includes(prefs.theme) || typeof prefs.compact !== 'boolean' || !VIEWS.includes(prefs.startPage)) throw new Error('Некорректные настройки');
  const updatedAt = string(data.updatedAt, 'Дата состояния', 40);
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error('Некорректная дата данных');
  // Whitelist all fields: imported objects cannot append scripts, tokens or unexpected configuration.
  return { schemaVersion: SCHEMA_VERSION, activeProfileId, profiles, preferences: { theme: prefs.theme, compact: prefs.compact, startPage: prefs.startPage }, updatedAt };
}
function changed(state, patch) { return { ...state, ...patch, updatedAt: now() }; }
export function addProfile(state, input) {
  if (state.profiles.length >= MAX_PROFILES) throw new Error(`Максимум ${MAX_PROFILES} профилей`);
  const time = now();
  const profile = { id: uuid(), ...validateProfileForm(input), createdAt: time, updatedAt: time };
  return changed(state, { profiles: [...state.profiles, profile], activeProfileId: profile.id });
}
export function editProfile(state, id, input) {
  if (!state.profiles.some(p => p.id === id)) throw new Error('Профиль не найден');
  return changed(state, { profiles: state.profiles.map(p => p.id === id ? { ...p, ...validateProfileForm(input), updatedAt: now() } : p) });
}
export function deleteProfile(state, id) {
  if (state.profiles.length === 1) throw new Error('Нельзя удалить последний профиль');
  if (!state.profiles.some(p => p.id === id)) throw new Error('Профиль не найден');
  const profiles = state.profiles.filter(p => p.id !== id);
  return changed(state, { profiles, activeProfileId: state.activeProfileId === id ? profiles[0].id : state.activeProfileId });
}
export function selectProfile(state, id) {
  if (!state.profiles.some(p => p.id === id)) throw new Error('Профиль не найден');
  return changed(state, { activeProfileId: id });
}
export function savePreferences(state, patch) {
  const preferences = { ...state.preferences, ...patch };
  if (!THEMES.includes(preferences.theme) || typeof preferences.compact !== 'boolean' || !VIEWS.includes(preferences.startPage)) throw new Error('Некорректные настройки');
  return changed(state, { preferences });
}
export function makeBackup(state) {
  return JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now(), payload: validateState(state) }, null, 2);
}
export function parseBackup(source) {
  if (typeof source !== 'string' || source.length > 1024 * 1024) throw new Error('Резервная копия слишком большая (максимум 1 МиБ)');
  let obj;
  try { obj = JSON.parse(source); } catch { throw new Error('Файл не является корректным JSON'); }
  if (!obj || obj.format !== BACKUP_FORMAT || obj.schemaVersion !== SCHEMA_VERSION || !Number.isFinite(Date.parse(obj.exportedAt))) throw new Error('Неподдерживаемый формат резервной копии');
  return validateState(obj.payload);
}
export function getActiveProfile(state) { return state.profiles.find(p => p.id === state.activeProfileId); }
export function projectLabel(project) { return PROJECTS[project] ?? project; }
