// data.js — データ操作(登録・実施記録・削除・メモリアル移動)
import { db, uid } from './db.js';
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
  const logs = (await db.byPlant('logs', plant.id)).sort((a, b) => b.date.localeCompare(a.date));
  const repots = (await db.byPlant('repots', plant.id)).sort((a, b) => b.date.localeCompare(a.date));
  const grave = {
    id: uid(), name: names[plant.id], plant, species: species || null, photo: info.photo || plant.photo || '', sprite: plant.sprite || '',
    deathDate: info.deathDate, causes: info.causes, causeNote: info.causeNote, env: info.env, lastCare: logs, repots, notes: info.notes, createdAt: Date.now(),
  };
  await db.put('graves', grave);
  for (const l of logs) await db.del('logs', l.id);
  for (const r of repots) await db.del('repots', r.id);
  await db.del('plants', plant.id);
  return grave;
}

/** メモリアルから所持植物へ戻す(誤操作用) */
export async function reviveGrave(grave) {
  const plant = { ...grave.plant };
  await db.put('plants', plant);
  if (grave.species && !(await db.get('species', grave.species.id))) await db.put('species', grave.species);
  for (const l of grave.lastCare || []) await db.put('logs', l);
  for (const r of grave.repots || []) await db.put('repots', r);
  await db.del('graves', grave.id);
  return plant;
}
