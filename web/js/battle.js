'use strict';
/* battle.js · 战斗（主循环/打击反馈/Phase 4 连击反击破防/三模式/触屏控制） —— 由 game.js 逐字拆分（Phase 7.5 工程化 v2），逻辑/数值/文案未改。 */
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
      audio(); SFX.roundStart(2); if (typeof BGM !== 'undefined') BGM.start('battle'); // Phase 9：开场铃 + 切战斗曲
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
      SFX.koCheer(); SFX.heavy();
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
      B._countShown = 3; SFX.countTick(3); // Phase 9：读秒开始即第一记计数音，后续每秒一记在 tickDown
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
        SFX.countSuccess(); // Phase 9：读秒后起身继续（死战）
        if (defIsMe) B.meDeathFight = true; else B.foeDeathFight = true;
        applyDeathFightRecovery(defIsMe);
        blog((defIsMe ? '你按设置死战到底！' : '对手按设置死战到底！') + '伤害 +10%，但再被击倒一次就直接判负' + (defIsMe ? '，赛后伤病 +10' : '') + '。HP 回到 ' + Math.round(def.hp) + '，比赛继续！', defIsMe ? 'good' : 'bad');
        toast(defIsMe ? '死战到底！再倒一次就判负' : '对手死战到底！');
      } else {
        SFX.countFail(); // Phase 9：读秒失败（TKO 判负）
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
      if (isKO) koFx(); else { SFX.finalBell(); if (win) SFX.victory(); } // Phase 9：KO 欢呼在 koFx 内（koCheer），判定胜另加胜利欢呼
      if (typeof BGM !== 'undefined') BGM.start('daily'); // Phase 9：战斗结束切回日常曲
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
      checkAchievements(); // Phase 9：战绩/KO/连胜/排名/影响力/阶段都已更新，此处集中判定成就
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
