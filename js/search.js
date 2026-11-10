// search.js — Google検索 / Google AIモード / Gemini(Google検索連携)による植物情報の取得
import { getSettings } from './db.js';

const enc = encodeURIComponent;
export const googleUrl = (q) => `https://www.google.com/search?q=${enc(q)}`;
/* ── AI検索(Google AIモード等) ──
   Googleは「AIモードを検索語つきで開く公式URL」を保証していないため、URLの作り方を設定で差し替えられる形にしている。
   ・複数のプリセット(AIモード / 通常検索 / Geminiアプリ / 自分で指定)から選べる
   ・開く前に検索文をクリップボードへコピー → URLの検索語が無視されても貼り付けで使える
   ・設定は localStorage に同期保存(ポップアップブロックを避けるため、クリック直後に同期で開く) */
export const AI_PRESETS = {
  aimode: { label: 'Google AIモード(推奨)', tpl: 'https://www.google.com/search?udm=50&q={q}' },
  aimode_entry: { label: 'Google AIモード入口(検索文は貼り付け)', tpl: 'https://www.google.com/aimode', copyOnly: true },
  search: { label: '通常のGoogle検索(AI概要つき)', tpl: 'https://www.google.com/search?q={q}' },
  gemini: { label: 'Geminiアプリ(検索文は貼り付け)', tpl: 'https://gemini.google.com/app', copyOnly: true },
  custom: { label: '自分でURLを指定', tpl: '' },
};
const AI_KEY = 'pk-ai';
export const getAiConfig = () => {
  let c = {}; try { c = JSON.parse(localStorage.getItem(AI_KEY) || '{}'); } catch (e) { /* noop */ }
  return { mode: AI_PRESETS[c.mode] ? c.mode : 'aimode', custom: c.custom || '', copy: c.copy !== false };
};
export const setAiConfig = (c) => { try { localStorage.setItem(AI_KEY, JSON.stringify(c)); } catch (e) { /* noop */ } };
export function buildAiUrl(q, cfg = getAiConfig()) {
  const p = AI_PRESETS[cfg.mode] || AI_PRESETS.aimode;
  let tpl = cfg.mode === 'custom' ? cfg.custom.trim() : p.tpl;
  if (!/^https:\/\//i.test(tpl)) tpl = AI_PRESETS.aimode.tpl; // 不正なURLは既定に戻す(https のみ許可)
  return tpl.includes('{q}') ? tpl.replace(/\{q\}/g, enc(q)) : tpl;
}
/** クリックの同じ流れ(同期)で呼ぶこと。戻り値: 'copied' | 'nocopy' */
export function openAiSearch(name, toastFn) {
  const q = aiPrompt(name);
  const cfg = getAiConfig(); const p = AI_PRESETS[cfg.mode];
  let copied = false;
  if (cfg.copy || (p && p.copyOnly)) { try { navigator.clipboard.writeText(q).catch(() => {}); copied = true; } catch (e) { /* noop */ } }
  openTab(buildAiUrl(q, cfg));
  openAiSearch.last = q; // 画面側で「コピー用の検索文」を出すため
  if (toastFn && copied) toastFn(p && p.copyOnly ? '検索文をコピーしました。開いた画面に貼り付けてください' : '検索文をコピーしました(AIモードで反映されない場合は貼り付けてください)', 4500);
}
export const imageUrl = (q) => `https://www.google.com/search?tbm=isch&q=${enc(q)}`;
/** 調べさせる項目(固定)。植物登録画面の表示・AIモードの質問文・Geminiの回答項目すべてで共通 */
export const RESEARCH_ITEMS = ['正式名称・学名', '本来の生息地・原産地', '適温', '最低温度(℃)', '最高温度(℃)', '湿度', '日照条件', '水分条件', '成長サイクル(成長期・休眠期・植え替え推奨)', '追肥(遅効性肥料)の推奨時期・施す量', '液肥(ハイポネックス)の推奨時期・希釈割合'];
/** 入力欄の name と対応(AIの結果を反映する欄) */
export const FIELDS = ['sciName', 'origin', 'tempOpt', 'tempMin', 'tempMax', 'humidity', 'light', 'moisture', 'slowFert', 'liquidDilution'];
/* 栽培環境(屋内/屋外)。AI検索・Geminiの質問に反映する。設定は端末に保存 */
export const ENVS = [['indoor', '屋内'], ['outdoor', '屋外']];
export const getEnv = () => { try { const v = localStorage.getItem('pk-env'); return v === 'indoor' ? 'indoor' : 'outdoor'; } catch (e) { return 'outdoor'; } };
export const setEnv = (v) => { try { localStorage.setItem('pk-env', v); } catch (e) { /* noop */ } };
export const envLabel = (e) => (e === 'indoor' ? '屋内' : '屋外');
const envText = (e) => (e === 'indoor' ? '屋内(室内の窓辺・室温管理)で栽培する場合' : '屋外(庭・ベランダなど)で栽培する場合');
/** AIモード/Gemini用の質問文(名前と環境だけを差し替える固定文) */
export const aiPrompt = (name, env = getEnv()) => `植物「${name}」について、日本の本州の平地で${envText(env)}を前提に、次の項目を日本語で簡潔に教えてください。\n${RESEARCH_ITEMS.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n成長サイクルと肥料の推奨時期は1〜12月の月で示してください。液肥はハイポネックスを使う前提で希釈倍率を具体的に(例: 1000倍・2週間に1回)、追肥は遅効性肥料(置き肥など)の量の目安を示してください。信頼できる情報源も示してください。`;
/** 通常のGoogle検索用(短いキーワード) */
export const speciesQuery = (name, env = getEnv()) => `${name} ${envLabel(env)}栽培 学名 原産地 適温 最低温度 最高温度 湿度 日照 水やり 成長期 休眠期 植え替え`;
/** 別の新しいタブで開く。通常のリンクのクリックとして開くので、アプリ内の小窓ではなく(端末のブラウザの)新規タブになりやすい */
export const openTab = (url) => {
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove();
};

export const DEFAULT_MODEL = 'gemini-flash-latest';

export async function geminiConfig() {
  const s = await getSettings();
  return { key: (s.gemini && s.gemini.key) || '', model: (s.gemini && s.gemini.model) || DEFAULT_MODEL };
}

const PROMPT = (name, env) => `あなたは園芸の専門家です。植物「${name}」について、Google検索で信頼できる情報(園芸店・植物園・大学・専門書の記載など)を調べ、
日本の本州の平地で${envText(env)}を前提に、次のJSONだけを出力してください。説明文やコードフェンスは不要です。分からない項目は null にしてください。
{
 "sciName": "正式名称・学名",
 "origin": "本来の生息地・原産地(簡潔に)",
 "tempOpt": "適温(例: 15〜28℃)",
 "tempMin": 生育できる最低温度(数値℃),
 "tempMax": 生育できる最高温度(数値℃),
 "humidity": "湿度の目安",
 "light": "日照条件",
 "moisture": "水分条件",
 "slowFert": "追肥(遅効性肥料)の施し方・量の目安(例: 置き肥を月1回・小粒3〜5個)",
 "liquidDilution": "液肥(ハイポネックス)の希釈割合と頻度(例: 1000倍・2週間に1回)",
 "cycle": {"growth": [成長期の月の数字], "dormant": [休眠期の月の数字], "repot": [植え替え推奨の月の数字], "fertSlow": [追肥(遅効性肥料)の推奨月の数字], "fertLiquid": [液肥(ハイポネックス)の推奨月の数字]}
}
月は 1〜12 の整数の配列で答えてください。`;

const explain = (status, body) => {
  const msg = (body && body.error && body.error.message) || '';
  if (status === 400 && /API key/i.test(msg)) return 'APIキーが正しくありません。設定画面で確認してください。';
  if (status === 400 || status === 404) return `リクエストが受け付けられませんでした(${status})。モデル名が古い/誤りの可能性があります。設定のモデル名を見直してください。${msg ? '\n' + msg : ''}`;
  if (status === 401 || status === 403) return `APIキーに権限がないか、無効です(${status})。${msg}`;
  if (status === 429) return 'Gemini APIの無料枠の上限に達しました。しばらく待ってからやり直してください。';
  return `Gemini APIでエラーが発生しました(${status})。${msg}`;
};

/** Gemini + Google検索グラウンディングで植物情報を取得。{data, sources, queries} を返す */
export async function geminiLookup(name) {
  const { key, model } = await geminiConfig();
  if (!key) throw new Error('Gemini APIキーが未設定です(設定画面で登録できます)');
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT(name, getEnv()) }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }),
    });
  } catch (e) { throw new Error('Geminiに接続できませんでした(オフライン、または通信がブロックされています)。'); }
  let body = null; try { body = await res.json(); } catch (e) { /* noop */ }
  if (!res.ok) throw new Error(explain(res.status, body));
  const cand = body && body.candidates && body.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AIの回答を読み取れませんでした。もう一度試すか、Google検索で調べてください。');
  let data; try { data = JSON.parse(m[0]); } catch (e) { throw new Error('AIの回答の形式が不正でした。もう一度試してください。'); }
  const gm = (cand && cand.groundingMetadata) || {};
  const sources = (gm.groundingChunks || []).map((c) => c.web).filter(Boolean).filter((w, i, a) => a.findIndex((x) => x.uri === w.uri) === i).slice(0, 6);
  return { data, sources, queries: gm.webSearchQueries || [] };
}

const nz = (v) => (v === null || v === undefined || v === '' ? null : v);
const months = (a) => (Array.isArray(a) ? a.map(Number).filter((n) => n >= 1 && n <= 12) : null);
/** AI結果をフォームの入力へ反映するための正規化(スキーマ → 入力名) */
export function toFormValues(d) {
  const num = (v) => (nz(v) !== null && !isNaN(Number(v)) ? Number(v) : null);
  return {
    fields: { sciName: nz(d.sciName), origin: nz(d.origin), tempOpt: nz(d.tempOpt), tempMin: num(d.tempMin), tempMax: num(d.tempMax), humidity: nz(d.humidity), light: nz(d.light), moisture: nz(d.moisture), slowFert: nz(d.slowFert), liquidDilution: nz(d.liquidDilution) },
    cycle: Object.fromEntries(['growth', 'dormant', 'repot', 'fertSlow', 'fertLiquid'].map((k) => [k, months((d.cycle || {})[k])])),
  };
}
