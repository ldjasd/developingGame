// 心跳在左，拳头在右 · Service Worker（PWA 离线缓存）
// 策略：
// - 页面导航（index.html）：网络优先——联网时永远拿最新版，断网才回退缓存（避免版本更新后看不到新内容）；
// - 其余同源 GET 静态资源：缓存优先 + 运行时缓存（首次访问写入，之后离线可玩）；
// - 只拦截同源 GET，其余请求（跨域字体等）一律放行、不缓存。
// 更新机制：发布新版时把 SW_VERSION +1；新 SW 安装后 skipWaiting 立即接管，
// activate 时删除所有旧版本缓存并 claim 已打开的页面。缓存名带版本号，天然隔离。
const SW_VERSION = 'boxing-pwa-v16'; // 重创积累曲线修复：traumaGain 改为「净伤害占防守方当前 HP 比例 × 70 × 拳种权重」小数累积（旧拳种固定值与伤害脱钩、重创 KO 全挤 R1 两病消除，A/B 定型见 web/tests/TRAUMA_CURVE.md；用户硬数字未动）；商店商品卡改实底卡面＋图框加深（css/main.css）；含装备图二次元化、新手期重构与框架重构一至五期全部成果
const CACHE_NAME = SW_VERSION;

// 安装时预缓存核心文件（相对路径，itch 子目录 / 任意子路径托管都成立）
const CORE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求：网络优先，失败回退缓存（离线打开游戏走这里）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // 静态资源：缓存优先，未命中时联网取并写入运行时缓存
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
