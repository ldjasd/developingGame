// KO 判定专项核查：五条终结路径盘点 + 当前HP门槛塌陷量化 + 候选 KO 系统 A/B/C 猴补预演。
// 不改源码：候选通过在驱动内包装 dealDamage / resolveKnockdown 实现。
// 用法: node tests/ko-audit.mjs [--modes base,A,B,C] [--tiers 1,6,12] [--n 400] [--practice 200] [--sim 400]
import { JSDOM } from 'jsdom';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const root = opt('root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const BUILDS_CLI = opt('builds', '');
const MODES = opt('modes', 'base').split(',');
const TIERS = opt('tiers', '1,6,12').split(',').map(Number);
const N = parseInt(opt('n', '400'), 10);
const NP = parseInt(opt('practice', '0'), 10);
const NSIM = parseInt(opt('sim', '0'), 10);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const dom = await JSDOM.fromURL(`http://127.0.0.1:${port}/index.html`, {
  resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true,
});
const { window } = dom;
await new Promise(r => { if (window.document.readyState === 'complete') r(); else window.addEventListener('load', r); });
await new Promise(r => setTimeout(r, 300));
const ev = s => window.eval(s);

const DRIVER = String.raw`
window.__KO_MODE = 'base';
window.__totDowns = { me: 0, foe: 0 };
window.__cur = null;

function seedRand(seed) {
  var a = seed >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
seedRand(20261103);
window.scrollTo = function () {};

['renderBattle','renderHUD','renderAll','save','showScene','showToast','addLog','log','blog','dailyLog','sfx','setMePose','spawnFloat','spawnHitFx','pulseRing','hitStop','battleFlash','updateComboUI','renderDownOverlay','hideBattleSheet','showInjurySheet','showRankSheet','showStoryBeat','showFoeDownSheet','showEndSheet','showRewardSheet','maybeShowLevelUp','checkAchievements','refreshNavBadges','renderSceneChrome','renderGateBadges'].forEach(function (f) {
  if (typeof window[f] === 'function') window[f] = function () {};
});

var NO_GEAR = { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null };
var MID_GEAR = { gloves: 'gloves2', guard: 'guard1', boots: 'boots1', head: 'head1', robe: 'robe1', wrist: 'wrist1' };
var PRO_GEAR = { gloves: 'gloves3', guard: 'guard3', boots: 'boots2', head: 'head2', robe: 'robe1', wrist: 'wrist2' };
var PR = {
  1:  { attrs: 10, gear: NO_GEAR,  pexp: 0,   money: 500 },
  6:  { attrs: 16, gear: MID_GEAR, pexp: 200, money: 4000 },
  12: { attrs: 22, gear: PRO_GEAR, pexp: 400, money: 8000 },
};
function setup(week) {
  var p = PR[week];
  S = defaultState();
  S.day = 7; S.rank = 50; S.roster = buildRoster(50, 1);
  for (var wk = 2; wk <= week; wk++) { S.day = wk * 7; weeklyRosterGrowth(wk); }
  S.day = week * 7;
  ATTRS.forEach(function (a) { S.attrs[a.key] = p.attrs; });
  S.punchExp = {}; PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = p.pexp; });
  S.gear = Object.assign({}, p.gear);
  S.money = p.money; S.wins = 0; S.loses = 0; S.injury = 0; S.winStreak = 0;
  S.mind = 80; S.ap = 6; S.deathFight = false;
  return JSON.stringify(S);
}
var BUILDS = {
  POW: { power: 30, endurance: 24, will: 20, speed: 20, accuracy: 20, footwork: 18, defense: 20, technique: 20 },
  SPD: { power: 12, endurance: 22, will: 20, speed: 38, accuracy: 34, footwork: 30, defense: 18, technique: 24 },
  TEC: { power: 12, endurance: 22, will: 20, speed: 26, accuracy: 32, footwork: 24, defense: 18, technique: 42 },
};
function setupBuild(name) {
  S = defaultState();
  S.day = 7; S.rank = 50; S.roster = buildRoster(50, 1);
  for (var wk = 2; wk <= 10; wk++) { S.day = wk * 7; weeklyRosterGrowth(wk); }
  S.day = 70;
  var b = BUILDS[name];
  ATTRS.forEach(function (a) { S.attrs[a.key] = b[a.key]; });
  S.punchExp = {}; PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; });
  S.gear = Object.assign({}, MID_GEAR);
  S.money = 6000; S.wins = 0; S.loses = 0; S.injury = 0; S.winStreak = 0;
  S.mind = 80; S.ap = 6; S.deathFight = false;
  return JSON.stringify(S);
}
function setupMatch12() {
  S = defaultState();
  S.day = 7; S.rank = 50; S.roster = buildRoster(50, 1);
  for (var wk = 2; wk <= 12; wk++) { S.day = wk * 7; weeklyRosterGrowth(wk); }
  S.day = 84;
  ATTRS.forEach(function (a) { S.attrs[a.key] = 19; });
  S.punchExp = {}; PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; });
  S.gear = Object.assign({}, MID_GEAR);
  S.money = 6000; S.wins = 0; S.loses = 0; S.injury = 0; S.winStreak = 0;
  S.mind = 80; S.ap = 6; S.deathFight = false;
  return JSON.stringify(S);
}
function buckDmg(d) { return d <= 5 ? 'le5' : d <= 10 ? '6-10' : d <= 20 ? '11-20' : d <= 40 ? '21-40' : 'gt40'; }
function buckFrac(f) { return f <= 0.10 ? 'le10' : f <= 0.25 ? '10-25' : f <= 0.50 ? '25-50' : f <= 0.75 ? '50-75' : 'gt75'; }
function emptyBuckets() { return { dmg: { le5: 0, '6-10': 0, '11-20': 0, '21-40': 0, gt40: 0 }, frac: { le10: 0, '10-25': 0, '25-50': 0, '50-75': 0, gt75: 0 } }; }

function forceDown(defIsMe) {
  if (!B || B.phase !== 'fight') return false;
  var def = defIsMe ? B.me : B.foe;
  if (def.hp <= 0) return false;
  if (defIsMe) { B.meDownsRound++; B.meDowns = (B.meDowns || 0) + 1; } else { B.foeDownsRound++; }
  __totDowns[defIsMe ? 'me' : 'foe']++;
  var downs = defIsMe ? B.meDownsRound : B.foeDownsRound;
  B.phase = 'down'; B.downFighter = defIsMe ? 'me' : 'foe'; B.downLeft = 3;
  B.downIsTKO = downs >= 3;
  B.tkoReason = B.downIsTKO ? ('第 ' + B.round + ' 回合第 3 次被击倒，触发 TKO 判定') : '';
  return true;
}
function undoDown(pre) {
  B.phase = pre.phase; B.meDownsRound = pre.mdr; B.foeDownsRound = pre.fdr;
  B.meDowns = pre.md; B.downFighter = null; B.downLeft = 0; B.downIsTKO = false; B.tkoReason = '';
  __totDowns = { me: pre.totMe, foe: pre.totFoe };
}

// ---- startBattle 包装：每场重置记录器 ----
var origSB = startBattle;
startBattle = function (mode) {
  var r = origSB(mode);
  __cur = { hits: 0, downHits: [], downs: [], finalBlow: null };
  __totDowns = { me: 0, foe: 0 };
  return r;
};
// ---- startKnockdown 包装：记录击倒 ----
var origSK = startKnockdown;
startKnockdown = function (defIsMe, dmg, hpBefore) {
  var r = origSK(defIsMe, dmg, hpBefore);
  if (r) {
    __totDowns[defIsMe ? 'me' : 'foe']++;
    if (__cur) __cur.downs.push({ defIsMe: defIsMe, round: B.round, downsRound: defIsMe ? B.meDownsRound : B.foeDownsRound });
  }
  return r;
};
// ---- traumaGain 包装：模式 D/BD 的重创分母下限（max(当前HP, 35%×最大HP)）----
var origTG = traumaGain;
traumaGain = function (key, dmg, def, hpBefore, halved) {
  if (__KO_MODE === 'D' || __KO_MODE === 'BD' || __KO_MODE === 'E' || __KO_MODE === 'CF') {
    return origTG(key, dmg, def, Math.max(hpBefore, 0.40 * def.hpMax), halved);
  }
  return origTG(key, dmg, def, hpBefore, halved);
};
// ---- resolveKnockdown 包装：候选 B 的读秒判定 ----
var origRK = resolveKnockdown;
resolveKnockdown = function () {
  var mode = __KO_MODE;
  var failInfo = null;
  if ((mode === 'B' || mode === 'BD' || mode === 'E') && B && B.phase === 'down' && !B.downIsTKO) {
    var defIsMe = B.downFighter === 'me';
    var def = defIsMe ? B.me : B.foe;
    var hpFrac = def.hp / def.hpMax;
    var tot = __totDowns[defIsMe ? 'me' : 'foe'];
    var pFail = (mode === 'E')
      ? Math.min(0.40, Math.max(0.02, 0.45 * (1 - hpFrac) + 0.08 * (tot - 1) - 0.05))
      : Math.min(0.50, Math.max(0.02, 0.55 * (1 - hpFrac) + 0.07 * (tot - 1) - 0.06));
    failInfo = { fail: Math.random() < pFail, defIsMe: defIsMe };
  }
  origRK();
  if (failInfo && failInfo.fail && B && B.phase === 'fight') {
    var d2 = failInfo.defIsMe ? B.me : B.foe;
    if (d2.hp > 0) { d2.hp = 0; B.koKind = 'countout'; finishBattle(); }
  }
};
// ---- dealDamage 包装：逐拳记录 + 候选 A/B/C 规则 ----
var origDD = dealDamage;
dealDamage = function (att, def, key, mult, isMeAttacking, isCounter, nameOverride) {
  var defIsMe = !isMeAttacking;
  var pre = {
    defHp: def.hp, koKind: B.koKind, phase: B.phase,
    mdr: B.meDownsRound, fdr: B.foeDownsRound, md: B.meDowns || 0,
    trauma: defIsMe ? B.meTrauma : B.foeTrauma,
    attDmg: att.dmg, totMe: __totDowns.me, totFoe: __totDowns.foe,
  };
  var r = origDD(att, def, key, mult, isMeAttacking, isCounter, nameOverride);
  var dmg = att.dmg - pre.attDmg;
  var mode = __KO_MODE;
  if (__cur) {
    __cur.hits++;
    if (isMeAttacking) { __cur.meHits = (__cur.meHits || 0) + 1; if (dmg === 1) __cur.meOnes = (__cur.meOnes || 0) + 1; __cur.meDmg = (__cur.meDmg || 0) + dmg; }
    if (B.phase === 'down' && pre.phase === 'fight' && !B.koKind) {
      __cur.downHits.push({ dmg: dmg, hpBefore: pre.defHp, frac: pre.defHp / def.hpMax });
    }
  }
  var causedKO = B.koKind && B.koKind !== pre.koKind;
  var causedDown = B.phase === 'down' && pre.phase === 'fight';
  if (mode === 'A' || mode === 'B' || mode === 'C' || mode === 'BD' || mode === 'E' || mode === 'CF') {
    if (causedKO && B.koKind === 'single') {
      causedKO = false;
      if (def.hp <= 0 && pre.defHp - dmg <= 0 && !(mode === 'A' && dmg >= 0.30 * def.hpMax)) {
        B.koKind = 'hp'; causedKO = true; // 打空血量：归 HP 路径（A 且达最大HP30% 时保留单发KO）
      } else if (mode === 'A' && dmg >= 0.30 * def.hpMax) {
        B.koKind = 'single'; causedKO = true; // A：真·单发 KO（最大 HP 口径）
      } else {
        def.hp = pre.defHp - dmg; B.koKind = pre.koKind;
        if (mode === 'A') {
          if (dmg >= 10 && dmg >= 0.25 * def.hpMax) { causedDown = forceDown(defIsMe); }
        } else if (mode === 'B' || mode === 'BD') {
          causedDown = forceDown(defIsMe); // B/BD：原单发一律转击倒+读秒
        }
        // C：不转击倒（击倒只由重创刻度触发）
      }
    }
    if (mode === 'A' && !causedKO) {
      if (causedDown && !(dmg >= 10 && dmg >= 0.25 * def.hpMax)) { undoDown(pre); causedDown = false; }
      else if (!causedDown && B.phase === 'fight' && def.hp > 0 && dmg >= 10 && dmg >= 0.25 * def.hpMax && dmg < 0.30 * def.hpMax) {
        causedDown = forceDown(defIsMe);
      }
    }
    if (mode === 'C' || mode === 'E' || mode === 'CF') {
      if (causedDown && !causedKO) { undoDown(pre); causedDown = false; }
      var tAfter = defIsMe ? B.meTrauma : B.foeTrauma;
      if (!causedKO && B.phase === 'fight' && def.hp > 0 && Math.floor(tAfter / 25) > Math.floor(pre.trauma / 25)) {
        causedDown = forceDown(defIsMe);
      }
    }
  }
  if (__cur && causedKO) {
    __cur.finalBlow = { kind: B.koKind, dmg: dmg, hpBefore: pre.defHp, hpMax: def.hpMax, frac: pre.defHp / def.hpMax, round: B.round, defIsMe: defIsMe, hpKill: (pre.defHp - dmg) <= 0 };
  }
  return r;
};

function aggFights(records) {
  var a = { n: records.length, win: 0, unfinished: 0, kinds: {}, endRound: { 1: 0, 2: 0, 3: 0 }, roundsSum: 0, ticksSum: 0,
    single: Object.assign({ n: 0, dmgLe10: 0, fracLe25: 0, hpKill: 0 }, emptyBuckets()),
    finals: Object.assign({ n: 0 }, emptyBuckets()),
    downHits: Object.assign({ n: 0, dmgLe10: 0, fracLe25: 0 }, emptyBuckets()),
    fightsWithDown: 0, downsSum: 0, traumaLoserAhead: 0, traumaFinals: 0,
    tkoChecked: 0, tkoViolations: 0, practice: false };
  a.meHits = 0; a.meOnes = 0; a.meDmg = 0; a.maxTicks = 0;
  records.forEach(function (f) {
    if (f.ticks && f.ticks > a.maxTicks) a.maxTicks = f.ticks;
    if (f.unfinished) { a.unfinished++; return; }
    if (f.win) a.win++;
    a.meHits += f.meHits || 0; a.meOnes += f.meOnes || 0; a.meDmg += f.meDmg || 0;
    var k = f.koKind || 'pts';
    a.kinds[k] = (a.kinds[k] || 0) + 1;
    a.endRound[f.endRound] = (a.endRound[f.endRound] || 0) + 1;
    a.roundsSum += f.endRound; a.ticksSum += f.ticks;
    if (f.downs.length) a.fightsWithDown++;
    a.downsSum += f.downs.length;
    f.downHits.forEach(function (h) {
      a.downHits.n++; a.downHits.dmg[h.dmgB]++; a.downHits.frac[h.fracB]++;
      if (h.dmg <= 10) a.downHits.dmgLe10++;
      if (h.frac <= 0.25) a.downHits.fracLe25++;
    });
    if (f.finalBlow) {
      a.finals.n++; a.finals.dmg[f.finalBlow.dmgB]++; a.finals.frac[f.finalBlow.fracB]++;
      if (f.finalBlow.kind === 'single') {
        a.single.n++; a.single.dmg[f.finalBlow.dmgB]++; a.single.frac[f.finalBlow.fracB]++;
        if (f.finalBlow.dmg <= 10) a.single.dmgLe10++;
        if (f.finalBlow.frac <= 0.25) a.single.fracLe25++;
        if (f.finalBlow.hpKill) a.single.hpKill++;
      }
      if (f.finalBlow.kind === 'trauma') {
        a.traumaFinals++;
        if (f.finalBlow.frac > f.winnerHpFrac) a.traumaLoserAhead++;
      }
    }
    if (f.koKind === 'tko-giveup') {
      a.tkoChecked++;
      var loser = f.win ? false : true; // 败者：玩家胜→对手被TKO(defIsMe=false)
      var lastRoundDowns = f.downs.filter(function (d) { return d.defIsMe === loser && d.round === f.endRound; }).length;
      if (lastRoundDowns < 3) a.tkoViolations++;
    }
  });
  return a;
}

function collectFight(win) {
  var fb = __cur && __cur.finalBlow;
  var winnerHpFrac = win ? (B.me.hp / B.me.hpMax) : (B.foe.hp / B.foe.hpMax);
  return {
    win: win, koKind: B.koKind || '', endRound: B.round, ticks: 0,
    meHits: __cur ? (__cur.meHits || 0) : 0, meOnes: __cur ? (__cur.meOnes || 0) : 0, meDmg: __cur ? (__cur.meDmg || 0) : 0,
    downs: __cur ? __cur.downs : [],
    downHits: (__cur ? __cur.downHits : []).map(function (h) { return { dmg: h.dmg, frac: h.frac, dmgB: buckDmg(h.dmg), fracB: buckFrac(h.frac) }; }),
    finalBlow: fb ? { kind: fb.kind, dmg: fb.dmg, frac: fb.frac, hpKill: fb.hpKill, dmgB: buckDmg(fb.dmg), fracB: buckFrac(fb.frac) } : null,
    winnerHpFrac: winnerHpFrac,
  };
}
window.__recs = [];
function beginSet() { __recs = []; }
function runChunk(n, snap, practice) {
  for (var i = 0; i < n; i++) {
    S = JSON.parse(snap); B = null;
    if (practice) { pendingFoe = makePracticeFoe(); nextBattlePractice = false; } // 判定全同，仅结算走普通路径
    startBattle('auto');
    if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
    if (B) B.speed = 2; // 游戏自带速度机制（dt 与出拳轮次同步缩放），只降 tick 固定开销
    var guard = 0;
    while (B && B.phase !== 'over' && guard < 3000) {
      B.freezeUntil = 0; B.shake = 0; tick(); guard++;
    }
    if (!B || B.phase !== 'over') { __recs.push({ unfinished: true, ticks: guard }); continue; }
    var f = collectFight(!!(B.result && B.result.win));
    f.ticks = guard;
    __recs.push(f);
  }
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  return __recs.length;
}
function aggSet() { return aggFights(__recs); }
function runSim(n, snap) {
  var out = { n: n, win: 0, ko: 0, pts: 0 };
  for (var i = 0; i < n; i++) {
    S = JSON.parse(snap); B = null; pendingFoe = null;
    var before = JSON.stringify(S);
    simulateBattle();
    if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
    out.win += (S.wins > 0) ? 1 : 0;
    if (B && B.koKind === 'sim') out.ko++; else out.pts++;
    S = JSON.parse(before);
  }
  return out;
}
'DRIVER_END';
`;

ev(DRIVER);

function pct(x, n) { return n ? (100 * x / n).toFixed(1) + '%' : '—'; }
function showAgg(label, a) {
  const done = a.n - a.unfinished;
  console.log(`\n### ${label}  n=${a.n} 未完=${a.unfinished} 胜率=${pct(a.win, done)} 平均回合=${done ? (a.roundsSum / done).toFixed(2) : '—'} 平均tick=${done ? (a.ticksSum / done).toFixed(0) : '—'} 最大tick=${a.maxTicks}`);
  console.log('  终局构成:', Object.entries(a.kinds).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k || 'pts'}=${v} (${pct(v, done)})`).join('  '));
  console.log(`  终结回合: R1=${pct(a.endRound[1] || 0, done)} R2=${pct(a.endRound[2] || 0, done)} R3=${pct(a.endRound[3] || 0, done)}`);
  console.log(`  击倒: 有击倒的对局=${pct(a.fightsWithDown, done)} 场均击倒=${done ? (a.downsSum / done).toFixed(2) : '—'} 击倒命中 n=${a.downHits.n} 其中伤害≤10=${pct(a.downHits.dmgLe10, a.downHits.n)} 触发时HP%≤25=${pct(a.downHits.fracLe25, a.downHits.n)}`);
  console.log(`  全部终结一击 n=${a.finals.n} 伤害桶:`, JSON.stringify(a.finals.dmg), ' HP%桶:', JSON.stringify(a.finals.frac));
  if (a.single.n) {
    console.log(`  ★单发KO n=${a.single.n}: 终结伤害≤10=${pct(a.single.dmgLe10, a.single.n)} 触发HP%≤25=${pct(a.single.fracLe25, a.single.n)} 其实已打空HP=${pct(a.single.hpKill, a.single.n)}`);
    console.log('    单发KO伤害桶:', JSON.stringify(a.single.dmg), ' HP%桶:', JSON.stringify(a.single.frac));
  }
  if (a.meHits) console.log(`  玩家命中: 共${a.meHits} 拳, 恒1点占比=${pct(a.meOnes, a.meHits)}, 场均玩家总伤害=${(a.meDmg / Math.max(1, done)).toFixed(1)}`);
  if (a.traumaFinals) console.log(`  重创KO n=${a.traumaFinals}: 终结时败者剩余HP%高于胜者=${pct(a.traumaLoserAhead, a.traumaFinals)}`);
  if (a.tkoChecked) console.log(`  TKO核验: ${a.tkoChecked} 场，最终回合败者击倒<3 的违规=${a.tkoViolations}`);
}

const snaps = {};
for (const t of TIERS) snaps[t] = ev(`setup(${t})`);
const snapsP = ev('setup(1)');

if (BUILDS_CLI) {
  const builds = BUILDS_CLI.split(',');
  for (const mode of MODES) {
    ev(`__KO_MODE = ${JSON.stringify(mode)}`);
    for (const b of builds) {
      const snap = ev(`setupBuild(${JSON.stringify(b)})`);
      const a = runSet(`模式 ${mode} · 构筑 ${b}(第10周环境)`, N, snap, false);
      showAgg(`模式 ${mode} · 构筑 ${b}(第10周环境)`, a);
    }
  }
  server.close(); window.close();
  console.log('\nDONE');
  process.exit(0);
}

if (opt('match12', '')) {
  const snapM = ev('setupMatch12()');
  for (const mode of MODES) {
    ev(`__KO_MODE = ${JSON.stringify(mode)}`);
    const a = runSet(`模式 ${mode} · 第12周对位档`, N, snapM, false);
    showAgg(`模式 ${mode} · 第12周对位档`, a);
  }
  server.close(); window.close();
  console.log('\nDONE');
  process.exit(0);
}
function runSet(label, total, snap, practice) {
  ev('beginSet()');
  for (let done = 0; done < total; done += 25) {
    const c = Math.min(25, total - done);
    ev(`runChunk(${c}, ${JSON.stringify(snap)}, ${practice ? 'true' : 'false'})`);
    console.log(`    ... ${label}: ${done + c}/${total}`);
  }
  return JSON.parse(ev('JSON.stringify(aggSet())'));
}
for (const mode of MODES) {
  ev(`__KO_MODE = ${JSON.stringify(mode)}`);
  for (const t of TIERS) {
    const a = runSet(`模式 ${mode} · 第${t}周档`, N, snaps[t], false);
    showAgg(`模式 ${mode} · 第${t}周档`, a);
  }
  if (NP > 0) {
    const a = runSet(`模式 ${mode} · 练习赛`, NP, snapsP, true);
    showAgg(`模式 ${mode} · 练习赛(第1周档陪练)`, a);
  }
}
if (NSIM > 0) {
  for (const t of [1, 6]) {
    const s = JSON.parse(ev(`JSON.stringify(runSim(${NSIM}, ${JSON.stringify(snaps[t])}))`));
    console.log(`\n### 模拟跳过 · 第${t}周档 n=${s.n} 胜率=${pct(s.win, s.n)} KO率=${pct(s.ko, s.n)}（平直抽签 45%）`);
  }
}
server.close();
window.close();
console.log('\nDONE');
