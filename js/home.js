// home.js — ホーム(今日の進捗・温度警告・タスク・天気・休眠期の植物)
import { h, sprite, toast, fmtShort, WD, MONTHS, icon, C } from './ui.js';
import { db, getSettings } from './db.js';
import { loadCtx } from './data.js';
import { fetchForecast, fetchClimate, wmo } from './weather.js';
import { taskRow } from './tasks.js';
import { avatar } from './plants.js';
import * as N from './notify.js';
import { canPrompt, promptInstall, isStandalone } from './pwa.js';

const t1 = (v) => (v == null ? '—' : `${Math.round(v * 10) / 10}`);
const greet = () => { const hr = new Date().getHours(); return hr < 5 ? 'おつかれさまです' : hr < 11 ? 'おはようございます' : hr < 18 ? 'こんにちは' : 'こんばんは'; };

function ring(done, total) {
  const pct = total ? done / total : 1, R = 34, L = 2 * Math.PI * R;
  return h('div', { class: 'ring', html: `<svg viewBox="0 0 80 80" width="84" height="84" aria-hidden="true"><circle cx="40" cy="40" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="9"/><circle cx="40" cy="40" r="${R}" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - pct)}" transform="rotate(-90 40 40)"/></svg><span>${total ? `${done}/${total}` : '✓'}</span>` });
}
const section = (title, ...kids) => h('section', { class: 'sec-block' }, h('h2', { class: 'sec-title' }, title), kids);

export async function renderHome(root) {
  const [ctx, settings, logs] = await Promise.all([loadCtx(), getSettings(), db.all('logs')]);
  const rerender = () => { const y = window.scrollY; root.innerHTML = ''; renderHome(root).then(() => window.scrollTo(0, y)); };
  const now = new Date(); const t0 = C.today();
  const tasks = C.buildTasks(ctx.plants, ctx.names);
  const today = tasks.filter((t) => t.daysLeft <= 0), soon = tasks.filter((t) => t.daysLeft > 0 && t.daysLeft <= 7);
  const doneToday = logs.filter((l) => l.date === t0 && ctx.names[l.plantId]).length;
  const total = today.length + doneToday;
  const dorm = ctx.plants.filter((p) => C.isDormant(p));
  const alerts = h('div', { class: 'alerts' });
  const nWater = today.filter((t) => t.kind === 'water').length, nFert = today.filter((t) => t.kind === 'fert').length;
  const warnStat = h('a', { class: 'stat', href: '#/home' }, h('b', null, '–'), h('span', null, '温度警告'));

  root.append(h('div', { class: 'hero-card' },
    h('div', { class: 'hero-text' }, h('small', null, `${now.getMonth() + 1}月${now.getDate()}日(${WD[now.getDay()]})`), h('h1', null, greet()),
      h('p', null, !ctx.plants.length ? 'まず植物を登録しましょう' : total === 0 ? '今日のお世話はありません' : doneToday === total ? '今日のお世話は完了です 🌿' : `あと ${today.length} 件のお世話があります`)),
    ring(doneToday, total)),
  h('div', { class: 'stats' },
    h('a', { class: 'stat', href: '#/tasks' }, h('b', null, nWater), h('span', null, '水やり待ち')),
    h('a', { class: 'stat', href: '#/tasks' }, h('b', null, nFert), h('span', null, '施肥待ち')),
    warnStat, h('a', { class: 'stat', href: '#/plants' }, h('b', null, dorm.length), h('span', null, '休眠中'))));

  if (N.permission() === 'default') root.append(h('div', { class: 'banner' }, h('span', null, '通知を有効にすると、水やり・施肥の予定をお知らせします。'), h('button', { class: 'btn small primary', onclick: async () => { const r = await N.requestPermission(); toast(r === 'granted' ? '通知を有効にしました' : '通知は許可されませんでした(ホーム画面では予定を確認できます)'); rerender(); } }, '許可する')));
  if (canPrompt() && !isStandalone() && !sessionStorage.getItem('instHide')) root.append(h('div', { class: 'banner' }, h('span', null, 'ホーム画面に追加すると、アプリのように使えます。'), h('div', { class: 'row gap' }, h('button', { class: 'btn small primary', onclick: async () => { await promptInstall(); rerender(); } }, 'インストール'), h('button', { class: 'icon-btn sm', 'aria-label': '閉じる', onclick: () => { sessionStorage.setItem('instHide', '1'); rerender(); } }, '×'))));
  root.append(alerts);

  /* 今日のタスク */
  root.append(section(`今日のタスク${today.length ? ` (${today.length})` : ''}`,
    today.length ? today.map((t) => taskRow(ctx, t, rerender)) : h('div', { class: 'empty-s' }, sprite(ctx.plants.length ? 'i_check' : 'terrarium', 'med'), h('p', null, ctx.plants.length ? '今日やることはありません' : '植物がまだ登録されていません'), !ctx.plants.length ? h('a', { class: 'btn primary', href: '#/plants/new' }, '植物を登録') : null)));

  /* 天気 */
  const wx = h('div', { class: 'card wx' });
  root.append(section('地域の天気', wx));
  if (!settings.region) {
    wx.append(h('p', { class: 'muted' }, '市区町村を登録すると、現在の気温・週間予報・植物ごとの温度警告が表示されます。'), h('a', { class: 'btn primary small', href: '#/settings' }, '地域を設定する'));
    warnStat.querySelector('b').textContent = '—';
  } else {
    wx.append(h('p', { class: 'muted' }, '天気を取得中…'));
    fetchForecast(settings.region).then((f) => {
      drawWeather(wx, f, settings, rerender);
      const ws = C.computeWarnings(ctx.plants, ctx.names, f.daily, settings.margin, settings.temps);
      warnStat.querySelector('b').textContent = ws.length; if (ws.length) warnStat.classList.add('alert');
      drawAlerts(alerts, ws);
    }).catch((e) => {
      wx.innerHTML = ''; wx.append(h('p', { class: 'warn caution' }, '天気を取得できませんでした(オフライン、またはAPIに接続できません)。'), h('small', { class: 'muted' }, String(e.message)), h('button', { class: 'btn small', onclick: rerender }, '再試行'));
    });
  }

  root.append(section('近日中の予定(7日以内)', soon.length ? soon.map((t) => taskRow(ctx, t, rerender)) : h('div', { class: 'card' }, h('p', { class: 'muted' }, '予定はありません'))));

  if (dorm.length) root.append(section('休眠期の植物', h('div', { class: 'chips' }, dorm.map((p) => h('a', { class: 'pill big', href: `#/plants/${p.id}` }, avatar(p, 'mini'), ctx.names[p.id])))));

  /* 今月のヒント */
  const mo = now.getMonth() + 1; const hints = [];
  for (const p of ctx.plants) { const c = (ctx.sp[p.speciesId] || {}).cycle || {};
    if ((c.dormant || []).includes(mo) && !C.isDormant(p)) hints.push([p, `${mo}月は休眠期の設定です。休眠期モードに切り替えますか?`]);
    else if ((c.growth || []).includes(mo) && C.isDormant(p)) hints.push([p, `${mo}月は成長期の設定です。成長期に戻しますか?`]);
    if ((c.repot || []).includes(mo)) hints.push([p, `${mo}月は植え替え推奨時期です`]);
    if ((c.fertSlow || []).includes(mo)) hints.push([p, `${mo}月は追肥(遅効性肥料)の推奨時期です`]);
    if ((c.fertLiquid || []).includes(mo)) hints.push([p, `${mo}月は液肥の推奨時期です`]);
    if ((c.bloom || []).includes(mo)) hints.push([p, `${mo}月は開花予定時期です`]); }
  if (hints.length) root.append(section('今月のヒント', h('div', { class: 'card' }, hints.slice(0, 12).map(([p, t]) => h('a', { class: 'hint-row', href: `#/plants/${p.id}` }, avatar(p, 'mini'), h('span', null, h('strong', null, ctx.names[p.id]), h('br'), t), icon('chevron', 18))))));
}

function drawAlerts(box, ws) {
  box.innerHTML = '';
  if (!ws.length) return;
  const worst = ws[0].level;
  box.append(h('details', { class: 'alert-card ' + worst, open: worst === 'urgent' || worst === 'warning' },
    h('summary', null, icon('thermo', 22), h('strong', null, `温度警告 ${ws.length}件`), h('span', { class: 'sm-note' }, '週間予報と設定温度の比較')),
    ws.map((w) => h('div', { class: 'warn-row ' + w.level }, h('span', { class: 'lv' }, w.label), h('div', null, h('a', { href: `#/plants/${w.plantId}` }, w.name), h('div', { class: 'muted' }, `${w.msg}(${fmtShort(w.date)})`)))),
    h('p', { class: 'note' }, '※ 温度警告は栽培判断の補助です。風・鉢内温度・日当たり・植物の状態も考慮して、屋外管理を続けるか室内へ移すか判断してください。')));
}

function drawWeather(wx, f, settings, rerender) {
  wx.innerHTML = '';
  const [label, ic] = wmo(f.current.code);
  const maxs = f.daily.map((d) => d.tmax), mins = f.daily.map((d) => d.tmin);
  wx.append(
    f.stale ? h('p', { class: 'warn caution' }, 'オフラインのため前回取得した予報を表示しています') : null,
    h('div', { class: 'wx-now' }, sprite(ic, 'wxi'), h('div', null, h('div', { class: 'temp' }, `${t1(f.current.temp)}℃`), h('div', null, label), h('small', { class: 'muted' }, `${settings.region.name} ・ 湿度 ${f.current.humidity ?? '—'}%`)),
      h('div', { class: 'wx-sum' }, h('div', null, '週間最高 ', h('strong', { class: 'hot' }, `${t1(Math.max(...maxs))}℃`)), h('div', null, '週間最低 ', h('strong', { class: 'cold' }, `${t1(Math.min(...mins))}℃`)),
        h('button', { class: 'btn small ghost', onclick: async () => { await fetchForecast(settings.region, true).catch(() => 0); rerender(); } }, '更新'))),
    h('div', { class: 'wx-week' }, f.daily.map((d) => { const dt = C.parse(d.date); return h('div', { class: 'wx-day' }, h('div', { class: 'wd' }, `${dt.getMonth() + 1}/${dt.getDate()}(${WD[dt.getDay()]})`), sprite(wmo(d.code)[1], 'wxs'), h('div', { class: 'hi' }, `${t1(d.tmax)}°`), h('div', { class: 'lo' }, `${t1(d.tmin)}°`), h('div', { class: 'pp' }, `降水${d.pop ?? '—'}%`), h('div', { class: 'pp' }, `${d.rain ?? 0}mm`)); })),
    climateBox(settings.region));
}

function climateBox(region) {
  const box = h('details', { class: 'climate' }, h('summary', null, '月別の平均気温・最低気温(過去3年)'));
  let loaded = false;
  box.addEventListener('toggle', async () => {
    if (!box.open || loaded) return; loaded = true;
    const body = h('p', { class: 'muted' }, '取得中…'); box.append(body);
    try {
      const c = await fetchClimate(region); body.remove();
      box.append(h('div', { class: 'table-wrap' }, h('table', { class: 'year' }, h('thead', null, h('tr', null, h('th', null, `${c.years}`), MONTHS.map((m) => h('th', null, m)))),
        h('tbody', null, [['平均気温', 'mean'], ['平均最高', 'maxAvg'], ['平均最低', 'minAvg'], ['最低記録', 'minAbs']].map(([l, k]) => h('tr', null, h('th', null, l), c.months.map((x) => h('td', null, t1(x[k])))))))));
    } catch (e) { body.textContent = '取得できませんでした: ' + e.message; loaded = false; }
  });
  return box;
}
