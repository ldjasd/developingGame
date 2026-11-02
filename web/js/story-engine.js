'use strict';
/* story-engine.js · Phase 7 剧情引擎（弹窗/队列/序章引擎） —— 由 game.js 逐字拆分（Phase 7.5 工程化 v2），逻辑/数值/文案未改。 */
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
      if (delta > 0 && typeof checkAchievements === 'function') checkAchievements(); // Phase 9：好感 60 / 90 成就判定
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
      if (typeof checkAchievements === 'function') checkAchievements(); // Phase 9：「命运的测力机」成就判定（跳过序章同样置 prologueDone）
      proState = null;
      $('storySkip').style.display = 'none';
      $('storyModal').classList.remove('open');
      if (!skipped) queueStory('ev_stage1');
      save(); render();
      $('helpModal').classList.add('open');
      toast(skipped ? '已跳过序章' : '序章完成，生涯开始！');
    }
