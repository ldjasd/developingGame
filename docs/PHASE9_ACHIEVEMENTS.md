# Phase 9 · 成就系统（2026-11-02 落地）

源码工程 `web/` 内实现，`npm run build && npm test` 全过：**74/74**（工程版＋dist 版各 37 项；基线 54/54 之上新增成就断言 10 项/套）。未发布、未推 git（等汇总发布环节）。

## 成就清单（共 23 个，纯荣誉，不发任何数值/现金奖励）

定义在 `js/data.js` 的 `ACHIEVEMENTS`（含 id / 分类 / 名称 / 描述=条件 / check 函数），分类在 `ACH_CATEGORIES`。

### 战斗（8）
| id | 名称 | 条件（判定字段） |
|---|---|---|
| first_win | 初尝胜果 | 累计胜场 ≥1（S.wins） |
| wins_10 | 十胜俱乐部 | 累计胜场 ≥10 |
| wins_25 | 常胜之师 | 累计胜场 ≥25 |
| wins_50 | 半百荣光 | 累计胜场 ≥50 |
| first_ko | 一击入魂 | 累计 KO/TKO 胜场 ≥1（S.koWins，新计数器，见下） |
| ko_10 | KO 艺术家 | 累计 KO/TKO 胜场 ≥10 |
| streak_3 | 势如破竹 | 当前连胜 ≥3（S.winStreak；结算瞬间判定，连胜中断前必已解锁） |
| streak_5 | 无人能挡 | 当前连胜 ≥5 |

### 生涯（7）
| id | 名称 | 条件（判定字段） |
|---|---|---|
| rank_25 | 跻身前列 | 排名 ≤25（S.rank） |
| rank_10 | 国内十强 | 排名 ≤10 |
| rank_1 | 登顶国内 | 排名 =1 |
| influence_3 | 声名鹊起 | 影响力 Lv3 条件：胜场 ≥10 或排名 ≤25（与 computedInfluence 的 Lv3 档定义一致，直接按字段判，不依赖缓存档位） |
| influence_5 | 传奇之名 | 影响力 Lv5 条件：排名 =1 |
| stage_4 | 国内顶尖之路 | S.stage ≥4 或阶段 4 已完成 |
| stage_6 | 传奇之路 | S.stage ≥6 或阶段 6 已完成 |

### 装备 / 经营（5）
| id | 名称 | 条件（判定字段） |
|---|---|---|
| first_craft | 亲手打造 | S.customGear 中存在 source='craft' 的工坊打造件（商店定制为 'custom'，不计） |
| enh_5 | 千锤百炼 | 任意装备 S.enh 等级 ≥5 |
| enh_10 | 登峰造极 | 任意装备 S.enh 等级 ≥10 |
| dex_10 | 图鉴收藏家 | 图鉴登记 S.dexSigs ≥10 款。**与 DEX_ACH 的现金里程碑相互独立**：图鉴奖励照旧在图鉴系统内发放，成就只记录展示，不重复发奖 |
| sponsor_any | 商业首秀 | S.sponsor 非空（签约瞬间判定并落盘；事后解约不撤销成就。老存档若曾签约又解约，无字段可追溯，不补发） |

### 情感 / 剧情（3）
| id | 名称 | 条件（判定字段） |
|---|---|---|
| prologue_done | 命运的测力机 | S.story.prologueDone（跳过序章同样置真，与既有设计一致；老存档迁移时本就置真，会追溯解锁） |
| affinity_60 | 亲近信赖 | 任意角色好感 ≥60（S.story.affinity） |
| affinity_90 | 心意相通 | 任意角色好感 ≥90 |

### 未做的条目
- **累计赚取**：S 里没有累计收入字段，S.money 只是当前余额（花掉就降），拿它判定会误判。按规格「没有就跳过」，不新造统计口径。若以后想要，需在所有收入落点加累计计数，属于单独的埋点工作，列为建议。

## 新增计数器（单列说明）

- **S.koWins**（默认 0）：全游戏唯一为成就新增的字段。原先没有任何字段记录「累计 KO 胜场数」（wins 不分终结方式，ev_firstko 剧情标记只记首次且看过才落盘），无法判定 first_ko / ko_10，故在 `battle.js settleNow` 结算处纯计数写入：胜场且对手 HP ≤0（KO/TKO/模拟 KO 均为此形态）时 +1。**只写计数，不读它做任何胜负/数值判定，战斗公式与用户拍板数值（单次 KO 30% 等）未动。**
- 老存档无此字段：迁移时从 0 起算，历史 KO 数无从追溯，故老玩家 first_ko 需再赢一场 KO 才解锁（冒烟已断言这一行为），其余可由现有字段追溯的成就全部补发。

## 存储与迁移

- `S.achievements = { [id]: { day, week, text } }`，text 为解锁时「第 X 周 · Day Y」。
- `defaultState()` 新增 `achievements: {}`、`koWins: 0`；存档 key 不变。
- `load()` 迁移：achievements 缺失/非法 → {}，并剔除未知 id 与非对象条目；koWins 缺失/非法 → 0。
- 追溯判定：初始化读到老存档时 `checkAchievements(true)` 静默执行一次——已达成的直接补解锁，**不弹 toast，只汇总写一条 dailyLog**（「成就追溯：已有 N 项成就达成…」）；从备份恢复主存档时同样追溯一次。注意重读时阶段补结算可能先把生涯推进（如阶段 4），追溯随之多解锁对应阶段成就，属合法补登记。

## 判定入口（集中函数 checkAchievements，位于 game.js）

| 落点 | 文件 | 覆盖的成就 |
|---|---|---|
| 比赛结算 settleNow（阶段检查之后） | battle.js | 战斗全部、排名、影响力、阶段 |
| 装备强化成功后 | game.js confirmEnhance | enh_5 / enh_10 |
| 工坊打造成功后 | ui.js confirmCraft | first_craft、dex_10 |
| 商店购买 / 定制成功后 | ui.js buyGear / confirmCustomBuy | dex_10（登记新款式后） |
| 签约赞助成功后 | ui.js signSponsor | sponsor_any |
| 好感增加后 | story-engine.js addAffinity | affinity_60 / 90 |
| 序章完成（含跳过） | story-engine.js finishPrologue | prologue_done |
| 每周角色池重排后 | ui.js doSleep | 排名类（被动浮动进前 25/10 时） |
| 读档 / 恢复备份（静默追溯） | game.js 初始化 / restoreMainSave | 全部可追溯项 |

新解锁（普通模式）：每条写 dailyLog「🏆 成就解锁：XXX——条件。」并弹一条 toast「🏆 成就解锁：XXX」（同批多条时 toast 显示首条＋「等 N 项」，日志逐条完整）。

## 展示

状态页在「生涯阶段」卡下方新增「成就」卡：标题 tag 显示「已解锁 N / 23 · 纯荣誉，不发奖励」；卡内有总进度条，其后按四类分组用既有 dex-item 样式逐条列出——已解锁显示 🏆＋名称＋条件＋解锁时间（第 X 周 · Day Y），未解锁灰显（locked）显示名称＋「条件：…」＋「未解锁」。渲染函数 `renderAchievements()`（ui.js），由 renderStatus 调用。

## 测试（tests/smoke.mjs 新增 10 项/套）

新档 achievements 空对象＋koWins=0＋ACHIEVEMENTS ≥20；构造达标状态（10 胜/排名 20/3 连胜/koWins 1/强化 +5/好感 60）后对应 9 项解锁且记录含 day/week/text；重复判定不重复解锁；未达标 5 项不解锁；状态页成就区渲染（计数、已解锁名、未解锁灰显）；存档保存→重读后已有成就逐条逐字保留；删字段老存档迁移（补 {}、koWins=0）＋追溯解锁 wins_25/rank_10/affinity_90、无 KO 计数不补 first_ko、追溯日志恰 1 条。

## 奖励建议（未自作主张实施）

成就保持纯荣誉已按规格落地。若以后想给少量非经济奖励，建议只考虑：解锁数里程碑（5/10/15/23）各给一个展示性称号（如「奖杯陈列室」类），不给现金/属性，避免与阶段奖励、图鉴 DEX_ACH 的既有经济投放叠加失衡。是否做、称号名，等用户拍板。

## 遗留问题

- streak 类成就用当前连胜判定：老存档历史上达到过但现已中断的连胜无法追溯（无历史最高连胜字段）；新玩家在结算瞬间必被判定，不受影响。若要可追溯，需新增 bestWinStreak 计数器，本次未加（当前字段在判定时点足够）。
- sponsor_any 同理：曾签约又解约的老存档无法追溯。
- 成就 toast 与排名上升 toast 在同场结算时可能先后覆盖显示（日志里完整保留），未做 toast 队列，属已知小体验问题。
