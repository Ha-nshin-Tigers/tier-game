const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "F" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 2; i++) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:3123/eldorado" + (i ? "?room=" + R : "")); await p.fill("#lName", "p" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A] = ps; await sleep(300);
  await A.click("button:has-text('スタート')"); await sleep(600);
  const cur = await A.evaluate(() => S.game.cur), p = (await A.evaluate(() => me)) === cur ? A : ps[1];
  check(await p.evaluate(() => S.game.P[me].pieces.length === 2), "2人: 1人2コマ");
  check(await p.locator("button:has-text('コマ2')").count() === 1, "動かすコマを選ぶボタン");
  const can1 = await p.evaluate(() => [...document.querySelectorAll("polygon.can")].map((e) => e.parentNode.dataset.k).join());
  await p.click("button:has-text('コマ2')"); await sleep(200);
  const can2 = await p.evaluate(() => [...document.querySelectorAll("polygon.can")].map((e) => e.parentNode.dataset.k).join());
  check(can1 && can2 && can1 !== can2, "コマを切り替えると進めるマスも変わる");
  // スクロール位置を保つ
  const set = await p.evaluate(() => { const w = document.querySelector(".mapwrap"); w.scrollTop = 37; w.scrollLeft = 121; w.dispatchEvent(new Event("scroll")); return [w.scrollTop, w.scrollLeft]; });
  await p.locator(".handbox .cards .ecard").first().click(); await sleep(200);
  const pos = await p.evaluate(() => { const w = document.querySelector(".mapwrap"); return [w.scrollTop, w.scrollLeft]; });
  check(pos[0] === set[0] && pos[1] === set[1] && set[1] > 0, "描き直してもマップの見ている場所を保つ " + pos);
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
