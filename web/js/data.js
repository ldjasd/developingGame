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

    /* 装备（体育用品店）：slot 部位限装备一件。
       修复批次 D（GAME_AUDIT2 M3）：加成由固定数值改百分比/机制型——pct = 属性「生效值」百分比
       （实战生效值 = 本体属性 ×(1+pct 合计/100)，随本体成长同阶缩放，保质期覆盖全生涯）；
       dr = 减伤%（护齿/护头）；mech = 机制效果（trauma 我方所受重创积累倍率 / stam 我方出拳
       体力消耗倍率 / cd 我方指令冷却倍率，均 <1 为正面）。旧固定数值口径已废弃，老存档的
       定制拳套在读档时按 ×4 换算为 pct（见 game.js legacyPctOf），价值不缩水。 */
    var SLOT_NAMES = { gloves: '拳套', guard: '护齿', boots: '战靴', head: '护头', robe: '战袍', wrist: '护腕' };
    var SHOP_GEAR = [
      { id: 'gloves1', slot: 'gloves', name: '新手拳套', price: 500,  desc: '力量生效 +8%', pct: { power: 8 } },
      { id: 'gloves2', slot: 'gloves', name: '标准拳套', price: 1500, desc: '力量生效 +11% · 精准度生效 +5%', pct: { power: 11, accuracy: 5 } },
      { id: 'gloves3', slot: 'gloves', name: '专业拳套', price: 4000, desc: '力量生效 +13% · 精准度生效 +5% · 出拳速度生效 +5%', pct: { power: 13, accuracy: 5, speed: 5 } },
      { id: 'guard1',  slot: 'guard',  name: '基础护齿', price: 800,  desc: '比赛中受到的伤害 −5% · 所受重创积累 −8%', pct: {}, dr: 5, mech: { trauma: 0.92 } },
      { id: 'boots1',  slot: 'boots',  name: '轻便战靴', price: 1200, desc: '步伐速度生效 +6% · 出拳体力消耗 −5%', pct: { footwork: 6 }, mech: { stam: 0.95 } },
      { id: 'gloves4', slot: 'gloves', name: '疾风拳套', price: 1800, desc: '出拳速度生效 +13% · 力量生效 +5%（速度型）', pct: { speed: 13, power: 5 } },
      { id: 'gloves6', slot: 'gloves', name: '影月拳套', price: 2600, desc: '精准度生效 +10% · 技术生效 +6%（技巧型）', pct: { accuracy: 10, technique: 6 } },
      { id: 'gloves5', slot: 'gloves', name: '重炮拳套', price: 3200, desc: '力量生效 +17% · 出拳速度生效 −5%（重炮型）', pct: { power: 17, speed: -5 } },
      { id: 'head1',   slot: 'head',   name: '基础护头', price: 900,  desc: '防守技术生效 +6% · 所受重创积累 −5%', pct: { defense: 6 }, mech: { trauma: 0.95 } },
      { id: 'head2',   slot: 'head',   name: '职业护头', price: 2200, desc: '防守技术生效 +10% · 意志生效 +5%', pct: { defense: 10, will: 5 } },
      { id: 'robe1',   slot: 'robe',   name: '登场战袍', price: 1500, desc: '意志生效 +11% · 登场气势拉满', pct: { will: 11 } },
      /* Phase 5 深化：非拳套装备扩充（dr = 减伤%，与护齿/护头叠加；全部可强化 +0~+10） */
      { id: 'wrist1',  slot: 'wrist',  name: '基础护腕', price: 400,  desc: '精准度生效 +5% · 指令冷却 −5%', pct: { accuracy: 5 }, mech: { cd: 0.95 } },
      { id: 'wrist2',  slot: 'wrist',  name: '专业护腕', price: 1200, desc: '精准度生效 +5% · 出拳速度生效 +5% · 指令冷却 −8%', pct: { accuracy: 5, speed: 5 }, mech: { cd: 0.92 } },
      { id: 'wrist3',  slot: 'wrist',  name: '冠军护腕', price: 3000, desc: '精准度生效 +9% · 出拳速度生效 +5% · 防守技术生效 +5% · 指令冷却 −15%', pct: { accuracy: 9, speed: 5, defense: 5 }, mech: { cd: 0.85 } },
      { id: 'head3',   slot: 'head',   name: '冠军护头', price: 3500, desc: '减伤 +15% · 耐久生效 +6% · 所受重创积累 −10%', pct: { endurance: 6 }, dr: 15, mech: { trauma: 0.90 } },
      { id: 'robe2',   slot: 'robe',   name: '轻盈训练服', price: 800,  desc: '步伐速度生效 +6%', pct: { footwork: 6 } },
      { id: 'robe3',   slot: 'robe',   name: '冠军战袍', price: 4000, desc: '力量生效 +6% · 耐久生效 +6%', pct: { power: 6, endurance: 6 } },
      { id: 'boots2',  slot: 'boots',  name: '速度战靴', price: 1500, desc: '步伐速度生效 +11% · 出拳体力消耗 −8%', pct: { footwork: 11 }, mech: { stam: 0.92 } },
      { id: 'boots3',  slot: 'boots',  name: '重型战靴', price: 2800, desc: '步伐速度生效 +6% · 耐久生效 +5% · 力量生效 +5% · 出拳体力消耗 −4%', pct: { footwork: 6, endurance: 5, power: 5 }, mech: { stam: 0.96 } },
      { id: 'guard2',  slot: 'guard',  name: '定制护齿', price: 1000, desc: '比赛中受到的伤害 −8% · 所受重创积累 −14%', pct: {}, dr: 8, mech: { trauma: 0.86 } },
      { id: 'guard3',  slot: 'guard',  name: '专业护齿', price: 2500, desc: '比赛中受到的伤害 −12% · 意志生效 +5% · 所受重创积累 −20%', pct: { will: 5 }, dr: 12, mech: { trauma: 0.80 } }
    ];

    /* ================= Phase 5：装备深层 —— 定制 / 拆解 / 打造 / 图鉴成就 ================= */
    /* 修复批次 D：定制部件同步改百分比（pct，口径同 SHOP_GEAR；旧 bonus 固定值 ×约 4.5 换算，取舍方向不变） */
    var GLOVE_PATTERNS = {
      guardian: { name: '守护系', base: 1700, pct: { defense: 9, power: -5 }, note: '防守生效 +9% · 力量生效 −5% · 价高' },
      bull:     { name: '斗牛系', base: 1100, pct: { power: 9, defense: -5 }, note: '力量生效 +9% · 防守生效 −5%（伤手风险）· 中价' },
      classic:  { name: '经典系', base: 700,  pct: { power: 5, defense: 5 },  note: '攻守均衡 · 便宜' }
    };
    var GLOVE_OUTERS = {
      calf:      { name: '小牛皮', price: 600, pct: { technique: 5 }, note: '均衡手感 · 技术生效 +5%' },
      kangaroo:  { name: '袋鼠皮', price: 900, pct: { speed: 5 },     note: '轻韧 · 出拳速度生效 +5%' },
      goat:      { name: '山羊皮', price: 700, pct: { accuracy: 5 },  note: '贴合 · 精准度生效 +5%' },
      synthetic: { name: '人造革', price: 200, pct: {},                note: '便宜耐用 · 无额外加成' }
    };
    var GLOVE_LININGS = {
      horsehair: { name: '马毛', price: 700, pct: { power: 5, defense: -5 }, note: '力量生效 +5% · 防守生效 −5%（伤手）' },
      latex:     { name: '乳胶', price: 300, pct: { endurance: 5 },           note: '缓冲均衡 · 耐久生效 +5%' },
      gel:       { name: '凝胶', price: 600, pct: { defense: 5 },             note: '防守生效 +5%' }
    };
    var GLOVE_OZ = {
      8:  { adj: -100, pct: { power: 9, speed: 9, defense: -9 },  note: '轻量：伤害与速度高、保护低' },
      10: { adj: 0,    pct: { power: 5, speed: 5, defense: -5 },  note: '偏轻：小幅偏向进攻' },
      12: { adj: 100,  pct: {},                                   note: '标准：无额外修正' },
      14: { adj: 200,  pct: { power: -5, speed: -5, defense: 5 }, note: '偏重：小幅偏向保护' },
      16: { adj: 300,  pct: { power: -9, speed: -9, defense: 9 }, note: '厚重：保护高、伤害与速度低' }
    };
    var GLOVE_FIX = {
      lace:   { name: '系带',   price: 300, pct: { accuracy: 5 }, note: '贴合手腕 · 精准度生效 +5%' },
      velcro: { name: '魔术贴', price: 0,   pct: {},              note: '便宜方便 · 无额外加成' }
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

    /* 装备图（2026-11-03 二次元化）：全部改指装备设计池 assets/equipment_pool/ 的二次元图，
       与设计款式图鉴同源；旧 assets/equipment/ 写实照片图已弃用（文件保留备查，勿再引用） */
    var GEAR_IMG_SRC = {
      gloves1: 'assets/equipment_pool/gloves/glove_compact_star_pink.webp',
      gloves2: 'assets/equipment_pool/gloves/glove_classic2_heart_blue.webp',
      gloves3: 'assets/equipment_pool/gloves/glove_classic2_petal_gold.webp',
      gloves4: 'assets/equipment_pool/gloves/glove_compact_lightning_gold.webp',
      gloves5: 'assets/equipment_pool/gloves/glove_boxy_star_red.webp',
      gloves6: 'assets/equipment_pool/gloves/glove_classic2_lightning_purple.webp',
      guard1: 'assets/equipment_pool/guard/mouthguard_002.webp',
      boots1: 'assets/equipment_pool/boots/boots_bulk_001.webp',
      head1: 'assets/equipment_pool/head/headgear_bulk_005.webp',
      head2: 'assets/equipment_pool/head/headgear_bulk_013.webp',
      robe1: 'assets/equipment_pool/robe/robe_001.webp',
      wrist1: 'assets/equipment_pool/wrist/wrist_001.webp',
      wrist2: 'assets/equipment_pool/wrist/wrist_008.webp',
      wrist3: 'assets/equipment_pool/wrist/wrist_004.webp',
      head3: 'assets/equipment_pool/head/headgear_pool_star_gold.webp',
      robe2: 'assets/equipment_pool/robe/robe_010.webp',
      robe3: 'assets/equipment_pool/robe/robe_008.webp',
      boots2: 'assets/equipment_pool/boots/boots_pool_lightning_gold.webp',
      boots3: 'assets/equipment_pool/boots/boots_bulk_009.webp',
      guard2: 'assets/equipment_pool/guard/mouthguard_001.webp',
      guard3: 'assets/equipment_pool/guard/mouthguard_010.webp',
      'pattern-guardian': 'assets/equipment_pool/gloves/glove_pool_heart_gold.webp',
      'pattern-bull': 'assets/equipment_pool/gloves/glove_compact_heart_red.webp',
      'pattern-classic': 'assets/equipment_pool/gloves/glove_boxy_petal_white.webp'
    };

    /* 设计款式图鉴（展示型收集）：从装备设计池精选的款式画廊，按类别分组陈列。
       纯展示——不登记收集进度（dexSigs）、不影响里程碑奖励与任何数值。条目格式：[类别, 中文名, 图片] */
    var DEX_GALLERY_CATS = [ ['gloves', '拳套'], ['head', '护头'], ['boots', '战靴'], ['wrist', '护腕'], ['robe', '战袍'], ['guard', '护齿'] ];
    var DEX_GALLERY = [
      ['gloves', '橙爱心·方正拳套', 'assets/equipment_pool/gloves/glove_boxy_heart_orange.webp'],
      ['gloves', '薄荷绿闪电·方正拳套', 'assets/equipment_pool/gloves/glove_boxy_lightning_mint.webp'],
      ['gloves', '白花瓣·方正拳套', 'assets/equipment_pool/gloves/glove_boxy_petal_white.webp'],
      ['gloves', '藏青星星·方正拳套', 'assets/equipment_pool/gloves/glove_boxy_star_navy.webp'],
      ['gloves', '红星星·方正拳套', 'assets/equipment_pool/gloves/glove_boxy_star_red.webp'],
      ['gloves', '蓝爱心·经典拳套', 'assets/equipment_pool/gloves/glove_classic2_heart_blue.webp'],
      ['gloves', '紫闪电·经典拳套', 'assets/equipment_pool/gloves/glove_classic2_lightning_purple.webp'],
      ['gloves', '金花瓣·经典拳套', 'assets/equipment_pool/gloves/glove_classic2_petal_gold.webp'],
      ['gloves', '红花瓣·经典拳套', 'assets/equipment_pool/gloves/glove_classic2_petal_red.webp'],
      ['gloves', '金星星·经典拳套', 'assets/equipment_pool/gloves/glove_classic2_star_gold.webp'],
      ['gloves', '红爱心·圆润拳套', 'assets/equipment_pool/gloves/glove_compact_heart_red.webp'],
      ['gloves', '金闪电·圆润拳套', 'assets/equipment_pool/gloves/glove_compact_lightning_gold.webp'],
      ['gloves', '蓝花瓣·圆润拳套', 'assets/equipment_pool/gloves/glove_compact_petal_blue.webp'],
      ['gloves', '薄荷绿星星·圆润拳套', 'assets/equipment_pool/gloves/glove_compact_star_mint.webp'],
      ['gloves', '粉星星·圆润拳套', 'assets/equipment_pool/gloves/glove_compact_star_pink.webp'],
      ['gloves', '薄荷绿爱心·饱满拳套', 'assets/equipment_pool/gloves/glove_pillow_heart_mint.webp'],
      ['gloves', '粉爱心·饱满拳套', 'assets/equipment_pool/gloves/glove_pillow_heart_pink.webp'],
      ['gloves', '蓝闪电·饱满拳套', 'assets/equipment_pool/gloves/glove_pillow_lightning_blue.webp'],
      ['gloves', '紫花瓣·饱满拳套', 'assets/equipment_pool/gloves/glove_pillow_petal_purple.webp'],
      ['gloves', '金星星·饱满拳套', 'assets/equipment_pool/gloves/glove_pillow_star_gold.webp'],
      ['gloves', '紫爱心·修长拳套', 'assets/equipment_pool/gloves/glove_slim_heart_purple.webp'],
      ['gloves', '橙闪电·修长拳套', 'assets/equipment_pool/gloves/glove_slim_lightning_orange.webp'],
      ['gloves', '薄荷绿花瓣·修长拳套', 'assets/equipment_pool/gloves/glove_slim_petal_mint.webp'],
      ['gloves', '粉花瓣·修长拳套', 'assets/equipment_pool/gloves/glove_slim_petal_pink.webp'],
      ['gloves', '蓝星星·修长拳套', 'assets/equipment_pool/gloves/glove_slim_star_blue.webp'],
      ['gloves', '蓝爱心·泰式拳套', 'assets/equipment_pool/gloves/glove_thai_heart_blue.webp'],
      ['gloves', '粉闪电·泰式拳套', 'assets/equipment_pool/gloves/glove_thai_lightning_pink.webp'],
      ['gloves', '橙花瓣·泰式拳套', 'assets/equipment_pool/gloves/glove_thai_petal_orange.webp'],
      ['gloves', '紫星星·泰式拳套', 'assets/equipment_pool/gloves/glove_thai_star_purple.webp'],
      ['gloves', '红星星·泰式拳套', 'assets/equipment_pool/gloves/glove_thai_star_red.webp'],
      ['gloves', '金爱心·主题拳套', 'assets/equipment_pool/gloves/glove_pool_heart_gold.webp'],
      ['gloves', '红爱心·主题拳套', 'assets/equipment_pool/gloves/glove_pool_heart_red.webp'],
      ['gloves', '金闪电·主题拳套', 'assets/equipment_pool/gloves/glove_pool_lightning_gold.webp'],
      ['gloves', '橙闪电·主题拳套', 'assets/equipment_pool/gloves/glove_pool_lightning_orange.webp'],
      ['gloves', '蓝花瓣·主题拳套', 'assets/equipment_pool/gloves/glove_pool_petal_blue.webp'],
      ['gloves', '薄荷绿花瓣·主题拳套', 'assets/equipment_pool/gloves/glove_pool_petal_mint.webp'],
      ['gloves', '蓝星星·主题拳套', 'assets/equipment_pool/gloves/glove_pool_star_blue.webp'],
      ['gloves', '薄荷绿星星·主题拳套', 'assets/equipment_pool/gloves/glove_pool_star_mint.webp'],
      ['gloves', '蓝色设计拳套·01号', 'assets/equipment_pool/gloves/glove_bulk_001.webp'],
      ['gloves', '蓝色设计拳套·10号', 'assets/equipment_pool/gloves/glove_bulk_010.webp'],
      ['gloves', '素色设计拳套·19号', 'assets/equipment_pool/gloves/glove_bulk_019.webp'],
      ['gloves', '青蓝设计拳套·28号', 'assets/equipment_pool/gloves/glove_bulk_028.webp'],
      ['gloves', '素色设计拳套·37号', 'assets/equipment_pool/gloves/glove_bulk_037.webp'],
      ['gloves', '橙色设计拳套·46号', 'assets/equipment_pool/gloves/glove_bulk_046.webp'],
      ['gloves', '蓝色设计拳套·55号', 'assets/equipment_pool/gloves/glove_bulk_055.webp'],
      ['gloves', '素色设计拳套·64号', 'assets/equipment_pool/gloves/glove_bulk_064.webp'],
      ['gloves', '红色设计拳套·73号', 'assets/equipment_pool/gloves/glove_bulk_073.webp'],
      ['gloves', '橙色设计拳套·82号', 'assets/equipment_pool/gloves/glove_bulk_082.webp'],
      ['head', '蓝色设计护头·01号', 'assets/equipment_pool/head/headgear_bulk_001.webp'],
      ['head', '素色设计护头·05号', 'assets/equipment_pool/head/headgear_bulk_005.webp'],
      ['head', '橙色设计护头·09号', 'assets/equipment_pool/head/headgear_bulk_009.webp'],
      ['head', '素色设计护头·13号', 'assets/equipment_pool/head/headgear_bulk_013.webp'],
      ['head', '素色设计护头·17号', 'assets/equipment_pool/head/headgear_bulk_017.webp'],
      ['head', '红色设计护头·21号', 'assets/equipment_pool/head/headgear_bulk_021.webp'],
      ['head', '红爱心·主题护头', 'assets/equipment_pool/head/headgear_pool_heart_red.webp'],
      ['head', '金闪电·主题护头', 'assets/equipment_pool/head/headgear_pool_lightning_gold.webp'],
      ['head', '薄荷绿花瓣·主题护头', 'assets/equipment_pool/head/headgear_pool_petal_mint.webp'],
      ['head', '橙花瓣·主题护头', 'assets/equipment_pool/head/headgear_pool_petal_orange.webp'],
      ['head', '蓝星星·主题护头', 'assets/equipment_pool/head/headgear_pool_star_blue.webp'],
      ['head', '金星星·主题护头', 'assets/equipment_pool/head/headgear_pool_star_gold.webp'],
      ['boots', '素色设计战靴·01号', 'assets/equipment_pool/boots/boots_bulk_001.webp'],
      ['boots', '素色设计战靴·05号', 'assets/equipment_pool/boots/boots_bulk_005.webp'],
      ['boots', '橙色设计战靴·09号', 'assets/equipment_pool/boots/boots_bulk_009.webp'],
      ['boots', '素色设计战靴·13号', 'assets/equipment_pool/boots/boots_bulk_013.webp'],
      ['boots', '素色设计战靴·17号', 'assets/equipment_pool/boots/boots_bulk_017.webp'],
      ['boots', '红色设计战靴·21号', 'assets/equipment_pool/boots/boots_bulk_021.webp'],
      ['boots', '红爱心·主题战靴', 'assets/equipment_pool/boots/boots_pool_heart_red.webp'],
      ['boots', '金闪电·主题战靴', 'assets/equipment_pool/boots/boots_pool_lightning_gold.webp'],
      ['boots', '薄荷绿花瓣·主题战靴', 'assets/equipment_pool/boots/boots_pool_petal_mint.webp'],
      ['boots', '紫花瓣·主题战靴', 'assets/equipment_pool/boots/boots_pool_petal_purple.webp'],
      ['boots', '蓝星星·主题战靴', 'assets/equipment_pool/boots/boots_pool_star_blue.webp'],
      ['boots', '粉星星·主题战靴', 'assets/equipment_pool/boots/boots_pool_star_pink.webp'],
      ['wrist', '素色设计护腕·01号', 'assets/equipment_pool/wrist/wrist_001.webp'],
      ['wrist', '蓝色设计护腕·02号', 'assets/equipment_pool/wrist/wrist_002.webp'],
      ['wrist', '红色设计护腕·03号', 'assets/equipment_pool/wrist/wrist_003.webp'],
      ['wrist', '橙色设计护腕·04号', 'assets/equipment_pool/wrist/wrist_004.webp'],
      ['wrist', '素色设计护腕·05号', 'assets/equipment_pool/wrist/wrist_005.webp'],
      ['wrist', '素色设计护腕·06号', 'assets/equipment_pool/wrist/wrist_006.webp'],
      ['wrist', '橙色设计护腕·07号', 'assets/equipment_pool/wrist/wrist_007.webp'],
      ['wrist', '蓝色设计护腕·08号', 'assets/equipment_pool/wrist/wrist_008.webp'],
      ['wrist', '橙色设计护腕·09号', 'assets/equipment_pool/wrist/wrist_009.webp'],
      ['wrist', '青蓝设计护腕·10号', 'assets/equipment_pool/wrist/wrist_010.webp'],
      ['robe', '紫色设计战袍·01号', 'assets/equipment_pool/robe/robe_001.webp'],
      ['robe', '素色设计战袍·02号', 'assets/equipment_pool/robe/robe_002.webp'],
      ['robe', '红色设计战袍·03号', 'assets/equipment_pool/robe/robe_003.webp'],
      ['robe', '蓝色设计战袍·04号', 'assets/equipment_pool/robe/robe_004.webp'],
      ['robe', '蓝色设计战袍·05号', 'assets/equipment_pool/robe/robe_005.webp'],
      ['robe', '红色设计战袍·06号', 'assets/equipment_pool/robe/robe_006.webp'],
      ['robe', '红色设计战袍·07号', 'assets/equipment_pool/robe/robe_007.webp'],
      ['robe', '橙色设计战袍·08号', 'assets/equipment_pool/robe/robe_008.webp'],
      ['robe', '蓝色设计战袍·09号', 'assets/equipment_pool/robe/robe_009.webp'],
      ['robe', '素色设计战袍·10号', 'assets/equipment_pool/robe/robe_010.webp'],
      ['guard', '素色设计护齿·01号', 'assets/equipment_pool/guard/mouthguard_001.webp'],
      ['guard', '素色设计护齿·02号', 'assets/equipment_pool/guard/mouthguard_002.webp'],
      ['guard', '素色设计护齿·03号', 'assets/equipment_pool/guard/mouthguard_003.webp'],
      ['guard', '蓝色设计护齿·04号', 'assets/equipment_pool/guard/mouthguard_004.webp'],
      ['guard', '橙色设计护齿·05号', 'assets/equipment_pool/guard/mouthguard_005.webp'],
      ['guard', '素色设计护齿·06号', 'assets/equipment_pool/guard/mouthguard_006.webp'],
      ['guard', '红色设计护齿·07号', 'assets/equipment_pool/guard/mouthguard_007.webp'],
      ['guard', '素色设计护齿·08号', 'assets/equipment_pool/guard/mouthguard_008.webp'],
      ['guard', '橙色设计护齿·09号', 'assets/equipment_pool/guard/mouthguard_009.webp'],
      ['guard', '金黄色设计护齿·10号', 'assets/equipment_pool/guard/mouthguard_010.webp'],
      ['guard', '青蓝设计护齿·11号', 'assets/equipment_pool/guard/mouthguard_011.webp'],
      ['guard', '紫色设计护齿·12号', 'assets/equipment_pool/guard/mouthguard_012.webp'],
    ];

    /* 消耗品（商店同步上架，存入背包，点击使用，下次生效型） */
    var CONSUMABLES = [
      { id: 'drink',   name: '能量饮料', price: 200, desc: '使用后：下一次训练计划的体力消耗 −30%' },
      { id: 'bandage', name: '绷带',     price: 150, desc: '使用后：下一场比赛的伤病概率减半' },
      { id: 'meal',    name: '营养餐',   price: 250, desc: '使用后：下一次睡觉体力恢复 +20' }
    ];

    /* Phase 3：分阶段目标（6 个生涯阶段，依次解锁，完成发奖金，⑤⑥另发称号）
       第二轮回炉：原粉丝数条件改为影响力档位（阶段2→Lv2、阶段4→Lv3、阶段5→Lv4、阶段6→Lv5）
       修复批次 C（GAME_AUDIT2 M6/F3a）：阶段 2~5 的排名条件改「排名 OR 胜场/击败特定对手」双通道
       （胜场阈值与影响力档位的胜场路对齐：Lv3=10 胜、Lv4=25 胜；阶段 5 的第二通道＝正式赛击败
       伊芙琳 S.beatChamp），中等胜率玩家不再被单一排名线卡死；阶段 5 改名「国内之巅」——
       本作当前版本的生涯终点是国内第 1，世界线只是伏笔/远期目标，文案不再说成已可玩（F3a）。 */
    var STAGES = [
      { id: 1, name: '初出茅庐', reward: 500, title: null, goalText: '赢得 1 场比赛',
        check: function (s) { return s.wins >= 1; } },
      { id: 2, name: '崭露头角', reward: 1000, title: null, goalText: '排名进前 40（或赢下 5 场）且影响力 Lv2',
        check: function (s) { return (s.rank <= 40 || s.wins >= 5) && (s.influence || 1) >= 2; } },
      { id: 3, name: '国内新星', reward: 2000, title: null, goalText: '排名进前 25（或赢下 12 场）且取得 3 连胜',
        check: function (s) { return (s.rank <= 25 || s.wins >= 12) && (s.winStreak || 0) >= 3; } },
      { id: 4, name: '国内顶尖', reward: 5000, title: null, goalText: '排名进前 10（或赢下 25 场）且影响力 Lv3',
        check: function (s) { return (s.rank <= 10 || s.wins >= 25) && (s.influence || 1) >= 3; } },
      { id: 5, name: '国内之巅', reward: 10000, title: '国内冠军', goalText: '登上国内第 1 名（或在正式赛击败伊芙琳）且影响力 Lv4',
        check: function (s) { return (s.rank <= 1 || !!s.beatChamp) && (s.influence || 1) >= 4; } },
      { id: 6, name: '传奇之路', reward: 20000, title: '传奇', goalText: '影响力 Lv5（传奇）且成为第 1 名后再赢 3 场（卫冕，含卫冕战胜利）',
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

    /* ================= D1：对手台词（角色池前 15 名高频对手专属 + 通用兜底池） =================
       pre = 赛前台词（2 条，赛前弹窗随机取 1）；win / lose = 以对手视角的赛后胜 / 负台词（各 1 条）。
       无专属台词的对手走 FOE_LINES_GENERIC 兜底，任何一场比赛都不会留白。
       取词统一走 foeLine(key, kind)，kind ∈ 'pre' | 'win' | 'lose'（win/lose 均为对手视角）。 */
    var FOE_LINES = {
      opp_world_champion: { // 伊芙琳（国内第 1 名 · 曾征战世界擂台后归国守擂）：王者的从容（批次 C 文案对齐 F3a：她是「打过世界擂台的国内第一」，不是现役世界冠军坐在国内榜首）
        pre: ['国内第一的位子，我可没打算让。让我看看你走到这里的本事。', '很多人挑战过我，你不是第一个，也不会是最后一个——但愿你能让我认真起来。'],
        win: '这就是国内顶点的风景。想再看，先爬到够得着我的地方来。',
        lose: '……输了？呵，很好。这个擂台，终于又有点意思了。'
      },
      opp_crimson: { // 薇拉（第 2 名 · 力量天才）：狂气嗜战
        pre: ['别眨眼哦，我的拳头可不等人——被打哭了，我可不会哄你。', '绯红的拳头只认一件事：谁更强。来，让我兴奋起来！'],
        win: '哈！就这点程度？我的血都还没热起来呢。',
        lose: '疼……但真痛快！下次，我会把这一拳加倍还给你。'
      },
      opp_champion_domestic: { // 白鸟丽华（第 3 名 · 国内冠军）：大小姐式的优雅傲气
        pre: ['擂台也是社交场，失礼的打法，我可不会原谅。……请多指教。', '白鸟家的拳头，讲究的是优雅与胜负兼得。你，准备好了吗？'],
        win: '胜负已分。你的礼仪，还需要再修炼呢。',
        lose: '是我失态了……输得这么难看，回去要被祖母训话了。'
      },
      opp_legend: { // 白霜华（第 4 名 · 传奇老将）：沉稳提点后辈
        pre: ['年轻人，拳头不只是力气。这一场，就当是我给你的课。', '打了这么多年，我的手背比你的脸还清楚拳头的脾气。来吧。'],
        win: '姜还是老的辣。回去把基本功再磨三年。',
        lose: '后生可畏啊……我的时代，看来真的要翻篇了。'
      },
      opp_asia: { // 萨菲娅（第 5 名 · 洲际力量型）：豪迈自信
        pre: ['整个亚洲的擂台我都站过，你的拳头，最好有点分量。', '别客气，尽管攻过来——我萨菲娅从不躲着打。'],
        win: '洲际的门槛，没那么好跨。回去再练！',
        lose: '打得漂亮！这场败仗，我认——下次洲际赛上见。'
      },
      opp_saint: { // 塞西莉亚（第 6 名 · 圣女系防守反击）：温柔而坚定
        pre: ['愿这场比赛没有怨恨。……我会全力以赴的，那是对你的尊重。', '别怕，我的拳头不伤人——只是会把你请下擂台而已。'],
        win: '阿门。你的拳头里，少了点信念呢。',
        lose: '输了也心怀感激……谢谢你，让我看见了自己的不足。'
      },
      opp_amazon: { // 塔娅（第 7 名 · 亚马逊力量型）：野性直率
        pre: ['在丛林里，猎物和猎手只有一线之隔。你闻起来……像猎物。', '废话少说！拳头响起来，才是打招呼的方式！'],
        win: '弱者就该让路，这就是自然的规矩。',
        lose: '嗷……你比看起来凶得多。好，我记住你了，猎手。'
      },
      opp_ice: { // 白凛华（第 8 名 · 冰系防守反击）：冷淡寡言
        pre: ['……站好。我的拳，比冬天的风更快。', '话不必多说。冻住你，只需要一回合。'],
        win: '果然，冰面之下，你还差得远。',
        lose: '……冰，也会碎吗。这份寒意，我收下了。'
      },
      opp_counter: { // 沈墨凛（第 9 名 · 宿敌）：冷峻、知己知彼（赛后另有宿敌专属剧情对白，此处为擂台台词）
        pre: ['又见面了。你的出拳习惯，我闭着眼都数得清——这一场，我等很久了。', '别以为赢过我一次就懂我了。宿敌，就是用来跨越的。'],
        win: '你还是老样子，一急就露破绽。……下次，别再输给我了。',
        lose: '……是我输了。但你要知道，我沈墨凛认输的次数，一只手数得过来。'
      },
      opp_europe: { // 艾琳·诺德（第 10 名 · 欧洲均衡型）：礼貌周到、骨子里傲
        pre: ['远道而来的比赛要有仪式感。失礼了——我会用最正式的方式击败你。', '欧洲的擂台讲究章法。你的野路子，在我这里行不通。'],
        win: '承让。按照礼节，我就不补最后一拳了。',
        lose: '败给你的感觉并不坏。……不，是相当屈辱。下次见。'
      },
      opp_genius: { // 米娅（第 11 名 · 天才速度型）：轻快跳脱、自信满满
        pre: ['嘿嘿，天才的拳头是用脑子打的哦！你跟得上我的节奏吗？', '三分钟，我只要三分钟。这场比赛的剧本，我昨晚就写好了！'],
        win: '看吧？剧本没写错一个字。回去多读点书再来！',
        lose: '诶——剧本撕了？！……有意思，你这个变数，我喜欢。'
      },
      opp_africa: { // 阿玛拉（第 12 名 · 力量型）：热情奔放、节奏感强
        pre: ['听见鼓点了吗？我的拳头跟着心跳走，你可别乱了拍子！', '来啊，把擂台当成舞池——不过领舞的人，只能是我！'],
        win: '哈哈！你的节奏全乱啦。跳舞和打拳，都得练！',
        lose: '呼……这一曲，是你赢了。跳得漂亮，朋友！'
      },
      opp_north: { // 艾丽娅·诺尔（第 13 名 · 北方防守反击）：克制冷静、耐心
        pre: ['北方的冬天教会我一件事：等。等你的拳头先冷下来。', '雪落无声，我的反击也一样。等你察觉，已经晚了。'],
        win: '极夜里站到最后的人，从来都不是喊得最响的那个。',
        lose: '雪化了……原来我的耐心，还没练到家。'
      },
      opp_muscle: { // 岩宫刚子（第 14 名 · 肌肉力量型）：豪爽大姐头
        pre: ['看见这身肌肉了吗？这可是十年汗水堆出来的！你的拳头，够格吗？', '大姐我打架不玩虚的——接得住三拳，算你有本事！'],
        win: '哈哈哈！力量就是正义！回去多吃点肉再来！',
        lose: '嘶——疼死我了……行，你的拳头比我的肌肉还硬，服气！'
      },
      opp_korea_style: { // 韩凛（第 15 名 · 韩式快拳新锐）：干练好胜、带点紧绷
        pre: ['别小看我排在第十五——往上爬的路，我一步都不会让。', '我的拳速录像你看过吧？没看过也没关系，反正你也跟不上。'],
        win: '赢了！……呼，差点以为要输。这场，算我状态好。',
        lose: '可恶……明明就差一点！下次，下次我绝对不会再输了！'
      }
    };
    var FOE_LINES_GENERIC = {
      pre: ['排名什么的无所谓——擂台上见真章，来吧！', '我最近状态正好，你可要小心了。', '别紧张，放开打。输了，也算积累经验。', '这一场，我可是冲着赢来的。'],
      win: ['打得不错，但赢的人是我。回去再练练吧。', '呼……险胜。你的拳头，比想象中重。'],
      lose: ['是我输了……你的实力，名不虚传。', '甘拜下风。下次再战，我不会再输了。']
    };
    function foeLine(key, kind) {
      var e = key ? FOE_LINES[key] : null;
      var v = e ? e[kind] : null;
      if (Array.isArray(v) && v.length) return v[Math.floor(Math.random() * v.length)];
      if (typeof v === 'string' && v) return v;
      var g = FOE_LINES_GENERIC[kind] || FOE_LINES_GENERIC.pre;
      return g[Math.floor(Math.random() * g.length)];
    }

    /* ================= 正式版批次 G9 短期（plan T8）：卫冕战挑战宣言 =================
       玩家登顶（国内第 1 名）后，高排名具名角色以「约战升级版」发起卫冕挑战（通道与结算见
       battle.js 的卫冕战一节）；这里只放挑战者下战书时的专属宣言：高频挑战者（初始前 8 名）
       各 1 条，其余走通用池（2 条轮换）。【新增文案·待用户审】清单见 plan/04_CHANGELOG G9 条。 */
    var DEFENSE_LINES = {
      opp_world_champion: '王座是我让出去的吗？不——是你抢走的。这次，我亲手拿回来。', // 伊芙琳：前冠军的复仇战
      opp_crimson: '冠军的位子，我盯了很久了。别躲，正面来——输的人，把第 1 名留下！', // 薇拉
      opp_champion_domestic: '礼仪课没教过怎么输。所以这一场，我只能赢。', // 白鸟丽华
      opp_legend: '我打冠军战的时候，你还没进这家拳馆呢。让我看看新王的成色。', // 白霜华
      opp_asia: '沙漠里没人让着谁。冠军，我来拿了。', // 萨菲娅
      opp_saint: '愿这一战干净利落——冠军之名，不该落在怯懦者头上。', // 塞西莉亚
      opp_amazon: '丛林的规矩：最强的那个，站在最高处。现在，换我站。', // 塔娅
      opp_counter: '……正式赛的规格，我说过吧。这一战，我等了很久了。' // 沈墨凛：呼应约战赛后对白
    };
    var DEFENSE_LINES_GENERIC = [
      '冠军只有一个。下一场，我来当那一个。',
      '别以为坐上第 1 名就结束了——我就是冲你来的。'
    ];
    function defenseLine(key) {
      if (key && DEFENSE_LINES[key]) return DEFENSE_LINES[key];
      return DEFENSE_LINES_GENERIC[personaHash(String(key || '')) % DEFENSE_LINES_GENERIC.length];
    }

    var APPEARANCE = {
      hair: {
        ponytail: { name: '高马尾', src: 'assets/portrait.webp' },
        hime: { name: '公主切', src: 'assets/portrait/hair_hime.webp' },
        waves: { name: '大波浪', src: 'assets/portrait/hair_waves.webp' },
        halfup: { name: '半扎发', src: 'assets/portrait/hair_halfup.webp' },
        short: { name: '超短发', src: 'assets/portrait/hair_short.webp' },
        braid: { name: '麻花辫', src: 'assets/portrait/hair_braid.webp' },
        longstraight: { name: '黑长直', src: 'assets/portrait/hair_longstraight.webp' },
        bun: { name: '丸子头', src: 'assets/portrait/hair_bun.webp' },
        waterwaves: { name: '水波纹', src: 'assets/portrait/hair_waterwaves.webp' }
      },
      face: {
        default: { name: '默认', src: 'assets/portrait.webp' },
        round: { name: '圆润', src: 'assets/portrait/face_round.webp' },
        oval: { name: '瓜子', src: 'assets/portrait/face_oval.webp' }
      },
      outfit: {
        default: { name: '默认', src: 'assets/portrait.webp' },
        robe: { name: '登场战袍', src: 'assets/portrait/outfit_robe.webp' },
        training: { name: '训练服', src: 'assets/portrait/outfit_training.webp' },
        short_training: { name: '短款训练服', src: 'assets/portrait/outfit_short_training.webp' },
        short_vest: { name: '短款背心', src: 'assets/portrait/outfit_short_vest.webp' },
        short_cami: { name: '吊带款', src: 'assets/portrait/outfit_short_cami.webp' },
        wide_strap: { name: '宽肩带', src: 'assets/portrait/outfit_wide_strap.webp' },
        racerback: { name: '工字背', src: 'assets/portrait/outfit_racerback.webp' },
        cross_back: { name: '交叉美背', src: 'assets/portrait/outfit_cross_back.webp' },
        halter: { name: '挂脖款', src: 'assets/portrait/outfit_halter.webp' },
        zip: { name: '拉链款', src: 'assets/portrait/outfit_zip.webp' }
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

    /* ================= Phase 9：成就系统（纯荣誉，不发任何数值/现金奖励） =================
       判定只读 S 已有字段；唯一例外是累计 KO 胜场 koWins——原先没有这个计数，
       由比赛结算处纯计数写入（见 battle.js settleNow），不参与任何胜负/数值逻辑。
       「累计赚取」无现成字段（S.money 是余额不是累计值），不做，不新造口径。
       图鉴集齐 10 款成就与 DEX_ACH 的现金里程碑是两回事：成就只记录展示，不重复发奖。 */
    var ACH_CATEGORIES = [
      { id: 'battle', name: '战斗', icon: '⚡' },
      { id: 'career', name: '生涯', icon: '★' },
      { id: 'gear', name: '装备 / 经营', icon: '◆' },
      { id: 'story', name: '情感 / 剧情', icon: '♥' }
    ];
    function achBadge(catId, off) { // D3：成就类别徽章（样式在 css .ach-badge.cat-*，未解锁传 off 灰显）
      var cat = null;
      ACH_CATEGORIES.forEach(function (c) { if (c.id === catId) cat = c; });
      if (!cat) return '';
      return '<span class="ach-badge cat-' + cat.id + (off ? ' off' : '') + '" aria-hidden="true">' + cat.icon + '</span>';
    }
    var ACHIEVEMENTS = [
      /* ---- 战斗 ---- */
      { id: 'first_win', cat: 'battle', name: '初尝胜果', desc: '赢得第 1 场比赛',
        check: function (s) { return (s.wins || 0) >= 1; } },
      { id: 'wins_10', cat: 'battle', name: '十胜俱乐部', desc: '累计赢得 10 场比赛',
        check: function (s) { return (s.wins || 0) >= 10; } },
      { id: 'wins_25', cat: 'battle', name: '常胜之师', desc: '累计赢得 25 场比赛',
        check: function (s) { return (s.wins || 0) >= 25; } },
      { id: 'wins_50', cat: 'battle', name: '半百荣光', desc: '累计赢得 50 场比赛',
        check: function (s) { return (s.wins || 0) >= 50; } },
      { id: 'first_ko', cat: 'battle', name: '一击入魂', desc: '首次以 KO / TKO 赢得比赛',
        check: function (s) { return (s.koWins || 0) >= 1; } },
      { id: 'ko_10', cat: 'battle', name: 'KO 艺术家', desc: '累计以 KO / TKO 赢得 10 场比赛',
        check: function (s) { return (s.koWins || 0) >= 10; } },
      { id: 'streak_3', cat: 'battle', name: '势如破竹', desc: '取得 3 连胜',
        check: function (s) { return (s.winStreak || 0) >= 3; } },
      { id: 'streak_5', cat: 'battle', name: '无人能挡', desc: '取得 5 连胜',
        check: function (s) { return (s.winStreak || 0) >= 5; } },
      /* 修复批次 C（M7 中期锚点）：streak_10 / spar_first 补在战斗类——连胜长线与约战系统各给一个中期目标 */
      { id: 'streak_10', cat: 'battle', name: '十全十美', desc: '取得 10 连胜',
        check: function (s) { return (s.winStreak || 0) >= 10; } },
      { id: 'spar_first', cat: 'battle', name: '擂台之约', desc: '完成第 1 场约战（不计排名的指名挑战）',
        check: function (s) { return (s.sparFights || 0) >= 1; } },
      /* ---- 生涯 ---- */
      { id: 'rank_25', cat: 'career', name: '跻身前列', desc: '国内排名进入前 25',
        check: function (s) { return (s.rank || 50) <= 25; } },
      { id: 'rank_10', cat: 'career', name: '国内十强', desc: '国内排名进入前 10',
        check: function (s) { return (s.rank || 50) <= 10; } },
      { id: 'rank_1', cat: 'career', name: '登顶国内', desc: '国内排名达到第 1 名',
        check: function (s) { return (s.rank || 50) <= 1; } },
      { id: 'influence_3', cat: 'career', name: '声名鹊起', desc: '影响力达到 Lv3（10 胜或排名前 25）',
        check: function (s) { return (s.wins || 0) >= 10 || (s.rank || 50) <= 25; } },
      { id: 'influence_5', cat: 'career', name: '传奇之名', desc: '影响力达到 Lv5（排名第 1 名）',
        check: function (s) { return (s.rank || 50) <= 1; } },
      { id: 'stage_4', cat: 'career', name: '国内顶尖之路', desc: '到达生涯阶段 4「国内顶尖」',
        check: function (s) { return (s.stage || 1) >= 4 || (s.completedStages || []).indexOf(4) >= 0; } },
      { id: 'stage_6', cat: 'career', name: '传奇之路', desc: '到达生涯阶段 6「传奇之路」',
        check: function (s) { return (s.stage || 1) >= 6 || (s.completedStages || []).indexOf(6) >= 0; } },
      /* 修复批次 C（M7 中期锚点）：弑王者——与阶段 5 的「击败伊芙琳」通道共用 S.beatChamp（批次 C 起记录，老档无此字段时按未达成计，无法追溯） */
      { id: 'champ_slayer', cat: 'career', name: '弑王者', desc: '在正式比赛中击败国内第 1 名伊芙琳',
        check: function (s) { return !!s.beatChamp; } },
      /* 正式版批次 G9 短期（plan T8）：卫冕锚点——与阶段 6 的卫冕目标共用同一计数 S.defenses（卫冕战胜利累计，不另起计数；老档无此字段时按 0 计，无法追溯）【新增文案·待用户审】 */
      { id: 'defend_1', cat: 'career', name: '王座守卫', desc: '首次在卫冕战中击败挑战者，守住国内冠军',
        check: function (s) { return (s.defenses || 0) >= 1; } },
      { id: 'defend_3', cat: 'career', name: '三度卫冕', desc: '累计卫冕成功 3 场（与阶段 6「传奇之路」的卫冕目标对齐）',
        check: function (s) { return (s.defenses || 0) >= 3; } },
      /* ---- 装备 / 经营 ---- */
      { id: 'first_craft', cat: 'gear', name: '亲手打造', desc: '在工坊打造第 1 件装备',
        check: function (s) { return (s.customGear || []).some(function (g) { return g && g.source === 'craft'; }); } },
      { id: 'enh_5', cat: 'gear', name: '千锤百炼', desc: '任意装备强化到 +5',
        check: function (s) { return Object.keys(s.enh || {}).some(function (k) { return (s.enh[k] || 0) >= 5; }); } },
      { id: 'enh_10', cat: 'gear', name: '登峰造极', desc: '任意装备强化到 +10（满级）',
        check: function (s) { return Object.keys(s.enh || {}).some(function (k) { return (s.enh[k] || 0) >= 10; }); } },
      { id: 'dex_10', cat: 'gear', name: '图鉴收藏家', desc: '装备图鉴集齐 10 款（成就只作记录，图鉴现金奖励见图鉴区）',
        check: function (s) { return (s.dexSigs || []).length >= 10; } },
      { id: 'sponsor_any', cat: 'gear', name: '商业首秀', desc: '签约任意一家赞助商',
        check: function (s) { return !!s.sponsor; } },
      /* 修复批次 C（M7 中期锚点）：经营类补两件——首次定制（与「亲手打造」分开计）与持金破万 */
      { id: 'custom_first', cat: 'gear', name: '量身定制', desc: '在用品店定制第 1 副拳套',
        check: function (s) { return (s.customGear || []).some(function (g) { return g && g.source === 'custom'; }); } },
      { id: 'money_10k', cat: 'gear', name: '小有积蓄', desc: '持有金钱达到 ¥10,000',
        check: function (s) { return (s.money || 0) >= 10000; } },
      /* ---- 情感 / 剧情 ---- */
      { id: 'prologue_done', cat: 'story', name: '命运的测力机', desc: '完成序章',
        check: function (s) { return !!(s.story && s.story.prologueDone); } },
      { id: 'affinity_60', cat: 'story', name: '亲近信赖', desc: '任意角色好感达到 60',
        check: function (s) { var a = (s.story && s.story.affinity) || {}; return Object.keys(a).some(function (k) { return (a[k] || 0) >= 60; }); } },
      { id: 'affinity_90', cat: 'story', name: '心意相通', desc: '任意角色好感达到 90',
        check: function (s) { var a = (s.story && s.story.affinity) || {}; return Object.keys(a).some(function (k) { return (a[k] || 0) >= 90; }); } },
      /* 修复批次 C（M7 中期锚点）：宿敌约战累计——约战是宿敌好感的保底接触通道，给它一个中期计数目标 */
      { id: 'spar_rival_3', cat: 'story', name: '宿敌之约', desc: '与沈墨凛约战累计 3 次',
        check: function (s) { return (s.sparRival || 0) >= 3; } }
    ];
