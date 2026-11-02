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
    ok('标题屏出现（titleView 显示 / 日常隐藏 / 游戏名大字与主角立绘就位）',
      w.document.getElementById('titleView').style.display === 'block' &&
      w.document.getElementById('dailyView').style.display === 'none' &&
      (w.document.querySelector('.game-title').textContent || '').includes('心跳在左，拳头在右') &&
      (w.document.getElementById('titlePortrait').getAttribute('src') || '').includes('portrait'),
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

    // 打磨批次 4 · D2：日常事件池扩充至 15 段（原 3 段），触发函数统一走 triggerDailyEvent
    ok('D2 日常事件池扩充（DAILY_EVENT_IDS = 15 段且定义齐全 / 事件总数 ≥42（原 30+新 12） / triggerDailyEvent 为函数）',
      w.eval('DAILY_EVENT_IDS.length') === 15 &&
      w.eval('DAILY_EVENT_IDS.every(function (id) { return !!STORY_EVENTS[id]; })') &&
      w.eval('Object.keys(STORY_EVENTS).length') >= 42 &&
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
