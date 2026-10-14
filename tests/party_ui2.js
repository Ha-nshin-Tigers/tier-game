const { chromium } = require("playwright-core");
const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
const rnd = (n) => [...Array(n)].map(() => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ids = [0, 1].map(() => ({ pid: rnd(16), token: rnd(32) })), errs = [], ps = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await b.newContext(i ? { viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 900 } });
    await ctx.addInitScript((id) => localStorage.setItem("tier:ident", JSON.stringify(id)), ids[i]);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); ps.push(p);
  }
  const [A, B] = ps;
  await A.goto("http://localhost:3123/lobby"); await A.fill("#jName", "あき"); await A.click("#jCreate"); await sleep(600);
  const code = await A.evaluate(() => Party.state.code);
  await B.goto("http://localhost:3123/lobby?code=" + code); await B.fill("#jName", "べに"); await B.click("#jJoin"); await sleep(600);
  check(await A.locator("button:has-text('ホストを渡す')").count() === 1 && await B.locator("button:has-text('ホストを渡す')").count() === 0, "ホストにだけ「ホストを渡す」");
  // 2人でモーターメイヘム(ブラウザと同じ人として ws で遊ぶ): あき勝ち
  const room = code + "MT";
  const cl = ids.map((x, i) => { const ws = new WebSocket("ws://localhost:3123/mortar/ws"); const c = { ws, st: null }; ws.on("message", (m) => { m = JSON.parse(m); if (m.t === "state") c.st = m; }); c.ready = new Promise((r) => ws.on("open", () => { ws.send(JSON.stringify({ t: "join", room, name: ["あき", "べに"][i], ...x })); r(); })); return c; });
  for (const c of cl) { await c.ready; await sleep(200); }
  cl[0].ws.send(JSON.stringify({ t: "start" }));
  let seq; for (let i = 0; i < 60 && !seq; i++) { await sleep(100); const g = cl[0].st.room.game; if (g && g.step === "show") seq = g.seq; }
  for (let i = 0; i < 100; i++) { await sleep(100); if (cl[0].st.room.game.step === "act") break; }
  for (const d of seq) { const b0 = cl[0].st.room.game.beat; cl[0].ws.send(JSON.stringify({ t: "game", a: "move", d })); for (let i = 0; i < 60; i++) { await sleep(100); const g = cl[0].st.room.game; if (!g || g.beat > b0 || g.step !== "act") break; } }
  for (let i = 0; i < 80; i++) { await sleep(100); if (cl[0].st.room.phase === "finished") break; }
  await sleep(500);
  check(await A.locator("h2:has-text('通算成績')").count() === 1 && (await A.locator(".rank tr").first().textContent()).includes("あき"), "パーティーの画面に通算成績(あき1位)");
  await A.screenshot({ path: SHOT + "party_scores_pc.png", fullPage: true });
  // 投票
  await A.click("button:has-text('みんなで投票')"); await sleep(300);
  check(await B.locator("p:has-text('遊びたいゲームに投票')").count() === 1, "投票モードに切り替わる(全員に)");
  await B.locator(".games button:has-text('コヨーテ')").click(); await sleep(300);
  check(await A.locator(".games button:has-text('コヨーテ') .vc").textContent() === "1票", "投票数が見える");
  await B.screenshot({ path: SHOT + "party_vote_sp.png", fullPage: true });
  await A.locator(".games button:has-text('コヨーテ')").click();
  await A.waitForURL(/\/coyote/, { timeout: 8000 }); await B.waitForURL(/\/coyote/, { timeout: 8000 });
  check(true, "全員が投票 → コヨーテへ移動");
  await sleep(2500);
  await B.click(".partybar .pb-pill"); await sleep(200);
  check((await B.locator(".partybar .pb-panel").textContent()).includes("通算成績: 1位 あき 3点"), "バーにも通算成績");
  // ホストを渡す(パーティーの画面で)
  await A.goto("http://localhost:3123/lobby"); await sleep(800);
  await A.click("button:has-text('ホストを渡す')"); await sleep(400);
  check(await B.evaluate(() => Party.isHost()) && !(await A.evaluate(() => Party.isHost())), "ホストをべにに渡した");
  for (const c of cl) c.ws.close();
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close(); process.exit(0);
})();
