const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }).catch(() => chromium.launch());
  const errs = [];
  const mk = async (w, hgt) => { const ctx = await browser.newContext({ viewport: { width: w, height: hgt } }); const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && !/fonts/.test(m.text()) && errs.push(m.text())); return p; };
  const A = await mk(1100, 900), B = await mk(390, 844);
  await A.goto("http://localhost:3123/number"); await A.fill("#lName", "あきら"); await A.fill("#lRoom", "UITEST"); await A.click("#lJoin");
  await B.goto("http://localhost:3123/number?room=UITEST"); await B.fill("#lName", "べに"); await B.click("#lJoin");
  await sleep(500);
  await A.screenshot({ path: "1_lobby_pc.png", fullPage: true });
  await A.click("text=ゲーム開始"); await sleep(400);
  await B.screenshot({ path: "2_hint_sp.png", fullPage: true });
  await A.fill("#hintInput", "おばけ屋敷"); await A.click("text=確定");
  await B.fill("#hintInput", "夜中のトイレに行くこと(長めのヒントの例)"); await B.press("#hintInput", "Enter");
  await sleep(500);
  await B.screenshot({ path: "3_arrange_sp.png", fullPage: true });
  await A.click(".lineup li:nth-child(2) button:has-text('↑')"); await sleep(300);
  await A.screenshot({ path: "4_arrange_pc.png", fullPage: true });
  await A.click("text=この並びでOK"); await B.click("text=この並びでOK");
  await sleep(2500);
  await A.screenshot({ path: "5_reveal_pc.png", fullPage: true });
  await B.screenshot({ path: "6_reveal_sp.png", fullPage: true });
  // ティア表の入室画面にリンクがあるか
  const T = await mk(390, 844); await T.goto("http://localhost:3123/"); await T.screenshot({ path: "7_tier_login_sp.png" });
  const sw = await B.evaluate(() => document.documentElement.scrollWidth);
  console.log("SP scrollWidth", sw, "errors:", errs);
  await browser.close();
})();
