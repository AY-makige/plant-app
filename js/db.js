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

let importing = false;
/** バックアップJSONの検証(DBは書き換えない)。問題があれば Error、軽微な不整合は warnings で返す */
export function validateBackup(data) {
  const bad = (m) => { throw new Error('バックアップを復元できません: ' + m); };
  if (!data || typeof data !== 'object' || data.app !== 'plant-keeper') bad('このアプリのバックアップファイルではありません');
  if (data.version != null && (typeof data.version !== 'number' || data.version > 1)) bad('新しい版のアプリで作られたファイルです(version ' + data.version + ')');
  if (!data.stores || typeof data.stores !== 'object') bad('データ本体(stores)がありません');
  const counts = {}; const warnings = [];
  for (const s of STORES) {
    const rows = data.stores[s]; if (rows === undefined) continue;
    if (!Array.isArray(rows)) bad(`「${s}」の形式が正しくありません`);
    const key = s === 'kv' ? 'key' : 'id';
    const seen = new Set();
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) bad(`「${s}」の ${i + 1} 件目が正しくありません`);
      if (typeof r[key] !== 'string' || !r[key]) bad(`「${s}」の ${i + 1} 件目に ${key} がありません`);
      if (seen.has(r[key])) bad(`「${s}」に重複した ${key} があります`); seen.add(r[key]);
    });
    counts[s] = rows.length;
  }
  if (!Array.isArray(data.stores.plants) || !Array.isArray(data.stores.species)) bad('植物(plants)または種類(species)のデータがありません');
  const pids = new Set(data.stores.plants.map((p) => p.id)), sids = new Set(data.stores.species.map((x) => x.id));
  const orphanLogs = [...(data.stores.logs || []), ...(data.stores.repots || [])].filter((l) => !pids.has(l.plantId)).length;
  const orphanSp = data.stores.plants.filter((p) => p.speciesId && !sids.has(p.speciesId)).length;
  if (orphanLogs) warnings.push(`持ち主の植物が見つからない記録が ${orphanLogs} 件あります(そのまま復元します)`);
  if (orphanSp) warnings.push(`種類が見つからない植物が ${orphanSp} 件あります(そのまま復元します)`);
  return { counts, warnings };
}

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
    data.stores.kv = data.stores.kv.filter((r) => r.key !== 'backupDir'); // フォルダのハンドルは書き出せない
    data.stores.kv = data.stores.kv.map((r) => (r.key === 'settings' && r.value && r.value.gemini ? { ...r, value: { ...r.value, gemini: { ...r.value.gemini, key: '' } } } : r));
    return data;
  },
  /** 複数ストアへの書き込みを1つのトランザクションで行う(途中で失敗したら全部取り消し)。fn は同期的に put/delete を発行する */
  async atomic(names, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const tx = d.transaction(names, 'readwrite'); let out;
      tx.oncomplete = () => res(out);
      tx.onerror = () => rej(tx.error || new Error('保存に失敗しました'));
      tx.onabort = () => rej(tx.error || new Error('保存を中止しました(変更は反映されていません)'));
      try { out = fn((n) => tx.objectStore(n)); } catch (e) { try { tx.abort(); } catch (e2) { /* noop */ } rej(e); }
    });
  },
  /** バックアップを復元。検証 → 全ストアを1トランザクションで置き換え。失敗時は何も変更されない */
  async importAll(data, mode = 'replace') {
    if (importing) throw new Error('別の復元処理が実行中です');
    const info = validateBackup(data); importing = true;
    const keepDir = await db.get('kv', 'backupDir').catch(() => null);
    try {
      await db.atomic(STORES, (st) => {
        for (const s of STORES) {
          if (!Array.isArray(data.stores[s])) continue; // ファイルに無いストアは現在のデータを残す
          const os = st(s); if (mode === 'replace') os.clear();
          data.stores[s].forEach((r) => os.put(r));
        }
      });
      if (keepDir && mode === 'replace') await db.put('kv', keepDir).catch(() => 0); // 自動バックアップ先の設定は復元しても残す
      return info;
    } finally { importing = false; }
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
export const DEFAULT_TEMPS = { outdoorMin: 5, highTemp: 35 };
export async function getSettings() {
  const s = await db.kvGet('settings', { region: null, notify: { enabled: true, time: '08:00', stages: { soon: true, now: true, late: true } }, margin: 3 });
  if (!s.temps) { // 以前の「株ごとの温度設定」から、いちばん多い値を全体設定として引き継ぐ(無ければ初期値)
    const plants = await db.all('plants').catch(() => []); const t = { ...DEFAULT_TEMPS };
    for (const k of Object.keys(t)) { const cnt = new Map(); plants.forEach((p) => { const x = p[k]; if (x !== '' && x != null && !isNaN(Number(x))) cnt.set(Number(x), (cnt.get(Number(x)) || 0) + 1); }); const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]; if (top) t[k] = top[0]; }
    s.temps = t; await db.kvSet('settings', s);
  }
  return s;
}
export const saveSettings = (s) => db.kvSet('settings', s);
