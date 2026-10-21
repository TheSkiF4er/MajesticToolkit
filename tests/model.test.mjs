import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, addProfile, editProfile, deleteProfile, selectProfile, getActiveProfile, savePreferences, makeBackup, parseBackup, validateState, validateProfileForm } from '../src/lib/model.mjs';
const newForm = (name = 'Судья') => ({ name, project: 'majestic', server: 'Seattle', forumUrl: 'https://forum.majestic-rp.ru/threads/123/' });
test('first run has a valid active profile', () => {
  const s = defaultState();
  assert.equal(validateState(s).profiles.length, 1);
  assert.equal(getActiveProfile(s).id, s.activeProfileId);
});
test('create profile selects it and keeps existing profile', () => {
  const s = defaultState(); const n = addProfile(s, newForm());
  assert.equal(s.profiles.length, 1); assert.equal(n.profiles.length, 2);
  assert.equal(getActiveProfile(n).name, 'Судья');
});
test('edit only changes selected profile, retains identifier', () => {
  const s = addProfile(defaultState(), newForm());
  const n = editProfile(s, s.activeProfileId, { ...newForm('Прокурор'), server: 'Detroit' });
  assert.equal(n.profiles[0].name, s.profiles[0].name);
  assert.equal(n.profiles[1].id, s.activeProfileId);
  assert.equal(n.profiles[1].server, 'Detroit');
});
test('deleting active profile selects surviving one', () => {
  const s = addProfile(defaultState(), newForm());
  const n = deleteProfile(s, s.activeProfileId);
  assert.equal(n.activeProfileId, s.profiles[0].id);
  assert.equal(n.profiles.length, 1);
});
test('last profile cannot be deleted', () => {
  const s = defaultState();
  assert.throws(() => deleteProfile(s, s.activeProfileId), /последний/);
});
test('select fails for missing id', () => assert.throws(() => selectProfile(defaultState(), 'missing'), /не найден/));
test('theme and startup view are persisted in state', () => {
  const n = savePreferences(defaultState(), { theme: 'dark', compact: true, startPage: 'sites' });
  assert.equal(n.preferences.theme, 'dark'); assert.equal(n.preferences.compact, true);
  assert.equal(n.preferences.startPage, 'sites');
});
test('backup round-trips profiles and settings', () => {
  const n = savePreferences(addProfile(defaultState(), newForm()), { theme: 'dark' });
  assert.deepEqual(parseBackup(makeBackup(n)), validateState(n));
});
test('broken JSON is rejected without replacing state', () => assert.throws(() => parseBackup('{'), /JSON/));
test('unknown versions are rejected', () => {
  const o = JSON.parse(makeBackup(defaultState())); o.schemaVersion = 77;
  assert.throws(() => parseBackup(JSON.stringify(o)), /формат/);
});
test('duplicate IDs are rejected', () => {
  const s = addProfile(defaultState(), newForm()); s.profiles[1].id = s.profiles[0].id;
  assert.throws(() => validateState(s), /Повторяющийся/);
});
test('backup without matching active profile is rejected', () => {
  const obj = JSON.parse(makeBackup(defaultState())); obj.payload.activeProfileId = 'ghost';
  assert.throws(() => parseBackup(JSON.stringify(obj)), /отсутствует/);
});
test('rejects javascript/data URLs and credentialed URLs', () => {
  for (const forumUrl of ['javascript:alert(1)', 'data:text/html,foo', 'http://example.com', 'https://a:b@host.tld/']) assert.throws(() => validateProfileForm({ ...newForm(), forumUrl }), /HTTPS/);
});
test('rejects overlong and empty form fields', () => {
  assert.throws(() => validateProfileForm({ ...newForm(), name: ' '.repeat(5) }), /длина/);
  assert.throws(() => validateProfileForm({ ...newForm(), name: 'x'.repeat(65) }), /длина/);
});
test('rejects invalid input shape and prototype-bearing extras are discarded', () => {
  const state = defaultState();
  state.profiles[0].metadata = { secret: true };
  const clean = validateState(state);
  assert.equal(Object.hasOwn(clean.profiles[0], 'metadata'), false);
});
test('maximum profile limit is enforced', () => {
  let s = defaultState(); for (let i = 1; i < 100; i++) s = addProfile(s, newForm(`p${i}`));
  assert.throws(() => addProfile(s, newForm('excess')), /Максимум/);
});
test('backup size limit enforced', () => assert.throws(() => parseBackup(' '.repeat(1024 * 1024 + 1)), /слишком/));
