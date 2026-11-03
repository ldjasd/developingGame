// 重创（KO 槽）机制系统性核查（整改第一批 · 实玩 S2 专项）：
// jsdom 加载真实页面脚本，第 1 周新人档位（属性 10 / 无装备 / 熟练度 0，与 balance-retest PROFILES[1] 同口径），
// 以真实 tick() 引擎跑自动战斗，逐 tick 快照双方 HP% 与重创值；
// 统计：重创 KO 占全部终局 / 全部 KO 的比例、重创 KO 中「输家终局前 HP% 反而高于赢家」的比例（分我方输 / 对手输）、
// 重创 KO 发生的回合分布、非重创终局时双方重创均值（影子竞赛离满格有多近）。
// 用法：node tests/trauma-audit.mjs [--n 600] [--batches 4]
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
const N = parseInt(opt('n', '600'), 10);
const BATCHES = Math.max(1, parseInt(opt('batches', '4'), 10));

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

const DRIVER = `
window.__trauma = (function () {
  renderBattle = function () {};
  blog = function () {};
  hitFx = function () {};
  koFx = function () { SFX.koCheer(); };
  shakeRing = function () {};

  var NO_GEAR = { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null };
  function setupWeek1() {
    S.day = 7; // 第 1 周比赛日
    S.rank = 50;
    S.roster = buildRoster(50, 1);
    S.day = 7;
    S.attrs = { power: 10, endurance: 10, will: 10, speed: 10, accuracy: 10, footwork: 10, defense: 10, technique: 10 };
    S.gear = JSON.parse(JSON.stringify(NO_GEAR));
    S.punchExp = { jab: 0, straight: 0, hook: 0, upper: 0, body: 0 };
    S.enh = {}; S.injury = 0; S.mind = 60; S.stamina = 100;
    S.wins = 0; S.losses = 0; S.winStreak = 0; S.koWins = 0; S.fame = 0;
    S.buffs = { drink: false, bandage: false, meal: false };
    S.deathFight = false; S.scoutedForDay = 0; S.lastMatchDay = 0;
    S.money = 100000; S.sponsor = null; S.stage = 1; S.completedStages = [];
  }
  function runTrauma(n) {
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, traumaKO: 0, singleKO: 0, hpKO: 0, pts: 0, unfinished: 0,
      tLoserAhead: 0, tMeLose: 0, tMeLoseAhead: 0, tFoeLose: 0, tFoeLoseAhead: 0,
      tRound1: 0, tRound2: 0, tRound3: 0, brinkLoserSum: 0, brinkWinnerSum: 0,
      endMeTraumaSum: 0, endFoeTraumaSum: 0, nonTraumaMaxTraumaSum: 0, nonTraumaCnt: 0 };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap);
      B = null; pendingFoe = null;
      startBattle('auto');
      clearInterval(battleTimer);
      var prev = null, g = 0;
      while (B && B.phase !== 'over' && g++ < 20000) {
        prev = { meHp: B.me.hp / B.me.hpMax, foeHp: B.foe.hp / B.foe.hpMax, round: B.round };
        B.freezeUntil = 0;
        tick();
      }
      if (!B || B.phase !== 'over' || !B.result) { st.unfinished++; continue; }
      st.n++;
      if (B.result.win) st.win++;
      st.endMeTraumaSum += B.meTrauma || 0;
      st.endFoeTraumaSum += B.foeTrauma || 0;
      var kind = B.koKind || '';
      if (kind === 'trauma' && prev) {
        st.traumaKO++;
        var meLost = !B.result.win;
        var loserHp = meLost ? prev.meHp : prev.foeHp;
        var winnerHp = meLost ? prev.foeHp : prev.meHp;
        st.brinkLoserSum += loserHp; st.brinkWinnerSum += winnerHp;
        if (prev.round === 1) st.tRound1++; else if (prev.round === 2) st.tRound2++; else st.tRound3++;
        if (loserHp > winnerHp) st.tLoserAhead++;
        if (meLost) { st.tMeLose++; if (loserHp > winnerHp) st.tMeLoseAhead++; }
        else { st.tFoeLose++; if (loserHp > winnerHp) st.tFoeLoseAhead++; }
      } else {
        if (kind === 'single') st.singleKO++;
        else if (kind) st.hpKO++;
        else st.pts++;
        st.nonTraumaMaxTraumaSum += Math.max(B.meTrauma || 0, B.foeTrauma || 0);
        st.nonTraumaCnt++;
      }
    }
    S = JSON.parse(snap);
    B = null;
    return st;
  }
  return { setupWeek1: setupWeek1, runTrauma: runTrauma };
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

  const per = Math.max(1, Math.round(N / BATCHES));
  const agg = { n: 0, win: 0, traumaKO: 0, singleKO: 0, hpKO: 0, pts: 0, unfinished: 0,
    tLoserAhead: 0, tMeLose: 0, tMeLoseAhead: 0, tFoeLose: 0, tFoeLoseAhead: 0,
    tRound1: 0, tRound2: 0, tRound3: 0, brinkLoserSum: 0, brinkWinnerSum: 0,
    endMeTraumaSum: 0, endFoeTraumaSum: 0, nonTraumaMaxTraumaSum: 0, nonTraumaCnt: 0 };
  for (let b = 0; b < BATCHES; b++) {
    w.eval('__trauma.setupWeek1()');
    const st = w.eval(`__trauma.runTrauma(${per})`);
    Object.keys(agg).forEach((k) => { agg[k] += st[k] || 0; });
  }
  const pct = (x, n) => (n ? Math.round(x / n * 1000) / 10 : 0);
  const koTotal = agg.traumaKO + agg.singleKO + agg.hpKO;
  console.log(`\n===== 重创机制核查（第 1 周新人档位，真实 tick 自动战斗，n=${agg.n}，未完赛 ${agg.unfinished}）=====`);
  console.log(`玩家胜率：${pct(agg.win, agg.n)}%`);
  console.log(`终局构成：重创KO ${agg.traumaKO}（占全部 ${pct(agg.traumaKO, agg.n)}% / 占全部KO ${pct(agg.traumaKO, koTotal)}%）· 单发KO ${agg.singleKO} · HP归零KO ${agg.hpKO} · 点数判定 ${agg.pts}`);
  console.log(`重创KO 中「输家终局前 HP% 高于赢家」：${agg.tLoserAhead}/${agg.traumaKO} = ${pct(agg.tLoserAhead, agg.traumaKO)}%`);
  console.log(`  其中玩家被重创KO：${agg.tMeLose} 场，占全部对局 ${pct(agg.tMeLose, agg.n)}%；这些场里玩家 HP% 占优的：${agg.tMeLoseAhead}/${agg.tMeLose} = ${pct(agg.tMeLoseAhead, agg.tMeLose)}%`);
  console.log(`  对手被重创KO：${agg.tFoeLose} 场；对手 HP% 占优的：${agg.tFoeLoseAhead}/${agg.tFoeLose} = ${pct(agg.tFoeLoseAhead, agg.tFoeLose)}%`);
  console.log(`重创KO 回合分布：R1 ${agg.tRound1} · R2 ${agg.tRound2} · R3 ${agg.tRound3}`);
  console.log(`重创KO 终局前均值：输家 HP% ${agg.traumaKO ? Math.round(agg.brinkLoserSum / agg.traumaKO * 1000) / 10 : 0}% vs 赢家 HP% ${agg.traumaKO ? Math.round(agg.brinkWinnerSum / agg.traumaKO * 1000) / 10 : 0}%`);
  console.log(`全部对局终局时平均重创：我方 ${agg.n ? Math.round(agg.endMeTraumaSum / agg.n * 10) / 10 : 0} · 对手 ${agg.n ? Math.round(agg.endFoeTraumaSum / agg.n * 10) / 10 : 0}`);
  console.log(`非重创终局的对局里，败方/双方较高重创均值：${agg.nonTraumaCnt ? Math.round(agg.nonTraumaMaxTraumaSum / agg.nonTraumaCnt * 10) / 10 : 0} / 100`);
  console.log('\nJSON:' + JSON.stringify(agg));
  w.close();
} finally {
  srv.close();
}
