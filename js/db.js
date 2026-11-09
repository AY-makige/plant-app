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
    // APIキーはバックアップに含めない(共有時の漏えい防止)
    data.stores.kv = data.stores.kv.map((r) => (r.key === 'settings' && r.value && r.value.gemini ? { ...r, value: { ...r.value, gemini: { ...r.value.gemini, key: '' } } } : r));
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

export const DEFAULT_MATERIALS = ['赤玉土', '鹿沼土', '軽石', 'パーライト', 'バーミキュライト', 'バークチップ', 'ココヤシチップ', '培養土', '黒土', '腐葉土', '堆肥', 'ピートモス', 'ミズゴケ', '川砂', 'くん炭', 'ハイドロボール'];
/** 旧名称 → 現在の名称(統合・改名) */
export const MATERIAL_RENAME = { 水苔: 'ミズゴケ', ウッドチップ: 'バークチップ', バーク: 'バークチップ' };
export const MATERIAL_SPRITE = { 赤玉土: 'mat_akadama', 鹿沼土: 'mat_kanuma', 軽石: 'mat_pumice', パーライト: 'mat_perlite', バーミキュライト: 'mat_vermiculite', バークチップ: 'mat_bark', ココヤシチップ: 'mat_cocochip', 培養土: 'mat_potting', 黒土: 'mat_kuroboku', 腐葉土: 'mat_leafmold', 堆肥: 'mat_compost', ピートモス: 'mat_peat', ミズゴケ: 'mat_sphagnum', 川砂: 'mat_sand', くん炭: 'mat_kunthan', ハイドロボール: 'mat_hydroball' };

export async function ensureDefaults() {
  // 標準の用土を初期登録(既存データには不足分だけ追加)。旧名称は改名・統合し、配合レシピ/植え替え履歴の名前も更新
  const mats = await db.all('materials');
  const olds = mats.filter((m) => MATERIAL_RENAME[m.name]);
  if (olds.length) {
    const fix = (mix) => { const acc = new Map(); for (const x of mix || []) { const n = MATERIAL_RENAME[x.material] || x.material; const k = x.parts != null ? 'parts' : 'pct'; const cur = acc.get(n) || { ...x, material: n, [k]: 0 }; cur[k] = (cur[k] || 0) + (Number(x[k]) || 0); acc.set(n, cur); } return [...acc.values()]; };
    for (const m of olds) await db.del('materials', m.id);
    for (const r of await db.all('recipes')) if ((r.mix || []).some((x) => MATERIAL_RENAME[x.material])) await db.put('recipes', { ...r, mix: fix(r.mix) });
    for (const r of await db.all('repots')) if ((r.mix || []).some((x) => MATERIAL_RENAME[x.material])) await db.put('repots', { ...r, mix: fix(r.mix) });
  }
  const left = mats.filter((m) => !MATERIAL_RENAME[m.name]);
  const have = new Set(left.map((m) => m.name));
  for (const name of DEFAULT_MATERIALS) if (!have.has(name)) await db.put('materials', { id: 'm-' + name, name, builtin: true });
  for (const m of left) if (DEFAULT_MATERIALS.includes(m.name) && !m.builtin) await db.put('materials', { ...m, builtin: true });
  if (!(await db.get('kv', 'settings'))) {
    await db.kvSet('settings', { region: null, notify: { enabled: true, time: '08:00', stages: { soon: true, now: true, late: true } }, margin: 3 });
  }
}
export const getSettings = () => db.kvGet('settings', { region: null, notify: { enabled: true, time: '08:00', stages: { soon: true, now: true, late: true } }, margin: 3 });
export const saveSettings = (s) => db.kvSet('settings', s);
