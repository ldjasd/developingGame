# 测试方案

> 四层测试，从快到慢。每个阶段的出口标准（`../ROADMAP.md`）都落到这里的某一层。

## 第 1 层：冒烟测试（每次改代码后，约 1 分钟）
- 脚本：`godot/scripts/dev/smoke_test.gd`
- 跑法：
  ```
  godot --headless --path godot --script res://scripts/dev/smoke_test.gd
  ```
  另加 `--check-only` 做语法检查（GDScript 警告视为错误）。
- 通过：输出 `SMOKE_PASS`。新系统必须加断言（规则、存读档、迁移）。

## 第 2 层：机器人批量测试（改战斗 / 数值后，几分钟）
| 脚本 | 测什么 | 跑法示例 |
|---|---|---|
| `dev/playtest.gd` | 生涯：normal / grind 策略跑 N 周，记录胜负、名次、资金 | `--weeks=20 --policy=normal --out=<目录> [--shots]` |
| `dev/rt_probe.gd` | **实时内核** BattleCore 终结分布、势均 / +6 胜率（双方 AI） | `-- --n=167`（约 1000 场、2.5 分钟） |
| `dev/ko_probe.gd` | 旧回合制引擎的终结分布（实时版落地后退役） | 720 场阵容矩阵 |
| `dev/balance_probe.gd` | 势均 / 强弱对局胜率 | — |

通过线写在各设计文档的「验收标准」节：`design/battle.md` §11、`design/career.md` §3、`design/equipment.md` §6。每次跑完把关键数字记进 `../CHANGELOG.md` 那一行。

## 第 3 层：截图自检（改界面 / 美术后）
- 脚本：`dev/ui_shots.gd`、`dev/fx_shots.gd`、`dev/react_shots.gd`、`dev/facing_check.gd`、`playtest.gd --shots`
- Claude 逐张看图，对照 `design/ui_ux.md` 检查表：
  - [ ] 没有文字溢出 / 截断 / 重叠
  - [ ] 按钮、面板用的是素材套样式
  - [ ] 人物没有撕裂、白边、灰边、朝向错误
  - [ ] 1280×800 和 1920×1080 都正常
- 截图存会话临时目录，不入仓库；有问题的存档在 `research/` 作证据。

## 第 4 层：真人试玩（每个阶段出口）
- 谁：P1 用户 + 1 名新玩家；P3 外部 3~5 人。
- 怎么做：给 Windows 包 + 一句话任务（例「打完第一周的比赛」），不提前讲解，事后填反馈表。
- 反馈表（1~5 分 + 一句话）：
  1. 我知道接下来该做什么
  2. 比赛时我能看出对手要出什么拳
  3. 打中 / 被打中的感觉很扎实
  4. 输了我知道为什么
  5. 角色和画面让我想继续看下去
  6. 我想继续玩下去
  7. 最烦的一件事是什么？最喜欢的一件事是什么？
- 结果写成 `../playtests/<日期>_<阶段>.md`（模板 `../templates/playtest_report.md`），问题按严重度分：
  - **致命**：崩溃、存档坏、卡关 → 当场修；
  - **严重**：明显不好玩、看不懂 → 本阶段修；
  - **一般 / 建议**：进待办。

## 发布前回归（P4）
- 干净 Windows 电脑：下载 → 解压 / 安装 → 新游戏 → 通关 → 读档。
- 手柄、改键、全屏切换、分辨率切换各一次。
