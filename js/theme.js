// theme.js — 表示モード(自動/ライト/ダーク)と雰囲気(スタンダード/ボタニカル)
const KEY_M = 'pk-mode', KEY_S = 'pk-style';
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } } };
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const BAR = { 'standard-light': '#f1f6ea', 'standard-dark': '#141b13', 'botanical-light': '#f6f1e4', 'botanical-dark': '#182016' };

export const getTheme = () => ({ mode: ls.get(KEY_M) || 'auto', style: ls.get(KEY_S) || 'standard' });
export const resolvedMode = () => { const m = getTheme().mode; return m === 'auto' ? (mq.matches ? 'dark' : 'light') : m; };

export function applyTheme() {
  const { style } = getTheme(); const mode = resolvedMode(); const r = document.documentElement;
  r.dataset.mode = mode; r.dataset.style = style;
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => { m.removeAttribute('media'); m.content = BAR[`${style}-${mode}`]; });
  window.dispatchEvent(new Event('theme-change'));
}
export function setMode(m) { ls.set(KEY_M, m); applyTheme(); }
export function setStyle(s) { ls.set(KEY_S, s); applyTheme(); }
/** ライト⇄ダークの簡易切替(トップバー用)。自動を解除して明示指定にする */
export function toggleMode() { setMode(resolvedMode() === 'dark' ? 'light' : 'dark'); }
mq.addEventListener('change', () => { if (getTheme().mode === 'auto') applyTheme(); });
