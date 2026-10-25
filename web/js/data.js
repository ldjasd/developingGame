'use strict';
/* data.js · 纯数据定义 —— 由单文件版 index.html 逐字拆分（拆分映射见 README.md），逻辑/数值/文案未改。 */
    /* ================= 常量 ================= */
    var LEVELS = ['F','E','D','C','B','A','S'];
    var PUNCHES = {
      jab:      { name: '刺拳',   coef: 0.6, stam: 2 },
      straight: { name: '直拳',   coef: 1.2, stam: 4 },
      hook:     { name: '摆拳',   coef: 1.4, stam: 6 },
      upper:    { name: '上勾拳', coef: 1.3, stam: 6 },
      body:     { name: '击腹拳', coef: 0.8, stam: 4 }
    };
    var PUNCH_KEYS = Object.keys(PUNCHES);
    var ATTRS = [
      { key: 'power',     name: '力量' },
      { key: 'endurance', name: '耐久' },
      { key: 'will',      name: '意志' },
      { key: 'speed',     name: '出拳速度' },
      { key: 'accuracy',  name: '精准度' },
      { key: 'footwork',  name: '步伐速度' },
      { key: 'defense',   name: '防守技术' },
      { key: 'technique', name: '技术' }
    ];

    /* 训练项目（13 种）：pts = 训练计划点数（重 3 / 中 2 / 轻 1），stam = 体力消耗 */
    var TRAININGS = [
      { id: 'spar',  name: '实战陪练', pts: 3, desc: '意志 +1 · 全部拳种经验 +5 · 10% 概率轻伤', stam: 15,
        apply: function (s) { s.attrs.will += 1; PUNCH_KEYS.forEach(function (k) { addPunchExp(s, k, 5); });
          if (Math.random() < 0.10) { s.injury = Math.min(100, s.injury + 10); return '陪练中挨了一记重拳，意志 +1，全拳种经验 +5——但眉角肿了，伤病 +10。'; }
          return '和陪练真刀真枪打了几回合，意志 +1，全部拳种经验 +5。'; } },
      { id: 'strength', name: '力量训练', pts: 3, desc: '力量 +3', stam: 12,
        apply: function (s) { s.attrs.power += 3; return '杠铃卧推加深蹲，力量 +3，胳膊都在抖。'; } },
      { id: 'bag',   name: '重沙袋',   pts: 3, desc: '力量 +2 · 直拳/摆拳经验 +10', stam: 10,
        apply: function (s) { s.attrs.power += 2; addPunchExp(s, 'straight', 10); addPunchExp(s, 'hook', 10); return '抡起重拳砸向沙袋，力量 +2，直拳与摆拳更熟练了。'; } },
      { id: 'pads',  name: '手靶训练', pts: 2, desc: '精准度 +2 · 技术 +1 · 刺拳经验 +10', stam: 8,
        apply: function (s) { s.attrs.accuracy += 2; s.attrs.technique += 1; addPunchExp(s, 'jab', 10); return '跟着教练的手靶啪啪作响，精准度 +2，技术 +1，刺拳更顺手了。'; } },
      { id: 'upper', name: '上勾拳特训', pts: 2, desc: '上勾拳经验 +10 · 力量 +1', stam: 8,
        apply: function (s) { s.attrs.power += 1; addPunchExp(s, 'upper', 10); return '对着上勾靶反复钻拳，从腿到腰一气呵成，力量 +1，上勾拳更熟练了。'; } },
      { id: 'body',  name: '击腹拳特训', pts: 2, desc: '击腹拳经验 +10 · 精准度 +1', stam: 8,
        apply: function (s) { s.attrs.accuracy += 1; addPunchExp(s, 'body', 10); return '专打沙袋的腹部标记点，找准肋下空当，精准度 +1，击腹拳更熟练了。'; } },
      { id: 'rope',  name: '跳绳',     pts: 2, desc: '步伐速度 +2 · 耐久 +1', stam: 8,
        apply: function (s) { s.attrs.footwork += 2; s.attrs.endurance += 1; return '绳子甩得呼呼响，步伐速度 +2，耐久 +1。'; } },
      { id: 'run',   name: '长跑',     pts: 2, desc: '耐久 +2', stam: 10,
        apply: function (s) { s.attrs.endurance += 2; return '沿着河岸跑了十公里，耐久 +2。'; } },
      { id: 'speedball', name: '速度球', pts: 2, desc: '出拳速度 +2 · 精准度 +1', stam: 6,
        apply: function (s) { s.attrs.speed += 2; s.attrs.accuracy += 1; return '对着速度球连珠炮出拳，出拳速度 +2，精准度 +1。'; } },
      { id: 'dodgeball', name: '闪躲球', pts: 2, desc: '防守技术 +2 · 步伐速度 +1', stam: 8,
        apply: function (s) { s.attrs.defense += 2; s.attrs.footwork += 1; return '躲教练扔来的软球，防守技术 +2，步伐速度 +1。'; } },
      { id: 'shadow', name: '空击训练', pts: 1, desc: '技术 +1 · 精准度 +1', stam: 6,
        apply: function (s) { s.attrs.technique += 1; s.attrs.accuracy += 1; return '对着镜子反复打空击，技术 +1，精准度 +1。'; } },
      { id: 'video', name: '录像研究', pts: 1, desc: '技术 +1 · 精准度 +1 · 比赛前一天用可侦察对手弱点', stam: 3,
        apply: function (s) { s.attrs.technique += 1; s.attrs.accuracy += 1;
          if ((s.day + 1) % 7 === 0) { s.scoutedForDay = s.day + 1; return '把明天对手的录像翻来覆去看，技术 +1，精准度 +1——弱点记下了！下场比赛用对应拳种打他伤害 +30%。'; }
          return '复盘比赛录像，技术 +1，精准度 +1。（比赛前一天研究，能侦察出对手弱点）'; } },
      { id: 'meditation', name: '冥想调整', pts: 1, desc: '意志 +1 · 心态 +10', stam: 2, mind: 10,
        apply: function (s) { s.attrs.will += 1; return '闭眼冥想调整呼吸，意志 +1，心态 +10。'; } }
    ];

    /* 装备（体育用品店）：slot 部位限装备一件，bonus 为属性加成（护齿为减伤，bonus 为空） */
    var SLOT_NAMES = { gloves: '拳套', guard: '护齿', boots: '战靴', head: '护头', robe: '战袍', wrist: '护腕' };
    var SHOP_GEAR = [
      { id: 'gloves1', slot: 'gloves', name: '新手拳套', price: 500,  desc: '力量 +1', bonus: { power: 1 } },
      { id: 'gloves2', slot: 'gloves', name: '标准拳套', price: 1500, desc: '力量 +2 · 精准度 +1', bonus: { power: 2, accuracy: 1 } },
      { id: 'gloves3', slot: 'gloves', name: '专业拳套', price: 4000, desc: '力量 +3 · 精准度 +1 · 出拳速度 +1', bonus: { power: 3, accuracy: 1, speed: 1 } },
      { id: 'guard1',  slot: 'guard',  name: '基础护齿', price: 800,  desc: '比赛中受到的伤害 −5%', bonus: {}, dr: 5 },
      { id: 'boots1',  slot: 'boots',  name: '轻便战靴', price: 1200, desc: '步伐速度 +1', bonus: { footwork: 1 } },
      { id: 'gloves4', slot: 'gloves', name: '疾风拳套', price: 1800, desc: '出拳速度 +3 · 力量 +1（速度型）', bonus: { speed: 3, power: 1 } },
      { id: 'gloves6', slot: 'gloves', name: '影月拳套', price: 2600, desc: '精准度 +2 · 技术 +1（技巧型）', bonus: { accuracy: 2, technique: 1 } },
      { id: 'gloves5', slot: 'gloves', name: '重炮拳套', price: 3200, desc: '力量 +4 · 出拳速度 −1（重炮型）', bonus: { power: 4, speed: -1 } },
      { id: 'head1',   slot: 'head',   name: '基础护头', price: 900,  desc: '防守技术 +1', bonus: { defense: 1 } },
      { id: 'head2',   slot: 'head',   name: '职业护头', price: 2200, desc: '防守技术 +2 · 意志 +1', bonus: { defense: 2, will: 1 } },
      { id: 'robe1',   slot: 'robe',   name: '登场战袍', price: 1500, desc: '意志 +2 · 登场气势拉满', bonus: { will: 2 } },
      /* Phase 5 深化：非拳套装备扩充（dr = 减伤%，与护齿/护头叠加；全部可强化 +0~+10） */
      { id: 'wrist1',  slot: 'wrist',  name: '基础护腕', price: 400,  desc: '精准度 +1', bonus: { accuracy: 1 } },
      { id: 'wrist2',  slot: 'wrist',  name: '专业护腕', price: 1200, desc: '精准度 +1 · 出拳速度 +1', bonus: { accuracy: 1, speed: 1 } },
      { id: 'wrist3',  slot: 'wrist',  name: '冠军护腕', price: 3000, desc: '精准度 +2 · 出拳速度 +1 · 防守技术 +1', bonus: { accuracy: 2, speed: 1, defense: 1 } },
      { id: 'head3',   slot: 'head',   name: '冠军护头', price: 3500, desc: '减伤 +15% · 耐久 +1', bonus: { endurance: 1 }, dr: 15 },
      { id: 'robe2',   slot: 'robe',   name: '轻盈训练服', price: 800,  desc: '步伐速度 +1', bonus: { footwork: 1 } },
      { id: 'robe3',   slot: 'robe',   name: '冠军战袍', price: 4000, desc: '力量 +1 · 耐久 +1', bonus: { power: 1, endurance: 1 } },
      { id: 'boots2',  slot: 'boots',  name: '速度战靴', price: 1500, desc: '步伐速度 +2', bonus: { footwork: 2 } },
      { id: 'boots3',  slot: 'boots',  name: '重型战靴', price: 2800, desc: '步伐速度 +1 · 耐久 +1 · 力量 +1', bonus: { footwork: 1, endurance: 1, power: 1 } },
      { id: 'guard2',  slot: 'guard',  name: '定制护齿', price: 1000, desc: '比赛中受到的伤害 −8%', bonus: {}, dr: 8 },
      { id: 'guard3',  slot: 'guard',  name: '专业护齿', price: 2500, desc: '比赛中受到的伤害 −12% · 意志 +1', bonus: { will: 1 }, dr: 12 }
    ];

    /* ================= Phase 5：装备深层 —— 定制 / 拆解 / 打造 / 图鉴成就 ================= */
    var GLOVE_PATTERNS = {
      guardian: { name: '守护系', base: 1700, bonus: { defense: 2, power: -1 }, note: '保护 +2 · 伤害 −1 · 价高' },
      bull:     { name: '斗牛系', base: 1100, bonus: { power: 2, defense: -1 }, note: '伤害 +2 · 手部保护 −1（伤手风险）· 中价' },
      classic:  { name: '经典系', base: 700,  bonus: { power: 1, defense: 1 },  note: '攻守均衡 · 便宜' }
    };
    var GLOVE_OUTERS = {
      calf:      { name: '小牛皮', price: 600, bonus: { technique: 1 }, note: '均衡手感 · 技术 +1' },
      kangaroo:  { name: '袋鼠皮', price: 900, bonus: { speed: 1 },     note: '轻韧 · 出拳速度 +1' },
      goat:      { name: '山羊皮', price: 700, bonus: { accuracy: 1 },  note: '贴合 · 精准度 +1' },
      synthetic: { name: '人造革', price: 200, bonus: {},                note: '便宜耐用 · 无额外加成' }
    };
    var GLOVE_LININGS = {
      horsehair: { name: '马毛', price: 700, bonus: { power: 1, defense: -1 }, note: '伤害 +1 · 保护 −1（伤手）' },
      latex:     { name: '乳胶', price: 300, bonus: { endurance: 1 },           note: '缓冲均衡 · 耐久 +1' },
      gel:       { name: '凝胶', price: 600, bonus: { defense: 1 },             note: '保护 +1' }
    };
    var GLOVE_OZ = {
      8:  { adj: -100, bonus: { power: 2, speed: 2, defense: -2 },  note: '轻量：伤害与速度高、保护低' },
      10: { adj: 0,    bonus: { power: 1, speed: 1, defense: -1 },  note: '偏轻：小幅偏向进攻' },
      12: { adj: 100,  bonus: {},                                   note: '标准：无额外修正' },
      14: { adj: 200,  bonus: { power: -1, speed: -1, defense: 1 }, note: '偏重：小幅偏向保护' },
      16: { adj: 300,  bonus: { power: -2, speed: -2, defense: 2 }, note: '厚重：保护高、伤害与速度低' }
    };
    var GLOVE_FIX = {
      lace:   { name: '系带',   price: 300, bonus: { accuracy: 1 }, note: '贴合手腕 · 精准度 +1' },
      velcro: { name: '魔术贴', price: 0,   bonus: {},              note: '便宜方便 · 无额外加成' }
    };
    var MATERIALS = [
      { id: 'synthetic', name: '人造革', kind: '皮料' },
      { id: 'calf',      name: '小牛皮', kind: '皮料' },
      { id: 'goat',      name: '山羊皮', kind: '皮料' },
      { id: 'kangaroo',  name: '袋鼠皮', kind: '皮料' },
      { id: 'latex',     name: '乳胶',   kind: '内衬材料' },
      { id: 'gel',       name: '凝胶',   kind: '内衬材料' },
      { id: 'horsehair', name: '马毛',   kind: '内衬材料' }
    ];

    /* 拆解产出表：[皮料, 内衬材料]，各随机 1~3 个；档次越高料越好 */
    var DISMANTLE_MAP = {
      gloves1: ['synthetic', 'latex'], gloves2: ['calf', 'latex'], gloves3: ['kangaroo', 'horsehair'],
      gloves4: ['kangaroo', 'gel'], gloves6: ['goat', 'gel'], gloves5: ['calf', 'horsehair'],
      guard1: ['synthetic', 'gel'], boots1: ['synthetic', 'latex'],
      head1: ['calf', 'latex'], head2: ['goat', 'gel'], robe1: ['synthetic', 'latex'],
      wrist1: ['synthetic', 'latex'], wrist2: ['calf', 'gel'], wrist3: ['kangaroo', 'horsehair'],
      head3: ['kangaroo', 'gel'], robe2: ['synthetic', 'latex'], robe3: ['goat', 'gel'],
      boots2: ['goat', 'latex'], boots3: ['calf', 'horsehair'],
      guard2: ['calf', 'gel'], guard3: ['goat', 'horsehair']
    };
    var CRAFT_FEE = 200, CRAFT_MAT_NEED = 2;
    var DEX_ACH = [
      { id: 'dex5',  need: 5,  reward: 1000, title: null },
      { id: 'dex10', need: 10, reward: 3000, title: '收藏家' }
    ];

    var GEAR_IMG_SRC = {
      gloves1: 'assets/equipment/glove_beginner.png',
      gloves2: 'assets/equipment/glove_standard.png',
      gloves3: 'assets/equipment/glove_professional.png',
      gloves4: 'assets/equipment/glove_swift.png',
      gloves5: 'assets/equipment/glove_cannon.png',
      gloves6: 'assets/equipment/glove_shadowmoon.png',
      guard1: 'assets/equipment/mouthguard_basic.png',
      boots1: 'assets/equipment/boots_light.png',
      head1: 'assets/equipment/headgear_basic.png',
      head2: 'assets/equipment/headgear_pro.png',
      robe1: 'assets/equipment/robe_entrance.png',
      wrist1: 'assets/equipment/wrist_basic.png',
      wrist2: 'assets/equipment/wrist_pro.png',
      wrist3: 'assets/equipment/wrist_champion.png',
      head3: 'assets/equipment/headgear_champion.png',
      robe2: 'assets/equipment/robe_training.png',
      robe3: 'assets/equipment/robe_champion.png',
      boots2: 'assets/equipment/boots_speed.png',
      boots3: 'assets/equipment/boots_heavy.png',
      guard2: 'assets/equipment/mouthguard_custom.png',
      guard3: 'assets/equipment/mouthguard_pro.png',
      'pattern-guardian': 'assets/equipment/glove_guardian.png',
      'pattern-bull': 'assets/equipment/glove_bull.png',
      'pattern-classic': 'assets/equipment/glove_classic.png'
    };

    /* 消耗品（商店同步上架，存入背包，点击使用，下次生效型） */
    var CONSUMABLES = [
      { id: 'drink',   name: '能量饮料', price: 200, desc: '使用后：下一次训练计划的体力消耗 −30%' },
      { id: 'bandage', name: '绷带',     price: 150, desc: '使用后：下一场比赛的伤病概率减半' },
      { id: 'meal',    name: '营养餐',   price: 250, desc: '使用后：下一次睡觉体力恢复 +20' }
    ];

    /* Phase 3：分阶段目标（6 个生涯阶段，依次解锁，完成发奖金，⑤⑥另发称号）
       第二轮回炉：原粉丝数条件改为影响力档位（阶段2→Lv2、阶段4→Lv3、阶段5→Lv4、阶段6→Lv5） */
    var STAGES = [
      { id: 1, name: '初出茅庐', reward: 500, title: null, goalText: '赢得 1 场比赛',
        check: function (s) { return s.wins >= 1; } },
      { id: 2, name: '崭露头角', reward: 1000, title: null, goalText: '排名进前 40 且影响力 Lv2',
        check: function (s) { return s.rank <= 40 && (s.influence || 1) >= 2; } },
      { id: 3, name: '国内新星', reward: 2000, title: null, goalText: '排名进前 25 且取得 3 连胜',
        check: function (s) { return s.rank <= 25 && (s.winStreak || 0) >= 3; } },
      { id: 4, name: '国内顶尖', reward: 5000, title: null, goalText: '排名进前 10 且影响力 Lv3',
        check: function (s) { return s.rank <= 10 && (s.influence || 1) >= 3; } },
      { id: 5, name: '冲击世界', reward: 10000, title: '国内冠军', goalText: '排名第 1 且影响力 Lv4',
        check: function (s) { return s.rank <= 1 && (s.influence || 1) >= 4; } },
      { id: 6, name: '传奇之路', reward: 20000, title: '传奇', goalText: '影响力 Lv5（传奇）且成为第 1 名后再赢 3 场',
        check: function (s) { return (s.influence || 1) >= 5 && winsAfterChamp(s) >= 3; } }
    ];

    /* Phase 3：赞助商（4 档，第二轮回炉：门槛由粉丝数改为影响力档位 need=所需 Lv，签约金 / 周薪不变） */
    var SPONSORS = [
      { id: 'ramen',    name: '街边拉面店',         need: 1, sign: 300,   weekly: 50,   desc: '巷口那家拉面店，老板是你的头号粉丝' },
      { id: 'ranli',    name: '运动饮料「燃力」',   need: 2, sign: 1500,  weekly: 200,  desc: '区域运动饮料品牌，看中你的上升势头' },
      { id: 'tiequan',  name: '拳套品牌「铁拳堂」', need: 3, sign: 4000,  weekly: 500,  desc: '国产拳套品牌，登场装备由他家提供' },
      { id: 'shengdao', name: '全国体育连锁「胜道」', need: 4, sign: 12000, weekly: 1500, desc: '全国连锁体育品牌，头部代言合同' }
    ];

    var FOE_NAMES = ['高坂 葵', '田村 凛', '黑木 沙罗', '冰室 澪', '凤 丽华', '早乙女 响', '久条 乃乃', '雾岛 枫', '白鸟 千鹤', '龙崎 刹那', '星野 真白', '神宫寺 夜子', '林小葵'];
    var TACTICS = {
      attack:  { name: '强攻压制' },
      counter: { name: '稳守反击' },
      points:  { name: '游走打点' }
    };
    /* Phase 4：对手 AI 风格（权重为出拳占比倾向，intensity 随排名放大） */
    var FOE_STYLES = {
      power:        { name: '力量型', cls: 'power', weights: { jab: 0.6, straight: 1.0, hook: 2.2, upper: 2.0, body: 1.2 }, stamMul: 1.4, freqMul: 0.85, dmgMul: 1.15, moveMul: 0.7, blockAdd: -0.04 },
      speed:        { name: '速度型', cls: 'speed', weights: { jab: 2.2, straight: 1.8, hook: 0.6, upper: 0.6, body: 0.8 }, stamMul: 0.8, freqMul: 1.35, dmgMul: 0.85, moveMul: 1.2, blockAdd: 0.02 },
      guardcounter: { name: '防守反击型', cls: 'guardcounter', weights: { jab: 1.1, straight: 1.3, hook: 1.0, upper: 0.9, body: 1.0 }, stamMul: 1.0, freqMul: 0.9, dmgMul: 1.0, moveMul: 0.95, blockAdd: 0.13 },
      balanced:     { name: '均衡型', cls: 'balanced', weights: { jab: 1.0, straight: 1.0, hook: 1.0, upper: 1.0, body: 1.0 }, stamMul: 1.0, freqMul: 1.0, dmgMul: 1.0, moveMul: 1.0, blockAdd: 0.03 }
    };

    /* ================= 角色池系统（Phase 7.5 接入）：50 名具名对手的动态池 =================
       名册 ROSTER_DEF 按初始名次顺序排列（第 1~49 名 + 候补胡小桃在末位）；
       key = assets/opponents/ 下的立绘文件基名，style 映射 FOE_STYLES，growth 为六种成长类型之一。
       S.roster 每条 { key, name, style, growth, rating, rank }：rank 为当前名次（与玩家共同占满 1~50），候补 rank=0。
       rating 初始映射 = 9.3 + (50 − 名次) × 0.3（第 1 名 24.0、第 49 名 9.6）。原规划值 9.8 经数值复测回调 −0.5：
       旧系统第 1 周约半数对手是第 50 名（base 7.8），池化后窗口内最弱也有 10.1 → 新人胜率跌到 40%（基线 52%，超 ±10pp），
       只下调映射截距找平（战斗公式未动），复测回到基线带内；
       迁移时再叠加 0.7 × (周数 − 1)，与旧公式的周数项对齐。 */
    var ROSTER_DEF = [
      { key: 'opp_world_champion',    name: '伊芙琳',       style: 'balanced',     growth: 'steady'   },
      { key: 'opp_crimson',            name: '薇拉',         style: 'power',        growth: 'genius'   },
      { key: 'opp_champion_domestic', name: '白鸟丽华',     style: 'balanced',     growth: 'steady'   },
      { key: 'opp_legend',             name: '白霜华',       style: 'balanced',     growth: 'veteran'  },
      { key: 'opp_asia',               name: '萨菲娅',       style: 'power',        growth: 'steady'   },
      { key: 'opp_saint',              name: '塞西莉亚',     style: 'guardcounter', growth: 'steady'   },
      { key: 'opp_amazon',             name: '塔娅',         style: 'power',        growth: 'volatile' },
      { key: 'opp_ice',                name: '白凛华',       style: 'guardcounter', growth: 'late'     },
      { key: 'opp_counter',            name: '沈墨凛',       style: 'guardcounter', growth: 'steady'   },
      { key: 'opp_europe',             name: '艾琳·诺德',   style: 'balanced',     growth: 'steady'   },
      { key: 'opp_genius',             name: '米娅',         style: 'speed',        growth: 'genius'   },
      { key: 'opp_africa',             name: '阿玛拉',       style: 'power',        growth: 'volatile' },
      { key: 'opp_north',              name: '艾丽娅·诺尔', style: 'guardcounter', growth: 'late'     },
      { key: 'opp_muscle',             name: '岩宫刚子',     style: 'power',        growth: 'steady'   },
      { key: 'opp_korea_style',        name: '韩凛',         style: 'speed',        growth: 'early'    },
      { key: 'opp_greylong',           name: '月岛澪',       style: 'balanced',     growth: 'veteran'  },
      { key: 'opp_latina',             name: '卡门·罗莎',   style: 'power',        growth: 'volatile' },
      { key: 'opp_doctor',             name: '森宫静流',     style: 'balanced',     growth: 'steady'   },
      { key: 'opp_fire',               name: '炎宫阳',       style: 'power',        growth: 'early'    },
      { key: 'opp_mystery',            name: '紫夜幻',       style: 'speed',        growth: 'volatile' },
      { key: 'opp_midnight',           name: '沈蓝汐',       style: 'guardcounter', growth: 'late'     },
      { key: 'opp_hojicha',            name: '茶宫温子',     style: 'guardcounter', growth: 'veteran'  },
      { key: 'opp_olive',              name: '奥莉维亚',     style: 'power',        growth: 'steady'   },
      { key: 'opp_martial',            name: '宫本凛',       style: 'balanced',     growth: 'steady'   },
      { key: 'opp_violetstraight',     name: '紫宫罗兰',     style: 'speed',        growth: 'early'    },
      { key: 'opp_emerald',            name: '艾梅拉',       style: 'power',        growth: 'volatile' },
      { key: 'opp_copper',             name: '布伦达',       style: 'power',        growth: 'steady'   },
      { key: 'opp_snow_short',         name: '雪代凛',       style: 'speed',        growth: 'genius'   },
      { key: 'opp_speed',              name: '陆凌霜',       style: 'speed',        growth: 'early'    },
      { key: 'opp_power',              name: '秦红绫',       style: 'power',        growth: 'steady'   },
      { key: 'opp_idol',               name: '金星瑶',       style: 'balanced',     growth: 'volatile' },
      { key: 'opp_dancer',             name: '白云裳',       style: 'speed',        growth: 'late'     },
      { key: 'opp_muaythai',           name: '娜琳',         style: 'balanced',     growth: 'steady'   },
      { key: 'opp_veteran',            name: '顾长青',       style: 'guardcounter', growth: 'veteran'  },
      { key: 'opp_goldbrown',          name: '金洛华',       style: 'balanced',     growth: 'steady'   },
      { key: 'opp_ivory',              name: '伊沃娜',       style: 'balanced',     growth: 'late'     },
      { key: 'opp_teal',               name: '澜静羽',       style: 'speed',        growth: 'volatile' },
      { key: 'opp_violet_short',       name: '夏紫苑',       style: 'speed',        growth: 'early'    },
      { key: 'opp_silver_bun',         name: '银宫铃',       style: 'speed',        growth: 'early'    },
      { key: 'opp_peach',              name: '桃宫蜜',       style: 'balanced',     growth: 'volatile' },
      { key: 'opp_milktea',            name: '唐恬',         style: 'balanced',     growth: 'steady'   },
      { key: 'opp_scholar',            name: '沈书瑶',       style: 'balanced',     growth: 'late'     },
      { key: 'opp_twinbraid',          name: '蓝青禾',       style: 'balanced',     growth: 'steady'   },
      { key: 'opp_student',            name: '方小勤',       style: 'balanced',     growth: 'early'    },
      { key: 'opp_braid',              name: '田小麦',       style: 'balanced',     growth: 'steady'   },
      { key: 'opp_rookie',             name: '林小葵',       style: 'balanced',     growth: 'early'    },
      { key: 'opp_shy',                name: '苏雾',         style: 'speed',        growth: 'late'     },
      { key: 'opp_pocket',             name: '雷小朵',       style: 'power',        growth: 'volatile' },
      { key: 'opp_brick',              name: '赤磊',         style: 'power',        growth: 'early'    },
      { key: 'opp_chestnut_short',     name: '胡小桃',       style: 'balanced',     growth: 'late'     }
    ];

    var GROWTH_LABELS = { early: '早熟', steady: '稳定', late: '大器晚成', volatile: '波动', genius: '天才', veteran: '老将' };

    var APPEARANCE = {
      hair: {
        ponytail: { name: '高马尾', src: 'assets/portrait.webp' },
        hime: { name: '公主切', src: 'assets/portrait/hair_hime.png' },
        waves: { name: '大波浪', src: 'assets/portrait/hair_waves.png' },
        halfup: { name: '半扎发', src: 'assets/portrait/hair_halfup.png' },
        short: { name: '超短发', src: 'assets/portrait/hair_short.png' },
        braid: { name: '麻花辫', src: 'assets/portrait/hair_braid.png' },
        longstraight: { name: '黑长直', src: 'assets/portrait/hair_longstraight.png' },
        bun: { name: '丸子头', src: 'assets/portrait/hair_bun.png' },
        waterwaves: { name: '水波纹', src: 'assets/portrait/hair_waterwaves.png' }
      },
      face: {
        default: { name: '默认', src: 'assets/portrait.webp' },
        round: { name: '圆润', src: 'assets/portrait/face_round.png' },
        oval: { name: '瓜子', src: 'assets/portrait/face_oval.png' }
      },
      outfit: {
        default: { name: '默认', src: 'assets/portrait.webp' },
        robe: { name: '登场战袍', src: 'assets/portrait/outfit_robe.png' },
        training: { name: '训练服', src: 'assets/portrait/outfit_training.png' }
      },
      body: {
        petite: { name: '娇小', scale: 0.92 },
        standard: { name: '标准', scale: 1 },
        tall: { name: '高挑', scale: 1.08 }
      }
    };

    var INFLUENCE_LEVELS = [
      { lv: 1, name: '无名之辈', bonus: 0 },
      { lv: 2, name: '崭露头角', bonus: 10 },
      { lv: 3, name: '声名鹊起', bonus: 20 },
      { lv: 4, name: '家喻户晓', bonus: 35 },
      { lv: 5, name: '传奇', bonus: 50 }
    ];
