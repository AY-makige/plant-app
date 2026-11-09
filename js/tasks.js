// tasks.js — 管理タスク(水やり / 液体肥料 / 実施履歴 / 次回予定)
import { h, sprite, empty, confirmBox, fmtDate, relDays, stageClass, icon, C } from './ui.js';
import { db } from './db.js';
import { loadCtx, deleteLog } from './data.js';
import { careModal, quickCare } from './care.js';
import { avatar } from './plants.js';

/** タスク1行: 右端の丸ボタンでワンタップ完了(トーストで取り消し可)、鉛筆で日付指定 */
export function taskRow(ctx, t, onDone) {
  const p = ctx.plants.find((x) => x.id === t.plantId);
  const sc = stageClass(t.kind, t.daysLeft); const label = t.kind === 'water' ? '水やり' : '液体肥料';
  const row = h('div', { class: 'task' + sc },
    h('a', { href: `#/plants/${p.id}`, class: 'task-av' }, avatar(p, 'mini')),
    h('div', { class: 'task-main' }, h('a', { class: 'task-name', href: `#/plants/${p.id}` }, t.name),
      h('div', { class: 'task-meta' }, h('span', { class: 'kind ' + t.kind }, icon(t.kind === 'water' ? 'drop' : 'flask', 14), label), C.isDormant(p) ? h('span', { class: 'mini-badge dorm' }, '休眠期') : null,
        h('span', { class: 'due-chip' + sc }, relDays(t.daysLeft, t.kind)), sc && t.daysLeft !== 0 ? h('small', { class: 'muted' }, relDays(t.daysLeft)) : null)),
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `${t.name}の${label}を日付指定で記録`, onclick: () => careModal(p, t.kind, onDone) }, icon('edit', 18)),
    h('button', { class: 'check-btn ' + t.kind, type: 'button', 'aria-label': `${t.name}の${label}を実施済みにする`, onclick: async () => { row.classList.add('done'); await quickCare(p, t.kind, onDone); } }, icon('check', 24)));
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
      body.append(h('div', { class: 'card log row between' }, h('div', null, h('span', { class: 'kind ' + l.kind }, icon(l.kind === 'water' ? 'drop' : 'flask', 14), l.kind === 'water' ? '水やり' : '肥料'), ' ', h('a', { href: `#/plants/${l.plantId}` }, ctx.names[l.plantId] || '(削除済み)'), ' ', l.time || '',
        h('div', { class: 'muted' }, [l.method, l.amount, l.fertType, l.dilution].filter(Boolean).join(' / ')), l.note ? h('div', null, l.note) : null),
      h('button', { class: 'icon-btn', 'aria-label': '削除', onclick: async () => { if (await confirmBox('この履歴を削除します。次回予定日は再計算されます。', '削除', true)) { await deleteLog(l); rerender(); } } }, icon('trash', 20))));
    }
  } else {
    const list = tasks.filter((t) => t.kind === tab);
    const stopped = ctx.plants.filter((p) => !C.nextDue(p, tab).date);
    body.append(h('p', { class: 'muted hint' }, '右の ✓ をタップで「今日やった」を記録。予定日は最終実施日 + 間隔で自動計算されます。'));
    if (!list.length) body.append(empty(tab === 'water' ? 'wateringcan' : 'mister', 'スケジュールが設定された植物がありません'));
    body.append(grouped(ctx, list, rerender));
    if (stopped.length) body.append(h('div', { class: 'card' }, h('h3', null, '予定なし(未設定・休眠期停止)'), h('p', { class: 'muted' }, stopped.map((p) => `${ctx.names[p.id]}${C.isDormant(p) ? '(休眠中)' : ''}`).join('、'))));
  }
  root.append(head, body);
}
