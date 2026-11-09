// soil.js — 用土・配合管理(材料 / 配合レシピ / 植え替え履歴)
import { h, sprite, icon, empty, field, opt, modal, confirmBox, toast, photoInput, fmtDate, normalizeMix, ratioText, mixLine, C } from './ui.js';
import { db, uid, MATERIAL_SPRITE } from './db.js';
import { loadCtx } from './data.js';

const COLORS = ['#b5651d', '#e2b93b', '#a98467', '#6b705c', '#f2efe9', '#8ecae6', '#588157', '#3a5a40', '#d4a373', '#9d8189'];
const colorOf = (mats, name) => { const i = mats.findIndex((m) => m.name === name); if (i >= 0) return COLORS[i % COLORS.length]; let hsh = 0; for (const ch of String(name)) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[hsh % COLORS.length]; };
const OTHER = '__other__';
/** 手入力で追加された用土を「用土の種類」に自動登録(次回からサンプルとして選べる) */
async function registerMats(names) {
  const have = new Set((await db.all('materials')).map((m) => m.name));
  for (const n of names) if (n && !have.has(n)) { await db.put('materials', { id: uid(), name: n, builtin: false }); have.add(n); }
}

/** 配合エディタ: 用土ごとに「部(比率)」を入力。例: 鹿沼土 3 / 軽石 2 / パーライト 2 → 3 : 2 : 2 */
function mixEditor(mats, initial) {
  const known = (n) => mats.some((m) => m.name === n);
  const mk = (r) => ({ material: r.material, parts: r.parts, custom: !!r.material && !known(r.material) });
  let rows = (initial && initial.length ? normalizeMix(initial) : [{ material: mats[0] && mats[0].name, parts: 1 }]).map(mk);
  const el = h('div', { class: 'mix' }); const bar = h('div', { class: 'mixbar' }); const ratio = h('div', { class: 'mix-total ok' });
  const list = h('div');
  const sum = () => rows.reduce((s, r) => s + (Number(r.parts) || 0), 0);
  const refresh = () => {
    const t = sum(); const live = rows.filter((r) => Number(r.parts) > 0);
    ratio.textContent = live.length ? `比率  ${live.map((r) => r.parts).join(' : ')}` : '比率を入力してください'; ratio.className = 'mix-total ' + (live.length ? 'ok' : 'ng');
    bar.innerHTML = ''; rows.forEach((r) => { if (t && Number(r.parts) > 0) bar.append(h('span', { style: { width: (r.parts / t) * 100 + '%', background: colorOf(mats, r.material || '?') }, title: `${r.material} ${r.parts}` })); });
  };
  const draw = () => {
    list.innerHTML = '';
    rows.forEach((r, i) => {
      const sel = h('select', { 'aria-label': '用土の種類(サンプルから選ぶ)', onchange: (e) => { if (e.target.value === OTHER) { r.custom = true; r.material = ''; draw(); setTimeout(() => { const t = list.querySelectorAll('.mix-custom input')[i]; t && t.focus(); }, 0); } else { r.custom = false; r.material = e.target.value; draw(); } } },
        h('optgroup', { label: 'サンプルから選ぶ' }, mats.map((m) => opt(m.name, m.name, r.custom ? null : r.material))),
        h('optgroup', { label: 'ほかの用土' }, h('option', { value: OTHER, selected: r.custom }, '✎ その他(手入力)')));
      list.append(h('div', { class: 'mix-block' }, h('div', { class: 'mix-row' }, sel,
        h('input', { type: 'number', min: 0.5, step: 0.5, value: r.parts, 'aria-label': '比率(部)', inputMode: 'decimal', oninput: (e) => { r.parts = Number(e.target.value); refresh(); } }), h('span', null, '部'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': '行を削除', onclick: () => { if (rows.length > 1) { rows.splice(i, 1); draw(); } } }, '×')),
        r.custom ? h('div', { class: 'mix-custom' }, h('input', { type: 'text', value: r.material, maxlength: 30, placeholder: '用土の名前を入力(例: ゼオライト)', 'aria-label': '用土の名前(手入力)', oninput: (e) => { r.material = e.target.value.trim(); refresh(); } }), h('small', { class: 'muted' }, '保存すると「用土の種類」に追加され、次回からサンプルとして選べます')) : null));
    });
    refresh();
  };
  el.append(bar, list, h('div', { class: 'row between wrap' }, h('div', { class: 'row gap wrap' },
    h('button', { type: 'button', class: 'btn small', onclick: () => { rows.push({ material: mats[0] && mats[0].name, parts: 1, custom: false }); draw(); } }, '＋ 用土を追加(サンプルから)'),
    h('button', { type: 'button', class: 'btn small', onclick: () => { rows.push({ material: '', parts: 1, custom: true }); draw(); setTimeout(() => { const t = list.querySelectorAll('.mix-custom input'); t.length && t[t.length - 1].focus(); }, 0); } }, '＋ その他(手入力)')), ratio));
  draw();
  return { el, get mix() { return rows.filter((r) => r.material && Number(r.parts) > 0).map((r) => ({ material: r.material, parts: Number(r.parts) })); }, get total() { return sum(); }, set(m) { rows = normalizeMix(m).map(mk); draw(); } };
}

export async function recipeModal(recipe, onDone) {
  const mats = await db.all('materials');
  modal(recipe ? '配合レシピを編集' : '配合レシピを作成', (b, close) => {
    const name = h('input', { type: 'text', value: recipe ? recipe.name : '', placeholder: '例: ドロセラ用 鹿沼土ブレンド' });
    const note = h('textarea', { rows: 2, placeholder: '備考(水はけ・用途など)' }, recipe ? recipe.note || '' : '');
    const ed = mixEditor(mats, recipe ? recipe.mix : null);
    b.append(field('配合名', name), h('p', { class: 'muted' }, '用土ごとに「部」で比率を入力します(例: 鹿沼土 3 ・ 軽石 2 ・ パーライト 2 → 3 : 2 : 2)'), ed.el, field('備考', note),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'キャンセル'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!name.value.trim()) return toast('配合名を入力してください');
          if (!ed.mix.length) return toast('用土と比率(1以上)を入力してください');
          await registerMats(ed.mix.map((m) => m.material));
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
          let recipeId = rSel.value, recipeName = (recipes.find((r) => r.id === recipeId) || {}).name || '';
          await registerMats(ed.mix.map((m) => m.material));
          if (saveR.checked && ed.mix.length) { if (!rName.value.trim()) return toast('レシピ名を入力してください'); const r = await db.put('recipes', { id: uid(), name: rName.value.trim(), mix: ed.mix, note: '', createdAt: Date.now() }); recipeId = r.id; recipeName = r.name; }
          await db.put('repots', { id: uid(), plantId: pid, date: date.value || C.today(), recipeId, recipeName, mix: ed.mix, potSize: pot.value, note: note.value, photo: photo.value, ts: Date.now() });
          close(); toast('植え替えを記録しました'); onDone && onDone();
        } }, '記録する')));
  }, { wide: true });
}

const mixText = (mix) => mixLine(mix);
/** 各植物の「現在の用土」= 配合が入力された最新の植え替え記録 */
export function currentSoilMap(repots) {
  const m = new Map();
  for (const r of [...repots].sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0))) if ((r.mix || []).length) m.set(r.plantId, r);
  return m;
}
export const openSoilTab = (tab) => { try { sessionStorage.setItem('soilTab', tab); } catch (e) { /* noop */ } };
const plantLinks = (ids, names, max = 6) => { const ok = ids.filter((id) => names[id]); return [ok.slice(0, max).map((id) => h('a', { href: `#/plants/${id}` }, names[id])), ok.length > max ? h('small', { class: 'muted' }, `ほか${ok.length - max}件`) : null]; };
const miniBar = (mats, mix) => { const n = normalizeMix(mix); const t = n.reduce((a, r) => a + r.parts, 0) || 1; return h('div', { class: 'mixbar small' }, n.map((r) => h('span', { style: { width: (r.parts / t) * 100 + '%', background: colorOf(mats, r.material) }, title: `${r.material} ${r.parts}` }))); };

/** 植物詳細に表示する「使用している用土」カード(最新の植え替え記録を表示) */
export function soilCard(plant, repots, mats, onChange) {
  const last = [...repots].sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0)).find((r) => (r.mix || []).length) || [...repots][0];
  const card = h('div', { class: 'card soil-card' }, h('div', { class: 'row between' }, h('h2', null, '使用している用土'), h('a', { class: 'link-s', href: '#/soil', onclick: () => openSoilTab('recipes') }, '用土タブで管理')));
  if (!last || !(last.mix || []).length) card.append(h('p', { class: 'muted' }, last ? '植え替えは記録済みですが、用土の配合が未入力です。' : 'まだ用土が記録されていません。'));
  else card.append(h('div', { class: 'soil-now' },
    h('div', { class: 'soil-sprites' }, last.mix.slice(0, 5).map((m) => (MATERIAL_SPRITE[m.material] ? sprite(MATERIAL_SPRITE[m.material], 'soil-sp') : null))),
    h('div', { class: 'ratio-big' }, ratioText(last.mix)), last.recipeName ? h('a', { class: 'recipe-link', href: '#/soil', onclick: () => openSoilTab('recipes') }, h('strong', null, last.recipeName + ' ›')) : h('strong', null, '手動配合'),
    miniBar(mats, last.mix), h('div', { class: 'mix-legend' }, normalizeMix(last.mix).map((m) => h('span', null, h('i', { style: { background: colorOf(mats, m.material) } }), `${m.material} ${m.parts}`))),
    h('small', { class: 'muted' }, `植え替え日 ${fmtDate(last.date)}${last.potSize ? ' ・ 鉢: ' + last.potSize : ''}`)));
  card.append(h('div', { class: 'btn-row left' }, h('button', { class: 'btn small', type: 'button', onclick: () => repotModal(plant, last && last.mix ? last.mix : null, onChange) }, h('span', null, last ? '用土を変更・植え替えを記録' : '用土を記録'))));
  return card;
}

export async function renderSoil(root) {
  const tab = sessionStorage.getItem('soilTab') || 'recipes';
  const [mats, recipes, repots, ctx] = await Promise.all([db.all('materials'), db.all('recipes'), db.all('repots'), loadCtx()]);
  const rerender = () => { root.innerHTML = ''; renderSoil(root); };
  const cur = currentSoilMap(repots);
  const usersOfRecipe = (id) => [...cur.entries()].filter(([, r]) => r.recipeId === id).map(([pid]) => pid);
  const usersOfMat = (n) => [...cur.entries()].filter(([, r]) => (r.mix || []).some((x) => x.material === n)).map(([pid]) => pid);
  const toLibrary = (val) => { try { sessionStorage.setItem('libSoil', val); } catch (e) { /* noop */ } location.hash = '#/plants'; };
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['recipes', '配合レシピ'], ['materials', '用土の種類'], ['history', '植え替え履歴']].map(([k, l]) =>
    h('button', { class: 'tab' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': tab === k, onclick: () => { sessionStorage.setItem('soilTab', k); rerender(); } }, l)));
  const body = h('div');

  if (tab === 'recipes') {
    body.append(h('div', { class: 'row between' }, h('p', { class: 'muted' }, '配合に名前を付けて保存すると、植え替え時に選ぶだけで使えます'), h('button', { class: 'btn primary', onclick: () => recipeModal(null, rerender) }, '＋ 配合を保存')));
    if (!recipes.length) body.append(empty('soilbag', 'まだ配合レシピがありません'));
    for (const r of recipes.sort((a, b) => a.name.localeCompare(b.name, 'ja'))) {
      const used = usersOfRecipe(r.id).filter((id) => ctx.names[id]);
      body.append(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, r.name), h('div', { class: 'row gap' },
        h('button', { class: 'btn small', onclick: () => recipeModal(r, rerender) }, '編集'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmBox(`配合「${r.name}」を削除しますか?\n(植え替え履歴の配合内容は残ります)`, '削除', true)) { await db.del('recipes', r.id); rerender(); } } }, '削除'))),
        h('div', { class: 'ratio-big' }, ratioText(r.mix)), miniBar(mats, r.mix), h('div', { class: 'mix-legend' }, normalizeMix(r.mix).map((m) => h('span', null, h('i', { style: { background: colorOf(mats, m.material) } }), `${m.material} ${m.parts}`))),
        r.note ? h('p', { class: 'muted' }, r.note) : null,
        h('div', { class: 'recipe-use' }, h('small', null, '使っている植物:'), used.length ? [plantLinks(used, ctx.names), h('button', { class: 'btn small ghost', type: 'button', onclick: () => toLibrary('r:' + r.id) }, 'ライブラリーで絞り込む')] : h('small', null, 'まだありません(植え替え記録でこの配合を選ぶと表示されます)'))));
    }
  } else if (tab === 'materials') {
    const nm = h('input', { type: 'text', placeholder: '用土の名前(例: ゼオライト)', 'aria-label': '用土の名前' });
    body.append(h('div', { class: 'row gap' }, nm, h('button', { class: 'btn primary', onclick: async () => { const n = nm.value.trim(); if (!n) return; if (mats.some((m) => m.name === n)) return toast('すでに登録されています'); await db.put('materials', { id: uid(), name: n, builtin: false }); rerender(); } }, '追加')));
    body.append(h('div', { class: 'cards small' }, mats.map((m) => h('div', { class: 'card mat' }, MATERIAL_SPRITE[m.name] ? sprite(MATERIAL_SPRITE[m.name]) : h('div', { class: 'sprite ph' }, '＋'), h('strong', null, m.name), (() => { const u = usersOfMat(m.name); return u.length ? h('div', { class: 'mat-use' }, plantLinks(u, ctx.names, 3), h('a', { href: '#/plants', onclick: () => { try { sessionStorage.setItem('libSoil', 'm:' + m.name); } catch (e) { /* noop */ } } }, '一覧で見る')) : null; })(),
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
  root.append(h('div', { class: 'page-head' }, h('h1', null, '用土'), h('span', { class: 'count' }, `${recipes.length}配合 / ${mats.length}種`)), tabs, body);
}
