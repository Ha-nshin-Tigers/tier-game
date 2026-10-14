const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "Z" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const ps = [];
  for (let i = 0; i < 6; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 664 } : { width: 900, height: 800 }, isMobile: mob, hasTouch: mob })).newPage();
    await p.goto("http://localhost:3123/party" + (i ? "?room=" + R : "")); await p.fill("#lName", "P" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A, B] = ps;
  await sleep(500);
  for (let k = 0; k < 3; k++) { await A.click("button[aria-label='1試合目を外す']").catch(() => {}); await sleep(120); }
  await A.click("button:has-text('+ 🃏 ウソつき酒場')"); await sleep(150);
  for (let k = 0; k < 3; k++) { await A.click("button[aria-label='1試合目を外す']").catch(() => {}); await sleep(120); }
  console.log("playlist:", (await A.locator(".playlist li .nm").allTextContents()).join(" → "));
  await A.click("button:has-text('スタート')"); await sleep(8000);
  const m = await B.evaluate(() => ({ b: document.getElementById("main").getBoundingClientRect().bottom, ih: innerHeight }));
  console.log("6人・スマホ:", Math.round(m.b), "/", m.ih, m.b <= m.ih ? "1画面に収まる" : "はみ出し");
  await B.screenshot({ path: "x9_liar_6p_sp.png" });
  await browser.close();
})();
