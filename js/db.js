// db.js — IndexedDB ラッパ。画像は dataURL としてレコード内に保存(バックアップが容易)。
export const STORES = ['species', 'plants', 'logs', 'repots', 'materials', 'recipes', 'graves', 'kv'];
const DB_NAME = 'plantkeeper', VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
async function store(name, mode = 'readonly') { const db = await open(); return db.transaction(name, mode).objectStore(name); }

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const db = {
  async all(name) { return wrap((await store(name)).getAll()); },
  async get(name, id) { return wrap((await store(name)).get(id)); },
  async put(name, obj) { if (!obj.id && name !== 'kv') obj.id = uid(); await wrap((await store(name, 'readwrite')).put(obj)); return obj; },
  async del(name, id) { return wrap((await store(name, 'readwrite')).delete(id)); },
  async clear(name) { return wrap((await store(name, 'readwrite')).clear()); },
  async kvGet(key, dflt) { const r = await db.get('kv', key); return r ? r.value : dflt; },
  async kvSet(key, value) { return db.put('kv', { key, value }); },
  async byPlant(name, plantId) { return (await db.all(name)).filter((x) => x.plantId === plantId); },
  async exportAll() {
    const data = { app: 'plant-keeper', version: 1, exportedAt: new Date().toISOString(), stores: {} };
    for (const s of STORES) data.stores[s] = await db.all(s);
    return data;
  },
  async importAll(data, mode = 'replace') {
    if (!data || data.app !== 'plant-keeper' || !data.stores) throw new Error('このアプリのバックアップファイルではありません');
    const d = await open();
    for (const s of STORES) {
      const rows = data.stores[s] || [];
      await new Promise((res, rej) => {
        const tx = d.transaction(s, 'readwrite'); const os = tx.objectStore(s);
        if (mode === 'replace') os.clear();
        rows.forEach((r) => os.put(r));
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    }
  },
};

export const DEFAULT_MATERIALS = ['鹿沼土', '赤玉土', '培養土', '軽石', 'パーライト', 'ピートモス', '水苔', '川砂'];
export const MATERIAL_SPRITE = { 鹿沼土: 'soil_kanuma', 赤玉土: 'soil_akadama', 培養土: 'soilbag', 軽石: 'soil_pumice', パーライト: 'soil_perlite', ピートモス: 'soil_peat', 水苔: 'soil_moss', 川砂: 'soil_sand' };

export async function ensureDefaults() {
  const mats = await db.all('materials');
  if (!mats.length) for (const [i, name] of DEFAULT_MATERIALS.entries()) await db.put('materials', { id: 'm-' + i, name, builtin: true });
  if (!(await db.get('kv', 'settings'))) {
    await db.kvSet('settings', { region: null, notify: { enabled: true, offsets: [3, 1, 0], overdue: true }, margin: 3 });
  }
}
export const getSettings = () => db.kvGet('settings', { region: null, notify: { enabled: true, offsets: [3, 1, 0], overdue: true }, margin: 3 });
export const saveSettings = (s) => db.kvSet('settings', s);
