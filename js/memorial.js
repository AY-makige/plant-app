// memorial.js — 枯死した植物の記録・メモリアル
import { h, sprite, icon, graveImg, mixLine, empty, field, modal, confirmBox, toast, photoInput, fmtDate, ownStart, lifespanText, C } from './ui.js';
import { db } from './db.js';
import { buryPlant, reviveGrave, loadCtx } from './data.js';

export const CAUSES = ['水切れ', '根腐れ', '高温障害', '低温障害', '日照不足', '害虫被害', '病気', '原因不明', 'その他'];

function envSummary(p, s) {
  const bits = [];
  if (s) { if (s.light) bits.push('日照: ' + s.light); if (s.humidity) bits.push('湿度: ' + s.humidity); if (s.moisture) bits.push('水分: ' + s.moisture); }
  const w = p.water || {}; if (w.interval) bits.push(`水やり ${w.interval}日ごと${w.amount ? '(' + w.amount + ')' : ''}`);
  const f = p.fert || {}; if (f.interval) bits.push(`施肥 ${f.interval}日ごと${f.type ? '(' + f.type + (f.dilution ? ' ' + f.dilution : '') + ')' : ''}`);
  if (p.outdoorMin !== '' && p.outdoorMin != null) bits.push(`屋外最低温度 ${p.outdoorMin}℃`);
  return bits.join('\n');
}

export function graveForm(plant, species, names, onDone) {
  modal(`「${names[plant.id]}」を枯死として記録`, (b, close) => {
    const date = h('input', { type: 'date', value: C.today(), max: C.today() });
    const photo = photoInput(plant.photo, '遺影の写真を選ぶ');
    const rows = CAUSES.map((c) => ({ c, chk: h('input', { type: 'checkbox' }), cert: h('select', { 'aria-label': c + 'の確度' }, h('option', { value: '推測' }, '推測'), h('option', { value: '確定' }, '確定')) }));
    const causeNote = h('textarea', { rows: 2, placeholder: '原因の根拠・状況(任意)' });
    const env = h('textarea', { rows: 5 }, envSummary(plant, species));
    const notes = h('textarea', { rows: 3, placeholder: '反省点・次に活かすこと' });
    b.append(
      h('p', { class: 'muted' }, '所持植物の一覧から移動し、メモリアルに保存します。直近の水やり・施肥・植え替え記録も一緒に残ります。'),
      field('枯死日', date), field('遺影(最後の写真)', photo.el),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, '枯死の原因(複数選択可・確定情報と推測を区別)'), h('div', { class: 'cause-list' }, rows.map((r) => h('div', { class: 'cause' }, h('label', { class: 'check' }, r.chk, ' ' + r.c), r.cert)))),
      field('原因メモ', causeNote), field('当時の育成環境', env), field('備考・反省点', notes),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'キャンセル'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!date.value) return toast('枯死日を入力してください');
          const causes = rows.filter((r) => r.chk.checked).map((r) => ({ cause: r.c, certainty: r.cert.value }));
          const grave = await buryPlant(plant, species, { deathDate: date.value, photo: photo.value, causes, causeNote: causeNote.value, env: env.value, notes: notes.value }, names);
          close(); onDone && onDone();
          toast('メモリアルに移動しました', 8000, { label: '取り消す', fn: async () => { const p2 = await reviveGrave(grave); toast('所持植物に戻しました'); location.hash = `#/plants/${p2.id}`; } });
        } }, 'メモリアルに移す')));
  }, { wide: true });
}

function gravePhoto(g, cls = '') {
  return g.photo ? h('img', { class: 'avatar ' + cls + ' grave-img', src: g.photo, alt: g.name + 'の遺影' }) : h('div', { class: 'avatar grave-ph ' + cls }, graveImg());
}
const span = (g) => lifespanText(ownStart(g.plant), g.deathDate);

export async function renderMemorial(root) {
  const graves = (await db.all('graves')).sort((a, b) => b.deathDate.localeCompare(a.deathDate));
  root.append(h('div', { class: 'memorial-head' }, graveImg('hdr'), h('div', null, h('h1', null, 'メモリアル'), h('p', { class: 'muted' }, '枯れてしまった植物の記録です。「枯死として記録」は各植物の詳細 → 情報タブから行えます。'))));
  if (!graves.length) { root.append(h('div', { class: 'empty' }, graveImg('big'), h('p', null, 'メモリアルはまだありません'))); return; }
  root.append(h('div', { class: 'pgrid' }, graves.map((g) => h('a', { class: 'pcard grave', href: `#/memorial/${g.id}` }, h('div', { class: 'pimg' }, gravePhoto(g, 'cover')),
    h('div', { class: 'ptxt' }, h('strong', null, g.name), h('small', { class: 'muted' }, `${fmtDate(g.deathDate)} 枯死`), h('small', null, '享年 ' + span(g)),
      h('div', { class: 'row gap wrap' }, g.causes.map((c) => h('span', { class: 'badge ' + (c.certainty === '確定' ? 'st-care' : '') }, `${c.cause}${c.certainty === '推測' ? '?' : ''}`))))))));
}

export async function renderGrave(root, id) {
  const g = await db.get('graves', id);
  if (!g) { root.append(empty('i_warn', '記録が見つかりません', h('a', { class: 'btn', href: '#/memorial' }, '戻る'))); return; }
  const s = g.species || {}; const start = ownStart(g.plant);
  const row = (k, v) => (v ? h('div', { class: 'kv' }, h('dt', null, k), h('dd', { class: 'pre' }, v)) : null);
  root.append(h('div', { class: 'page-head' }, h('a', { class: 'back', href: '#/memorial' }, '← メモリアル')),
    h('div', { class: 'detail-hero card grave' }, gravePhoto(g, 'hero'), h('div', null, h('h1', null, g.name), h('div', null, s.commonName), h('small', { class: 'muted sci' }, s.sciName || ''), h('div', { class: 'mt' }, h('span', { class: 'badge' }, `享年 ${span(g)}`)))),
    h('div', { class: 'card' }, h('h2', null, '記録'), h('dl', null,
      row('所有開始', start ? (start.approx ? `約 ${g.plant.purchaseYear}年 ${g.plant.purchaseSeason || ''}` : fmtDate(start.date)) : ''), row('枯死日', fmtDate(g.deathDate)), row('所有期間(享年)', span(g)),
      row('原因(確定=確定情報 / 推測)', g.causes.length ? g.causes.map((c) => `${c.cause}(${c.certainty})`).join('、') : '未入力'), row('原因メモ', g.causeNote), row('当時の育成環境', g.env), row('備考・反省点', g.notes))),
    h('div', { class: 'card' }, h('h2', null, '最後の管理記録'), (g.lastCare || []).length ? g.lastCare.slice(0, 10).map((l) => h('div', { class: 'log' }, h('strong', null, fmtDate(l.date)), ' ', h('span', { class: 'badge' }, l.kind === 'water' ? '水やり' : '肥料'), h('div', { class: 'muted' }, [l.method, l.amount, l.fertType, l.dilution].filter(Boolean).join(' / ')))) : h('p', { class: 'muted' }, '記録なし'),
      (g.repots || []).length ? [h('h3', null, '最後の植え替え'), g.repots.slice(0, 1).map((r) => h('div', { class: 'log' }, fmtDate(r.date) + ' ' + (r.recipeName || ''), h('div', { class: 'muted' }, mixLine(r.mix))))] : null),
    h('div', { class: 'card danger-zone row gap wrap' },
      h('button', { class: 'btn', onclick: async () => { if (await confirmBox('所持植物の一覧に戻します(状態は「療養中」になります)。', '戻す')) { const p = await reviveGrave(g); toast('所持植物に戻しました'); location.hash = `#/plants/${p.id}`; } } }, '所持植物に戻す(誤操作用)'),
      h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('この記録を完全に削除します。元に戻せません。', '削除', true)) { await db.del('graves', g.id); location.hash = '#/memorial'; } } }, '記録を削除')));
}
