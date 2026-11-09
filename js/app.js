// app.js — ルーター・初期化
import { ensureDefaults, db } from './db.js';
import { h, sprite, empty, toast, icon } from './ui.js';
import { renderHome } from './home.js';
import { renderList, renderDetail, renderForm } from './plants.js';
import { renderCalendar } from './calendar.js';
import { renderTasks } from './tasks.js';
import { renderSoil } from './soil.js';
import { renderMemorial, renderGrave } from './memorial.js';
import { renderSettings } from './settings.js';
import * as N from './notify.js';

const NAV = [['home', 'ホーム', 'home'], ['plants', '植物図鑑', 'plants'], ['calendar', 'カレンダー', 'calendar'], ['tasks', 'タスク', 'tasks'], ['soil', '用土', 'soil'], ['memorial', 'メモリアル', 'grave']];
const TITLES = Object.fromEntries([...NAV.map(([k, l]) => [k, l]), ['settings', '設定']]);

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
    document.body.dataset.route = nav; document.getElementById('top-title').textContent = TITLES[nav] || '植物管理'; main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
    return;
  }
  location.hash = '#/home';
}

async function init() {
  await ensureDefaults();
  const items = NAV.map(([k, l, ic]) => h('a', { href: `#/${k}`, 'data-nav': k, class: 'nav-item' }, icon(ic, 24), h('span', null, l)));
  document.getElementById('nav').append(...items);
  document.getElementById('side-extra').append(h('a', { href: '#/settings', 'data-nav': 'settings', class: 'nav-item' }, icon('settings', 24), h('span', null, '設定')));
  const ts = document.getElementById('top-settings'); ts.href = '#/settings'; ts.append(icon('settings', 24));
  window.addEventListener('hashchange', route);
  window.addEventListener('install-ready', () => { if (['home', 'settings'].includes(document.body.dataset.route)) route(); });
  await route();

  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* noop */ }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => console.warn('SW登録失敗', e));
  }
  const check = () => N.checkAndNotify().catch(() => 0);
  check(); document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 30 * 60000);
  // バックアップ促し(30日)
  const lb = await db.kvGet('lastBackup', null); const plants = await db.all('plants');
  if (plants.length && (!lb || (Date.now() - new Date(lb).getTime()) / 86400000 > 30) && !sessionStorage.getItem('bk')) { sessionStorage.setItem('bk', '1'); setTimeout(() => toast('💾 バックアップが30日以上ありません(設定から保存できます)', 5000), 1500); }
}
init();
