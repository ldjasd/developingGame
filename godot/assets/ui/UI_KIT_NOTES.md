# 中枢 UI 素材套（2026-11-21 生产）

风格：粉 #f27bb5＋紫 #7b4bb5／深紫 #4a2a7a＋薰衣草，金色仅点缀。全部程序化绘制（PIL 超采样），生成脚本：`godot/tools/build_ui_kit.py`（改色/改造型后重跑即可再生成）。

## 按钮（StyleBoxTexture / NinePatchRect）
- 文件：`btn_normal.png` / `btn_hover.png` / `btn_pressed.png` / `btn_disabled.png`，均 256×96、透明底。
- **9-slice 边距：左 24 / 上 24 / 右 24 / 下 24**（四角星与圆角都在角区内，中段纯渐变可任意拉伸）。
- 建议最小尺寸：宽 ≥ 96、高 ≥ 56。已用 520×96、520×60 拉伸模拟验过，无变形。
- Godot 用法：Button 的 theme override styles（normal/hover/pressed/disabled）各挂一张 StyleBoxTexture，texture_margin_* 均填 24，content_margin 可按需（建议左右 16、上下 8）。

## 面板
- 文件：`panel.png`，256×256，半深紫底（alpha 242）＋薰衣草/粉双层描边＋四角金星＋边中点小菱形。
- **9-slice 边距：左 36 / 上 36 / 右 36 / 下 36**。已用 560×256 拉伸模拟验过。
- 用法：PanelContainer 挂 StyleBoxTexture（texture_margin_* = 36），或 NinePatchRect（patch_margin_* = 36）。

## 属性图标（128×128，透明底，薰衣草徽章底盘）
文件名与 `GameState.ATTR_KEYS` 及中枢中文名一一对应：
| 文件 | 属性键 | 中枢名 |
|---|---|---|
| attr_power.png | power | 力量 |
| attr_endurance.png | endurance | 耐久 |
| attr_will.png | will | 意志 |
| attr_speed.png | speed | 出拳速度 |
| attr_accuracy.png | accuracy | 精准度 |
| attr_footwork.png | footwork | 步伐速度 |
| attr_defense.png | defense | 防守技术 |
| attr_technique.png | technique | 技术 |

注：中枢信息行里的心态/影响力/疲劳/伤病是状态值、不在 ATTR_KEYS 内。已于 2026-11-25 按同风格补齐（需求单 A5），生成脚本 `godot/tools/build_stat_icons.py`（与本套共用 badge/glyph 管线）：
| 文件 | 状态 | 图形 |
|---|---|---|
| stat_mood.png | 心态 | 粉色笑脸（闭眼笑弧＋腮红＋金星点缀） |
| stat_influence.png | 影响力 | 金色四角星＋紫/粉涟漪环 |
| stat_fatigue.png | 疲劳 | 低电量电池（仅第一格亮粉） |
| stat_injury.png | 伤病 | 医疗十字＋绷带白点 |
自检联系表：`research/godot_rig/ui_kit_check/stat_contact_dark.png`、`stat_contact_light.png`（与 attr 图标并排）。

## 拳种图标（128×128，同徽章风格，金色轨迹线区分拳路）
| 文件 | 拳种键（data/punches.json） | 轨迹 |
|---|---|---|
| punch_jab.png | jab 刺拳 | 短虚线直轨 |
| punch_straight.png | straight 直拳 | 长实线直轨＋命中星爆 |
| punch_hook.png | hook 摆拳 | 大弧横扫 |
| punch_upper.png | upper 上勾拳 | 自左下兜起上挑 |
| punch_body.png | body 击腹拳 | 斜下轨＋躯干腹部靶环 |

## 自检
联系表（深/浅底，含九宫格拉伸模拟）：`research/godot_rig/ui_kit_check/contact_dark.png`、`contact_light.png`。
