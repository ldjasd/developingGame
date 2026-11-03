// 批次 E（m1）：把 Noto Sans SC 四个整包子集 woff2 切成 unicode-range 分片。
// 分片口径（每字重一份）：
//   -a 核心首片：index.html 静态文本全部字符 ∪ 语料高频汉字（按全工程语料词频取前 N）∪ 语料内 ASCII/标点符号。
//      不带 unicode-range——该字重一旦被用就下它，标题屏只付这一片。
//   -b 语料余片：游戏全部文案语料中出现、但不在首片的字符（带 unicode-range，进游戏后按需下载）。
//   -x1/-x2 扩展片：现行子集里有、语料里没有的字（GB2312 一级余字，主要给玩家自填名字用），
//      按码位中点对半分（带 unicode-range，渲染到罕见字才下载）。
// 产物：assets/fonts2/ 下的 woff2 + fonts.css（@font-face 块，粘进 index.html 的 <style> 首部）。
// 接入方式（实测口径）：不用 unicode-range——Chrome 按「range 与已渲染文本相交」决定下载，
// 范围稍有重叠就会把所有片全拉下来；改用字体族回退链：-a 属 "Noto Sans SC"，-b 属 "Noto Sans SC B"，
// -x1/-x2 属 "Noto Sans SC X"，css 字体栈按 A→B→X 排列，浏览器只在某字于前一族缺字形时才下载后一片。
// 用法：node scripts/make-font-shards.mjs [--top 750] [--css-only]
// 依赖：python3 + fontTools（pyftsubset）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOP = parseInt((process.argv.includes('--top') ? process.argv[process.argv.indexOf('--top') + 1] : '750'), 10);
const SRC_DIR = path.join(root, 'scripts/font-src'); // 整包子集源文件（RC 毛边④产物）存放在此，不进 dist
const OUT_DIR = path.join(root, 'assets/fonts2');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- 语料：工程全部文本（index.html + css + js）----
const corpusFiles = ['index.html', 'css/main.css', ...fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
let corpus = '';
for (const f of corpusFiles) corpus += fs.readFileSync(path.join(root, f), 'utf8');
const shellText = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const freq = new Map();
for (const ch of corpus) freq.set(ch, (freq.get(ch) || 0) + 1);
const isCJK = (cp) => (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF);
const corpusCJK = [...freq.keys()].filter((c) => isCJK(c.codePointAt(0))).sort((a, b) => freq.get(b) - freq.get(a));
const topCJK = new Set(corpusCJK.slice(0, TOP));
const shellChars = new Set([...shellText].filter((c) => c.codePointAt(0) > 0x1F));
const coreA = new Set();
for (const c of shellChars) coreA.add(c);
for (const c of topCJK) coreA.add(c);
for (const c of freq.keys()) { const cp = c.codePointAt(0); if (cp < 0x3000 && cp > 0x1F) coreA.add(c); } // ASCII/拉丁/标点全进首片
const coreB = new Set([...freq.keys()].filter((c) => c.codePointAt(0) > 0x1F && !coreA.has(c)));
console.log(`语料汉字 ${corpusCJK.length} · 首片字符 ${coreA.size}（含汉字 ${[...coreA].filter((c) => isCJK(c.codePointAt(0))).length}）· 语料余片 ${coreB.size}`);

// ---- 用 fontTools 读现行子集 cmap、切分、生成 ----
const py = `
import sys, json
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
src, job = sys.argv[1], json.load(open(sys.argv[2]))
f = TTFont(src)
cmap = set(f.getBestCmap().keys())
coreA = set(job['coreA']); coreB = set(job['coreB'])
ext = sorted(c for c in cmap if c not in coreA and c not in coreB)
half = len(ext)//2
shards = {'a': sorted(coreA & cmap), 'b': sorted(coreB & cmap), 'x1': ext[:half], 'x2': ext[half:]}
out = {}
for tag, cps in shards.items():
    if not cps: continue
    g = TTFont(src)
    opt = Options(flavor='woff2', layout_features='*', name_IDs='*', notdef_outline=True)
    ss = Subsetter(options=opt)
    ss.populate(unicodes=cps)
    ss.subset(g)
    p = job['out'].replace('{tag}', tag)
    g.save(p)
    out[tag] = cps
json.dump(out, open(job['meta'], 'w'))
print(json.dumps({k: len(v) for k, v in out.items()}))
`;
fs.writeFileSync('/tmp/fontshard.py', py);
const hexes = (set) => [...set].map((c) => c.codePointAt(0));
const weights = [400, 500, 700, 900];
const cssOnly = process.argv.includes('--css-only');
const FAMILY = { a: 'Noto Sans SC', b: 'Noto Sans SC B', x1: 'Noto Sans SC X', x2: 'Noto Sans SC X' };
let css = '';
for (const w of weights) {
  const src = path.join(SRC_DIR, `noto-sans-sc-${w}.woff2`);
  let tags = ['a', 'b', 'x1', 'x2'];
  if (!cssOnly) {
    const job = { coreA: hexes(coreA), coreB: hexes(coreB), out: path.join(OUT_DIR, `noto-${w}-{tag}.woff2`), meta: `/tmp/fontmeta-${w}.json` };
    fs.writeFileSync(`/tmp/fontjob-${w}.json`, JSON.stringify(job));
    const res = execFileSync('python3', ['/tmp/fontshard.py', src, `/tmp/fontjob-${w}.json`], { encoding: 'utf8' });
    const meta = JSON.parse(fs.readFileSync(job.meta, 'utf8'));
    console.log(`字重 ${w}:`, res.trim());
    tags = tags.filter((t) => meta[t]);
  }
  for (const tag of tags) {
    css += `      @font-face { font-family: "${FAMILY[tag]}"; font-style: normal; font-weight: ${w}; font-display: swap; src: url("assets/fonts2/noto-${w}-${tag}.woff2") format("woff2"); }\n`;
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'fonts.css'), css);
console.log('CSS 字节:', css.length);
// 同步注入串到 js/tools.js（FONT_FACE_CSS 标记之间）：@font-face 由标题显示后注入，不写进 index.html
const toolsPath = path.join(root, 'js/tools.js');
let tools = fs.readFileSync(toolsPath, 'utf8');
const begin = '/* FONT_FACE_CSS:BEGIN */', end = '/* FONT_FACE_CSS:END */';
const bi = tools.indexOf(begin), ei = tools.indexOf(end);
if (bi < 0 || ei < 0 || ei < bi) { console.error('tools.js 中未找到 FONT_FACE_CSS 标记，跳过同步'); }
else {
  const flat = css.split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  tools = tools.slice(0, bi + begin.length) + `\n    var FONT_FACE_CSS = ${JSON.stringify(flat)};\n    ` + tools.slice(ei);
  fs.writeFileSync(toolsPath, tools);
  console.log('已同步 FONT_FACE_CSS 到 js/tools.js');
}
for (const f of fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.woff2')).sort()) {
  console.log(f, (fs.statSync(path.join(OUT_DIR, f)).size / 1024).toFixed(0) + 'KB');
}
