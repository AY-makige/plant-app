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
  function computeWarnings(plants, names, daily, margin, temps) {
    const out = [];
    if (!daily || !daily.length) return out;
    margin = num(margin) ?? 3;
    for (const p of plants) {
      const T = temps || {}; const outdoorMin = num(T.outdoorMin), indoor = num(T.indoorTemp), high = num(T.highTemp);
      {
        const rank = { urgent: 3, warning: 2, caution: 1 };
        let best = null;
        for (const d of daily) {
          if (d.tmin == null) continue;
          let lv = null, th = null;
          if (outdoorMin != null && d.tmin < outdoorMin) { lv = 'urgent'; th = outdoorMin; }
          else if (indoor != null && d.tmin < indoor) { lv = 'warning'; th = indoor; }
          else if (indoor != null && d.tmin <= indoor + margin) { lv = 'caution'; th = indoor; }
          if (lv && (!best || rank[lv] > rank[best.level])) best = { level: lv, date: d.date, temp: d.tmin, threshold: th };
        }
        if (best) {
          const label = { urgent: '緊急', warning: '警告', caution: '注意' }[best.level];
          const msg = best.level === 'urgent' ? `屋外管理の最低温度 ${outdoorMin}℃ を下回る予報(最低 ${best.temp}℃)`
            : best.level === 'warning' ? `室内取り込み目安 ${indoor}℃ を下回る予報(最低 ${best.temp}℃)`
              : `室内取り込み目安 ${indoor}℃ に接近(最低 ${best.temp}℃)`;
          out.push({ plantId: p.id, name: names[p.id], kind: 'cold', ...best, label, msg });
        }
      }
      if (high != null) {
        const hot = daily.filter((d) => d.tmax != null && d.tmax >= high).sort((a, b) => b.tmax - a.tmax)[0];
        if (hot) out.push({ plantId: p.id, name: names[p.id], kind: 'heat', level: 'heat', label: '高温', date: hot.date, temp: hot.tmax, threshold: high, msg: `高温注意温度 ${high}℃ 以上の予報(最高 ${hot.tmax}℃)` });
      }
    }
    const order = { urgent: 0, warning: 1, heat: 2, caution: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level] || a.date.localeCompare(b.date));
  }

  /* ── 予定日との差による段階(そろそろ / 今やる / 遅れ)と、ユーザーが変えられる表示名 ── */
  const DEFAULT_LABELS = {
    water: { soon: 'そろそろ', now: 'カラカラ', late: 'み、水…' },
    fert: { soon: 'そろそろ', now: '腹ペコ', late: '断食' },
  };
  /** 「遅れ」になる超過日数(水やり: 4日以上、液肥: 3日以上) */
  const LATE_FROM = { water: 3, fert: 3 };
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
      const key = `${t.plantId}:${t.kind}:${t.due}:${ns}`;
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

  root.PlantCore = { DAY, ymd, parse, today, addDays, diffDays, num, isDormant, effWater, effFert, nextDue, buildTasks, computeWarnings, computeDueNotifications, DEFAULT_LABELS, mergeLabels, setLabels, getLabels, stageOf, stageLabel, notifyCfg, notifStageOf };
})(typeof self !== 'undefined' ? self : window);
