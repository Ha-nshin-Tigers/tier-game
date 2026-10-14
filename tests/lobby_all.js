const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
const GAMES = require("../games/lobby.js").GAMES;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  // パーティーを作っておく
  await p.goto("http://localhost:3123/lobby"); await p.fill("#jName", "テスト"); await p.click("#jCreate"); await sleep(600);
  const code = await p.evaluate(() => Party.state.code);
  for (const g of GAMES) {
    console.log("->", g.key); await p.goto(`http://localhost:3123/${g.key}?room=${code}${g.suffix}&party=1`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch((e) => console.log("goto", e.message.slice(0, 80)));
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) { await sleep(250); ok = await p.evaluate(() => { const l = document.getElementById("login"); return !!l && l.hidden; }); }
    const room = await p.evaluate(() => (typeof S !== "undefined" && S) ? S.code : null);
    const barOk = await p.locator(".partybar .pb-pill").count() === 1;
    check(ok && room === code + g.suffix && barOk, `${g.name}(/${g.key}): 自動で入室 ${room}・バーあり`);
  }
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
