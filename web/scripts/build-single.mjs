// 打包：把工程版（index.html 壳 + css/main.css + js/*.js）打包为 dist/ 发布目录。
// G8 标题路径拆分：核心 JS（data/story/audio/story-engine/tools/ui/game）仍内联进
// dist/index.html；战斗模块 js/rig.js + js/battle.js（约 200KB）改外置为 dist/lazy/*.js，
// 由内联 shim 在 DOMContentLoaded 后启动后台预热（不与标题关键路径抢带宽），
// SW 运行时缓存接住后离线语义与批次 E 一致（已加载过的内容离线可用）。
// 核心代码对战斗入口的调用全部发生在用户操作时（点击/渲染回调），shim 为这些入口
// 预置存根：模块未就绪时先等加载再转调真实函数，加载失败给 toast 提示并可重试——
// 不改任何玩法/数值/存档口径。工程版（多文件 script 标签）行为不变。
// 另复制 assets/ 到 dist/assets/，使 dist/ 成为可直接发布的自包含目录。
// 用法：node scripts/build-single.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const shell = read('index.html');
const css = read('css/main.css');
const CORE_JS = ['js/data.js', 'js/story.js', 'js/audio.js', 'js/story-engine.js', 'js/tools.js', 'js/ui.js', 'js/game.js'];
const LAZY_JS = ['js/rig.js', 'js/battle.js']; // 相对顺序不可变：battle 依赖 rig 的 RIG_TEMPLATE/RIG_CHARS
const jsParts = CORE_JS.map(read);
const lazyParts = LAZY_JS.map((p) => ({ path: p, name: path.basename(p), content: read(p) }));

// 安全前提：内联内容里不能出现提前闭合标签（源文件本来就是单文件内联版，已验证不存在）
for (const [name, content, tag] of [['css/main.css', css, '</style'], ['core js files', jsParts.join('\n'), '</script']]) {
  if (content.includes(tag)) throw new Error(`${name} 中出现 ${tag}，无法安全内联打包`);
}

// G8 懒加载 shim：置于核心脚本块之前。自身不得含闭合 script 字面量。
const SHIM = `    <script>
/* G8 标题路径拆分 shim：战斗模块（lazy/rig.js + lazy/battle.js）外置懒加载。
   本脚本在核心脚本之前执行：为核心代码会调用的战斗入口预置存根——模块未就绪时
   点击先等加载再转调，加载失败提示重试；battle.js 加载后其顶层声明自动覆盖存根，
   行为与单文件版一致。预热在 DOMContentLoaded 后启动，不与标题关键路径抢带宽。 */
(function () {
  var LAZY = ['lazy/rig.js', 'lazy/battle.js'];
  var state = { p: null, ready: false };
  function loadOne(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('lazy load failed: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensure() {
    if (state.ready) return Promise.resolve();
    if (!state.p) {
      state.p = LAZY.reduce(function (p, src) { return p.then(function () { return loadOne(src); }); }, Promise.resolve())
        .then(function () { state.ready = true; })
        .catch(function (e) { state.p = null; throw e; });
    }
    return state.p;
  }
  window.__ensureBattle = ensure;
  function failToast() { if (typeof toast === 'function') toast('战斗模块加载失败，请联网后重试'); }
  function mkStub(name) {
    var stub = function () {
      var args = arguments, self = this;
      ensure().then(function () {
        var f = window[name];
        if (f && !f.__lazyStub) f.apply(self, args); else failToast();
      }).catch(failToast);
    };
    stub.__lazyStub = true;
    window[name] = stub;
  }
  /* 存根集须覆盖核心代码在 boot 绑定阶段「直接传引用」的全部战斗入口：
     game.js 的 addEventListener('click', useCombo/useWall/useClinch/endBreak/cancelKeysModal)
     在求值时即读取标识符，无存根则 boot 直接抛错中断——不只是点击入口。 */
  ['startPractice', 'startSpar', 'openModeModal', 'openBattleReady', 'prepKeysModal', 'cancelKeysModal',
   'useCombo', 'useWall', 'useClinch', 'endBreak'].forEach(mkStub);
  /* battle.js 的顶层 var 预置同义初值：核心代码在若干回调里裸读 B/pendingFoe 等，
     未加载时裸读未声明标识符会抛 ReferenceError；battle.js 执行时其 var 初始化照常覆盖。 */
  window.B = null; window.battleTimer = null; window.pendingFoe = null;
  window.nextBattlePractice = false; window.nextBattleSpar = false; window.readyMode = 'manual';
  /* 同步渲染数据源 sparTargets（约战列表）：未就绪先返回空列表，就绪后若约战窗开着则自动重渲染 */
  var sparStub = function () {
    ensure().then(function () {
      var m = document.getElementById('sparModal');
      if (m && m.classList.contains('open') && typeof renderSparList === 'function') renderSparList();
    }).catch(function () {});
    return [];
  };
  sparStub.__lazyStub = true;
  window.sparTargets = sparStub;
  /* 纯函数 foeAlphaSrc：与 battle.js 内定义逐字同义，先行提供（加载后被其定义覆盖，行为一致） */
  window.foeAlphaSrc = function (src) { return src ? src.replace('assets/opponents/', 'assets/opponents_alpha/') : src; };
  /* 预热时机：DOMContentLoaded 之后——此时主文档已完整下载、标题已在核心脚本 boot 时渲染，
     预热不再与标题关键路径抢带宽（G8 实测：解析期预热会把省下的体积又吃回去）；
     首次指针按下也触发一次（用户即将操作时优先备好）。失败静默，真实入口会重试并提示。 */
  function warm() { ensure().catch(function () {}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', warm); else warm();
  window.addEventListener('pointerdown', warm, { once: true });
})();
    </script>
`;

const CSS_LINK = '    <link rel="stylesheet" href="css/main.css" />';
const SCRIPT_TAGS = [
  '    <script src="js/data.js"></script>',
  '    <script src="js/story.js"></script>',
  '    <script src="js/audio.js"></script>',
  '    <script src="js/story-engine.js"></script>',
  '    <script src="js/tools.js"></script>',
  '    <script src="js/ui.js"></script>',
  '    <script src="js/rig.js"></script>',
  '    <script src="js/battle.js"></script>',
  '    <script src="js/game.js"></script>',
].join('\n');
if (!shell.includes(CSS_LINK)) throw new Error('index.html 中找不到 css 引用行，壳文件结构已变化');
if (!shell.includes(SCRIPT_TAGS)) throw new Error('index.html 中找不到 script 引用行组，壳文件结构已变化');

const out = shell
  .replace(CSS_LINK, '    <style>\n' + css + '    </style>')
  .replace(SCRIPT_TAGS, SHIM + '    <script>\n' + jsParts.map((s) => s.replace(/\n$/, '')).join('\n') + '\n    </script>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), out);
// G8：战斗模块外置文件（原样复制，内容与工程版逐字一致）
fs.rmSync(path.join(root, 'dist/lazy'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'dist/lazy'), { recursive: true });
for (const part of lazyParts) fs.writeFileSync(path.join(root, 'dist/lazy', part.name), part.content);
// 发布包瘦身：assets/portrait/ 的 PNG 原件只留工程内，dist 只带同名 webp（引用已全部指向 .webp）；
// assets/equipment/ 是已弃用的旧写实装备图（data.js GEAR_IMG_SRC 已全量改指 equipment_pool，
// 全工程零引用，2026-11-04 批次 E 核实）——整目录不进 dist（省 1.6MB），原件留工程内备查；
// assets/fonts2/fonts.css 是分片 @font-face 的生成中间物（已内联进 index.html），不进 dist。
fs.rmSync(path.join(root, 'dist/assets'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'assets'), path.join(root, 'dist/assets'), {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(path.join(root, 'assets'), src);
    if (rel.startsWith('equipment' + path.sep)) return false;
    if (rel === 'fonts2' + path.sep + 'fonts.css') return false;
    const webpOnlyDir = rel.startsWith('portrait' + path.sep);
    return !(webpOnlyDir && rel.endsWith('.png'));
  },
});

// PWA：manifest 与 Service Worker 复制到 dist 根目录（图标在 assets/icons/，随 assets 一并复制）
for (const f of ['manifest.webmanifest', 'sw.js']) {
  fs.copyFileSync(path.join(root, f), path.join(root, 'dist', f));
}

// 体积口径（G0 修正）：out.length 是 UTF-16 字符数，含大量中文时显著小于实际字节数
// （曾印 612,929 而实际文件 743,380 字节）；统一按 UTF-8 字节统计，与磁盘文件一致。
const outBytes = Buffer.byteLength(out, 'utf8');
const lazyBytes = lazyParts.reduce((sum, p) => sum + Buffer.byteLength(p.content, 'utf8'), 0);
console.log('dist/index.html 已生成：', outBytes, '字节（标题初始路径，G8 拆分后）');
console.log('dist/lazy 已生成：', lazyParts.map((p) => p.name).join(' + '), '共', lazyBytes, '字节（标题后预热加载，不计入初始路径）');
if (outBytes > 500 * 1024) console.warn('⚠ dist/index.html 超过 500KB 警戒线（当前 ' + outBytes + ' 字节）——只警告、不中断构建；拆分评估见 plan/02_METHODS.md G8。');
console.log('dist PWA 文件已复制：manifest.webmanifest、sw.js');
console.log('dist/assets 已复制（portrait/ 仅含 webp；equipment/ 旧图与 fonts2/fonts.css 不进发布包）');
