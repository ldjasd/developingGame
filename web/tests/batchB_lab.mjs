// 修复批次 B（战斗决策层 M1/M2/M5）实验室：
//  1) matrix：拉平属性实验室（审查 audit2_battle 同法）——玩家 W10 属性 20 + PRO 装备 + 熟练经验 300，
//     对手风格强制 + 属性拉平 21（hpMax 同步），玩家战术整场固定，输出 战术 × 风格 胜率表。
//     foeTac=persona（默认，G0 起）：强制风格后把对手人格换成该风格的人格——这才是真实对局口径
//       （真实比赛里人格由成员 style 派生，与风格同源；批次 B 的克制环结论只认 persona 口径）。
//     foeTac=asis：对手战术完全交给游戏自身逻辑——但实验室强制改了 foe.style 而人格仍按原成员派生，
//       风格与人格会错位，【仅作消融对照，严禁用 asis 结果下结论】（复测 N9：asis 复跑会导出假结论）。
//  2) cmdab：同环境指令 A/B——policy=smart（合理时机调真实 useCombo/useWall/useClinch）/ off（全程不用）/ spam（一好就乱按）。
//  3) foeai：对手行为采样——每回合战术分布（人格一致性）、对手指令使用次数与博客日志计数（需 B.cmdUse，改后用）。
// 用法：node tests/batchB_lab.mjs matrix  [--n 100] [--foeTac persona|asis]   （默认 persona=真实对局口径，见上注）
//       node tests/batchB_lab.mjs cmdab   [--n 200]
//       node tests/batchB_lab.mjs foeai   [--n 60]
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
const MODE = args[0] || 'matrix';
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const N = parseInt(opt('n', MODE === 'matrix' ? '100' : MODE === 'cmdab' ? '200' : '60'), 10);
const FOETAC = opt('foeTac', 'persona'); // G0：默认改 persona（真实对局口径）；asis 仅消融对照、不得作结论
const NOFOECMD = args.includes('--noFoeCmd'); // 消融：关掉对手指令 AI，分离人格战术与指令的影响

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
window.__bb = (function () {
  renderBattle = function () {};
  hitFx = function () {};
  koFx = function () { SFX.koCheer(); };
  shakeRing = function () {};
  // 纯演出层 stub（判定零参与）：纸偶驱动/残影/弧光/闪光/粒子在 jsdom 里是 DOM 成本大头，不 stub 单场要慢一个量级
  setMePose = function () {};
  spawnAfterimage = function () {};
  spawnPunchArc = function () {};
  spawnHitFlash = function () {};
  burstParticles = function () {};
  knockback = function () {};
  window.__blogs = [];
  blog = function (msg) { window.__blogs.push(String(msg)); };

  var PRO_GEAR = { gloves: 'gloves3', guard: 'guard3', boots: 'boots2', head: 'head2', robe: 'robe1', wrist: 'wrist2' };
  function attrs(v) { var o = {}; ATTRS.forEach(function (a) { o[a.key] = v; }); return o; }
  function setupFlat() { // audit2_battle.setup(10, 20, PRO_GEAR, 300) 同口径
    S = defaultState();
    S.day = 70; S.rank = 50;
    S.roster = buildRoster(50, 1);
    for (var wk = 2; wk <= 10; wk++) weeklyRosterGrowth(wk);
    S.day = 70; S.rank = 50;
    S.attrs = attrs(20); S.gear = JSON.parse(JSON.stringify(PRO_GEAR));
    S.punchExp = {}; PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 300; });
    S.enh = {}; S.injury = 0; S.mind = 60; S.stamina = 100;
    S.wins = 0; S.losses = 0; S.winStreak = 0; S.koWins = 0; S.fame = 0;
    S.buffs = { drink: false, bandage: false, meal: false };
    S.deathFight = false; S.scoutedForDay = 0; S.lastMatchDay = 0; S.money = 100000; S.sponsor = null;
  }
  function setupT6() { // ko-impl-verify t6 同口径（第 6 周、属性 16、MID 装备、经验 200）
    S = defaultState();
    S.day = 7; S.rank = 50; S.roster = buildRoster(50, 1);
    S.mind = 80; S.ap = 6; S.deathFight = false; S.injury = 0; S.winStreak = 0; S.wins = 0; S.losses = 0; S.money = 100000;
    for (var wk = 2; wk <= 6; wk++) { S.day = wk * 7; weeklyRosterGrowth(wk); }
    S.day = 42;
    S.attrs = attrs(16);
    S.gear = { gloves: 'gloves2', guard: 'guard1', boots: 'boots1', head: 'head1', robe: 'robe1', wrist: 'wrist1' };
    PUNCH_KEYS.forEach(function (k) { S.punchExp[k] = 200; });
  }

  // 玩家指令策略：smart=合理时机；spam=冷却好就按（搂抱也乱抱）；off=不用
  function meCmdPolicy(mode) {
    if (!B || B.phase !== 'fight' || mode === 'off') return;
    if (mode === 'spam') {
      if (B.cd.combo <= 0) useCombo();
      if (B.cd.wall <= 0) useWall();
      if (B.cd.clinch <= 0) useClinch();
      return;
    }
    // smart：组合拳留给对手重创≥35 或自己连击≥2 的窗口；铁壁在残血/重创高时；搂抱在体力低或对手连击≥3 时
    if (B.cd.combo <= 0 && ((B.foeTrauma || 0) >= 35 || (B.comboMe || 0) >= 2)) useCombo();
    if (B.cd.wall <= 0 && (B.me.hp < B.me.hpMax * 0.55 || (B.meTrauma || 0) >= 55)) useWall();
    if (B.cd.clinch <= 0 && (B.me.stam < 25 || (B.comboFoe || 0) >= 3)) useClinch();
  }

  function runOne(o) {
    pendingFoe = null; nextBattlePractice = false;
    startBattle('auto');
    if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
    if (!B) return null;
    if (o.foeStyle) { B.foe.style = o.foeStyle; B.foe.styleIntensity = 1.0; }
    if (o.foeFlat) { ATTRS.forEach(function (a) { B.foe.attrs[a.key] = o.foeFlat; }); B.foe.hpMax = 100 + o.foeFlat * 14; B.foe.hp = B.foe.hpMax; }
    if (o.foeTac === 'persona' && typeof foePersonaFor === 'function' && o.foeStyle) {
      B.foe.persona = foePersonaFor(o.foeStyle, B.foe.key);
      B.foe.tactic = B.foe.persona.base;
    }
    window.__blogs.length = 0;
    B.speed = 2; // ko-impl-verify 同口径（dt 与出拳轮次同步缩放，只降 tick 固定开销）
    var g = 0, maxRound = 1;
    var tacByRound = {};
    while (B && B.phase !== 'over' && g++ < 40000) {
      B.freezeUntil = 0;
      if (o.tactic) B.me.tactic = o.tactic;
      meCmdPolicy(o.cmd || 'off');
      tick();
      if (!B) break;
      if (B.round > maxRound) maxRound = B.round;
      if (B.phase === 'fight' || B.phase === 'down') tacByRound[B.round] = B.foe.tactic;
    }
    if (!B || B.phase !== 'over' || !B.result) return { unfin: true };
    var r = {
      win: B.result.win, how: B.result.how, rounds: maxRound,
      meHpPct: Math.max(0, B.me.hp / B.me.hpMax), foeHpPct: Math.max(0, B.foe.hp / B.foe.hpMax),
      koEnd: (B.me.hp <= 0 || B.foe.hp <= 0),
      tacByRound: tacByRound,
      cmdUse: B.cmdUse ? JSON.parse(JSON.stringify(B.cmdUse)) : null,
      foePersona: B.foe.persona ? { base: B.foe.persona.base, name: B.foe.persona.name, adjust: B.foe.persona.adjust } : null,
      foeStyle: B.foe.style,
      blogs: window.__blogs.slice()
    };
    B = null;
    return r;
  }

  function batch(setupName, o, n) {
    if (setupName === 't6') setupT6(); else setupFlat();
    var snap = JSON.stringify(S);
    var st = { n: 0, win: 0, unfin: 0, koEnd: 0, roundsSum: 0, meHpSum: 0,
      tacRounds: {}, cmdFoe: { combo: 0, wall: 0, clinch: 0 }, cmdMe: { combo: 0, wall: 0, clinch: 0 },
      foeCmdBlogs: 0, foeTacBlogs: 0, personas: {} };
    for (var i = 0; i < n; i++) {
      S = JSON.parse(snap); B = null;
      var r = runOne(o);
      if (!r || r.unfin) { st.unfin++; continue; }
      st.n++;
      if (r.win) st.win++;
      if (r.koEnd) st.koEnd++;
      st.roundsSum += r.rounds; st.meHpSum += r.meHpPct;
      Object.keys(r.tacByRound).forEach(function (rd) {
        var t = r.tacByRound[rd];
        st.tacRounds[rd] = st.tacRounds[rd] || {};
        st.tacRounds[rd][t] = (st.tacRounds[rd][t] || 0) + 1;
      });
      if (r.cmdUse) {
        ['combo', 'wall', 'clinch'].forEach(function (k) {
          st.cmdFoe[k] += (r.cmdUse.foe && r.cmdUse.foe[k]) || 0;
          st.cmdMe[k] += (r.cmdUse.me && r.cmdUse.me[k]) || 0;
        });
      }
      if (r.foePersona) { var pk = r.foePersona.base + '/' + r.foePersona.adjust; st.personas[pk] = (st.personas[pk] || 0) + 1; }
      r.blogs.forEach(function (m) {
        if (/对手指令|对手搂抱|对手开启/.test(m)) st.foeCmdBlogs++;
        if (/对手调整了战术|对手改变战术/.test(m)) st.foeTacBlogs++;
      });
    }
    S = JSON.parse(snap); B = null;
    return st;
  }
  return { batch: batch };
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
  if (NOFOECMD) w.eval('foeCommandAI = function () {}; "ok"');
  const pct = (x, n) => (n ? Math.round(x / n * 1000) / 10 : 0);

  if (MODE === 'matrix') {
    const styles = ['power', 'speed', 'guardcounter', 'balanced'];
    const tacs = ['attack', 'counter', 'points'];
    console.log(`## 战术 × 风格 矩阵（拉平实验室 n=${N}/格，对手战术=${FOETAC}）`);
    console.log('风格\\战术\t' + tacs.join('\t'));
    for (const st of styles) {
      const cells = [];
      for (const tac of tacs) {
        const r = w.eval(`__bb.batch('flat', { tactic: '${tac}', foeStyle: '${st}', foeFlat: 21, foeTac: '${FOETAC}', cmd: 'off' }, ${N})`);
        cells.push(`${pct(r.win, r.n)}%(n=${r.n},未完${r.unfin},回合${(r.roundsSum / Math.max(1, r.n)).toFixed(2)},KO终${pct(r.koEnd, r.n)}%)`);
      }
      console.log(st + '\t' + cells.join('\t'));
    }
  } else if (MODE === 'cmdab') {
    const combos = [
      { foeStyle: 'power', tactic: 'counter' },
      { foeStyle: 'power', tactic: 'attack' },
      { foeStyle: 'guardcounter', tactic: 'points' },
      { foeStyle: 'speed', tactic: 'counter' },
    ];
    console.log(`## 指令 A/B（拉平实验室 n=${N}/组，对手战术=${FOETAC}）`);
    for (const c of combos) {
      for (const pol of ['off', 'smart', 'spam']) {
        const r = w.eval(`__bb.batch('flat', { tactic: '${c.tactic}', foeStyle: '${c.foeStyle}', foeFlat: 21, foeTac: '${FOETAC}', cmd: '${pol}' }, ${N})`);
        console.log(`${c.foeStyle} × ${c.tactic} × ${pol}: 胜率 ${pct(r.win, r.n)}%（n=${r.n} 未完${r.unfin}） 平均回合 ${(r.roundsSum / Math.max(1, r.n)).toFixed(2)} KO终局 ${pct(r.koEnd, r.n)}% 我方指令用量 组合${r.cmdMe.combo}/铁壁${r.cmdMe.wall}/搂抱${r.cmdMe.clinch}`);
      }
    }
  } else if (MODE === 'foeai') {
    console.log(`## 对手行为采样（t6 环境 n=${N}，玩家战术 attack、无指令）`);
    const r = w.eval(`__bb.batch('t6', { tactic: 'attack', cmd: 'off' }, ${N})`);
    console.log(`n=${r.n} 未完=${r.unfin} 玩家胜率=${pct(r.win, r.n)}% 平均回合=${(r.roundsSum / Math.max(1, r.n)).toFixed(2)}`);
    console.log('对手每回合战术分布:', JSON.stringify(r.tacRounds));
    console.log('对手人格分布（base/adjust）:', JSON.stringify(r.personas));
    console.log(`对手指令总用量（${r.n} 场）: 组合拳 ${r.cmdFoe.combo}（场均 ${(r.cmdFoe.combo / Math.max(1, r.n)).toFixed(2)}） 铁壁 ${r.cmdFoe.wall}（场均 ${(r.cmdFoe.wall / Math.max(1, r.n)).toFixed(2)}） 搂抱 ${r.cmdFoe.clinch}（场均 ${(r.cmdFoe.clinch / Math.max(1, r.n)).toFixed(2)}）`);
    console.log(`日志计数: 对手指令类 ${r.foeCmdBlogs} 条（场均 ${(r.foeCmdBlogs / Math.max(1, r.n)).toFixed(2)}） 对手战术调整 ${r.foeTacBlogs} 条（场均 ${(r.foeTacBlogs / Math.max(1, r.n)).toFixed(2)}）`);
    // 按风格拆分的人格/指令采样（拉平实验室，风格强制 + 人格对应风格）
    for (const st of ['power', 'speed', 'guardcounter', 'balanced']) {
      const r2 = w.eval(`__bb.batch('flat', { tactic: 'attack', foeStyle: '${st}', foeFlat: 21, foeTac: 'persona', cmd: 'off' }, ${N})`);
      console.log(`[${st}] n=${r2.n} 玩家胜率=${pct(r2.win, r2.n)}% 回合战术分布=${JSON.stringify(r2.tacRounds)} 对手指令场均 组合${(r2.cmdFoe.combo / Math.max(1, r2.n)).toFixed(2)}/铁壁${(r2.cmdFoe.wall / Math.max(1, r2.n)).toFixed(2)}/搂抱${(r2.cmdFoe.clinch / Math.max(1, r2.n)).toFixed(2)}`);
    }
  }
  w.close();
} finally {
  srv.close();
}
