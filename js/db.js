/* Armazenamento local (IndexedDB) — nada sai do seu dispositivo. */
const DB = (() => {
  const NAME = 'leitor-local';
  const VERSION = 1;
  let db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('books')) {
          const s = d.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
          s.createIndex('addedAt', 'addedAt');
          s.createIndex('type', 'type');
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode, fn) {
    return open().then(d => new Promise((resolve, reject) => {
      const t = d.transaction('books', mode);
      const store = t.objectStore('books');
      let out;
      try { out = fn(store); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const all = () => tx('readonly', s => s.getAll());
  const get = (id) => tx('readonly', s => s.get(id));
  const add = (rec) => tx('readwrite', s => s.add(rec));
  const put = (rec) => tx('readwrite', s => s.put(rec));
  const remove = (id) => tx('readwrite', s => s.delete(id));

  return { open, all, get, add, put, remove };
})();
