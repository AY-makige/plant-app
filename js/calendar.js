// calendar.js — 成長予定カレンダー(月間 / 年間 / 植物絞り込み)
import { h, empty, MONTHS, WD, fmtDate, C } from './ui.js';
import { db } from './db.js';
import { loadCtx } from './data.js';
import { CYCLE } from './plants.js';

const state = { view: 'month', y: new Date().getFullYear(), m: new Date().getMonth() + 1, sel: new Set(), day: null };
const CY_ICON = { bloom: '✿', repot: '鉢', divide: '分', sow: '種' };

export async function renderCalendar(root) {
  const ctx = await loadCtx();
  const logs = await db.all('logs');
  const rerender = () => { root.innerHTML = ''; renderCalendar(root); };
  const plants = ctx.plants.filter((p) => !state.sel.size || state.sel.has(p.id));
  const spOf = (p) => ctx.sp[p.speciesId] || { cycle: {} };

  const tabs = h('div', { class: 'tabs' }, [['month', '月間'], ['year', '年間']].map(([k, l]) => h('button', { class: 'tab' + (state.view === k ? ' on' : ''), onclick: () => { state.view = k; rerender(); } }, l)));
  const filter = h('div', { class: 'chips scroll', 'aria-label': '表示する植物' },
    h('button', { class: 'chip-btn' + (!state.sel.size ? ' on' : ''), onclick: () => { state.sel.clear(); rerender(); } }, 'すべて'),
    ctx.plants.map((p) => h('button', { class: 'chip-btn' + (state.sel.has(p.id) ? ' on' : ''), onclick: () => { state.sel.has(p.id) ? state.sel.delete(p.id) : state.sel.add(p.id); rerender(); } }, ctx.names[p.id])));
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'カレンダー')), tabs, ctx.plants.length ? filter : null);
  if (!ctx.plants.length) { root.append(empty('i_calendar', '植物を登録すると成長サイクルが表示されます')); return; }

  const legend = h('div', { class: 'legend' }, h('span', null, h('i', { class: 'lg growth' }), '成長期'), h('span', null, h('i', { class: 'lg dormant' }), '休眠期'), h('span', null, '✿ 開花'), h('span', null, '鉢 植え替え'), h('span', null, '分 株分け'), h('span', null, '種 種まき'));

  if (state.view === 'year') {
    const tbl = h('table', { class: 'year' }, h('thead', null, h('tr', null, h('th', null, '植物'), MONTHS.map((m, i) => h('th', { class: i + 1 === new Date().getMonth() + 1 ? 'now' : '' }, m)))),
      h('tbody', null, plants.map((p) => { const c = spOf(p).cycle || {}; return h('tr', null, h('th', null, h('a', { href: `#/plants/${p.id}` }, ctx.names[p.id])),
        MONTHS.map((_, i) => { const mo = i + 1; const g = (c.growth || []).includes(mo), d = (c.dormant || []).includes(mo);
          const marks = ['bloom', 'repot', 'divide', 'sow'].filter((k) => (c[k] || []).includes(mo)).map((k) => h('span', { class: 'mk ' + k, title: CYCLE.find((x) => x[0] === k)[1] }, CY_ICON[k]));
          return h('td', { class: (g ? 'growth ' : '') + (d ? 'dormant' : '') }, marks); })); })));
    root.append(legend, h('div', { class: 'table-wrap' }, tbl), h('p', { class: 'muted' }, '成長サイクルは植物の登録・編集画面で設定します(種類ごとに共通)。'));
    return;
  }

  // 月間
  const { y, m } = state; const first = new Date(y, m - 1, 1); const last = new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0'); const key = (d) => `${y}-${pad(m)}-${pad(d)}`;
  const ev = {}; const add = (date, e) => { (ev[date] = ev[date] || []).push(e); };
  const t0 = C.today(); const mStart = key(1), mEnd = key(last);
  for (const p of plants) for (const kind of ['water', 'fert']) {
    const n = C.nextDue(p, kind); if (!n.date) continue;
    let guard = 0;
    // 予定日が今月以前なら、今月内の予測を計算
    let cur = n.date; const overdue = C.diffDays(cur, t0) < 0;
    if (overdue) { if (t0 >= mStart && t0 <= mEnd) add(t0, { p, kind, over: true }); cur = C.addDays(t0, n.interval); }
    while (C.diffDays(cur, mEnd) <= 0 && guard++ < 400) { if (C.diffDays(cur, mStart) >= 0) add(cur, { p, kind, proj: cur !== n.date }); cur = C.addDays(cur, n.interval); }
  }
  for (const l of logs) if (l.date >= mStart && l.date <= mEnd && (!state.sel.size || state.sel.has(l.plantId)) && ctx.names[l.plantId]) add(l.date, { p: { id: l.plantId }, kind: l.kind, done: true });

  const nav = h('div', { class: 'cal-nav' },
    h('button', { class: 'btn small', 'aria-label': '前の月', onclick: () => { state.m--; if (state.m < 1) { state.m = 12; state.y--; } state.day = null; rerender(); } }, '‹'),
    h('strong', null, `${y}年 ${m}月`),
    h('button', { class: 'btn small', 'aria-label': '次の月', onclick: () => { state.m++; if (state.m > 12) { state.m = 1; state.y++; } state.day = null; rerender(); } }, '›'),
    h('button', { class: 'btn small ghost', onclick: () => { state.y = new Date().getFullYear(); state.m = new Date().getMonth() + 1; state.day = null; rerender(); } }, '今月'));
  const grid = h('div', { class: 'cal-grid' }, WD.map((w, i) => h('div', { class: 'cal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') }, w)));
  for (let i = 0; i < first.getDay(); i++) grid.append(h('div', { class: 'cal-cell blank' }));
  const selDay = state.day || (t0.startsWith(`${y}-${pad(m)}`) ? t0 : null);
  for (let d = 1; d <= last; d++) {
    const k = key(d); const es = ev[k] || [];
    const cnt = (kind, f) => es.filter((e) => e.kind === kind && f(e)).length;
    const wd = new Date(y, m - 1, d).getDay();
    grid.append(h('button', { class: 'cal-cell' + (k === t0 ? ' today' : '') + (k === selDay ? ' sel' : '') + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : ''), onclick: () => { state.day = k; rerender(); } },
      h('span', { class: 'dn' }, d),
      h('span', { class: 'dots' },
        cnt('water', (e) => !e.done) ? h('span', { class: 'dot w' + (es.some((e) => e.kind === 'water' && e.over) ? ' over' : '') }, h('i'), cnt('water', (e) => !e.done)) : null,
        cnt('fert', (e) => !e.done) ? h('span', { class: 'dot f' }, h('i'), cnt('fert', (e) => !e.done)) : null,
        es.some((e) => e.done) ? h('span', { class: 'dot ok' }, h('i'), es.filter((e) => e.done).length) : null)));
  }
  const detail = h('div', { class: 'card' });
  if (selDay) {
    const es = ev[selDay] || [];
    detail.append(h('h3', null, `${fmtDate(selDay)}(${WD[C.parse(selDay).getDay()]})`));
    if (!es.length) detail.append(h('p', { class: 'muted' }, 'この日の予定はありません'));
    for (const e of es) detail.append(h('div', { class: 'log' }, e.done ? '✓ 実施済み ' : e.proj ? '(予測) ' : e.over ? '⚠ 超過 ' : '', e.kind === 'water' ? '水やり' : '液体肥料', ' — ', h('a', { href: `#/plants/${e.p.id}` }, ctx.names[e.p.id])));
  } else detail.append(h('p', { class: 'muted' }, '日付をタップすると詳細を表示します'));

  // 今月の成長サイクル
  const cyCard = h('div', { class: 'card' }, h('h3', null, `${m}月の成長予定`));
  let any = false;
  for (const [k, label, cls] of CYCLE) {
    const ps = plants.filter((p) => ((spOf(p).cycle || {})[k] || []).includes(m));
    if (ps.length) { any = true; cyCard.append(h('div', { class: 'cy-line' }, h('span', { class: 'tag ' + cls }, label), ps.map((p) => h('a', { class: 'pill', href: `#/plants/${p.id}` }, ctx.names[p.id])))); }
  }
  if (!any) cyCard.append(h('p', { class: 'muted' }, 'この月に設定された成長サイクルはありません(植物の編集画面で月を設定できます)'));
  root.append(nav, legend, grid, h('p', { class: 'muted' }, '青=水やり 橙=液体肥料 緑=実施済み。先の予定は「最終実施日+間隔」からの予測です。'), detail, cyCard);
}
