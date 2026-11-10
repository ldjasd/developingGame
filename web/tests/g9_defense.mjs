// 正式版批次 G9 短期验收：卫冕循环完整链路（Playwright + Chromium headless shell）
// 真实 DOM 流程：已登顶存档进游戏 → 挑战自动生成 → 比赛屏金色挑战卡 → 应战（模式弹窗/准备层）→
// 开战 → 强制终局（胜）→ 卫冕计数 +1 / 奖金按正式赛口径 / stage 6 进度推进；
// 次周再战强制落败 → 排名按正式赛口径掉名次、影响力重算、冠军易主；打回第 1 名后新挑战再来；
// 第三次卫冕胜利触发 stage 6 完成（登顶后获胜 3 场，含卫冕战胜利）。全程零 JS 报错。
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

/* 造档：已登顶的冠军（stage 6 进行中、champWinBase=29 → 登顶后获胜 1/3）、属性给足 */
await page.evaluate(() => {
S.story.prologueDone = true;
  S.story.seenEvents = ['ev_stage2', 'ev_stage3', 'ev_stage4', 'ev_stage5', 'ev_top25', 'ev_top10', 'ev_champ', 'ev_firstwin', 'ev_firstko', 'ev_firstkoed']; // 真实冠军档早已看过这些里程碑，避免剧情窗挡住卫冕流程
S.wins = 30; S.losses = 2; S.rank = 1; S.stage = 6;
S.completedStages = [1, 2, 3, 4, 5]; S.champWinBase = 29; S.titles = ['国内冠军'];
S.day = 36; S.ap = 6; S.money = 5000; S.stamina = 100; S.injury = 0; S.lastMatchDay = 0;
ATTRS.forEach((a) => { S.attrs[a.key] = 45;});
ensureRoster(); save();
});
await page.evaluate(() => enterGame());
await sleep(300);
const spawn = await page.evaluate(() => ({
ch: S.defenseChallenge, defenses: S.defenses,
memberOk: S.defenseChallenge? S.roster.some((m) => m.key === S.defenseChallenge.key && m.rank >= 2 && m.rank <= 6): false,
}));
ok('登顶存档进游戏即生成卫冕挑战（挑战者为第 2~6 名具名角色）',
!!spawn.ch && spawn.memberOk && spawn.defenses === 0, JSON.stringify(spawn.ch));

await page.evaluate(() => gotoScene('match')); // 走真实导航入口（gotoScene）
await sleep(300);
const card = await page.evaluate(() => {
const el = document.getElementById('defenseCard');
return { shown: el.style.display!== 'none', text: el.textContent.replace(/\s+/g, ' ').slice(0, 160), hasBtn:!!document.getElementById('btnDefense')};
});
ok('比赛屏金色挑战卡呈现（挑战者名＋宣言＋应战按钮）',
card.shown && card.hasBtn && card.text.includes(spawn.ch.name) && card.text.includes('卫冕战挑战'), card.text);

const before1 = await page.evaluate(() => ({
money: S.money, wins: S.wins, losses: S.losses, rank: S.rank, lastMatchDay: S.lastMatchDay,
prizeFull: prizeForRank(weekOf(S.day)), influence: refreshInfluence(),
}));
await page.click('#btnDefense');
await sleep(300);
const modeState = await page.evaluate(() => ({
open: document.getElementById('modeModal').classList.contains('open'),
title: document.getElementById('modeTitle').textContent,
simShown: document.querySelector('#modeModal [data-mode="sim"]').style.display === '',
foeLine: document.getElementById('modeFoeLine').textContent,
flag: nextBattleDefense,
}));
ok('应战模式弹窗（标题=卫冕战 / sim 可见=正式规格 / 宣言上弹窗 / 标记置位）',
modeState.open && modeState.title.includes('卫冕战') && modeState.simShown && modeState.flag === true && modeState.foeLine.includes(spawn.ch.name),
JSON.stringify(modeState));
await page.click('#modeModal [data-mode="auto"]');
await sleep(300);
const readyState = await page.evaluate(() => ({
readyShown: document.getElementById('battleReady').hidden === false,
meta: document.getElementById('brFoeMeta').innerHTML,
}));
ok('准备层带卫冕战标记（计战绩/奖金口径）', readyState.readyShown && readyState.meta.includes(''), readyState.meta.slice(0, 120));
await page.click('#btnBattleStart');
await page.waitForFunction(() => window.B && B.phase === 'fight', null, { timeout: 8000});
const bState = await page.evaluate(() => ({ defense: B.defense, foeKey: B.foe.key, lastMatchDay: S.lastMatchDay, spar: B.spar}));
ok('卫冕战开战（B.defense=true / 对手=挑战者 / 不占每周正式赛位）',
bState.defense === true && bState.foeKey === spawn.ch.key && bState.spar === false && bState.lastMatchDay === before1.lastMatchDay,
JSON.stringify(bState));
await sleep(1200);
await page.evaluate(() => { B.foe.hp = 0; finishBattle();});
await page.waitForFunction(() => document.getElementById('settleModal').classList.contains('open'), null, { timeout: 12000});
const after1 = await page.evaluate(() => ({
money: S.money, wins: S.wins, losses: S.losses, rank: S.rank, defenses: S.defenses,
challenge: S.defenseChallenge, defenseWeek: S.defenseWeek, week: weekOf(S.day),
achDefend1:!!S.achievements.defend_1,
stageItem: stageProgressItems(6).filter((it) => it.label === '卫冕战').map((it) => it.text).join(''),
settleTitle: document.getElementById('settleTitle').textContent,
settleTable: document.getElementById('settleTable').textContent.replace(/\s+/g, ' '),
settleDesc: document.getElementById('settleDesc').textContent,
}));
ok('卫冕胜结算：计数 +1（defenses=1）/ 战绩 +1 胜 / 排名仍第 1 / 挑战清场 / 本周已战落盘',
after1.defenses === 1 && after1.wins === before1.wins + 1 && after1.losses === before1.losses &&
after1.rank === 1 && after1.challenge === null && after1.defenseWeek === after1.week,
JSON.stringify({ d: after1.defenses, w: after1.wins, r: after1.rank, wk: after1.defenseWeek}));
ok('卫冕胜奖金按正式赛出场费口径（money 增量 = prizeForRank 全额 ¥' + before1.prizeFull + '）',
after1.money - before1.money === before1.prizeFull, `money ${before1.money}→${after1.money}`);
ok('卫冕胜呈现：结算含卫冕成功行与尾句 / 成就 defend_1 解锁 / stage 6 卫冕行 1/3',
after1.settleTable.includes('卫冕成功') && after1.settleDesc.includes('王座又守住了一次') &&
after1.achDefend1 === true && after1.stageItem.includes('1 / 3'),
after1.settleTitle + ' / ' + after1.stageItem);

/* 次周：新挑战生成 → 强制落败 → 冠军易主（排名/影响力走现行口径） */
await page.click('#btnSettleOk'); // 走真实结算确认（清 B、回据点、render）
await sleep(300);
await page.evaluate(() => { S.day += 7; S.stamina = 100; maybeDefenseChallenge(); });
await sleep(200);
const spawn2 = await page.evaluate(() => ({ ch: S.defenseChallenge, week: weekOf(S.day)}));
ok('次周新挑战生成（defenseWeek 冷却已过）',!!spawn2.ch && spawn2.week === after1.week + 1, JSON.stringify(spawn2.ch));
const before2 = await page.evaluate(() => ({ money: S.money, wins: S.wins, losses: S.losses, defenses: S.defenses, influence: refreshInfluence()}));
await page.evaluate(() => startDefense());
await sleep(200);
await page.click('#modeModal [data-mode="auto"]');
await sleep(200);
await page.click('#btnBattleStart');
await page.waitForFunction(() => window.B && B.phase === 'fight' && B.defense === true, null, { timeout: 8000});
await sleep(1200);
await page.evaluate(() => { B.me.hp = 0; finishBattle();});
await page.waitForFunction(() => document.getElementById('settleModal').classList.contains('open'), null, { timeout: 12000});
const after2 = await page.evaluate(() => ({
losses: S.losses, defenses: S.defenses, rank: S.rank, influence: refreshInfluence(),
challenge: S.defenseChallenge,
settleTable: document.getElementById('settleTable').textContent.replace(/\s+/g, ' '),
settleDesc: document.getElementById('settleDesc').textContent,
}));
ok('卫冕败结算：负场 +1 / 卫冕计数不变 / 冠军易主（名次跌出第 1）/ 影响力按现行口径重算（Lv5→Lv4）/ 挑战清场',
after2.losses === before2.losses + 1 && after2.defenses === before2.defenses && after2.rank > 1 && after2.influence === 4 && after2.challenge === null,
JSON.stringify({ l: after2.losses, d: after2.defenses, r: after2.rank, inf: after2.influence}));
ok('卫冕败呈现：结算含「冠军易主」行与爬回来尾句',
after2.settleTable.includes('冠军易主') && after2.settleDesc.includes('爬回来的人才配叫传奇'),
after2.settleDesc.slice(0, 80));

/* 打回第 1 名 → 再过一周 → 新挑战再来；赢下 → stage 6 完成（登顶后获胜 3 场含卫冕战胜利） */
await page.click('#btnSettleOk');
await sleep(300);
await page.evaluate(() => {
  applyRankShift(1); S.day += 7; S.stamina = 100; maybeDefenseChallenge();
});
await sleep(200);
const spawn3 = await page.evaluate(() => ({ ch: S.defenseChallenge, rank: S.rank}));
ok('打回第 1 名后新挑战再来（可再打回来）', spawn3.rank === 1 &&!!spawn3.ch, JSON.stringify(spawn3.ch));
const before3 = await page.evaluate(() => ({ money: S.money, wins: S.wins, stage: S.stage}));
await page.evaluate(() => startDefense());
await sleep(200);
await page.click('#modeModal [data-mode="auto"]');
await sleep(200);
await page.click('#btnBattleStart');
await page.waitForFunction(() => window.B && B.phase === 'fight' && B.defense === true, null, { timeout: 8000});
await sleep(1200);
await page.evaluate(() => { B.foe.hp = 0; finishBattle();});
await page.waitForFunction(() => document.getElementById('settleModal').classList.contains('open'), null, { timeout: 12000});
const after3 = await page.evaluate(() => ({
wins: S.wins, defenses: S.defenses, stage: S.stage, completed: S.completedStages,
titles: S.titles, winsAfterChamp: winsAfterChamp(S), achDefend3:!!S.achievements.defend_3,
}));
ok('第三场卫冕胜：defenses=2 / 登顶后获胜 3 场达成 → stage 6 完成（stage=7、传奇称号到手）',
after3.defenses === 2 && after3.winsAfterChamp === 3 && after3.stage === 7 &&
after3.completed.includes(6) && after3.titles.includes('传奇'),
JSON.stringify({ d: after3.defenses, wac: after3.winsAfterChamp, st: after3.stage, t: after3.titles}));
ok('零 JS 报错', errs.length === 0, errs.join(' | ').slice(0, 300));

console.log(fails === 0? '\n卫冕循环完整链路全过': `\n卫冕循环链路失败 ${fails} 项`);
await browser.close();
srv.close();
process.exit(fails? 1: 0);
