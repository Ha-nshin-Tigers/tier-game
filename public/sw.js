// ホーム画面に追加(PWA)のためのサービスワーカー。キャッシュはしない(いつも最新の画面を取りにいく)。
// 画面の読み込みをそのままネットワークへ流すだけ。つながらないときは短いお知らせを出す。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>みんなのあそびば</title><body style="font-family:sans-serif;padding:24px;line-height:1.7"><h1 style="font-size:20px">インターネットにつながっていません</h1><p>電波のよいところで、もう一度開いてください。</p><button onclick="location.reload()" style="font-size:16px;padding:8px 16px">もう一度読み込む</button></body>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
