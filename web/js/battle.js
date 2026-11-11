'use strict';
/* battle.js · 战斗（主循环/打击反馈/Phase 4 连击反击破防/三模式/触屏控制） —— 由 game.js 逐字拆分（Phase 7.5 工程化 v2），逻辑/数值/文案未改。 */
    /* ================= 战斗 ================= */
    var B = null; // 战斗状态
    var battleTimer = null;

    /* 正式版批次 G1（plan/01_TODO T1/T2）：战绩动态难度——运行时战绩日志（不落存档）。
       settleNow 在每场正式赛结算时追加一条 {t=赛后累计正式赛场次, win, round, meHpPct}；
       makeFoe 生成正式赛对手时取近 4 场算碾压度 → 追赶系数倍率（钳制 0.9~1.35）。
       不落存档的校验：日志尾条 t 必须恰等于当前 S.wins+S.losses，否则视为存档读入/快照恢复/
       实验室重置——整表作废回到中性。由此实验室口径（每场快照恢复）恒为中性、与历史基线可比，
       只有真实连续生涯会累积形态；页面重载后日志清空、新对局起重新累积（设计内）。 */
    var formLog = [];
    function formInfo() {
      var total = (S.wins || 0) + (S.losses || 0);
      if (!formLog.length || formLog[formLog.length - 1].t !== total) { formLog = []; return { mul: 1, avg: null, n: 0 }; }
      var last = formLog.slice(-4), sum = 0;
      last.forEach(function (e) {
        if (e.win) {
          // 迭代 5 评分修正（探针 probe_career_iter4.log）：R2 胜利仍是强势胜利（对手 HP 已被
          // 加成抬高，打满 2 回合不等于接近），0.55 低估；输一场的 −0.45 则把 avg 两场内砸穿
          // 加成门槛、难度蒸发后 R1 碾压回归。故 R2 0.55→0.7、R3 0.2→0.35、负场 −0.45→−0.25。
          var roundScore = e.round <= 1 ? 1 : e.round === 2 ? 0.7 : 0.35; // 越快终结越碾压
          sum += roundScore * 0.6 + clamp(e.meHpPct, 0, 1) * 0.4; // 余 HP 越高越碾压
        } else sum += -0.25; // 输一场回落，但不一笔抹掉此前的碾压信号
      });
      var avg = sum / last.length;
      var confidence = Math.min(1, last.length / 3); // 样本 <3 场时向中性收缩，避免首胜即拉满
      return { mul: clamp(1 + (avg - 0.30) * 0.6 * confidence, 0.9, 1.35), avg: avg, n: last.length };
    }

    function makeFoe(forceKey) {
      var w = weekOf(S.day);
      ensureRoster();
      // 角色池匹配：从池中取与玩家名次相差 ≤5 的在榜角色随机抽一位；窗口为空时取距离最近的 3 位兜底
      // 修复批次 C：forceKey 为约战指名——直接取该名册成员（属性/人格走与正式赛完全相同的生成口径）
      var member = null;
      if (forceKey) S.roster.forEach(function (m) { if (m.key === forceKey) member = m; });
      if (!member) {
        var pool = S.roster.filter(function (m) { return m.rank > 0 && Math.abs(m.rank - S.rank) <= 5; });
        if (!pool.length) {
          pool = S.roster.filter(function (m) { return m.rank > 0; })
            .sort(function (a, b) { return Math.abs(a.rank - S.rank) - Math.abs(b.rank - S.rank); }).slice(0, 3);
        }
        member = pool[Math.floor(Math.random() * pool.length)];
      }
      var rank = member.rank;
      // 对手强度 = 该角色当前 rating（钳制到旧公式封顶线 9.1 + 周数×0.70 + 49×0.3，下限 6）；w≤2 新手缓冲 −2（沿用旧规则）
      var base = clamp(member.rating, 6, 9.1 + w * 0.70 + 49 * 0.3);
      if (w <= 2) base -= 2; // P0-3：新手缓冲——前两周对手整体稍弱
      function v(spread) { return Math.max(4, Math.round(base + rnd(-spread, spread) + rnd(0, Math.min(5, w)))); }
      var attrs = { power: v(3), endurance: v(3), will: v(3), speed: v(3), accuracy: v(3), footwork: v(3), defense: v(3), technique: v(3) };
      /* 修复批次 A（GAME_AUDIT2 F2）：对手属性与玩家实际强度部分挂钩——只上抬、不下压：
         rating 基数仍决定下限（弱玩家面对的窗口对手不变），但玩家变强后窗口对手同步变强，
         保证任何周数都存在五五开到七三开的对手。进攻系（力量/速度/精准/技术/意志/步伐）向玩家
         综合强度（battleBaseAttrs 八维均值，含装备与伤病）看齐；耐久系（耐久/防守）向玩家的
         伤害来源看齐（0.6×玩家力量 + 0.4×综合），避免高力量构筑把对手 HP 打成纸。死区 3 点、
         追赶系数 0.55、单项上抬封顶 +34。 */
      var pea = battleBaseAttrs();
      var pAvg = ATTRS.reduce(function (sum, a) { return sum + pea[a.key]; }, 0) / ATTRS.length;
      var durTgt = pea.power * 0.6 + pAvg * 0.4;
      var powTgt = pea.defense * 0.6 + pAvg * 0.4; // 对手力量挂玩家防守侧（与耐久侧对称）：否则均衡成长的玩家会被自己抬高的 pAvg 反噬成互秒
      // 批次 G1 第一层：战绩动态难度——追赶系数按近 4 场碾压度浮动（仅正式赛；约战 forceKey 走批次 A 原口径）
      var form = forceKey ? { mul: 1, avg: null, n: 0 } : formInfo();
      var chaseMul = form.mul;
      ATTRS.forEach(function (a) {
        var tgt = (a.key === 'endurance' || a.key === 'defense') ? durTgt : (a.key === 'power' ? powTgt : pAvg);
        var cur = attrs[a.key];
        if (cur < tgt - 3) attrs[a.key] = Math.round(cur + Math.min(34, (tgt - 3 - cur) * 0.55 * chaseMul));
      });
      /* 修复批次 A 追加硬指标（用户亲玩指出）：第 1~3 周正式赛反秒杀下限保护。通用挂钩对新手太温和
         （目标线 D7 实测对手耐久仅 9~11、HP 约 240，平均 1.39 回合、61% 是 R1 单发 KO 收尾），故早期
         另设与玩家力量挂钩的耐久/防守地板：耐久 ≥ 1.0×玩家力量 + 6、防守 ≥ 0.6×玩家力量 + 5。
         只抬耐久系、不动对手进攻——胜负关系不变，只把过程拉回 R2~R3；非力量构筑力量低、地板随之低，
         其比赛本来就长，不受影响。第 4 周起地板退出、回到通用挂钩曲线。 */
      if (w <= 3) {
        attrs.endurance = Math.max(attrs.endurance, Math.round(pea.power * 1.0 + 6));
        attrs.defense = Math.max(attrs.defense, Math.round(pea.power * 0.6 + 5));
      }
      /* 批次 G1 第二层：中段窗口标定（W4~W12，仅正式赛）。复测实证：投入型生涯 W2 起不再遇到
         抵抗——12 战全胜、R1 终结 91.7%、平均 1.08 回合、中盘点数终局 0 场。通用挂钩的追赶量
         （封顶 +34、系数 0.55）追不上训练＋装备＋熟练度的复合增长，故中段另设与玩家力量挂钩的
         耐久/防守下限。只抬耐久系、不抬进攻系——拉长对局、让点数终局回流，不制造互秒。
         W13 起静态下限退出（动态层不限周、继续工作）。
         定标历程（证据在 research/g1_logs/）：静态地板 1.05×（迭代 1）只够扛约 0.7 回合输出、
         无效；1.7×（迭代 2）回合 1.25/1.42、仍全胜；2.3×（迭代 3）生涯核心指标达标（胜率
         58/67%、R1 率 17/25%、回合 2.00/1.75）但点数仍 0，且探针（probe_envs）显示它把 t6
         实验室对手 HP 从约 325 抬到 842。迭代 4/5 改走纯形态驱动：t6 保住大半（回合 1.97
         在带内），但生涯回合只到 1.42~1.58、R1 率 42~58%、点数仍 0——形态 avg 对 R2 型胜利
         饱和在约 0.6，加成量级结构性不足。迭代 6（静态 1.55×＋形态）：生涯回合 1.67/1.83、
         R1 率 33%、胜率 67%，但点数仍 0，且 balance W10 预设玩家胜率崩到 8%——定因至此完整：
         预设实验室玩家 HP 只有 324~380，对手耐久一抬，玩家的胜场先变成玩家被 KO，点数被
         「玩家自身脆弱」锁死，不是对手标定能解的（详见 plan/04_CHANGELOG G1 条的定因记录）。
         迭代 7（静态 1.9×力量）：生涯核心四项达标（4 跑合并胜率 68.8%/回合 1.83/R1 率
         21%/未登顶），但终验实测 t6 与 match12 胜率 0%——按力量定标的静态地板对弱构筑是
         绝杀（t6 预设玩家 W6 仅属性 16，与生涯投入型构筑不在一个量级，同一地板两种命运）。
         迭代 8：地板改挂「战绩」——t6 立即回到基线带（胜率 55%/回合 1.83，n=60），但系数
         0.17 在 W4~W8 窗口只给 +0.5~1.2×力量，生涯四跑合并回合 1.69 仍差一档。迭代 9 定稿：
         系数 0.17→0.26、封顶 1.6→2.2×力量（生涯 W8 约 +1.8×力量、W12 封顶 +2.2×力量，叠
         形态加成后碾压者面对约 3×力量耐久）；实验室预设（ko/balance 的 wins=0 快照）完全
         不触发、t6 精确回到基线口径；真实弱构筑玩家胜场少、地板也低，不再被一刀切绝杀。
         防守地板同门（F2 封顶后近饱和）。点数终局的剩余差距定因见 plan/04_CHANGELOG G1 条。 */
      if (!forceKey && w >= 4 && w <= 12 && S.wins >= 3) {
        attrs.endurance += Math.round(Math.min(S.wins * pea.power * 0.26, pea.power * 2.2));
        attrs.defense = Math.max(attrs.defense, Math.round(pea.power * 1.0 + 6));
      }
      /* 批次 G1b 中盘点数回流（2026-11-10）：G1 定因——中盘是双向约 2 回合击杀竞赛、双方到不了 R3，
         点数终局结构性为 0；且实证只抬对手耐久会把玩家胜场换成玩家被 KO（玩家中盘 HP 仅 324~380）。
         本批改动另一侧：正式赛 W4~W12（约战 forceKey 除外、练习赛不走 makeFoe）对手输出下调＋耐久上抬并行，
         双方 TTK 同时变长，让一部分对局活着走进 R3 点数判定。玩家 HP 曲线侧杠杆未启用（备选，见 plan/02_METHODS G1b）。
         迭代1（力量 ×0.85＋耐久 +0.45×玩家耐久）：回合 1.83→2.04、进 R3 2%→17%，但点数仍 0——
         进 R3 的都是残血局、撑不到铃响，需要更厚的双方血量尾部。迭代2 加码：力量 −22%、耐久 +0.70×玩家耐久；
         W4~W6 用 0.6 斜坡减量，护住 t6 教学基线（W6 环境同在此窗口内）。
         迭代3~5（加玩家侧 HP ×1.35 于 W7~W12、W4~W6 斜坡两度调整）：balance 点数 0→4%，但生涯胜率冲到 83.3%
         贴 85 上限、t6 在斜坡 0.6 时仍出带（70%/2.28 回合）。迭代6 改走胜率中性的对称加厚：对手力量 −27%、
         耐久 +0.85×玩家耐久，玩家侧力量同步 ×0.88（myFighter 同窗口），双方 TTK 同比拉长、胜负比不动；
         W4~W6 斜坡降到 0.3 让 t6 回带。 */
      if (!forceKey && w >= 4 && w <= 12) {
        var midRamp = w <= 6 ? 0.3 : 1;
        attrs.power = Math.max(4, Math.round(attrs.power * (1 - 0.27 * midRamp)));
        attrs.endurance += Math.round(pea.endurance * 0.85 * midRamp);
      }
      /* 批次 G1 第一层（续）：碾压耐久加成——近 4 场碾压度 avg 超过 0.15 的部分，按玩家力量
         追加对手耐久（迭代 5 曲线：门槛 0.30→0.15、系数 2.6→2.2、样本门槛 2 场→1 场但按
         min(1, n/2) 收缩——迭代 4 实测旧曲线在首场 R1 后不触发、且输 2 场即归零，两头都太脆。
         连碾压者 avg≈0.8 时约 +1.4×力量，与静态地板合计约 2.5×力量，等效迭代 3 的总耐久
         但只对碾压者生效、且随形态平滑增减）。只加耐久、不动进攻系。 */
      if (!forceKey && form.n >= 1 && form.avg !== null && form.avg > 0.15) {
        attrs.endurance += Math.round((form.avg - 0.15) * pea.power * 2.2 * Math.min(1, form.n / 2));
      }
      var prof = {}; PUNCH_KEYS.forEach(function (k) { prof[k] = Math.max(0, Math.min(5, Math.floor(w / 3) + Math.floor(rnd(-1, 2)))); }); // P0-2 联调：熟练度成长由 w/2 放缓到 w/3，避免高周对手伤害乘数失控
      // 风格取角色固有风格；排名越高（名次数字越小）风格越鲜明（intensity 0.55~1.3，与旧版同公式）
      var intensity = clamp(0.55 + (50 - rank) / 50 * 0.6 + w * 0.03, 0.55, 1.3);
      return {
        name: member.name,
        key: member.key,
        img: 'assets/opponents/' + member.key + '.webp',
        isRival: member.key === 'opp_counter', // 宿敌沈墨凛：池内真人，不再靠概率 hack
        isTeammate: member.key === 'opp_rookie', // 同期队友林小葵
        rank: rank,
        attrs: attrs, prof: prof,
        hpMax: 100 + attrs.endurance * 14, hp: 100 + attrs.endurance * 14,
        stam: 100, hits: 0, dmg: 0, used: {}, tactic: 'attack', speechBuff: false,
        style: member.style, styleIntensity: intensity,
        persona: foePersonaFor(member.style, member.key) // 修复批次 B（M5）：整场战术人格，生成时定下
      };
    }
    function styleOf(f) { return f && f.style ? FOE_STYLES[f.style] : null; }
    /* 修复批次 B（GAME_AUDIT2 M5）：对手整场战术人格——makeFoe 生成时定下，整场一致、只按既定
       规则临场调整（endBreak 评估），不再每回合随机重掷。人格由「风格 × 角色 key 的确定性散列」
       派生：同一名角色永远同一种打法（跨场、跨档可辨识）；派生只依赖 roster 成员的固有字段
       （key/style，老档成员天然都有），不新增存档字段、不需要迁移。
       base＝开局战术（风格定调：力量→强攻、速度→游走打点、防反→稳守反击、均衡按角色三选一）；
       adjust＝临场调整规则（comeback 点数落后转强攻 / protect 点数领先转稳守 / desperate 残血转强攻 / none 整场不变）；
       comboWhen/wallHp/clinchFan＝指令偏好（见 foeCommandAI）。陪练不设人格（教学行为固定，见 makePracticeFoe）。 */
    var PERSONA_ADJUST_TXT = { comeback: '落后时会转强攻反扑', protect: '领先后会转稳守保胜果', desperate: '残血时会拼命强攻', none: '整场一种打法、不会变招' };
    function personaHash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
    function foePersonaFor(style, key) {
      var h = personaHash(String(key || '') + '|' + String(style || ''));
      var baseByStyle = { power: 'attack', speed: 'points', guardcounter: 'counter' };
      var base = baseByStyle[style] || ['attack', 'counter', 'points'][h % 3]; // 均衡型：按角色散列三选一
      var adjustPool = {
        attack: ['comeback', 'desperate', 'none'],
        points: ['protect', 'comeback', 'none'],
        counter: ['comeback', 'protect', 'none']
      };
      return {
        base: base,
        adjust: adjustPool[base][Math.floor(h / 3) % 3],
        comboWhen: ['press', 'burst', 'closer'][Math.floor(h / 9) % 3],
        wallHp: [0.28, 0.35, 0.42][Math.floor(h / 27) % 3], // 铁壁触发血线（占 hpMax 比例；批次 B 二调收一档：初版 0.5 血线+重创免疫让对手中盘近乎无敌）
        clinchFan: (Math.floor(h / 81) % 3) !== 0, // 约 2/3 的人愿意搂抱（断连击/拖延/回体力）
        name: { attack: '压迫型', counter: '后手型', points: '游击型' }[base]
      };
    }
    function personaDesc(p) {
      if (!p) return '';
      return p.name + '（开局' + TACTICS[p.base].name + '，' + PERSONA_ADJUST_TXT[p.adjust] + '）';
    }
    /* 第二轮回炉 P2-7：手动 / 自动共用的命中与格挡计算（相同输入 → 相同结果，两模式不再各算一套） */
    function calcHitChance(att, def, attTac, defTac) {
      var hc = 0.70 + (att.attrs.accuracy - def.attrs.footwork) * 0.01;
      /* 修复批次 B（M1）：战术相克进入命中层，构成 强攻→游走→稳守→强攻 的克制环（双方同规则）：
         稳守方闪避 +（原 ×0.7）——但打点拳短促、进出快，稳守只能吃掉一部分（×0.88），点数由此克稳守；
         游走方靠步伐难被打正（×0.95）——唯强攻压制的追打能咬住移动中的对手（×1.10），强攻由此克游走；
         稳守克强攻靠的是打空后的反击窗口（见 tryAttack 的 counterP，未动）。 */
      if (defTac === 'counter') hc *= (attTac === 'points' ? 0.88 : 0.7); // 稳守方闪避+
      else if (defTac === 'points') hc *= (attTac === 'attack' ? 1.06 : 0.95); // 游走方难被打正 / 强攻追打（批次 B 二调：1.10 过热——强攻克速度摸到 98%、点数被力量压到 27%，收一档保住克制但不做成墙）
      else if (attTac === 'attack') hc *= 1.02;
      return clamp(hc, 0.30, 0.95);
    }
    function calcBlockChance(def) { // 对手抱架格挡概率：基数 0.16 + 稳守反击战术 0.08 + 防守反击型风格加成
      var ch = 0.16 + (def.tactic === 'counter' ? 0.08 : 0);
      if (def.style === 'guardcounter') ch += styleVal(def, 'blockAdd', 0);
      if (def.practice) ch += 0.15; // 修复批次 A：陪练以守带攻、多格挡——让新手完整试一遍出拳/破防/距离
      return clamp(ch, 0.05, 0.45);
    }
    // 风格参数按鲜明度插值：intensity=0 时无风格，=1 时全额
    function styleVal(f, key, base) {
      var st = styleOf(f); if (!st) return base;
      var inten = (f && typeof f.styleIntensity === 'number') ? f.styleIntensity : 1;
      return base + (st[key] - base) * inten;
    }
    function myFighter() {
      var ea = battleBaseAttrs(); // 含伤病 debuff
      var hpMax = Math.max(50, Math.round(100 + ea.endurance * 14 - S.injury * 0.5)); // P0 联调：HP 系数 5→14，压平高周伤害/HP 比，战斗能打满 2~3 回合
      /* 批次 G1b 玩家侧杠杆（2026-11-10）：中盘 W7~W12 玩家 HP 曲线标定 ×1.35。
         定因（research/g3_logs/probe_r3.mjs）：对手侧耐久上抬后，进 R3 时对手平均还剩 60% HP、玩家只剩 28%——
         点数终局的绑定约束是玩家撑不完 R3 而非对手太脆；探针里玩家以 ≥110 HP 进 R3 的对局全部打满点数。
         只抬玩家中盘 HP 池（不动每点耐久的换算系数本身、不动新手期与 W13+）。
         窗口不含 W4~W6：首版含 W4~W6 ×1.15 斜坡时 t6 教学基线被带出带（胜率 55→75%、回合 1.80→2.45），
         故玩家侧只进 W7~W12 中盘核心段，W4~W6 仅保留对手侧 0.6 斜坡标定。 */
      var wkMe = weekOf(S.day);
      if (wkMe >= 7 && wkMe <= 12) { hpMax = Math.round(hpMax * 1.35); ea.power = Math.max(4, Math.round(ea.power * 0.88)); } // G1b 迭代6：玩家输出同步 −12%（对称加厚、胜率中性），与 HP ×1.35 同窗口
      var prof = {}; PUNCH_KEYS.forEach(function (k) { prof[k] = punchLevel(S.punchExp[k]); });
      return {
        name: S.name, attrs: ea, prof: prof,
        hpMax: hpMax, hp: hpMax, stam: 100, hits: 0, dmg: 0, used: {}, tactic: 'attack', speechBuff: false,
        dmgTakenMul: Math.max(0.5, 1 - gearDrPct() / 100), // 减伤装备（护齿/护头，含强化）合计减伤%
        traumaTakenMul: gearTraumaMul() // 修复批次 D：护齿/护头的机制效果——我方所受重创积累倍率（traumaGain 读取）
      };
    }

    var pendingFoe = null;
    /* 框架重构二期：比赛场景 VS 对手卡的预览对手（按天缓存）——比赛日首次需要时抽定，
       当天报名直接复用同一人，保证对手卡展示的就是将要交手的对手（抽取规则/概率与 makeFoe 原路径一致，
       仅把「抽定时刻」从点报名提前到比赛日当天首次呈现）；睡过比赛日或打完即按天失效。 */
    var matchPreviewDay = 0, matchPreviewFoe = null;
    function previewFoeForToday() {
      if (!isMatchDay(S.day) || S.lastMatchDay === S.day) return null;
      if (matchPreviewFoe && matchPreviewDay === S.day) {
        if (S.scoutedForDay === S.day && !matchPreviewFoe.weakness) {
          matchPreviewFoe.weakness = PUNCH_KEYS[Math.floor(Math.random() * PUNCH_KEYS.length)];
        }
        return matchPreviewFoe;
      }
      var f = makeFoe();
      if (S.scoutedForDay === S.day) { // 录像研究侦察到的弱点
        f.weakness = PUNCH_KEYS[Math.floor(Math.random() * PUNCH_KEYS.length)];
      }
      matchPreviewDay = S.day; matchPreviewFoe = f;
      return f;
    }
    /* ================= 新手期重构：练习赛（Day 1 教学战） =================
       口径（NEWBIE_FLOW.md 有全文）：序章后由梢姐邀请、或据点金色按钮进入；对手是同期队友林小葵的陪练放水版
       （属性约 7、熟练度 0，走既有战斗引擎与准备层）；胜负不计战绩/连胜、不动排名与对手 rating、不发奖金、
       不触发首胜/首败等剧情、不点亮名鉴、无任何伤病（随机伤/击倒伤/KO 伤全免）、体力不清空、绷带不消耗、
       不占用比赛日（lastMatchDay 不写）；唯一收益是出拳熟练度经验（与正式赛同公式）＋获胜心态 +5。
       事件门禁口径：练习赛不写 wins/losses，故 storyGateOk 的「打过比赛」不被练习赛解锁——粉丝/名气类事件仍须正式首战后才触发。 */
    var nextBattlePractice = false; // 下一场 startBattle/（模拟已禁用）是否为练习赛：startPractice 置位，startBattle 消费，openModeModal/btnCancelMode 清除防误标
    function makePracticeFoe() {
      ensureRoster();
      var member = null;
      S.roster.forEach(function (m) { if (m.key === 'opp_rookie') member = m; });
      if (!member) member = S.roster.filter(function (m) { return m.rank > 0; })[0]; // 兜底：名册异常时取任意在榜成员的壳
      var attrs = { power: 7, endurance: 16, will: 10, speed: 7, accuracy: 7, footwork: 8, defense: 10, technique: 6 }; // 陪练放水：进攻全面低于新人初始 10，但耐久/防守/意志上调——她是来「喂招」的，能扛、能陪打满程（修复批次 A：旧版耐久 8 被 R1 重创 KO，教学战教不到东西）
      var prof = {}; PUNCH_KEYS.forEach(function (k) { prof[k] = 0; });
      return {
        name: member.name, key: member.key,
        img: 'assets/opponents/' + member.key + '.webp',
        isRival: false, isTeammate: true,
        rank: member.rank,
        attrs: attrs, prof: prof,
        hpMax: 100 + attrs.endurance * 14, hp: 100 + attrs.endurance * 14,
        stam: 100, hits: 0, dmg: 0, used: {}, tactic: 'attack', speechBuff: false,
        style: member.style, styleIntensity: 0.55,
        practice: true, traumaTakenMul: 0.45 // 修复批次 A：陪练重创积累只吃 45%——教学战要打到 R2~R3 自然分胜负，不被重创槽 R1 抬走
      };
    }
    function openPracticeIntro() {
      if (!practicePending()) return;
      storyState();
      $('storyTitle').textContent = '入行第一课 · 练习赛';
      $('storySkip').style.display = 'none';
      storySet(STORY_CHARS.senior.img, '藤原梢', '前辈 · 退役拳手',
        '说明先放一边——拳击是打出来的，不是看会的。台上有个跟你同期进馆的丫头，林小葵。先跟她打一场练习赛：不计战绩、不动排名，输了也不留伤。把擂台的感觉找回来，比看十页说明都管用。');
      storyBtns([
        { label: '上台，跟她打一场', fn: function () { $('storyModal').classList.remove('open'); startPractice(); } },
        { label: '先自己逛逛（据点里随时能打）', cls: 'secondary-btn', fn: function () { $('storyModal').classList.remove('open'); toast('练习赛在据点的金色按钮里，想打随时来'); showNextPendingModal(); } }
      ]);
      $('storyModal').classList.add('open');
    }
    function startPractice() {
      if (!practicePending()) return;
      pendingFoe = makePracticeFoe();
      nextBattlePractice = true;
      var a = pendingFoe.attrs;
      var mt = $('modeTitle'); if (mt) mt.textContent = '练习赛 · 教学战';
      var mn = $('modeNote'); if (mn) mn.innerHTML = '陪练对手：<b id="modeFoeInfo">—</b><br />练习赛<b>不计战绩、不动排名、不会受伤</b>，只有出拳熟练度经验照常涨。推荐<b>手动操作</b>，第一次亲手打一打。';
      $('modeFoeInfo').textContent = pendingFoe.name + '（同期队友 · 陪练放水版｜力量 ' + a.power + ' · 速度 ' + a.speed + ' · 耐久 ' + a.endurance + ' · 技术 ' + a.technique + '）';
      var mfi = $('modeFoeImg'); if (mfi) { mfi.src = pendingFoe.img; mfi.alt = pendingFoe.name + ' 的立绘'; }
      var mfl = $('modeFoeLine'); if (mfl) mfl.textContent = pendingFoe.name + '：「' + foeLine(pendingFoe.key, 'pre') + '」';
      var simBtn = document.querySelector('#modeModal [data-mode="sim"]'); if (simBtn) simBtn.style.display = 'none'; // 练习赛是教学战，不给模拟跳过（正式赛打开模式弹窗时恢复）
      $('modeModal').classList.add('open');
      setScene('ring_wide');
    }
    /* ================= 修复批次 C（M6）：约战（指名挑战 · 不计排名） =================
       定位：宿敌沈墨凛的保底接触点 + 与已交手关键对手的复盘场。规则（经济测算见 GAME_AUDIT2 批次 C 记录）：
       - 入口：比赛屏「约战」按钮 → 指名列表（宿敌＝打过 1 场正式赛后解锁；其余＝正式赛交过手且在榜的角色）。
       - 消耗 2 AP（与进店一趟同价）；每周至多 2 场、同一对手每周至多 1 场（S.sparWeek/sparCount/sparByKey）。
       - 不计战绩/连胜、不动排名与对手 rating、不发奖金/名声、不刷新影响力与阶段、不写 lastMatchDay（不占正式赛位）。
       - 收益：出拳熟练度经验半额（正式赛的 1/2）、获胜心态 +5；宿敌好感与正式赛同口径（胜 +8 / 负 +4）＋赛后对白；
         队友 +2。风险：伤病概率为正式赛公式的一半（无被击倒/KO 附加伤），赛后体力 −25。
       - 收益上限恒低于同期正式赛期望（正式赛＝全额奖金＋排名/影响力进度＋全额经验），不存在刷钱/刷好感最优解：
         好感被「每周 2 场 × 同对手 1 场」钳住，宿敌好感最快 +8/周，与正式赛窗口内交手同速。 */
    var nextBattleSpar = false; // 下一场是否为约战：startSpar 置位，startBattle 消费，openModeModal/btnCancelMode 清除防误标
    function sparState() {
      if (typeof S.sparFights !== 'number' || isNaN(S.sparFights) || S.sparFights < 0) S.sparFights = 0;
      if (typeof S.sparRival !== 'number' || isNaN(S.sparRival) || S.sparRival < 0) S.sparRival = 0;
      if (typeof S.sparWeek !== 'number' || isNaN(S.sparWeek)) S.sparWeek = 0;
      if (typeof S.sparCount !== 'number' || isNaN(S.sparCount) || S.sparCount < 0) S.sparCount = 0;
      if (!S.sparByKey || typeof S.sparByKey !== 'object' || Array.isArray(S.sparByKey)) S.sparByKey = {};
      return S;
    }
    var SPAR_WEEKLY_CAP = 2, SPAR_AP_COST = 2;
    function sparTargets() {
      sparState(); ensureRoster();
      var w = weekOf(S.day);
      var played = (S.wins || 0) + (S.losses || 0) >= 1;
      var faced = Array.isArray(S.facedFoes) ? S.facedFoes : [];
      var weekUsed = S.sparWeek === w ? S.sparCount : 0;
      var list = [];
      S.roster.forEach(function (m) {
        if (!(m.rank > 0)) return;
        var isRival = m.key === 'opp_counter';
        var unlocked = isRival ? played : faced.indexOf(m.key) >= 0;
        if (!unlocked) return;
        var why = '';
        if (S.sparByKey[m.key] === w) why = '本周已约战过她';
        else if (weekUsed >= SPAR_WEEKLY_CAP) why = '本周约战已满（' + SPAR_WEEKLY_CAP + ' 场）';
        else if (S.ap < SPAR_AP_COST) why = '行动点不足（需 ' + SPAR_AP_COST + ' AP）';
        list.push({ key: m.key, name: m.name, rank: m.rank, style: m.style, isRival: isRival, ok: !why, why: why });
      });
      list.sort(function (a, b) { if (a.isRival !== b.isRival) return a.isRival ? -1 : 1; return a.rank - b.rank; });
      return list;
    }
    function startSpar(key) {
      if (B) return false;
      sparState();
      var t = null;
      sparTargets().forEach(function (x) { if (x.key === key) t = x; });
      if (!t) { toast('这位对手还约不了'); return false; }
      if (!t.ok) { toast(t.why); return false; }
      S.ap -= SPAR_AP_COST;
      pendingFoe = makeFoe(key);
      nextBattleSpar = true;
      nextBattlePractice = false;
      var a = pendingFoe.attrs;
      var mt = $('modeTitle'); if (mt) mt.textContent = '约战 · 指名挑战';
      // modeNote 末句梢姐台词为新增文案（批次 C 待审清单第 1 条）
      var mn = $('modeNote'); if (mn) mn.innerHTML = '约战对手：<b id="modeFoeInfo">—</b><br />约战<b>不计战绩、不动排名、没有奖金</b>，出拳经验半额；赢了心态 +5' + (pendingFoe.isRival ? '，<b>宿敌好感照常结算</b>，赛后有专属对白' : '') + '。梢姐在场边抱着手臂：「点名打谁都行——打完别喊累。」';
      $('modeFoeInfo').textContent = pendingFoe.name + '（国内排名第 ' + pendingFoe.rank + ' 名｜力量 ' + a.power + ' · 速度 ' + a.speed + ' · 耐久 ' + a.endurance + ' · 技术 ' + a.technique + '）' +
        ' 风格：' + FOE_STYLES[pendingFoe.style].name + '。' +
        (pendingFoe.persona ? ' 打法：' + personaDesc(pendingFoe.persona) + '。' : '') +
        (pendingFoe.isRival ? ' 【宿敌约战】' : '');
      var mfi = $('modeFoeImg'); if (mfi) { mfi.src = pendingFoe.img; mfi.alt = pendingFoe.name + ' 的立绘'; }
      var mfl = $('modeFoeLine'); if (mfl) mfl.textContent = pendingFoe.name + '：「' + foeLine(pendingFoe.key, 'pre') + '」';
      var simBtn = document.querySelector('#modeModal [data-mode="sim"]'); if (simBtn) simBtn.style.display = 'none'; // 约战要实打（与练习赛同口径，模式弹窗在正式报名时恢复）
      $('modeModal').classList.add('open');
      setScene('ring_wide');
      save();
      return true;
    }
    /* 约战专属结算：经验半额、宿敌好感同正式赛、伤病减半、无奖金/排名/影响力（见上方规则块） */
    function settleSpar(win, how, delay) {
      var w = weekOf(S.day);
      var expGain = {};
      PUNCH_KEYS.forEach(function (k) {
        expGain[k] = Math.floor((B.me.used[k] || 0) * 2 * 0.5); // 正式赛公式的一半
        if (expGain[k] > 0) addPunchExp(S, k, expGain[k]);
      });
      sparState();
      S.sparFights = (S.sparFights || 0) + 1;
      if (S.sparWeek === w) S.sparCount += 1; else { S.sparWeek = w; S.sparCount = 1; }
      if (B.foe && B.foe.key) S.sparByKey[B.foe.key] = w;
      var injured = false;
      var dmgTakenRatio = 1 - B.me.hp / B.me.hpMax;
      var injP = (0.15 + dmgTakenRatio * 0.25) * 0.5; // 正式赛伤病公式的一半，且不叠被击倒/KO 附加伤
      if (Math.random() < injP) {
        var add = Math.round(rnd(8, 18));
        S.injury = Math.min(100, S.injury + add); injured = add;
      }
      S.stamina = clamp(S.stamina - 25, 0, 100);
      if (win) changeMind(5);
      if (B.foe.isRival) { // 宿敌：好感与赛后对白与正式赛完全同口径（约战的核心用途）
        S.sparRival = (S.sparRival || 0) + 1;
        addAffinity('rival', win ? 8 : 4);
        queueStoryRepeat(win ? 'ev_rival_win' : 'ev_rival_lose');
      }
      if (B.foe.isTeammate) addAffinity('teammate', 2);
      checkAchievements(); // 修复批次 C：约战类成就（擂台之约 / 宿敌之约）判定
      var rows = '';
      rows += '<tr><td>约战</td><td>不计入正式战绩（当前仍为 ' + S.wins + ' 胜 · ' + S.losses + ' 负），排名、影响力、奖金都不变</td></tr>';
      PUNCH_KEYS.forEach(function (k) {
        if (expGain[k] > 0) rows += '<tr><td>' + PUNCHES[k].name + '熟练度（出拳 ' + (B.me.used[k] || 0) + ' 次）</td><td>经验 +' + expGain[k] + '（约战半额）</td></tr>';
      });
      if (B.foe.isRival) rows += '<tr><td>宿敌好感</td><td>' + (win ? '+8' : '+4') + '（与正式赛同口径；赛后对白稍后就来）</td></tr>';
      if (win) rows += '<tr><td>心态</td><td>+5（当前 ' + Math.round(S.mind) + ' · ' + mindTierName(S.mind) + '）</td></tr>';
      if (injured) rows += '<tr><td>伤病</td><td>+' + injured + '（约战伤病概率已减半，休息可恢复）</td></tr>';
      rows += '<tr><td>体力</td><td>−25（当前 ' + Math.round(S.stamina) + '）</td></tr>';
      rows += '<tr><td>本周约战</td><td>' + S.sparCount + ' / ' + SPAR_WEEKLY_CAP + ' 场</td></tr>';
      $('settleTable').innerHTML = rows;
      $('settleTitle').textContent = '约战 · vs ' + B.foe.name;
      var res = $('settleResult');
      res.textContent = win ? '约战获胜' : '约战落败';
      res.className = 'big-result ' + (win ? 'win' : 'lose');
      /* 【新增文案·待用户审】约战赛后短文案（宿敌专用两句 + 通用两句，语气对齐 D1 对手台词） */
      $('settleDesc').textContent = how + (B.foe.isRival
        ? (win ? '　——约战归约战，她收拳时多看了你一眼：「……下次，用正式赛的规格。」' : '　——她把毛巾搭在肩上：「约战都赢不了我，还想在正式赛翻盘？练去。」')
        : (win ? '　——不计名次的一场，打完反而更清楚彼此的斤两。' : '　——输了也不亏：她的出拳习惯，你这回记住了。'));
      var sfl = $('settleFoeLine'); if (sfl && B.foe) sfl.textContent = B.foe.name + '：「' + foeLine(B.foe.key, win ? 'lose' : 'win') + '」';
      dailyLog('约战 vs ' + B.foe.name + '（第 ' + B.foe.rank + ' 名）：' + how + '（不计战绩/排名）。', win ? 'good' : 'dim');
      setTimeout(function () {
        $('settleModal').classList.add('open');
        setScene('ring_corner');
      }, delay || 900);
      save();
    }

    /* ================= 正式版批次 G9 短期（plan T8）：卫冕循环（挑战者事件 · 约战升级版） =================
       定位：登顶（国内第 1 名）后的持续目标——具名强者主动下战书，玩家应战打一场「卫冕战」。
       与约战的异同：入口同在比赛屏、同样指名具名人选、同样不占每周正式赛位（不写 lastMatchDay）；
       但卫冕战是正式规格——计战绩/连胜、动排名与对手 rating、刷新影响力与阶段、奖金按正式赛
       出场费口径（prizeForRank，获胜全额/落败一半），结算全程走 settleNow，只在其内多一段卫冕记账
       （胜 → S.defenses +1 并清挑战；无论胜负都记 S.defenseWeek，每周至多 1 场卫冕战）。
       输掉卫冕战的后果不另发明：走正式赛的排名升降（输给低名次 −3~5 名）与影响力重算，可再打回来。
       挑战生命周期：maybeDefenseChallenge() 在「进游戏 / 睡觉跨日 / 正式赛结算后」三处补检——
       无待应战挑战、玩家第 1 名、本周未打过卫冕战时生成一位；玩家跌下第 1 名则挑战作废（记日志）。
       挑战者选取：当前第 2~6 名的在榜具名角色，按 rating（战绩水位）＋人格侵略性（压迫型 base /
       desperate / comeback 调整）打分取最高——越强越好战的越先打上门。 */
    var nextBattleDefense = false; // 下一场是否为卫冕战：startDefense 置位，startBattle/simulateBattle 消费，openModeModal/btnCancelMode 清除防误标
    function defenseState() {
      if (typeof S.defenses !== 'number' || isNaN(S.defenses) || S.defenses < 0) S.defenses = 0;
      if (typeof S.defenseWeek !== 'number' || isNaN(S.defenseWeek)) S.defenseWeek = 0;
      if (!S.defenseChallenge || typeof S.defenseChallenge !== 'object' || Array.isArray(S.defenseChallenge) || !ROSTER_BY_KEY[S.defenseChallenge.key]) S.defenseChallenge = null;
      return S;
    }
    function pickChallenger() {
      ensureRoster();
      var cands = S.roster.filter(function (m) { return m.rank >= 2 && m.rank <= 6; });
      if (!cands.length) return null;
      var best = null, bestScore = -Infinity;
      cands.forEach(function (m) {
        var p = foePersonaFor(m.style, m.key);
        var score = m.rating + (p.base === 'attack' ? 0.6 : 0) + (p.adjust === 'desperate' ? 0.4 : p.adjust === 'comeback' ? 0.3 : 0) + Math.random() * 0.5;
        if (score > bestScore) { bestScore = score; best = m; }
      });
      return { key: best.key, name: best.name, rank: best.rank, week: weekOf(S.day) };
    }
    function maybeDefenseChallenge() {
      defenseState();
      var w = weekOf(S.day);
      if (S.defenseChallenge) {
        if (S.rank !== 1) { // 王座已失：挑战作废（输卫冕战的结算已先行清场，这里兜的是输普通正式赛/周重排跌落）
          var nm = S.defenseChallenge.name;
          S.defenseChallenge = null;
          dailyLog('你已跌下第 1 名，' + nm + ' 的卫冕战挑战随之作废——先把王座抢回来再说。', 'dim');
          if (typeof renderDefenseCard === 'function') renderDefenseCard(); // 挑战状态变化即刷新比赛屏卡片（不依赖下一次 render 时机）
          save();
        }
        return S.defenseChallenge;
      }
      if (S.rank !== 1) return null;
      if ((S.wins || 0) + (S.losses || 0) < 1) return null; // 兜底：没打过正式赛不可能在第 1 名，双保险防异常档误触
      if (w <= (S.defenseWeek || 0)) return null; // 本周已打过卫冕战：下周再来（每周至多 1 场）
      var pick = pickChallenger();
      if (!pick) return null;
      S.defenseChallenge = pick;
      /* 【新增文案·待用户审】挑战生成播报（日志＋toast 各一，宣言走 DEFENSE_LINES） */
      dailyLog('👑 卫冕战挑战！' + pick.name + '（第 ' + pick.rank + ' 名）向国内冠军发起正式挑战：「' + defenseLine(pick.key) + '」——去比赛屏应战，赢下它才算坐稳王座。', 'good');
      toast('👑 卫冕战挑战：' + pick.name + ' 打上门了！去比赛屏应战');
      if (typeof renderDefenseCard === 'function') renderDefenseCard(); // 同上：生成即刷新卡片
      save();
      return pick;
    }
    function startDefense() {
      if (B) return false;
      defenseState();
      var ch = S.defenseChallenge;
      if (!ch) { toast('现在没有待应战的卫冕挑战'); return false; }
      if (S.rank !== 1) { maybeDefenseChallenge(); toast('你已经不是第 1 名了，这份挑战已经作废'); return false; }
      pendingFoe = makeFoe(ch.key);
      nextBattleDefense = true;
      nextBattleSpar = false;
      nextBattlePractice = false;
      var a = pendingFoe.attrs;
      var mt = $('modeTitle'); if (mt) mt.textContent = '卫冕战 · 冠军挑战';
      /* 【新增文案·待用户审】卫冕战赛前说明（梢姐一句，语气对齐约战弹窗） */
      var mn = $('modeNote'); if (mn) mn.innerHTML = '挑战者：<b id="modeFoeInfo">—</b><br />卫冕战是<b>正式比赛</b>：计战绩、动排名与影响力，奖金按正式赛出场费口径（获胜 ¥' + prizeForRank(weekOf(S.day)) + ' / 落败出场费一半）；赢下计 <b>1 次卫冕成功</b>，输了冠军易主、按正式赛口径掉名次。备战建议：先做一次<b>宣传造势</b>，获胜奖金还能 ×' + PROMO_PRIZE_MUL + '。梢姐把挑战书拍在你面前：「人家都打上门了——接。」';
      $('modeFoeInfo').textContent = pendingFoe.name + '（国内排名第 ' + pendingFoe.rank + ' 名｜力量 ' + a.power + ' · 速度 ' + a.speed + ' · 耐久 ' + a.endurance + ' · 技术 ' + a.technique + '）' +
        ' 风格：' + FOE_STYLES[pendingFoe.style].name + '。' +
        (pendingFoe.persona ? ' 打法：' + personaDesc(pendingFoe.persona) + '。' : '') +
        ' 【卫冕战】她是冲着你的冠军来的。';
      var mfi = $('modeFoeImg'); if (mfi) { mfi.src = pendingFoe.img; mfi.alt = pendingFoe.name + ' 的立绘'; }
      var mfl = $('modeFoeLine'); if (mfl) mfl.textContent = pendingFoe.name + '：「' + defenseLine(pendingFoe.key) + '」';
      var simBtn = document.querySelector('#modeModal [data-mode="sim"]'); if (simBtn) simBtn.style.display = ''; // 卫冕战是正式赛：模拟跳过照常可用（与约战/练习赛的隐藏口径不同）
      $('modeModal').classList.add('open');
      setScene('ring_wide');
      save();
      return true;
    }

    function openModeModal() {
      nextBattlePractice = false; // 正式报名路径永不带练习标记（防练习模式弹窗取消后误标）
      nextBattleSpar = false; // 同上：约战标记只由 startSpar 置位
      nextBattleDefense = false; // 正式版批次 G9 短期：卫冕标记只由 startDefense 置位
      var mt0 = $('modeTitle'); if (mt0) mt0.textContent = '选择战斗模式';
      var mn0 = $('modeNote'); if (mn0) mn0.innerHTML = '本场对手：<b id="modeFoeInfo">—</b><br />重要比赛推荐<b>手动操作</b>，亲自上场把握胜负。';
      var simBtn0 = document.querySelector('#modeModal [data-mode="sim"]'); if (simBtn0) simBtn0.style.display = '';
      pendingFoe = previewFoeForToday() || makeFoe();
      if (S.scoutedForDay === S.day && !pendingFoe.weakness) { // 录像研究侦察到的弱点（预览已定则不重掷，保证对手卡与实战一致）
        pendingFoe.weakness = PUNCH_KEYS[Math.floor(Math.random() * PUNCH_KEYS.length)];
      }
      var a = pendingFoe.attrs;
      var mfi = $('modeFoeImg'); if (mfi) { mfi.src = pendingFoe.img; mfi.alt = pendingFoe.name + ' 的立绘'; }
      $('modeFoeInfo').textContent = pendingFoe.name + '（国内排名第 ' + pendingFoe.rank + ' 名，你是第 ' + S.rank + ' 名｜力量 ' + a.power + ' · 速度 ' + a.speed + ' · 耐久 ' + a.endurance + ' · 技术 ' + a.technique + '）' +
        ' 风格：' + FOE_STYLES[pendingFoe.style].name + '。' +
        (pendingFoe.persona ? ' 打法：' + personaDesc(pendingFoe.persona) + '。' : '') +
        (pendingFoe.isRival ? ' 【宿敌战】她就是沈墨凛——赛后会有专属对白。' : '') +
        (pendingFoe.weakness ? ' 弱点已侦察：' + PUNCHES[pendingFoe.weakness].name + '方向防守薄弱，用' + PUNCHES[pendingFoe.weakness].name + '打他伤害 +30%。' : '');
      var mfl = $('modeFoeLine'); if (mfl) mfl.textContent = pendingFoe.name + '：「' + foeLine(pendingFoe.key, 'pre') + '」'; // D1：赛前台词（专属或兜底，随机一条）
      $('modeModal').classList.add('open');
      setScene('ring_wide'); // A1/B1：赛前弹窗背景切擂台全景
    }

    /* 框架重构一期：对手立绘去底版路径（assets/opponents_alpha/，由 scripts/make_alpha.py 生成；
       名鉴/剧情/赛前弹窗仍用原图，只有战斗舞台与准备层用去底版贴擂台） */
    function foeAlphaSrc(src) {
      return src ? src.replace('assets/opponents/', 'assets/opponents_alpha/') : src;
    }

    /* G5 教程关卡化：即时教学——概念不在开局灌输，挪到第一次真正用到的那一刻才出现。
       触发点全部挂在既有判定点上（dealDamage 的格挡/被格挡/连击/重创、openCounterWindow 的闪避反击、
       startBreak 的自动模式指令），每条只教一次（记 S.tutorial.taught 落盘），且只在教学窗
       （teachWindow：首场正式赛之前）＋对应模式内出现；窗外玩家与老档走原有全量文案，行为零变化。 */
    function jitTeach(key, text) {
      if (!B || B.mode !== 'manual') return false;
      if (!teachWindow()) return false;
      var t = tutorialState();
      if (t.taught.indexOf(key) >= 0) return false;
      t.taught.push(key);
      save();
      blog('【教学】' + text, 'good');
      return true;
    }

    /* 框架重构一期：开战准备态（选完模式先到准备层：双方对位卡＋规则一句话，点「开始战斗」才调 startBattle；
       准备层不建战斗状态、不起计时器，冒烟/平衡脚本直调 startBattle 的路径不受影响） */
    var readyMode = 'manual';
    var _rigPartsPreloaded = false;
    function preloadRigParts() { // 批次 E：纸偶部件（主角 8 件）在准备层预热，开战零等待；与 rig.js RIG_CHARS.me 的部件清单一致
      if (_rigPartsPreloaded) return; _rigPartsPreloaded = true;
      ['head', 'torso', 'armNearUpper', 'armNearFore', 'legNearThigh', 'legNearShin', 'legFarThigh', 'legFarShin'].forEach(function (p) {
        var im = new Image(); im.src = 'assets/rig/me/' + p + '.webp';
      });
    }
    function openBattleReady(mode) {
      readyMode = mode;
      var foe = pendingFoe;
      if (!foe) return;
      // 批次 E：准备层预热本场双方资源（姿势帧全套＋纸偶部件＋对手原图），点「开始战斗」不再等图
      preloadPoses();
      preloadRigParts();
      preloadFoeRigParts(foe.key); // G2：对手纸偶部件（名单内角色）一并预热
      if (foe.img) { var pf = new Image(); pf.src = foe.img; }
      var a = foe.attrs;
      var fi = $('brFoeImg'); if (fi) { fi.src = foeAlphaSrc(foe.img) || ''; fi.alt = foe.name + ' 的立绘'; }
      var mi = $('brMeImg'); if (mi && !mi.getAttribute('src')) mi.src = POSE_DIR + POSES.guard;
      $('brFoeName').textContent = foe.name;
      $('brFoeMeta').innerHTML = '国内排名第 ' + foe.rank + ' 名 · 风格：' + FOE_STYLES[foe.style].name + (foe.persona ? '<br>打法：' + personaDesc(foe.persona) : '') + '<br>力量 ' + a.power + ' · 速度 ' + a.speed + ' · 耐久 ' + a.endurance + ' · 技术 ' + a.technique +
        (foe.isRival ? '<br>【宿敌战】赛后会有专属对白' : '') +
        (foe.weakness ? '<br>弱点已侦察：' + PUNCHES[foe.weakness].name + '方向防守薄弱（伤害 +30%）' : '');
      $('brMeMeta').innerHTML = '国内排名第 ' + S.rank + ' 名<br>力量 ' + effAttrs().power + ' · 速度 ' + effAttrs().speed + ' · 耐久 ' + effAttrs().endurance + ' · 技术 ' + effAttrs().technique;
      if (foe.practice) $('brFoeMeta').innerHTML += '<br>【练习赛】不计战绩 · 不动排名 · 不会受伤，只有经验照常涨';
      if (nextBattleSpar || (B && B.spar)) $('brFoeMeta').innerHTML += '<br>【约战】指名挑战 · 不计战绩 · 不动排名 · 无奖金，出拳经验半额'; // 修复批次 C（准备层在 B 创建前打开，用待消费标记判读）
      if (nextBattleDefense || (B && B.defense)) $('brFoeMeta').innerHTML += '<br>【卫冕战】冠军挑战 · 计战绩 · 动排名与影响力 · 奖金按正式赛出场费口径，赢下计 1 次卫冕成功'; // 正式版批次 G9 短期（同上，用待消费标记判读）
      $('brFoeLine').textContent = foe.name + '：「' + foeLine(foe.key, 'pre') + '」';
      /* G5：教学窗内准备层只给「先会两样」（新概念 ≤2），其余操作改由战斗内即时教学在第一次用到时教；
         窗外（打过正式赛的玩家）保持原全量键位表不变。 */
      $('brControls').textContent = mode === 'manual'
        ? (teachWindow()
          ? (isTouch ? '操作先会两样就行：左侧摇杆移动贴近对手，右侧按钮出前手/后手拳。格挡、闪避、搂抱这些，开打后第一次用到时会在场边提醒你；全部键位点「操作说明」可查。' : '操作先会两样就行：A/D 移动贴近对手，J/K 出前手/后手拳。格挡、闪避、搂抱这些，开打后第一次用到时会在场边提醒你；全部键位点「操作说明」可查（开打后按 H 也行）。')
          : (isTouch ? '操作：左侧摇杆移动，右侧按钮出拳（前手/后手/上勾/击腹/摆拳），按住格挡，闪避取摇杆方向，「搂抱」按钮贴身停战回体力。' : '操作：A/D 移动、W/S 站位、J 前手、K 后手、U 上勾、B 击腹、空格格挡、Shift+方向闪避、C 搂抱停战回体力；开打后 H 键可再看键位。'))
        : (teachWindow()
          ? '自动观看：战斗自动进行，这一场你先专心看双方怎么出招——回合间休息时，会教你怎么用战术和指令干预战局。'
          : '自动观看：战斗自动进行，你可以在下方切换战术倾向、用即时指令（组合拳/铁壁/搂抱）左右战局，也可调速。对手有整场打法、也会用指令。');
      $('btnReadyKeys').style.display = mode === 'manual' ? '' : 'none';
      $('battleReady').hidden = false;
    }

    function startBattle(mode) {
      B = {
        mode: mode,
        practice: nextBattlePractice, // 新手期重构：练习赛标记（结算走 settlePractice 轻量路径，见 settleNow 分流）
        spar: nextBattleSpar, // 修复批次 C：约战标记（结算走 settleSpar，见 settleNow 分流）
        defense: nextBattleDefense, // 正式版批次 G9 短期：卫冕战标记（结算仍走 settleNow 正式赛全程口径，仅多卫冕记账）
        me: myFighter(), foe: pendingFoe || makeFoe(),
        round: 1, timeLeft: ROUND_SECONDS, phase: 'fight', // fight | break | over
        breakLeft: 0, treated: false, spoke: false,
        speed: 1, tickCount: 0,
        cd: { combo: 0, wall: 0, clinch: 0 },
        buff: { combo: 0, wall: 0 },
        clinchWarn: 0, result: null,
        cdMax: { combo: 45, wall: 60, clinch: 30 }, // 修复批次 B 四调：指令疲劳——同场重复使用冷却递增（×1+0.5×已用次数），cdMax 记本次实际冷却供 UI 冷却条
        meCdMul: gearCdMul(), // 修复批次 D：护腕机制——我方指令基础冷却倍率（开场快照，与 foe 无装备口径对称：对手不吃装备）
        // 修复批次 B（M2）：对手侧指令状态（与玩家同 CD/同效果）＋指令用量遥测（实验室/验收采样用，不参与判定）
        foeCd: { combo: 0, wall: 0, clinch: 0 },
        foeBuff: { combo: 0, wall: 0 },
        foeClinchWarn: 0,
        cmdUse: { me: { combo: 0, wall: 0, clinch: 0 }, foe: { combo: 0, wall: 0, clinch: 0 } },
        holdUntil: -1, // 搂抱缠抱停战截止时刻（B.time 口径）：期间双方都不能出拳/下指令
        meBlocking: false, foeBlocking: false, paused: false,
        // Phase 4：战斗时钟（秒，随 tick 推进）/ 连击 / 反击窗口 / 破防 / 击倒读秒
        time: 0,
        comboMe: 0, comboFoe: 0,
        meCounterUntil: -1, meCounterDir: '', foeCounterUntil: -1, foeCounterDir: '',
        meBrokenUntil: -1, foeBrokenUntil: -1,
        meDownsRound: 0, foeDownsRound: 0,
        meTrauma: 0, foeTrauma: 0, koKind: '',
        meDownMarks: {}, foeDownMarks: {}, // KO 定型：本回合已兑现的重创刻度（25/50/75），跨回合在 endBreak 重置，防衰减回落再跨越刷同一刻度
        bubbleAt: { me: 0, foe: 0 }, // G10：台词气泡节流时间戳（呈现层，不参与判定）
        meDeathFight: false, foeDeathFight: false,
        roundStats: freshRoundStats(), meRoundMod: 'balanced', nextRoundMod: 'balanced',
        meBodyHits: 0, foeBodyHits: 0,
        downFighter: '', downLeft: 0, downIsTKO: false, tkoReason: '',
        man: { mX: 18, fX: 66, mY: 0, fY: 0, punchReady: {}, foePunchT: 1.4, foeMoveT: 0, foeDir: 0, dodgeUntil: 0, dodgeReadyAt: 0, lastDist: '', lastDodgeCat: 'back' }
      };
      pendingFoe = null;
      nextBattlePractice = false; // 练习标记已被本场消费
      nextBattleSpar = false; // 修复批次 C：约战标记已被本场消费
      nextBattleDefense = false; // 正式版批次 G9 短期：卫冕战标记已被本场消费
      keysDown = {};
      touchBlock = false;
      $('meNameLabel').textContent = S.name + '（你 · 第 ' + S.rank + ' 名）';
      // 绷带：本场生效，赛后伤病概率减半（练习赛不消耗绷带——它本来就不会产生伤病；约战伤病公式自带减半，同样不消耗）
      B.bandage = !B.practice && !B.spar && !!S.buffs.bandage; if (!B.practice && !B.spar) S.buffs.bandage = false;
      // 报名免费（0 AP）：只记录今天已比赛一场，赛后不跳天、当天剩余 AP 保留（练习赛/约战/卫冕战不占每周正式赛位，不写 lastMatchDay——卫冕战是事件赛，结算口径仍是正式赛）
      if (!B.practice && !B.spar && !B.defense) S.lastMatchDay = S.day;
      // 心态对比赛的影响（框架）：紧张（20~39）前两回合全属性 −5%；疲劳（0~19）体力消耗 +10%
      B.mindTense = S.mind >= 20 && S.mind < 40;
      B.mindStamMul = S.mind < 20 ? 1.1 : 1;
      if (B.mindTense) ATTRS.forEach(function (a) { B.me.attrs[a.key] = Math.round(B.me.attrs[a.key] * 0.95 * 10) / 10; });
      B.foe.tactic = (B.foe.persona && B.foe.persona.base) || 'attack'; // 修复批次 B（M5）：开局战术＝整场人格的 base，不再随机抽
      if (B.practice) B.foe.tactic = 'counter'; // 修复批次 A：陪练固定稳守反击（多格挡、少出拳），且回合间不重掷（见 endBreak）
      showScene('battle'); // 界面架构批：统一场景管理器切战斗屏（背景 ring_wide 由映射处理；顺带收起可能开着的状态/比赛屏）
      // A2 第二步：我方战斗内改用姿势帧（抱架图起手，动作中按事件切换姿势）；对手取角色池立绘
      preloadPoses();
      var fmi = $('figMeImg'); if (fmi) { fmi.src = POSE_DIR + POSES.guard; fmi.style.objectPosition = POSE_FOCUS.guard; }
      var ffi = $('figFoeImg'); if (ffi) ffi.src = foeAlphaSrc(B.foe.img) || ''; // 框架重构一期：舞台用去底立绘
      $('foeName').textContent = B.foe.name + '（第 ' + B.foe.rank + ' 名）';
      var fp = $('foePortrait'); if (fp) { fp.src = B.foe.img || ''; fp.alt = B.foe.name + ' 的立绘'; }
      // G10：选手牌——我方头像与称号/阶段副标；清上一场飘字/气泡残留并重置气泡节流
      var ma = $('meAvatar'); if (ma) { ma.src = 'assets/portrait.webp'; ma.alt = S.name + ' 的头像'; }
      var msub = $('meSubLabel');
      if (msub) {
        var stgName = '';
        for (var si = 0; si < STAGES.length; si++) if (STAGES[si].id === S.stage) stgName = STAGES[si].name;
        msub.textContent = (S.titles && S.titles.length) ? '称号「' + S.titles[S.titles.length - 1] + '」' : stgName;
      }
      Array.prototype.forEach.call(document.querySelectorAll('.dmg-float'), function (n) { n.remove(); });
      ['bubbleMe', 'bubbleFoe'].forEach(function (id) { var bb = $(id); if (bb) bb.classList.remove('show'); });
      B.bubbleAt = { me: 0, foe: 0 };
      var stb = $('foeStyleBadge');
      if (stb && B.foe.style) { var stDef = FOE_STYLES[B.foe.style]; stb.textContent = stDef.name; stb.className = 'style-badge ' + stDef.cls; stb.style.display = ''; }
      $('battleLog').innerHTML = '';
      var brEl = $('battleReady'); if (brEl) brEl.hidden = true; // 框架重构一期：开战即收起准备层（直调 startBattle 时同样无副作用）
      var ldEl = $('logDrawer'); if (ldEl) ldEl.classList.remove('open');
      $('breakPanel').classList.remove('open');
      $('downOverlay').classList.remove('go');
      $('figMe').classList.remove('broken-guard'); $('figFoe').classList.remove('broken-guard');
      // 模式相关面板
      $('autoPanel').style.display = mode === 'manual' ? 'none' : '';
      $('manualPanel').style.display = mode === 'manual' ? '' : 'none';
      $('distBar').style.display = mode === 'manual' ? '' : 'none';
      $('miniKeys').style.display = mode === 'manual' && !isTouch ? '' : 'none';
      $('touchUI').classList.toggle('on', mode === 'manual' && isTouch);
      $('rotateHint').classList.toggle('on', mode === 'manual' && isTouch);
      $('manualTouchNote').style.display = isTouch ? '' : 'none';
      $('manualKeysTable').style.display = isTouch ? 'none' : '';
      // 重置上一场的特效状态
      $('ring').classList.remove('slowmo', 'frozen', 'shake-sm', 'shake-lg');
      $('figMe').classList.remove('down'); $('figFoe').classList.remove('down');
      _meRigDown = false; if (_meRig) _meRig.toStance('guard'); // 纸偶复位（新一场从抱架起手）
      resetFoeRig(); if (ensureFoeRig()) driveFoeRig('guard'); // G2：对手纸偶按本场对手重建（不在名单则保持静态立绘回退）
      $('figMe').style.transform = ''; $('figFoe').style.transform = '';
      $('figMe').style.left = B.man.mX + '%'; $('figFoe').style.left = B.man.fX + '%';
      $('figMe').querySelector('.fig').style.top = '0px'; $('figFoe').querySelector('.fig').style.top = '0px';
      $('koText').classList.remove('go');
      audio(); SFX.roundStart(2); if (typeof BGM !== 'undefined') BGM.start('battle'); // Phase 9：开场铃 + 切战斗曲
      var foeStyleTxt = B.foe.style ? FOE_STYLES[B.foe.style].name : '';
      if (mode === 'manual') {
        blog('比赛开始！第 1 回合。对手「' + B.foe.name + '」是' + foeStyleTxt + '（战术：' + TACTICS[B.foe.tactic].name + '）。', 'dim');
        if (teachWindow()) {
          // G5：教学窗内开场只给一句（贴近出拳＋格挡），连击/破防/重创/反击改由 jitTeach 在第一次发生时教
          blog('教学：贴近对手出拳打人；挨打时' + (isTouch ? '按住格挡键' : '按住空格') + '抱架能大幅减伤。其余规则等你第一次碰上时，我再在场边提醒——先打起来。', 'dim');
        } else {
          blog('连贯命中攒连击加伤害；闪避后 1 秒内出拳是反击；对手格挡时击腹可破防，破防接直拳。KO 看重创槽：有效命中按伤害积累重创（按对方当前 HP 折算，血量低于 40% 后不再加速；上勾/摆拳权重最高，被格挡只积一半，每秒衰减' + KO_DECAY + '），重创跨过 25/50/75 会把人打倒读秒（同一回合每个刻度只倒一次）、满 100 直接 KO；把对方 HP 打空也是 KO；本回合第 3 次击倒' + (S.deathFight ? '触发死战到底：读秒起身继续打，再被击倒直接判负' : '直接判负（TKO）') + '。', 'dim');
          blog(isTouch
            ? '手动操作：左手摇杆移动，右手大按钮出前手/后手拳，金边按钮可直接出摆拳/上勾/击腹；格挡按住生效（出现护盾弧），闪避/垫步点按触发。'
            : '手动操作：A/D 移动贴近对手，J/K 出拳，U 直接上勾、B 直接击腹，空格格挡，Shift+方向闪避。按 H 看键位。', 'dim');
        }
        $('meTacticName').textContent = '手动操作';
      } else {
        blog('比赛开始！第 1 回合。对手「' + B.foe.name + '」是' + foeStyleTxt + '（战术：' + TACTICS[B.foe.tactic].name + '）。', 'dim');
        if (teachWindow()) {
          // G5：教学窗内自动模式先看打，指令/战术留到首个回合间休息时教（startBreak 的 cmd 教学）
          blog('教学：这场先看双方怎么出招——回合间休息时教你下指令干预。你的 HP 上限 ' + B.me.hpMax + '（伤病影响 −' + Math.round(S.injury * 0.5) + '）。', 'dim');
        } else {
          blog('双方都会攒连击、抓闪避反击、用击腹破防——盯着擂台下方的状态条。', 'dim');
          blog('自动观看模式：你的 HP 上限 ' + B.me.hpMax + '（伤病影响 −' + Math.round(S.injury * 0.5) + '），用战术和指令干预比赛！', 'dim');
        }
        setTactic('attack');
      }
      if (B.foe.persona && !B.practice) blog('对手打法：' + personaDesc(B.foe.persona) + '。整场盯住他的节奏，也防着他用指令（残血铁壁、搂抱断连击）。', 'dim'); // 修复批次 B：人格在开场即可读
      if (B.foe.weakness) blog('录像研究奏效：对手弱点是「' + PUNCHES[B.foe.weakness].name + '」方向的防守，用' + PUNCHES[B.foe.weakness].name + '打他伤害 +30%！', 'good');
      if (B.mindTense) blog('心态有些紧张：前两回合全属性 −5%，第 3 回合起恢复正常。', 'bad');
      if (B.mindStamMul > 1) blog('心态疲劳：本场比赛体力消耗 +10%，注意分配体力。', 'bad');
      if (injuryDebuffMul() < 1) blog('伤病未愈（伤病 ' + Math.round(S.injury) + '）：本场全属性 ' + (injuryDebuffMul() <= 0.85 ? '−15%' : '−5%') + '，是咬牙带伤上场。', 'bad');
      playBattleIntro(mode); // B3：开场入场滑入＋VS 横幅＋推近（自动模式缩短；模拟不走此路径）
      renderBattle();
      clearInterval(battleTimer);
      battleTimer = setInterval(mode === 'manual' ? manualTick : tick, mode === 'manual' ? 50 : TICK_MS);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function blog(msg, cls) {
      var box = $('battleLog');
      var p = document.createElement('p');
      if (cls) p.className = cls;
      p.textContent = msg;
      box.appendChild(p);
      while (box.children.length > 80) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
    }

    /* ================= B3：赛前与回合演出（纯表现层，不阻塞流程） =================
       开场：双方立绘从两侧滑入（ring.intro）＋VS 名字横幅（vsBanner.show），手动约 1.2s、自动缩短到约 0.7s；
       模拟模式不走 startBattle，天然无演出。回合开始：擂台轻微推近（ring.zooming，scale 1→1.04→1）。
       所有演出层都有 setTimeout 兜底移除，动画异常也不会残留遮挡。 */
    function playBattleIntro(mode) {
      var ring = $('ring'); if (!ring) return;
      var quick = mode !== 'manual';
      var banner = $('vsBanner');
      if (banner && B && B.foe) {
        $('vsbMe').textContent = S.name;
        $('vsbFoe').textContent = B.foe.name;
        banner.classList.remove('show', 'quick'); void banner.offsetWidth;
        banner.classList.add('show');
        if (quick) banner.classList.add('quick');
      }
      ring.classList.remove('intro', 'quick'); void ring.offsetWidth;
      ring.classList.add('intro');
      if (quick) ring.classList.add('quick');
      setTimeout(function () { // 超时兜底隐藏
        ring.classList.remove('intro', 'quick');
        if (banner) banner.classList.remove('show', 'quick');
      }, quick ? 700 : 1250);
      ringZoom(quick);
    }
    function ringZoom(quick) {
      var ring = $('ring'); if (!ring) return;
      ring.classList.remove('zooming'); void ring.offsetWidth;
      ring.classList.add('zooming');
      setTimeout(function () { ring.classList.remove('zooming'); }, quick ? 500 : 950);
    }

    /* ================= 姿势帧（A2 第二步） =================
       主角一套动作帧通吃（左右靠镜像的只有对手侧；主角姿势图本身朝右＝朝向对手）。
       切换只换 figMeImg 的 src（＋按姿势微调 object-position 保住出拳方向不被 cover 裁掉），不动布局尺寸。
       对手无姿势图：沿用立绘＋scaleX 镜像，靠 spawnPunchArc / recoiling / 护盾弧强化动作感。 */
    var POSE_DIR = 'assets/pose/';
    var POSES = { guard: 'guard.webp', jab: 'jab.webp', straight: 'straight.webp', hook: 'hook.webp', upper: 'upper.webp', body: 'body.webp', block: 'block.webp', dodge: 'dodge.webp', hit: 'hit.webp', victory: 'victory.webp' };
    // cover 裁切焦点：出拳类姿势拳头在画面右侧，焦点右移避免拳头被裁；其余居中
    var POSE_FOCUS = { guard: 'center top', jab: '80% top', straight: '82% top', hook: '76% top', upper: '62% top', body: '72% top', block: 'center top', dodge: 'center top', hit: 'center top', victory: 'center top' };
    // 时序参数集中表（毫秒）：姿势保持时长，期满自动回抱架（格挡中则回格挡姿势）；终局姿势传 0＝不回位
    var POSE_TIMING = { punch: 250, hit: 320, block: 300, dodge: 320 };
    var _posePreloaded = false;
    function preloadPoses() { // 开战时全量预加载，切换时不闪烁
      if (_posePreloaded) return; _posePreloaded = true;
      Object.keys(POSES).forEach(function (k) { var im = new Image(); im.src = POSE_DIR + POSES[k]; });
    }
    /* ================= 骨骼纸偶驱动（主角试点，js/rig.js） =================
       ME_RIG=true：主角改由纸偶渲染（figMeImg 仍照常切 src 作回退层＋冒烟锚点，CSS 将其隐藏）。
       回退：把 ME_RIG 改为 false 即恢复姿势帧渲染（纸偶容器不建、img 恢复显示）。 */
    var ME_RIG = true;
    var _meRig = null, _meRigDown = false;
    function rigTimeScale() { // 顿帧/慢动作与舞台特效同源：frozen=冻结、slowmo=0.35 倍速
      var ring = $('ring'); if (!ring) return 1;
      if (ring.classList.contains('frozen')) return 0;
      if (ring.classList.contains('slowmo')) return 0.35;
      return 1;
    }
    function ensureMeRig() {
      if (!ME_RIG || typeof RigEngine === 'undefined') return null;
      if (_meRig) return _meRig;
      var host = $('meRig'); if (!host) return null;
      _meRig = RigEngine.createRig(host, { char: 'me', reducedMotion: (typeof SETTINGS !== 'undefined' && !!SETTINGS.reduceMotion), timeScale: rigTimeScale });
      if (_meRig) { var fm = $('figMe'); if (fm) fm.classList.add('rig-on'); }
      return _meRig;
    }
    function driveMeRig(name, holdMs) {
      var rig = ensureMeRig(); if (!rig) return;
      if (name === 'guard') {
        if (_meRigDown) { _meRigDown = false; rig.play('getup'); }
        else rig.toStance('guard');
      } else if (name === 'block') {
        if (holdMs > 0) rig.play('blockHit'); else rig.toStance('block');
      } else if (name === 'hit') {
        var fm = $('figMe');
        if (fm && fm.classList.contains('down')) { _meRigDown = true; rig.play('down'); }
        else rig.play('hit');
      } else if (name === 'victory') {
        rig.play('victory');
      } else {
        rig.play(name); // jab/straight/hook/upper/body/dodge 与纸偶动作同名
      }
    }
    function setMePose(name, holdMs) {
      var img = $('figMeImg'); if (!img) return;
      var src = POSE_DIR + (POSES[name] || POSES.guard);
      if (img.getAttribute('src') !== src) img.src = src;
      img.style.objectPosition = POSE_FOCUS[name] || 'center top';
      driveMeRig(name, holdMs);
      if (!B) return;
      if (B._poseTimer) { clearTimeout(B._poseTimer); B._poseTimer = null; }
      if (holdMs > 0) {
        var tid = setTimeout(function () {
          if (B && B._poseTimer === tid) { B._poseTimer = null; if (B.phase === 'fight') setMePose(B.meBlocking ? 'block' : 'guard', 0); }
        }, holdMs);
        B._poseTimer = tid;
      }
    }
    /* ================= 骨骼纸偶驱动（对手扩围 G2，js/rig.js） =================
       FOE_RIG=true 且本场对手在 RIG_CHARS 名单（8 名重点角色）时，对手改由纸偶渲染
       （figFoeImg 仍照常切 src 作回退层＋冒烟锚点，CSS 将其隐藏；镜像由 CSS 挂 .rig-host）。
       回退：FOE_RIG 改为 false、或对手不在名单 → 静态立绘（原行为，逐像素不变）。
       「减少动效」与主角同口径（createRig reducedMotion 定格抱架）。 */
    var FOE_RIG = false; // 2026-11-10 用户裁定回退：用户亲看伊芙琳纸偶实战图判定「人完全碎了」，明确指示表层修不好要从根上重做、对手纸偶模块化装配方案被否决——7 名对手纸偶全部停用、回退静态立绘；部件/RIG_CHARS 保留在库但不启用，不再迭代修补。主角 ME_RIG 不受影响。（历史：G2 返工验收后曾开启，量化空洞率 <0.5%，见 plan/04_CHANGELOG G2 返工记录与 G3 条回退记录）
    var _foeRig = null, _foeRigKey = null, _foeRigDown = false;
    function foeRigCharKey() {
      if (!B || !B.foe || !B.foe.key) return null;
      return (typeof RigEngine !== 'undefined' && RigEngine.CHARS[B.foe.key]) ? B.foe.key : null;
    }
    function resetFoeRig() {
      if (_foeRig) { _foeRig.destroy(); _foeRig = null; }
      _foeRigKey = null; _foeRigDown = false;
      var ff = $('figFoe'); if (ff) ff.classList.remove('rig-on');
      var host = $('foeRig'); if (host) host.innerHTML = '';
    }
    function ensureFoeRig() {
      if (!FOE_RIG || typeof RigEngine === 'undefined') return null;
      var key = foeRigCharKey(); if (!key) return null;
      if (_foeRig && _foeRigKey === key) return _foeRig;
      resetFoeRig();
      var host = $('foeRig'); if (!host) return null;
      _foeRig = RigEngine.createRig(host, { char: key, reducedMotion: (typeof SETTINGS !== 'undefined' && !!SETTINGS.reduceMotion), timeScale: rigTimeScale, tickEvery: 2 }); // G2：对手纸偶隔帧采样（30Hz 姿势写入，页面 FPS 保 50+；动作时间轴不变）
      _foeRigKey = key;
      if (_foeRig) { var ff = $('figFoe'); if (ff) ff.classList.add('rig-on'); }
      return _foeRig;
    }
    function driveFoeRig(name, holdMs) {
      var rig = ensureFoeRig(); if (!rig) return;
      if (name === 'guard') {
        if (_foeRigDown) { _foeRigDown = false; rig.play('getup'); }
        else rig.toStance('guard');
      } else if (name === 'block') {
        if (holdMs > 0) rig.play('blockHit'); else rig.toStance('block');
      } else if (name === 'hit') {
        var ff = $('figFoe');
        if (ff && ff.classList.contains('down')) { _foeRigDown = true; rig.play('down'); }
        else rig.play('hit');
      } else {
        rig.play(name); // jab/straight/hook/upper/body/dodge/victory 与纸偶动作同名
      }
    }
    function preloadFoeRigParts(key) { // 准备层预热本场对手纸偶部件（仅名单内角色）
      if (!FOE_RIG || !key || typeof RigEngine === 'undefined' || !RigEngine.CHARS[key]) return;
      var dir = RigEngine.CHARS[key].dir;
      ['head', 'torso', 'armNearUpper', 'armNearFore', 'legNearThigh', 'legNearShin', 'legFarThigh', 'legFarShin'].forEach(function (p) {
        var im = new Image(); im.src = dir + p + '.webp';
      });
    }
    // B2：出拳残影——克隆出拳方当前姿势图生成 1~2 帧半透明残影，滞后于本体朝出拳反方向错开，动画结束自回收
    function spawnAfterimage(figEl) {
      var ring = $('ring'); if (!ring || !figEl) return;
      if (ME_RIG && figEl.id === 'figMe') {
        // 纸偶残影：克隆纸偶当前帧 DOM 快照作残影（姿势图在纸偶模式下隐藏，克隆它会与纸偶不一致）
        var host = $('meRig'); var rr = host ? host.querySelector('.rig-root') : null;
        if (rr) {
          var g2 = rr.cloneNode(true);
          g2.classList.add('fig-ghost');
          g2.style.left = figEl.offsetLeft + 'px';
          g2.style.top = figEl.offsetTop + 'px';
          g2.style.width = figEl.offsetWidth + 'px';
          g2.style.height = figEl.offsetHeight + 'px';
          ring.appendChild(g2);
          setTimeout(function () { g2.remove(); }, 190);
          return;
        }
      }
      if (FOE_RIG && figEl.id === 'figFoe') {
        // G2：对手纸偶残影（同主角口径；残影克隆需补回对手镜像——克隆体脱离了 .rig-host 的 scaleX）
        var fhost = $('foeRig'); var frr = fhost ? fhost.querySelector('.rig-root') : null;
        if (frr) {
          var g3 = frr.cloneNode(true);
          g3.classList.add('fig-ghost');
          g3.style.left = figEl.offsetLeft + 'px';
          g3.style.top = figEl.offsetTop + 'px';
          g3.style.width = figEl.offsetWidth + 'px';
          g3.style.height = figEl.offsetHeight + 'px';
          g3.style.transform = (g3.style.transform ? g3.style.transform + ' ' : '') + 'scaleX(-1)';
          ring.appendChild(g3);
          setTimeout(function () { g3.remove(); }, 190);
          return;
        }
      }
      var img = figEl.querySelector('.fig-img');
      if (!img || !img.getAttribute('src')) return;
      var g = document.createElement('img');
      g.className = 'fig-ghost' + (figEl.id === 'figFoe' ? ' foe' : '');
      g.src = img.getAttribute('src');
      g.alt = '';
      g.style.left = figEl.offsetLeft + 'px';
      g.style.top = figEl.offsetTop + 'px';
      g.style.width = figEl.offsetWidth + 'px';
      g.style.height = figEl.offsetHeight + 'px';
      if (img.style.objectPosition) g.style.objectPosition = img.style.objectPosition;
      ring.appendChild(g);
      setTimeout(function () { g.remove(); }, 190);
    }
    // B2：命中点小闪光——在防守方靠进攻方一侧的胸口高度放一颗星形闪光，动画结束自回收
    // G10：按本拳分级放大/换色（tier：heavy/crit/down 放大走粉紫，ko 金色，blocked 缩小）
    function spawnHitFlash(figDefender, tier) {
      var ring = $('ring'); if (!ring || !figDefender) return;
      var foeDef = figDefender.id === 'figFoe';
      var s = document.createElement('span');
      s.className = 'hit-flash' + (tier && tier !== 'normal' ? ' t-' + tier : '');
      s.style.left = (figDefender.offsetLeft + (foeDef ? 4 : figDefender.offsetWidth - 4)) + 'px';
      s.style.top = (figDefender.offsetTop + Math.round(figDefender.offsetHeight * 0.3)) + 'px';
      ring.appendChild(s);
      setTimeout(function () { s.remove(); }, 210);
    }
    // 对手拳风弧光：按粒子体系生成一闪而过的弧形残光（挂在对手身前＝朝我方一侧），动画结束自回收
    function spawnPunchArc(figEl) {
      var ring = $('ring'); if (!ring || !figEl) return;
      var s = document.createElement('span');
      s.className = 'arc-slash';
      s.style.left = (figEl.offsetLeft - 12) + 'px';
      s.style.top = (figEl.offsetTop + Math.round(figEl.offsetHeight * 0.28)) + 'px';
      ring.appendChild(s);
      setTimeout(function () { s.remove(); }, 230);
    }

    /* ================= 打击反馈 ================= */
    function hitstop(ms) {
      var ring = $('ring');
      ring.classList.add('frozen');
      if (B) B.freezeUntil = performance.now() + ms;
      setTimeout(function () { ring.classList.remove('frozen'); }, ms);
    }
    function shakeRing(heavy) {
      var ring = $('ring');
      var cls = heavy ? 'shake-lg' : 'shake-sm';
      ring.classList.remove('shake-sm', 'shake-lg'); void ring.offsetWidth;
      ring.classList.add(cls);
      setTimeout(function () { ring.classList.remove(cls); }, heavy ? 480 : 200);
    }
    function burstParticles(figEl, heavy) {
      var ring = $('ring');
      var x = figEl.offsetLeft + figEl.offsetWidth / 2;
      var y = figEl.offsetTop + Math.round(figEl.offsetHeight * 0.3); // A2：立绘画更高，粒子爆发点抬到胸口高度
      var colors = ['#ffd34d', '#ffffff', '#ff8a5c'];
      var n = heavy ? 12 : 7;
      for (var i = 0; i < n; i++) {
        var s = document.createElement('span');
        var sweat = i % 3 === 2;
        s.className = 'spark' + (sweat ? ' sweat' : '');
        s.style.background = sweat ? '#bfe3ff' : colors[i % colors.length];
        s.style.left = x + 'px'; s.style.top = y + 'px';
        var ang = Math.random() * Math.PI * 2, dist = 18 + Math.random() * (heavy ? 48 : 30);
        s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        s.style.setProperty('--dy', (Math.sin(ang) * dist - 10) + 'px');
        ring.appendChild(s);
        (function (el) { setTimeout(function () { el.remove(); }, 520); })(s);
      }
    }
    function knockback(figEl, dirSign, heavy) {
      figEl.style.transition = 'left .45s ease, transform .38s cubic-bezier(.2,2.4,.4,1)';
      figEl.style.transform = 'translateX(' + (dirSign * (heavy ? 26 : 13)) + 'px)';
      setTimeout(function () { figEl.style.transform = ''; }, 70);
    }
    function hitFx(figDefender, heavy, crit, tier) {
      hitstop(crit || heavy ? 100 : 60);
      shakeRing(heavy || crit);
      figDefender.classList.remove('flashwhite'); void figDefender.offsetWidth;
      figDefender.classList.add('flashwhite');
      setTimeout(function () { figDefender.classList.remove('flashwhite'); }, 150);
      var foeDef = figDefender.id === 'figFoe';
      figDefender.style.setProperty('--dir', (foeDef ? 9 : -9) + 'px');
      figDefender.style.setProperty('--rot', (foeDef ? 8 : -8) + 'deg');
      figDefender.classList.remove('stumbling'); void figDefender.offsetWidth;
      figDefender.classList.add('stumbling');
      knockback(figDefender, foeDef ? 1 : -1, heavy);
      burstParticles(figDefender, heavy);
      spawnHitFlash(figDefender, tier); // B2：命中点星形闪光（与粒子同点位体系，接触瞬间一闪）；G10 起按分级呈现
      // 对手强化：受击后仰回弹（位移/回弹曲线比通用 stumble 更明显），与主角侧的姿势切换观感对齐
      if (foeDef) {
        figDefender.classList.remove('recoiling'); void figDefender.offsetWidth;
        figDefender.classList.add('recoiling');
        setTimeout(function () { figDefender.classList.remove('recoiling'); }, 420);
      }
    }
    function koFx() {
      var ring = $('ring');
      ring.classList.add('slowmo');
      shakeRing(true);
      var fl = $('koFlash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
      var kt = $('koText'); kt.classList.remove('go'); void kt.offsetWidth; kt.classList.add('go');
      SFX.koCheer(); SFX.heavy();
    }

    /* ================= G10 战斗呈现（plan T13）：分级飘字 / 台词气泡 / 状态词牌 =================
       纯呈现层：只读 dealDamage / renderBattle 的既有结果与状态字段，不改任何数值、判定与存档。
       「减少动效」（SETTINGS.reduceMotion）时不生成飘字/气泡（星爆由 CSS 全局规则停动画），
       状态词牌是静态信息、照常显示。台词均为本批新写短句（清单见 plan/04_CHANGELOG G10 条）。 */
    function fxReduced() { return typeof SETTINGS !== 'undefined' && !!SETTINGS.reduceMotion; }
    var ME_LINES = {
      hit: ['唔…！', '好重的一拳…', '还没倒！', '别小看我！', '站稳了…'],
      down: ['还没…结束…！', '我还能站起来！', '唔…腿在抖…'],
      counter: ['抓到了！', '就是现在！', '你的空档！', '还给你！'],
      ko: ['到此为止…吗…', '眼前…发黑…'],
      break: ['架被打散了…！', '唔、挡不住…']
    };
    var FOE_LINES_FX = {
      generic: {
        hit: ['唔…！', '好沉的拳…', '切…被打中了', '还没完呢！', '唔、真疼啊…'],
        down: ['还没…输…', '我还能打…！', '唔…站起来…'],
        counter: ['抓到你了。', '空档太大了。', '还嫩着呢。', '这拳，回敬你。'],
        ko: ['是我…输了…', '到此为止…了'],
        break: ['架、被打穿了…！', '唔…挡不住…']
      },
      power: { hit: ['这点疼，不算什么！', '唔…有劲！', '打得好，再来！'] },
      speed: { hit: ['被、被碰到了？！', '唔…好快…', '居然跟上了…'] },
      guardcounter: { hit: ['唔…架乱了…', '看走眼了…', '唔、这一拳…'] },
      balanced: { hit: ['唔…！', '有点分量…', '还没完！'] }
    };
    function pickFxLine(pool) { return pool[Math.floor(Math.random() * pool.length)]; }
    function showBubble(isMe, kind) {
      if (!B || fxReduced()) return;
      if (!B.bubbleAt) B.bubbleAt = { me: 0, foe: 0 };
      var now = performance.now();
      var gap = (kind === 'down' || kind === 'ko') ? 1200 : 3600; // 节流：大事件 1.2 秒、常规 3.6 秒，同侧不刷屏
      var side = isMe ? 'me' : 'foe';
      var lastBubble = B.bubbleAt[side] || 0;
      if (lastBubble > 0 && now - lastBubble < gap) return; // 时间戳 0＝本场还没出过气泡，不节流（页面刚加载时 performance.now 本身就小于间隔）
      var el = $(isMe ? 'bubbleMe' : 'bubbleFoe'); if (!el) return;
      var pool;
      if (isMe) pool = ME_LINES[kind] || ME_LINES.hit;
      else {
        var byStyle = FOE_LINES_FX[B.foe.style];
        pool = (byStyle && byStyle[kind]) || FOE_LINES_FX.generic[kind] || FOE_LINES_FX.generic.hit;
      }
      B.bubbleAt[side] = now;
      el.textContent = pickFxLine(pool);
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }
    function spawnDmgFloat(figDef, o) {
      if (fxReduced() || !figDef) return;
      var olds = figDef.querySelectorAll('.dmg-float');
      if (olds.length >= 3) olds[0].remove(); // 同屏上限 3 个：新出挤掉最旧的，不堆积
      var el = document.createElement('div');
      el.className = 'dmg-float t-' + o.tier;
      el.style.left = (44 + Math.random() * 12) + '%';
      el.style.top = (15 + olds.length * 11) + '%'; // 同侧多条飘字纵向错层，连打不糊成一团
      var html = '';
      if (o.tag) html += '<span class="df-tag">' + o.tag + '</span>';
      html += '<span class="df-num">-' + o.dmg + '</span>';
      var sub = [];
      if (o.combo >= 2) sub.push(o.combo + ' 连击');
      if (o.koAdd >= 1) sub.push('重创 +' + Math.round(o.koAdd));
      if (sub.length) html += '<span class="df-sub">' + sub.join(' · ') + '</span>';
      el.innerHTML = html;
      figDef.appendChild(el);
      setTimeout(function () { el.remove(); }, 1000);
    }
    /* 状态词牌：把既有状态字段映射成词牌挂在选手牌内（呈现映射，不新增任何状态）。
       优先级：读秒＞死战＞破防＞重创临界/重创＞反击窗口＞铁壁/组合拳＞缠抱/格挡＞待机，最多 2 枚。 */
    function stateChips(isMe) {
      var chips = [];
      var trauma = isMe ? (B.meTrauma || 0) : (B.foeTrauma || 0);
      var brokenUntil = isMe ? (B.meBrokenUntil || -1) : (B.foeBrokenUntil || -1);
      var ctrUntil = isMe ? (B.meCounterUntil || -1) : (B.foeCounterUntil || -1);
      var buff = isMe ? B.buff : B.foeBuff;
      if (B.phase === 'down' && B.downFighter === (isMe ? 'me' : 'foe')) chips.push(['读秒中', 'st-danger']);
      if (isMe ? B.meDeathFight : B.foeDeathFight) chips.push(['死战中', 'st-danger']);
      if (B.time < brokenUntil) chips.push(['破防中 ' + Math.max(1, Math.ceil(brokenUntil - B.time)) + 's', 'st-warn']);
      if (trauma >= 75) chips.push(['重创临界 ' + Math.round(trauma), 'st-danger']);
      else if (trauma >= 50) chips.push(['重创 ' + Math.round(trauma), 'st-warn']);
      if (B.time < ctrUntil) chips.push(['反击窗口', 'st-buff']);
      if (buff && buff.wall > 0) chips.push(['铁壁中', 'st-info']);
      if (buff && buff.combo > 0) chips.push(['组合拳爆发', 'st-buff']);
      if (B.time < (B.holdUntil || -1)) chips.push(['缠抱停战', 'st-info']);
      if (isMe ? B.meBlocking : B.foeBlocking) chips.push(['格挡中', 'st-info']);
      if (!chips.length && B.phase === 'fight') chips.push(['待机', 'st-dim']);
      return chips.slice(0, 2);
    }
    function renderStatePlates() {
      [['meState', true], ['foeState', false]].forEach(function (pair) {
        var el = $(pair[0]); if (!el) return;
        var html = stateChips(pair[1]).map(function (c) { return '<span class="state-chip ' + c[1] + '">' + c[0] + '</span>'; }).join('');
        if (el._g10html !== html) { el.innerHTML = html; el._g10html = html; }
      });
    }

    function setTactic(tac) {
      if (!B) return;
      B.me.tactic = tac;
      $('meTacticName').textContent = TACTICS[tac].name;
      Array.prototype.forEach.call(document.querySelectorAll('#tacticRow .tac-btn'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-tac') === tac);
      });
    }

    /* ================= Phase 4：连击 / 反击 / 破防 / 击倒 ================= */
    function openCounterWindow(isMeDefender, cat) {
      if (!B) return;
      var dirs = ['back', 'down', 'side'];
      var c = cat && COUNTER_PREF[cat] ? cat : dirs[Math.floor(Math.random() * 3)];
      if (isMeDefender) { B.meCounterUntil = B.time + 1; B.meCounterDir = c; jitTeach('counter', '闪开了！闪避后 1 秒内立刻出拳就是反击：伤害 +30%，用对方向的拳种（侧闪接摆拳 / 后闪接直拳 / 下潜接上勾）是 +40%——别让窗口溜走。'); }
      else { B.foeCounterUntil = B.time + 1; B.foeCounterDir = c; }
    }
    function resetCombo(isMeAttacker) { if (!B) return; if (isMeAttacker) B.comboMe = 0; else B.comboFoe = 0; }
    /* KO 定型（2026-11-03，KO_AUDIT.md）：本函数只剩「执行击倒」一层（读秒状态机/计数/TKO 标记与旧版逐行一致）；
       旧的 HP% 击倒带判定（当前 HP 25%~30%）已随单发百分比体系删除——是否击倒由 dealDamage 的
       重创刻度接线决定（跨 25/50/75 刻度时调用本函数），本函数不再做任何百分比判定。 */
    function startKnockdown(defIsMe) {
      if (!B || B.phase !== 'fight') return false;
      var def = defIsMe ? B.me : B.foe;
      if (def.hp <= 0) return false;
      var inDeath = defIsMe ? B.meDeathFight : B.foeDeathFight;
      if (inDeath) { def.hp = 0; B.koKind = 'deathfight-down'; B.tkoReason = '死战中再次被击倒，直接判负'; blog('第' + B.round + '回合：' + (defIsMe ? '你在死战中再次被击倒——直接判负！' : '对手在死战中再次被击倒——直接判负！'), defIsMe ? 'bad' : 'good'); return true; }
      if (defIsMe) { B.meDownsRound += 1; B.meDowns = (B.meDowns || 0) + 1; }
      else { B.foeDownsRound += 1; }
      var downs = defIsMe ? B.meDownsRound : B.foeDownsRound;
      B.phase = 'down';
      B.downFighter = defIsMe ? 'me' : 'foe';
      B.downLeft = 3;
      B.downIsTKO = downs >= 3;
      B.tkoReason = B.downIsTKO ? '第 ' + B.round + ' 回合第 3 次被击倒，触发 TKO 判定' : '';
      var fig = $(defIsMe ? 'figMe' : 'figFoe');
      fig.classList.add('down');
      if (defIsMe) setMePose('hit', 0); // 击倒读秒期间定格受击姿势，配合 .down 旋转倒地
      else driveFoeRig('hit'); // G2：对手被击倒——figFoe 已挂 .down，纸偶走 down 倒地动作
      $('downWho').textContent = (defIsMe ? '你被击倒了！' : '对手被击倒！') + '（本回合第 ' + downs + ' 次）';
      $('downSub').textContent = B.downIsTKO ? '本回合第 3 次击倒——' + (S.deathFight ? '死战到底：读秒起身继续，再被击倒直接判负' : '直接判负（TKO）') : '读秒中…站起来就能继续，HP 回到至少 20%';
      $('downCount').textContent = '3';
      $('downOverlay').classList.add('go');
      showBubble(defIsMe, 'down'); // G10：被击倒方台词气泡（呈现层）
      SFX.heavy(); shakeRing(true);
      B._countShown = 3; SFX.countTick(3); // Phase 9：读秒开始即第一记计数音，后续每秒一记在 tickDown
      blog('第' + B.round + '回合：' + (defIsMe ? '你的重创值冲破刻度，被击倒了！' : '对手重创值冲破刻度，被击倒了！') + '裁判开始读秒（本回合第 ' + downs + ' 次击倒' + (B.downIsTKO ? '，已达 3 次，读秒后 TKO 判定' : '') + '）。', defIsMe ? 'bad' : 'good');
      renderBattle();
      return true;
    }
    function applyDeathFightRecovery(defIsMe) {
      var def = defIsMe ? B.me : B.foe;
      def.hp = Math.max(def.hp, Math.round(def.hpMax * 0.2));
      def.stam = Math.min(100, def.stam + 20);
      B.comboMe = 0; B.comboFoe = 0;
      B.phase = 'fight';
    }
    function resolveTKOChoice(defIsMe, fightOn) {
      if (!B) return;
      var def = defIsMe ? B.me : B.foe;
      if (fightOn) {
        SFX.countSuccess(); // Phase 9：读秒后起身继续（死战）
        if (defIsMe) B.meDeathFight = true; else B.foeDeathFight = true;
        applyDeathFightRecovery(defIsMe);
        blog((defIsMe ? '你死战到底！' : '对手死战到底！') + '伤害 +10%，但再被击倒一次就直接判负' + (defIsMe ? '，赛后伤病 +10' : '') + '。HP 回到 ' + Math.round(def.hp) + '，比赛继续！', defIsMe ? 'good' : 'bad');
        toast(defIsMe ? '死战到底！再倒一次就判负' : '对手死战到底！');
      } else {
        SFX.countFail(); // Phase 9：读秒失败（TKO 判负）
        def.hp = 0; B.koKind = 'tko-giveup'; B.phase = 'fight';
        blog((defIsMe ? '本回合第 3 次击倒——TKO 判负。' : '本回合第 3 次击倒——对手 TKO 判负，你判胜！'), defIsMe ? 'bad' : 'good');
        finishBattle();
      }
      renderBattle();
    }
    function decideTKO(defIsMe) {
      if (!B) return;
      // 死战为存档预设开关（出货界面无切换入口，默认关）：开=自动死战到底，关=本回合第 3 次击倒直接判负。手动/自动统一，双方同规则，不弹窗、不看意志
      var on = !!S.deathFight;
      blog(on ? ('TKO 判定：' + (defIsMe ? '你' : '对手') + '死战到底——读秒起身继续比赛！') : ('TKO 判定：本回合第 3 次击倒——' + (defIsMe ? '你' : '对手') + '直接判负。'), on ? (defIsMe ? 'good' : 'bad') : (defIsMe ? 'bad' : 'good'));
      if (defIsMe) toast(on ? '死战到底！再倒一次就判负' : 'TKO：第 3 次击倒，直接判负');
      resolveTKOChoice(defIsMe, on);
    }
    function resolveKnockdown() {
      if (!B || B.phase !== 'down') return;
      var defIsMe = B.downFighter === 'me';
      var def = defIsMe ? B.me : B.foe;
      var fig = $(defIsMe ? 'figMe' : 'figFoe');
      $('downOverlay').classList.remove('go');
      fig.classList.remove('down');
      if (defIsMe) setMePose('guard', 0); // 起身回抱架（若随后 TKO 判负，finishBattle 会再定格受击姿势）
      else driveFoeRig('guard'); // G2：对手起身——纸偶走 getup 回抱架
      if (B.downIsTKO) {
        B.phase = 'fight';
        decideTKO(defIsMe);
        return;
      }
      // 起身继续：HP 回到至少 20% 上限，被重击（HP 尚存）时小幅回复到 +10% 上限封顶
      var target = Math.round(def.hpMax * 0.2);
      def.hp = def.hp < target ? target : Math.min(def.hpMax, def.hp + Math.round(def.hpMax * 0.1));
      def.stam = Math.min(100, def.stam + 20);
      B.phase = 'fight';
      B.comboMe = 0; B.comboFoe = 0; // 击倒后双方连击清零，重新来过
      SFX.countSuccess(); // Phase 9：读秒起身成功
      blog('读秒结束——' + (defIsMe ? '你咬牙站了起来' : '对手摇晃着站了起来') + '！HP 回复至 ' + Math.round(def.hp) + '，比赛继续。', defIsMe ? 'good' : 'dim');
      renderBattle();
    }
    function tickDown(dt) {
      if (!B || B.phase !== 'down') return;
      B.downLeft -= dt;
      var shownCount = Math.max(1, Math.ceil(B.downLeft));
      if (B.downLeft > 0 && B._countShown !== shownCount) { B._countShown = shownCount; SFX.countTick(shownCount); } // Phase 9：读秒数字每跳一秒一记计数音
      $('downCount').textContent = String(shownCount);
      $('roundTimer').textContent = '读秒中 · ' + Math.max(0, B.downLeft).toFixed(1) + ' 秒';
      if (B.downLeft <= 0) resolveKnockdown();
    }

    function pickPunch(f, isMe) {
      // 我方优先高熟练度；对手按熟练度权重随机，再叠加 AI 风格的拳种倾向（按鲜明度插值）
      var st = !isMe ? styleOf(f) : null;
      var inten = st && typeof f.styleIntensity === 'number' ? f.styleIntensity : 0;
      var weights = PUNCH_KEYS.map(function (k) {
        var base = 1 + f.prof[k] * (isMe ? 1.6 : 1);
        if (st) base *= (1 + (st.weights[k] - 1) * inten);
        return Math.max(0.15, base);
      });
      // 修复批次 B（M1）：战术姿态的出拳构成倾向（双方同规则，叠在风格/熟练度之上）——
      // 强攻抡重拳（摆/上勾 ×1.35）、游走靠刺/直打点（×1.5/×1.25、重拳 ×0.75）、稳守偏直拳等反击。
      var tacBias = f.tactic === 'attack' ? { jab: 0.8, straight: 1.0, hook: 1.35, upper: 1.35, body: 1.15 }
        : f.tactic === 'points' ? { jab: 1.5, straight: 1.25, hook: 0.75, upper: 0.75, body: 0.9 }
        : f.tactic === 'counter' ? { jab: 0.9, straight: 1.15, hook: 1.0, upper: 1.05, body: 1.0 } : null;
      if (tacBias) weights = weights.map(function (wgt, i) { return Math.max(0.1, wgt * (tacBias[PUNCH_KEYS[i]] || 1)); });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var r = Math.random() * total;
      for (var i = 0; i < PUNCH_KEYS.length; i++) { r -= weights[i]; if (r <= 0) return PUNCH_KEYS[i]; }
      return 'jab';
    }

    function tryAttack(att, def, isMeAttacking) {
      if (!B || B.phase !== 'fight') return;
      // 体力太低则喘气恢复
      if (att.stam < 6) { att.stam = Math.min(100, att.stam + 4.6); return; }
      var freq = 0.24 + att.attrs.speed * 0.012; // P0 联调：自动模式基础出拳频率 0.30→0.24，拉长回合内交锋节奏
      if (!isMeAttacking) freq *= 1.15 * styleVal(att, 'freqMul', 1); // 对手风格：速度型出拳快 / 力量型略慢
      if (att.tactic === 'counter') freq *= 0.6;
      if (isMeAttacking ? (B.buff && B.buff.wall > 0) : (B.foeBuff && B.foeBuff.wall > 0)) freq *= 0.40; // 修复批次 B 三调：铁壁抱架期间自己出拳频率 ×0.55——抱死了就抡不开拳，铁壁的代价（双方同规则；也治对手铁壁期满频输出）；批次 G3-b 迭代2：×0.55→×0.40——铁壁在短局的生存收益（必抱架＋重创免疫）太大、原频率代价抵不掉，属代价组加深
      if (att.practice) freq *= (B.round === 1 ? 0.45 : 0.65); // 修复批次 A：陪练少进攻（R1 尤其收着），把回合让给新手练手
      if (!isMeAttacking && att.style === 'guardcounter') freq *= 1.25; // 防守反击型平时收着，抓反击时不降频
      if (att.stam < 30) freq *= 0.7;
      if (Math.random() > freq) { att.stam = Math.min(100, att.stam + 0.92); return; }

      var key = pickPunch(att, isMeAttacking);
      var p = PUNCHES[key];
      att.used[key] = (att.used[key] || 0) + 1;
      var stamCost = p.stam * (att.tactic === 'attack' ? 1.5 : att.tactic === 'points' ? 0.7 : 1);
      if (isMeAttacking ? (B.buff && B.buff.combo > 0) : (B.foeBuff && B.foeBuff.combo > 0)) stamCost *= 2.6; // 修复批次 B 三调：组合拳爆发期全力连打，出拳体力 ×1.4——爆发是拿体力换的，无脑开局乱开会中盘熄火（双方同规则）；批次 G3-b：×1.4→×1.7（迭代1）→×2.0（迭代2）→×2.6（迭代3：power×attack 组 spam−smart 仍 +12pp 且用量差集中在组合拳 170 vs 103 次/100 场，继续加深爆发体力税，属代价组不改效果本体）
      if (!isMeAttacking) stamCost *= styleVal(att, 'stamMul', 1); // 力量型重拳耗体力大
      if (isMeAttacking && B.mindStamMul) stamCost *= B.mindStamMul; // 心态疲劳：我方体力消耗 +10%
      if (isMeAttacking) stamCost *= gearStamMul(); // 修复批次 D：战靴机制——我方出拳体力消耗倍率
      att.stam = Math.max(0, att.stam - stamCost);
      // Phase 4：对手随机抱架（防守反击型更爱格挡），供击腹破防判定；我方格挡由输入/铁壁决定
      if (isMeAttacking) {
        var gbCh = (B.foeBuff && B.foeBuff.wall > 0) ? 1 : calcBlockChance(B.foe); // 修复批次 B：对手铁壁期间必抱架（与玩家铁壁的 meGuard 口径对称）
        if (B.time >= (B.foeBrokenUntil || -1) && Math.random() < gbCh) {
          B.foeBlocking = true;
          $('figFoe').classList.add('guarding');
          driveFoeRig('block', POSE_TIMING.block); // G2：对手抱架纸偶同步格挡姿态
          setTimeout(function () { var el = $('figFoe'); if (el) el.classList.remove('guarding'); }, 260);
        }
      }

      var hitChance = calcHitChance(att, def, att.tactic, def.tactic); // P2-7：与手动模式共用同一命中公式

      var who = isMeAttacking ? '我方' : '对手';
      var figAtt = $(isMeAttacking ? 'figMe' : 'figFoe');
      var figDef = $(isMeAttacking ? 'figFoe' : 'figMe');
      figAtt.classList.add('punching');
      figAtt.classList.add('lined');
      spawnAfterimage(figAtt); // B2：出拳残影
      setTimeout(function () { figAtt.classList.remove('punching'); figAtt.classList.remove('lined'); }, 170);
      // 姿势帧/对手强化：我方出拳切对应拳种姿势图；对手出拳在其身前刷拳风弧光
      if (isMeAttacking) setMePose(key, POSE_TIMING.punch);
      else { spawnPunchArc(figAtt); driveFoeRig(key); } // G2：对手出拳纸偶同步出拳动作

      if (Math.random() > hitChance) {
        // 打空：进攻方连击清零；防守方视为闪避成功 → 开 1 秒反击窗口
        resetCombo(isMeAttacking);
        B.foeBlocking = false;
        openCounterWindow(!isMeAttacking, null);
        if (!isMeAttacking) setMePose('dodge', POSE_TIMING.dodge); // 对手的拳打空＝我方闪避成功，切闪避姿势
        else driveFoeRig('dodge'); // G2：我的拳打空＝对手闪避成功，纸偶同步闪避
        var counterP = def.tactic === 'counter' ? 0.45 : (def.style === 'guardcounter' ? 0.55 : 0.22);
        if (att.tactic === 'points') counterP *= 0.35; // 修复批次 B（M1）：打点拳进出快、出拳即走，被闪开也只吃约三分之一立即反击——点数克稳守的另一环（初版 0.5 时稳守打速度仍有 60%，收紧后稳守才真正怕快拳量）
        if (att.style === 'guardcounter') counterP *= 0.65; // 修复批次 B（M1）：防反型的拳收得快、不露空档——反击战术打它时「等空档」经常等不到
        if (isMeAttacking ? (B.foeBuff && B.foeBuff.wall > 0) : (B.buff && B.buff.wall > 0)) counterP *= 0.35; // 修复批次 B 五调：防守方铁壁抱架中双手被占满，立即反击 ×0.35——治「稳守+无脑铁壁」对反击流近乎免费的问题（反击收入不走出拳频率、降频代价打不到它）；双方同规则，对手防反型开铁壁同理
        if (Math.random() < counterP && def.stam >= 8 && B.phase === 'fight') {
          // 防守方立刻抓反击窗口出拳（拳种取窗口对应的加成拳种，享受 +40%）
          var prefKey = COUNTER_PREF[!isMeAttacking ? B.meCounterDir : B.foeCounterDir] || 'straight';
          def.stam -= 4;
          def.used[prefKey] = (def.used[prefKey] || 0) + 1;
          dealDamage(def, att, prefKey, 1.0, !isMeAttacking, true);
        } else if (def.tactic === 'counter') {
          SFX.block();
          if (Math.random() < 0.35) blog('第' + B.round + '回合：' + who + '的' + p.name + '被闪开，' + (!isMeAttacking ? '你' : '对手') + '获得反击窗口（1 秒内出拳加成）！', 'dim');
        } else {
          SFX.whiff();
          if (Math.random() < 0.3) {
            blog('第' + B.round + '回合：' + who + '的' + p.name + '打空了。', 'dim');
          }
        }
        return;
      }
      var mult = 1;
      if (att.tactic === 'attack') mult *= 1.3;
      if (isMeAttacking && B.buff.combo > 0) mult *= 1 + 0.5 * (0.7 + att.attrs.technique * 0.03);
      if (!isMeAttacking && B.foeBuff && B.foeBuff.combo > 0) mult *= 1 + 0.5 * (0.7 + att.attrs.technique * 0.03); // 修复批次 B：对手组合拳爆发与玩家同公式
      if (att.speechBuff) mult *= 1.1;
      dealDamage(att, def, key, mult, isMeAttacking, false);
      B.foeBlocking = false;
    }

    function dealDamage(att, def, key, mult, isMeAttacking, isCounter, nameOverride) {
      var p = PUNCHES[key];
      var lv = att.prof[key];
      var crit = Math.random() < 0.10;
      if (crit) mult *= 1.5;
      if (!isMeAttacking) mult *= styleVal(att, 'dmgMul', 1); // 对手风格：力量型单拳更重 / 速度型偏轻
      if (isMeAttacking && B.meDeathFight) mult *= 1.1; // 死战：伤害 +10%
      if (!isMeAttacking && B.foeDeathFight) mult *= 1.1;
      // 回合间战术（仅我方下回合战术）：强攻 攻+10%/防-10%，稳守 防+10%/攻-10%
      if (B.meRoundMod === 'attack') mult *= isMeAttacking ? 1.1 : 1.1;
      else if (B.meRoundMod === 'guard') mult *= isMeAttacking ? 0.9 : 0.9;
      var raw = att.attrs.power * p.coef * (1 + lv * 0.05) * rnd(0.9, 1.1) * mult; // P0 联调：熟练度伤害系数每级 +10%→+5%，抑制高周乘法膨胀
      var dmg = Math.max(1, Math.round(raw - Math.min(def.attrs.defense * 1.0, raw * 0.7))); // P0 联调：防守减伤权重 0.5→1.0；KO 定型 F2（KO_AUDIT.md）：减伤封顶 raw 的 70%，净伤害至少保留 raw 的 30% 再走其余修正——拆掉「力量低的拳 raw 低于对手防守、每拳恒打 1 点」的地板（实测恒 1 点命中 32%→约 3.5%）
      var weakHit = false;
      if (isMeAttacking && B.foe.weakness && B.foe.weakness === key) { dmg = Math.max(1, Math.round(dmg * 1.3)); weakHit = true; } // 录像研究侦察的弱点
      if (def.dmgTakenMul) dmg = Math.max(1, Math.round(dmg * def.dmgTakenMul)); // 护齿减伤
      // ---- Phase 4：格挡 / 破防判定（破防期间格挡失效） ----
      var defBroken = B.time < (isMeAttacking ? (B.foeBrokenUntil || -1) : (B.meBrokenUntil || -1));
      var foeGuard = isMeAttacking && !!B.foeBlocking && !defBroken;
      var meGuard = !isMeAttacking && (!!B.meBlocking || B.buff.wall > 0) && !defBroken;
      var guarding = !!(meGuard || foeGuard);
      var pierce = false, brokeNow = false, straightVsBroken = false;
      if (guarding && key === 'body') {
        // 高位格挡防不住击腹：70% 穿透（而非只剩 30%），并把防守方打入 1.5 秒破防
        dmg = Math.max(1, Math.round(dmg * 0.7));
        pierce = true;
        if (foeGuard) crit = false;
        def.stam = Math.max(0, def.stam - 3);
        if (isMeAttacking) B.foeBrokenUntil = B.time + 1.5; else B.meBrokenUntil = B.time + 1.5;
        brokeNow = true;
        $(isMeAttacking ? 'figFoe' : 'figMe').classList.add('broken-guard');
        setTimeout(function () { var el = $(isMeAttacking ? 'figFoe' : 'figMe'); if (el) el.classList.remove('broken-guard'); }, 1500);
      } else if (guarding) {
        dmg = Math.max(1, Math.round(dmg * 0.3));
        if (foeGuard) crit = false;
        def.stam = Math.max(0, def.stam - 3);
      }
      if (!guarding && defBroken && key === 'straight') { dmg = Math.max(1, Math.round(dmg * 1.2)); straightVsBroken = true; } // 破防连招：破防中直拳 +20%
      // ---- Phase 4：反击窗口（闪避成功后 1 秒内出拳；对应拳种 +40%，其余 +30%） ----
      var counterActive = B.time < (isMeAttacking ? (B.meCounterUntil || -1) : (B.foeCounterUntil || -1));
      var counterDir = isMeAttacking ? B.meCounterDir : B.foeCounterDir;
      var counterBonus = false, counterPrefHit = false;
      if (counterActive) {
        counterPrefHit = COUNTER_PREF[counterDir] === key;
        var dmgBeforeCounter = dmg;
        dmg = Math.max(1, Math.round(dmg * (counterPrefHit ? 1.4 : 1.3)));
        if (dmg <= dmgBeforeCounter) dmg = dmgBeforeCounter + 1; // P2-3：先乘系数再取整，且加成生效时至少比无加成高 1 点，低伤拳种不被取整吞掉
        counterBonus = true;
        if (isMeAttacking) B.meCounterUntil = -1; else B.foeCounterUntil = -1; // 窗口用掉即关
      }
      // ---- Phase 4：组合拳连击（被格挡打断清零；干净命中累积并加成，防守方连击同时清零） ----
      var comboNow = 0, comboPct = 0;
      if (guarding && !pierce) {
        // 修复批次 B（M2）：组合拳爆发期间连击不断——被格挡不清零（也不增长），指令由此成为真正的终结窗口；双方同规则
        var comboBuffOn = isMeAttacking ? (B.buff && B.buff.combo > 0) : (B.foeBuff && B.foeBuff.combo > 0);
        if (!comboBuffOn) resetCombo(isMeAttacking); // 自己的拳被格挡 → 连击被打断
      } else {
        if (isMeAttacking) { B.comboMe += 1; comboNow = B.comboMe; B.comboFoe = 0; }
        else { B.comboFoe += 1; comboNow = B.comboFoe; B.comboMe = 0; }
        comboPct = comboBonusPct(comboNow);
        if (comboPct > 0) dmg = Math.max(1, Math.round(dmg * (1 + comboPct / 100)));
      }
      // 修复批次 B（M1）：游走卸力——打点姿态的防守方受击伤害 −10%（点数战术的保底：不至于被力量型一波直接 KO 出局，但仍是怕压制的脆皮打法）；双方同规则
      if (def.tactic === 'points') dmg = Math.max(1, Math.round(dmg * 0.90));
      var hpBefore = def.hp;
      def.hp = Math.max(0, def.hp - dmg);
      att.hits += 1;
      att.dmg += dmg;
      // 本回合战况统计（回合间总结用）
      if (!B.roundStats) B.roundStats = freshRoundStats();
      if (isMeAttacking) { B.roundStats.meHits += 1; B.roundStats.meDmg += dmg; if (comboNow > B.roundStats.meMaxCombo) B.roundStats.meMaxCombo = comboNow; if (key === 'body') B.meBodyHits = (B.meBodyHits || 0) + 1; }
      else { B.roundStats.foeHits += 1; B.roundStats.foeDmg += dmg; if (comboNow > B.roundStats.foeMaxCombo) B.roundStats.foeMaxCombo = comboNow; if (key === 'body') B.foeBodyHits = (B.foeBodyHits || 0) + 1; }
      // KO 重创槽：有效命中积累，格挡命中只积一半，穿透格挡算全额（积累量由 traumaGain 按曲线计算，分母带 40% 最大 HP 下限）
      var traumaBefore = isMeAttacking ? (B.foeTrauma || 0) : (B.meTrauma || 0); // KO 定型：刻度跨越判定需要命中前的重创值
      var koAdd = traumaGain(key, dmg, def, hpBefore, guarding && !pierce);
      // 修复批次 B（M2）：铁壁期间完全免疫重创积累——铁壁的局面价值从「少掉血」升级为「按住重创时钟」；双方同规则
      if (isMeAttacking ? (B.foeBuff && B.foeBuff.wall > 0) : (B.buff && B.buff.wall > 0)) koAdd = 0;
      if (window.__hitLog) window.__hitLog.push([dmg, koAdd, key, (guarding && !pierce) ? 1 : 0]); // 测试埋点（trauma-ab 用，平时不存在该数组、零开销）
      var traumaAfter = 0;
      if (isMeAttacking) { B.foeTrauma = clamp((B.foeTrauma || 0) + koAdd, 0, 100); traumaAfter = B.foeTrauma; }
      else { B.meTrauma = clamp((B.meTrauma || 0) + koAdd, 0, 100); traumaAfter = B.meTrauma; }
      /* KO 定型（2026-11-03，KO_AUDIT.md）：终结只剩两条在此判定——重创满 100 KO / HP 归零 KO
         （另两条：单回合 3 次击倒 TKO 在读秒状态机、点数在 finishBattle）。旧「单发 ≥ 当前 HP 30% 直接 KO」
         已按用户裁定删除：单拳再重也只做扣 HP、积重创、（跨刻度时）击倒三件事。 */
      var koTriggered = '';
      if (traumaAfter >= 100) { koTriggered = 'trauma'; def.hp = 0; B.koKind = 'trauma'; }
      else if (def.hp <= 0) { koTriggered = 'hp'; B.koKind = 'hp'; }
      if (key === 'body') def.stam = Math.max(0, def.stam - dmg * 0.6); // 击腹双倍削体力（含基础命中削减）
      def.stam = Math.max(0, def.stam - 1);

      var figDef = $(isMeAttacking ? 'figFoe' : 'figMe');
      var heavy = crit || dmg >= 16;
      // G10：飘字/星爆分级（纯呈现，只读本拳既有结果与刻度标记：KO＞跨刻度＞暴击/反击＞重击＞格挡＞普通）
      var marksFx = isMeAttacking ? (B.foeDownMarks || {}) : (B.meDownMarks || {});
      var crossedFx = [25, 50, 75].some(function (t) { return traumaBefore < t && traumaAfter >= t && !marksFx[t]; });
      var fxTier = koTriggered ? 'ko' : crossedFx ? 'down' : (crit || counterBonus) ? 'crit' : heavy ? 'heavy' : (guarding && !pierce) ? 'blocked' : 'normal';
      // 姿势帧：我方挨打时按结果切姿势——格挡住（未被击腹穿透）切格挡图，其余切受击图（与顿帧/飘字同一时点）
      if (!isMeAttacking) {
        if (guarding && !pierce) setMePose('block', POSE_TIMING.block);
        else setMePose('hit', POSE_TIMING.hit);
      } else {
        // G2：对手挨打纸偶同步——格挡住（未被击腹穿透）格挡姿态，其余受击（与主角同口径）
        if (guarding && !pierce) driveFoeRig('block', POSE_TIMING.block);
        else driveFoeRig('hit');
      }
      hitFx(figDef, heavy, crit, fxTier);
      if (guarding && !pierce) SFX.block(); else if (heavy) SFX.heavy(); else SFX.light();
      figDef.classList.remove('hit'); void figDef.offsetWidth; figDef.classList.add('hit');
      // G10：分级伤害飘字（替代旧单元素长串飘字；旧 #popMe/#popFoe 元素保留在 DOM 中不再驱动）
      spawnDmgFloat(figDef, {
        dmg: dmg, tier: fxTier,
        tag: koTriggered ? 'KO!' : brokeNow ? '破防!' : counterBonus ? '反击!' : crit ? '暴击!' : (guarding && !pierce) ? '格挡' : '',
        combo: comboNow, koAdd: koAdd
      });
      // G10：台词气泡（节流在 showBubble 内：KO/反击/破防必出，重击 45% 概率出）
      if (koTriggered) showBubble(!isMeAttacking, 'ko');
      else if (counterBonus) showBubble(isMeAttacking, 'counter');
      else if (brokeNow) showBubble(!isMeAttacking, 'break');
      else if (heavy && !guarding && Math.random() < 0.45) showBubble(!isMeAttacking, 'hit');
      // B2：连击计数演出——连击 ≥2 时在飘字上方挂「N 连击」小字，字号随连段放大，随飘字节奏弹出后自回收（只演出，不动判定）
      if (comboNow >= 2) {
        var comboPop = document.createElement('span');
        comboPop.className = 'combo-pop';
        comboPop.textContent = comboNow + ' 连击';
        comboPop.style.fontSize = Math.min(13 + comboNow * 1.6, 30) + 'px';
        figDef.appendChild(comboPop);
        setTimeout(function () { comboPop.remove(); }, 720);
      }

      var who = isMeAttacking ? '我方' : '对手';
      var tag = (isCounter || counterBonus) ? '反击' : '';
      var verb = crit ? '暴击命中！！' : dmg >= 18 ? '重击命中！' : '命中。';
      blog('第' + B.round + '回合：' + who + tag + (nameOverride || p.name) + verb + '造成 ' + dmg + ' 点伤害' +
        (counterBonus ? '（反击窗口加成 +' + (counterPrefHit ? '40%' : '30%') + (counterPrefHit ? '，' + COUNTER_PREF_TXT[counterDir] + '对上了' : '') + '！）' : '') +
        (comboNow >= 2 ? '（' + comboNow + ' 连击，伤害 +' + comboPct + '%）' : '') +
        (weakHit ? '（打中弱点！）' : '') + (key === 'body' ? (isMeAttacking ? '，对手体力大减' : '，你的体力被削了') : '') +
        (pierce ? '（击腹穿透格挡 70%！' + (isMeAttacking ? '对手' : '你') + '破防 1.5 秒，格挡失效）' : guarding ? '（被格挡，大幅减伤，连击被打断）' : '') +
        (straightVsBroken ? '（破防中直拳 +20%！）' : '') + '。',
        isMeAttacking ? 'good' : 'bad');
      if (koTriggered || traumaAfter >= 60) blog('重创值：' + (isMeAttacking ? '对手 ' + Math.round(traumaAfter) : '你 ' + Math.round(traumaAfter)) + ' / 100（+' + Math.round(koAdd) + (guarding && !pierce ? '，格挡只积一半' : '') + '）' + (koTriggered === 'trauma' ? '——重创槽满格，直接 KO！' : koTriggered === 'hp' ? '——HP 归零，KO！' : '，逼近 KO！'), koTriggered ? (isMeAttacking ? 'good' : 'bad') : 'dim');
      /* 击倒判定（KO 定型·刻度击倒）：未触发 KO、防守方 HP 尚存时，本次命中令其重创跨过
         25/50/75 任一刻度 → 击倒读秒（走 startKnockdown 执行层：确定性起身、沿用现行起身回复）。
         防刷：同一刻度本回合内只兑现一次（B.meDownMarks/foeDownMarks，endBreak 跨回合重置）——
         衰减回落后再跨越同一刻度不重复击倒；一拳跨多个刻度也只倒一次、跨过的刻度一并标记。
         口径注记：KO_AUDIT 的 CF 候选模拟用 floor(trauma/25) 变化判定（允许同回合回落再跨越重触发），
         本实装按任务书取「本回合不重复」——预期差异仅 TKO 占比略降、HP 终局略升，回合/R1 指标不受影响，
         复测对照见 KO_AUDIT.md 实装记录。 */
      if (!koTriggered && B.phase === 'fight' && def.hp > 0) {
        var marks = isMeAttacking ? (B.foeDownMarks || (B.foeDownMarks = {})) : (B.meDownMarks || (B.meDownMarks = {}));
        var crossedMark = false;
        [25, 50, 75].forEach(function (t) {
          if (traumaBefore < t && traumaAfter >= t && !marks[t]) { marks[t] = true; crossedMark = true; }
        });
        if (crossedMark) startKnockdown(!isMeAttacking);
      }
      /* G5 即时教学触发（仅手动模式＋教学窗，每条只出现一次；判定数值零改动，纯播报）：
         格挡＝第一次硬吃对手的拳；击腹破防＝自己的拳第一次被格挡；连击＝第一次攒到 3 连；
         重创＝任意一方重创第一次涨过 30。反击在 openCounterWindow（闪避成功开窗）处触发。 */
      if (B.mode === 'manual') {
        if (!isMeAttacking && !guarding) jitTeach('guard', '这拳你硬吃了——' + (isTouch ? '按住格挡键' : '按住空格') + '抱架：挡住的拳伤害大幅降低、重创也只积一半；被连打时先挡住，能打断他的连击。');
        if (isMeAttacking && guarding && !pierce) jitTeach('body', '你的拳被他抱架挡下了——换' + (isTouch ? '金边「击腹」按钮' : 'B 键击腹') + '打肚子：击腹能穿透高位格挡、把他打入破防，趁破防接直拳最疼。');
        if (isMeAttacking && comboNow >= 3) jitTeach('combo', '3 连击！干净命中连续不断就有连击加成（2 连 +5% / 3 连 +15% / 4 连起 +25%），但自己的拳被格挡就会清零——压着打别断档。');
        if (traumaAfter >= 30) jitTeach('trauma', '重创槽涨起来了：有效命中会积累重创，跨过 25 / 50 / 75 会把人击倒读秒，攒满 100 直接 KO；它会随时间慢慢消退，所以要连续施压。');
      }
    }

    function moveFighters() {
      // 简单走位：双方距离随机变化
      var mePos = 14 + Math.random() * 10;
      var gap = 26 + Math.random() * 16 - (B.me.tactic === 'attack' ? 6 : 0) - (B.foe.tactic === 'attack' ? 6 : 0);
      $('figMe').style.left = mePos + '%';
      $('figFoe').style.left = Math.min(78, mePos + gap) + '%';
    }

    function tick() {
      if (!B || B.phase === 'over') return;
      if (B.freezeUntil && performance.now() < B.freezeUntil) return; // 顿帧中
      var dt = 0.5 * B.speed;
      if (B.phase === 'break') {
        B.breakLeft -= dt;
        decayTrauma(dt);
        var bc = $('breakCount'); if (bc) bc.textContent = String(Math.max(0, Math.ceil(B.breakLeft)));
        $('roundTimer').textContent = '休息中 · ' + Math.max(0, B.breakLeft).toFixed(0) + ' 秒后继续';
        renderBattle();
        if (B.breakLeft <= 0) endBreak();
        return;
      }
      if (B.phase === 'down') { B.time += dt; decayTrauma(dt); tickDown(dt); renderBattle(); return; } // 击倒读秒：双方停手
      B.time += dt;
      decayTrauma(dt);
      B.timeLeft -= dt;
      B.tickCount++;
      ['combo', 'wall', 'clinch'].forEach(function (k) { if (B.cd[k] > 0) B.cd[k] = Math.max(0, B.cd[k] - dt); });
      if (B.buff.combo > 0) B.buff.combo = Math.max(0, B.buff.combo - dt);
      if (B.buff.wall > 0) B.buff.wall = Math.max(0, B.buff.wall - dt);
      // 修复批次 B：对手侧指令 CD/buff 同步递减，并由对手指令 AI 按人格评估本 tick 是否下指令
      ['combo', 'wall', 'clinch'].forEach(function (k) { if (B.foeCd[k] > 0) B.foeCd[k] = Math.max(0, B.foeCd[k] - dt); });
      if (B.foeBuff.combo > 0) B.foeBuff.combo = Math.max(0, B.foeBuff.combo - dt);
      if (B.foeBuff.wall > 0) B.foeBuff.wall = Math.max(0, B.foeBuff.wall - dt);
      foeCommandAI();

      if (B.time < (B.holdUntil || -1)) {
        // 修复批次 B：搂抱缠抱停战中——双方都不出拳，贴身回气（重创照常衰减，见上方 decayTrauma）
        B.me.stam = Math.min(100, B.me.stam + 5 * dt);
        B.foe.stam = Math.min(100, B.foe.stam + 5 * dt);
      } else {
        var atkRounds = Math.max(1, B.speed);
        for (var ai = 0; ai < atkRounds; ai++) {
          if (B.phase !== 'fight') break; // 已进入读秒/终局，停手
          tryAttack(B.me, B.foe, true);
          if (B.phase === 'fight' && B.foe.hp > 0) tryAttack(B.foe, B.me, false);
          if (B.me.hp <= 0 || B.foe.hp <= 0) break;
        }
      }
      if (B.phase === 'down') { renderBattle(); return; }
      if (B.tickCount % 3 === 0) moveFighters();

      if (B.me.hp <= 0 || B.foe.hp <= 0) { finishBattle(); renderBattle(); return; }
      if (B.timeLeft <= 0) {
        if (B.round >= ROUNDS) { finishBattle(); }
        else startBreak();
      }
      renderBattle();
    }

    function woundTxt(hpPct) { return hpPct > 70 ? '状态良好' : hpPct >= 40 ? '轻伤（擦伤/肿胀）' : '重伤（步伐发飘，急需调整）'; }
    function foeTendencyTxt() {
      var used = B.foe.used || {};
      var best = '', bestN = 0, total = 0;
      PUNCH_KEYS.forEach(function (k) { total += (used[k] || 0); if ((used[k] || 0) > bestN) { bestN = used[k]; best = k; } });
      if (!best || total < 3) return '出拳样本还少，暂无明显倾向';
      return '本场最爱用' + PUNCHES[best].name + '（已出 ' + bestN + ' 次 / 共 ' + total + ' 拳）' + (best === 'hook' ? '，注意他的摆拳' : best === 'upper' ? '，贴身时小心上勾' : best === 'body' ? '，他在削你的体力' : best === 'jab' ? '，靠刺拳控距离打点' : '，直拳是主力');
    }
    function breakTips() {
      var tips = [];
      var rs = B.roundStats || freshRoundStats();
      var mePtsTotal = pointsOf(B.me, 0), foePtsTotal = pointsOf(B.foe, 0);
      if ((B.meDownsRound || 0) > 0) tips.push('上一回合被击倒了，注意防守，别贪拳先稳住。');
      if ((B.meTrauma || 0) >= 60) tips.push('你的重创值已 ' + Math.round(B.meTrauma) + '，再被连续命中可能被 KO——拉开距离让它衰减。');
      if ((B.foeTrauma || 0) >= 60) tips.push('对手重创值已 ' + Math.round(B.foeTrauma) + '，连续命中攒满就能直接 KO，压上去！');
      if (tips.length < 2 && mePtsTotal > foePtsTotal + 10) tips.push('点数领先，稳住别浪，守住优势到终场。');
      if (tips.length < 2 && foePtsTotal > mePtsTotal + 10) tips.push('点数落后，下回合主动抢攻，别让节奏被带走。');
      if (tips.length < 2 && (B.meBodyHits || 0) >= 2 && B.me.hits > 0 && (B.meBodyHits / Math.max(1, B.me.hits)) >= 0.25) tips.push('击腹效果好，继续打身体削他体力。');
      if (tips.length < 2 && B.me.stam < 35) tips.push('注意体力分配，别空挥——先喘匀再进攻。');
      if (tips.length < 2) {
        var st = B.foe.style;
        if (st === 'power') tips.push('对手是力量型：别硬拼重拳，闪开后抓反击（侧闪接摆拳）。');
        else if (st === 'speed') tips.push('对手是速度型：出拳快，抱紧架、等他打空再还手。');
        else if (st === 'guardcounter') tips.push('对手是防守反击型：少空挥，用击腹破他的高位格挡。');
        else tips.push('保持距离感，重创槽靠连续命中积累，单拳别贪大。');
      }
      if (tips.length < 2 && rs.foeMaxCombo >= 3) tips.push('对手连击打得顺，被连打时先格挡打断他的连击。');
      return tips.slice(0, 2);
    }
    function syncBreakTacticBtns() {
      Array.prototype.forEach.call(document.querySelectorAll('[data-break-tac]'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-break-tac') === (B ? B.nextRoundMod : 'balanced'));
      });
    }
    function startBreak() {
      B.phase = 'break';
      SFX.roundEnd();
      var isManual = B.mode === 'manual';
      B.breakLeft = isManual ? 60 : 5; B.treated = false; B.spoke = false;
      B.nextRoundMod = 'balanced'; // 每回合默认均衡
      syncBreakTacticBtns();
      // Phase 4：双方体力各回复 30 点（30%）
      var meRec = Math.min(30, 100 - B.me.stam), foeRec = Math.min(30, 100 - B.foe.stam);
      B.me.stam = Math.min(100, B.me.stam + 30);
      B.foe.stam = Math.min(100, B.foe.stam + 30);
      B.comboMe = 0; B.comboFoe = 0; // 回合间连击清零
      $('breakPanel').classList.add('open');
      var mePct = Math.round(B.me.hp / B.me.hpMax * 100), foePct = Math.round(B.foe.hp / B.foe.hpMax * 100);
      var rs = B.roundStats || freshRoundStats();
      var bcEl = $('breakCount'); if (bcEl) bcEl.textContent = String(Math.ceil(B.breakLeft));
      var noteEl = $('breakCountNote'); if (noteEl) noteEl.textContent = isManual ? '等满 60 秒或点跳过进入下一回合' : '自动模式 5 秒后自动继续，也可点跳过';
      $('breakText').textContent = '第 ' + B.round + ' 回合结束，双方体力各回复 30 点。' + (isManual ? '休整 60 秒：可改下回合战术（强攻/均衡/稳守），可跳过或等满。' : '自动模式 5 秒后自动继续，可点跳过；战术切换用左侧原有战术按钮。');
      var sumEl = $('breakSummary'); if (sumEl) sumEl.innerHTML = '<b>本回合战况</b> — 你：命中 ' + rs.meHits + ' · 伤害 ' + rs.meDmg + ' · 最高连击 ' + rs.meMaxCombo + ' · 击倒对手 ' + (B.foeDownsRound || 0) + ' 次<br />对手：命中 ' + rs.foeHits + ' · 伤害 ' + rs.foeDmg + ' · 最高连击 ' + rs.foeMaxCombo + ' · 击倒你 ' + (B.meDownsRound || 0) + ' 次<br />重创值 — 你 ' + Math.round(B.meTrauma || 0) + ' / 100 · 对手 ' + Math.round(B.foeTrauma || 0) + ' / 100（休整期间每秒衰减 ' + KO_DECAY + '）';
      var foeEl = $('breakFoeInfo'); if (foeEl) foeEl.innerHTML = '<b>敌人特点</b> — 风格：' + (B.foe.style ? FOE_STYLES[B.foe.style].name : '—') + (B.foe.persona ? ' · 打法：' + personaDesc(B.foe.persona) : '') + ' · 当前战术：' + TACTICS[B.foe.tactic].name + '<br />观察：' + foeTendencyTxt() + '。';
      var tipsEl = $('breakTips'); if (tipsEl) tipsEl.innerHTML = breakTips().map(function (t) { return '<li><b>提示：</b>' + t + '</li>'; }).join('');
      /* G5 即时教学（自动模式）：指令与战术不在开场灌输，等第一个回合间休息——第一次真正能下指令时才教，只教一次。 */
      if (B.mode === 'auto' && teachWindow()) {
        var tutCmd = tutorialState();
        if (tutCmd.taught.indexOf('cmd') < 0) {
          tutCmd.taught.push('cmd');
          save();
          var cmdTipTxt = '现在你能干预了：下方指令按钮——「组合拳」短时爆发连击、「铁壁」全力防守并按住重创积累、「搂抱」贴身停战回体力（都有冷却）；左侧战术按钮切换整场倾向。先试着下一个指令看看效果。';
          if (tipsEl) tipsEl.innerHTML += '<li><b>教学：</b>' + cmdTipTxt + '</li>';
          blog('【教学】' + cmdTipTxt, 'good');
        }
      }
      var tacBox = $('breakTacticBox'); if (tacBox) tacBox.style.display = isManual ? '' : 'none';
      $('breakInfo').textContent = '伤势 — 你：HP ' + mePct + '%（' + woundTxt(mePct) + (Math.round(S.injury) > 0 ? '；既有伤病 ' + Math.round(S.injury) + (injuryDebuffMul() < 1 ? '，本场属性受压制' : '') : '；无既有伤病') + '）· 体力已回复到 ' + Math.round(B.me.stam) +
        '　|　对手：HP ' + foePct + '%（' + woundTxt(foePct) + '）· 体力 ' + Math.round(B.foe.stam) +
        '　|　本回合击倒：你 ' + B.meDownsRound + ' 次 / 对手 ' + B.foeDownsRound + ' 次（3 次触发 TKO 判定）';
      $('btnTreat').disabled = B.mode === 'manual';
      $('btnSpeech').disabled = B.mode === 'manual';
      $('btnTreat').textContent = B.mode === 'manual' ? '处理伤口（手动模式不可用）' : '处理伤口（回复 10 HP）';
      $('btnSpeech').textContent = B.mode === 'manual' ? '场边训话（手动模式不可用）' : '场边训话（意志检定）';
      blog('—— 回合休息（' + (isManual ? '60 秒' : '自动 5 秒') + '）：双方体力各 +30（你 +' + Math.round(meRec) + ' / 对手 +' + Math.round(foeRec) + '）。你 HP ' + mePct + '% · 对手 HP ' + foePct + '% ——', 'dim');
      breakTips().forEach(function (t) { blog('提示：' + t, 'dim'); });
      renderBattle();
    }
    function endBreak() {
      if (!B || B.phase !== 'break') return;
      B.phase = 'fight';
      B.round += 1;
      B.meDownsRound = 0; B.foeDownsRound = 0; // Phase 4：每回合击倒计数重置
      B.meDownMarks = {}; B.foeDownMarks = {}; // KO 定型：刻度击倒的「本回合已兑现刻度」同步重置（新回合可重新跨刻度击倒）
      B.roundStats = freshRoundStats();
      if (B.mode === 'manual') {
        B.meRoundMod = B.nextRoundMod || 'balanced';
        blog('下回合战术：' + BREAK_TACTICS[B.meRoundMod].name + (B.meRoundMod === 'attack' ? '（伤害 +10%，防御 −10%）' : B.meRoundMod === 'guard' ? '（防御 +10%，伤害 −10%）' : '（无修正）') + '。', 'dim');
      }
      B.nextRoundMod = 'balanced';
      B.timeLeft = ROUND_SECONDS;
      B.me.speechBuff = B.pendingSpeech === true;
      B.pendingSpeech = false;
      /* 修复批次 B（M5）：对手不再每回合随机重掷战术——整场人格在此按既定规则评估一次：
         comeback 点数落后 ≥20 转强攻反扑 / protect 点数领先 ≥20 转稳守保胜果 / desperate 残血（HP<35%）转强攻拼命 / none 整场不变；
         规则不满足时回到 base。发生切换才播报：整场一致、跨回合可辨识，玩家能「读人」。
         （批次 G7，2026-11-10：变招门槛 ±30→±20——人格参数、非用户硬数字。foeai 合并采样：
         ±30 场均 0.153 条（360 场）→ ±20 0.203 条（360 场），未达 0.4 目标线；±15 合并 600 场 0.160 不更优。
         定因：门槛非绑定约束——能产生可见切换的只有 points/counter×comeback 与 points×protect 三种
         人格组合（attack 系 comeback/desperate 的目标战术即其 base、结构上不产生切换），且短局每场
         仅约 1.1 次回合间评估；达 0.4 需动人格构成/切换口径，超出本批授权，数据与建议见
         plan/04_CHANGELOG「2026-11-10 · G7」条。）
         （练习赛陪练不走人格：整场稳守带攻，行为可预期才教得到东西。） */
      if (!B.practice && B.foe.persona) {
        var per = B.foe.persona;
        var ptsMeNow = pointsOf(B.me, 0), ptsFoeNow = pointsOf(B.foe, 0);
        var wantTac = per.base;
        if (per.adjust === 'comeback' && ptsMeNow - ptsFoeNow >= 20) wantTac = 'attack';
        else if (per.adjust === 'protect' && ptsFoeNow - ptsMeNow >= 20) wantTac = 'counter';
        else if (per.adjust === 'desperate' && B.foe.hp < B.foe.hpMax * 0.35) wantTac = 'attack';
        if (wantTac !== B.foe.tactic) {
          B.foe.tactic = wantTac;
          blog('对手调整了战术：' + TACTICS[wantTac].name + '（' + (wantTac === per.base ? '回到惯用打法' : PERSONA_ADJUST_TXT[per.adjust]) + '）。', 'dim');
        }
      }
      $('breakPanel').classList.remove('open');
      setMePose('guard', 0); // 新回合起手回抱架
      ringZoom(B.mode !== 'manual'); // B3：回合开始擂台轻微推近
      $('roundLabel').textContent = 'ROUND ' + B.round;
      SFX.roundStart(1);
      if (B.mindTense && !B.mindRestored && B.round >= 3) {
        B.mindRestored = true;
        B.me.attrs = Object.assign({}, battleBaseAttrs()); // 紧张修正只持续前两回合（伤病 debuff 整场保留）
        blog('第 3 回合：紧张感退去，属性恢复正常。', 'good');
      }
      blog('第 ' + B.round + ' 回合开始！', 'dim');
      renderBattle();
    }

    function pointsOf(f, tacBonus) {
      return f.dmg + f.hits * 2 + (tacBonus || 0);
    }
    function finishBattle() {
      if (!B || B.phase === 'over') return;
      B.phase = 'over';
      $('downOverlay').classList.remove('go');
      clearInterval(battleTimer);
      var mePts = pointsOf(B.me, B.me.tactic === 'points' ? B.me.hits * 2 : 0);
      var foePts = pointsOf(B.foe, B.foe.tactic === 'points' ? B.foe.hits * 2 : 0);
      var win, how;
      var isKO = B.foe.hp <= 0 || B.me.hp <= 0;
      if (B.koKind === 'tko-giveup' && B.foe.hp <= 0) { win = true; how = 'TKO 获胜！（对手本回合第 3 次击倒，直接判负）'; $('figFoe').classList.add('down'); }
      else if (B.koKind === 'tko-giveup' && B.me.hp <= 0) { win = false; how = 'TKO 落败（本回合第 3 次击倒，直接判负）'; $('figMe').classList.add('down'); }
      else if (B.koKind === 'deathfight-down' && B.foe.hp <= 0) { win = true; how = 'TKO 获胜！（对手死战中再次被击倒）'; $('figFoe').classList.add('down'); }
      else if (B.koKind === 'deathfight-down' && B.me.hp <= 0) { win = false; how = 'TKO 落败（死战中再次被击倒）'; $('figMe').classList.add('down'); }
      else if (B.koKind === 'trauma' && B.foe.hp <= 0) { win = true; how = 'KO 获胜！（重创值满格 100，积累终结）'; $('figFoe').classList.add('down'); }
      else if (B.koKind === 'trauma' && B.me.hp <= 0) { win = false; how = '被 KO 了……（你的重创值满格 100）'; $('figMe').classList.add('down'); }
      else if (B.tkoReason && B.foe.hp <= 0 && B.downFighter === 'foe') { win = true; how = 'TKO 获胜！（对手' + B.tkoReason + '）'; $('figFoe').classList.add('down'); }
      else if (B.tkoReason && B.me.hp <= 0 && B.downFighter === 'me') { win = false; how = 'TKO 落败（你' + B.tkoReason + '）'; $('figMe').classList.add('down'); }
      else if (B.foe.hp <= 0) { win = true; how = 'KO 获胜！（HP 归零）'; $('figFoe').classList.add('down'); }
      else if (B.me.hp <= 0) { win = false; how = '被 KO 了……（HP 归零）'; $('figMe').classList.add('down'); }
      else if (mePts > foePts) { win = true; how = '点数判定获胜（' + mePts + ' : ' + foePts + '）'; }
      else if (mePts < foePts) { win = false; how = '点数判定落败（' + mePts + ' : ' + foePts + '）'; }
      else { win = B.me.hp > B.foe.hp; how = '点数相同，按剩余 HP 判定' + (win ? '获胜' : '落败'); }
      B.result = { win: win, how: how };
      // 姿势帧终局定格：胜＝胜利举臂图（结算窗延迟弹出，擂台上可见）；被 KO＝受击图配合倒地
      if (win) setMePose('victory', 0);
      else if (B.me.hp <= 0) setMePose('hit', 0);
      // G2：对手纸偶终局定格（与主角同口径）——被 KO/TKO 倒地不起走 down；对手获胜举臂；点数负于我方保持抱架
      if (B.foe.hp <= 0) driveFoeRig('hit');
      else if (!win) driveFoeRig('victory');
      if (isKO) koFx(); else { SFX.finalBell(); if (win) SFX.victory(); } // Phase 9：KO 欢呼在 koFx 内（koCheer），判定胜另加胜利欢呼
      if (typeof BGM !== 'undefined') BGM.start('daily'); // Phase 9：战斗结束切回日常曲
      settleNow(win, how, isKO ? 2000 : 900);
    }

    /* 新手期重构：练习赛专属轻量结算——只有出拳熟练度经验（同正式赛公式）与获胜心态 +5 入账；
       不写 wins/losses/winStreak、不动排名与对手 rating、不发奖金/名声、不刷新影响力、不查阶段/成就、
       不排首胜首败等剧情、不点亮名鉴、无伤病（随机伤 + 击倒/KO 附加伤全免）、体力不清空、不耗 AP。 */
    function settlePractice(win, how, delay) {
      var expGain = {};
      PUNCH_KEYS.forEach(function (k) {
        expGain[k] = (B.me.used[k] || 0) * 2;
        if (expGain[k] > 0) addPunchExp(S, k, expGain[k]);
      });
      tutorialState().practiceDone = true;
      if (win) changeMind(5);
      var rows = '';
      rows += '<tr><td>练习赛</td><td>不计入正式战绩（当前仍为 ' + S.wins + ' 胜 · ' + S.losses + ' 负），排名、影响力、奖金都不变</td></tr>';
      rows += '<tr><td>伤病 / 体力</td><td>陪练点到为止：本场不产生任何伤病，体力也不清空，接着安排今天的日程就行</td></tr>';
      PUNCH_KEYS.forEach(function (k) {
        if (expGain[k] > 0) rows += '<tr><td>' + PUNCHES[k].name + '熟练度（出拳 ' + (B.me.used[k] || 0) + ' 次）</td><td>经验 +' + expGain[k] + '</td></tr>';
      });
      if (win) rows += '<tr><td>心态</td><td>+5（当前 ' + Math.round(S.mind) + ' · ' + mindTierName(S.mind) + '）——第一场赢了，哪怕只是练习赛</td></tr>';
      rows += '<tr><td>下一步</td><td>每天 6 点行动点：训练变强、打工攒钱，第 7 天打第一场正式赛（据点顶部有首周目标）</td></tr>';
      $('settleTable').innerHTML = rows;
      $('settleTitle').textContent = '练习赛 · vs ' + B.foe.name;
      var res = $('settleResult');
      res.textContent = win ? '练习赛获胜' : '练习赛落败';
      res.className = 'big-result ' + (win ? 'win' : 'lose');
      $('settleDesc').textContent = how + '　——第一场打完了。擂台的感觉，找到了吗？';
      var sfl = $('settleFoeLine'); if (sfl && B.foe) sfl.textContent = B.foe.name + '：「' + foeLine(B.foe.key, win ? 'lose' : 'win') + '」';
      dailyLog('练习赛 vs ' + B.foe.name + '：' + how + '（教学战，不计战绩）。', win ? 'good' : 'dim');
      setTimeout(function () {
        $('settleModal').classList.add('open');
        setScene('ring_corner');
      }, delay || 900);
      save();
    }

    /* 结算（三种模式共用）：奖金、名声、熟练度经验、受伤、体力消耗 */
    function settleNow(win, how, delay) {
      if (B.practice) { settlePractice(win, how, delay); return; } // 新手期重构：练习赛走轻量结算，其余一律不变
      if (B.spar) { settleSpar(win, how, delay); return; } // 修复批次 C：约战走专属结算（不计战绩/排名/奖金）
      var w = weekOf(S.day);
      var prizeFull = prizeForRank(w); // 基础奖金 × 排名加成 × 影响力加成（按赛前影响力档计算）
      var prize = win ? prizeFull : Math.floor(prizeFull / 2);
      // 修复批次 D：宣传造势生效中——正式赛获胜奖金 ×PROMO_PRIZE_MUL，本场结算后消费（约战在上方已分流、奖金恒 0，不触发）
      var promoApplied = false;
      if (win && S.buffs && S.buffs.promo) { prize = Math.round(prize * PROMO_PRIZE_MUL); promoApplied = true; S.buffs.promo = false; }
      // 动态档位制：胜负不再加减粉丝数；影响力按当前胜场/排名重算（胜场/排名已在本函数后段更新，这里先记赛前档位，更新后刷新对比，可升可降）
      var influenceBefore = refreshInfluence();
      var influencePctBefore = influenceBonusPct();
      var foeRank0 = (B.foe && B.foe.rank) || S.rank;
      var oldRank0 = S.rank;
      var expGain = {};
      PUNCH_KEYS.forEach(function (k) {
        expGain[k] = (B.me.used[k] || 0) * 2;
        if (expGain[k] > 0) addPunchExp(S, k, expGain[k]);
      });
      var injured = false;
      var dmgTakenRatio = 1 - B.me.hp / B.me.hpMax;
      var injP = 0.15 + dmgTakenRatio * 0.25;
      if (B.bandage) injP *= 0.5; // 绷带：伤病概率减半
      if (Math.random() < injP) {
        var add = Math.round(rnd(8, 18));
        S.injury = Math.min(100, S.injury + add); injured = add;
      }
      S.money += prize;
      if (win) { S.wins += 1; S.fame += 1; S.winStreak = (S.winStreak || 0) + 1; } else { S.losses += 1; S.winStreak = 0; }
      // 批次 G1：正式赛战绩入运行时日志（动态难度的数据源；练习赛/约战已在上方分流，不入日志；不落存档）
      formLog.push({ t: S.wins + S.losses, win: win, round: B.round, meHpPct: B.me.hpMax ? Math.max(0, B.me.hp) / B.me.hpMax : 0 });
      if (formLog.length > 8) formLog.shift();
      // 修复批次 C：正式赛击败伊芙琳（国内第 1 名）落盘——阶段 5「击败特定对手」通道与成就「弑王者」的依据（老档无此记录、不可追溯）
      if (win && B.foe && B.foe.key === 'opp_world_champion') S.beatChamp = true;
      /* 正式版批次 G9 短期：卫冕战记账——本场在此之前/之后的一切（奖金/战绩/排名/影响力/阶段/成就）
         都与普通正式赛完全同口径，此处只补卫冕专属状态：胜 → 累计卫冕 +1（与阶段 6 目标、成就
         defend_1/defend_3 共用同一计数）；无论胜负都清掉待应战挑战并记本周已战（每周至多 1 场）。
         放在 checkStageCompletion/checkAchievements 之前，让本场的卫冕胜场同场计入阶段与成就判定。 */
      var defenseSettled = false;
      if (B.defense) {
        defenseState();
        defenseSettled = true;
        S.defenseWeek = w;
        S.defenseChallenge = null;
        if (win) S.defenses += 1;
        dailyLog('卫冕战 vs ' + (B.foe ? B.foe.name : '挑战者') + '：' + (win ? '卫冕成功（累计 ' + S.defenses + ' 次）' : '卫冕失败，冠军易主') + '。', win ? 'good' : 'bad');
      }
      // Phase 9 纯计数：累计 KO 胜场（对手 HP 归零的胜场，含 TKO/模拟 KO）。只写入计数，不参与任何胜负/数值逻辑
      if (win && B.foe && B.foe.hp <= 0) S.koWins = (typeof S.koWins === 'number' && S.koWins >= 0 ? S.koWins : 0) + 1;
      // 排名升降：赢高排名 +3~5 名、赢低排名 +1~2 名；输低排名 −3~5 名、输高排名 −1~2 名（名次数字增减相反）
      var foeRank = (B.foe && B.foe.rank) || S.rank;
      var oldRank = S.rank;
      var rankDelta = win
        ? -(foeRank < oldRank ? Math.round(rnd(3, 5)) : Math.round(rnd(1, 2)))
        : (foeRank > oldRank ? Math.round(rnd(3, 5)) : Math.round(rnd(1, 2)));
      applyRankShift(clamp(oldRank + rankDelta, 1, 50)); // 角色池：名次变动走阶梯顶替（介于其间的池内成员逐一平移）
      var rankMoved = S.rank - oldRank; // 负数 = 名次上升
      // 角色池：本场对手 rating 微调——被玩家击败 −0.3、击败玩家 +0.3（钳制 [6,30]）
      if (B.foe && B.foe.key) {
        var foeMember = null;
        S.roster.forEach(function (m) { if (m.key === B.foe.key) foeMember = m; });
        if (foeMember) {
          // 修复批次 A：玩家参考 rating 的含金量项——「最近击败对手」的 rating（覆盖式，取微调前的值）
          if (win) S.lastBeaten = foeMember.rating;
          foeMember.rating = clamp(Math.round((foeMember.rating + (win ? -0.3 : 0.3)) * 100) / 100, 6, 30);
        }
      }
      // D3：对手名鉴「已交手」记录（三模式共用此结算点；仅供名鉴点亮展示，不参与任何数值/判定）
      if (B.foe && B.foe.key) {
        if (!Array.isArray(S.facedFoes)) S.facedFoes = [];
        if (S.facedFoes.indexOf(B.foe.key) < 0) S.facedFoes.push(B.foe.key);
      }
      // 心态结算：获胜 +15 / 战败 −10 / 被 KO −25
      var koLoss = !win && B.me.hp <= 0;
      var mindDelta = win ? 15 : (koLoss ? -25 : -10);
      changeMind(mindDelta);
      // 伤病深化：被击倒每次 +5，被 KO +15，死战 +10
      var downInj = (B.meDowns || 0) * 5;
      var koInj = koLoss ? 15 : 0;
      var deathInj = B.meDeathFight ? 10 : 0;
      if (downInj + koInj + deathInj > 0) S.injury = Math.min(100, S.injury + downInj + koInj + deathInj);
      if (S.scoutedForDay === S.day) S.scoutedForDay = 0; // 本场的侦察已消耗
      S.stamina = 15; // 赛后体力大减
      blog(how, win ? 'good' : 'bad');
      // 影响力刷新：胜场/排名都已更新，按当前胜场/排名动态重算（可升可降）
      var influenceAfter = refreshInfluence();
      var influenceUp = influenceAfter > influenceBefore;
      var influenceDown = influenceAfter < influenceBefore;
      // Phase 3：阶段检查（排名 / 影响力 / 连胜都已更新，可能连环完成；奖金已在检查里到账，祝贺窗等结算窗关闭后弹）
      var stageDoneNow = checkStageCompletion();
      checkAchievements(); // Phase 9：战绩/KO/连胜/排名/影响力/阶段都已更新，此处集中判定成就
      // Phase 7：剧情触发（事件只入队，结算窗关闭后才依次弹出，不打断结算流程）
      stageDoneNow.forEach(function (d) { if (d.id >= 2 && d.id <= 6) queueStory('ev_stage' + d.id); });
      if (win && S.wins === 1) queueStory('ev_firstwin');
      if (!win && S.losses === 1) queueStory('ev_firstloss');
      if (oldRank > 25 && S.rank <= 25) queueStory('ev_top25');
      if (oldRank > 10 && S.rank <= 10) queueStory('ev_top10');
      if (oldRank > 1 && S.rank <= 1) queueStory('ev_champ');
      checkStoryMilestones(); // 修复批次 C：剧情节点双通道补检（纯胜场路线达标也在结算时补排队）
      if (win && B.foe.hp <= 0) queueStory('ev_firstko');
      if (!win && B.me.hp <= 0) queueStory('ev_firstkoed');
      if (B.foe.isRival) { // 宿敌战：胜 +8 / 负 +4 好感，赛后对白每场至多一段
        addAffinity('rival', win ? 8 : 4);
        queueStoryRepeat(win ? 'ev_rival_win' : 'ev_rival_lose');
      }
      if (B.foe.isTeammate) addAffinity('teammate', 2); // 同期队友林小葵（角色池 key 判定）：赛后小幅好感

      var rows = '';
      rows += '<tr><td>奖金' + (win ? '' : '（出场费）') + '</td><td>¥<span class="tween-num" data-to="' + prize + '">0</span>（基础 ¥' + (200 + w * 100) + ' × 排名加成 × 影响力加成 +' + influencePctBefore + '%' + (promoApplied ? ' × 宣传造势 ' + PROMO_PRIZE_MUL + ' 倍' : '') + '）</td></tr>'; // C2：奖金数字开窗后滚动到位
      if (win) rows += '<tr><td>名声</td><td>+1（名声随胜场积累；奖金加成与赞助门槛看影响力档位）</td></tr>';
      rows += '<tr><td>影响力</td><td>' + (influenceUp ? influenceLabel(influenceBefore) + ' → <b>' + influenceLabel(influenceAfter) + '</b>（档位提升！出场费加成 +' + influenceBonusPct() + '%）' : influenceDown ? influenceLabel(influenceBefore) + ' → <b>' + influenceLabel(influenceAfter) + '</b>（排名跌出门槛，档位下降！出场费加成 +' + influenceBonusPct() + '%）' : influenceLabel(influenceAfter) + '（动态档位：按当前胜场/排名计算，输比赛跌出门槛会掉档）') + '</td></tr>';
      rows += '<tr><td>连胜</td><td>' + (win ? S.winStreak + ' 连胜' : '中断，清零') + '</td></tr>';
      stageDoneNow.forEach(function (d) {
        rows += '<tr><td>阶段完成：' + d.name + '</td><td>奖励 ¥<span class="tween-num" data-to="' + d.reward + '">0</span> 已到账' + (d.title ? ' ＋称号「' + d.title + '」' : '') + '</td></tr>'; // C2：阶段奖励同奖金一起滚动
      });
      rows += '<tr><td>国内排名</td><td>第 ' + oldRank + ' 名 → 第 ' + S.rank + ' 名' + (rankMoved < 0 ? '（上升 ' + (-rankMoved) + ' 名）' : rankMoved > 0 ? '（下降 ' + rankMoved + ' 名）' : '（不变）') + '</td></tr>';
      /* 【新增文案·待用户审】卫冕战结算行（批次 G9 短期） */
      if (defenseSettled) rows += win
        ? '<tr><td>卫冕</td><td><b>卫冕成功！</b>累计第 ' + S.defenses + ' 次守住冠军（阶段 6 卫冕目标 ' + Math.min(S.defenses, 3) + ' / 3）</td></tr>'
        : '<tr><td>卫冕</td><td>卫冕失败——冠军易主。排名与影响力已按正式赛口径重算；打回第 1 名后，新的挑战者还会再来</td></tr>';
      rows += '<tr><td>我方总伤害 / 命中</td><td>' + B.me.dmg + ' / ' + B.me.hits + '</td></tr>';
      rows += '<tr><td>对手总伤害 / 命中</td><td>' + B.foe.dmg + ' / ' + B.foe.hits + '</td></tr>';
      PUNCH_KEYS.forEach(function (k) {
        if (expGain[k] > 0) rows += '<tr><td>' + PUNCHES[k].name + '熟练度（出拳 ' + (B.me.used[k] || 0) + ' 次）</td><td>经验 +' + expGain[k] + '</td></tr>';
      });
      if (injured) rows += '<tr><td>伤病</td><td>+' + injured + '（休息可恢复）</td></tr>';
      if (downInj) rows += '<tr><td>被击倒 ' + B.meDowns + ' 次</td><td>伤病 +' + downInj + '</td></tr>';
      if (koInj) rows += '<tr><td>被 KO 的代价</td><td>伤病 +' + koInj + '</td></tr>';
      if (deathInj) rows += '<tr><td>死战到底的代价</td><td>伤病 +' + deathInj + '</td></tr>';
      if (B.koKind) rows += '<tr><td>终结方式</td><td>' + (B.koKind === 'trauma' ? '重创值满格 KO' : B.koKind === 'tko-giveup' ? 'TKO（本回合第 3 次击倒，直接判负）' : B.koKind === 'deathfight-down' ? '死战中再次击倒判负' : B.koKind === 'sim' ? 'KO（模拟）' : B.koKind === 'sim-tko' ? 'TKO（模拟）' : 'HP 归零 KO') + '</td></tr>';
      rows += '<tr><td>心态</td><td>' + (mindDelta > 0 ? '+' : '') + mindDelta + '（当前 ' + Math.round(S.mind) + ' · ' + mindTierName(S.mind) + '）</td></tr>';
      rows += '<tr><td>体力</td><td>降至 15，先好好休息</td></tr>';
      rows += '<tr><td>今日剩余行动点</td><td>' + S.ap + ' AP（报名免费，赛后保留）</td></tr>';
      $('settleTable').innerHTML = rows;
      $('settleTitle').textContent = 'vs ' + B.foe.name;
      var res = $('settleResult');
      res.textContent = win ? '胜 利' : '败 北';
      res.className = 'big-result ' + (win ? 'win' : 'lose');
      $('settleDesc').textContent = how + '　战绩 ' + S.wins + ' 胜 · ' + S.losses + ' 负' + (rankMoved < 0 ? '　排名升至第 ' + S.rank + ' 名，恭喜！' : '') + '　影响力 ' + influenceLabel(influenceAfter) + (stageDoneNow.length ? '　阶段「' + stageDoneNow[stageDoneNow.length - 1].name + '」完成！' : '') +
        /* 【新增文案·待用户审】卫冕战结算尾句（批次 G9 短期） */
        (defenseSettled ? (win ? '　——卫冕成功，王座又守住了一次。' : '　——冠军易主。跌下去不可怕，爬回来的人才配叫传奇。') : '');
      var sfl = $('settleFoeLine'); if (sfl && B.foe) sfl.textContent = B.foe.name + '：「' + foeLine(B.foe.key, win ? 'lose' : 'win') + '」'; // D1：赛后对手台词（win/lose 为对手视角：玩家胜→对手负台词）
      if (B.mode !== 'sim') dailyLog('比赛 vs ' + B.foe.name + '（第 ' + foeRank + ' 名）：' + how + '，国内排名第 ' + oldRank + ' 名 → 第 ' + S.rank + ' 名，影响力 ' + influenceLabel(influenceAfter) + (influenceUp ? '（本场后提升！）' : influenceDown ? '（本场后下降！）' : '') + '。', win ? 'good' : 'bad');
      if (rankMoved < 0) setTimeout(function () { toast('国内排名升至第 ' + S.rank + ' 名！'); }, (delay || 900) + 500);
      setTimeout(function () {
        $('settleModal').classList.add('open');
        setScene(win && S.rank === 1 ? 'title_stage' : 'ring_corner'); // A1：夺冠结算切冠军舞台，其余结算切擂台角
        Array.prototype.forEach.call(document.querySelectorAll('#settleModal .tween-num'), function (el) { countUp(el, parseInt(el.getAttribute('data-to'), 10) || 0); }); // C2：开窗后启动数字滚动
      }, delay || 900);
      maybeDefenseChallenge(); // 正式版批次 G9 短期：正式赛结算后补检卫冕挑战——刚登顶即有挑战者上门；卫冕战本身刚结算时 defenseWeek 已记本周、不会连环生成；跌下第 1 名则待应战挑战在此作废
      save();
    }

    /* ================= 模式3：模拟跳过 ================= */
    function simulateBattle() {
      var foe = pendingFoe || makeFoe();
      pendingFoe = null;
      var simDefense = nextBattleDefense; nextBattleDefense = false; // 正式版批次 G9 短期：卫冕战走模拟跳过时同样带卫冕标记进结算
      if (!foe.weakness && S.scoutedForDay === S.day) foe.weakness = PUNCH_KEYS[Math.floor(Math.random() * PUNCH_KEYS.length)];
      var me = myFighter();
      B = { mode: 'sim', me: me, foe: foe, defense: simDefense, round: 1, phase: 'over', buff: { combo: 0, wall: 0 }, cd: { combo: 0, wall: 0 }, meBlocking: false, foeBlocking: false, time: 0, comboMe: 0, comboFoe: 0, meCounterUntil: -1, foeCounterUntil: -1, meBrokenUntil: -1, foeBrokenUntil: -1, meDownsRound: 0, foeDownsRound: 0, koKind: null };
      if (!simDefense) S.lastMatchDay = S.day; // 报名免费（0 AP），只记录今日已比赛（卫冕战不占每周正式赛位，与 startBattle 同口径）
      B.bandage = !!S.buffs.bandage; S.buffs.bandage = false;
      if (S.mind >= 20 && S.mind < 40) ATTRS.forEach(function (a) { B.me.attrs[a.key] = Math.round(B.me.attrs[a.key] * 0.95 * 10) / 10; }); // 心态紧张修正
      /* KO 定型（2026-11-03，KO_AUDIT.md 实装记录）：模拟跳过按新引擎实测分布重标定，不再用旧评分线性式＋45% 平直 KO 抽签。
         胜率改走 TTK 竞赛：以与引擎同构的 DPS 模型估算双方击杀回合数 ttkMe/ttkFoe，
         winP 与 KO 率的现行常量见下方 G3-a 拟合值（旧制 logistic(2.0/0.6/平移0.2)+罚项与 koP 1.75-0.271 已被取代）；KO 终结回合按 minTTK 采样（见下）。
         批次 G3-a 重标定（2026-11-10，plan/04_CHANGELOG G3 条）：旧 DPS 模型把单拳伤害写成
         「力量×(1+平均熟练度×0.05)×1.05」的平直式——漏了拳种系数混合（pickPunch 权重×战术倾向）、
         强攻战术 ×1.3、暴击期望、对手风格 dmgMul 与连击积累，且对双方都套 ×0.85 格挡折损
         （引擎里我方在无指令口径下根本不持架、对手的拳不吃格挡折损），又用 40 次平直封顶代替
         体力税。探针（research/g3_logs/probe_sim.mjs，同对 fighter 分解）实测：引擎单拳净伤是
         旧模型的 1.9~2.4 倍、且对手侧低估更甚，TTK 竞赛被系统性推向玩家——spd 构筑残差达
         32.5pp（复测 I1）。新模型逐项按引擎期望重写：拳种混合（权重＝熟练度×风格×战术倾向）、
         战术命中表（calcHitChance 同分支）、格挡只折我方进攻且按对手真实格挡率＋击腹穿透混合、
         出拳数走体力 duty-cycle 期望模拟（90 tick×3 回合、回合间 +30、被击腹/命中削体力按对手
         命中期望扣减）。logistic 与 koP 常量由 research/g3_logs/fit_sim.mjs 对引擎实测胜率网格拟合。 */
      var SIM_FIT = 1.10; // 连击积累＋反击窗口的期望增益（引擎分解残差的全局吸收项，fit_sim 拟合）
      function simMix(att, isFoe) {
        var tac = isFoe ? ((att.persona && att.persona.base) || att.tactic || 'attack') : 'attack'; // 模拟口径：我方整场强攻（与 ko-impl-verify 无指令口径一致），对手走人格 base
        var st = isFoe ? styleOf(att) : null;
        var inten = st && typeof att.styleIntensity === 'number' ? att.styleIntensity : 0;
        var tacBias = tac === 'attack' ? { jab: 0.8, straight: 1.0, hook: 1.35, upper: 1.35, body: 1.15 }
          : tac === 'points' ? { jab: 1.5, straight: 1.25, hook: 0.75, upper: 0.75, body: 0.9 }
          : { jab: 0.9, straight: 1.15, hook: 1.0, upper: 1.05, body: 1.0 };
        var wsum = 0, coef = 0, stam = 0, prof = 0, bodyW = 0;
        PUNCH_KEYS.forEach(function (k) {
          var base = 1 + (att.prof[k] || 0) * (isFoe ? 1 : 1.6); // pickPunch 同权重（我方 ×1.6、对手 ×1）
          if (st) base *= (1 + (st.weights[k] - 1) * inten);
          var wgt = Math.max(0.1, base * (tacBias[k] || 1));
          wsum += wgt; coef += wgt * PUNCHES[k].coef; stam += wgt * PUNCHES[k].stam; prof += wgt * (att.prof[k] || 0);
          if (k === 'body') bodyW = wgt;
        });
        return { tac: tac, coefMix: coef / wsum, stamMix: stam / wsum, profMix: prof / wsum, bodyShare: bodyW / wsum };
      }
      function simNetDmg(att, isFoe, mix) {
        var raw = att.attrs.power * mix.coefMix * (1 + mix.profMix * 0.05) * (mix.tac === 'attack' ? 1.3 : 1) * 1.05; // 战术强攻 ×1.3、暴击期望 ×1.05（tryAttack/dealDamage 同口径）
        if (isFoe) raw *= styleVal(att, 'dmgMul', 1);
        raw *= SIM_FIT;
        return raw;
      }
      function simNetPer(att, def, isFoe, mix) { // 单拳净伤害期望（F2 地板：减伤封顶 raw 的 70%）
        var raw = simNetDmg(att, isFoe, mix);
        return Math.max(1, raw - Math.min(def.attrs.defense * 1.0, raw * 0.7));
      }
      function simHitChance(att, def, attTac, defTac) { // calcHitChance 同分支（含战术相克乘子与双重钳制）
        var hc = 0.70 + (att.attrs.accuracy - def.attrs.footwork) * 0.01;
        hc = Math.min(0.95, Math.max(0.30, hc));
        if (defTac === 'counter') hc *= (attTac === 'points' ? 0.88 : 0.7);
        else if (defTac === 'points') hc *= (attTac === 'attack' ? 1.06 : 0.95);
        else if (attTac === 'attack') hc *= 1.02;
        return Math.min(0.95, Math.max(0.30, hc));
      }
      function simBlockFactor(def, defTac, mix) { // 只有对手会持架格挡我方（calcBlockChance 同式）；击腹穿透 70%、其余格挡后 ×0.3
        var bp = 0.16 + (defTac === 'counter' ? 0.08 : 0);
        if (def.style === 'guardcounter') bp += styleVal(def, 'blockAdd', 0);
        bp = clamp(bp, 0.05, 0.45);
        return (1 - bp) + bp * (mix.bodyShare * 0.7 + (1 - mix.bodyShare) * 0.3);
      }
      function simAttempts(att, isFoe, mix, drainPerRound) { // 体力税：90 tick 期望 duty-cycle（<6 歇气 +4.6、<30 频率 ×0.7、失败回气 +0.92、回合间 +30、被命中削体力）
        var freq = 0.24 + att.attrs.speed * 0.012;
        if (isFoe) freq *= 1.15 * styleVal(att, 'freqMul', 1);
        if (mix.tac === 'counter') freq *= 0.6;
        var cost = mix.stamMix * (mix.tac === 'attack' ? 1.5 : mix.tac === 'points' ? 0.7 : 1);
        if (isFoe) cost *= styleVal(att, 'stamMul', 1);
        var stam = 100, total = 0;
        for (var r = 0; r < 3; r++) {
          for (var t = 0; t < 90; t++) {
            if (stam < 6) { stam = Math.min(100, stam + 4.6); continue; }
            var p = freq * (stam < 30 ? 0.7 : 1);
            total += p;
            stam += (1 - p) * 0.92 - p * cost;
            if (stam < 0) stam = 0; else if (stam > 100) stam = 100;
          }
          stam = Math.min(100, Math.max(0, stam + 30 - (drainPerRound || 0)));
        }
        return total / 3;
      }
      function simDps(att, def, isFoe, foeHitsPerRound, foeNetPer, foeBodyShare) {
        var mix = simMix(att, isFoe);
        var defTac = isFoe ? 'attack' : ((def.persona && def.persona.base) || def.tactic || 'attack');
        var net = simNetPer(att, def, isFoe, mix);
        var drain = foeHitsPerRound ? foeHitsPerRound * (1 + (foeBodyShare || 0) * 0.6 * (foeNetPer || 0)) : 0; // 被命中每拳 −1 体力、击腹再 −伤害×0.6（dealDamage 同口径）
        var attempts = simAttempts(att, isFoe, mix, drain);
        var hc = simHitChance(att, def, mix.tac, defTac);
        var bf = isFoe ? 1 : simBlockFactor(def, defTac, mix);
        return { dps: attempts * hc * bf * net, attempts: attempts, hc: hc, net: net, mix: mix };
      }
      var simMe0 = simDps(me, foe, false, 0, 0, 0); // 第一遍不计被削体力，求对手命中量后再算 drain
      var simFoe0 = simDps(foe, me, true, 0, 0, 0);
      var simMe = simDps(me, foe, false, simFoe0.attempts * simFoe0.hc, simFoe0.net, simFoe0.mix.bodyShare);
      var simFoe = simDps(foe, me, true, simMe0.attempts * simMe0.hc, simMe0.net, simMe0.mix.bodyShare);
      var ttkMe = foe.hpMax / Math.max(1, simMe.dps);
      var ttkFoe = me.hpMax / Math.max(1, simFoe.dps);
      var raceD = ttkFoe - ttkMe;
      var defPen = Math.max(0, foe.attrs.defense - me.attrs.power - 6); // G3-a 拟合后系数归零（新模型已把防守写进单拳净伤，罚项冗余），保留变量备查
      var winP = clamp(1 / (1 + Math.exp(-4.0 * (raceD - 0.3) / 0.55)) - 0 * defPen + (foe.weakness ? 0.05 : 0), 0.02, 0.98); // G3-a 拟合：k=4.0/平移 0.3/alpha=0.55（fit_sim v2，全环境拟合误差 ≤8.4pp）
      /* G3-a 记分混合（fit_sim2 拟合，K=0.075）：winP 原式只建模 TTK 竞赛；当对局大概率走点数终局时
         （koP 低），胜负由记分牌决定——scoreOf 的「伤害＋命中×2」口径利好量产型构筑，纯 TTK 会系统性
         低估 spd/tec（G1b 后中盘点数局变多后实测残差 spd 8.3/tec 11.7/br1 17pp）。按 (1-koP)² 为权重
         混合记分胜率 logistic(0.075×记分率差)：拟合样本 spd Δ1.2/tec Δ0.4/pow Δ2.0，br1 实测 31% vs 混合预测 30.7%。 */
      var koP = clamp(1.90 - 0.425 * Math.min(ttkMe, ttkFoe), 0.02, 0.99);
      var scoreRateD = (simMe.dps + 2 * simMe.attempts * simMe.hc) - (simFoe.dps + 2 * simFoe.attempts * simFoe.hc);
      var winPPts = 1 / (1 + Math.exp(-0.075 * scoreRateD));
      var ptsW = Math.pow(1 - koP, 2);
      winP = clamp(winP * (1 - ptsW) + winPPts * ptsW, 0.02, 0.98);
      var win = Math.random() < winP;
      var totalPunches = Math.round(rnd(24, 44));
      var weights = PUNCH_KEYS.map(function (k) { return 1 + me.prof[k] * 1.6; });
      var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
      PUNCH_KEYS.forEach(function (k, i) { me.used[k] = Math.round(totalPunches * weights[i] / wsum); });
      me.hits = Math.round(totalPunches * rnd(0.45, 0.65));
      me.dmg = Math.round(me.hits * rnd(6, 10));
      foe.hits = Math.round(totalPunches * rnd(0.4, 0.6));
      foe.dmg = Math.round(foe.hits * rnd(6, 10));
      if (win && me.dmg < foe.dmg) { var swapD = me.dmg; me.dmg = foe.dmg; foe.dmg = swapD; } // 展示口径：胜者总伤害不低于负者
      if (!win && foe.dmg < me.dmg) { var swapD2 = me.dmg; me.dmg = foe.dmg; foe.dmg = swapD2; }
      var minTTK = Math.min(ttkMe, ttkFoe);
      var ko = Math.random() < koP; // G3-a 拟合（fit_sim v2：br1 KO 率误差 0.2pp、其余环境 ≤1.3pp）；koP 已在记分混合处统一计算
      var r = 3;
      if (ko) {
        var pR1 = clamp(1.62 - 0.89 * minTTK, 0, 0.97); // G3-a：minTTK 随新模型缩短（约旧尺度 ×0.62），斜率按比例放大保住终结回合分布（展示口径近似）
        var pR2 = clamp(1.30 - 0.355 * minTTK, 0.60, 0.99);
        var rollR = Math.random();
        r = rollR < pR1 ? 1 : (rollR < pR1 + (1 - pR1) * pR2 ? 2 : 3);
      }
      B.round = r;
      var how;
      if (ko) {
        var tkoP = clamp(0.02 + 0.10 * Math.max(0, Math.abs(raceD) - 1.2), 0.02, 0.33); // 引擎实测：TKO 占 KO 终局比例随悬殊度上升（弱档弃权/3 击倒）
        var isTKO = Math.random() < tkoP;
        B.koKind = isTKO ? 'sim-tko' : 'sim'; // P2-16：模拟路径也要设置终结方式，结算表显示「KO（模拟）」行
        if (win) { foe.hp = 0; me.hp = Math.round(me.hpMax * rnd(0.3, 0.8)); how = '第 ' + r + ' 回合 ' + (isTKO ? 'TKO' : 'KO') + ' 获胜！（模拟）'; }
        else { me.hp = 0; foe.hp = Math.round(foe.hpMax * rnd(0.3, 0.8)); how = '第 ' + r + ' 回合被 ' + (isTKO ? 'TKO' : 'KO') + ' 落败（模拟）'; }
      } else {
        how = '点数判定' + (win ? '获胜' : '落败') + '（模拟）';
      }
      dailyLog('模拟比赛 vs ' + foe.name + '：' + how + ' 奖金已结算。', win ? 'good' : 'bad');
      settleNow(win, how, 250);
    }

    /* ================= 模式1：手动操作 ================= */
    var MPUNCH = {
      jab:      { prof: 'jab',      name: '刺拳',     coef: 0.6,  range: 20,   stam: 2, cd: 200 },
      straight: { prof: 'straight', name: '直拳',     coef: 1.2,  range: 20,   stam: 4, cd: 340 },
      hookL:    { prof: 'hook',     name: '左摆拳',   coef: 1.4,  range: 16,   stam: 6, cd: 520 },
      hookR:    { prof: 'hook',     name: '右摆拳',   coef: 1.42, range: 16,   stam: 6, cd: 530 },
      upperL:   { prof: 'upper',    name: '左上勾拳', coef: 1.3,  range: 15,   stam: 6, cd: 500 },
      upperR:   { prof: 'upper',    name: '右上勾拳', coef: 1.32, range: 15,   stam: 6, cd: 510 },
      bodyL:    { prof: 'body',     name: '左击腹拳', coef: 0.8,  range: 16,   stam: 4, cd: 380 },
      bodyR:    { prof: 'body',     name: '右击腹拳', coef: 0.82, range: 16,   stam: 4, cd: 390 }
    };
    var keysDown = {};
    var lastTap = { a: 0, d: 0 };
    var keysCtx = 'pre'; // pre=开战前查看 | view=按H查看（暂停）
    var touchBlock = false; // 触屏格挡按钮的按住状态（与键盘空格共用同一格挡逻辑）

    /* 触屏输入：虚拟摇杆状态，与键盘合并读取（两套操作并存） */
    var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    var joy = { dx: 0, dy: 0, curDir: '', lastDir: '', lastFlickAt: 0, latchX: 0, latchY: 0, latchAt: 0 };
    function effDir() {
      // 移动用：双轴可同时生效，阈值统一放宽到 0.30
      return {
        a: !!(keysDown.a || joy.dx < -0.30),
        d: !!(keysDown.d || joy.dx > 0.30),
        w: !!(keysDown.w || joy.dy < -0.30),
        s: !!(keysDown.s || joy.dy > 0.30)
      };
    }
    function punchDir() {
      // 出拳选拳种用：键盘方向优先；摇杆取主导轴（纵向判定放宽），
      // 摇杆已回中时用 350ms 内锁定的最后方向，避免出拳瞬间方向丢失
      if (keysDown.w) return 'w';
      if (keysDown.s) return 's';
      if (keysDown.d) return 'd';
      var x = joy.dx, y = joy.dy;
      if (Math.abs(x) < 0.30 && Math.abs(y) < 0.30) {
        if (performance.now() - joy.latchAt <= 350) { x = joy.latchX; y = joy.latchY; }
        else return '';
      }
      if (Math.abs(y) >= Math.abs(x) * 0.8) return y < 0 ? 'w' : 's'; // 上/下：纵向分量占优即可
      return x > 0 ? 'd' : ''; // 朝对手方向 = 摆拳；朝后不触发
    }
    function prepKeysModal() {
      $('keysKb').style.display = isTouch ? 'none' : '';
      $('keysTouch').style.display = isTouch ? '' : 'none';
      $('keysTitle').textContent = isTouch ? '操作说明 · 触屏' : '键位说明 · 手动操作';
      // P1-2：开战前（pre）显示「取消 · 返回模式选择」；战中按 H 查看时不显示（关闭即继续战斗）
      var kc = $('btnKeysCancel'); if (kc) kc.style.display = keysCtx === 'pre' ? '' : 'none';
    }
    function cancelKeysModal() { // P1-2：取消键位弹窗——开战前回到模式选择；战中查看则恢复比赛
      $('keysModal').classList.remove('open');
      if (keysCtx === 'pre') { var brR = $('battleReady'); if (!brR || brR.hidden) $('modeModal').classList.add('open'); } // 框架重构一期：从准备层打开时取消只关弹窗、回准备层；准备层不在时才回模式选择
      else if (B) B.paused = false;
    }

    function playerPunch(hand) {
      var dir = punchDir(); // 方向在出拳瞬间锁定（含摇杆方向锁定兜底）
      var key = dir === 'w' ? (hand === 'j' ? 'upperL' : 'upperR')
        : dir === 's' ? (hand === 'j' ? 'bodyL' : 'bodyR')
        : dir === 'd' ? (hand === 'j' ? 'hookL' : 'hookR')
        : (hand === 'j' ? 'jab' : 'straight');
      throwPunch(key);
    }
    function playerPunchDirect(key) { throwPunch(key); } // 专用按钮/快捷键：不依赖方向直接出拳
    function throwPunch(key) {
      if (!B || B.phase !== 'fight' || B.paused || B.meBlocking || touchBlock) return;
      if (cmdHoldOn()) return; // 修复批次 B：搂抱缠抱停战中不能出拳（贴身缠着，先分开再说）
      var now = performance.now();
      if (now < B.man.dodgeUntil) return;
      var mp = MPUNCH[key];
      if (now < (B.man.punchReady[key] || 0)) return;
      var stamCost = mp.stam * (B.mindStamMul || 1) * gearStamMul(); // 心态疲劳时体力消耗 +10%；修复批次 D：战靴机制倍率
      if (B.me.stam < stamCost) { toast('体力不足！拉开距离喘口气'); return; }
      var lowStam = B.me.stam < 30;
      // 出拳速度属性显著影响间隔：速度 10 ≈ ×0.98，20 ≈ ×0.66，30+ ≈ ×0.45（下限）
      var cd = mp.cd * clamp(1.3 - B.me.attrs.speed * 0.032, 0.45, 1.2) * (lowStam ? 1.4 : 1);
      B.man.punchReady[key] = now + cd;
      B.me.stam = Math.max(0, B.me.stam - stamCost);
      var fig = $('figMe');
      fig.classList.add('punching'); fig.classList.add('lined');
      spawnAfterimage(fig); // B2：手动出拳残影
      setTimeout(function () { fig.classList.remove('punching'); fig.classList.remove('lined'); }, 110);
      setMePose(mp.prof, POSE_TIMING.punch); // 手动出拳：按拳种（MPUNCH.prof＝PUNCH 键）切姿势图
      var dist = B.man.fX - B.man.mX;
      if (dist > mp.range) {
        SFX.whiff();
        resetCombo(true); // 打空也断连击
        if (Math.random() < 0.45) blog('第' + B.round + '回合：' + mp.name + '够不着——距离太远了。', 'dim');
        renderBattle();
        return;
      }
      B.me.used[mp.prof] = (B.me.used[mp.prof] || 0) + 1; // P2-8：出拳计数移到射程判定通过之后，超距空挥不涨熟练度
      var foeBrokenNow = B.time < (B.foeBrokenUntil || -1);
      var blockCh = calcBlockChance(B.foe); // P2-7：与自动模式共用同一格挡公式（原手动基数 0.23+周数×0.018 已废除）
      if (B.foeBuff && B.foeBuff.wall > 0) blockCh = 1; // 修复批次 B：对手铁壁期间必抱架（手动模式同口径）
      B.foeBlocking = !foeBrokenNow && Math.random() < blockCh; // 破防期间格挡失效
      if (B.foeBlocking) {
        $('figFoe').classList.add('guarding');
        setTimeout(function () { $('figFoe').classList.remove('guarding'); }, 220);
      }
      var hitChance = calcHitChance(B.me, B.foe, null, B.foe.tactic); // P2-7：与自动模式共用同一命中公式（原手动 −0.03 / 防守反击型 −0.05 已废除）
      if (!B.foeBlocking && Math.random() > hitChance) {
        SFX.whiff();
        resetCombo(true);
        // 你打空 = 对手闪避成功：给对手开反击窗口，防守反击型会立刻逼近准备反击
        openCounterWindow(false, null);
        if (B.foe.style === 'guardcounter') B.man.foePunchT = Math.min(B.man.foePunchT, 0.35);
        if (Math.random() < 0.4) blog('第' + B.round + '回合：我方' + mp.name + '被对手闪开了——对手获得反击窗口！', 'dim');
        B.foeBlocking = false;
        renderBattle();
        return;
      }
      var mult = (mp.coef / PUNCHES[mp.prof].coef) * (lowStam ? 0.75 : 1);
      dealDamage(B.me, B.foe, mp.prof, mult, true, false, mp.name);
      B.foeBlocking = false;
      if (B.phase === 'fight' && B.foe.hp <= 0) { finishBattle(); renderBattle(); }
      else renderBattle();
    }

    function dash(k) {
      if (!B || B.phase !== 'fight' || B.paused || B.meBlocking) return;
      if (B.me.stam < 6) return;
      B.me.stam -= 6;
      B.man.mX = clamp(B.man.mX + (k === 'd' ? 13 : -13), 3, 90);
      if (B.man.mX > B.man.fX - 6) B.man.mX = B.man.fX - 6;
      SFX.whiff();
      var fig = $('figMe');
      fig.style.transition = 'left .16s ease-out';
      setTimeout(function () { fig.style.transition = ''; }, 200);
    }

    function tryDodge(dir) {
      if (!B || B.phase !== 'fight' || B.paused) return;
      var now = performance.now();
      if (now < B.man.dodgeReadyAt || now < B.man.dodgeUntil) return;
      if (B.me.stam < 15) { toast('体力不足，闪避失败！'); return; }
      B.me.stam -= 15;
      B.man.dodgeUntil = now + 300;
      B.man.dodgeReadyAt = now + 1500;
      // Phase 4：记录闪避类别，供反击加成拳种判定（a/w=后闪，s=下闪，d=侧闪）
      B.man.lastDodgeCat = (dir === 'a' || dir === 'w') ? 'back' : dir === 's' ? 'down' : 'side';
      var fig = $('figMe');
      var t = dir === 'a' ? 'translateX(-18px)' : dir === 'd' ? 'translateX(18px)' : dir === 'w' ? 'rotate(-9deg)' : 'translateY(9px) scaleY(.86)';
      fig.style.transform = t;
      setMePose('dodge', POSE_TIMING.dodge); // 主动闪避：下潜闪避姿势图（与位移变换叠加）
      SFX.whiff();
      setTimeout(function () { fig.style.transform = ''; }, 300);
      toast((dir === 'w' || dir === 'a' ? '后闪！' : dir === 's' ? '下闪！' : '侧闪！') + '（反击窗口：' + COUNTER_PREF_TXT[B.man.lastDodgeCat] + ' +40%）');
    }
    function tryDodgeFromHeld() {
      if (!B || B.mode !== 'manual' || B.phase !== 'fight') return;
      if (keysDown.a) tryDodge('a');
      else if (keysDown.d) tryDodge('d');
      else if (keysDown.w) tryDodge('w');
      else if (keysDown.s) tryDodge('s');
    }

    function foePunchManual(dist) {
      var foe = B.foe, me = B.me;
      // Phase 4：对手出拳按风格权重选（力量型爱摆拳/上勾，速度型爱刺拳/直拳）；反击窗口内优先出加成拳种
      var key;
      if (B.time < (B.foeCounterUntil || -1) && COUNTER_PREF[B.foeCounterDir]) key = COUNTER_PREF[B.foeCounterDir];
      else key = pickPunch(foe, false);
      if ((key === 'hook' || key === 'upper') && dist > 13) key = 'straight';
      if (key === 'body' && dist > 16) key = 'jab';
      foe.stam = Math.max(0, foe.stam - PUNCHES[key].stam * styleVal(foe, 'stamMul', 1));
      foe.used[key] = (foe.used[key] || 0) + 1;
      var fig = $('figFoe');
      fig.classList.add('punching'); fig.classList.add('lined');
      spawnAfterimage(fig); // B2：对手手动模式出拳残影
      setTimeout(function () { fig.classList.remove('punching'); fig.classList.remove('lined'); }, 150);
      spawnPunchArc(fig); // 对手强化：出拳瞬间身前刷拳风弧光
      driveFoeRig(key); // G2：手动模式对手出拳纸偶同步
      if (performance.now() < B.man.dodgeUntil) {
        SFX.whiff();
        setMePose('dodge', POSE_TIMING.dodge); // 主动闪避帧内躲开：切闪避姿势
        resetCombo(false); // 对手出拳落空 → 其连击清零
        // Phase 4：闪避成功！按刚才的闪避方向给玩家开 1 秒反击窗口
        openCounterWindow(true, B.man.lastDodgeCat);
        blog('第' + B.round + '回合：漂亮的闪避！对手的' + PUNCHES[key].name + '落空了——反击窗口开启：' + COUNTER_PREF_TXT[B.meCounterDir] + ' +40%，其余拳种 +30%（1 秒内）！', 'good');
        renderBattle();
        return;
      }
      if (!B.meBlocking) {
        var hitChance = calcHitChance(foe, me, foe.tactic, null); // P2-7：与自动模式共用同一命中公式
        if (Math.random() > hitChance) {
          SFX.whiff();
          setMePose('dodge', POSE_TIMING.dodge); // 被闪开同样切闪避姿势
          resetCombo(false);
          // 普通闪开（非主动闪避帧）也算闪避成功，但方向随机
          openCounterWindow(true, null);
          if (Math.random() < 0.35) blog('第' + B.round + '回合：对手的' + PUNCHES[key].name + '被你闪开了——反击窗口开启（1 秒）！', 'good');
          renderBattle();
          return;
        }
      } else {
        // 玩家格挡中：对手有概率改打击腹来破防（防守反击/力量型更爱这么干）
        if (key !== 'body' && Math.random() < (foe.style === 'power' || foe.style === 'guardcounter' ? 0.35 : 0.18)) key = 'body';
      }
      dealDamage(foe, me, key, foe.tactic === 'attack' ? 1.3 : 1, false, false);
      if (B.phase === 'fight' && B.me.hp <= 0) { finishBattle(); renderBattle(); }
      else renderBattle();
    }

    function foeTickManual(dt) {
      var M = B.man, foe = B.foe;
      var dist = M.fX - M.mX;
      var pref = foe.tactic === 'attack' ? 11 : foe.tactic === 'counter' ? 14 : 16;
      if (foe.style === 'power') pref = 11; else if (foe.style === 'speed') pref = 14; else if (foe.style === 'guardcounter') pref = 15;
      var fspd = 22 * dt * (0.7 + foe.attrs.footwork * 0.03) * styleVal(foe, 'moveMul', 1); // 力量型移动慢 / 速度型移动快
      M.foeMoveT -= dt;
      if (M.foeMoveT <= 0) {
        M.foeMoveT = rnd(0.4, 1.0);
        M.foeDir = dist > pref + 2 ? -1 : dist < pref - 2 ? 1 : (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1));
      }
      M.fX = clamp(M.fX + M.foeDir * fspd, 10, 93);
      if (M.fX < M.mX + 6) M.fX = M.mX + 6;
      if (Math.random() < 0.03) M.fY = clamp(M.fY + rnd(-6, 6), -10, 10);
      foe.stam = Math.min(100, foe.stam + 3.5 * dt);
      M.foePunchT -= dt * ((B.foeBuff && B.foeBuff.wall > 0) ? 0.40 : 1); // 修复批次 B 三调：对手铁壁抱架期间出拳间隔同样放慢（与自动模式 freq 对称）；批次 G3-b 迭代2 同步 ×0.55→×0.40
      if (M.foePunchT <= 0) {
        var w = weekOf(S.day);
        M.foePunchT = Math.max(0.33, (rnd(0.55, 1.0) - w * 0.03) * 0.87) * (foe.tactic === 'counter' ? 1.5 : 1) / styleVal(foe, 'freqMul', 1) * (foe.practice ? (B.round === 1 ? 2.2 : 1.6) : 1); // 修复批次 A：手动模式陪练同样少进攻（出拳间隔拉长）
        if (B.time < (B.foeCounterUntil || -1)) M.foePunchT = Math.min(M.foePunchT, 0.45); // 有反击窗口时抢着出拳
        if (dist <= 19 && foe.stam >= 6 && !cmdHoldOn()) foePunchManual(dist); // 修复批次 B：缠抱停战中对手也不出拳
      }
    }

    function manualTick() {
      if (!B || B.mode !== 'manual' || B.phase === 'over' || B.paused) return;
      if (B.freezeUntil && performance.now() < B.freezeUntil) return; // 顿帧中
      var dt = 0.05;
      if (B.phase === 'break') {
        B.breakLeft -= dt;
        decayTrauma(dt);
        var bc2 = $('breakCount'); if (bc2) bc2.textContent = String(Math.max(0, Math.ceil(B.breakLeft)));
        $('roundTimer').textContent = '休息中 · ' + Math.max(0, B.breakLeft).toFixed(0) + ' 秒后继续';
        renderBattle();
        if (B.breakLeft <= 0) endBreak();
        return;
      }
      if (B.phase === 'down') { B.time += dt; decayTrauma(dt); tickDown(dt); renderBattle(); return; } // 击倒读秒：可看不能操作
      B.time += dt;
      decayTrauma(dt);
      B.timeLeft -= dt;
      // 修复批次 B：手动模式同样推进双方指令 CD/buff 并跑对手指令 AI（此前手动下 CD 永不递减、对手不用指令）
      ['combo', 'wall', 'clinch'].forEach(function (k) {
        if (B.cd[k] > 0) B.cd[k] = Math.max(0, B.cd[k] - dt);
        if (B.foeCd[k] > 0) B.foeCd[k] = Math.max(0, B.foeCd[k] - dt);
      });
      if (B.buff.combo > 0) B.buff.combo = Math.max(0, B.buff.combo - dt);
      if (B.buff.wall > 0) B.buff.wall = Math.max(0, B.buff.wall - dt);
      if (B.foeBuff.combo > 0) B.foeBuff.combo = Math.max(0, B.foeBuff.combo - dt);
      if (B.foeBuff.wall > 0) B.foeBuff.wall = Math.max(0, B.foeBuff.wall - dt);
      foeCommandAI();
      var M = B.man, me = B.me;
      var meBrokenNow = B.time < (B.meBrokenUntil || -1);
      B.meBlocking = !!(keysDown.space || touchBlock) && !meBrokenNow; // 破防期间抱架失效
      $('figMe').classList.toggle('guarding', B.meBlocking);
      // 姿势帧：格挡状态变化时同步姿势（按住格挡＝格挡图定格，松开＝回抱架），与护盾弧视觉一致
      if (B.meBlocking !== !!B._wasBlocking) { B._wasBlocking = B.meBlocking; setMePose(B.meBlocking ? 'block' : 'guard', 0); }
      var moving = false;
      if (!B.meBlocking) {
        var ed2 = effDir();
        var spd = 26 * dt * (0.7 + me.attrs.footwork * 0.03);
        if (ed2.a) { M.mX -= spd; moving = true; }
        if (ed2.d) { M.mX += spd; moving = true; }
        if (ed2.w) { M.mY = Math.max(-13, M.mY - 34 * dt); moving = true; }
        if (ed2.s) { M.mY = Math.min(13, M.mY + 34 * dt); moving = true; }
      }
      M.mX = clamp(M.mX, 3, 90);
      if (M.mX > M.fX - 6) M.mX = M.fX - 6;
      if (!B.meBlocking) me.stam = Math.min(100, me.stam + (moving ? 3.5 : 7) * dt);
      foeTickManual(dt);
      if (!B || B.phase === 'over' || B.phase === 'down') { if (B) renderBattle(); return; } // 读秒由下一帧的 down 分支接管
      $('figMe').style.left = M.mX + '%';
      $('figFoe').style.left = M.fX + '%';
      $('figMe').querySelector('.fig').style.top = M.mY + 'px';
      $('figFoe').querySelector('.fig').style.top = M.fY + 'px';
      var dist = M.fX - M.mX;
      var ds = dist > 20 ? '超远' : dist > 16 ? '远' : dist > 13 ? '中' : '近';
      if (ds !== M.lastDist) {
        M.lastDist = ds;
        // P2-10：超远距离（>20）时刺拳/直拳也够不着，文案要说清
        $('distBar').textContent = '距离：' + ds + (ds === '超远' ? ' · 太远了，刺拳/直拳也够不着，先靠近！' : ds === '远' ? ' · 只有刺拳/直拳够得着' : ds === '中' ? ' · 摆拳/击腹/上勾都可达' : ' · 全部拳种可达，贴身缠斗');
      }
      $('meTacticName').textContent = B.meBlocking ? '格挡中' : '手动操作';
      $('manualStatus').textContent = cmdHoldOn() ? '缠抱中：双方停手回气（搂抱停战，分开后继续）' :
        meBrokenNow ? '破防中！格挡失效（对手直拳 +20%）' :
        (B.time < (B.meCounterUntil || -1) ? '反击窗口！' + COUNTER_PREF_TXT[B.meCounterDir] + ' +40% / 其余拳种 +30%' :
        B.meBlocking ? '格挡抱架（减伤 70%）· 小心击腹破防' : (performance.now() < M.dodgeUntil ? '闪避中（无敌帧）' : (me.stam < 30 ? '体力吃紧：出拳变慢、伤害降低' : (B.comboMe >= 2 ? B.comboMe + ' 连击中（伤害 +' + comboBonusPct(B.comboMe) + '%）' : '正常'))));
      if (B.phase === 'fight' && (me.hp <= 0 || B.foe.hp <= 0)) { finishBattle(); renderBattle(); return; }
      if (B.timeLeft <= 0) {
        if (B.round >= ROUNDS) finishBattle();
        else startBreak();
      }
      renderBattle();
    }

    /* 键盘监听（手动模式） */
    document.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === 'h' && B && B.mode === 'manual' && B.phase !== 'over') {
        if ($('keysModal').classList.contains('open')) { $('keysModal').classList.remove('open'); B.paused = false; }
        else { keysCtx = 'view'; $('btnKeysMain').textContent = '继续战斗'; prepKeysModal(); $('keysModal').classList.add('open'); B.paused = true; }
        return;
      }
      if (!B || B.mode !== 'manual') return;
      if (k === ' ' || k === 'shift') e.preventDefault();
      if (k === ' ') { keysDown.space = true; return; }
      if (k === 'shift') { keysDown.shift = true; if (!e.repeat) tryDodgeFromHeld(); return; }
      keysDown[k] = true;
      if (e.repeat || B.phase !== 'fight' || B.paused) return;
      if (keysDown.shift && (k === 'a' || k === 'd' || k === 'w' || k === 's')) { tryDodge(k); return; }
      if (k === 'a' || k === 'd') {
        var now = performance.now();
        if (now - lastTap[k] < 280) { dash(k); lastTap[k] = 0; } else lastTap[k] = now;
      }
      if (k === 'c') { useClinch(); return; } // 修复批次 B（m3）：手动模式搂抱（键盘 C）
      if (k === 'j') playerPunch('j');
      else if (k === 'k') playerPunch('k');
      else if (k === 'u') playerPunchDirect('upperR'); // U：直接上勾拳
      else if (k === 'b') playerPunchDirect('bodyR');  // B：直接击腹拳
    });
    document.addEventListener('keyup', function (e) {
      var k = e.key.toLowerCase();
      if (k === ' ') keysDown.space = false;
      else if (k === 'shift') keysDown.shift = false;
      else keysDown[k] = false;
    });

    /* ================= 触屏控制：虚拟摇杆 + 按钮 ================= */
    function resetJoy() {
      joy.dx = 0; joy.dy = 0; joy.curDir = '';
      // 注意：不清除 latchX/latchY/latchAt —— 方向锁定要留给紧接着的出拳使用
      var knob = $('joyKnob');
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    }
    function joyUpdate(e) {
      var base = $('joyBase'); if (!base) return;
      var r = base.getBoundingClientRect();
      var max = r.width / 2 - 4;
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      $('joyKnob').style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      var nx = dx / max, ny = dy / max;
      if (Math.sqrt(nx * nx + ny * ny) < 0.15) { nx = 0; ny = 0; } // 死区（缩小，避免方向难触发）
      joy.dx = nx; joy.dy = ny;
      // 方向锁定：推杆超过阈值时持续刷新锁定方向，出拳瞬间摇杆回中也能读到
      if (Math.abs(nx) >= 0.30 || Math.abs(ny) >= 0.30) {
        joy.latchX = nx; joy.latchY = ny; joy.latchAt = performance.now();
      }
      var dir = '';
      if (Math.abs(nx) >= Math.abs(ny)) dir = nx > 0.55 ? 'd' : nx < -0.55 ? 'a' : '';
      else dir = ny > 0.55 ? 's' : ny < -0.55 ? 'w' : '';
      if (dir && dir !== joy.curDir) {
        // 快速双推同一水平方向 = 垫步
        var now = performance.now();
        if ((dir === 'a' || dir === 'd') && dir === joy.lastDir && now - joy.lastFlickAt < 320) dash(dir);
        joy.lastDir = dir; joy.lastFlickAt = now;
      }
      joy.curDir = dir;
    }
    (function bindTouchControls() {
      var base = $('joyBase');
      if (!base) return;
      var joyId = null;
      base.addEventListener('pointerdown', function (e) {
        e.preventDefault(); audio();
        joyId = e.pointerId;
        try { base.setPointerCapture(e.pointerId); } catch (err) {}
        joyUpdate(e);
      });
      base.addEventListener('pointermove', function (e) { if (e.pointerId === joyId) joyUpdate(e); });
      function joyEnd(e) { if (e.pointerId === joyId) { joyId = null; resetJoy(); } }
      base.addEventListener('pointerup', joyEnd);
      base.addEventListener('pointercancel', joyEnd);
      function tap(id, fn) {
        var el = $(id); if (!el) return;
        el.addEventListener('pointerdown', function (e) { e.preventDefault(); audio(); fn(); });
      }
      tap('btnPunchJ', function () { playerPunch('j'); });
      tap('btnPunchK', function () { playerPunch('k'); });
      tap('btnHookT', function () { playerPunchDirect('hookR'); });   // 专用按钮：直接摆拳
      tap('btnUpperT', function () { playerPunchDirect('upperR'); }); // 专用按钮：直接上勾拳
      tap('btnBodyT', function () { playerPunchDirect('bodyR'); });   // 专用按钮：直接击腹拳
      tap('btnDodgeT', function () {
        var dir = punchDir(); // 与出拳共用方向判定（含锁定）
        tryDodge(dir || 'a'); // 无方向输入时默认后闪
      });
      tap('btnDashT', function () { dash(joy.dx < -0.2 ? 'a' : 'd'); });
      tap('btnClinchT', function () { useClinch(); }); // 修复批次 B（m3）：手动模式搂抱入口（触屏）
      var blk = $('btnBlockT');
      if (blk) {
        blk.addEventListener('pointerdown', function (e) {
          e.preventDefault(); audio();
          try { blk.setPointerCapture(e.pointerId); } catch (err) {} // 捕获指针：手指微滑出按钮也不会丢格挡
          touchBlock = true;
          blk.classList.add('held');
          if (B && B.mode === 'manual') { B.meBlocking = true; $('figMe').classList.add('guarding'); } // 立即反馈，不等下一帧
        });
        function blkEnd() {
          touchBlock = false;
          blk.classList.remove('held');
          if (B && B.mode === 'manual' && !keysDown.space) { B.meBlocking = false; $('figMe').classList.remove('guarding'); }
        }
        blk.addEventListener('pointerup', blkEnd);
        blk.addEventListener('pointercancel', blkEnd);
        blk.addEventListener('lostpointercapture', blkEnd);
        // 不再用 pointerleave 结束格挡：按住时手指稍滑出圆形按钮就会误触，是格挡失效的主因
      }
    })();


    function renderBattle() {
      if (!B) return;
      $('roundLabel').textContent = B.phase === 'break' ? '休息时间' : 'ROUND ' + B.round;
      if (B.phase === 'fight') $('roundTimer').textContent = Math.max(0, B.timeLeft).toFixed(1) + ' 秒';
      function pct(v, m) { return clamp(v / m * 100, 0, 100) + '%'; }
      $('meHpBar').style.width = pct(B.me.hp, B.me.hpMax);
      $('meHpNum').textContent = Math.ceil(B.me.hp) + ' / ' + B.me.hpMax;
      $('meStamBar').style.width = B.me.stam + '%';
      $('meStamNum').textContent = Math.round(B.me.stam);
      $('meHits').textContent = B.me.hits; $('meDmg').textContent = B.me.dmg;
      $('foeHpBar').style.width = pct(B.foe.hp, B.foe.hpMax);
      $('foeHpNum').textContent = Math.ceil(B.foe.hp) + ' / ' + B.foe.hpMax;
      $('foeStamBar').style.width = B.foe.stam + '%';
      $('foeStamNum').textContent = Math.round(B.foe.stam);
      $('foeHits').textContent = B.foe.hits; $('foeDmg').textContent = B.foe.dmg;
      var mkb = $('meKoBar'); if (mkb) { var mt = Math.round(B.meTrauma || 0); mkb.style.width = mt + '%'; $('meKoNum').textContent = mt + ' / 100'; $('meKoWrap').classList.toggle('hot', mt >= 70); }
      var fkb = $('foeKoBar'); if (fkb) { var ft = Math.round(B.foeTrauma || 0); fkb.style.width = ft + '%'; $('foeKoNum').textContent = ft + ' / 100'; $('foeKoWrap').classList.toggle('hot', ft >= 70); }
      var dpill = $('deathPill'); if (dpill) { dpill.style.display = (B.meDeathFight || B.foeDeathFight) ? '' : 'none'; dpill.textContent = B.meDeathFight ? '你死战中：伤害 +10% · 再倒一次判负 · 赛后伤病 +10' : '对手死战中：伤害 +10% · 再倒一次判负'; }
      if (B.mode === 'manual' && $('meTacticName')) {
        // P2-9：格挡状态提示不能被回合战术名覆盖——格挡中优先显示格挡，并与战术名并存
        if (B.meRoundMod && B.meRoundMod !== 'balanced') $('meTacticName').textContent = (B.meBlocking ? '格挡中 · ' : '手动 · ') + '本回合' + BREAK_TACTICS[B.meRoundMod].name;
        else if (B.meBlocking) $('meTacticName').textContent = '格挡中';
      }
      $('foeTacticName').textContent = TACTICS[B.foe.tactic].name + (B.foe.style ? ' · ' + FOE_STYLES[B.foe.style].name : '') +
        (B.foeBuff && B.foeBuff.combo > 0 ? ' · 组合拳爆发中！' : '') + (B.foeBuff && B.foeBuff.wall > 0 ? ' · 铁壁中' : ''); // 修复批次 B：对手指令状态在状态行可见
      // Phase 4：状态条（连击 / 反击窗口 / 破防 / 本回合击倒数）
      var cp = $('comboPill');
      if (cp) {
        var cm = B.comboMe || 0, cf = B.comboFoe || 0;
        if (cm >= 1) { cp.textContent = '你的连击 ×' + cm + (cm >= 2 ? '（伤害 +' + comboBonusPct(cm) + '%）' : '（再命中 1 拳起 +5%）'); cp.className = 'fs-pill' + (cm >= 2 ? ' combo-on' : ''); }
        else if (cf >= 1) { cp.textContent = '对手连击 ×' + cf + (cf >= 2 ? '（伤害 +' + comboBonusPct(cf) + '%，打中他或格挡他的拳可打断）' : ''); cp.className = 'fs-pill' + (cf >= 2 ? ' combo-on' : ''); }
        else { cp.textContent = '连击 ×0（连续命中攒连击，2 连起伤害递增）'; cp.className = 'fs-pill'; }
        var ctp = $('counterPill');
        var myCtr = B.time < (B.meCounterUntil || -1), foeCtr = B.time < (B.foeCounterUntil || -1);
        if (myCtr) { ctp.style.display = ''; ctp.className = 'fs-pill counter-on'; ctp.textContent = '反击窗口！' + COUNTER_PREF_TXT[B.meCounterDir] + ' +40% · 其余 +30%'; }
        else if (foeCtr) { ctp.style.display = ''; ctp.className = 'fs-pill counter-on'; ctp.textContent = '对手反击窗口中，小心！'; }
        else ctp.style.display = 'none';
        var bp = $('brokenPill');
        var foeBrk = B.time < (B.foeBrokenUntil || -1), meBrk = B.time < (B.meBrokenUntil || -1);
        if (foeBrk) { bp.style.display = ''; bp.className = 'fs-pill broken-on'; bp.textContent = '对手破防中（剩 ' + (B.foeBrokenUntil - B.time).toFixed(1) + ' 秒）：格挡失效 · 直拳 +20%'; }
        else if (meBrk) { bp.style.display = ''; bp.className = 'fs-pill broken-on'; bp.textContent = '你被破防了（剩 ' + (B.meBrokenUntil - B.time).toFixed(1) + ' 秒）：格挡失效！'; }
        else bp.style.display = 'none';
        $('downPill').textContent = '本回合击倒 你 ' + (B.meDownsRound || 0) + ' · 对手 ' + (B.foeDownsRound || 0) + '（3 次触发 TKO 判定）';
      }
      // 指令按钮冷却显示
      cmdState('cmdCombo', B.cd.combo, (B.cdMax && B.cdMax.combo) || 45, B.buff.combo > 0 ? '生效中 ' + Math.ceil(B.buff.combo) + 's' : '');
      cmdState('cmdWall', B.cd.wall, (B.cdMax && B.cdMax.wall) || 60, B.buff.wall > 0 ? '生效中 ' + Math.ceil(B.buff.wall) + 's' : '');
      cmdState('cmdClinch', B.cd.clinch, (B.cdMax && B.cdMax.clinch) || 30, '');
      cmdState('btnManualClinch', B.cd.clinch, (B.cdMax && B.cdMax.clinch) || 30, cmdHoldOn() ? '缠抱中' : ''); // 修复批次 B（m3）：手动面板搂抱按钮与自动面板共用同一 CD
      renderStatePlates(); // G10：选手牌状态词牌（呈现映射，随每帧渲染同步）
    }
    function cmdState(id, cd, max, extra) {
      var btn = $(id);
      var lbl = btn.querySelector('[data-cd]');
      var bar = btn.querySelector('.cdbar');
      if (extra) { lbl.textContent = extra; btn.disabled = true; bar.style.width = '100%'; return; }
      if (cd > 0) { lbl.textContent = '冷却 ' + Math.ceil(cd) + 's'; btn.disabled = true; bar.style.width = (cd / max * 100) + '%'; }
      else { lbl.textContent = '就绪'; btn.disabled = !B || B.phase !== 'fight'; bar.style.width = '0%'; }
    }

    /* 指令（修复批次 B · M2 重构：玩家与对手 AI 共用同一套指令——同 CD、同效果、同判罚；
       缠抱停战中双方都不能下指令。指令用量记入 B.cmdUse 遥测，供实验室 A/B 采样。） */
    function cmdHoldOn() { return B && B.time < (B.holdUntil || -1); }
    var CMD_FATIGUE = 1.5; // 批次 G3-b：指令疲劳系数 0.5→1.0（迭代1）→1.5（迭代2）——冷却 = 基础×(1+系数×已用次数)；spam 在 1.2~1.5 回合的短局里开局即叠满三指令、smart 的择时优势等不到窗口。迭代1（1.0）实测合并 n=200 仍有 3/4 组 spam 领先 +5~+10pp：CD 单位是 tick（冷却值以 dt=0.5 递减，45 冷却=90 tick），×2 仍够 spam 在两回合局里各用两次；1.5 让第二次冷却 ×2.5，smart 以单次择时为主、受影响小。双方同规则
    // 批次 G3-b 迭代4：组合拳/搂抱基础冷却 45→60 / 30→55（双方同规则，护腕 meCdMul 照旧先行缩放我方）——迭代3 后 power×attack 组 spam−smart 仍 +11pp，用量差集中在组合（184 vs 98）与搂抱（199 vs 166）：搂抱对强攻人格是反复清零连击积累的釜底抽薪、且原 CD 最短，拉长两者的基础冷却直接削 spam 的单位时间指令密度，smart 的择时单发基本不吃。
    function useCombo() {
      if (!B || B.phase !== 'fight' || B.cd.combo > 0 || cmdHoldOn()) return;
      B.buff.combo = 10;
      B.cdMax.combo = Math.round(60 * (B.meCdMul || 1) * (1 + CMD_FATIGUE * (B.cmdUse ? B.cmdUse.me.combo : 0))); B.cd.combo = B.cdMax.combo; // 指令疲劳：喊得越多、冷却越久；修复批次 D：护腕机制先缩短基础冷却
      if (B.cmdUse) B.cmdUse.me.combo++;
      blog('指令：组合拳爆发！接下来 10 秒火力全开，期间连击被格挡也不清零。', 'good');
      renderBattle();
    }
    function useWall() {
      if (!B || B.phase !== 'fight' || B.cd.wall > 0 || cmdHoldOn()) return;
      B.buff.wall = 10;
      B.cdMax.wall = Math.round(60 * (B.meCdMul || 1) * (1 + CMD_FATIGUE * (B.cmdUse ? B.cmdUse.me.wall : 0))); B.cd.wall = B.cdMax.wall; // 修复批次 D：护腕机制先缩短基础冷却
      if (B.cmdUse) B.cmdUse.me.wall++;
      blog('指令：铁壁防守！10 秒内大幅减伤，且重创值不积累。', 'good');
      renderBattle();
    }
    function useClinch() {
      if (!B || B.phase !== 'fight' || B.cd.clinch > 0 || cmdHoldOn()) return;
      doClinch(true);
      renderBattle();
    }
    /* 搂抱执行体（双方共用）：使用者体力 +20、对手 +8（被迫停顿同样回了口气），双方连击同时清零
       ——打断对手连击是它的核心价值，抱错时机（自己连击正盛/给对手重创衰减窗口）同样会反噬；
       随后 1.2 秒缠抱停战：双方都不能出拳（tick/manualTick 按 holdUntil 停手），重创照常衰减。
       裁判判罚沿用 P2-12：同场第 4 次起每次扣使用者 10 点体力，双方同规则。 */
    function doClinch(isMe) {
      var user = isMe ? B.me : B.foe;
      var other = isMe ? B.foe : B.me;
      var warn;
      if (isMe) { B.cdMax.clinch = Math.round(55 * (B.meCdMul || 1) * (1 + CMD_FATIGUE * (B.cmdUse ? B.cmdUse.me.clinch : 0))); B.cd.clinch = B.cdMax.clinch; B.clinchWarn += 1; warn = B.clinchWarn; if (B.cmdUse) B.cmdUse.me.clinch++; } // 修复批次 D：护腕机制同样作用于搂抱冷却（对手侧不吃装备）
      else { B.foeCd.clinch = Math.round(55 * (1 + CMD_FATIGUE * (B.cmdUse ? B.cmdUse.foe.clinch : 0))); B.foeClinchWarn = (B.foeClinchWarn || 0) + 1; warn = B.foeClinchWarn; if (B.cmdUse) B.cmdUse.foe.clinch++; }
      // 修复批次 B 三调：回体力按需求缩放——体力 <50 回满 20，体力还多时只回 8（抱这一口主要是停战，不是充电）；乱抱喂对手 +8 反成净亏
      var stamGain = user.stam < 35 ? 12 : user.stam < 60 ? 6 : 3; // 批次 G3-b：回体按需求缩放收紧（旧 <50 回 20/否则 8；迭代1 改 16/8/4 后 spam 合并仍占优，迭代2 再收一档为 12/6/3）——spam 每场搂抱 2~2.8 次远超 smart，属代价组不改停战/清连击本体
      user.stam = Math.min(100, user.stam + stamGain);
      other.stam = Math.min(100, other.stam + 8);
      B.comboMe = 0; B.comboFoe = 0;
      B.holdUntil = B.time + 1.2;
      var brokeCombo = isMe ? '对手' : '你';
      if (warn >= 4) {
        user.stam = Math.max(0, user.stam - 10);
        if (isMe) {
          blog('指令：搂抱拖时间，体力回复 ' + stamGain + '（对手 +8），双方连击清零、缠抱停战。裁判判罚：本场第 ' + warn + ' 次搂抱，消极比赛——扣 10 点体力！', 'bad');
          toast('裁判判罚：搂抱过多，扣 10 点体力');
        } else {
          blog('对手搂抱拖时间，体力回复 ' + stamGain + '（你 +8），双方连击清零、缠抱停战。裁判判罚：对手本场第 ' + warn + ' 次搂抱——扣对手 10 点体力！', 'good');
        }
      } else if (isMe) {
        blog('指令：搂抱拖时间，体力回复 ' + stamGain + '（对手 +8），双方连击清零、缠抱停战。' + (warn === 3 ? '裁判口头警告：再抱下去要判罚扣体力了！' : ''), 'good');
      } else {
        blog('对手搂抱！贴身缠抱停战——对手体力回复 ' + stamGain + '（你 +8），双方连击清零（' + brokeCombo + '的连击被打断了）。' + (warn === 3 ? '裁判口头警告对手：再抱要判罚了。' : ''), 'bad');
      }
    }
    /* 对手指令（与玩家同 CD/同效果，触发由 foeCommandAI 按人格评估） */
    function foeUseCombo() {
      if (!B || B.phase !== 'fight' || B.foeCd.combo > 0 || cmdHoldOn()) return false;
      B.foeBuff.combo = 10; B.foeCd.combo = Math.round(60 * (1 + CMD_FATIGUE * (B.cmdUse ? B.cmdUse.foe.combo : 0)));
      if (B.cmdUse) B.cmdUse.foe.combo++;
      blog('对手指令：组合拳爆发！对手接下来 10 秒火力全开（连击被格挡也不清零），小心！', 'bad');
      renderBattle();
      return true;
    }
    function foeUseWall() {
      if (!B || B.phase !== 'fight' || B.foeCd.wall > 0 || cmdHoldOn()) return false;
      B.foeBuff.wall = 10; B.foeCd.wall = Math.round(60 * (1 + CMD_FATIGUE * (B.cmdUse ? B.cmdUse.foe.wall : 0)));
      if (B.cmdUse) B.cmdUse.foe.wall++;
      blog('对手指令：铁壁防守！对手 10 秒内大幅减伤，且重创值不积累。', 'bad');
      renderBattle();
      return true;
    }
    function foeUseClinch() {
      if (!B || B.phase !== 'fight' || B.foeCd.clinch > 0 || cmdHoldOn()) return false;
      doClinch(false);
      renderBattle();
      return true;
    }
    /* 对手指令 AI（修复批次 B · M2）：按人格偏好在真实时机下指令，每 tick 至多一条、优先级 铁壁＞搂抱＞组合拳。
       陪练不用指令（教学行为纯净）；缠抱停战中不用；开局 1 秒内不用（先让双方碰上）。 */
    function foeCommandAI() {
      if (!B || B.phase !== 'fight' || B.practice || !B.foe.persona) return;
      if (B.time < 1 || cmdHoldOn()) return;
      var p = B.foe.persona, foe = B.foe, me = B.me;
      /* 批次 B 二调：初版触发线太贪（铁壁 60 重创就开、组合拳开局 1 秒即爆），实验室里对手指令
         把玩家胜率全表压低 20~47pp——收紧到「真窗口才用」，与玩家 smart 策略同一量级。 */
      // 铁壁：残血（人格血线，第 2 回合起）或重创逼近 KO 时按住重创时钟（R1 只留给重创急救：开局被打崩不许靠铁壁把 R1 击杀窗口整段吞掉）
      if (B.foeCd.wall <= 0 && ((B.round >= 2 && foe.hp < foe.hpMax * p.wallHp) || (B.foeTrauma || 0) >= 72)) { foeUseWall(); return; }
      // 搂抱：体力见底 / 玩家连击正盛且自己体力也不满（断连击）/ 重创过高拖衰减——且人格愿意抱
      if (p.clinchFan && B.foeCd.clinch <= 0 && (foe.stam < 22 || ((B.comboMe || 0) >= 4 && foe.stam < 65) || ((B.foeTrauma || 0) >= 78 && B.round >= 2))) { foeUseClinch(); return; }
      // 组合拳：press 压迫（开局先碰几拳再爆）/ burst 抓窗口（自己连击 ≥3 或玩家重创 ≥60）/ closer 末回合或点数领先时收官
      if (B.foeCd.combo <= 0) {
        var ptsLead = pointsOf(foe, 0) > pointsOf(me, 0);
        if ((p.comboWhen === 'press' && foe.stam > 70 && B.time > 8) ||
            (p.comboWhen === 'burst' && ((B.comboFoe || 0) >= 3 || (B.meTrauma || 0) >= 60)) ||
            (p.comboWhen === 'closer' && (B.round >= 3 || (B.round >= 2 && ptsLead)))) foeUseCombo();
      }
    }
