// tasks.js — 管理タスク(水やり / 液体肥料 / 実施履歴 / 次回予定)
import { h, sprite, empty, modal, confirmBox, toast, fmtDate, relDays, C } from './ui.js';
import { db } from './db.js';
import { loadCtx, deleteLog } from './data.js';
import { careModal } from './care.js';
import { avatar } from './plants.js';

export function taskRow(ctx, t, onDone) {
  const p = ctx.plants.find((x) => x.id === t.plantId);
  const over = t.daysLeft < 0;
  return h('div', { class: 'task' + (over ? ' over' : t.daysLeft === 0 ? ' today' : '') },
    h('a', { href: `#/plants/${p.id}`, class: 'task-av' }, avatar(p, 'mini')),
    h('div', { class: 'task-main' }, h('strong', null, t.name), h('div', { class: 'muted' }, `${t.kind === 'water' ? '水やり' : '液体肥料'} ・ ${C.isDormant(p) ? '休眠期設定 ・ ' : ''}${t.interval}日ごと${t.noLast ? ' ・ 最終実施日が未記録' : ''}`),
      h('div', { class: 'due' }, `${fmtDate(t.due)}(${relDays(t.daysLeft)})`)),
    h('button', { class: 'btn small primary', onclick: () => careModal(p, t.kind, onDone) }, h('img', { src: `assets/sprites/${t.kind === 'water' ? 'i_drop' : 'mister'}.png`, alt: '' }), '実施'));
}

export async function renderTasks(root) {
  const tab = sessionStorage.getItem('taskTab') || 'water';
  const ctx = await loadCtx();
  const rerender = () => { root.innerHTML = ''; renderTasks(root); };
  const tasks = C.buildTasks(ctx.plants, ctx.names);
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['water', '水やり'], ['fert', '液体肥料'], ['history', '実施履歴']].map(([k, l]) =>
    h('button', { class: 'tab' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': tab === k, onclick: () => { sessionStorage.setItem('taskTab', k); rerender(); } }, l)));
  const body = h('div');
  if (tab === 'history') {
    const logs = (await db.all('logs')).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
    if (!logs.length) body.append(empty('wateringcan', 'まだ実施履歴がありません'));
    body.append(logs.slice(0, 200).map((l) => h('div', { class: 'card log row between' }, h('div', null, h('strong', null, `${fmtDate(l.date)} ${l.time || ''}`), ' ',
      h('a', { href: `#/plants/${l.plantId}` }, ctx.names[l.plantId] || '(削除済み)'), ' ', h('span', { class: 'badge' }, l.kind === 'water' ? '水やり' : '肥料'),
      h('div', { class: 'muted' }, [l.method, l.amount, l.fertType, l.dilution].filter(Boolean).join(' / ')), l.note ? h('div', null, l.note) : null),
    h('button', { class: 'icon-btn', 'aria-label': '削除', onclick: async () => { if (await confirmBox('この履歴を削除します。次回予定日は再計算されます。', '削除', true)) { await deleteLog(l); rerender(); } } }, '🗑'))));
  } else {
    const list = tasks.filter((t) => t.kind === tab);
    const stopped = ctx.plants.filter((p) => !C.nextDue(p, tab).date);
    body.append(h('p', { class: 'muted' }, '予定日 = 最終実施日 + 間隔。実施日を記録すると次回予定日が再計算されます。'));
    if (!list.length) body.append(empty(tab === 'water' ? 'wateringcan' : 'mister', 'スケジュールが設定された植物がありません'));
    body.append(list.map((t) => taskRow(ctx, t, rerender)));
    if (stopped.length) body.append(h('div', { class: 'card' }, h('h3', null, '予定なし(未設定・休眠期停止)'), h('p', { class: 'muted' }, stopped.map((p) => `${ctx.names[p.id]}${C.isDormant(p) ? '(休眠中)' : ''}`).join('、'))));
  }
  root.append(h('div', { class: 'page-head' }, h('h1', null, '管理タスク')), tabs, body);
}
