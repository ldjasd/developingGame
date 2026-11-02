'use strict';
/* tools.js · 工具（$ / clamp / rnd / toast / 日志） —— 由 game.js 逐字拆分（Phase 7.5 工程化 v2），逻辑/数值/文案未改。 */
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
    /* ================= 打磨批次 1：表现层工具（场景背景 / 数字滚动 / 视图过渡） ================= */
    // 场景背景层：按当前界面语义换图（A1）。淡出→换 src→淡入；同一张不重复切，连续切换时旧延时自动作废。
    var currentScene = '';
    function setScene(name) {
      if (!name || name === currentScene) return;
      var img = $('sceneBgImg'); if (!img) return;
      currentScene = name;
      img.style.opacity = '0';
      setTimeout(function () {
        if (currentScene !== name) return; // 期间又切了别的场景，丢弃过期切换
        img.src = 'assets/scenes/' + name + '.webp';
        img.style.opacity = '';
      }, 130);
    }
    // 数字滚动（C2）：从元素当前显示值滚到目标值，easeOut，≤600ms；新调用取消旧动画（可打断）。
    function countUp(el, to, dur) {
      if (!el) return;
      to = Math.round(to);
      var from = (typeof el._cuVal === 'number') ? el._cuVal : (parseInt(el.textContent, 10) || 0);
      el._cuVal = to;
      if (el._cuRaf) cancelAnimationFrame(el._cuRaf);
      if (from === to || typeof requestAnimationFrame !== 'function') { el.textContent = to; el._cuRaf = null; return; }
      var ms = Math.min(dur || 600, 600), t0 = null;
      var step = function (ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / ms);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (to - from) * e);
        el._cuRaf = p < 1 ? requestAnimationFrame(step) : null;
        if (p >= 1) el.textContent = to;
      };
      el._cuRaf = requestAnimationFrame(step);
    }
    /* ================= 界面架构批：设置（独立 key，与游戏存档分离） =================
       SETTINGS_KEY 只存设置本身：音乐/音效开关与音量、动效减少；即改即生效、刷新保留。
       与 audio.js 的联动：applySettings 把开关/音量写进 audioLevels 并实时更新增益节点；
       战斗面板的静音键（btnMute）走 muted 主静音，其 handler 会反向同步本设置（见 game.js）。 */
    var SETTINGS_KEY = 'boxing-settings-v1';
    var SETTINGS = { musicOn: true, musicVol: 80, sfxOn: true, sfxVol: 90, reduceMotion: false };
    (function loadSettings() {
      try {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          var d = JSON.parse(raw);
          if (d && typeof d === 'object') {
            if (typeof d.musicOn === 'boolean') SETTINGS.musicOn = d.musicOn;
            if (typeof d.sfxOn === 'boolean') SETTINGS.sfxOn = d.sfxOn;
            if (typeof d.musicVol === 'number') SETTINGS.musicVol = clamp(Math.round(d.musicVol), 0, 100);
            if (typeof d.sfxVol === 'number') SETTINGS.sfxVol = clamp(Math.round(d.sfxVol), 0, 100);
            if (typeof d.reduceMotion === 'boolean') SETTINGS.reduceMotion = d.reduceMotion;
            return;
          }
        }
      } catch (e) { /* 存储不可用/损坏时用默认值 */ }
      // 首次无设置时，动效减少默认跟随系统偏好（prefers-reduced-motion 的手动版初始值）
      try { if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) SETTINGS.reduceMotion = true; } catch (e) {}
    })();
    function saveSettings() {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) { /* 存储不可用时静默降级 */ }
    }
    function syncMuteBtn() { // 战斗面板静音键文案与三处状态（muted 主静音 / 音乐 / 音效）保持一致
      var b = $('btnMute'); if (!b) return;
      var off = (typeof muted !== 'undefined' && muted) || (!SETTINGS.musicOn && !SETTINGS.sfxOn);
      b.textContent = off ? '音效：关' : '音效：开';
    }
    function applySettings() {
      if (typeof setBusLevel === 'function') {
        setBusLevel('music', SETTINGS.musicOn, SETTINGS.musicVol / 100);
        setBusLevel('sfx', SETTINGS.sfxOn, SETTINGS.sfxVol / 100);
      }
      if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('reduce-motion', !!SETTINGS.reduceMotion);
      syncMuteBtn();
      renderSettingsControls();
    }
    function renderSettingsControls() { // 把设置屏控件刷成 SETTINGS 当前值（控件不在 DOM 时静默跳过）
      var tg = function (id, on) { var el = $(id); if (el) { el.classList.toggle('on', !!on); el.setAttribute('aria-checked', on ? 'true' : 'false'); el.textContent = on ? '开' : '关'; } };
      tg('setMusicOn', SETTINGS.musicOn);
      tg('setSfxOn', SETTINGS.sfxOn);
      tg('setReduceMotion', SETTINGS.reduceMotion);
      var mv = $('setMusicVol'); if (mv) { mv.value = SETTINGS.musicVol; var o = $('setMusicVolVal'); if (o) o.textContent = SETTINGS.musicVol; }
      var sv = $('setSfxVol'); if (sv) { sv.value = SETTINGS.sfxVol; var o2 = $('setSfxVolVal'); if (o2) o2.textContent = SETTINGS.sfxVol; }
    }
    function setSetting(key, val) { // 设置屏统一入口：改值 → 落盘 → 立即生效
      if (!(key in SETTINGS)) return;
      SETTINGS[key] = val;
      saveSettings();
      applySettings();
    }

    /* ================= 界面架构批：统一场景管理器（多场景分屏） =================
       全部全屏视图收进一张表：showScene(name) 统一显隐、导航高亮、背景场景与 body[data-view]。
       既有流程（openStatus / startBattle / 结算回日常等）改走这里，inline display 值与旧行为一致
       （目标 block、其余 none）；战斗进行中禁止切走（与 openStatus 的既有守卫同口径）。 */
    var SCENE_VIEWS = {
      title: 'titleView', daily: 'dailyView', train: 'trainView', shop: 'shopView',
      status: 'statusView', match: 'matchView', gallery: 'galleryView',
      saves: 'savesView', settings: 'settingsView', battle: 'battleView'
    };
    var SCENE_BG = { // 各场景的同世界背景图（setScene 语义名，见 assets/scenes/）
      title: 'ring_wide', daily: 'gym', train: 'training_room', shop: 'shop',
      status: 'street', match: 'ring_wide', gallery: 'street', saves: 'gym', settings: 'gym', battle: 'ring_wide'
    };
    var currentSceneView = '';
    var gameEntered = false; // 是否已从标题屏进入游戏（决定画廊/存档/设置等功能屏的返回目标）
    function showScene(name) {
      var id = SCENE_VIEWS[name]; if (!id) return false;
      if (name !== 'battle' && typeof B !== 'undefined' && B) { toast('比赛中无法切换场景'); return false; }
      Object.keys(SCENE_VIEWS).forEach(function (k) {
        var el = $(SCENE_VIEWS[k]); if (el) el.style.display = (k === name) ? 'block' : 'none';
      });
      currentSceneView = name;
      if (document.body) document.body.setAttribute('data-view', name);
      Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-nav') === name);
      });
      if (SCENE_BG[name]) setScene(SCENE_BG[name]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }
    function backFromUtility() { // 功能屏（画廊/存档/设置）返回：已进入游戏回据点，未进入回标题
      showScene(gameEntered ? 'daily' : 'title');
    }

    // 视图过渡（C1）：监视全部全屏视图的 display 切换，变为可见时重播淡入+轻上滑动画，不改任何切换逻辑。
    (function () {
      function watch() {
        if (typeof MutationObserver !== 'function') return;
        Object.keys(SCENE_VIEWS).map(function (k) { return SCENE_VIEWS[k]; }).forEach(function (id) {
          var el = $(id); if (!el) return;
          new MutationObserver(function () {
            if (el.style.display === 'block') {
              el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in');
            }
          }).observe(el, { attributes: true, attributeFilter: ['style'] });
        });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
      else watch();
    })();

    applySettings(); // 启动即应用已保存设置（音量/开关写入 audioLevels，动效类挂 body，控件同步）

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
