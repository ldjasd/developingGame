// 数值复测脚本（Phase 9 数值总调）：沿用 ROSTER_SYSTEM.md / ROUND2.md 的复测口径——
// jsdom 加载真实页面脚本，从第 1 周建池、逐周真实调用 weeklyRosterGrowth 推进到目标周，
// 再以真实 tick() 引擎跑自动战斗统计胜率 / 进 R2 / 进 R3 / KO 率 / 平均回合；另跑模拟模式对比。
// 为无头加速只桩掉纯视觉函数（hitFx / koFx / shakeRing / renderBattle / blog），不碰任何战斗数学；
// 顿帧 freezeUntil 每 tick 清零（顿帧只是视觉暂停，dt 固定，不改变结算数学）。
// 用法：node tests/balance-retest.mjs [--n 400] [--weeks 1,10,20] [--sim] [--label 基线]
// 前置：npm install（jsdom）；无需 build（测工程版源码）。
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
const SAVE_KEY = 'boxing-phase1-save-v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const N = parseInt(opt('n', '400'), 10);
const BATCHES = Math.max(1, parseInt(opt('batches', '4'), 10)); // 每档拆成多批，每批重新建池+成长，平均掉单一成长路径的随机性
const WEEKS = opt('weeks', '1,10').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
const WITH_SIM = args.includes('--sim');
const LABEL = opt('label', '复测');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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

// 页内驱动：场景设定（建池→逐周成长→玩家档位）与批量战斗统计。全部逻辑在页面真实全局里执行。
const DRIVER = `
window.__retest = (function () {
  // 纯视觉桩（不参与任何战斗数学）
  renderBattle = function () {};
  blog = function () {};
  hitFx = function () {};
  koFx = function () { SFX.koCheer(); };
  shakeRing = function () {};

  var PRO_GEAR = { gloves: 'gloves3', guard: 'guard3', boots: 'boots2', head: 'head2', robe: 'robe1', wrist: 'wrist2' };
  var NO_GEAR = { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null };
  function attrs(v) { return { power: v, endurance: v, will: v, speed: v, accuracy: v, footwork: v, defense: v, technique: v }; }
  function punchExp(v) { return { jab: v, straight: v, hook: v, upper: v, body: v }; }
  // 玩家档位：第 1 周新人（属性 10 / 无装备 / 熟练度 0）；第 10 周练满（属性 20 / 专业套装 / 熟练度 3 级）；
  // 第 20 周长期（属性 30 / 专业套装 / 熟练度 5 级）——与 ROUND2「第 10 周属性 20＋专业套装」口径对齐并外推。
  var PROFILES = {
    1:  { attrs: attrs(10), gear: NO_GEAR,  exp: punchExp(0) },
    10: { attrs: attrs(20), gear: PRO_GEAR, exp: punchExp(300) },
    20: { attrs: attrs(30), gear: PRO_GEAR, exp: punchExp(500) }
  };
  function setup(week) {
    var p = PROFILES[week];
    if (!p) throw new Error('no profile for week ' + week);
    S.day = week * 7; // 比赛日
    S.rank = 50;
    S.roster = buildRoster(50, 1);
    for (var wk = 2; wk <= week; wk++) weeklyRosterGrowth(wk);
    var rankAfterGrowth = S.rank;
    S.day = week * 7;
    S.attrs = JSON.parse(JSON.stringify(p.attrs));
    S.gear = JSON.parse(JSON.stringify(p.gear));
    S.punchExp = JSON.parse(JSON.stringify(p.exp));
    S.enh = {}; S.injury = 0; S.mind = 60; S.stamina = 100;
    S.wins = 0; S.losses = 0; S.winStreak = 0; S.koWins = 0; S.fame = 0;
    S.buffs = { drink: false, bandage: false, meal: false };
    S.deathFight = false; S.scoutedForDay = 0; S.lastMatchDay = 0;
    S.money = 100000; S.sponsor = null; S.stage = 1; S.completedStages = [];
    var poolAvg = 0, poolN = 0;
    S.roster.forEach(function (m) { if (Math.abs(m.rank - S.rank) <= 5 && m.rank > 0) { poolAvg += m.rating; poolN++; } });
    return { rankAfterGrowth: rankAfterGrowth, windowRatingAvg: poolN ? Math.round(poolAvg / poolN * 100) / 100 : null, windowN: poolN };
  }
  function runAuto(n) {
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, koEnd: 0, koWin: 0, ptsEnd: 0, r2: 0, r3: 0, roundsSum: 0, unfinished: 0, foeRankSum: 0 };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap);
      B = null; pendingFoe = null;
      startBattle('auto');
      clearInterval(battleTimer);
      var g = 0, maxRound = 1;
      while (B && B.phase !== 'over' && g++ < 20000) {
        B.freezeUntil = 0;
        tick();
        if (B && B.round > maxRound) maxRound = B.round;
      }
      if (!B || B.phase !== 'over' || !B.result) { st.unfinished++; continue; }
      var ko = (B.me.hp <= 0 || B.foe.hp <= 0);
      st.n++;
      if (B.result.win) st.win++;
      if (ko) { st.koEnd++; if (B.result.win) st.koWin++; } else st.ptsEnd++;
      if (maxRound >= 2) st.r2++;
      if (maxRound >= 3) st.r3++;
      st.roundsSum += maxRound;
      st.foeRankSum += B.foe.rank;
    }
    S = JSON.parse(snap);
    B = null;
    return st;
  }
  function runSim(n) {
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, koEnd: 0 };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap);
      B = null; pendingFoe = null;
      simulateBattle();
      st.n++;
      if (S.wins > 0) st.win++;
      if (B && B.koKind === 'sim') st.koEnd++;
    }
    S = JSON.parse(snap);
    B = null;
    return st;
  }
  return { setup: setup, runAuto: runAuto, runSim: runSim };
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
  console.log(`\n===== ${LABEL}（每档 n=${N}，真实 tick 自动战斗）=====`);
  console.log('周\t胜率%\t进R2%\t进R3%\tKO终结%\tKO胜%\t点数%\t平均回合\t成长后名次\t窗口rating均值');
  const out = {};
  const per = Math.max(1, Math.round(N / BATCHES));
  for (const week of WEEKS) {
    const t0 = Date.now();
    const agg = { n: 0, win: 0, koEnd: 0, koWin: 0, ptsEnd: 0, r2: 0, r3: 0, roundsSum: 0, unfinished: 0, foeRankSum: 0 };
    let ratingSum = 0, ratingBatches = 0; const rankSet = new Set();
    for (let b = 0; b < BATCHES; b++) {
      const meta = w.eval(`__retest.setup(${week})`);
      const st = w.eval(`__retest.runAuto(${per})`);
      Object.keys(agg).forEach((k) => { agg[k] += st[k] || 0; });
      if (typeof meta.windowRatingAvg === 'number') { ratingSum += meta.windowRatingAvg; ratingBatches++; }
      rankSet.add(meta.rankAfterGrowth);
    }
    const st = agg;
    const row = {
      week, ...st, batches: BATCHES, perBatch: per,
      winPct: pct(st.win, st.n), r2Pct: pct(st.r2, st.n), r3Pct: pct(st.r3, st.n),
      koEndPct: pct(st.koEnd, st.n), koWinPct: pct(st.koWin, st.n), ptsPct: pct(st.ptsEnd, st.n),
      avgRound: st.n ? Math.round(st.roundsSum / st.n * 100) / 100 : 0,
      avgFoeRank: st.n ? Math.round(st.foeRankSum / st.n * 10) / 10 : 0,
      rankAfterGrowth: [...rankSet].join('/'), windowRatingAvg: ratingBatches ? Math.round(ratingSum / ratingBatches * 100) / 100 : null,
      secs: Math.round((Date.now() - t0) / 100) / 10,
    };
    out['w' + week] = row;
    console.log(`${week}\t${row.winPct}\t${row.r2Pct}\t${row.r3Pct}\t${row.koEndPct}\t${row.koWinPct}\t${row.ptsPct}\t${row.avgRound}\t${row.rankAfterGrowth}\t${row.windowRatingAvg}\t(${row.secs}s, 未完赛 ${st.unfinished})`);
    if (WITH_SIM) {
      const simAgg = { n: 0, win: 0, koEnd: 0 };
      for (let b = 0; b < BATCHES; b++) {
        w.eval(`__retest.setup(${week})`);
        const sim = w.eval(`__retest.runSim(${per})`);
        simAgg.n += sim.n; simAgg.win += sim.win; simAgg.koEnd += sim.koEnd;
      }
      const simPct = pct(simAgg.win, simAgg.n);
      console.log(`  模拟模式（第 ${week} 周同条件）：胜率 ${simPct}%（KO 率 ${pct(simAgg.koEnd, simAgg.n)}%），与自动差 ${Math.round(Math.abs(simPct - row.winPct) * 10) / 10} 个百分点`);
      out['w' + week].sim = { ...simAgg, winPct: simPct, diff: Math.round(Math.abs(simPct - row.winPct) * 10) / 10 };
    }
  }
  console.log('\nJSON:' + JSON.stringify(out));
  w.close();
} finally {
  srv.close();
}
