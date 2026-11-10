// appicon.js — ライブラリーの植物の写真を「アプリのアイコン」にする(おまけ機能)
import { db } from './db.js';

const SIZES = { i512: 512, i192: 192, i180: 180, i64: 64 };

function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('画像を読み込めませんでした')); i.src = src; }); }

/** 写真(dataURL)から、中央を正方形に切り出した各サイズのPNGを作る */
export async function makeIconSet(src) {
  const img = await loadImg(src); const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2; const out = {};
  for (const [k, px] of Object.entries(SIZES)) {
    const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, side, side, 0, 0, px, px); out[k] = c.toDataURL('image/png');
  }
  return out;
}

export const getAppIcon = () => db.kvGet('appIcon', null);
export async function setAppIcon(src, name) { const set = await makeIconSet(src); const v = { ...set, name: name || '', ts: Date.now() }; await db.kvSet('appIcon', v); applyAppIcon(v); return v; }
export async function resetAppIcon() { await db.del('kv', 'appIcon'); applyAppIcon(null); }

/** ブラウザのタブ・ホーム画面追加用(iOS)・画面上部のアイコンを差し替える(null なら初期へ) */
export async function applyAppIcon(v) {
  if (v === undefined) v = await getAppIcon();
  const set = (rel, href, extra) => { let l = document.querySelector(`link[rel="${rel}"]`); if (!l) { l = document.createElement('link'); l.rel = rel; document.head.append(l); } l.href = href; if (extra) l.type = extra; };
  set('icon', v ? v.i64 : 'icons/icon-64.png', 'image/png'); set('apple-touch-icon', v ? v.i180 : 'icons/apple-touch-icon.png');
  document.querySelectorAll('.brand img').forEach((i) => { i.src = v ? v.i64 : 'icons/icon-64.png'; });
  await applyManifest(v);
}

let manifestBlob = '';
/** インストール(ホーム画面に追加)時に読まれる manifest のアイコンを、自分の画像に差し替える。
 *  ※すでにインストール済みのアプリのアイコンは端末側に保存されているため変わらない(いったん削除して追加し直すと反映される) */
async function applyManifest(v) {
  const link = document.querySelector('link[rel="manifest"]'); if (!link) return;
  if (!link.dataset.orig) link.dataset.orig = link.getAttribute('href');
  try {
    if (manifestBlob) { URL.revokeObjectURL(manifestBlob); manifestBlob = ''; }
    if (!v) { link.setAttribute('href', link.dataset.orig); return; }
    const m = await (await fetch(link.dataset.orig, { cache: 'no-cache' })).json();
    const abs = (x) => new URL(x || './', new URL(link.dataset.orig, location.href)).href; // blob URL では相対パスが解決できないため絶対URLにする
    m.start_url = abs(m.start_url); m.scope = abs(m.scope); m.id = m.id ? abs(m.id) : m.start_url;
    m.icons = [{ src: v.i192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: v.i512, sizes: '512x512', type: 'image/png', purpose: 'any' }];
    manifestBlob = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    link.setAttribute('href', manifestBlob);
  } catch (e) { /* 失敗しても標準の manifest のまま使う */ }
}
