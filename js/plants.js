// plants.js — ライブラリー(一覧・詳細・登録/編集)
import { h, sprite, icon, empty, field, opt, monthChips, mixLine, modal, confirmBox, toast, photoInput, fmtDate, relDays, stageClass, ownStart, lifespanText, PLANT_SPRITES, SPRITE_GROUPS, resolveSprite, MONTHS, C } from './ui.js';
import { db, uid } from './db.js';
import { loadCtx, deleteLog, deletePlant } from './data.js';
import { googleUrl, aiPrompt, openAiSearch, imageUrl, RESEARCH_ITEMS, FIELDS, ENVS, getEnv, setEnv, speciesQuery, openTab, geminiConfig, geminiLookup, toFormValues } from './search.js';
import { careModal } from './care.js';
import { repotModal, soilCard, currentSoilMap } from './soil.js';
import { graveForm } from './memorial.js';

export const CYCLE = [['growth', '成長期', 'growth'], ['dormant', '休眠期', 'dormant'], ['fertSlow', '追肥推奨期(遅効性)', 'fertslow'], ['fertLiquid', '液肥推奨期', 'fertliq'], ['bloom', '開花予定', 'bloom'], ['repot', '植え替え推奨', 'repot']];
export const STATUSES = ['育成中', '成長中', '休眠中', '療養中', 'その他'];  // 育成中=通常の状態 / 成長中=成長期 / 休眠中=休眠期

function statusModal(p, onDone) {
  modal('状態を変更', (b, close) => {
    b.append(h('p', { class: 'muted' }, '育成中=通常の状態 / 成長中=成長期 / 休眠中=休眠期'), h('div', { class: 'status-list' }, STATUSES.map((s) => h('button', { class: 'btn' + (p.status === s ? ' primary' : ''), type: 'button', onclick: async () => {
      if (s === '休眠中' && p.status !== '休眠中') p.prevStatus = p.status;
      p.status = s; await db.put('plants', p); close(); toast(`状態を「${s}」にしました`); onDone && onDone();
    } }, s))));
  });
}

/** 屋内/屋外の切替(AI検索・自動入力の前提条件。端末に保存) */
function envToggle() {
  const sel = h('select', { class: 'env-sel', 'aria-label': '栽培環境(屋内/屋外)' }, ENVS.map(([k, l]) => h('option', { value: k }, l)));
  sel.value = getEnv();
  sel.addEventListener('change', () => { setEnv(sel.value); document.querySelectorAll('.env-sel').forEach((el) => { el.value = sel.value; }); });
  return sel;
}
const LOCS = [['indoor', '屋内'], ['outdoor', '屋外']];
const locLabel = (v) => (LOCS.find((x) => x[0] === v) || [, ''])[1];

export function avatar(p, cls = '') {
  if (p.photo) return h('img', { src: p.photo, alt: '', class: 'avatar ' + cls });
  return h('div', { class: 'avatar sprite-av ' + cls }, sprite(p.sprite || 'i_leaf'));
}
const statusBadge = (s) => h('span', { class: 'badge st-' + ({ 育成中: 'grow', 成長中: 'grow', 休眠中: 'dorm', 療養中: 'care', その他: 'other' }[s] || 'other') }, s || '—');

/* ───────── 一覧 ───────── */
export async function renderList(root) {
  const ctx = await loadCtx();
  const f = { st: '', loc: '', soil: '' };
  const [repAll, recAll, matAll] = await Promise.all([db.all('repots'), db.all('recipes'), db.all('materials')]);
  const curSoil = currentSoilMap(repAll);
  try { f.soil = sessionStorage.getItem('libSoil') || ''; sessionStorage.removeItem('libSoil'); } catch (e) { /* noop */ }
  const q = h('input', { type: 'search', placeholder: '名前・学名・産地で検索', 'aria-label': '検索' });
  const chipRow = h('div', { class: 'chips scroll', 'aria-label': '絞り込み' });
  const SIZES = [['l', '大'], ['m', '中'], ['s', '小'], ['list', 'リスト']];
  const getSize = () => { try { const v = localStorage.getItem('pk-tile'); return SIZES.some((x) => x[0] === v) ? v : 'l'; } catch (e) { return 'l'; } };
  const grid = h('div', { class: 'pgrid' }); grid.dataset.size = getSize();
  const sizeSeg = h('div', { class: 'seg tile-seg', role: 'radiogroup', 'aria-label': '表示サイズ' }, SIZES.map(([k, l]) => h('button', { type: 'button', class: 'seg-b' + (grid.dataset.size === k ? ' on' : ''), role: 'radio', 'aria-checked': grid.dataset.size === k, onclick: (e) => { grid.dataset.size = k; try { localStorage.setItem('pk-tile', k); } catch (er) { /* noop */ } [...sizeSeg.children].forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); } }, l)));
  const ext = h('div', { class: 'ext-search' });
  const drawExt = () => {
    ext.innerHTML = ''; const kw = q.value.trim(); if (!kw) return;
    ext.append(h('span', { class: 'muted' }, `「${kw}」をネットで調べる`), envToggle(), h('button', { class: 'btn small', type: 'button', onclick: () => openTab(googleUrl(speciesQuery(kw))) }, icon('search', 16), 'Google検索'), h('button', { class: 'btn small', type: 'button', onclick: () => openAiSearch(kw, toast) }, icon('sparkle', 16), 'AIモード'), h('a', { class: 'btn small primary', href: `#/plants/new?name=${encodeURIComponent(kw)}` }, icon('plus', 16), 'この名前で登録'));
  };
  const drawChips = () => {
    chipRow.innerHTML = '';
    const mk = (key, val, label) => h('button', { class: 'chip-btn' + (f[key] === val ? ' on' : ''), type: 'button', onclick: () => { f[key] = f[key] === val && val !== '' ? '' : val; drawChips(); draw(); } }, label);
    chipRow.append(mk('st', '', 'すべて'), STATUSES.map((s) => mk('st', s, s)));
  };
  const draw = () => {
    grid.innerHTML = ''; drawExt();
    const kw = q.value.trim().toLowerCase();
    const list = ctx.plants.filter((p) => {
      const s = ctx.sp[p.speciesId] || {};
      if (f.st && p.status !== f.st) return false;
      if (f.loc && p.location !== f.loc) return false;
      if (f.soil) { const r = curSoil.get(p.id); if (!r) return false; if (f.soil.startsWith('r:') ? r.recipeId !== f.soil.slice(2) : !(r.mix || []).some((x) => x.material === f.soil.slice(2))) return false; }
      if (!kw) return true;
      return [p.nickname, s.commonName, s.sciName, s.origin, p.notes].join(' ').toLowerCase().includes(kw);
    });
    if (!list.length) { grid.append(empty('terrarium', ctx.plants.length ? '条件に合う植物がありません' : 'まだ植物が登録されていません', ctx.plants.length ? null : h('a', { class: 'btn primary', href: '#/plants/new' }, '最初の植物を登録'))); return; }
    for (const p of list) {
      const s = ctx.sp[p.speciesId] || {}; const w = C.nextDue(p, 'water'); const dl = w.date ? C.diffDays(w.date, C.today()) : null;
      grid.append(h('a', { class: 'pcard', href: `#/plants/${p.id}` },
        h('div', { class: 'pimg' }, avatar(p, 'cover'), statusBadge(p.status),
          dl != null ? h('span', { class: 'pdue' + stageClass('water', dl) }, icon('drop', 13), relDays(dl, 'water')) : w.stopped ? h('span', { class: 'pdue' }, '水やり停止中') : null),
        h('div', { class: 'ptxt' }, h('strong', null, ctx.names[p.id]), h('small', null, s.commonName && s.commonName !== ctx.names[p.id] ? s.commonName : s.sciName || ''))));
    }
  };
  q.addEventListener('input', draw);
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'ライブラリー'), h('span', { class: 'count' }, `${ctx.plants.length}株 / ${ctx.species.length}種`)),
    h('div', { class: 'searchbar' }, q), ext,
    h('label', { class: 'loc-filter' }, h('span', null, '栽培場所'), (() => { const sel = h('select', { 'aria-label': '栽培場所で絞り込み' }, h('option', { value: '' }, 'すべて'), LOCS.map(([k, l]) => h('option', { value: k }, l))); sel.addEventListener('change', () => { f.loc = sel.value; draw(); }); return sel; })()),
    h('div', { class: 'size-row' }, h('span', { class: 'muted' }, '表示サイズ'), sizeSeg),
    h('label', { class: 'loc-filter soil-filter' }, h('span', null, '用土'), (() => { const sel = h('select', { 'aria-label': '用土で絞り込み' }, h('option', { value: '' }, 'すべて'),
      recAll.length ? h('optgroup', { label: '配合レシピ' }, recAll.map((r) => h('option', { value: 'r:' + r.id }, r.name))) : null,
      h('optgroup', { label: '用土の種類' }, matAll.map((m) => h('option', { value: 'm:' + m.name }, m.name)))); sel.value = f.soil; sel.addEventListener('change', () => { f.soil = sel.value; draw(); }); return sel; })()),
    chipRow, grid,
    h('a', { class: 'fab', href: '#/plants/new', 'aria-label': '植物を新規登録' }, icon('plus', 28)));
  drawChips(); draw();
}

/* ───────── 詳細 ───────── */
let detailTab = 'care';
export async function renderDetail(root, id) {
  const ctx = await loadCtx();
  const p = ctx.plants.find((x) => x.id === id);
  if (!p) { root.append(empty('i_warn', '植物が見つかりません', h('a', { class: 'btn', href: '#/plants' }, 'ライブラリーへ戻る'))); return; }
  const s = ctx.sp[p.speciesId] || {};
  const reload = () => { const y = window.scrollY; root.innerHTML = ''; renderDetail(root, id).then(() => window.scrollTo(0, y)); };
  const [logs, repots, fc, mats] = await Promise.all([db.byPlant('logs', id), db.byPlant('repots', id), db.kvGet('forecast', null), db.all('materials')]);
  logs.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts); repots.sort((a, b) => b.date.localeCompare(a.date));
  const warns = fc ? C.computeWarnings([p], ctx.names, fc.data.daily, 3) : [];
  const dorm = C.isDormant(p); const start = ownStart(p);

  const sched = (kind) => {
    const n = C.nextDue(p, kind); const cfg = p[kind === 'water' ? 'water' : 'fert'] || {};
    const label = kind === 'water' ? '水やり' : '液体肥料'; const dl = n.date ? C.diffDays(n.date, C.today()) : null;
    return h('div', { class: 'card sched' }, h('div', { class: 'row between' }, h('h3', { class: 'kind ' + kind }, icon(kind === 'water' ? 'drop' : 'flask', 18), label), h('div', { class: 'row gap' }, dorm ? h('span', { class: 'badge st-dorm' }, '休眠期設定') : null,
        h('a', { class: 'icon-btn sm', href: `#/plants/${p.id}/edit`, 'aria-label': `${label}の設定を編集`, title: '編集', onclick: () => { try { sessionStorage.setItem('editFocus', kind); } catch (e) { /* noop */ } } }, icon('edit', 18)))),
      n.stopped ? h('p', { class: 'muted' }, '休眠期のため停止中') : !n.date ? h('p', { class: 'muted' }, '間隔が未設定です(編集で設定)') :
        h('div', null, h('div', { class: 'big-date' }, fmtDate(n.date), h('small', null, ` (${relDays(dl, kind)})`)),
          h('small', { class: 'muted' }, `${n.interval}日ごと / 最終: ${cfg.last ? fmtDate(cfg.last) : '未記録'}`)),
      kind === 'water' ? h('small', { class: 'muted' }, `量・方法: ${C.effWater(p).amount || '—'}`) : h('small', { class: 'muted' }, `${cfg.type || '—'}${cfg.dilution ? ' / ' + cfg.dilution : ''}${cfg.amount ? ' / ' + cfg.amount : ''}`));
  };
  const row = (k, v) => (v || v === 0 ? h('div', { class: 'kv' }, h('dt', null, k), h('dd', null, v)) : null);
  const temp = (v) => (v !== '' && v != null ? `${v}℃` : '未設定');
  const qa = (ic, label, fn, cls = '') => h('button', { class: 'qa ' + cls, type: 'button', onclick: fn }, h('span', { class: 'qa-ic' }, icon(ic, 24)), h('span', null, label));

  const tabs = { care: '', info: '', history: '' };
  const panel = h('div', { class: 'tab-panel' });
  const drawPanel = () => {
    panel.innerHTML = '';
    if (detailTab === 'care') panel.append(
      warns.length ? h('div', { class: 'alerts' }, warns.map((w) => h('div', { class: 'warn ' + w.level }, h('strong', null, w.label), ' ', w.msg))) : null,
      h('div', { class: 'grid-auto' }, sched('water'), sched('fert')),
      soilCard(p, repots, mats, reload),
      h('div', { class: 'card' }, h('h2', null, '成長サイクル(種類共通)'), cycleBars(s)));
    else if (detailTab === 'info') panel.append(
      h('div', { class: 'card' }, h('h2', null, '基本情報'), h('dl', null,
        row('原産地・生息地', s.origin), row('適温', s.tempOpt), row('最低〜最高温度', [s.tempMin, s.tempMax].some((x) => x !== '' && x != null) ? `${s.tempMin ?? '—'}℃ 〜 ${s.tempMax ?? '—'}℃` : ''),
        row('湿度', s.humidity), row('日照', s.light), row('水分条件', s.moisture), row('追肥(遅効性肥料)', s.slowFert), row('液肥(ハイポネックス)', s.liquidDilution),
        row('購入時期', p.purchaseDate ? fmtDate(p.purchaseDate) : p.purchaseYear ? `${p.purchaseYear}年 ${p.purchaseSeason || ''}` : ''), row('所有期間', start ? lifespanText(start, C.today()) : ''),
        row('栽培場所', locLabel(p.location)), row('購入価格', p.price ? `¥${Number(p.price).toLocaleString()}` : ''), row('購入先', p.shop), row('状態メモ', p.statusNote), row('備考', p.notes))),
      h('div', { class: 'card' }, h('h2', null, '温度設定(温度警告に使用)'), h('dl', null, row('屋外管理の最低温度', temp(p.outdoorMin)), row('室内取り込み目安', temp(p.indoorTemp)), row('高温注意温度', temp(p.highTemp)))),
      h('div', { class: 'card danger-zone' }, h('h2', null, '植物の終了'),
        h('p', { class: 'muted' }, '枯れてしまった場合は「削除」ではなくメモリアルへ移動すると、記録として残せます。'),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn', onclick: () => graveForm(p, s, ctx.names, () => { location.hash = '#/memorial'; }) }, icon('grave', 20), '枯死として記録'),
          h('button', { class: 'btn danger', onclick: async () => {
            if (await confirmBox(`「${ctx.names[p.id]}」を完全に削除します。\n水やり・施肥・植え替えの履歴も一緒に削除され、元に戻せません。\n(枯れた場合はメモリアルへの移動をおすすめします)`, '完全に削除', true)) { await deletePlant(id, true); toast('削除しました'); location.hash = '#/plants'; }
          } }, '完全に削除'))));
    else panel.append(
      h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', null, '植え替え・用土履歴'), h('button', { class: 'btn small', onclick: () => repotModal(p, null, reload) }, '＋ 記録')),
        repots.length ? repots.map((r) => h('div', { class: 'log' }, h('strong', null, fmtDate(r.date)), ' ', h('span', null, r.recipeName || '配合記録なし'), h('div', { class: 'muted' }, mixLine(r.mix)), r.potSize ? h('div', { class: 'muted' }, '鉢: ' + r.potSize) : null, r.note ? h('div', null, r.note) : null, r.photo ? h('img', { class: 'thumb', src: r.photo, alt: '' }) : null)) : h('p', { class: 'muted' }, '記録なし')),
      h('div', { class: 'card' }, h('h2', null, `実施履歴(${logs.length}件)`),
        logs.length ? logs.slice(0, 60).map((l) => h('div', { class: 'log row between' }, h('div', null, h('strong', null, `${fmtDate(l.date)} ${l.time || ''}`), ' ', h('span', { class: 'kind ' + l.kind }, icon(l.kind === 'water' ? 'drop' : 'flask', 14), l.kind === 'water' ? '水やり' : '肥料'), l.dormant ? h('span', { class: 'badge st-dorm' }, '休眠期') : null,
          h('div', { class: 'muted' }, [l.method, l.amount, l.fertType, l.dilution].filter(Boolean).join(' / ')), l.note ? h('div', null, l.note) : null),
        h('button', { class: 'icon-btn', 'aria-label': '履歴を削除', onclick: async () => { if (await confirmBox('この履歴を削除します。最終実施日・次回予定日は残りの履歴から再計算されます。', '削除', true)) { await deleteLog(l); reload(); } } }, icon('trash', 20)))) : h('p', { class: 'muted' }, '記録なし')));
  };
  const seg = h('div', { class: 'seg', role: 'tablist' }, [['care', 'ケア'], ['info', '情報'], ['history', `履歴`]].map(([k, l]) =>
    h('button', { class: 'seg-b' + (detailTab === k ? ' on' : ''), role: 'tab', 'aria-selected': detailTab === k, onclick: (e) => { detailTab = k; [...seg.children].forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-selected', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-selected', 'true'); drawPanel(); } }, l)));

  root.append(
    h('div', { class: 'd-hero' }, avatar(p, 'dh'),
      h('a', { class: 'fl-btn left', href: '#/plants', 'aria-label': 'ライブラリーへ戻る' }, icon('back', 22)),
      h('a', { class: 'fl-btn right', href: `#/plants/${id}/edit`, 'aria-label': '編集' }, icon('edit', 20))),
    h('div', { class: 'd-sheet' },
      h('h1', null, ctx.names[p.id]), h('div', { class: 'd-sub' }, s.commonName && s.commonName !== ctx.names[p.id] ? s.commonName + ' ・ ' : '', h('i', null, s.sciName || '')),
      h('div', { class: 'row gap wrap mt' }, h('button', { class: 'status-btn', type: 'button', 'aria-label': '状態を変更', onclick: () => statusModal(p, reload) }, statusBadge(p.status), h('span', { class: 'chg' }, '変更'))),
      h('div', { class: 'qas' },
        qa('drop', '水やり', () => careModal(p, 'water', reload), 'water'), qa('flask', '肥料', () => careModal(p, 'fert', reload), 'fert'),
        qa(dorm ? 'sun' : 'snow', dorm ? '休眠を解除' : '休眠期へ', async () => { if (dorm) { p.status = p.prevStatus && p.prevStatus !== '休眠中' ? p.prevStatus : '育成中'; } else { p.prevStatus = p.status; p.status = '休眠中'; } await db.put('plants', p); toast(dorm ? `「${p.status}」に戻しました(通常の水やり設定)` : '休眠期モードにしました'); reload(); }, 'dorm'),
        qa('pot', '植え替え', () => repotModal(p, null, reload), 'pot')),
      seg, panel));
  drawPanel();
}

/** 「追肥推奨期(遅効性)」のように括弧つきのラベルは、括弧の手前で改行して2行表示にする */
const cyLabel = (label) => { const i = label.indexOf('('); return i > 0 ? [label.slice(0, i), h('br'), label.slice(i)] : label; };
export function cycleBars(s) {
  const c = s.cycle || {};
  return h('div', { class: 'cycle' }, CYCLE.map(([k, label, cls]) => h('div', { class: 'cy-row' }, h('span', { class: 'cy-l' }, cyLabel(label)),
    h('div', { class: 'cy-bar' }, MONTHS.map((m, i) => h('span', { class: 'cy-c ' + ((c[k] || []).includes(i + 1) ? 'on ' + cls : ''), title: m }, i + 1))))));
}

/* ───────── 登録・編集フォーム ───────── */
export async function renderForm(root, id, params) {
  const ctx = await loadCtx();
  const editing = id ? ctx.plants.find((x) => x.id === id) : null;
  if (id && !editing) { root.append(empty('i_warn', '植物が見つかりません')); return; }
  const p = editing || { status: '育成中', water: { last: C.today() }, fert: { stopInDormant: true, last: '' } };
  let sp = ctx.sp[p.speciesId] || { cycle: {}, commonName: (!editing && params && params.get('name')) || '' };
  const gcfg = await geminiConfig();
  const photo = photoInput(p.photo);
  let spriteSel = resolveSprite(p.sprite || ''); if (!PLANT_SPRITES.some((x) => x[0] === spriteSel)) spriteSel = '';

  const form = h('form', { class: 'form', onsubmit: (e) => e.preventDefault() });
  const v = (n, val = '', type = 'text', extra = {}) => h('input', { type, name: n, value: val ?? '', ...extra });
  const spSelect = h('select', { name: 'speciesId' }, opt('', '＋ 新しい種類として登録'), ctx.species.sort((a, b) => a.commonName.localeCompare(b.commonName, 'ja')).map((s) => opt(s.id, s.commonName, p.speciesId)));
  const spOpts = new Map();
  const pickSprite = (sid) => { spriteSel = sid; spOpts.forEach((el, k) => el.classList.toggle('sel', k === sid)); };
  const catOf = (sid) => Math.max(0, SPRITE_GROUPS.findIndex(([, list]) => list.some((x) => x[0] === sid)));
  let spCat = catOf(spriteSel);
  const spGroups = SPRITE_GROUPS.map(([gname, list]) => h('div', { class: 'sprite-grid', role: 'radiogroup', 'aria-label': gname }, list.map(([sid]) => {
    // 名前は画面に出さない(自動選択用の内部データは ui.js の SPRITE_DATA)
    const b = h('button', { type: 'button', class: 'sp-opt' + (spriteSel === sid ? ' sel' : ''), 'aria-label': 'イラスト', onclick: () => pickSprite(spriteSel === sid ? '' : sid) }, sprite(sid));
    spOpts.set(sid, b); return b;
  })));
  const catSeg = h('div', { class: 'seg sp-cat', role: 'tablist', 'aria-label': 'イラストの種類' }, SPRITE_GROUPS.map(([gname], i) => h('button', { type: 'button', class: 'seg-b', role: 'tab', onclick: () => showCat(i) }, gname)));
  const showCat = (i) => {
    spCat = i; spGroups.forEach((g, k) => { g.hidden = k !== i; });
    [...catSeg.children].forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
  };
  const spriteGrid = h('div', { class: 'sprite-picker' }, h('div', { class: 'sp-cat-label' }, 'おおまかな種類'), catSeg, h('div', { class: 'sprite-scroll' }, spGroups));
  showCat(spCat);

  const speciesFields = () => {
    const wrap = h('div', { id: 'species-fields' });
    wrap.append(
      field('正式名称・学名', v('sciName', sp.sciName, 'text', { placeholder: '例: Dionaea muscipula' })),
      field('本来の生息地・原産地', v('origin', sp.origin, 'text', { placeholder: '例: 北米(ノースカロライナ州)の湿地' })),
      h('div', { class: 'grid3' }, field('適温', v('tempOpt', sp.tempOpt, 'text', { placeholder: '例: 15〜28℃' })), field('最低温度(℃)', v('tempMin', sp.tempMin, 'number', { step: '0.5' })), field('最高温度(℃)', v('tempMax', sp.tempMax, 'number', { step: '0.5' }))),
      h('div', { class: 'grid3' }, field('湿度', v('humidity', sp.humidity, 'text', { placeholder: '例: 60〜80%' })), field('日照条件', v('light', sp.light, 'text', { placeholder: '例: 日なた・直射日光' })), field('水分条件', v('moisture', sp.moisture, 'text', { placeholder: '例: 常に湿らせる' }))),
      h('div', { class: 'grid2' }, field('追肥(遅効性肥料)の目安', v('slowFert', sp.slowFert, 'text', { placeholder: '例: 置き肥を月1回・小粒3〜5個' })), field('液肥(ハイポネックス)の希釈', v('liquidDilution', sp.liquidDilution, 'text', { placeholder: '例: 1000倍・2週間に1回' }))),
      h('p', { class: 'muted' }, '成長サイクル・肥料推奨期(月をタップして選択。カレンダーに表示されます)'),
      CYCLE.map(([k, label]) => h('div', { class: 'cy-edit' }, h('strong', null, cyLabel(label)), monthChips('cycle_' + k, (sp.cycle || {})[k] || []))),
      editing ? h('p', { class: 'note' }, 'ℹ この種類を共有する他の個体にも、種類情報・成長サイクルの変更が反映されます。') : null);
    return wrap;
  };
  let spWrap = speciesFields();
  // 流通名に合うイラストを自動で選ぶ(未選択のときだけ。後から自由に変更できます)
  form.addEventListener('input', (e) => {
    if (!e.target || e.target.name !== 'commonName' || spriteSel) return;
    const name = e.target.value.trim(); if (name.length < 2) return;
    const hit = PLANT_SPRITES.find(([, lab]) => name === lab || name.includes(lab.replace(/\(.*\)$/, '')));
    if (hit) { pickSprite(hit[0]); if (catOf(hit[0]) !== spCat) showCat(catOf(hit[0])); const el = spOpts.get(hit[0]); el && el.scrollIntoView && el.scrollIntoView({ block: 'nearest' }); }
  });
  spSelect.addEventListener('change', () => {
    sp = ctx.sp[spSelect.value] || { cycle: {} };
    if (form.elements.commonName) form.elements.commonName.value = sp.commonName || ''; // 選んだ種類の流通名を反映
    const nw = speciesFields(); spWrap.replaceWith(nw); spWrap = nw;
    const d = sp.defaults; // 種類の既定値を個体の設定へ
    if (d && !editing) { const set = (n, val) => { const el = form.elements[n]; if (el && val != null) el.value = val; }; ['outdoorMin', 'indoorTemp', 'highTemp'].forEach((k) => set(k, (d.temps || {})[k])); set('w_interval', (d.water || {}).interval); set('w_amount', (d.water || {}).amount); set('w_dormantInterval', (d.water || {}).dormantInterval); set('w_dormantAmount', (d.water || {}).dormantAmount); set('f_interval', (d.fert || {}).interval); set('f_type', (d.fert || {}).type); set('f_dilution', (d.fert || {}).dilution); set('f_amount', (d.fert || {}).amount); toast('この種類の前回設定を引き継ぎました'); }
  });


  /* ネット検索 / AI自動入力 */
  const aiOut = h('div', { class: 'ai-out' });
  /** 検索文(コピー用)を画面に表示。clipboard にも自動コピー */
  const copyText = async (q) => { try { await navigator.clipboard.writeText(q); return true; } catch (er) { return false; } };
  const showQuery = (title, note, q) => {
    aiOut.innerHTML = '';
    const ta = h('textarea', { readonly: true, rows: q.length > 120 ? 6 : 2, class: 'ai-q' }, q);
    aiOut.append(h('div', { class: 'warn caution' }, h('strong', null, title), h('p', { class: 'muted' }, note), ta,
      h('button', { class: 'btn small', type: 'button', onclick: async () => { if (!(await copyText(q))) { ta.select(); try { document.execCommand('copy'); } catch (er) { /* noop */ } } toast('コピーしました'); } }, '検索文をもう一度コピー')));
  };
  const nameNow = () => ((form.elements.commonName && form.elements.commonName.value) || (form.elements.nickname && form.elements.nickname.value) || '').trim();
  const needName = () => { const n = nameNow(); if (!n) toast('先に流通名(植物の名前)を入力してください'); return n; };
  const fillFromAI = (r) => {
    const v = toFormValues(r.data); const done = [];
    const setv = (n, val, force) => { const el = form.elements[n]; if (!el || val == null) return; if (!force && el.value !== '') return; el.value = val; el.classList.add('ai-filled'); done.push(n); };
    FIELDS.forEach((k) => setv(k, v.fields[k], true));
    Object.entries(v.cycle).forEach(([k, arr]) => { if (!arr) return; form.querySelectorAll(`[name=cycle_${k}]`).forEach((c) => { c.checked = arr.includes(Number(c.value)); }); done.push('cycle_' + k); });
    aiOut.innerHTML = '';
    aiOut.append(h('div', { class: 'warn caution' }, h('strong', null, 'AIの入力結果'), ` ${done.length}項目を反映しました(色付きの欄)。AIの回答は誤りを含むことがあります。必ず内容を確認・修正してから登録してください。`),
      r.sources.length ? h('div', { class: 'srcs' }, h('b', null, '参照元(Google検索)'), r.sources.map((s) => h('a', { href: s.uri, target: '_blank', rel: 'noopener noreferrer' }, s.title || s.uri))) : h('small', { class: 'muted' }, '参照元の情報は取得できませんでした。'));
  };
  const aiBtn = gcfg.key
    ? h('button', { class: 'btn small primary', type: 'button', onclick: async (e) => {
      const n = needName(); if (!n) return; const b = e.currentTarget; b.disabled = true; const old = b.textContent; b.textContent = 'AIが調べています…'; aiOut.innerHTML = '';
      const q = aiPrompt(n);
      const qBox = () => { const ta = h('textarea', { readonly: true, rows: 6, class: 'ai-q' }, q); return h('details', { class: 'research-fold' }, h('summary', null, 'AIに送った質問文を見る・コピー'), ta,
        h('button', { class: 'btn small', type: 'button', onclick: async () => { if (!(await copyText(q))) { ta.select(); try { document.execCommand('copy'); } catch (er) { /* noop */ } } toast('コピーしました'); } }, '質問文をコピー')); };
      try { fillFromAI(await geminiLookup(n)); aiOut.append(qBox()); } catch (err) { aiOut.append(h('div', { class: 'warn urgent' }, err.message), h('p', { class: 'muted' }, '質問文をコピーして、ほかのAI(Google AIモードなど)に貼り付けて調べることもできます。'), qBox()); } finally { b.disabled = false; b.textContent = old; }
    } }, icon('sparkle', 16), 'AIで自動入力(Gemini)')
    : h('a', { class: 'btn small ghost', href: '#/settings' }, icon('sparkle', 16), 'AI自動入力を設定する');
  const lookup = h('div', { class: 'lookup' }, h('strong', null, 'ネットで調べる'),
    h('details', { class: 'research-fold' }, h('summary', null, '植物名を入力して、次の項目を調べられます'),
      h('div', { class: 'chips research' }, RESEARCH_ITEMS.map((x) => h('span', { class: 'chip-s' }, x)))),
    h('div', { class: 'field env-field' }, h('span', { class: 'lbl' }, '栽培環境(AI検索の前提)'), envToggle()),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const n = needName(); if (!n) return; const q = speciesQuery(n);
        const ok = await copyText(q); openTab(googleUrl(q));
        showQuery('Google検索のキーワード', '新しいタブでGoogle検索が開きます。' + (ok ? 'キーワードは自動でコピー済みです。' : '') + '必要なら貼り付けてください。', q);
      } }, icon('search', 16), 'Google検索'),
      h('button', { class: 'btn small', type: 'button', onclick: () => {
        const n = needName(); if (!n) return;
        openAiSearch(n, toast);
        showQuery('AIモードの検索文', '新しいタブでGoogleが開きます。検索文は自動でコピー済みです。入力欄が空のときは貼り付けてください。', openAiSearch.last || '');
      } }, icon('sparkle', 16), 'Google AIモード'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { const n = needName(); if (n) openTab(imageUrl(n + ' 植物')); } }, '画像を探す'), aiBtn), aiOut);
  // 植物の名前(流通名・呼び名)は「ネットで調べる」の上に置く
  const nameFields = h('div', { class: 'grid2 name-fields' },
    field('流通名 *', v('commonName', sp.commonName, 'text', { placeholder: '例: ハエトリソウ' })),
    field('個体の呼び名(任意)', v('nickname', p.nickname, 'text', { placeholder: '例: 玄関の子 / ①' }), '未入力なら流通名が表示されます'));
  const w = p.water || {}, f = p.fert || {};
  const sec = (title, open, ...kids) => h('details', { class: 'card sec', open }, h('summary', null, title), h('div', { class: 'sec-body' }, kids));
  form.append(
    sec('① 種類・植物情報', true, nameFields, lookup, field('登録済みの種類から選ぶ', spSelect, '同じ種類を複数持っている場合は、ここで既存の種類を選ぶと別個体として登録できます'), spWrap),
    sec('② 個体情報', true,
      field('写真', photo.el), h('p', { class: 'muted' }, '写真が無い場合は、下のイラストを代わりに使えます'), spriteGrid,
      field('栽培場所', h('select', { name: 'location' }, h('option', { value: '' }, '未設定'), LOCS.map(([k, l]) => opt(k, l, p.location)))),
      field('現在の状態', h('select', { name: 'status' }, STATUSES.map((s) => opt(s, s, p.status))), '育成中=通常 / 成長中=成長期 / 休眠中=休眠期(休眠中にすると休眠期の水やり設定が使われます)'),
      field('状態メモ', v('statusNote', p.statusNote, 'text', { placeholder: '療養中の理由など' }))),
    sec('③ 購入情報', false,
      h('div', { class: 'grid3' }, field('購入年', v('purchaseYear', p.purchaseYear, 'number', { min: 1990, max: 2100, placeholder: '2026' })), field('購入季節', h('select', { name: 'purchaseSeason' }, opt('', '不明', p.purchaseSeason), ['春', '夏', '秋', '冬'].map((x) => opt(x, x, p.purchaseSeason)))), field('購入日(分かれば)', v('purchaseDate', p.purchaseDate, 'date'))),
      h('div', { class: 'grid2' }, field('購入価格(円)', v('price', p.price, 'number', { min: 0 })), field('購入先', v('shop', p.shop))), field('備考', h('textarea', { name: 'notes', rows: 2 }, p.notes || ''))),
    sec('④ 温度設定(温度警告に使用)', false, h('div', { class: 'grid3' },
      field('屋外管理の最低温度(℃)', v('outdoorMin', p.outdoorMin, 'number', { step: '0.5' }), 'これを下回る予報=緊急'), field('室内取り込み目安(℃)', v('indoorTemp', p.indoorTemp, 'number', { step: '0.5' }), '下回る=警告 / 接近=注意'), field('高温注意温度(℃)', v('highTemp', p.highTemp, 'number', { step: '0.5' })))),
    sec('⑤ 水やり設定', true,
      h('div', { class: 'grid2' }, field('水やり間隔(日)', v('w_interval', w.interval, 'number', { min: 1, placeholder: '例: 3' })), field('最終水やり日', v('w_last', w.last, 'date'))),
      field('水やり量・方法', v('w_amount', w.amount, 'text', { placeholder: '例: 腰水で常時湿らせる' })),
      h('div', { class: 'sub' }, h('strong', null, '休眠期専用の設定'), h('div', { class: 'grid2' }, field('休眠期の間隔(日)', v('w_dormantInterval', w.dormantInterval, 'number', { min: 0, placeholder: '空欄=通常と同じ / 0=停止' }), '0 を入れると休眠期は水やり通知を停止'), field('休眠期の量・方法', v('w_dormantAmount', w.dormantAmount, 'text', { placeholder: '例: 軽く湿らせる程度' }))))),
    sec('⑥ 液体肥料設定', false,
      h('div', { class: 'grid2' }, field('施肥間隔(日)', v('f_interval', f.interval, 'number', { min: 1, placeholder: '例: 14' })), field('最終施肥日', v('f_last', f.last, 'date'))),
      field('肥料の種類', v('f_type', f.type)), h('div', { class: 'grid2' }, field('希釈倍率', v('f_dilution', f.dilution, 'text', { placeholder: '例: 2000倍' })), field('使用量', v('f_amount', f.amount))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'f_stop', checked: f.stopInDormant !== false }), ' 休眠期は施肥を停止する(通知も止まります)')),
    h('div', { class: 'btn-row sticky' }, h('a', { class: 'btn ghost', href: editing ? `#/plants/${id}` : '#/plants' }, 'キャンセル'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, editing ? '変更を保存' : '登録する')));
  // 詳細画面の「水やり/液体肥料」の編集ボタンから来たときは、その設定欄を開いて見える位置へ
  try {
    const fk = sessionStorage.getItem('editFocus'); sessionStorage.removeItem('editFocus');
    if (fk && editing) { const key = fk === 'fert' ? '⑥' : '⑤'; const d = [...form.querySelectorAll('details.sec')].find((x) => (x.querySelector('summary') || {}).textContent.startsWith(key)); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: 'start' }), 150); } }
  } catch (e) { /* noop */ }

  async function save() {
    const fd = new FormData(form); const g = (n) => (fd.get(n) ?? '').toString().trim();
    const commonName = g('commonName'), nickname = g('nickname');
    if (!commonName && !nickname) { toast('流通名か呼び名のどちらかを入力してください'); form.elements.commonName.focus(); return; }
    const cycle = {}; CYCLE.forEach(([k]) => { cycle[k] = fd.getAll('cycle_' + k).map(Number); });
    const nn = (n) => { const x = g(n); return x === '' ? '' : Number(x); };
    let species = ctx.sp[g('speciesId')] || { id: uid() };
    Object.assign(species, { commonName: commonName || nickname, sciName: g('sciName'), origin: g('origin'), tempOpt: g('tempOpt'), tempMin: nn('tempMin'), tempMax: nn('tempMax'), humidity: g('humidity'), light: g('light'), moisture: g('moisture'), slowFert: g('slowFert'), liquidDilution: g('liquidDilution'), cycle });
    const water = { interval: nn('w_interval'), last: g('w_last'), amount: g('w_amount'), dormantInterval: nn('w_dormantInterval'), dormantAmount: g('w_dormantAmount') };
    const fert = { interval: nn('f_interval'), last: g('f_last'), type: g('f_type'), dilution: g('f_dilution'), amount: g('f_amount'), stopInDormant: fd.has('f_stop') };
    const temps = { outdoorMin: nn('outdoorMin'), indoorTemp: nn('indoorTemp'), highTemp: nn('highTemp') };
    species.defaults = { water: { interval: water.interval, amount: water.amount, dormantInterval: water.dormantInterval, dormantAmount: water.dormantAmount }, fert: { interval: fert.interval, type: fert.type, dilution: fert.dilution, amount: fert.amount }, temps };
    await db.put('species', species);
    const plant = { ...(editing || {}), id: editing ? editing.id : uid(), speciesId: species.id, nickname, photo: photo.value, sprite: spriteSel, status: g('status'), location: g('location'), statusNote: g('statusNote'),
      purchaseYear: nn('purchaseYear'), purchaseSeason: g('purchaseSeason'), purchaseDate: g('purchaseDate'), price: nn('price'), shop: g('shop'), notes: g('notes'), ...temps, water, fert, createdAt: editing ? editing.createdAt : Date.now() };
    await db.put('plants', plant);
    toast(editing ? '保存しました' : '登録しました'); location.hash = `#/plants/${plant.id}`;
  }

  root.append(h('div', { class: 'page-head' }, h('h1', null, editing ? '植物を編集' : '植物を登録')), form);
}
