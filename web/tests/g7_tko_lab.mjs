// 批次 G7（plan T9）TKO 放宽实验室：只做验证、默认不合入。
// 变体＝「重创衰减回落到刻度以下后，同刻度可再次触发击倒」：serve 时在内存里把
// js/battle.js 的刻度判定一行（本回合 marks 去重）替换为「每次向上跨刻度即触发」，
// 不改磁盘源码。traumaBefore < t 是跨越的必要条件，而重创只有 decayTrauma 一条下降
// 路径，所以「向上跨越」必然意味着此前已回落到刻度以下——与实验定义等价。
// 另带 --nofoecmd 消融（t6 sim 残差复核用：关掉对手指令 AI 看引擎胜率变化）。
// 用法：node tests/g7_tko_lab.mjs [--variant] [--nofoecmd] [--n 150] [--envs t6,spd,weak,br20] [--sim]
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
const VARIANT = args.includes('--variant');
const SIMONLY = args.includes('--simonly');
const NOFOECMD = args.includes('--nofoecmd');
const WITH_SIM = args.includes('--sim');
const N = parseInt(opt('n', '150'), 10);
const ENVS = opt('envs', 't6,spd,weak,br20').split(',');
const say = (s) => { fs.writeSync(1, s + '\n'); };

const MARKS_FROM = 'if (traumaBefore < t && traumaAfter >= t && !marks[t]) { marks[t] = true; crossedMark = true; }';
const MARKS_TO = 'if (traumaBefore < t && traumaAfter >= t) { crossedMark = true; } // G7 实验变体：回落再跨越同刻度可重触发';
let battleVariant = null;
if (VARIANT) {
  const src = fs.readFileSync(path.join(root, 'js', 'battle.js'), 'utf8');
  const cnt = src.split(MARKS_FROM).length - 1;
  if (cnt !== 1) { console.error(`变体替换失败：目标行出现 ${cnt} 次（应为 1）`); process.exit(1); }
  battleVariant = src.replace(MARKS_FROM, MARKS_TO);
  say('变体已构造：刻度 marks 去重 → 回落再跨越可重触发（内存替换，磁盘未动）');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function serve(dir) {
  const srv = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (VARIANT && urlPath === '/js/battle.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(battleVariant);
      return;
    }
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

// DRIVER 与 ko-impl-verify 同源（SETUPS t6/spd/weak/br20 同口径），只保留 G7 需要的环境与采集项
const DRIVER = String.raw`
window.__verify = (function () {
  renderBattle = function () {};
  blog = function () {};
  hitFx = function () {};
  koFx = function () { SFX.koCheer(); };
  shakeRing = function () {};
  // 纯演出层 stub（判定零参与，batchB_lab 同口径）：纸偶驱动/残影/弧光/闪光/粒子在 jsdom 里是 DOM 成本大头
  setMePose = function () {};
  spawnAfterimage = function () {};
  spawnPunchArc = function () {};
  spawnHitFlash = function () {};
  burstParticles = function () {};
  knockback = function () {};

  var NO_GEAR = { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null };
  var MID_GEAR = { gloves: 'gloves2', guard: 'guard1', boots: 'boots1', head: 'head1', robe: 'robe1', wrist: 'wrist1' };
  var PRO_GEAR = { gloves: 'gloves3', guard: 'guard3', boots: 'boots2', head: 'head2', robe: 'robe1', wrist: 'wrist2' };
  function attrs(v) { return { power: v, endurance: v, will: v, speed: v, accuracy: v, footwork: v, defense: v, technique: v }; }
  function punchExp(v) { return { jab: v, straight: v, hook: v, upper: v, body: v }; }

  function baseState() {
    S = defaultState();
    S.day = 7; S.rank = 50; S.roster = buildRoster(50, 1);
    S.mind = 80; S.ap = 6; S.deathFight = false; S.injury = 0; S.winStreak = 0;
    S.wins = 0; S.losses = 0; S.money = 100000;
    return S;
  }
  function growTo(week) { for (var wk = 2; wk <= week; wk++) { S.day = wk * 7; weeklyRosterGrowth(wk); } S.day = week * 7; }

  var SETUPS = {
    br20: function () { baseState(); growTo(20); S.attrs = attrs(30); S.gear = Object.assign({}, PRO_GEAR); S.punchExp = punchExp(500); },
    t6:   function () { baseState(); growTo(6); S.attrs = attrs(16); S.gear = Object.assign({}, MID_GEAR); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 200; }); },
    spd:  function () { setupBuild({ power: 12, endurance: 22, will: 20, speed: 38, accuracy: 34, footwork: 30, defense: 18, technique: 24 }); },
    tec:  function () { setupBuild({ power: 12, endurance: 22, will: 20, speed: 26, accuracy: 32, footwork: 24, defense: 18, technique: 42 }); },
    weak: function () { baseState(); growTo(10); S.attrs = attrs(8); S.gear = Object.assign({}, NO_GEAR); S.punchExp = punchExp(0); },
  };
  function setupBuild(b) {
    baseState(); growTo(10);
    ATTRS.forEach(function (a) { S.attrs[a.key] = b[a.key]; });
    PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; });
    S.gear = Object.assign({}, MID_GEAR);
  }

  function runEngine(name, n) {
    SETUPS[name]();
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, unfinished: 0, kinds: {}, endRound: { 1: 0, 2: 0, 3: 0 }, roundsSum: 0, downsFights: 0, downsSum: 0, multiDownRounds: 0 };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap); B = null; pendingFoe = null;
      startBattle('auto');
      if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
      if (!B) { st.unfinished++; continue; }
      B.speed = 2;
      var g = 0, sawDown = false, maxDownsRound = 0;
      while (B && B.phase !== 'over' && g++ < 20000) {
        B.freezeUntil = 0;
        tick();
        if (B && (B.meDownsRound + B.foeDownsRound) > 0) { sawDown = true; maxDownsRound = Math.max(maxDownsRound, B.meDownsRound, B.foeDownsRound); }
      }
      if (!B || B.phase !== 'over' || !B.result) { st.unfinished++; continue; }
      st.n++;
      if (B.result.win) st.win++;
      var k = B.koKind || 'pts';
      st.kinds[k] = (st.kinds[k] || 0) + 1;
      st.endRound[B.round] = (st.endRound[B.round] || 0) + 1;
      st.roundsSum += B.round;
      if (sawDown) st.downsFights++;
      if (maxDownsRound >= 2) st.multiDownRounds++;
      st.downsSum += (B.meDowns || 0) + (B.foeDowns || 0);
    }
    S = JSON.parse(snap); B = null;
    return st;
  }
  function runSim(name, n) {
    SETUPS[name]();
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, ko: 0, tko: 0, pts: 0 };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap); B = null; pendingFoe = null;
      var before = JSON.stringify(S);
      simulateBattle();
      if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
      if (!B) continue;
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
  if (NOFOECMD) { w.eval('foeCommandAI = function () {}; "ok"'); say('消融：foeCommandAI 已关闭'); }
  say(`口径：${VARIANT ? '变体（刻度可重触发）' : '基线（现行 marks 去重）'}${NOFOECMD ? '＋无对手指令' : ''}，n=${N}/环境`);
  const pct = (x, n) => (n ? Math.round(x / n * 1000) / 10 : 0);
  const out = {};
  for (const env of ENVS) {
    say(`\n>>> 环境 ${env} 开始…`);
    const t0 = Date.now();
    if (SIMONLY) {
      const s0 = w.eval(`__verify.runSim(${JSON.stringify(env)}, ${N})`);
      say(`### ${env} SIMONLY（新页面，n=${s0.n}）模拟胜率=${pct(s0.win, s0.n)}% KO=${pct(s0.ko, s0.n)}% TKO=${pct(s0.tko, s0.n)}% 点数=${pct(s0.pts, s0.n)}%`);
      out[env] = { simonly: s0 };
      continue;
    }
    const e = w.eval(`__verify.runEngine(${JSON.stringify(env)}, ${N})`);
    const tko = e.kinds['tko-giveup'] || 0;
    const koEnds = e.n - (e.kinds.pts || 0);
    const row = {
      env, n: e.n, unfinished: e.unfinished,
      winPct: pct(e.win, e.n),
      avgRound: e.n ? Math.round(e.roundsSum / e.n * 100) / 100 : 0,
      r1EndPct: pct(e.endRound[1] || 0, e.n),
      kinds: e.kinds,
      tkoPct: pct(tko, e.n),
      tkoShareOfKoEnds: koEnds ? pct(tko, koEnds) : 0,
      downsFightsPct: pct(e.downsFights, e.n),
      multiDownPct: pct(e.multiDownRounds, e.n),
      secs: Math.round((Date.now() - t0) / 100) / 10,
    };
    if (WITH_SIM) {
      const s = w.eval(`__verify.runSim(${JSON.stringify(env)}, ${N})`);
      row.sim = { n: s.n, winPct: pct(s.win, s.n), winDiffVsEngine: Math.round(Math.abs(pct(s.win, s.n) - row.winPct) * 10) / 10, simMinusEngine: Math.round((pct(s.win, s.n) - row.winPct) * 10) / 10 };
    }
    out[env] = row;
    say(`### ${env}（n=${row.n} 未完=${row.unfinished}，${row.secs}s）胜率=${row.winPct}% 平均回合=${row.avgRound} R1终结=${row.r1EndPct}%`);
    say(`    终局构成: ${Object.entries(row.kinds).map(([k, v]) => `${k}=${v}(${pct(v, row.n)}%)`).join('  ')}`);
    say(`    TKO(单回合3击倒)=${row.tkoPct}%（占KO类终局 ${row.tkoShareOfKoEnds}%） 有击倒对局=${row.downsFightsPct}% 单回合≥2击倒对局=${row.multiDownPct}%`);
    if (row.sim) say(`    模拟: 胜率=${row.sim.winPct}%（sim−引擎=${row.sim.simMinusEngine}pp）`);
  }
  say('\nJSON:' + JSON.stringify(out));
  w.close();
} finally {
  srv.close();
}
