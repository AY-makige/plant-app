/* core.js — 日付計算・スケジュール・温度警告・通知判定。
   ページ(<script>)と Service Worker(importScripts)の両方から使う純粋ロジック。 */
(function (root) {
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / DAY);
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

  const isDormant = (p) => p.status === '休眠中';

  /** 現在のモード(通常/休眠)に応じた水やり設定 */
  function effWater(p) {
    const w = p.water || {};
    const iv = num(w.interval), div = num(w.dormantInterval);
    if (isDormant(p)) {
      if (div === 0) return { interval: null, stopped: true, amount: w.dormantAmount || w.amount || '' };
      if (div > 0) return { interval: div, amount: w.dormantAmount || w.amount || '', dormant: true };
    }
    return { interval: iv > 0 ? iv : null, amount: w.amount || '' };
  }
  /** 肥料: 休眠期の停止設定に対応 */
  function effFert(p) {
    const f = p.fert || {};
    const iv = num(f.interval);
    if (isDormant(p) && f.stopInDormant !== false) return { interval: null, stopped: true };
    return { interval: iv > 0 ? iv : null };
  }

  /** 次回予定日 = 最終実施日 + 間隔(実施日基準)。最終実施日が無ければ今日扱い */
  function nextDue(p, kind) {
    const cfg = kind === 'water' ? p.water || {} : p.fert || {};
    const eff = kind === 'water' ? effWater(p) : effFert(p);
    if (!eff.interval) return { date: null, stopped: !!eff.stopped, interval: null };
    const last = cfg.last || null;
    const date = last ? addDays(last, eff.interval) : today();
    return { date, last, interval: eff.interval, stopped: false, noLast: !last };
  }

  /** 全植物のタスク一覧 */
  function buildTasks(plants, names) {
    const t0 = today(), out = [];
    for (const p of plants) {
      for (const kind of ['water', 'fert']) {
        const n = nextDue(p, kind);
        if (!n.date) continue;
        out.push({ plantId: p.id, name: names ? names[p.id] : p.nickname, kind, due: n.date, daysLeft: diffDays(n.date, t0), last: n.last, interval: n.interval, noLast: n.noLast });
      }
    }
    return out.sort((a, b) => a.due.localeCompare(b.due));
  }

  /** 温度警告: 週間予報 vs 植物ごとの設定温度 */
  /** 気温アラート(全植物に共通・屋内外の区別なし)。設定の温度と週間予報を比べ、最大でも寒い側1件+暑い側1件にまとめる。
   *  ① 「特に寒い日」(最低気温 < 特に寒い温度) / 「特に暑い日」(最高気温 ≥ 特に暑い温度)があれば、そのお知らせだけを出す
   *  ② なければ 低気温(最低気温 ≤ 特に寒い温度 + 余裕温度)=水やり注意、高気温(最高気温 ≥ 特に暑い温度 − 余裕温度)=風通し注意 */
  function computeWarnings(plants, names, daily, margin, temps) {
    const out = [];
    if (!daily || !daily.length) return out;
    margin = num(margin) ?? 3;
    const T = temps || {}; const veryCold = num(T.outdoorMin), veryHot = num(T.highTemp);
    const td = today(); const when = (date) => (date === td ? '本日' : `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`);
    const days = daily.filter((d) => d && d.date);
    const mk = (level, label, kind, d, temp, threshold, msg) => ({ plantId: null, name: '', kind, level, label, date: d.date, temp, threshold, msg });
    const vc = veryCold != null ? days.filter((d) => d.tmin != null && d.tmin < veryCold).sort((a, b) => a.date.localeCompare(b.date))[0] : null;
    const vh = veryHot != null ? days.filter((d) => d.tmax != null && d.tmax >= veryHot).sort((a, b) => a.date.localeCompare(b.date))[0] : null;
    if (vc) out.push(mk('urgent', '特に寒い', 'extreme', vc, vc.tmin, veryCold, `${when(vc.date)}は特に寒いため、低温に注意してください(最低 ${vc.tmin}℃)`));
    if (vh) out.push(mk('heat', '特に暑い', 'extreme', vh, vh.tmax, veryHot, `${when(vh.date)}は特に暑いため、高温に注意してください(最高 ${vh.tmax}℃)`));
    if (out.length) return out; // 特に寒い・暑い日は他の気温アラートを出さない
    // 低気温: 冷えた日に水をあげると根が冷えすぎるため、水やりに注意
    const cd = veryCold != null ? days.filter((d) => d.tmin != null && d.tmin <= veryCold + margin).sort((a, b) => a.tmin - b.tmin)[0] : null;
    if (cd) out.push(mk('caution', '注意', 'cold', cd, cd.tmin, veryCold, `低気温につき管理植物の水やりに気を付けてください(${when(cd.date)} 最低 ${cd.tmin}℃)`));
    // 高気温: 暑い日は蒸れて弱るため、風通しに注意
    const hd = veryHot != null ? days.filter((d) => d.tmax != null && d.tmax >= veryHot - margin).sort((a, b) => b.tmax - a.tmax)[0] : null;
    if (hd) out.push(mk('caution', '注意', 'heat', hd, hd.tmax, veryHot, `高気温につき管理植物の風通しに気を付けてください(${when(hd.date)} 最高 ${hd.tmax}℃)`));
    return out;
  }

  /** 「今ある場所」(p.nowLoc)と、今の季節の管理場所(effLocation)がずれている植物のお知らせ */
  function locNotice(p, force) {
    const now = p && p.nowLoc, want = effLocation(p);
    if (!now || !want || now === want) return '';
    if (!force && p.locSnooze && p.locSnooze > today()) return ''; // 「まだ大丈夫」の間はお休み(特に寒い・暑い日は force=true で無視)
    return want === 'indoor' ? 'そろそろ部屋に入れてほしいかも' : 'そろそろ外で暮らしたいかも';
  }
  function locationNotices(plants, names, force) {
    return (plants || []).map((p) => ({ p, msg: locNotice(p, force) })).filter((x) => x.msg)
      .map((x) => ({ plantId: x.p.id, name: (names && names[x.p.id]) || x.p.nickname || '', kind: 'location', level: 'caution', label: '場所', date: null, msg: x.msg }));
  }

  /* ── 予定日との差による段階(そろそろ / 今やる / 遅れ)と、ユーザーが変えられる表示名 ── */
  const DEFAULT_LABELS = {
    water: { soon: 'そろそろ', now: 'カラカラ', late: 'み、水…' },
    fert: { soon: 'そろそろ', now: '腹ペコ', late: '断食' },
  };
  /** 「遅れ」になる超過日数(水やり: 4日以上、液肥: 3日以上) */
  const LATE_FROM = { water: 3, fert: 3 };
  const LATE_REPEAT = 3; // 遅れが続くときの再通知の間隔(日)
  const SOON_DAYS = 5; // 予定日の5日前〜1日前
  const mergeLabels = (l) => {
    const out = { water: { ...DEFAULT_LABELS.water }, fert: { ...DEFAULT_LABELS.fert } };
    for (const k of ['water', 'fert']) for (const st of ['soon', 'now', 'late']) { const v = l && l[k] && l[k][st]; if (typeof v === 'string' && v.trim()) out[k][st] = v.trim(); }
    return out;
  };
  let LABELS = mergeLabels(null);
  const setLabels = (l) => { LABELS = mergeLabels(l); };
  const getLabels = () => LABELS;
  /** daysLeft = 予定日 − 今日。戻り値: 'soon' | 'now' | 'late' | null */
  const stageOf = (kind, daysLeft) => {
    if (daysLeft >= 1 && daysLeft <= SOON_DAYS) return 'soon';
    if (daysLeft > SOON_DAYS) return null;
    return -daysLeft >= LATE_FROM[kind] ? 'late' : 'now';
  };
  const stageLabel = (kind, daysLeft, labels) => { const st = stageOf(kind, daysLeft); return st ? (labels || LABELS)[kind][st] : null; };

  /** 通知の3段階: soon=そろそろ(5〜1日前) / now=最適(予定日当日) / over=予定を過ぎてる */
  const notifStageOf = (daysLeft) => (daysLeft >= 1 && daysLeft <= SOON_DAYS ? 'soon' : daysLeft === 0 ? 'now' : daysLeft < 0 ? 'over' : null);
  const DEFAULT_NOTIFY = { enabled: true, time: '08:00', stages: { soon: true, now: true, over: true } };
  const notifyCfg = (settings) => {
    const n = (settings && settings.notify) || {};
    return { enabled: n.enabled !== false, time: /^\d{1,2}:\d{2}$/.test(n.time || '') ? n.time : DEFAULT_NOTIFY.time, stages: { ...DEFAULT_NOTIFY.stages, ...(n.stages || {}) } };
  };

  /** 通知対象の判定。段階ごとに「予定日につき1回」だけ通知し、同じ段階の植物は1通にまとめる。
      notified は {key:時刻} の既通知マップ。設定した時刻より前は何も返さない */
  function computeDueNotifications(plants, names, settings, notified, now, speciesMap) {
    const n = notifyCfg(settings);
    if (!n.enabled) return [];
    now = now || new Date();
    const [hh, mm] = n.time.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return [];
    const labels = mergeLabels(settings && settings.labels);
    const groups = new Map();
    const month = now.getMonth() + 1; const byId = Object.fromEntries(plants.map((p) => [p.id, p]));
    /** 液肥は成長期の月だけ通知(種類に成長期が設定されていないときは判断できないので従来どおり通知) */
    const fertOk = (plantId) => { const sp = speciesMap && byId[plantId] ? speciesMap[byId[plantId].speciesId] : null; const g = sp && sp.cycle && Array.isArray(sp.cycle.growth) ? sp.cycle.growth.map(Number) : []; return !g.length || g.includes(month); };
    for (const t of buildTasks(plants, names)) {
      if (t.kind === 'fert' && !fertOk(t.plantId)) continue;
      const ns = notifStageOf(t.daysLeft), st = stageOf(t.kind, t.daysLeft);
      if (!ns || !n.stages[ns]) continue;
      // 遅れ(3日以上)は、最初の通知のあと3日ごとに再度通知する(それ以外は予定日につき1回)
      const sfx = ns === 'over' && st === 'late' ? 'late' + Math.floor((-t.daysLeft - LATE_FROM[t.kind]) / LATE_REPEAT) : ns;
      const key = `${t.plantId}:${t.kind}:${t.due}:${sfx}`;
      if (notified && notified[key]) continue;
      const gk = t.kind + ':' + st;
      if (!groups.has(gk)) groups.set(gk, { kind: t.kind, stage: st, keys: [], names: [] });
      const g = groups.get(gk); g.keys.push(key); g.names.push(t.name);
    }
    const order = { late: 0, now: 1, soon: 2 };
    return [...groups.values()].sort((a, b) => order[a.stage] - order[b.stage]).map((g) => {
      const lb = labels[g.kind][g.stage];
      const what = g.kind === 'water' ? '水やり' : '液肥';
      return { kind: g.kind, stage: g.stage, keys: g.keys, tag: `${g.kind}:${g.stage}:${C0()}`, title: `${what}「${lb}」`, text: g.names.join('、') };
    });
  }
  const C0 = () => ymd(new Date());

  /* 購入日(所有開始日): 年→季節→月→日。日が不明なら 月前半=7日・月後半=21日 を基準日として扱う */
  const SEASON_MONTHS = { 春: [3, 4, 5], 夏: [6, 7, 8], 秋: [9, 10, 11], 冬: [12, 1, 2] };
  const seasonOfMonth = (m) => Object.keys(SEASON_MONTHS).find((k) => SEASON_MONTHS[k].includes(Number(m))) || '';
  const HALF_DAY = { first: 7, second: 21 };
  function ownStart(p) {
    if (!p) return null;
    if (p.purchaseDate) return { date: p.purchaseDate, approx: false };
    const y = num(p.purchaseYear); if (!y) return null;
    const m = num(p.purchaseMonth);
    if (m) return { date: `${y}-${pad(m)}-${pad(HALF_DAY[p.purchaseHalf] || 15)}`, approx: true, monthStart: `${y}-${pad(m)}-01` };
    const lm = { 春: 4, 夏: 7, 秋: 10, 冬: 1 }[p.purchaseSeason] || 7; // 旧データ(年+季節のみ)
    return { date: `${y}-${pad(lm)}-15`, approx: true };
  }
  /** 枯死日として許せる最小の日付(購入日が不明確なときは購入月の1日)。無ければ '' */
  /** 管理場所: 春夏秋冬ごとの設定(p.seasonLoc)があればその季節の場所、なければ基本の栽培場所(p.location) */
  function effLocation(p, dateStr) {
    if (!p) return '';
    const d = dateStr ? parse(dateStr) : new Date(); const se = seasonOfMonth(d.getMonth() + 1);
    return (p.seasonLoc && p.seasonLoc[se]) || p.location || '';
  }
  function purchaseMin(p) { const s = ownStart(p); return s ? (s.approx ? (s.monthStart || '') : s.date) : ''; }
  function purchaseLabel(p) {
    const s = ownStart(p); if (!s) return '';
    if (!s.approx) { const [y, m, d] = s.date.split('-').map(Number); return `${y}/${m}/${d}`; }
    const m = num(p.purchaseMonth);
    if (m) return `${p.purchaseYear}年${m}月${p.purchaseHalf === 'first' ? '前半' : p.purchaseHalf === 'second' ? '後半' : ''}(約)`;
    return `${p.purchaseYear}年 ${p.purchaseSeason || ''}(約)`;
  }

  root.PlantCore = { locNotice, locationNotices, effLocation, SEASON_MONTHS, seasonOfMonth, HALF_DAY, ownStart, purchaseMin, purchaseLabel, DAY, ymd, parse, today, addDays, diffDays, num, isDormant, effWater, effFert, nextDue, buildTasks, computeWarnings, computeDueNotifications, DEFAULT_LABELS, mergeLabels, setLabels, getLabels, stageOf, stageLabel, notifyCfg, notifStageOf };
})(typeof self !== 'undefined' ? self : window);
