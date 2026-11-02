'use strict';
/* ui.js · 日常界面（日常渲染/训练计划/确认框/外出商店/状态页/生涯赞助/排名榜/背包/工坊） —— 由 game.js 逐字拆分（Phase 7.5 工程化 v2），逻辑/数值/文案未改。 */
    /* ================= 日常界面 ================= */
    var lastAttrs = null;
    /* 改版：属性游戏式条目——类别（决定图标徽章与数值条配色）＋图标字形＋条宽（平方根刻度，纯呈现不影响数据） */
    var ATTR_STYLE = {
      power: ['cat-a', '✦'], endurance: ['cat-a', '♥'], will: ['cat-a', '★'],
      speed: ['cat-b', '⚡'], accuracy: ['cat-b', '◎'], footwork: ['cat-b', '»'],
      defense: ['cat-c', '◆'], technique: ['cat-c', '✧']
    };
    function attrRowHTML(a, val, extra) {
      var st = ATTR_STYLE[a.key] || ['cat-c', '✦'];
      var pct = Math.min(100, Math.round(Math.sqrt(Math.max(0, val)) * 10));
      return '<div class="attr ' + st[0] + '"><span class="attr-ic">' + st[1] + '</span><span class="an">' + a.name +
        '</span><span class="attr-bar"><i style="width:' + pct + '%"></i></span><span class="av num">' + val + (extra || '') + '</span></div>';
    }
    function render() {
      $('tbDay').textContent = 'Day ' + S.day + ' · 第 ' + weekOf(S.day) + ' 周';
      countUp($('tbMoney'), S.money); // C2：余额变化滚动到位（值未变时内部直写，无动画）
      $('tbStam').style.width = S.stamina + '%';
      $('tbStamNum').textContent = Math.round(S.stamina);
      $('tbInj').style.width = S.injury + '%';
      $('tbInjNum').textContent = Math.round(S.injury);
      $('tbFame').textContent = S.fame;
      var tbi = $('tbInfluence'); if (tbi) tbi.textContent = influenceLabel(refreshInfluence());
      var tbw = $('testBadgeWrap'); if (tbw) tbw.style.display = S.testMode ? '' : 'none';
      var stb = $('stTestBadge'); if (stb) stb.style.display = S.testMode ? '' : 'none';
      var brs = $('btnRestoreSave'); if (brs) brs.style.display = hasBackup() ? '' : 'none';
      var bsv = $('btnSaves'); if (bsv && typeof currentSlot === 'function') bsv.textContent = '存档·槽' + currentSlot();
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
        return attrRowHTML(a, ea[a.key], bonus + up);
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
      var mwn = $('matchWeekNote'); if (mwn) mwn.innerHTML = $('weekNote').innerHTML; // 比赛屏同步本周提示（与据点同一段文案）
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
      $('btnPlanCancel').addEventListener('click', function () { planSel = []; renderPlan(); }); // 训练屏内取消 = 清空已选计划（列表常驻）
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
      render();
      showScene('daily'); // 界面架构批：训练结算后回据点（训练屏的列表常驻显示，不再靠 open 类开关）
      toast('训练计划完成');
      // D2：训练后小概率触发日常小事件（拳馆日常/队友互动等，未触发过的才抽）
      triggerDailyEvent(0.25);
    }
    /* ================= 行动确认框（确认后才结算，取消不消耗） ================= */
    var pendingConfirm = null;
    function fmtDelta(before, after, unit) { // 预览「当前 → 结算后」
      var d = Math.round(after) - Math.round(before);
      var sign = d > 0 ? '+' : '';
      return Math.round(before) + ' → ' + Math.round(after) + (unit || '') + '（' + sign + Math.round(d) + '）';
    }
    var confirmScene = ''; // A1：带场景的确认框（如医院）打开时切背景、关闭时复位
    function askConfirm(cfg) {
      pendingConfirm = cfg;
      if (cfg.scene) { confirmScene = cfg.scene; setScene(cfg.scene); }
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
    function closeConfirm() { pendingConfirm = null; $('confirmModal').classList.remove('open'); if (confirmScene) { confirmScene = ''; setScene('gym'); } }
    $('btnCfCancel').addEventListener('click', closeConfirm);
    $('confirmModal').addEventListener('click', function (e) { if (e.target === this) closeConfirm(); });
    $('btnCfOk').addEventListener('click', function () {
      // 点击音由下方 C3 全局委托统一播放（确认键也在内），此处不再单独播放，避免双响
      var cfg = pendingConfirm;
      closeConfirm();
      if (cfg && cfg.onOk) cfg.onOk();
    });
    /* C3：主要按钮统一点击音（事件委托：任意未禁用的 <button> 点击都轻响一声；
       SFX.click 内部自带 muted / 无 AudioContext 守卫，jsdom 与未解锁音频时均安全无声） */
    document.addEventListener('click', function (e) {
      var t = e.target;
      var btn = (t && t.closest) ? t.closest('button') : null;
      if (!btn || btn.disabled) return;
      if (typeof SFX !== 'undefined' && SFX.click) SFX.click();
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
      if (S.day % 7 === 1) { weeklyRosterGrowth(weekOf(S.day)); checkAchievements(); } // Phase 9：每周重排后排名类成就判定
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
          if (typeof SFX !== 'undefined' && SFX.buy) SFX.buy(); // Phase 9：购买成功音
          checkAchievements(); // Phase 9：图鉴 10 款成就判定（定制会登记新款式）
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
      html += '<div class="plan-foot"><button class="secondary-btn" id="btnShopDex">款式图鉴（设计池精选 ' + (typeof DEX_GALLERY !== 'undefined' ? DEX_GALLERY.length : 0) + ' 款）</button><button class="secondary-btn" id="btnShopBack">离开商店</button></div>';
      $('shopList').innerHTML = html;
      Array.prototype.forEach.call(document.querySelectorAll('[data-buy-gear]'), function (btn) {
        btn.addEventListener('click', function () { buyGear(btn.getAttribute('data-buy-gear')); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-buy-item]'), function (btn) {
        btn.addEventListener('click', function () { buyConsumable(btn.getAttribute('data-buy-item')); });
      });
      $('btnShopBack').addEventListener('click', function () { $('shopList').classList.remove('open'); shopSession = false; showScene('daily'); }); // 离开商店回据点（再次进店重新走外出确认）
      $('btnShopDex').addEventListener('click', function () { // 图鉴联动：从商店直达画廊的设计款式页签（纯展示）
        $('shopList').classList.remove('open');
        openGallery('design');
      });
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
          if (typeof SFX !== 'undefined' && SFX.buy) SFX.buy(); // Phase 9：购买成功音
          checkAchievements(); // Phase 9：图鉴 10 款成就判定（购买会登记新款式）
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
          if (typeof SFX !== 'undefined' && SFX.buy) SFX.buy(); // Phase 9：购买成功音
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
      // Phase 7→D2：散心小概率偶遇日常事件（事件池已扩至 15 段，每段只触发一次，触发后直接弹出对白）
      triggerDailyEvent(0.4);
    }

    /* ================= 状态界面 / 背包 ================= */
    var bagTab = 'gear';
    function openStatus() {
      if (B) { toast('比赛中无法查看状态'); return; }
      showScene('status'); // 界面架构批：走统一场景管理器（背景 street 由 SCENE_BG 映射）
      renderStatus();
    }
    function closeStatus() {
      showScene('daily');
      render();
    }
    /* ================= 界面架构批：画廊屏（五页签，收集内容唯一渲染处） =================
       立绘页签在此新建网格；装备图鉴/设计款式/对手名鉴/回忆四个页签的 DOM 已迁入画廊屏，
       渲染仍由 renderStatus() 内的既有函数完成（render() 每次都会调用），此处只管页签切换。 */
    var galleryTab = 'portrait';
    function portraitGalleryList() { // 主角 21 张立绘：默认立绘 + 发型 8 + 脸型 2 + 服装 10（同图去重，带维度标签）
      var seen = {}, list = [];
      [['发型', APPEARANCE.hair], ['脸型', APPEARANCE.face], ['服装', APPEARANCE.outfit]].forEach(function (pair) {
        Object.keys(pair[1]).forEach(function (k) {
          var v = pair[1][k];
          if (seen[v.src]) return;
          seen[v.src] = true;
          list.push({ src: v.src, label: pair[0] + ' · ' + v.name });
        });
      });
      return list;
    }
    function renderGalleryPortraits() {
      var el = $('galPortraits'); if (!el) return;
      el.innerHTML = portraitGalleryList().map(function (e) {
        return '<figure class="gal-portrait" data-gal-img="' + e.src + '" data-gal-cap="' + e.label + '"><img src="' + e.src + '" alt="' + e.label + ' 立绘" loading="lazy" /><figcaption>' + e.label + '</figcaption></figure>';
      }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('[data-gal-img]'), function (f) {
        f.addEventListener('click', function () {
          $('imgModalImg').src = f.getAttribute('data-gal-img');
          $('imgModalCap').textContent = f.getAttribute('data-gal-cap');
          $('imgModal').classList.add('open');
        });
      });
    }
    function openGallery(tab) {
      if (typeof B !== 'undefined' && B) { toast('比赛中无法打开画廊'); return; }
      if (tab) galleryTab = tab;
      renderGalleryPortraits();
      renderStatus(); // 图鉴/名鉴/回忆四页签内容由既有渲染函数填充（DOM 已在画廊屏内）
      Array.prototype.forEach.call(document.querySelectorAll('[data-galtab]'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-galtab') === galleryTab);
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-galpanel]'), function (p) {
        p.style.display = p.getAttribute('data-galpanel') === galleryTab ? '' : 'none';
      });
      showScene('gallery');
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
    /* ================= Phase 9：状态页「成就」区 ================= */
    function renderAchievements() {
      var el = $('stAchievements'); if (!el) return;
      if (typeof ensureAchievements === 'function') ensureAchievements();
      var unlocked = ACHIEVEMENTS.filter(function (a) { return !!(S.achievements && S.achievements[a.id]); });
      var cnt = $('achCount'); if (cnt) cnt.textContent = '已解锁 ' + unlocked.length + ' / ' + ACHIEVEMENTS.length + ' · 纯荣誉，不发奖励';
      var html = '<div class="prog-row"><div class="prog-head"><span class="pg-n">收集进度</span><span class="pg-v' + (unlocked.length >= ACHIEVEMENTS.length ? ' done' : '') + '">' + unlocked.length + ' / ' + ACHIEVEMENTS.length + '</span></div>' +
        '<div class="progbar"><i class="' + (unlocked.length >= ACHIEVEMENTS.length ? 'done' : '') + '" style="width:' + clamp(unlocked.length / ACHIEVEMENTS.length * 100, 0, 100) + '%"></i></div></div>';
      html += ACH_CATEGORIES.map(function (cat) {
        var items = ACHIEVEMENTS.filter(function (a) { return a.cat === cat.id; });
        if (!items.length) return '';
        return '<p class="shop-note" style="margin:12px 0 6px">' + achBadge(cat.id) + '<b>' + cat.name + '</b></p>' + items.map(function (a) {
          var rec = S.achievements && S.achievements[a.id];
          if (rec) return '<div class="dex-item"><div style="flex:1;min-width:0"><span class="bi-t">' + achBadge(a.cat) + a.name + '</span><div class="bi-d">' + a.desc + '</div></div><span class="dex-state">' + (rec.text || '') + '</span></div>';
          return '<div class="dex-item locked"><div style="flex:1;min-width:0"><span class="bi-t">' + achBadge(a.cat, true) + a.name + '</span><div class="bi-d">条件：' + a.desc + '</div></div><span class="dex-state">未解锁</span></div>';
        }).join('');
      }).join('');
      el.innerHTML = html;
    }
    /* ================= D3：状态页「对手名鉴」（52 人 = 角色池 50 + 前辈 + 经纪人） =================
       数据全部来自现有表：S.roster（当前排名/风格/成长）+ STORY_CHARS（前辈/经纪人），不新造数据表；
       已交手取 S.facedFoes（settleNow 结算时记录，仅供点亮展示）；未交手半透明＋「未交手」标。 */
    function renderFoeDex() {
      var el = $('stFoeDex'); if (!el) return;
      ensureRoster();
      if (!Array.isArray(S.facedFoes)) S.facedFoes = [];
      var faced = S.facedFoes;
      var members = S.roster.slice().sort(function (a, b) {
        var ra = a.rank > 0 ? a.rank : 999, rb = b.rank > 0 ? b.rank : 999;
        return ra - rb;
      });
      var facedCount = members.filter(function (m) { return faced.indexOf(m.key) >= 0; }).length;
      var cnt = $('foeDexCount'); if (cnt) cnt.textContent = '已交手 ' + facedCount + ' / ' + members.length + ' 人 · 另含前辈与经纪人';
      var html = '<div class="foe-dex-grid">';
      html += members.map(function (m) {
        var met = faced.indexOf(m.key) >= 0;
        var line = (FOE_STYLES[m.style] ? FOE_STYLES[m.style].name : '') + ' · ' + (GROWTH_LABELS[m.growth] || '');
        if (m.key === 'opp_counter') line += ' · 宿敌';
        if (m.key === 'opp_rookie') line += ' · 同期队友';
        return '<div class="foe-dex-item' + (met ? '' : ' unmet') + '">' +
          (met ? '' : '<span class="fd-unmet">未交手</span>') +
          '<img src="assets/opponents/' + m.key + '.webp" alt="' + m.name + ' 的立绘" loading="lazy" />' +
          '<div class="fd-name">' + m.name + '</div>' +
          '<div class="fd-rank">' + (m.rank > 0 ? '国内第 ' + m.rank + ' 名' : '候补 · 未入榜') + '</div>' +
          '<div class="fd-line">' + line + '</div></div>';
      }).join('');
      html += [['senior', '拳馆前辈'], ['manager', '经纪人']].map(function (pair) {
        var c = STORY_CHARS[pair[0]];
        return '<div class="foe-dex-item"><span class="fd-staff">' + pair[1] + '</span>' +
          '<img src="' + c.img + '" alt="' + c.name + ' 的立绘" loading="lazy" />' +
          '<div class="fd-name">' + c.name + '</div>' +
          '<div class="fd-rank">' + pair[1] + '</div>' +
          '<div class="fd-line">' + c.role + '</div></div>';
      }).join('');
      html += '</div>';
      el.innerHTML = html;
    }
    /* ================= D4：状态页「回忆」（已触发剧情列表 → 只读回放） ================= */
    function renderMemories() {
      var el = $('stMemories'); if (!el) return;
      storyState();
      var ids = S.story.seenEvents.filter(function (id) { return !!STORY_EVENTS[id]; });
      var cnt = $('memCount'); if (cnt) cnt.textContent = ids.length ? '已触发 ' + ids.length + ' 段 · 只读回放，不重复结算' : '暂无记录';
      if (!ids.length) {
        el.innerHTML = '<p class="shop-note">还没有触发过剧情事件。推进生涯、赢下比赛、提升好感，故事会自己找上门——看过的都会收进这里。</p>';
        return;
      }
      el.innerHTML = ids.map(function (id) {
        var d = STORY_EVENTS[id];
        var c = STORY_CHARS[d.char];
        return '<div class="dex-item"><div style="flex:1;min-width:0"><span class="bi-t">' + (d.title || id) + '</span><div class="bi-d">' + (c ? c.name + ' · ' + c.role + '　·　' : '') + '共 ' + d.pages.length + ' 页对白</div></div><button data-replay="' + id + '">重看</button></div>';
      }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('[data-replay]'), function (btn) {
        btn.addEventListener('click', function () { openStoryReplay(btn.getAttribute('data-replay')); });
      });
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
          checkAchievements(); // Phase 9：「商业首秀」成就判定
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
        var badge = '<span class="rr-badge num' + (r <= 3 ? ' r' + r : '') + '">' + r + '</span>';
        if (r === S.rank) {
          rows.push('<div class="rank-row me">' + badge + '<img src="' + portraitSrc() + '" alt="" /><span class="rr-name">' + S.name + '（你）</span><span class="rr-meta">' + S.wins + ' 胜 · ' + S.losses + ' 负</span></div>');
        } else if (byRank[r]) {
          var m = byRank[r];
          rows.push('<div class="rank-row">' + badge + '<img src="assets/opponents/' + m.key + '.webp" alt="" loading="lazy" /><span class="rr-name">' + m.name + '</span><span class="rr-meta">' + FOE_STYLES[m.style].name + ' · ' + (GROWTH_LABELS[m.growth] || m.growth) + '</span></div>');
        }
      }
      S.roster.forEach(function (m) {
        if (m.rank === 0) rows.push('<div class="rank-row reserve"><span class="rr-badge wide">候补</span><img src="assets/opponents/' + m.key + '.webp" alt="" loading="lazy" /><span class="rr-name">' + m.name + '</span><span class="rr-meta">候补 · 未入榜 · ' + FOE_STYLES[m.style].name + ' · ' + (GROWTH_LABELS[m.growth] || m.growth) + '</span></div>');
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
      countUp($('stMoney'), S.money); // C2：状态页余额同顶栏一起滚动
      $('stRecord').textContent = S.wins + ' 胜 · ' + S.losses + ' 负';
      renderRelations(); // Phase 7：关系区（好感）
      renderRankBoard(); // 角色池：国内排名榜
      renderFoeDex(); // D3：对手名鉴（52 人）
      renderMemories(); // D4：剧情回忆列表
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
        return attrRowHTML(a, ea[a.key], bonus);
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
      // 设计款式图鉴（展示型收集）：设计池精选画廊，按类别分组；纯展示，不登记进度、不影响数值
      function dexGalleryHTML() {
        if (typeof DEX_GALLERY === 'undefined' || !DEX_GALLERY.length) return '';
        var html = '<div class="dex-gallery" id="dexGallery"><h3 class="dex-gal-title">设计款式图鉴 <span class="tag">精选 ' + DEX_GALLERY.length + ' 款 · 展示收藏</span></h3>' +
          '<p class="shop-note" style="margin:0 0 6px">从装备设计池里精选的款式陈列（版型拳套、主题款与各部位设计款）。这里是纯欣赏的收藏画廊，与上面的收集进度分开计数。</p>';
        DEX_GALLERY_CATS.forEach(function (c) {
          var items = DEX_GALLERY.filter(function (e) { return e[0] === c[0]; });
          if (!items.length) return;
          html += '<h4 class="dex-gal-cat">' + c[1] + ' <span class="tag">' + items.length + ' 款</span></h4><div class="dex-gal-grid">' +
            items.map(function (e) {
              return '<figure class="dex-gal-item"><img src="' + e[2] + '" alt="' + e[1] + '" loading="lazy" /><figcaption>' + e[1] + '</figcaption></figure>';
            }).join('') + '</div>';
        });
        return html + '</div>';
      }
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
      var galDesignEl = $('galDesign'); // 界面架构批：设计款式图鉴渲染到画廊「设计款式」页签（与装备图鉴分开两个页签）
      if (galDesignEl) galDesignEl.innerHTML = dexGalleryHTML();
      renderStageCard();
      renderAchievements(); // Phase 9：成就区
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
          checkAchievements(); // Phase 9：「亲手打造」/ 图鉴 10 款成就判定
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
