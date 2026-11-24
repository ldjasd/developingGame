# 音频来源

## BGM

三首均为本项目自有：曲目数据（音符表＋乐器参数）出自网页版 `web/js/audio.js` 的 `BGM_TRACKS`（本项目过程化作曲，无外部文件），2026-11-21 由 muse 按该数据离线合成渲染为 ogg（数学无缝循环、峰值 −3dB）。未使用任何第三方采样、现成曲目或外部素材，无第三方授权负担。

| 文件 | 曲目 | 来源 | 作者 | 授权 |
|---|---|---|---|---|
| `bgm_title.ogg` | 标题曲（96 BPM，Cmaj7–Am7–Fmaj7–G，时长 80.0s） | 本项目自有：`web/js/audio.js` `BGM_TRACKS.title` 音符数据离线渲染 | 项目组（muse 合成渲染） | 项目自有 |
| `bgm_daily.ogg` | 日常曲（76 BPM，Am7–Fmaj7–Cmaj7–G，时长 75.8s） | 本项目自有：`web/js/audio.js` `BGM_TRACKS.daily` 音符数据离线渲染 | 项目组（muse 合成渲染） | 项目自有 |
| `bgm_battle.ogg` | 战斗曲（140 BPM，Dm–B♭–F–C，时长 82.3s） | 本项目自有：`web/js/audio.js` `BGM_TRACKS.battle` 音符数据离线渲染 | 项目组（muse 合成渲染） | 项目自有 |

## 音效

| 文件 | 来源 | 授权 |
|---|---|---|
| `kenney/*.ogg` | Kenney「Impact Sounds」1.0（https://kenney.nl/assets/impact-sounds，2026-11-21 从官方页面下载） | CC0 1.0（公有领域，可商用，署名非必须；授权原文见 `kenney/License.txt`） |
| `*.wav` | 本项目原创合成（`godot/tools/gen_sfx.py` 生成） | 本项目自有 |

游戏内用法：打击、格挡、倒地、回合铃优先用 Kenney 真实录音（每次随机变体），挥空和观众用合成版；录音缺失时自动退回合成版。
致谢：Sound effects by Kenney (www.kenney.nl).
