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
  function computeWarnings(plants, names, daily, margin) {
    const out = [];
    if (!daily || !daily.length) return out;
    margin = num(margin) ?? 3;
    for (const p of plants) {
      const outdoorMin = num(p.outdoorMin), indoor = num(p.indoorTemp), high = num(p.highTemp);
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

  /** 通知対象の判定。notified は {key:true} の既通知マップ */
  function computeDueNotifications(plants, names, settings, notified) {
    const n = (settings && settings.notify) || {};
    if (n.enabled === false) return [];
    const offsets = Array.isArray(n.offsets) ? n.offsets : [3, 1, 0];
    const overdueOn = n.overdue !== false;
    const t0 = today();
    const lines = [];
    for (const t of buildTasks(plants, names)) {
      const label = t.kind === 'water' ? '水やり' : '液体肥料';
      let key = null, text = null;
      if (t.daysLeft < 0 && overdueOn) { key = `${t.plantId}:${t.kind}:over:${t0}`; text = `${t.name}:${label}が ${-t.daysLeft} 日超過しています`; }
      else if (offsets.includes(t.daysLeft)) {
        key = `${t.plantId}:${t.kind}:${t.due}:${t.daysLeft}`;
        text = t.daysLeft === 0 ? `${t.name}:今日は${label}のタイミングです`
          : t.daysLeft === 1 ? `${t.name}:明日は${label}(準備を)` : `${t.name}:あと${t.daysLeft}日で${label}`;
      }
      if (key && !(notified && notified[key])) lines.push({ key, text, kind: t.kind });
    }
    return lines;
  }

  root.PlantCore = { DAY, ymd, parse, today, addDays, diffDays, num, isDormant, effWater, effFert, nextDue, buildTasks, computeWarnings, computeDueNotifications };
})(typeof self !== 'undefined' ? self : window);
