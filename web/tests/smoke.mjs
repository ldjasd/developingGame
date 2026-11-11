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

    // 新档初始化
    ok('全局状态 S 已建立', !!w.S && typeof w.S === 'object');
    ok('新档玩家排名 = 50', w.S.rank === 50, w.S.rank);
    ok('新档 story 已初始化且未走序章', !!w.S.story && w.S.story.prologueDone === false, w.S.story && w.S.story.prologueDone);
    ok('新档 tutorial 初始化（practiceDone=false / tips 空数组 / goalDone=false / trainings=0）',
      !!w.S.tutorial && w.S.tutorial.practiceDone === false && Array.isArray(w.S.tutorial.tips) && w.S.tutorial.tips.length === 0 &&
      w.S.tutorial.goalDone === false && w.S.tutorial.trainings === 0,
      w.S.tutorial && JSON.stringify(w.S.tutorial));
    ok('新档成就初始化（achievements 为空对象 / koWins=0 / ACHIEVEMENTS ≥20 / checkAchievements 为函数）',
      !!w.S.achievements && typeof w.S.achievements === 'object' && !Array.isArray(w.S.achievements) && Object.keys(w.S.achievements).length === 0 &&
      w.S.koWins === 0 && w.eval('ACHIEVEMENTS.length') >= 20 && w.eval('typeof checkAchievements') === 'function');
    ok('数据全局就位（ROSTER_DEF 50 / TRAININGS 13 / SHOP_GEAR 21 / STORY_EVENTS 含 ev_stage1）',
      w.eval('ROSTER_DEF.length') === 50 && w.eval('TRAININGS.length') === 13 && w.eval('SHOP_GEAR.length') === 21 && !!w.eval('STORY_EVENTS.ev_stage1'));
    ok('逻辑全局就位（makeFoe / simulateBattle / settleNow / save 均为函数）',
      ['makeFoe', 'simulateBattle', 'settleNow', 'save'].every((f) => w.eval(`typeof ${f}`) === 'function'));
    ok('短款服装选项就位（服装 11 项 / 切到短款背心后立绘 src 指向 outfit_short_vest.webp）',
      w.eval('Object.keys(APPEARANCE.outfit).length') === 11 &&
      w.eval("setAppearance('outfit','short_vest'); portraitSrc()").includes('outfit_short_vest.webp') &&
      w.eval("setAppearance('outfit','short_training'); portraitSrc()").includes('outfit_short_training.webp') &&
      w.eval("setAppearance('outfit','short_cami'); portraitSrc()").includes('outfit_short_cami.webp') &&
      w.eval("setAppearance('outfit','wide_strap'); portraitSrc()").includes('outfit_wide_strap.webp') &&
      w.eval("setAppearance('outfit','halter'); portraitSrc()").includes('outfit_halter.webp'));

    // 【架构批改动】启动先到标题屏（不再自动进日常/自动开序章）：先断言标题屏与置灰规则，再点「新的开始」进游戏并跳过序章，
    // 让后续全部断言回到与旧版相同的「已进主界面」前提，行为等价。
    ok('标题屏出现（titleView 显示 / 日常隐藏 / 游戏名大字就位 / 批次 E：常隐 titlePortrait 不再预拉立绘）',
      w.document.getElementById('titleView').style.display === 'block' &&
      w.document.getElementById('dailyView').style.display === 'none' &&
      (w.document.querySelector('.game-title').textContent || '').includes('心跳在左，拳头在右') &&
      !w.document.getElementById('titlePortrait').getAttribute('src'),
      w.document.getElementById('titleView').style.display + '/' + w.document.getElementById('dailyView').style.display);
    ok('无存档时「继续游戏」置灰（新档 btnTitleContinue disabled / 读取存档·画廊·设置入口可用）',
      w.document.getElementById('btnTitleContinue').disabled === true &&
      !w.document.getElementById('btnTitleSaves').disabled && !w.document.getElementById('btnTitleGallery').disabled && !w.document.getElementById('btnTitleSettings').disabled);
    w.document.getElementById('btnTitleNew').click();
    await sleep(30);
    ok('点「新的开始」进入游戏（日常显示 / 标题隐藏 / 序章弹窗打开）',
      w.document.getElementById('dailyView').style.display === 'block' &&
      w.document.getElementById('titleView').style.display === 'none' &&
      w.document.getElementById('storyModal').classList.contains('open'));
    if (w.document.getElementById('storyModal').classList.contains('open')) w.document.getElementById('btnStorySkip').click();
    // 【新手期重构】序章后不再自动弹玩法说明墙：改为练习赛邀请（storyModal 内的梢姐邀请页）。断言邀请形态后选「先自己逛逛」回到自由操作前提（与旧流程关掉说明墙等价）。
    ok('序章后是练习赛邀请而非说明墙（helpModal 未打开 / storyTitle 含「练习赛」/ 邀请按钮就位）',
      !w.document.getElementById('helpModal').classList.contains('open') &&
      (w.document.getElementById('storyTitle').textContent || '').indexOf('练习赛') >= 0 &&
      [...w.document.querySelectorAll('#storyChoices button')].some((b) => (b.textContent || '').indexOf('上台') >= 0),
      w.document.getElementById('storyTitle').textContent);
    ok('据点首周目标行与练习赛按钮已出线（hubGoal 可见且含「首周目标」/ btnPractice 显示）',
      w.document.getElementById('hubGoal').hidden === false &&
      (w.document.getElementById('hubGoal').textContent || '').indexOf('首周目标') >= 0 &&
      w.document.getElementById('btnPractice').style.display !== 'none',
      w.document.getElementById('hubGoal').textContent);
    {
      const deferBtn = [...w.document.querySelectorAll('#storyChoices button')].find((b) => (b.textContent || '').indexOf('先自己逛逛') >= 0);
      if (deferBtn) deferBtn.click();
    }
    if (w.document.getElementById('helpModal').classList.contains('open')) w.document.getElementById('btnCloseHelp').click();
    await sleep(50);
    if (jsdomErrors.length) console.log('  (jsdom 诊断信息，不计失败)', jsdomErrors.slice(0, 3));

    // 设计款式图鉴（展示型收集）：图鉴条目总量 ≥100、6 分组齐全、抽查 3 个条目图片可加载、状态页画廊渲染卡片数一致
    const galCountByCat = w.eval('DEX_GALLERY_CATS.map(function (c) { return DEX_GALLERY.filter(function (e) { return e[0] === c[0]; }).length; })');
    ok('设计款式图鉴条目总量 ≥100（商店 21 款 + 设计池精选 104 款 = 125）',
      w.eval('DEX_GALLERY.length') >= 100 && w.eval('SHOP_GEAR.length + DEX_GALLERY.length') >= 100, w.eval('DEX_GALLERY.length'));
    ok('设计款式图鉴 6 分组齐全且每组非空、条目均为中文名（拳套/护头/战靴/护腕/战袍/护齿）',
      w.eval('DEX_GALLERY_CATS.length') === 6 && galCountByCat.every((n) => n > 0) &&
      w.eval('DEX_GALLERY.every(function (e) { return e[1] && /[一-鿿]/.test(e[1]); })'), galCountByCat);
    const galSamples = w.eval("[DEX_GALLERY[0][2], DEX_GALLERY.filter(function (e) { return e[0] === 'robe'; })[0][2], DEX_GALLERY.filter(function (e) { return e[0] === 'guard'; })[0][2]]");
    let galFetchOk = galSamples.length === 3;
    for (const rel of galSamples) { const r = await fetch(origin + '/' + rel); if (!r.ok) galFetchOk = false; }
    ok('设计款式图鉴抽查 3 个条目图片可加载（拳套/战袍/护齿各一，路径正确）', galFetchOk, galSamples);
    // 【架构批改动】设计款式图鉴已从状态页迁入画廊屏「设计款式」页签（唯一渲染处），断言改走 openGallery('design')，行为等价（同一批卡片、同源数据）
    w.eval("openGallery('design');");
    ok('画廊设计款式页签渲染出设计款式图鉴（卡片数 = 条目数）',
      w.document.querySelectorAll('#dexGallery .dex-gal-item').length === w.eval('DEX_GALLERY.length'),
      w.document.querySelectorAll('#dexGallery .dex-gal-item').length);

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

    // 【架构批改动】标题流程（启动→标题→新的开始→序章跳过）已前置到页面加载后先行走完（见 suite 开头），此处只保留序章结果断言
    ok('跳过序章后 prologueDone=true', w.S.story.prologueDone === true);

    // 对手生成：来自角色池且在 ±5 名次窗口内
    const foe = w.eval('makeFoe()');
    const poolNames = new Set(roster.map((m) => m.name));
    ok('makeFoe 生成对手', !!foe && !!foe.name, foe && foe.name);
    ok('对手是角色池真人', !!foe && poolNames.has(foe.name), foe && foe.name);
    ok('对手名次在玩家 ±5 窗口内', !!foe && Math.abs(foe.rank - w.S.rank) <= 5, foe && foe.rank);

    // D1 对手台词：前 15 名专属台词齐全（赛前 2 条 + 对手视角胜/负各 1 条）＋通用兜底池
    // 注：整表校验在窗口内一次算完只回结果——逐 key 跨 realm 多次 eval 取全局表在 jsdom 下会间歇报未定义（已实测），故不用逐项 w.eval
    ok('D1 台词表 15 人齐全（每人赛前 2 条 + 胜/负台词各 1 条非空）',
      w.eval("(function () { var ks = ['opp_world_champion','opp_crimson','opp_champion_domestic','opp_legend','opp_asia','opp_saint','opp_amazon','opp_ice','opp_counter','opp_europe','opp_genius','opp_africa','opp_north','opp_muscle','opp_korea_style']; " +
        "if (Object.keys(FOE_LINES).length !== 15) return 'count=' + Object.keys(FOE_LINES).length; " +
        "for (var i = 0; i < ks.length; i++) { var e = FOE_LINES[ks[i]]; if (!e) return 'missing:' + ks[i]; " +
        "if (!e.pre || e.pre.length !== 2) return 'pre:' + ks[i]; " +
        "if (typeof e.win !== 'string' || !e.win.length) return 'win:' + ks[i]; " +
        "if (typeof e.lose !== 'string' || !e.lose.length) return 'lose:' + ks[i]; } return 'ok'; })()") === 'ok');
    ok('D1 兜底池与取词函数（无专属对手走通用池 / 专属台词可取到）',
      w.eval("(function () { if (FOE_LINES_GENERIC.pre.length < 3 || FOE_LINES_GENERIC.win.length < 1 || FOE_LINES_GENERIC.lose.length < 1) return 'generic-short'; " +
        "var fb = foeLine('opp_rookie', 'pre'); if (!fb || FOE_LINES_GENERIC.pre.indexOf(fb) < 0) return 'fallback-not-generic'; " +
        "var fw = foeLine('opp_rookie', 'win'); if (!fw || FOE_LINES_GENERIC.win.indexOf(fw) < 0) return 'fallback-win'; " +
        "if (foeLine('opp_saint', 'win') !== '阿门。你的拳头里，少了点信念呢。') return 'saint-win'; " +
        "if (foeLine('opp_counter', 'lose').indexOf('沈墨凛') < 0) return 'counter-lose'; " +
        "var sp = foeLine('opp_saint', 'pre'); if (!sp || FOE_LINES.opp_saint.pre.indexOf(sp) < 0) return 'saint-pre'; return 'ok'; })()") === 'ok');

    // D1 赛前弹窗渲染：打开模式弹窗后台词元素非空（专属或兜底，必不留白）
    w.eval('openModeModal();');
    ok('D1 赛前弹窗显示对手台词（modeFoeLine 非空且带「」）',
      (w.document.getElementById('modeFoeLine').textContent || '').indexOf('「') > 0,
      w.document.getElementById('modeFoeLine').textContent);
    w.document.getElementById('modeModal').classList.remove('open');

    // 新手期重构：练习赛全链（startPractice → 模式弹窗 → 准备层 → 开战 → 强制终局 → 专属轻量结算）
    w.eval('startPractice();');
    ok('练习赛模式弹窗（对手为林小葵 opp_rookie / 标题为练习赛 / 模拟按钮隐藏 / practicePending 仍成立）',
      w.eval('pendingFoe && pendingFoe.key') === 'opp_rookie' && w.eval('pendingFoe.practice') === true &&
      (w.document.getElementById('modeTitle').textContent || '').indexOf('练习赛') >= 0 &&
      w.document.querySelector('#modeModal [data-mode="sim"]').style.display === 'none' &&
      w.eval('practicePending()') === true,
      w.eval('pendingFoe && pendingFoe.key'));
    w.document.querySelector('#modeModal [data-mode="auto"]').click();
    ok('练习赛准备层（battleReady 显示 / brFoeMeta 含【练习赛】标记）',
      w.document.getElementById('battleReady').hidden === false &&
      (w.document.getElementById('brFoeMeta').innerHTML || '').indexOf('练习赛') >= 0,
      w.document.getElementById('brFoeMeta').innerHTML);
    {
      const preMoney = w.S.money, preInj = w.S.injury, preStam = w.S.stamina, preAp = w.S.ap;
      w.document.getElementById('btnBattleStart').click();
      ok('练习赛开战（B.practice=true / 对手为陪练版 / lastMatchDay 未写）',
        w.eval('B && B.practice') === true && w.eval('B.foe.key') === 'opp_rookie' && w.S.lastMatchDay === 0,
        w.eval('B && String(B.practice)'));
      w.eval("B.me.used.straight = 5; B.foe.hp = 0; finishBattle();");
      ok('练习赛结算不计账（战绩 0 / 金钱·伤病·体力·AP 全不变 / 名鉴未点亮 / 粉丝事件门禁仍锁：storyGateOk(daily_15)=false）',
        w.S.wins + w.S.losses === 0 && w.S.money === preMoney && w.S.injury === preInj && w.S.stamina === preStam && w.S.ap === preAp &&
        w.S.facedFoes.length === 0 && w.eval("storyGateOk('daily_15')") === false,
        `${w.S.wins}/${w.S.losses}/${w.S.money}/${w.S.injury}/${w.S.stamina}`);
      ok('练习赛收益入账（practiceDone=true / 直拳经验 +10 / 结算标题含练习赛）',
        w.S.tutorial.practiceDone === true && w.S.punchExp.straight === 10 &&
        (w.document.getElementById('settleTitle').textContent || '').indexOf('练习赛') >= 0,
        `${w.S.punchExp.straight}/${w.document.getElementById('settleTitle').textContent}`);
      await sleep(2300);
      ok('练习赛结算窗弹出', w.document.getElementById('settleModal').classList.contains('open'));
      w.document.getElementById('btnSettleOk').click();
      await sleep(30);
    }
    // 新手期重构：情境提示（首次进训练屏弹一句话并记档，点「知道了」收起）
    w.eval("gotoScene('train');");
    ok('情境提示·训练（tipBar 显示且文案含「训练」要点 / tips 已记 train）',
      w.document.getElementById('tipBar').hidden === false &&
      (w.document.getElementById('tipText').textContent || '').indexOf('凑满 5 点') >= 0 &&
      w.S.tutorial.tips.indexOf('train') >= 0,
      w.document.getElementById('tipText').textContent);
    w.document.getElementById('btnTipOk').click();
    w.eval("gotoScene('daily');");
    ok('情境提示已收起（tipBar hidden）', w.document.getElementById('tipBar').hidden === true);

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
    // B3 赛前演出：VS 横幅元素存在、开局已填充双方名字并进入演出态（ring.intro + banner.show）
    ok('B3 开场演出（VS 横幅存在 / 双方名字已填 / 横幅 show 且擂台 intro 演出中）',
      !!w.document.getElementById('vsBanner') &&
      (w.document.getElementById('vsbMe').textContent || '').length > 0 &&
      (w.document.getElementById('vsbFoe').textContent || '') === w.eval('B.foe.name') &&
      w.document.getElementById('vsBanner').classList.contains('show') &&
      w.document.getElementById('ring').classList.contains('intro'),
      w.document.getElementById('vsbFoe').textContent);
    // 姿势帧（A2 第二步）：开局抱架 → 出拳切对应拳种姿势 → 格挡/受击切对应姿势 → 对手受击回弹类 → 期满回抱架
    const meImgSrc = () => w.document.getElementById('figMeImg').getAttribute('src') || '';
    ok('姿势帧就位（POSES 10 张齐全 / setMePose 与 POSE_TIMING 就位 / 开局主角为抱架图）',
      w.eval('Object.keys(POSES).length') === 10 && w.eval('typeof setMePose') === 'function' && w.eval('typeof POSE_TIMING') === 'object' &&
      meImgSrc().includes('assets/pose/guard.webp'),
      meImgSrc());
    w.eval("B.man.mX = 40; B.man.fX = 50; B.man.foePunchT = 99; B.me.stam = 100; throwPunch('straight');");
    ok('出拳切直拳姿势（throwPunch 后 figMeImg 指向 pose/straight.webp）',
      meImgSrc().includes('assets/pose/straight.webp'), meImgSrc());
    w.eval("B.buff.wall = 5; dealDamage(B.foe, B.me, 'straight', 0.5, false, false); B.buff.wall = 0;");
    ok('我方格挡切格挡姿势（铁壁中挨拳 → pose/block.webp）',
      meImgSrc().includes('assets/pose/block.webp'), meImgSrc());
    w.eval("dealDamage(B.foe, B.me, 'jab', 0.4, false, false);");
    ok('我方受击切受击姿势（被命中 → pose/hit.webp）',
      meImgSrc().includes('assets/pose/hit.webp'), meImgSrc());
    w.eval("B.foe.hp = B.foe.hpMax; dealDamage(B.me, B.foe, 'straight', 0.4, true, false);");
    ok('对手受击强化（命中后 figFoe 带 recoiling 后仰回弹类）',
      w.document.getElementById('figFoe').classList.contains('recoiling'),
      w.document.getElementById('figFoe').className);
    await sleep(500);
    ok('姿势期满自动回抱架（受击姿势保持期过后回到 pose/guard.webp）',
      meImgSrc().includes('assets/pose/guard.webp'), meImgSrc());

    // 修复批次 B（M5/M2/m3）：对手整场人格 + 手动模式搂抱入口与效果 + 赛前打法展示
    ok('批次B 对手人格（带 persona / 开局战术=人格 base / foePersonaFor 确定性派生 / 防反型 base=counter）',
      !!w.eval('B.foe.persona') && w.eval('B.foe.tactic') === w.eval('B.foe.persona.base') &&
      w.eval("foePersonaFor('power','smokeA').base") === w.eval("foePersonaFor('power','smokeA').base") &&
      w.eval("foePersonaFor('guardcounter','smokeB').base") === 'counter');
    w.eval("B.me.stam = 40; B.comboMe = 3; B.comboFoe = 2; useClinch();");
    ok('批次B 手动搂抱（体力 40→46 / 冷却中 / 缠抱停战 holdUntil>time / 双方连击清零 / 手动+触屏按钮齐全）', // 回体期望随批次 G3-b 代价组调整更新：stam 40 落 [35,60) 档 +6（旧口径 <50 一律 +20→60）；机制断言（回体/冷却/停战/清连击）不变
      w.eval('B.me.stam') === 46 && w.eval('B.cd.clinch > 0') === true && w.eval('B.holdUntil > B.time') === true &&
      w.eval('B.comboMe') === 0 && w.eval('B.comboFoe') === 0 &&
      !!w.document.getElementById('btnManualClinch') && !!w.document.getElementById('btnClinchT'));
    w.eval("pendingFoe = B.foe; openModeModal(); openBattleReady('manual');"); // 走真实赛前路径填充两处对手卡（直接 startBattle 时 pendingFoe 为空、填充层会提前返回）
    ok('批次B 赛前打法展示（对手卡 modeFoeInfo 与准备层 brFoeMeta 含人格「打法：」文本）',
      (w.document.getElementById('modeFoeInfo').textContent || '').indexOf('打法：') >= 0 &&
      (w.document.getElementById('brFoeMeta').innerHTML || '').indexOf('打法：') >= 0);
    w.eval("pendingFoe = null; document.getElementById('modeModal').classList.remove('open'); document.getElementById('battleReady').hidden = true;");

    // 批次 G7（T9）：人格变招门槛 ±30→±20——点数差 25（旧门槛下不触发）应触发 comeback 转强攻；差 15 不应触发
    w.eval("B.foe.persona = { base: 'points', adjust: 'comeback', comboWhen: 'press', wallHp: 0.35, clinchFan: true, name: '游击型' }; B.foe.tactic = 'points'; B.me.dmg = 125; B.me.hits = 0; B.foe.dmg = 100; B.foe.hits = 0; B.phase = 'break'; endBreak();");
    ok('G7 人格变招门槛 ±20（点数差 25 时 comeback 人格回合间转强攻）',
      w.eval('B.foe.tactic') === 'attack', w.eval('B.foe.tactic'));
    w.eval("B.foe.tactic = 'points'; B.me.dmg = 115; B.phase = 'break'; endBreak();");
    ok('G7 人格变招门槛下限（点数差 15 时不切换、保持 base 战术）',
      w.eval('B.foe.tactic') === 'points', w.eval('B.foe.tactic'));

    w.eval("clearInterval(battleTimer); B = null; document.getElementById('dailyView').style.display = ''; document.getElementById('battleView').style.display = '';");

    // 打磨批次 4 · B2：出拳残影 / 命中点闪光 / 连击计数演出（只验演出元素，判定数值不查）
    w.eval("startBattle('auto'); B.foe.hp = B.foe.hpMax; B.me.stam = 100;");
    w.eval("spawnAfterimage(document.getElementById('figMe'));");
    ok('B2 出拳残影（spawnAfterimage 后擂台内出现 .fig-ghost 残影元素）',
      w.document.querySelectorAll('#ring .fig-ghost').length >= 1,
      w.document.querySelectorAll('#ring .fig-ghost').length);
    w.eval("dealDamage(B.me, B.foe, 'jab', 0.2, true, false);");
    ok('B2 命中点闪光（命中后防守方接触点出现 .hit-flash 星形闪光）',
      w.document.querySelectorAll('#ring .hit-flash').length >= 1,
      w.document.querySelectorAll('#ring .hit-flash').length);
    w.eval("dealDamage(B.me, B.foe, 'jab', 0.2, true, false);");
    const comboPopEl = w.document.querySelector('#figFoe .combo-pop');
    ok('B2 连击计数演出（连击达 2 时飘字旁出现「2 连击」元素且字号已放大）',
      !!comboPopEl && comboPopEl.textContent.indexOf('2 连击') >= 0 && parseFloat(comboPopEl.style.fontSize) > 13,
      comboPopEl && (comboPopEl.textContent + '/' + comboPopEl.style.fontSize));
    w.eval("clearInterval(battleTimer); B = null; document.getElementById('dailyView').style.display = ''; document.getElementById('battleView').style.display = '';");

    // 模拟一场比赛可结算
    const moneyBeforeSim = w.S.money;
    w.eval('simulateBattle();');
    ok('模拟结算一致性（奖金到账 / lastMatchDay=今日 / B 为 sim 且已结束）',
      w.S.money > moneyBeforeSim && w.S.lastMatchDay === w.S.day && w.eval('B.mode') === 'sim' && w.eval('B.phase') === 'over',
      `${moneyBeforeSim}->${w.S.money}`);
    await sleep(600);
    ok('模拟比赛后结算窗弹出', w.document.getElementById('settleModal').classList.contains('open'));
    ok('D1 结算窗显示对手赛后台词（settleFoeLine 非空且带「」）',
      (w.document.getElementById('settleFoeLine').textContent || '').indexOf('「') > 0,
      w.document.getElementById('settleFoeLine').textContent);
    ok('战绩已记账（胜+负 = 1）', w.S.wins + w.S.losses === 1, `${w.S.wins}/${w.S.losses}`);
    ok('D3 已交手记录（模拟结算后 facedFoes 含本场对手 key、仅此 1 人）',
      Array.isArray(w.S.facedFoes) && w.S.facedFoes.length === 1 && w.S.facedFoes[0] === w.eval('B.foe.key'),
      w.S.facedFoes);

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
    // 打磨批次 3：D3 成就徽章（类别徽章渲染、未解锁灰显变体存在）
    ok('D3 成就徽章（四类徽章均渲染 / 未解锁条目带 off 灰显徽章）',
      !!w.document.querySelector('#stAchievements .ach-badge.cat-battle') &&
      !!w.document.querySelector('#stAchievements .ach-badge.cat-career') &&
      !!w.document.querySelector('#stAchievements .ach-badge.cat-gear') &&
      !!w.document.querySelector('#stAchievements .ach-badge.cat-story') &&
      !!w.document.querySelector('#stAchievements .ach-badge.off'),
      w.document.querySelectorAll('#stAchievements .ach-badge').length);
    // 打磨批次 3：D3 对手名鉴（52 人）＋ D4 回忆（与 seenEvents 一致、回放只读）
    w.eval("S.story.seenEvents = ['ev_stage1', 'ev_firstwin']; S.facedFoes = ['opp_rookie']; renderStatus();");
    ok('D3 对手名鉴渲染数 = 52（50 对手＋前辈＋经纪人 / 已交手 1 人点亮、其余 49 人未交手半透明带标）',
      w.document.querySelectorAll('#stFoeDex .foe-dex-item').length === 52 &&
      w.document.querySelectorAll('#stFoeDex .foe-dex-item.unmet').length === 49 &&
      (w.document.getElementById('foeDexCount').textContent || '').indexOf('1 / 50') >= 0,
      w.document.querySelectorAll('#stFoeDex .foe-dex-item').length + '/' + w.document.querySelectorAll('#stFoeDex .foe-dex-item.unmet').length);
    ok('D4 回忆列表与 seenEvents 一致（2 段事件各带一个重看按钮）',
      w.document.querySelectorAll('#stMemories [data-replay]').length === 2 &&
      !!w.document.querySelector('#stMemories [data-replay="ev_stage1"]') &&
      !!w.document.querySelector('#stMemories [data-replay="ev_firstwin"]'),
      w.document.querySelectorAll('#stMemories [data-replay]').length);
    const replaySnap = () => w.eval("JSON.stringify({ money: S.money, wins: S.wins, losses: S.losses, hp: S.attrs.power, aff: S.story.affinity, seen: S.story.seenEvents, achN: Object.keys(S.achievements).length, faced: S.facedFoes })");
    const replayBefore = replaySnap();
    w.eval("openStoryReplay('ev_stage1');");
    const replayOpened = w.document.getElementById('storyModal').classList.contains('open') &&
      (w.document.getElementById('storyTitle').textContent || '').indexOf('回忆') >= 0 &&
      (w.document.getElementById('storyText').textContent || '').length > 0;
    for (let ri = 0; ri < 6 && w.document.getElementById('storyModal').classList.contains('open'); ri++) {
      const rb = w.document.querySelector('#storyChoices button');
      if (!rb) break;
      rb.click();
    }
    ok('D4 剧情回放只读（可打开翻页并关闭 / 金钱·战绩·属性·好感·seenEvents·成就·已交手全程不变）',
      replayOpened && !w.document.getElementById('storyModal').classList.contains('open') && replaySnap() === replayBefore,
      replaySnap());
    w.eval('closeStatus();');

    // 打磨批次 4 · D2：日常事件池扩充至 15 段（原 3 段），触发函数统一走 triggerDailyEvent；修复批次 C 再 +4 段可重复日常 → 19 段 / 事件总数 46
    ok('D2 日常事件池扩充（DAILY_EVENT_IDS = 19 段且定义齐全 / 事件总数 ≥46 / triggerDailyEvent 为函数）',
      w.eval('DAILY_EVENT_IDS.length') === 19 &&
      w.eval('DAILY_EVENT_IDS.every(function (id) { return !!STORY_EVENTS[id]; })') &&
      w.eval('Object.keys(STORY_EVENTS).length') >= 46 &&
      w.eval('typeof triggerDailyEvent') === 'function',
      w.eval('Object.keys(STORY_EVENTS).length'));
    const drainStory = async () => {
      for (let i = 0; i < 40 && w.document.getElementById('storyModal').classList.contains('open'); i++) {
        const btns = w.document.querySelectorAll('#storyChoices button');
        if (!btns.length) break;
        btns[0].click();
        await sleep(10);
      }
    };
    const flipToChoices = async () => {
      for (let i = 0; i < 6; i++) {
        const btns = w.document.querySelectorAll('#storyChoices button');
        if (btns.length >= 2) return true;
        if (!btns.length) return false;
        btns[0].click();
        await sleep(10);
      }
      return w.document.querySelectorAll('#storyChoices button').length >= 2;
    };
    // 触发通道：概率拉满时必抽中一段未看日常并弹出（抽中池中第一段 daily_1）
    w.eval("B = null; storyQueue.length = 0; ['settleModal','stageModal','achModal','confirmModal'].forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.remove('open'); });");
    w.eval("var _or = Math.random; Math.random = function () { return 0; }; window.__trigRet = triggerDailyEvent(0.99); Math.random = _or;");
    ok('D2 日常触发通道（triggerDailyEvent 必触发时弹出 daily_1 并记入 seenEvents）',
      w.eval('window.__trigRet') === true &&
      w.document.getElementById('storyModal').classList.contains('open') &&
      w.S.story.seenEvents.indexOf('daily_1') >= 0,
      w.eval('window.__trigRet') + '/' + w.S.story.seenEvents.join(','));
    await drainStory();
    // 事件一：daily_4「新沙袋」完整走完——翻页到选项、选第一项、效果结算（力量 +1 / 体力 −5）
    const d4Power = w.S.attrs.power, d4Stam = w.S.stamina;
    w.eval("openStoryEvent('daily_4');");
    const d4Choices = await flipToChoices();
    if (d4Choices) w.document.querySelectorAll('#storyChoices button')[0].click();
    ok('D2 日常事件可完整触发结算·一（daily_4 选项结算：力量 +1 / 体力 −5 / 已记 seenEvents / 结算文案含「力量 +1」）',
      d4Choices && w.S.attrs.power === d4Power + 1 &&
      Math.round(w.S.stamina) === Math.round(Math.max(0, Math.min(100, d4Stam - 5))) &&
      w.S.story.seenEvents.indexOf('daily_4') >= 0 &&
      (w.document.getElementById('storyFx').textContent || '').indexOf('力量 +1') >= 0,
      `${d4Power}->${w.S.attrs.power} / ${d4Stam}->${w.S.stamina}`);
    await drainStory();
    // 事件二：daily_9「拉面店站台」完整走完——选第一项、效果结算（金钱 +200）
    const d9Money = w.S.money;
    w.eval("openStoryEvent('daily_9');");
    const d9Choices = await flipToChoices();
    if (d9Choices) w.document.querySelectorAll('#storyChoices button')[0].click();
    ok('D2 日常事件可完整触发结算·二（daily_9 选项结算：金钱 +200 / 已记 seenEvents）',
      d9Choices && w.S.money === d9Money + 200 && w.S.story.seenEvents.indexOf('daily_9') >= 0,
      `${d9Money}->${w.S.money}`);
    await drainStory();

    // 【架构批改动】C5 顶部锚点快捷条已被场景导航取代（单页全列 → 多场景分屏，用户定调）：
    // 原「锚点定位」断言改为「场景导航可达各屏」断言；折叠开关断言保留（secGoal/secLog 仍在据点屏，行为等价）。
    const navBtn = (n) => w.document.querySelector(`#sceneNav [data-nav="${n}"]`);
    ok('场景导航就位（8 个场景按钮 / 据点屏今日行动·目标·日志分区 id 保留）',
      w.document.querySelectorAll('#sceneNav [data-nav]').length === 8 &&
      ['secActions', 'secGoal', 'secLog'].every((id) => !!w.document.getElementById(id)),
      w.document.querySelectorAll('#sceneNav [data-nav]').length);
    navBtn('train').click();
    const navTrainOk = w.document.getElementById('trainView').style.display === 'block' &&
      w.document.getElementById('dailyView').style.display === 'none' &&
      w.document.querySelectorAll('#trainList [data-train]').length === 13;
    navBtn('match').click();
    const navMatchOk = w.document.getElementById('matchView').style.display === 'block' &&
      w.document.querySelectorAll('#rankBoard .rank-row').length >= 50 && !!w.document.getElementById('btnMatch');
    ok('场景导航可达（训练屏含 13 个训练项目 / 比赛屏含排名榜 50+ 行与报名按钮）',
      navTrainOk && navMatchOk, `${navTrainOk}/${navMatchOk}`);
    const apBeforeShop = w.S.ap;
    navBtn('shop').click(); // 进店走既有「外出」确认框（行为等价：确认后扣 2 AP 进商店屏）
    const shopConfirmOpen = w.document.getElementById('confirmModal').classList.contains('open');
    w.document.getElementById('btnCfOk').click();
    const navShopOk = shopConfirmOpen && w.document.getElementById('shopView').style.display === 'block' && w.S.ap === apBeforeShop - 2 &&
      w.document.querySelectorAll('#shopList [data-buy-gear]').length >= 10;
    w.document.getElementById('btnShopBack').click();
    ok('场景导航商店（点商店先弹外出确认 / 确认后 AP −2 进商店屏且商品渲染 / 离开商店回据点）',
      navShopOk && w.document.getElementById('dailyView').style.display === 'block', `${shopConfirmOpen}/${apBeforeShop}->${w.S.ap}`);
    const foldBtn = w.document.querySelector('[data-fold="secLog"]');
    foldBtn.click();
    const logFolded = w.document.getElementById('secLog').classList.contains('folded') && foldBtn.getAttribute('aria-expanded') === 'false';
    foldBtn.click();
    ok('C5 分区折叠开关（日志分区点一次折叠、再点展开，aria-expanded 同步）',
      !!foldBtn && logFolded && !w.document.getElementById('secLog').classList.contains('folded'));

    // 存档保存 → 重读一致
    w.eval('save()');
    const saved = w.localStorage.getItem(SAVE_KEY);
    ok('存档已写入 localStorage', !!saved);
    const savedObj = JSON.parse(saved);
    ok('存档内战绩/排名与内存一致', savedObj.wins === w.S.wins && savedObj.losses === w.S.losses && savedObj.rank === w.S.rank);
    const rosterJson = JSON.stringify(w.S.roster);
    w.close();

    const again = await loadPage(origin, saved);
    // 【架构批新增】有旧档时标题屏「继续游戏」可用，点继续即进游戏且原进度无损（老档无痛进入新结构）
    ok('标题屏继续流程（有档时继续按钮可用 / 点继续进据点 / 标题隐藏 / 战绩无损）',
      again.w.document.getElementById('btnTitleContinue').disabled === false &&
      (again.w.document.getElementById('btnTitleContinue').click(), again.w.document.getElementById('dailyView').style.display === 'block') &&
      again.w.document.getElementById('titleView').style.display === 'none' &&
      again.w.S.wins === savedObj.wins && again.w.S.losses === savedObj.losses,
      again.w.document.getElementById('dailyView').style.display);
    ok('重读后战绩一致', again.w.S.wins === savedObj.wins && again.w.S.losses === savedObj.losses);
    ok('重读后 roster 逐字一致（50 人/名次/评分）', JSON.stringify(again.w.S.roster) === rosterJson);
    ok('重读后 story 一致（prologueDone 保持 true / seenEvents·affinity 逐项一致；修复批次 C 新增 dailyCd 字段由迁移补入，不再要求整对象逐字相等）',
      again.w.S.story.prologueDone === true &&
      JSON.stringify(again.w.S.story.seenEvents) === JSON.stringify(JSON.parse(saved).story.seenEvents) &&
      JSON.stringify(again.w.S.story.affinity) === JSON.stringify(JSON.parse(saved).story.affinity) &&
      typeof again.w.S.story.dailyCd === 'object');
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

    // 新手期重构·老存档兼容：删掉 tutorial 字段的存档 → 读档自动「毕业」，绝不触发练习赛/首周目标/情境提示
    const tutSeedObj = JSON.parse(saved);
    delete tutSeedObj.tutorial;
    const tutLoad = await loadPage(origin, JSON.stringify(tutSeedObj));
    ok('老存档无 tutorial 字段自动毕业（practiceDone/goalDone=true / practicePending=false / 练习按钮隐藏 / 首周目标行隐藏）',
      tutLoad.w.S.tutorial.practiceDone === true && tutLoad.w.S.tutorial.goalDone === true &&
      tutLoad.w.eval('practicePending()') === false &&
      tutLoad.w.document.getElementById('btnPractice').style.display === 'none' &&
      tutLoad.w.document.getElementById('hubGoal').hidden === true,
      tutLoad.w.S.tutorial && JSON.stringify(tutLoad.w.S.tutorial));
    tutLoad.w.close();

    // 【G5 教程关卡化】教学窗文案瘦身（准备层只给「先会两样」/ 开场日志一句）＋战斗内即时教学触发与只教一次＋自动模式回合间指令教学＋窗外原文案不变＋老档 taught 兼容
    {
      const g5 = await loadPage(origin, null);
      const gw = g5.w;
      gw.document.getElementById('btnTitleNew').click();
      await sleep(30);
      if (gw.document.getElementById('storyModal').classList.contains('open')) gw.document.getElementById('btnStorySkip').click();
      await sleep(30);
      ok('G5 新档 taught 初始化（空数组 / teachWindow 开启：序章已完、正式赛 0 场）',
        Array.isArray(gw.S.tutorial.taught) && gw.S.tutorial.taught.length === 0 && gw.eval('teachWindow()') === true,
        JSON.stringify(gw.S.tutorial));
      const g5go = [...gw.document.querySelectorAll('#storyChoices button')].find((b) => (b.textContent || '').indexOf('上台') >= 0);
      if (g5go) g5go.click();
      await sleep(30);
      const g5man = gw.document.querySelector('#modeModal [data-mode="manual"]');
      if (g5man) g5man.click();
      await sleep(30);
      const brc = gw.document.getElementById('brControls').textContent || '';
      ok('G5 教学窗准备层只给「先会两样」（含即时教学预告 / 不含全量键位串）',
        brc.indexOf('先会两样') >= 0 && brc.indexOf('第一次用到时') >= 0 && brc.indexOf('U 上勾') < 0, brc);
      gw.document.getElementById('btnBattleStart').click();
      await sleep(30);
      gw.eval('clearInterval(battleTimer)'); // 冻结实时推进，后续触发全走手动 eval 的既有判定点
      const logTxt0 = gw.document.getElementById('battleLog').textContent || '';
      ok('G5 教学窗开场日志瘦身（一句教学 / 无规则全文段）',
        gw.eval('B && B.mode') === 'manual' && logTxt0.indexOf('教学：贴近对手出拳打人') >= 0 && logTxt0.indexOf('连贯命中攒连击加伤害') < 0,
        logTxt0.slice(0, 120));
      gw.eval('B.meBlocking = false; dealDamage(B.foe, B.me, "straight", 1, false, false);');
      ok('G5 即时教学·格挡（第一次硬吃对手的拳触发 / taught 记 guard / 日志有【教学】)',
        gw.S.tutorial.taught.indexOf('guard') >= 0 && (gw.document.getElementById('battleLog').textContent || '').indexOf('【教学】这拳你硬吃了') >= 0,
        JSON.stringify(gw.S.tutorial.taught));
      gw.eval('B.foeBlocking = true; dealDamage(B.me, B.foe, "straight", 1, true, false);');
      ok('G5 即时教学·击腹破防（自己的拳第一次被格挡触发）',
        gw.S.tutorial.taught.indexOf('body') >= 0, JSON.stringify(gw.S.tutorial.taught));
      gw.eval('B.foeBlocking = false; B.foeTrauma = 29.9; dealDamage(B.me, B.foe, "straight", 1, true, false); dealDamage(B.me, B.foe, "straight", 1, true, false); dealDamage(B.me, B.foe, "straight", 1, true, false);');
      ok('G5 即时教学·连击＋重创（第一次 3 连触发 combo / 重创第一次过 30 触发 trauma）',
        gw.S.tutorial.taught.indexOf('combo') >= 0 && gw.S.tutorial.taught.indexOf('trauma') >= 0,
        JSON.stringify(gw.S.tutorial.taught));
      gw.eval('openCounterWindow(true, "side");');
      ok('G5 即时教学·反击（闪避第一次开反击窗触发 counter）',
        gw.S.tutorial.taught.indexOf('counter') >= 0, JSON.stringify(gw.S.tutorial.taught));
      gw.eval('B.meBlocking = false; dealDamage(B.foe, B.me, "straight", 1, false, false);');
      ok('G5 即时教学只教一次（再次硬吃拳不再重复播报格挡教学）',
        (gw.document.getElementById('battleLog').textContent.match(/【教学】这拳你硬吃了/g) || []).length === 1,
        (gw.document.getElementById('battleLog').textContent.match(/【教学】/g) || []).length);
      gw.close();
      // 自动模式：指令教学在首个回合间休息出现
      const g5b = await loadPage(origin, null);
      g5b.w.eval('S.story.prologueDone = true;');
      g5b.w.eval('pendingFoe = makePracticeFoe(); nextBattlePractice = true; startBattle("auto"); clearInterval(battleTimer); B.phase = "break"; startBreak();');
      ok('G5 即时教学·指令（自动模式首个回合间触发 cmd / 休息面板含教学条）',
        g5b.w.S.tutorial.taught.indexOf('cmd') >= 0 && (g5b.w.document.getElementById('breakTips').innerHTML || '').indexOf('教学：') >= 0,
        JSON.stringify(g5b.w.S.tutorial.taught));
      g5b.w.close();
      // 教学窗外：文案与行为保持原样
      const g5c = await loadPage(origin, null);
      g5c.w.eval('S.story.prologueDone = true; S.wins = 3;');
      ok('G5 教学窗外（已打过正式赛）teachWindow 关闭', g5c.w.eval('teachWindow()') === false);
      g5c.w.eval('pendingFoe = makeFoe(); openBattleReady("manual");');
      const vrc = g5c.w.document.getElementById('brControls').textContent || '';
      ok('G5 窗外准备层保持全量键位表（原文案不变；jsdom 为触屏口径，判据取双版通用的「上勾」全量词）',
        vrc.indexOf('上勾') >= 0 && vrc.indexOf('格挡') >= 0 && vrc.indexOf('搂抱') >= 0 && vrc.indexOf('先会两样') < 0, vrc);
      g5c.w.eval('startBattle("manual"); clearInterval(battleTimer);');
      ok('G5 窗外开场日志保持规则全文（原文案不变）',
        (g5c.w.document.getElementById('battleLog').textContent || '').indexOf('连贯命中攒连击加伤害') >= 0);
      g5c.w.close();
      // 老档兼容：tutorial 存在但无 taught 字段（G4 期存档形态）→ 清洗补空数组
      const g5SeedObj = JSON.parse(saved);
      g5SeedObj.tutorial = { practiceDone: true, tips: [], goalDone: true, trainings: 0 };
      const g5d = await loadPage(origin, JSON.stringify(g5SeedObj));
      ok('G5 老档兼容（tutorial 无 taught 字段 → 清洗补空数组、不报错）',
        Array.isArray(g5d.w.S.tutorial.taught) && g5d.w.S.tutorial.taught.length === 0,
        JSON.stringify(g5d.w.S.tutorial));
      g5d.w.close();
    }

    // 【G6 平台小件】BGM 参数化扩容（title 新曲＋story/shop 变体＋场景切曲）＋全屏按钮＋Esc 关最上层弹窗（不误关比赛）＋TKO 直述文案＋名次归因
    {
      const g6 = await loadPage(origin, saved);
      const gw6 = g6.w;
      ok('G6 BGM 参数化曲目表（title 96BPM 大调新曲 / daily 76 / story 64 正弦变体 / shop 88 方波变体 / battle kit 含底鼓步位）',
        gw6.eval('BGM_TRACKS.title.bpm') === 96 && gw6.eval('BGM_TRACKS.daily.bpm') === 76 &&
        gw6.eval('BGM_TRACKS.story.bpm') === 64 && gw6.eval('BGM_TRACKS.shop.bpm') === 88 &&
        gw6.eval('BGM_TRACKS.story.kit.melWave') === 'sine' && gw6.eval('BGM_TRACKS.daily.kit.melWave') === 'triangle' &&
        gw6.eval('BGM_TRACKS.shop.kit.melWave') === 'square' &&
        gw6.eval('JSON.stringify(BGM_TRACKS.battle.kit.kickSteps)') === '[0,4]' &&
        gw6.eval('BGM_TRACKS.title.bars[0].mel[0]') !== gw6.eval('BGM_TRACKS.daily.bars[0].mel[0]'),
        gw6.eval('Object.keys(BGM_TRACKS).join(",")'));
      gw6.eval('bgmUnlocked = true; BGM.start("daily"); showScene("title");');
      const g6t1 = gw6.eval('BGM.track');
      gw6.eval('showScene("shop");');
      const g6t2 = gw6.eval('BGM.track');
      gw6.eval('showScene("daily");');
      ok('G6 场景切曲（标题→title / 商店→shop / 据点→daily）', g6t1 === 'title' && g6t2 === 'shop' && gw6.eval('BGM.track') === 'daily', `${g6t1}/${g6t2}/${gw6.eval('BGM.track')}`);
      ok('G6 全屏按钮（标题屏＋设置屏各一 / toggleFullscreen 存在 / jsdom 无 API 时点击静默不报错）',
        !!gw6.document.getElementById('btnTitleFullscreen') && !!gw6.document.getElementById('btnSettingsFullscreen') &&
        gw6.eval('typeof toggleFullscreen') === 'function' && (gw6.document.getElementById('btnSettingsFullscreen').click(), true));
      // Esc：两层弹窗只关最上层（confirm 走取消语义），再按关下一层；storyModal 不在 Esc 表内
      gw6.eval('$("helpModal").classList.add("open");');
      gw6.eval('askConfirm({ title: "G6测试", lines: [["a", "b"]] });');
      await sleep(40); // 等 MutationObserver 把打开顺序入栈
      gw6.document.dispatchEvent(new gw6.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(10);
      const g6esc1 = !gw6.document.getElementById('confirmModal').classList.contains('open') && gw6.document.getElementById('helpModal').classList.contains('open') && gw6.eval('pendingConfirm') === null;
      gw6.document.dispatchEvent(new gw6.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(10);
      ok('G6 Esc 关最上层弹窗（confirm 先关且 pendingConfirm 清空 / help 仍在 / 第二次 Esc 关 help / storyModal 不入 Esc 表）',
        g6esc1 && !gw6.document.getElementById('helpModal').classList.contains('open') && gw6.eval('!("storyModal" in MODAL_ESC_CLOSER)'),
        `${g6esc1}`);
      gw6.close();
      // Esc 不误关比赛：战斗中开帮助浮层，Esc 只关浮层、B 仍在
      const g6b = await loadPage(origin, null);
      g6b.w.eval('S.story.prologueDone = true; pendingFoe = makePracticeFoe(); nextBattlePractice = true; startBattle("auto"); clearInterval(battleTimer); $("helpModal").classList.add("open");');
      await sleep(40);
      g6b.w.document.dispatchEvent(new g6b.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(10);
      ok('G6 战斗中 Esc 只关浮层不中断比赛（help 关 / B 仍在 / battleView 仍显示）',
        !g6b.w.document.getElementById('helpModal').classList.contains('open') && g6b.w.eval('!!B') && g6b.w.document.getElementById('battleView').style.display === 'block',
        `${g6b.w.eval('!!B')}/${g6b.w.document.getElementById('battleView').style.display}`);
      g6b.w.close();
      // 名次归因：当周获胜（胜场水位涨）＋重排后名次倒退 → 日志带「名次说明」；无胜场水位变化时不带
      const g6r = await loadPage(origin, saved);
      g6r.w.eval('S.rank = 20; S.wins = 5; S.rankMarkWins = 4; S.roster.forEach(function (m) { m.rating = 28; }); S.logs = []; weeklyRosterGrowth(10);');
      const g6attr = g6r.w.S.logs.some((l) => l.msg.indexOf('名次说明') >= 0 && l.msg.indexOf('其他选手') >= 0);
      const g6rankWorse = g6r.w.S.rank > 20 && g6r.w.S.rankMarkWins === 5;
      g6r.w.eval('S.rank = 20; S.rankMarkWins = S.wins; S.roster.forEach(function (m) { m.rating = 28; }); S.logs = []; weeklyRosterGrowth(10);');
      const g6noAttr = !g6r.w.S.logs.some((l) => l.msg.indexOf('名次说明') >= 0);
      ok('G6 名次归因（获胜周名次倒退→归因行出现且水位更新 / 未获胜→无归因行）', g6attr && g6rankWorse && g6noAttr,
        `${g6attr}/${g6rankWorse}/${g6noAttr}/rank=${g6r.w.S.rank}`);
      g6r.w.close();
      // 文案：源码层断言（两套件同源）——「死战设置」归零、TKO 直述句在位
      const g6battleSrc = fs.readFileSync(path.join(root, 'js/battle.js'), 'utf8');
      const g6gameSrc = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
      const g6htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
      ok('G6 文案（「死战设置」全仓归零 / TKO 直述「本回合第 3 次击倒——TKO 判负」与「直接判负（TKO）」在位）',
        !g6battleSrc.includes('死战设置') && !g6gameSrc.includes('死战设置') && !g6htmlSrc.includes('死战设置') &&
        g6battleSrc.includes('本回合第 3 次击倒——TKO 判负') && g6battleSrc.includes('直接判负（TKO）'));
    }

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
    ok('多存档槽：meta 当前槽重读后保持（重载后仍为槽 3 且进度一致；金钱 7777→12777 系修复批次 C 阶段双通道追溯补完阶段 4 的 +¥5000 奖励——33 胜走胜场路解锁，老档解卡的预期行为）',
      reSlot.w.eval('currentSlot()') === 3 && reSlot.w.S.wins === 33 && reSlot.w.S.money === 12777,
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

    // 【G4 存档安全四件套】迁移链（ver0→ver1 字段逐值不变）/ 损坏与过高版本档锁定不回写 / 导出导入往返与校验
    const G4_SLOT2 = 'boxing-phase1-save-v1-slot2';
    const G4_SLOT3 = 'boxing-phase1-save-v1-slot3';
    const ver0Obj = JSON.parse(saved); delete ver0Obj.ver; // 构造 ver0 老档：与现行档同构、只是没有 ver 字段
    const ver0Page = await loadPage(origin, JSON.stringify(ver0Obj));
    ver0Page.w.eval('window.__v0 = ' + JSON.stringify(ver0Obj));
    ok('G4 迁移链函数：ver0 对象逐级迁移到 ver1，除 ver 外字段逐值不变（day/money/wins/attrs）',
      ver0Page.w.eval('(function(){ var m = migrateSaveData(window.__v0); return m.ok && m.data.ver === 1 && m.data.day === window.__v0.day && m.data.money === window.__v0.money && m.data.wins === window.__v0.wins && JSON.stringify(m.data.attrs) === JSON.stringify(window.__v0.attrs); })()') === true);
    ok('G4 迁移链读档：ver0 老档读入成功且关键字段一致（day/wins/losses/rank/attrs.pow）',
      ver0Page.w.S.day === ver0Obj.day && ver0Page.w.S.wins === ver0Obj.wins && ver0Page.w.S.losses === ver0Obj.losses &&
      ver0Page.w.S.rank === ver0Obj.rank && ver0Page.w.S.attrs.pow === ver0Obj.attrs.pow,
      `${ver0Page.w.S.day}/${ver0Page.w.S.wins}/${ver0Page.w.S.rank}`);
    ver0Page.w.eval('save()');
    ok('G4 版本号落盘：迁移后的存档再保存时必带 ver=1',
      JSON.parse(ver0Page.w.localStorage.getItem(SAVE_KEY)).ver === 1);
    ver0Page.w.close();

    const corruptRaw = saved.slice(0, Math.floor(saved.length / 2)); // 截断 JSON = 损坏档
    const corPage = await loadPage(origin, corruptRaw);
    corPage.w.eval('save()'); // 模拟启动后日常自动存档的回写尝试：必须被锁定守卫挡下
    ok('G4 损坏档锁定：截断 JSON 启动后 save() 不回写、原文逐字保留、状态判定 locked/corrupt',
      corPage.w.localStorage.getItem(SAVE_KEY) === corruptRaw &&
      corPage.w.eval('slotStatus(1).state + "/" + slotStatus(1).reason') === 'locked/corrupt');
    ok('G4 损坏档可导出原文（锁定不妨碍导出留档）',
      corPage.w.eval('exportSaveText(1)') === corruptRaw);
    corPage.w.close();

    const newerObj = JSON.parse(saved); newerObj.ver = 99;
    const newerRaw = JSON.stringify(newerObj);
    const newPage = await loadPage(origin, newerRaw);
    newPage.w.eval('save()');
    ok('G4 版本过高档锁定：ver=99 启动后不回写、原文逐字保留、状态判定 locked/newer',
      newPage.w.localStorage.getItem(SAVE_KEY) === newerRaw &&
      newPage.w.eval('slotStatus(1).state + "/" + slotStatus(1).reason') === 'locked/newer');
    newPage.w.close();

    const ioPage = await loadPage(origin, saved);
    const expText = ioPage.w.eval('exportSaveText(1)');
    ioPage.w.eval('window.__exp = ' + JSON.stringify(expText));
    ioPage.w.eval('window.__newer = ' + JSON.stringify(newerRaw));
    ok('G4 导出：当前槽导出文本可解析且带 ver=1',
      (() => { try { return JSON.parse(expText).ver === 1; } catch { return false; } })());
    const impRes = ioPage.w.eval('importSaveToSlot(2, window.__exp)');
    const slot2Imported = JSON.parse(ioPage.w.localStorage.getItem(G4_SLOT2) || 'null');
    ok('G4 导入：合法存档导入空槽成功（ok / 内容与导出一致 / 落盘带 ver=1）',
      impRes.ok === true && !!slot2Imported && slot2Imported.money === JSON.parse(expText).money && slot2Imported.ver === 1,
      impRes && impRes.reason);
    const slot2Before = ioPage.w.localStorage.getItem(G4_SLOT2);
    const badImp = ioPage.w.eval("importSaveToSlot(2, '{broken json')");
    const newerImp = ioPage.w.eval('importSaveToSlot(3, window.__newer)');
    ok('G4 导入校验：损坏文本被拒（corrupt）、过高版本被拒（newer），已有存档逐字无损',
      badImp.ok === false && badImp.reason === 'corrupt' && newerImp.ok === false && newerImp.reason === 'newer' &&
      ioPage.w.localStorage.getItem(G4_SLOT2) === slot2Before && ioPage.w.localStorage.getItem(G4_SLOT3) === null,
      `${badImp.reason}/${newerImp.reason}`);
    ioPage.w.localStorage.setItem(G4_SLOT3, '{"day":1,'); // 槽 3 放一份损坏原文 → 锁定
    const lockImp = ioPage.w.eval('importSaveToSlot(3, window.__exp)');
    ok('G4 导入：目标槽为异常锁定档时被拒（locked）且异常原文保留',
      lockImp.ok === false && lockImp.reason === 'locked' && ioPage.w.localStorage.getItem(G4_SLOT3) === '{"day":1,',
      lockImp && lockImp.reason);
    ioPage.w.eval('openSaveSlots();');
    const lockedCards = ioPage.w.document.querySelectorAll('#saveSlotList .save-slot.locked');
    ok('G4 界面：存档屏异常槽渲染锁定卡（原因文案＋导出/清除按钮）；设置屏导出/导入入口就位',
      lockedCards.length === 1 && lockedCards[0].textContent.includes('存档异常') &&
      !!lockedCards[0].querySelector('[data-slot-export="3"]') && !!lockedCards[0].querySelector('[data-slot-clear="3"]') &&
      !!ioPage.w.document.getElementById('btnExportSave') && !!ioPage.w.document.getElementById('btnImportSave'));
    const exp2 = ioPage.w.eval('exportSaveText(2)');
    ioPage.w.eval('window.__exp2 = ' + JSON.stringify(exp2));
    ioPage.w.localStorage.removeItem(G4_SLOT2);
    const rtRes = ioPage.w.eval('importSaveToSlot(2, window.__exp2)');
    const rtObj = JSON.parse(ioPage.w.localStorage.getItem(G4_SLOT2) || 'null');
    const exp2Obj = JSON.parse(exp2);
    ok('G4 往返：导出→清空→导入后关键字段深等价（day/money/wins/rank/attrs/story）',
      rtRes.ok === true && !!rtObj && rtObj.day === exp2Obj.day && rtObj.money === exp2Obj.money && rtObj.wins === exp2Obj.wins &&
      rtObj.rank === exp2Obj.rank && JSON.stringify(rtObj.attrs) === JSON.stringify(exp2Obj.attrs) && JSON.stringify(rtObj.story) === JSON.stringify(exp2Obj.story));
    ioPage.w.close();

    // 【架构批新增】画廊五页签 / 存档屏三槽与删除 / 设置持久化（独立 key，刷新保留）
    const SETTINGS_KEY = 'boxing-settings-v1';
    const arch = await loadPage(origin, saved);
    arch.w.document.getElementById('btnTitleContinue').click(); // 有档：继续进游戏
    arch.w.eval("openGallery('portrait');");
    const galPortraitN = arch.w.document.querySelectorAll('#galPortraits .gal-portrait').length;
    arch.w.document.querySelector('[data-galtab="gear"]').click();
    const galGearOk = arch.w.document.querySelector('[data-galpanel="gear"]').style.display !== 'none' && !!arch.w.document.getElementById('stDex');
    arch.w.document.querySelector('[data-galtab="foes"]').click();
    const galFoeN = arch.w.document.querySelectorAll('#stFoeDex .foe-dex-item').length;
    arch.w.document.querySelector('[data-galtab="mem"]').click();
    const galMemOk = !!arch.w.document.getElementById('stMemories');
    ok('画廊五页签渲染（立绘 21 张 / 装备图鉴页签可见 / 对手名鉴 52 格 / 回忆页签就位）',
      galPortraitN === 21 && galGearOk && galFoeN === 52 && galMemOk, `${galPortraitN}/${galFoeN}`);
    arch.w.document.querySelector('#galPortraits .gal-portrait').click();
    const imgZoomOk = arch.w.document.getElementById('imgModal').classList.contains('open') && (arch.w.document.getElementById('imgModalImg').getAttribute('src') || '').length > 0;
    arch.w.document.getElementById('btnImgClose').click();
    ok('画廊立绘点开放大（imgModal 打开且图片已填 / 关闭正常）',
      imgZoomOk && !arch.w.document.getElementById('imgModal').classList.contains('open'));
    arch.w.eval('openSaveSlots();');
    const savesShown = arch.w.document.getElementById('savesView').style.display === 'block' &&
      arch.w.document.querySelectorAll('#saveSlotList .save-slot').length === 3 &&
      arch.w.document.querySelectorAll('#saveSlotList .save-slot.current').length === 1;
    arch.w.eval('copyCurrentToSlot(2); renderSaveSlots();');
    const slot2Has = !!arch.w.eval('slotData(2)');
    arch.w.document.querySelector('[data-slot-delete="2"]').click();
    const delConfirmOpen = arch.w.document.getElementById('confirmModal').classList.contains('open');
    arch.w.document.getElementById('btnCfOk').click();
    ok('存档屏三槽渲染与删除（3 卡＋当前槽高亮 / 复制后槽 2 有档 / 删除走确认框且删后为空）',
      savesShown && slot2Has && delConfirmOpen && arch.w.eval('slotData(2)') === null,
      `${savesShown}/${slot2Has}/${delConfirmOpen}`);
    arch.w.eval("gotoScene('settings');");
    const volInput = arch.w.document.getElementById('setMusicVol');
    volInput.value = '35';
    volInput.dispatchEvent(new arch.w.Event('input', { bubbles: true }));
    arch.w.document.getElementById('setSfxOn').click();
    const setRaw = arch.w.localStorage.getItem(SETTINGS_KEY);
    const setParsed = setRaw ? JSON.parse(setRaw) : {};
    ok('设置即改即生效（音乐音量 35 写入 SETTINGS 与 audioLevels / 音效开关关闭同步总线）',
      arch.w.document.getElementById('settingsView').style.display === 'block' &&
      setParsed.musicVol === 35 && setParsed.sfxOn === false &&
      arch.w.eval('SETTINGS.musicVol') === 35 && arch.w.eval('audioLevels.musicVol') === 0.35 && arch.w.eval('audioLevels.sfxOn') === false,
      setRaw);
    arch.w.close();
    const archRe = await loadPage(origin, saved, { [SETTINGS_KEY]: setRaw });
    ok('设置刷新后保留（重载后 SETTINGS 与 audioLevels 仍为 35 / 音效关 / 控件同步）',
      archRe.w.eval('SETTINGS.musicVol') === 35 && archRe.w.eval('SETTINGS.sfxOn') === false &&
      archRe.w.eval('audioLevels.musicVol') === 0.35 && archRe.w.eval('audioLevels.sfxOn') === false &&
      archRe.w.document.getElementById('setMusicVol').value === '35',
      archRe.w.eval('SETTINGS.musicVol') + '/' + archRe.w.eval('SETTINGS.sfxOn'));
    archRe.w.close();

    // 【第一批整改】调试入口下架（顶栏不得出现测试档 / TKO死战 / 恢复主存档按钮）＋日常事件进度门禁（S5）
    const fix = await loadPage(origin, saved);
    ok('调试入口下架：顶栏无测试档 / TKO死战 / 恢复主存档按钮（功能函数保留）',
      !fix.w.document.getElementById('btnTestSave') && !fix.w.document.getElementById('btnDeathToggle') && !fix.w.document.getElementById('btnRestoreSave') &&
      typeof fix.w.eval('startTestSave') === 'function' && typeof fix.w.eval('restoreMainSave') === 'function');
    fix.w.eval(`(function () {
      storyState();
      S.story.seenEvents = S.story.seenEvents.filter(function (id) { return id !== 'daily_6' && id !== 'daily_15'; });
      DAILY_EVENT_IDS.forEach(function (id) { if (id !== 'daily_6' && id !== 'daily_15' && S.story.seenEvents.indexOf(id) < 0) S.story.seenEvents.push(id); });
      storyQueue.length = 0;
      var sm = document.getElementById('storyModal'); if (sm) sm.classList.remove('open');
      S.wins = 0; S.losses = 0;
    })()`);
    const gatePreRet = fix.w.eval('triggerDailyEvent(1)');
    const gatePreSeen = fix.w.eval("S.story.seenEvents.indexOf('daily_15') >= 0 || S.story.seenEvents.indexOf('daily_6') >= 0");
    const gatePreQueued = fix.w.eval("storyQueue.indexOf('daily_15') >= 0 || storyQueue.indexOf('daily_6') >= 0");
    // 修复批次 C 后 triggerDailyEvent 在一次性池被门禁挡空时可由可重复池托底返回 true，门禁本身改验「两段既未触发也未排队」
    ok('事件门禁：0 场比赛时粉丝签名 / 读者来信（needMatch）不触发（未 seen 且未入队；返回值可为可重复池托底的 true）', !gatePreSeen && !gatePreQueued, `${gatePreRet}/${gatePreSeen}/${gatePreQueued}`);
    fix.w.eval('S.wins = 1;');
    const gatePostRet = fix.w.eval('triggerDailyEvent(1)');
    const gatePostSeen = fix.w.eval("S.story.seenEvents.indexOf('daily_15') >= 0 || S.story.seenEvents.indexOf('daily_6') >= 0");
    ok('事件门禁：打过首场后粉丝签名 / 读者来信可正常触发', gatePostRet === true && gatePostSeen, `${gatePostRet}/${gatePostSeen}`);
    fix.w.close();

    // 【修复批次 C】内容投放：约战入口与取消退款 / 阶段与剧情节点双通道 / 可重复日常池 / 新成就 / 文案口径
    const bc = await loadPage(origin, null);
    bc.w.eval(`(function () {
      S.wins = 12; S.losses = 2; S.rank = 18; S.ap = 6; S.day = 30; S.money = 300;
      if (!Array.isArray(S.facedFoes)) S.facedFoes = [];
      if (S.facedFoes.indexOf('opp_counter') < 0) S.facedFoes.push('opp_counter');
      ensureRoster(); render();
    })()`);
    ok('批次C：约战目标含宿敌且可用，startSpar 扣 2 AP 打开模式弹窗且 sim 按钮隐藏',
      bc.w.eval(`sparTargets().some(function (t) { return t.key === 'opp_counter' && t.ok; })`) === true &&
      bc.w.eval('startSpar("opp_counter")') === true &&
      bc.w.eval('S.ap') === 4 &&
      bc.w.document.getElementById('modeModal').classList.contains('open') &&
      bc.w.document.querySelector('#modeModal [data-mode="sim"]').style.display === 'none');
    bc.w.eval(`document.getElementById('btnCancelMode').click()`);
    ok('批次C：取消约战全额退回 2 AP、sim 按钮与标题复原、约战标记清除',
      bc.w.eval('S.ap') === 6 && bc.w.document.querySelector('#modeModal [data-mode="sim"]').style.display === '' &&
      bc.w.eval('nextBattleSpar') === false);
    ok('批次C：阶段双通道（12 胜未进前 25 可过阶段 3 的排名路；阶段 5 可凭 beatChamp 通过、无 beatChamp 且未登顶则不过）',
      bc.w.eval(`STAGES[2].check({ rank: 30, wins: 12, winStreak: 3, influence: 3 })`) === true &&
      bc.w.eval(`STAGES[4].check({ rank: 20, wins: 30, influence: 4, beatChamp: true })`) === true &&
      bc.w.eval(`STAGES[4].check({ rank: 20, wins: 30, influence: 4, beatChamp: false })`) === false);
    ok('批次C：剧情节点双通道 checkStoryMilestones（10 胜排 ev_top25 / 25 胜排 ev_top10 / ev_champ 不跟随胜场通道）',
      bc.w.eval(`(function () { storyState(); S.rank = 30; S.wins = 10; storyQueue.length = 0; checkStoryMilestones(); var a = storyQueue.indexOf('ev_top25') >= 0; storyQueue.length = 0; S.wins = 25; checkStoryMilestones(); var b = storyQueue.indexOf('ev_top10') >= 0; var c = storyQueue.indexOf('ev_champ') < 0; return a && b && c; })()`) === true);
    ok('批次C：可重复日常池（19 段全见过且冷却记录为空时仍可触发；全部刚触发时冷却内返回 false）',
      bc.w.eval(`(function () {
        storyState();
        DAILY_EVENT_IDS.forEach(function (id) { if (S.story.seenEvents.indexOf(id) < 0) S.story.seenEvents.push(id); });
        S.story.dailyCd = {}; S.day = 100; storyQueue.length = 0;
        var a = triggerDailyEvent(1);
        storyQueue.length = 0;
        DAILY_EVENT_IDS.forEach(function (id) { S.story.dailyCd[id] = S.day; });
        var b = triggerDailyEvent(1);
        return a === true && b === false;
      })()`) === true);
    ok('批次C：日常池规模（日常共 19 段 / 可重复 10 段且微变版本齐备）',
      bc.w.eval('DAILY_EVENT_IDS.length') === 19 && bc.w.eval('DAILY_REPEATABLE.length') === 10 &&
      bc.w.eval(`DAILY_REPEATABLE.every(function (id) { return !!DAILY_ALTS[id]; })`) === true);
    ok('批次C：成就共 31 个（批次 C 时 29 个＋批次 G9 卫冕成就 2 个）且 6 个新锚点判定正确（custom_first 与 craft 严格区分）',
      bc.w.eval('ACHIEVEMENTS.length') === 31 &&
      bc.w.eval(`(function () { var by = {}; ACHIEVEMENTS.forEach(function (a) { by[a.id] = a; });
        return by.streak_10.check({ winStreak: 10 }) && by.money_10k.check({ money: 10000 }) &&
          by.custom_first.check({ customGear: [{ source: 'custom' }] }) && !by.custom_first.check({ customGear: [{ source: 'craft' }] }) &&
          by.spar_first.check({ sparFights: 1 }) && by.spar_rival_3.check({ sparRival: 3 }) && by.champ_slayer.check({ beatChamp: true }); })()`) === true);
    ok('批次C：文案口径（阶段 5 改名「国内之巅」且页面无「仅作纪念展示」残留）',
      bc.w.eval(`STAGES[4].name`) === '国内之巅' &&
      !bc.w.document.body.innerHTML.includes('仅作纪念展示'));
    // 【修复批次 D】经济与装备复活：装备百分比/机制化 + 强化曲线 + 三消费口（理疗/特训营/宣传）
    ok('批次D：装备百分比生效值（属性 20 顶配 power 24.8 / end 23.4；属性 50 顶配 power 62——随本体成长不缩水）',
      bc.w.eval(`(function () {
        S = defaultState();
        S.attrs = { power: 20, speed: 20, accuracy: 20, technique: 20, footwork: 20, defense: 20, endurance: 20, will: 20 };
        S.gear = { gloves: 'gloves3', guard: 'guard3', boots: 'boots3', head: 'head3', robe: 'robe3', wrist: 'wrist3' };
        var ea = effAttrs();
        S.attrs.power = 50;
        var ea2 = effAttrs();
        return Math.abs(ea.power - 24.8) < 0.01 && Math.abs(ea.endurance - 23.4) < 0.01 && Math.abs(ea2.power - 62) < 0.01;
      })()`) === true);
    ok('批次D：机制倍率（顶配所受重创积累 ×0.72 / 出拳体力 ×0.96 / 冠军护腕指令冷却 ×0.85；护腕 +10 强化后 ≤×0.81 且不破下限 0.6）',
      bc.w.eval(`(function () {
        S = defaultState();
        S.gear = { gloves: 'gloves3', guard: 'guard3', boots: 'boots3', head: 'head3', robe: 'robe3', wrist: 'wrist3' };
        var t = gearTraumaMul(), s = gearStamMul(), c = gearCdMul();
        S.enh = { wrist3: 10 };
        var c10 = gearCdMul();
        return Math.abs(t - 0.72) < 0.001 && Math.abs(s - 0.96) < 0.001 && Math.abs(c - 0.85) < 0.001 && c10 <= 0.811 && c10 >= 0.6;
      })()`) === true);
    ok('批次D：强化曲线（材料逐级 [1,1,1,1,2,2,2,2,3,3] 合计 18、费用 ¥300×(等级+1)、双类材料合计口径）',
      bc.w.eval(`(function () {
        S = defaultState(); S.enh = {};
        var g = gearById('gloves1'), tot = 0;
        for (var l = 0; l < 10; l++) { S.enh['gloves1'] = l; tot += enhCost(g).matCount; }
        S.enh['gloves1'] = 0; var c0 = enhCost(g);
        S.enh['gloves1'] = 9; var c9 = enhCost(g);
        S.materials = { calf: 1, latex: 2 };
        var stock = enhMatStock(gearById('gloves2')); // gloves2 拆解对 = [calf, latex]，合计库存 1+2=3
        return tot === 18 && c0.money === 300 && c0.matCount === 1 && c9.money === 3000 && c9.matCount === 3 && stock === 3;
      })()`) === true);
    ok('批次D：老档定制拳套兼容（bonus 按 ×4 换算 pct、gearPctOf 兜底不缩水）',
      bc.w.eval(`(function () {
        var p = gearPctOf({ bonus: { power: 2, defense: -1 } });
        return p.power === 8 && p.defense === -4;
      })()`) === true);
    ok('批次D：康复理疗（免 AP、¥1600 → 伤病 −40、周限 2 次、消费记账）',
      bc.w.eval(`(function () {
        S = defaultState(); S.money = 10000; S.injury = 50; S.day = 3; S.ap = 0;
        var left0 = physioLeftThisWeek();
        confirmPhysio();
        var opened = document.getElementById('confirmModal').classList.contains('open');
        document.getElementById('btnCfOk').click();
        return left0 === 2 && opened && S.injury === 10 && S.money === 8400 && S.ap === 0 &&
          physioLeftThisWeek() === 1 && S.sinkStats.physio.n === 1 && S.sinkStats.physio.spent === 1600;
      })()`) === true);
    ok('批次D：特训营（W1 ¥1140 买 4 次充能、周限 1 次、训练结算消耗 1 次且同计划收益高于无充能基线）',
      bc.w.eval(`(function () {
        function setup() {
          S = defaultState(); S.money = 10000; S.day = 3; S.ap = 6; S.stamina = 100;
          S.attrs = { power: 10, speed: 10, accuracy: 10, technique: 10, footwork: 10, defense: 10, endurance: 10, will: 10 };
        }
        setup();
        planSel = ['strength', 'strength']; doPlanTrain();
        var gainNoCamp = S.attrs.power - 10;
        setup();
        buyCampService();
        var sheetOpen = !document.getElementById('shopSheet').hidden;
        document.getElementById('btnShopCfOk').click();
        var bought = S.buffs.camp === 4 && S.money === 10000 - 1140 && campLeftThisWeek() === 0;
        planSel = ['strength', 'strength']; doPlanTrain();
        var gainCamp = S.attrs.power - 10;
        return sheetOpen && bought && S.buffs.camp === 3 && gainCamp > gainNoCamp;
      })()`) === true);
    ok('批次D：宣传造势（W1 ¥680、心态 +15、buff 置位、周限 1 次）',
      bc.w.eval(`(function () {
        S = defaultState(); S.money = 10000; S.day = 3; S.mind = 50;
        buyPromoService();
        document.getElementById('btnShopCfOk').click();
        return S.buffs.promo === true && Math.round(S.mind) === 65 && S.money === 10000 - 680 &&
          promoLeftThisWeek() === 0 && S.sinkStats.promo.n === 1;
      })()`) === true);
    // 【正式版批次 G9 短期】卫冕循环：挑战生成门槛/周限/作废 / 应战弹窗口径 / stage 6 卫冕呈现与 sink 推荐 / 新成就 / 老档兼容
    ok('G9：挑战生成门槛（未登顶不生成；登顶后生成且挑战者为第 2~6 名具名角色、宣言非空）',
      bc.w.eval(`(function () {
        S = defaultState(); S.wins = 20; S.losses = 2; S.day = 35; S.rank = 2; ensureRoster();
        var a = maybeDefenseChallenge();
        S.rank = 1;
        var b = maybeDefenseChallenge();
        return a === null && !!b && !!ROSTER_BY_KEY[b.key] && b.rank >= 2 && b.rank <= 6 &&
          defenseLine(b.key).length > 0 && !!S.defenseChallenge && S.defenseChallenge.key === b.key;
      })()`) === true);
    ok('G9：每周至多 1 场卫冕战（defenseWeek 为本周时不再生成新挑战）',
      bc.w.eval(`(function () {
        S.defenseChallenge = null; S.defenseWeek = weekOf(S.day);
        return maybeDefenseChallenge() === null && S.defenseChallenge === null;
      })()`) === true);
    ok('G9：跌下第 1 名挑战作废（待应战挑战被清空）',
      bc.w.eval(`(function () {
        S.defenseWeek = 0; S.defenseChallenge = { key: 'opp_crimson', name: '薇拉', rank: 2, week: weekOf(S.day) };
        S.rank = 3;
        return maybeDefenseChallenge() === null && S.defenseChallenge === null;
      })()`) === true);
    ok('G9：应战弹窗口径（startDefense 打开模式弹窗、标题=卫冕战、sim 可见、不扣 AP、宣言上弹窗）',
      bc.w.eval(`(function () {
        S.rank = 1; S.ap = 6; S.defenseWeek = 0;
        S.defenseChallenge = { key: 'opp_crimson', name: '薇拉', rank: 2, week: weekOf(S.day) };
        var okStart = startDefense();
        return okStart === true && S.ap === 6 && nextBattleDefense === true &&
          document.getElementById('modeModal').classList.contains('open') &&
          document.getElementById('modeTitle').textContent.includes('卫冕战') &&
          document.querySelector('#modeModal [data-mode="sim"]').style.display === '' &&
          document.getElementById('modeFoeLine').textContent.includes('薇拉');
      })()`) === true);
    bc.w.eval(`document.getElementById('btnCancelMode').click()`);
    ok('G9：取消应战只清标记、挑战保留可再应战',
      bc.w.eval('nextBattleDefense') === false && bc.w.eval('!!S.defenseChallenge') === true);
    ok('G9：stage 6 呈现卫冕目标与冠军期 sink 推荐（卫冕战行 + 宣传造势/特训营/康复理疗三推荐）',
      bc.w.eval(`(function () {
        S.stage = 6; S.defenses = 1; S.defenseChallenge = null;
        var items = stageProgressItems(6);
        var html = stageProgressHTML();
        return items.some(function (it) { return it.label === '卫冕战' && it.text.includes('1 / 3'); }) &&
          html.includes('冠军期备战推荐') && html.includes('宣传造势') && html.includes('特训营') && html.includes('康复理疗');
      })()`) === true);
    ok('G9：新成就与卫冕计数对齐（defend_1/defend_3 与 stage 6 共用 defenses 计数）',
      bc.w.eval(`(function () { var by = {}; ACHIEVEMENTS.forEach(function (a) { by[a.id] = a; });
        return by.defend_1.check({ defenses: 1 }) && !by.defend_1.check({ defenses: 0 }) &&
          by.defend_3.check({ defenses: 3 }) && !by.defend_3.check({ defenses: 2 }); })()`) === true);
    // G9 老档兼容：删掉卫冕三字段的已登顶存档 → 读档补齐默认值、进游戏后挑战正常生成、零报错
    const g9SeedObj = JSON.parse(saved);
    delete g9SeedObj.defenses; delete g9SeedObj.defenseChallenge; delete g9SeedObj.defenseWeek;
    g9SeedObj.rank = 1; g9SeedObj.wins = 30;
    if (g9SeedObj.story) g9SeedObj.story.prologueDone = true; // 确保 enterGame 不被序章早退挡住卫冕补检钩子
    const g9Load = await loadPage(origin, JSON.stringify(g9SeedObj));
    const g9Diag = JSON.parse(g9Load.w.eval(`(function () {
      var before = { d: S.defenses, c: S.defenseChallenge, w: S.defenseWeek };
      enterGame();
      return JSON.stringify({ before: before, afterChallenge: !!S.defenseChallenge, errs: window.__errs.length });
    })()`));
    ok('G9 老档兼容（无卫冕字段的登顶档读入后补齐 defenses=0 / defenseChallenge=null / defenseWeek=0，进游戏即生成挑战、零脚本错误）',
      g9Diag.before.d === 0 && g9Diag.before.c === null && g9Diag.before.w === 0 &&
      g9Diag.afterChallenge === true && g9Diag.errs === 0,
      JSON.stringify(g9Diag));
    g9Load.w.close();
    // 【正式版批次 G10】战斗呈现：选手牌新结构 / 状态词牌映射 / 分级飘字 / 台词气泡节流（纯呈现层，判定零改动）
    const g10 = JSON.parse(bc.w.eval(`(function () {
      var out = {};
      out.hasEls = ['meAvatar', 'meSubLabel', 'meState', 'foeState', 'bubbleMe', 'bubbleFoe'].every(function (id) { return !!document.getElementById(id); });
      S = defaultState(); S.name = '测试';
      startBattle('auto');
      B.foeTrauma = 80; B.meBrokenUntil = B.time + 1.5;
      renderBattle();
      out.foeState = document.getElementById('foeState').textContent;
      out.meState = document.getElementById('meState').textContent;
      spawnDmgFloat(document.getElementById('figFoe'), { dmg: 42, tier: 'ko', tag: 'KO!', combo: 0, koAdd: 30 });
      var fl = document.querySelector('#figFoe .dmg-float.t-ko');
      out.floatOk = !!fl && fl.textContent.indexOf('42') >= 0;
      B.bubbleAt = { me: 0, foe: 0 };
      showBubble(false, 'hit');
      var t1 = B.bubbleAt.foe; var txt1 = document.getElementById('bubbleFoe').textContent;
      showBubble(false, 'hit');
      out.throttleOk = B.bubbleAt.foe === t1 && document.getElementById('bubbleFoe').textContent === txt1 && txt1.length > 0;
      out.errs = window.__errs.length;
      return JSON.stringify(out);
    })()`));
    ok('G10：选手牌新结构元素齐全（我方头像/副标/状态词牌/气泡，对手状态词牌/气泡）', g10.hasEls === true, JSON.stringify(g10));
    ok('G10：状态词牌映射（对手重创 80 → 「重创临界」；我方破防中 → 「破防中」词牌）',
      g10.foeState.indexOf('重创临界') >= 0 && g10.meState.indexOf('破防中') >= 0, JSON.stringify(g10));
    ok('G10：分级飘字生成（KO 级 .dmg-float.t-ko 含伤害数字与 KO 标记）', g10.floatOk === true, JSON.stringify(g10));
    ok('G10：台词气泡节流（同侧连续触发只生效一次、台词非空、零脚本错误）',
      g10.throttleOk === true && g10.errs === 0, JSON.stringify(g10));
    // 【对手帧序列动画】试点 2 人＋A3 批量 6 人＝8 人：素材契约（磁盘）/ 倒地新规元数据 /
    // 精灵元素与播放器在位 / 减少动效门 / 非动画对手不启用
    // （jsdom 无图像解码，序列实际播放与状态推进由 Playwright 真浏览器实证，见 research/anim_batch_logs/）
    const animDisk = (function () {
      try {
        var res = {};
        ['evelyn', 'counter', 'champion_domestic', 'rookie', 'shy', 'pocket', 'braid', 'brick'].forEach(function (c) {
          var meta = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'anim', c, 'anim.json'), 'utf8'));
          var sts = Object.keys(meta.states);
          res[c] = ['idle', 'attack', 'hit', 'down'].every(function (st) { return sts.indexOf(st) >= 0; }) &&
            sts.every(function (st) { var f = path.join(dir, 'assets', 'anim', c, meta.states[st].file); return fs.existsSync(f) && fs.statSync(f).size > 10000; });
          var dn = meta.states.down || {};
          res[c + 'Down'] = dn.downK > 1 && dn.downOX > 0 && dn.downOY > 0 && dn.downGY > dn.downOY;
          if (c === 'counter') res.counterCombo = sts.indexOf('combo') >= 0;
        });
        return res;
      } catch (e) { return { err: String(e) }; }
    })();
    ok('对手动画：素材契约（8 人 anim.json 状态齐全＋精灵图落盘、沈墨凛含 combo）＋倒地新规元数据齐全（downK>1＋锚点/地面线）',
      ['evelyn', 'counter', 'champion_domestic', 'rookie', 'shy', 'pocket', 'braid', 'brick'].every(function (c) {
        return animDisk[c] === true && animDisk[c + 'Down'] === true;
      }) && animDisk.counterCombo === true, JSON.stringify(animDisk));
    const animPg = JSON.parse(bc.w.eval(`(function () {
      var out = {};
      out.hasSprite = !!document.getElementById('foeAnimSprite') && !!document.getElementById('foeAnimImg');
      out.hasPlayer = typeof foeAnimPlay === 'function' && typeof foeAnimStart === 'function';
      S = defaultState(); S.name = '测试';
      pendingFoe = makeFoe({ forceKey: 'opp_world_champion' });
      SETTINGS.reduceMotion = true;
      startBattle('auto');
      out.gateOk = !document.getElementById('figFoe').classList.contains('anim-on');
      SETTINGS.reduceMotion = false;
      B.foe = makeFoe({ forceKey: 'opp_africa' });
      foeAnimStart();
      out.nonPilotOk = !document.getElementById('figFoe').classList.contains('anim-on');
      out.errs = window.__errs.length;
      return JSON.stringify(out);
    })()`));
    ok('对手动画：精灵元素与播放器在位、减少动效门生效、非动画对手不启用、零脚本错误',
      animPg.hasSprite === true && animPg.hasPlayer === true && animPg.gateOk === true && animPg.nonPilotOk === true && animPg.errs === 0,
      JSON.stringify(animPg));
    bc.w.close();
  } finally {
    srv.close();
  }
}

const args = process.argv.slice(2);
await suite('工程版', root);
await suite('dist 单文件版', path.join(root, 'dist'));
const oi = args.indexOf('--original');
if (oi >= 0 && args[oi + 1]) await suite('对照·原始版', path.resolve(args[oi + 1]));

// PWA 静态断言（只查 dist 产物，不启页面）：manifest/sw 进包且字段齐、index 含 manifest link 与 SW 注册
console.log('\n===== PWA 打包断言：dist =====');
{
  const distDir = path.join(root, 'dist');
  const mfPath = path.join(distDir, 'manifest.webmanifest');
  ok('dist 含 manifest.webmanifest 与 sw.js', fs.existsSync(mfPath) && fs.existsSync(path.join(distDir, 'sw.js')));
  let mf = null;
  try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch { /* 解析失败按断言失败处理 */ }
  const sizes = mf ? mf.icons.map((i) => `${i.sizes}:${i.purpose}`) : [];
  ok('manifest 可解析且字段齐（name/display/theme_color/start_url 相对/icons 192·512·maskable）',
    !!mf && mf.name === '心跳在左，拳头在右' && mf.display === 'standalone' && mf.theme_color === '#4a2a7a' &&
    mf.start_url === './index.html' && mf.scope === './' &&
    sizes.includes('192x192:any') && sizes.includes('512x512:any') && sizes.includes('512x512:maskable'), sizes);
  const iconFilesOk = !!mf && mf.icons.every((i) => fs.existsSync(path.join(distDir, i.src)));
  ok('manifest 引用的图标文件在 dist 中全部存在', iconFilesOk);
  const distHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  // 【正式定名断言】2026-11-02 游戏正式定名「心跳在左，拳头在右」：manifest name/short_name 与页面 title 必须为新名
  ok('正式定名：manifest name=「心跳在左，拳头在右」/ short_name=「心跳在左」/ dist <title> 为新名',
    !!mf && mf.name === '心跳在左，拳头在右' && mf.short_name === '心跳在左' &&
    distHtml.includes('<title>心跳在左，拳头在右</title>'),
    mf ? `${mf.name}/${mf.short_name}` : 'manifest 解析失败');
  ok('dist/index.html 含 manifest link、theme-color 与 SW 注册脚本',
    distHtml.includes('rel="manifest"') && distHtml.includes('name="theme-color"') && distHtml.includes("serviceWorker.register('sw.js')"));
  const swSrc = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
  ok('sw.js 含版本号常量与缓存清理逻辑', /SW_VERSION\s*=\s*'boxing-pwa-v\d+'/.test(swSrc) && swSrc.includes('caches.delete'));
  const cOpen = distHtml.split('<!--').length - 1;
  const cClose = distHtml.split('-->').length - 1;
  ok('dist/index.html 注释配平、无游离 --> 泄漏为正文', cOpen === cClose, { cOpen, cClose });
}

console.log(`\n总计：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
