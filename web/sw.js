// 心跳在左，拳头在右 · Service Worker（PWA 离线缓存）
// 策略：
// - 页面导航（index.html）：网络优先——联网时永远拿最新版，断网才回退缓存（避免版本更新后看不到新内容）；
// - 其余同源 GET 静态资源：缓存优先 + 运行时缓存（首次访问写入，之后离线可玩）；
// - 只拦截同源 GET，其余请求一律放行、不缓存。
// 批次 E（m1）资源口径：安装时只预缓存壳（index/manifest），不预拉任何图片/字体——
// 标题屏首访只下「壳 + 标题自有图 + 字体首片」；场景图/立绘/装备图按视图懒加载（data-src），
// 战斗资源（姿势帧/纸偶部件/对手图）在比赛准备层预热。凡被请求过的同源资源都进运行时缓存，
// 因此离线可玩的范围＝本机已访问过的内容（标题恒可进；进过准备层的比赛离线可开打）。
// 更新机制：发布新版时把 SW_VERSION +1；新 SW 安装后 skipWaiting 立即接管，
// activate 时删除所有旧版本缓存并 claim 已打开的页面。缓存名带版本号，天然隔离。
const SW_VERSION = 'boxing-pwa-v24'; // v24：修复批次 D · 经济与装备复活（GAME_AUDIT2.md 批次 D 记录）：①M3 装备百分比/机制化（21 件商店装备＋定制部件全面改 pct 生效值百分比：生效值＝本体×(1+pct 合计/100)，硬顶 100 仍只约束训练本体；护齿/护头加所受重创积累减免、战靴加出拳体力消耗减免、护腕加指令冷却缩短三类机制效果，与重创/体力/指令系统咬合）；②强化曲线合理化（材料逐级 [1,1,1,1,2,2,2,2,3,3] 合计 18 个、从装备对应皮料＋内衬合计扣除——旧单类 (等级+1) 合计 55 个在游戏自身材料池内不可达；金钱 ¥300×(等级+1) 合计 ¥16,500；每级正向 pct +1 个百分点/dr +1%/机制小幅增强）；③M4 三个持续消费口（康复理疗 ¥1600/伤病 −40/免 AP/每周 2 次；特训营 900+周×240 买 4 次充能、训练结算 +50%、每周限 1；宣传造势 500+周×180、心态 +15＋下一场正式赛奖金 ×1.4、每周限 1）；④老档兼容（定制拳套 bonus 按 ×4 换算 pct、强化等级与材料库存原样保留）。定价与新文案待用户审（清单见批次 D 记录） // v23：修复批次 C · 内容投放（GAME_AUDIT2.md 批次 C 记录）：①M6 剧情/阶段门槛双通道（阶段 2~5 排名条件加「OR 胜场/击败伊芙琳」路，ev_top25/top10 加胜场补排队 checkStoryMilestones＋读档/睡觉兜底；ev_champ 保持登顶语义）；②M6 宿敌约战（比赛屏指名挑战：2 AP、每周 2 场/同对手 1 场、不计战绩排名奖金、经验半额、伤病减半、宿敌好感同正式赛＋赛后对白；makeFoe 加 forceKey）；③M6 可重复日常池（10 段可重复＋冷却 10 天＋DAILY_ALTS 微变版本，新增 daily_r1~r4；一次性事件永不重播）；④M7 成就 +6（streak_10/spar_first/champ_slayer/custom_first/money_10k/spar_rival_3，23→29）；⑤F3(a) 文案对齐（阶段 5 改名「国内之巅」、标题/帮助/伊芙琳台词的「世界冠军」改伏笔口径）＋「名声仅作纪念展示」自贬文案 5 处改口。新增剧情/日常文案待用户审（清单见批次 C 记录）。战斗数值/判定未动 // v22：修复批次 E · 性能（GAME_AUDIT2.md m1）：①标题激活与预加载解耦（非标题场景图/立绘/图鉴货架图全改 data-src 懒加载，进视图才下载；场景底图标题下不预拉；titlePortrait 常隐元素不再塞立绘）；②字体分片（Noto Sans SC 每字重 4 片：首片=静态文本+高频字，标题只付首片 ~140KB/字重；语料余片与 GB2312 扩展片带 unicode-range 按需下载）；③准备层预热本场资源（姿势帧+纸偶部件+对手图）；④dist 清理已弃用旧装备图 equipment/（零引用，省 1.6MB）。实测 Fast 3G+CPU4×（perfE.mjs，审查同口径）：标题可交互 45.5s→4.6s、首访 4,621KB→1,324KB（标题时刻仅 746KB）、二访 SW 全供稿 0.83s/网络 0 字节；离线冷启实测标题/据点/开打全程可用 // v21：修复批次 B · 战斗决策层（GAME_AUDIT2.md 批次 B 记录）：①M1 战术克制环（命中对位表 强攻追打游走 ×1.06/游走难打正 ×0.95/打点拳对稳守 ×0.88、打点拳被立即反击 ×0.35、防反型收拳 ×0.65、战术出拳构成倾向、游走卸力受击 −10%）；②M2 指令成杠杆（组合拳爆发期连击被格挡不清零、铁壁免疫重创积累、搂抱重构＝双方连击清零+1.2 秒缠抱停战+对手 +8 体力）＋对手 AI 按人格用指令；③M5 对手整场人格（风格定 base 战术、人格调整规则取代每回合 40% 随机重掷、赛前/回合间/开场三处可读）；④m3 手动模式搂抱入口（面板按钮/触屏按钮/键盘 C）；⑤指令代价组（爆发期出拳体力 ×1.4、铁壁期自身出拳 ×0.55 且立即反击 ×0.35、搂抱回体力按需求缩放、同场重复用指令冷却 ×1+0.5×次数）——实测合理用指令胜率 +13~31pp、乱按优势被压进噪声带。用户硬数字（连击加成/反击窗口/击腹穿透/拳种系数）未动
// v20：主角骨骼纸偶试点（js/rig.js + assets/rig/me/ 部件 8 件约 82KB；ME_RIG 开关可回退姿势帧） // KO 定型 CF＋F2（KO_AUDIT.md 实装记录，用户 2026-11-03 批准）：①删除单发 KO（单次净伤害 ≥ 当前 HP 30%）与 HP% 击倒带（25~30%）；②重创分母下限 max(当前HP, 40%×最大HP)，K=70/衰减 6/秒/拳种权重/格挡减半不变；③刻度击倒：重创跨 25/50/75 触发击倒读秒（本回合内同刻度不重复、跨回合重置），终结只剩重创满格 KO／HP 归零 KO／单回合 3 击倒 TKO／点数四条；④F2 伤害地板：防守减伤封顶 raw 的 70%；⑤模拟跳过按新引擎分布重标定（TTK 竞赛胜率＋minTTK 驱动 KO 率/终结回合）；⑥清理死战孤儿 handler 与规则文案同步新口径
const CACHE_NAME = SW_VERSION;

// 安装时预缓存核心文件（相对路径，itch 子目录 / 任意子路径托管都成立）
const CORE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求：网络优先，失败回退缓存（离线打开游戏走这里）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // 静态资源：缓存优先，未命中时联网取并写入运行时缓存
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
