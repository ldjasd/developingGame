# 技术架构（Godot 桌面版）

> 状态：描述**现状** + 计划中的拆分。引擎 Godot 4.7.2；工程根 `godot/`。

## 1. 现状

| 文件 | 大小 | 职责 |
|---|---|---|
| `scripts/main.gd` | 约 9 万字节 | **所有界面** + 战斗呈现 + 音效 / BGM + 主题 |
| `scripts/game_state.gd` | 3.6 万 | 生涯状态、训练、排名、装备、赞助、存档 |
| `scripts/battle_engine.gd` | 1.3 万 | 回合制交换战斗规则 |
| `scripts/fighter_sprite.gd` | 1.7 万 | 整帧精灵角色（序列 / 姿势 / 立绘三种模式） |
| `scripts/data_db.gd` | — | 读 `data/*.json` |
| `scripts/fighter_rig.gd`、`rig_factory.gd` | — | 旧切件骨骼，战斗已不用（待删） |
| `scripts/dev/*.gd` | — | 冒烟、试玩机器人、探针、截图 |
| `data/*.json` | 36 个 | 训练、角色池、装备、剧情、成就等全部数据 |
| `tools/*.py` | — | 素材处理（精灵整理、音效设计、铃声、挥空 / 观众） |

## 2. 目标结构（P1 完成）

```
godot/
  scenes/
    main.tscn                 # 只负责切换界面
    ui/title.tscn hub.tscn training.tscn shop.tscn matches.tscn
       settings.tscn pause.tscn saves.tscn archive.tscn credits.tscn ending.tscn
    battle/battle.tscn        # 战斗场景（呈现）
  scripts/
    autoload/game_state.gd    # 生涯（全局单例）
    autoload/audio.gd         # BGM / 音效 / 音量总线
    autoload/settings.gd      # 设置读写（user://settings.cfg）
    battle/battle_core.gd     # 实时规则，60Hz，无画面可跑
    battle/ai_brain.gd        # 对手 / 自动模式大脑
    battle/sim_model.gd       # 模拟跳过的解析模型
    battle/presentation.gd    # 订阅事件 → 动画 / 特效 / HUD
    battle/fighter_view_2d.gd 或 fighter_view_3d.gd   # 看试点结果
    ui/*.gd                   # 每个界面一个脚本
  assets/ui/theme.tres        # 全局主题资源
```

原则：
- **规则和画面分开**：`battle_core` 不引用任何节点；机器人测试直接跑它。
- **数据在 JSON**：新内容不写进代码。
- **一个界面一个场景**：改一个界面不碰别的。

## 2.5 第三方插件
| 插件 | 版本 | 许可 | 说明 |
|---|---|---|---|
| `addons/vrm`、`addons/mtoon` | 2.6.1（AzPepoze/godot-vrm，V-Sekai 分支） | MIT | VRM 模型导入 + MToon 卡通着色。**未装** `addons/vrm/bin` 的原生物理库（.dll），头发弹簧骨骼暂不模拟 |

## 3. 存档
- `user://` 下 JSON，3 槽；结构变化写迁移函数（读档时按版本号升级），冒烟测试覆盖。

## 4. 输入
- `project.godot` 的 InputMap 定义命名动作（punch_l、punch_r、block、dodge、move_*、special、pause）；设置界面改键写回 `user://settings.cfg`。

## 5. 待清理
- `fighter_rig.gd` / `rig_factory.gd` / `data/rig_params.json` 及相关 dev 脚本（实时战斗落地后删除）。
- 回合制常量（`EXCHANGES_PER_ROUND`、`TRAUMA_DECAY_PER_EXCHANGE`）。
- 未使用的挥空切片（`assets/audio/air_cloth/` 中未被引用的文件）、旧 `air/`、`freesound/`。
