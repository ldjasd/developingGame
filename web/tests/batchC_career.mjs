// 修复批次 C · 生涯模拟（12 周）：内容投放节奏验收口径
// 指标：① 12 周内触发的剧情/好感节点数（ev_ 主线+节点、aff_ 好感，分别计）
//       ② 日常事件：唯一日常见底周 + 第 6~12 周「训练照常但零日常」的空转周数 + 日常总触发次数
//       ③ 12 周内解锁成就数（结束时再跑一次 checkAchievements(true) 追溯口径并单列）
//       ④ 四人好感终值、阶段、排名、胜场
// 策略 engaged：训练轮转 + 每周散心 1 次 + 比赛日参赛 + 赞助跟随 + 有钱时定制 1 件（W>=3）
//   批次 C 后自动追加：每周向宿敌约战 1 次（startSpar 存在才调用，旧代码自动跳过 → 同脚本跑前后对照）
// 用法：node batchC_career.mjs [runs=2]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const { JSDOM, VirtualConsole, requestInterceptor } = createRequire('/home/hatch/workspace/game/boxing/web/package.json')('jsdom');
const root = '/home/hatch/workspace/game/boxing/web';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const dom = new JSDOM(html, { url: origin + '/index.html', resources: localOnly(origin), runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) { window.__errs = []; window.addEventListener('error', (ev) => window.__errs.push(String(ev.message || ev.error || 'unknown'))); } });
  await new Promise((r) => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); });
  await sleep(150);
  return dom.window;
}

const DRIVER = `
window.__c = (function () {
  renderBattle = function () {};
  blog = function () {};
  hitFx = function () {};
  koFx = function () { SFX.koCheer(); };
  shakeRing = function () {};
  window.__drainLog = [];
  function clickOk() {
    var sheet = document.getElementById('shopSheet');
    if (sheet && !sheet.hidden) { document.getElementById('btnShopCfOk').click(); return; }
    var cm = document.getElementById('confirmModal');
    if (cm && cm.classList.contains('open')) document.getElementById('btnCfOk').click();
  }
  function snap() {
    var seen = (S.story && S.story.seenEvents) || [];
    return { day: S.day, ap: S.ap, stamina: Math.round(S.stamina), money: S.money, injury: S.injury, mind: Math.round(S.mind),
      wins: S.wins, losses: S.losses, rank: S.rank, stage: S.stage, influence: refreshInfluence(),
      ach: Object.keys(S.achievements || {}).length,
      seenTotal: seen.length,
      seenEv: seen.filter(function (id) { return id.indexOf('ev_') === 0; }).length,
      seenAff: seen.filter(function (id) { return id.indexOf('aff_') === 0; }).length,
      seenDailyUnique: seen.filter(function (id) { return id.indexOf('daily_') === 0; }).length,
      affinity: Object.assign({}, (S.story && S.story.affinity) || {}),
      sparFights: S.sparFights || 0, sparRival: S.sparRival || 0 };
  }
  function fightLoop() {
    clearInterval(battleTimer);
    var g = 0;
    while (B && B.phase !== 'over' && g++ < 40000) { B.freezeUntil = 0; tick(); if (!B) break; }
    var over = !!(B && B.phase === 'over' && B.result);
    var ret = over ? { win: B.result.win, how: B.result.how } : { win: null, how: 'UNFINISHED' };
    B = null;
    return ret;
  }
  function fight(tactic) {
    B = null; pendingFoe = null; nextBattlePractice = false; if (typeof nextBattleSpar !== 'undefined') nextBattleSpar = false;
    startBattle('auto');
    if (tactic) B.me.tactic = tactic;
    return fightLoop();
  }
  function spar(key) {
    if (typeof startSpar !== 'function') return { ok: false, why: 'no-startSpar' };
    var okStart = startSpar(key);
    if (!okStart) return { ok: false, why: 'rejected' };
    var mm = document.getElementById('modeModal'); if (mm) mm.classList.remove('open');
    startBattle('auto');
    var r = fightLoop();
    return { ok: true, win: r.win, how: r.how };
  }
  function storyDrain() {
    ['btnSettleOk', 'btnStageOk', 'btnAchOk'].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      var modal = b.closest ? b.closest('.modal-mask') : null;
      if (modal && modal.classList.contains('open')) b.click();
    });
    if (typeof showNextPendingModal === 'function') showNextPendingModal();
    if (typeof showStoryEventIfPending === 'function') showStoryEventIfPending();
    var n = 0;
    while (n++ < 60) {
      var m = document.getElementById('storyModal');
      if (!m || !m.classList.contains('open')) break;
      if (typeof curStory !== 'undefined' && curStory && curStory.id && window.__lastDrainId !== curStory.id) { window.__lastDrainId = curStory.id; window.__drainLog.push(curStory.id); }
      var btns = document.querySelectorAll('#storyChoices button');
      if (!btns.length) break;
      btns[0].click();
    }
    return n;
  }
  return {
    snap: snap, fight: fight, spar: spar, storyDrain: storyDrain, clickOk: clickOk,
    drainLog: function () { var l = window.__drainLog.slice(); window.__drainLog = []; return l; },
    train: function (planCsv) { planSel = planCsv.split(','); doPlanTrain(); finishTrainResult(); },
    work: function () { doWork(); }, rest: function () { doRest(); }, sleep: function () { doSleep(); },
    relax: function () { if (S.ap >= 2) { S.ap -= 2; doRelax('看电影'); } },
    sign: function (id) { signSponsor(id); clickOk(); },
    cancelSponsor: function () { if (typeof cancelSponsor === 'function') { cancelSponsor(); clickOk(); } },
    customBuy: function () {
      customSel = { pattern: 'classic', outer: 'calf', lining: 'latex', oz: 12, fix: 'velcro' };
      confirmCustomBuy(); clickOk();
    },
    achRetro: function () { checkAchievements(true); return Object.keys(S.achievements || {}).length; },
    hasSpar: function () { return typeof startSpar === 'function'; }
  };
})();
'ready';
`;

const PLANS = ['strength,upper', 'bag,pads', 'speedball,rope,video'];
const SPONSOR_ORDER = ['shengdao', 'tiequan', 'ranli', 'ramen'];
const SP_WEEKLY = { ramen: 50, ranli: 200, tiequan: 500, shengdao: 1500 };
const SP_NEED = { ramen: 1, ranli: 2, tiequan: 3, shengdao: 4 };

let curSrv = null;
async function newGame() {
  if (curSrv) { try { curSrv.close(); } catch {} }
  const { srv, origin } = await serve(root);
  curSrv = srv;
  let w;
  try { w = await loadPage(origin); } catch (e) { await sleep(500); w = await loadPage(origin); }
  const errs = (w.__errs || []).filter((m) => !/Could not load/i.test(m));
  if (errs.length) { console.error('页面错误', errs); process.exit(1); }
  if (w.document.getElementById('storyModal').classList.contains('open')) w.document.getElementById('btnStorySkip').click();
  await sleep(30);
  w.eval(DRIVER);
  return w;
}
const ev = (w, code) => w.eval(code);
const snap = (w) => ev(w, '__c.snap()');

function sponsorPolicy(w) {
  const s = snap(w);
  const best = SPONSOR_ORDER.find((id) => SP_NEED[id] <= s.influence);
  if (!best || s.sponsor === best) return;
  if ((SP_WEEKLY[s.sponsor] || 0) >= SP_WEEKLY[best]) return;
  if (s.sponsor) ev(w, '__c.cancelSponsor()');
  ev(w, `__c.sign('${best}')`);
}

async function runOnce(runIdx) {
  const w = await newGame();
  const hasSpar = ev(w, '__c.hasSpar()');
  let rot = 0, lastWeek = 0, customDone = false;
  const weekly = [];
  let wk = null;
  function newWeek(n) { return { week: n, trains: 0, dailyOpened: 0, dailyIds: [], evOpened: 0, affOpened: 0, spar: 0, matches: 0 }; }
  while (true) {
    ev(w, '__c.storyDrain()');
    const drained = ev(w, '__c.drainLog()');
    if (wk) drained.forEach((id) => {
      wk.dailyIds.push(id);
      if (id.indexOf('daily_') === 0) wk.dailyOpened++;
      else if (id.indexOf('ev_') === 0) wk.evOpened++;
      else if (id.indexOf('aff_') === 0) wk.affOpened++;
    });
    let s = snap(w);
    if (s.day > 84) break;
    const week = Math.ceil(s.day / 7);
    if (week !== lastWeek) {
      if (wk) weekly.push(wk);
      wk = newWeek(week); lastWeek = week;
      sponsorPolicy(w); s = snap(w);
    }
    const isMatch = s.day % 7 === 0;
    if (isMatch) {
      if (s.stamina < 55 && s.ap >= 1) ev(w, '__c.rest()');
      ev(w, "__c.fight('attack')"); wk.matches++;
      s = snap(w);
      if (s.ap >= 2 && s.stamina >= 30) { ev(w, `__c.train('${PLANS[rot++ % 3]}')`); wk.trains++; }
      ev(w, '__c.sleep()');
    } else {
      // 约战宿敌：每周 1 次（批次 C 后才有此函数）
      if (hasSpar && week >= 2 && wk.spar === 0 && s.ap >= 2 && s.stamina >= 45) {
        const r = ev(w, "__c.spar('opp_counter')");
        if (r && r.ok) { wk.spar++; s = snap(w); }
      }
      // 每周散心 1 次（放在周内第 2 天近似：day%7==2）
      if (s.day % 7 === 2 && s.money >= 300 && s.ap >= 2) ev(w, '__c.relax()');
      // 定制一件（W>=3、钱够、无定制件时）
      if (!customDone && week >= 3 && s.money >= 2600) {
        ev(w, '__c.customBuy()');
        if (ev(w, '(S.customGear||[]).some(function (g) { return g.source === "custom"; })')) customDone = true;
        s = snap(w);
      }
      let guard = 0;
      while (snap(w).ap >= 2 && guard++ < 4) {
        const st = snap(w);
        if (st.stamina >= 28) { ev(w, `__c.train('${PLANS[rot++ % 3]}')`); wk.trains++; }
        else if (st.ap >= 3) { ev(w, '__c.rest()'); ev(w, '__c.rest()'); }
        else break;
      }
      if (snap(w).ap >= 1 && snap(w).stamina < 40) ev(w, '__c.rest()');
      ev(w, '__c.sleep()');
    }
  }
  if (wk) weekly.push(wk);
  const fin = snap(w);
  const achRetro = ev(w, '__c.achRetro()');
  const fin2 = snap(w);
  // 日常见底周：唯一日常首次达到 15 的周
  let cumDaily = 0, dryWeek = null;
  const dryWeeks = [];
  for (const x of weekly) {
    // 用 drain 的 daily id 近似唯一见底（改前池 = 15 段唯一）
    if (x.week >= 6 && x.trains >= 6 && x.dailyOpened === 0) dryWeeks.push(x.week);
  }
  const out = {
    run: runIdx, hasSpar, final: fin, achRetro,
    weekly: weekly.map((x) => ({ w: x.week, trains: x.trains, daily: x.dailyOpened, ev: x.evOpened, aff: x.affOpened, spar: x.spar, matches: x.matches })),
    dryWeeksFrom6: dryWeeks,
    dailyTotalOpened: weekly.reduce((a, x) => a + x.dailyOpened, 0)
  };
  console.log(JSON.stringify(out, null, 1));
  return out;
}

const runs = parseInt(process.argv[2] || '2', 10);
for (let i = 0; i < runs; i++) await runOnce(i + 1);
process.exit(0);
