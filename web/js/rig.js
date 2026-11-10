/* 2D 骨骼纸偶引擎（主角试点，2026-11-04）
 * 结构分工：
 *   RIG_TEMPLATE = 全员共用模板：骨骼层级、地标原点（绑定帧 700x1004 坐标）、分段长度比、
 *                  姿势库（世界方向角）与动作表。扩围到新角色时不重写动作。
 *   RIG_CHARS[char] = 单角色标定：部件图目录 + 每件部件的裁切框/枢轴/绘制轴向（axisDeg）/段长。
 *                  新角色只需按 CHARACTER_RIG.md「试点实装记录」的标定步骤产出这一份数据。
 * 姿势以「世界方向角」编写：肢体骨 = 该段世界指向角；躯干/头 = 世界旋转角。
 * 引擎按骨骼链换算局部角：local = worldRot(骨) - worldRot(父链)，worldRot(肢体) = dir - axisDeg。
 * 部件图按「部件自身枢轴对齐骨骼原点」放置：img 左上 = 骨骼原点 - meta.pivot(裁切内坐标)。
 * 朝向约定：角色朝右（朝向对手）；左右镜像由舞台侧 scaleX 处理，本引擎不做镜像。
 */
(function (global) {
  'use strict';

  var RIG_TEMPLATE = {
    frame: [700, 1004],
    // [骨名, 父骨, 部件键, 绑定帧原点[x,y], 远侧压暗]
    // 原点语义：根骨子骨 = 舞台坐标；链内子骨 = 父骨「绘制帧」中的关节点
    // （= 父原点 + 父段长∠父部件绘制轴向），保证 FK 闭合。
    bones: [
      ['legFarThigh', 'root', 'legFarThigh', [386, 584], false],
      ['legFarShin', 'legFarThigh', 'legFarShin', [317, 702], false],
      ['legNearThigh', 'root', 'legNearThigh', [314, 578], false],
      ['legNearShin', 'legNearThigh', 'legNearShin', [430, 670], false],
      ['torso', 'root', 'torso', [330, 520], false],
      ['armFarUpper', 'torso', 'armNearUpper', [288, 302], true],
      ['armFarFore', 'armFarUpper', 'armNearFore', [470, 316], true],
      ['head', 'torso', 'head', [286, 270], false],
      ['armNearUpper', 'torso', 'armNearUpper', [324, 294], false],
      ['armNearFore', 'armNearUpper', 'armNearFore', [506, 308], false],
    ],
    // 分段长度比（以躯干长 骨盆枢轴->颈枢轴 = 250 为 1.0；主角标定值，供新角色标定时对照）
    segRatio: { armUpper: 0.730, armFore: 0.854, thighNear: 0.592, shinNear: 0.743, thighFar: 0.547, shinFar: 0.605 },
  };

  // ---- 姿势库（世界角，模板共用）。guard 为 rest 架势 ----
  var G = { root: { x: 0, y: 0, r: 0 }, torso: 3, head: -2, armFarUpper: 70, armFarFore: -85, armNearUpper: 88, armNearFore: -82, legFarThigh: 93, legFarShin: 143, legNearThigh: 52, legNearShin: 76 };
  var LUNGE = { legNearThigh: 58, legNearShin: 90, legFarThigh: 122, legFarShin: 94 };
  var POSES = {
    guard: G,
    guardB: Object.assign({}, G, { root: { x: 0, y: -3, r: 0 }, torso: 2.2, head: -1.2, armNearUpper: 86.5, armNearFore: -80, armFarUpper: 68.5, armFarFore: -83.5 }),
    block: Object.assign({}, G, { root: { x: 0, y: 6, r: 0 }, torso: 2, head: 4, armNearUpper: 96, armNearFore: -84, armFarUpper: 74, armFarFore: -95 }),
    blockB: Object.assign({}, G, { root: { x: 0, y: 4, r: 0 }, torso: 1.2, head: 3.2, armNearUpper: 99, armNearFore: -78.5, armFarUpper: 67, armFarFore: -90.5 }),
    jab: Object.assign({}, G, LUNGE, { root: { x: 14, y: 0, r: 0 }, torso: 5, head: -3, armNearUpper: 25, armNearFore: -2, legNearThigh: 60, legNearShin: 90 }),
    straight: Object.assign({}, G, LUNGE, { root: { x: 22, y: 0, r: 0 }, torso: 8, head: -5, armNearUpper: 6, armNearFore: 0, armFarUpper: 100, armFarFore: -96, legNearThigh: 55, legNearShin: 88, legFarThigh: 128, legFarShin: 100 }),
    hook: Object.assign({}, G, LUNGE, { root: { x: 16, y: 2, r: 0 }, torso: 9, head: -3, armNearUpper: 18, armNearFore: -58, legNearThigh: 70, legNearShin: 90 }),
    upper: Object.assign({}, G, LUNGE, { root: { x: 8, y: -6, r: 0 }, torso: -4, head: -3, armNearUpper: 55, armNearFore: -80 }),
    body: Object.assign({}, G, { root: { x: 18, y: 46, r: 0 }, torso: 15, head: 7, armNearUpper: 62, armNearFore: 36, legNearThigh: 76, legNearShin: 108, legFarThigh: 100, legFarShin: 62 }),
    hit: Object.assign({}, G, { root: { x: -16, y: 3, r: 0 }, torso: -11, head: -12, armNearUpper: 70, armNearFore: 105, armFarUpper: 60, armFarFore: 120, legNearThigh: 58, legFarThigh: 88 }),
    dodge: Object.assign({}, G, { root: { x: -6, y: 52, r: 0 }, torso: 14, head: 8, armNearUpper: 98, armNearFore: -78, armFarUpper: 66, armFarFore: -90, legNearThigh: 76, legNearShin: 100, legFarThigh: 105, legFarShin: 60 }),
    down: { root: { x: 95, y: 350, r: 0 }, torso: -78, head: -84, armNearUpper: 160, armNearFore: 20, armFarUpper: -130, armFarFore: -95, legNearThigh: -5, legNearShin: 25, legFarThigh: 8, legFarShin: 30 },
    victory: Object.assign({}, G, { root: { x: 0, y: -4, r: 0 }, torso: -4, head: -5, armNearUpper: -88, armNearFore: -96, armFarUpper: 57, armFarFore: -79 }),
    victoryB: Object.assign({}, G, { root: { x: 0, y: 3, r: 0 }, torso: -3.2, head: -4, armNearUpper: -86, armNearFore: -94, armFarUpper: 57, armFarFore: -79 }),
  };
  RIG_TEMPLATE.poses = POSES;
  // ---- 动作表。keys 中的 'stance' 在 play 时按当前架势（guard/block）解析 ----
  RIG_TEMPLATE.anims = {
    guard: { loop: 2600, keys: [[0, 'guard'], [1300, 'guardB'], [2600, 'guard']] },
    block: { loop: 2600, keys: [[0, 'block'], [1300, 'blockB'], [2600, 'block']] },
    jab: { dur: 250, keys: [[0, 'stance'], [95, 'jab'], [250, 'stance']] },
    straight: { dur: 250, keys: [[0, 'stance'], [100, 'straight'], [250, 'stance']] },
    hook: { dur: 270, keys: [[0, 'stance'], [110, 'hook'], [270, 'stance']] },
    upper: { dur: 280, keys: [[0, 'stance'], [120, 'upper'], [280, 'stance']] },
    body: { dur: 300, keys: [[0, 'stance'], [120, 'body'], [300, 'stance']] },
    blockHit: { dur: 300, keys: [[0, 'stance'], [90, 'block'], [300, 'stance']] },
    hit: { dur: 320, keys: [[0, 'stance'], [80, 'hit'], [320, 'stance']] },
    dodge: { dur: 320, keys: [[0, 'stance'], [110, 'dodge'], [320, 'stance']] },
    down: { dur: 600, keys: [[0, 'hit'], [600, 'down']], hold: true },
    getup: { dur: 520, keys: [[0, 'down'], [520, 'stance']] },
    victory: { loop: 1200, keys: [[0, 'victory'], [600, 'victoryB'], [1200, 'victory']] },
  };

  // ---- 角色标定 ----
  var RIG_CHARS = {
    me: {
      dir: 'assets/rig/me/',
      // box=[x,y,w,h] 为部件在 700x1004 源画布的裁切框；pivot 为关节点在裁切图内坐标；
      // axisDeg = 部件绘制时该段的指向角；len = 段长（源画布像素）
      meta: {
        head: { box: [157, 11, 355, 341], pivot: [281, 289] },
        torso: { box: [143, 236, 254, 380], pivot: [187, 284] },
        armNearUpper: { box: [248, 222, 214, 110], pivot: [10, 54], axisDeg: 4.4, len: 182.5 },
        armNearFore: { box: [424, 221, 239, 107], pivot: [18, 67], axisDeg: -4.3, len: 213.6 },
        legNearThigh: { box: [286, 530, 190, 162], pivot: [46, 40], axisDeg: 38.42, len: 148.1 },
        legNearShin: { box: [405, 640, 184, 347], pivot: [45, 24], axisDeg: 76.94, len: 185.8 },
        legFarThigh: { box: [192, 562, 140, 186], pivot: [95, 38], axisDeg: 120.32, len: 136.7 },
        legFarShin: { box: [362, 702, 245, 237], pivot: [38, 28], axisDeg: 37.48, len: 151.2 },
      },
    },
    // ---- G2 扩围（2026-11-10）：8 名重点角色装配表。head/torso＝本人定稿图原像素切件＋程序补绘；
    // 其余 6 件结构件＝主角母版（assets/rig_master/）按本人配色选择性换色。管线 assets/rig_expand_src/work/build_parts.py，
    // 逐人标定与身份自审记录见 CHARACTER_RIG.md 第八节。origin.head＝正面立绘颈点覆写（模板骨架/姿势/动作未动）。
    opp_rookie: {"dir": "assets/rig/opp_rookie/", "origin": {"head": [330, 270]}, "meta": {"head": {"box": [0, 0, 338, 308], "pivot": [163.8, 256.2]}, "torso": {"box": [0, 0, 325, 464], "pivot": [157.5, 235]}, "armNearUpper": {"box": [248, 222, 214, 110], "pivot": [10, 54], "axisDeg": 4.4, "len": 182.5}, "armNearFore": {"box": [424, 221, 239, 107], "pivot": [18, 67], "axisDeg": -4.3, "len": 213.6}, "legNearThigh": {"box": [286, 530, 190, 162], "pivot": [46, 40], "axisDeg": 38.42, "len": 148.1}, "legNearShin": {"box": [405, 640, 184, 347], "pivot": [45, 24], "axisDeg": 76.94, "len": 185.8}, "legFarThigh": {"box": [192, 562, 140, 186], "pivot": [95, 38], "axisDeg": 120.32, "len": 136.7}, "legFarShin": {"box": [362, 702, 245, 237], "pivot": [38, 28], "axisDeg": 37.48, "len": 151.2}}},
    // opp_counter（沈墨凛）G2 返工延后：长发帘＋百褶裙＋远腿在 guard/hit 围出封闭背景袋（空洞率 3.86%/3.38%），
    // 躯干底层法无法消除（部件间拓扑），保持静态立绘回退；部件与 meta 保留在 assets/rig/opp_counter/ 待后续处理。
    opp_world_champion: {"dir": "assets/rig/opp_world_champion/", "origin": {"head": [330, 270]}, "meta": {"head": {"box": [0, 0, 180, 290], "pivot": [85, 262]}, "torso": {"box": [0, 0, 465, 390], "pivot": [227, 257]}, "armNearUpper": {"box": [248, 222, 214, 110], "pivot": [10, 54], "axisDeg": 4.4, "len": 182.5}, "armNearFore": {"box": [424, 221, 239, 107], "pivot": [18, 67], "axisDeg": -4.3, "len": 213.6}, "legNearThigh": {"box": [286, 530, 190, 162], "pivot": [46, 40], "axisDeg": 38.42, "len": 148.1}, "legNearShin": {"box": [405, 640, 184, 347], "pivot": [45, 24], "axisDeg": 76.94, "len": 185.8}, "legFarThigh": {"box": [192, 562, 140, 186], "pivot": [95, 38], "axisDeg": 120.32, "len": 136.7}, "legFarShin": {"box": [362, 702, 245, 237], "pivot": [38, 28], "axisDeg": 37.48, "len": 151.2}}},
    opp_champion_domestic: {"dir": "assets/rig/opp_champion_domestic/", "origin": {"head": [330, 270]}, "meta": {"head": {"box": [0, 0, 329, 357], "pivot": [152.3, 327.9]}, "torso": {"box": [0, 0, 660, 358], "pivot": [330.5, 249.7]}, "armNearUpper": {"box": [248, 222, 214, 110], "pivot": [10, 54], "axisDeg": 4.4, "len": 182.5}, "armNearFore": {"box": [424, 221, 239, 107], "pivot": [18, 67], "axisDeg": -4.3, "len": 213.6}, "legNearThigh": {"box": [286, 530, 190, 162], "pivot": [46, 40], "axisDeg": 38.42, "len": 148.1}, "legNearShin": {"box": [405, 640, 184, 347], "pivot": [45, 24], "axisDeg": 76.94, "len": 185.8}, "legFarThigh": {"box": [192, 562, 140, 186], "pivot": [95, 38], "axisDeg": 120.32, "len": 136.7}, "legFarShin": {"box": [362, 702, 245, 237], "pivot": [38, 28], "axisDeg": 37.48, "len": 151.2}}},
    opp_brick: {"dir": "assets/rig/opp_brick/", "origin": {"head": [344, 270]}, "meta": {"head": {"box": [0, 0, 252, 262], "pivot": [125.9, 235.3]}, "torso": {"box": [0, 0, 318, 406], "pivot": [154.8, 240.7]}, "armNearUpper": {"box": [248, 222, 214, 110], "pivot": [10, 54], "axisDeg": 4.4, "len": 182.5}, "armNearFore": {"box": [424, 221, 239, 107], "pivot": [18, 67], "axisDeg": -4.3, "len": 213.6}, "legNearThigh": {"box": [286, 530, 190, 162], "pivot": [46, 40], "axisDeg": 38.42, "len": 148.1}, "legNearShin": {"box": [405, 640, 184, 347], "pivot": [45, 24], "axisDeg": 76.94, "len": 185.8}, "legFarThigh": {"box": [192, 562, 140, 186], "pivot": [95, 38], "axisDeg": 120.32, "len": 136.7}, "legFarShin": {"box": [362, 702, 245, 237], "pivot": [38, 28], "axisDeg": 37.48, "len": 151.2}}},
    opp_pocket: {"dir": "assets/rig/opp_pocket/", "origin": {"head": [330, 270]}, "meta": {"head": {"box": [0, 0, 334, 300], "pivot": [168.2, 265.5]}, "torso": {"box": [0, 0, 320, 429], "pivot": [135, 242.3]}, "armNearUpper": {"box": [248, 222, 214, 110], "pivot": [10, 54], "axisDeg": 4.4, "len": 182.5}, "armNearFore": {"box": [424, 221, 239, 107], "pivot": [18, 67], "axisDeg": -4.3, "len": 213.6}, "legNearThigh": {"box": [286, 530, 190, 162], "pivot": [46, 40], "axisDeg": 38.42, "len": 148.1}, "legNearShin": {"box": [405, 640, 184, 347], "pivot": [45, 24], "axisDeg": 76.94, "len": 185.8}, "legFarThigh": {"box": [192, 562, 140, 186], "pivot": [95, 38], "axisDeg": 120.32, "len": 136.7}, "legFarShin": {"box": [362, 702, 245, 237], "pivot": [38, 28], "axisDeg": 37.48, "len": 151.2}}},
    opp_shy: {"dir": "assets/rig/opp_shy/", "origin": {"head": [330, 270]}, "meta": {"head": {"box": [0, 0, 350, 317], "pivot": [170.5, 271]}, "torso": {"box": [0, 0, 314, 484], "pivot": [157.8, 239.7]}, "armNearUpper": {"box": [248, 222, 214, 110], "pivot": [10, 54], "axisDeg": 4.4, "len": 182.5}, "armNearFore": {"box": [424, 221, 239, 107], "pivot": [18, 67], "axisDeg": -4.3, "len": 213.6}, "legNearThigh": {"box": [286, 530, 190, 162], "pivot": [46, 40], "axisDeg": 38.42, "len": 148.1}, "legNearShin": {"box": [405, 640, 184, 347], "pivot": [45, 24], "axisDeg": 76.94, "len": 185.8}, "legFarThigh": {"box": [192, 562, 140, 186], "pivot": [95, 38], "axisDeg": 120.32, "len": 136.7}, "legFarShin": {"box": [362, 702, 245, 237], "pivot": [38, 28], "axisDeg": 37.48, "len": 151.2}}},
    opp_braid: {"dir": "assets/rig/opp_braid/", "origin": {"head": [334, 270]}, "meta": {"head": {"box": [0, 0, 262, 280], "pivot": [132.3, 228.5]}, "torso": {"box": [0, 0, 230, 289], "pivot": [102.3, 250]}, "armNearUpper": {"box": [248, 222, 214, 110], "pivot": [10, 54], "axisDeg": 4.4, "len": 182.5}, "armNearFore": {"box": [424, 221, 239, 107], "pivot": [18, 67], "axisDeg": -4.3, "len": 213.6}, "legNearThigh": {"box": [286, 530, 190, 162], "pivot": [46, 40], "axisDeg": 38.42, "len": 148.1}, "legNearShin": {"box": [405, 640, 184, 347], "pivot": [45, 24], "axisDeg": 76.94, "len": 185.8}, "legFarThigh": {"box": [192, 562, 140, 186], "pivot": [95, 38], "axisDeg": 120.32, "len": 136.7}, "legFarShin": {"box": [362, 702, 245, 237], "pivot": [38, 28], "axisDeg": 37.48, "len": 151.2}}},
  };

  function createRig(stageEl, opts) {
    opts = opts || {};
    var chr = RIG_CHARS[opts.char || 'me'];
    if (!chr || !stageEl) return null;
    var partsMeta = chr.meta;
    var reduced = !!opts.reducedMotion;
    var timeScale = opts.timeScale || function () { return 1; }; // 0=冻结(顿帧) 0.35=慢动作 1=正常

    var ORDER = [], PARENT = {}, PART = {}, PIVOT = {}, AXIS = {}, DARK = {};
    RIG_TEMPLATE.bones.forEach(function (d) {
      ORDER.push(d[0]);
      PARENT[d[0]] = d[1]; PART[d[0]] = d[2];
      // G2 装配表：单角色标定可覆写骨骼原点（体型差吸收，如正面立绘的颈点居中）；无覆写时用模板原点（主角行为不变）
      PIVOT[d[0]] = (chr.origin && chr.origin[d[0]]) || d[3];
      DARK[d[0]] = d[4];
      var m = partsMeta[d[2]];
      AXIS[d[0]] = (m && typeof m.axisDeg === 'number') ? m.axisDeg : null;
    });
    var POSES = RIG_TEMPLATE.poses, ANIMS = RIG_TEMPLATE.anims;

    function poseToLocals(pose) {
      var world = {};
      ORDER.forEach(function (n) { world[n] = (AXIS[n] === null) ? pose[n] : pose[n] - AXIS[n]; });
      var locals = { root: pose.root };
      var acc = { root: pose.root.r };
      ORDER.forEach(function (n) {
        locals[n] = world[n] - acc[PARENT[n]];
        acc[n] = acc[PARENT[n]] + locals[n];
      });
      return locals;
    }
    var POSE_LOCALS = {};
    Object.keys(POSES).forEach(function (k) { POSE_LOCALS[k] = poseToLocals(POSES[k]); });

    function sampleKeys(keys, t, dur, loop) {
      if (loop) t = t % dur; else t = Math.min(t, dur);
      var i = 1;
      while (i < keys.length - 1 && t > keys[i][0]) i++;
      var t1 = keys[i - 1][0], t2 = keys[i][0];
      var a = POSE_LOCALS[keys[i - 1][1]], b = POSE_LOCALS[keys[i][1]];
      var k = t2 > t1 ? (t - t1) / (t2 - t1) : 0;
      k = k * k * (3 - 2 * k);
      var out = { root: {
        x: a.root.x + (b.root.x - a.root.x) * k,
        y: a.root.y + (b.root.y - a.root.y) * k,
        r: a.root.r + (b.root.r - a.root.r) * k } };
      ORDER.forEach(function (n) { out[n] = a[n] + (b[n] - a[n]) * k; });
      return out;
    }

    var root = document.createElement('div');
    root.className = 'rig-root';
    root.style.cssText = 'position:absolute;inset:0;transform-origin:50% 98.6%;pointer-events:none;';
    stageEl.appendChild(root);
    var els = { root: root };
    function build(name) {
      var pv = PIVOT[name];
      var d = document.createElement('div');
      d.className = 'rig-bone';
      d.style.cssText = 'position:absolute;inset:0;pointer-events:none;transform-origin:' + (pv[0] / 7) + '% ' + (pv[1] / 10.04) + '%;';
      var meta = partsMeta[PART[name]];
      var img = document.createElement('img');
      img.src = chr.dir + PART[name] + '.webp';
      img.alt = ''; img.draggable = false;
      img.style.cssText = 'position:absolute;left:' + ((pv[0] - meta.pivot[0]) / 7) + '%;top:' + ((pv[1] - meta.pivot[1]) / 10.04) + '%;width:' + (meta.box[2] / 7) + '%;height:' + (meta.box[3] / 10.04) + '%;max-width:none;';
      if (DARK[name]) img.style.filter = 'brightness(0.8) saturate(0.92)';
      d.appendChild(img);
      els[PARENT[name]].appendChild(d);
      els[name] = d;
    }
    var built = { root: true }, guardN = 0;
    while (Object.keys(built).length < ORDER.length + 1 && guardN++ < 30) {
      ORDER.forEach(function (n) { if (!built[n] && built[PARENT[n]]) { build(n); built[n] = true; } });
    }

    var state = { stance: 'guard', anim: ANIMS.guard, keys: ANIMS.guard.keys, t0: 0 };
    var clock = 0, lastNow = performance.now(), raf = 0;
    var tickEvery = Math.max(1, opts.tickEvery || 1), tickN = 0; // G2：隔帧采样（时钟照常累计、动作时间轴不变，只降姿势写入频率；对手纸偶用 2）

    function apply(locals) {
      root.style.transform = 'translate(' + (locals.root.x / 7) + '%,' + (locals.root.y / 10.04) + '%) rotate(' + locals.root.r + 'deg)';
      ORDER.forEach(function (n) { els[n].style.transform = 'rotate(' + locals[n] + 'deg)'; });
    }
    function resolveKeys(a) {
      return a.keys.map(function (k) { return [k[0], k[1] === 'stance' ? state.stance : k[1]]; });
    }
    function play(name) {
      var a = ANIMS[name]; if (!a) return;
      if (name === 'guard' || name === 'block' || name === 'victory') {
        state.stance = name; state.anim = a; state.keys = a.keys;
      } else {
        state.anim = a; state.keys = resolveKeys(a);
      }
      state.t0 = clock;
      if (reduced) apply(sampleKeys(state.keys, a.loop ? 0 : (a.dur || 0), a.loop || a.dur, !!a.loop));
    }
    function tick(now) {
      var dt = now - lastNow; lastNow = now;
      var sc = timeScale();
      if (sc > 0) clock += dt * sc;
      tickN++;
      if (tickN % tickEvery === 0) {
        var a = state.anim, dur = a.loop || a.dur || 0, elapsed = clock - state.t0;
        apply(sampleKeys(state.keys, elapsed, dur, !!a.loop));
        if (!a.loop && !a.hold && elapsed > dur) play(state.stance);
      }
      raf = requestAnimationFrame(tick);
    }
    if (!reduced) raf = requestAnimationFrame(tick);
    else apply(sampleKeys(state.keys, 0, 2600, true));

    return {
      play: play,
      toStance: function (name) { play(name); },
      // 校准/验收用：停循环并定格在某动作时刻
      freeze: function (animName, atMs) {
        cancelAnimationFrame(raf);
        var a = ANIMS[animName]; if (!a) return;
        var keys = a.keys.map(function (k) { return [k[0], k[1] === 'stance' ? 'guard' : k[1]]; });
        apply(sampleKeys(keys, atMs || 0, a.loop || a.dur || 0, !!a.loop));
      },
      els: els,
      stop: function () { cancelAnimationFrame(raf); },
      destroy: function () { cancelAnimationFrame(raf); if (root.parentNode) root.parentNode.removeChild(root); },
    };
  }

  global.RigEngine = { createRig: createRig, TEMPLATE: RIG_TEMPLATE, CHARS: RIG_CHARS };
})(typeof window !== 'undefined' ? window : this);
