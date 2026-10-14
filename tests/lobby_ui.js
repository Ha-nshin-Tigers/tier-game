const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errs = [], ps = [];
  const mkp = async (i) => {
    const p = await (await b.newContext(i === 1 ? { viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 900 } })).newPage();
    p.on("pageerror", (e) => errs.push(i + ": " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(i + " console: " + m.text()); });
    return p;
  };
  // ホーム → パーティーを作る
  const A = await mkp(0);
  await A.goto("http://localhost:3123/");
  check(await A.locator("a.partylink").count() === 1, "ホームに「パーティーを作る」");
  await A.click("a.partylink"); await A.waitForURL(/\/lobby/);
  await A.fill("#jName", "あき"); await A.click("#jCreate"); await sleep(600);
  const code = await A.evaluate(() => Party.state && Party.state.code);
  check(code && code.length === 4 && await A.locator(".big").textContent() === code, "パーティーを作るとコードと招待リンク " + code);
  check(await A.locator(".games button").count() >= 19, "ホストにはゲーム一覧(" + await A.locator(".games button").count() + ")");
  // B・C が招待リンクで入る
  for (const [i, nm] of [[1, "べに"], [2, "ちか"]]) {
    const p = await mkp(i); await p.goto(`http://localhost:3123/lobby?code=${code}`); await p.fill("#jName", nm); await p.click("#jJoin"); await sleep(500); ps.push(p);
  }
  const [B, C] = ps;
  await sleep(300);
  check(await A.locator(".members li").count() === 3 && await B.locator("p.muted:has-text('ホストの あき さんが')").count() === 1, "3人そろう・ホスト以外は待つ表示");
  await A.screenshot({ path: SHOT + "lobby_pc.png", fullPage: true });
  await B.screenshot({ path: SHOT + "lobby_sp.png", fullPage: true });
  // ホストがモーターメイヘムを選ぶ → 全員が同じ部屋へ
  await A.locator(".games button:has-text('モーターメイヘム')").click();
  for (const p of [A, B, C]) await p.waitForURL(/\/mortar/, { timeout: 8000 });
  for (let i = 0; i < 40; i++) { const ok = await Promise.all([A, B, C].map((p) => p.evaluate(() => typeof S !== "undefined" && S && S.players && S.players.length === 3).catch(() => false))); if (ok.every(Boolean)) break; await sleep(250); }
  const rooms = await Promise.all([A, B, C].map((p) => p.evaluate(() => (typeof S !== "undefined" && S) ? S.code + ":" + S.players.length : null)));
  check(rooms.every((r) => r === code + "MT:3"), "全員が自動でモーターメイヘムの同じ部屋に入った " + rooms.join(","));
  check(await B.locator(".partybar .pb-pill").count() === 1, "ゲームの画面の下にパーティーのバー");
  check(await A.evaluate(() => S.gameHostId === me), "パーティーのホストがゲームの部屋でもホスト");
  // ゲーム中にホストが次を選ぶ → 途中の人には「終わったら移動」
  await A.click("button:has-text('スタート')"); await sleep(800);
  await A.click(".partybar .pb-pill"); await sleep(200);
  check(await A.locator(".partybar button[data-game]").count() >= 19, "ホストはバーから次のゲームを選べる");
  await B.screenshot({ path: SHOT + "lobby_bar_sp.png" });
  await A.locator(".partybar button[data-game='matchy']").click(); await sleep(800);
  check(await B.locator(".partybar .pb-note:has-text('マッチィマッチ')").count() === 1 && (await B.url()).includes("/mortar"), "遊んでいる途中の人は移動を待つ(お知らせ表示)");
  await B.screenshot({ path: SHOT + "lobby_pending_sp.png" });
  await B.click(".partybar button[data-act='gonow']");
  await B.waitForURL(/\/matchy/, { timeout: 8000 });
  check(true, "「今すぐ移動」で移動できる");
  await A.click(".partybar button[data-act='gonow']"); await A.waitForURL(/\/matchy/, { timeout: 8000 });
  // C はゲームが終わる(何もしないので吹き飛ぶ)と自動で移動
  await C.waitForURL(/\/matchy/, { timeout: 60000 });
  check(true, "ゲームが終わったら自動で移動");
  for (let i = 0; i < 40; i++) { const ok = await Promise.all([A, B, C].map((p) => p.evaluate(() => typeof S !== "undefined" && S && S.players && S.players.length === 3).catch(() => false))); if (ok.every(Boolean)) break; await sleep(250); }
  const r2 = await Promise.all([A, B, C].map((p) => p.evaluate(() => (typeof S !== "undefined" && S) ? S.code + ":" + S.players.length : null)));
  check(r2.every((r) => r === code + "MM:3"), "マッチィマッチの同じ部屋にそろった " + r2.join(","));
  // パーティーの画面に戻る(ホスト)
  await A.click(".partybar .pb-pill"); await sleep(200); await A.click(".partybar button[data-act='lobbyall']");
  for (const p of [A, B, C]) await p.waitForURL(/\/lobby/, { timeout: 8000 });
  check(true, "ホストの「みんなでパーティーの画面へ」で全員戻る");
  await sleep(500);
  check(await A.locator(".members li").count() === 3, "パーティーはそのまま");
  // 抜ける
  await C.locator("button:has-text('パーティーを抜ける')").click(); await C.locator("button:has-text('もう一度押すと抜けます')").click(); await sleep(500);
  check(await A.locator(".members li").count() === 2 && await C.locator("#joinBox").isVisible(), "抜けるとメンバーから消える");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
