// KO 定型（CF＋F2）实装复核 + 模拟跳过标定数据采集。
// jsdom 加载真实工程（不改源码）：多环境跑真实 tick 引擎，采集
//   胜率 / 终局构成（koKind）/ 终结回合分布 / 平均回合 / 玩家命中恒1点占比 / score 差均值，
// 并同环境跑现行 simulateBattle 采集胜率与 KO 率，供标定拟合与落地后对照。
// 用法：node tests/ko-impl-verify.mjs [--n 300] [--envs br1,br10,br20,t1,t6,t12,match12,pow,spd,tec,weak,practice] [--simonly]
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
const N = parseInt(opt('n', '300'), 10);
const ENVS = opt('envs', 'br1,br10,br20,t6,t12,match12,pow,spd,tec,weak,practice').split(',');
const WITH_SIM = !args.includes('--nosim');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
  return { interceptors: [requestInterceptor((request) => {
    if (request.url.startsWith(origin)) return undefined;
    return new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  })] };
}
async function loadPage(origin) {
  const vc = new VirtualConsole();
  const html = await (await fetch(origin + '/index.html')).text();
  const dom = new JSDOM(html, {
    url: origin + '/index.html',
    resources: localOnly(origin),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.__errs = [];
      window.addEventListener('error', (ev) => window.__errs.push(String(ev.message || ev.error || 'unknown')));
    },
  });
  await new Promise((r) => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); });
  await sleep(150);
  return dom.window;
}

const DRIVER = String.raw`
window.__verify = (function () {
  renderBattle = function () {};
  blog = function () {};
  hitFx = function () {};
  koFx = function () { SFX.koCheer(); };
  shakeRing = function () {};

  var NO_GEAR = { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null };
  var MID_GEAR = { gloves: 'gloves2', guard: 'guard1', boots: 'boots1', head: 'head1', robe: 'robe1', wrist: 'wrist1' };
  var PRO_GEAR = { gloves: 'gloves3', guard: 'guard3', boots: 'boots2', head: 'head2', robe: 'robe1', wrist: 'wrist2' };
  function attrs(v) { return { power: v, endurance: v, will: v, speed: v, accuracy: v, footwork: v, defense: v, technique: v }; }
  function punchExp(v) { return { jab: v, straight: v, hook: v, upper: v, body: v }; }

  // 与 simulateBattle 内 score() 逐字一致的复制（仅供采集分差，判定不依赖它）
  function scoreOf(f) {
    var a = f.attrs;
    var profSum = 0; PUNCH_KEYS.forEach(function (k) { profSum += f.prof[k]; });
    return a.power * 1.4 + a.endurance * 1.1 + a.speed + a.accuracy + a.footwork * 0.8 + a.defense * 0.9 + a.technique + a.will * 0.6 + profSum * 2.2;
  }

  function baseState() {
    S = defaultState();
    S.day = 7; S.rank = 50; S.roster = buildRoster(50, 1);
    S.mind = 80; S.ap = 6; S.deathFight = false; S.injury = 0; S.winStreak = 0;
    S.wins = 0; S.losses = 0; S.money = 100000;
    return S;
  }
  function growTo(week) { for (var wk = 2; wk <= week; wk++) { S.day = wk * 7; weeklyRosterGrowth(wk); } S.day = week * 7; }

  var SETUPS = {
    // balance-retest 口径（属性均匀 + 档位装备）
    br1:  function () { baseState(); S.attrs = attrs(10); S.gear = Object.assign({}, NO_GEAR); S.punchExp = punchExp(0); },
    br10: function () { baseState(); growTo(10); S.attrs = attrs(20); S.gear = Object.assign({}, PRO_GEAR); S.punchExp = punchExp(300); },
    br20: function () { baseState(); growTo(20); S.attrs = attrs(30); S.gear = Object.assign({}, PRO_GEAR); S.punchExp = punchExp(500); },
    // ko-audit 口径（punchExp 为经验值、装备档位见 KO_AUDIT.md）
    t1:   function () { baseState(); S.attrs = attrs(10); S.gear = Object.assign({}, NO_GEAR); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 0; }); },
    t6:   function () { baseState(); growTo(6); S.attrs = attrs(16); S.gear = Object.assign({}, MID_GEAR); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 200; }); },
    t12:  function () { baseState(); growTo(12); S.attrs = attrs(22); S.gear = Object.assign({}, PRO_GEAR); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 400; }); },
    match12: function () { baseState(); growTo(12); S.attrs = attrs(19); S.gear = Object.assign({}, MID_GEAR); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; }); },
    // ko-audit 构筑口径（第 10 周环境）
    pow:  function () { setupBuild({ power: 30, endurance: 24, will: 20, speed: 20, accuracy: 20, footwork: 18, defense: 20, technique: 20 }); },
    spd:  function () { setupBuild({ power: 12, endurance: 22, will: 20, speed: 38, accuracy: 34, footwork: 30, defense: 18, technique: 24 }); },
    tec:  function () { setupBuild({ power: 12, endurance: 22, will: 20, speed: 26, accuracy: 32, footwork: 24, defense: 18, technique: 42 }); },
    weak: function () { baseState(); growTo(10); S.attrs = attrs(8); S.gear = Object.assign({}, NO_GEAR); S.punchExp = punchExp(0); },
    practice: function () { baseState(); S.attrs = attrs(10); S.gear = Object.assign({}, NO_GEAR); S.punchExp = punchExp(0); },
  };
  function setupBuild(b) {
    baseState(); growTo(10);
    ATTRS.forEach(function (a) { S.attrs[a.key] = b[a.key]; });
    PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; });
    S.gear = Object.assign({}, MID_GEAR);
  }

  // 玩家命中逐拳记录（包装 dealDamage，用 att.dmg 增量取最终伤害，与 ko-audit 同法）
  var cur = null;
  var origDD = dealDamage;
  dealDamage = function (att, def, key, mult, isMeAttacking, isCounter, nameOverride) {
    var preDmg = att.dmg;
    var r = origDD(att, def, key, mult, isMeAttacking, isCounter, nameOverride);
    if (cur && isMeAttacking) {
      var d = att.dmg - preDmg;
      cur.meHits++; if (d <= 1) cur.meOnes++;
    }
    return r;
  };

  function runEngine(name, n) {
    SETUPS[name]();
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, unfinished: 0, kinds: {}, endRound: { 1: 0, 2: 0, 3: 0 }, roundsSum: 0, meHits: 0, meOnes: 0, downsFights: 0, diffSum: 0 };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap); B = null;
      if (name === 'practice') { pendingFoe = makePracticeFoe(); nextBattlePractice = false; }
      else pendingFoe = null;
      var meF = myFighter();
      startBattle('auto');
      if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
      if (!B) { st.unfinished++; continue; }
      B.speed = 2; // 游戏自带速度机制（dt 与出拳轮次同步缩放，ko-audit 同法），只降 tick 固定开销
      st.diffSum += scoreOf(meF) - scoreOf(B.foe);
      cur = { meHits: 0, meOnes: 0 };
      var g = 0, sawDown = false;
      while (B && B.phase !== 'over' && g++ < 20000) {
        B.freezeUntil = 0;
        tick();
        if (B && (B.meDownsRound + B.foeDownsRound) > 0) sawDown = true;
      }
      if (!B || B.phase !== 'over' || !B.result) { st.unfinished++; cur = null; continue; }
      st.n++;
      if (B.result.win) st.win++;
      var k = B.koKind || 'pts';
      st.kinds[k] = (st.kinds[k] || 0) + 1;
      st.endRound[B.round] = (st.endRound[B.round] || 0) + 1;
      st.roundsSum += B.round;
      if (sawDown) st.downsFights++;
      st.meHits += cur.meHits; st.meOnes += cur.meOnes;
      cur = null;
    }
    S = JSON.parse(snap); B = null;
    return st;
  }
  function runSim(name, n) {
    SETUPS[name]();
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, ko: 0, tko: 0, pts: 0, roundsSum: 0, diffSum: 0 };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap); B = null; pendingFoe = null;
      var before = JSON.stringify(S);
      var meF = myFighter();
      simulateBattle();
      if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
      if (!B) continue;
      st.diffSum += scoreOf(meF) - scoreOf(B.foe);
      st.n++;
      if (S.wins > 0) st.win++;
      if (B.koKind === 'sim') st.ko++;
      else if (B.koKind === 'sim-tko') st.tko++;
      else st.pts++;
      S = JSON.parse(before);
    }
    S = JSON.parse(snap); B = null;
    return st;
  }
  return { runEngine: runEngine, runSim: runSim };
})();
'ready';
`;

const { srv, origin } = await serve(root);
try {
  const w = await loadPage(origin);
  const errs = (w.__errs || []).filter((m) => !/Could not load/i.test(m));
  if (errs.length) { console.error('页面脚本错误：', errs); process.exit(1); }
  if (w.document.getElementById('storyModal').classList.contains('open')) w.document.getElementById('btnStorySkip').click();
  await sleep(30);
  w.eval(DRIVER);
  const pct = (x, n) => (n ? Math.round(x / n * 1000) / 10 : 0);
  const out = {};
  for (const env of ENVS) {
    const t0 = Date.now();
    const e = w.eval(`__verify.runEngine(${JSON.stringify(env)}, ${N})`);
    const row = {
      env, n: e.n, unfinished: e.unfinished,
      winPct: pct(e.win, e.n),
      avgRound: e.n ? Math.round(e.roundsSum / e.n * 100) / 100 : 0,
      r1EndPct: pct(e.endRound[1] || 0, e.n),
      endRound: e.endRound, kinds: e.kinds,
      koEndPct: pct(e.n - (e.kinds.pts || 0), e.n),
      meOnesPct: pct(e.meOnes, e.meHits),
      downsFightsPct: pct(e.downsFights, e.n),
      meanDiff: e.n ? Math.round(e.diffSum / e.n * 10) / 10 : 0,
      secs: Math.round((Date.now() - t0) / 100) / 10,
    };
    if (WITH_SIM && env !== 'practice') {
      const s = w.eval(`__verify.runSim(${JSON.stringify(env)}, ${N})`);
      row.sim = {
        n: s.n, winPct: pct(s.win, s.n), koPct: pct(s.ko, s.n), tkoPct: pct(s.tko, s.n), ptsPct: pct(s.pts, s.n),
        winDiff: Math.round(Math.abs(pct(s.win, s.n) - row.winPct) * 10) / 10,
        meanDiff: s.n ? Math.round(s.diffSum / s.n * 10) / 10 : 0,
      };
    }
    out[env] = row;
    console.log(`\n### ${env}（引擎 n=${row.n} 未完=${row.unfinished}，${row.secs}s）胜率=${row.winPct}% 平均回合=${row.avgRound} R1终结=${row.r1EndPct}% 终结回合分布=${JSON.stringify(row.endRound)}`);
    console.log(`    终局构成: ${Object.entries(row.kinds).map(([k, v]) => `${k}=${v}(${pct(v, row.n)}%)`).join('  ')}`);
    console.log(`    有击倒对局=${row.downsFightsPct}% 玩家恒≤1点命中=${row.meOnesPct}% score差均值=${row.meanDiff}`);
    if (row.sim) console.log(`    模拟: 胜率=${row.sim.winPct}%（差 ${row.sim.winDiff}pp） KO=${row.sim.koPct}% TKO=${row.sim.tkoPct}% 点数=${row.sim.ptsPct}%`);
  }
  console.log('\nJSON:' + JSON.stringify(out));
  w.close();
} finally {
  srv.close();
}
