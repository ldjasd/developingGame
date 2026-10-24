# Phase 6：捏人 / 换装 / 换发型 · 过程记录（2026-10-24）

> 状态：源文件已就绪，**未发布**。本子代理没有 artifact 发布接口，只改了源文件并验证；需父代理走构建 → 审计 → 提交流程发布后，用户才能在已发布版本里看到 Phase 6。

## 0. 前提核对（接线前，绝不覆盖）

- 源文件：`~/workspace/ts-spaces/phase-1/index.html`（artifact slug: phase-1）。
- 影响力动态档位改动在场且未动：`computedInfluence(s)` 按胜场/排名取最高档；`refreshInfluence()` 恒等于重算结果、可升可降，不再取已存档位最大值；读档时 `S.influence = computedInfluence(S)` 并删除旧粉丝字段。diff 核对：本次改动仅为 Phase 6 新增（CSS、立绘下方选择器、默认存档字段、Phase 6 逻辑块、读档兼容、renderStatus 接线、按钮监听），影响力相关行无任何改动。
- 战斗、装备、排名、影响力等已有系统逻辑未改动（只新增外观状态与渲染）。

## 1. 实现方式

### 存档字段

`defaultState()` 新增：

```js
appearance: { hair: 'ponytail', face: 'default', body: 'standard', outfit: 'default', lastDim: 'hair' }
```

- `lastDim` 只取 `hair | face | outfit`：记录最近一次切换的图片维度。体型切换不改变 `lastDim`，只叠加缩放。

### 核心函数（index.html 内，Phase 6 注释块）

- `APPEARANCE`：发型 9 项、脸型 3 项、服装 3 项的图片映射，体型 3 档的缩放值（娇小 0.92、标准 1.0、高挑 1.08）。
- `normalizeAppearance(a)`：读档/渲染时校验，缺字段或非法值一律回落默认值。
- `portraitSrc()`：按 `lastDim` 取发型/脸型/服装对应的图。
- `renderAppearance()`：设 `img#portraitImg` 的 `src`，体型用 `transform: scaleY(...)`（标准档清除 transform）、`transform-origin: top center`，并同步各组按钮的 `active` 状态。
- `setAppearance(dim, val)`：非法值直接返回；合法则更新字段（非体型维度同时更新 `lastDim`）、立即渲染、`save()` 存档。
- 接线：`renderStatus()` 开头调用 `renderAppearance()`（初始化 `render()` 也会经过 `renderStatus()`，故开局即恢复外观）；状态页 18 个按钮绑定 `data-app-dim / data-app-val` 点击监听。

### 界面

- 位置：状态界面立绘正下方（`#appPanel`），分发型 / 脸型 / 体型 / 服装四组。
- 按钮：最小高度 44px、内边距 10px 14px、字号 14px、横向 `flex-wrap` 不溢出；选中态为深色填充。
- 界面小字（原文）：「显示规则：立绘图片由最近一次切换的维度决定（发型、脸型、服装三者取最后一次切换的），体型缩放恒叠加其上；9×3×3 全组合需要 81 张图，本期用 13 张立绘图片（v8 默认立绘＋12 张新变体）代表各维度变体，不做全组合拼图。」

### 显示规则（属实记录）

- 9（发型）× 3（脸型）× 3（服装）= 81 种图片组合，本期不做全组合拼图。
- 立绘图片只由最近一次切换的维度决定：例如先选了丸子头、再选圆润脸，显示的是圆润脸图（发型选择仍保留在存档里，下次再点任意发型即回到该发型图）；体型缩放恒叠加在当前图片之上。
- 计数说明：任务简述中写的是「14 张代表变体」，逐一核对后实为 **13 张独立图片文件**（v8 默认立绘 1 张＋新图 12 张）。选项共 18 个（发型 9＋脸型 3＋体型 3＋服装 3），其中体型无图、默认项与高马尾均复用 v8 立绘，故独立图片文件是 13 张而非 14 张；文档与界面小字均按 13 张实数书写，不夸大。

## 2. 美术变体清单

全部 12 张新图已按以往装备图的做法原样复制进 artifact（`~/workspace/ts-spaces/phase-1/assets/portrait/`，相对引用、非外链），与源文件逐一 MD5 比对一致；另用 PNG 文件头核对 12 张均为 1328×1904。

| 维度 | 选项 | 文件 |
|---|---|---|
| 发型 | 高马尾（默认） | 复用 `assets/portrait.webp`（v8 立绘） |
| 发型 | 公主切 | `assets/portrait/hair_hime.png` |
| 发型 | 大波浪 | `assets/portrait/hair_waves.png` |
| 发型 | 半扎发 | `assets/portrait/hair_halfup.png` |
| 发型 | 超短发 | `assets/portrait/hair_short.png` |
| 发型 | 麻花辫 | `assets/portrait/hair_braid.png` |
| 发型 | 黑长直 | `assets/portrait/hair_longstraight.png` |
| 发型 | 丸子头 | `assets/portrait/hair_bun.png` |
| 发型 | 水波纹 | `assets/portrait/hair_waterwaves.png` |
| 脸型 | 默认 | 复用 `assets/portrait.webp`（v8 立绘） |
| 脸型 | 圆润 | `assets/portrait/face_round.png` |
| 脸型 | 瓜子 | `assets/portrait/face_oval.png` |
| 服装 | 默认 | 复用 `assets/portrait.webp`（v8 立绘） |
| 服装 | 登场战袍 | `assets/portrait/outfit_robe.png` |
| 服装 | 训练服 | `assets/portrait/outfit_training.png` |
| 体型 | 娇小 / 标准 / 高挑 | 无图，CSS 纵向缩放 0.92 / 1.0 / 1.08 |

立绘引用文件存在性：从 index.html 提取的 13 个立绘引用（v8＋12 张新图）逐一核对，文件全部存在且非空（新图单张约 1.8–2.5 MB）。

## 3. 验证结果（全部通过）

验证方式：本地 jsdom 加载完整 index.html 并真实点击按钮（无头环境，无真机）。另做 `node --check` 语法检查通过。

### 测试档全程（18 项逐项点选）

- 按钮总数 18 个（发型 9、脸型 3、体型 3、服装 3），与任务清单逐项对应。
- 每点一次检查 4 项：立绘 `src` 符合「最后切换维度」规则、体型 `transform` 符合缩放值（标准档为空）、该维度按钮 `active`、localStorage 存档的 `appearance` 与选择一致。18 × 4 = 72 项检查全部通过，无控制台错误、无 window 错误。
- 关键叠加行为已验证：体型切换不改变立绘图（只改 transform）；随后切换脸型/服装时图片换为新维度图、体型缩放保留（例如丸子头＋高挑 → 脸换圆润后仍为 `scaleY(1.08)`）。

### 存档重读

- 全程点选后的存档（发型水波纹、脸型瓜子、体型高挑、服装训练服、`lastDim=outfit`）重新加载后，立绘为训练服图、各组 `active` 与存档一致，无错误。

### 老存档兼容

- 缺 `appearance` 字段的老存档读入后：立绘为 v8 默认图、四组按钮均为默认项、存档被补填默认外观；金钱/排名/战绩等其他字段完好。
- 动态档位未被锚定：存档里存着 Lv5、但胜场 0 / 排名 50 的老档读入后重算为 Lv1；排名第 1 的老档读入后重算为 Lv5；胜场从 10 归零且排名回到 50 后档位从 Lv3 掉回 Lv1（可升可降在场）。

### 不破坏已有系统（冒烟）

- 战斗：模拟战斗一次跑通——战绩 0 胜 → 1 胜、排名第 50 → 第 48 名、金钱 ¥100 → ¥900、影响力 Lv1 → Lv2、阶段「初出茅庐」完成，无错误。手动/自动战斗未在 jsdom 内全程跑完，仅确认 `startBattle / simulateBattle` 函数存在且日常渲染正常（见局限）。
- 装备：`gearById('gloves2')`（标准拳套）存在；状态页装备/阶段/赞助/图鉴/背包卡片均有内容渲染。
- 排名：模拟战斗后排名升降正常（第 50 → 第 48 名）。
- 影响力：见上（Lv1→Lv2、Lv5↔Lv1 重算、Lv3 掉档），动态档位逻辑未被 Phase 6 触动。

## 4. 已知局限与备注

- **无头环境无法做真实手机布局验证**：按钮尺寸（44px）与横向不溢出（flex-wrap）只做了静态 CSS 检查与 jsdom 结构检查；真机目视（小屏下四组选择器是否拥挤、立绘缩放后观感）留给父代理/用户复核。
- **战斗冒烟范围**：只跑了模拟战斗一局；手动操作与自动观看未在 jsdom 内全程跑完（涉及时钟/触屏交互），发布前建议父代理在真机上手动打一局复核。
- **美术备注（任务简述提供，无头环境未逐张目视核对）**：半扎发初看近高马尾、水波纹与大波浪差异 subtle、瓜子脸变化含蓄、黑长直发色仍为粉色。以上属美术观感备注，不是本轮验证结论；如需调整需另起美术迭代。
- **计数更正**：任务简述的「14 张」与实际文件数不符，实为 13 张独立图片（见第 1 节），文档与界面均按实数书写。
- **未发布**：本轮只改源文件 `~/workspace/ts-spaces/phase-1/index.html` 与 `assets/portrait/` 下 12 张图，未走构建/审计/提交；已发布版本在父代理完成发布流程前仍是旧版。

## 5. 改动文件

- `~/workspace/ts-spaces/phase-1/index.html`（Phase 6 接线：CSS、选择器、存档字段、逻辑块、读档兼容、渲染接线、监听）
- `~/workspace/ts-spaces/phase-1/assets/portrait/`（新增 12 张 PNG，原样复制，MD5 与源素材一致）
- `~/workspace/game/boxing/DESIGN.md`（新增「九之二、Phase 6」章节，MVP 路线补充 Phase 6 已落地）
- `~/workspace/game/boxing/ROADMAP.md`（Phase 6 改为已落地状态＋待发布说明，已完成列表补充）
- `~/workspace/game/boxing/PHASE6.md`（本文件）
