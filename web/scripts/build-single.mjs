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
const jsParts = ['js/data.js', 'js/story.js', 'js/game.js'].map(read);

// 安全前提：内联内容里不能出现提前闭合标签（源文件本来就是单文件内联版，已验证不存在）
for (const [name, content, tag] of [['css/main.css', css, '</style'], ['js files', jsParts.join('\n'), '</script']]) {
  if (content.includes(tag)) throw new Error(`${name} 中出现 ${tag}，无法安全内联打包`);
}

const CSS_LINK = '    <link rel="stylesheet" href="css/main.css" />';
const SCRIPT_TAGS = [
  '    <script src="js/data.js"></script>',
  '    <script src="js/story.js"></script>',
  '    <script src="js/game.js"></script>',
].join('\n');
if (!shell.includes(CSS_LINK)) throw new Error('index.html 中找不到 css 引用行，壳文件结构已变化');
if (!shell.includes(SCRIPT_TAGS)) throw new Error('index.html 中找不到三行 script 引用，壳文件结构已变化');

const out = shell
  .replace(CSS_LINK, '    <style>\n' + css + '    </style>')
  .replace(SCRIPT_TAGS, '    <script>\n' + jsParts.map((s) => s.replace(/\n$/, '')).join('\n') + '\n    </script>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), out);
fs.cpSync(path.join(root, 'assets'), path.join(root, 'dist/assets'), { recursive: true });

console.log('dist/index.html 已生成：', out.length, '字节');
console.log('dist/assets 已复制（与工程 assets/ 相同）');
