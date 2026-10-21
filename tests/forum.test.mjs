import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/forum-core.js';
import { defaultState, addProfile, validateState, makeBackup } from '../src/lib/model.mjs';
const C = globalThis.RPNForumCore;

const storage = {};
const local = {
  get: async (keys) => keys === null ? { ...storage } : typeof keys === 'string' ? { [keys]: storage[keys] } :
    Object.fromEntries((Array.isArray(keys) ? keys : Object.keys(keys)).map(k => [k, storage[k]])),
  set: async values => Object.assign(storage, values),
  remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; }
};
globalThis.chrome = { storage: { local } };
const { listTemplates, upsertTemplate, removeTemplate, replaceTemplates, parseFullBackup, makeFullBackup } = await import('../src/lib/forum-store.mjs');
const input = (profileId = '*') => ({ label: 'Решение по жалобе', category: 'Модерация', profileId, format: 'bbcode', shortcut: 1, text: '[b]Здравствуйте, {{nickname}}![/b]\nВаше обращение рассмотрено.' });

test('creating and editing a template preserves immutable ID and original timestamp', async () => {
  const t = await upsertTemplate(input());
  assert.match(t.id, /^tpl_/); assert.ok(t.createdAt);
  const edited = await upsertTemplate({ ...input(), label: 'Новая версия' }, t.id);
  assert.equal(edited.id, t.id); assert.equal(edited.createdAt, t.createdAt);
  assert.equal((await listTemplates()).length, 1);
  assert.equal((await listTemplates())[0].label, 'Новая версия');
});
test('per-template keys avoid clobbering independent writes', async () => {
  await Promise.all([upsertTemplate({ ...input(), label: 'A', shortcut: 2 }), upsertTemplate({ ...input(), label: 'B', shortcut: 3 })]);
  assert.equal((await listTemplates()).length, 3);
});
test('strict validation rejects unsafe shapes, lengths and invalid shortcuts', () => {
  const valid = C.createTemplate(input());
  assert.throws(() => C.cleanTemplate({ ...valid, shortcut: 55 }), /Клавиша/);
  assert.throws(() => C.cleanTemplate({ ...valid, text: ' ' }), /Текст/);
  assert.throws(() => C.cleanTemplate({ ...valid, text: 'A'.repeat(16001) }), /Текст/);
  assert.throws(() => C.cleanTemplate({ ...valid, id: 'bad' }), /ID/);
  assert.deepEqual(Object.keys(C.cleanTemplate({ ...valid, unexpected: '<script>' })).sort(),
    ['id', 'profileId', 'label', 'category', 'text', 'shortcut', 'format', 'createdAt', 'updatedAt'].sort());
});
test('BBCode preview escapes active HTML and blocks javascript URLs', () => {
  const html = C.bbcodeToHtml('[b]Привет[/b] <img onerror="alert(1)">\n[url=https://example.com/x]ссылка[/url] [url=javascript:alert(1)]X[/url]');
  assert.match(html, /<strong>Привет<\/strong>/);
  assert.match(html, /&lt;img onerror=/);
  assert.match(html, /<a href="https:\/\/example.com\/x"/);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /<br>/);
});
test('variable interpolation leaves unknown variables visible', () => {
  assert.equal(C.interpolate('{{nickname}} / {{server}} / {{missing}}', { nickname: 'Alex', server: 'Seattle' }), 'Alex / Seattle / {{missing}}');
});
test('template scope and shortcut priority', () => {
  const global = C.createTemplate({ ...input(), label: 'Global' });
  const profile = C.createTemplate({ ...input('profile_1234'), label: 'Personal' });
  assert.equal(C.selectTemplates([global, profile], 'profile_1234').length, 2);
  assert.equal(C.selectTemplates([global, profile], 'another_1234').length, 1);
  assert.equal(C.slotTemplates([global, profile], 'profile_1234').get(1).label, 'Personal');
});
test('backup v2 retains profile and forum templates and restores both', async () => {
  const state = defaultState();
  const t = C.createTemplate(input(state.activeProfileId));
  const text = makeFullBackup(state, [t]);
  const parsed = parseFullBackup(text, validateState);
  assert.equal(parsed.templates[0].text, t.text);
  assert.equal(parsed.state.activeProfileId, state.activeProfileId);
  await replaceTemplates([t]);
  assert.equal((await listTemplates()).length, 1);
});
test('legacy backup can be imported without touching templates', () => {
  const state = defaultState();
  const parsed = parseFullBackup(makeBackup(state), validateState);
  assert.equal(parsed.legacy, true);
  assert.equal(parsed.templates.length, 0);
});
test('backup rejects templates attached to missing profiles before writing', () => {
  const state = defaultState();
  const t = C.createTemplate(input('missing_profile_1234'));
  const text = makeFullBackup(state, [t]);
  assert.throws(() => parseFullBackup(text, validateState), /отсутствующим профилем/);
});
test('replaceTemplates enforces unique IDs, leaves existing storage untouched on invalid input', async () => {
  const old = await listTemplates();
  assert.throws(() => C.cleanTemplate({ ...old[0], id: 'INVALID:' }), /ID/);
  await assert.rejects(replaceTemplates([old[0], old[0]]), /Повторяющиеся/);
  assert.deepEqual(await listTemplates(), old);
});
test('delete removes only selected record', async () => {
  const items = await listTemplates();
  await removeTemplate(items[0].id);
  assert.equal((await listTemplates()).length, items.length - 1);
});
