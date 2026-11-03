// 打包：把工程版（index.html 壳 + css/main.css + js/*.js）合并回单文件 dist/index.html，
// 并复制 assets/ 到 dist/assets/，使 dist/ 成为可直接发布回 artifact 的自包含目录。
// 用法：node scripts/build-single.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const shell = read('index.html');
const css = read('css/main.css');
const jsParts = ['js/data.js', 'js/story.js', 'js/audio.js', 'js/story-engine.js', 'js/tools.js', 'js/ui.js', 'js/rig.js', 'js/battle.js', 'js/game.js'].map(read);

// 安全前提：内联内容里不能出现提前闭合标签（源文件本来就是单文件内联版，已验证不存在）
for (const [name, content, tag] of [['css/main.css', css, '</style'], ['js files', jsParts.join('\n'), '</script']]) {
  if (content.includes(tag)) throw new Error(`${name} 中出现 ${tag}，无法安全内联打包`);
}

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
  .replace(SCRIPT_TAGS, '    <script>\n' + jsParts.map((s) => s.replace(/\n$/, '')).join('\n') + '\n    </script>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), out);
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

console.log('dist/index.html 已生成：', out.length, '字节');
console.log('dist PWA 文件已复制：manifest.webmanifest、sw.js');
console.log('dist/assets 已复制（portrait/ 仅含 webp；equipment/ 旧图与 fonts2/fonts.css 不进发布包）');
