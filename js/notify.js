// notify.js — 通知(ブラウザ/OS通知)。Web Push サーバー無しで動く範囲を実装:
//  ①アプリを開いた時/表示された時にチェック  ②Periodic Background Sync(対応ブラウザのみ、インストール済みPWA)
import { db, getSettings } from './db.js';
const C = window.PlantCore;

export const supported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!supported()) return 'unsupported';
  const r = await Notification.requestPermission();
  if (r === 'granted') await registerPeriodic();
  return r;
}

export async function registerPeriodic() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (st.state === 'granted') { await reg.periodicSync.register('plant-check', { minInterval: 12 * 3600 * 1000 }); return true; }
    }
  } catch (e) { /* 非対応 */ }
  return false;
}

export function plantNames(plants, speciesList) {
  const sp = Object.fromEntries(speciesList.map((s) => [s.id, s]));
  const names = {}; const count = {};
  for (const p of plants) { const base = p.nickname || (sp[p.speciesId] && sp[p.speciesId].commonName) || '名称未設定'; count[base] = (count[base] || 0) + 1; names[p.id] = base; }
  return names;
}

/** 今送るべき通知を送る(重複は kv.notified で抑止) */
export async function checkAndNotify() {
  if (permission() !== 'granted') return 0;
  const [plants, species, settings] = await Promise.all([db.all('plants'), db.all('species'), getSettings()]);
  const notified = await db.kvGet('notified', {});
  const list = C.computeDueNotifications(plants, plantNames(plants, species), settings, notified);
  if (!list.length) return 0;
  const reg = await navigator.serviceWorker.ready;
  for (const n of list) {
    await reg.showNotification('植物管理', { body: n.text, tag: n.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    notified[n.key] = Date.now();
  }
  // 古い記録の掃除(60日)
  for (const k of Object.keys(notified)) if (Date.now() - notified[k] > 60 * 86400000) delete notified[k];
  await db.kvSet('notified', notified);
  return list.length;
}

export async function testNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('植物管理', { body: 'テスト通知です。この表示が出れば通知は有効です。', icon: 'icons/icon-192.png' });
}
