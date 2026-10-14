const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "H" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [];
  const ps = [];
  for (const n of ["あ", "い"]) { const p = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:3123/monopoly?room=" + R); await p.fill("#lName", n); await p.click("#lJoin"); await sleep(300); ps.push(p); }
  const [A, B] = ps;
  await A.click("button:has-text('スタート')"); await sleep(500);
  // 画面だけのテスト: 家の競売の状態を作って描く(サーバには送らない)
  const sent = await A.evaluate(() => {
    const g = S.game, other = g.order.find((x) => x !== me);
    Object.assign(g, { step: "auction", houses: 3, mySpots: [6, 8], auction: { kind: "house", sq: 1, bid: 60, by: other, spots: { [other]: 1 }, endsAt: Date.now() + 9000 } });
    window.__sent = []; const os = ws.send.bind(ws); ws.send = (x) => { window.__sent.push(JSON.parse(x)); };
    render(); return true;
  });
  await sleep(200);
  const txt = await A.locator("#act").textContent();
  check(/家1軒の競売/.test(txt) && /残り3軒/.test(txt), "家の競売の表示");
  check(await A.locator("#act select option").count() === 2, "建てる土地を選べる");
  await A.click("#act button:has-text('+10')");
  const m = await A.evaluate(() => window.__sent.pop());
  check(m.a === "bid" && m.amount === 70 && m.sq === 6, "入札に建てる土地が付く: " + JSON.stringify(m));
  await A.screenshot({ path: "m9_house_auction.png" });
  // 現金以上の入札(本家どおり)の案内
  await A.evaluate(() => { const g = S.game; Object.assign(g, { auction: { kind: "land", sq: 39, bid: 0, by: null, endsAt: Date.now() + 9000 }, myLimit: g.P[me].cash + 300 }); render(); });
  check(/足りない分は落札後に売却・抵当で払う/.test(await A.locator("#act").textContent()), "現金を超えて入札できる案内");
  const t = await A.evaluate(() => document.getElementById("game").innerText);
  check(!/\bnull\b|undefined|NaN/.test(t), "null/undefined/NaN が出ていない");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
