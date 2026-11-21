# 音效来源

| 文件 | 来源 | 授权 |
|---|---|---|
| `freesound/heavy_*.wav`、`freesound/body_*.wav` | 「boxing glove punches big various」by **kyles** — https://freesound.org/people/kyles/sounds/637255/ | CC0 1.0 |
| `freesound/light_0~1.wav` | 「Punching Bag」by **aidansamuel** — https://freesound.org/people/aidansamuel/sounds/540131/ | CC0 1.0 |
| `freesound/light_2~3.wav`、`freesound/block_*.wav` | 「boxing speed bag practice」by **21100495** — https://freesound.org/people/21100495/sounds/655326/ | CC0 1.0 |
| `kenney/*.ogg` | Kenney「Impact Sounds」1.0 — https://kenney.nl/assets/impact-sounds（授权原文 `kenney/License.txt`） | CC0 1.0 |
| `*.wav`（本目录） | 本项目原创合成（`godot/tools/gen_sfx.py`） | 本项目自有 |

处理方式：Freesound 录音只做裁剪（`godot/tools/slice_hits.py`：按起音切单发、2ms 淡入 / 25ms 淡出防爆音、统一峰值音量），**不变调、不滤波、不压缩**。2026-11-21 下载，原始文件不入仓库。

游戏内用法（`main.gd` `SFX_RECORDED`）：刺拳 / 重拳 / 击腹 / 格挡用 Freesound 实录，倒地与回合铃用 Kenney，挥空与观众用合成版；每次随机挑一个变体，原速原调播放。

致谢（CC0 不要求署名，自愿注明）：kyles、aidansamuel、21100495（freesound.org），Kenney（www.kenney.nl）。
