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
import { maybeOfferGuide } from './guide.js';
import { applyAppIcon } from './appicon.js';
import { applyTheme, toggleMode, resolvedMode } from './theme.js';

const NAV = [['home', 'ホーム', 'home'], ['plants', 'ライブラリー', 'plants'], ['tasks', '水やり', 'drop'], ['calendar', 'カレンダー', 'calendar'], ['soil', '用土', 'soil'], ['memorial', 'メモリアル', 'grave']];
const TITLES = Object.fromEntries([...NAV.map(([k, l]) => [k, l]), ['settings', '設定']]);

const routes = [
  [/^#\/home$/, 'home', (r) => renderHome(r)],
  [/^#\/plants$/, 'plants', (r) => renderList(r)],
  [/^#\/plants\/new(?:\?(.*))?$/, 'plants', (r, m) => renderForm(r, null, new URLSearchParams(m[1] || ''))],
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

function themeButtons() {
  const draw = () => document.querySelectorAll('.theme-toggle').forEach((b) => { b.replaceChildren(icon(resolvedMode() === 'dark' ? 'sun' : 'moon', 22), ...(b.classList.contains('nav-item') ? [h('span', null, resolvedMode() === 'dark' ? 'ライトモード' : 'ダークモード')] : [])); b.title = resolvedMode() === 'dark' ? 'ライトモードにする' : 'ダークモードにする'; b.setAttribute('aria-label', b.title); });
  document.querySelectorAll('.theme-toggle').forEach((b) => b.addEventListener('click', toggleMode));
  window.addEventListener('theme-change', draw); draw();
}

async function init() {
  applyTheme();
  await ensureDefaults();
  applyAppIcon();
  const items = NAV.map(([k, l, ic]) => h('a', { href: `#/${k}`, 'data-nav': k, class: 'nav-item' }, icon(ic, 24), h('span', null, l)));
  document.getElementById('nav').append(...items);
  document.getElementById('side-extra').append(h('a', { href: '#/settings', 'data-nav': 'settings', class: 'nav-item' }, icon('settings', 24), h('span', null, '設定')));
  document.getElementById('top-theme').classList.add('theme-toggle');
  document.getElementById('side-extra').append(h('button', { class: 'nav-item theme-toggle', type: 'button' }));
  themeButtons();
  const ts = document.getElementById('top-settings'); ts.href = '#/settings'; ts.append(icon('settings', 24));
  window.addEventListener('hashchange', route);
  window.addEventListener('install-ready', () => { if (['home', 'settings'].includes(document.body.dataset.route)) route(); });
  try { window.PlantCore.setLabels((await db.kvGet('settings', {})).labels); } catch (e) { /* noop */ }
  await route();

  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* noop */ }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => console.warn('SW登録失敗', e));
  }
  setTimeout(maybeOfferGuide, 1200);
  const check = () => N.checkAndNotify().catch(() => 0);
  check(); document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 5 * 60000);
  // バックアップ促し: 3か月(90日)に一度だけ
  const lb = await db.kvGet('lastBackup', null); const plants = await db.all('plants'); const nag = await db.kvGet('backupNag', null);
  const age = (d) => (Date.now() - new Date(d).getTime()) / 86400000;
  if (plants.length && (!lb || age(lb) > 90) && (!nag || age(nag) > 90)) { await db.kvSet('backupNag', window.PlantCore.today()); setTimeout(() => toast('💾 バックアップを取って3か月以上たちました(設定から保存できます)', 5000), 1500); }
}
init();
