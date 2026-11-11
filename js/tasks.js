// tasks.js — 管理タスク(水やり / 液体肥料 / 実施履歴 / 次回予定)
import { h, sprite, empty, confirmBox, fmtDate, relDays, stageClass, icon, toast, once, C } from './ui.js';
import { db } from './db.js';
import { loadCtx, deleteLog, recordCare, recordSkip } from './data.js';
import { careModal, quickCare } from './care.js';
import { avatar } from './plants.js';

/** タスク1行: 右端の丸ボタンでワンタップ完了(トーストで取り消し可)、鉛筆で日付指定 */
export function taskRow(ctx, t, onDone) {
  const p = ctx.plants.find((x) => x.id === t.plantId);
  const sc = stageClass(t.kind, t.daysLeft); const label = t.kind === 'water' ? '水やり' : '液体肥料';
  const row = h('div', { class: 'task' + sc },
    h('a', { href: `#/plants/${p.id}`, class: 'task-av', 'aria-label': `${p.__name || ''}の詳細` }, avatar(p, 'mini')),
    h('div', { class: 'task-main' }, h('a', { class: 'task-name', href: `#/plants/${p.id}` }, t.name),
      h('div', { class: 'task-meta' }, h('span', { class: 'kind ' + t.kind }, icon(t.kind === 'water' ? 'drop' : 'flask', 14), label), C.isDormant(p) ? h('span', { class: 'mini-badge dorm' }, '休眠期') : null,
        h('span', { class: 'due-chip' + sc }, relDays(t.daysLeft, t.kind)), sc && t.daysLeft !== 0 ? h('small', { class: 'muted' }, relDays(t.daysLeft)) : null)),
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `${t.name}の${label}を日付指定で記録`, onclick: () => careModal(p, t.kind, onDone) }, icon('edit', 18)),
    h('button', { class: 'check-btn ' + t.kind, type: 'button', 'aria-label': `${t.name}の${label}を実施済みにする`, onclick: async () => { row.classList.add('done'); await quickCare(p, t.kind, onDone); } }, icon('check', 24)));
  const skipBtn = h('button', { class: 'btn small ghost skip-btn', type: 'button', 'aria-label': `${t.name}の液肥を今回はスキップ`, onclick: once(async () => {
      const log = await recordSkip(p); const n = C.nextDue(await db.get('plants', p.id), 'fert');
      toast(`${t.name}の液肥をスキップしました(次回 ${n.date ? n.date.slice(5).replace('-', '/') : '—'})`, 6000, { label: '元に戻す', fn: async () => { await deleteLog(log); onDone && onDone(); } }); onDone && onDone();
    }) }, 'スキップ');
  if (t.kind === 'fert') row.querySelector('.task-main').append(skipBtn);
  return row;
}

const GROUPS = [['予定日を過ぎたもの', (t) => t.daysLeft < 0], ['今日', (t) => t.daysLeft === 0], ['明日', (t) => t.daysLeft === 1], ['今週(2〜7日後)', (t) => t.daysLeft >= 2 && t.daysLeft <= 7], ['それ以降', (t) => t.daysLeft > 7]];
function grouped(ctx, list, rerender) {
  const out = [];
  for (const [label, f] of GROUPS) { const g = list.filter(f); if (g.length) out.push(h('div', { class: 'group' }, h('h3', { class: 'group-h' }, label, h('span', null, g.length)), g.map((t) => taskRow(ctx, t, rerender)))); }
  return out;
}

export async function renderTasks(root) {
  const tab = sessionStorage.getItem('taskTab') || 'water';
  const ctx = await loadCtx();
  const rerender = () => { const y = window.scrollY; root.innerHTML = ''; renderTasks(root).then(() => window.scrollTo(0, y)); };
  const tasks = C.buildTasks(ctx.plants, ctx.names);
  const go = (k) => { sessionStorage.setItem('taskTab', k); rerender(); };
  const other = tab === 'fert' ? 'water' : 'fert';
  const title = { water: '水やり', fert: '液体肥料', history: '実施履歴' }[tab];
  const head = h('div', { class: 'page-head task-head' },
    h('h1', { class: 'kind-h ' + (tab === 'history' ? '' : tab) }, tab === 'history' ? null : icon(tab === 'fert' ? 'flask' : 'drop', 30), title),
    h('div', { class: 'row gap' },
      tab === 'history'
        ? [h('button', { class: 'btn small switch water', onclick: () => go('water') }, icon('drop', 18), '水やり'), h('button', { class: 'btn small switch fert', onclick: () => go('fert') }, icon('flask', 18), '液体肥料')]
        : [h('button', { class: 'btn small switch ' + other, type: 'button', onclick: () => go(other), 'aria-label': `${other === 'fert' ? '液体肥料' : '水やり'}に切り替え` }, icon('swap', 18), other === 'fert' ? '液体肥料へ' : '水やりへ'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => go('history') }, '履歴')]));
  const body = h('div');
  if (tab === 'history') {
    const logs = (await db.all('logs')).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
    if (!logs.length) body.append(empty('wateringcan', 'まだ実施履歴がありません'));
    let lastDate = '';
    for (const l of logs.slice(0, 200)) {
      if (l.date !== lastDate) { lastDate = l.date; body.append(h('h3', { class: 'group-h' }, fmtDate(l.date))); }
      body.append(h('div', { class: 'card log row between' }, h('div', null, h('span', { class: 'kind ' + l.kind }, icon(l.kind === 'water' ? 'drop' : 'flask', 14), l.kind === 'water' ? '水やり' : (l.skipped ? '肥料(スキップ)' : '肥料')), ' ', h('a', { href: `#/plants/${l.plantId}` }, ctx.names[l.plantId] || '(削除済み)'), ' ', l.time || '',
        h('div', { class: 'muted' }, [l.method, l.amount, l.fertType, l.dilution].filter(Boolean).join(' / ')), l.note ? h('div', null, l.note) : null),
      h('button', { class: 'icon-btn', 'aria-label': '削除', onclick: async () => { if (await confirmBox('この履歴を削除します。次回予定日は再計算されます。', '削除', true)) { await deleteLog(l); rerender(); } } }, icon('trash', 20))));
    }
  } else {
    const sub = sessionStorage.getItem('taskSub') === 'today' ? 'today' : 'schedule';
    const label = tab === 'water' ? '水やり' : '液体肥料';
    body.append(h('div', { class: 'seg task-sub', role: 'tablist' }, [['schedule', 'スケジュール'], ['today', tab === 'water' ? '今日水やりした植物' : '今日液肥をあげた植物']].map(([k, l]) =>
      h('button', { class: 'seg-b' + (sub === k ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': sub === k, onclick: () => { sessionStorage.setItem('taskSub', k); rerender(); } }, l))));
    if (sub === 'today') {
      /* 今日: スケジュール(間隔)が決まっていない植物を並べ、チェックしたものを今日実施した記録にする */
      const t0 = C.today(); const givenToday = new Set((await db.all('logs')).filter((l) => l.date === t0 && l.kind === tab && !l.skipped).map((l) => l.plantId));
      // 表示の切り替え: off=スケジュールなしの植物 / all=すべて / sched=スケジュールが組まれている植物のみ(イレギュラーな実施の記録用)
      const mode = ['all', 'sched'].includes(sessionStorage.getItem('taskTodayMode')) ? sessionStorage.getItem('taskTodayMode') : 'off';
      const showAll = mode === 'all';
      const hasSch = (p) => !!C.nextDue(p, tab).date;
      const unsched = ctx.plants.filter((p) => (mode === 'off' ? !hasSch(p) : mode === 'sched' ? hasSch(p) : true)).sort((a, b) => (ctx.names[a.id] || '').localeCompare(ctx.names[b.id] || '', 'ja'));
      const setMode = (m) => { sessionStorage.setItem('taskTodayMode', m); rerender(); };
      body.append(h('div', { class: 'col today-modes' },
        h('button', { class: 'btn small' + (mode === 'all' ? ' primary' : ''), type: 'button', 'aria-pressed': mode === 'all', onclick: () => setMode(mode === 'all' ? 'off' : 'all') }, mode === 'all' ? '✓ スケジュールが組まれている植物を表示中' : 'スケジュールが組まれている植物を表示'),
        h('button', { class: 'btn small' + (mode === 'sched' ? ' primary' : ''), type: 'button', 'aria-pressed': mode === 'sched', onclick: () => setMode(mode === 'sched' ? 'off' : 'sched') }, mode === 'sched' ? '✓ スケジュールが組まれている植物のみ表示中' : 'スケジュールが組まれている植物のみ表示')));
      body.append(h('p', { class: 'muted hint' }, `${mode === 'all' ? 'すべての植物の一覧です。' : mode === 'sched' ? 'スケジュールが組まれている植物の一覧です。' : 'スケジュールが決まっていない植物の一覧です。'}今日${label}をした植物にチェックを入れて「記録する」を押すと、最終${label}日が今日になります。`));
      if (!unsched.length) { body.append(empty(tab === 'water' ? 'wateringcan' : 'mister', mode === 'off' ? 'スケジュールが決まっていない植物はありません' : mode === 'sched' ? 'スケジュールが組まれている植物はありません' : '植物がありません')); }
      else {
        const checks = unsched.map((p) => { const cfg = p[tab] || {}; const done = givenToday.has(p.id); return { p, done, el: h('input', { type: 'checkbox', disabled: done, 'aria-label': `${ctx.names[p.id]}に${label}をした` }) }; });
        const cnt = h('span', null, '0'); const btn = h('button', { class: 'btn primary', type: 'button', disabled: true }, '選択した植物に記録する');
        const upd = () => { const n = checks.filter((c) => c.el.checked).length; cnt.textContent = n; btn.disabled = !n; btn.textContent = n ? `${n}件に${label}を記録する` : '選択した植物に記録する'; };
        checks.forEach((c) => c.el.addEventListener('change', upd));
        const allBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { const todo = checks.filter((c) => !c.done); const on = todo.some((c) => !c.el.checked); todo.forEach((c) => { c.el.checked = on; }); upd(); } }, 'すべて選択 / 解除');
        body.append(h('div', { class: 'row between today-bar' }, h('strong', null, `${unsched.length}株`), allBtn));
        body.append(h('div', { class: 'today-list' }, checks.map((c) => { const cfg = c.p[tab] || {}; return h('label', { class: 'task today-row' + (c.done ? ' done-today' : '') },
          c.el, h('span', { class: 'task-av' }, avatar(c.p, 'mini')),
          h('div', { class: 'task-main' }, h('span', { class: 'task-name' }, ctx.names[c.p.id]), h('div', { class: 'task-meta' }, C.isDormant(c.p) ? h('span', { class: 'mini-badge dorm' }, '休眠期') : null,
            h('small', { class: 'muted' }, c.done ? '今日記録済み' : `最終${label}: ${cfg.last ? fmtDate(cfg.last) : '未記録'}${C.nextDue(c.p, tab).date ? ' / 次回予定: ' + fmtDate(C.nextDue(c.p, tab).date) : ''}`)))); })));
        btn.addEventListener('click', async () => {
          const sel = checks.filter((c) => c.el.checked); if (!sel.length) return; btn.disabled = true;
          const made = []; const prev = Object.fromEntries(sel.map((c) => [c.p.id, (c.p[tab] || {}).last || '']));
          for (const c of sel) { const f = c.p.fert || {}; made.push(await recordCare(c.p, tab, tab === 'water' ? { date: t0, amount: C.effWater(c.p).amount } : { date: t0, amount: f.amount, fertType: f.type, dilution: f.dilution })); }
          toast(`${sel.length}件に${label}を記録しました`, 6000, { label: '元に戻す', fn: async () => { for (const l of made) { await deleteLog(l); const cur = await db.get('plants', l.plantId); if (cur && !(cur[tab] || {}).last && prev[l.plantId]) { cur[tab] = { ...(cur[tab] || {}), last: prev[l.plantId] }; await db.put('plants', cur); } } rerender(); } });
          rerender();
        });
        body.append(h('div', { class: 'today-foot' }, btn));
      }
      root.append(head, body); return;
    }
    const list = tasks.filter((t) => t.kind === tab);
    const stopped = ctx.plants.filter((p) => !C.nextDue(p, tab).date);
    body.append(h('p', { class: 'muted hint' }, '右の ✓ をタップで「今日やった」を記録。予定日は最終実施日 + 間隔で自動計算されます。'));
    if (!list.length) body.append(empty(tab === 'water' ? 'wateringcan' : 'mister', 'スケジュールが設定された植物がありません'));
    body.append(grouped(ctx, list, rerender));
    if (stopped.length) body.append(h('div', { class: 'card' }, h('h3', null, '予定なし(未設定・休眠期停止)'), h('p', { class: 'muted' }, stopped.map((p) => `${ctx.names[p.id]}${C.isDormant(p) ? '(休眠中)' : ''}`).join('、'))));
  }
  root.append(head, body);
}
