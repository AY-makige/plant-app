// soil.js — 用土・配合管理(材料 / 配合レシピ / 植え替え履歴)
import { h, sprite, icon, empty, field, opt, modal, confirmBox, toast, photoInput, fmtDate, C } from './ui.js';
import { db, uid, MATERIAL_SPRITE } from './db.js';
import { loadCtx } from './data.js';

const COLORS = ['#b5651d', '#e2b93b', '#a98467', '#6b705c', '#f2efe9', '#8ecae6', '#588157', '#3a5a40', '#d4a373', '#9d8189'];
const colorOf = (mats, name) => COLORS[Math.max(0, mats.findIndex((m) => m.name === name)) % COLORS.length];

/** 配合エディタ(合計100%管理) */
function mixEditor(mats, initial) {
  let rows = (initial && initial.length ? initial : [{ material: mats[0] && mats[0].name, pct: 100 }]).map((r) => ({ ...r }));
  const el = h('div', { class: 'mix' }); const bar = h('div', { class: 'mixbar' }); const total = h('div', { class: 'mix-total' });
  const list = h('div');
  const sum = () => rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const refresh = () => {
    const t = sum(); total.textContent = `合計 ${t}%`; total.className = 'mix-total ' + (t === 100 ? 'ok' : 'ng');
    bar.innerHTML = ''; rows.forEach((r) => bar.append(h('span', { style: { width: Math.min(100, Number(r.pct) || 0) + '%', background: colorOf(mats, r.material) }, title: `${r.material} ${r.pct}%` })));
  };
  const draw = () => {
    list.innerHTML = '';
    rows.forEach((r, i) => list.append(h('div', { class: 'mix-row' },
      h('select', { 'aria-label': '用土の種類', onchange: (e) => { r.material = e.target.value; refresh(); } }, mats.map((m) => opt(m.name, m.name, r.material))),
      h('input', { type: 'number', min: 0, max: 100, step: 5, value: r.pct, 'aria-label': '割合(%)', oninput: (e) => { r.pct = Number(e.target.value); refresh(); } }), h('span', null, '%'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '行を削除', onclick: () => { rows.splice(i, 1); draw(); } }, '×'))));
    refresh();
  };
  const adj = () => { const t = sum(); if (!t) return; const sc = 100 / t; rows.forEach((r) => { r.pct = Math.round(r.pct * sc); }); const d = 100 - sum(); if (rows.length) rows[0].pct += d; draw(); };
  el.append(bar, list, h('div', { class: 'row between wrap' }, h('div', { class: 'row gap' }, h('button', { type: 'button', class: 'btn small', onclick: () => { rows.push({ material: mats[0] && mats[0].name, pct: 0 }); draw(); } }, '＋ 用土を追加'), h('button', { type: 'button', class: 'btn small ghost', onclick: adj }, '100%に調整')), total));
  draw();
  return { el, get mix() { return rows.filter((r) => r.material && Number(r.pct) > 0).map((r) => ({ material: r.material, pct: Number(r.pct) })); }, get total() { return sum(); }, set(m) { rows = m.map((x) => ({ ...x })); draw(); } };
}

export async function recipeModal(recipe, onDone) {
  const mats = await db.all('materials');
  modal(recipe ? '配合レシピを編集' : '配合レシピを作成', (b, close) => {
    const name = h('input', { type: 'text', value: recipe ? recipe.name : '', placeholder: '例: ドロセラ用 鹿沼土ブレンド' });
    const note = h('textarea', { rows: 2, placeholder: '備考(水はけ・用途など)' }, recipe ? recipe.note || '' : '');
    const ed = mixEditor(mats, recipe ? recipe.mix : null);
    b.append(field('配合名', name), h('p', { class: 'muted' }, '割合の合計が100%になるように入力します'), ed.el, field('備考', note),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'キャンセル'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!name.value.trim()) return toast('配合名を入力してください');
          if (ed.total !== 100) return toast(`割合の合計が ${ed.total}% です。100%にしてください`);
          await db.put('recipes', { ...(recipe || { id: uid(), createdAt: Date.now() }), name: name.value.trim(), mix: ed.mix, note: note.value });
          close(); toast('保存しました'); onDone && onDone();
        } }, '保存')));
  }, { wide: true });
}

/** 植え替えの記録(配合の選択/手入力、写真、レシピ保存) */
export async function repotModal(plant, preset, onDone) {
  const [mats, recipes, ctx] = await Promise.all([db.all('materials'), db.all('recipes'), loadCtx()]);
  modal('植え替え・用土を記録', (b, close) => {
    const plantSel = plant ? null : h('select', null, ctx.plants.map((p) => opt(p.id, ctx.names[p.id])));
    const date = h('input', { type: 'date', value: C.today() });
    const rSel = h('select', null, opt('', '手動で配合を入力'), recipes.map((r) => opt(r.id, r.name)));
    const ed = mixEditor(mats, preset || null);
    rSel.addEventListener('change', () => { const r = recipes.find((x) => x.id === rSel.value); if (r) ed.set(r.mix); });
    const pot = h('input', { type: 'text', placeholder: '例: 3.5号 プラ鉢' });
    const note = h('textarea', { rows: 2 }); const photo = photoInput('', '植え替え時の写真');
    const saveR = h('input', { type: 'checkbox' }); const rName = h('input', { type: 'text', placeholder: '新しいレシピ名' });
    b.append(plantSel ? field('植物', plantSel) : null, field('植え替え日', date), field('保存済みの配合を使う', rSel), ed.el,
      h('div', { class: 'grid2' }, field('鉢・サイズ', pot)), field('植え替え時の写真', photo.el), field('備考', note),
      h('label', { class: 'check' }, saveR, ' この配合を新しいレシピとして保存'), rName,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'キャンセル'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const pid = plant ? plant.id : plantSel.value; if (!pid) return toast('植物を選んでください');
          if (ed.mix.length && ed.total !== 100) return toast(`割合の合計が ${ed.total}% です。100%にしてください`);
          let recipeId = rSel.value, recipeName = (recipes.find((r) => r.id === recipeId) || {}).name || '';
          if (saveR.checked && ed.mix.length) { if (!rName.value.trim()) return toast('レシピ名を入力してください'); const r = await db.put('recipes', { id: uid(), name: rName.value.trim(), mix: ed.mix, note: '', createdAt: Date.now() }); recipeId = r.id; recipeName = r.name; }
          await db.put('repots', { id: uid(), plantId: pid, date: date.value || C.today(), recipeId, recipeName, mix: ed.mix, potSize: pot.value, note: note.value, photo: photo.value, ts: Date.now() });
          close(); toast('植え替えを記録しました'); onDone && onDone();
        } }, '記録する')));
  }, { wide: true });
}

const mixText = (mix) => (mix || []).map((m) => `${m.material} ${m.pct}%`).join(' / ');
const miniBar = (mats, mix) => h('div', { class: 'mixbar small' }, (mix || []).map((r) => h('span', { style: { width: r.pct + '%', background: colorOf(mats, r.material) }, title: `${r.material} ${r.pct}%` })));

export async function renderSoil(root) {
  const tab = sessionStorage.getItem('soilTab') || 'recipes';
  const [mats, recipes, repots, ctx] = await Promise.all([db.all('materials'), db.all('recipes'), db.all('repots'), loadCtx()]);
  const rerender = () => { root.innerHTML = ''; renderSoil(root); };
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['recipes', '配合レシピ'], ['materials', '用土の種類'], ['history', '植え替え履歴']].map(([k, l]) =>
    h('button', { class: 'tab' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': tab === k, onclick: () => { sessionStorage.setItem('soilTab', k); rerender(); } }, l)));
  const body = h('div');

  if (tab === 'recipes') {
    body.append(h('div', { class: 'row between' }, h('p', { class: 'muted' }, '配合を保存して、植え替え時に再利用できます'), h('button', { class: 'btn primary', onclick: () => recipeModal(null, rerender) }, '＋ 配合を作成')));
    if (!recipes.length) body.append(empty('soilbag', 'まだ配合レシピがありません'));
    for (const r of recipes.sort((a, b) => a.name.localeCompare(b.name, 'ja'))) {
      const used = [...new Set(repots.filter((x) => x.recipeId === r.id).map((x) => x.plantId))].map((id) => ctx.names[id]).filter(Boolean);
      body.append(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, r.name), h('div', { class: 'row gap' },
        h('button', { class: 'btn small', onclick: () => recipeModal(r, rerender) }, '編集'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmBox(`配合「${r.name}」を削除しますか?\n(植え替え履歴の配合内容は残ります)`, '削除', true)) { await db.del('recipes', r.id); rerender(); } } }, '削除'))),
        miniBar(mats, r.mix), h('div', { class: 'mix-legend' }, r.mix.map((m) => h('span', null, h('i', { style: { background: colorOf(mats, m.material) } }), `${m.material} ${m.pct}%`))),
        r.note ? h('p', { class: 'muted' }, r.note) : null, used.length ? h('small', { class: 'muted' }, '使用した植物: ' + used.join('、')) : null));
    }
  } else if (tab === 'materials') {
    const nm = h('input', { type: 'text', placeholder: '用土の名前(例: ゼオライト)', 'aria-label': '用土の名前' });
    body.append(h('div', { class: 'row gap' }, nm, h('button', { class: 'btn primary', onclick: async () => { const n = nm.value.trim(); if (!n) return; if (mats.some((m) => m.name === n)) return toast('すでに登録されています'); await db.put('materials', { id: uid(), name: n, builtin: false }); rerender(); } }, '追加')));
    body.append(h('div', { class: 'cards small' }, mats.map((m) => h('div', { class: 'card mat' }, MATERIAL_SPRITE[m.name] ? sprite(MATERIAL_SPRITE[m.name]) : h('div', { class: 'sprite ph' }, '＋'), h('strong', null, m.name),
      !m.builtin ? h('button', { class: 'icon-btn', 'aria-label': m.name + 'を削除', onclick: async () => { if (await confirmBox(`「${m.name}」を削除しますか?`, '削除', true)) { await db.del('materials', m.id); rerender(); } } }, '×') : h('small', { class: 'muted' }, '標準')))));
  } else {
    body.append(h('div', { class: 'row between' }, h('p', { class: 'muted' }, 'すべての個体の植え替え記録'), ctx.plants.length ? h('button', { class: 'btn primary', onclick: () => repotModal(null, null, rerender) }, '＋ 植え替えを記録') : null));
    const list = repots.sort((a, b) => b.date.localeCompare(a.date));
    if (!list.length) body.append(empty('terrarium', '植え替え記録はまだありません'));
    for (const r of list) {
      body.append(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('div', null, h('strong', null, fmtDate(r.date)), ' ', h('a', { href: `#/plants/${r.plantId}` }, ctx.names[r.plantId] || '(削除済みの植物)')),
        h('button', { class: 'icon-btn', 'aria-label': '削除', onclick: async () => { if (await confirmBox('この植え替え記録を削除しますか?', '削除', true)) { await db.del('repots', r.id); rerender(); } } }, icon('trash', 20))),
        r.recipeName ? h('div', null, '配合: ' + r.recipeName) : null, miniBar(mats, r.mix), h('small', { class: 'muted' }, mixText(r.mix)), r.potSize ? h('div', { class: 'muted' }, '鉢: ' + r.potSize) : null, r.note ? h('div', null, r.note) : null, r.photo ? h('img', { class: 'thumb', src: r.photo, alt: '植え替え時の写真' }) : null));
    }
  }
  root.append(h('div', { class: 'page-head' }, h('h1', null, '用土管理')), tabs, body);
}
