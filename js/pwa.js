// pwa.js — インストール支援と PWA 診断
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const canPrompt = () => !!window.__installEvt;

export async function promptInstall() {
  const e = window.__installEvt; if (!e) return 'unavailable';
  e.prompt(); const r = await e.userChoice; window.__installEvt = null; return r.outcome; // accepted / dismissed
}

/** 項目ごとに { ok, label, detail, hint } を返す */
export async function diagnose() {
  const out = []; const add = (ok, label, detail = '', hint = '') => out.push({ ok, label, detail, hint });
  const secure = window.isSecureContext;
  add(secure, 'HTTPS で開いている', location.origin, 'PWA は https:// または localhost でのみ動作します。http:// や file:// ではインストールできません。GitHub Pages の公開URL(https://…github.io/…)から開いてください。');
  add(!/Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger/i.test(navigator.userAgent), 'ふつうのブラウザで開いている', navigator.userAgent.slice(0, 80), 'LINE・Instagram・X などアプリ内ブラウザではインストールできません。右上のメニューから「Chromeで開く」を選んでください。');
  { // 起動状態は情報表示(通常タブでも失敗ではない)。判定できない環境は「判定不可」
    const canMM = typeof window.matchMedia === 'function'; const iosFlag = window.navigator.standalone;
    if (!canMM && iosFlag === undefined) out.push({ ok: null, label: 'アプリとして起動中か', detail: '判定不可(このブラウザでは起動状態を調べられません)', hint: '' });
    else out.push({ ok: null, label: 'アプリとして起動中か', detail: isStandalone() ? 'はい(ホーム画面から起動したアプリの表示)' : 'いいえ(ブラウザのタブで開いています)', hint: '' });
  }

  // manifest
  let man = null;
  try {
    const link = document.querySelector('link[rel=manifest]'); const url = new URL(link.getAttribute('href'), location.href);
    const res = await fetch(url, { cache: 'no-store' });
    add(res.ok, 'manifest.webmanifest を取得できる', `${res.status} ${url.pathname}`, '404 の場合、ファイルが公開フォルダ直下にありません。index.html と同じ階層に manifest.webmanifest を置いてください。');
    if (res.ok) {
      try { man = await res.json(); add(true, 'manifest の内容が正しいJSON', `${man.name} / display=${man.display}`); }
      catch (e) { add(false, 'manifest の内容が正しいJSON', String(e.message), 'ファイルが壊れているか、HTMLが返っています(パスの誤り)。'); }
    }
    if (man) {
      add(!!(man.name || man.short_name) && man.start_url && ['standalone', 'fullscreen', 'minimal-ui'].includes(man.display), '名前・start_url・display が設定済み', `start_url=${man.start_url}`);
      const sizes = {};
      for (const ic of man.icons || []) {
        const iu = new URL(ic.src, url); const r = await fetch(iu, { cache: 'no-store' }).catch(() => ({ ok: false, status: 'ERR' }));
        add(r.ok, `アイコン ${ic.sizes}`, `${r.status} ${iu.pathname}`, 'アイコン画像が見つかりません。icons フォルダごとアップロードされているか確認してください。');
        if (r.ok) sizes[ic.sizes] = true;
      }
      add(!!(sizes['192x192'] && sizes['512x512']), '192px と 512px のアイコンがある', Object.keys(sizes).join(', '));
    }
  } catch (e) { add(false, 'manifest を確認できた', String(e.message), 'index.html に <link rel="manifest"> がありません。'); }

  // service worker
  if (!('serviceWorker' in navigator)) add(false, 'Service Worker に対応', '', 'このブラウザは非対応です。最新の Chrome を使ってください。');
  else {
    const reg = await navigator.serviceWorker.getRegistration();
    add(!!reg, 'Service Worker が登録されている', reg ? reg.scope : '未登録', '未登録の場合、sw.js が公開フォルダ直下にない、または読み込みエラーです。ページを再読み込みして再確認してください。');
    if (reg) {
      const st = reg.active ? '有効(active)' : reg.installing ? 'インストール中' : reg.waiting ? '待機中' : '不明';
      add(!!reg.active, 'Service Worker が有効', st, 'インストール中のまま止まる場合、sw.js のキャッシュ対象ファイルが404の可能性があります。全ファイルをアップロードし直してください。');
      try { const keys = await caches.keys(); let n = 0; for (const k of keys) n += (await (await caches.open(k)).keys()).length; add(n > 0, 'オフライン用キャッシュがある', `${n}件`); } catch (e) { /* noop */ }
    }
  }
  add(canPrompt() || isStandalone(), 'ブラウザがインストール可能と判定', canPrompt() ? 'はい(インストールボタンが使えます)' : 'まだ(判定待ち、または条件未達)',
    '上の項目がすべて ✓ でも出ないことがあります。数回ページを開く/すこし操作してから、Chrome のメニュー(︙)→「アプリをインストール」を確認してください。一度「キャンセル」すると、しばらく表示されないことがあります。');
  return out;
}

/** 現在のアプリ版(Service Worker のキャッシュ名 例: plantkeeper-v27)。未登録なら null */
export async function appVersion() {
  try { const ks = (await caches.keys()).filter((k) => k.startsWith('plantkeeper-')).sort(); return ks.length ? ks[ks.length - 1].replace('plantkeeper-', '') : null; } catch (e) { return null; }
}

/** 更新確認: 'unsupported' | 'latest' | 'updated'(新版を取得済み) | 'error' */
export async function checkUpdate() {
  if (!('serviceWorker' in navigator)) return { state: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return { state: 'unsupported' };
    const before = await appVersion();
    await reg.update();
    const w = reg.installing || reg.waiting;
    if (w) await new Promise((res) => { const t = setTimeout(res, 15000); const f = () => { if (w.state === 'activated' || w.state === 'redundant') { clearTimeout(t); res(); } }; w.addEventListener('statechange', f); f(); });
    const after = await appVersion();
    return { state: w && after !== before ? 'updated' : 'latest', before, after };
  } catch (e) { return { state: 'error', message: String(e.message || e) }; }
}

/** キャッシュ削除(植物のデータ=IndexedDB は消さない)して再読み込み */
export async function clearCacheAndReload() {
  try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* noop */ }
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch (e) { /* noop */ }
  location.replace(location.pathname + '?r=' + Date.now() + location.hash);
}
