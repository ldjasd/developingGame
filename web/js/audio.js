'use strict';
/* audio.js · 音效合成（Web Audio 现场合成） —— 由 game.js 逐字拆分（Phase 7.5 工程化 v2），逻辑/数值/文案未改。
   Phase 9 音效/音乐完整化（2026-11-02）：新增全合成 BGM sequencer（日常/战斗两曲）与关键场面音效，仍无任何外部音频文件。 */
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
      crowd: function () { playNoise(1.5, 'bandpass', 750, 0.55); playNoise(1.2, 'bandpass', 1250, 0.32, 0.15); playNoise(0.9, 'highpass', 2000, 0.15, 0.3); },
      /* ---- Phase 9 新增（全部由上面的 playTone/playNoise 合成，无外部文件） ---- */
      roundStart: function (times) { SFX.bell(times || 1); }, // 回合开始铃（开场 2 声、回合间 1 声，沿用 bell 音色）
      roundEnd: function () { SFX.bell(1); }, // 回合结束铃（进回合休息时 1 声）
      finalBell: function () { SFX.bell(3); }, // 终场铃（判定结束 3 声）
      countTick: function (n) { // 读秒计数：每秒一记短 beep，数字越小音越急（频率略升）
        var f = 620 + (3 - Math.max(1, Math.min(3, n || 3))) * 90;
        playTone(f, 0.09, 'square', 0.07); playNoise(0.03, 'bandpass', 2400, 0.10);
      },
      countSuccess: function () { playTone(523, 0.14, 'triangle', 0.12); playTone(784, 0.28, 'triangle', 0.12, 0.10); }, // 读秒起身成功：上行两音
      countFail: function () { playTone(392, 0.22, 'triangle', 0.12, 0, 196); playTone(196, 0.4, 'sine', 0.12, 0.16, 98); }, // 读秒失败/TKO 判负：下行两音
      koCheer: function () { // KO 人群惊呼：原 crowd 三层噪声 + 一记大和弦衬底
        SFX.crowd();
        playTone(262, 1.0, 'triangle', 0.06, 0.05); playTone(330, 1.0, 'triangle', 0.05, 0.05); playTone(392, 1.0, 'triangle', 0.05, 0.05);
      },
      victory: function () { // 点数/判定胜利小欢呼：短人群噪声 + 胜利四音（C-E-G-C）
        playNoise(0.8, 'bandpass', 900, 0.28); playNoise(0.6, 'bandpass', 1400, 0.16, 0.1);
        playTone(523, 0.16, 'triangle', 0.10, 0); playTone(659, 0.16, 'triangle', 0.10, 0.11);
        playTone(784, 0.16, 'triangle', 0.10, 0.22); playTone(1047, 0.42, 'triangle', 0.11, 0.33);
      },
      achievement: function () { // 成就解锁小旋律：C-E-G-C 琶音
        playTone(523, 0.18, 'sine', 0.09, 0); playTone(659, 0.18, 'sine', 0.09, 0.09);
        playTone(784, 0.18, 'sine', 0.09, 0.18); playTone(1047, 0.38, 'sine', 0.10, 0.27);
        playTone(1319, 0.30, 'sine', 0.04, 0.27);
      },
      buy: function () { // 购买成功：经典双音「金币」声
        playTone(988, 0.09, 'square', 0.06); playTone(1319, 0.32, 'square', 0.06, 0.08);
      },
      click: function () { playNoise(0.025, 'bandpass', 2100, 0.07); playTone(720, 0.035, 'triangle', 0.045); } // 主要确认按钮轻点声（只挂确认框确定键）
    };

    /* ================= Phase 9：BGM（全合成循环 sequencer，无外部文件） =================
       两套曲目、8 步/小节、4 小节循环。调度：setInterval 90ms 前瞻 0.25s 排音，
       每个音符仍走 playTone/playNoise（自带 muted 守卫与 AC 解锁）。
       muted 或页面隐藏时调度器只推进时间锚点、不产生任何振荡器/噪声节点（不空转发声）；
       已排进 0.25s 前瞻窗的极少数音符无法撤回，是前瞻调度的固有尾音（<0.25s）。
       状态只存内存（BGM.track），不入存档；开始播放只由用户手势路径触发（见文件末解锁监听）。 */
    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    var BGM_TRACKS = {
      daily: { // 日常曲：76 BPM，Am7–Fmaj7–Cmaj7–G，低音量、慢速轻松
        bpm: 76,
        bars: [
          { bass: 45, chord: [57, 60, 64, 67], mel: [64, -1, 67, -1, 69, -1, 67, 64] },
          { bass: 41, chord: [53, 57, 60, 65], mel: [65, -1, 64, -1, 60, -1, 57, -1] },
          { bass: 48, chord: [55, 59, 64, 67], mel: [64, -1, 67, -1, 71, -1, 67, -1] },
          { bass: 43, chord: [55, 59, 62, 67], mel: [62, -1, 59, -1, 55, -1, 59, -1] }
        ]
      },
      battle: { // 战斗曲：140 BPM，Dm–B♭–F–C，驱动低音+底鼓/踩镲，音量略高
        bpm: 140,
        bars: [
          { bass: 38, chord: [50, 53, 57], mel: [62, -1, 65, 62, -1, 69, -1, 65] },
          { bass: 34, chord: [46, 50, 53], mel: [58, -1, 62, 58, -1, 65, -1, 62] },
          { bass: 41, chord: [53, 57, 60], mel: [65, -1, 69, 65, -1, 72, -1, 69] },
          { bass: 36, chord: [48, 52, 55], mel: [64, -1, 67, 64, -1, 71, -1, 67] }
        ]
      }
    };
    var BGM = {
      track: null, _timer: null, _step: 0, _next: 0,
      start: function (name) {
        if (!BGM_TRACKS[name]) return;
        if (BGM.track === name && BGM._timer) return; // 同曲目重复调用不重启
        BGM.track = name; BGM._step = 0;
        var ac = audio();
        if (ac) BGM._next = ac.currentTime + 0.06;
        if (!BGM._timer) BGM._timer = setInterval(BGM._tick, 90);
      },
      stop: function () {
        if (BGM._timer) { clearInterval(BGM._timer); BGM._timer = null; }
        BGM.track = null; BGM._step = 0;
      },
      _tick: function () {
        if (!BGM.track) return;
        var ac = audio(); if (!ac) return;
        if (muted || (typeof document !== 'undefined' && document.hidden)) { BGM._next = ac.currentTime + 0.12; return; }
        if (!BGM._next || BGM._next < ac.currentTime) BGM._next = ac.currentTime + 0.05;
        var tr = BGM_TRACKS[BGM.track];
        var stepDur = 60 / tr.bpm / 2; // 八分音符
        while (BGM._next < ac.currentTime + 0.25) {
          BGM._schedule(BGM.track, tr, BGM._step, Math.max(0, BGM._next - ac.currentTime), stepDur);
          BGM._next += stepDur;
          BGM._step = (BGM._step + 1) % (tr.bars.length * 8);
        }
      },
      _schedule: function (name, tr, step, delay, stepDur) {
        var bar = tr.bars[Math.floor(step / 8) % tr.bars.length];
        var s = step % 8;
        if (name === 'daily') {
          if (s === 0) playTone(mtof(bar.bass), stepDur * 1.9, 'triangle', 0.055, delay);
          if (s % 2 === 0) playTone(mtof(bar.chord[(s / 2) % bar.chord.length]), stepDur * 1.6, 'sine', 0.022, delay);
          var dm = bar.mel[s];
          if (dm > 0) playTone(mtof(dm), stepDur * 1.4, 'triangle', 0.038, delay);
        } else {
          var bNote = (s % 4 === 2) ? bar.bass + 12 : bar.bass;
          playTone(mtof(bNote), stepDur * 0.95, 'triangle', 0.075, delay);
          if (s === 0 || s === 4) playTone(110, 0.12, 'sine', 0.10, delay, 48); // 合成底鼓
          if (s % 2 === 1) playNoise(0.03, 'highpass', 6500, 0.016, delay); // 合成踩镲
          if (s === 0 || s === 3 || s === 6) for (var ci = 0; ci < bar.chord.length; ci++) playTone(mtof(bar.chord[ci] + 12), 0.18, 'sine', 0.016, delay);
          var bm = bar.mel[s];
          if (bm > 0) playTone(mtof(bm), stepDur * 1.1, 'square', 0.018, delay);
        }
      }
    };
    /* 首次用户手势后才允许出声（浏览器 autoplay 限制）：第一次 pointerdown/keydown 时
       若尚未在播任何曲目，默认起日常曲；进战斗由 startBattle 切战斗曲、战斗结束切回。 */
    var bgmUnlocked = false;
    function bgmFirstGesture() {
      if (bgmUnlocked) return;
      bgmUnlocked = true;
      if (!BGM.track) BGM.start('daily');
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('pointerdown', bgmFirstGesture);
      document.addEventListener('keydown', bgmFirstGesture);
    }
