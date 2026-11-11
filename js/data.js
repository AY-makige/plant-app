// data.js — データ操作(登録・実施記録・削除・メモリアル移動)
import { db, uid, getSettings } from './db.js';
import { plantNames } from './notify.js';
const C = window.PlantCore;

export async function loadCtx() {
  const [plants, species] = await Promise.all([db.all('plants'), db.all('species')]);
  const names = plantNames(plants, species);
  const sp = Object.fromEntries(species.map((s) => [s.id, s]));
  plants.sort((a, b) => names[a.id].localeCompare(names[b.id], 'ja'));
  plants.forEach((p) => Object.defineProperty(p, '__name', { value: names[p.id], enumerable: false }));
  return { plants, species, sp, names };
}

/** logs から kind の最終実施日を plant に反映(plant を直接書き換える。DBには書かない) */
function applyLast(plant, logs, kind) {
  const ls = logs.filter((l) => l.kind === kind).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const key = kind === 'water' ? 'water' : 'fert';
  plant[key] = { ...(plant[key] || {}), last: ls[0] ? ls[0].date : '' };
  if (kind === 'fert' && ls[0]) { plant.fert.type = ls[0].fertType || plant.fert.type; plant.fert.dilution = ls[0].dilution || plant.fert.dilution; plant.fert.amount = ls[0].amount || plant.fert.amount; }
}

/** 水やり・施肥の実施を記録し、最終実施日を再計算(=次回予定日を更新)。
 *  液肥は「水も与えたもの」として水やりも同時に記録する。履歴と植物の最終日は1つのトランザクションで保存(途中失敗なら全部なし) */
export async function recordCare(plant, kind, entry) {
  const log = { id: uid(), plantId: plant.id, kind, date: entry.date || C.today(), time: entry.time || '', amount: entry.amount || '', method: entry.method || '',
    fertType: entry.fertType || '', dilution: entry.dilution || '', note: entry.note || '', dormant: C.isDormant(plant), ts: Date.now() };
  let w = null;
  const hasWater = kind === 'fert' && (await db.byPlant('logs', plant.id)).some((l) => l.kind === 'water' && l.date === log.date && !l.skipped); // その日すでに水やり済みなら、同時記録は作らない
  if (kind === 'fert' && !hasWater) {
    w = { id: uid(), plantId: plant.id, kind: 'water', date: log.date, time: log.time, amount: C.effWater(plant).amount || '', method: '', fertType: '', dilution: '', note: '液肥と同時', dormant: log.dormant, ts: log.ts + 1, linkedTo: log.id };
    log.waterLogId = w.id;
  }
  const fresh = (await db.get('plants', plant.id)) || plant;
  const all = (await db.byPlant('logs', plant.id)).concat(w ? [log, w] : [log]);
  applyLast(fresh, all, kind); if (w) applyLast(fresh, all, 'water');
  await db.atomic(['logs', 'plants'], (st) => { st('logs').put(log); if (w) st('logs').put(w); st('plants').put(fresh); });
  plant.water = fresh.water; plant.fert = fresh.fert;
  return log;
}

/** 液肥のスキップ(株の状態を見て今回は与えない)。実施はしていないが、間隔のカウントは今日からやり直す */
export async function recordSkip(plant, date) {
  const log = { id: uid(), plantId: plant.id, kind: 'fert', skipped: true, date: date || C.today(), time: new Date().toTimeString().slice(0, 5), amount: '', method: '', fertType: '', dilution: '', note: 'スキップ(与えず、間隔をリセット)', dormant: C.isDormant(plant), ts: Date.now() };
  const fresh = (await db.get('plants', plant.id)) || plant;
  applyLast(fresh, (await db.byPlant('logs', plant.id)).concat([log]), 'fert');
  await db.atomic(['logs', 'plants'], (st) => { st('logs').put(log); st('plants').put(fresh); });
  plant.fert = fresh.fert;
  return log;
}


/** ログから最終実施日を再同期 */
export async function syncLast(plantId, kind) {
  const plant = await db.get('plants', plantId);
  if (!plant) return;
  applyLast(plant, await db.byPlant('logs', plantId), kind);
  await db.put('plants', plant);
}

/** 履歴の削除(1トランザクション)。
 *  ・液肥の履歴を消す → 同時記録の水やりも一緒に消える
 *  ・同時記録の水やりだけを消す → 液肥の履歴は残り(液肥は別の実施記録)、液肥側の紐づけだけ外す
 *  ・消したあと、最終実施日を再計算する */
export async function deleteLog(log) {
  const logs = await db.byPlant('logs', log.plantId);
  const cur = logs.find((l) => l.id === log.id) || log;
  const gone = new Set([cur.id]); if (cur.waterLogId) gone.add(cur.waterLogId);
  const rest = logs.filter((l) => !gone.has(l.id));
  const unlink = cur.linkedTo ? rest.find((l) => l.id === cur.linkedTo && l.waterLogId === cur.id) : null;
  if (unlink) unlink.waterLogId = '';
  const plant = await db.get('plants', log.plantId);
  if (plant) { for (const k of new Set([cur.kind, cur.waterLogId ? 'water' : null].filter((x) => x === 'water' || x === 'fert'))) applyLast(plant, rest, k); }
  await db.atomic(['logs', 'plants'], (st) => { for (const id of gone) st('logs').delete(id); if (unlink) st('logs').put(unlink); if (plant) st('plants').put(plant); });
}

/** 植物の完全削除(1トランザクション)。途中で失敗しても一部だけ消えることはない */
export async function deletePlant(id, withHistory = true) {
  const logs = withHistory ? await db.byPlant('logs', id) : [], repots = withHistory ? await db.byPlant('repots', id) : [];
  await db.atomic(['logs', 'repots', 'plants'], (st) => { logs.forEach((l) => st('logs').delete(l.id)); repots.forEach((r) => st('repots').delete(r.id)); st('plants').delete(id); });
}

/** データの点検(読み取りのみ)。孤立した履歴・切れた紐づけを数える */
export async function checkIntegrity() {
  const [plants, logs, repots] = await Promise.all([db.all('plants'), db.all('logs'), db.all('repots')]);
  const pid = new Set(plants.map((p) => p.id)); const lid = new Set(logs.map((l) => l.id));
  return {
    orphanLogs: logs.filter((l) => !pid.has(l.plantId)),
    orphanRepots: repots.filter((r) => !pid.has(r.plantId)),
    brokenLinks: logs.filter((l) => pid.has(l.plantId) && ((l.waterLogId && !lid.has(l.waterLogId)) || (l.linkedTo && !lid.has(l.linkedTo)))),
  };
}
/** 切れた紐づけだけを外す(履歴は消さない) */
export async function repairLinks(rep) {
  await db.atomic(['logs'], (st) => { for (const l of rep.brokenLinks) { const n = { ...l }; if (n.waterLogId) n.waterLogId = ''; if (n.linkedTo) n.linkedTo = ''; st('logs').put(n); } });
}
/** 持ち主のいない履歴を削除(呼び出し側で確認とバックアップを済ませてから) */
export async function removeOrphans(rep) {
  await db.atomic(['logs', 'repots'], (st) => { rep.orphanLogs.forEach((l) => st('logs').delete(l.id)); rep.orphanRepots.forEach((r) => st('repots').delete(r.id)); });
}

/** 枯死 → メモリアルへ移動(通常一覧から除外。履歴はスナップショットとして保持) */
export async function buryPlant(plant, species, info, names) {
  const cur = await db.get('plants', plant.id);
  if (!cur) throw new Error('この植物はすでにメモリアルへ移動済みか、削除されています');
  if ((await db.all('graves')).some((g) => g.plant && g.plant.id === plant.id)) throw new Error('この植物はすでにメモリアルに登録されています');
  const start = C.purchaseMin(cur);
  if (start && info.deathDate && info.deathDate < start) throw new Error('枯死日が購入(入手)日より前になっています');
  const logs = (await db.byPlant('logs', plant.id)).sort((a, b) => b.date.localeCompare(a.date));
  const repots = (await db.byPlant('repots', plant.id)).sort((a, b) => b.date.localeCompare(a.date));
  const grave = {
    id: uid(), name: names[plant.id], plant: cur, species: species || null, photo: info.photo || cur.photo || '', sprite: cur.sprite || '',
    deathDate: info.deathDate, causes: info.causes, causeNote: info.causeNote, env: info.env, epitaph: info.epitaph || '', lastCare: logs, repots, notes: info.notes, createdAt: Date.now(),
  };
  // お墓の作成 + 履歴・植物の削除を1回で行う(途中で失敗しても履歴だけ消える事態を防ぐ)
  await db.atomic(['graves', 'logs', 'repots', 'plants'], (st) => {
    st('graves').put(grave);
    logs.forEach((l) => st('logs').delete(l.id)); repots.forEach((r) => st('repots').delete(r.id));
    st('plants').delete(plant.id);
  });
  return grave;
}

/** メモリアルから所持植物へ戻す(誤操作用)。個体ID・写真・履歴をそのまま復元 */
export async function reviveGrave(grave) {
  if (!(await db.get('graves', grave.id))) throw new Error('この記録はすでに戻されたか、削除されています');
  if (await db.get('plants', grave.plant.id)) throw new Error('同じ植物がすでに所持植物にあります');
  const plant = { ...grave.plant };
  const needSp = grave.species && !(await db.get('species', grave.species.id));
  await db.atomic(['plants', 'species', 'logs', 'repots', 'graves'], (st) => {
    st('plants').put(plant); if (needSp) st('species').put(grave.species);
    (grave.lastCare || []).forEach((l) => st('logs').put(l)); (grave.repots || []).forEach((r) => st('repots').put(r));
    st('graves').delete(grave.id);
  });
  return plant;
}

/** 場所のお知らせ「移動する」: 今の場所を今季の管理場所に合わせる */
export async function moveToSeasonLoc(p) { p.nowLoc = C.effLocation(p) || p.nowLoc; p.locSnooze = ''; await db.put('plants', p); }
/** 場所のお知らせをまとめて処理(季節の境目用)。mode: 'move' | 'snooze' */
export async function bulkLoc(plants, mode) {
  const s = await getSettings(); const n = Math.max(1, Math.min(60, Math.round(Number(s.locDays) || 3)));
  await db.atomic(['plants'], (st) => { for (const p of plants) {
    if (mode === 'move') { p.nowLoc = C.effLocation(p) || p.nowLoc; p.locSnooze = ''; } else p.locSnooze = C.addDays(C.today(), n);
    st('plants').put(p); } });
  return n;
}
/** 「まだ大丈夫」: 今回はスキップ。3日後にもう一度お知らせ */
export async function snoozeLocNotice(p) { const s = await getSettings(); const n = Math.max(1, Math.min(60, Math.round(Number(s.locDays) || 3))); p.locSnooze = C.addDays(C.today(), n); await db.put('plants', p); return n; }
