// settings.js — 地域・通知・バックアップ/復元
import { h, field, opt, toast, confirmBox, C } from './ui.js';
import { db, getSettings, saveSettings } from './db.js';
import { geocode } from './weather.js';
import * as N from './notify.js';
import { isStandalone, canPrompt, promptInstall, diagnose } from './pwa.js';

export async function renderSettings(root) {
  const s = await getSettings();
  const rerender = () => { root.innerHTML = ''; renderSettings(root); };
  root.append(h('div', { class: 'page-head' }, h('h1', null, '設定')));

  /* アプリのインストール */
  const diag = h('div', { class: 'diag' });
  const instBtn = canPrompt() ? h('button', { class: 'btn primary', onclick: async () => { const r = await promptInstall(); toast(r === 'accepted' ? 'インストールしました' : 'インストールはキャンセルされました'); rerender(); } }, 'ホーム画面にインストール') : null;
  root.append(h('div', { class: 'card' }, h('h2', null, 'アプリとしてインストール'),
    h('p', null, '状態: ', h('strong', null, isStandalone() ? 'アプリとして起動中' : canPrompt() ? 'インストールできます' : 'ブラウザで表示中')),
    instBtn,
    h('div', { class: 'note' }, h('b', null, 'Android(Chrome): '), '右上のメニュー(︙)→「アプリをインストール」または「ホーム画面に追加」。', h('br'), h('b', null, 'iPhone(Safari): '), '共有ボタン→「ホーム画面に追加」。', h('br'), '出ない場合は下の「診断」で原因を確認してください。'),
    h('button', { class: 'btn small', onclick: async (e) => { const btn = e.currentTarget; btn.disabled = true; diag.innerHTML = ''; diag.append(h('p', { class: 'muted' }, '診断中…')); const r = await diagnose(); diag.innerHTML = ''; r.forEach((x) => diag.append(h('div', { class: 'diag-row ' + (x.ok ? 'ok' : 'ng') }, h('span', { class: 'mark' }, x.ok ? '✓' : '✗'), h('div', null, h('strong', null, x.label), x.detail ? h('div', { class: 'muted' }, x.detail) : null, !x.ok && x.hint ? h('div', { class: 'hintline' }, x.hint) : null)))); btn.disabled = false; } }, 'インストール診断を実行'), diag));

  /* 地域 */
  const q = h('input', { type: 'search', placeholder: '市区町村名(例: 世田谷区 / 札幌市 / 那覇市)', 'aria-label': '市区町村名' });
  const res = h('div', { class: 'results' });
  const search = async () => {
    if (!q.value.trim()) return; res.innerHTML = ''; res.append(h('p', { class: 'muted' }, '検索中…'));
    try {
      const list = await geocode(q.value.trim()); res.innerHTML = '';
      if (!list.length) res.append(h('p', { class: 'muted' }, '見つかりませんでした。別の表記で試してください。'));
      list.forEach((r) => res.append(h('button', { class: 'result', onclick: async () => { s.region = { name: r.name, label: r.label, lat: r.lat, lon: r.lon }; await saveSettings(s); await db.del('kv', 'forecast'); await db.del('kv', 'climate'); toast(`${r.label} を登録しました`); rerender(); } }, r.label, h('small', { class: 'muted' }, ` ${r.country}`))));
    } catch (e) { res.innerHTML = ''; res.append(h('p', { class: 'warn caution' }, '検索に失敗しました(オフライン/API接続不可): ' + e.message)); }
  };
  root.append(h('div', { class: 'card' }, h('h2', null, '地域(1か所・市区町村)'),
    h('p', null, s.region ? ['登録中: ', h('strong', null, s.region.label || s.region.name)] : '未登録'),
    h('div', { class: 'row gap' }, q, h('button', { class: 'btn primary', onclick: search }, '検索')), res,
    s.region ? h('button', { class: 'btn small ghost', onclick: async () => { s.region = null; await saveSettings(s); rerender(); } }, '登録を解除') : null,
    h('small', { class: 'muted' }, '気象データ: Open-Meteo(無料・APIキー不要)')));

  /* 温度警告 */
  const margin = h('input', { type: 'number', min: 0, max: 10, step: 0.5, value: s.margin ?? 3 });
  margin.addEventListener('change', async () => { s.margin = Number(margin.value); await saveSettings(s); toast('保存しました'); });
  root.append(h('div', { class: 'card' }, h('h2', null, '温度警告'), field('「注意」にする余裕温度(℃)', margin, '室内取り込み目安温度 + この値 以下になる予報で「注意」を表示します')));

  /* 通知 */
  const perm = N.permission();
  const en = h('input', { type: 'checkbox', checked: s.notify.enabled !== false });
  const offs = [3, 2, 1, 0].map((d) => ({ d, el: h('input', { type: 'checkbox', checked: (s.notify.offsets || []).includes(d) }) }));
  const over = h('input', { type: 'checkbox', checked: s.notify.overdue !== false });
  const saveN = async () => { s.notify = { enabled: en.checked, offsets: offs.filter((o) => o.el.checked).map((o) => o.d), overdue: over.checked }; await saveSettings(s); toast('通知設定を保存しました'); };
  [en, over, ...offs.map((o) => o.el)].forEach((e) => e.addEventListener('change', saveN));
  root.append(h('div', { class: 'card' }, h('h2', null, '通知'),
    h('p', null, '通知の許可: ', h('strong', null, { granted: '許可済み', denied: 'ブロック中(ブラウザの設定で変更)', default: '未設定', unsupported: 'このブラウザは非対応' }[perm])),
    perm !== 'granted' && perm !== 'unsupported' && perm !== 'denied' ? h('button', { class: 'btn primary small', onclick: async () => { await N.requestPermission(); rerender(); } }, '通知を許可する') : null,
    perm === 'granted' ? h('button', { class: 'btn small', onclick: () => N.testNotification().catch((e) => toast(e.message)) }, 'テスト通知') : null,
    h('label', { class: 'check' }, en, ' 通知を有効にする'),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '通知するタイミング(予定日の…)'), h('div', { class: 'row gap wrap' }, offs.map((o) => h('label', { class: 'check' }, o.el, o.d === 0 ? ' 当日' : ` ${o.d}日前`)))),
    h('label', { class: 'check' }, over, ' 予定日を超過したら通知する(1日1回)'),
    h('div', { class: 'note' }, 'ℹ アプリを開いたとき・画面に戻ったときに通知を判定します。アプリを閉じたままの通知は、ホーム画面に追加したPWA(Chrome/Android等)の「定期バックグラウンド同期」が使える場合のみ届き、時刻は保証されません。確実な時刻通知にはWeb Pushサーバーが必要です(README参照)。通知を許可しなくても、ホーム画面で予定を確認できます。')));

  /* バックアップ */
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!(await confirmBox(`バックアップ(${data.exportedAt ? data.exportedAt.slice(0, 10) : '日付不明'})から復元します。\n現在のデータはすべて置き換えられます。\n先に現在のデータをバックアップしておくことをおすすめします。`, '復元する', true))) return;
      await db.importAll(data, 'replace'); toast('復元しました'); location.hash = '#/home'; setTimeout(() => location.reload(), 500);
    } catch (err) { toast('復元に失敗: ' + err.message, 4000); }
  } });
  let persisted = null; try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { /* noop */ }
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
  root.append(h('div', { class: 'card' }, h('h2', null, 'バックアップ・復元'),
    h('p', { class: 'muted' }, '植物・履歴・用土・メモリアル・画像・設定をすべて1つのJSONファイルに書き出します。ブラウザのデータ削除に備えて、定期的に保存してください。'),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn primary', onclick: async () => {
        const data = await db.exportAll(); const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `plant-backup-${C.today()}.json` }); document.body.append(a); a.click(); a.remove(); await db.kvSet('lastBackup', C.today()); toast('バックアップを保存しました'); rerender();
      } }, '⬇ バックアップを保存'),
      h('button', { class: 'btn', onclick: () => file.click() }, '⬆ ファイルから復元')), file,
    h('p', { class: 'muted' }, `最終バックアップ: ${(await db.kvGet('lastBackup', null)) || '未実施'}`),
    h('p', { class: 'muted' }, `ストレージ保護(消えにくくする設定): ${persisted === null ? '非対応' : persisted ? '有効' : '未有効'}${est ? ` / 使用量 約${(est.usage / 1048576).toFixed(1)}MB` : ''}`),
    persisted === false ? h('button', { class: 'btn small', onclick: async () => { const ok = await navigator.storage.persist(); toast(ok ? '保護を有効にしました' : 'ブラウザが許可しませんでした(ホーム画面に追加すると許可されやすくなります)'); rerender(); } }, 'データを消えにくくする') : null));

  root.append(h('div', { class: 'card' }, h('h2', null, 'このアプリについて'), h('p', { class: 'muted' }, 'データはこの端末のブラウザ内(IndexedDB)に保存されます。別の端末とは自動同期されません。端末を変える場合はバックアップ→復元を使ってください。')));
}
