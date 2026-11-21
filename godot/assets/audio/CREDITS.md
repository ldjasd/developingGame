# 音效来源

## 游戏里实际使用的
| 游戏音效 | 文件 | 由什么做成 |
|---|---|---|
| 刺拳 / 重拳 / 击腹 | `designed_person/*.wav` | 「打在人身上」实录为主体 + 拳套实录最前 9ms 皮革声 + 合成低频与肉感层（`godot/tools/design_punches.py person`） |
| 格挡 | `designed/block_*.wav` | 速度球拳套实录 + 合成层（`design_punches.py`） |
| 开场铃 / 终场铃 | `bell/bell_start.wav`、`bell/bell_end.wav` | TRP 真实拳击铃实录；开场 = 单响，终场 = 同一只铃三下真实敲击叠成「铛-铛-铛」；修音：70Hz 以下缓坡去轰鸣、尾部噪声门、短场馆混响、统一音量，不变调（`godot/tools/make_bells.py`） |
| 倒地 | `kenney/*.ogg` | Kenney Impact Sounds 原样 |
| 挥空、观众 | — | 用户 2026-11-21 要求先关掉（`main.gd` `SFX_DISABLED`），合成版 `whoosh.wav`、`crowd.wav` 留着但不播 |

## 素材来源与授权（全部 CC0 1.0，可商用，不要求署名）
| 来源 | 作者 | 链接 |
|---|---|---|
| Face Punch, Body Impact, 4x | Kinoton | https://freesound.org/people/Kinoton/sounds/503277/ |
| Power Kick, Body Impact, 7x | Kinoton | https://freesound.org/people/Kinoton/sounds/586841/ |
| Punching Dough | qubodup | https://freesound.org/people/qubodup/sounds/172489/ |
| boxing glove punches big various | kyles | https://freesound.org/people/kyles/sounds/637255/ |
| Punching Bag | aidansamuel | https://freesound.org/people/aidansamuel/sounds/540131/ |
| boxing speed bag practice | 21100495 | https://freesound.org/people/21100495/sounds/655326/ |
| 180820 Boxing bell, various rings dings pulses close distant, Soulpepper TORONTO | TRP | https://freesound.org/people/TRP/sounds/571096/ |
| Impact Sounds 1.0 | Kenney | https://kenney.nl/assets/impact-sounds（原文 `kenney/License.txt`） |

另下载但未进游戏：Face/Body Being Punched、Face Being Punched 2（elynch0901）、Punch in the face（Huminaatio）、Punches/hits（Wigglesworth）、G39-09-Boxing Fight Bell（craigsmith），均为 CC0。
`freesound/*.wav` 是上一版（直接用实录切片），保留作对照，游戏已不再引用。

处理原则：实录**不变调**（用户反馈变调像加滤镜）；只做裁剪、尾部淡出去底噪、11kHz 以上缓坡去嘶声、4kHz 以上约 −3dB 缓坡、轻限幅；分量来自叠加层。原始下载在仓库外 `D:\gamemake\third_party_dl\`，不入仓库。
自愿致谢：Kinoton、qubodup、kyles、aidansamuel、21100495（freesound.org），Kenney（www.kenney.nl）。
