// app.js — ルーター・初期化
import { ensureDefaults, db } from './db.js';
import { h, sprite, empty, toast } from './ui.js';
import { renderHome } from './home.js';
import { renderList, renderDetail, renderForm } from './plants.js';
import { renderCalendar } from './calendar.js';
import { renderTasks } from './tasks.js';
import { renderSoil } from './soil.js';
import { renderMemorial, renderGrave } from './memorial.js';
import { renderSettings } from './settings.js';
import * as N from './notify.js';

const NAV = [
  ['home', 'ホーム', '<path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>'],
  ['plants', '植物図鑑', '<path d="M12 21V11M12 11c0-4 3-7 8-7 0 5-3 8-8 7zM12 14c0-3-2-5-6-5 0 4 2 6 6 5z"/>'],
  ['calendar', 'カレンダー', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  ['tasks', '管理タスク', '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'],
  ['soil', '用土管理', '<path d="M4 20h16M6 20c0-5 2-8 6-8s6 3 6 8M9 12c0-3 1-5 3-7 2 2 3 4 3 7"/>'],
  ['memorial', 'メモリアル', '<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/>'],
];
const svg = (p) => h('span', { class: 'ico', html: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>` });

const routes = [
  [/^#\/home$/, 'home', (r) => renderHome(r)],
  [/^#\/plants$/, 'plants', (r) => renderList(r)],
  [/^#\/plants\/new$/, 'plants', (r) => renderForm(r, null)],
  [/^#\/plants\/([^/]+)\/edit$/, 'plants', (r, m) => renderForm(r, m[1])],
  [/^#\/plants\/([^/]+)$/, 'plants', (r, m) => renderDetail(r, m[1])],
  [/^#\/calendar$/, 'calendar', (r) => renderCalendar(r)],
  [/^#\/tasks$/, 'tasks', (r) => renderTasks(r)],
  [/^#\/soil$/, 'soil', (r) => renderSoil(r)],
  [/^#\/memorial$/, 'memorial', (r) => renderMemorial(r)],
  [/^#\/memorial\/([^/]+)$/, 'memorial', (r, m) => renderGrave(r, m[1])],
  [/^#\/settings$/, 'settings', (r) => renderSettings(r)],
];

let token = 0;
async function route() {
  const hash = location.hash || '#/home';
  const main = document.getElementById('main');
  const my = ++token;
  for (const [re, nav, fn] of routes) {
    const m = hash.match(re); if (!m) continue;
    const tmp = h('div', { class: 'view' });
    try { await fn(tmp, m); } catch (e) { console.error(e); tmp.innerHTML = ''; tmp.append(empty('i_warn', '画面の表示中にエラーが発生しました: ' + e.message)); }
    if (my !== token) return;
    main.replaceChildren(tmp); window.scrollTo(0, 0);
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
    document.body.dataset.route = nav;
    return;
  }
  location.hash = '#/home';
}

async function init() {
  await ensureDefaults();
  const items = NAV.map(([k, l, p]) => h('a', { href: `#/${k}`, 'data-nav': k, class: 'nav-item' }, svg(p), h('span', null, l)));
  document.getElementById('nav').append(...items);
  document.getElementById('side-extra').append(h('a', { href: '#/settings', 'data-nav': 'settings', class: 'nav-item' }, svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'), h('span', null, '設定')));
  document.getElementById('top-settings').href = '#/settings';
  window.addEventListener('hashchange', route);
  await route();

  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* noop */ }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW登録失敗', e));
  }
  const check = () => N.checkAndNotify().catch(() => 0);
  check(); document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 30 * 60000);
  // バックアップ促し(30日)
  const lb = await db.kvGet('lastBackup', null); const plants = await db.all('plants');
  if (plants.length && (!lb || (Date.now() - new Date(lb).getTime()) / 86400000 > 30) && !sessionStorage.getItem('bk')) { sessionStorage.setItem('bk', '1'); setTimeout(() => toast('💾 バックアップが30日以上ありません(設定から保存できます)', 5000), 1500); }
}
init();
