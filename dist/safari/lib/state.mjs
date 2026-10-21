import { api } from './browser.mjs';
import { defaultState, validateState } from './model.mjs';
export const STORAGE_KEY = 'rpNexusStateV1';
let pending = Promise.resolve();
export async function loadState() {
  const stored = (await api.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (stored === undefined) {
    const initial = defaultState();
    // Check once more to avoid overwriting a concurrent first-run initializer.
    const recent = (await api.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    if (recent !== undefined) return validateState(recent);
    await api.storage.local.set({ [STORAGE_KEY]: initial });
    return initial;
  }
  return validateState(stored);
}
export function modifyState(fn) {
  const operation = pending.then(async () => {
    const current = await loadState();
    const next = validateState(fn(current));
    await api.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  });
  pending = operation.catch(() => {});
  return operation;
}
export function restoreState(state) { return modifyState(() => validateState(state)); }
