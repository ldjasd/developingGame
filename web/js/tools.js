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
