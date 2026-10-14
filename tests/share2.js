const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const mob of [false, true]) {
    const ctx = await b.newContext(mob ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" } : { viewport: { width: 1200, height: 900 } });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3123" });
    if (mob) await ctx.addInitScript(() => { navigator.share = () => Promise.resolve(); });
    // 外部サイトは開かずに URL だけ記録
    await ctx.route(/line\.me|twitter\.com|discord\.com/, (r) => r.fulfill({ status: 200, body: "ok" }));
    const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
    const tag = mob ? "スマホ" : "PC";
    await p.goto("http://localhost:3123/matchy"); await p.fill("#lName", "a"); await p.click("#lCreate"); await sleep(2000);
    check(await p.locator(".invite .pb-share").count() === 1, `${tag}: 招待リンクの横に「共有」ボタン`);
    const url = await p.locator(".invite input").inputValue();
    await p.click(".invite .pb-share"); await sleep(200);
    const labels = await p.locator(".pb-sheet-box button").allTextContents();
    check(labels.includes("LINE で送る") && labels.includes("Discord に送る") && labels.includes("リンクをコピー") && labels.includes("そのほか(端末の共有メニュー)") === mob, `${tag}: 送り先 ${labels.join("/")}`);
    if (!mob) await p.screenshot({ path: require("path").join(__dirname, ".shots") + "/" + "share_pc.png" });
    else await p.screenshot({ path: require("path").join(__dirname, ".shots") + "/" + "share_sp.png" });
    // LINE
    const [lp] = await Promise.all([ctx.waitForEvent("page"), p.click(".pb-sheet-box button:has-text('LINE')")]);
    const lu = lp.url(); await lp.close();
    check((mob ? lu.startsWith("https://line.me/R/share?text=") : lu.startsWith("https://social-plugins.line.me/lineit/share?url=")) && decodeURIComponent(lu).includes(url), `${tag}: LINE の送信画面を開く ${lu.slice(0, 60)}…`);
    check(await p.locator(".pb-sheet").count() === 0, `${tag}: 送ったら閉じる`);
    // Discord
    await p.click(".invite .pb-share"); await sleep(150);
    const [dp] = await Promise.all([ctx.waitForEvent("page"), p.click(".pb-sheet-box button:has-text('Discord')")]);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    check(dp.url().startsWith("https://discord.com/") && clip.includes(url) && await p.locator(".pb-sheet-msg:has-text('貼り付けて')").count() === 1, `${tag}: Discord はリンクをコピーして開く(貼り付けの案内)`);
    await dp.close();
    // コピー・閉じる
    await p.click(".pb-sheet-box button:has-text('リンクをコピー')"); await sleep(150);
    check(await p.evaluate(() => navigator.clipboard.readText()) === url, `${tag}: リンクをコピー`);
    await p.keyboard.press("Escape"); await sleep(100);
    check(await p.locator(".pb-sheet").count() === 0, `${tag}: Esc で閉じる`);
    check(errs.length === 0, `${tag}: ページエラーなし ` + JSON.stringify(errs));
    await ctx.close();
  }
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
