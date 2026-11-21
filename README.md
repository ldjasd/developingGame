# 心跳在左，拳头在右

二次元美少女拳击养成 + 实时战斗游戏：从街机测力机前的素人开始，白天训练养成，比赛日亲手上擂台，一路打到世界冠军。非商用项目。

## 目录
| 路径 | 内容 |
|---|---|
| `godot/` | **正式版**（Godot 4.7.2 桌面版） |
| `docs/` | 文档，入口 [docs/README.md](docs/README.md) |
| `web/`、`index.html` | 网页原型（只作参考，不再开发） |
| `assets/` | 原始美术资源 |
| `release/` | 导出包 |

## 运行（开发）
用 Godot 4.7.2 打开 `godot/project.godot`，按 F5。

冒烟测试：
```
godot --headless --path godot --script res://scripts/dev/smoke_test.gd
```

## 现在在哪
见 [docs/AUDIT_20261121.md](docs/AUDIT_20261121.md)（完成度审核）和 [docs/ROADMAP.md](docs/ROADMAP.md)（到 1.0 的路线图）。
