// 修复批次 C 验收 2：约战实玩（Playwright + Chromium headless shell）
// 真实 DOM 流程：进游戏 → 比赛屏 → 点「约战」→ 指名宿敌 → 模式弹窗（赛前文案）→ 准备层 → 开战 →
// 强制终局 → 约战专属结算；核账：金钱/战绩/排名/影响力全不变、AP −2、经验半额、宿敌好感 +8（胜）、
// sparFights/sparRival 计数、本周同对手锁定；并与同周正式赛奖金公式对照（约战奖金恒为 0）。全程零 JS 报错。
import { chromium} from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const EXE = '/home/hatch/workspace/.pw-browsers/chromium_headless_shell-1200/chrome-linux/chrome-headless-shell';
const root = '/home/hatch/workspace/game/boxing/web';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'};
const srv = http.createServer((req, res) => {
const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
const f = path.join(root, p === '/'? 'index.html': p);
if (!f.startsWith(root) ||!fs.existsSync(f) ||!fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return;}
res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PAGE_URL = `http://127.0.0.1:${srv.address().port}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond? 'PASS ': 'FAIL ') + name + (extra!== undefined? ':: ' + extra: '')); if (!cond) fails++;};

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--hide-scrollbars']});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800}});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text());});
await page.goto(PAGE_URL, { waitUntil: 'load'});
await sleep(400);

/* 造档：已打过正式赛、与宿敌交过手、属性给足（保证能打赢约战核账胜局） */
await page.evaluate(() => {
S.story.prologueDone = true;
S.wins = 3; S.losses = 1; S.rank = 30; S.ap = 6; S.day = 10; S.money = 1000; S.stamina = 100; S.injury = 0;
ATTRS.forEach((a) => { S.attrs[a.key] = 40;});
if (!Array.isArray(S.facedFoes)) S.facedFoes = [];
if (S.facedFoes.indexOf('opp_counter') < 0) S.facedFoes.push('opp_counter');
ensureRoster(); save(); enterGame(); render();
});
await sleep(300);
ok('进入游戏（据点可见）', await page.evaluate(() =>!!document.querySelector('#dailyView,.hub-stage, body')));

/* 切到比赛屏（优先点导航，兜底调 showScene） */
const navClicked = await page.evaluate(() => {
const b = document.querySelector('[data-scene="match"], #navMatch,.scene-tab[data-scene="match"]');
if (b) { b.click(); return true;}
return false;
});
if (!navClicked) await page.evaluate(() => showScene('match'));
await sleep(300);
const btnSparState = await page.evaluate(() => {
const b = document.getElementById('btnSpar');
return { exists:!!b, disabled: b? b.disabled: null, visible: b? b.offsetParent!== null: false, text: b? b.textContent.trim().slice(0, 20): ''};
});
ok('约战入口在比赛屏可见且已解锁', btnSparState.exists && btnSparState.disabled === false, JSON.stringify(btnSparState));

await page.click('#btnSpar');
await sleep(300);
const listState = await page.evaluate(() => ({
modalOpen: document.getElementById('sparModal').classList.contains('open'),
rows: Array.from(document.querySelectorAll('#sparList [data-spar]')).map((b) => ({ key: b.getAttribute('data-spar'), dis: b.disabled, txt: b.textContent.replace(/\s+/g, ' ').slice(0, 40)})),
}));
ok('约战列表弹出且宿敌置顶可选', listState.modalOpen && listState.rows.length >= 1 && listState.rows[0].key === 'opp_counter' && listState.rows[0].dis === false, JSON.stringify(listState.rows));

const before = await page.evaluate(() => ({
money: S.money, wins: S.wins, losses: S.losses, rank: S.rank, fame: S.fame, ap: S.ap, lastMatchDay: S.lastMatchDay,
affRival: S.story.affinity.rival, expStraight: S.punchExp.straight, formalPrizeIfWin: prizeForRank(weekOf(S.day)), // 同周正式赛获胜全额奖金（引擎同一函数，对照组）
}));
await page.click('#sparList [data-spar="opp_counter"]');
await sleep(300);
const modeState = await page.evaluate(() => ({
open: document.getElementById('modeModal').classList.contains('open'),
title: document.getElementById('modeTitle').textContent,
note: document.getElementById('modeNote').textContent.replace(/\s+/g, ' ').slice(0, 120),
simHidden: document.querySelector('#modeModal [data-mode="sim"]').style.display === 'none',
ap: S.ap,
}));
ok('赛前模式弹窗（标题=约战 / 文案含不计战绩口径 / sim 隐藏 / AP 已扣 2）',
modeState.open && modeState.title.includes('约战') && modeState.note.includes('不计战绩') && modeState.simHidden && modeState.ap === before.ap - 2,
JSON.stringify(modeState));

await page.click('#modeModal [data-mode="auto"]');
await sleep(300);
const readyState = await page.evaluate(() => ({
readyShown: document.getElementById('battleReady').hidden === false,
meta: document.getElementById('brFoeMeta').innerHTML,
}));
ok('准备层显示且带标记', readyState.readyShown && readyState.meta.includes(''), readyState.meta.slice(0, 80));

await page.click('#btnBattleStart');
await page.waitForFunction(() => window.B && B.phase === 'fight', null, { timeout: 8000});
const bState = await page.evaluate(() => ({ spar: B.spar, foeKey: B.foe.key, lastMatchDay: S.lastMatchDay}));
ok('约战开战（B.spar=true / 对手=宿敌 / lastMatchDay 未写）', bState.spar === true && bState.foeKey === 'opp_counter' && bState.lastMatchDay === before.lastMatchDay, JSON.stringify(bState));

/* 打几秒真实回合再强制终局（胜）：used 记账后 finishBattle */
await page.evaluate(() => { B.me.used.straight = 6; B.me.used.jab = 4;});
await sleep(1200);
await page.evaluate(() => { B.foe.hp = 0; finishBattle();});
await page.waitForFunction(() => document.getElementById('settleModal').classList.contains('open'), null, { timeout: 12000});
const after = await page.evaluate(() => ({
money: S.money, wins: S.wins, losses: S.losses, rank: S.rank, fame: S.fame, ap: S.ap,
affRival: S.story.affinity.rival, expStraight: S.punchExp.straight,
sparFights: S.sparFights, sparRival: S.sparRival, sparCount: S.sparCount,
settleTitle: document.getElementById('settleTitle').textContent,
settleResult: document.getElementById('settleResult').textContent,
settleDesc: document.getElementById('settleDesc').textContent,
settleTable: document.getElementById('settleTable').textContent.replace(/\s+/g, ' '),
rivalLockedWhy: (sparTargets().find((t) => t.key === 'opp_counter') || {}).why || '',
}));
ok('结算窗为约战专属（标题/结果/说明口径正确）',
after.settleTitle.includes('约战') && after.settleResult.includes('约战') && after.settleTable.includes('不计入正式战绩'),
after.settleTitle + ' / ' + after.settleResult + ' / ' + after.settleDesc.slice(0, 60));
ok('经济核账：金钱不变（约战奖金 0 < 同期正式赛获胜奖金 ¥' + before.formalPrizeIfWin + '）',
after.money === before.money && before.formalPrizeIfWin > 0, `money ${before.money}→${after.money}`);
ok('战绩核账：胜负场/排名/名声全不变、AP 只扣约战的 2',
after.wins === before.wins && after.losses === before.losses && after.rank === before.rank && after.fame === before.fame && after.ap === before.ap - 2,
JSON.stringify({ w: after.wins, l: after.losses, r: after.rank, ap: after.ap}));
ok('经验半额：直拳 used=6 → 经验 +6（正式赛口径应为 +12）', after.expStraight - before.expStraight === 6, `exp ${before.expStraight}→${after.expStraight}`);
ok('宿敌好感 +8（胜，与正式赛同口径）且计数落盘（sparFights=1 / sparRival=1 / 本周 1 场）',
after.affRival - before.affRival === 8 && after.sparFights === 1 && after.sparRival === 1 && after.sparCount === 1,
JSON.stringify({ aff: after.affRival - before.affRival, f: after.sparFights, r: after.sparRival, c: after.sparCount}));
ok('每周同对手锁定：赛后宿敌行标注「本周已约战过她」', after.rivalLockedWhy.includes('本周已约战'), after.rivalLockedWhy);
ok('零 JS 报错', errs.length === 0, errs.join(' | ').slice(0, 300));

console.log(fails === 0? '\n约战实玩全过': `\n约战实玩失败 ${fails} 项`);
await browser.close();
srv.close();
process.exit(fails? 1: 0);
