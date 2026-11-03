// 修复批次 D · 装备杠杆环境测试：早/中/后期 × 装备档位（裸装/中配/顶配/顶配+5/顶配+10）
// jsdom 加载真实工程（不改源码），真实 tick 引擎采集胜率/平均回合/终局构成。
// 用法：node tests/batchD_gear.mjs [--n 100] [--combos early-none,early-mid,...]
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
const N = parseInt(opt('n', '100'), 10);
const ALL = ['early-none', 'early-mid', 'early-top', 'mid-none', 'mid-mid', 'mid-top', 'late-none', 'late-top', 'late-top5', 'late-top10'];
const COMBOS = opt('combos', ALL.join(',')).split(',');

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
window.__gd = (function () {
  renderBattle = function () {};
  blog = function () {};
  hitFx = function () {};
  koFx = function () { SFX.koCheer(); };
  shakeRing = function () {};
  var NO_GEAR = { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null };
  var MID_GEAR = { gloves: 'gloves2', guard: 'guard1', boots: 'boots1', head: 'head1', robe: 'robe1', wrist: 'wrist1' };
  var TOP_GEAR = { gloves: 'gloves3', guard: 'guard3', boots: 'boots3', head: 'head3', robe: 'robe3', wrist: 'wrist3' };
  function attrs(v) { return { power: v, endurance: v, will: v, speed: v, accuracy: v, footwork: v, defense: v, technique: v }; }
  function baseState() {
    S = defaultState();
    S.day = 7; S.rank = 50; S.roster = buildRoster(50, 1);
    S.mind = 80; S.ap = 6; S.deathFight = false; S.injury = 0; S.winStreak = 0; S.wins = 0; S.losses = 0; S.money = 100000;
    return S;
  }
  function growTo(week) { for (var wk = 2; wk <= week; wk++) { S.day = wk * 7; weeklyRosterGrowth(wk); } S.day = week * 7; }
  var STAGES = {
    early: function () { baseState(); growTo(3); S.attrs = attrs(13); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 100; }); },
    mid:   function () { baseState(); growTo(10); S.attrs = attrs(20); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; }); },
    late:  function () { baseState(); growTo(20); S.attrs = attrs(32); PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 500; }); }
  };
  var TIERS = {
    none:  function () { S.gear = Object.assign({}, NO_GEAR); S.enh = {}; },
    mid:   function () { S.gear = Object.assign({}, MID_GEAR); S.owned = Object.keys(MID_GEAR).map(function (k) { return MID_GEAR[k]; }); S.enh = {}; },
    top:   function () { S.gear = Object.assign({}, TOP_GEAR); S.owned = Object.keys(TOP_GEAR).map(function (k) { return TOP_GEAR[k]; }); S.enh = {}; },
    top5:  function () { TIERS.top(); S.enh = { gloves3: 5, guard3: 5, boots3: 5, head3: 5, robe3: 5, wrist3: 5 }; },
    top10: function () { TIERS.top(); S.enh = { gloves3: 10, guard3: 10, boots3: 10, head3: 10, robe3: 10, wrist3: 10 }; }
  };
  function run(combo, n) {
    var parts = combo.split('-');
    STAGES[parts[0]](); TIERS[parts[1]]();
    var eff0 = effAttrs(); // 同步取生效值：跨 eval 之间结算定时器会推进/污染状态，单独 effOf 不可靠（批次 D 基线轮教训）
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, unfinished: 0, roundsSum: 0, kinds: {}, myHpSum: 0 };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap); B = null; pendingFoe = null;
      startBattle('auto');
      if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
      if (!B) { st.unfinished++; continue; }
      B.speed = 2;
      var g = 0;
      while (B && B.phase !== 'over' && g++ < 20000) { B.freezeUntil = 0; tick(); }
      if (!B || B.phase !== 'over' || !B.result) { st.unfinished++; continue; }
      st.n++;
      if (B.result.win) st.win++;
      st.roundsSum += B.round;
      var k = B.koKind || 'pts'; st.kinds[k] = (st.kinds[k] || 0) + 1;
      st.myHpSum += Math.max(0, B.me.hp) / B.me.hpMax;
    }
    S = JSON.parse(snap); B = null;
    st.eff = eff0;
    return st;
  }
  function effOf(combo) { // 该组合下的有效属性（面板口径），供记录装备生效值
    var parts = combo.split('-');
    STAGES[parts[0]](); TIERS[parts[1]]();
    return effAttrs();
  }
  return { run: run, effOf: effOf };
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
  for (const combo of COMBOS) {
    const t0 = Date.now();
    const e = w.eval(`__gd.run(${JSON.stringify(combo)}, ${N})`);
    const eff = e.eff;
    console.log(JSON.stringify({
      combo, n: e.n, unfinished: e.unfinished,
      winPct: pct(e.win, e.n),
      avgRound: e.n ? Math.round(e.roundsSum / e.n * 100) / 100 : 0,
      myHpAvg: e.n ? Math.round(e.myHpSum / e.n * 100) / 100 : 0,
      kinds: e.kinds,
      effPower: eff.power, effEnd: eff.endurance, effSpd: eff.speed, effAcc: eff.accuracy, effFoot: eff.footwork, effDef: eff.defense,
      secs: Math.round((Date.now() - t0) / 100) / 10
    }));
  }
  w.close();
} finally {
  srv.close();
}
