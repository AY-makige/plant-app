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

/** 水やり・施肥の実施を記録し、最終実施日を再計算(=次回予定日を更新) */
export async function recordCare(plant, kind, entry) {
  const log = { id: uid(), plantId: plant.id, kind, date: entry.date || C.today(), time: entry.time || '', amount: entry.amount || '', method: entry.method || '',
    fertType: entry.fertType || '', dilution: entry.dilution || '', note: entry.note || '', dormant: C.isDormant(plant), ts: Date.now() };
  // 液肥を与えたら、水も与えたものとして水やりも同時に記録(次回の水やり予定も更新される)
  if (kind === 'fert') {
    const w = { id: uid(), plantId: plant.id, kind: 'water', date: log.date, time: log.time, amount: C.effWater(plant).amount || '', method: '', fertType: '', dilution: '', note: '液肥と同時', dormant: log.dormant, ts: log.ts + 1, linkedTo: log.id };
    await db.put('logs', w); log.waterLogId = w.id;
  }
  await db.put('logs', log);
  await syncLast(plant.id, kind);
  if (kind === 'fert') await syncLast(plant.id, 'water');
  return log;
}

/** 液肥のスキップ(株の状態を見て今回は与えない)。実施はしていないが、間隔のカウントは今日からやり直す */
export async function recordSkip(plant, date) {
  const log = { id: uid(), plantId: plant.id, kind: 'fert', skipped: true, date: date || C.today(), time: new Date().toTimeString().slice(0, 5), amount: '', method: '', fertType: '', dilution: '', note: 'スキップ(与えず、間隔をリセット)', dormant: C.isDormant(plant), ts: Date.now() };
  await db.put('logs', log); await syncLast(plant.id, 'fert');
  return log;
}

/** ログから最終実施日を再同期(ログ削除時も使う) */
export async function syncLast(plantId, kind) {
  const plant = await db.get('plants', plantId);
  if (!plant) return;
  const logs = (await db.byPlant('logs', plantId)).filter((l) => l.kind === kind).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const key = kind === 'water' ? 'water' : 'fert';
  plant[key] = { ...(plant[key] || {}), last: logs[0] ? logs[0].date : '' };
  if (kind === 'fert' && logs[0]) { plant.fert.type = logs[0].fertType || plant.fert.type; plant.fert.dilution = logs[0].dilution || plant.fert.dilution; plant.fert.amount = logs[0].amount || plant.fert.amount; }
  await db.put('plants', plant);
}

export async function deleteLog(log) {
  await db.del('logs', log.id);
  if (log.waterLogId) await db.del('logs', log.waterLogId); // 液肥と同時に記録した水やりも一緒に消す
  if (log.kind === 'water' || log.kind === 'fert') await syncLast(log.plantId, log.kind);
  if (log.waterLogId) await syncLast(log.plantId, 'water');
}

/** 完全削除(履歴も削除するか選べる) */
export async function deletePlant(id, withHistory = true) {
  if (withHistory) {
    for (const l of await db.byPlant('logs', id)) await db.del('logs', l.id);
    for (const r of await db.byPlant('repots', id)) await db.del('repots', r.id);
  }
  await db.del('plants', id);
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
