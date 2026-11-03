// 心跳在左，拳头在右 · Service Worker（PWA 离线缓存）
// 策略：
// - 页面导航（index.html）：网络优先——联网时永远拿最新版，断网才回退缓存（避免版本更新后看不到新内容）；
// - 其余同源 GET 静态资源：缓存优先 + 运行时缓存（首次访问写入，之后离线可玩）；
// - 只拦截同源 GET，其余请求（跨域字体等）一律放行、不缓存。
// 更新机制：发布新版时把 SW_VERSION +1；新 SW 安装后 skipWaiting 立即接管，
// activate 时删除所有旧版本缓存并 claim 已打开的页面。缓存名带版本号，天然隔离。
const SW_VERSION = 'boxing-pwa-v20'; // v20：主角骨骼纸偶试点（js/rig.js + assets/rig/me/ 部件 8 件约 82KB；ME_RIG 开关可回退姿势帧） // KO 定型 CF＋F2（KO_AUDIT.md 实装记录，用户 2026-11-03 批准）：①删除单发 KO（单次净伤害 ≥ 当前 HP 30%）与 HP% 击倒带（25~30%）；②重创分母下限 max(当前HP, 40%×最大HP)，K=70/衰减 6/秒/拳种权重/格挡减半不变；③刻度击倒：重创跨 25/50/75 触发击倒读秒（本回合内同刻度不重复、跨回合重置），终结只剩重创满格 KO／HP 归零 KO／单回合 3 击倒 TKO／点数四条；④F2 伤害地板：防守减伤封顶 raw 的 70%；⑤模拟跳过按新引擎分布重标定（TTK 竞赛胜率＋minTTK 驱动 KO 率/终结回合）；⑥清理死战孤儿 handler 与规则文案同步新口径
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
