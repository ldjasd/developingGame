// KO 定型（CF＋F2）实装复核 + 模拟跳过标定数据采集。
// jsdom 加载真实工程（不改源码）：多环境跑真实 tick 引擎，采集
//   胜率 / 终局构成（koKind）/ 终结回合分布 / 平均回合 / 玩家命中恒1点占比 / score 差均值，
// 并同环境跑现行 simulateBattle 采集胜率与 KO 率，供标定拟合与落地后对照。
// 用法：node tests/ko-impl-verify.mjs [--n 100] [--envs br1,br10,br20,t1,t6,t12,match12,pow,spd,tec,weak,practice] [--simonly]
//       node tests/ko-impl-verify.mjs --fast   快速档：关键环境（br1,br10,t6,match12,spd,practice）× n=60（--n/--envs 可覆盖）
//       node tests/ko-impl-verify.mjs --seed 20261111  种子化固定阵容（P2，2026-11-11）：mulberry32 覆写
//         页面 Math.random，引擎相与模拟相开跑前以同一种子复位——SETUPS 内的 weeklyRosterGrowth
//         逐周重掷被锁成同一条轨迹，两相面对逐字节相同的 roster（修复旧口径下两相各掷一次、
//         阵容同源不同样导致 sim 残差不可比的问题）。不带 --seed 时行为与旧版完全一致。
//       node tests/ko-impl-verify.mjs --fitdump out.json  P2：逐场导出 sim 特征（raceD/koP/scoreRateD/winP）
//         与引擎结果配对（仅引擎相、需配合 --seed），供离线网格拟合 winP/koP 常量；不带时无影响。
// G0（2026-11-10）：默认 n 300→100；每环境开始/完成都用 writeSync 立即落盘打印，
// 不再出现「全部跑完才有输出、超时零结果」（复测 S8）。
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
const FAST = args.includes('--fast');
const N = parseInt(opt('n', FAST ? '60' : '100'), 10);
const ENVS = opt('envs', FAST ? 'br1,br10,t6,match12,spd,practice' : 'br1,br10,br20,t6,t12,match12,pow,spd,tec,weak,practice').split(',');
const say = (s) => { fs.writeSync(1, s + '\n'); }; // 同步写 stdout：被超时杀掉时已完成环境的数字也留得下来
const WITH_SIM = !args.includes('--nosim');
const SEED = opt('seed', null) === null ? null : parseInt(opt('seed', '0'), 10);
const FITDUMP = opt('fitdump', null); // P2：逐场（sim 特征 × 引擎结果）落盘供离线拟合

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
  // P2 确定性补桩（2026-11-11）：showBubble 用 performance.now 实时节流决定是否掷随机选词，
  // spawnDmgFloat 用 Math.random 做飘字抖动——两者都是纯呈现，但在引擎 tick 路径上吃 RNG，
  // 种子化后仍会因机器负载不同而轨迹漂移（tec 同种子两跑胜率曾差 18pp）。打桩后种子跑可复现。
  showBubble = function () {};
  spawnDmgFloat = function () {};

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

  // P2 fitdump：与 simulateBattle 逐字同构的特征计算（自 battle.js 2106-2194 提取，勿手改）
  function fitFeatures(me, foe) {
var SIM_FIT = 1.10; // 连击积累＋反击窗口的期望增益（引擎分解残差的全局吸收项，fit_sim 拟合）
function simMix(att, isFoe) {
  var tac = isFoe ? ((att.persona && att.persona.base) || att.tactic || 'attack') : 'attack'; // 模拟口径：我方整场强攻（与 ko-impl-verify 无指令口径一致），对手走人格 base
  var st = isFoe ? styleOf(att) : null;
  var inten = st && typeof att.styleIntensity === 'number' ? att.styleIntensity : 0;
  var tacBias = tac === 'attack' ? { jab: 0.8, straight: 1.0, hook: 1.35, upper: 1.35, body: 1.15 }
    : tac === 'points' ? { jab: 1.5, straight: 1.25, hook: 0.75, upper: 0.75, body: 0.9 }
    : { jab: 0.9, straight: 1.15, hook: 1.0, upper: 1.05, body: 1.0 };
  var wsum = 0, coef = 0, stam = 0, prof = 0, bodyW = 0;
  PUNCH_KEYS.forEach(function (k) {
    var base = 1 + (att.prof[k] || 0) * (isFoe ? 1 : 1.6); // pickPunch 同权重（我方 ×1.6、对手 ×1）
    if (st) base *= (1 + (st.weights[k] - 1) * inten);
    var wgt = Math.max(0.1, base * (tacBias[k] || 1));
    wsum += wgt; coef += wgt * PUNCHES[k].coef; stam += wgt * PUNCHES[k].stam; prof += wgt * (att.prof[k] || 0);
    if (k === 'body') bodyW = wgt;
  });
  return { tac: tac, coefMix: coef / wsum, stamMix: stam / wsum, profMix: prof / wsum, bodyShare: bodyW / wsum };
}
function simNetDmg(att, isFoe, mix) {
  var raw = att.attrs.power * mix.coefMix * (1 + mix.profMix * 0.05) * (mix.tac === 'attack' ? 1.3 : 1) * 1.05; // 战术强攻 ×1.3、暴击期望 ×1.05（tryAttack/dealDamage 同口径）
  if (isFoe) raw *= styleVal(att, 'dmgMul', 1);
  raw *= SIM_FIT;
  return raw;
}
function simNetPer(att, def, isFoe, mix) { // 单拳净伤害期望（F2 地板：减伤封顶 raw 的 70%）
  var raw = simNetDmg(att, isFoe, mix);
  return Math.max(1, raw - Math.min(def.attrs.defense * 1.0, raw * 0.7));
}
function simHitChance(att, def, attTac, defTac) { // calcHitChance 同分支（含战术相克乘子与双重钳制）
  var hc = 0.70 + (att.attrs.accuracy - def.attrs.footwork) * 0.01;
  hc = Math.min(0.95, Math.max(0.30, hc));
  if (defTac === 'counter') hc *= (attTac === 'points' ? 0.88 : 0.7);
  else if (defTac === 'points') hc *= (attTac === 'attack' ? 1.06 : 0.95);
  else if (attTac === 'attack') hc *= 1.02;
  return Math.min(0.95, Math.max(0.30, hc));
}
function simBlockFactor(def, defTac, mix) { // 只有对手会持架格挡我方（calcBlockChance 同式）；击腹穿透 70%、其余格挡后 ×0.3
  var bp = 0.16 + (defTac === 'counter' ? 0.08 : 0);
  if (def.style === 'guardcounter') bp += styleVal(def, 'blockAdd', 0);
  bp = clamp(bp, 0.05, 0.45);
  return (1 - bp) + bp * (mix.bodyShare * 0.7 + (1 - mix.bodyShare) * 0.3);
}
function simAttempts(att, isFoe, mix, drainPerRound) { // 体力税：90 tick 期望 duty-cycle（<6 歇气 +4.6、<30 频率 ×0.7、失败回气 +0.92、回合间 +30、被命中削体力）
  var freq = 0.24 + att.attrs.speed * 0.012;
  if (isFoe) freq *= 1.15 * styleVal(att, 'freqMul', 1);
  if (mix.tac === 'counter') freq *= 0.6;
  var cost = mix.stamMix * (mix.tac === 'attack' ? 1.5 : mix.tac === 'points' ? 0.7 : 1);
  if (isFoe) cost *= styleVal(att, 'stamMul', 1);
  var stam = 100, total = 0;
  for (var r = 0; r < 3; r++) {
    for (var t = 0; t < 90; t++) {
      if (stam < 6) { stam = Math.min(100, stam + 4.6); continue; }
      var p = freq * (stam < 30 ? 0.7 : 1);
      total += p;
      stam += (1 - p) * 0.92 - p * cost;
      if (stam < 0) stam = 0; else if (stam > 100) stam = 100;
    }
    stam = Math.min(100, Math.max(0, stam + 30 - (drainPerRound || 0)));
  }
  return total / 3;
}
function simDps(att, def, isFoe, foeHitsPerRound, foeNetPer, foeBodyShare) {
  var mix = simMix(att, isFoe);
  var defTac = isFoe ? 'attack' : ((def.persona && def.persona.base) || def.tactic || 'attack');
  var net = simNetPer(att, def, isFoe, mix);
  var drain = foeHitsPerRound ? foeHitsPerRound * (1 + (foeBodyShare || 0) * 0.6 * (foeNetPer || 0)) : 0; // 被命中每拳 −1 体力、击腹再 −伤害×0.6（dealDamage 同口径）
  var attempts = simAttempts(att, isFoe, mix, drain);
  var hc = simHitChance(att, def, mix.tac, defTac);
  var bf = isFoe ? 1 : simBlockFactor(def, defTac, mix);
  return { dps: attempts * hc * bf * net, attempts: attempts, hc: hc, net: net, mix: mix };
}
var simMe0 = simDps(me, foe, false, 0, 0, 0); // 第一遍不计被削体力，求对手命中量后再算 drain
var simFoe0 = simDps(foe, me, true, 0, 0, 0);
var simMe = simDps(me, foe, false, simFoe0.attempts * simFoe0.hc, simFoe0.net, simFoe0.mix.bodyShare);
var simFoe = simDps(foe, me, true, simMe0.attempts * simMe0.hc, simMe0.net, simMe0.mix.bodyShare);
var ttkMe = foe.hpMax / Math.max(1, simMe.dps);
var ttkFoe = me.hpMax / Math.max(1, simFoe.dps);
var raceD = ttkFoe - ttkMe;
var defPen = Math.max(0, foe.attrs.defense - me.attrs.power - 6); // G3-a 拟合后系数归零（新模型已把防守写进单拳净伤，罚项冗余），保留变量备查
var winP = clamp(1 / (1 + Math.exp(-4.0 * (raceD - 0.3) / 0.55)) - 0 * defPen + (foe.weakness ? 0.05 : 0), 0.02, 0.98); // G3-a 拟合：k=4.0/平移 0.3/alpha=0.55（fit_sim v2，全环境拟合误差 ≤8.4pp）
/* G3-a 记分混合（fit_sim2 拟合，K=0.075）：winP 原式只建模 TTK 竞赛；当对局大概率走点数终局时
   （koP 低），胜负由记分牌决定——scoreOf 的「伤害＋命中×2」口径利好量产型构筑，纯 TTK 会系统性
   低估 spd/tec（G1b 后中盘点数局变多后实测残差 spd 8.3/tec 11.7/br1 17pp）。按 (1-koP)² 为权重
   混合记分胜率 logistic(0.075×记分率差)：拟合样本 spd Δ1.2/tec Δ0.4/pow Δ2.0，br1 实测 31% vs 混合预测 30.7%。 */
var koP = clamp(1.90 - 0.425 * Math.min(ttkMe, ttkFoe), 0.02, 0.99);
var scoreRateD = (simMe.dps + 2 * simMe.attempts * simMe.hc) - (simFoe.dps + 2 * simFoe.attempts * simFoe.hc);
var winPPts = 1 / (1 + Math.exp(-0.075 * scoreRateD));
var ptsW = Math.pow(1 - koP, 2);
winP = clamp(winP * (1 - ptsW) + winPPts * ptsW, 0.02, 0.98);
    return { raceD: raceD, minTTK: Math.min(ttkMe, ttkFoe), koP: koP, scoreRateD: scoreRateD, winP: winP, weak: foe.weakness ? 1 : 0 };
  }
  window.__fit = [];
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
      var fitRec = null;
      if (window.__FITDUMP_ON) { try { fitRec = fitFeatures(meF, B.foe); fitRec.env = name; } catch (e) { fitRec = null; } }
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
      if (fitRec) { fitRec.win = B.result.win ? 1 : 0; fitRec.kind = k; fitRec.round = B.round; window.__fit.push(fitRec); }
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
  // P2 种子化：mulberry32（与 ko-audit 的 seedRand 同族）。reseed 后 Math.random
  // 全程确定性；节点侧在 runEngine / runSim 前以同一种子各复位一次，两相的
  // SETUPS（buildRoster 确定性＋weeklyRosterGrowth 的 rnd 成长重掷）走同一轨迹。
  var _rngA = 0;
  function reseed(seed) {
    _rngA = seed >>> 0;
    Math.random = function () {
      _rngA |= 0; _rngA = _rngA + 0x6D2B79F5 | 0;
      var t = Math.imul(_rngA ^ _rngA >>> 15, 1 | _rngA);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  return { runEngine: runEngine, runSim: runSim, reseed: reseed };
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
  if (FITDUMP) w.eval('window.__FITDUMP_ON = true');
  const pct = (x, n) => (n ? Math.round(x / n * 1000) / 10 : 0);
  const out = {};
  for (const env of ENVS) {
    say(`\n>>> 环境 ${env} 开始（n=${N}${FAST ? '，快速档' : ''}${SEED !== null ? `，seed=${SEED}` : ''}）…`);
    const t0 = Date.now();
    if (SEED !== null) w.eval(`__verify.reseed(${SEED})`);
    const e = w.eval(`__verify.runEngine(${JSON.stringify(env)}, ${N})`);
    const row = {
      env, seed: SEED, n: e.n, unfinished: e.unfinished,
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
      if (SEED !== null) w.eval(`__verify.reseed(${SEED})`); // 与引擎相同种子复位：模拟相 SETUPS 重掷出同一 roster
      const s = w.eval(`__verify.runSim(${JSON.stringify(env)}, ${N})`);
      row.sim = {
        n: s.n, winPct: pct(s.win, s.n), koPct: pct(s.ko, s.n), tkoPct: pct(s.tko, s.n), ptsPct: pct(s.pts, s.n),
        winDiff: Math.round(Math.abs(pct(s.win, s.n) - row.winPct) * 10) / 10,
        meanDiff: s.n ? Math.round(s.diffSum / s.n * 10) / 10 : 0,
      };
    }
    out[env] = row;
    say(`### ${env}（引擎 n=${row.n} 未完=${row.unfinished}，${row.secs}s）胜率=${row.winPct}% 平均回合=${row.avgRound} R1终结=${row.r1EndPct}% 终结回合分布=${JSON.stringify(row.endRound)}`);
    say(`    终局构成: ${Object.entries(row.kinds).map(([k, v]) => `${k}=${v}(${pct(v, row.n)}%)`).join('  ')}`);
    say(`    有击倒对局=${row.downsFightsPct}% 玩家恒≤1点命中=${row.meOnesPct}% score差均值=${row.meanDiff}`);
    if (row.sim) say(`    模拟: 胜率=${row.sim.winPct}%（差 ${row.sim.winDiff}pp） KO=${row.sim.koPct}% TKO=${row.sim.tkoPct}% 点数=${row.sim.ptsPct}%`);
  }
  if (FITDUMP) { fs.writeFileSync(FITDUMP, w.eval('JSON.stringify(window.__fit)')); say('fitdump 已写入 ' + FITDUMP); }
  say('\nJSON:' + JSON.stringify(out));
  w.close();
} finally {
  srv.close();
}
