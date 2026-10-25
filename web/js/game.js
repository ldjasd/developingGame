    'use strict';
    function trainingById(id) { var t = null; TRAININGS.forEach(function (x) { if (x.id === id) t = x; }); return t; }
    function allGear() { return SHOP_GEAR.concat(S.customGear || []); }
    function gearById(id) { var g = null; allGear().forEach(function (x) { if (x.id === id) g = x; }); return g; }
    function materialById(id) { var m = null; MATERIALS.forEach(function (x) { if (x.id === id) m = x; }); return m; }
    function materialName(id) { var m = materialById(id); return m ? m.name : id; }
    var pendingAchNotice = [];
    function attrNameOf(key) { var n = key; ATTRS.forEach(function (a) { if (a.key === key) n = a.name; }); return n; }
    function bonusDesc(bonus) {
      var parts = [];
      Object.keys(bonus || {}).forEach(function (k) { if (bonus[k]) parts.push(attrNameOf(k) + ' ' + (bonus[k] > 0 ? '+' : '') + bonus[k]); });
      return parts.length ? parts.join(' · ') : '无属性加成';
    }
    function gloveSig(sel) { return sel.pattern + '|' + sel.outer + '|' + sel.lining + '|' + sel.oz + '|' + sel.fix; }
    function computeGlove(sel) {
      var p = GLOVE_PATTERNS[sel.pattern], o = GLOVE_OUTERS[sel.outer], l = GLOVE_LININGS[sel.lining];
      var oz = GLOVE_OZ[sel.oz] || GLOVE_OZ[12], fx = GLOVE_FIX[sel.fix] || GLOVE_FIX.velcro;
      var bonus = {};
      [p.bonus, o.bonus, l.bonus, oz.bonus, fx.bonus].forEach(function (b) {
        Object.keys(b).forEach(function (k) { bonus[k] = (bonus[k] || 0) + b[k]; });
      });
      Object.keys(bonus).forEach(function (k) { if (!bonus[k]) delete bonus[k]; });
      var price = clamp(p.base + o.price + l.price + oz.adj + fx.price, 800, 6000);
      var shortName = p.name.replace('系', '') + o.name + sel.oz + 'oz';
      return {
        price: price, bonus: bonus, shortName: shortName,
        desc: p.name + ' · ' + o.name + '外皮 · ' + l.name + '内衬 · ' + sel.oz + 'oz · ' + fx.name + ' — ' + bonusDesc(bonus),
        breakdown: '版型 ¥' + p.base + ' + 外皮 ¥' + o.price + ' + 内衬 ¥' + l.price + ' + 盎司 ' + (oz.adj >= 0 ? '+' : '−') + '¥' + Math.abs(oz.adj) + ' + 固定 ¥' + fx.price,
        notes: [p.note, o.note, l.note, oz.note, fx.note].join('；')
      };
    }
    function makeCustomGear(sel, source) {
      var c = computeGlove(sel);
      S.customSeq = (S.customSeq || 0) + 1;
      return {
        id: (source === 'craft' ? 'craft' : 'custom') + '-' + S.customSeq,
        slot: 'gloves',
        name: (source === 'craft' ? '打造·' : '定制·') + c.shortName + '拳套',
        price: c.price, desc: c.desc, bonus: c.bonus,
        custom: { pattern: sel.pattern, outer: sel.outer, lining: sel.lining, oz: sel.oz, fix: sel.fix },
        source: source, sig: 'combo:' + gloveSig(sel)
      };
    }
    function dexCount() { return (S.dexSigs || []).length; }
    function registerDex(g) {
      if (!g) return;
      var sig = g.sig || (g.custom ? 'combo:' + gloveSig(g.custom) : 'shop:' + g.id);
      if (!Array.isArray(S.dexSigs)) S.dexSigs = [];
      if (S.dexSigs.indexOf(sig) < 0) S.dexSigs.push(sig);
      checkDexAchievements();
    }
    function checkDexAchievements() {
      if (!Array.isArray(S.dexAch)) S.dexAch = [];
      DEX_ACH.forEach(function (a) {
        if (dexCount() >= a.need && S.dexAch.indexOf(a.id) < 0) {
          S.dexAch.push(a.id);
          S.money += a.reward;
          if (a.title && S.titles.indexOf(a.title) < 0) S.titles.push(a.title);
          pendingAchNotice.push(a);
          dailyLog('图鉴成就达成：集齐 ' + a.need + ' 款装备！奖励 ¥' + a.reward + ' 已到账' + (a.title ? '，获得称号「' + a.title + '」' : '') + '。', 'good');
        }
      });
    }
    function showAchModalIfPending() {
      if (!pendingAchNotice.length) return false;
      var busy = ['settleModal', 'stageModal', 'helpModal', 'confirmModal', 'achModal', 'storyModal'].some(function (id) { var el = $(id); return el && el.classList.contains('open'); });
      if (busy) return false;
      var list = pendingAchNotice.slice();
      pendingAchNotice = [];
      $('achResult').textContent = list.length === 1 ? '集齐 ' + list[0].need + ' 款装备' : '图鉴成就 ×' + list.length;
      $('achDetail').innerHTML = list.map(function (a) {
        return '<p style="text-align:center;margin:6px 0">图鉴收集达到 <b>' + a.need + ' 款</b><br />奖励 <b style="color:var(--gold)">¥' + a.reward + '</b> 已到账' +
          (a.title ? '<br />获得称号：<span class="title-badge">' + a.title + '</span>' : '') + '</p>';
      }).join('') + '<p style="text-align:center">当前图鉴进度：<b>' + dexCount() + ' 款</b>' + (dexCount() < 10 ? '，离 10 款里程碑还差 ' + (10 - dexCount()) + ' 款。' : '，图鉴里程碑已全部达成！') + '</p>';
      $('achModal').classList.add('open');
      save();
      return true;
    }
    function imgKeyFor(g) { return g.custom ? 'pattern-' + g.custom.pattern : g.id; }
    function gearImgHTML(g, cls) {
      if (!g) return '';
      var key = imgKeyFor(g);
      var src = GEAR_IMG_SRC[key] || '';
      return '<img class="gear-img ' + (cls || '') + '" data-gear-img="' + key + '" src="' + src + '" alt="' + g.name + ' 单品图" loading="lazy" />';
    }
    function materialsHTML() {
      return '<div class="mat-grid">' + MATERIALS.map(function (m) {
        return '<span class="mat-chip">' + m.kind + ' · ' + m.name + ' <b class="num">×' + ((S.materials && S.materials[m.id]) || 0) + '</b></span>';
      }).join('') + '</div>';
    }

    function consumableById(id) { var c = null; CONSUMABLES.forEach(function (x) { if (x.id === id) c = x; }); return c; }
    function stageById(id) { var d = null; STAGES.forEach(function (x) { if (x.id === id) d = x; }); return d; }
    function winsAfterChamp(s) { return (typeof s.champWinBase === 'number') ? Math.max(0, s.wins - s.champWinBase) : 0; }
    function sponsorById(id) { var sp = null; SPONSORS.forEach(function (x) { if (x.id === id) sp = x; }); return sp; }
    function currentSponsor() { return S.sponsor ? sponsorById(S.sponsor) : null; }
    var FOE_STYLE_KEYS = Object.keys(FOE_STYLES);
    var ROSTER_BY_KEY = {};
    ROSTER_DEF.forEach(function (d) { ROSTER_BY_KEY[d.key] = d; });
    function rosterRatingFor(rank, week) { return Math.round((9.3 + (50 - rank) * 0.3 + 0.7 * (Math.max(1, week || 1) - 1)) * 100) / 100; }
    /* 建池：玩家占 playerRank，其余名次（1~50 中除玩家外）按名册顺序填满，胡小桃恒为候补（rank=0）。
       新档 playerRank=50 时即名册 1~49 名顺序入榜；迁移时按玩家当前名次插入。 */
    function buildRoster(playerRank, week) {
      var pr = clamp(Math.round(playerRank) || 50, 1, 50);
      var roster = [], idx = 0;
      for (var r = 1; r <= 50; r++) {
        if (r === pr) continue;
        var def = ROSTER_DEF[idx]; idx++;
        roster.push({ key: def.key, name: def.name, style: def.style, growth: def.growth, rating: rosterRatingFor(r, week), rank: r });
      }
      var hu = ROSTER_DEF[ROSTER_DEF.length - 1];
      roster.push({ key: hu.key, name: hu.name, style: hu.style, growth: hu.growth, rating: rosterRatingFor(49, week), rank: 0 });
      return roster;
    }
    function rosterValid(r) {
      if (!Array.isArray(r) || r.length !== ROSTER_DEF.length) return false;
      var seen = {};
      for (var i = 0; i < r.length; i++) {
        var e = r[i];
        if (!e || typeof e !== 'object' || typeof e.key !== 'string' || !ROSTER_BY_KEY[e.key] || seen[e.key]) return false;
        if (typeof e.rating !== 'number' || isNaN(e.rating) || typeof e.rank !== 'number' || isNaN(e.rank)) return false;
        seen[e.key] = true;
      }
      return true;
    }
    function ensureRoster() {
      if (!rosterValid(S.roster)) S.roster = buildRoster(S.rank, weekOf(S.day));
      else S.roster.forEach(function (m) { var d = ROSTER_BY_KEY[m.key]; if (d) { m.name = d.name; m.style = d.style; m.growth = d.growth; } });
    }
    /* 阶梯顶替：玩家从当前名次移到 newRank，介于其间的池内成员名次逐一向旧名次方向平移一位 */
    function applyRankShift(newRank) {
      ensureRoster();
      var oldRank = S.rank;
      newRank = clamp(Math.round(newRank), 1, 50);
      if (newRank === oldRank) return;
      S.roster.forEach(function (m) {
        if (m.rank <= 0) return;
        if (newRank < oldRank) { if (m.rank >= newRank && m.rank < oldRank) m.rank += 1; }
        else if (m.rank > oldRank && m.rank <= newRank) m.rank -= 1;
      });
      S.rank = newRank;
    }
    /* 每周成长：按成长类型给全池（含候补）加 rating，再按 rating 重排全榜；
       玩家名次由「参考 rating」被动决定且每周至多漂移 ±3。基准线 0.70/周与旧公式周数项对齐。 */
    function growthDelta(growth, week) {
      switch (growth) {
        case 'steady':   return 0.70 + rnd(-0.15, 0.25);
        case 'early':    return week <= 8 ? 0.95 + rnd(0, 0.3) : week <= 20 ? 0.75 : 0.50 + rnd(-0.1, 0.1);
        case 'late':     return week <= 8 ? 0.45 : week <= 20 ? 0.95 : 1.15 + rnd(0, 0.3);
        case 'volatile': return 0.70 + rnd(-1.1, 1.1);
        case 'genius':   return 0.95 + rnd(0, 0.35);
        case 'veteran':  return 0.35 + rnd(-0.15, 0.15);
        default:         return 0.70;
      }
    }
    function weeklyRosterGrowth(newWeek) {
      ensureRoster();
      var oldRank = S.rank;
      S.roster.forEach(function (m) { m.rating = clamp(Math.round((m.rating + growthDelta(m.growth, newWeek)) * 100) / 100, 6, 30); });
      // 候补规则：第 3 周胡小桃强制入榜顶替末位；此后候补 rating 高出末位 0.5 以上则互换
      var reserve = null, lastRanked = null;
      S.roster.forEach(function (m) {
        if (m.rank === 0) reserve = m;
        if (m.rank > 0 && (!lastRanked || m.rank > lastRanked.rank)) lastRanked = m;
      });
      if (reserve && lastRanked) {
        if (newWeek === 3) {
          reserve.rating = Math.round((lastRanked.rating - 0.1) * 100) / 100;
          reserve.rank = lastRanked.rank; lastRanked.rank = 0;
        } else if (newWeek > 3 && reserve.rating > lastRanked.rating + 0.5) {
          var lr = lastRanked.rank; lastRanked.rank = 0; reserve.rank = lr;
        }
      }
      // 重排：玩家参考 rating = 9.3 + (50 − 旧名次) × 0.3 + 0.7 × (周 − 1)（截距与 rating 映射一致）；池内成员按 rating 降序填其余名次
      var ref = 9.3 + (50 - oldRank) * 0.3 + 0.7 * (newWeek - 1);
      var above = 0;
      S.roster.forEach(function (m) { if (m.rating > ref) above++; });
      var newRank = clamp(clamp(1 + above, Math.max(1, oldRank - 3), Math.min(50, oldRank + 3)), 1, 50);
      var ranked = S.roster.filter(function (m) { return m.rank > 0; }).sort(function (a, b) { return b.rating - a.rating; });
      var ri = 1;
      ranked.forEach(function (m) { if (ri === newRank) ri++; m.rank = ri; ri++; });
      S.rank = newRank;
      if (newRank !== oldRank) dailyLog('第 ' + newWeek + ' 周排名重排：池内选手一周成长后，你的国内排名变为第 ' + newRank + ' 名（原第 ' + oldRank + ' 名）。', newRank < oldRank ? 'good' : 'bad');
    }
    /* Phase 4：反击方向 → 加成拳种（后闪→直拳 / 下闪→上勾 / 侧闪→摆拳） */
    var COUNTER_PREF = { back: 'straight', down: 'upper', side: 'hook' };
    var COUNTER_PREF_TXT = { back: '后闪→直拳', down: '下闪→上勾拳', side: '侧闪→摆拳' };
    function comboBonusPct(combo) { if (combo <= 1) return 0; if (combo === 2) return 5; if (combo === 3) return 15; return 25; } // 2连+5%、3连+15%、4连及以上+25%封顶
    /* Phase 4 修订：KO 重创槽 —— 有效命中积累（格挡只积一半），满 100 直接 KO
       第二轮回炉 P0-1（实测调校）：重创值 刺6/直12/上勾18/摆18/击腹12、衰减 6/秒。
       阈值恢复复测（第二轮回炉曾越权抬高单次 KO 阈值与击倒带，已恢复用户拍板值 30% / 25%~30%；
       重创值与衰减经复测无需再动，保持 刺6/直12/上勾18/摆18/击腹12、衰减 6/秒）：第 1 周自动 200 场实测
       打到第 2 回合 67.5%、第 3 回合或点数 36.0%、重创 KO 34.0%（1000 场复核 69.4% / 39.6% / 32.8%），三线达标。 */
    var PUNCH_KO = { jab: 6, straight: 12, upper: 18, hook: 18, body: 12 };
    var KO_DECAY = 6; // 重创槽每秒衰减
    var BREAK_TACTICS = { attack: { name: '强攻' }, balanced: { name: '均衡' }, guard: { name: '稳守' } };
    function freshRoundStats() { return { meHits: 0, foeHits: 0, meDmg: 0, foeDmg: 0, meMaxCombo: 0, foeMaxCombo: 0 }; }
    function decayTrauma(dt) { if (!B) return; B.meTrauma = Math.max(0, (B.meTrauma || 0) - KO_DECAY * dt); B.foeTrauma = Math.max(0, (B.foeTrauma || 0) - KO_DECAY * dt); }
    var SAVE_KEY = 'boxing-phase1-save-v1';
    var BACKUP_KEY = 'boxing-phase1-save-backup-v1'; // 测试档：主存档独立备份槽
    var TEST_MONEY = 100000; // 测试档开局资金
    var ROUND_SECONDS = 45, ROUNDS = 3, TICK_MS = 500;

    /* ================= 状态 ================= */
    function defaultState() {
      return {
        day: 1, ap: 6, money: 100, stamina: 100, injury: 0, fame: 0, rank: 50,
        roster: buildRoster(50, 1), // 角色池：新档按名册顺序建池（玩家第 50 名，胡小桃候补）
        influence: 1, stage: 1, completedStages: [], winStreak: 0, champWinBase: null, titles: [], sponsor: null,
        wins: 0, losses: 0, lastMatchDay: 0, deathFight: false, testMode: false,
        name: '小拳', mind: 60, scoutedForDay: 0,
        gear: { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null },
        owned: [], enh: {},
        materials: { synthetic: 0, calf: 0, goat: 0, kangaroo: 0, latex: 0, gel: 0, horsehair: 0 },
        customGear: [], customSeq: 0, dexSigs: [], dexAch: [],
        bag: { drink: 0, bandage: 0, meal: 0 },
        buffs: { drink: false, bandage: false, meal: false },
        appearance: { hair: 'ponytail', face: 'default', body: 'standard', outfit: 'default', lastDim: 'hair' },
        story: { prologueDone: false, seenEvents: [], affinity: { senior: 0, manager: 0, rival: 0, teammate: 0 } },
        attrs: { power: 10, endurance: 10, will: 10, speed: 10, accuracy: 10, footwork: 10, defense: 10, technique: 10 },
        punchExp: { jab: 0, straight: 0, hook: 0, upper: 0, body: 0 },
        logs: []
      };
    }
    var S = defaultState();
    /* ================= Phase 6：捏人 / 换装 / 换发型 =================
       显示规则：立绘图片只由最近一次切换的维度决定（发型 / 脸型 / 服装取最后一次切换的），
       体型只做 CSS 纵向缩放并恒叠加其上。9×3×3 全组合需 81 张图，本期不做全组合拼图，
       只用 13 张立绘图片代表变体：v8 默认立绘（高马尾 / 默认脸 / 默认服装）＋ 12 张新图
       （发型 8 张、脸型 2 张、服装 2 张；高马尾直接复用 v8 立绘）。
       本块只新增外观状态与渲染，不改战斗 / 装备 / 排名 / 影响力逻辑。 */
    function normalizeAppearance(a) {
      var d = defaultState().appearance;
      if (!a || typeof a !== 'object') return { hair: d.hair, face: d.face, body: d.body, outfit: d.outfit, lastDim: d.lastDim };
      return {
        hair: APPEARANCE.hair[a.hair] ? a.hair : d.hair,
        face: APPEARANCE.face[a.face] ? a.face : d.face,
        body: APPEARANCE.body[a.body] ? a.body : d.body,
        outfit: APPEARANCE.outfit[a.outfit] ? a.outfit : d.outfit,
        lastDim: (a.lastDim === 'face' || a.lastDim === 'outfit') ? a.lastDim : 'hair'
      };
    }
    function portraitSrc() {
      var ap = normalizeAppearance(S.appearance);
      if (ap.lastDim === 'face') return APPEARANCE.face[ap.face].src;
      if (ap.lastDim === 'outfit') return APPEARANCE.outfit[ap.outfit].src;
      return APPEARANCE.hair[ap.hair].src;
    }
    function renderAppearance() {
      var img = $('portraitImg'); if (!img) return;
      S.appearance = normalizeAppearance(S.appearance);
      img.src = portraitSrc();
      var sc = APPEARANCE.body[S.appearance.body].scale;
      img.style.transform = (sc === 1) ? '' : ('scaleY(' + sc + ')');
      img.style.transformOrigin = 'top center';
      Array.prototype.forEach.call(document.querySelectorAll('[data-app-dim]'), function (b) {
        var dim = b.getAttribute('data-app-dim');
        b.classList.toggle('active', S.appearance[dim] === b.getAttribute('data-app-val'));
      });
    }
    function setAppearance(dim, val) {
      if (!APPEARANCE[dim] || !APPEARANCE[dim][val]) return;
      S.appearance = normalizeAppearance(S.appearance);
      S.appearance[dim] = val;
      if (dim !== 'body') S.appearance.lastDim = dim; // 体型不改变“最后切换维度”，只叠加缩放
      renderAppearance();
      save();
    }

    function punchLevel(exp) { return Math.min(6, Math.floor(exp / 100)); }
    /* ================= 心态 / 装备 ================= */
    function mindTierName(v) { return v >= 80 ? '高昂' : v >= 60 ? '良好' : v >= 40 ? '平稳' : v >= 20 ? '紧张' : '疲劳'; }
    function mindTrainEff() { if (S.mind >= 80) return 1.1; if (S.mind < 20) return 0.85; return 1; }
    function changeMind(delta) {
      if (!delta) return;
      var before = mindTierName(S.mind);
      S.mind = clamp(Math.round(S.mind + delta), 0, 100);
      var after = mindTierName(S.mind);
      if (after !== before) toast('心情变为：' + after + '！');
    }
    /* ================= Phase 5 深化：装备强化 +0~+10（全装备通用） =================
       每级：该装备每项数值属性 +1，减伤类 +1%；费用 ¥200×(等级+1) + 对应材料 ×(等级+1)，成功率 100%。
       材料种类：拳套/护头/战袍/战靴用皮料，护齿/护腕用内衬（取该装备拆解产出的对应材料）。 */
    var ENH_MAX = 10;
    function enhOf(id) { var v = (S.enh && S.enh[id]) || 0; return (typeof v === 'number' && v > 0) ? Math.min(ENH_MAX, Math.floor(v)) : 0; }
    function effBonusOf(g) { // 含强化等级的有效属性加成（P2-6：强化只加正向属性，负加成保持不变，保留装备取舍）
      var lvl = enhOf(g.id), b = {};
      Object.keys(g.bonus || {}).forEach(function (k) { b[k] = g.bonus[k] > 0 ? g.bonus[k] + lvl : g.bonus[k]; });
      return b;
    }
    function effDrOf(g) { return g.dr ? g.dr + enhOf(g.id) : 0; } // 有效减伤%
    function gearDrPct() { // 全部已装备减伤合计（护齿 + 冠军护头等叠加）
      var t = 0;
      Object.keys(S.gear).forEach(function (slot) {
        var g = S.gear[slot] ? gearById(S.gear[slot]) : null;
        if (g) t += effDrOf(g);
      });
      return t;
    }
    function bonusDescAt(g, lvl) { // 指定强化等级下的完整效果说明（属性 + 减伤；P2-6：负加成不随强化翻转）
      var b = {};
      Object.keys(g.bonus || {}).forEach(function (k) { b[k] = g.bonus[k] > 0 ? g.bonus[k] + lvl : g.bonus[k]; });
      var parts = [], bd = bonusDesc(b);
      if (bd !== '无属性加成') parts.push(bd);
      if (g.dr) parts.push('减伤 ' + (g.dr + lvl) + '%');
      return parts.length ? parts.join(' · ') : '无加成';
    }
    function gearDispName(g) { var lvl = enhOf(g.id); return g.name + (lvl > 0 ? ' +' + lvl : ''); }
    function gearEffDesc(g) { return enhOf(g.id) > 0 ? bonusDescAt(g, enhOf(g.id)) : g.desc; }
    function enhYieldFor(g) { // 强化消耗的材料：[皮料, 内衬] 取对应的一种
      if (g.custom) return [g.custom.outer, g.custom.lining];
      return DISMANTLE_MAP[g.id] || ['synthetic', 'latex'];
    }
    function enhCost(g) {
      var lvl = enhOf(g.id), y = enhYieldFor(g);
      var matId = (g.slot === 'guard' || g.slot === 'wrist') ? y[1] : y[0];
      return { lvl: lvl, money: 200 * (lvl + 1), matId: matId, matCount: lvl + 1 };
    }
    function enhShortage(g) { // 返回 {money:boolean, mat:boolean}，材料/金钱是否不足
      var c = enhCost(g);
      return { money: S.money < c.money, mat: ((S.materials && S.materials[c.matId]) || 0) < c.matCount, cost: c };
    }
    function confirmEnhance(id) {
      var g = gearById(id);
      if (!g || S.owned.indexOf(id) < 0) return;
      var c = enhCost(g);
      if (c.lvl >= ENH_MAX) { toast(g.name + ' 已强化满级（+10）'); return; }
      var sh = enhShortage(g), lack = sh.money || sh.mat;
      askConfirm({
        title: '强化装备 · ' + g.name + ' +' + c.lvl + ' → +' + (c.lvl + 1),
        lines: [
          ['费用', '¥' + S.money + ' → ¥' + (S.money - c.money) + '（−' + c.money + '）'],
          ['材料', materialName(c.matId) + ' ×' + c.matCount + '（现有 ' + ((S.materials && S.materials[c.matId]) || 0) + '）'],
          ['当前效果', bonusDescAt(g, c.lvl)],
          ['强化后效果', bonusDescAt(g, c.lvl + 1)],
          ['成功率', '100%（不会失败）']
        ],
        note: lack ? '条件不足：' + (sh.money ? '金钱不够（需 ¥' + c.money + '）。' : '') + (sh.mat ? '材料不足：缺 ' + materialName(c.matId) + '（去背包拆解装备获得）。' : '') : '强化对已装备 / 未装备的都立即生效：每项正向属性 +1（负加成保持不变），减伤类再 +1%。最高 +10。',
        okText: '确认强化',
        okDisabled: lack,
        onOk: function () {
          var sh2 = enhShortage(g);
          if (sh2.money || sh2.mat || enhOf(id) >= ENH_MAX) { toast('条件已变化，无法强化'); return; }
          var c2 = sh2.cost;
          if (!S.materials) S.materials = defaultState().materials;
          if (!S.enh) S.enh = {};
          S.money -= c2.money;
          S.materials[c2.matId] -= c2.matCount;
          S.enh[id] = c2.lvl + 1;
          lastAttrs = effAttrs();
          dailyLog('强化装备：' + g.name + ' 强化到 +' + S.enh[id] + '（花费 ¥' + c2.money + '、' + materialName(c2.matId) + ' ×' + c2.matCount + '），效果变为：' + bonusDescAt(g, S.enh[id]) + '。', 'good');
          render();
          toast('强化成功：' + gearDispName(g));
        }
      });
    }
    function gearBonus() {
      var b = {};
      Object.keys(S.gear).forEach(function (slot) {
        var g = S.gear[slot] ? gearById(S.gear[slot]) : null;
        if (g) { var eb = effBonusOf(g); Object.keys(eb).forEach(function (k) { b[k] = (b[k] || 0) + eb[k]; }); }
      });
      return b;
    }
    function effAttrs() { // 基础属性 + 装备加成（属性面板与战斗共用）
      var b = gearBonus(), out = {};
      ATTRS.forEach(function (a) { out[a.key] = S.attrs[a.key] + (b[a.key] || 0); });
      return out;
    }
    /* Phase 2：排名奖金 = 基础(200+周数×100) × (1 + (50−排名)/50)，排名越高奖金越多 */
    /* 第二轮回炉：粉丝系统改为影响力（5 档，不刷数；用户纠正后改为动态档位制）
       Lv1 无名之辈 / Lv2 崭露头角（首胜） / Lv3 声名鹊起（10 胜或排名前 25）
       Lv4 家喻户晓（排名前 10 或 25 胜） / Lv5 传奇（排名第 1 登顶）
       档位 = 按当前胜场/排名取满足条件的最高档，每场结算后与读档时重算，可升可降：
       丢掉第 1 名掉出 Lv5；跌出前 10 且胜场 <25 掉出 Lv4；跌出前 25 且胜场 <10 掉出 Lv3；
       胜场不减少，故靠胜场达成的档位不因单场失利掉（首胜后 Lv2 永不掉）。
       出场费加成按档：0% / +10% / +20% / +35% / +50%，与排名系数叠乘 */
    function influenceName(lv) { var d = INFLUENCE_LEVELS[clamp(Math.round(lv) || 1, 1, 5) - 1]; return d ? d.name : '无名之辈'; }
    function influenceLabel(lv) { return 'Lv' + lv + ' · ' + influenceName(lv); }
    function computedInfluence(s) { // 按最高档优先判断（里程碑：胜场 / 当前排名）
      if (s.rank <= 1) return 5;
      if (s.rank <= 10 || s.wins >= 25) return 4;
      if (s.wins >= 10 || s.rank <= 25) return 3;
      if (s.wins >= 1) return 2;
      return 1;
    }
    function refreshInfluence() { // 动态档位制：档位恒等于按当前胜场/排名算出的最高档，可升可降，
      // 不再取已存档位的最大值（已存档位只作显示缓存，重算后即被覆盖）。
      S.influence = clamp(computedInfluence(S), 1, 5);
      return S.influence;
    }
    function influenceBonusPct() { refreshInfluence(); return INFLUENCE_LEVELS[S.influence - 1].bonus; }
    function influencePrizeMul() { return 1 + influenceBonusPct() / 100; }
    function prizeForRank(w) { return Math.round((200 + w * 100) * (1 + (50 - S.rank) / 50) * influencePrizeMul()); }
    /* ================= Phase 3：阶段 / 粉丝 / 赞助 ================= */
    var pendingStageNotice = []; // 已完成但还没弹祝贺窗的阶段（等结算窗关闭后再弹，避免弹窗叠罗汉）
    var pendingStageReward = 0;
    function rankProgPct(target) { return clamp(Math.round((50 - S.rank) / Math.max(1, 50 - target) * 100), 0, 100); }
    function influenceProgItem(targetLv) {
      var lv = refreshInfluence();
      return { label: '影响力', text: 'Lv' + lv + ' ' + influenceName(lv) + ' / 目标 Lv' + targetLv + ' ' + influenceName(targetLv), pct: clamp(Math.round(lv / targetLv * 100), 0, 100), done: lv >= targetLv };
    }
    function stageProgressItems(stageId) {
      if (stageId === 1) return [
        { label: '获胜场次', text: Math.min(S.wins, 1) + ' / 1', pct: clamp(S.wins * 100, 0, 100), done: S.wins >= 1 }
      ];
      if (stageId === 2) return [
        { label: '国内排名', text: '第 ' + S.rank + ' 名 / 目标 前 40', pct: rankProgPct(40), done: S.rank <= 40 },
        influenceProgItem(2)
      ];
      if (stageId === 3) return [
        { label: '国内排名', text: '第 ' + S.rank + ' 名 / 目标 前 25', pct: rankProgPct(25), done: S.rank <= 25 },
        { label: '连胜', text: (S.winStreak || 0) + ' / 3 连胜', pct: clamp((S.winStreak || 0) / 3 * 100, 0, 100), done: (S.winStreak || 0) >= 3 }
      ];
      if (stageId === 4) return [
        { label: '国内排名', text: '第 ' + S.rank + ' 名 / 目标 前 10', pct: rankProgPct(10), done: S.rank <= 10 },
        influenceProgItem(3)
      ];
      if (stageId === 5) return [
        { label: '国内排名', text: '第 ' + S.rank + ' 名 / 目标 第 1 名', pct: rankProgPct(1), done: S.rank <= 1 },
        influenceProgItem(4)
      ];
      if (stageId === 6) return [
        influenceProgItem(5),
        { label: '登顶后获胜', text: winsAfterChamp(S) + ' / 3' + (S.champWinBase === null || S.champWinBase === undefined ? '（尚未登顶）' : ''), pct: clamp(winsAfterChamp(S) / 3 * 100, 0, 100), done: winsAfterChamp(S) >= 3 }
      ];
      return [];
    }
    function stageProgressHTML() {
      if (S.stage > 6) return '<p class="career-line">全部 6 个阶段已完成——你就是传奇本人。</p>';
      var def = stageById(S.stage);
      if (!def) return '';
      var html = stageProgressItems(def.id).map(function (it) {
        return '<div class="prog-row"><div class="prog-head"><span class="pg-n">' + it.label + '</span>' +
          '<span class="pg-v' + (it.done ? ' done' : '') + '">' + it.text + (it.done ? ' ✓' : '') + '</span></div>' +
          '<div class="progbar"><i class="' + (it.done ? 'done' : '') + '" style="width:' + it.pct + '%"></i></div></div>';
      }).join('');
      return html;
    }
    /* 检查并结算阶段完成：可连环完成多个；奖金立即到账，祝贺窗排队等空闲时弹 */
    function checkStageCompletion() {
      refreshInfluence(); // 生涯阶段条件按当前档位实时判定：先重算档位，再用最新档位检查
      var doneNow = [];
      while (S.stage >= 1 && S.stage <= 6) {
        var def = stageById(S.stage);
        if (!def || !def.check(S)) break;
        S.completedStages.push(def.id);
        S.money += def.reward;
        pendingStageReward += def.reward;
        if (def.title && S.titles.indexOf(def.title) < 0) S.titles.push(def.title);
        if (def.id === 5 && (S.champWinBase === null || S.champWinBase === undefined)) S.champWinBase = S.wins; // ⑥阶段从登顶这一刻起算
        dailyLog('阶段目标完成：「' + def.name + '」！奖励 ¥' + def.reward + ' 已到账' + (def.title ? '，获得称号「' + def.title + '」' : '') + '。', 'good');
        doneNow.push(def);
        pendingStageNotice.push(def);
        S.stage += 1;
      }
      return doneNow;
    }
    function showStageModalIfPending() {
      if (!pendingStageNotice.length) return false;
      // P2-2：弹窗层叠双向检查——结算/图鉴成就/说明/确认任一窗正开时先排队，通知不丢（图鉴窗那边同样会检查阶段窗）
      var busy = ['settleModal', 'achModal', 'helpModal', 'confirmModal', 'storyModal'].some(function (id) { var el = $(id); return el && el.classList.contains('open'); });
      if (busy) return false;
      var list = pendingStageNotice.slice();
      var total = pendingStageReward;
      pendingStageNotice = []; pendingStageReward = 0; // P2-1：只清自己的队列，图鉴成就待发通知不受影响
      $('stageResult').textContent = list.length === 1 ? list[0].name : '连环达成 ×' + list.length;
      $('stageDetail').innerHTML = list.map(function (d) {
        return '<p style="text-align:center;margin:6px 0">阶段「<b>' + d.name + '</b>」完成（' + d.goalText + '）<br />奖励 <b style="color:var(--gold)">¥' + d.reward + '</b> 已到账' +
          (d.title ? '<br />获得称号：<span class="title-badge">' + d.title + '</span>' : '') + '</p>';
      }).join('') + (list.length > 1 ? '<p style="text-align:center">合计奖励 <b style="color:var(--gold)">¥' + total + '</b></p>' : '') +
        '<p style="text-align:center">' + (S.stage <= 6 ? '下一阶段：「' + stageById(S.stage).name + '」——' + stageById(S.stage).goalText : '全部阶段完成，传奇之路走到尽头了！') + '</p>';
      $('stageModal').classList.add('open');
      save();
      return true;
    }
    /* ================= Phase 7：剧情 / 恋爱线（可选，不理会无惩罚） =================
       存档：S.story = { prologueDone, seenEvents:[], affinity:{senior,manager,rival,teammate} }（0~100）。
       事件在结算后 / 回主界面时排队弹出，不打断比赛；看过的记入 seenEvents 不重复（宿敌赛后对白除外，可重复）。
       好感达 30/60/90 各解锁一段专属事件。文本全部原创，角色名为 ROSTER 占位名。 */
    function storyState() {
      if (!S.story || typeof S.story !== 'object') S.story = { prologueDone: true, seenEvents: [], affinity: { senior: 0, manager: 0, rival: 0, teammate: 0 } };
      if (!Array.isArray(S.story.seenEvents)) S.story.seenEvents = [];
      if (!S.story.affinity || typeof S.story.affinity !== 'object') S.story.affinity = { senior: 0, manager: 0, rival: 0, teammate: 0 };
      return S.story;
    }
    var storyQueue = [];
    function queueStory(id) {
      storyState();
      if (!STORY_EVENTS[id]) return;
      if (S.story.seenEvents.indexOf(id) >= 0) return;
      if (storyQueue.indexOf(id) >= 0) return;
      storyQueue.push(id);
    }
    function queueStoryRepeat(id) { if (STORY_EVENTS[id] && storyQueue.indexOf(id) < 0) storyQueue.push(id); }
    function addAffinity(who, delta) {
      storyState();
      if (!STORY_CHARS[who] || !delta) return;
      var before = S.story.affinity[who] || 0;
      S.story.affinity[who] = clamp(before + delta, 0, 100);
      if (delta > 0) [30, 60, 90].forEach(function (th) {
        if (before < th && S.story.affinity[who] >= th) queueStory('aff_' + who + '_' + th);
      });
    }
    function applyStoryFx(fx) {
      var notes = [];
      if (!fx) return notes;
      if (fx.mind) { changeMind(fx.mind); notes.push('心态 ' + (fx.mind > 0 ? '+' : '') + fx.mind); }
      if (fx.money) { var d = fx.money; if (d < 0) d = -Math.min(S.money, -d); S.money += d; if (d) notes.push('金钱 ' + (d > 0 ? '+¥' : '−¥') + Math.abs(d)); }
      if (fx.stamina) { S.stamina = clamp(S.stamina + fx.stamina, 0, 100); notes.push('体力 ' + (fx.stamina > 0 ? '+' : '') + fx.stamina); }
      if (fx.attr && fx.attrN) { S.attrs[fx.attr] += fx.attrN; notes.push(attrNameOf(fx.attr) + ' +' + fx.attrN); }
      if (fx.aff) Object.keys(fx.aff).forEach(function (w) { addAffinity(w, fx.aff[w]); notes.push(STORY_CHARS[w].name + '好感 +' + fx.aff[w]); });
      return notes;
    }
    /* ---------- 对白弹窗引擎 ---------- */
    var curStory = null;
    function storySet(img, name, role, text) {
      $('storyImg').src = img;
      $('storyName').textContent = name;
      $('storyRole').textContent = role;
      $('storyText').textContent = text;
      var fx = $('storyFx'); fx.className = 'story-fx'; fx.textContent = '';
      $('storyPlay').innerHTML = '';
    }
    function storyBtns(list) {
      var box = $('storyChoices'); box.innerHTML = '';
      list.forEach(function (b) {
        var btn = document.createElement('button');
        btn.className = b.cls || 'primary-btn';
        btn.textContent = b.label;
        btn.addEventListener('click', b.fn);
        box.appendChild(btn);
      });
    }
    function openStoryEvent(id) {
      var def = STORY_EVENTS[id]; if (!def) return;
      storyState();
      if (!def.repeat && S.story.seenEvents.indexOf(id) < 0) S.story.seenEvents.push(id);
      curStory = { id: id, def: def, page: 0 };
      $('storyTitle').textContent = def.title || '剧情';
      $('storySkip').style.display = 'none';
      renderStoryPage();
      $('storyModal').classList.add('open');
      save();
    }
    function renderStoryPage() {
      if (!curStory) return;
      var def = curStory.def, pg = def.pages[curStory.page], who = pg.w || def.char;
      if (STORY_CHARS[who]) storySet(STORY_CHARS[who].img, STORY_CHARS[who].name, STORY_CHARS[who].role, pg.t);
      else if (who === 'me') storySet('assets/portrait.webp', S.name + '（你）', '主角', pg.t);
      else storySet(STORY_CHARS[def.char].img, '', '', pg.t);
      if (curStory.page < def.pages.length - 1) {
        storyBtns([{ label: '继续', fn: function () { curStory.page++; renderStoryPage(); } }]);
      } else if (def.choices && def.choices.length) {
        storyBtns(def.choices.map(function (c, i) {
          return { label: c.text, cls: i === 0 ? 'primary-btn' : 'secondary-btn', fn: function () { chooseStoryChoice(i); } };
        }));
      } else {
        storyBtns([{ label: '关闭', fn: closeStoryEvent }]);
      }
    }
    function chooseStoryChoice(i) {
      if (!curStory) return;
      var c = curStory.def.choices[i];
      var notes = applyStoryFx(c.fx);
      var fxEl = $('storyFx');
      fxEl.textContent = (c.result || '') + (notes.length ? '（' + notes.join(' · ') + '）' : '');
      fxEl.classList.add('show');
      storyBtns([{ label: '继续', fn: closeStoryEvent }]);
      save();
    }
    function closeStoryEvent() {
      $('storyModal').classList.remove('open');
      curStory = null;
      save(); render();
      showNextPendingModal();
    }
    function showStoryEventIfPending() {
      if (!storyQueue.length) return false;
      if (B) return false;
      var busy = ['settleModal', 'stageModal', 'achModal', 'helpModal', 'confirmModal', 'resetModal'].some(function (id) { var el = $(id); return el && el.classList.contains('open'); });
      if (busy) return false;
      openStoryEvent(storyQueue.shift());
      return true;
    }
    function showNextPendingModal() { // 弹窗链：阶段祝贺 → 图鉴成就 → 剧情事件，依次弹不叠罗汉
      if (showStageModalIfPending()) return;
      if (showAchModalIfPending()) return;
      showStoryEventIfPending();
    }
    /* ---------- 状态页「关系」区 ---------- */
    function affTierName(v) { return v >= 90 ? '心意相通' : v >= 60 ? '亲近信赖' : v >= 30 ? '渐渐熟悉' : v >= 1 ? '刚刚相识' : '尚未结识'; }
    function renderRelations() {
      var el = $('stRelations'); if (!el) return;
      storyState();
      el.innerHTML = Object.keys(STORY_CHARS).map(function (w) {
        var c = STORY_CHARS[w], v = S.story.affinity[w] || 0;
        var filled = Math.round(v / 20), hearts = '';
        for (var i = 0; i < 5; i++) hearts += '<span class="' + (i < filled ? '' : 'off') + '">♥</span>';
        return '<div class="rel-row"><img class="rel-img" src="' + c.img + '" alt="' + c.name + '" />' +
          '<div style="flex:1;min-width:0"><span class="rel-name">' + c.name + '</span> <span class="rel-role">' + c.role + '</span>' +
          '<div class="rel-hearts">' + hearts + '<span style="color:var(--ink-2);font-size:12.5px;letter-spacing:0"> ' + v + ' · ' + affTierName(v) + '</span></div>' +
          '<p class="rel-desc">' + c.desc + '</p></div></div>';
      }).join('') + '<p class="rel-desc" style="margin-top:8px">好感来自剧情选项、与沈墨凛的比赛、散心时的偶遇；达到 30 / 60 / 90 各解锁一段专属剧情。不理会这条线，不影响任何主线进度。</p>';
    }
    /* ---------- 序章（仅新存档；4 步：测力机 → 梢姐搭话 → 拳馆试训 → 开启生涯） ---------- */
    var proState = null;
    function proStopTimer() { if (proState && proState.punchTimer) { clearInterval(proState.punchTimer); proState.punchTimer = null; } }
    function startPrologue() {
      storyState();
      if (S.story.prologueDone) return;
      proState = { step: 0, page: 0, punchTries: 0, punchBest: 0, punchTimer: null, punchVal: 0, punchDir: 1, sparRound: 0, sparScore: 0 };
      $('storyTitle').textContent = '序章 · 街机厅';
      $('storySkip').style.display = 'block';
      $('storyModal').classList.add('open');
      renderProScene();
    }
    function renderProScene() {
      if (!proState) return;
      var st = proState;
      if (st.step === 0) {
        var pages = [
          '放学路上，你钻进了常去的街机厅。角落里那台拳击测力机刚换了新榜单——第一名的分数，高得有点离谱。',
          '你摸了摸口袋里剩下的游戏币。反正只是玩玩。你这样想着，站到了测力机前，握紧了拳头。'
        ];
        storySet('assets/portrait.webp', '旁白', '序章 · 一', pages[st.page]);
        storyBtns([{ label: st.page < pages.length - 1 ? '继续' : '站到测力机前', fn: function () { if (st.page < pages.length - 1) { st.page++; renderProScene(); } else { st.step = 1; renderProScene(); } } }]);
      } else if (st.step === 1) {
        $('storyTitle').textContent = '序章 · 拳击测力机';
        storySet('assets/portrait.webp', '拳击测力机', '投币 1 枚 · 共 3 拳取最高分', '力量条会来回冲刺。在你感觉最猛的那一瞬间，按下「出拳！」——打完 3 拳，就能继续。');
        var play = $('storyPlay');
        play.innerHTML = '<div class="punch-wrap"><div class="punch-score" id="proScore">' + (st.punchBest || '---') + '</div>' +
          '<div class="punch-bar-bg"><div class="punch-bar" id="proBar"></div></div>' +
          '<p class="punch-tip" id="proTip">已打 ' + st.punchTries + ' / 3 拳 · 最高分 ' + st.punchBest + '</p></div>';
        proStopTimer();
        if (st.punchTries < 3) {
          st.punchTimer = setInterval(function () {
            st.punchVal += st.punchDir * 3.4;
            if (st.punchVal >= 100) { st.punchVal = 100; st.punchDir = -1; }
            if (st.punchVal <= 0) { st.punchVal = 0; st.punchDir = 1; }
            var bar = $('proBar'); if (bar) bar.style.width = st.punchVal + '%';
          }, 30);
        }
        var btns = [];
        if (st.punchTries < 3) btns.push({ label: '出拳！', fn: proPunch });
        else btns.push({ label: '收拳，回头看看', fn: function () { st.step = 2; st.page = 0; renderProScene(); } });
        storyBtns(btns);
      } else if (st.step === 2) {
        $('storyTitle').textContent = '序章 · 藤原梢';
        var pages2 = [
          { t: '身后有人说话：「……小姑娘。刚才那拳，再打一次，我看看。」', img: 'senior' },
          { t: '「我叫藤原梢，以前是打职业的。你那一拳，腰、腿、肩是一条线——没人教过你吧？这叫天赋，浪费在游戏机上可惜了。」', img: 'senior' }
        ];
        var pg = pages2[st.page];
        storySet(STORY_CHARS.senior.img, '藤原梢', '退役拳手', pg.t);
        if (st.page < pages2.length - 1) {
          storyBtns([{ label: '继续', fn: function () { st.page++; renderProScene(); } }]);
        } else {
          storyBtns([
            { label: '「天赋？我只是经常来玩这个……」', fn: function () { proChoice({ aff: { senior: 6 } }, '她哼了一声：「所以才叫天赋。跟我来。」', 3); } },
            { label: '「姐姐，你也是来打测力机的吗？」', cls: 'secondary-btn', fn: function () { proChoice({ aff: { senior: 4 }, mind: 5 }, '她被逗笑了：「我打过的东西，可比这台机器贵多了。跟我来。」', 3); } }
          ]);
        }
      } else if (st.step === 3) {
        renderProSpar();
      } else if (st.step === 4) {
        $('storyTitle').textContent = '序章 · 新的开始';
        var pages4 = [
          { img: 'senior', name: '藤原梢', role: '前辈 · 退役拳手', t: '就这么定了。从今天起，你就是这家拳馆的人了。排名？从最后一名开始——第 50 名。上面 49 个人，都是你要翻过去的山。' },
          { img: 'manager', name: '栗原真纪', role: '经纪人', t: '合同我带来了。从今天起，我是你的经纪人。先说好——我很严格的。' },
          { img: 'me', name: '旁白', role: '序章 · 完', t: '拳馆的灯亮着，沙袋还在轻轻晃。你的职业生涯，就从这一天开始。' }
        ];
        var p4 = pages4[st.page];
        storySet(p4.img === 'me' ? 'assets/portrait.webp' : STORY_CHARS[p4.img].img, p4.name, p4.role, p4.t);
        storyBtns([{ label: st.page < pages4.length - 1 ? '继续' : '开始生涯', fn: function () { if (st.page < pages4.length - 1) { st.page++; renderProScene(); } else finishPrologue(false); } }]);
      }
    }
    function proPunch() {
      var st = proState; if (!st || st.step !== 1 || st.punchTries >= 3) return;
      var score = Math.round(500 + st.punchVal * 4.3 + rnd(-15, 15));
      st.punchTries++;
      if (score > st.punchBest) st.punchBest = score;
      var sc = $('proScore'); if (sc) sc.textContent = score;
      var tip = $('proTip'); if (tip) tip.textContent = '第 ' + st.punchTries + ' 拳：' + score + ' 分！' + (score >= 880 ? ' 机器轰隆作响，整个街机厅都回头了！' : score >= 780 ? ' 围观的人发出一阵惊呼。' : ' 还不错，但你总觉得没打满。') + '（已打 ' + st.punchTries + ' / 3 拳）';
      if (st.punchTries >= 3) {
        proStopTimer();
        storyBtns([{ label: '收拳，回头看看', fn: function () { st.step = 2; st.page = 0; renderProScene(); } }]);
      }
    }
    function proChoice(fx, result, nextStep) {
      var notes = applyStoryFx(fx);
      var fxEl = $('storyFx');
      fxEl.textContent = result + (notes.length ? '（' + notes.join(' · ') + '）' : '');
      fxEl.classList.add('show');
      storyBtns([{ label: '继续', fn: function () { proState.step = nextStep; proState.page = 0; renderProScene(); } }]);
      save();
    }
    function renderProSpar() {
      var st = proState;
      $('storyTitle').textContent = '序章 · 拳馆试训';
      if (st.sparRound === 0 && !st.sparStarted) {
        storySet(STORY_CHARS.senior.img, '藤原梢', '试训 · 三回合', '「光嘴上说没用。戴上拳套，陪我走三个回合。是骡子是马，台上见。每回合选一个应对，选错了……就挨一下。」');
        storyBtns([{ label: '戴上拳套，上台', fn: function () { st.sparStarted = true; renderProSpar(); } }]);
        return;
      }
      var rounds = [
        { sit: '第一回合：梢姐压上来了，一记刺拳点向你的面门——', opts: ['迎上去对攻', '先格挡，再看', '脚下绕开'], best: 1,
          ok: '你稳稳架住了这一拳。她眼睛一亮：「哦？下盘很稳。」', ng: '头盔被轻轻敲了一下。「急什么？先活下来，再谈进攻。」' },
        { sit: '第二回合：她突然沉下肩，一记直拳奔着你胸口来——', opts: ['迎上去对攻', '抱架硬挡', '侧身闪开'], best: 2,
          ok: '你侧身让过，拳风擦着耳朵过去。她笑了：「反应不错。」', ng: '你闷哼一声退了半步。「直拳要躲，别拿身体接。」' },
        { sit: '第三回合：她故意卖了个空当，中门大开——', opts: ['全力打进去', '谨慎试探', '绕着她打转'], best: 0,
          ok: '你一拳打实了她的护具！全场安静了一秒。她大笑：「好！就是这股劲！」', ng: '你犹豫了，空当转瞬即逝。「机会这东西，犹豫一下就没了。」' }
      ];
      if (st.sparRound >= 3) {
        var good = st.sparScore >= 2;
        storySet(STORY_CHARS.senior.img, '藤原梢', '试训 · 结束', good
          ? '三个回合走完，你还站着，眼睛还亮着。她摘下手套，拍了拍你的头盔：「……捡到宝了，我这回是真捡到宝了。」'
          : '三个回合走完，你挨了好几下，却一次都没往后退。她看着你，慢慢笑了：「挨打的姿势不好看。但不肯倒的人，我最喜欢。」');
        storyBtns([{ label: '继续', fn: function () { proChoice({ aff: { senior: good ? 6 : 3 } }, good ? '梢姐对你的评价，比你想的还要高。' : '她嘴上不饶人，却悄悄把你的名字写上了拳馆的名单。', 4); } }]);
        return;
      }
      var r = rounds[st.sparRound];
      storySet(STORY_CHARS.senior.img, '藤原梢', '试训 · 第 ' + (st.sparRound + 1) + ' 回合', r.sit);
      storyBtns(r.opts.map(function (o, i) {
        return { label: o, cls: i === 0 ? 'primary-btn' : 'secondary-btn', fn: function () {
          var goodPick = i === r.best;
          if (goodPick) st.sparScore++;
          var fxEl = $('storyFx');
          fxEl.textContent = goodPick ? r.ok : r.ng;
          fxEl.classList.add('show');
          storyBtns([{ label: st.sparRound >= 2 ? '走完最后一回合' : '下一回合', fn: function () { st.sparRound++; renderProSpar(); } }]);
        } };
      }));
    }
    function finishPrologue(skipped) {
      proStopTimer();
      storyState();
      S.story.prologueDone = true;
      proState = null;
      $('storySkip').style.display = 'none';
      $('storyModal').classList.remove('open');
      if (!skipped) queueStory('ev_stage1');
      save(); render();
      $('helpModal').classList.add('open');
      toast(skipped ? '已跳过序章' : '序章完成，生涯开始！');
    }

    /* Phase 2：伤病 debuff —— ≥30 全属性 −5%，≥60 全属性 −15%（仅比赛生效） */
    function injuryDebuffMul() { return S.injury >= 60 ? 0.85 : S.injury >= 30 ? 0.95 : 1; }
    function battleBaseAttrs() { // 战斗用属性：基础+装备，再叠加伤病 debuff
      var ea = effAttrs(), mul = injuryDebuffMul();
      if (mul !== 1) ATTRS.forEach(function (a) { ea[a.key] = Math.round(ea[a.key] * mul * 10) / 10; });
      return ea;
    }
    function addPunchExp(s, key, n) { s.punchExp[key] += n; }
    function weekOf(day) { return Math.ceil(day / 7); }
    function isMatchDay(day) { return day % 7 === 0; }

    function save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 存储不可用时静默降级 */ }
    }
    function load() {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        var data = JSON.parse(raw);
        if (!data || typeof data.day !== 'number' || !data.attrs) return false;
        S = Object.assign(defaultState(), data);
        S.attrs = Object.assign(defaultState().attrs, data.attrs);
        S.punchExp = Object.assign(defaultState().punchExp, data.punchExp);
        S.gear = Object.assign(defaultState().gear, data.gear || {});
        S.bag = Object.assign(defaultState().bag, data.bag || {});
        S.buffs = Object.assign(defaultState().buffs, data.buffs || {});
        if (!Array.isArray(S.owned)) S.owned = [];
        // Phase 5 老存档兼容：材料库存 / 定制装备存档 / 图鉴登记与成就字段
        var defMats = defaultState().materials;
        S.materials = Object.assign({}, defMats, (data.materials && typeof data.materials === 'object') ? data.materials : {});
        Object.keys(defMats).forEach(function (k) {
          if (typeof S.materials[k] !== 'number' || isNaN(S.materials[k]) || S.materials[k] < 0) S.materials[k] = 0;
          S.materials[k] = Math.floor(S.materials[k]);
        });
        if (!Array.isArray(S.customGear)) S.customGear = [];
        S.customGear = S.customGear.filter(function (g) { return g && typeof g.id === 'string' && g.bonus && typeof g.bonus === 'object'; });
        if (typeof S.customSeq !== 'number' || isNaN(S.customSeq) || S.customSeq < 0) S.customSeq = S.customGear.length;
        if (!Array.isArray(S.dexAch)) S.dexAch = [];
        if (!Array.isArray(data.dexSigs)) {
          S.dexSigs = [];
          S.owned.forEach(function (id) { var g0 = gearById(id); if (g0) S.dexSigs.push(g0.custom ? ('combo:' + gloveSig(g0.custom)) : ('shop:' + g0.id)); });
        }
        // Phase 5 深化兼容：强化等级表缺失/非法时补齐（图鉴补登记在下方兼容段之后）
        if (!S.enh || typeof S.enh !== 'object' || Array.isArray(S.enh)) S.enh = {};
        Object.keys(S.enh).forEach(function (k) {
          var v = S.enh[k];
          if (typeof v !== 'number' || isNaN(v) || v < 0) delete S.enh[k]; else S.enh[k] = Math.min(ENH_MAX, Math.floor(v));
        });
        Object.keys(S.gear).forEach(function (slot) { if (S.gear[slot] && !gearById(S.gear[slot])) S.gear[slot] = null; });
        // Phase 3 老存档兼容：阶段/连胜/称号/赞助字段缺失时用默认值补齐
        if (!Array.isArray(S.completedStages)) S.completedStages = [];
        if (!Array.isArray(S.titles)) S.titles = [];
        /* 动态档位制下的读档迁移：档位只由当前胜场/排名重算（computedInfluence），
           已存档位与旧粉丝数不再锚定档位——否则存档里虚高的档位永远掉不下来，
           动态升降就失效了。旧粉丝映射（第二轮回炉）至此退役；迁移后删除粉丝数字段。 */
        S.influence = computedInfluence(S);
        delete S.fans;
        if (typeof S.stage !== 'number' || isNaN(S.stage)) S.stage = Math.min(7, S.completedStages.length + 1);
        S.stage = clamp(Math.round(S.stage), 1, 7);
        if (typeof S.winStreak !== 'number' || isNaN(S.winStreak) || S.winStreak < 0) S.winStreak = 0;
        if (S.champWinBase !== null && typeof S.champWinBase !== 'number') S.champWinBase = null;
        if (S.sponsor && !sponsorById(S.sponsor)) S.sponsor = null;
        if (typeof S.deathFight !== 'boolean') S.deathFight = false; // TKO 死战设置：老存档默认关
        if (typeof S.testMode !== 'boolean') S.testMode = false; // 测试档标识：老存档默认非测试档
        // Phase 6 老存档兼容：缺外观字段时回落到 v8 默认外观（高马尾 / 默认脸 / 标准体型 / 默认服装），非法值同样回落
        S.appearance = normalizeAppearance(data.appearance);
        // Phase 7 老存档兼容：无 story 字段的旧档自动补齐，且 prologueDone=true——老存档绝不触发序章
        if (!data.story || typeof data.story !== 'object') {
          S.story = { prologueDone: true, seenEvents: [], affinity: { senior: 0, manager: 0, rival: 0, teammate: 0 } };
        } else {
          var stAff = (data.story.affinity && typeof data.story.affinity === 'object') ? data.story.affinity : {};
          S.story = {
            prologueDone: data.story.prologueDone === true,
            seenEvents: Array.isArray(data.story.seenEvents) ? data.story.seenEvents.filter(function (x) { return typeof x === 'string'; }) : [],
            affinity: {
              senior: clamp(Math.floor(stAff.senior) || 0, 0, 100), manager: clamp(Math.floor(stAff.manager) || 0, 0, 100),
              rival: clamp(Math.floor(stAff.rival) || 0, 0, 100), teammate: clamp(Math.floor(stAff.teammate) || 0, 0, 100)
            }
          };
        }
        // 角色池兼容：无 roster 字段的老存档 / roster 缺失、长度不对或含非法条目时，按当前 S.rank 与周数迁移重建（story/好感/进度一律保留）
        if (!Array.isArray(data.roster) || !rosterValid(S.roster)) S.roster = buildRoster(S.rank, weekOf(S.day));
        // Phase 5 深化：已拥有的全部装备款式补登记进图鉴（此前图鉴只登记拳套；强化等级与图鉴互不影响）
        S.owned.forEach(function (id) { var g1 = gearById(id); if (g1) registerDex(g1); });
        return true;
      } catch (e) { return false; }
    }

    /* ================= 工具 ================= */
    function $(id) { return document.getElementById(id); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    var toastTimer = null;
    function toast(msg) {
      var t = $('toast'); t.textContent = msg; t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
    }
    function dailyLog(msg, cls) {
      S.logs.unshift({ msg: msg, cls: cls || '' });
      if (S.logs.length > 60) S.logs.length = 60;
      renderDailyLog();
    }
    function renderDailyLog() {
      $('dailyLog').innerHTML = S.logs.map(function (l) {
        return '<p class="' + l.cls + '">' + l.msg + '</p>';
      }).join('') || '<p class="dim">新的一天开始了。先安排训练，或者去打工攒钱。</p>';
    }

    /* ================= 日常界面 ================= */
    var lastAttrs = null;
    function render() {
      $('tbDay').textContent = 'Day ' + S.day + ' · 第 ' + weekOf(S.day) + ' 周';
      $('tbMoney').textContent = S.money;
      $('tbStam').style.width = S.stamina + '%';
      $('tbStamNum').textContent = Math.round(S.stamina);
      $('tbInj').style.width = S.injury + '%';
      $('tbInjNum').textContent = Math.round(S.injury);
      $('tbFame').textContent = S.fame;
      var tbi = $('tbInfluence'); if (tbi) tbi.textContent = influenceLabel(refreshInfluence());
      var tbw = $('testBadgeWrap'); if (tbw) tbw.style.display = S.testMode ? '' : 'none';
      var stb = $('stTestBadge'); if (stb) stb.style.display = S.testMode ? '' : 'none';
      var brs = $('btnRestoreSave'); if (brs) brs.style.display = hasBackup() ? '' : 'none';
      var bts = $('btnTestSave'); if (bts) bts.classList.toggle('test-on', !!S.testMode);
      $('tbRank').textContent = '第 ' + S.rank + ' 名';
      var dft = $('btnDeathToggle'); if (dft) { dft.textContent = 'TKO死战：' + (S.deathFight ? '开' : '关'); dft.style.borderColor = S.deathFight ? 'var(--red)' : ''; dft.style.color = S.deathFight ? 'var(--red)' : ''; dft.style.fontWeight = S.deathFight ? '700' : ''; }
      $('tbMind').textContent = Math.round(S.mind) + ' · ' + mindTierName(S.mind);
      var pips = '';
      for (var i = 0; i < 6; i++) pips += '<span class="ap-pip' + (i < S.ap ? '' : ' off') + '"></span>';
      $('tbAp').innerHTML = pips;

      var ea = effAttrs(), gb = gearBonus();
      $('attrGrid').innerHTML = ATTRS.map(function (a) {
        var up = lastAttrs && ea[a.key] > lastAttrs[a.key] ? '<span class="up">↑</span>' : '';
        var bonus = gb[a.key] ? '<span class="up"> +' + gb[a.key] + '</span>' : '';
        return '<div class="attr"><span class="an">' + a.name + '</span><span class="av num">' + ea[a.key] + bonus + up + '</span></div>';
      }).join('');

      $('punchList').innerHTML = PUNCH_KEYS.map(function (k) {
        var exp = S.punchExp[k], lv = punchLevel(exp), inLv = exp - lv * 100;
        return '<div class="punch-row"><div class="punch-head"><span class="pn">' + PUNCHES[k].name +
          '<span class="lvl-badge num">' + LEVELS[lv] + '</span></span>' +
          '<span class="pl">' + (lv >= 6 ? '已达 S 级' : '经验 ' + inLv + ' / 100') + '</span></div>' +
          '<div class="expbar"><i style="width:' + (lv >= 6 ? 100 : inLv) + '%"></i></div></div>';
      }).join('');

      var matchDay = isMatchDay(S.day);
      var match = matchDay && S.lastMatchDay !== S.day;
      if (match) {
        $('weekNote').innerHTML = '今天是<b>比赛日</b>！报名<b>免费（0 AP）</b>，打完后当天剩余行动点保留。对手排名与你相近（±5 名），对手强度随周数提升。';
        $('matchDesc').textContent = '报名免费 · 0 AP · 获胜奖金 ¥' + prizeForRank(weekOf(S.day)) + '（含排名加成' + (influenceBonusPct() > 0 ? '＋影响力加成 ' + influenceBonusPct() + '%' : '') + '）';
      } else if (matchDay) {
        $('weekNote').innerHTML = '今天的比赛已经打完了。报名免费、不耗行动点，剩下的时间可以继续训练、打工或休息。';
        $('matchDesc').textContent = '今日已比赛 · 下个比赛日再来';
      } else {
        var left = 7 - (S.day % 7);
        $('weekNote').innerHTML = '距离下一个比赛日还有 <b>' + left + ' 天</b>（每周第 7 天）。抓紧训练，或者打工攒钱。';
        $('matchDesc').textContent = '每周第 7 天开放 · 还有 ' + left + ' 天';
      }
      $('btnMatch').classList.toggle('match', match);
      $('btnMatch').disabled = !match;
      $('btnTrain').disabled = S.ap < 2;
      $('btnOut').disabled = S.ap < 2;
      $('btnWork').disabled = S.ap < 3 || S.stamina < 15;
      $('btnRest').disabled = S.ap < 1;
      $('recordLine').innerHTML = '战绩：<b>' + S.wins + ' 胜 · ' + S.losses + ' 负</b>' + ((S.winStreak || 0) > 0 ? '（<b>' + S.winStreak + ' 连胜</b>中）' : '') + '　|　名声 <b>' + S.fame + '</b>（仅作纪念展示，不参与判定）　|　影响力 <b>' + influenceLabel(refreshInfluence()) + '</b>　|　国内排名 <b>第 ' + S.rank + ' 名</b>　|　伤病会降低比赛 HP 上限，≥30 还会让比赛全属性下降，休息或医院治疗可消除';
      renderCareerDaily();
      renderPlan();
      renderShop();
      renderStatus();
      save();
    }
    /* ================= 训练计划（2 AP，5 点自由组合，一次结算） ================= */
    var PLAN_POINTS = 5;
    var planSel = []; // 已选训练 id（可重复）
    function planUsedPts() { return planSel.reduce(function (sum, id) { var t = trainingById(id); return sum + (t ? t.pts : 0); }, 0); }
    function closeSubLists(except) {
      ['trainList', 'outList', 'shopList', 'relaxList'].forEach(function (id) { if (id !== except) $(id).classList.remove('open'); });
    }
    function planPreviewHTML() {
      // P1-5：结算前总预览——用克隆状态试算一遍计划（不改动真实存档），汇总 AP / 体力 / 各项目收益合计 / 当前→结算后数值
      var clone = {
        attrs: Object.assign({}, S.attrs), punchExp: Object.assign({}, S.punchExp),
        injury: S.injury, day: S.day, scoutedForDay: 0
      };
      planSel.forEach(function (id) { trainingById(id).apply(clone); });
      var rawCost = planSel.reduce(function (sum, id) { return sum + trainingById(id).stam; }, 0);
      var effCost = S.buffs.drink ? Math.round(rawCost * 0.7) : rawCost;
      var rows = [];
      ATTRS.forEach(function (a) {
        var d = clone.attrs[a.key] - S.attrs[a.key];
        if (d) rows.push(attrNameOf(a.key) + ' ' + S.attrs[a.key] + ' → ' + clone.attrs[a.key] + '（+' + d + '）');
      });
      PUNCH_KEYS.forEach(function (k) {
        var d = clone.punchExp[k] - S.punchExp[k];
        if (d) rows.push(PUNCHES[k].name + '经验 +' + d);
      });
      var mindGain = planSel.reduce(function (sum, id) { return sum + (trainingById(id).mind || 0); }, 0);
      if (mindGain) rows.push('心态 +' + mindGain);
      if (clone.scoutedForDay) rows.push('侦察到下场比赛对手弱点');
      var used = planUsedPts();
      var html = '<div class="custom-preview" style="margin:2px 0 10px"><b>计划总预览</b>（开始训练前核对）<br />' +
        '行动点：2 AP（' + S.ap + ' → ' + (S.ap - 2) + '）　·　训练点数：' + used + ' / ' + PLAN_POINTS + '<br />' +
        '体力消耗：' + Math.round(S.stamina) + ' → ' + Math.max(0, Math.round(S.stamina - effCost)) + '（−' + effCost + (S.buffs.drink ? '，能量饮料 −30% 已计入' : '') + (S.stamina - effCost < 0 ? '，<b style="color:var(--red)">将透支 ' + Math.round(effCost - S.stamina) + ' 点，伤病约 +' + Math.floor(Math.round(effCost - S.stamina) / 10) * 5 + '</b>' : '') + '）<br />' +
        '收益合计：' + (rows.length ? rows.join(' · ') : '无') +
        '<br /><span style="color:var(--ink-2)">心态效率修正（高昂 +10% / 疲劳 −15%）会在结算时另行应用；实战陪练的受伤为概率事件，预览不计。</span>' +
        (used < PLAN_POINTS ? '<br /><b>提示：计划未满 5 点也可以直接开始（AP 照常消耗 2 点），也可以继续点上面的项目补满。</b>' : '') +
        '</div>';
      return html;
    }
    function renderPlan() {
      var used = planUsedPts(), left = PLAN_POINTS - used;
      var html = '<div class="plan-head"><span>训练点数 <span class="pts num">' + left + ' / ' + PLAN_POINTS + '</span></span>' +
        '<span>当前体力 <span class="num">' + Math.round(S.stamina) + '</span></span></div>';
      html += TRAININGS.map(function (t) {
        var dis = (left < t.pts) ? ' disabled' : '';
        var tier = t.pts >= 3 ? '重' : t.pts === 2 ? '中' : '轻';
        return '<button class="train-opt" data-train="' + t.id + '"' + dis + '>' +
          '<span class="t">' + t.name + '</span><span class="cost">' + tier + ' · ' + t.pts + ' 点</span>' +
          '<span class="d"> ' + t.desc + ' · 体力 −' + t.stam + '</span></button>';
      }).join('');
      if (planSel.length) {
        var counts = {};
        planSel.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
        html += '<div class="plan-sel">' + Object.keys(counts).map(function (id) {
          var t = trainingById(id);
          return '<button class="plan-chip" data-plan-remove="' + id + '">' + t.name + (counts[id] > 1 ? ' ×' + counts[id] : '') + ' ✕</button>';
        }).join('') + '</div>';
      } else {
        html += '<p class="shop-note">点上面的项目添加到计划（可重复选同一项），凑满或不满 5 点都可以开始。</p>';
      }
      if (planSel.length) html += planPreviewHTML();
      html += '<div class="plan-foot"><button class="primary-btn" id="btnPlanGo"' + (planSel.length ? '' : ' disabled') + '>开始训练（2 AP）</button>' +
        '<button class="secondary-btn" id="btnPlanCancel">取消</button></div>';
      $('trainList').innerHTML = html;
      Array.prototype.forEach.call(document.querySelectorAll('[data-train]'), function (btn) {
        btn.addEventListener('click', function () {
          var t = trainingById(btn.getAttribute('data-train'));
          if (!t || planUsedPts() + t.pts > PLAN_POINTS) return;
          planSel.push(t.id);
          renderPlan();
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-plan-remove]'), function (btn) {
        btn.addEventListener('click', function () {
          var i = planSel.indexOf(btn.getAttribute('data-plan-remove'));
          if (i >= 0) planSel.splice(i, 1);
          renderPlan();
        });
      });
      $('btnPlanGo').addEventListener('click', doPlanTrain);
      $('btnPlanCancel').addEventListener('click', function () { planSel = []; $('trainList').classList.remove('open'); renderPlan(); });
    }
    function doPlanTrain() {
      if (!planSel.length || S.ap < 2) return;
      var stamBefore = S.stamina;
      var rawCost = planSel.reduce(function (sum, id) { return sum + trainingById(id).stam; }, 0);
      var cost = rawCost, drinkNote = '';
      if (S.buffs.drink) { cost = Math.round(rawCost * 0.7); S.buffs.drink = false; drinkNote = '能量饮料生效：体力消耗 −30%（' + rawCost + ' → ' + cost + '）。'; }
      lastAttrs = effAttrs();
      var snapAttrs = Object.assign({}, S.attrs), snapExp = Object.assign({}, S.punchExp);
      var names = planSel.map(function (id) { return trainingById(id).name; }).join('、');
      planSel.forEach(function (id) {
        var t = trainingById(id);
        var msg = t.apply(S);
        dailyLog('Day ' + S.day + ' · ' + t.name + '：' + msg, 'good');
      });
      // 心态效率修正：高昂 +10% / 疲劳 −15%（对属性与熟练度经验的增量生效）
      var eff = mindTrainEff();
      if (eff !== 1) {
        ATTRS.forEach(function (a) { var d = S.attrs[a.key] - snapAttrs[a.key]; if (d) S.attrs[a.key] = snapAttrs[a.key] + Math.round(d * eff); });
        PUNCH_KEYS.forEach(function (k) { var d = S.punchExp[k] - snapExp[k]; if (d) S.punchExp[k] = snapExp[k] + Math.round(d * eff); });
        dailyLog(eff > 1 ? '心态高昂，训练效率 +10%，练得格外投入。' : '心态疲劳，训练效率 −15%，有点不在状态。', eff > 1 ? 'good' : 'bad');
      }
      var mindGain = planSel.reduce(function (sum, id) { return sum + (trainingById(id).mind || 0); }, 0);
      if (mindGain) changeMind(mindGain);
      // P2-15：低体力硬练的心态 −10 只在计划总耗体力 >2 时应用——纯冥想（耗体力 2）不扣
      if (stamBefore < 20 && rawCost > 2) { changeMind(-10); dailyLog('体力见底还硬练，心态 −10。下次先休息吧。', 'bad'); }
      S.ap -= 2;
      var newStam = stamBefore - cost, over = 0, injAdd = 0;
      if (newStam < 0) { over = -newStam; injAdd = Math.floor(over / 10) * 5; S.injury = Math.min(100, S.injury + injAdd); }
      S.stamina = Math.max(0, newStam);
      if (drinkNote) dailyLog(drinkNote, 'good');
      if (over > 0) { toast('体力透支 ' + over + ' 点！伤病 +' + injAdd + '，悠着点'); dailyLog('训练体力透支 ' + over + ' 点，伤病 +' + injAdd + '。', 'bad'); }
      dailyLog('Day ' + S.day + ' · 训练计划完成：' + names + '（体力 −' + cost + '）', 'good');
      planSel = [];
      $('trainList').classList.remove('open');
      render();
      toast('训练计划完成');
    }
    /* ================= 行动确认框（确认后才结算，取消不消耗） ================= */
    var pendingConfirm = null;
    function fmtDelta(before, after, unit) { // 预览「当前 → 结算后」
      var d = Math.round(after) - Math.round(before);
      var sign = d > 0 ? '+' : '';
      return Math.round(before) + ' → ' + Math.round(after) + (unit || '') + '（' + sign + Math.round(d) + '）';
    }
    function askConfirm(cfg) {
      pendingConfirm = cfg;
      $('cfTitle').textContent = cfg.title;
      $('cfLines').innerHTML = cfg.lines.map(function (row) {
        return '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
      }).join('');
      if (cfg.note) { $('cfNote').textContent = cfg.note; $('cfNote').style.display = ''; }
      else $('cfNote').style.display = 'none';
      $('btnCfOk').textContent = cfg.okText || '确认';
      $('btnCfOk').disabled = !!cfg.okDisabled;
      $('confirmModal').classList.add('open');
    }
    function closeConfirm() { pendingConfirm = null; $('confirmModal').classList.remove('open'); }
    $('btnCfCancel').addEventListener('click', closeConfirm);
    $('confirmModal').addEventListener('click', function (e) { if (e.target === this) closeConfirm(); });
    $('btnCfOk').addEventListener('click', function () {
      var cfg = pendingConfirm;
      closeConfirm();
      if (cfg && cfg.onOk) cfg.onOk();
    });

    function confirmWork() {
      if (S.ap < 3 || S.stamina < 15) return;
      askConfirm({
        title: '打工 · 便利店',
        lines: [
          ['行动点', '−3 AP（' + S.ap + ' → ' + (S.ap - 3) + '）'],
          ['金钱', '¥' + S.money + ' → ¥' + (S.money + 300) + '（+300）'],
          ['体力', fmtDelta(S.stamina, Math.max(0, S.stamina - 15))]
        ],
        note: '站一晚上夜班，钱到手，但胳膊也抬不起来了。',
        okText: '确认打工',
        onOk: doWork
      });
    }
    function confirmRest() {
      if (S.ap < 1) return;
      askConfirm({
        title: '休息',
        lines: [
          ['行动点', '−1 AP（' + S.ap + ' → ' + (S.ap - 1) + '）'],
          ['体力', fmtDelta(S.stamina, Math.min(100, S.stamina + 30))],
          ['伤病', fmtDelta(S.injury, Math.max(0, S.injury - 10))],
          ['心态', fmtDelta(S.mind, Math.min(100, S.mind + 5)) + ' · ' + mindTierName(Math.min(100, S.mind + 5))]
        ],
        okText: '确认休息',
        onOk: doRest
      });
    }
    function confirmSleep() {
      var gain = 40 + (S.buffs.meal ? 20 : 0);
      var nextDay = S.day + 1;
      var mindTo = S.mind < 60 ? Math.min(60, S.mind + 5) : S.mind > 60 ? Math.max(60, S.mind - 5) : 60;
      // P1-6：比赛日还没打比赛就睡觉 → 明确警告会错过本周比赛
      var missMatch = isMatchDay(S.day) && S.lastMatchDay !== S.day;
      askConfirm({
        title: '睡觉 · 结束今天',
        lines: [
          ['体力', fmtDelta(S.stamina, Math.min(100, S.stamina + gain))],
          ['心态', fmtDelta(S.mind, mindTo) + '（向 60 回归）'],
          ['行动点', '明天恢复为 6 AP']
        ],
        note: (missMatch ? '⚠ 今天是比赛日，你还没打比赛——睡了就错过本周比赛（下个比赛日要再等一周）！' : '') +
          '睡觉后进入 Day ' + nextDay + '（第 ' + weekOf(nextDay) + ' 周）' + (isMatchDay(nextDay) ? '——明天是比赛日！' : '。') +
          (S.buffs.meal ? ' 营养餐生效：本次体力恢复额外 +20。' : '') +
          (nextDay % 7 === 1 && currentSponsor() ? ' 明天是新一周的第 1 天，赞助周薪 ¥' + currentSponsor().weekly + '（' + currentSponsor().name + '）将自动到账。' : ''),
        okText: missMatch ? '还是睡了（错过比赛）' : '确认睡觉',
        onOk: doSleep
      });
    }
    function confirmMatch() {
      if (!isMatchDay(S.day) || S.lastMatchDay === S.day) return;
      var prize = prizeForRank(weekOf(S.day));
      var mul = injuryDebuffMul();
      var note = '报名不消耗行动点；打完后当天剩余 AP 保留，可以继续训练、打工或休息。每个比赛日限打一场。确认后选择战斗模式（手动 / 自动 / 模拟）。';
      if (mul < 1) note += ' 注意：当前伤病 ' + Math.round(S.injury) + '，本场比赛全属性 ' + (mul <= 0.85 ? '−15%' : '−5%') + '（伤病 debuff），建议先休息或去医院治疗再上场。';
      askConfirm({
        title: '报名比赛',
        lines: [
          ['行动点', '免费 · 0 AP'],
          ['你的排名', '国内第 ' + S.rank + ' 名'],
          ['本场对手', '排名与你相近的选手（±5 名）'],
          ['获胜奖金', '¥' + prize + '（含排名加成＋影响力加成 +' + influenceBonusPct() + '%）'],
          ['落败出场费', '¥' + Math.floor(prize / 2)],
          ['排名变化', '获胜上升、落败下降（赢高排名升得多，输低排名降得多）'],
          ['影响力', '当前 ' + influenceLabel(refreshInfluence()) + '（动态档位：首胜 Lv2、10 胜或前 25 名 Lv3、前 10 名或 25 胜 Lv4、登顶 Lv5；输比赛跌出排名门槛会掉档，靠胜场达成的档位不掉）'],
          ['名声', '获胜提升，落败不变（名声仅作纪念展示，不参与判定）']
        ],
        note: note,
        okText: '确认报名',
        onOk: openModeModal
      });
    }
    function doWork() {
      if (S.ap < 3 || S.stamina < 15) return;
      S.ap -= 3; S.stamina = Math.max(0, S.stamina - 15); S.money += 300;
      dailyLog('Day ' + S.day + ' · 便利店打工：金钱 +300，累得手都抬不起来。');
      render();
    }
    function doRest() {
      if (S.ap < 1) return;
      S.ap -= 1;
      S.stamina = Math.min(100, S.stamina + 30);
      S.injury = Math.max(0, S.injury - 10);
      changeMind(5);
      dailyLog('Day ' + S.day + ' · 休息：体力 +30，伤病 −10，心态 +5。');
      render();
    }
    function doSleep() {
      var gain = 40;
      if (S.buffs.meal) { gain += 20; S.buffs.meal = false; dailyLog('营养餐生效：这次睡觉体力额外恢复 +20。', 'good'); }
      S.stamina = Math.min(100, S.stamina + gain);
      // 睡觉时心态向 60 缓慢回归（±5）
      if (S.mind < 60) changeMind(Math.min(5, 60 - S.mind));
      else if (S.mind > 60) changeMind(-Math.min(5, S.mind - 60));
      S.day += 1; S.ap = 6;
      if (S.scoutedForDay && S.scoutedForDay < S.day) S.scoutedForDay = 0; // P1-6：跳过比赛日后清除过期的侦察状态
      dailyLog('—— Day ' + S.day + ' 开始（第 ' + weekOf(S.day) + ' 周）' + (isMatchDay(S.day) ? '，今天是比赛日！' : ''), 'dim');
      // Phase 3：赞助周薪 —— 每周第 1 天（Day 8、15、22…）自动到账并播报
      var spNow = currentSponsor();
      if (spNow && S.day % 7 === 1) {
        S.money += spNow.weekly;
        dailyLog('赞助周薪到账：' + spNow.name + ' ¥' + spNow.weekly + '（第 ' + weekOf(S.day) + ' 周）。', 'good');
        toast('赞助周薪到账：¥' + spNow.weekly);
      }
      // 角色池：每周第 1 天（与赞助周薪同点）池内成长 + 名次重排 + 候补轮换
      if (S.day % 7 === 1) weeklyRosterGrowth(weekOf(S.day));
      planSel = [];
      closeSubLists(null);
      ['trainList', 'outList', 'shopList', 'relaxList'].forEach(function (id) { $(id).classList.remove('open'); });
      render();
      if (isMatchDay(S.day)) toast('比赛日到了！去报名比赛吧');
    }

    /* ================= 外出：体育用品店 / 散心 ================= */
    var customSel = { pattern: 'classic', outer: 'calf', lining: 'latex', oz: 12, fix: 'velcro' };
    function optTags(map, cur, labelFn) {
      return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (String(k) === String(cur) ? ' selected' : '') + '>' + labelFn(map[k]) + '</option>'; }).join('');
    }
    function updateCustomPreview() {
      var el = $('customPreview'); if (!el) return;
      var c = computeGlove(customSel);
      el.innerHTML = '<b>' + c.shortName + '拳套</b>（定制）<br />' + c.desc + '<br /><span style="color:var(--ink-2)">' + c.notes + '</span><br />总价 <b style="color:var(--gold)">¥' + c.price + '</b>（' + c.breakdown + '）' + (S.money < c.price ? ' · <b style="color:var(--red)">金钱不足</b>' : '');
      var b = $('btnCustomBuy'); if (b) b.disabled = S.money < c.price;
    }
    function confirmCustomBuy() {
      var c = computeGlove(customSel);
      if (S.money < c.price) { toast('钱不够定制（需要 ¥' + c.price + '）'); return; }
      var sel = { pattern: customSel.pattern, outer: customSel.outer, lining: customSel.lining, oz: customSel.oz, fix: customSel.fix };
      askConfirm({
        title: '定制拳套 · ' + c.shortName + '拳套',
        lines: [
          ['版型 / 外皮', GLOVE_PATTERNS[sel.pattern].name + ' / ' + GLOVE_OUTERS[sel.outer].name],
          ['内衬 / 盎司 / 固定', GLOVE_LININGS[sel.lining].name + ' / ' + sel.oz + 'oz / ' + GLOVE_FIX[sel.fix].name],
          ['最终属性', bonusDesc(c.bonus)],
          ['价格', '¥' + S.money + ' → ¥' + (S.money - c.price) + '（−' + c.price + '）']
        ],
        note: '价格 = ' + c.breakdown + '，实际总价区间 ¥1100～3900。成品存入背包（不自动装备，去状态页背包换上），这个组合会登记进拳套图鉴。斗牛系/马毛内衬的伤手风险体现在手部保护（防守）降低上。',
        okText: '确认定制',
        onOk: function () {
          if (S.money < c.price) { toast('金钱不足，无法定制'); return; }
          S.money -= c.price;
          var g = makeCustomGear(sel, 'custom');
          S.customGear.push(g);
          S.owned.push(g.id);
          registerDex(g);
          changeMind(10);
          lastAttrs = effAttrs();
          dailyLog('Day ' + S.day + ' · 定制拳套：' + g.name + '（¥' + c.price + '）已存入背包。' + g.desc + '。', 'good');
          render();
          if ($('shopList')) $('shopList').classList.add('open');
          toast('定制完成：' + g.name + '（去状态页装备）');
          showAchModalIfPending();
        }
      });
    }
    function renderShop() {
      var html = '<p class="shop-note">体育用品店 · 购买后自动存入背包，装备自动换上（同部位只生效一件，可在状态页背包里切换）。每次购买心态 +10。页面底部可以<b>定制拳套</b>。</p>';
      html += SHOP_GEAR.map(function (g) {
        var ownedIt = S.owned.indexOf(g.id) >= 0, equipped = S.gear[g.slot] === g.id;
        var label = equipped ? '已装备' : ownedIt ? '已拥有' : '¥' + g.price;
        var dis = (equipped || ownedIt || S.money < g.price) ? ' disabled' : '';
        return '<button class="train-opt has-img" data-buy-gear="' + g.id + '"' + dis + '>' + gearImgHTML(g) +
          '<span class="opt-txt"><span class="t">' + gearDispName(g) + '</span>' +
          '<span class="d"> ' + SLOT_NAMES[g.slot] + ' · ' + gearEffDesc(g) + '</span></span><span class="cost">' + label + '</span></button>';
      }).join('');
      html += CONSUMABLES.map(function (c) {
        var dis = S.money < c.price ? ' disabled' : '';
        return '<button class="train-opt" data-buy-item="' + c.id + '"' + dis + '>' +
          '<span class="t">' + c.name + '</span><span class="cost">¥' + c.price + '</span>' +
          '<span class="d"> 消耗品 · ' + c.desc + '（拥有 ' + (S.bag[c.id] || 0) + '）</span></button>';
      }).join('');
      html += '<div class="custom-box"><p class="shop-note" style="margin:0 0 8px"><b>定制拳套工坊</b> · 双层结构：版型定骨架，外皮＋内衬定手感，再用盎司与固定方式微调。改选实时预览，确认购买才扣钱。</p>';
      html += '<label class="cs-lab">版型（第一层 · 骨架）<select id="csPattern">' + optTags(GLOVE_PATTERNS, customSel.pattern, function (o) { return o.name + ' · 基础 ¥' + o.base + ' · ' + o.note; }) + '</select></label>';
      html += '<label class="cs-lab">外皮（第二层）<select id="csOuter">' + optTags(GLOVE_OUTERS, customSel.outer, function (o) { return o.name + ' · ¥' + o.price + ' · ' + o.note; }) + '</select></label>';
      html += '<label class="cs-lab">内衬（第二层）<select id="csLining">' + optTags(GLOVE_LININGS, customSel.lining, function (o) { return o.name + ' · ¥' + o.price + ' · ' + o.note; }) + '</select></label>';
      html += '<label class="cs-lab">盎司<select id="csOz">' + Object.keys(GLOVE_OZ).map(function (k) { return '<option value="' + k + '"' + (parseInt(k, 10) === customSel.oz ? ' selected' : '') + '>' + k + 'oz · ' + (GLOVE_OZ[k].adj >= 0 ? '+' : '−') + '¥' + Math.abs(GLOVE_OZ[k].adj) + ' · ' + GLOVE_OZ[k].note + '</option>'; }).join('') + '</select></label>';
      html += '<label class="cs-lab">固定方式<select id="csFix">' + optTags(GLOVE_FIX, customSel.fix, function (o) { return o.name + ' · ¥' + o.price + ' · ' + o.note; }) + '</select></label>';
      html += '<div class="custom-preview" id="customPreview"></div>';
      html += '<div class="plan-foot"><button class="primary-btn" id="btnCustomBuy">定制这副拳套</button></div></div>';
      html += '<div class="plan-foot"><button class="secondary-btn" id="btnShopBack">离开商店</button></div>';
      $('shopList').innerHTML = html;
      Array.prototype.forEach.call(document.querySelectorAll('[data-buy-gear]'), function (btn) {
        btn.addEventListener('click', function () { buyGear(btn.getAttribute('data-buy-gear')); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-buy-item]'), function (btn) {
        btn.addEventListener('click', function () { buyConsumable(btn.getAttribute('data-buy-item')); });
      });
      $('btnShopBack').addEventListener('click', function () { $('shopList').classList.remove('open'); });
      [['csPattern', 'pattern'], ['csOuter', 'outer'], ['csLining', 'lining'], ['csFix', 'fix']].forEach(function (pair) {
        var sel = $(pair[0]);
        if (sel) sel.addEventListener('change', function () { customSel[pair[1]] = sel.value; updateCustomPreview(); });
      });
      var ozSel = $('csOz');
      if (ozSel) ozSel.addEventListener('change', function () { customSel.oz = parseInt(ozSel.value, 10) || 12; updateCustomPreview(); });
      var cb = $('btnCustomBuy');
      if (cb) cb.addEventListener('click', confirmCustomBuy);
      updateCustomPreview();
    }

    function buyGear(id) {
      var g = gearById(id);
      if (!g || S.money < g.price || S.owned.indexOf(id) >= 0) return;
      // P1-4：商店直接购买也要确认框（与其他购买一致，防手机误触）：商品名/价格/结算后金钱/是否自动换装
      var old = S.gear[g.slot] ? gearById(S.gear[g.slot]) : null;
      askConfirm({
        title: '购买装备 · ' + g.name,
        lines: [
          ['商品', g.name + '（' + SLOT_NAMES[g.slot] + '）'],
          ['效果', gearEffDesc(g)],
          ['价格', '¥' + S.money + ' → ¥' + (S.money - g.price) + '（−' + g.price + '）'],
          ['自动换装', '是——买下后自动装备' + (old && old.id !== id ? '，换下当前的' + old.name + '（旧装备留在背包，可随时换回）' : '')]
        ],
        note: '购买只花金钱，不额外消耗行动点；买到东西心态 +10。确认后才扣钱，取消不消耗。',
        okText: '确认购买',
        onOk: function () {
          if (S.money < g.price || S.owned.indexOf(id) >= 0) { toast('条件已变化，无法购买'); return; }
          S.money -= g.price;
          S.owned.push(id);
          registerDex(g);
          var old2 = S.gear[g.slot] ? gearById(S.gear[g.slot]) : null;
          S.gear[g.slot] = id; // 买新自动替换旧装备（旧装备留在背包，可随时换回）
          changeMind(10);
          lastAttrs = effAttrs();
          dailyLog('Day ' + S.day + ' · 体育用品店：买下' + g.name + '（¥' + g.price + '），' + (old2 && old2.id !== id ? '换下了' + old2.name + '。' : '装备上了。'), 'good');
          render();
          if ($('shopList')) $('shopList').classList.add('open'); // render 后保持商店打开（与定制/打造一致）
          toast('已装备：' + g.name);
          showAchModalIfPending();
        }
      });
    }
    function buyConsumable(id) {
      var c = consumableById(id);
      if (!c || S.money < c.price) return;
      askConfirm({
        title: '购买消耗品 · ' + c.name,
        lines: [
          ['商品', c.name + '（消耗品）'],
          ['效果', c.desc],
          ['价格', '¥' + S.money + ' → ¥' + (S.money - c.price) + '（−' + c.price + '）'],
          ['存放', '存入背包（当前拥有 ' + (S.bag[id] || 0) + ' 个），在状态页背包里使用']
        ],
        note: '购买只花金钱，不额外消耗行动点；买到东西心态 +10。确认后才扣钱，取消不消耗。',
        okText: '确认购买',
        onOk: function () {
          if (S.money < c.price) { toast('条件已变化，无法购买'); return; }
          S.money -= c.price;
          S.bag[id] = (S.bag[id] || 0) + 1;
          changeMind(10);
          dailyLog('Day ' + S.day + ' · 体育用品店：买下' + c.name + '（¥' + c.price + '），已存入背包。', 'good');
          render();
          if ($('shopList')) $('shopList').classList.add('open');
          toast(c.name + ' 已存入背包');
        }
      });
    }
    function doRelax(kind) {
      if (S.money < 300) { toast('钱不够散心（需要 ¥300）'); return; }
      S.money -= 300;
      S.stamina = Math.min(100, S.stamina + 10);
      changeMind(20);
      dailyLog('Day ' + S.day + ' · 外出散心（' + kind + '）：心态 +20，体力 +10，花费 ¥300。', 'good');
      $('relaxList').classList.remove('open');
      $('outList').classList.remove('open');
      render();
      toast('散心回来，神清气爽');
      // Phase 7：散心小概率偶遇日常事件（每段只触发一次，触发后直接弹出对白）
      if (Math.random() < 0.4) {
        var pool = ['daily_1', 'daily_2', 'daily_3'].filter(function (id) { return S.story && S.story.seenEvents.indexOf(id) < 0; });
        if (pool.length) { queueStory(pool[Math.floor(Math.random() * pool.length)]); showStoryEventIfPending(); }
      }
    }

    /* ================= 状态界面 / 背包 ================= */
    var bagTab = 'gear';
    function openStatus() {
      if (B) { toast('比赛中无法查看状态'); return; }
      $('dailyView').style.display = 'none';
      $('statusView').style.display = 'block';
      renderStatus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function closeStatus() {
      $('statusView').style.display = 'none';
      $('dailyView').style.display = 'block';
      render();
    }
    /* ================= Phase 3：日常页生涯概览 / 状态页阶段与赞助 ================= */
    function renderCareerDaily() {
      var el = $('careerDaily'); if (!el) return;
      var sp = currentSponsor();
      var lv = refreshInfluence();
      var fansLine = '<p class="career-line" style="margin-top:8px">影响力 <b>' + influenceLabel(lv) + '</b>（出场费加成 +' + influenceBonusPct() + '%，按当前胜场/排名动态计算）　·　连胜 <b>' + (S.winStreak || 0) + '</b></p>' +
        '<p class="career-line">赞助：' + (sp ? '<b>' + sp.name + '</b> · 每周 ¥' + sp.weekly + '（每周第 1 天到账）' : '暂无签约（影响力达标后在状态页签约）') + '</p>';
      if (S.stage > 6) {
        el.innerHTML = '<p class="career-line"><b>全部 6 个阶段已完成</b>——传奇达成！</p>' + fansLine;
        return;
      }
      var def = stageById(S.stage);
      if (!def) { el.innerHTML = fansLine; return; }
      el.innerHTML = '<p class="career-line">当前阶段 <b>' + def.id + ' · ' + def.name + '</b>：' + def.goalText + '（奖励 ¥' + def.reward + (def.title ? ' ＋称号「' + def.title + '」' : '') + '）</p>' +
        stageProgressHTML() + fansLine;
    }
    function renderStageCard() {
      var el = $('stStage'); if (!el) return;
      var html = '';
      if (S.stage > 6) {
        html += '<p class="career-line"><b>全部 6 个阶段已完成！</b>从无名新人到传奇，这条路你走完了。</p>';
      } else {
        var def = stageById(S.stage);
        html += '<p class="career-line">当前阶段 <b>' + def.id + ' · ' + def.name + '</b></p>';
        html += '<p class="career-line" style="color:var(--ink-2)">目标：' + def.goalText + '　·　奖励 <b style="color:var(--gold)">¥' + def.reward + '</b>' + (def.title ? ' ＋称号「' + def.title + '」' : '') + '</p>';
        html += stageProgressHTML();
      }
      if (S.completedStages && S.completedStages.length) {
        html += '<p class="shop-note" style="margin:12px 0 4px"><b>已完成阶段</b></p>';
        html += S.completedStages.map(function (id) {
          var d = stageById(id); if (!d) return '';
          return '<div class="stage-done-item"><span>✓ ' + d.id + ' · ' + d.name + (d.title ? '（称号：' + d.title + '）' : '') + '</span><span class="sd-r">¥' + d.reward + '</span></div>';
        }).join('');
      } else {
        html += '<p class="shop-note" style="margin:10px 0 0">还没有完成的阶段——赢下第一场比赛就能达成「初出茅庐」。</p>';
      }
      if (S.titles && S.titles.length) html += '<p class="career-line" style="margin-top:10px">已获称号：' + S.titles.map(function (t) { return '<span class="title-badge">' + t + '</span>'; }).join('') + '</p>';
      el.innerHTML = html;
    }
    function renderSponsorCard() {
      var el = $('stSponsor'); if (!el) return;
      var cur = currentSponsor();
      var lv = refreshInfluence();
      var html = '<p class="shop-note">当前影响力 <b>' + influenceLabel(lv) + '</b>。' + (cur ? '当前签约：<b>' + cur.name + '</b>（签约金 ¥' + cur.sign + ' 已领取，每周第 1 天自动到账周薪 ¥' + cur.weekly + '）。想换更高档，先解约再签新的。' : '尚未签约。影响力达到门槛档位即可签约，签约金立即到账，之后每周第 1 天发周薪。') + '</p>';
      html += SPONSORS.map(function (sp) {
        var isCur = S.sponsor === sp.id;
        var locked = lv < sp.need;
        var cls = 'sponsor-item' + (isCur ? ' current' : '') + (locked && !isCur ? ' locked' : '');
        var btn;
        if (isCur) btn = '<button data-sponsor-cancel="1">解约</button>';
        else if (cur) btn = '<button disabled>需先解约</button>';
        else if (locked) btn = '<button disabled>影响力 Lv' + sp.need + '</button>';
        else btn = '<button data-sponsor-sign="' + sp.id + '">签约</button>';
        return '<div class="' + cls + '"><div><span class="bi-t">' + sp.name + '</span>' + (isCur ? ' <span class="title-badge">签约中</span>' : '') +
          '<div class="bi-d">' + sp.desc + '</div><div class="bi-d">门槛 影响力 Lv' + sp.need + '「' + influenceName(sp.need) + '」 · 签约金 ¥' + sp.sign + ' · 周薪 ¥' + sp.weekly + ' / 周</div></div>' + btn + '</div>';
      }).join('');
      el.innerHTML = html;
      Array.prototype.forEach.call(el.querySelectorAll('[data-sponsor-sign]'), function (btn) {
        btn.addEventListener('click', function () { signSponsor(btn.getAttribute('data-sponsor-sign')); });
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-sponsor-cancel]'), function (btn) {
        btn.addEventListener('click', cancelSponsor);
      });
    }
    function signSponsor(id) {
      var sp = sponsorById(id);
      if (!sp) return;
      if (S.sponsor) { toast('已签约其他赞助商，先解约再换'); return; }
      if (refreshInfluence() < sp.need) { toast('影响力不足（需要 Lv' + sp.need + '「' + influenceName(sp.need) + '」）'); return; }
      askConfirm({
        title: '签约赞助 · ' + sp.name,
        lines: [
          ['影响力门槛', 'Lv' + sp.need + '「' + influenceName(sp.need) + '」（当前 ' + influenceLabel(refreshInfluence()) + '，已达标）'],
          ['签约金', '¥' + S.money + ' → ¥' + (S.money + sp.sign) + '（+' + sp.sign + '，立即到账）'],
          ['周薪', '¥' + sp.weekly + ' / 周（每周第 1 天自动到账，日志播报）']
        ],
        note: '同时只能签一家。解约后可以再签其他赞助商，解约不退还已领取的签约金。签约不消耗行动点。',
        okText: '确认签约',
        onOk: function () {
          if (S.sponsor || refreshInfluence() < sp.need) { toast('条件已变化，无法签约'); return; }
          S.sponsor = sp.id;
          S.money += sp.sign;
          dailyLog('签约赞助：' + sp.name + '，签约金 ¥' + sp.sign + ' 已到账；之后每周第 1 天到账周薪 ¥' + sp.weekly + '。', 'good');
          render();
          toast('已签约：' + sp.name + '（签约金 +¥' + sp.sign + '）');
        }
      });
    }
    function cancelSponsor() {
      var sp = currentSponsor();
      if (!sp) return;
      askConfirm({
        title: '解约 · ' + sp.name,
        lines: [
          ['当前周薪', '¥' + sp.weekly + ' / 周（解约后不再发放）'],
          ['签约金', '已领取的 ¥' + sp.sign + ' 不退还']
        ],
        note: '解约后可立即签约其他已达门槛的赞助商。解约不消耗行动点。',
        okText: '确认解约',
        onOk: function () {
          if (S.sponsor !== sp.id) return;
          S.sponsor = null;
          dailyLog('已与赞助商' + sp.name + '解约。', 'dim');
          render();
          toast('已解约：' + sp.name);
        }
      });
    }
    /* 角色池：国内排名榜（全表 51 行 = 50 名角色 + 玩家行高亮；候补行单独标注） */
    function renderRankBoard() {
      var el = $('rankBoard'); if (!el) return;
      ensureRoster();
      var byRank = {};
      S.roster.forEach(function (m) { if (m.rank > 0) byRank[m.rank] = m; });
      var rows = [];
      for (var r = 1; r <= 50; r++) {
        if (r === S.rank) {
          rows.push('<div class="rank-row me"><span class="rr-rank num">' + r + '</span><img src="' + portraitSrc() + '" alt="" /><span class="rr-name">' + S.name + '（你）</span><span class="rr-meta">玩家</span></div>');
        } else if (byRank[r]) {
          var m = byRank[r];
          rows.push('<div class="rank-row"><span class="rr-rank num">' + r + '</span><img src="assets/opponents/' + m.key + '.webp" alt="" loading="lazy" /><span class="rr-name">' + m.name + '</span><span class="rr-meta">' + FOE_STYLES[m.style].name + ' · ' + (GROWTH_LABELS[m.growth] || m.growth) + '</span></div>');
        }
      }
      S.roster.forEach(function (m) {
        if (m.rank === 0) rows.push('<div class="rank-row reserve"><span class="rr-rank">候补</span><img src="assets/opponents/' + m.key + '.webp" alt="" loading="lazy" /><span class="rr-name">' + m.name + '</span><span class="rr-meta">候补 · 未入榜 · ' + FOE_STYLES[m.style].name + ' · ' + (GROWTH_LABELS[m.growth] || m.growth) + '</span></div>');
      });
      el.innerHTML = rows.join('');
    }
    function renderStatus() {
      renderAppearance();
      $('stName').textContent = S.name;
      $('stFame').textContent = S.fame;
      $('stRank').textContent = '第 ' + S.rank + ' 名';
      var sti = $('stInfluence'); if (sti) sti.textContent = influenceLabel(refreshInfluence());
      if ($('stCareerLine')) {
        var curDef = S.stage <= 6 ? stageById(S.stage) : null;
        $('stCareerLine').innerHTML = '当前阶段：<b>' + (curDef ? curDef.id + ' · ' + curDef.name + '（' + curDef.goalText + '）' : '全部完成 · 传奇') + '</b>　·　连胜 <b>' + (S.winStreak || 0) + '</b>　·　赞助 <b>' + (currentSponsor() ? currentSponsor().name : '无') + '</b>';
      }
      if ($('stTitles')) $('stTitles').innerHTML = (S.titles && S.titles.length) ? '称号：' + S.titles.map(function (t) { return '<span class="title-badge">' + t + '</span>'; }).join('') : '';
      $('stMoney').textContent = S.money;
      $('stRecord').textContent = S.wins + ' 胜 · ' + S.losses + ' 负';
      renderRelations(); // Phase 7：关系区（好感）
      renderRankBoard(); // 角色池：国内排名榜
      $('stStam').style.width = S.stamina + '%'; $('stStamNum').textContent = Math.round(S.stamina);
      $('stInj').style.width = S.injury + '%'; $('stInjNum').textContent = Math.round(S.injury);
      $('stMind').style.width = S.mind + '%'; $('stMindTxt').textContent = Math.round(S.mind) + ' · ' + mindTierName(S.mind);
      var buffTxt = [];
      var idm = injuryDebuffMul();
      if (idm < 1) buffTxt.push('伤病影响：比赛中全属性 ' + (idm <= 0.85 ? '−15%' : '−5%') + '（休息或医院治疗可恢复）');
      if (S.buffs.drink) buffTxt.push('能量饮料生效中（下次训练体力消耗 −30%）');
      if (S.buffs.bandage) buffTxt.push('绷带生效中（下场比赛伤病概率减半）');
      if (S.buffs.meal) buffTxt.push('营养餐生效中（下次睡觉体力恢复 +20）');
      if (S.scoutedForDay && S.scoutedForDay >= S.day) buffTxt.push('已侦察下场比赛对手弱点'); // P1-6：过期的侦察不再显示
      var curSp = currentSponsor();
      if (curSp) buffTxt.push('赞助：' + curSp.name + '（周薪 ¥' + curSp.weekly + '，每周第 1 天到账）');
      if (influenceBonusPct() > 0) buffTxt.push('影响力出场费加成 +' + influenceBonusPct() + '%（' + influenceLabel(refreshInfluence()) + '）');
      if (gearDrPct() > 0) buffTxt.push('装备减伤合计 ' + gearDrPct() + '%（减伤上限 50%，多件装备叠加后封顶）'); // P2-5：减伤上限文案注明
      $('stBuffs').textContent = buffTxt.length ? '生效状态：' + buffTxt.join('；') : '';
      var ea = effAttrs(), gb = gearBonus();
      $('stAttrs').innerHTML = ATTRS.map(function (a) {
        var bonus = gb[a.key] ? '<span class="up"> +' + gb[a.key] + ' 装备</span>' : '';
        return '<div class="attr"><span class="an">' + a.name + '</span><span class="av num">' + ea[a.key] + bonus + '</span></div>';
      }).join('');
      $('stPunches').innerHTML = $('punchList').innerHTML;
      $('stGear').innerHTML = Object.keys(SLOT_NAMES).map(function (slot) {
        var g = S.gear[slot] ? gearById(S.gear[slot]) : null;
        return '<button class="gear-slot" data-gearslot="' + slot + '"><span class="gs">' + SLOT_NAMES[slot] + '</span>' +
          (g ? gearImgHTML(g, 'lg') : '') +
          '<span class="gn">' + (g ? gearDispName(g) : '（未装备）') + '</span>' +
          '<span class="gd">' + (g ? gearEffDesc(g) : '去商店购买') + '</span></button>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('[data-gearslot]'), function (btn) {
        btn.addEventListener('click', function () {
          bagTab = 'gear'; syncBagTabs();
          $('bagGear').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
      // 拳套图鉴（Phase 5）：按"款式"登记——商店款按商品、定制/打造按组合；拆解不掉记录
      function dexEntryFor(sig) {
        if (sig.indexOf('shop:') === 0) return gearById(sig.slice(5));
        if (sig.indexOf('combo:') === 0) {
          var found = null;
          (S.customGear || []).forEach(function (g) { if (g.sig === sig) found = g; });
          if (found) return found;
          var parts = sig.slice(6).split('|');
          var sel = { pattern: parts[0], outer: parts[1], lining: parts[2], oz: parseInt(parts[3], 10) || 12, fix: parts[4] || 'velcro' };
          if (!GLOVE_PATTERNS[sel.pattern] || !GLOVE_OUTERS[sel.outer] || !GLOVE_LININGS[sel.lining]) return null;
          var cc = computeGlove(sel);
          return { id: '', name: cc.shortName + '拳套', desc: cc.desc, price: cc.price, custom: sel };
        }
        return null;
      }
      var collectedDex = (S.dexSigs || []).map(function (sig) { return { sig: sig, g: dexEntryFor(sig) }; }).filter(function (e) { return !!e.g; });
      var shopGloves = SHOP_GEAR; // 图鉴登记全部装备款式（拳套 + 护齿/战靴/护头/战袍/护腕）
      $('dexCount').textContent = '已收集 ' + collectedDex.length + ' 款';
      var dexHtml = '';
      var nextMs = dexCount() < 5 ? 5 : (dexCount() < 10 ? 10 : null);
      dexHtml += '<div class="prog-row"><div class="prog-head"><span class="pg-n">收集进度</span><span class="pg-v' + (nextMs ? '' : ' done') + '">' +
        (nextMs ? dexCount() + ' / ' + nextMs + ' 款（里程碑奖励 ' + (nextMs === 5 ? '¥1000' : '¥3000＋称号「收藏家」') + '）' : '里程碑全部达成 ✓') + '</span></div>' +
        '<div class="progbar"><i class="' + (nextMs ? '' : 'done') + '" style="width:' + (nextMs ? clamp(dexCount() / nextMs * 100, 0, 100) : 100) + '%"></i></div></div>';
      dexHtml += DEX_ACH.map(function (a) {
        var has = (S.dexAch || []).indexOf(a.id) >= 0;
        return '<p class="shop-note" style="margin:4px 0">' + (has ? '✓ 已达成' : '未达成') + '：集齐 ' + a.need + ' 款 → ¥' + a.reward + (a.title ? '＋称号「' + a.title + '」' : '') + '</p>';
      }).join('');
      dexHtml += collectedDex.map(function (e, i) {
        var g = e.g;
        return '<div class="dex-item">' + gearImgHTML(g) + '<div style="flex:1;min-width:0"><span class="bi-t">' + g.name + '</span><div class="bi-d">' + g.desc + (g.price ? ' · 定制价参考 ¥' + g.price : '') + '</div></div><span class="dex-state">No.' + (i + 1) + ' · 已获得</span></div>';
      }).join('');
      dexHtml += shopGloves.filter(function (g) { return (S.dexSigs || []).indexOf('shop:' + g.id) < 0; }).map(function (g) {
        return '<div class="dex-item locked">' + gearImgHTML(g) + '<div style="flex:1;min-width:0"><span class="bi-t">' + g.name + '</span><div class="bi-d">' + g.desc + ' · ¥' + g.price + '（商店购买后登记）</div></div><span class="dex-state">未获得</span></div>';
      }).join('');
      dexHtml += '<p class="shop-note" style="margin:6px 0 0">定制 / 打造出的新组合也会在获得时登记进来（同组合重复获得不重复计数）；已登记的款式拆解后记录保留。</p>';
      $('stDex').innerHTML = dexHtml;
      renderStageCard();
      renderStageCard();
      renderSponsorCard();
      renderBag();
      renderCraft();
    }
    function syncBagTabs() {
      Array.prototype.forEach.call(document.querySelectorAll('[data-bagtab]'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-bagtab') === bagTab);
      });
      $('bagGear').style.display = bagTab === 'gear' ? '' : 'none';
      $('bagItems').style.display = bagTab === 'item' ? '' : 'none';
    }
    function dismantleYieldFor(g) {
      if (g.custom) return [g.custom.outer, g.custom.lining];
      return DISMANTLE_MAP[g.id] || ['synthetic', 'latex'];
    }
    function confirmDismantle(id) {
      var g = gearById(id);
      if (!g || S.owned.indexOf(id) < 0) return;
      if (S.gear[g.slot] === id) { toast('已装备的装备不能拆解，先在背包里换上别的再拆'); return; }
      var y = dismantleYieldFor(g);
      var enhLvl = enhOf(id);
      askConfirm({
        title: '拆解装备 · ' + g.name,
        lines: [
          ['获得皮料', materialName(y[0]) + ' ×1~3（随机）'],
          ['获得内衬材料', materialName(y[1]) + ' ×1~3（随机）'],
          ['当前强化等级', enhLvl > 0 ? '+' + enhLvl : '未强化'],
          ['这件装备', '拆解后从背包消失，不可恢复']
        ],
        note: '拆解不消耗行动点。图鉴里已登记的款式记录保留，不会掉进度。材料去状态页「工坊」打造新拳套。' +
          (enhLvl > 0 ? '注意：这件装备已强化到 +' + enhLvl + '，拆解后强化等级一并作废，强化投入的材料与金钱不返还。' : ''),
        okText: '确认拆解',
        onOk: function () {
          if (S.owned.indexOf(id) < 0 || S.gear[g.slot] === id) { toast('条件已变化，无法拆解'); return; }
          var q1 = 1 + Math.floor(Math.random() * 3), q2 = 1 + Math.floor(Math.random() * 3);
          if (!S.materials) S.materials = defaultState().materials;
          S.materials[y[0]] = (S.materials[y[0]] || 0) + q1;
          S.materials[y[1]] = (S.materials[y[1]] || 0) + q2;
          S.owned.splice(S.owned.indexOf(id), 1);
          if (S.enh) delete S.enh[id]; // 拆解后强化等级随装备消失，重新获得从 +0 开始
          dailyLog('拆解了' + g.name + '：获得皮料 ' + materialName(y[0]) + ' ×' + q1 + '、内衬材料 ' + materialName(y[1]) + ' ×' + q2 + '。', 'good');
          render();
          toast('拆解完成：' + materialName(y[0]) + ' ×' + q1 + '、' + materialName(y[1]) + ' ×' + q2);
        }
      });
    }
    function renderBag() {
      // 装备页：按部位列出已拥有的装备（含定制/打造拳套），每件可装备 / 拆解
      var gh = '<p class="shop-note" style="margin:2px 0 4px"><b>材料库存</b>（拆解装备获得，去下方「工坊」打造拳套）</p>' + materialsHTML();
      Object.keys(SLOT_NAMES).forEach(function (slot) {
        var mine = allGear().filter(function (g) { return g.slot === slot && S.owned.indexOf(g.id) >= 0; });
        gh += '<p class="shop-note" style="margin:10px 0 6px"><b>' + SLOT_NAMES[slot] + '</b></p>';
        if (!mine.length) gh += '<p class="bag-empty">还没有' + SLOT_NAMES[slot] + '，去体育用品店买或定制吧。</p>';
        gh += mine.map(function (g) {
          var equipped = S.gear[slot] === g.id;
          var lvl = enhOf(g.id), enhLine = '';
          if (lvl < ENH_MAX) {
            var sh = enhShortage(g);
            if (sh.money || sh.mat) enhLine = '<div class="bi-d" style="color:var(--red)">强化到 +' + (lvl + 1) + ' 需 ¥' + sh.cost.money + '＋' + materialName(sh.cost.matId) + ' ×' + sh.cost.matCount + '（现有 ' + ((S.materials && S.materials[sh.cost.matId]) || 0) + '）' + (sh.money ? '，金钱不足' : '') + (sh.mat ? '，材料不足' : '') + '</div>';
          }
          return '<div class="bag-item">' + gearImgHTML(g) + '<div style="flex:1;min-width:0"><span class="bi-t">' + gearDispName(g) + '</span><div class="bi-d">' + gearEffDesc(g) + '</div>' + enhLine + '</div>' +
            '<span class="bag-btns"><button data-equip="' + g.id + '"' + (equipped ? ' disabled' : '') + '>' + (equipped ? '已装备' : '装备') + '</button>' +
            '<button data-enh="' + g.id + '"' + (lvl >= ENH_MAX ? ' disabled' : '') + '>' + (lvl >= ENH_MAX ? '满级 +10' : '强化') + '</button>' +
            '<button data-dismantle="' + g.id + '"' + (equipped ? ' disabled title="已装备，先换下才能拆解"' : '') + '>拆解</button></span></div>';
        }).join('');
      });
      $('bagGear').innerHTML = gh;
      Array.prototype.forEach.call($('bagGear').querySelectorAll('[data-equip]'), function (btn) {
        btn.addEventListener('click', function () {
          var g = gearById(btn.getAttribute('data-equip'));
          if (!g) return;
          S.gear[g.slot] = g.id;
          lastAttrs = effAttrs();
          dailyLog('更换装备：' + SLOT_NAMES[g.slot] + '换成' + gearDispName(g) + '（' + gearEffDesc(g) + '）。');
          render();
          toast('已装备：' + g.name);
        });
      });
      Array.prototype.forEach.call($('bagGear').querySelectorAll('[data-dismantle]'), function (btn) {
        btn.addEventListener('click', function () { confirmDismantle(btn.getAttribute('data-dismantle')); });
      });
      Array.prototype.forEach.call($('bagGear').querySelectorAll('[data-enh]'), function (btn) {
        btn.addEventListener('click', function () { confirmEnhance(btn.getAttribute('data-enh')); });
      });
      // 消耗品页
      $('bagItems').innerHTML = CONSUMABLES.map(function (c) {
        var n = S.bag[c.id] || 0, active = !!S.buffs[c.id];
        return '<div class="bag-item"><div><span class="bi-t">' + c.name + '</span> <span class="bi-d">× ' + n + (active ? ' · <b style="color:var(--green)">已使用，等待生效</b>' : '') + '</span><div class="bi-d">' + c.desc + '</div></div>' +
          '<button data-use-item="' + c.id + '"' + (n < 1 || active ? ' disabled' : '') + '>使用</button></div>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('[data-use-item]'), function (btn) {
        btn.addEventListener('click', function () { useConsumable(btn.getAttribute('data-use-item')); });
      });
      syncBagTabs();
    }
    /* ================= Phase 5：工坊打造（材料 + ¥200 手工费） ================= */
    var craftSel = { pattern: 'classic', outer: 'calf', lining: 'latex' };
    function craftNeeds() {
      return [{ id: craftSel.outer }, { id: craftSel.lining }];
    }
    function craftMissing() {
      return craftNeeds().filter(function (n) { return ((S.materials && S.materials[n.id]) || 0) < CRAFT_MAT_NEED; });
    }
    function updateCraftPreview() {
      var el = $('craftPreview'); if (!el) return;
      var sel = { pattern: craftSel.pattern, outer: craftSel.outer, lining: craftSel.lining, oz: 12, fix: 'velcro' };
      var c = computeGlove(sel);
      var miss = craftMissing();
      el.innerHTML = '<b>打造·' + c.shortName + '拳套</b>（12oz · 魔术贴）<br />' + c.desc + '<br />需要：' +
        craftNeeds().map(function (n) { return materialName(n.id) + ' ×' + CRAFT_MAT_NEED + '（现有 ' + ((S.materials && S.materials[n.id]) || 0) + '）'; }).join(' ＋ ') +
        ' ＋ 手工费 ¥' + CRAFT_FEE +
        (miss.length ? '<br /><b style="color:var(--red)">材料不足：缺 ' + miss.map(function (n) { return materialName(n.id); }).join('、') + '（去背包拆解装备获得）</b>' : '') +
        (S.money < CRAFT_FEE ? '<br /><b style="color:var(--red)">金钱不足（手工费 ¥' + CRAFT_FEE + '）</b>' : '');
      var b = $('btnCraft'); if (b) b.disabled = miss.length > 0 || S.money < CRAFT_FEE;
    }
    function confirmCraft() {
      var sel = { pattern: craftSel.pattern, outer: craftSel.outer, lining: craftSel.lining, oz: 12, fix: 'velcro' };
      var c = computeGlove(sel);
      var miss = craftMissing();
      if (miss.length) { toast('材料不足：缺 ' + miss.map(function (n) { return materialName(n.id); }).join('、')); return; }
      if (S.money < CRAFT_FEE) { toast('钱不够付手工费（¥' + CRAFT_FEE + '）'); return; }
      askConfirm({
        title: '打造拳套 · 打造·' + c.shortName + '拳套',
        lines: [
          ['消耗材料', craftNeeds().map(function (n) { return materialName(n.id) + ' ×' + CRAFT_MAT_NEED; }).join(' ＋ ')],
          ['手工费', '¥' + S.money + ' → ¥' + (S.money - CRAFT_FEE) + '（−' + CRAFT_FEE + '）'],
          ['成品规格', '12oz · 魔术贴（工坊标准规格）'],
          ['成品属性', bonusDesc(c.bonus)]
        ],
        note: '用拆解攒下的材料打造，只收手工费。成品存入背包（不自动装备），新组合会登记进拳套图鉴。',
        okText: '确认打造',
        onOk: function () {
          if (craftMissing().length || S.money < CRAFT_FEE) { toast('条件已变化，无法打造'); return; }
          craftNeeds().forEach(function (n) { S.materials[n.id] -= CRAFT_MAT_NEED; });
          S.money -= CRAFT_FEE;
          var g = makeCustomGear(sel, 'craft');
          S.customGear.push(g);
          S.owned.push(g.id);
          registerDex(g);
          changeMind(10);
          dailyLog('工坊打造：' + g.name + ' 已存入背包（手工费 ¥' + CRAFT_FEE + '）。' + g.desc + '。', 'good');
          render();
          toast('打造完成：' + g.name + '（去背包装备）');
          showAchModalIfPending();
        }
      });
    }
    function renderCraft() {
      var el = $('stCraft'); if (!el) return;
      var html = '<p class="shop-note" style="margin-top:0">用拆解攒下的材料打造拳套：选<b>版型＋外皮＋内衬</b>，需要对应外皮材料 ×' + CRAFT_MAT_NEED + '＋内衬材料 ×' + CRAFT_MAT_NEED + '，再加 ¥' + CRAFT_FEE + ' 手工费。规格为工坊标准 12oz · 魔术贴；想要其他盎司/固定方式，去商店定制。</p>';
      html += '<p class="shop-note" style="margin:8px 0 4px"><b>材料库存</b></p>' + materialsHTML();
      html += '<label class="cs-lab">版型<select id="cfPattern">' + optTags(GLOVE_PATTERNS, craftSel.pattern, function (o) { return o.name + ' · ' + o.note; }) + '</select></label>';
      html += '<label class="cs-lab">外皮（消耗对应皮料 ×' + CRAFT_MAT_NEED + '）<select id="cfOuter">' + optTags(GLOVE_OUTERS, craftSel.outer, function (o) { return o.name + ' · ' + o.note; }) + '</select></label>';
      html += '<label class="cs-lab">内衬（消耗对应内衬材料 ×' + CRAFT_MAT_NEED + '）<select id="cfLining">' + optTags(GLOVE_LININGS, craftSel.lining, function (o) { return o.name + ' · ' + o.note; }) + '</select></label>';
      html += '<div class="custom-preview" id="craftPreview"></div>';
      html += '<div class="plan-foot"><button class="primary-btn" id="btnCraft">打造这副拳套（¥' + CRAFT_FEE + ' 手工费）</button></div>';
      el.innerHTML = html;
      [['cfPattern', 'pattern'], ['cfOuter', 'outer'], ['cfLining', 'lining']].forEach(function (pair) {
        var s = $(pair[0]);
        if (s) s.addEventListener('change', function () { craftSel[pair[1]] = s.value; updateCraftPreview(); });
      });
      var b = $('btnCraft');
      if (b) b.addEventListener('click', confirmCraft);
      updateCraftPreview();
    }

    function useConsumable(id) {
      var c = consumableById(id);
      if (!c || (S.bag[id] || 0) < 1 || S.buffs[id]) return;
      S.bag[id] -= 1;
      S.buffs[id] = true;
      dailyLog('使用了' + c.name + '：' + c.desc + '。', 'good');
      render();
      toast(c.name + ' 已使用，将在下一次生效');
    }

    /* ================= 战斗 ================= */
    var B = null; // 战斗状态
    var battleTimer = null;

    function makeFoe() {
      var w = weekOf(S.day);
      ensureRoster();
      // 角色池匹配：从池中取与玩家名次相差 ≤5 的在榜角色随机抽一位；窗口为空时取距离最近的 3 位兜底
      var pool = S.roster.filter(function (m) { return m.rank > 0 && Math.abs(m.rank - S.rank) <= 5; });
      if (!pool.length) {
        pool = S.roster.filter(function (m) { return m.rank > 0; })
          .sort(function (a, b) { return Math.abs(a.rank - S.rank) - Math.abs(b.rank - S.rank); }).slice(0, 3);
      }
      var member = pool[Math.floor(Math.random() * pool.length)];
      var rank = member.rank;
      // 对手强度 = 该角色当前 rating（钳制到旧公式封顶线 9.1 + 周数×0.70 + 49×0.3，下限 6）；w≤2 新手缓冲 −2（沿用旧规则）
      var base = clamp(member.rating, 6, 9.1 + w * 0.70 + 49 * 0.3);
      if (w <= 2) base -= 2; // P0-3：新手缓冲——前两周对手整体稍弱
      function v(spread) { return Math.max(4, Math.round(base + rnd(-spread, spread) + rnd(0, Math.min(5, w)))); }
      var attrs = { power: v(3), endurance: v(3), will: v(3), speed: v(3), accuracy: v(3), footwork: v(3), defense: v(3), technique: v(3) };
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
        style: member.style, styleIntensity: intensity
      };
    }
    function styleOf(f) { return f && f.style ? FOE_STYLES[f.style] : null; }
    /* 第二轮回炉 P2-7：手动 / 自动共用的命中与格挡计算（相同输入 → 相同结果，两模式不再各算一套） */
    function calcHitChance(att, def, attTac, defTac) {
      var hc = 0.70 + (att.attrs.accuracy - def.attrs.footwork) * 0.01;
      if (defTac === 'counter') hc *= 0.7;      // 稳守方闪避+
      if (attTac === 'attack' && defTac !== 'counter') hc *= 1.02;
      return clamp(hc, 0.30, 0.95);
    }
    function calcBlockChance(def) { // 对手抱架格挡概率：基数 0.16 + 稳守反击战术 0.08 + 防守反击型风格加成
      var ch = 0.16 + (def.tactic === 'counter' ? 0.08 : 0);
      if (def.style === 'guardcounter') ch += styleVal(def, 'blockAdd', 0);
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
      var prof = {}; PUNCH_KEYS.forEach(function (k) { prof[k] = punchLevel(S.punchExp[k]); });
      return {
        name: S.name, attrs: ea, prof: prof,
        hpMax: hpMax, hp: hpMax, stam: 100, hits: 0, dmg: 0, used: {}, tactic: 'attack', speechBuff: false,
        dmgTakenMul: Math.max(0.5, 1 - gearDrPct() / 100) // 减伤装备（护齿/护头，含强化）合计减伤%
      };
    }

    var pendingFoe = null;
    function openModeModal() {
      pendingFoe = makeFoe();
      if (S.scoutedForDay === S.day) { // 录像研究侦察到的弱点
        pendingFoe.weakness = PUNCH_KEYS[Math.floor(Math.random() * PUNCH_KEYS.length)];
      }
      var a = pendingFoe.attrs;
      var mfi = $('modeFoeImg'); if (mfi) { mfi.src = pendingFoe.img; mfi.alt = pendingFoe.name + ' 的立绘'; }
      $('modeFoeInfo').textContent = pendingFoe.name + '（国内排名第 ' + pendingFoe.rank + ' 名，你是第 ' + S.rank + ' 名｜力量 ' + a.power + ' · 速度 ' + a.speed + ' · 耐久 ' + a.endurance + ' · 技术 ' + a.technique + '）' +
        ' 风格：' + FOE_STYLES[pendingFoe.style].name + '。' +
        (pendingFoe.isRival ? ' 【宿敌战】她就是沈墨凛——赛后会有专属对白。' : '') +
        (pendingFoe.weakness ? ' 弱点已侦察：' + PUNCHES[pendingFoe.weakness].name + '方向防守薄弱，用' + PUNCHES[pendingFoe.weakness].name + '打他伤害 +30%。' : '');
      $('modeModal').classList.add('open');
    }

    function startBattle(mode) {
      B = {
        mode: mode,
        me: myFighter(), foe: pendingFoe || makeFoe(),
        round: 1, timeLeft: ROUND_SECONDS, phase: 'fight', // fight | break | over
        breakLeft: 0, treated: false, spoke: false,
        speed: 1, tickCount: 0,
        cd: { combo: 0, wall: 0, clinch: 0 },
        buff: { combo: 0, wall: 0 },
        clinchWarn: 0, result: null,
        meBlocking: false, foeBlocking: false, paused: false,
        // Phase 4：战斗时钟（秒，随 tick 推进）/ 连击 / 反击窗口 / 破防 / 击倒读秒
        time: 0,
        comboMe: 0, comboFoe: 0,
        meCounterUntil: -1, meCounterDir: '', foeCounterUntil: -1, foeCounterDir: '',
        meBrokenUntil: -1, foeBrokenUntil: -1,
        meDownsRound: 0, foeDownsRound: 0,
        meTrauma: 0, foeTrauma: 0, pendingKO: null, koKind: '',
        meDeathFight: false, foeDeathFight: false,
        roundStats: freshRoundStats(), meRoundMod: 'balanced', nextRoundMod: 'balanced',
        meBodyHits: 0, foeBodyHits: 0,
        downFighter: '', downLeft: 0, downIsTKO: false, tkoReason: '',
        man: { mX: 18, fX: 66, mY: 0, fY: 0, punchReady: {}, foePunchT: 1.4, foeMoveT: 0, foeDir: 0, dodgeUntil: 0, dodgeReadyAt: 0, lastDist: '', lastDodgeCat: 'back' }
      };
      pendingFoe = null;
      keysDown = {};
      touchBlock = false;
      $('meNameLabel').textContent = S.name + '（你 · 第 ' + S.rank + ' 名）';
      // 绷带：本场生效，赛后伤病概率减半
      B.bandage = !!S.buffs.bandage; S.buffs.bandage = false;
      // 报名免费（0 AP）：只记录今天已比赛一场，赛后不跳天、当天剩余 AP 保留
      S.lastMatchDay = S.day;
      // 心态对比赛的影响（框架）：紧张（20~39）前两回合全属性 −5%；疲劳（0~19）体力消耗 +10%
      B.mindTense = S.mind >= 20 && S.mind < 40;
      B.mindStamMul = S.mind < 20 ? 1.1 : 1;
      if (B.mindTense) ATTRS.forEach(function (a) { B.me.attrs[a.key] = Math.round(B.me.attrs[a.key] * 0.95 * 10) / 10; });
      B.foe.tactic = ['attack', 'counter', 'points'][Math.floor(Math.random() * 3)];
      $('dailyView').style.display = 'none';
      $('battleView').style.display = 'block';
      $('foeName').textContent = B.foe.name + '（第 ' + B.foe.rank + ' 名）';
      var fp = $('foePortrait'); if (fp) { fp.src = B.foe.img || ''; fp.alt = B.foe.name + ' 的立绘'; }
      var stb = $('foeStyleBadge');
      if (stb && B.foe.style) { var stDef = FOE_STYLES[B.foe.style]; stb.textContent = stDef.name; stb.className = 'style-badge ' + stDef.cls; stb.style.display = ''; }
      $('battleLog').innerHTML = '';
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
      $('figMe').style.transform = ''; $('figFoe').style.transform = '';
      $('figMe').style.left = B.man.mX + '%'; $('figFoe').style.left = B.man.fX + '%';
      $('figMe').querySelector('.fig').style.top = '0px'; $('figFoe').querySelector('.fig').style.top = '0px';
      $('koText').classList.remove('go');
      audio(); SFX.bell(2);
      var foeStyleTxt = B.foe.style ? FOE_STYLES[B.foe.style].name : '';
      if (mode === 'manual') {
        blog('比赛开始！第 1 回合。对手「' + B.foe.name + '」是' + foeStyleTxt + '（战术：' + TACTICS[B.foe.tactic].name + '）。', 'dim');
        blog('连贯命中攒连击加伤害；闪避后 1 秒内出拳是反击；对手格挡时击腹可破防，破防接直拳。KO 看重创槽：有效命中积累（刺拳+' + PUNCH_KO.jab + '/直拳+' + PUNCH_KO.straight + '/上勾·摆拳+' + PUNCH_KO.upper + '/击腹+' + PUNCH_KO.body + '，格挡只积一半，每秒衰减' + KO_DECAY + '），满100直接KO；单次伤害≥当前HP 30%也直接KO；单次25%~30%击倒读秒，本回合3次击倒触发TKO判定（按顶部「TKO死战」设置：' + (S.deathFight ? '开，自动死战' : '关，直接判负') + '）。', 'dim');
        blog(isTouch
          ? '手动操作：左手摇杆移动，右手大按钮出前手/后手拳，金边按钮可直接出摆拳/上勾/击腹；格挡按住生效（出现护盾弧），闪避/垫步点按触发。'
          : '手动操作：A/D 移动贴近对手，J/K 出拳，U 直接上勾、B 直接击腹，空格格挡，Shift+方向闪避。按 H 看键位。', 'dim');
        $('meTacticName').textContent = '手动操作';
      } else {
        blog('比赛开始！第 1 回合。对手「' + B.foe.name + '」是' + foeStyleTxt + '（战术：' + TACTICS[B.foe.tactic].name + '）。', 'dim');
        blog('双方都会攒连击、抓闪避反击、用击腹破防——盯着擂台下方的状态条。', 'dim');
        blog('自动观看模式：你的 HP 上限 ' + B.me.hpMax + '（伤病影响 −' + Math.round(S.injury * 0.5) + '），用战术和指令干预比赛！', 'dim');
        setTactic('attack');
      }
      if (B.foe.weakness) blog('录像研究奏效：对手弱点是「' + PUNCHES[B.foe.weakness].name + '」方向的防守，用' + PUNCHES[B.foe.weakness].name + '打他伤害 +30%！', 'good');
      if (B.mindTense) blog('心态有些紧张：前两回合全属性 −5%，第 3 回合起恢复正常。', 'bad');
      if (B.mindStamMul > 1) blog('心态疲劳：本场比赛体力消耗 +10%，注意分配体力。', 'bad');
      if (injuryDebuffMul() < 1) blog('伤病未愈（伤病 ' + Math.round(S.injury) + '）：本场全属性 ' + (injuryDebuffMul() <= 0.85 ? '−15%' : '−5%') + '，是咬牙带伤上场。', 'bad');
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
    /* ================= 音效（Web Audio 现场合成，无外部文件） ================= */
    var AC = null, muted = false;
    function audio() {
      if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (AC && AC.state === 'suspended') AC.resume();
      return AC;
    }
    function noiseBuffer(ac, dur) {
      var buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }
    function playNoise(dur, type, freq, peak, delay) {
      var ac = audio(); if (!ac || muted) return;
      var t = ac.currentTime + (delay || 0);
      var src = ac.createBufferSource(); src.buffer = noiseBuffer(ac, dur);
      var f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      var g = ac.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(ac.destination);
      src.start(t); src.stop(t + dur + 0.05);
    }
    function playTone(freq, dur, type, peak, delay, slideTo) {
      var ac = audio(); if (!ac || muted) return;
      var t = ac.currentTime + (delay || 0);
      var o = ac.createOscillator(); o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      var g = ac.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
    var SFX = {
      light: function () { playNoise(0.07, 'bandpass', 1800, 0.5); playTone(300, 0.05, 'triangle', 0.14); },
      heavy: function () { playNoise(0.16, 'lowpass', 520, 0.85); playTone(120, 0.2, 'sine', 0.7, 0, 42); },
      block: function () { playNoise(0.09, 'lowpass', 300, 0.45); playTone(90, 0.09, 'sine', 0.3, 0, 55); },
      whiff: function () { playNoise(0.08, 'bandpass', 950, 0.10); },
      bell: function (times) {
        for (var i = 0; i < (times || 1); i++) {
          playTone(1568, 1.1, 'sine', 0.20, i * 0.4);
          playTone(2093, 0.9, 'sine', 0.09, i * 0.4);
          playTone(2637, 0.55, 'sine', 0.045, i * 0.4);
        }
      },
      crowd: function () { playNoise(1.5, 'bandpass', 750, 0.55); playNoise(1.2, 'bandpass', 1250, 0.32, 0.15); playNoise(0.9, 'highpass', 2000, 0.15, 0.3); }
    };

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
      var y = figEl.offsetTop + 32;
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
    function hitFx(figDefender, heavy, crit) {
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
    }
    function koFx() {
      var ring = $('ring');
      ring.classList.add('slowmo');
      shakeRing(true);
      var fl = $('koFlash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
      var kt = $('koText'); kt.classList.remove('go'); void kt.offsetWidth; kt.classList.add('go');
      SFX.crowd(); SFX.heavy();
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
      if (isMeDefender) { B.meCounterUntil = B.time + 1; B.meCounterDir = c; }
      else { B.foeCounterUntil = B.time + 1; B.foeCounterDir = c; }
    }
    function resetCombo(isMeAttacker) { if (!B) return; if (isMeAttacker) B.comboMe = 0; else B.comboFoe = 0; }
    function startKnockdown(defIsMe, dmg, hpBefore) {
      if (!B || B.phase !== 'fight') return false;
      var def = defIsMe ? B.me : B.foe;
      if (def.hp <= 0) return false;
      if (!(dmg >= 10 && dmg >= hpBefore * 0.25 && dmg < hpBefore * 0.30)) return false; // 击倒带：当前HP 25%~30%（用户拍板，与单次 KO 阈值 30% 衔接）
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
      $('downWho').textContent = (defIsMe ? '你被击倒了！' : '对手被击倒！') + '（本回合第 ' + downs + ' 次）';
      $('downSub').textContent = B.downIsTKO ? '本回合第 3 次击倒——读秒后按「TKO死战」设置判定（' + (S.deathFight ? '开：自动死战' : '关：直接判负') + '）' : '读秒中…站起来就能继续，HP 回到至少 20%';
      $('downCount').textContent = '3';
      $('downOverlay').classList.add('go');
      SFX.heavy(); shakeRing(true);
      blog('第' + B.round + '回合：' + (defIsMe ? '你被重击击倒了！' : '对手被击倒了！') + '裁判开始读秒（本回合第 ' + downs + ' 次击倒' + (B.downIsTKO ? '，已达 3 次，读秒后 TKO 判定' : '') + '）。', defIsMe ? 'bad' : 'good');
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
        if (defIsMe) B.meDeathFight = true; else B.foeDeathFight = true;
        applyDeathFightRecovery(defIsMe);
        blog((defIsMe ? '你按设置死战到底！' : '对手按设置死战到底！') + '伤害 +10%，但再被击倒一次就直接判负' + (defIsMe ? '，赛后伤病 +10' : '') + '。HP 回到 ' + Math.round(def.hp) + '，比赛继续！', defIsMe ? 'good' : 'bad');
        toast(defIsMe ? '死战到底！再倒一次就判负' : '对手死战到底！');
      } else {
        def.hp = 0; B.koKind = 'tko-giveup'; B.phase = 'fight';
        blog((defIsMe ? '死战设置关——TKO 判负。' : '死战设置关——对手 TKO，你判胜！'), defIsMe ? 'bad' : 'good');
        finishBattle();
      }
      renderBattle();
    }
    function decideTKO(defIsMe) {
      if (!B) return;
      // 死战改为预设开关（顶部「TKO死战」）：开=自动死战到底，关=直接判负。手动/自动统一，双方同规则，不弹窗、不看意志
      var on = !!S.deathFight;
      blog('TKO 判定：死战设置「' + (on ? '开' : '关') + '」——' + (on ? (defIsMe ? '你' : '对手') + '自动死战到底！' : (defIsMe ? '你' : '对手') + '直接判负。'), on ? (defIsMe ? 'good' : 'bad') : (defIsMe ? 'bad' : 'good'));
      if (defIsMe) toast(on ? 'TKO死战开：自动死战到底！' : 'TKO死战关：直接判负');
      resolveTKOChoice(defIsMe, on);
    }
    function resolveKnockdown() {
      if (!B || B.phase !== 'down') return;
      var defIsMe = B.downFighter === 'me';
      var def = defIsMe ? B.me : B.foe;
      var fig = $(defIsMe ? 'figMe' : 'figFoe');
      $('downOverlay').classList.remove('go');
      fig.classList.remove('down');
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
      blog('读秒结束——' + (defIsMe ? '你咬牙站了起来' : '对手摇晃着站了起来') + '！HP 回复至 ' + Math.round(def.hp) + '，比赛继续。', defIsMe ? 'good' : 'dim');
      renderBattle();
    }
    function tickDown(dt) {
      if (!B || B.phase !== 'down') return;
      B.downLeft -= dt;
      $('downCount').textContent = String(Math.max(1, Math.ceil(B.downLeft)));
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
      if (!isMeAttacking && att.style === 'guardcounter') freq *= 1.25; // 防守反击型平时收着，抓反击时不降频
      if (att.stam < 30) freq *= 0.7;
      if (Math.random() > freq) { att.stam = Math.min(100, att.stam + 0.92); return; }

      var key = pickPunch(att, isMeAttacking);
      var p = PUNCHES[key];
      att.used[key] = (att.used[key] || 0) + 1;
      var stamCost = p.stam * (att.tactic === 'attack' ? 1.5 : att.tactic === 'points' ? 0.7 : 1);
      if (!isMeAttacking) stamCost *= styleVal(att, 'stamMul', 1); // 力量型重拳耗体力大
      if (isMeAttacking && B.mindStamMul) stamCost *= B.mindStamMul; // 心态疲劳：我方体力消耗 +10%
      att.stam = Math.max(0, att.stam - stamCost);
      // Phase 4：对手随机抱架（防守反击型更爱格挡），供击腹破防判定；我方格挡由输入/铁壁决定
      if (isMeAttacking) {
        var gbCh = calcBlockChance(B.foe); // P2-7：与手动模式共用同一格挡公式
        if (B.time >= (B.foeBrokenUntil || -1) && Math.random() < gbCh) {
          B.foeBlocking = true;
          $('figFoe').classList.add('guarding');
          setTimeout(function () { var el = $('figFoe'); if (el) el.classList.remove('guarding'); }, 260);
        }
      }

      var hitChance = calcHitChance(att, def, att.tactic, def.tactic); // P2-7：与手动模式共用同一命中公式

      var who = isMeAttacking ? '我方' : '对手';
      var figAtt = $(isMeAttacking ? 'figMe' : 'figFoe');
      var figDef = $(isMeAttacking ? 'figFoe' : 'figMe');
      figAtt.classList.add('punching');
      figAtt.classList.add('lined');
      setTimeout(function () { figAtt.classList.remove('punching'); figAtt.classList.remove('lined'); }, 170);

      if (Math.random() > hitChance) {
        // 打空：进攻方连击清零；防守方视为闪避成功 → 开 1 秒反击窗口
        resetCombo(isMeAttacking);
        B.foeBlocking = false;
        openCounterWindow(!isMeAttacking, null);
        var counterP = def.tactic === 'counter' ? 0.45 : (def.style === 'guardcounter' ? 0.55 : 0.22);
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
      var dmg = Math.max(1, Math.round(raw - def.attrs.defense * 1.0)); // P0 联调：防守减伤权重 0.5→1.0
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
        resetCombo(isMeAttacking); // 自己的拳被格挡 → 连击被打断
      } else {
        if (isMeAttacking) { B.comboMe += 1; comboNow = B.comboMe; B.comboFoe = 0; }
        else { B.comboFoe += 1; comboNow = B.comboFoe; B.comboMe = 0; }
        comboPct = comboBonusPct(comboNow);
        if (comboPct > 0) dmg = Math.max(1, Math.round(dmg * (1 + comboPct / 100)));
      }
      var hpBefore = def.hp;
      def.hp = Math.max(0, def.hp - dmg);
      att.hits += 1;
      att.dmg += dmg;
      // 本回合战况统计（回合间总结用）
      if (!B.roundStats) B.roundStats = freshRoundStats();
      if (isMeAttacking) { B.roundStats.meHits += 1; B.roundStats.meDmg += dmg; if (comboNow > B.roundStats.meMaxCombo) B.roundStats.meMaxCombo = comboNow; if (key === 'body') B.meBodyHits = (B.meBodyHits || 0) + 1; }
      else { B.roundStats.foeHits += 1; B.roundStats.foeDmg += dmg; if (comboNow > B.roundStats.foeMaxCombo) B.roundStats.foeMaxCombo = comboNow; if (key === 'body') B.foeBodyHits = (B.foeBodyHits || 0) + 1; }
      // KO 重创槽：有效命中积累，格挡命中只积一半，穿透格挡算全额
      var koBase = PUNCH_KO[key] || 10;
      var koAdd = (guarding && !pierce) ? Math.round(koBase / 2) : koBase;
      var traumaAfter = 0;
      if (isMeAttacking) { B.foeTrauma = clamp((B.foeTrauma || 0) + koAdd, 0, 100); traumaAfter = B.foeTrauma; }
      else { B.meTrauma = clamp((B.meTrauma || 0) + koAdd, 0, 100); traumaAfter = B.meTrauma; }
      var koTriggered = '';
      if (traumaAfter >= 100) { koTriggered = 'trauma'; def.hp = 0; B.koKind = 'trauma'; }
      else if (dmg >= 10 && hpBefore > 0 && dmg >= hpBefore * 0.30) { koTriggered = 'single'; def.hp = 0; B.koKind = 'single'; } // 单次 KO 阈值：当前HP 30%（用户拍板；第二轮回炉曾越权抬高，已恢复）
      else if (def.hp <= 0) { koTriggered = 'hp'; B.koKind = 'hp'; }
      if (key === 'body') def.stam = Math.max(0, def.stam - dmg * 0.6); // 击腹双倍削体力（含基础命中削减）
      def.stam = Math.max(0, def.stam - 1);

      var figDef = $(isMeAttacking ? 'figFoe' : 'figMe');
      var pop = $(isMeAttacking ? 'popFoe' : 'popMe');
      var heavy = crit || dmg >= 16;
      hitFx(figDef, heavy, crit);
      if (guarding && !pierce) SFX.block(); else if (heavy) SFX.heavy(); else SFX.light();
      figDef.classList.remove('hit'); void figDef.offsetWidth; figDef.classList.add('hit');
      pop.textContent = (koTriggered ? 'KO! ' : '') + (counterBonus ? '反击! ' : '') + (brokeNow ? '破防! ' : '') + (crit ? '暴击! ' : '') + '-' + dmg + (comboNow >= 2 ? ' · ' + comboNow + '连击' : '') + ' · 重创+' + koAdd;
      pop.className = 'dmg-pop' + (crit || counterBonus ? ' crit' : heavy ? ' heavy' : '');
      void pop.offsetWidth; pop.classList.add('show');

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
      if (koTriggered || traumaAfter >= 60) blog('重创值：' + (isMeAttacking ? '对手 ' + Math.round(traumaAfter) : '你 ' + Math.round(traumaAfter)) + ' / 100（+' + koAdd + (guarding && !pierce ? '，格挡只积一半' : '') + '）' + (koTriggered === 'trauma' ? '——重创槽满格，直接 KO！' : koTriggered === 'single' ? '——单次伤害达到当前 HP 的 30%，重击 KO！' : koTriggered === 'hp' ? '——HP 归零，KO！' : '，逼近 KO！'), koTriggered ? (isMeAttacking ? 'good' : 'bad') : 'dim');
      // 击倒判定：未触发 KO 时，单次 25%~30% 进读秒（≥30% 已在上方直接 KO）
      if (!koTriggered) startKnockdown(!isMeAttacking, dmg, hpBefore);
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

      var atkRounds = Math.max(1, B.speed);
      for (var ai = 0; ai < atkRounds; ai++) {
        if (B.phase !== 'fight') break; // 已进入读秒/终局，停手
        tryAttack(B.me, B.foe, true);
        if (B.phase === 'fight' && B.foe.hp > 0) tryAttack(B.foe, B.me, false);
        if (B.me.hp <= 0 || B.foe.hp <= 0) break;
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
      SFX.bell(1);
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
      var foeEl = $('breakFoeInfo'); if (foeEl) foeEl.innerHTML = '<b>敌人特点</b> — 风格：' + (B.foe.style ? FOE_STYLES[B.foe.style].name : '—') + ' · 当前战术：' + TACTICS[B.foe.tactic].name + '<br />观察：' + foeTendencyTxt() + '。';
      var tipsEl = $('breakTips'); if (tipsEl) tipsEl.innerHTML = breakTips().map(function (t) { return '<li><b>提示：</b>' + t + '</li>'; }).join('');
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
      B.roundStats = freshRoundStats();
      if (B.mode === 'manual') {
        B.meRoundMod = B.nextRoundMod || 'balanced';
        blog('下回合战术：' + BREAK_TACTICS[B.meRoundMod].name + (B.meRoundMod === 'attack' ? '（伤害 +10%，防御 −10%）' : B.meRoundMod === 'guard' ? '（防御 +10%，伤害 −10%）' : '（无修正）') + '。', 'dim');
      }
      B.nextRoundMod = 'balanced';
      B.timeLeft = ROUND_SECONDS;
      B.me.speechBuff = B.pendingSpeech === true;
      B.pendingSpeech = false;
      // 对手每回合可能换战术
      if (Math.random() < 0.4) {
        B.foe.tactic = ['attack', 'counter', 'points'][Math.floor(Math.random() * 3)];
        blog('对手调整了战术：' + TACTICS[B.foe.tactic].name + '。', 'dim');
      }
      $('breakPanel').classList.remove('open');
      $('roundLabel').textContent = 'ROUND ' + B.round;
      SFX.bell(1);
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
      if (B.koKind === 'tko-giveup' && B.foe.hp <= 0) { win = true; how = 'TKO 获胜！（对手第 3 次击倒，死战设置关直接判负）'; $('figFoe').classList.add('down'); }
      else if (B.koKind === 'tko-giveup' && B.me.hp <= 0) { win = false; how = 'TKO 落败（第 3 次击倒，死战设置关直接判负）'; $('figMe').classList.add('down'); }
      else if (B.koKind === 'deathfight-down' && B.foe.hp <= 0) { win = true; how = 'TKO 获胜！（对手死战中再次被击倒）'; $('figFoe').classList.add('down'); }
      else if (B.koKind === 'deathfight-down' && B.me.hp <= 0) { win = false; how = 'TKO 落败（死战中再次被击倒）'; $('figMe').classList.add('down'); }
      else if (B.koKind === 'trauma' && B.foe.hp <= 0) { win = true; how = 'KO 获胜！（重创值满格 100，积累终结）'; $('figFoe').classList.add('down'); }
      else if (B.koKind === 'trauma' && B.me.hp <= 0) { win = false; how = '被 KO 了……（你的重创值满格 100）'; $('figMe').classList.add('down'); }
      else if (B.koKind === 'single' && B.foe.hp <= 0) { win = true; how = 'KO 获胜！（单次重击达到对手当前 HP 的 30%）'; $('figFoe').classList.add('down'); }
      else if (B.koKind === 'single' && B.me.hp <= 0) { win = false; how = '被 KO 了……（单次重击达到你当前 HP 的 30%）'; $('figMe').classList.add('down'); }
      else if (B.tkoReason && B.foe.hp <= 0 && B.downFighter === 'foe') { win = true; how = 'TKO 获胜！（对手' + B.tkoReason + '）'; $('figFoe').classList.add('down'); }
      else if (B.tkoReason && B.me.hp <= 0 && B.downFighter === 'me') { win = false; how = 'TKO 落败（你' + B.tkoReason + '）'; $('figMe').classList.add('down'); }
      else if (B.foe.hp <= 0) { win = true; how = 'KO 获胜！（HP 归零）'; $('figFoe').classList.add('down'); }
      else if (B.me.hp <= 0) { win = false; how = '被 KO 了……（HP 归零）'; $('figMe').classList.add('down'); }
      else if (mePts > foePts) { win = true; how = '点数判定获胜（' + mePts + ' : ' + foePts + '）'; }
      else if (mePts < foePts) { win = false; how = '点数判定落败（' + mePts + ' : ' + foePts + '）'; }
      else { win = B.me.hp > B.foe.hp; how = '点数相同，按剩余 HP 判定' + (win ? '获胜' : '落败'); }
      B.result = { win: win, how: how };
      if (isKO) koFx(); else SFX.bell(3);
      settleNow(win, how, isKO ? 2000 : 900);
    }

    /* 结算（三种模式共用）：奖金、名声、熟练度经验、受伤、体力消耗 */
    function settleNow(win, how, delay) {
      var w = weekOf(S.day);
      var prizeFull = prizeForRank(w); // 基础奖金 × 排名加成 × 影响力加成（按赛前影响力档计算）
      var prize = win ? prizeFull : Math.floor(prizeFull / 2);
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
        if (foeMember) foeMember.rating = clamp(Math.round((foeMember.rating + (win ? -0.3 : 0.3)) * 100) / 100, 6, 30);
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
      // Phase 7：剧情触发（事件只入队，结算窗关闭后才依次弹出，不打断结算流程）
      stageDoneNow.forEach(function (d) { if (d.id >= 2 && d.id <= 6) queueStory('ev_stage' + d.id); });
      if (win && S.wins === 1) queueStory('ev_firstwin');
      if (!win && S.losses === 1) queueStory('ev_firstloss');
      if (oldRank > 25 && S.rank <= 25) queueStory('ev_top25');
      if (oldRank > 10 && S.rank <= 10) queueStory('ev_top10');
      if (oldRank > 1 && S.rank <= 1) queueStory('ev_champ');
      if (win && B.foe.hp <= 0) queueStory('ev_firstko');
      if (!win && B.me.hp <= 0) queueStory('ev_firstkoed');
      if (B.foe.isRival) { // 宿敌战：胜 +8 / 负 +4 好感，赛后对白每场至多一段
        addAffinity('rival', win ? 8 : 4);
        queueStoryRepeat(win ? 'ev_rival_win' : 'ev_rival_lose');
      }
      if (B.foe.isTeammate) addAffinity('teammate', 2); // 同期队友林小葵（角色池 key 判定）：赛后小幅好感

      var rows = '';
      rows += '<tr><td>奖金' + (win ? '' : '（出场费）') + '</td><td>¥' + prize + '（基础 ¥' + (200 + w * 100) + ' × 排名加成 × 影响力加成 +' + influencePctBefore + '%）</td></tr>';
      if (win) rows += '<tr><td>名声</td><td>+1（名声仅作纪念展示，不参与判定）</td></tr>';
      rows += '<tr><td>影响力</td><td>' + (influenceUp ? influenceLabel(influenceBefore) + ' → <b>' + influenceLabel(influenceAfter) + '</b>（档位提升！出场费加成 +' + influenceBonusPct() + '%）' : influenceDown ? influenceLabel(influenceBefore) + ' → <b>' + influenceLabel(influenceAfter) + '</b>（排名跌出门槛，档位下降！出场费加成 +' + influenceBonusPct() + '%）' : influenceLabel(influenceAfter) + '（动态档位：按当前胜场/排名计算，输比赛跌出门槛会掉档）') + '</td></tr>';
      rows += '<tr><td>连胜</td><td>' + (win ? S.winStreak + ' 连胜' : '中断，清零') + '</td></tr>';
      stageDoneNow.forEach(function (d) {
        rows += '<tr><td>阶段完成：' + d.name + '</td><td>奖励 ¥' + d.reward + ' 已到账' + (d.title ? ' ＋称号「' + d.title + '」' : '') + '</td></tr>';
      });
      rows += '<tr><td>国内排名</td><td>第 ' + oldRank + ' 名 → 第 ' + S.rank + ' 名' + (rankMoved < 0 ? '（上升 ' + (-rankMoved) + ' 名）' : rankMoved > 0 ? '（下降 ' + rankMoved + ' 名）' : '（不变）') + '</td></tr>';
      rows += '<tr><td>我方总伤害 / 命中</td><td>' + B.me.dmg + ' / ' + B.me.hits + '</td></tr>';
      rows += '<tr><td>对手总伤害 / 命中</td><td>' + B.foe.dmg + ' / ' + B.foe.hits + '</td></tr>';
      PUNCH_KEYS.forEach(function (k) {
        if (expGain[k] > 0) rows += '<tr><td>' + PUNCHES[k].name + '熟练度（出拳 ' + (B.me.used[k] || 0) + ' 次）</td><td>经验 +' + expGain[k] + '</td></tr>';
      });
      if (injured) rows += '<tr><td>伤病</td><td>+' + injured + '（休息可恢复）</td></tr>';
      if (downInj) rows += '<tr><td>被击倒 ' + B.meDowns + ' 次</td><td>伤病 +' + downInj + '</td></tr>';
      if (koInj) rows += '<tr><td>被 KO 的代价</td><td>伤病 +' + koInj + '</td></tr>';
      if (deathInj) rows += '<tr><td>死战到底的代价</td><td>伤病 +' + deathInj + '</td></tr>';
      if (B.koKind) rows += '<tr><td>终结方式</td><td>' + (B.koKind === 'trauma' ? '重创值满格 KO' : B.koKind === 'single' ? '单次重击 KO（≥当前HP 30%）' : B.koKind === 'tko-giveup' ? 'TKO（死战关，直接判负）' : B.koKind === 'deathfight-down' ? '死战中再次击倒判负' : B.koKind === 'sim' ? 'KO（模拟）' : 'HP 归零 KO') + '</td></tr>';
      rows += '<tr><td>心态</td><td>' + (mindDelta > 0 ? '+' : '') + mindDelta + '（当前 ' + Math.round(S.mind) + ' · ' + mindTierName(S.mind) + '）</td></tr>';
      rows += '<tr><td>体力</td><td>降至 15，先好好休息</td></tr>';
      rows += '<tr><td>今日剩余行动点</td><td>' + S.ap + ' AP（报名免费，赛后保留）</td></tr>';
      $('settleTable').innerHTML = rows;
      $('settleTitle').textContent = 'vs ' + B.foe.name;
      var res = $('settleResult');
      res.textContent = win ? '胜 利' : '败 北';
      res.className = 'big-result ' + (win ? 'win' : 'lose');
      $('settleDesc').textContent = how + '　战绩 ' + S.wins + ' 胜 · ' + S.losses + ' 负' + (rankMoved < 0 ? '　排名升至第 ' + S.rank + ' 名，恭喜！' : '') + '　影响力 ' + influenceLabel(influenceAfter) + (stageDoneNow.length ? '　阶段「' + stageDoneNow[stageDoneNow.length - 1].name + '」完成！' : '');
      if (B.mode !== 'sim') dailyLog('比赛 vs ' + B.foe.name + '（第 ' + foeRank + ' 名）：' + how + '，国内排名第 ' + oldRank + ' 名 → 第 ' + S.rank + ' 名，影响力 ' + influenceLabel(influenceAfter) + (influenceUp ? '（本场后提升！）' : influenceDown ? '（本场后下降！）' : '') + '。', win ? 'good' : 'bad');
      if (rankMoved < 0) setTimeout(function () { toast('国内排名升至第 ' + S.rank + ' 名！'); }, (delay || 900) + 500);
      setTimeout(function () { $('settleModal').classList.add('open'); }, delay || 900);
      save();
    }

    /* ================= 模式3：模拟跳过 ================= */
    function simulateBattle() {
      var foe = pendingFoe || makeFoe();
      pendingFoe = null;
      if (!foe.weakness && S.scoutedForDay === S.day) foe.weakness = PUNCH_KEYS[Math.floor(Math.random() * PUNCH_KEYS.length)];
      var me = myFighter();
      B = { mode: 'sim', me: me, foe: foe, round: 1, phase: 'over', buff: { combo: 0, wall: 0 }, cd: { combo: 0, wall: 0 }, meBlocking: false, foeBlocking: false, time: 0, comboMe: 0, comboFoe: 0, meCounterUntil: -1, foeCounterUntil: -1, meBrokenUntil: -1, foeBrokenUntil: -1, meDownsRound: 0, foeDownsRound: 0, koKind: null };
      S.lastMatchDay = S.day; // 报名免费（0 AP），只记录今日已比赛
      B.bandage = !!S.buffs.bandage; S.buffs.bandage = false;
      if (S.mind >= 20 && S.mind < 40) ATTRS.forEach(function (a) { B.me.attrs[a.key] = Math.round(B.me.attrs[a.key] * 0.95 * 10) / 10; }); // 心态紧张修正
      function score(f) {
        var a = f.attrs;
        var profSum = 0; PUNCH_KEYS.forEach(function (k) { profSum += f.prof[k]; });
        return a.power * 1.4 + a.endurance * 1.1 + a.speed + a.accuracy + a.footwork * 0.8 + a.defense * 0.9 + a.technique + a.will * 0.6 + profSum * 2.2;
      }
      /* P1-1 对齐：模拟与自动原是两套未对齐的模型（同状态模拟 53% vs 自动 24.5%）。
         对齐方法——校准模拟公式参数：保留评分结构，把基准与缩放按自动战斗引擎的实测胜率标定
         （基准 0.50→0.46 是对手出拳频率优势在真实引擎中的等效值，缩放 120→240）。回炉实测差距收窄到 15 个百分点以内。 */
      var SIM_SCALE = 240;
      var winP = clamp(0.46 + (score(me) - score(foe)) / SIM_SCALE + (foe.weakness ? 0.05 : 0), 0.08, 0.92);
      var win = Math.random() < winP;
      var totalPunches = Math.round(rnd(24, 44));
      var weights = PUNCH_KEYS.map(function (k) { return 1 + me.prof[k] * 1.6; });
      var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
      PUNCH_KEYS.forEach(function (k, i) { me.used[k] = Math.round(totalPunches * weights[i] / wsum); });
      me.hits = Math.round(totalPunches * rnd(0.45, 0.65));
      me.dmg = Math.round(me.hits * rnd(6, 10));
      foe.hits = Math.round(totalPunches * rnd(0.4, 0.6));
      foe.dmg = Math.round(foe.hits * rnd(6, 10));
      var ko = Math.random() < 0.45;
      var r = 1 + Math.floor(Math.random() * 3);
      var how;
      if (ko) {
        B.koKind = 'sim'; // P2-16：模拟路径也要设置终结方式，结算表显示「KO（模拟）」行
        if (win) { foe.hp = 0; me.hp = Math.round(me.hpMax * rnd(0.3, 0.8)); how = '第 ' + r + ' 回合 KO 获胜！（模拟）'; }
        else { me.hp = 0; foe.hp = Math.round(foe.hpMax * rnd(0.3, 0.8)); how = '第 ' + r + ' 回合被 KO 落败（模拟）'; }
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
      if (keysCtx === 'pre') { $('modeModal').classList.add('open'); }
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
      var now = performance.now();
      if (now < B.man.dodgeUntil) return;
      var mp = MPUNCH[key];
      if (now < (B.man.punchReady[key] || 0)) return;
      var stamCost = mp.stam * (B.mindStamMul || 1); // 心态疲劳时体力消耗 +10%
      if (B.me.stam < stamCost) { toast('体力不足！拉开距离喘口气'); return; }
      var lowStam = B.me.stam < 30;
      // 出拳速度属性显著影响间隔：速度 10 ≈ ×0.98，20 ≈ ×0.66，30+ ≈ ×0.45（下限）
      var cd = mp.cd * clamp(1.3 - B.me.attrs.speed * 0.032, 0.45, 1.2) * (lowStam ? 1.4 : 1);
      B.man.punchReady[key] = now + cd;
      B.me.stam = Math.max(0, B.me.stam - stamCost);
      var fig = $('figMe');
      fig.classList.add('punching'); fig.classList.add('lined');
      setTimeout(function () { fig.classList.remove('punching'); fig.classList.remove('lined'); }, 110);
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
      setTimeout(function () { fig.classList.remove('punching'); fig.classList.remove('lined'); }, 150);
      if (performance.now() < B.man.dodgeUntil) {
        SFX.whiff();
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
      M.foePunchT -= dt;
      if (M.foePunchT <= 0) {
        var w = weekOf(S.day);
        M.foePunchT = Math.max(0.33, (rnd(0.55, 1.0) - w * 0.03) * 0.87) * (foe.tactic === 'counter' ? 1.5 : 1) / styleVal(foe, 'freqMul', 1);
        if (B.time < (B.foeCounterUntil || -1)) M.foePunchT = Math.min(M.foePunchT, 0.45); // 有反击窗口时抢着出拳
        if (dist <= 19 && foe.stam >= 6) foePunchManual(dist);
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
      var M = B.man, me = B.me;
      var meBrokenNow = B.time < (B.meBrokenUntil || -1);
      B.meBlocking = !!(keysDown.space || touchBlock) && !meBrokenNow; // 破防期间抱架失效
      $('figMe').classList.toggle('guarding', B.meBlocking);
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
      $('manualStatus').textContent = meBrokenNow ? '破防中！格挡失效（对手直拳 +20%）' :
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
      $('foeTacticName').textContent = TACTICS[B.foe.tactic].name + (B.foe.style ? ' · ' + FOE_STYLES[B.foe.style].name : '');
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
      cmdState('cmdCombo', B.cd.combo, 45, B.buff.combo > 0 ? '生效中 ' + Math.ceil(B.buff.combo) + 's' : '');
      cmdState('cmdWall', B.cd.wall, 60, B.buff.wall > 0 ? '生效中 ' + Math.ceil(B.buff.wall) + 's' : '');
      cmdState('cmdClinch', B.cd.clinch, 30, '');
    }
    function cmdState(id, cd, max, extra) {
      var btn = $(id);
      var lbl = btn.querySelector('[data-cd]');
      var bar = btn.querySelector('.cdbar');
      if (extra) { lbl.textContent = extra; btn.disabled = true; bar.style.width = '100%'; return; }
      if (cd > 0) { lbl.textContent = '冷却 ' + Math.ceil(cd) + 's'; btn.disabled = true; bar.style.width = (cd / max * 100) + '%'; }
      else { lbl.textContent = '就绪'; btn.disabled = !B || B.phase !== 'fight'; bar.style.width = '0%'; }
    }

    /* 指令 */
    function useCombo() {
      if (!B || B.phase !== 'fight' || B.cd.combo > 0) return;
      B.buff.combo = 10; B.cd.combo = 45;
      blog('指令：组合拳爆发！接下来 10 秒火力全开。', 'good');
      renderBattle();
    }
    function useWall() {
      if (!B || B.phase !== 'fight' || B.cd.wall > 0) return;
      B.buff.wall = 10; B.cd.wall = 60;
      blog('指令：铁壁防守！10 秒内大幅减伤。', 'good');
      renderBattle();
    }
    function useClinch() {
      if (!B || B.phase !== 'fight' || B.cd.clinch > 0) return;
      B.cd.clinch = 30;
      B.me.stam = Math.min(100, B.me.stam + 20);
      B.clinchWarn += 1;
      if (B.clinchWarn >= 4) {
        // P2-12：同场比赛第 4 次起，每次搂抱被裁判判罚扣 10 点战斗体力（不再只是口头警告）
        B.me.stam = Math.max(0, B.me.stam - 10);
        blog('指令：搂抱拖时间，体力回复 20。裁判判罚：本场第 ' + B.clinchWarn + ' 次搂抱，消极比赛——扣 10 点体力！', 'bad');
        toast('裁判判罚：搂抱过多，扣 10 点体力');
      } else {
        blog('指令：搂抱拖时间，体力回复 20。' + (B.clinchWarn === 3 ? '裁判口头警告：再抱下去要判罚扣体力了！' : ''), 'good');
      }
      renderBattle();
    }

    /* ================= 事件绑定 ================= */
    $('btnTrain').addEventListener('click', function () { closeSubLists('trainList'); $('trainList').classList.toggle('open'); renderPlan(); });
    $('btnOut').addEventListener('click', function () { closeSubLists('outList'); $('outList').classList.toggle('open'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-out]'), function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-out');
        if (S.ap < 2) { toast('行动点不足（外出需要 2 AP）'); return; }
        if (kind === 'shop') {
          // 进店先确认：确认后才扣 2 AP，取消不消耗
          askConfirm({
            title: '外出 · 体育用品店',
            lines: [
              ['行动点', '−2 AP（' + S.ap + ' → ' + (S.ap - 2) + '）'],
              ['效果', '进入商店选购装备与消耗品']
            ],
            note: '购买只花金钱，不再另耗 AP；每次买到东西心态 +10。出门这一趟本身消耗 2 AP，点「离开商店」不退还。',
            okText: '确认出门',
            onOk: function () {
              if (S.ap < 2) { toast('行动点不足（外出需要 2 AP）'); return; }
              S.ap -= 2; // 外出本身 2 AP，进入商店后购买不再重复收费
              $('outList').classList.remove('open');
              renderShop();
              $('shopList').classList.add('open');
              render();
              $('shopList').classList.add('open'); // render 不关闭面板，这里确保保持打开
            }
          });
        } else if (kind === 'hospital') {
          // 医院治疗：先确认（2 AP + ¥500 → 伤病 −30），确认后才结算
          if (S.injury <= 0) { toast('身上没伤，不用去医院'); return; }
          if (S.money < 500) { toast('钱不够治疗（需要 ¥500）'); return; }
          askConfirm({
            title: '外出 · 医院治疗',
            lines: [
              ['行动点', '−2 AP（' + S.ap + ' → ' + (S.ap - 2) + '）'],
              ['金钱', '¥' + S.money + ' → ¥' + (S.money - 500) + '（−500）'],
              ['伤病', fmtDelta(S.injury, Math.max(0, S.injury - 30))]
            ],
            note: '专业运动医学处理，伤病 −30。伤病 ≥30 时比赛全属性 −5%、≥60 时 −15%，别带伤硬撑。',
            okText: '确认治疗',
            onOk: function () {
              if (S.ap < 2 || S.money < 500 || S.injury <= 0) { toast('条件已变化，无法治疗'); return; }
              S.ap -= 2; S.money -= 500;
              S.injury = Math.max(0, S.injury - 30);
              dailyLog('Day ' + S.day + ' · 医院治疗：伤病 −30，花费 ¥500。', 'good');
              $('outList').classList.remove('open');
              render();
              toast('治疗完成，伤病减轻');
            }
          });
        } else {
          if (S.money < 300) { toast('钱不够散心（需要 ¥300）'); return; }
          closeSubLists('relaxList');
          $('relaxList').classList.add('open');
        }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-relax]'), function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-relax');
        if (S.ap < 2) { toast('行动点不足（外出需要 2 AP）'); return; }
        if (S.money < 300) { toast('钱不够散心（需要 ¥300）'); return; }
        askConfirm({
          title: '外出散心 · ' + kind,
          lines: [
            ['行动点', '−2 AP（' + S.ap + ' → ' + (S.ap - 2) + '）'],
            ['金钱', '¥' + S.money + ' → ¥' + (S.money - 300) + '（−300）'],
            ['体力', fmtDelta(S.stamina, Math.min(100, S.stamina + 10))],
            ['心态', fmtDelta(S.mind, Math.min(100, S.mind + 20)) + ' · ' + mindTierName(Math.min(100, S.mind + 20))]
          ],
          okText: '确认出门',
          onOk: function () {
            if (S.ap < 2 || S.money < 300) { toast('条件已变化，无法出行'); return; }
            S.ap -= 2; // 外出 2 AP，确认后与散心效果一起结算
            doRelax(kind);
          }
        });
      });
    });
    $('btnStatus').addEventListener('click', openStatus);
    $('btnBackDaily').addEventListener('click', closeStatus);
    Array.prototype.forEach.call(document.querySelectorAll('[data-app-dim]'), function (b) {
      b.addEventListener('click', function () { setAppearance(b.getAttribute('data-app-dim'), b.getAttribute('data-app-val')); });
    });
    $('btnRename').addEventListener('click', function () {
      var v = $('nameInput').value.trim();
      if (!v) { toast('先输入一个名字'); return; }
      S.name = v.slice(0, 8);
      $('nameInput').value = '';
      dailyLog('从今天起，擂台上喊的是这个名字：' + S.name + '。');
      render();
      toast('已改名为：' + S.name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bagtab]'), function (b) {
      b.addEventListener('click', function () { bagTab = b.getAttribute('data-bagtab'); syncBagTabs(); });
    });
    $('btnWork').addEventListener('click', confirmWork);
    $('btnRest').addEventListener('click', confirmRest);
    $('btnSleep').addEventListener('click', confirmSleep);
    $('btnMatch').addEventListener('click', confirmMatch);
    $('btnCancelMode').addEventListener('click', function () { $('modeModal').classList.remove('open'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-mode');
        $('modeModal').classList.remove('open');
        if (m === 'manual') {
          keysCtx = 'pre';
          $('btnKeysMain').textContent = '开始战斗';
          prepKeysModal();
          $('keysModal').classList.add('open');
        } else if (m === 'auto') startBattle('auto');
        else simulateBattle();
      });
    });
    $('btnKeysMain').addEventListener('click', function () {
      $('keysModal').classList.remove('open');
      if (keysCtx === 'pre') startBattle('manual');
      else if (B) B.paused = false;
    });
    $('btnKeysCancel').addEventListener('click', cancelKeysModal); // P1-2
    $('keysModal').addEventListener('click', function (e) { if (e.target === this) cancelKeysModal(); }); // P1-2：点遮罩也可取消
    Array.prototype.forEach.call(document.querySelectorAll('#tacticRow .tac-btn'), function (b) {
      b.addEventListener('click', function () {
        if (!B || B.phase === 'over') return;
        setTactic(b.getAttribute('data-tac'));
        blog('战术切换：' + TACTICS[B.me.tactic].name + '。');
      });
    });
    $('cmdCombo').addEventListener('click', useCombo);
    $('cmdWall').addEventListener('click', useWall);
    $('cmdClinch').addEventListener('click', useClinch);
    $('btnMute').addEventListener('click', function () {
      muted = !muted;
      $('btnMute').textContent = muted ? '音效：关' : '音效：开';
      if (!muted) { audio(); SFX.light(); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.speed-btn'), function (b) {
      b.addEventListener('click', function () {
        if (!B) return;
        B.speed = parseInt(b.getAttribute('data-speed'), 10);
        Array.prototype.forEach.call(document.querySelectorAll('.speed-btn'), function (x) { x.classList.toggle('active', x === b); });
      });
    });
    $('btnTreat').addEventListener('click', function () {
      if (!B || B.phase !== 'break' || B.treated) return;
      B.treated = true;
      B.me.hp = Math.min(B.me.hpMax, B.me.hp + 10);
      $('btnTreat').disabled = true;
      blog('角落处理伤口，回复 10 HP。', 'good');
      renderBattle();
    });
    $('btnSpeech').addEventListener('click', function () {
      if (!B || B.phase !== 'break' || B.spoke) return;
      B.spoke = true;
      $('btnSpeech').disabled = true;
      var chance = 0.4 + S.attrs.will * 0.01;
      if (Math.random() < chance) { B.pendingSpeech = true; blog('场边训话奏效！下一回合伤害 +10%。', 'good'); }
      else blog('训话没起什么作用，她还在喘气。', 'dim');
      renderBattle();
    });
    $('btnContinue').addEventListener('click', endBreak);
    Array.prototype.forEach.call(document.querySelectorAll('[data-break-tac]'), function (b) {
      b.addEventListener('click', function () {
        if (!B || B.phase !== 'break' || B.mode !== 'manual') return;
        B.nextRoundMod = b.getAttribute('data-break-tac');
        syncBreakTacticBtns();
        toast('下回合战术：' + BREAK_TACTICS[B.nextRoundMod].name);
      });
    });
    $('btnDeathToggle').addEventListener('click', function () {
      S.deathFight = !S.deathFight;
      save(); render();
      toast(S.deathFight ? 'TKO死战：开——第3次击倒时自动死战到底（伤害+10%，再倒判负，赛后伤病+10）' : 'TKO死战：关——第3次击倒时直接判负');
    });
    $('btnSettleOk').addEventListener('click', function () {
      $('settleModal').classList.remove('open');
      $('figMe').classList.remove('down'); $('figFoe').classList.remove('down');
      $('figMe').classList.remove('guarding');
      $('ring').classList.remove('slowmo');
      $('figMe').style.transform = ''; $('figFoe').style.transform = '';
      $('touchUI').classList.remove('on');
      $('rotateHint').classList.remove('on');
      resetJoy();
      keysDown = {};
      touchBlock = false;
      B = null;
      $('battleView').style.display = 'none';
      $('dailyView').style.display = 'block';
      // 报名免费（0 AP）：不跳天，当天剩余 AP 保留，可以继续训练/打工/休息
      dailyLog('比赛结束，回到日常。今天还剩 ' + S.ap + ' 点行动点，可以继续安排。', 'dim');
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showNextPendingModal(); // 阶段窗 → 图鉴成就窗 → 剧情事件，依次弹
    });
    $('btnStageOk').addEventListener('click', function () { $('stageModal').classList.remove('open'); showNextPendingModal(); });
    $('btnAchOk').addEventListener('click', function () { $('achModal').classList.remove('open'); showNextPendingModal(); }); // P2-2：图鉴窗关掉后，排队的阶段窗接着弹
    $('btnStorySkip').addEventListener('click', function () { if (proState) finishPrologue(true); }); // Phase 7：序章可整体跳过
    $('btnCareerStatus').addEventListener('click', openStatus);
    $('btnHelp').addEventListener('click', function () { $('helpModal').classList.add('open'); });
    $('btnCloseHelp').addEventListener('click', function () { $('helpModal').classList.remove('open'); showNextPendingModal(); }); // Phase 7：说明关掉后，排队的剧情事件接着弹
    $('btnReset').addEventListener('click', function () { $('resetModal').classList.add('open'); });
    $('btnCancelReset').addEventListener('click', function () { $('resetModal').classList.remove('open'); });
    $('btnConfirmReset').addEventListener('click', function () {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      clearInterval(battleTimer); B = null;
      S = defaultState();
      pendingStageNotice = []; pendingStageReward = 0;
      pendingAchNotice = []; // P2-14：重新开始也要清图鉴待发通知（此前只清了阶段队列）
      storyQueue = []; curStory = null; // Phase 7：新档清剧情队列，并从序章开始
      $('stageModal').classList.remove('open');
      $('storyModal').classList.remove('open');
      lastAttrs = null;
      $('battleView').style.display = 'none';
      $('dailyView').style.display = 'block';
      $('resetModal').classList.remove('open');
      dailyLog('新的生涯开始了。从地区新人赛打起，一步步往上走。', 'dim');
      render();
      toast('已重新开始');
      startPrologue(); // Phase 7：新存档先走序章
    });

    /* ================= 测试档（¥100000 开局，主存档自动备份 / 一键恢复） ================= */
    function hasBackup() {
      try { return !!localStorage.getItem(BACKUP_KEY); } catch (e) { return false; }
    }
    function backupSummary() {
      try {
        var raw = localStorage.getItem(BACKUP_KEY);
        if (!raw) return null;
        var d = JSON.parse(raw);
        if (!d || typeof d.day !== 'number') return null;
        return d;
      } catch (e) { return null; }
    }
    function leaveBattleToDaily() { // 与「重新开始」一致的收尾：停战斗、回日常视图
      clearInterval(battleTimer); B = null;
      $('figMe').classList.remove('down'); $('figFoe').classList.remove('down');
      $('figMe').classList.remove('guarding');
      $('ring').classList.remove('slowmo');
      $('figMe').style.transform = ''; $('figFoe').style.transform = '';
      $('touchUI').classList.remove('on');
      $('rotateHint').classList.remove('on');
      resetJoy();
      keysDown = {};
      touchBlock = false;
      $('battleView').style.display = 'none';
      $('statusView').style.display = 'none';
      $('dailyView').style.display = 'block';
      $('stageModal').classList.remove('open');
      $('settleModal').classList.remove('open');
      $('achModal').classList.remove('open');
      lastAttrs = null;
      pendingStageNotice = []; pendingStageReward = 0; pendingAchNotice = [];
      planSel = []; // P2-14：切换存档（测试档/恢复主存档）时清空残留训练计划
    }
    function confirmStartTest() {
      var hasMain = false;
      try { hasMain = !!localStorage.getItem(SAVE_KEY); } catch (e) {}
      askConfirm({
        title: S.testMode ? '重新开一个测试档？' : '开启测试档？',
        lines: [
          ['开局资金', '¥' + TEST_MONEY + '（正常新档为 ¥100）'],
          ['其余初始状态', '与正常新档一致：Day 1 · 属性全 10 · 排名第 50 名 · 影响力 Lv1'],
          ['主存档', S.testMode ? '当前已在测试档中，备份槽里的主存档保持不变' : (hasMain ? '开启前会自动备份到独立备份槽，之后可点「恢复主存档」原样还原' : '当前没有主存档，无需备份')]
        ],
        note: '测试档专门用来测试商店、定制拳套与打造，顶部和状态页会显示红色「测试档」标识。测试档里的进度不会影响主存档。',
        okText: '开启测试档',
        onOk: startTestSave
      });
    }
    function startTestSave() {
      try {
        if (!S.testMode) { // 已在测试档时重开，绝不拿测试数据覆盖主存档备份
          var raw = localStorage.getItem(SAVE_KEY);
          if (raw) localStorage.setItem(BACKUP_KEY, raw);
        }
      } catch (e) { /* 存储不可用时静默降级 */ }
      leaveBattleToDaily();
      S = defaultState();
      S.money = TEST_MONEY;
      S.testMode = true;
      S.story.prologueDone = true; // Phase 7：测试档跳过序章（专为测商店/打造）
      storyQueue = [];
      dailyLog('测试档开启：开局资金 ¥' + TEST_MONEY + '，其余与正常新档一致。放心买买买，测完点顶部「恢复主存档」即可回到主存档。', 'good');
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('测试档已开启 · 资金 ¥' + TEST_MONEY);
    }
    function confirmRestoreMain() {
      var bk = backupSummary();
      if (!bk) { toast('没有可恢复的主存档备份'); return; }
      askConfirm({
        title: '恢复主存档？',
        lines: [
          ['备份内容', 'Day ' + bk.day + ' · 金钱 ¥' + (bk.money || 0) + ' · 战绩 ' + (bk.wins || 0) + ' 胜 · ' + (bk.losses || 0) + ' 负 · 排名第 ' + (bk.rank || 50) + ' 名'],
          ['当前存档', S.testMode ? '测试档进度将被丢弃（不保存）' : '当前进度将被备份内容覆盖']
        ],
        note: '恢复后备份槽会清空。主存档在开测试档那一刻是什么样，恢复后就是什么样。',
        okText: '确认恢复',
        onOk: restoreMainSave
      });
    }
    function restoreMainSave() {
      var raw = null;
      try { raw = localStorage.getItem(BACKUP_KEY); } catch (e) {}
      if (!raw) { toast('没有可恢复的主存档备份'); render(); return; }
      leaveBattleToDaily();
      try {
        localStorage.setItem(SAVE_KEY, raw);
        localStorage.removeItem(BACKUP_KEY);
      } catch (e) { /* 存储不可用时静默降级 */ }
      if (!load()) { // 备份损坏兜底：回到正常新档而不是坏档
        S = defaultState();
        dailyLog('主存档备份读取失败，已回到一个正常新档。', 'bad');
      } else {
        dailyLog('已恢复主存档：回到 Day ' + S.day + '，金钱 ¥' + S.money + '，一切如初。', 'good');
      }
      renderDailyLog();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('主存档已恢复');
    }
    $('btnTestSave').addEventListener('click', confirmStartTest);
    $('btnRestoreSave').addEventListener('click', confirmRestoreMain);

    /* ================= 初始化 ================= */
    var hadSave = load();
    // Phase 3：老存档若已满足早期阶段条件（例如已有胜场），补领阶段奖励并弹祝贺窗
    var retroStages = hadSave ? checkStageCompletion() : [];
    if (hadSave) checkDexAchievements(); // Phase 5：老存档已有收集进度时补领图鉴里程碑
    renderDailyLog();
    render();
    if (retroStages.length) showStageModalIfPending();
    else showAchModalIfPending();
    if (!hadSave) {
      dailyLog('欢迎来到拳馆。你是无名新人「' + S.name + '」，先从训练和打工开始攒实力吧。（名字可以在「状态」页修改）', 'dim');
      render();
    }
    // Phase 7：新存档（或序章未读完的新档）先走序章；序章结束/跳过后才打开玩法说明。老存档 prologueDone=true（迁移保证），绝不触发
    if (S.story && !S.story.prologueDone) startPrologue();
    else if (!hadSave) $('helpModal').classList.add('open');
