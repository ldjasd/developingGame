# Phase 7.5 代码工程化 v2 · 前两步细拆记录

> 日期：2026-11-02。工程：`~/workspace/game/boxing/web/`（唯一源码工程）。
> 原则：严格按 web/README.md 的「v2 细拆路线」与编辑约定执行——逐字搬运、零行为改动、零数值改动、零文案改动；不碰 ts-spaces 发布副本、不发布、不推 git；存档 key（`boxing-phase1-save-v1`）与 S 结构未动。

## 结论

v2 路线第 1、2 步均已完成并通过全套冒烟：

1. **audio.js**：音效合成区段已从 game.js 搬出。
2. **story-engine.js**：Phase 7 剧情引擎区段已从 game.js 搬出。

两步均为普通脚本（全局作用域）逐字搬运，加载顺序更新为
`data.js → story.js → audio.js → story-engine.js → game.js`。

## 基线（拆分前）

- `npm run build` 成功（dist/index.html 307453 字节）；`npm test` **42 通过 / 0 失败**（工程版 21 项＋dist 版 21 项）。
- game.js 3469 行。

## 第 1 步：audio.js（音效）

- **搬运范围**：game.js 原第 1921–1970 行，共 50 行——区段头注释 `/* ================= 音效（Web Audio 现场合成，无外部文件） ================= */` 起，含 `var AC / muted`、`audio()`、`noiseBuffer()`、`playNoise()`、`playTone()`、`var SFX = {...}`（止于其闭合 `};`）。区段后原有的空行分隔保留在 game.js 中，接缝为 `blog()` 闭合 → 空行 → 「打击反馈」区段头，无残缺。
- **新文件**：`js/audio.js` 52 行＝2 行装配文件头（`'use strict';`＋来源说明注释，沿用 data.js/story.js 的既有格式）＋50 行原文逐字。
- **耦合核查**：区段外对本区段的引用全部发生在函数体/事件回调内（战斗流程与触屏代码调用 `audio()`、`SFX.*` 共十余处；事件绑定里对 `muted` 的赋值 `muted = !muted` 一处）。普通脚本顶层 `var`/函数声明跨文件共享全局，运行时解析，加载期无求值顺序依赖。audio.js 放在 game.js 之前加载，全局声明先于初始化代码建立。
- **引用更新**：`index.html` 壳在 story.js 与 game.js 之间插入 `<script src="js/audio.js">`；`scripts/build-single.mjs` 的打包清单 `jsParts` 与壳引用行组 `SCRIPT_TAGS` 同步加入 audio.js（顺带把其报错文案「三行 script 引用」改为不写死行数的「script 引用行组」）。
- **tests/smoke.mjs**：无需改动——它按 index.html / dist 入口整页加载、断言运行时全局，不断言文件清单。
- **验证**：`npm run build` 成功（dist 307553 字节）；`npm test` **42 通过 / 0 失败**，与基线一致。

## 第 2 步：story-engine.js（Phase 7 剧情引擎）

- **搬运范围**：game.js 原第 477–746 行，共 270 行——区段头注释 `/* ================= Phase 7：剧情 / 恋爱线（可选，不理会无惩罚） =================`（含其下 3 行存档说明注释）起，含 `storyState()`、`storyQueue`、`queueStory()` / `queueStoryRepeat()`、`addAffinity()`、`applyStoryFx()`、对白弹窗引擎（`curStory`、`storySet()`、`storyBtns()`、`openStoryEvent()`、`renderStoryPage()`、`chooseStoryChoice()`、`closeStoryEvent()`、`showStoryEventIfPending()`、`showNextPendingModal()`）、状态页关系区（`affTierName()`、`renderRelations()`）、序章引擎（`proState`、`startPrologue()`、`renderProScene()`、`proPunch()`、`proChoice()`、`renderProSpar()`、`finishPrologue()`，止于其闭合 `}`）。数据本就在 story.js，未动。接缝为阶段弹窗函数闭合 → 空行 →「Phase 2：伤病 debuff」注释，无残缺。
- **新文件**：`js/story-engine.js` 272 行＝2 行装配文件头＋270 行原文逐字。
- **耦合核查**：
  - 区段向外引用：`S`、`clamp()`、`$()`、`save()`、`render()`、`toast()`、`rnd()`、`changeMind()`、`attrNameOf()`、战斗状态 `B`、以及弹窗链上游的 `showStageModalIfPending()` / `showAchModalIfPending()`——全部只在函数体内运行时调用，五个脚本加载完毕后统一解析，无加载期依赖。
  - 区段被外引用：结算（settleNow）调用 `queueStory()` / `addAffinity()`、渲染调用 `renderRelations()`、事件绑定调用 `showNextPendingModal()` / `finishPrologue()` / 读 `proState`、初始化调用 `startPrologue()`——同上，均为运行时调用。
  - **需备案的一处**：game.js 的重置/测试档处理里有两处对剧情队列的裸赋值（原第 3337 行 `storyQueue = []; curStory = null;`、原第 3411 行 `storyQueue = [];`）。它们依赖 `var storyQueue` / `var curStory` 的全局声明存在（严格模式下给未声明变量赋值会抛错）。声明随区段搬入 story-engine.js 后仍是顶层 `var` 全局声明、且在 game.js 之前加载，语义与拆分前完全一致，冒烟与下方探针均无脚本错误。此点也是 story-engine 必须排在 game.js 之前加载的原因（初始化段在 game.js 末尾直接调用 `startPrologue()`，不能后置）。
- **引用更新**：`index.html` 在 audio.js 与 game.js 之间插入 `<script src="js/story-engine.js">`；`build-single.mjs` 的 `jsParts` 与 `SCRIPT_TAGS` 同步加入，顺序与壳一致。
- **验证**：`npm run build` 成功（dist 307664 字节）；`npm test` **42 通过 / 0 失败**，与基线一致。

## 等价性证据

- **逐行多重集比对**（沿用 v1 方法）：拆分前 data.js＋story.js＋game.js 非空行 3903 行；拆分后 data.js＋story.js＋audio.js＋story-engine.js＋game.js 非空行 3907 行。差集仅为新增的 4 行装配文件头（每个新文件 2 行：`'use strict';` 各 +1、来源说明注释各 +1），**丢失行 0、改动行 0**。
- **唯一性检查**：`var SFX`、`var AC`、`var storyQueue`、`function startPrologue`、`function openStoryEvent`、`function finishPrologue` 在 dist/index.html 中各出现恰 1 次，在 game.js 中为 0 次（无重复定义、无残留）。
- **运行时探针**（一次性 jsdom 探针，跑完已删除，未留测试文件）：工程版整页加载脚本错误 0；`typeof audio === 'function'`、`SFX` 为对象且 light/heavy/bell/crowd 均为函数、`muted` 为 boolean、`playTone/playNoise` 为函数；`storyState/queueStory/addAffinity/openStoryEvent/renderRelations/startPrologue/finishPrologue/showNextPendingModal` 均为函数。
- 冒烟三轮结果（基线／第 1 步后／第 2 步后）均为 **42 通过 / 0 失败**。

## 最终文件行数（js/）

| 文件 | 行数 | 说明 |
|---|---|---|
| js/data.js | 311 | 未动 |
| js/story.js | 193 | 未动 |
| js/audio.js | 52 | 新增（2 行文件头＋50 行原文） |
| js/story-engine.js | 272 | 新增（2 行文件头＋270 行原文） |
| js/game.js | 3149 | 3469 − 50（audio）− 270（story-engine） |
| 合计 | 3977 | |

## 遗留与下一步

- 无卡点、无回退：两步均一次通过，未出现耦合导致的冒烟失败，未改任何逻辑绕过。
- v2 路线后续（未做，留待后续批次）：第 3 步 battle.js（战斗区段，体量最大、耦合最深，README 要求拆前先补战斗冒烟断言）、第 4 步 ui.js（日常界面/训练/确认框/外出/状态页/工坊等渲染区段）；其余（状态与存档、工具、事件绑定、测试档、初始化）保留为 game.js 核心。
- 本次未更新 web/README.md 的目录结构表（其「目录结构」仍只列 data/story/game 三个 js）；拆分映射以本文件为准，后续批次可一并回填 README。
- 未做发布（dist 仅为本地打包产物）、未推送 git。

---

# Phase 7.5 代码工程化 v2 · 后两步细拆记录（battle.js / ui.js）

> 日期：2026-11-02（同日续）。工程：`~/workspace/game/boxing/web/`。
> 原则同前两步：逐字搬运、零行为改动、零数值改动、零文案改动（单次 KO 阈值 30% 等用户拍板数值未动）；不碰 ts-spaces 发布副本、不发布、不推 git；存档 key（`boxing-phase1-save-v1`）与 S 结构未动。
> 本节为追加记录，前两步记录（上文）未改动。

## 结论

v2 路线第 3、4 步均已完成并通过全套冒烟，v2 细拆至此全部收尾：

3. **battle.js**：战斗区段已从 game.js 搬出（1334 行原文）。
4. **ui.js**：日常 UI 区段已从 game.js 搬出（886 行原文）。

外加一步使能拆分：**tools.js**（工具区段 20 行原文）——原因见下方耦合记录，是这两步能干净成立的前提。最终加载顺序为
`data.js → story.js → audio.js → story-engine.js → tools.js → ui.js → battle.js → game.js`。

## 拆前补战斗冒烟断言（tests/smoke.mjs，每套 +6，共 21→27 项）

未拆状态先补断言并跑基线，全过后才动拆分。新增 6 项（工程版＋dist 版各一份）：

1. **战斗全局就位**：startBattle / tick / manualTick / renderBattle / finishBattle / playerPunch / tryAttack / dealDamage 均为函数，MPUNCH 为 8 拳种。
2. **手动战斗可开局（状态）**：startBattle('manual') 后 B.mode=manual、phase=fight、round=1、对手是角色池真人。
3. **手动开局视图切换**：battleView 显示 / dailyView 隐藏 / manualPanel 可见 / 双方 HP 为正且不超上限。断言后 clearInterval 停表、B=null 并恢复视图显示，不结算不记账。
4. **模拟结算一致性**：simulateBattle 后奖金到账（money 增加）、S.lastMatchDay=今日、B.mode=sim 且 phase=over（与原有「结算窗弹出／战绩 +1」断言互补）。
5. **自动战斗 tick 在推进**：在重读存档的页面上 startBattle('auto')，等 1200ms 后 B.tickCount ≥ 1 且 B.time > 0。
6. **自动战斗一局可结算**：把对手 HP 清零后走 finishBattle 的 KO 结算路径，等 2300ms 后 phase=over、result.win=true、战绩 +1、结算窗弹出。

**基线（未拆状态＋新断言）**：`npm run build` 成功（dist 307664 字节，与前两步收尾一致）；`npm test` **54 通过 / 0 失败**（27×2）。

## 耦合实测：为什么多拆一个 tools.js

拆前对两个目标区段做了加载期语句扫描（brace-depth 扫描＋逐行核对），发现一对互相咬合的加载期依赖：

- **battle 区段**含 3 处加载期语句：键盘 keydown/keyup 监听注册（只用 `document`，安全），以及触屏 `bindTouchControls` IIFE——它在**加载时立即调用 `$('joyBase')`** 并对各触屏按钮调用 `$()` 注册监听。ui 区段同样含 3 行加载期语句：确认框的 `btnCfCancel` / `confirmModal` / `btnCfOk` 监听注册，加载时调用 `$()`（且直接引用同区段的 closeConfirm 函数引用）。
- **`$` 的定义在 game.js 的「工具」区段**（原第 567 行）。若 battle/ui 排在 game.js 之前加载，IIFE 与确认框绑定会在 `$` 未定义时抛 ReferenceError：触屏/确认框绑定丢失（行为改变），且脚本错误入账。
- 反过来，**game.js 的事件绑定区段在加载时直接以函数引用注册** ui 的 openStatus/closeStatus/confirmWork/confirmRest/confirmSleep/confirmMatch 与 battle 的 cancelKeysModal/useCombo/useWall/useClinch/endBreak，初始化区段又在加载时调用 ui 的 render()；若 battle/ui 排在 game.js 之后，这些引用在求值时同样抛错，且初始化不会执行。单靠调整引用顺序无解。

**解法（仍为纯逐字搬运）**：「工具」区段本身是独立区段标题的连续块（原第 566–585 行：`$` / clamp / rnd / toastTimer / toast / dailyLog / renderDailyLog），在原单文件中本来就位于 ui、battle 两个区段之前，且自身无加载期外部依赖（只有 `var toastTimer = null` 与函数声明）。把它一并逐字拆为 tools.js、排在 ui/battle 之前、game.js 之前，三个文件的加载期依赖恰好按原文件的相对先后全部满足，语义与单文件时完全一致。此步使 README 原路线第 5 点微调：工具不再留在 game.js 核心，README 已同步回填说明原委。

另有两小块按区段标题边界**留在核心**（无独立区段标题、与其它代码交错，强拆即非逐字搬运）：

- 战斗常量与辅助（COUNTER_PREF、comboBonusPct、PUNCH_KO、KO_DECAY、BREAK_TACTICS、freshRoundStats、decayTrauma）位于「状态」区段之前，与角色池辅助及 SAVE_KEY / ROUND_SECONDS 等常量交错；它们的引用全部发生在函数体内，运行时解析，不影响 battle.js 先于 game.js 加载。
- Phase 6 外观区段与「状态」同组（存档字段与渲染同段），留在核心；状态页主体渲染（renderStatus 等）在 ui 区段内，已随 ui.js 搬出。

## 第 3 步：battle.js（战斗）＋ tools.js（使能）

- **tools.js 搬运范围**：game.js 原第 566–585 行，共 20 行（区段头 `/* ================= 工具 ================= */` 起，至 renderDailyLog 闭合 `}`）。新文件 22 行＝2 行装配文件头＋20 行原文。拆后 game.js 3149→3129 行。
- **battle.js 搬运范围**：工具拆出后的 game.js 第 1454–2787 行，共 1334 行——区段头 `/* ================= 战斗 ================= */` 起，依次含战斗（makeFoe/styleOf/calcHitChance/myFighter/openModeModal/startBattle/blog）、打击反馈（hitstop/shakeRing/burstParticles/knockback/hitFx/koFx/setTactic）、Phase 4（反击窗口/连击/击倒读秒/TKO/tick/tryAttack/dealDamage/moveFighters/回合间 startBreak/endBreak/finishBattle/settleNow）、模式 3 模拟跳过（simulateBattle）、模式 1 手动操作（MPUNCH/playerPunch/tryDodge/foeTickManual/manualTick/键盘监听）、触屏控制（joy/resetJoy/joyUpdate/bindTouchControls IIFE/renderBattle/即时指令 useCombo/useWall/useClinch，止于 useClinch 闭合 `}`）。区段后的空行保留在 game.js 中，接缝为空行 →「事件绑定」区段头，无残缺。
- **新文件**：`js/battle.js` 1336 行＝2 行装配文件头＋1334 行原文。
- **耦合核查**：
  - 区段内状态：B、battleTimer、pendingFoe、MPUNCH、keysDown、joy 等战斗状态都定义在本区段内。区段向外引用（全部运行时）：`$`、clamp/rnd/toast/dailyLog（tools.js，已先加载）、S 与存档/属性辅助（game.js 核心，运行时）、audio/SFX（audio.js）、剧情队列 queueStory/addAffinity（story-engine.js）、render/renderDailyLog（ui/tools，settleNow 等运行时调用）、阶段检查 checkStageCompletion（核心，运行时）等，加载期均不求值。
  - 区段被外引用：game.js 事件绑定直接引用 cancelKeysModal/useCombo/useWall/useClinch/endBreak（加载期求值）与 startBattle/simulateBattle 等（回调内）；初始化不直接调用战斗函数。battle.js 排在 game.js 之前加载，声明先行建立。
  - 加载期语句：keydown/keyup 监听（仅 document）与 bindTouchControls IIFE（依赖 tools.js 的 `$`、本区段的 joy 与各按钮回调、audio.js 的 audio——均已先于或同文件就绪；DOM 元素在脚本之前已解析，与原单文件时点一致）。
- **引用更新**：`index.html` 在 story-engine.js 与 game.js 之间依次插入 tools.js、battle.js 两行；`scripts/build-single.mjs` 的 `jsParts` 与 `SCRIPT_TAGS` 同步，顺序一致。
- **验证**：`npm run build` 成功（dist 307893 字节）；`npm test` **54 通过 / 0 失败**；绑定探针 6/6（见下）。

## 第 4 步：ui.js（日常 UI）

- **搬运范围**：battle 拆出后的 game.js 第 567–1452 行，共 886 行——区段头 `/* ================= 日常界面 ================= */` 起，依次含日常界面（render）、训练计划（PLAN_POINTS/planSel/renderPlan/doPlanTrain）、行动确认框（askConfirm/closeConfirm 及三行按钮绑定、confirmWork/confirmRest/confirmSleep/confirmMatch、doWork/doRest/doSleep）、外出（定制拳套 customSel/updateCustomPreview/confirmCustomBuy、renderShop/buyGear/buyConsumable/doRelax）、状态界面/背包（bagTab/openStatus/closeStatus）、生涯概览/阶段与赞助卡（renderCareerDaily/renderStageCard/renderSponsorCard/signSponsor/cancelSponsor/renderRankBoard/renderStatus/图鉴/renderBag/拆解）、工坊打造（craftSel/craftNeeds/updateCraftPreview/confirmCraft/renderCraft、useConsumable，止于其闭合 `}`）。区段后空行保留在 game.js 中，接缝为空行 →「事件绑定」区段头，无残缺。
- **新文件**：`js/ui.js` 888 行＝2 行装配文件头＋886 行原文。
- **耦合核查**：
  - 加载期语句只有确认框三行绑定：依赖 tools.js 的 `$`（已先加载）与同文件的 closeConfirm 函数引用（同文件内声明、且原文顺序就在绑定之前），安全。
  - 其余向外引用（S、装备/阶段/赞助逻辑、battle 的 openModeModal/startBattle 等）全部在函数体内运行时解析；被外引用（game.js 事件绑定的 openStatus/closeStatus/confirmWork 等直接引用、初始化调用的 render）发生在 ui.js 加载之后。
- **引用更新**：`index.html` 与 `build-single.mjs` 在 tools.js 与 battle.js 之间插入 ui.js（保持原单文件中 ui 在 battle 之前的相对顺序）。
- **验证**：`npm run build` 成功（dist 308013 字节）；`npm test` **54 通过 / 0 失败**；绑定探针 6/6；运行时全局探针无缺失（见下）。

## 等价性证据

- **逐行多重集比对**：本轮拆分前（data＋story＋audio＋story-engine＋game）非空行 3907 行；拆分后 8 个 js 文件非空行 3913 行。差集仅为新增的 6 行装配文件头（tools/ui/battle 三个新文件各 2 行：`'use strict';` ×3、来源说明注释 ×3），**丢失行 0、改动行 0**。
- **唯一性检查**：`var B = null`、`function startBattle`、`function renderBattle`、`function simulateBattle`、`function $(id)`、`function render(`、`function askConfirm`、`function renderStatus`、`bindTouchControls`、`function useClinch` 在 dist/index.html 中各出现恰 1 次，在 game.js 中均为 0 次（无重复定义、无残留）。
- **绑定探针**（一次性 jsdom 探针，跑完已删除，未留测试文件）：拆分前基线与第 3 步后、第 4 步后各跑一次，均为 **6 通过 / 0 失败**——确认框：askConfirm 弹窗打开、点确认触发 onOk 并关窗、点取消不触发并关窗（验证 ui 区段加载期三行绑定真实生效）；触屏：手动战斗中对格挡按钮派发 pointerdown → touchBlock=true 且 B.meBlocking=true，pointerup → touchBlock=false（验证 battle 区段 bindTouchControls IIFE 真实生效）；三轮页面脚本错误均为 0，jsdom 诊断信息计数不变（1 条，与拆分前相同）。
- **运行时全局探针**（一次性 jsdom 探针，跑完已删除）：工程版整页加载脚本错误 0；tools/ui/battle/story-engine 的 28 个代表函数（$、clamp、toast、render、renderPlan、askConfirm、renderShop、openStatus、renderStatus、renderBag、renderCraft、startBattle、tick、manualTick、playerPunch、tryDodge、renderBattle、simulateBattle、finishBattle、useCombo、useWall、useClinch、endBreak、setTactic、startPrologue 等）typeof 均为 function，无一缺失；MPUNCH 8 拳种、B=null、isTouch 为 boolean。
- 冒烟四轮结果（补断言基线／第 3 步后／第 4 步后，及中途单独的 build 验证）均为 **54 通过 / 0 失败**。

## 最终文件行数（js/）

| 文件 | 行数 | 说明 |
|---|---|---|
| js/data.js | 311 | 未动 |
| js/story.js | 193 | 未动 |
| js/audio.js | 52 | 前两步拆出，未动 |
| js/story-engine.js | 272 | 前两步拆出，未动 |
| js/tools.js | 22 | 本轮新增（2 行文件头＋20 行原文） |
| js/ui.js | 888 | 本轮新增（2 行文件头＋886 行原文） |
| js/battle.js | 1336 | 本轮新增（2 行文件头＋1334 行原文） |
| js/game.js | 909 | 3149 − 20（tools）− 1334（battle）− 886（ui） |
| 合计 | 3983 | |

## 遗留与下一步

- 无卡点、无回退：两步（含使能的 tools 拆分）均一次通过，未改任何逻辑绕过。v2 细拆路线至此全部完成，game.js 只剩核心（前置工具函数与角色池辅助、状态与存档、Phase 6 外观、心态/装备、装备强化、阶段/影响力/赞助逻辑、事件绑定、测试档、初始化）。
- web/README.md 已回填：目录结构表、加载顺序与顺序约束说明、测试断言数（27 项/套）、v2 路线改为已完成并附本轮拆分映射表。
- 本次未做发布（dist 仅为本地打包产物）、未推送 git。
