// epitaph.js — メモリアルの「ひとこと」(ランダム表示)。自分で刻んだ言葉(grave.epitaph)があればそちらを固定表示する
const GENERIC = [
  '水が好きだった…', '虫が嫌いだった…', '明るいところが好きだった…', '夢は大株になることだった…', '将来に期待されていた…', 'お高い存在だった…', '雑草並みの生命力だった…',
  '朝の光を待っていた…', '風通しのいい場所が好きだった…', 'ちょっと気難しいところがあった…', 'ゆっくり育つのが自分のペースだった…', '新しい葉が出るたび、みんなが喜んだ…',
  'いつも窓のほうを向いていた…', '静かに、でも確かにそこにいた…', 'お世話されるのが、案外うれしかった…', '花を咲かせるのが密かな目標だった…', '根っこは意外と頑張り屋だった…',
  '日当たりのいい席を狙っていた…', '雨の日がちょっと好きだった…', 'また会える気がしている…', '肥料の日を楽しみにしていた…', 'ご近所の植物たちと仲がよかった…', '葉っぱの形が自慢だった…',
  '植え替えの日は、少しだけ緊張していた…', 'いつか鉢が小さくなる日を夢見ていた…',
];

/** その植物の記録から「それっぽい」言葉を足す(該当するものは出やすくなる) */
function contextual(g) {
  const p = g.plant || {}, s = g.species || {}, out = [];
  const text = (x) => String(x || '');
  if (/湿|水|腰水/.test(text(s.moisture)) || (p.water && p.water.interval && Number(p.water.interval) <= 3)) out.push('水が好きだった…', 'のどが渇きやすい子だった…');
  if (/日なた|直射|明る|日当/.test(text(s.light))) out.push('明るいところが好きだった…', 'お日さまのことが大好きだった…');
  if (/日陰|半日陰|明るい日陰|室内/.test(text(s.light))) out.push('静かな日陰が落ち着く場所だった…');
  if (Number(p.price) >= 5000) out.push('お高い存在だった…', '家族(財布)も覚悟して迎えた存在だった…');
  if (Number(p.price) > 0 && Number(p.price) <= 500) out.push('お手頃価格でも、かけがえのない存在だった…');
  const causes = (g.causes || []).map((c) => c.cause).join(' ');
  if (/害虫/.test(causes)) out.push('虫が嫌いだった…');
  if (/高温/.test(causes)) out.push('暑さがちょっぴり苦手だった…');
  if (/低温/.test(causes)) out.push('寒さがちょっぴり苦手だった…');
  if (/水切れ/.test(causes)) out.push('もっとお水がほしかったのかもしれない…');
  if (/根腐れ/.test(causes)) out.push('足元がじめじめするのは苦手だった…');
  if (p.fert && p.fert.interval) out.push('ごはん(液肥)の時間が楽しみだった…');
  if (s.tempMin !== '' && s.tempMin != null && Number(s.tempMin) >= 10) out.push('寒がりだった…');
  if (s.cycle && s.cycle.bloom && s.cycle.bloom.length) out.push('花を咲かせる日を夢見ていた…');
  return out;
}

/** 固定の言葉があればそれを、なければランダムに1つ。直前と同じ言葉は避ける */
export function epitaphFor(g, last) {
  if (g.epitaph && g.epitaph.trim()) return { text: g.epitaph.trim(), fixed: true };
  const pool = [...GENERIC, ...contextual(g), ...contextual(g)]; // 該当する言葉は2倍出やすい
  const cand = pool.filter((t) => t !== last);
  const list = cand.length ? cand : pool;
  return { text: list[Math.floor(Math.random() * list.length)], fixed: false };
}
