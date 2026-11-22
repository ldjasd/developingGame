# 文档入口

《心跳在左，拳头在右》——二次元美少女拳击养成 + 实时战斗，Godot 4 桌面版。

## 先读这四份
| 文档 | 回答什么 |
|---|---|
| [STATUS.md](STATUS.md) | **现在到哪了**（一页，随进度更新） |
| [VISION.md](VISION.md) | 这是个什么游戏、不做什么（一页） |
| [AUDIT_20261121.md](AUDIT_20261121.md) | 现在做到哪了、离发布还差什么 |
| [ROADMAP.md](ROADMAP.md) | 从现在到 1.0 的五个阶段，每阶段做什么、怎样算完成 |
| [DECISIONS.md](DECISIONS.md) | 已经定了什么、还有什么等拍板 |
| [KNOWN_ISSUES_PLAN.md](KNOWN_ISSUES_PLAN.md) | 已知问题和各自的解决方案 |

## 设计（按系统，一个系统一份）
| 文档 | 状态 |
|---|---|
| [design/battle.md](design/battle.md) | 草案：实时战斗、背后视角、渲染试点 |
| [design/career.md](design/career.md) | 部分定稿：养成、排名、生涯终点、经济 |
| [design/equipment.md](design/equipment.md) | 草案：装备收缩 + 服装收集 |
| [design/characters_art.md](design/characters_art.md) | 立绘定稿；战斗角色待试点 |
| [design/ui_ux.md](design/ui_ux.md) | 草案：风格规范、界面清单 |
| [design/audio.md](design/audio.md) | 音效定稿；BGM 来源待确认 |
| [design/story.md](design/story.md) | 现有可玩；结局 / 宿敌待写 |

## 流程（怎么做事）
| 文档 | 用途 |
|---|---|
| [process/WORKFLOW.md](process/WORKFLOW.md) | 角色分工、一个改动从想法到提交的步骤、变更分类 |
| [process/TESTING.md](process/TESTING.md) | 四层测试：冒烟 / 机器人 / 截图 / 真人 |
| [process/RELEASE_CHECKLIST.md](process/RELEASE_CHECKLIST.md) | 发布前逐项清单 |
| [process/ASSET_REQUESTS.md](process/ASSET_REQUESTS.md) | 给 muse 的美术 / 音频需求单 |

## 技术
- [tech/ARCHITECTURE.md](tech/ARCHITECTURE.md)：代码结构现状与拆分计划

## 记录
- [CHANGELOG.md](CHANGELOG.md)：变更记录
- [playtests/](playtests/)：试玩报告
- [proposals/](proposals/)：大改动提案（一个话题一份，持续更新）
- [research/](research/)：参考研究（Love Upper 逆向结论、Bloom Blow 试玩观察、GitHub 调研）
- [templates/](templates/)：设计文档 / 提案 / 试玩报告模板
- [archive/](archive/)：已不再更新的旧文档（网页原型时期）

## 目录规则
- 设计变了就改对应 `design/*.md`，并在 `CHANGELOG.md` 记一行；推翻旧决定写进 `DECISIONS.md`。
- 过时的文档移进 `archive/`，不删。
