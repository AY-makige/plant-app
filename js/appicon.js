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
}
