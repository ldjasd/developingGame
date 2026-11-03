// 重创积累曲线 A/B（2026-11-03 立项，已定型）：旧固定值曲线 vs 伤害挂钩新曲线，同种子批量对照。
// 定型结论：cur（按当前 HP）K=70＋小数累积胜出，已折叠进 js/game.js 的 traumaGain 单一公式（见 tests/TRAUMA_CURVE.md）。
// 注意：定型后 TRAUMA_MODE / TRAUMA_FLOOR / TRAUMA_FLOAT 注入点已随折叠移除，本脚本现跑任何配置得到的都是现行曲线；
// 若要复现当年 A/B，需从 git 历史恢复参数化版 traumaGain。本脚本保留作方法论与数据管线存档。
// 口径同 trauma-audit.mjs：第 1 周新人档位（属性 10 / 无装备 / 熟练度 0），真实 tick() 自动战斗。
// 每配置开跑前重置同一种子 PRNG（各配置面对同一随机流起点）；配置经页面全局 TRAUMA_MODE / TRAUMA_K / KO_DECAY 注入。
// 统计：胜率、终局构成、重创 KO 回合分布、「输家 HP% 反高于赢家」率，
// 以及逐拳埋点（window.__hitLog）：低伤害（dmg≤2）命中的平均重创、「dmg≤3 却重创≥10」的离谱命中占比。
// 用法：node tests/trauma-ab.mjs [--n 300] [--configs fixed,max:280,cur:280:4]   配置格式 mode[:K[:decay]]
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
const CONFIGS = opt('configs', 'fixed,max:280,cur:280').split(',').map((s) => {
  const [mode, k, decay, floor, flt] = s.split(':');
  return { mode, k: k ? parseFloat(k) : 280, decay: decay ? parseFloat(decay) : 6, floor: floor ? parseFloat(floor) : 0, flt: flt ? parseFloat(flt) : 0, label: s };
});

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
window.__tab = (function () {
  renderBattle = function () {};
  blog = function () {};
  hitFx = function () {};
  koFx = function () { SFX.koCheer(); };
  shakeRing = function () {};

  var NO_GEAR = { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null };
  function setupWeek1() {
    S.day = 7;
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
  function seedRand(seed) {
    var t = seed >>> 0;
    Math.random = function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function runConfig(mode, k, decay, n, floor, flt) {
    TRAUMA_MODE = mode; TRAUMA_K = k; KO_DECAY = decay; TRAUMA_FLOOR = floor || 0; TRAUMA_FLOAT = flt || 0;
    seedRand(20261103);
    window.__hitLog = [];
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, traumaKO: 0, singleKO: 0, hpKO: 0, pts: 0, unfinished: 0,
      tLoserAhead: 0, tMeLose: 0, tMeLoseAhead: 0, tFoeLoseAhead: 0,
      tRound1: 0, tRound2: 0, tRound3: 0, roundsSum: 0 };
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
      st.roundsSum += prev ? prev.round : B.round;
      var kind = B.koKind || '';
      if (kind === 'trauma' && prev) {
        st.traumaKO++;
        var meLost = !B.result.win;
        var loserHp = meLost ? prev.meHp : prev.foeHp;
        var winnerHp = meLost ? prev.foeHp : prev.meHp;
        if (prev.round === 1) st.tRound1++; else if (prev.round === 2) st.tRound2++; else st.tRound3++;
        if (loserHp > winnerHp) { st.tLoserAhead++; if (meLost) st.tMeLoseAhead++; else st.tFoeLoseAhead++; }
        if (meLost) st.tMeLose++;
      } else if (kind === 'single') st.singleKO++;
      else if (kind) st.hpKO++;
      else st.pts++;
    }
    S = JSON.parse(snap);
    B = null;
    // 逐拳埋点聚合（在页面内算完，只回汇总）
    var log = window.__hitLog || [];
    var h = { hits: log.length, lowCnt: 0, lowSum: 0, absurd: 0, gainSum: 0, zeroGain: 0, medCnt: 0, medSum: 0 };
    for (var j = 0; j < log.length; j++) {
      var dmg = log[j][0], gain = log[j][1];
      h.gainSum += gain;
      if (gain === 0) h.zeroGain++;
      if (dmg <= 2) { h.lowCnt++; h.lowSum += gain; }
      if (dmg <= 3 && gain >= 10) h.absurd++;
      if (dmg >= 8 && dmg <= 16) { h.medCnt++; h.medSum += gain; }
    }
    st.hits = h;
    window.__hitLog = [];
    return st;
  }
  return { setupWeek1: setupWeek1, runConfig: runConfig };
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
  w.eval('__tab.setupWeek1()');

  const pct = (x, n) => (n ? Math.round(x / n * 1000) / 10 : 0);
  const rows = [];
  for (const c of CONFIGS) {
    const t0 = Date.now();
    const st = w.eval(`__tab.runConfig(${JSON.stringify(c.mode)}, ${c.k}, ${c.decay}, ${N}, ${c.floor}, ${c.flt})`);
    const koTotal = st.traumaKO + st.singleKO + st.hpKO;
    const h = st.hits || {};
    rows.push({ c, st });
    console.log(`\n===== 配置 ${c.label}（n=${st.n}，未完赛 ${st.unfinished}，${Math.round((Date.now() - t0) / 1000)}s）=====`);
    console.log(`胜率 ${pct(st.win, st.n)}% · 平均终局回合 ${st.n ? (st.roundsSum / st.n).toFixed(2) : 0}`);
    console.log(`终局：重创KO ${st.traumaKO}（占全部 ${pct(st.traumaKO, st.n)}% / 占KO ${pct(st.traumaKO, koTotal)}%）· 单发 ${st.singleKO} · HP ${st.hpKO} · 点数 ${st.pts}`);
    console.log(`重创KO 回合分布：R1 ${st.tRound1} · R2 ${st.tRound2} · R3 ${st.tRound3}（R1 占比 ${pct(st.tRound1, st.traumaKO)}%）`);
    console.log(`重创KO 输家HP%占优：${st.tLoserAhead}/${st.traumaKO} = ${pct(st.tLoserAhead, st.traumaKO)}%（其中玩家被重创KO ${st.tMeLose} 场、占优 ${st.tMeLoseAhead}）`);
    console.log(`逐拳：共 ${h.hits} 命中 · 平均重创 +${h.hits ? (h.gainSum / h.hits).toFixed(2) : 0} · dmg≤2 命中 ${h.lowCnt} 次平均 +${h.lowCnt ? (h.lowSum / h.lowCnt).toFixed(2) : 0} · 离谱命中(dmg≤3&重创≥10) ${h.absurd}（${pct(h.absurd, h.hits)}%）· 零积累命中 ${h.zeroGain}（${pct(h.zeroGain, h.hits)}%）· 中坚命中(dmg 8~16)平均 +${h.medCnt ? (h.medSum / h.medCnt).toFixed(1) : 0}`);
  }
  console.log('\nJSON:' + JSON.stringify(rows.map(({ c, st }) => ({ label: c.label, ...st }))));
  w.close();
} finally {
  srv.close();
}
