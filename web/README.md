# 拳击养成游戏 · 网页原型独立源码工程

> Phase 7.5 工程化 v1（2026-10-25）：把已验证的单文件 HTML 逐字拆成独立工程。
> **自此本工程是唯一源码**；artifact（ts-spaces/phase-1）内的 index.html 只是发布副本，只通过打包产物更新，不再直接编辑。

## 目录结构

```
web/
├── index.html          页面壳：DOM 结构 + 引用 css/main.css 与 js/*.js（无内嵌样式/逻辑）
├── css/
│   └── main.css        全部样式（源单文件 <style> 逐字抽出）
├── js/
│   ├── data.js         纯数据定义：常量/训练/装备/材料/阶段/赞助/对手风格/角色池名册/外观/影响力
│   ├── story.js        剧情数据：STORY_CHARS 角色表 + STORY_EVENTS 事件库（Phase 7）
│   └── game.js         其余全部主逻辑（状态/界面/战斗/剧情引擎/初始化），逐字搬运未重构
├── assets/             静态资源（equipment / opponents / portrait / story / portrait.webp），引用路径与原版一致
├── scripts/
│   └── build-single.mjs  打包：合并回单文件 dist/index.html + 复制 assets
├── tests/
│   └── smoke.mjs       jsdom 冒烟：同组断言跑工程版与 dist 版（可加 --original <目录> 做对照）
├── dist/               打包产物（build 生成：index.html + assets/），发布回 artifact 时用这一份
└── package.json        npm 脚本：build / test；devDependency 仅 jsdom（测试用）
```

脚本加载顺序固定为 `data.js → story.js → game.js`（普通脚本、全局作用域，与原单文件内的执行顺序一致）。三者都是顶层 `var`/函数声明，跨文件引用在运行时解析；data.js 与 story.js 的初始化不依赖任何外部变量（已单独执行验证）。

## 本地运行

任意静态服务器指到本目录即可，例如：

```bash
npx serve .          # 或 python3 -m http.server 8000
```

然后打开 http://localhost:3000（或 8000）。不建议直接双击 index.html 用 file:// 打开：游戏用 localStorage 存档，file:// 源下浏览器/jsdom 会限制 localStorage。

## 打包（发布回 artifact 的前置步骤）

```bash
npm run build        # 生成 dist/index.html（内嵌 css/js）+ dist/assets/
```

打包只是把壳里的 `<link>`/`<script src>` 换回内嵌 `<style>`/`<script>`，内容逐字来自工程文件；dist/index.html 与原单文件仅差拆分装配行（三个 JS 文件各保留一句 `'use strict';` 与文件头说明注释）。发布动作由父代理用 dist 产物走 artifact 构建流程，本工程内不做发布。

## 测试

```bash
npm install          # 首次：安装 jsdom（仅测试需要）
npm run build        # 先打包，smoke 会同时测 dist 版
npm test             # 工程版 + dist 版各 21 项断言
node tests/smoke.mjs --original <目录>   # 可选：对指定目录（如 artifact 目录）跑同组断言做对照
```

断言覆盖：加载无脚本错误、新档初始化（S 结构、排名 50、story）、角色池 50 人名次完整性与候补、数据/逻辑全局就位、makeFoe 取池内真人且名次 ±5 内、模拟比赛可结算记账、存档保存→重读逐字一致（roster/story）。

等价性证据（v1 拆分时）：拆分脚本逐行多重集比对——原脚本 3,955 行非空行在 data.js+story.js+game.js 中出现次数完全一致（差 0）；工程版、dist 版、原 artifact 版三方同组冒烟 63/63 全过。

## 编辑约定

1. 改玩法/数值/文案 → 只改本工程 `js/`、`css/`、`index.html`，不要碰 ts-spaces 里的发布副本，也不要直接改 `dist/`（会被 build 覆盖）。
2. 纯数据（新装备、新对手、新剧情事件等）优先加到 `data.js` / `story.js`；逻辑加到 `game.js` 对应区段。
3. 每次改动后跑 `npm run build && npm test`，全过再交付发布。
4. 存档格式（localStorage key `boxing-phase1-save-v1` 与 S 结构）视为兼容契约：改结构必须带迁移并先补断言。

## 拆分映射（v1，源 = ts-spaces/phase-1/index.html 的行号）

| 目标文件 | 源行范围 | 内容 |
|---|---|---|
| css/main.css | 13–661（`<style>` 内） | 全部样式，逐字 |
| index.html 壳 | 1–11、663–1251、5209–5210 | head 前段、body 全部 DOM、结尾；`<style>`/`<script>` 处替换为引用行 |
| js/data.js | 1254–1273 | 区段头 + LEVELS / PUNCHES / PUNCH_KEYS / ATTRS |
| | 1274–1306 | TRAININGS（13 种训练） |
| | 1308–1333 | SLOT_NAMES / SHOP_GEAR（商店装备） |
| | 1336–1372 | GLOVE_PATTERNS / OUTERS / LININGS / OZ / FIX / MATERIALS |
| | 1375–1390 | DISMANTLE_MAP / CRAFT_FEE / DEX_ACH |
| | 1464–1489 | GEAR_IMG_SRC（装备图路径表） |
| | 1502–1507 | CONSUMABLES（消耗品） |
| | 1509–1524 | STAGES（6 生涯阶段） |
| | 1527–1533 | SPONSORS（4 赞助商） |
| | 1536–1548 | FOE_NAMES / TACTICS / FOE_STYLES |
| | 1550–1609 | 角色池区段头注释 + ROSTER_DEF（50 人名册） |
| | 1612 | GROWTH_LABELS（单行） |
| | 1745–1772 | APPEARANCE（Phase 6 外观表） |
| | 1919–1925 | INFLUENCE_LEVELS（影响力 5 档） |
| js/story.js | 2029–2034 | STORY_CHARS（剧情角色表） |
| | 2069–2252 | 事件库头注释 + STORY_EVENTS（28 段事件） |
| js/game.js | 其余全部脚本行（原顺序） | 含开头的 `'use strict';` 与全部逻辑/注释 |

切分原则：只切「顶层纯字面量数据」——初始化不引用任何外部变量、可独立执行的完整语句（含其紧贴的说明注释）；夹在数据之间的小工具函数（如 trainingById、gearById、ROSTER_BY_KEY 的填充、FOE_STYLE_KEYS 的派生）全部留在 game.js，避免改变求值顺序。data.js / story.js 文件头各有两行装配说明（来源标注 + `'use strict';`），是拆分新增的仅有非原文行。

检查记录：源脚本未发现生成器拼接痕迹或重复块——顶层函数名、顶层 var 名均无重复定义；个别高频整行（如 addEventListener 样板）属正常写法重复，未做清理（遵逐字搬运原则）。

## v2 细拆路线（game.js 仍约 3,469 行，后续按区段继续拆）

game.js 内区段边界清晰（原有 `/* ================= … ================= */` 标题），v2 可按下列顺序逐个搬出为独立普通脚本，仍遵循「一次搬一段、搬完跑全套冒烟」的节奏：

1. `audio.js`：音效合成区段（源「音效（Web Audio 现场合成）」）——无外部依赖，最易先拆。
2. `story-engine.js`：Phase 7 剧情引擎（弹窗/队列/序章），数据已在 story.js，引擎与数据成对。
3. `battle.js`：战斗区段（战斗/打击反馈/Phase 4 连击反击/三模式/触屏控制）——体量最大、耦合最深，最后拆，拆前先补战斗冒烟断言。
4. `ui.js`：日常界面/训练/确认框/外出/状态页/工坊等渲染区段。
5. 剩余部分（状态与存档、工具、事件绑定、测试档、初始化）保留为 `game.js` 核心。

拆分顺序与命名只是路线建议，实施时以当时的耦合实测为准。
