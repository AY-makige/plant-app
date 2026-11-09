// guide.js — 使い方ガイド(PDF)のダウンロード。PDF は index.html と同じフォルダに置く
import { h, modal, toast } from './ui.js';
import { db } from './db.js';
import { isStandalone } from './pwa.js';

export const GUIDE_FILE = '植物管理アプリ_使い方ガイド.pdf';
export const GUIDE_URL = encodeURI(GUIDE_FILE);

/** PDF が公開フォルダに存在するか(未アップロードなら案内を出さない) */
export async function guideAvailable() {
  try { const r = await fetch(GUIDE_URL, { method: 'HEAD', cache: 'no-cache' }); return r.ok; } catch (e) { return false; }
}

export function downloadGuide() {
  const a = h('a', { href: GUIDE_URL, download: GUIDE_FILE, target: '_blank', rel: 'noopener' });
  document.body.append(a); a.click(); a.remove();
}

/** インストール後(アプリとして)の最初の起動で一度だけ「ダウンロードしますか?」を出す */
export async function maybeOfferGuide() {
  try {
    if (!isStandalone()) return;
    if (await db.kvGet('guideAsked', false)) return;
    if (!(await guideAvailable())) return; // PDFが無い間は何も出さず、次回また確認する
    modal('使い方ガイドをダウンロードしますか?', (b, close) => {
      b.append(
        h('p', null, 'はじめての方向けの「使い方ガイド(PDF)」を、この端末に保存できます。'),
        h('p', { class: 'muted' }, 'あとから「設定 → 使い方ガイド」でもダウンロードできます。'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await db.kvSet('guideAsked', true); close(); } }, 'あとで'),
          h('button', { class: 'btn primary', type: 'button', onclick: async () => { await db.kvSet('guideAsked', true); close(); downloadGuide(); toast('ダウンロードを開始しました'); } }, 'ダウンロードする')));
    });
  } catch (e) { /* noop */ }
}
