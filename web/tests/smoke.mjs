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

async function loadPage(origin, seed) {
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
    ok('数据全局就位（ROSTER_DEF 50 / TRAININGS 13 / SHOP_GEAR 21 / STORY_EVENTS 含 ev_stage1）',
      w.eval('ROSTER_DEF.length') === 50 && w.eval('TRAININGS.length') === 13 && w.eval('SHOP_GEAR.length') === 21 && !!w.eval('STORY_EVENTS.ev_stage1'));
    ok('逻辑全局就位（makeFoe / simulateBattle / settleNow / save 均为函数）',
      ['makeFoe', 'simulateBattle', 'settleNow', 'save'].every((f) => w.eval(`typeof ${f}`) === 'function'));

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

    // 模拟一场比赛可结算
    w.eval('simulateBattle();');
    await sleep(600);
    ok('模拟比赛后结算窗弹出', w.document.getElementById('settleModal').classList.contains('open'));
    ok('战绩已记账（胜+负 = 1）', w.S.wins + w.S.losses === 1, `${w.S.wins}/${w.S.losses}`);

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
    ok('重读无脚本错误', (again.w.__errs || []).length === 0, again.w.__errs);
    again.w.close();
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
