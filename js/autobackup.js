// autobackup.js — 端末内フォルダへの自動バックアップ(File System Access API)と、バックアップの定期リマインド
import { db } from './db.js';
const C = () => window.PlantCore;
const DIR = '植物管理バックアップ';
export const supported = () => typeof window.showDirectoryPicker === 'function';
const DEFAULT = { enabled: false, days: 7, keep: 10 };
export const getCfg = async () => ({ ...DEFAULT, ...(await db.kvGet('autoBackup', {})) });
const saveCfg = (c) => db.kvSet('autoBackup', c);
const getHandle = async () => { const r = await db.kvGet('backupDir', null); return r && r.handle ? r : null; };
export const folderName = async () => { const r = await getHandle(); return r ? r.name : ''; };
const ageDays = (d) => (d ? (Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000 : Infinity);

/** 最後にバックアップした日(手動の書き出し・フォルダ自動のうち新しい方) */
export async function lastAny() {
  const a = await db.kvGet('lastBackup', null), b = await db.kvGet('lastAutoBackup', null);
  return [a, b].filter(Boolean).sort().pop() || null;
}
/** バックアップを促す必要があるか: { days: 経過日数|null(未実施) } か null */
export async function reminderState() {
  const s = await db.kvGet('settings', {}); const lim = Number(s.backupDays) || 30;
  if (!(await db.all('plants')).length) return null;
  const snz = await db.kvGet('backupSnooze', null); if (snz && snz > C().today()) return null;
  const last = await lastAny(); const d = ageDays(last);
  return d >= lim ? { days: last ? Math.floor(d) : null, limit: lim } : null;
}
export const snoozeReminder = (n = 3) => db.kvSet('backupSnooze', C().addDays(C().today(), n));

/** フォルダを選ぶ(ユーザー操作の中で呼ぶ)。選んだ場所の中に専用フォルダを作る */
export async function chooseFolder() {
  const parent = await window.showDirectoryPicker({ id: 'plant-backup', mode: 'readwrite' });
  const sub = await parent.getDirectoryHandle(DIR, { create: true });
  await db.kvSet('backupDir', { handle: sub, name: `${parent.name}/${DIR}` });
  const c = await getCfg(); await saveCfg({ ...c, enabled: true });
  return `${parent.name}/${DIR}`;
}
export async function disable() { const c = await getCfg(); await saveCfg({ ...c, enabled: false }); await db.del('kv', 'backupDir'); }
export const setOptions = async (o) => saveCfg({ ...(await getCfg()), ...o });

async function perm(handle, ask) {
  const o = { mode: 'readwrite' };
  if ((await handle.queryPermission(o)) === 'granted') return true;
  return ask ? (await handle.requestPermission(o)) === 'granted' : false;
}
/** フォルダへ保存。ask=true(ボタン操作)のときは権限を確認する。戻り値: {ok, reason, file} */
export async function backupNow(ask = false) {
  const r = await getHandle(); if (!r) return { ok: false, reason: 'nofolder' };
  try {
    if (!(await perm(r.handle, ask))) return { ok: false, reason: 'permission' };
    const data = await db.exportAll(); const name = `plant-backup-${C().today()}.json`;
    const fh = await r.handle.getFileHandle(name, { create: true }); const w = await fh.createWritable();
    await w.write(JSON.stringify(data)); await w.close();
    await db.kvSet('lastAutoBackup', C().today());
    // 古いものを整理(自動で作った plant-backup-日付.json だけが対象)
    const cfg = await getCfg(); const names = [];
    for await (const [n, h] of r.handle.entries()) if (h.kind === 'file' && /^plant-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)) names.push(n);
    names.sort().reverse(); for (const n of names.slice(Math.max(1, cfg.keep))) { try { await r.handle.removeEntry(n); } catch (e) { /* noop */ } }
    return { ok: true, file: name };
  } catch (e) { return { ok: false, reason: 'error', message: e.message }; }
}
/** 起動時: 設定した間隔が過ぎていたら静かに自動バックアップ。権限が切れていたら 'permission' を返す */
export async function runIfDue() {
  if (!supported()) return null; const c = await getCfg(); if (!c.enabled) return null;
  const last = await db.kvGet('lastAutoBackup', null);
  if (ageDays(last) < c.days) return null;
  if (!(await db.all('plants')).length) return null;
  return backupNow(false);
}
