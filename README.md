# 植物管理アプリ(PWA)

ビルド不要の静的Webアプリです(HTML/CSS/JavaScriptのみ)。データはブラウザ内(IndexedDB)に保存されます。

## 起動
- **試すだけ**: このフォルダで `python3 -m http.server 8000` → http://localhost:8000
- **スマホでも使う**: フォルダ全体を HTTPS の静的ホスティング(GitHub Pages / Netlify / Cloudflare Pages 等)に置く。
  PWA・通知・Service Worker は HTTPS(または localhost)でのみ動作します。`index.html` を直接ダブルクリックしても画面は開きますが、保存・通知は不安定です。
- スマホではブラウザの「ホーム画面に追加」でアプリとして使えます。

## 追加設定が必要な機能
1. **天気・温度警告**: Open-Meteo(APIキー不要・無料)を使用。設定画面で市区町村を検索→選択するだけです。ネット接続が必要で、オフライン時は前回取得分を表示します。
2. **通知**: 設定 or ホームの「許可する」でブラウザ通知を許可。
   - アプリを開いた時/画面に戻った時に判定して通知(確実に動作)。
   - 閉じたままの通知は「定期バックグラウンド同期」対応環境(ホーム画面に追加したChrome/Androidなど)のみ。時刻は保証されません。iOS Safari は非対応の場合があります。
   - 時刻どおりの確実なプッシュ通知には Web Push サーバー(VAPID鍵+送信サーバー+購読情報の保存)が必要で、今回は未実装です。
3. **バックアップ**: 設定→「バックアップを保存」でJSON(画像込み)をダウンロード。復元は同画面から。ブラウザのデータ削除に備え、定期保存してください。

## 構成
`js/core.js` 日付・次回予定・温度警告・通知判定(ページとService Worker共通) / `db.js` 保存 / `plants.js` 図鑑 / `tasks.js` / `calendar.js` / `soil.js` / `memorial.js` / `home.js` / `settings.js` / `weather.js` / `notify.js` / `sw.js`
