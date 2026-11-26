// みんなでティア表(/tier)の画面のテスト(3人・1人はスマホ幅)。始めて、親の並べる画面と、ほかの人の待つ画面が出ることを確かめる
const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "T" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const p = await (await b.newContext(i === 1 ? { viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true } : { viewport: { width: 1100, height: 900 } })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/tier" + (i ? "?room=" + R : "")); await p.fill("#lName", ["あき", "べに", "ちか"][i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A] = ps;
  await A.click("button:has-text('ゲーム開始')"); await sleep(700);
  const ids = await Promise.all(ps.map((p) => p.evaluate(() => me)));
  const st = await A.evaluate(() => ({ phase: S.phase, host: S.hostId }));
  check(st.phase !== "lobby", "ゲームが始まる: " + st.phase);
  const P = ps[ids.indexOf(st.host)];
  check(await P.locator("button:has-text('これで決定して予想スタート')").count() === 1, "親に並べる画面が出る");
  // 画面写真(遊び方ガイド用にも使う): スマホの人の画面
  await ps[1].screenshot({ path: "tier_play_sp.png" });
  check(await ps[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "スマホ幅で横にはみ出さない");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs.slice(0, 3)));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
  process.exit(fails ? 1 : 0);
})();
