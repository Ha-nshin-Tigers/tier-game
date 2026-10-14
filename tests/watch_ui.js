const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const mk = async (mob) => { const ctx = await b.newContext(mob ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : {}); await ctx.addInitScript(() => { for (const k of ["citychase", "mortar"]) localStorage.setItem("tier:guide:seen:" + k, "1"); }); return ctx.newPage(); };
  const R = "W" + Math.random().toString(36).slice(2, 5).toUpperCase(), errs = [];
  const A = await mk(), B = await mk(), C = await mk(true);
  for (const p of [A, B, C]) p.on("pageerror", (e) => errs.push(e.message));
  for (const [p, n] of [[A, "あき"], [B, "べに"]]) { await p.goto(`http://localhost:3123/citychase?room=${R}`); await p.fill("#lName", n); await p.fill("#lRoom", R); await p.click("#lJoin"); await sleep(400); }
  await A.click("button:has-text('スタート')"); await sleep(500);
  await C.goto(`http://localhost:3123/citychase?room=${R}`); await C.fill("#lName", "ちか"); await C.fill("#lRoom", R); await C.click("#lJoin"); await sleep(2200);
  check(await C.locator(".pb-watch:has-text('観戦中')").isVisible() && (await C.locator(".pb-watch").textContent()).includes("2人"), "途中で入った人に「観戦中」のお知らせ");
  check(await A.locator(".pb-watch").count() === 0, "遊んでいる人には出ない");
  await C.screenshot({ path: require("path").join(__dirname, ".shots") + "/" + "watch_sp.png" });
  // ゲームが終わって待機画面に戻ると消える(ホストが「待機画面に戻す」)
  await A.locator("button:has-text('待機画面に戻す')").click(); await A.locator("button:has-text('もう一度押すと実行')").click(); await sleep(2200);
  check(await C.locator(".pb-watch").count() === 0, "待機画面に戻るとお知らせが消える");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
