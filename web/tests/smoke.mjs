// 冒烟测试：同一组核心断言分别跑「工程版」（web/ 根目录）与「dist 单文件版」（web/dist/），
// 证明拆分与打包行为一致。可选：--original <目录> 追加跑一遍指定目录（如 artifact 发布副本目录）。
// 前置：先运行 npm install（装 jsdom）或保证 /tmp/smoke 下有 jsdom；先运行 npm run build 生成 dist。
// 用法：node tests/smoke.mjs [--original <dir>]
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

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? '=> ' + JSON.stringify(extra) : ''); }
}

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

// 只放行本地源的资源请求；外部资源（字体等）返回空响应，避免联网与挂起
function localOnly(origin) {
  return {
    interceptors: [
      requestInterceptor((request) => {
        if (request.url.startsWith(origin)) return undefined;
        return new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }),
    ],
  };
}

async function loadPage(origin, seed, extraSeeds) {
  const vc = new VirtualConsole();
  const jsdomErrors = [];
  vc.on('jsdomError', (e) => jsdomErrors.push(String((e && e.message) || e)));
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
      if (seed) window.localStorage.setItem(SAVE_KEY, seed);
      if (extraSeeds) Object.keys(extraSeeds).forEach((k) => { if (extraSeeds[k] != null) window.localStorage.setItem(k, extraSeeds[k]); });
    },
  });
  await new Promise((r) => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); });
  await sleep(150);
  return { dom, w: dom.window, jsdomErrors };
}

async function suite(label, dir) {
  console.log(`\n===== ${label}：${dir} =====`);
  if (!fs.existsSync(path.join(dir, 'index.html'))) { ok('index.html 存在', false, dir); return; }
  const { srv, origin } = await serve(dir);
  try {
    const { w, jsdomErrors } = await loadPage(origin, null);
    const scriptErrs = (w.__errs || []).filter((m) => !/Could not load/i.test(m));
    ok('页面加载无脚本错误', scriptErrs.length === 0, scriptErrs);
    if (jsdomErrors.length) console.log('  (jsdom 诊断信息，不计失败)', jsdomErrors.slice(0, 3));

    // 新档初始化
    ok('全局状态 S 已建立', !!w.S && typeof w.S === 'object');
    ok('新档玩家排名 = 50', w.S.rank === 50, w.S.rank);
    ok('新档 story 已初始化且未走序章', !!w.S.story && w.S.story.prologueDone === false, w.S.story && w.S.story.prologueDone);
    ok('新档成就初始化（achievements 为空对象 / koWins=0 / ACHIEVEMENTS ≥20 / checkAchievements 为函数）',
      !!w.S.achievements && typeof w.S.achievements === 'object' && !Array.isArray(w.S.achievements) && Object.keys(w.S.achievements).length === 0 &&
      w.S.koWins === 0 && w.eval('ACHIEVEMENTS.length') >= 20 && w.eval('typeof checkAchievements') === 'function');
    ok('数据全局就位（ROSTER_DEF 50 / TRAININGS 13 / SHOP_GEAR 21 / STORY_EVENTS 含 ev_stage1）',
      w.eval('ROSTER_DEF.length') === 50 && w.eval('TRAININGS.length') === 13 && w.eval('SHOP_GEAR.length') === 21 && !!w.eval('STORY_EVENTS.ev_stage1'));
    ok('逻辑全局就位（makeFoe / simulateBattle / settleNow / save 均为函数）',
      ['makeFoe', 'simulateBattle', 'settleNow', 'save'].every((f) => w.eval(`typeof ${f}`) === 'function'));
    ok('短款服装选项就位（服装 11 项 / 切到短款背心后立绘 src 指向 outfit_short_vest.png）',
      w.eval('Object.keys(APPEARANCE.outfit).length') === 11 &&
      w.eval("setAppearance('outfit','short_vest'); portraitSrc()").includes('outfit_short_vest.png') &&
      w.eval("setAppearance('outfit','short_training'); portraitSrc()").includes('outfit_short_training.png') &&
      w.eval("setAppearance('outfit','short_cami'); portraitSrc()").includes('outfit_short_cami.png') &&
      w.eval("setAppearance('outfit','wide_strap'); portraitSrc()").includes('outfit_wide_strap.png') &&
      w.eval("setAppearance('outfit','halter'); portraitSrc()").includes('outfit_halter.png'));

    // Phase 9 音频：BGM sequencer 与新 SFX 就位；muted / 无 AudioContext（jsdom）时全部入口安全
    const NEW_SFX = ['roundStart', 'roundEnd', 'finalBell', 'countTick', 'countSuccess', 'countFail', 'koCheer', 'victory', 'achievement', 'buy', 'click'];
    ok('Phase 9 音频就位（BGM 为对象且 start/stop 为函数 / 11 个新 SFX 均为函数）',
      w.eval('typeof BGM') === 'object' && ['start', 'stop'].every((f) => w.eval(`typeof BGM.${f}`) === 'function') &&
      NEW_SFX.every((f) => w.eval(`typeof SFX.${f}`) === 'function'));
    ok('muted=true 时 BGM/SFX 调用安全且状态正确（start 切曲目 / 全调用不抛 / stop 清空）',
      w.eval("muted = true; var r = ''; try { BGM.start('battle'); r += BGM.track; BGM.start('daily'); r += '/' + BGM.track; " +
        JSON.stringify(NEW_SFX) + ".forEach(function (f) { SFX[f](3); }); r += '/ok'; BGM.stop(); r += '/' + String(BGM.track); } catch (e) { r += '/ERR:' + e.message; } muted = false; r;") === 'battle/daily/ok/null');
    ok('无 AudioContext 时全部音频入口安全（unmuted 下 BGM + 旧/新 SFX 逐个调用不抛错）',
      w.eval("muted = false; var r2 = 'ok'; try { BGM.start('battle'); BGM.start('daily'); SFX.light(); SFX.heavy(); SFX.block(); SFX.whiff(); SFX.bell(1); SFX.crowd(); " +
        JSON.stringify(NEW_SFX) + ".forEach(function (f) { SFX[f](3); }); BGM.stop(); } catch (e) { r2 = 'ERR:' + e.message; } r2;") === 'ok');

    // 角色池
    const roster = w.S.roster || [];
    const ranked = roster.filter((m) => m.rank >= 1).map((m) => m.rank).sort((a, b) => a - b);
    const union = [...ranked, w.S.rank];
    ok('roster 共 50 人', roster.length === 50, roster.length);
    ok('池内 49 人有名次且与玩家合成完整 1~50（无重无缺）',
      ranked.length === 49 && union.length === 50 && new Set(union).size === 50 && Math.min(...union) === 1 && Math.max(...union) === 50,
      ranked.length);
    const bench = roster.filter((m) => m.rank === 0);
    ok('候补恰 1 人且为胡小桃（opp_chestnut_short）', bench.length === 1 && bench[0].key === 'opp_chestnut_short', bench.map((m) => m.key));

    // 跳过序章，进入主界面
    if (w.document.getElementById('storyModal').classList.contains('open')) w.document.getElementById('btnStorySkip').click();
    if (w.document.getElementById('helpModal').classList.contains('open')) w.document.getElementById('btnCloseHelp').click();
    await sleep(50);
    ok('跳过序章后 prologueDone=true', w.S.story.prologueDone === true);

    // 对手生成：来自角色池且在 ±5 名次窗口内
    const foe = w.eval('makeFoe()');
    const poolNames = new Set(roster.map((m) => m.name));
    ok('makeFoe 生成对手', !!foe && !!foe.name, foe && foe.name);
    ok('对手是角色池真人', !!foe && poolNames.has(foe.name), foe && foe.name);
    ok('对手名次在玩家 ±5 窗口内', !!foe && Math.abs(foe.rank - w.S.rank) <= 5, foe && foe.rank);

    // 战斗全局就位（battle 区段拆分前补的断言：手动/自动/模拟三模式入口与战斗主循环）
    ok('战斗全局就位（startBattle/tick/manualTick/renderBattle/finishBattle/playerPunch/tryAttack/dealDamage 为函数，MPUNCH 8 拳种）',
      ['startBattle', 'tick', 'manualTick', 'renderBattle', 'finishBattle', 'playerPunch', 'tryAttack', 'dealDamage'].every((f) => w.eval(`typeof ${f}`) === 'function') && w.eval('Object.keys(MPUNCH).length') === 8);

    // 手动战斗可开局：进入 fight 阶段、视图切换、双方状态完整（开局后停表清理，不结算不记账）
    w.eval("startBattle('manual');");
    ok('手动战斗可开局（mode=manual / phase=fight / round=1 / 对手为角色池真人）',
      w.eval('B && B.mode') === 'manual' && w.eval('B.phase') === 'fight' && w.eval('B.round') === 1 && poolNames.has(w.eval('B.foe.name')),
      w.eval('B && (B.mode + "/" + B.phase + "/" + B.round)'));
    ok('手动开局视图切换（战斗视图显示 / 日常隐藏 / 手动面板可见 / 双方 HP 为正且不超上限）',
      w.document.getElementById('battleView').style.display === 'block' && w.document.getElementById('dailyView').style.display === 'none' &&
      w.document.getElementById('manualPanel').style.display === '' &&
      w.eval('B.me.hp > 0 && B.me.hp <= B.me.hpMax && B.foe.hp > 0 && B.foe.hp <= B.foe.hpMax'));
    w.eval("clearInterval(battleTimer); B = null; document.getElementById('dailyView').style.display = ''; document.getElementById('battleView').style.display = '';");

    // 模拟一场比赛可结算
    const moneyBeforeSim = w.S.money;
    w.eval('simulateBattle();');
    ok('模拟结算一致性（奖金到账 / lastMatchDay=今日 / B 为 sim 且已结束）',
      w.S.money > moneyBeforeSim && w.S.lastMatchDay === w.S.day && w.eval('B.mode') === 'sim' && w.eval('B.phase') === 'over',
      `${moneyBeforeSim}->${w.S.money}`);
    await sleep(600);
    ok('模拟比赛后结算窗弹出', w.document.getElementById('settleModal').classList.contains('open'));
    ok('战绩已记账（胜+负 = 1）', w.S.wins + w.S.losses === 1, `${w.S.wins}/${w.S.losses}`);

    // Phase 9 成就：构造达标状态 → 判定解锁 / 不重复解锁 / 未达标不解锁
    w.eval("S.wins = 10; S.rank = 20; S.winStreak = 3; S.koWins = 1; S.enh = { gloves1: 5 }; S.story.affinity.senior = 60; checkAchievements();");
    ok('成就达标解锁（first_win/wins_10/first_ko/streak_3/rank_25/influence_3/enh_5/affinity_60/prologue_done）',
      ['first_win', 'wins_10', 'first_ko', 'streak_3', 'rank_25', 'influence_3', 'enh_5', 'affinity_60', 'prologue_done'].every((id) => !!w.S.achievements[id]),
      Object.keys(w.S.achievements));
    ok('成就解锁记录含周/日信息（day/week/text）',
      !!w.S.achievements.first_win && w.S.achievements.first_win.day === w.S.day && typeof w.S.achievements.first_win.week === 'number' && /Day/.test(w.S.achievements.first_win.text || ''));
    const achCount1 = Object.keys(w.S.achievements).length;
    w.eval('checkAchievements();');
    ok('成就重复判定不重复解锁', Object.keys(w.S.achievements).length === achCount1, `${achCount1}->${Object.keys(w.S.achievements).length}`);
    ok('未达标成就未解锁（wins_25/enh_10/affinity_90/dex_10/sponsor_any）',
      ['wins_25', 'enh_10', 'affinity_90', 'dex_10', 'sponsor_any'].every((id) => !w.S.achievements[id]));
    w.eval('openStatus();');
    ok('状态页成就区渲染（已解锁数/总数、已解锁名、未解锁灰显带条件）',
      (w.document.getElementById('achCount').textContent || '').indexOf(' / ') > 0 &&
      w.document.getElementById('stAchievements').innerHTML.indexOf('势如破竹') >= 0 &&
      w.document.getElementById('stAchievements').innerHTML.indexOf('未解锁') >= 0 &&
      w.document.getElementById('stAchievements').innerHTML.indexOf('locked') >= 0,
      w.document.getElementById('achCount').textContent);
    w.eval('closeStatus();');

    // 存档保存 → 重读一致
    w.eval('save()');
    const saved = w.localStorage.getItem(SAVE_KEY);
    ok('存档已写入 localStorage', !!saved);
    const savedObj = JSON.parse(saved);
    ok('存档内战绩/排名与内存一致', savedObj.wins === w.S.wins && savedObj.losses === w.S.losses && savedObj.rank === w.S.rank);
    const rosterJson = JSON.stringify(w.S.roster);
    w.close();

    const again = await loadPage(origin, saved);
    ok('重读后战绩一致', again.w.S.wins === savedObj.wins && again.w.S.losses === savedObj.losses);
    ok('重读后 roster 逐字一致（50 人/名次/评分）', JSON.stringify(again.w.S.roster) === rosterJson);
    ok('重读后 story 一致（prologueDone 保持 true）', again.w.S.story.prologueDone === true && JSON.stringify(again.w.S.story) === JSON.stringify(JSON.parse(saved).story));
    // 注：重读时阶段补结算会把生涯推进到阶段 4，追溯判定可合法新增 stage_4，故只断言「存档已有成就逐条逐字保留」
    ok('重读后成就保留（存档已有成就逐条保留）',
      Object.keys(savedObj.achievements || {}).every((id) => JSON.stringify((again.w.S.achievements || {})[id]) === JSON.stringify(savedObj.achievements[id])),
      `${Object.keys(again.w.S.achievements || {}).length} vs ${Object.keys(savedObj.achievements || {}).length}`);
    ok('重读无脚本错误', (again.w.__errs || []).length === 0, again.w.__errs);

    // 自动战斗一局可结算（重读页上跑：先断言 AI tick 真在推进，再把对手 HP 清零走 finishBattle 的 KO 结算路径）
    const recordBeforeAuto = again.w.S.wins + again.w.S.losses;
    again.w.eval("startBattle('auto');");
    await sleep(1200);
    ok('自动战斗 tick 在推进（tickCount ≥ 1 且战斗时钟已走）',
      again.w.eval('B && B.mode') === 'auto' && again.w.eval('B.tickCount') >= 1 && again.w.eval('B.time') > 0,
      again.w.eval('B && (B.tickCount + "/" + B.time)'));
    again.w.eval('B.foe.hp = 0; finishBattle();');
    await sleep(2300);
    ok('自动战斗可结算（phase=over / 结果为胜 / 战绩 +1 / 结算窗弹出）',
      again.w.eval('B.phase') === 'over' && again.w.eval('B.result && B.result.win') === true &&
      again.w.S.wins + again.w.S.losses === recordBeforeAuto + 1 &&
      again.w.document.getElementById('settleModal').classList.contains('open'),
      `${recordBeforeAuto}->${again.w.S.wins + again.w.S.losses}`);
    again.w.close();

    // Phase 9 老存档迁移：删掉 achievements/koWins 字段的存档 → 自动补齐 + 追溯解锁（只汇总一条日志）
    const oldSeedObj = JSON.parse(saved);
    delete oldSeedObj.achievements;
    delete oldSeedObj.koWins;
    oldSeedObj.wins = 25; oldSeedObj.rank = 8; oldSeedObj.story.affinity.manager = 90;
    const oldLoad = await loadPage(origin, JSON.stringify(oldSeedObj));
    ok('老存档迁移（achievements 自动补对象 / koWins 从 0 起算）',
      !!oldLoad.w.S.achievements && typeof oldLoad.w.S.achievements === 'object' && oldLoad.w.S.koWins === 0,
      oldLoad.w.S.koWins);
    ok('老存档追溯解锁（wins_25/rank_10/affinity_90 已补登记 / 无 KO 计数则 first_ko 不补）',
      !!oldLoad.w.S.achievements.wins_25 && !!oldLoad.w.S.achievements.rank_10 && !!oldLoad.w.S.achievements.affinity_90 && !oldLoad.w.S.achievements.first_ko,
      Object.keys(oldLoad.w.S.achievements || {}));
    ok('老存档追溯只汇总一条日志（成就追溯日志恰 1 条）',
      oldLoad.w.S.logs.filter((l) => l.msg.indexOf('成就追溯：') === 0).length === 1,
      oldLoad.w.S.logs.slice(0, 3).map((l) => l.msg));
    oldLoad.w.close();

    // Phase 9 多存档槽：老档自动成槽 1 → 切空槽 2 得新档 → 切回槽 1 无损 → 复制到槽 3 并切过去 → meta 重读保持
    const META_KEY = 'boxing-phase1-save-v1-meta';
    const SLOT2_KEY = 'boxing-phase1-save-v1-slot2';
    const SLOT3_KEY = 'boxing-phase1-save-v1-slot3';
    const slotPage = await loadPage(origin, saved);
    ok('多存档槽：老存档自动成为槽 1（无 meta 时 currentSlot=1 且胜场/排名无损）',
      slotPage.w.eval('currentSlot()') === 1 && slotPage.w.S.wins === savedObj.wins && slotPage.w.S.rank === savedObj.rank,
      `${slotPage.w.eval('currentSlot()')}/${slotPage.w.S.wins}/${slotPage.w.S.rank}`);
    slotPage.w.eval('S.money = 7777; S.wins = 33; save();');
    slotPage.w.eval('switchSlot(2)');
    ok('多存档槽：切到空槽 2 得到新档（Day 1 / 0 胜 / ¥100 / 当前槽=2 / meta 已落盘）',
      slotPage.w.S.day === 1 && slotPage.w.S.wins === 0 && slotPage.w.S.money === 100 &&
      slotPage.w.eval('currentSlot()') === 2 && JSON.parse(slotPage.w.localStorage.getItem(META_KEY)).current === 2,
      `${slotPage.w.S.day}/${slotPage.w.S.wins}/${slotPage.w.S.money}`);
    slotPage.w.eval('S.story.prologueDone = true; S.money = 2222; S.day = 15; save();');
    slotPage.w.eval('switchSlot(1)');
    const slot2Stash = JSON.parse(slotPage.w.localStorage.getItem(SLOT2_KEY) || 'null');
    ok('多存档槽：切回槽 1 进度逐项一致（33 胜 / ¥7777 / 排名不变），槽 2 暂存完好（Day 15 / ¥2222）',
      slotPage.w.S.wins === 33 && slotPage.w.S.money === 7777 && slotPage.w.S.rank === savedObj.rank &&
      slotPage.w.eval('currentSlot()') === 1 && !!slot2Stash && slot2Stash.money === 2222 && slot2Stash.day === 15,
      `${slotPage.w.S.wins}/${slotPage.w.S.money}/${slotPage.w.S.rank}`);
    slotPage.w.eval('copyCurrentToSlot(3)');
    const slot3Stash = JSON.parse(slotPage.w.localStorage.getItem(SLOT3_KEY) || 'null');
    ok('多存档槽：复制当前进度到槽 3（暂存内容 = 33 胜 / ¥7777）',
      !!slot3Stash && slot3Stash.wins === 33 && slot3Stash.money === 7777, slot3Stash && `${slot3Stash.wins}/${slot3Stash.money}`);
    slotPage.w.eval('switchSlot(3)');
    ok('多存档槽：切到槽 3 内容一致（33 胜 / ¥7777 / 当前槽=3）',
      slotPage.w.S.wins === 33 && slotPage.w.S.money === 7777 && slotPage.w.eval('currentSlot()') === 3,
      `${slotPage.w.S.wins}/${slotPage.w.S.money}`);
    const snapSave = slotPage.w.localStorage.getItem(SAVE_KEY);
    const snapExtra = {
      [META_KEY]: slotPage.w.localStorage.getItem(META_KEY),
      'boxing-phase1-save-v1-slot1': slotPage.w.localStorage.getItem('boxing-phase1-save-v1-slot1'),
      [SLOT2_KEY]: slotPage.w.localStorage.getItem(SLOT2_KEY),
    };
    slotPage.w.close();
    const reSlot = await loadPage(origin, snapSave, snapExtra);
    ok('多存档槽：meta 当前槽重读后保持（重载后仍为槽 3 且进度一致）',
      reSlot.w.eval('currentSlot()') === 3 && reSlot.w.S.wins === 33 && reSlot.w.S.money === 7777,
      `${reSlot.w.eval('currentSlot()')}/${reSlot.w.S.wins}/${reSlot.w.S.money}`);
    reSlot.w.close();

    // Phase 9 多存档槽 × 测试档：槽 2 下开测试档 → 切槽被锁 → 恢复主存档回到槽 2 原进度且当前槽仍为 2
    const testSlot = await loadPage(origin, snapSave, snapExtra);
    testSlot.w.eval('switchSlot(2)');
    testSlot.w.eval('S.money = 4321; save();'); // 槽 2 造一个可辨认的进度（覆盖前面 Day15/¥2222 的暂存）
    testSlot.w.eval('startTestSave()');
    const testLocked = testSlot.w.eval('slotsLocked()');
    testSlot.w.eval('switchSlot(1)'); // 应被守卫拒绝，仍留在测试档
    const stillTest = testSlot.w.S.testMode === true && testSlot.w.eval('currentSlot()') === 2;
    testSlot.w.eval('restoreMainSave()');
    ok('多存档槽×测试档（开测试档备份当前槽 / 测试期间切槽被锁 / 恢复后回到槽 2 的 ¥4321 且当前槽仍为 2）',
      testLocked === true && stillTest && testSlot.w.S.testMode === false &&
      testSlot.w.S.money === 4321 && testSlot.w.eval('currentSlot()') === 2 && !testSlot.w.localStorage.getItem('boxing-phase1-save-backup-v1'),
      `${testLocked}/${stillTest}/${testSlot.w.S.money}/${testSlot.w.eval('currentSlot()')}`);
    testSlot.w.close();
  } finally {
    srv.close();
  }
}

const args = process.argv.slice(2);
await suite('工程版', root);
await suite('dist 单文件版', path.join(root, 'dist'));
const oi = args.indexOf('--original');
if (oi >= 0 && args[oi + 1]) await suite('对照·原始版', path.resolve(args[oi + 1]));

console.log(`\n总计：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
