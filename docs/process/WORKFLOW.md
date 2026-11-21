# 开发工作流

> 参考了几个万星开源游戏的做法（链接见文末）：设计文档按系统拆开、大改动先写提案、每个改动写变更记录、发布按清单走。下面是按我们三方（用户 / Claude / muse）裁剪后的版本。

## 1. 角色

| 角色 | 负责 | 不负责 |
|---|---|---|
| 用户（制作人） | 方向、品味、拍板；真人试玩手感；登录需要账号的网站 | 写代码、写文档 |
| Claude（负责人） | 设计、实现、测试、文档、统筹 muse、给出建议和数据 | 替用户定品味；未经同意推送 |
| muse（资源） | 按需求单产出美术 / 音频，通过 GitHub 提交 | 改玩法代码、改设计结论 |

## 2. 一个改动从想法到完成

```
想法 → ①分级 → ②（大改动）写提案 → ③用户拍板 → ④实现 → ⑤测试 → ⑥记录 → ⑦提交
```

1. **分级**
   - 小：修 bug、调文字、调一个数 → 直接做，⑥只记一行。
   - 中：改一个系统的规则或界面 → 先在对应 `design/*.md` 里改方案再做。
   - 大：影响多个系统、推翻已有决定、需要大量美术 → 先写 `proposals/<话题>.md`（模板 `templates/proposal.md`）。
2. **提案**写清：要解决什么、怎么做、代价、怎么验收、要用户定什么。
3. **拍板**：会改变游戏方向或品味的，等用户答复；纯技术实现由 Claude 定，写进 `DECISIONS.md`。
4. **实现**：一次只改一个系统；战斗 / 数值类改动不并行。
5. **测试**：按 `TESTING.md` 跑对应层级；达不到出口标准不算完成。
6. **记录**：`../CHANGELOG.md` 加一行（分类见下）；设计变了就同步 `design/*.md`；新决定写 `DECISIONS.md`。
7. **提交**：本地 commit（中文说明：做了什么、为什么）；**推送前问用户**。

## 3. 变更记录分类（借鉴 Cataclysm-DDA 的 changelog 规范）

| 分类 | 什么算 |
|---|---|
| 功能 | 玩家能做的新事 |
| 内容 | 新角色、新剧情、新装备、新美术 / 音频 |
| 界面 | 菜单、操作方式、提示 |
| 平衡 | 数值调整 |
| 修复 | 原来坏了、现在好了 |
| 工程 | 重构、工具、测试（玩家看不到） |

## 4. 和 muse 协作
- 需求统一写在 `ASSET_REQUESTS.md`（编号、规格、放哪、验收标准、状态）。
- muse 提交后，Claude 拉取 → 接入 → 截图自审 → 在需求单上标「已接入」或写返工意见。
- 规格不达标时 Claude 可以自己重做。

## 5. 分支与提交
- 主分支 `main`；大改动（例如实时战斗）开分支 `feat/<名字>`，阶段出口时合并。
- 推送前先拉取合并 muse 的提交，跑冒烟测试。
- `.import` 文件随资源一起提交。

## 6. 文档维护规则
- 一个话题一个文件，持续更新，不开重复文档。
- 已经过时的文档移到 `archive/`，不删。
- 每个设计文档顶部写「状态」：草案 / 定稿 / 已实现 / 已废弃。

## 参考
- Cataclysm-DDA（1.3 万星）：`doc/design-balance-lore/` 按系统拆设计文档、`CHANGELOG_GUIDELINES.md` 变更分类、`RELEASE_PROCESS.md` 发布流程 — https://github.com/CleverRaven/Cataclysm-DDA/tree/master/doc
- Luanti（1.4 万星）：`doc/direction.md` 长期 / 中期路线图、路线图外的大改动需先获概念批准 — https://github.com/luanti-org/luanti/blob/master/doc/direction.md
- Pixelorama（1.1 万星，Godot 项目）：根目录 `CHANGELOG.md` + `CONTRIBUTING.md` 的 Godot 工程组织 — https://github.com/Orama-Interactive/Pixelorama
- Bevy（5 万星）：大改动走 RFC 模板（提案 → 讨论 → 合并 → 实现） — https://github.com/bevyengine/rfcs
- Mindustry（3 万星）、OpenRA（1.8 万星）：根目录 `CONTRIBUTING.md` + issue 模板
