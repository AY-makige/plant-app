// weather.js — Open-Meteo(APIキー不要)で気象情報を取得
import { db } from './db.js';

const WMO = (c) => {
  if (c === 0) return ['快晴', 'i_sun']; if (c <= 2) return ['晴れ時々くもり', 'i_sun']; if (c === 3) return ['くもり', 'i_cloud'];
  if (c === 45 || c === 48) return ['霧', 'i_cloud']; if (c >= 51 && c <= 57) return ['霧雨', 'i_drop'];
  if (c >= 61 && c <= 67) return ['雨', 'i_drop']; if (c >= 71 && c <= 77) return ['雪', 'i_cloud']; if (c >= 80 && c <= 82) return ['にわか雨', 'i_drop'];
  if (c === 85 || c === 86) return ['にわか雪', 'i_cloud']; if (c >= 95) return ['雷雨', 'i_warn']; return ['—', 'i_cloud'];
};
export const wmo = WMO;

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export async function geocode(name) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=ja&format=json`;
  const j = await getJson(u);
  return (j.results || []).map((r) => ({
    name: r.name, admin1: r.admin1 || '', admin2: r.admin2 || '', country: r.country || '', lat: r.latitude, lon: r.longitude,
    label: [r.admin1, r.admin2, r.name].filter((x, i, a) => x && a.indexOf(x) === i).join(' '),
  }));
}

/** 予報取得。失敗時は最後のキャッシュを返す({stale:true}) */
export async function fetchForecast(region, force = false) {
  const cached = await db.kvGet('forecast', null);
  const key = `${region.lat},${region.lon}`;
  if (!force && cached && cached.key === key && Date.now() - cached.at < 30 * 60000) return cached.data;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${region.lat}&longitude=${region.lon}` +
      `&current=temperature_2m,weather_code,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
      `&timezone=auto&forecast_days=7`;
    const j = await getJson(u);
    const daily = j.daily.time.map((t, i) => ({
      date: t, code: j.daily.weather_code[i], tmax: j.daily.temperature_2m_max[i], tmin: j.daily.temperature_2m_min[i],
      pop: j.daily.precipitation_probability_max[i], rain: j.daily.precipitation_sum[i],
    }));
    const data = { current: { temp: j.current.temperature_2m, code: j.current.weather_code, humidity: j.current.relative_humidity_2m, time: j.current.time }, daily, fetchedAt: Date.now() };
    await db.kvSet('forecast', { key, at: Date.now(), data });
    return data;
  } catch (e) {
    if (cached && cached.key === key) return { ...cached.data, stale: true };
    throw e;
  }
}

/** 月別気候: 直近3年(完了年)の日別データから月ごとに集計。30日キャッシュ */
export async function fetchClimate(region) {
  const key = `${region.lat},${region.lon}`;
  const cached = await db.kvGet('climate', null);
  if (cached && cached.key === key && Date.now() - cached.at < 30 * 86400000) return cached.data;
  const y = new Date().getFullYear();
  const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${region.lat}&longitude=${region.lon}` +
    `&start_date=${y - 3}-01-01&end_date=${y - 1}-12-31&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max&timezone=auto`;
  const j = await getJson(u);
  const acc = Array.from({ length: 12 }, () => ({ mean: [], min: [], max: [] }));
  j.daily.time.forEach((t, i) => {
    const m = Number(t.slice(5, 7)) - 1;
    if (j.daily.temperature_2m_mean[i] != null) acc[m].mean.push(j.daily.temperature_2m_mean[i]);
    if (j.daily.temperature_2m_min[i] != null) acc[m].min.push(j.daily.temperature_2m_min[i]);
    if (j.daily.temperature_2m_max[i] != null) acc[m].max.push(j.daily.temperature_2m_max[i]);
  });
  const avg = (a) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null);
  const data = { years: `${y - 3}〜${y - 1}`, months: acc.map((a) => ({ mean: avg(a.mean), minAvg: avg(a.min), minAbs: a.min.length ? Math.min(...a.min) : null, maxAvg: avg(a.max) })) };
  await db.kvSet('climate', { key, at: Date.now(), data });
  return data;
}
