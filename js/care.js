// care.js — 水やり/施肥の実施入力モーダル
import { h, modal, field, toast, C } from './ui.js';
import { recordCare, deleteLog } from './data.js';

/** ワンタップで「今日実施した」を記録(既定の量・種類を使用)。トーストから取り消せる */
export async function quickCare(plant, kind, onDone) {
  const w = C.effWater(plant), f = plant.fert || {};
  const log = await recordCare(plant, kind, kind === 'water' ? { amount: w.amount } : { amount: f.amount, fertType: f.type, dilution: f.dilution });
  if (navigator.vibrate) navigator.vibrate(15);
  const n = C.nextDue(await (await import('./db.js')).db.get('plants', plant.id), kind);
  toast(`${plant.__name || ''}の${kind === 'water' ? '水やり' : '施肥'}を記録${n.date ? '(次回 ' + n.date.slice(5).replace('-', '/') + ')' : ''}`, 5000, { label: '元に戻す', fn: async () => { await deleteLog(log); onDone && onDone(); } });
  onDone && onDone();
}

export function careModal(plant, kind, onDone) {
  const isW = kind === 'water';
  const eff = isW ? C.effWater(plant) : null;
  modal(`${plant.__name || plant.nickname}:${isW ? '水やりを記録' : '液体肥料を記録'}`, (b, close) => {
    const date = h('input', { type: 'date', name: 'date', value: C.today(), max: C.today() });
    const time = h('input', { type: 'time', name: 'time', value: new Date().toTimeString().slice(0, 5) });
    const amount = h('input', { type: 'text', name: 'amount', value: isW ? eff.amount || '' : (plant.fert || {}).amount || '', placeholder: isW ? '例: 鉢底から流れるまで' : '例: 1回 500ml' });
    const method = h('input', { type: 'text', name: 'method', value: '', placeholder: '例: 腰水 / 底面給水 / 頭上から', list: 'methods' });
    const fertType = h('input', { type: 'text', name: 'fertType', value: (plant.fert || {}).type || '', placeholder: '例: ハイポネックス原液' });
    const dilution = h('input', { type: 'text', name: 'dilution', value: (plant.fert || {}).dilution || '', placeholder: '例: 1000倍' });
    const note = h('textarea', { name: 'note', rows: 2, placeholder: '備考(任意)' });
    b.append(
      h('p', { class: 'muted' }, '予定より早く/遅く行った場合も、実施日を入力すると次回予定日がその日から再計算されます。'),
      h('div', { class: 'grid2' }, field('実施日', date), field('時刻', time)),
      isW ? [field('水やり量', amount), field('方法', method), h('datalist', { id: 'methods' }, ['頭上から', '腰水', '底面給水', 'ミスト', '浸水'].map((x) => h('option', { value: x })))]
        : [field('肥料の種類', fertType), h('div', { class: 'grid2' }, field('希釈倍率', dilution), field('使用量', amount))],
      field('備考', note),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'キャンセル'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!date.value) return toast('実施日を入力してください');
          await recordCare(plant, kind, { date: date.value, time: time.value, amount: amount.value, method: method.value, fertType: fertType.value, dilution: dilution.value, note: note.value });
          close(); toast('記録しました'); onDone && onDone();
        } }, '記録する')));
  });
}
