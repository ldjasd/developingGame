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
    /* 修复批次 D：百分比口径的描述与老存档换算。pctDesc 输出「力量生效 +8%」式文案；
       legacyPctOf 把批次 D 之前定制拳套的固定 bonus 按 ×4 换算成 pct（旧 +1≈+4%、+2≈+8%，
       以中盘属性 25 为标定点与旧值等价），保证老档装备价值不缩水。 */
    function pctDesc(pct) {
      var parts = [];
      Object.keys(pct || {}).forEach(function (k) { if (pct[k]) parts.push(attrNameOf(k) + '生效 ' + (pct[k] > 0 ? '+' : '−') + Math.abs(pct[k]) + '%'); });
      return parts.length ? parts.join(' · ') : '无属性加成';
    }
    function legacyPctOf(bonus) {
      var p = {};
      Object.keys(bonus || {}).forEach(function (k) { if (bonus[k]) p[k] = bonus[k] * 4; });
      return p;
    }
    function gloveSig(sel) { return sel.pattern + '|' + sel.outer + '|' + sel.lining + '|' + sel.oz + '|' + sel.fix; }
    function computeGlove(sel) {
      var p = GLOVE_PATTERNS[sel.pattern], o = GLOVE_OUTERS[sel.outer], l = GLOVE_LININGS[sel.lining];
      var oz = GLOVE_OZ[sel.oz] || GLOVE_OZ[12], fx = GLOVE_FIX[sel.fix] || GLOVE_FIX.velcro;
      var pct = {};
      [p.pct, o.pct, l.pct, oz.pct, fx.pct].forEach(function (b) {
        Object.keys(b).forEach(function (k) { pct[k] = (pct[k] || 0) + b[k]; });
      });
      Object.keys(pct).forEach(function (k) { if (!pct[k]) delete pct[k]; });
      var price = clamp(p.base + o.price + l.price + oz.adj + fx.price, 800, 6000);
      var shortName = p.name.replace('系', '') + o.name + sel.oz + 'oz';
      return {
        price: price, pct: pct, shortName: shortName,
        desc: p.name + ' · ' + o.name + '外皮 · ' + l.name + '内衬 · ' + sel.oz + 'oz · ' + fx.name + ' — ' + pctDesc(pct),
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
        price: c.price, desc: c.desc, pct: c.pct,
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
    /* ================= Phase 9：成就判定（纯荣誉，不发奖励） =================
       S.achievements = { [成就id]: { day, week, text } }，text 为解锁时的「第 X 周 · Day Y」。
       silent=true 为追溯模式（读档/恢复存档时）：已达成的直接补解锁，不逐条弹 toast，
       只汇总写一条 dailyLog。普通模式每条新解锁写 dailyLog，并弹一条 toast 汇总提示。 */
    function ensureAchievements() {
      if (!S.achievements || typeof S.achievements !== 'object' || Array.isArray(S.achievements)) S.achievements = {};
      return S.achievements;
    }
    function checkAchievements(silent) {
      ensureAchievements();
      var newly = [];
      ACHIEVEMENTS.forEach(function (a) {
        if (S.achievements[a.id]) return;
        var ok = false;
        try { ok = !!a.check(S); } catch (e) { ok = false; }
        if (ok) {
          S.achievements[a.id] = { day: S.day, week: weekOf(S.day), text: '第 ' + weekOf(S.day) + ' 周 · Day ' + S.day };
          newly.push(a);
        }
      });
      if (!newly.length) return newly;
      if (silent) {
        dailyLog('成就追溯：已有 ' + newly.length + ' 项成就达成，已补登记到状态页「成就」区。', 'good');
      } else {
        newly.forEach(function (a) { dailyLog('🏆 成就解锁：' + a.name + '——' + a.desc + '。', 'good'); });
        toast('🏆 成就解锁：' + newly[0].name + (newly.length > 1 ? ' 等 ' + newly.length + ' 项' : ''));
        if (typeof SFX !== 'undefined' && SFX.achievement) SFX.achievement(); // Phase 9：成就解锁小旋律（静默追溯模式不走此分支、不发声）
      }
      save();
      return newly;
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
      return '<img class="gear-img ' + (cls || '') + '" data-gear-img="' + key + '" data-src="' + src + '" alt="' + g.name + ' 单品图" loading="lazy" />'; // 批次 E：data-src 懒加载，进对应视图才下载（activateLazyImgs 兑现）
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
    /* 每周成长：按成长类型给全池（含候补）加 rating，再按 rating 重排全榜。
       Phase 9 数值总调（2026-11-02，见 PHASE9_BALANCE.md）：各成长类型周增量曾全线 +0.15。
       修复批次 A（2026-11-03，GAME_AUDIT2 F1「排名跑步机」）：全类型再 −0.30/周——旧池增速
       （均值 ≈0.9/周）跑赢旧玩家锚（+0.7/周由名次反推），全胜玩家被锁在 45~50 名约 27 周；
       本批同时把玩家参考 rating 改挂真实战绩（playerRefRating），名次周漂移钳制 ±3 放宽到 ±6。 */
    function growthDelta(growth, week) {
      switch (growth) {
        case 'steady':   return 0.55 + rnd(-0.15, 0.25);
        case 'early':    return week <= 8 ? 0.80 + rnd(0, 0.3) : week <= 20 ? 0.60 : 0.35 + rnd(-0.1, 0.1);
        case 'late':     return week <= 8 ? 0.30 : week <= 20 ? 0.80 : 1.00 + rnd(0, 0.3);
        case 'volatile': return 0.55 + rnd(-1.1, 1.1);
        case 'genius':   return 0.80 + rnd(0, 0.35);
        case 'veteran':  return 0.20 + rnd(-0.15, 0.15);
        default:         return 0.55;
      }
    }
    /* 修复批次 A：玩家参考 rating —— 只由真实战绩与时间决定，不再由旧名次反推：
       ref = 9.3（新秀基准，与 rosterRatingFor 第 50 名截距一致）
           + 0.45 ×（周 − 1）        赛季漂移：不打比赛也会被池子甩开的部分由它托底；五成胜率者总净增速 ≈ 0.625/周，略高于邻位成员平均成长（约 0.55~0.60），故缓慢爬升
           + 0.90 × 胜场 − 0.55 × 负场
           + 0.10 ×（胜场 − 负场）    净胜场形势项（下限 −3，避免一波连败把 rating 砸穿）
           + 0.30 × max(0, 最近击败对手 rating − 当周梯底)，封顶 +3.5   含金量：赢强者涨得快（settleNow 维护 S.lastBeaten，覆盖式）
       含金量项两个口径都踩过坑：① 用「历史最强」是只涨不跌的棘轮；② 参照固定梯底 9.3 会把全池的
       rating 通胀（第 29 周连中游成员都摸到上限 30）算成玩家含金量——五成胜率探针两种都雪崩登顶。
       正解：覆盖式「最近击败」× 参照当周梯底（9.3 + 0.55×(周−1)，即池子本周的第 50 名期望 rating），
       只有真正赢下高于本梯队水位的人才涨含金量，且随玩家回落自然消退。
       上限 = 池成员上限 + 1（保证登顶可达；池上限第 20 周后随周 +0.3，见 rosterRatingCap）；下限 6 与池一致。
       目标曲线（audit2_rank 微测 + audit2_career 实跑验证）：全胜约 2~3 名/周净进、13~16 周登顶；
       五成胜率缓慢爬升不倒退、不登顶。 */
    var REF_BASE = 9.3, REF_DRIFT = 0.45, REF_WIN = 0.90, REF_LOSS = 0.55, REF_FORM = 0.10, REF_BEAT = 0.30;
    function playerRefRating(week) {
      var wins = S.wins || 0, losses = S.losses || 0;
      var wk0 = Math.max(0, (week || 1) - 1);
      var beatBase = REF_BASE + 0.55 * wk0; // 当周梯底：池子本周第 50 名的期望 rating
      var beat = (typeof S.lastBeaten === 'number' && S.lastBeaten > beatBase) ? (S.lastBeaten - beatBase) : 0;
      var ref = REF_BASE + REF_DRIFT * wk0
        + REF_WIN * wins - REF_LOSS * losses
        + Math.max(-3, REF_FORM * (wins - losses))
        + Math.min(3.5, REF_BEAT * beat);
      return clamp(Math.round(ref * 100) / 100, 6, rosterRatingCap(week) + 1);
    }
    /* 池子 rating 上限：第 20 周前为 30（初始梯最高 24，前 20 周无人摸得到）；之后每周 +0.3 抬升。
       不抬升的后果（五成探针实测）：约第 35 周起大量成员堆死在 30.0，梯队间距消失，玩家 ref
       一越过 29.5 就一次性跳过整堆人「悬崖登顶」——生涯不设上限，上限本身也必须随生涯走。 */
    function rosterRatingCap(week) { return 30 + 0.3 * Math.max(0, (week || 1) - 20); }
    function weeklyRosterGrowth(newWeek) {
      ensureRoster();
      var oldRank = S.rank;
      var capW = rosterRatingCap(newWeek);
      S.roster.forEach(function (m) { m.rating = clamp(Math.round((m.rating + growthDelta(m.growth, newWeek)) * 100) / 100, 6, capW); });
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
      // 重排：玩家参考 rating 改挂真实战绩（playerRefRating）；池内成员按 rating 降序填其余名次。
      // 修复批次 A：周漂移钳制 ±3 → ±6——旧钳制会把比赛赢来的名次在重排时系统性收回，是跑步机的一半成因。
      var ref = playerRefRating(newWeek);
      var above = 0;
      S.roster.forEach(function (m) { if (m.rating > ref) above++; });
      var newRank = clamp(clamp(1 + above, Math.max(1, oldRank - 6), Math.min(50, oldRank + 6)), 1, 50);
      var ranked = S.roster.filter(function (m) { return m.rank > 0; }).sort(function (a, b) { return b.rating - a.rating; });
      var ri = 1;
      ranked.forEach(function (m) { if (ri === newRank) ri++; m.rank = ri; ri++; });
      S.rank = newRank;
      if (newRank !== oldRank) dailyLog('本周排名重排：第 ' + oldRank + ' 名 → 第 ' + newRank + ' 名（池内选手一周成长后重排）。', newRank < oldRank ? 'good' : 'bad');
    }
    /* Phase 4：反击方向 → 加成拳种（后闪→直拳 / 下闪→上勾 / 侧闪→摆拳） */
    var COUNTER_PREF = { back: 'straight', down: 'upper', side: 'hook' };
    var COUNTER_PREF_TXT = { back: '后闪→直拳', down: '下闪→上勾拳', side: '侧闪→摆拳' };
    function comboBonusPct(combo) { if (combo <= 1) return 0; if (combo === 2) return 5; if (combo === 3) return 15; return 25; } // 2连+5%、3连+15%、4连及以上+25%封顶
    /* Phase 4 修订：KO 重创槽 —— 有效命中积累（格挡只积一半），满 100 直接 KO。
       【KO 体系定型（2026-11-03，KO_AUDIT.md）：用户亲口推翻旧「单发百分比」规则——
       单次 KO（≥当前 HP 30%）与 25%~30% 击倒带已删除（专项实测：单发 KO 占中后期终局 94%+、
       HP 打空路径实际 0%，败者普遍剩几十点 HP 被百分比规则半途带走，即玩家感知的「突然就 KO」）。
       现行终结只有四条：重创满 100 KO / HP 归零 KO / 单回合 3 次击倒 TKO / 点数判定；
       击倒改由重创刻度触发（跨 25/50/75，见 battle.js dealDamage 的刻度击倒接线）。】
       积累曲线（2026-11-03 重构，tests/trauma-ab.mjs 同种子 A/B 定型，记录见 tests/TRAUMA_CURVE.md）：
       旧曲线是拳种固定值（刺6/直12/上勾18/摆18/击腹12），与伤害脱钩——核查实测（第 1 周 n=596）
       43% 的命中是「≤3 点伤害却 +≥10 重创」，且重创 KO 100% 挤在第 1 回合（衰减使中后盘攒不满）。
       现曲线：单次积累 = TRAUMA_K ×（本次净伤害 ÷ 分母）× 拳种权重，小数内部累积（显示取整）；
       分母 = max(当前 HP, TRAUMA_HP_FLOOR × 最大 HP)（KO 定型·分母下限：HP 高于 40% 时与旧曲线
       逐点一致，低于 40% 后积累不再加速，堵住「越残攒得越快」的第二条塌陷通道）。
       定版前后全样本核查对照（trauma-audit，旧曲线 n=596 → 新曲线 n=600）：重创 KO 占全部终局 6.7%→9.6%、
       回合分布 R1/R2/R3 由 40/0/0 变为 21/19/17、输家 HP% 反占优 20%→7%、胜率 65.3%→66.3%（带内）。
       备选「按最大 HP 全程折算」已淘汰（第 1 周伤害占比仅 0.5~2.5%，K 拉满也攒不满，见 TRAUMA_CURVE.md）。 */
    var PUNCH_KO = { jab: 6, straight: 12, upper: 18, hook: 18, body: 12 }; // 新曲线中只作拳种权重（以直拳 12 归一为 1.0）
    var KO_DECAY = 6; // 重创槽每秒衰减（A/B 验过 4/秒会让重创 KO 占比暴涨到 26.7%，保持 6）
    var TRAUMA_K = 70; // 重创曲线标定系数：伤害占当前 HP 比例 × 70 × 拳种权重
    var TRAUMA_HP_FLOOR = 0.40; // KO 定型（KO_AUDIT.md）：重创分母下限（占防守方最大 HP 的比例）——分母取 max(当前 HP, 40%×最大 HP)，残血后积累不再加速
    function traumaGain(key, dmg, def, hpBefore, halved) {
      var w = (PUNCH_KO[key] || 10) / 12;
      var denom = Math.max(1, hpBefore, def && def.hpMax ? def.hpMax * TRAUMA_HP_FLOOR : 0);
      var gain = TRAUMA_K * (dmg / denom) * w;
      if (halved) gain /= 2; // 被格挡（未穿透）只积一半，口径不变
      if (def && def.traumaTakenMul) gain *= def.traumaTakenMul; // 修复批次 A：陪练等特殊对手的重创积累减免（如练习赛 0.45）
      return Math.max(0, gain);
    }
    /* 修复批次 A（GAME_AUDIT2 F2「属性通胀」）：训练收益边际递减 + 属性软上限。
       旧版训练线性无上限：生涯模拟 6 周属性和 632、20 周力量 652，对手 rating 封顶约 30，
       第 2 周起比赛退化为 R1 一拳 KO。本批：每次训练的属性增量按「该属性当前值」分段打折——
       <30 全额 / 30~59 半额 / 60~79 四分之一 / 80+ 八分之一，且基础属性硬顶 100（软上限带：
       60 后收益已降到 1/4 以下，实际可达区间约 80~100）。第 1 周属性都在 30 以下，早期数值一字未动。
       结算演出/预览试算都走 applyTrainingApply，保证「预览 = 实结」；心态效率修正仍在 doPlanTrain 后段按总增量另行应用。 */
    var ATTR_HARD_CAP = 100;
    function trainGainFactor(v) { return v < 30 ? 1 : v < 60 ? 0.5 : v < 80 ? 0.25 : 0.125; }
    function applyTrainingApply(s, t) {
      var before = {};
      ATTRS.forEach(function (a) { before[a.key] = s.attrs[a.key]; });
      var msg = t.apply(s);
      ATTRS.forEach(function (a) {
        var k = a.key, d = s.attrs[k] - before[k];
        if (d > 0) s.attrs[k] = Math.min(ATTR_HARD_CAP, Math.round((before[k] + d * trainGainFactor(before[k])) * 10) / 10);
        else if (d < 0) s.attrs[k] = Math.max(0, s.attrs[k]); // 现有训练 apply 只增不减，此为兜底
      });
      return msg;
    }
    /* 修复批次 A（m5）：体力透支伤病陡峭化——旧口径每透支 10 点 +5 伤病，重训练硬练几乎无代价，
       轻训练（养打结合）没有生态位。新口径：透支部分按 0.8/点折算伤病（透支 10 ≈ +8、25 ≈ +20）。 */
    function overdraftInjury(over) { return over > 0 ? Math.round(over * 0.8) : 0; }
    var BREAK_TACTICS = { attack: { name: '强攻' }, balanced: { name: '均衡' }, guard: { name: '稳守' } };
    function freshRoundStats() { return { meHits: 0, foeHits: 0, meDmg: 0, foeDmg: 0, meMaxCombo: 0, foeMaxCombo: 0 }; }
    function decayTrauma(dt) { if (!B) return; B.meTrauma = Math.max(0, (B.meTrauma || 0) - KO_DECAY * dt); B.foeTrauma = Math.max(0, (B.foeTrauma || 0) - KO_DECAY * dt); }
    var SAVE_KEY = 'boxing-phase1-save-v1';
    var BACKUP_KEY = 'boxing-phase1-save-backup-v1'; // 测试档：主存档独立备份槽
    /* Phase 9：多存档槽（3 槽，槽位交换实现，详见下方「多存档槽」区段与 PHASE9_SAVESLOTS.md）
       SAVE_KEY 始终是「当前槽」的本体存储，save()/load() 路径不变；非当前槽的进度暂存在
       SLOT_KEY_PREFIX + 槽号 下（含槽 1：槽 1 离槽时才需要暂存位）；SLOT_META_KEY 只记当前槽号，
       缺失时默认槽 1——老存档零迁移、自动成为槽 1。 */
    var SLOT_COUNT = 3;
    var SLOT_META_KEY = 'boxing-phase1-save-v1-meta';
    var SLOT_KEY_PREFIX = 'boxing-phase1-save-v1-slot';
    var TEST_MONEY = 100000; // 测试档开局资金
    var ROUND_SECONDS = 45, ROUNDS = 3, TICK_MS = 500;

    /* ================= 状态 ================= */
    function defaultState() {
      return {
        day: 1, ap: 6, money: 100, stamina: 100, injury: 0, fame: 0, rank: 50,
        roster: buildRoster(50, 1), // 角色池：新档按名册顺序建池（玩家第 50 名，胡小桃候补）
        influence: 1, stage: 1, completedStages: [], winStreak: 0, champWinBase: null, titles: [], sponsor: null,
        wins: 0, losses: 0, koWins: 0, lastBeaten: 0, achievements: {}, facedFoes: [], lastMatchDay: 0, deathFight: false, testMode: false,
        name: '小拳', mind: 60, scoutedForDay: 0,
        gear: { gloves: null, guard: null, boots: null, head: null, robe: null, wrist: null },
        owned: [], enh: {},
        materials: { synthetic: 0, calf: 0, goat: 0, kangaroo: 0, latex: 0, gel: 0, horsehair: 0 },
        customGear: [], customSeq: 0, dexSigs: [], dexAch: [],
        bag: { drink: 0, bandage: 0, meal: 0 },
        buffs: { drink: false, bandage: false, meal: false, camp: 0, promo: false }, // camp/promo＝修复批次 D 服务充能（特训营剩余次数 / 宣传造势待生效）
        physioW: 0, physioN: 0, campW: 0, promoW: 0, // 修复批次 D：服务周限次记账（W=上次使用周数）
        sinkStats: { physio: { n: 0, spent: 0 }, camp: { n: 0, spent: 0 }, promo: { n: 0, spent: 0 } }, // 修复批次 D：消费口累计（验收/生涯模拟口径）
        appearance: { hair: 'ponytail', face: 'default', body: 'standard', outfit: 'default', lastDim: 'hair' },
        story: { prologueDone: false, seenEvents: [], affinity: { senior: 0, manager: 0, rival: 0, teammate: 0 }, dailyCd: {} }, // dailyCd＝修复批次 C 可重复日常冷却记录（老档由 storyState 兜底补）
        sparFights: 0, sparRival: 0, sparWeek: 0, sparCount: 0, sparByKey: {}, beatChamp: false, // 修复批次 C：约战计数与「正式赛击败伊芙琳」落盘（老档靠 load 默认合并兜底）
        tutorial: { practiceDone: false, tips: [], goalDone: false, trainings: 0 }, // 新手期重构：练习赛/情境提示/首周目标（老存档读档时一律毕业，见 load 兼容段）
        attrs: { power: 10, endurance: 10, will: 10, speed: 10, accuracy: 10, footwork: 10, defense: 10, technique: 10 },
        punchExp: { jab: 0, straight: 0, hook: 0, upper: 0, body: 0 },
        logs: []
      };
    }
    var S = defaultState();
    /* ================= 新手期重构：练习赛 / 情境提示 / 首周目标 =================
       S.tutorial = { practiceDone, tips:[已看过的情境提示 key], goalDone, trainings（首周已结算训练次数） }。
       老存档（无 tutorial 字段）读档时一律置为「已毕业」（见 load 兼容段），绝不触发任何新手流程；
       tutorialState() 的兜底同样按毕业处理——只有 defaultState() 的新档才带未完成的新手状态。 */
    function tutorialState() {
      if (!S.tutorial || typeof S.tutorial !== 'object') S.tutorial = { practiceDone: true, tips: ['train', 'shop', 'match', 'status'], goalDone: true, trainings: 0 };
      if (!Array.isArray(S.tutorial.tips)) S.tutorial.tips = [];
      return S.tutorial;
    }
    /* 练习赛待打判定：序章已走完、练习赛未打、且还没打过任何正式比赛（打过正式赛练习赛自动作废）。测试档不触发。 */
    function practicePending() {
      if (S.testMode) return false;
      if (!S.story || !S.story.prologueDone) return false;
      return !tutorialState().practiceDone && (S.wins + S.losses) === 0;
    }
    /* 情境提示：第一次进入某场景时弹一句话（看过记档、设置里可重置）。只在已进游戏、序章走完后出现。 */
    var TIP_TEXTS = {
      train: '训练：点卡片凑点数（同一项可重复选），凑满 5 点收益最大；选好后点底部「开始训练」，一次结算。',
      shop: '商店：点商品卡购买，卡上的绿 / 红字是和你现装备的差值；进店这一趟扣 2 AP，慢慢挑。',
      match: '比赛：每周第 7 天是比赛日，报名免费（0 AP）。比赛前一天在训练里做「录像研究」，能侦察对手的弱点拳种。',
      status: '状态页：属性、装备、背包、赞助都在这里，不耗行动点——想看随时来看。'
    };
    var tipTimer = null;
    function showTip(text) {
      var bar = $('tipBar'); if (!bar) return;
      $('tipText').textContent = text;
      bar.hidden = false;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () { bar.hidden = true; }, 9000);
    }
    function hideTip() { var bar = $('tipBar'); if (bar) bar.hidden = true; clearTimeout(tipTimer); }
    function maybeTip(key) {
      if (!TIP_TEXTS[key]) return;
      if (!gameEntered) return;
      if (S.testMode) return;
      if (!S.story || !S.story.prologueDone) return;
      if (B) return; // 战斗中不弹
      var t = tutorialState();
      if (t.tips.indexOf(key) >= 0) return;
      t.tips.push(key);
      showTip(TIP_TEXTS[key]);
      save();
    }
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
      // 批次 E：立绘改懒加载——只写 data-src，状态屏可见时才兑现（启动渲染不再白拉 302KB 立绘）
      img.setAttribute('data-src', portraitSrc());
      if (currentSceneView === 'status') { img.src = portraitSrc(); img.removeAttribute('data-src'); }
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
       修复批次 D（GAME_AUDIT2 M3）口径：每级使该装备每项正向 pct +1 个百分点（负向保持不变，
       保留装备取舍，沿 P2-6）、减伤 +1%，机制倍率按 MECH_DEFS 小幅变强；成功率 100%。
       费用：¥300×(当前等级+1)；材料走 ENH_MAT_CURVE 逐级 [1,1,1,1,2,2,2,2,3,3]、+10 合计 18 个，
       从该装备拆解对应的「皮料＋内衬」两类合计扣除——旧口径单类 (等级+1) 合计 55 个在游戏自身
       材料池里（单类期望总量仅约 8~16）根本凑不齐，双类合计后各装备材料池期望约 18~28，可达。 */
    var ENH_MAX = 10;
    var ENH_MAT_CURVE = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3]; // 下标 = 当前等级，值为升下一级所需材料数；合计 18
    function enhOf(id) { var v = (S.enh && S.enh[id]) || 0; return (typeof v === 'number' && v > 0) ? Math.min(ENH_MAX, Math.floor(v)) : 0; }
    function gearPctOf(g) { // 装备的基础 pct（定制拳套老存档只有 bonus 时按 ×4 换算兜底，与读档迁移同口径）
      if (g.pct) return g.pct;
      if (g.bonus) return legacyPctOf(g.bonus);
      return {};
    }
    function effPctAt(g, lvl) { // 指定强化等级下的有效 pct（强化只加正向，负向保持不变）
      var base = gearPctOf(g), b = {};
      Object.keys(base).forEach(function (k) { b[k] = base[k] > 0 ? base[k] + lvl : base[k]; });
      return b;
    }
    function effPctOf(g) { return effPctAt(g, enhOf(g.id)); }
    function effDrOf(g) { return g.dr ? g.dr + enhOf(g.id) : 0; } // 有效减伤%
    function gearDrPct() { // 全部已装备减伤合计（护齿 + 冠军护头等叠加）
      var t = 0;
      Object.keys(S.gear).forEach(function (slot) {
        var g = S.gear[slot] ? gearById(S.gear[slot]) : null;
        if (g) t += effDrOf(g);
      });
      return t;
    }
    /* 机制效果（批次 D）：mech 字段 trauma/stam/cd 均为倍率（<1 正面）；强化每级按 per 变强、下限 floor。
       合计口径：已装备各件连乘后钳制在 [floor, 1]。 */
    var MECH_DEFS = {
      trauma: { floor: 0.5, per: 0.004, label: '所受重创积累' },
      stam: { floor: 0.7, per: 0.003, label: '出拳体力消耗' },
      cd: { floor: 0.6, per: 0.004, label: '指令冷却' }
    };
    function effMechAt(g, field, lvl) {
      if (!g.mech || !g.mech[field]) return 1;
      var d = MECH_DEFS[field];
      return Math.max(d.floor, g.mech[field] - d.per * lvl);
    }
    function gearMechMul(field) {
      var m = 1;
      Object.keys(S.gear).forEach(function (slot) {
        var g = S.gear[slot] ? gearById(S.gear[slot]) : null;
        if (g) m *= effMechAt(g, field, enhOf(g.id));
      });
      return Math.max(MECH_DEFS[field].floor, Math.min(1, m));
    }
    function gearTraumaMul() { return gearMechMul('trauma'); } // 我方所受重创积累倍率（护齿/护头）
    function gearStamMul() { return gearMechMul('stam'); }     // 我方出拳体力消耗倍率（战靴）
    function gearCdMul() { return gearMechMul('cd'); }         // 我方指令冷却倍率（护腕）
    function mechDescAt(g, lvl) {
      var parts = [];
      Object.keys(MECH_DEFS).forEach(function (f) {
        if (g.mech && g.mech[f]) parts.push(MECH_DEFS[f].label + ' −' + Math.round((1 - effMechAt(g, f, lvl)) * 100) + '%');
      });
      return parts;
    }
    function bonusDescAt(g, lvl) { // 指定强化等级下的完整效果说明（pct + 减伤 + 机制；负向不随强化翻转）
      var parts = [], bd = pctDesc(effPctAt(g, lvl));
      if (bd !== '无属性加成') parts.push(bd);
      if (g.dr) parts.push('减伤 ' + (g.dr + lvl) + '%');
      parts = parts.concat(mechDescAt(g, lvl));
      return parts.length ? parts.join(' · ') : '无加成';
    }
    function gearDispName(g) { var lvl = enhOf(g.id); return g.name + (lvl > 0 ? ' +' + lvl : ''); }
    function gearEffDesc(g) { return enhOf(g.id) > 0 ? bonusDescAt(g, enhOf(g.id)) : g.desc; }
    function enhYieldFor(g) { // 强化/拆解对应的材料对：[皮料, 内衬]
      if (g.custom) return [g.custom.outer, g.custom.lining];
      return DISMANTLE_MAP[g.id] || ['synthetic', 'latex'];
    }
    function enhCost(g) {
      var lvl = enhOf(g.id), y = enhYieldFor(g);
      return { lvl: lvl, money: 300 * (lvl + 1), matIds: y, matCount: lvl >= ENH_MAX ? 0 : ENH_MAT_CURVE[lvl] };
    }
    function enhMatStock(g) { // 该装备材料对（皮料＋内衬）的合计库存
      var y = enhYieldFor(g);
      return ((S.materials && S.materials[y[0]]) || 0) + ((S.materials && S.materials[y[1]]) || 0);
    }
    function enhShortage(g) { // 返回 {money:boolean, mat:boolean}，材料/金钱是否不足
      var c = enhCost(g);
      return { money: S.money < c.money, mat: enhMatStock(g) < c.matCount, cost: c };
    }
    function enhMatText(g) { // 材料对库存文案：「小牛皮 ×a ＋ 乳胶 ×b（合计 N）」
      var c = enhCost(g), y = c.matIds;
      var a = (S.materials && S.materials[y[0]]) || 0, b = (S.materials && S.materials[y[1]]) || 0;
      return materialName(y[0]) + ' ×' + a + ' ＋ ' + materialName(y[1]) + ' ×' + b + '（合计 ' + (a + b) + '）';
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
          ['材料', '对应材料 ×' + c.matCount + '（' + enhMatText(g) + '，从皮料＋内衬合计扣除）'],
          ['当前效果', bonusDescAt(g, c.lvl)],
          ['强化后效果', bonusDescAt(g, c.lvl + 1)],
          ['成功率', '100%（不会失败）']
        ],
        note: lack ? '条件不足：' + (sh.money ? '金钱不够（需 ¥' + c.money + '）。' : '') + (sh.mat ? '材料不足：对应皮料＋内衬合计需 ' + c.matCount + ' 个（去背包拆解装备获得）。' : '') : '强化对已装备 / 未装备的都立即生效：每项正向百分比 +1 个百分点（负向保持不变），减伤类再 +1%，机制效果同步小幅增强。材料从该装备对应的皮料与内衬两类合计扣除。最高 +10。',
        okText: '确认强化',
        okDisabled: lack,
        onOk: function () {
          var sh2 = enhShortage(g);
          if (sh2.money || sh2.mat || enhOf(id) >= ENH_MAX) { toast('条件已变化，无法强化'); return; }
          var c2 = sh2.cost;
          if (!S.materials) S.materials = defaultState().materials;
          if (!S.enh) S.enh = {};
          S.money -= c2.money;
          var takeA = Math.min((S.materials[c2.matIds[0]] || 0), c2.matCount); // 先扣皮料，不足部分由内衬补
          S.materials[c2.matIds[0]] = (S.materials[c2.matIds[0]] || 0) - takeA;
          S.materials[c2.matIds[1]] = (S.materials[c2.matIds[1]] || 0) - (c2.matCount - takeA);
          S.enh[id] = c2.lvl + 1;
          lastAttrs = effAttrs();
          dailyLog('强化装备：' + g.name + ' 强化到 +' + S.enh[id] + '（花费 ¥' + c2.money + '、对应材料 ×' + c2.matCount + '），效果变为：' + bonusDescAt(g, S.enh[id]) + '。', 'good');
          render();
          toast('强化成功：' + gearDispName(g));
          checkAchievements(); // Phase 9：强化到 +5 / +10 成就判定
        }
      });
    }
    function gearPctTotals() { // 全部已装备 pct 合计（同属性跨件相加，含强化）
      var t = {};
      Object.keys(S.gear).forEach(function (slot) {
        var g = S.gear[slot] ? gearById(S.gear[slot]) : null;
        if (g) { var ep = effPctOf(g); Object.keys(ep).forEach(function (k) { t[k] = (t[k] || 0) + ep[k]; }); }
      });
      return t;
    }
    function effAttrs() { // 修复批次 D：生效值 = 本体属性 ×(1+pct 合计/100)（属性面板与战斗共用）。
      // 与属性硬顶的关系：硬顶 100 只约束「训练本体」（applyTrainingApply 在写入 S.attrs 时钳制），
      // 装备百分比作用在生效值层面、可使实战生效值超过 100——这是设计内口径（装备是乘数不是本体），
      // 批次 A 的对手浮动生成按玩家本体＋战绩标定，不读 effAttrs，故不会被装备反向抬高对手强度。
      var t = gearPctTotals(), out = {};
      ATTRS.forEach(function (a) {
        var p = Math.max(-90, t[a.key] || 0);
        out[a.key] = Math.round(S.attrs[a.key] * (1 + p / 100) * 10) / 10;
      });
      return out;
    }
    function gearBonus() { // 展示用：装备带来的生效值点数差（取整），供状态/据点的「+N 装备」标注
      var ea = effAttrs(), b = {};
      ATTRS.forEach(function (a) {
        var d = Math.round(ea[a.key] - S.attrs[a.key]);
        if (d) b[a.key] = d;
      });
      return b;
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
    /* ================= 修复批次 D（GAME_AUDIT2 M4）：持续消费口 =================
       旧经济只有一次性装备买断（全店 ¥40,900），第 3 周后收入（奖金+赞助约 +¥2,500/周起、随周数
       与排名继续涨）无处可去，20 周零消费余额 ¥46k+。本批加三个与现有系统咬合的复购型消费口：
       ① 康复理疗（伤病管理）：医院的免 AP 高配档——¥1600 / 伤病 −40 / 每周 2 次；医院治疗
          （2 AP + ¥500 → −30）仍在，AP 与金钱从此是一对可互换的资源。
       ② 特训营（商店服务）：价格随周涨（900+周×240，定价经 20 周模拟复核收紧，见批次 D 记录），买入 4 次充能，每次训练结算收益 +50%；
          每周限购 1 次。与训练边际递减叠乘的是「已递减后的实际增量」，不绕过递减与硬顶。
       ③ 宣传造势（商店服务）：价格随周涨（500+周×180），心态 +15 ＋下一场正式赛奖金 ×1.4
          （settleNow 获胜时消费）；每周限购 1 次。定价按各周奖金期望标定为净消耗（见批次 D 记录）。 */
    function sinkSpend(kind, amount) {
      if (!S.sinkStats || typeof S.sinkStats !== 'object') S.sinkStats = defaultState().sinkStats;
      if (!S.sinkStats[kind]) S.sinkStats[kind] = { n: 0, spent: 0 };
      S.sinkStats[kind].n += 1; S.sinkStats[kind].spent += amount;
    }
    var PHYSIO_PRICE = 1600, PHYSIO_HEAL = 40, PHYSIO_WEEKLY_MAX = 2;
    function physioLeftThisWeek() { return S.physioW === weekOf(S.day) ? Math.max(0, PHYSIO_WEEKLY_MAX - (S.physioN || 0)) : PHYSIO_WEEKLY_MAX; }
    function confirmClinic() { // 医院治疗（既有口径不变：2 AP + ¥500 → 伤病 −30），从外出菜单抽出与理疗并列
      if (S.injury <= 0) { toast('身上没伤，不用去医院'); return; }
      if (S.ap < 2) { toast('行动点不足（医院治疗需要 2 AP；不耗 AP 的康复理疗也可以看看）'); return; }
      if (S.money < 500) { toast('钱不够治疗（需要 ¥500）'); return; }
      askConfirm({
        scene: 'hospital',
        title: '外出 · 医院治疗',
        lines: [
          ['行动点', '−2 AP（' + S.ap + ' → ' + (S.ap - 2) + '）'],
          ['金钱', '¥' + S.money + ' → ¥' + (S.money - 500) + '（−500）'],
          ['伤病', fmtDelta(S.injury, Math.max(0, S.injury - 30))]
        ],
        note: '专业运动医学处理，伤病 −30。伤病 ≥30 时比赛全属性 −5%、≥60 时 −15%，别带伤硬撑。赶时间的话，隔壁康复理疗不耗 AP、好得更多，就是贵些。',
        okText: '确认治疗',
        onOk: function () {
          if (S.ap < 2 || S.money < 500 || S.injury <= 0) { toast('条件已变化，无法治疗'); return; }
          S.ap -= 2; S.money -= 500;
          S.injury = Math.max(0, S.injury - 30);
          dailyLog('Day ' + S.day + ' · 医院治疗：伤病 −30，花费 ¥500。', 'good');
          var hl = $('hospitalList'); if (hl) hl.classList.remove('open');
          var ol = $('outList'); if (ol) ol.classList.remove('open');
          render();
          toast('治疗完成，伤病减轻');
        }
      });
    }
    function confirmPhysio() { // 康复理疗（批次 D 新增）：不耗 AP，¥1600 → 伤病 −40，每周 2 次
      if (S.injury <= 0) { toast('身上没伤，不用理疗'); return; }
      if (physioLeftThisWeek() <= 0) { toast('本周理疗次数已用完（每周 ' + PHYSIO_WEEKLY_MAX + ' 次）'); return; }
      if (S.money < PHYSIO_PRICE) { toast('钱不够理疗（需要 ¥' + PHYSIO_PRICE + '）'); return; }
      askConfirm({
        scene: 'hospital',
        title: '外出 · 康复理疗',
        lines: [
          ['行动点', '不消耗（理疗中心随到随做）'],
          ['金钱', '¥' + S.money + ' → ¥' + (S.money - PHYSIO_PRICE) + '（−' + PHYSIO_PRICE + '）'],
          ['伤病', fmtDelta(S.injury, Math.max(0, S.injury - PHYSIO_HEAL))],
          ['本周剩余', physioLeftThisWeek() + ' 次 → ' + (physioLeftThisWeek() - 1) + ' 次']
        ],
        note: '运动康复中心的理疗套餐：手法松解＋冷敷理疗，伤病 −' + PHYSIO_HEAL + '。比医院治疗贵，但不占行动点、好得更多——AP 紧的时候用钱换时间。',
        okText: '确认理疗',
        onOk: function () {
          if (S.money < PHYSIO_PRICE || S.injury <= 0 || physioLeftThisWeek() <= 0) { toast('条件已变化，无法理疗'); return; }
          S.money -= PHYSIO_PRICE;
          S.injury = Math.max(0, S.injury - PHYSIO_HEAL);
          var wk = weekOf(S.day);
          if (S.physioW !== wk) { S.physioW = wk; S.physioN = 0; }
          S.physioN += 1;
          sinkSpend('physio', PHYSIO_PRICE);
          dailyLog('Day ' + S.day + ' · 康复理疗：伤病 −' + PHYSIO_HEAL + '，花费 ¥' + PHYSIO_PRICE + '。', 'good');
          var hl = $('hospitalList'); if (hl) hl.classList.remove('open');
          var ol = $('outList'); if (ol) ol.classList.remove('open');
          render();
          toast('理疗完成，身体松快多了');
        }
      });
    }
    var CAMP_CHARGES = 4; // 特训营一次买入的充能次数（每次训练计划结算消耗 1 次，收益 +50%）
    function campPrice() { return 900 + weekOf(S.day) * 240; }
    function campLeftThisWeek() { return S.campW === weekOf(S.day) ? 0 : 1; }
    var PROMO_PRIZE_MUL = 1.4; // 宣传造势：下一场正式赛奖金倍率
    function promoPrice() { return 500 + weekOf(S.day) * 180; }
    function promoLeftThisWeek() { return S.promoW === weekOf(S.day) ? 0 : 1; }
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
      setScene('title_stage'); // A1：阶段达成（冲冠/夺冠节点）切冠军舞台
      save();
      return true;
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
        S.customGear = S.customGear.filter(function (g) { return g && typeof g.id === 'string' && ((g.pct && typeof g.pct === 'object') || (g.bonus && typeof g.bonus === 'object')); });
        // 修复批次 D 迁移：批次 D 之前做出的定制/打造拳套只有固定 bonus —— 按 ×4 换算补 pct（此后 effPct 走 pct；bonus 字段保留备查，desc 文案仍为当时的固定值表述，不追改）
        S.customGear.forEach(function (g) { if (!g.pct && g.bonus) g.pct = legacyPctOf(g.bonus); });
        // 修复批次 D 兼容：服务周限次与消费记账字段补齐（老档无记录＝本周未用过、累计为 0）
        ['physioW', 'physioN', 'campW', 'promoW'].forEach(function (k) {
          if (typeof S[k] !== 'number' || isNaN(S[k]) || S[k] < 0) S[k] = 0; else S[k] = Math.floor(S[k]);
        });
        var defSink = defaultState().sinkStats;
        if (!S.sinkStats || typeof S.sinkStats !== 'object') S.sinkStats = defSink;
        Object.keys(defSink).forEach(function (k) {
          var v = S.sinkStats[k];
          if (!v || typeof v !== 'object') S.sinkStats[k] = { n: 0, spent: 0 };
          else {
            if (typeof v.n !== 'number' || isNaN(v.n) || v.n < 0) v.n = 0;
            if (typeof v.spent !== 'number' || isNaN(v.spent) || v.spent < 0) v.spent = 0;
          }
        });
        if (typeof S.buffs.camp !== 'number' || isNaN(S.buffs.camp) || S.buffs.camp < 0) S.buffs.camp = 0;
        S.buffs.promo = !!S.buffs.promo;
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
        // 修复批次 A 兼容：lastBeaten（最近击败对手的 rating）缺失/为 0 时按当前名次窗口上沿的初始 rating 近似补齐
        // （注意：defaultState 合并会先给出 lastBeaten: 0，必须把「有胜场却为 0」也当缺失处理）
        if (!(typeof S.lastBeaten === 'number' && S.lastBeaten > 0)) S.lastBeaten = (typeof S.bestBeaten === 'number' && S.bestBeaten > 0) ? S.bestBeaten : ((S.wins > 0) ? rosterRatingFor(clamp(S.rank + 3, 1, 50), weekOf(S.day)) : 0);
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
        // 新手期重构·老存档兼容：无 tutorial 字段的旧档一律视为已「毕业」——不弹练习赛邀请、不出情境提示、不显示首周目标，老存档完全不受影响
        if (!data.tutorial || typeof data.tutorial !== 'object') {
          S.tutorial = { practiceDone: true, tips: ['train', 'shop', 'match', 'status'], goalDone: true, trainings: 0 };
        } else {
          S.tutorial = {
            practiceDone: data.tutorial.practiceDone === true,
            tips: Array.isArray(data.tutorial.tips) ? data.tutorial.tips.filter(function (x) { return typeof x === 'string'; }) : [],
            goalDone: data.tutorial.goalDone === true,
            trainings: (typeof data.tutorial.trainings === 'number' && data.tutorial.trainings > 0) ? Math.floor(data.tutorial.trainings) : 0
          };
        }
        // Phase 9 老存档兼容：成就表缺失/非法时补 {}（只保留已知成就 id 的对象条目）；累计 KO 胜场计数器缺失时从 0 起算（历史 KO 数无从追溯）
        if (!S.achievements || typeof S.achievements !== 'object' || Array.isArray(S.achievements)) S.achievements = {};
        Object.keys(S.achievements).forEach(function (k) {
          var known = ACHIEVEMENTS.some(function (a) { return a.id === k; });
          var v = S.achievements[k];
          if (!known || !v || typeof v !== 'object') delete S.achievements[k];
        });
        if (typeof S.koWins !== 'number' || isNaN(S.koWins) || S.koWins < 0) S.koWins = 0;
        S.koWins = Math.floor(S.koWins);
        // D3 老存档兼容：对手名鉴「已交手」记录缺失/非法时补 []（仅展示用，历史交手无从追溯，从读档后开始记录）
        if (!Array.isArray(S.facedFoes)) S.facedFoes = [];
        S.facedFoes = S.facedFoes.filter(function (x) { return typeof x === 'string'; });
        // 角色池兼容：无 roster 字段的老存档 / roster 缺失、长度不对或含非法条目时，按当前 S.rank 与周数迁移重建（story/好感/进度一律保留）
        if (!Array.isArray(data.roster) || !rosterValid(S.roster)) S.roster = buildRoster(S.rank, weekOf(S.day));
        // Phase 5 深化：已拥有的全部装备款式补登记进图鉴（此前图鉴只登记拳套；强化等级与图鉴互不影响）
        S.owned.forEach(function (id) { var g1 = gearById(id); if (g1) registerDex(g1); });
        return true;
      } catch (e) { return false; }
    }




    /* ================= Phase 9：多存档槽（3 槽 · 槽位交换） =================
       不变量：
       1) SAVE_KEY 永远装当前槽的进度，save()/load()/测试档备份恢复全部照旧走 SAVE_KEY；
       2) 非当前槽的进度只存放在 slotKey(槽号) 下（槽号 1~3 都有暂存位，槽 1 的暂存位只在它
          不是当前槽时才有意义；当前槽的暂存位在切入该槽时即删除，避免读到过期副本）；
       3) SLOT_META_KEY = { current: 槽号 }，缺失/非法 → 槽 1（老存档自动成为槽 1，零迁移）。
       切换 = 先 save() 落盘，再把 SAVE_KEY 原文搬进旧槽暂存位、把新槽暂存位原文搬进 SAVE_KEY，
       最后更新 meta 并走现有 load() 重新载入；目标槽为空则按新档初始化（序章照常）。
       测试档兼容：BACKUP_KEY（测试前备份）与各槽 key 前缀不同、互不冲突；测试期间
       （S.testMode 或存在主存档备份时）禁止切槽/复制，防止恢复主存档时写错槽——
       备份是在某槽下对 SAVE_KEY 做的快照，meta 在整个测试期间不变，恢复自然回到那个槽。 */
    function slotKey(n) { return SLOT_KEY_PREFIX + n; }
    function currentSlot() {
      try {
        var m = JSON.parse(localStorage.getItem(SLOT_META_KEY) || 'null');
        if (m && typeof m.current === 'number' && m.current >= 1 && m.current <= SLOT_COUNT) return Math.floor(m.current);
      } catch (e) { /* meta 损坏时回落槽 1 */ }
      return 1;
    }
    function setCurrentSlot(n) {
      try { localStorage.setItem(SLOT_META_KEY, JSON.stringify({ current: n })); } catch (e) { /* 存储不可用时静默降级 */ }
    }
    function slotRaw(n) { // 某槽的存档原文：当前槽读 SAVE_KEY，非当前槽读暂存位；无档返回 null
      try { return n === currentSlot() ? localStorage.getItem(SAVE_KEY) : localStorage.getItem(slotKey(n)); }
      catch (e) { return null; }
    }
    function slotData(n) { // 某槽存档的解析结果（仅摘要用，需含合法 day）；无档/损坏返回 null
      var raw = slotRaw(n);
      if (!raw) return null;
      try {
        var d = JSON.parse(raw);
        return (d && typeof d.day === 'number') ? d : null;
      } catch (e) { return null; }
    }
    function slotStageName(d) {
      if (!d || typeof d.stage !== 'number') return '初出茅庐';
      if (d.stage > 6) return '全部阶段完成';
      var def = stageById(d.stage);
      return def ? def.name : '初出茅庐';
    }
    function slotSummaryText(n) {
      var d = slotData(n);
      if (!d) return '空';
      return '第 ' + weekOf(d.day) + ' 周 · Day ' + d.day + ' · 排名第 ' + (d.rank || 50) + ' 名 · 战绩 ' + (d.wins || 0) + ' 胜-' + (d.losses || 0) + ' 负 · 金钱 ¥' + (d.money || 0) + ' · 阶段：' + slotStageName(d) + (d.testMode ? ' · 测试档' : '');
    }
    function slotsLocked() { // 测试档期间锁定切槽/复制（见区段头注释）
      return !!S.testMode || hasBackup();
    }
    function switchSlot(n) { // 实际切换（确认框在 confirmSwitchSlot；这里也自带守卫，测试/冒烟可直接调用）
      n = Math.floor(n);
      if (!(n >= 1 && n <= SLOT_COUNT) || n === currentSlot()) return;
      if (slotsLocked()) { toast('测试档进行中，不能切换存档槽（先恢复主存档）'); return; }
      save(); // 先把内存里的最新进度落进 SAVE_KEY，再交换
      var cur = currentSlot(), tgtRaw = null;
      try {
        var curRaw = localStorage.getItem(SAVE_KEY);
        if (curRaw) localStorage.setItem(slotKey(cur), curRaw); else localStorage.removeItem(slotKey(cur));
        tgtRaw = localStorage.getItem(slotKey(n));
        localStorage.removeItem(slotKey(n)); // 目标槽成为当前槽后，其暂存位使命结束（本体转 SAVE_KEY）
        if (tgtRaw) localStorage.setItem(SAVE_KEY, tgtRaw); else localStorage.removeItem(SAVE_KEY);
        setCurrentSlot(n);
      } catch (e) { /* 存储不可用时静默降级 */ }
      leaveBattleToDaily();
      storyQueue = []; curStory = null;
      if (typeof proStopTimer === 'function') proStopTimer(); // 切槽时停掉旧槽序章的计时器并清序章状态，防止串槽
      proState = null;
      $('storyModal').classList.remove('open');
      if (tgtRaw && load()) {
        dailyLog('已切换到存档槽 ' + n + '：回到 Day ' + S.day + '，排名第 ' + S.rank + ' 名，战绩 ' + S.wins + ' 胜 · ' + S.losses + ' 负。', 'good');
        checkAchievements(true); // 切到的若是老存档，成就追溯补登记（与恢复主存档同口径）
      } else {
        S = defaultState();
        if (tgtRaw) dailyLog('存档槽 ' + n + ' 的存档读取失败，已在该槽开启一个正常新档（其他槽不受影响）。', 'bad');
        else dailyLog('已切换到存档槽 ' + n + '（空槽）：新的生涯开始了。从地区新人赛打起，一步步往上走。', 'dim');
      }
      renderDailyLog();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('已切换到存档槽 ' + n);
      if (S.story && !S.story.prologueDone) startPrologue(); // 空槽新档（或序章未走完的档）照常走序章
    }
    function confirmSwitchSlot(n) {
      if (n === currentSlot()) return;
      if (slotsLocked()) { toast('测试档进行中，不能切换存档槽（先恢复主存档）'); return; }
      askConfirm({
        title: '切换到存档槽 ' + n + '？',
        lines: [
          ['当前槽', '槽 ' + currentSlot() + '：' + slotSummaryText(currentSlot())],
          ['目标槽', '槽 ' + n + '：' + slotSummaryText(n)]
        ],
        note: '当前进度会先自动保存回槽 ' + currentSlot() + '，不会丢失，之后随时可以切回来。',
        okText: '确认切换',
        onOk: function () { switchSlot(n); }
      });
    }
    function copyCurrentToSlot(n) { // 实际复制（确认框在 confirmCopySlot；自带守卫，可直接调用）
      n = Math.floor(n);
      if (!(n >= 1 && n <= SLOT_COUNT) || n === currentSlot()) return;
      if (slotsLocked()) { toast('测试档进行中，不能复制存档槽（先恢复主存档）'); return; }
      save();
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { toast('当前槽还没有可复制的存档'); return; }
        localStorage.setItem(slotKey(n), raw); // 目标槽是非当前槽，其权威存储就是暂存位
      } catch (e) { toast('复制失败：存储不可用'); return; }
      dailyLog('已把当前进度（槽 ' + currentSlot() + '）复制备份到存档槽 ' + n + '。', 'good');
      renderSaveSlots();
      toast('已复制当前进度到存档槽 ' + n);
    }
    function confirmCopySlot(n) {
      if (n === currentSlot()) return;
      if (slotsLocked()) { toast('测试档进行中，不能复制存档槽（先恢复主存档）'); return; }
      var tgt = slotData(n);
      askConfirm({
        title: '复制当前进度到存档槽 ' + n + '？',
        lines: [
          ['来源', '槽 ' + currentSlot() + '：' + slotSummaryText(currentSlot())],
          ['目标', '槽 ' + n + '：' + slotSummaryText(n)]
        ],
        note: tgt ? '目标槽已有存档，复制会把它覆盖掉（被覆盖的进度无法恢复）。' : '目标槽是空的，复制后那里会留一份当前进度的备份；复制不会切换当前槽。',
        okText: tgt ? '覆盖并复制' : '确认复制',
        onOk: function () { copyCurrentToSlot(n); }
      });
    }
    function deleteSlot(n) { // 实际删除（确认框在 confirmDeleteSlot；自带守卫，可直接调用）：只清非当前槽的暂存位
      n = Math.floor(n);
      if (!(n >= 1 && n <= SLOT_COUNT) || n === currentSlot()) return;
      if (slotsLocked()) { toast('测试档进行中，不能删除存档槽（先恢复主存档）'); return; }
      try { localStorage.removeItem(slotKey(n)); } catch (e) { toast('删除失败：存储不可用'); return; }
      dailyLog('已删除存档槽 ' + n + ' 的存档。', 'dim');
      renderSaveSlots();
      toast('存档槽 ' + n + ' 已清空');
    }
    function confirmDeleteSlot(n) {
      if (n === currentSlot()) return;
      if (slotsLocked()) { toast('测试档进行中，不能删除存档槽（先恢复主存档）'); return; }
      if (!slotData(n)) { toast('存档槽 ' + n + ' 已经是空的'); return; }
      askConfirm({
        title: '删除存档槽 ' + n + '？',
        lines: [
          ['将被删除', '槽 ' + n + '：' + slotSummaryText(n)]
        ],
        note: '删除后无法恢复。当前槽（槽 ' + currentSlot() + '）和其他槽不受影响。',
        okText: '确认删除',
        onOk: function () { deleteSlot(n); }
      });
    }
    function renderSaveSlots() { // 渲染存档屏的 3 张槽卡（当前槽摘要读内存 S，保证与界面一致）
      var box = $('saveSlotList'); if (!box) return;
      var cur = currentSlot(), locked = slotsLocked();
      var note = $('saveTestNote'); if (note) note.style.display = locked ? '' : 'none';
      box.innerHTML = [1, 2, 3].map(function (n) {
        var isCur = n === cur;
        var d = isCur ? S : slotData(n); // 当前槽读内存 S、其余槽读暂存解析（与旧摘要同一数据源）
        var has = isCur || !!d;
        var body = d
          ? '<div class="save-slot-chips">' +
            '<span class="sv-chip"><i>进度</i>第 ' + weekOf(d.day) + ' 周 · Day ' + d.day + '</span>' +
            '<span class="sv-chip"><i>排名</i>第 ' + (isCur ? S.rank : (d.rank || 50)) + ' 名</span>' +
            '<span class="sv-chip"><i>战绩</i>' + (d.wins || 0) + ' 胜 · ' + (d.losses || 0) + ' 负</span>' +
            '<span class="sv-chip"><i>金钱</i>¥' + (d.money || 0) + '</span>' +
            '<span class="sv-chip"><i>阶段</i>' + slotStageName(d) + '</span>' +
            (d.testMode ? '<span class="sv-chip test">测试档</span>' : '') +
            '</div>'
          : '<div class="save-slot-empty">空槽位 · 还没有存档</div>';
        return '<div class="save-slot' + (isCur ? ' current' : '') + (has ? '' : ' empty') + '">' +
          '<div class="save-slot-head"><span class="save-slot-name"><span class="save-slot-no">SLOT ' + n + '</span>存档槽 ' + n + '</span>' + (isCur ? '<span class="save-slot-cur">当前槽</span>' : '') + '</div>' +
          body +
          (isCur
            ? '<div class="save-slot-btns"><span class="save-slot-auto">当前进度自动保存在此槽</span></div>'
            : '<div class="save-slot-btns">' +
              '<button class="sv-btn-load" data-slot-switch="' + n + '"' + (locked || !has ? ' disabled' : '') + '>读取</button>' +
              '<button class="sv-btn-copy" data-slot-copy="' + n + '"' + (locked ? ' disabled' : '') + '>覆盖保存（存入当前进度）</button>' +
              '<button class="sv-btn-del" data-slot-delete="' + n + '"' + (locked || !has ? ' disabled' : '') + '>删除</button>' +
              '</div>') +
          '</div>';
      }).join('');
      Array.prototype.forEach.call(box.querySelectorAll('[data-slot-switch]'), function (b) {
        b.addEventListener('click', function () { confirmSwitchSlot(parseInt(b.getAttribute('data-slot-switch'), 10)); });
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-slot-copy]'), function (b) {
        b.addEventListener('click', function () { confirmCopySlot(parseInt(b.getAttribute('data-slot-copy'), 10)); });
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-slot-delete]'), function (b) {
        b.addEventListener('click', function () { confirmDeleteSlot(parseInt(b.getAttribute('data-slot-delete'), 10)); });
      });
    }
    function openSaveSlots() { renderSaveSlots(); showScene('saves'); } // 界面架构批：存档由弹窗正式化为独立屏

    /* ================= 界面架构批：商店进店流程 / 标题屏 / 场景导航 =================
       进店规则与旧版完全一致：每次进店先走「外出」确认、确认后扣 2 AP；离开商店（回据点或
       去别的场景）即结束本次进店，下次再进重新确认扣点。shopSession 只记「本趟是否已付过
       外出点」，防场景导航重复点商店时重复扣点；不入存档。 */
    var shopSession = false;
    function enterShopFlow() {
      if (typeof B !== 'undefined' && B) { toast('比赛中无法去商店'); return; }
      if (currentSceneView === 'shop' && shopSession) return; // 已在本趟店里，重复点导航不重复扣点
      if (S.ap < 2) { toast('行动点不足（外出需要 2 AP）'); return; }
      askConfirm({
        title: '外出 · 体育用品店',
        lines: [
          ['行动点', '−2 AP（' + S.ap + ' → ' + (S.ap - 2) + '）'],
          ['效果', '进入商店选购装备与消耗品']
        ],
        note: '购买只花金钱，不再另耗 AP；每次买到东西心态 +10。出门这一趟本身消耗 2 AP，离开商店不退还。',
        okText: '确认出门',
        onOk: function () {
          if (S.ap < 2) { toast('行动点不足（外出需要 2 AP）'); return; }
          S.ap -= 2; // 外出本身 2 AP，进入商店后购买不再重复收费
          shopSession = true;
          $('outList').classList.remove('open');
          renderShop();
          showScene('shop');
          maybeTip('shop');
          render();
        }
      });
    }
    function leaveShopToDaily() { shopSession = false; showScene('daily'); }
    /* 标题屏：启动先到这里。继续＝当前槽有档时进游戏；新的开始＝当前槽有档先确认覆盖、
       无档直接开始（新档走序章，与旧版新档流程一致）；读取存档/画廊/设置从标题也可达。
       进游戏的收尾集中在 enterGame()：补弹读档追溯的阶段/成就祝贺、未走完序章的继续序章。 */
    var titleHadSave = false;
    function renderTitle(hadSave) {
      titleHadSave = !!hadSave;
      var btn = $('btnTitleContinue'); if (btn) btn.disabled = !hadSave;
      // 批次 E：titlePortrait 是常隐元素（无任何样式/脚本会显示它），不再在标题屏给它塞立绘 src（省 302KB 首访流量）；立绘本体由状态屏 portraitImg 懒加载
      var info = $('titleSlotInfo');
      if (info) info.textContent = hadSave
        ? '存档槽 ' + currentSlot() + '：' + slotSummaryText(currentSlot())
        : '暂无存档——点「新的开始」，从街机厅的测力机开始你的生涯。';
    }
    function enterGame() {
      gameEntered = true;
      shopSession = false;
      showScene('daily');
      if (S.story && !S.story.prologueDone) { startPrologue(); return; }
      checkStoryMilestones(); // 修复批次 C：门槛放宽后老档被卡住的剧情节点（前 25/前 10）在进游戏时兜底补排队（与读档追溯 flush 同点位）
      showNextPendingModal(); // 读档追溯的阶段/图鉴祝贺窗，进游戏后再弹（不在标题屏上叠罗汉）
    }
    function startNewGame() {
      // 只认启动时捕获的 titleHadSave：init 的 render() 已把默认档写进 SAVE_KEY，slotData 区分不了「真旧档」
      if (titleHadSave) {
        askConfirm({
          title: '在存档槽 ' + currentSlot() + ' 开始新生涯？',
          lines: [
            ['当前槽', '槽 ' + currentSlot() + '：' + slotSummaryText(currentSlot())],
            ['新生涯', 'Day 1 · 排名第 50 名 · 从序章（街机测力机）开始']
          ],
          note: '当前槽的进度会被清空覆盖，无法恢复（其他存档槽不受影响）。想保留现进度，先去「读取存档」把它复制备份到别的槽。',
          okText: '清空并开始新生涯',
          onOk: function () { doResetCurrentSlot(); }
        });
        return;
      }
      enterGame(); // 无档：S 已是新档默认状态，进游戏即走序章（enterGame 内处理）
    }
    function doResetCurrentSlot() { // 「重新开始」的实际执行（顶部按钮经 resetModal 确认、标题屏经确认框、设置危险区经双重确认共用）
      try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(slotKey(currentSlot())); } catch (e) {}
      clearInterval(battleTimer); B = null;
      S = defaultState();
      pendingStageNotice = []; pendingStageReward = 0;
      pendingAchNotice = [];
      storyQueue = []; curStory = null;
      shopSession = false;
      gameEntered = true;
      $('stageModal').classList.remove('open');
      $('storyModal').classList.remove('open');
      $('resetModal').classList.remove('open');
      lastAttrs = null;
      showScene('daily');
      dailyLog('新的生涯开始了。从地区新人赛打起，一步步往上走。', 'dim');
      render();
      toast('已重新开始');
      startPrologue(); // 新存档先走序章
    }
    function gotoScene(name) { // 场景导航统一入口：各屏的既有守卫/流程在这里分发
      if (name === 'daily') { shopSession = false; showScene('daily'); }
      else if (name === 'train') { renderPlan(); showScene('train'); maybeTip('train'); }
      else if (name === 'shop') enterShopFlow();
      else if (name === 'match') { shopSession = false; showScene('match'); maybeTip('match'); }
      else if (name === 'status') openStatus();
      else if (name === 'gallery') openGallery();
      else if (name === 'saves') openSaveSlots();
      else if (name === 'settings') { renderSettingsControls(); showScene('settings'); }
    }

    /* ================= 事件绑定 ================= */
    // （C5 顶部锚点快捷条已在界面架构批移除：单页全列改为多场景分屏，导航走 #sceneNav 的 gotoScene）
    // C5：长分区折叠开关（只切换 .folded 视觉类，内容与渲染逻辑不动）
    Array.prototype.forEach.call(document.querySelectorAll('[data-fold]'), function (b) {
      b.addEventListener('click', function () {
        var sec = document.getElementById(b.getAttribute('data-fold'));
        if (!sec) return;
        var folded = sec.classList.toggle('folded');
        b.textContent = folded ? '▸' : '▾';
        b.setAttribute('aria-expanded', String(!folded));
      });
    });
    /* 框架重构二期：据点二级档案面板（属性/生涯/日志）开合——只切视觉类，内容与渲染逻辑不动 */
    $('btnHubDetail').addEventListener('click', function () { $('dailyView').classList.add('sheet-open'); });
    $('btnHubSheetClose').addEventListener('click', function () { $('dailyView').classList.remove('sheet-open'); });
    $('btnTrain').addEventListener('click', function () { gotoScene('train'); }); // 界面架构批：训练改为独立屏
    $('btnOut').addEventListener('click', function () { closeSubLists('outList'); $('outList').classList.toggle('open'); setScene($('outList').classList.contains('open') ? 'street' : 'gym'); }); // A1：外出展开切街道
    Array.prototype.forEach.call(document.querySelectorAll('[data-out]'), function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-out');
        if (S.ap < 2 && kind !== 'hospital') { toast('行动点不足（外出需要 2 AP）'); return; } // 批次 D：医院菜单含免 AP 的理疗，AP 不足时也允许打开（治疗项各自再验 AP）
        if (kind === 'shop') {
          enterShopFlow(); // 进店先确认：确认后才扣 2 AP，取消不消耗（与场景导航「商店」共用同一流程）
        } else if (kind === 'hospital') {
          // 修复批次 D：医院改为二级选择——医院治疗（2 AP + ¥500 → −30）/ 康复理疗（免 AP、¥1600 → −40、每周 2 次）
          if (S.injury <= 0) { toast('身上没伤，不用去医院'); return; }
          closeSubLists('hospitalList');
          $('hospitalList').classList.toggle('open');
          setScene($('hospitalList').classList.contains('open') ? 'hospital' : 'gym');
        } else {
          if (S.money < 300) { toast('钱不够散心（需要 ¥300）'); return; }
          closeSubLists('relaxList');
          $('relaxList').classList.add('open');
        }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-hosp]'), function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-hosp');
        if (kind === 'physio') confirmPhysio(); else confirmClinic();
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
    $('btnHudMore').addEventListener('click', function () { // 三期遗留毛边：窄屏 HUD 展开/收起（体力/名声/影响力/排名/心态/右侧入口在展开区）
      var tb = document.querySelector('.topbar');
      var open = tb.classList.toggle('tb-open');
      this.textContent = open ? '收起 ▴' : '展开 ▾';
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
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
    /* 修复批次 C：约战入口——开指名列表（可选行在 renderSparList 里绑 startSpar）；取消按钮只关窗 */
    var btnSparEl = $('btnSpar');
    if (btnSparEl) btnSparEl.addEventListener('click', function () { renderSparList(); var m = $('sparModal'); if (m) m.classList.add('open'); });
    var btnCancelSparEl = $('btnCancelSpar');
    if (btnCancelSparEl) btnCancelSparEl.addEventListener('click', function () { var m = $('sparModal'); if (m) m.classList.remove('open'); });
    $('btnCancelMode').addEventListener('click', function () { $('modeModal').classList.remove('open'); if (nextBattleSpar) { S.ap = Math.min(6, S.ap + SPAR_AP_COST); save(); render(); } nextBattlePractice = false; nextBattleSpar = false; var sb = document.querySelector('#modeModal [data-mode="sim"]'); if (sb) sb.style.display = ''; var mt2 = $('modeTitle'); if (mt2) mt2.textContent = '选择战斗模式'; setScene('gym'); }); // A1：取消赛前弹窗复位拳馆；新手期重构：取消练习赛模式选择须清练习标记，防误标下一场正式赛；修复批次 C：约战取消＝全额退回 2 AP（未开打不算发起，与全工程确认框「取消不结算」口径一致），同时复原借用弹窗时改掉的标题/sim 按钮
    /* 新手期重构：据点练习赛入口（startPractice 在 battle.js）/ 情境提示条关闭 / 设置·帮助区 */
    $('btnPractice').addEventListener('click', function () { startPractice(); });
    $('btnTipOk').addEventListener('click', hideTip);
    $('btnSettingsHelp').addEventListener('click', function () { $('helpModal').classList.add('open'); });
    $('btnResetTips').addEventListener('click', function () {
      tutorialState().tips = [];
      save();
      toast('新手提示已重置：下次进入训练 / 商店 / 比赛 / 状态时会重新提示');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-mode');
        $('modeModal').classList.remove('open');
        // 框架重构一期：手动/自动先进入开战准备层（对手卡＋规则＋开始按钮），点了才开战；模拟跳过沿用原路径
        if (m === 'manual' || m === 'auto') openBattleReady(m);
        else simulateBattle();
      });
    });
    /* 框架重构一期：准备层按钮与实况日志抽屉 */
    $('btnBattleStart').addEventListener('click', function () { startBattle(readyMode); });
    $('btnReadyKeys').addEventListener('click', function () {
      keysCtx = 'pre';
      $('btnKeysMain').textContent = '开始战斗';
      prepKeysModal();
      $('keysModal').classList.add('open');
    });
    $('btnReadyBack').addEventListener('click', function () {
      $('battleReady').hidden = true;
      $('modeModal').classList.add('open'); // 回到模式选择（pendingFoe 不变，不重新抽对手）
    });
    $('btnLogDrawer').addEventListener('click', function () { $('logDrawer').classList.toggle('open'); });
    $('btnLogClose').addEventListener('click', function () { $('logDrawer').classList.remove('open'); });
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
    $('btnManualClinch').addEventListener('click', useClinch); // 修复批次 B（m3）：手动面板搂抱按钮与自动面板共用同一指令
    $('btnMute').addEventListener('click', function () {
      muted = !muted;
      // 界面架构批：静音键与设置屏联动——主静音状态同步写入设置（音乐/音效开关），设置屏拨动任一开关也会解除主静音
      SETTINGS.musicOn = !muted; SETTINGS.sfxOn = !muted;
      saveSettings(); applySettings();
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
    /* KO 定型清理（2026-11-03）：TKO 死战开关按钮早已从出货界面移除、index.html 无 btnDeathToggle 元素，
       此处的切换 handler 已成孤儿（永不绑定），删除；S.deathFight 字段与 decideTKO 判定逻辑保留（默认关，KO_AUDIT 定型口径）。 */
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
      showScene('daily'); // 结算回据点（背景 gym 由映射处理；其后若弹阶段窗会再切冠军舞台）
      if (typeof BGM !== 'undefined') BGM.start('daily'); // Phase 9：回日常视图确保日常曲（finishBattle 已切过时为无操作）
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
    $('btnReset').addEventListener('click', function () {
      var rsn = $('resetSlotNo'); if (rsn) rsn.textContent = '槽 ' + currentSlot();
      $('resetModal').classList.add('open');
    });
    $('btnCancelReset').addEventListener('click', function () { $('resetModal').classList.remove('open'); });
    $('btnConfirmReset').addEventListener('click', function () {
      // Phase 9 多存档槽：重开只清当前槽（执行体 doResetCurrentSlot 与标题屏/设置危险区共用）
      doResetCurrentSlot();
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
      gameEntered = true; // 切档/测试档/恢复主存档都直接落回游戏内据点
      showScene('daily'); // A1：切档/测试档回日常复位拳馆（背景由映射处理）
      if (typeof BGM !== 'undefined') BGM.start('daily'); // Phase 9：切存档/测试档回日常时切日常曲
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
        checkAchievements(true); // Phase 9：恢复的若是旧备份，成就同样追溯补登记
      }
      renderDailyLog();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('主存档已恢复');
    }
    /* 第一批整改·调试入口下架：测试档 / 恢复主存档按钮已从出货界面移除（startTestSave / restoreMainSave 函数保留，仅内部与测试可达，界面不可见、不可达）。 */
    var testSaveEl = $('btnTestSave'); if (testSaveEl) testSaveEl.addEventListener('click', confirmStartTest);
    var restoreSaveEl = $('btnRestoreSave'); if (restoreSaveEl) restoreSaveEl.addEventListener('click', confirmRestoreMain);
    $('btnSaves').addEventListener('click', openSaveSlots);

    /* ================= 界面架构批：标题 / 导航 / 画廊 / 设置 绑定 ================= */
    $('btnTitleContinue').addEventListener('click', function () { if (!$('btnTitleContinue').disabled) enterGame(); });
    $('btnTitleNew').addEventListener('click', startNewGame);
    $('btnTitleSaves').addEventListener('click', openSaveSlots);
    $('btnTitleGallery').addEventListener('click', function () { openGallery(); });
    $('btnTitleSettings').addEventListener('click', function () { gotoScene('settings'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (b) {
      b.addEventListener('click', function () { gotoScene(b.getAttribute('data-nav')); });
    });
    $('btnTrainBack').addEventListener('click', function () { showScene('daily'); });
    $('btnGalleryBack').addEventListener('click', backFromUtility);
    $('btnSavesBack').addEventListener('click', backFromUtility);
    $('btnSettingsBack').addEventListener('click', backFromUtility);
    Array.prototype.forEach.call(document.querySelectorAll('[data-galtab]'), function (b) {
      b.addEventListener('click', function () { openGallery(b.getAttribute('data-galtab')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-statab]'), function (b) {
      b.addEventListener('click', function () { setStatusTab(b.getAttribute('data-statab')); });
    });
    $('btnImgClose').addEventListener('click', function () { $('imgModal').classList.remove('open'); });
    $('imgModal').addEventListener('click', function (e) { if (e.target === this) $('imgModal').classList.remove('open'); });
    // 状态页「收藏与记录」跳转（画廊为唯一渲染处，状态页只留入口）
    $('btnGoGalleryDex').addEventListener('click', function () { openGallery('gear'); });
    $('btnGoGalleryDesign').addEventListener('click', function () { openGallery('design'); });
    $('btnGoGalleryFoes').addEventListener('click', function () { openGallery('foes'); });
    $('btnGoGalleryMem').addEventListener('click', function () { openGallery('mem'); });
    $('btnGoMatchRank').addEventListener('click', function () { gotoScene('match'); });
    // 设置屏控件：即改即生效（setSetting 落盘＋applySettings）；拨动音乐/音效开关时同步解除战斗面板主静音
    $('setMusicOn').addEventListener('click', function () { muted = false; setSetting('musicOn', !SETTINGS.musicOn); syncMuteBtn(); });
    $('setSfxOn').addEventListener('click', function () { muted = false; setSetting('sfxOn', !SETTINGS.sfxOn); syncMuteBtn(); });
    $('setReduceMotion').addEventListener('click', function () { setSetting('reduceMotion', !SETTINGS.reduceMotion); toast(SETTINGS.reduceMotion ? '已减少动效：过渡与残影动画关闭' : '动效已恢复'); });
    $('setMusicVol').addEventListener('input', function () { setSetting('musicVol', parseInt($('setMusicVol').value, 10) || 0); });
    $('setSfxVol').addEventListener('input', function () { setSetting('sfxVol', parseInt($('setSfxVol').value, 10) || 0); });
    $('btnSettingsReset').addEventListener('click', function () { // 危险区双重确认：先 askConfirm，再走既有 resetModal 二次确认
      askConfirm({
        title: '重置当前存档槽 ' + currentSlot() + '？',
        lines: [
          ['当前槽', '槽 ' + currentSlot() + '：' + slotSummaryText(currentSlot())],
          ['后果', '该槽进度全部清空，从 Day 1 重新出道；其他槽不受影响']
        ],
        note: '这是第一重确认。点「继续重置」后还会再弹一次最终确认，两次都确认才会真正清空。',
        okText: '继续重置',
        onOk: function () {
          var rsn = $('resetSlotNo'); if (rsn) rsn.textContent = '槽 ' + currentSlot();
          $('resetModal').classList.add('open');
        }
      });
    });

    /* ================= 初始化 ================= */
    var hadSave = load();
    // Phase 3：老存档若已满足早期阶段条件（例如已有胜场），补领阶段奖励并弹祝贺窗
    var retroStages = hadSave ? checkStageCompletion() : [];
    if (hadSave) checkDexAchievements(); // Phase 5：老存档已有收集进度时补领图鉴里程碑
    if (hadSave) checkAchievements(true); // Phase 9：老存档追溯判定——已达成的成就静默补解锁，只汇总一条日志，不弹一串 toast
    renderDailyLog();
    render();
    if (!hadSave) {
      dailyLog('欢迎来到拳馆。你是无名新人「' + S.name + '」，先从训练和打工开始攒实力吧。（名字可以在「状态」页修改）', 'dim');
      render();
    }
    /* 界面架构批：启动先到标题屏——不在此自动弹追溯祝贺窗/序章/说明，
       全部推迟到 enterGame()（点「继续游戏」/「新的开始」）后按旧流程依次发生：
       未走完序章 → startPrologue（序章结束自动开玩法说明）；已走完 → showNextPendingModal
       补弹阶段/图鉴追溯祝贺。老存档 prologueDone=true（迁移保证），点继续即原进度，绝不被序章卡住。 */
    renderTitle(hadSave);
    showScene('title');
    injectFontFaces(); // 批次 E：标题已显示，此刻才注入 @font-face 让字体开始下载（不与主文档抢带宽）
