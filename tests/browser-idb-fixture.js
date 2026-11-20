/* In-memory IndexedDB test adapter for Economy browser flows running on about:blank.
 * The scenarios exercise real backup logic; native map persistence is covered
 * separately by browser-tactical-ga-230.py on an HTTP origin. */
(() => {
  const databases = new Map();
  const later = callback => setTimeout(callback, 0);
  function makeDatabase(name) {
    const stores = new Map();
    return {
      createObjectStore(storeName) {
        if (!stores.has(storeName)) stores.set(storeName, new Map());
        return { createIndex() {} };
      },
      close() {},
      transaction(storeName) {
        const rows = stores.get(storeName);
        if (!rows) throw new Error(`IndexedDB fixture store missing: ${storeName}`);
        let pending = 0;
        const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
        const request = operation => {
          const result = { result: undefined, error: null, onsuccess: null, onerror: null };
          pending += 1;
          later(() => {
            try { result.result = operation(); result.onsuccess?.({ target: result }); }
            catch (error) { result.error = error; tx.error = error; result.onerror?.({ target: result }); tx.onerror?.({ target: tx }); }
            finally { if (--pending === 0) later(() => tx.oncomplete?.({ target: tx })); }
          });
          return result;
        };
        tx.objectStore = () => ({
          get: key => request(() => structuredClone(rows.get(key))),
          getAllKeys: () => request(() => [...rows.keys()]),
          getAll: () => request(() => [...rows.values()].map(value => structuredClone(value))),
          put: value => request(() => { rows.set(value.profileId ?? value.id, structuredClone(value)); }),
          delete: key => request(() => { rows.delete(key); }),
          clear: () => request(() => { rows.clear(); })
        });
        return tx;
      }
    };
  }
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: {
      open(name) {
        const result = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        later(() => {
          const isNew = !databases.has(name);
          if (isNew) databases.set(name, makeDatabase(name));
          result.result = databases.get(name);
          if (isNew) result.onupgradeneeded?.({ target: result });
          result.onsuccess?.({ target: result });
        });
        return result;
      }
    }
  });
})();
