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

/** 整理で削除したイラストの代わり(すでに登録済みの植物の表示を保つ) */
const SPRITE_ALIAS = {'maidenhair': 'foliage_10', 'pearls': 'foliage_18', 'foliage_06': 'echeveria', 'foliage_09': 'fern', 'stapelia': 'foliage_16', 'nepenthes2': 'foliage_04', 'foliage_03': 'drosera', 'nepenthes': 'foliage_02', 'venus': 'foliage_01', 'begonia1': 'foliage_12', 'begonia2': 'foliage_12', 'foliage_07': 'foliage_21', 'lithops': 'foliage_21', 'sarracenia': 'foliage_05', 'hoya': 'foliage_15', 'foliage_17': 'hoya_var', 'foliage_13': 'i_leaf', 'foliage_14': 'i_leaf', 'foliage_08': 'cactus', 'dioscorea': 'pachypodium', 'foliage_11': 'pachypodium', 'f_hibiscus_y': 'f_hibiscus', 'f_lotus': 'f_waterlily', 'f_phalaenopsis': 'f_dendrobium', 'f_cattleya': 'f_dendrobium', 'f_peony': 'f_camellia', 'f_rose': 'f_camellia', 'f_toadlily': 'f_lily', 'f_gerbera': 'f_daisy', 'f_cosmos': 'f_daisy', 'f_saintpaulia': 'f_phlox', 'f_calla': 'f_anthurium'};
export const resolveSprite = (id) => SPRITE_ALIAS[id] || id;
export const sprite = (name, cls = '') => h('img', { src: `assets/sprites/${resolveSprite(name)}.png`, alt: '', class: 'sprite ' + cls, loading: 'lazy' });

/** サンプルイラスト。[ID, 名前, 読み] ― 名前は検索・自動選択のための内部データ(マスクデータ)で、画面には表示しない。読み(五十音)順に並べている */
export const SPRITE_DATA = {
  foliage: [
  ['foliage_10', 'アジアンタム', 'あじあんたむ'],
  ['alocasia', 'アロカシア', 'あろかしあ'],
  ['echeveria', 'エケベリア', 'えけべりあ'],
  ['foliage_18', 'グリーンネックレス', 'ぐりーんねっくれす'],
  ['foliage_21', 'コノフィツム', 'このふぃつむ'],
  ['cactus', 'サボテン', 'さぼてん'],
  ['foliage_05', 'サラセニア(白)', 'さらせにあしろ'],
  ['fern', 'シダ', 'しだ'],
  ['foliage_16', 'スタペリア', 'すたぺりあ'],
  ['foliage_04', 'セファロタス', 'せふぁろたす'],
  ['drosera', 'ドロセラ', 'どろせら'],
  ['foliage_02', 'ネペンテス', 'ねぺんてす'],
  ['foliage_01', 'ハエトリソウ', 'はえとりそう'],
  ['pachypodium', 'パキポディウム', 'ぱきぽでぃうむ'],
  ['staghorn', 'ビカクシダ', 'びかくしだ'],
  ['pinguicula', 'ピンギキュラ', 'ぴんぎきゅら'],
  ['foliage_12', 'ベゴニア(銀点)', 'べごにあぎんてん'],
  ['foliage_15', 'ホヤ(花つき)', 'ほやはなつき'],
  ['hoya_var', 'ホヤ(斑入り)', 'ほやふいり'],
  ['foliage_20', 'ポトス', 'ぽとす'],
  ['foliage_19', 'モンステラ', 'もんすてら'],
  ],
  flower: [
  ['f_iris', 'アイリス', 'あいりす'],
  ['f_morningglory', 'アサガオ', 'あさがお'],
  ['f_hydrangea', 'アジサイ', 'あじさい'],
  ['f_anthurium', 'アンスリウム', 'あんすりうむ'],
  ['f_oncidium', 'オンシジウム', 'おんしじうむ'],
  ['f_gypsophila', 'カスミソウ', 'かすみそう'],
  ['f_carnation', 'カーネーション', 'かーねーしょん'],
  ['f_gardenia', 'クチナシ', 'くちなし'],
  ['f_clematis', 'クレマチス', 'くれまちす'],
  ['f_sakura', '桜', 'さくら'],
  ['f_cyclamen', 'シクラメン', 'しくらめん'],
  ['f_jasmine', 'ジャスミン', 'じゃすみん'],
  ['f_jewel', 'ジュエルオーキッド', 'じゅえるおーきっど'],
  ['f_jinchoge', 'ジンチョウゲ', 'じんちょうげ'],
  ['f_waterlily', 'スイレン', 'すいれん'],
  ['f_lilyvalley', 'スズラン', 'すずらん'],
  ['f_tulip', 'チューリップ', 'ちゅーりっぷ'],
  ['f_camellia', 'ツバキ', 'つばき'],
  ['f_dendrobium', 'デンドロビウム', 'でんどろびうむ'],
  ['f_passion', 'トケイソウ', 'とけいそう'],
  ['f_dianthus', 'ナデシコ', 'なでしこ'],
  ['f_hibiscus', 'ハイビスカス(赤)', 'はいびすかすあか'],
  ['f_paphio', 'パフィオペディルム', 'ぱふぃおぺでぃるむ'],
  ['f_pansy', 'パンジー', 'ぱんじー'],
  ['f_spiderlily', 'ヒガンバナ', 'ひがんばな'],
  ['f_sunflower', 'ヒマワリ', 'ひまわり'],
  ['f_fuchsia', 'フクシア', 'ふくしあ'],
  ['f_phlox', 'プリムラ', 'ぷりむら'],
  ['f_plumeria', 'プルメリア', 'ぷるめりあ'],
  ['f_petunia', 'ペチュニア', 'ぺちゅにあ'],
  ['f_pentas', 'ペンタス', 'ぺんたす'],
  ['f_marigold', 'マリーゴールド', 'まりーごーるど'],
  ['f_daisy', 'マーガレット', 'まーがれっと'],
  ['f_lily', 'ユリ', 'ゆり'],
  ['f_lavender', 'ラベンダー', 'らべんだー'],
  ['f_rexbegonia', 'レックスベゴニア', 'れっくすべごにあ'],
  ['f_rosemary', 'ローズマリー', 'ろーずまりー'],
  ],
};
export const SPRITE_GROUPS = [['葉', SPRITE_DATA.foliage], ['花', SPRITE_DATA.flower]];
export const PLANT_SPRITES = [...SPRITE_DATA.foliage, ...SPRITE_DATA.flower];

export function toast(msg, ms = 2600, action) {
  const t = h('div', { class: 'toast', role: 'status' }, h('span', null, msg),
    action ? h('button', { class: 'toast-act', type: 'button', onclick: async () => { t.remove(); await action.fn(); } }, action.label) : null);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, action ? Math.max(ms, 5000) : ms);
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
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { res(false); close(); } }, 'キャンセル'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => { res(true); close(); } }, okLabel)));
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

export function relDays(n, kind) {
  const lb = kind ? C.stageLabel(kind, n) : null; // 段階の名前(そろそろ/カラカラ…)があればそれを表示
  if (lb) return lb;
  if (n === 0) return '今日'; if (n === 1) return '明日'; if (n === -1) return '昨日';
  return n > 0 ? `あと${n}日` : `予定日から${-n}日`;
}
export const stageClass = (kind, n) => { const s = C.stageOf(kind, n); return s ? ' st-' + s : ''; };

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

/* ── アイコン(線画SVG・全画面で共通) ── */
export const ICONS = {
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>',
  plants: '<path d="M12 21V11M12 11c0-4 3-7 8-7 0 5-3 8-8 7zM12 14c0-3-2-5-6-5 0 4 2 6 6 5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tasks: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  soil: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10c3-2 5 2 9 0s6 2 9 0M3 15c3-2 5 2 9 0s6 2 9 0"/>',
  grave: '<path d="M6 21V9a6 6 0 0112 0v12"/><path d="M3 21h18"/><path d="M12 7.5v7M9.2 10h5.6"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M7.5 15h9"/>',
  snow: '<path d="M12 2v20M4 7l16 10M20 7L4 17"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  bell: '<path d="M6 17v-6a6 6 0 0112 0v6l2 2H4zM10 21h4"/>', thermo: '<path d="M14 14.5V5a2 2 0 00-4 0v9.5a4 4 0 104 0z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', chevron: '<path d="M9 5l7 7-7 7"/>',
  pot: '<path d="M5 9h14l-2 11H7zM4 9h16M12 9V5M12 5c-3 0-4-2-4-3 3 0 4 1 4 3zM12 5c3 0 4-2 4-3-3 0-4 1-4 3z"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>', swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>', link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  warn: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>', undo: '<path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12"/>',
};
export function icon(name, size = 22, cls = '') {
  return h('span', { class: 'ico ' + cls, html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>` });
}
export const graveImg = (cls = '') => h('img', { src: 'assets/grave.svg', alt: '洋風の墓石', class: 'grave-art ' + cls });

/* ── 用土の配合は「比率(部)」で扱う: 例 鹿沼土 3 : 軽石 2 : パーライト 2 ──
   旧データ(割合%)は最簡整数比に換算して表示する */
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function normalizeMix(mix) {
  const src = mix || [];
  const arr = src.map((m) => ({ material: m.material, parts: m.parts != null ? Number(m.parts) : Number(m.pct) || 0 })).filter((m) => m.parts > 0);
  if (arr.length && src.some((m) => m.parts == null)) { const g = arr.reduce((a, m) => gcd(a, Math.round(m.parts)), 0) || 1; arr.forEach((m) => { m.parts = Math.round(m.parts) / g; }); }
  return arr;
}
export const ratioText = (mix) => normalizeMix(mix).map((m) => m.parts).join(' : ');
export const mixLine = (mix) => normalizeMix(mix).map((m) => `${m.material} ${m.parts}`).join(' : ');
