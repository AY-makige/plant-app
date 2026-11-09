// home.js — ホーム(今日のタスク・天気・温度警告・休眠期の植物)
import { h, sprite, empty, toast, fmtDate, fmtShort, WD, MONTHS, C } from './ui.js';
import { getSettings } from './db.js';
import { loadCtx } from './data.js';
import { fetchForecast, fetchClimate, wmo } from './weather.js';
import { taskRow } from './tasks.js';
import { avatar } from './plants.js';
import * as N from './notify.js';

const t1 = (v) => (v == null ? '—' : `${Math.round(v * 10) / 10}`);

export async function renderHome(root) {
  const [ctx, settings] = await Promise.all([loadCtx(), getSettings()]);
  const rerender = () => { root.innerHTML = ''; renderHome(root); };
  const now = new Date();
  root.append(h('div', { class: 'hero-banner' }, h('div', null, h('h1', null, 'ホーム'), h('p', null, `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${WD[now.getDay()]})`)), sprite('wateringcan', 'hero-sprite')));

  if (N.permission() === 'default') root.append(h('div', { class: 'banner' }, h('span', null, '🔔 通知を有効にすると、水やり・施肥の予定をお知らせします。'), h('button', { class: 'btn small primary', onclick: async () => { const r = await N.requestPermission(); toast(r === 'granted' ? '通知を有効にしました' : '通知は許可されませんでした(ホーム画面では予定を確認できます)'); rerender(); } }, '許可する')));

  const tasks = C.buildTasks(ctx.plants, ctx.names);

  /* 天気 + 温度警告 */
  const wx = h('div', { class: 'card wx' });
  let forecast = null;
  if (!settings.region) {
    wx.append(h('h2', null, '地域の天気'), h('p', { class: 'muted' }, '市区町村を登録すると、現在の気温・週間予報・植物ごとの温度警告が表示されます。'), h('a', { class: 'btn primary small', href: '#/settings' }, '地域を設定する'));
  } else {
    wx.append(h('p', { class: 'muted' }, '天気を取得中…'));
    fetchForecast(settings.region).then((f) => { forecast = f; drawWeather(wx, f, settings, ctx, rerender, warnBox); }).catch((e) => {
      wx.innerHTML = ''; wx.append(h('h2', null, `${settings.region.name} の天気`), h('p', { class: 'warn caution' }, '天気を取得できませんでした(オフライン、またはAPIに接続できません)。'), h('small', { class: 'muted' }, String(e.message)), h('button', { class: 'btn small', onclick: rerender }, '再試行'));
    });
  }
  const warnBox = h('div', { class: 'card' });
  root.append(wx, warnBox);
  if (settings.region) warnBox.append(h('h2', null, '🌡 温度警告'), h('p', { class: 'muted' }, '読み込み中…')); else warnBox.remove();

  /* タスク */
  const today = tasks.filter((t) => t.daysLeft <= 0), soon = tasks.filter((t) => t.daysLeft > 0 && t.daysLeft <= 7);
  root.append(h('div', { class: 'card' }, h('h2', null, `今日のタスク ${today.length ? `(${today.length})` : ''}`),
    today.length ? today.map((t) => taskRow(ctx, t, rerender)) : h('p', { class: 'muted' }, ctx.plants.length ? '今日やることはありません 🌿' : 'まず植物を登録しましょう'),
    !ctx.plants.length ? h('a', { class: 'btn primary', href: '#/plants/new' }, '植物を登録') : null));
  root.append(h('div', { class: 'card' }, h('h2', null, '近日中の予定(7日以内)'), soon.length ? soon.map((t) => taskRow(ctx, t, rerender)) : h('p', { class: 'muted' }, '予定はありません')));

  /* 休眠期の植物 */
  const dorm = ctx.plants.filter((p) => C.isDormant(p));
  root.append(h('div', { class: 'card' }, h('h2', null, '❄ 休眠期の植物'), dorm.length ? h('div', { class: 'chips' }, dorm.map((p) => h('a', { class: 'pill big', href: `#/plants/${p.id}` }, avatar(p, 'mini'), ctx.names[p.id]))) : h('p', { class: 'muted' }, '休眠中の植物はありません')));

  /* 季節のヒント(成長サイクルとの差) */
  const mo = now.getMonth() + 1; const hints = [];
  for (const p of ctx.plants) { const c = (ctx.sp[p.speciesId] || {}).cycle || {};
    if ((c.dormant || []).includes(mo) && !C.isDormant(p)) hints.push([p, `${mo}月は休眠期の設定です。休眠期モードに切り替えますか?`]);
    else if ((c.growth || []).includes(mo) && C.isDormant(p)) hints.push([p, `${mo}月は成長期の設定です。成長期に戻しますか?`]);
    if ((c.repot || []).includes(mo)) hints.push([p, `${mo}月は植え替え推奨時期です`]);
    if ((c.bloom || []).includes(mo)) hints.push([p, `${mo}月は開花予定時期です`]); }
  if (hints.length) root.append(h('div', { class: 'card' }, h('h2', null, '今月のヒント'), hints.slice(0, 12).map(([p, t]) => h('div', { class: 'log' }, h('a', { href: `#/plants/${p.id}` }, ctx.names[p.id]), ' — ', t))));

  // ここで予報が取れていれば警告を描画(非同期)
  function warnBoxDraw(f) {
    warnBox.innerHTML = '';
    const ws = C.computeWarnings(ctx.plants, ctx.names, f.daily, settings.margin);
    warnBox.append(h('h2', null, '🌡 温度警告'));
    if (!ws.length) warnBox.append(h('p', { class: 'muted' }, '今週の予報では、設定温度に抵触する植物はありません。'));
    else warnBox.append(ws.map((w) => h('div', { class: 'warn ' + w.level }, h('strong', null, w.label), ' ', h('a', { href: `#/plants/${w.plantId}` }, w.name), ` — ${w.msg}(${fmtShort(w.date)})`)));
    warnBox.append(h('p', { class: 'note' }, '※ 温度警告は栽培判断の補助です。風・鉢内温度・日当たり・植物の状態も考慮して、屋外管理を続けるか室内へ移すか判断してください。温度が未設定の植物は判定されません。'));
  }
  window.__warnDraw = warnBoxDraw;
}

function drawWeather(wx, f, settings, ctx, rerender, warnBox) {
  wx.innerHTML = '';
  const [label, icon] = wmo(f.current.code);
  const maxs = f.daily.map((d) => d.tmax), mins = f.daily.map((d) => d.tmin);
  wx.append(
    h('div', { class: 'row between wrap' }, h('h2', null, `${settings.region.name} の天気`), h('button', { class: 'btn small ghost', onclick: async () => { await fetchForecast(settings.region, true).catch(() => 0); rerender(); } }, '更新')),
    f.stale ? h('p', { class: 'warn caution' }, '⚠ オフラインのため前回取得した予報を表示しています') : null,
    h('div', { class: 'wx-now' }, sprite(icon, 'wxi'), h('div', null, h('div', { class: 'temp' }, `${t1(f.current.temp)}℃`), h('div', null, label), h('small', { class: 'muted' }, `湿度 ${f.current.humidity ?? '—'}%`)),
      h('div', { class: 'wx-sum' }, h('div', null, '今週の最高 ', h('strong', { class: 'hot' }, `${t1(Math.max(...maxs))}℃`)), h('div', null, '今週の最低 ', h('strong', { class: 'cold' }, `${t1(Math.min(...mins))}℃`)))),
    h('div', { class: 'wx-week' }, f.daily.map((d) => { const dt = C.parse(d.date); return h('div', { class: 'wx-day' }, h('div', { class: 'wd' }, `${dt.getMonth() + 1}/${dt.getDate()}(${WD[dt.getDay()]})`), sprite(wmo(d.code)[1], 'wxs'), h('div', { class: 'hi' }, `${t1(d.tmax)}°`), h('div', { class: 'lo' }, `${t1(d.tmin)}°`), h('div', { class: 'pp' }, `☂${d.pop ?? '—'}%`), h('div', { class: 'pp' }, `${d.rain ?? 0}mm`)); })),
    climateBox(settings.region));
  window.__warnDraw && window.__warnDraw(f);
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
