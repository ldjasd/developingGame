// 发布检查（G8/T12）：重打 itch 包后必跑，自动验发布 zip 与 dist/工程源码的一致性。
// 用法：node scripts/release-check.mjs [zip 路径] [--dist 目录]
//   默认 zip = <工程根>/../release/boxing-web-v0.9.0-itch.zip，dist = <工程根>/dist。
// 检查项（任一 FAIL 退出码 1）：
//   1. zip 根目录有 index.html（不许嵌套一层目录）；
//   2. index.html 的 src/href 引用全部为相对路径（无站点绝对路径、无外链 http(s)）；
//   3. 每个相对引用在 zip 内存在且文件名大小写逐字一致；
//   4. 包内 index.html 与 dist/index.html 字节一致；包内 sw.js 的 SW_VERSION 与
//      dist sw.js、工程源码 sw.js 三者一致（防打错包/漏升版本）；
//   5. 初始加载体积预算：包内 index.html ≤ INITIAL_BUDGET_BYTES；
//   6. manifest.webmanifest 在包内、可解析，name/display/start_url/icons 齐，
//      图标文件都在包内；
//   7. index.html 提及的 lazy/ 懒加载文件在包内齐全（G8 拆分兜底）。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const distArg = args.indexOf('--dist');
const distDir = distArg >= 0 ? path.resolve(args[distArg + 1]) : path.join(root, 'dist');
const zipPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--dist')
  ? path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--dist'))
  : path.resolve(root, '..', 'release', 'boxing-web-v0.9.0-itch.zip');

// 初始体积预算推导：弱网口径 Fast 3G 1.6Mbps ≈ 204.8KB/s，标题可交互 ≤5s 中
// 留给解析/执行/往返的开销约 1.5s，HTML 传输预算 ≈ 3.5s × 204.8KB/s ≈ 716KB，取整 700KB。
const INITIAL_BUDGET_BYTES = 700 * 1024;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? '=> ' + extra : ''); }
}

// ---- 极简 ZIP 读取（中央目录 + stored/deflate 解压，无外部依赖） ----
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('找不到 ZIP 中央目录（文件损坏或非 zip）');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('中央目录条目签名异常');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.set(name, { method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  function extract(name) {
    const e = entries.get(name);
    if (!e) return null;
    const lo = e.localOff;
    const lNameLen = buf.readUInt16LE(lo + 26);
    const lExtraLen = buf.readUInt16LE(lo + 28);
    const dataStart = lo + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + e.compSize);
    if (e.method === 0) return Buffer.from(raw);
    if (e.method === 8) return zlib.inflateRawSync(raw);
    throw new Error('不支持的 ZIP 压缩方法 ' + e.method + '（' + name + '）');
  }
  return { entries, extract };
}

console.log('发布检查：', zipPath);
console.log('对照 dist：', distDir);
if (!fs.existsSync(zipPath)) { console.log('  FAIL zip 文件不存在'); process.exit(1); }
const zip = readZip(zipPath);
const names = [...zip.entries.keys()].filter((n) => !n.endsWith('/'));
const nameSet = new Set(names);
const lowerMap = new Map(names.map((n) => [n.toLowerCase(), n]));

// 1. 根 index.html
ok('zip 根目录存在 index.html', nameSet.has('index.html'),
  '条目样例：' + names.slice(0, 5).join(', '));
const zipIndex = nameSet.has('index.html') ? zip.extract('index.html') : null;
const zipIndexText = zipIndex ? zipIndex.toString('utf8') : '';

// 2+3. 相对路径与大小写/存在性
const refs = new Set();
for (const m of zipIndexText.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) refs.add(m[1]);
const badAbs = [], missing = [], caseMismatch = [];
for (const ref of refs) {
  if (!ref || ref.startsWith('#') || ref.startsWith('data:') || ref.startsWith('mailto:')) continue;
  if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('/')) { badAbs.push(ref); continue; }
  const clean = ref.split(/[?#]/)[0].replace(/^\.\//, '');
  if (!clean || clean.endsWith('/')) continue; // JS 里的目录前缀拼接串（如 'assets/opponents/' + key）不是文件引用
  if (nameSet.has(clean)) continue;
  if (lowerMap.has(clean.toLowerCase())) caseMismatch.push(ref + ' → 包内为 ' + lowerMap.get(clean.toLowerCase()));
  else missing.push(ref);
}
ok('index.html 引用全部为相对路径', badAbs.length === 0, badAbs.join(', '));
ok('index.html 相对引用在包内全部存在', missing.length === 0, missing.slice(0, 8).join(', '));
ok('引用与包内文件名大小写逐字一致', caseMismatch.length === 0, caseMismatch.join(', '));

// 4. 与 dist / 源码一致性
const distIndexPath = path.join(distDir, 'index.html');
const distIndex = fs.existsSync(distIndexPath) ? fs.readFileSync(distIndexPath) : null;
ok('包内 index.html 与 dist/index.html 字节一致',
  !!zipIndex && !!distIndex && zipIndex.equals(distIndex),
  zipIndex && distIndex ? `包内 ${zipIndex.length} vs dist ${distIndex.length} 字节` : '缺文件');
const verOf = (text) => { const m = /SW_VERSION\s*=\s*'([^']+)'/.exec(text || ''); return m ? m[1] : null; };
const zipSw = nameSet.has('sw.js') ? zip.extract('sw.js').toString('utf8') : null;
const distSw = fs.existsSync(path.join(distDir, 'sw.js')) ? fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8') : null;
const srcSw = fs.existsSync(path.join(root, 'sw.js')) ? fs.readFileSync(path.join(root, 'sw.js'), 'utf8') : null;
ok('SW 版本三者一致（包内 = dist = 工程源码）',
  !!verOf(zipSw) && verOf(zipSw) === verOf(distSw) && verOf(distSw) === verOf(srcSw),
  `包内 ${verOf(zipSw)} / dist ${verOf(distSw)} / 源码 ${verOf(srcSw)}`);

// 5. 初始体积预算
ok(`初始加载体积：index.html ≤ ${INITIAL_BUDGET_BYTES} 字节`,
  !!zipIndex && zipIndex.length <= INITIAL_BUDGET_BYTES,
  zipIndex ? `实际 ${zipIndex.length} 字节` : '无 index');

// 6. manifest 与图标
let mf = null;
try { mf = nameSet.has('manifest.webmanifest') ? JSON.parse(zip.extract('manifest.webmanifest').toString('utf8')) : null; } catch { mf = null; }
ok('manifest.webmanifest 存在且可解析', !!mf);
ok('manifest 字段齐（name/display/start_url/icons）',
  !!mf && !!mf.name && !!mf.display && !!mf.start_url && Array.isArray(mf.icons) && mf.icons.length > 0);
const iconMissing = mf && Array.isArray(mf.icons)
  ? mf.icons.map((i) => (i.src || '').replace(/^\.\//, '')).filter((s) => s && !nameSet.has(s))
  : ['<manifest 不可用>'];
ok('manifest 引用的图标文件全部在包内', iconMissing.length === 0, iconMissing.join(', '));

// 7. lazy 文件齐全（index.html 的 shim 引用 lazy/*.js）
const lazyRefs = [...new Set([...zipIndexText.matchAll(/lazy\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0]))];
const lazyMissing = lazyRefs.filter((r) => !nameSet.has(r));
ok('lazy 懒加载文件在包内齐全（' + (lazyRefs.join(', ') || '无') + '）', lazyMissing.length === 0, lazyMissing.join(', '));

console.log(`\n发布检查结果：${pass} 通过 / ${fail} 失败（zip 条目 ${names.length} 个文件）`);
process.exit(fail ? 1 : 0);
