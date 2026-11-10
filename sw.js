/* sw.js — オフライン用キャッシュ + バックグラウンド通知チェック */
importScripts('js/core.js');
const CACHE = 'plantkeeper-v35';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/core.js', 'js/app.js', 'js/db.js', 'js/ui.js', 'js/data.js', 'js/care.js', 'js/plants.js', 'js/soil.js', 'js/memorial.js', 'js/tasks.js', 'js/calendar.js', 'js/home.js', 'js/settings.js', 'js/weather.js', 'js/notify.js', 'js/pwa.js', 'js/guide.js', 'js/theme.js', 'js/search.js', 'assets/grave.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-64.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // addAll は1つでも404だと全体が失敗してSWが入らない(=インストール不可)ため、個別に保存して失敗を無視する
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('.pdf')) return; // PDFはキャッシュしない
  // 天気APIなど外部はキャッシュしない
  // ネットワーク優先 → 失敗時キャッシュ(更新を反映しつつオフライン対応)
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});

/* ── IndexedDB を直接読む(ページが閉じていても動かすため) ── */
function idbAll(db, store) { return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function idbGet(db, store, key) { return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function idbPut(db, store, val) { return new Promise((res, rej) => { const r = db.transaction(store, 'readwrite').objectStore(store).put(val); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }

async function backgroundCheck() {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('plantkeeper', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const [plants, species] = await Promise.all([idbAll(db, 'plants'), idbAll(db, 'species')]);
  const settings = ((await idbGet(db, 'kv', 'settings')) || {}).value || {};
  const notified = ((await idbGet(db, 'kv', 'notified')) || {}).value || {};
  const sp = Object.fromEntries(species.map((s) => [s.id, s]));
  const names = Object.fromEntries(plants.map((p) => [p.id, p.nickname || (sp[p.speciesId] || {}).commonName || '名称未設定']));
  const list = PlantCore.computeDueNotifications(plants, names, settings, notified);
  for (const n of list) { await self.registration.showNotification(n.title, { body: n.text, tag: n.tag, icon: 'icons/icon-192.png' }); for (const k of n.keys) notified[k] = Date.now(); }
  if (list.length) await idbPut(db, 'kv', { key: 'notified', value: notified });
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'plant-check') e.waitUntil(backgroundCheck().catch(() => 0)); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => { for (const c of cs) { if ('focus' in c) return c.focus(); } return self.clients.openWindow('./index.html#/home'); }));
});
