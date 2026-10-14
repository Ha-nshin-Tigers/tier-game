const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "Q" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 664 } : { width: 1000, height: 820 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:3123/party" + (i ? "?room=" + R : "")); await p.fill("#lName", "P" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A, B] = ps; await sleep(400);
  await A.click("button:has-text('+ 🔫 散弾ルーレット')"); await sleep(150);
  for (let k = 0; k < 3; k++) { await A.click("button[aria-label='1試合目を外す']"); await sleep(120); }
  console.log("playlist:", (await A.locator(".playlist li .nm").allTextContents()).join(" → "));
  await A.click("button:has-text('スタート')"); await sleep(7500);
  let first = true;
  for (let k = 0; k < 300; k++) {
    if (await A.locator("text=の結果").count()) break;
    let acted = false;
    for (const p of ps) {
      if (!(await p.locator("text=あなたの番。").count())) continue;
      if (first) { const m = await B.evaluate(() => ({ b: document.getElementById("main").getBoundingClientRect().bottom, ih: innerHeight })); console.log("スマホ:", Math.round(m.b), "/", m.ih, m.b <= m.ih ? "1画面に収まる" : "はみ出し"); await p.screenshot({ path: "q1_party_sg_turn.png" }); first = false; }
      const ib = p.locator(".ibtn:not([disabled])");
      if (await ib.count() && k % 3 === 0) { const t = await ib.first().getAttribute("title"); if (!/選んだ相手|奪って/.test(t)) { await ib.first().click(); acted = true; break; } }
      const shots = p.locator("button:has-text('を撃つ')");
      await shots.nth((await shots.count()) - 1).click(); acted = true; break;
    }
    await sleep(acted ? 2600 : 600);
  }
  console.log("結果:", await A.locator(".say").first().textContent());
  await B.screenshot({ path: "q2_party_sg_result.png" });
  console.log("errors", errs);
  await browser.close();
})();
