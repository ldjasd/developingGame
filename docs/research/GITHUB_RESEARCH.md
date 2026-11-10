# GitHub 游戏开发知识调研报告

> 调研日期：2026-11-10
> 对象：《心跳在左，拳头在右》——Web 版 HTML5 拳击养成经营游戏（原生 JS、PWA、目标 itch.io 正式发布；长期方向 Godot 4）
> 方法：在 GitHub 与公开网络按「同类项目 / 发布清单 / game feel / 平衡与 playtest / 教程 / 存档迁移 / Web 2D 骨骼动画 / Godot / 流程工作法 / 模块化角色」十路检索，逐条打开或以搜索结果原文核实。**本报告所有 URL 均为真实检索到的地址，未检索到的类别如实标注「没有找到合适的」。**
> 已知问题类别（下文用代号引用）：A 战斗表现（对手静态贴图、只有主角有纸偶）｜B 游戏性/平衡｜C 内容寿命｜D 教程与新手流｜E 桌面+移动双端体验｜F 音乐只有 2 首｜G 世界线缺失｜H 性能与包体｜I 发布规范与存档安全｜J 角色批量实装成本（纸偶扩围）

---

## 一、同类开源项目：养成 / 经营 / 体育 / 拳击

### 1.1 Esports Dynasty（电竞经营模拟）
- **URL**：https://github.com/dany0421/esports-dynasty/blob/HEAD/README.md
- **一句话**：纯原生 JavaScript + HTML/CSS、无框架无构建的浏览器电竞战队经营模拟，有在线演示。
- **可借鉴的具体点**：①与我们几乎同构的技术栈证明「原生 JS 经营模拟」可以做到完整赛季循环：赛季推进、选手养成、合同/转会、生涯统计；②存档设计写进 README 卖点：每次重要动作后自动存、手动存带时间戳、localStorage 持久化、**带版本检查的存档迁移（Save migration: Version checks）**；③诚实标注已知限制「清缓存=丢生涯、要定期导出」——提示我们应给玩家存档导出入口，而不是假装 localStorage 永久可靠。
- **适用性**：高（同栈、同品类、存档与赛季结构可直接对照）
- **落地成本**：低（只读其 save/migration 与赛季结构，做对照清单，半天内）

### 1.2 Idle Academy（放置/养成，纯原生 JS）
- **URL**：https://github.com/samaparp/idleacademy/blob/HEAD/CLAUDE.md
- **一句话**：纯 HTML/CSS/JS、无构建、直接跑 GitHub Pages 的浏览器游戏，其项目规则文档把存档系统写成了硬规范。
- **可借鉴的具体点**：存档规范四条可直接抄为我们的存档纪律：①读写全部 try/catch 包裹（隐私模式/配额满会抛错）；②存档自带版本号 + lastPlayed 时间戳；③**迁移按版本一步一步跑（one version step at a time）**；④**改任何存档字段名 = 新增一条迁移，永远不重置玩家**。其文件分工（js/save.js 专管 read/write/migrate/clear）也值得我们把存档逻辑从主逻辑里独立成模块。
- **适用性**：高（存档安全正是正式版底线）
- **落地成本**：低（规范对照 + 给现有存档补逐步迁移链与异常兜底，1 个批次内）

### 1.3 ZenGM / Basketball GM（体育经营模拟标杆，源码可见但非开源许可）
- **URL**：https://github.com/zengm-games （组织页）；说明见 https://github.com/nicidob/gm-games/blob/HEAD/README.md
- **一句话**：单人体育经营模拟系列（篮球/橄榄球/冰球共用一套引擎），纯客户端 JavaScript + IndexedDB，是浏览器体育经营品类跑得最久的产品形态。
- **可借鉴的具体点**：①**一个模拟引擎 + 多套规则/名册数据 = 多个游戏**，对应我们的「一套战斗/养成引擎，靠角色池与赛事数据扩内容」——世界线（洲际/世界）不必重写系统，做成数据层扩展即可；②数据量大时用 IndexedDB 而非 localStorage（名册、历史战绩、赛季档案）；③长期运营靠「赛季档案/历史记录」制造内容寿命，而不是无限堆新系统。**注意：该项目明确声明 NOT open source，只能学结构与产品形态，不能复制代码。**
- **适用性**：中高（产品形态与数据分层值得学；代码不可用）
- **落地成本**：低（理念层）；若真迁 IndexedDB 存历史战绩则中

### 1.4 Dream in Tang Dynasty（《美少女梦工厂》式养成，个人项目）
- **URL**：https://jiawenl.github.io/project3_tang.html
- **一句话**：作者因是 Princess Maker（美少女梦工厂）粉丝而做的 Qt/C++ 人生养成游戏：操控并命名一名唐代少女从 10 岁养到 17 岁，自写完整故事树。
- **可借鉴的具体点**：养成品类的经典骨架就是「年龄/阶段推进 + 属性培养 + 故事树分支 + 多结局回收」；我们已有阶段与好感，缺的是**结局/回收层**（登顶之后给玩家一个可回望的生涯总结与多结局条件），这是内容寿命的便宜补法。技术栈（Qt 桌面）与我们无关，只学品类结构。
- **适用性**：中（品类结构参考，非技术参考）
- **落地成本**：低（设计参考）；做生涯结局回收为中

### 1.5 99Managers Futsal Edition（Godot 4 体育经营）
- **URL**：https://flathub.org/eu/apps/org._99managers.futsal-edition （项目已迁至 Codeberg，Flathub 页有链接与说明）
- **一句话**：Godot 4 做的开源五人制足球队伍经营游戏：球探、战术与阵容、队内编辑器，多平台正式分发（Flathub）。
- **可借鉴的具体点**：这是「Godot 做体育经营」最贴近我们长期方向的实证：经营界面（名册、战术、编辑器）完全可以在 Godot 里做成正式产品并上架桌面渠道；对 Phase 8 的界面信息架构（名册管理 + 战术选择 + 比赛观看）有直接参照价值。
- **适用性**：中（Web 阶段无关，Godot 阶段高）
- **落地成本**：低（Phase 8 立项时精读）

### 1.6 Bash Fighter（浏览器格斗，确定性模拟 + itch 构建文档）
- **URL**：https://github.com/Bash-Entertainment/bash-fighter
- **一句话**：可在浏览器玩的开源多人平台格斗游戏，模拟核心是确定性定点数运算，并已发布为 itch.io HTML5。
- **可借鉴的具体点**：①**模拟核心与表现分离**：sim 是「上一状态 + 输入 → 下一状态」的纯函数，同种子必同结果——我们的自动战斗/模拟跳过正应如此，才能用批量模拟做平衡回归（我们已有此实践，可用它的分层校验成规范）；②仓库内有专门的 itch 构建说明：同一源码单独打一份静态包适配 itch 的子目录/CDN 托管——与我们「工程版 / 发布版双形态」完全同题，可对照其 ITCH_BUILD 文档做法。
- **适用性**：中
- **落地成本**：低（读其分层与 itch 打包说明，对照我们现有管线）

### 1.7 拳击类开源项目——如实结论：没有找到合适的
- 检索到的只有极小体量的街机复刻，例如 Boxindanga（Atari 2600《Boxing》复刻，HTML5，MIT）：https://gabitoesmiapodo.itch.io/boxindangajs ——只有「双人对打计分」的最小循环，对养成经营、角色池、赛事结构没有任何可借鉴点。
- **结论：GitHub 上不存在「HTML5 拳击养成/经营」的可参照开源项目**；拳击部分只能参照格斗游戏的通用做法（见第三节 juice 与第六节骨骼动画），养成经营部分参照 1.1~1.3。这也意味着我们的品类组合本身就没有现成模板，文档化自己的工作法（第九节）更重要。

---

## 二、发布检查清单：itch.io / HTML5 / PWA

### 2.1 itch-io-skill（可直接沉淀为发布 skill 的 GitHub 技能文档）
- **URL**：https://github.com/moikaslabs/itch-io-skill/blob/HEAD/SKILL.md
- **一句话**：一份专为 itch.io 发布写的技能文档，覆盖 butler CLI 上传、页面设置、HTML5/Godot/Ren'Py 等多引擎发布工作流。
- **可借鉴的具体点**：①用官方 butler CLI 推送（`butler push./dist USERNAME/GAME:html5 --userversion x.y.z`）替代手工传 zip，版本通道可追溯；②页面必填/推荐项清单（标题≤60 字、分类、类型、630×500 封面、截图、标签、Markdown 描述）；③HTML5 常见故障表（空白页先查 index.html 是否在包根、控制台报错）。
- **适用性**：高（我们首选渠道就是 itch，且尚未正式上架）
- **落地成本**：低（把其清单并入我们的 RELEASE_WEB.md，butler 接入半天）

### 2.2 How to Publish an AI-Built HTML5 Game（2026，平台规则对照表）
- **URL**：https://vibestackweekly.com/how-to-publish-an-html5-game/
- **一句话**：按各平台官方文档整理的 HTML5 游戏发布实操：如何打出一个「能从 zip 直接跑」的包，以及 itch/CrazyGames/Poki 等平台的规则差异表。
- **可借鉴的具体点**：发布前自检清单可整段搬用：①zip 根目录必须有 index.html（压的是构建目录的**内容**，不是目录本身）；②**只能用相对路径**（itch 从子目录托管，`/assets/...` 必坏）；③**文件名大小写必须与引用完全一致**（itch 服务器大小写敏感，本地 Windows/安卓不敏感，最容易埋雷）；④字体/库/统计全部打包进构建，不依赖 CDN 外部请求；⑤体积口径：优秀 Web 游戏初始下载 ≤5MB、总量 ≤8MB 是 Poki 的引擎指南标准——我们 17.6MB 的包按此口径仍偏胖，至少要把「首屏初始下载」压到 5MB 量级（懒加载已有基础）；⑥itch 侧硬限制：1000 文件、解压后 500MB、单文件 200MB。
- **适用性**：高
- **落地成本**：低（清单化后每次打包跑一遍；大小写/相对路径可写进构建脚本自动查）

### 2.3 itch.io 平台规则详解（PortalReady）
- **URL**：https://portalready.world/portals/itch-io/
- **一句话**：逐条引 itch 官方文档的平台规则页：上传限制、嵌入方式、索引（被搜索/浏览收录）条件、移动端标记、AI 内容披露。
- **可借鉴的具体点**：①**「发布」与「被索引」是两件事**：公开 + 有可玩内容 + 有封面才进搜索浏览，没封面直接不被收录；②新账号首个付费项目要过审核队列（数个工作日）但直链可玩；③手机可玩必须勾 Mobile Friendly，否则移动端会弹兼容性警告——我们是安卓优先，此项必查；④itch 有 Generative AI disclosure 字段，用了 AI 素材要如实勾选分类（Graphics/Sound/Text/Code），不披露有下架发现页风险——我们大量美术为 AI 生成，**上架时必须如实填**。
- **适用性**：高
- **落地成本**：低（上架前逐条核对，一次性）

### 2.4 How to Launch Your Game on itch.io（2026 上架指南）
- **URL**：https://app.cinevva.com/guides/itch-io-launch-guide
- **一句话**：从页面搭建到定价到可见性的 itch 上架全流程指南。
- **可借鉴的具体点**：上架物料最低线：可玩构建 + 630×500 封面 + **至少 3 张截图** + 描述 + 类型/标签；更好线再加玩法 GIF/30~90 秒预告、devlog 预告帖、自带流量（itch 本身不给量，靠 devlog/jam/社交引流）；定价建议 pay-what-you-want 带建议额（平台数据显示约 30% 付款高于最低价）。我们封面与宣传图已备，缺的是**实机截图组与 devlog 节奏**。
- **适用性**：高
- **落地成本**：低（截图半天；devlog 随版本走）

### 2.5 Service Workers for Browser Games: When They Help, When They Break（浏览器游戏 SW 生产实录）
- **URL**：https://www.rozgames.com/article/service-workers-browser-games-when-help-when-break
- **一句话**：一个已上线浏览器游戏两年的 Service Worker 生产经验总结：收益数据与三个真实翻车模式。
- **可借鉴的具体点**：①收益可量化：重复访问 Time to Interactive 5.6s→1.2s、网络请求归零、约 4% 玩家装成 PWA 且留存显著更高；②翻车模式一号就是**发版后玩家长时间拿到旧缓存**——解法是版本化缓存 + 更新提示，这正是我们「每次发布 SW 版本 +1」的纪律的外部印证，应继续保持并补一个「发现新版本→提示刷新」的玩家可见环节；③SW 让首访慢 200~400ms，取舍要心里有数。
- **适用性**：高（我们就是 SW/PWA 架构）
- **落地成本**：低

### 2.6 PWA Skill（GitHub 上的 PWA 模式技能文档）
- **URL**：https://github.com/hectormr206/orchestra/blob/HEAD/ai-core/SKILLS/pwa/SKILL.md
- **一句话**：系统整理 Service Worker、Manifest、缓存策略、离线优先与可安装性的技能文档，带 Lighthouse 检查表。
- **可借鉴的具体点**：红线清单：不要用激进策略缓存 HTML（会供旧版）、不要忘了 SW 更新处理、不要假设 SW 永远激活（要测无 SW 场景）；缓存分层：静态资源 Cache-First、HTML 网络优先——与我们现行 sw.js 策略对照查漏即可。
- **适用性**：中高
- **落地成本**：低（对照查漏半天）

---

## 三、Game Feel / Juice（打击感）

### 3.1 Game Feel Flow（Godot 4 的 juice 插件，29 效果 + 15 组合）
- **URL**：https://github.com/indieshade/godot-plugin-game-feel-flow/blob/HEAD/README.md
- **一句话**：Godot 一站式 game feel 系统：震屏、闪白、冻帧、相机、粒子等做成可组合的数据驱动效果，一行调用触发组合。
- **可借鉴的具体点**：核心思想与引擎无关：**juice 要做成「效果 = 可调参数的组合包」，而不是散落在战斗代码里的手写定时器**。我们战斗里 hitstop/震屏/飘字/残影已有零件，缺的是统一的「命中分级 → 效果组合」表（轻击/重击/击倒/KO 四档各一套参数）。此插件的 combo 组织方式可直接当 Web 版 juice 配置表的蓝本；Godot 阶段则可真装它。
- **适用性**：高（Web 借组织方式，Godot 直接用）
- **落地成本**：低（Web 版整理一张分级效果表）；Godot 阶段低

### 3.2 Saltmire Juice（Godot 4 免费 MIT 小型 game-feel 套件）
- **URL**：https://saltmire.itch.io/saltmire-juice （页内有 GitHub 源码链接）
- **一句话**：一个 autoload 搞定的小型 juice 套件：基于 trauma（创伤值）的震屏、hit-stop、精灵闪白、对象池飘字、缩放弹跳。
- **可借鉴的具体点**：①**trauma 震屏**：小击只加小 trauma、大击加得多，震幅 = trauma²——比「每次命中固定震 N 像素」自然得多，我们 Web 版震屏可直接换此公式（十几行）；②飘字走对象池不在热路径上新建节点——移动端性能纪律；③「一个入口 API、内部编排」的极简风格适合我们这种小体量项目，不必上重型框架。
- **适用性**：高
- **落地成本**：低（trauma 震屏 + 飘字池化各半天量级）

### 3.3 Game Feel & Juice SKILL（FirstFrameStudios 的技能文档，含量化调参表）
- **URL**：https://github.com/jperezdelreal/firstframestudios/blob/HEAD/.squad/skills/game-feel-juice/SKILL.md
- **一句话**：把 juice 写成可执行技能文档：10 项核心技术 + 以 60fps 帧数为单位的调参范围，来源标注为自研格斗项目 firstPunch 与品类研究（Celeste、怒之铁拳 4、空洞骑士等）。
- **可借鉴的具体点**：可直接当我们战斗手感的验收标尺：震屏小击 2px/重击 5~8px、0.1~0.2s；**hitlag 冻帧 2~6 帧（轻 2~3、重 4~6）且被列为「最重要的效果」**；受击闪白 0.067s、受伤红闪 0.15s；并强调「攻击命中 = 多层效果叠加（Layered）」的组合模式。我们已有 hitstop 60/100ms，可按此表逐项对表自查缺项（如出拳蓄势 anticipation、命中音分层）。
- **适用性**：高（格斗品类对口）
- **落地成本**：低（对表自查 + 补缺项，1 个小批次）

### 3.4 JUICE-LOG（juice 改动的记录格式范例）
- **URL**：https://github.com/ivala2081/vibe-game/blob/HEAD/examples/demo-1-cleave/JUICE-LOG.md
- **一句话**：一次「juice 专项 pass」的完整日志：每条改动标注来源（Vlambeer 原则编号/《Game Feel》章节）、数值理由、按氛围（mood）取舍，还单列「本轮明确不做的」与「延后的」。
- **可借鉴的具体点**：这是**工作法**而不只是知识：我们每次战斗手感调整都应留这样一份日志——先盘点已有 juice（pre-juice inventory）、按档位列数值出处、写明 deferred 项。直接解决我们「改了什么、为什么、还差什么」靠记忆的问题，与用户定的「文档集」方针完全合拍。
- **适用性**：高（工作法）
- **落地成本**：极低（立个模板即可）

---

## 四、教程 / 新手流（FTUE）

### 4.1 U3 — Onboarding, Tutorialization, and FTUE（gamestack 研究文档）
- **URL**：https://github.com/rondorkerin/gamestack/blob/HEAD/docs/research/round1-universal/U3-onboarding-and-teaching.md
- **一句话**：引擎/品类无关的新手引导研究综述，每条结论标注证据等级（多源验证/单源），汇集任天堂四段式教学、认知负荷、即时教学等一手出处。
- **可借鉴的具体点**：①**最好的教程是关卡不是弹窗**：《马里奥 1-1》《传送门》《空洞骑士》开场都是「无风险区先练 → 真压力下考 → 与旧机制组合 → 变奏收尾」的四段式（岸本/早矢仕的 kishōtenketsu 起承转结）；②**工作记忆一次最多约 3 个新概念**，超了就是白教；③**即时教学（用到时才教）优于前置灌输**，前置教学流失更高；④移动端 Day-1 留存平均仅 28~33%，**流失主要发生在教程漏斗里**，每个教程步骤都是一个退出点、应按漏斗记录。对应我们：开局点击数与文字墙曾是实测杀手（开局 27 次点击），应按此框架重做第一周：Day1 只教「训练→打一场→看结果」一个循环，其余系统（装备/赞助/好感）随首次用到时再教。
- **适用性**：高（直击我们新手流已知问题）
- **落地成本**：中（重排第一周教学节奏需动流程代码，但有明确蓝本）

### 4.2 Game Onboarding Tutorial Design — Knowledge Brain（技能知识库）
- **URL**：https://github.com/dungnotnull/game-onboarding-tutorial-design-agent-skill/blob/HEAD/SECOND-KNOWLEDGE-BRAIN.md
- **一句话**：教程设计技能的常驻知识库：FTUE、渐进披露、脚手架、认知负荷、可跳过与回流玩家处理，带证据分级与文献表。
- **可借鉴的具体点**：量化目标可直接立为验收线：**首次成功体验要在 60~90 秒内发生**；交互式练习 + 即时无惩罚反馈优于被动看文字/视频；必须给老玩家跳过与回流玩家回顾。我们的序章测力机+试训是「交互练习」的对路做法，但首胜/首个正反馈的时间点应按 90 秒线复测。
- **适用性**：高
- **落地成本**：低（立验收线 + 一次漏斗复测）

---

## 五、平衡测试方法与 Playtest 工作法

### 5.1 Module 8: Prototyping & Playtesting（表格 + Machinations 经济建模）
- **URL**：https://github.com/josphk/love-2-vibe/blob/HEAD/wiki/design/game-design-theory/module-08-prototyping-playtesting.md
- **一句话**：原型与测试方法模块：强调一切设计理论都要过「真人玩 + 数字模拟」两关，并具体推荐电子表格与 Machinations 做经济平衡。
- **可借鉴的具体点**：①**电子表格模拟经济**：把资源产出/消耗/兑换公式放进表格，一次模拟 100 回合，回答「第几周钱花不完/哪条策略产出十倍」这类问题——《文明》系列即如此平衡；②Machinations 把经济画成资源流图（源/汇/转换器）做 Monte Carlo 跑批，看资源在哪积压、在哪枯竭。我们已用 JS 批量模拟做战斗平衡（同思路），下一步应把**经济与成长曲线也做成常驻可复跑的模拟脚本 + 一页参数表**，而不是每次审查临时写脚本。
- **适用性**：高（B 类问题的主要解法）
- **落地成本**：中（把已有模拟脚本整理为常驻工具链）

### 5.2 Machinations vs Spreadsheets（官方方法文）
- **URL**：https://machinations.io/articles/the-right-tool-for-the-right-task-machinations-vs-spreadsheets
- **一句话**：Machinations 官方对比文：表格擅长公式推导，Machinations 擅长可视化资源流与随机批量模拟（Predictions），两者导出 CSV 互通配合使用。
- **可借鉴的具体点**：对我们最实用的是其工作流分工：**确定性公式用表格/代码，带随机性的玩家旅程用 Monte Carlo 跑批看分布**（如 1000 条不同练法的生涯线看登顶周数分布、经济崩坏点分布）。我们不必真买工具——已有 JS 模拟能力，学的是「按分布验收，不按单条曲线验收」这一条。
- **适用性**：中高
- **落地成本**：低（验收口径升级，零工具成本）

### 5.3 game-playtest SKILL（NVlabs Skill2Env 的结构化试玩技能）
- **URL**：https://github.com/nvlabs/skill2env/blob/HEAD/SkillHub/skills/game-playtest/SKILL.md
- **一句话**：把 playtest 写成严格协议的技能文档：先定问题、静默观察、行为数据高于口头评价、至少 5 名测试者才算数据。
- **可借鉴的具体点**：协议要点可直接落为我们的自测规范：①**开测前先写 3~5 个可观测的问题**（能通过看玩家行为回答、且答案直接决定一个设计改动）；②观察员不许教、不许解释、不许有反应——「玩家的嘴会说谎，手不会」；③每名玩家一张带时间戳的观察表（行为分类：动作/迟疑/困惑/情绪/原话）；④真人测试仍是金标准，AI/自动测试只作覆盖与回归补充——正好对应我们「助手批量模拟自测 + 用户真机主观确认」的分工：模拟管回归，真人（用户）管手感与观感，**两者不能互相冒充**（我们曾以冒烟断言代游戏体验汇报，已被用户纠正，此条是外部背书）。
- **适用性**：高（工作法）
- **落地成本**：极低（落一份 PLAYTEST 协议模板）

### 5.4 How to run a playtest that tells you something（独立开发者实操文）
- **URL**：https://h-idris.com/blog/game-ux-playtesting.html
- **一句话**：小团队 playtest 实操：5 个人一下午 + 录屏 + 闭嘴纪律，胜过一个月内部争论；含从笔记整理成修复清单的排序法。
- **可借鉴的具体点**：①约 5 名玩家即可暴露绝大多数可用性问题，3/5 人卡住的同一处就是实锤问题；②开场十分钟「无协助首接触」价值最高，主持人每多说一句就毁掉一部分数据；③>3 秒的迟疑要记下当时在看什么；④笔记整理：**按「发生了什么」分组而非按「谁说的」**，五个人卡同一屏 = 一个问题。我们用户只有一人真机，但此法可用于将来 itch 上架后收集玩家反馈的整理口径，现在也可用于记录用户每次试玩反馈。
- **适用性**：中高
- **落地成本**：极低

---

## 六、存档与版本迁移

### 6.1 Saving progress in web games（PortalReady 的版本化存档助手，带完整代码与测试）
- **URL**：https://portalready.world/builds/saving-progress-localstorage/
- **一句话**：面向门户网站游戏的存档实战指南 + 一个可直接参考的版本化 save-store 实现（localStorage/门户数据模块通用），含 Node 下的单元测试覆盖清单。
- **可借鉴的具体点**：这是本轮**存档方面最值得精读的一篇**：①存档载荷带 version，迁移字典按版本逐级函数（v1→v2→v3），无版本字段的老档按 v1 处理；②**三种状态锁定存档、只在内存里玩、绝不回写**：读不出（unreadable）、版本比当前游戏还新（newer，旧构建绝不能覆盖新档）、读错误（read-error）——「读不懂的档永不覆盖」是防丢档的核心；③测试清单值得整表搬走：新档、逐级迁移、**损坏 JSON**、恢复时备份失败、读失败、新版本档、**配额超限 QuotaExceededError**、存储不可用；④平台事实：存档按 origin 隔离——**自己域名、itch 嵌入页、其他门户之间存档互不可见**，玩家换入口会「丢档」，需在页面文案里预告并提供导出/导入。
- **适用性**：高（正式发布前必修课）
- **落地成本**：中（给现有三槽存档补：损坏档保护、新版本档锁定、配额异常兜底、导出/导入；测试按其清单补）

### 6.2 Game Save Best Practices for Web Games（Bugnet）
- **URL**：https://bugnet.io/blog/game-save-best-practices-web
- **一句话**：Web 游戏存档最佳实践短文：小档 localStorage（<1MB）、大档 IndexedDB、必带版本号迁移、优雅处理存储错误、提供文件导出备份。
- **可借鉴的具体点**：与 6.1 互为印证的两条落地动作：①localStorage 是同步 API，大档频繁写会卡帧——存档写入时机要避开战斗热路径（我们自动存档点应核查）；②**给玩家一个导出存档文件按钮**是小成本大信任的功能，适合放进设置屏危险区旁边。
- **适用性**：中高
- **落地成本**：低

> 注：Idle Academy（1.2）与 Esports Dynasty（1.1）的存档规范与本节两篇完全同向，四处独立来源一致，可视为该领域的共识做法，放心执行。

---

## 七、2D 骨骼动画在 Web 上的轻量实现

### 7.1 2D Skeletal Animation Landscape（2026-09 的全景对比调研，逐条带一手出处）
- **URL**：https://github.com/jonathanreiscom/skeleton-converter/blob/HEAD/docs/2d-skeletal-animation-landscape.md
- **一句话**：2026 年 9 月做的骨骼动画工具全景调研：按「活跃/维护/死亡/归档」给 Spine、DragonBones、Rive、Live2D 等定状态，所有结论引官方源。
- **可借鉴的具体点**：选型事实一次说清：①**Spine 仍活跃**（4.3.x 持续发版），JS/TS 运行时覆盖 WebGL/Canvas/PixiJS/Phaser/Godot，但**运行时许可绑定编辑器授权**（用运行时的人必须持有 Spine 编辑器许可，专业版才有网格/IK 等高级功能）；②**DragonBones/DragonBonesJS 处于维护状态**（仓库 2026-01 仍有推送、MIT），官方 README 已转而推荐其继任者 LoongBones（云端 SaaS、闭源）；③结论对我们：Web 阶段继续自研轻量纸偶（无授权成本、无外部依赖）是合理的；若将来要上专业管线，Godot 侧有官方 Spine 运行时与 DragonBones 的 Godot 移植可选，但要先算授权账。
- **适用性**：高（选型定心丸）
- **落地成本**：低（只读结论，避免走错路）

### 7.2 DragonBonesJS（DragonBones 的 TS/JS 运行时）
- **URL**：https://github.com/DragonBones/DragonBonesJS
- **一句话**：DragonBones 官方 JavaScript/TypeScript 运行时，MIT，支持 Egret/PixiJS/Phaser/Hilo/Cocos Creator 的工厂接入。
- **可借鉴的具体点**：即使不引入它，它的**数据模型**值得抄概念：骨架数据（ske.json）+ 图集（tex.json + atlas）分离、Armature/Slot/Display 的分层——我们的 rig.js 已经是同构的（模板 + 每角色标定），可对照它的 slot/display 概念把「换件」接口做规范（见第十节模块化）。引入成本则在于：需要 DragonBones 编辑器产出资产、且运行时处于维护状态、官方推荐迁 LoongBones——**不建议现在引入**。
- **适用性**：中（学概念，不引运行时）
- **落地成本**：低（概念对照）；引入则高且不推荐

### 7.3 spine-runtimes / spine-ts（Spine 官方运行时仓库）
- **URL**：https://github.com/esotericsoftware/spine-runtimes/blob/HEAD/spine-ts/README.md
- **一句话**：Spine 官方 TS/JS 运行时：core 与 webgl/canvas/player/webcomponents/pixi-v7/v8 等后端分包，npm 分发。
- **可借鉴的具体点**：①架构分层可学：**core（骨架求解）与渲染后端分离**——我们的纸偶引擎若将来要换渲染层（DOM→Canvas）可照此分；②明确的坑：spine-ts 的 Canvas 后端**不支持网格附件、裁剪、双色染色**，只有 WebGL 后端功能完整——说明「Canvas 轻量路线必然有功能上限」，与我们 Canvas 切片路线 A 的实测结论一致；③许可红线再强调：集成运行时免费，但**使用者必须持有 Spine 编辑器许可**，个人项目要算这笔账。
- **适用性**：中
- **落地成本**：低（只读）；真引入需购许可 + 资产管线重做，高

### 7.4 我们现行自研纸偶（对照结论，非外部来源）
结合 7.1~7.3 与 CHARACTER_RIG.md 的试点实测：现有路线（从定稿姿势图原像素切件 + 程序补绘、RIG_TEMPLATE 共用骨架、DOM transform 驱动、中端安卓节流 52fps、部件 84KB/人）恰好落在「零授权、零依赖、身份零漂移」的最优点上；外部工具（Spine/DragonBones）解决的是「从零 authoring」，而我们的瓶颈是「已有立绘的切件与标定工时」——工具换了也省不掉。**结论：Web 阶段不换运行时，把精力花在模块化降本（第十节）。**

---

## 八、Godot 相关（长期正式版方向）

### 8.1 AnimationTree 教学模块（love-2-vibe 的 Godot 4 学习路线 Module 10）
- **URL**：https://github.com/josphk/love-2-vibe/blob/HEAD/wiki/engines/godot/module-10-animation-player-tree.md
- **一句话**：Godot 4 动画系统完整教学：AnimationPlayer 存动画、AnimationTree 负责混合/状态机/过渡，含第三人称角色全状态机（idle/walk/run/jump/fall/land/attack）实作目标。
- **可借鉴的具体点**：Phase 8 的核心概念一次讲透：状态机用 `travel()` 切换、BlendSpace 做方向混合、AnimationPlayer 可动**任意属性**（不只是骨骼：UI、shader、 gameplay 状态都能动）。我们的战斗状态（待机/出拳/受击/击倒/起身/胜利）在 Web 版已有对应的姿势/动作表，迁 Godot 时可 1:1 映射为 AnimationTree 状态机——**现在 Web 版 rig.js 的姿势命名与状态划分，就是未来 AnimationTree 的设计稿，应保持命名稳定**。
- **适用性**：高（Phase 8 预研）
- **落地成本**：低（立项时精读；现在只需保持状态命名规范）

### 8.2 Godot Gauntlet Challenge 02: Bone Doll（Skeleton2D + AnimationTree 的纸偶格斗实作题）
- **URL**：https://github.com/josphk/love-2-vibe/blob/HEAD/wiki/engines/godot/godot-gauntlet.md
- **一句话**：一个周末级实作挑战：用 Godot 的 Skeleton2D/Bone2D 做分离部件的 cutout 角色，用 AnimationTree + BlendSpace2D 按出拳方向混合上/中/下段攻击。
- **可借鉴的具体点**：这就是我们纸偶路线在 Godot 里的原生对应物：①部件 Sprite 挂 Bone2D、Polygon2D 可绑骨骼做蒙皮变形；②战斗状态用 BlendSpace2D 按瞄准角混合 punch_up/forward/down，避免动画数量爆炸；③「Skeleton2D + AnimationTree 是专业 2D 游戏处理复杂角色动画、避免组合爆炸的方法」——Phase 8 若走 2D/2.5D 路线，此题就是最小可行原型；若走 3D 路线，其状态机思路平移到 AnimationTree 3D 版。
- **适用性**：高（Phase 8 的 2D 路线原型蓝本）
- **落地成本**：低（预研）；实作一个周末量级

### 8.3 Using the AnimationTree StateMachine（Godot Recipes / KidsCanCode）
- **URL**：https://kidscancode.org/godot_recipes/4.x/animation/using_animation_sm/index.html
- **一句话**：Godot 官方社区教程站的 AnimationTree 状态机实操：以 idle/run/attack1/attack2/hurt/die 精灵角色演示状态组织与过渡控制，带可下载示例工程。
- **可借鉴的具体点**：状态命名与过渡条件的最小规范（one-shot 动画播完自动回待机、hurt/die 的优先级打断）——与我们战斗动作表（出拳 250ms/受击 320ms 的时序锚点）正好对接，Phase 8 建状态机时照此组织即可。
- **适用性**：中高
- **落地成本**：低

### 8.4 Dialogic 2（Godot 对话/视觉小说插件，MIT）
- **URL**：https://raw.githubusercontent.com/dialogic-godot/dialogic/main/README.md
- **一句话**：Godot 最主流的对话系统插件：可视化时间线编辑、角色管理、分支叙事、存档友好的对话状态（注：2.x 仍在 alpha 迭代，要求 Godot 4.2.2+，README 现标注需 4.5+，采用时须锁定版本）。
- **可借鉴的具体点**：我们剧情/好感系统在 Web 版是自研 story-engine；Phase 8 迁 Godot 时**不要再自研对话轮子**——Dialogic 的「角色档案 + 时间线 + 条件分支 + 信号回游戏逻辑」正是我们 28 段剧情 + 4 人好感事件的结构，迁移时按其数据模型对齐即可。现在的启示是：Web 版剧情数据应保持「角色/对白/条件/效果」的结构化形态，不要把台词写死在 UI 代码里，将来才迁得动。
- **适用性**：中（Phase 8 高，当前为数据卫生提醒）
- **落地成本**：低

### 8.5 awesome-godot（Godot 生态总索引）
- **URL**：https://raw.githubusercontent.com/Calinou/awesome-godot/master/README.md
- **一句话**：Godot 官方维护的精选索引：开源游戏、插件、脚本、模板与 Demo（含官方 Demo 工程、体育经营的 99Managers 等条目）。
- **可借鉴的具体点**：Phase 8 的一切选型（对话、存档、juice、UI、发布）先在此索引里查一遍再决定自研；本报告 3.1/3.2/8.4 的多个条目都可由此追溯。用法上提醒：索引条目版本跨度大，采用前须核对 Godot 4.x 兼容性。
- **适用性**：中（长期工具书）
- **落地成本**：极低

### 8.6 Responsive UI Skill（Godot 双端分辨率/安全区技能文档）
- **URL**：https://github.com/varalix-digitech-solutions/game-build-team-skill/blob/HEAD/skills/game-build-team/vendor/godot-prompter/skills/responsive-ui/SKILL.md
- **一句话**：Godot 4.3+ 多分辨率 UI 技能：stretch 模式、宽高比、DPI 缩放与移动/桌面的安全区与刘海处理。
- **可借鉴的具体点**：Phase 8 的双端基线可直接抄：设计分辨率 + `canvas_items` 拉伸 + `expand` 宽高比、HUD 用锚点贴边、移动端处理刘海安全区与方向锁定；测试矩阵要含比 16:9 更宽（21:9）与更高（手机竖屏）两端——这与 Web 版现在的设备矩阵测试习惯一致，可平移。
- **适用性**：中（Phase 8）
- **落地成本**：低

---

## 九、双端体验、音乐与流程工作法

### 9.1 Responsive HTML5 Game Scaling: The 1.2 Ratio Rule（Phaser 圈的双端缩放实战）
- **URL**：https://pixelgamecraft.com/blog/responsive-game-scaling/
- **一句话**：HTML5 游戏双端适配的实战总结：FIT/EXPAND/RESIZE 三种缩放模式的取舍，与「基准宽高比落在 0.6~1.2 区间、FIT 模式黑边最小」的 1.2 法则。
- **可借鉴的具体点**：①UI 在边缘的游戏应选 FIT（保全不裁切），并把舞台基准比例控制在 1.2 法则带内，手机近全屏、桌面只有小边；②设备测试矩阵明确四档：手机竖屏 390×844、平板、桌面 16:9、超宽 21:9，逐档验 UI 不出画。我们是 DOM 舞台而非 Canvas，但**舞台比例与测试矩阵的纪律完全可搬**：把这四档写进每次发布前的实拍清单。
- **适用性**：高（E 类问题）
- **落地成本**：低（清单化）

### 9.2 Phaser 3 Examples（官方示例仓库的镜像）
- **URL**：https://github.com/study-game-engines/phaser.js-examples
- **一句话**：Phaser 3 全部官方示例的源码镜像（与 labs.phaser.io 同步），按系统分类可检索。
- **可借鉴的具体点**：我们**不换引擎**（原生 JS 已成型，换 Phaser 等于重写）；它的价值是「场景（Scene）分工与小系统写法」的速查字典：如动画、粒子、相机震屏的最小实现长什么样。仅作参考书，不作依赖。
- **适用性**：低中
- **落地成本**：极低（按需查）

### 9.3 程序化音乐/音效的开源选型（两份 GitHub 调研文档）
- **URL**：https://github.com/pjc0210/studygotchi/blob/HEAD/docs/research/game-art/07-sound-design.md ；库清单见 https://github.com/dexter5000000/webiste-for-gaming/blob/HEAD/OPEN_SOURCE_LIBRARIES_GUIDE.md
- **一句话**：前者是为浏览器游戏做的声音选型调研（含许可与体积核实），后者是 100+ 浏览器端程序化音乐/音效库清单（Tone.js、ScribbleTune、ZzFX/jsfxr 等，全部客户端运行、无需 API key）。
- **可借鉴的具体点**：直击 F 类问题（BGM 只有 2 首）：我们 BGM 已是 Web Audio 全合成（sequencer 两套曲目），扩曲不必找音频文件——①沿现有合成路线，用「和弦进行 + 节奏型 + 音色」参数化出标题/训练/商店/剧情/冠军战等场景曲，本质是给 sequencer 加曲目数据，成本远低于外采；②SFX 层可借 ZzFX（<1KB、一个参数数组一个音效、MIT）/jsfxr 的参数化思路把音效做成预设表，便于批量补音（读秒、成就、购买已有，可继续扩）；③Tone.js 体积约 400KB、更适合音乐编排而非单发音效——我们包体敏感，**不建议为 BGM 引入 Tone.js，现有原生 Web Audio sequencer 路线更轻**。
- **适用性**：高（F 类问题的低成本解法）
- **落地成本**：低中（每首新曲 = 一份曲目数据 + 试听校准）

### 9.4 Release Skill（Framewise：从真实 diff 生成 changelog 的发布技能）
- **URL**：https://github.com/vork/framewise/blob/HEAD/.cursor/skills/release/SKILL.md
- **一句话**：一份可执行的发布技能：定版号 → 读上个 tag 以来的**真实代码 diff** → 按 Keep a Changelog 分类写条目 → 提交、打 tag、触发发布。
- **可借鉴的具体点**：两条硬规矩值得立为我们的发布纪律：①**changelog 必须从实际 diff 提炼，不许只抄 commit 标题**（commit 常写内部重构、且不完整）；②分类固定六档 Added/Changed/Deprecated/Removed/Fixed/Security，条目写玩家语言。我们已有 SW 版本号与批次记录（GAME_AUDIT2 各批），缺的是一份**面向玩家的 CHANGELOG.md** 与「发版 = 按此技能走一遍」的固定动作。
- **适用性**：高（工作法，对应 I 类）
- **落地成本**：极低（建 CHANGELOG.md 并回填 v0.9.x 以来条目，半天）

### 9.5 Match Mania Release Guide（小游戏项目的发布手册范例）
- **URL**：https://github.com/ssfdre38/match-mania/blob/HEAD/docs/releases/RELEASE_GUIDE.md
- **一句话**：一个小体量游戏项目的完整发布手册：语义化版本、CHANGELOG 模板、发布脚本与十项发布检查表（提交干净、changelog 已更新、本地测过、无关键 bug、文档同步、验下载、验发布页、公告）。
- **可借鉴的具体点**：证明「发布手册」不需要宏大：一页纸 + 一个脚本 + 一张检查表就够小项目用。我们的 RELEASE_WEB.md 已有差距清单，可按此范例补上「每次发版的固定 10 步」并与 2.1 的 butler 上传合并成一条命令链。
- **适用性**：中高
- **落地成本**：低

---

## 十、专项：模块化角色建模（统一骨架 + 模块替换，批量实装）

> 用户 2026-11-10 定的方针：骨架统一，角色按模块替换（头/发型、躯干服装、上臂、前臂+拳套、大腿、小腿+鞋、配饰）。本节专门调研各主流 2D 骨骼工具的「皮肤/模块替换」机制与开源批量生成做法，并对照我们现行纸偶架构（RIG_TEMPLATE 全员共用骨架/动作 + RIG_CHARS 每人标定）。

### 10.1 Spine — Skins（用户指南，官方）
- **URL**：http://uk.esotericsoftware.com/spine-skins
- **一句话**：Spine 官方 skins 机制说明：用同一套骨骼与动画、换整套附件（attachments）来换装或拼出整个角色。
- **可借鉴的具体点（这是模块化角色的「教科书定义」）**：
1. **skin placeholder（皮肤占位符）**：槽位（slot）下放的不是具体图，而是占位符；动画关键帧只记「显示哪个占位符」，真正显示哪张图由当前 skin 决定——**动画与具体角色彻底解耦**，一套动作全员通用正是靠这一层；
2. skin 还可包含**仅在该 skin 下激活的骨骼与约束（skin bones / skin constraints）**：如某角色的长马尾骨链、裙摆约束只在她的 skin 里存在——对应我们「马尾无第二骨节」的遗留问题，解法是把发骨做成可选模块而非全员骨架的一部分；
3. **skin constraints 可改骨骼位置来适配不同体型比例**：同一骨架+动画可复用于不同身材的角色（体型差靠约束吸收）——对应我们靠每人标定 segRatio 吸收体型差的做法，Spine 把它产品化了；
4. 制作侧有 PSD 导入标签约定（图层名打 `[bone]/[slot]/[skin]` 标签自动生成骨骼/槽位/皮肤），说明**模块化从美术交付格式就要规范**：图层命名即接口。
- **适用性**：高（概念蓝本；我们不买 Spine 也能照此组织自研 rig）
- **落地成本**：低（概念映射到 rig.js：占位符=我们的部件键，skin=每角色的部件集定义）

### 10.2 Spine — Runtime Skins 与 Mix-and-Match（运行时组合皮肤）
- **URL**：http://hi.esotericsoftware.com/spine-runtime-skins ；组合皮肤实作见 https://esotericsoftware.com/spine-godot （spine-godot 文档的 03-mix-and-match 示例）与 http://uk.esotericsoftware.com/spine-unity-mix-and-match
- **一句话**：运行时 API 层如何把多个 skin 叠加组合成一个「自定义角色」：`new Skin()` 后逐个 `addSkin()`（如 skin-base + hair + outfit + accessory），再 `setSkin()` + `setSlotsToSetupPose()` 生效。
- **可借鉴的具体点**：
1. **模块粒度 = 一个部件类别一个 skin**：官方示例就是 base（素体）/头发/上衣/裤子/配饰各成一个 skin，运行时按需拼——这正是用户列的模块清单（头/发型、躯干服装、上下臂、腿、鞋、配饰）的工业版分法；
2. **template（模板）skin 工作流**：先做一个带全部占位符的虚拟模板皮肤来制作动画，避免空槽与跨骨架共享问题——对应我们应先定「标准部件模板」（每槽位的画布、枢轴、命名）再批量产角色部件；
3. 组合的坑也写明了：换 skin 时只会替换「旧 skin 里已激活的那些槽位」的附件，直接 setSkin 可能不显示，必须按序处理（pixi-spine 的已知 workaround 是先 setSkin(null) 再设新 skin）——提醒我们自研 rig 的换件函数要定义清楚「槽位未提供部件时回退到默认件」的语义；
4. 大批量换装的体积优化（官方论坛答复）：组合数爆炸时不要把所有组合都导进一份图集，应**运行时按需替换纹理/图集页**——对应我们 50+ 人不能把所有人部件打进一个大图集、要按角色懒加载（与批次 E 的懒加载纪律一致）。
- **适用性**：高
- **落地成本**：低（接口设计参考）；按此重构 rig 的部件装配层为中

### 10.3 DragonBones — replaceSkin / replaceSlotDisplay（换装 API 与 Cocos 官方示例）
- **URL**：运行时（Unity 版 README 的 Skin/Slot Replacement 节）https://github.com/dragonbones/dragonbonesunity/blob/HEAD/README.md ；Cocos 官方示例解析 https://deepwiki.com/cocos/example-projects/10.1-dragonbones ；外部图片换件讨论 https://github.com/korlibs/korge/discussions/488
- **一句话**：DragonBones 提供两级换件：整套换皮 `replaceSkin/SwapSkin`（可排除指定槽位，如换装时保留武器槽）与单槽换显示对象 `replaceSlotDisplay` / `slot.displayIndex` 切换。
- **可借鉴的具体点**：
1. **两级粒度**正是我们需要的 API 形态：整人换装（换一整套角色部件）用 skin 级；单件换装（只换拳套/只换鞋）用 slot 级，且换 skin 时能**排除指定槽位**（Cocos 示例换皮时排除 weapon_l/weapon_r）——对应我们「换装系统与角色身份分离」：比赛服是角色 skin、拳套装备应走 slot 级覆盖，不必重做整人；
2. Cocos 官方示例的角色演示把「武器/皮肤切换」做进同一个主角演示工程，且**预加载全部 skin 与武器数据到一个 helper armature**——资产组织方式可参考；
3. korge 讨论暴露的现实坑：用**外部独立图片**直接替 slot 显示对象时，相对槽位的位置/缩放不好控制——印证我们的教训：部件必须按统一模板（同画布、同枢轴）生产，「随便拿一张图塞进槽位」行不通；
4. 老版教程的 ChangeClothes 示例还有一条朴素经验：多套衣服同尺寸同形状时直接在图集里切换纹理即可——**同版型的服装差异，第一选择是换纹理/换色，不是换部件**。
- **适用性**：高（API 形态直接可抄到 rig.js）
- **落地成本**：低

### 10.4 Live2D Cubism — 分件/纹理图集/可定制模型（对照参考，不采用）
- **URL**：https://0xlive2dmodels.GlycoProduction.com/docs/live2d-primer/
- **一句话**：Live2D 入门详解：分层原画（PSD）→ ArtMesh + 变形器（deformer，非骨骼）→ 参数驱动，导出纹理图集（texture atlas）；「可定制模型」靠作者额外提供部件与暴露参数（换发、换装、道具）。
- **可借鉴的具体点**：
1. **分件粒度远比骨骼纸偶细**：典型 VTuber 模型 60~200 个部件（前发/侧发/后发、每只眼的白/瞳/高光/睫毛分件），且**分件命名与层级在 PSD 阶段就定死**、直接成为导入后的部件树——再次印证「模块化成败在美术交付规范」；
2. **换色走纹理层**：改发色/衣服颜色 = 直接编辑导出的纹理图集图片，不需要动绑定——最便宜的差异化手段；
3. **遮挡补绘是硬成本**：刘海掀开露出的额头、衣服下被挡的身体，源图没画就必须补画（行业里靠人工或 AI inpainting）——与我们 CHARACTER_RIG 的实测完全一致（B1 硬拆出拳露馅、躯干靠扩散修补），说明这是**所有 cutout 路线的共性成本，省不掉，只能靠模板与流程摊薄**；
4. 不采用的原因也要说清：Live2D 是变形器+参数体系（为面捕/表情设计），没有「出拳」这类骨骼动作链，且 Web 运行时与授权另成一套——对战斗纸偶不对口，只借分件与纹理换色经验。
- **适用性**：中（经验参考）
- **落地成本**：极低（只读）

### 10.5 Universal LPC Spritesheet Character Generator（开源纸偶批量生成的最大实证）
- **URL**：调研台账 https://github.com/pjc0210/studygotchi/blob/HEAD/docs/research/game-art/03-asset-and-rig-ledger.md ；资产包调研 https://github.com/exo-place/aeriea/blob/HEAD/docs/research/paperdoll-asset-packs.md （内含生成器仓库与在线工具链接）
- **一句话**：Liberated Pixel Cup 的开源角色生成器：统一画布/动作帧规格下，身体、肤色、发型、眼睛、服装、武器、配饰全是可替换图层 + 调色板变体，点选即合成整张 spritesheet，几百种组合。
- **可借鉴的具体点**：
1. **「同规格图层库」是批量生成的唯一前提**：LPC 能生成海量角色，靠的是所有贡献者的图层都严守同一画布尺寸、同一锚点、同一动作帧表（walk/cast/thrust/slash/shoot/hurt 帧数固定）——部件不是「画得像」，而是「规格对得上」；
2. **差异的构成比**：一个「新角色」= 素体（少量）× 发型（中量）× 服装（中量）× **调色板换色（大量）** 的组合，真正逐人独绘的只有极少数标志件——批量角色的成本结构应按此设计（详见 10.8 的模块分工表）；
3. 许可教训（与我们无关但值得记）：LPC 美术多为 CC-BY-SA/GPL 混合、每层要记 CREDITS.csv——**别人的部件库不能直接拿来商用**，我们只能学其组织方式，部件必须自产（我们本来就是自产，此条是排除项确认）。
- **适用性**：高（组织方式是全员扩围的范本）
- **落地成本**：低（立规格与命名表）；按规格量产部件为中（见 10.8）

### 10.6 「Skeleton is the unit」（fluxa-sprite 的架构决策记录）
- **URL**：https://github.com/rodbarenco/fluxa-sprite/blob/HEAD/adrs/0060-models.md
- **一句话**：一个精灵装配工具的 ADR（架构决策记录）：明确提出「骨架才是单位，不是角色」——分层装配只在所有部件为同一骨架而画时成立。
- **可借鉴的具体点**：骨架要声明：画布网格、方向、**每个动作的帧数**、**槽位清单与 z-order（绘制顺序）**；一个部件只属于一个骨架、只为它提供。这篇短文可以当我们「部件模板规格书」的提纲：把 RIG_TEMPLATE 已有的骨骼/姿势数据，补上正式成文的**槽位表 + 每槽位的画布/枢轴/绘制顺序/命名规范**，新角色部件一律按规格书交付、验收按规格书逐项核。
- **适用性**：高
- **落地成本**：极低（写一页规格书）

### 10.7 Unity 2D Animation — Sprite Library / Resolver（换装机制的另一工业实现）
- **URL**：https://github.com/claude-dev-suite/claude-dev-suite/blob/HEAD/skills/gamedev/unity-2d-animation/SKILL.md
- **一句话**：Unity 2D 骨骼动画技能文档：PSD 分层导入自动建骨，Sprite Library 按「类别（Hair/Torso/Legs）+ 标签」组织部件，运行时用 Resolver 换装而不必重新蒙皮。
- **可借鉴的具体点**：①**类别+标签**的部件注册表（Category: Hair, Label: ponytail-pink）就是我们 RIG_CHARS 数据应升级成的「部件目录」结构：角色 = 一组类别→标签的选择，而不是一堆文件路径；②PSD 重新导入后骨骼与权重保持同步——提示我们的切件脚本要**可重跑**（改一件部件重跑管线即可，而不是手工拼图）；③脸部表情用贴图切换、身体用骨骼的混合分工，与我们「表情/立绘归剧情层、战斗只管身体动作」的现状一致。
- **适用性**：中高（数据结构参考）
- **落地成本**：低

### 10.8 Godot 原生 cutout 与「免费预绑定角色不存在」的实证（Phase 8 对照）
- **URL**：官方 cutout 教程 https://docs.godotengine.org/en/4.1/tutorials/animation/cutout_animation.html ；开源调研 issue https://github.com/daymanondev/pi-godot-kit/issues/12 ；代码化 cutout 骨架 https://github.com/haingt-dev/godot-pixel-cutout-rig/blob/HEAD/CHANGELOG.md
- **一句话**：Godot 官方 GBot 教程演示了原生 cutout 的标准层级（hip 为根、部件 Sprite/RemoteTransform 挂骨）；一份 2026 年的开源调研得出诚实结论：**免费的预绑定 Skeleton2D 角色基本不存在，免费部件也不含被遮挡处的补绘——第一套骨架必须自己建，建好后换皮才便宜**；另有开源项目把 cutout 骨架写成代码生成的 hip 根骨骼树（8 张占位部件图同枢轴可换真图）。
- **可借鉴的具体点**：①「**第一套 rig 是投资品，之后每角色只是换纹理**」——与我们的处境完全同构：主角试点（第一套）最贵是应该的，扩围定价不能按试点单价线性外推，前提是把模板/规格/脚本沉淀好；②Godot 侧换皮 = 换 Bone 下 Sprite 的 texture，机制原生支持，Phase 8 若走 2D 路线可平移我们 Web 版的部件资产（同图、同枢轴概念）；③代码生成骨架（而非编辑器手摆）与我们 rig.js 的数据驱动方式一致，跨引擎可移植性最好。
- **适用性**：中高
- **落地成本**：低（结论背书 + Phase 8 预研）

### 10.9 rig-c（把单张立绘自动拆件绑骨的开源管线，Spine 格式输出）
- **URL**：https://github.com/rig-c
- **一句话**：一套「一张角色原画 → 分层部件 → 加权网格/骨链/物理 → 输出 Spine 4.3 格式骨架数据、浏览器可播」的开源编译管线（MIT），每一步都有命名断言校验后才写出文件。
- **可借鉴的具体点**：①它证明「拆件→绑骨」可以做成**带断言的流水线**而不是纯手工活：每阶段有具名检查（named assertions）、不过检不落盘——我们的 extract.py 管线应补同样的自动验收（如：部件 alpha 包围盒、枢轴在画布内、静止重组误差阈值，试点时静止重组误差 0.83/255 就是这类指标）；②其 parts 阶段「由分解图层组装部件 + 生成权重网格 + 骨链 + 待机循环」的分工，与我们的切件/补绘/标定三步可对照补强；③工具很新（需自备图像分解模型），**不建议现在引入**，但其「管线 + 断言」思想应立即吸收。
- **适用性**：中
- **落地成本**：低（吸收验收思想）；引入管线本体为高且不建议

### 10.10 模块分工结论：哪些必须每角色独有、哪些可共用母版换色

综合 Spine/LPC/Live2D/DragonBones 的共同做法与我们的立绘现状（52 名角色均为正面抱架站姿、同画风、体型差有限），把用户列的模块按「身份权重 vs 规格通用性」分三档：

| 模块 | 档位 | 做法 | 理由（依据） |
|---|---|---|---|
| 头（脸型/五官/表情基底） | **每角色独有** | 从该角色定稿立绘原像素切件（现行做法），不可换色代替 | 身份识别第一要素；Spine 的 head 槽位、Live2D 的脸部分件都是逐人独绘（10.1/10.4） |
| 发型（前发/侧发/后发/马尾） | **每角色独有形状，颜色可参数化** | 形状逐人切件；发色用同形状换色/染色生成变体（如同发型不同色） | LPC 的发型轴 = 样式 × 颜色两维（10.5）；发骨链做成 skin-bone 式可选模块，长发角色才挂（10.1） |
| 躯干服装 | **版型共用母版 + 图案/配色逐人** | 定 3~4 个版型母版（比赛服/背心/短款等，与现有服装系统对齐），每角色在母版上换主色、描边色、图案（星星/花瓣等主题纹样贴花） | DragonBones 换装教程：同尺寸同形状先换纹理（10.3）；LPC 服装层亦然（10.5）。只有版型真不同的角色才新增母版 |
| 上臂 | **共用母版换色** | 按肤色档位（3~4 档）+ 袖口有无做母版，逐人只选肤色档与袖型 | 上臂是低识别度部件；Spine mix-and-match 里素体（skin-base）就是共用件（10.2） |
| 前臂 + 拳套 | **拳套版型共用母版 + 配色逐人，腕带/图案可换** | 拳套统一 Winning MS 系版型母版（已有定稿口径），每角色换主色/辅色；前臂同上臂按肤色档 | 拳套是我们游戏的标志物：版型必须全员统一（用户硬口径），差异只许出现在配色——正好与模块化「母版+换色」天然契合；装备系统换拳套走 slot 级覆盖（10.3） |
| 大腿 | **共用母版换色** | 肤色档 + 短裤/裙摆作为独立小模块叠加（裙摆可做可选件） | 同上臂逻辑；裙摆类遮挡件在 Spine 里就是 skin 专属件（10.1） |
| 小腿 + 鞋 | **小腿共用换色；鞋版型少量母版 + 换色** | 小腿按肤色档；拳击靴定 2~3 个版型（高帮/低帮）逐人换色 | 鞋是中识别度部件，版型数远小于角色数即可（LPC 鞋层做法，10.5） |
| 配饰（发带/蝴蝶结/护腕/腰带等） | **可选槽位，按需逐人** | 定义 accessory 槽位清单，有则挂、无则空；护腕颜色并入拳套配色参数 | Spine 的配饰 skin 与 DragonBones 的可排除槽位都证明可选槽位是标准做法（10.2/10.3） |
| 骨架/动作/姿势表 | **全员 100% 共用** | RIG_TEMPLATE 不动；体型差只许用每人标定（段长比/枢轴）+ 必要时 2~3 个体型档（娇小/标准/高挑，与捏人系统 3 档对齐）吸收 | Spine 用 skin constraints 吸体型差（10.1）；LPC 全库共用一张动作帧表（10.5） |

**一句话成本模型**：全员 50+ 人的真实工作量 ≈ 独有件（头 + 发型形状，2 件/人）+ 选配（躯干版型与配色、鞋版型、配饰，查表选 + 换色，近零边际）+ 标定（段长/枢轴，半自动）。即从「每人 1~1.7 小时全手工」降到「每人只剩独有件切件 + 一次标定」，这才是「扩到全员」在工时上成立的前提；若逐人全件重做，50 人即 80~150 小时且身份漂移风险逐人累积（CHARACTER_RIG.md 的 B2 实测结论），不可取。

---

## 十一、提炼结论：对本游戏最值得学的 10 条（按价值排序）

1. **存档必带版本号、迁移逐级跑、读不懂/版本更新的档锁定不回写、给玩家导出/导入**——四处独立来源同向（PortalReady 存档助手、Idle Academy、Esports Dynasty、Bugnet）。对应问题：**I 发布规范与存档安全**（正式版底线，玩家丢档是不可逆的信任事故）。落地：给三槽存档补迁移链与异常状态机，测试按 PortalReady 的损坏/配额/新版本清单补齐。

2. **四段式教学 + 一次最多 3 个新概念 + 即时教学 + 首胜 90 秒线 + 漏斗记录**（gamestack U3 研究、教程技能知识库）。对应问题：**D 教程与新手流**（我们开局点击数/文字墙是实测过的流失点）。落地：第一周只教一个核心循环，其余系统在首次用到时教；每次改版按漏斗复测。

3. **先成文「骨架单位」规格（槽位表/画布/枢轴/z-order/命名），再批量产部件；身份件独有、版型件母版换色**（Spine skins、LPC、fluxa-sprite ADR）。对应问题：**J 角色批量实装成本 + A 战斗表现**。落地方式详见第十二节。

4. **zip 根 index.html、相对路径、文件名大小写一致、无 CDN 外部请求、首屏 ≤5MB 目标、itch 索引条件与 AI 披露、butler 版本通道上传**（HTML5 发布实操、PortalReady itch 规则、itch-io-skill）。对应问题：**I + H 性能与包体**。落地：把清单写进构建脚本自动查 + RELEASE_WEB 发版十步。

5. **命中按轻/重/击倒/KO 分档，每档一套震屏（trauma 公式）/冻帧（2~6 帧）/闪白/飘字（池化）/音效组合；每次调手感留一份带数值出处的日志**（Game Feel Flow、Saltmire Juice、FirstFrame juice 技能、JUICE-LOG 范例）。对应问题：**A 战斗表现的手感层**（我们零件齐全，缺编排与记录）。

6. **经济与成长用 Monte Carlo 跑批看分布（登顶周数、经济崩坏点的分布），战斗沿用现有批量模拟并常驻化为可复跑工具链**（Prototyping 模块、Machinations 方法文、ZenGM 的数据分层）。对应问题：**B 游戏性/平衡 + C 内容寿命**（我们第二轮审查的 F1 跑步机/F2 通胀本质都是分布问题，单次模拟看不出来）。

7. **模拟管回归、真人管手感；开测前先写 3~5 个可观测问题；观察记录按「发生了什么」分组；5 人/5 次同卡 = 实锤**（NVlabs playtest 技能、h-idris 实操文）。对应问题：**B + D + E 的验收方法**（防止再次以冒烟断言冒充游戏体验）。

8. **现有 Web Audio sequencer 加曲目数据（标题/训练/商店/剧情/冠军战），SFX 走 ZzFX 式参数预设表；不引入 400KB 的 Tone.js**（StudyGotchi 声音选型、程序化音乐库清单）。对应问题：**F 音乐只有 2 首**（最低成本补法，且零包体负担）。

9. **舞台基准比例落在 1.2 法则带、四档设备（390×844/平板/16:9/21:9）每版实拍、Godot 阶段用 canvas_items+expand+安全区同款纪律**（Responsive Scaling 实战、Godot Responsive UI 技能）。对应问题：**E 桌面+移动双端体验**（我们桌面端曾只是「拉宽的手机页」，要用矩阵测试锁死）。

10. **学 ZenGM「一引擎多数据集」：洲际/世界 = 新角色池分段 + 新赛事数据 + 阶段目标延伸；同时学养成经典骨架补「生涯结局/总结回收」**（ZenGM、Dream in Tang Dynasty）。对应问题：**G 世界线缺失 + C 内容寿命**（先以数据扩展兑现 DESIGN 承诺，引擎不动）。注：此条是 10 条里成本最高、排期最靠后的一条——先把 1~9 的地基打牢再动。

---

## 十二、模块化专项提炼：从 8 名扩到全员 50+ 名的意义与落地方式

### 12.1 意义：模块化是「全员纸偶」在工时上成立的唯一路径

- 试点实测的单位成本是 1~1.7 小时/人（有双帧素材时），且 CHARACTER_RIG 已判定：逐人按 B2 式全件重做是 80~150 小时 + 逐人身份漂移验收，不可取。
- 本次调研的四个独立来源（Spine skins 的工业实践、LPC 生成器的开源实证、DragonBones 换装 API、Godot cutout 调研的「第一套 rig 是投资品」结论）指向同一成本结构：**贵的是第一套骨架与规格，便宜的是之后每个角色的「独有件 + 选配换色」**。
- 因此，把纸偶从已批准的 8 名重点角色扩到全员 50+ 名，前提不是「再批 6 倍工时」，而是先把 8 名这一批做成**模块化样板间**：规格书、母版库、换色管线、自动验收四样沉淀出来，之后全员扩围的边际成本只剩每人 2 件独有件（头/发型）+ 标定。

### 12.2 落地方式（五步，与现行 CHARACTER_RIG 管线衔接，不推倒重来）

1. **写规格书（半天）**：把 RIG_TEMPLATE 补成文——槽位清单（head/hair_front/hair_back/torso/upperarm_near/far/forearm_glove_near/far/thigh_near/far/shin_shoe_near/far/accessory）、每槽位的画布尺寸与坐标系、枢轴定义、绘制顺序（z-order）、文件命名（如 `parts/<char>/<slot>.webp`）、静止重组验收阈值。参照 fluxa-sprite 的「骨架声明」提纲（10.6）与 Spine 的 PSD 标签约定（10.1）。
2. **建母版库（随 8 名批次顺产）**：做 8 名时顺手沉淀母版：上臂/前臂/大腿/小腿 = 肤色 3~4 档母版；躯干 = 3~4 个服装版型母版；拳套 = Winning 版型母版（只换色）；鞋 = 2~3 版型。母版的换色用程序化染色（按目标色相/明度重映射）批量生成，不逐人手绘。
3. **RIG_CHARS 升级为部件装配表**：每角色数据从「文件路径集合」改为「槽位 → {来源: 独有切件 | 母版 id + 染色参数 | 可选配饰} + 标定（段长比/枢轴）」，装配逻辑学 Spine 的组合皮肤（base + hair + outfit + accessory 叠加生效）与 DragonBones 的两级换件（整人 = skin 级、单件装备覆盖 = slot 级，换装排除身份槽）。
4. **验收自动化**：给切件管线加 rig-c 式具名断言（10.9）：静止重组误差、枢轴越界、缺槽回退默认件、四态截图（待机/直拳/受击/击倒）自动生成待目检——50 人规模下靠全自动截图 + 人工只看图，才能保证「逐人亲验」不退化成抽查。
5. **分批推进顺序**：先 8 名重点角色验证母版覆盖率（统计：8 人中有几人的躯干/鞋能直接用母版）→ 母版覆盖率 ≥ 约 70% 即证明规格成立 → 其余 40+ 人按「独有件切件（头/发型，从其定稿立绘原像素，沿用试点 extract 管线）+ 装配表 + 自动验收」流水推进；体型特殊的个别角色（极端肩宽等）允许覆写标定，不许改骨架。

### 12.3 风险与边界（调研得到的诚实提醒）

- **遮挡补绘省不掉**：Live2D 与 Godot 两路调研都确认，被遮挡处（刘海下的额头、抱架手臂下的躯干）在源图里不存在——我们的扩散修补是现行解法，50 人规模下这是独有件之外的主要工时变量，排期要按「每人仍需少量补绘」估，不要按纯换色估。
- **长发/裙摆等动态件做可选模块**：学 Spine skin bones——只给需要的角色挂发骨/裙摆件，不要为了少数角色把全员骨架复杂化（我们马尾单骨节的遗留问题按此解）。
- **不换工具链**：Spine 要授权费且资产要重做、DragonBones 运行时处于维护状态、Live2D 体系不对口——模块化是**组织方式**，不是采购决定；我们自研 rig.js 按上述接口改造即可，这也是四路来源里成本最低的一条路。

---

## 附：检索诚实记录

- 「HTML5 拳击养成/经营开源项目」：**没有找到**同品类项目（见 1.7）。
- 「美少女梦工厂式养成的活跃开源复刻（GitHub）」：**没有找到**成规模的仓库，只有个人课程/爱好项目页面（1.4）。
- 「免费预绑定可直接换皮的 Godot Skeleton2D 角色资产」：据 10.8 的开源调研结论，**基本不存在**，不要在此方向浪费时间。
- ZenGM（1.3）源码可见但**明确非开源许可**，仅学形态、不可用代码，已在条目内标注。
- 本报告未逐一打开每个仓库的全部源码深读；「可借鉴点」基于 README/官方文档/调研文档原文，真正引入某项做法前仍需按其许可与版本兼容性复核（尤其 Dialogic 2 的 alpha 状态、Spine 的许可、LPC 的 copyleft 许可）。
