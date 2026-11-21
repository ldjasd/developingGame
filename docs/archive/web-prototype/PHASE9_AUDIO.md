# Phase 9 · 音效/音乐完整化记录

> 2026-11-02 落地。范围：只加声音，不改任何玩法/数值/文案逻辑；全部 Web Audio 现场合成，零外部音频文件、零网络资源；存档结构不动（BGM 状态只存内存，不入存档）。冒烟 80/80 全过（每套 40 条，新增 3 条音频断言 × 工程版/dist 版）。

## 1. BGM 实现（js/audio.js）

轻量循环 sequencer `BGM`：

- 接口：`BGM.start('daily' | 'battle')` / `BGM.stop()`；`BGM.track` 为当前曲目名（同曲目重复 start 为无操作，不重启）。
- 调度：`setInterval` 90ms tick，前瞻 0.25s 排音；每步为八分音符，步长 = 60/BPM/2；每个音符仍走原有 `playTone`/`playNoise`（自带 muted 守卫与 AudioContext 解锁/恢复）。
- 静音与隐藏：现有顶部静音按钮切换的全局 `muted` 同时管 BGM 与 SFX（不新增开关）——`playTone`/`playNoise` 本就检查 `muted`，调度器在 `muted` 或 `document.hidden` 时只推进时间锚点、不创建任何振荡器/噪声节点，不空转发声。固有尾音：已排进 0.25s 前瞻窗的极少数音符无法撤回（<0.25s）。
- Autoplay 合规：不在页面加载时出声；文件末注册一次性语义的首次手势监听（`pointerdown`/`keydown`，`bgmUnlocked` 标志）——第一次用户手势时若未在播任何曲目，默认起日常曲。进战斗由战斗侧显式切曲（该点击本身也是手势）。

### 两套曲目（4 小节 × 8 步循环，音高以 MIDI 号定义、`mtof` 换算）

| 曲目 | BPM | 和弦进行 | 编配 | 音量取向 |
|---|---|---|---|---|
| 日常 `daily` | 76 | Am7 – Fmaj7 – Cmaj7 – G | 小节首三角波低音（峰值 0.055）、偶数步正弦和弦琶音（0.022）、稀疏三角波主旋律（0.038） | 低音量、慢速轻松，拳馆日常 |
| 战斗 `battle` | 140 | Dm – B♭ – F – C | 每步驱动低音（八度跳，0.075）、0/4 步合成底鼓（110→48Hz 滑音，0.10）、奇数步高通踩镲噪声（0.016）、0/3/6 步和弦 stab（0.016/音）、方波主旋律（0.018） | 略高于日常、更快更紧凑，擂台氛围 |

### 切换接入点

| 落点 | 文件 | 动作 |
|---|---|---|
| 首次用户手势 | audio.js 文件末监听 | `BGM.start('daily')`（仅当尚无曲目） |
| 进入战斗 `startBattle` | battle.js 开场 | `BGM.start('battle')`（与开场铃同处，在既有 `audio()` 解锁之后） |
| 战斗结束 `finishBattle` | battle.js | `BGM.start('daily')`（结算窗仍在战斗视图上，但胜负已定即切回） |
| 结算确认回日常 `btnSettleOk` | game.js | `BGM.start('daily')`（幂等保险） |
| 切存档/测试档回日常 `leaveBattleToDaily` | game.js | `BGM.start('daily')`（幂等保险） |
| 模拟跳过 `simulateBattle` | — | 不切曲：无战斗视图、瞬间结算，保持当前（通常日常）曲目 |

## 2. 新增音效清单与落点（全部挂进 SFX，合成参数见 audio.js）

| 音效 | 合成方式 | 落点 |
|---|---|---|
| `roundStart(times)` | 复用原 `bell` 音色（开场 2 声 / 回合间 1 声） | battle.js：`startBattle` 开场、`endBreak` 下回合开始（原 `SFX.bell` 调用改名，音色与次数不变） |
| `roundEnd()` | `bell` 1 声 | battle.js：`startBreak` 回合结束（同上改名） |
| `finalBell()` | `bell` 3 声 | battle.js：`finishBattle` 非 KO 终场（同上改名） |
| `countTick(n)` | 方波短 beep（620/710/800Hz，随剩余秒数升高）+ 带通噪声咔哒 | battle.js：`startKnockdown` 击倒瞬间第一记（3 秒），`tickDown` 内以新增 `B._countShown` 记录已播数字、每跳一秒补一记（现成计时落点） |
| `countSuccess()` | 三角波上行两音 523→784Hz | battle.js：`resolveKnockdown` 常规起身、`resolveTKOChoice` 死战起身两处 |
| `countFail()` | 三角波/正弦下行两音 392→196→98Hz | battle.js：`resolveTKOChoice` 判负分支一处 |
| `koCheer()` | 原 `crowd` 三层噪声 + C 大调三和弦衬底 | battle.js：`koFx()` 内替换原 `SFX.crowd()` 调用（KO 演出，胜负双方通用的人群惊呼）；`SFX.heavy()` 保留 |
| `victory()` | 短人群噪声 + C-E-G-C 胜利四音 | battle.js：`finishBattle` 非 KO 且获胜时（KO 胜利由 `koCheer` 覆盖，不叠加） |
| `achievement()` | 正弦 C-E-G-C 琶音 + 高音泛音 | game.js：`checkAchievements` 非静默分支（有新解锁时，与 toast 同处一条）；静默追溯模式不发声 |
| `buy()` | 方波双音「金币」988→1319Hz | ui.js：商店三处购买成功的 `onOk`——`buyGear`、`buyConsumable`、`confirmCustomBuy`（定制） |
| `click()` | 带通噪声 + 三角波极短轻点 | ui.js：通用确认框确定键 `btnCfOk` 一处（见取舍） |

回合铃说明：开场/回合开始/回合结束/终场四处在本次之前已有 `SFX.bell` 调用，本次只是改名为语义化包装（音色、次数、落点均未变），并补齐此前真正缺失的读秒/KO 胜利/成就/购买四类。

## 3. 取舍与遗留

- **按钮点击音只挂一个点**：全游戏所有消耗确认都汇聚到通用确认框的确定键 `btnCfOk`，只挂它即可覆盖「主要确认按钮」，不在每个按钮上全局挂监听（避免导航/翻页/选训练项时满屏点击声）。取消键、关闭键、日常导航按钮均不发声。
- **工坊打造/强化/拆解未挂 `buy`**：任务口径为「商店购买成功落点」，工坊不是商店购买，未挂；如后续想统一，可在 `confirmCraft`/`confirmEnhance` 的成功分支各加一行 `SFX.buy()`。
- **模拟模式不切战斗曲、不播回合铃**：模拟是瞬间结算、无擂台视图，播任何战斗声音都与画面不符，保持只有结算既有反馈。
- **BGM 不入存档、刷新页面后不自动续播**：必须等首次手势（autoplay 限制），手势后默认日常曲；战斗中刷新本来就会丢失未结算的 B 状态（既有行为），无额外处理。
- **静音前瞻尾音 <0.25s**：点静音后已排定的极少数音符会自然衰减完，属前瞻调度固有现象，未做节点级追踪取消（复杂度不值得）。
- **jsdom 无真实 AudioContext**：所有入口沿用 `audio()` 的 try/catch 守卫返回 null 后直接跳过，冒烟已断言 muted 与 unmuted 两种状态下逐个调用不抛错；真实浏览器的听感（音量平衡/曲目氛围）需真机试听后微调，参数集中在 audio.js 的 `BGM_TRACKS` 与各 SFX 峰值，改一处即可。

## 4. 测试

`tests/smoke.mjs` 新增 3 条/套（工程版 + dist 版共 +6）：

1. BGM 为对象且 `start`/`stop` 为函数、11 个新 SFX 均为函数；
2. `muted=true` 时 `BGM.start('battle'→'daily')` 曲目状态正确、全部新 SFX 调用不抛错、`BGM.stop()` 清空曲目；
3. 无 AudioContext（jsdom）且 unmuted 时，BGM + 全部旧/新 SFX 逐个调用不抛错。

结果：`npm run build && npm test` → **80 通过 / 0 失败**（基线 74 + 新增 6）。
