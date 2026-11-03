// 模拟跳过标定拟合：采样各环境 fighter 分布（score 差 / 击杀回合数 TTK），
// 对照引擎实测（balance-retest + ko-impl-verify）网格搜索 winP 与 koP 参数。
// 用法：node tests/ko-sim-fit.mjs [--n 400]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

let JSDOM, VirtualConsole, requestInterceptor;
try {
  ({ JSDOM, VirtualConsole, requestInterceptor } = createRequire(import.meta.url)('jsdom'));
} catch {
  const req = createRequire(process.env.JSDOM_FALLBACK || '/tmp/smoke/package.json');
  ({ JSDOM, VirtualConsole, requestInterceptor } = req('jsdom'));
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const N = parseInt(opt('n', '400'), 10);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve(dir) {
  const srv = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, origin: `http://127.0.0.1:${srv.address().port}` })));
}
function localOnly(origin) {
  return { interceptors: [requestInterceptor((request) => request.url.startsWith(origin) ? undefined : new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } }))] };
}
async function loadPage(origin) {
  const vc = new VirtualConsole();
  const html = await (await fetch(origin + '/index.html')).text();
  const dom = new JSDOM(html, { url: origin + '/index.html', resources: localOnly(origin), runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) { window.__errs = []; window.addEventListener('error', (ev) => window.__errs.push(String(ev.message || ev.error || 'unknown'))); } });
  await new Promise((r) => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); });
  await sleep(150);
  return dom.window;
}

const DRIVER = String.raw`
window.__fit = (function () {
  var NO_GEAR = { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null };
  var MID_GEAR = { gloves: 'gloves2', guard: 'guard1', boots: 'boots1', head: 'head1', robe: 'robe1', wrist: 'wrist1' };
  var PRO_GEAR = { gloves: 'gloves3', guard: 'guard3', boots: 'boots2', head: 'head2', robe: 'robe1', wrist: 'wrist2' };
  function attrs(v) { return { power: v, endurance: v, will: v, speed: v, accuracy: v, footwork: v, defense: v, technique: v }; }
  function punchExp(v) { return { jab: v, straight: v, hook: v, upper: v, body: v }; }
  function scoreOf(f) {
    var a = f.attrs;
    var profSum = 0; PUNCH_KEYS.forEach(function (k) { profSum += f.prof[k]; });
    return a.power * 1.4 + a.endurance * 1.1 + a.speed + a.accuracy + a.footwork * 0.8 + a.defense * 0.9 + a.technique + a.will * 0.6 + profSum * 2.2;
  }
  // 与 battle.js simulateBattle 标定公式逐字一致的 DPS/TTK 模型（拟合与实装共用一份口径）。
  // 结构取自引擎真实公式：出拳尝试率 0.24+速度*0.012（90 tick/回合，体力封顶约 40 次）、
  // 命中率 clamp(0.70+(精准-步法)*0.01)（对手 1/3 时间稳守 -> 期望 *0.9）、格挡期望减伤 *0.85、
  // 单拳净伤害走 F2 地板；profAvg 折算熟练度系数与暴击期望 *1.05。
  function profAvg(f) { var s = 0; PUNCH_KEYS.forEach(function (k) { s += f.prof[k] || 0; }); return s / PUNCH_KEYS.length; }
  function netDmg(att, def) {
    var raw = att.attrs.power * (1 + profAvg(att) * 0.05) * 1.05;
    return Math.max(1, raw - Math.min(def.attrs.defense * 1.0, raw * 0.7));
  }
  function dps(att, def, isFoe) {
    var attempts = Math.min(90 * (0.24 + att.attrs.speed * 0.012) * (isFoe ? 1.15 : 1), 40);
    var hc = Math.min(0.95, Math.max(0.30, 0.70 + (att.attrs.accuracy - def.attrs.footwork) * 0.01)) * 0.9;
    return attempts * hc * 0.85 * netDmg(att, def);
  }
  function ttk(att, def, isFoe) { return def.hpMax / Math.max(1, dps(att, def, isFoe)); }
  function baseState() {
    S = defaultState();
    S.day = 7; S.rank = 50; S.roster = buildRoster(50, 1);
    S.mind = 80; S.ap = 6; S.deathFight = false; S.injury = 0; S.winStreak = 0; S.wins = 0; S.losses = 0; S.money = 100000;
    return S;
  }
  function growTo(week) { for (var wk = 2; wk <= week; wk++) { S.day = wk * 7; weeklyRosterGrowth(wk); } S.day = week * 7; }
  function setupBuild(b) {
    baseState(); growTo(10);
    ATTRS.forEach(function (a) { S.attrs[a.key] = b[a.key]; });
    PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; });
    S.gear = Object.assign({}, MID_GEAR);
  }
  var SETUPS = {
    br1:  function () { baseState(); S.attrs = attrs(10); S.gear = Object.assign({}, NO_GEAR); S.punchExp = punchExp(0); },
    br10: function () { baseState(); growTo(10); S.attrs = attrs(20); S.gear = Object.assign({}, PRO_GEAR); S.punchExp = punchExp(300); },
    br20: function () { baseState(); growTo(20); S.attrs = attrs(30); S.gear = Object.assign({}, PRO_GEAR); S.punchExp = punchExp(500); },
    t6:   function () { baseState(); growTo(6); S.attrs = attrs(16); S.gear = Object.assign({}, MID_GEAR); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 200; }); },
    t12:  function () { baseState(); growTo(12); S.attrs = attrs(22); S.gear = Object.assign({}, PRO_GEAR); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 400; }); },
    match12: function () { baseState(); growTo(12); S.attrs = attrs(19); S.gear = Object.assign({}, MID_GEAR); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; }); },
    pow:  function () { setupBuild({ power: 30, endurance: 24, will: 20, speed: 20, accuracy: 20, footwork: 18, defense: 20, technique: 20 }); },
    spd:  function () { setupBuild({ power: 12, endurance: 22, will: 20, speed: 38, accuracy: 34, footwork: 30, defense: 18, technique: 24 }); },
    tec:  function () { setupBuild({ power: 12, endurance: 22, will: 20, speed: 26, accuracy: 32, footwork: 24, defense: 18, technique: 42 }); },
    weak: function () { baseState(); growTo(10); S.attrs = attrs(8); S.gear = Object.assign({}, NO_GEAR); S.punchExp = punchExp(0); },
  };
  function sample(name, n) {
    SETUPS[name]();
    var snap = JSON.stringify(S);
    var diffs = [], ttks = [], races = [];
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap);
      var me = myFighter();
      var foe = makeFoe();
      diffs.push(scoreOf(me) - scoreOf(foe));
      var tMe = ttk(me, foe, false), tFoe = ttk(foe, me, true);
      ttks.push(Math.min(tMe, tFoe));
      races.push({ d: tFoe - tMe, min: Math.min(tMe, tFoe), pd: Math.max(0, foe.attrs.defense - me.attrs.power - 6) });
    }
    S = JSON.parse(snap);
    return { diffs: diffs, ttks: ttks, races: races };
  }
  return { sample: sample };
})();
'ready';
`;

// 引擎实测（实装后，ko-impl-verify 确定性口径 defaultState+逐周成长，2026-11-03）：
// win% / KO终结%（非点数占比） / 终局回合分布[R1,R2,R3]（点数局必在 R3，故 KO 条件分布由总分布扣除点数局得到）
// 注意：balance-retest 口径数字（46.8/62.3/58.8 等）经查受其 harness 序章弹窗时序的弱化态污染，不作标定依据。
const ENGINE = {
  br1:  { win: 22.0, ko: 48.7, koRounds: [0.0, 24.7, 75.3] },
  br10: { win: 93.3, ko: 100.0, koRounds: [52.7, 46.7, 0.7] },
  br20: { win: 96.0, ko: 100.0, koRounds: [84.7, 15.3, 0.0] },
  t6:   { win: 58.3, ko: 100.0, koRounds: [10.3, 39.3, 50.3] },
  t12:  { win: 96.3, ko: 100.0, koRounds: [66.3, 33.4, 0.3] },
  spd:  { win: 62.0, ko: 100.0, koRounds: [4.5, 76.0, 19.5] },
  weak: { win: 0.0, ko: 100.0, koRounds: [97.5, 2.5, 0.0] },
  match12: { win: 51.7, ko: 100.0, koRounds: [36.7, 62.5, 0.8] },
  // tec 引擎复测 tick 成本异常未跑完，不入拟合（见 KO_AUDIT 实装记录）
};
// 各环境玩家力量（低力量罚项拟合用；构筑固定值）
const ENV_POW = { br1: 10, br10: 20, br20: 30, t6: 16, t12: 22, spd: 12, weak: 8, match12: 19 };

const { srv, origin } = await serve(root);
try {
  const w = await loadPage(origin);
  const errs = (w.__errs || []).filter((m) => !/Could not load/i.test(m));
  if (errs.length) { console.error('页面脚本错误：', errs); process.exit(1); }
  if (w.document.getElementById('storyModal').classList.contains('open')) w.document.getElementById('btnStorySkip').click();
  await sleep(30);
  w.eval(DRIVER);
  const envNames = Object.keys(ENGINE);
  const samples = {};
  for (const name of envNames) {
    samples[name] = w.eval(`__fit.sample(${JSON.stringify(name)}, ${N})`);
    const d = samples[name].diffs, t = samples[name].ttks;
    const md = d.reduce((a, b) => a + b, 0) / d.length;
    const mt = t.reduce((a, b) => a + b, 0) / t.length;
    console.log(`${name}: meanDiff=${md.toFixed(1)} meanMinTTK=${mt.toFixed(2)} 引擎 win=${ENGINE[name].win}% ko=${ENGINE[name].ko}%`);
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // ---- winP 拟合：winP = clamp(base + diff/scale, 0.08, 0.92)，预测胜率 = 样本均值 ----
  let bestWin = null;
  for (let base = 0.42; base <= 0.561; base += 0.01) {
    for (let scale = 35; scale <= 240; scale += 5) {
      let err = 0;
      for (const name of envNames) {
        const pred = samples[name].diffs.reduce((a, d) => a + clamp(base + d / scale, 0.08, 0.92), 0) / samples[name].diffs.length * 100;
        err += Math.abs(pred - ENGINE[name].win);
      }
      if (!bestWin || err < bestWin.err) bestWin = { base: Math.round(base * 100) / 100, scale, err };
    }
  }
  console.log('\nwinP 拟合最优:', JSON.stringify(bestWin));
  for (const name of envNames) {
    const pred = samples[name].diffs.reduce((a, d) => a + clamp(bestWin.base + d / bestWin.scale, 0.08, 0.92), 0) / samples[name].diffs.length * 100;
    console.log(`  ${name}: 预测 ${pred.toFixed(1)}% vs 引擎 ${ENGINE[name].win}%（差 ${Math.abs(pred - ENGINE[name].win).toFixed(1)}pp）`);
  }
  // ---- TTK 竞赛胜率拟合：winP = logistic(k*(ttkFoe-ttkMe)/alpha)，ttk 由 DPS 模型（alpha 全局缩放） ----
  let bestRace = null;
  for (let alpha = 0.5; alpha <= 2.51; alpha += 0.1) {
    for (let k = 0.2; k <= 2.01; k += 0.1) {
      let err = 0;
      for (const name of envNames) {
        const pred = samples[name].races.reduce((s, r) => s + 1 / (1 + Math.exp(-k * r.d / alpha)), 0) / samples[name].races.length * 100;
        err += Math.abs(pred - ENGINE[name].win);
      }
      if (!bestRace || err < bestRace.err) bestRace = { alpha: Math.round(alpha * 100) / 100, k: Math.round(k * 100) / 100, err };
    }
  }
  console.log('\nTTK 竞赛胜率拟合最优:', JSON.stringify(bestRace));
  for (const name of envNames) {
    const pred = samples[name].races.reduce((s, r) => s + 1 / (1 + Math.exp(-bestRace.k * r.d / bestRace.alpha)), 0) / samples[name].races.length * 100;
    console.log(`  ${name}: 预测 ${pred.toFixed(1)}% vs 引擎 ${ENGINE[name].win}%（差 ${Math.abs(pred - ENGINE[name].win).toFixed(1)}pp）`);
  }
  // ---- TTK 竞赛 + 平移 + 相对防守力量罚项（样本级）：logistic(k*(d-shift)/alpha) - pen*pd ----
  let bestRaceP = null;
  for (let alpha = 0.5; alpha <= 1.21; alpha += 0.1) {
    for (let k = 0.6; k <= 2.01; k += 0.1) {
      for (let shift = 0; shift <= 0.301; shift += 0.05) {
        for (let pen = 0; pen <= 0.031; pen += 0.005) {
          let err = 0;
          for (const name of envNames) {
            const pred = samples[name].races.reduce((s, r) => s + clamp(1 / (1 + Math.exp(-k * (r.d - shift) / alpha)) - pen * r.pd, 0.02, 0.98), 0) / samples[name].races.length * 100;
            err += Math.abs(pred - ENGINE[name].win);
          }
          if (!bestRaceP || err < bestRaceP.err) bestRaceP = { alpha: Math.round(alpha * 100) / 100, k: Math.round(k * 100) / 100, shift: Math.round(shift * 100) / 100, pen: Math.round(pen * 1000) / 1000, err };
        }
      }
    }
  }
  console.log('\nTTK 竞赛+平移+相对防守罚项拟合最优:', JSON.stringify(bestRaceP));
  for (const name of envNames) {
    const pred = samples[name].races.reduce((s, r) => s + clamp(1 / (1 + Math.exp(-bestRaceP.k * (r.d - bestRaceP.shift) / bestRaceP.alpha)) - bestRaceP.pen * r.pd, 0.02, 0.98), 0) / samples[name].races.length * 100;
    console.log(`  ${name}: 预测 ${pred.toFixed(1)}% vs 引擎 ${ENGINE[name].win}%（差 ${Math.abs(pred - ENGINE[name].win).toFixed(1)}pp）`);
  }
  // ---- koP 拟合：koP = clamp(a + b*minTTK/alpha, 0.02, 0.99)（alpha 沿用胜率拟合） ----
  let bestKo = null;
  for (let a = 0.7; a <= 1.81; a += 0.05) {
    for (let b = -0.55; b <= -0.001; b += 0.02) {
      let err = 0;
      for (const name of envNames) {
        const pred = samples[name].ttks.reduce((s, t) => s + clamp(a + b * t / bestRace.alpha, 0.02, 0.99), 0) / samples[name].ttks.length * 100;
        err += Math.abs(pred - ENGINE[name].ko);
      }
      if (!bestKo || err < bestKo.err) bestKo = { a: Math.round(a * 100) / 100, b: Math.round(b * 100) / 100, err };
    }
  }
  console.log('\nkoP 拟合最优:', JSON.stringify(bestKo));
  for (const name of envNames) {
    const pred = samples[name].ttks.reduce((s, t) => s + clamp(bestKo.a + bestKo.b * t / bestRace.alpha, 0.02, 0.99), 0) / samples[name].ttks.length * 100;
    console.log(`  ${name}: 预测 KO ${pred.toFixed(1)}% vs 引擎 ${ENGINE[name].ko}%（差 ${Math.abs(pred - ENGINE[name].ko).toFixed(1)}pp）`);
  }
  // ---- KO 终结回合分布拟合：μ=clamp(minTTK/alpha,1,3)，w_r ∝ exp(-k*|r-μ|) ----
  for (const k of [0.7, 1.0, 1.3, 1.7, 2.2]) {
    let err = 0, used = 0;
    for (const name of envNames) {
      const target = ENGINE[name].koRounds;
      if (!target) continue;
      const agg = [0, 0, 0];
      for (const t of samples[name].ttks) {
        const mu = clamp(t / bestRace.alpha, 1, 3);
        const ws = [Math.exp(-k * Math.abs(1 - mu)), Math.exp(-k * Math.abs(2 - mu)), Math.exp(-k * Math.abs(3 - mu))];
        const sum = ws[0] + ws[1] + ws[2];
        for (let r = 0; r < 3; r++) agg[r] += ws[r] / sum;
      }
      for (let r = 0; r < 3; r++) err += Math.abs(agg[r] / samples[name].ttks.length * 100 - target[r]);
      used++;
    }
    console.log(`回合分布 k=${k}: 总绝对误差=${err.toFixed(1)}（${used} 个环境）`);
  }
  w.close();
} finally {
  srv.close();
}
