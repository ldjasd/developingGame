# 界面架构批：多场景分屏 ＋ 存档/设置/画廊正式功能屏（2026-11-02）

用户定调：单页全列被否定——改多场景分屏处理不同分支；存档、设置、画廊要做成正式功能屏（此前存档槽后端已有但埋在弹窗里、画廊散落状态页、设置只有战斗面板一个静音键，用户感知为「没做」）。实现位于网页工程 `web/`，玩法/数值/剧情/存档数据结构未改（仅新增设置 key）。冒烟基线 156 → **176/176 全过**（工程版＋dist 版各 88）。

## 1. 标题画面

- 启动流程改为：`load()` → 追溯结算（只入队不弹）→ `render()` → `renderTitle(hadSave)` → `showScene('title')`。追溯祝贺窗、序章、玩法说明全部推迟到 `enterGame()` 后按旧顺序发生，不在标题屏上叠罗汉。
- 标题屏（`#titleView`，全站最用心的一屏）：场景底（ring_wide）＋围绳纹理条＋渐变描边大立绘（按当前外观 `portraitSrc()`）＋粉紫渐变大字「心跳在左，拳头在右」（正式定名，2026-11-02；左段粉、右段紫分色）＋星标副标题；`body[data-view="title"]` 时顶栏/导航/页脚整体隐藏。
- 菜单：继续游戏（`btnTitleContinue`，**启动时捕获的 hadSave 决定置灰**——不能用 slotData 判断，init 的 render 已把默认档写进 SAVE_KEY）/ 新的开始（有档先 askConfirm 明示覆盖当前槽，无档直接进；实际重置与顶栏重开、设置危险区共用 `doResetCurrentSlot()`）/ 读取存档 / 画廊 / 设置（标题屏未进入游戏也能达）。
- 老档无痛验证：prologueDone 的老档点继续直达据点、进度逐项无损；序章未走完的老档点继续接着弹序章；标题屏进画廊/存档后「返回」回标题（`gameEntered` 标志决定功能屏返回目标，进游戏后回据点）。

## 2. 场景化分屏

- 统一场景管理器在 `js/tools.js`：`SCENE_VIEWS`（10 屏：title/daily/train/shop/status/match/gallery/saves/settings/battle）＋`SCENE_BG` 背景映射＋`showScene(name)`（统一显隐 inline display、导航高亮、`body[data-view]`、背景、回顶；战斗中禁止切走，与 openStatus 旧守卫同口径）。C1 视图过渡 MutationObserver 扩展到全部 10 屏。
- 既有切换点全部改走 showScene：`openStatus/closeStatus`（ui.js）、`startBattle`（battle.js，原两行直改 display，顺带收起可能开着的状态/比赛屏）、`btnSettleOk`、`leaveBattleToDaily`（切档/测试档/恢复）、`doResetCurrentSlot`。
- 场景导航 `#sceneNav`：顶栏下方 8 个胶囊按钮（据点/训练/商店/比赛/状态/画廊/存档/设置，图标字形＋文字、代表色、当前屏渐变高亮），统一入口 `gotoScene()` 分发到各屏既有流程；标题屏与战斗中隐藏。
- 各屏归位（DOM 搬迁、id 全保留）：据点＝主角属性/拳种＋今日行动（训练/外出/打工/休息/睡觉）＋生涯目标＋日志（折叠开关保留）；训练屏＝`#trainList` 独立屏（列表常驻显示，结算后回据点）；商店屏＝`#shopList` 独立屏；比赛屏＝`#btnMatch` 报名＋`#rankBoard` 排名榜（从状态页迁入）；状态页保留选手档案/换装/属性/阶段/成就/关系/背包/工坊/赞助，收集类只留「收藏与记录」跳转卡。
- **进店经济规则零改动**：商店入口（据点外出菜单与场景导航共用 `enterShopFlow()`）仍是每次进店先确认、扣 2 AP；`shopSession` 仅防同一趟重复点导航重复扣点，离开商店即结束本趟、再进重新确认扣点（走查已验：两趟 −4 AP）。

## 3. 存档屏（正式化）

- 原 `saveModal` 弹窗删除，`openSaveSlots()` 改为渲染＋`showScene('saves')`；后端槽位交换机制（SAVE_KEY/meta/暂存位、slotsLocked 测试档锁定）一行未改。
- 3 张槽卡：摘要沿用既有口径（周/Day/排名/战绩/金钱/阶段，空槽显示「空」），当前槽高亮＋「当前进度自动保存在此槽」；非当前槽三操作：**读取**（=既有切换，确认框不变）/ **覆盖保存（存入当前进度）**（=既有复制，确认框不变）/ **删除**（新增 `deleteSlot/confirmDeleteSlot`，守卫同口径：当前槽不可删、测试档锁定不可删、空槽按钮禁用，删除走确认框、只清该槽暂存位）。

## 4. 设置屏（真做）

- 新 key `boxing-settings-v1`（与游戏存档分离），`SETTINGS` 在 tools.js 加载：音乐开关/音量、音效开关/音量、动效减少；无设置时动效减少默认跟随系统 `prefers-reduced-motion`。
- audio.js 新增双总线：`audioLevels` 为唯一状态源，`playTone/playNoise` 按 `audioBus` 路由到懒创建的音乐/音效增益节点（BGM 的 `_schedule` 期间置 `audioBus='music'`，`_tick` 增加音乐关守卫；SFX 默认走音效总线，行为/音量峰值未改）。`setBusLevel()` 即改即生效。
- 静音键联动：战斗面板 `btnMute` 拨动时把音乐/音效开关同步写入设置并落盘；设置屏拨动任一开关会解除主静音；`syncMuteBtn()` 统一文案。
- 动效减少：`body.reduce-motion` 一条 CSS 关掉全部动画/过渡（含残影、入场、视图过渡），即手动版 prefers-reduced-motion。
- 文字与版本信息区＋危险区：重置当前存档**双重确认**（设置屏 askConfirm → 既有 resetModal → `doResetCurrentSlot()`）。

## 5. 画廊屏（整合）

- `#galleryView` 五页签：**立绘**（新网格：APPEARANCE 三维度去重共 21 张，点开 `#imgModal` 放大）/ **装备图鉴**（`#stDex` 迁入）/ **设计款式**（`#galDesign` 迁入；renderStatus 里与装备图鉴拆开两次赋值，`#dexGallery` id 与内容不变）/ **对手名鉴**（`#stFoeDex` 迁入）/ **回忆**（`#stMemories` 迁入）。
- 唯一渲染处原则：四个迁入页签的渲染仍是既有 `renderStatus()` 内函数（DOM 位置无关），状态页只留跳转按钮（`btnGoGalleryDex/Design/Foes/Mem`＋`btnGoMatchRank`），商店的「款式图鉴」按钮改直达画廊设计款式页签，不再有第二份渲染逻辑。

## 冒烟改动逐条（行为等价前提下）

| 原断言 | 改动 | 理由 |
|---|---|---|
| 设计款式图鉴画廊（经 openStatus 查 #dexGallery） | 改走 `openGallery('design')`，卡片数断言不变 | 图鉴迁入画廊屏，渲染处唯一 |
| 加载后自动序章→跳过 | 前置「标题屏出现/继续置灰/点新的开始进游戏」3 条，再跳序章，后续断言前提与旧版一致 | 启动流程改标题优先 |
| C5 快捷条 2 条（quickBar 5 锚点＋点击定位） | 删除，替换为场景导航 3 条（8 按钮就位/训练·比赛可达/商店确认扣 2 AP） | 锚点条被场景导航取代（用户定调） |
| 其余全部 | 未改 | id 与行为保留，DOM 搬迁对 getElementById 渲染透明 |

新增断言（每 suite +12、删 2、净 +10）：标题屏出现、继续置灰、点新的开始进游戏、有档继续流程（重读页）、场景导航就位/可达/商店、画廊五页签渲染、立绘点开放大、存档屏三槽与删除、设置即改即生效（SETTINGS＋audioLevels＋localStorage）、设置刷新后保留。

另以一次性 jsdom 脚本走真实 UI 点击验证（不入冒烟，13/13）：老档继续无损、序章中途档继续、状态页跳转、画廊返回目标、静音键联动落盘、减少动效落盘、商店两趟各扣 2 AP、设置双重确认重置、标题画廊往返、有档新的开始先确认可取消。

## 未改动项

玩法/数值/剧情/战斗公式；`S` 存档结构与全部既有 key（仅新增 `boxing-settings-v1` 设置 key）；训练/商店/比赛的 AP 与确认规则；ts-spaces 发布副本未碰、未发布、未推 git（留待汇总发布步统一处理）。
