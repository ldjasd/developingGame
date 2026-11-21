# 音效来源

## 游戏里实际使用的
| 游戏音效 | 文件 | 由什么做成 |
|---|---|---|
| 刺拳 / 重拳 / 击腹 | `designed_person/*.wav` | 「打在人身上」实录为主体 + 拳套实录最前 9ms 皮革声 + 合成低频与肉感层（`godot/tools/design_punches.py person`） |
| 格挡 | `designed/block_*.wav` | 速度球拳套实录 + 合成层（`design_punches.py`） |
| 开场铃 / 终场铃 | `bell/bell_start.wav`、`bell/bell_end.wav` | TRP 真实拳击铃实录；开场 = 单响，终场 = 同一只铃三下真实敲击叠成「铛-铛-铛」；修音：70Hz 以下缓坡去轰鸣、尾部噪声门、短场馆混响、统一音量，不变调（`godot/tools/make_bells.py`） |
| 倒地 | `kenney/*.ogg` | Kenney Impact Sounds 原样 |
| 挥空 | `air_cloth/jacket_00/03/04/07/11/13.wav`、`air_cloth/tshirt_00/07/33.wav` | 衣物挥动实录切出：Nox_Sound 夹克 6 条 + Soundholder T恤 3 条；去 90Hz 以下、淡入淡出、统一音量（`godot/tools/make_air_crowd.py cloth`）。`air/whoosh_*`（竹竿版）已不再使用 |
| 观众 | `crowd/crowd_win.wav` | FoolBoyMedia 获胜欢呼实录取最响的 3.2 秒，去 80Hz 以下、淡入淡出（另两段 `crowd_arena`/`crowd_fight` 保留未用） |

## 背景音乐（BGM）
| 场景 | 文件 | 来源 |
|---|---|---|
| 标题 | `bgm_title.ogg` | muse 提供（2026-11-21） |
| 日常中枢 | `bgm_daily.ogg` | muse 提供 |
| 比赛 | `bgm_battle.ogg` | muse 提供 |

**来源与授权待确认**：文件内无标签（仅 libvorbis 编码信息），仓库里也没有出处说明。发布前须由 muse 补上作者 / 链接 / 许可证；若无法确认，换成可查证的 CC0 曲目。游戏内音量 −14dB，场景切换 0.8 秒交叉淡化、循环播放。

## 需要署名的素材（CC BY 3.0）——游戏致谢 / 发布页必须保留
**"swipes and whooshes tshirt fast and short swings"** by **Soundholder** — https://freesound.org/people/Soundholder/sounds/425856/ — licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). 改动：切成单次挥动、去 90Hz 以下、淡入淡出、统一音量。

## 其余素材来源与授权（CC0 1.0，可商用，不要求署名）
| 来源 | 作者 | 链接 |
|---|---|---|
| Foley_Clothes_Jacket_Whoosh_Sequence | Nox_Sound | https://freesound.org/people/Nox_Sound/sounds/495390/ |
| Face Punch, Body Impact, 4x | Kinoton | https://freesound.org/people/Kinoton/sounds/503277/ |
| Power Kick, Body Impact, 7x | Kinoton | https://freesound.org/people/Kinoton/sounds/586841/ |
| Punching Dough | qubodup | https://freesound.org/people/qubodup/sounds/172489/ |
| boxing glove punches big various | kyles | https://freesound.org/people/kyles/sounds/637255/ |
| Punching Bag | aidansamuel | https://freesound.org/people/aidansamuel/sounds/540131/ |
| boxing speed bag practice | 21100495 | https://freesound.org/people/21100495/sounds/655326/ |
| 180820 Boxing bell, various rings dings pulses close distant, Soulpepper TORONTO | TRP | https://freesound.org/people/TRP/sounds/571096/ |
| Short Whoosh, 13x | Kinoton | https://freesound.org/people/Kinoton/sounds/427979/ |
| Swish 5 | ihitokage | https://freesound.org/people/ihitokage/sounds/395368/ |
| Crowd Cheer | FoolBoyMedia | https://freesound.org/people/FoolBoyMedia/sounds/397434/ |
| crowd large cheer arena stadium hockey game Montreal | kyles | https://freesound.org/people/kyles/sounds/629884/ |
| R07-27-Sporting Event with Steady Cheers | craigsmith | https://freesound.org/people/craigsmith/sounds/486214/ |
| Impact Sounds 1.0 | Kenney | https://kenney.nl/assets/impact-sounds（原文 `kenney/License.txt`） |

另下载但未进游戏：Face/Body Being Punched、Face Being Punched 2（elynch0901）、Punch in the face（Huminaatio）、Punches/hits（Wigglesworth）、G39-09-Boxing Fight Bell（craigsmith），均为 CC0。
`freesound/*.wav` 是上一版（直接用实录切片），保留作对照，游戏已不再引用。

处理原则：实录**不变调**（用户反馈变调像加滤镜）；只做裁剪、尾部淡出去底噪、11kHz 以上缓坡去嘶声、4kHz 以上约 −3dB 缓坡、轻限幅；分量来自叠加层。原始下载在仓库外 `D:\gamemake\third_party_dl\`，不入仓库。
自愿致谢：Kinoton、qubodup、kyles、aidansamuel、21100495（freesound.org），Kenney（www.kenney.nl）。
