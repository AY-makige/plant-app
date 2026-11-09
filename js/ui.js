// ui.js — DOM ヘルパ・モーダル・トースト・画像処理
const C = window.PlantCore;
export { C };

// Element.append を拡張: 配列・null・false を安全に扱う(h() と同じ規則)
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...args) {
  const flat = [];
  const f = (x) => { if (x == null || x === false) return; if (Array.isArray(x)) x.forEach(f); else flat.push(x); };
  args.forEach(f);
  return nativeAppend.apply(this, flat);
};

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'for') el.htmlFor = v;
    else if (['list', 'colspan', 'rowspan', 'style', 'form'].includes(k)) el.setAttribute(k, v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export const sprite = (name, cls = '') => h('img', { src: `assets/sprites/${name}.png`, alt: '', class: 'sprite ' + cls, loading: 'lazy' });

export const PLANT_SPRITES = [
  ['venus', 'ハエトリソウ'], ['drosera', 'ドロセラ'], ['nepenthes', 'ネペンテス'], ['nepenthes2', 'ネペンテス(小)'],
  ['sarracenia', 'サラセニア'], ['pinguicula', 'ピンギキュラ'], ['echeveria', 'エケベリア'], ['lithops', 'リトープス'],
  ['cactus', 'サボテン'], ['fern', 'シダ'], ['staghorn', 'ビカクシダ'], ['maidenhair', 'アジアンタム'],
  ['dioscorea', '亀甲竜'], ['begonia1', 'ベゴニア'], ['alocasia', 'アロカシア'], ['begonia2', 'ベゴニア(赤)'],
  ['hoya_var', 'ホヤ(斑入り)'], ['stapelia', 'スタペリア'], ['hoya', 'ホヤ'], ['pachypodium', 'パキポディウム'], ['pearls', 'グリーンネックレス'],
];
export const spriteName = (id) => (PLANT_SPRITES.find((s) => s[0] === id) || [])[1] || '';

export function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export function modal(title, bodyFn, opts = {}) {
  const close = () => { back.remove(); document.body.classList.remove('noscroll'); opts.onClose && opts.onClose(); };
  const body = h('div', { class: 'modal-body' });
  const box = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '閉じる', onclick: close }, '×')), body);
  const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(); } }, box);
  document.body.append(back); document.body.classList.add('noscroll');
  bodyFn(body, close);
  return close;
}

export function confirmBox(message, okLabel = 'OK', danger = false) {
  return new Promise((res) => {
    modal('確認', (b, close) => {
      b.append(h('p', { class: 'pre' }, message),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); res(false); } }, 'キャンセル'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => { close(); res(true); } }, okLabel)));
    }, { onClose: () => res(false) });
  });
}

/** 画像ファイルを縮小して JPEG dataURL にする */
export function fileToDataURL(file, max = 900, q = 0.82) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('画像を読み込めませんでした')); };
    img.src = url;
  });
}

/** 写真入力ウィジェット: .value に dataURL を保持 */
export function photoInput(initial, label = '写真を選ぶ / 撮影') {
  const state = { value: initial || '' };
  const prev = h('div', { class: 'photo-prev' });
  const draw = () => { prev.innerHTML = ''; if (state.value) prev.append(h('img', { src: state.value, alt: '写真プレビュー' })); else prev.append(h('span', { class: 'muted' }, '写真なし')); };
  const file = h('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { state.value = await fileToDataURL(f); draw(); } catch (err) { toast(err.message); } } });
  const el = h('div', { class: 'photo-input' }, prev,
    h('div', { class: 'btn-row left' },
      h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, label),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { state.value = ''; draw(); } }, '削除')), file);
  draw();
  return { el, get value() { return state.value; } };
}

export const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
export const opt = (value, label, sel) => h('option', { value, selected: sel === value }, label ?? value);

export const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
export function monthChips(name, selected = []) {
  const set = new Set(selected.map(Number));
  return h('div', { class: 'chips' }, MONTHS.map((m, i) => h('label', { class: 'chip' },
    h('input', { type: 'checkbox', name, value: i + 1, checked: set.has(i + 1) }), h('span', null, m))));
}

export const fmtDate = (s) => { if (!s) return '—'; const d = C.parse(s); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
export const fmtShort = (s) => { const d = C.parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
export const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function relDays(n) {
  if (n === 0) return '今日'; if (n === 1) return '明日'; if (n === -1) return '昨日';
  return n > 0 ? `あと${n}日` : `${-n}日超過`;
}

export const SEASON_MONTH = { 春: 4, 夏: 7, 秋: 10, 冬: 1 };
/** 所有開始日(推定含む) */
export function ownStart(p) {
  if (p.purchaseDate) return { date: p.purchaseDate, approx: false };
  if (p.purchaseYear) return { date: `${p.purchaseYear}-${String(SEASON_MONTH[p.purchaseSeason] || 7).padStart(2, '0')}-15`, approx: true };
  return null;
}
export function lifespanText(startInfo, endDate) {
  if (!startInfo) return '不明';
  const days = C.diffDays(endDate, startInfo.date);
  if (days < 0) return '不明';
  const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
  return (startInfo.approx ? '約' : '') + (y ? `${y}年` : '') + (m || !y ? `${m}ヶ月` : '') + `(${days}日)`;
}

export function empty(icon, msg, action) {
  return h('div', { class: 'empty' }, sprite(icon, 'big'), h('p', null, msg), action || null);
}
