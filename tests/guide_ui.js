const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })).newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:3123/mortar"); await p.fill("#lName", "a"); await p.click("#lCreate"); await sleep(2200);
  check(await p.locator(".pb-sheet .pb-guide-step").count() === 1 && (await p.locator(".pb-sheet-url").textContent()).includes("1 / 4"), "はじめて部屋に入ると遊び方ガイド(1/4)");
  await p.screenshot({ path: SHOT + "guide_sp.png" });
  await p.click(".pb-sheet [data-g=next]"); await p.click(".pb-sheet [data-g=next]"); await p.click(".pb-sheet [data-g=next]");
  check((await p.locator(".pb-sheet-url").textContent()).includes("4 / 4") && await p.locator(".pb-sheet button:has-text('わかった！')").count() === 1, "次へで最後まで・最後は「わかった！」");
  await p.click(".pb-sheet button:has-text('わかった！')"); await sleep(200);
  check(await p.locator(".pb-sheet").count() === 0 && await p.locator(".pb-help").isVisible(), "閉じると右下に「？」");
  await p.click("button:has-text('スタート')"); await sleep(1500);
  await p.click(".pb-help"); await sleep(200);
  check(await p.locator(".pb-guide-step").count() === 1, "ゲーム中でも「？」で遊び方が見られる");
  await p.keyboard.press("Escape"); await p.click(".pb-sheet", { position: { x: 5, y: 5 } }); await sleep(200);
  // 2回目は自動では出ない
  await p.goto("http://localhost:3123/mortar"); await p.fill("#lName", "a"); await p.click("#lCreate"); await sleep(2200);
  check(await p.locator(".pb-sheet").count() === 0, "2回目からは自動で出ない");
  // 単独ミニゲーム
  await p.goto("http://localhost:3123/bridge"); await p.fill("#lName", "a"); await p.click("#lCreate"); await sleep(2200);
  check(await p.locator(".pb-guide-step").count() === 1, "ミニゲーム(ひとりじめ橋)にもガイド");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
