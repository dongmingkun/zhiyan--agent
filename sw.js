/**
 * 秩研 Agent · PWA Service Worker v=20260908b
 * ─────────────────────────────────────────
 * 策略（v=20260903q）：
 *  - index.html / 导航请求：network-first —— 先取网络最新页面壳，成功则更新缓存，失败才回退缓存，
 *    确保用户永远拿到最新页面（根治旧 shell 按钮未绑事件的缓存问题）。
 *  - 静态资源（js/css 带 ?v= 戳）：cache-first —— 命中缓存直接用，未命中再走网络并回填缓存；
 *    版本戳变更后 URL 变化 → 自动取新文件，不污染旧缓存。
 *  - API / 上传 / 跨域请求：永不缓存，直接走网络。
 */
const CACHE_NAME = 'zhiyan-agent-v20260911-clean4';
const PRECACHE_URLS = ['./', 'manifest.json', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];

// 解析 ?v= 版本戳为可比较的序号（如 20260911-clean3 → [20260911, 3]）；无版本戳返回 null
function versionRank(search) {
  const v = String(search || '').replace(/^\?/, '').replace(/^v=/, '');
  const m = v.match(/^(\d+)(?:-clean(\d+))?/);
  if (!m) return null;
  return [parseInt(m[1], 10) || 0, m[2] ? parseInt(m[2], 10) : 0];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zhiyan-agent-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      // v=20260909k 增量修复:旧版本缓存了 app.v3.19.js (无 renderLatexInElement 调用),
      // 导致用户即使 reload 后仍命中旧 cache 条目无法升级。激活时主动清理旧主应用脚本
      // (app.v3.19.js 及拆分后的 js/app-*.js) 的所有 ?v=* 旧缓存,确保下次 fetch 走网络拿新版。
      .then(async () => {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        // (1) 历史遗留：旧主应用脚本（无版本戳/旧戳）一律清掉，保证下次 fetch 走网络拿新版
        const stale = new Set(keys.filter((r) => r.url.includes('/js/app.v3.19.js') || /\/js\/app-\d+.*\.js/.test(r.url)));
        // (2) 通用规则：凡同路径但 search（版本戳）不同的缓存条目，只保留版本戳最新的一条，其余旧条目删除
        const byPath = new Map();
        keys.forEach((r) => {
          const u = new URL(r.url);
          const list = byPath.get(u.pathname) || [];
          list.push({ req: r, rank: versionRank(u.search) });
          byPath.set(u.pathname, list);
        });
        byPath.forEach((list) => {
          if (list.length < 2) return;
          const ranked = list.filter((x) => x.rank);
          if (ranked.length === 0) return;   // 都没有版本戳：无法判断新旧，保持原样
          ranked.sort((a, b) => (b.rank[0] - a.rank[0]) || (b.rank[1] - a.rank[1]));
          const keep = ranked[0].req;
          list.forEach((x) => { if (x.req !== keep) stale.add(x.req); });
        });
        return Promise.all([...stale].map((r) => cache.delete(r)));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 仅缓存同源 GET；API / 上传 / 静态 PDF 走网络
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') !== -1) return;
  if (url.pathname.indexOf('/uploads/') !== -1) return;

  const isNav = req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';

  if (isNav) {
    // network-first：导航请求（页面壳）先走网络，失败回退缓存
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // cache-first：静态资源（js/css 带 ?v= 戳）先查缓存，未命中再走网络并回填
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
