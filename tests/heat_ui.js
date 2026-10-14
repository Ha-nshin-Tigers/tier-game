const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
require("fs").mkdirSync(SHOT, { recursive: true });
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "H" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const vp = i === 0 ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true };
    const p = await (await b.newContext(vp)).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/heat" + (i ? "?room=" + R : "")); await p.fill("#lName", "p" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A] = ps; await sleep(400);
  check(await A.title() === "ヒート（Heat: Pedal to the Metal風）", "題名");
  const opts = await A.locator("select >> nth=0").locator("option").allTextContents();
  check(opts.length === 8 && opts.join().includes("USA(69マス・2周)") && opts.join().includes("【Tunnel Vision】España(109マス・1周)"), "8コースを選べる " + opts.join("/"));
  await A.selectOption("select >> nth=0", "gb"); await sleep(250);
  await A.selectOption("select >> nth=2", "1"); await sleep(250);
  check(await ps[1].evaluate(() => S.settings.track === "gb" && S.settings.laps === 1), "設定が全員に反映");
  await A.selectOption("select >> nth=0", "usa"); await sleep(250);
  await A.click("button:has-text('スタート')"); await sleep(700);
  check(await A.evaluate(() => S.game.track.cells.length === 69 && S.game.laps === 1), "USA・1周で開始");
  check(await A.locator("svg.track .car").count() === 3, "車3台を表示");
  check(await A.locator(".gearbtn").count() === 4 && await A.locator(".dash .hc").count() === 7, "ギア4つ・手札7枚");
  await A.screenshot({ path: SHOT + "heat_pc_plan.png", fullPage: false });
  // 全員: 2速に上げて2枚
  for (const p of ps) {
    await p.click(".gearbtn >> nth=1"); await sleep(150);
    const n = await p.locator(".dash button.hc").count();
    let picked = 0;
    for (let k = 0; k < n && picked < 2; k++) { await p.locator(".dash button.hc").nth(k).click(); picked++; await sleep(80); }
    await p.click("button:has-text('決定')"); await sleep(250);
  }
  await sleep(500);
  check(await A.evaluate(() => S.game.step === "move"), "全員決定 → 走行");
  await ps[1].screenshot({ path: SHOT + "heat_mobile_move.png", fullPage: true });
  // 走る人がリアクト → 捨て札
  for (let k = 0; k < 12; k++) {
    const t = await A.evaluate(() => S.game.turn && { pid: S.game.turn.pid, phase: S.game.turn.phase });
    if (!t) break;
    const p = ps[(await Promise.all(ps.map((x) => x.evaluate(() => me)))).indexOf(t.pid)];
    if (t.phase === "react") { if (k === 0) { check(await p.locator("button:has-text('ブースト')").count() === 1 && await p.locator("button:has-text('クールダウン')").count() === 1, "リアクトのボタン(ブースト・クールダウン)"); } await p.click("button:has-text('次へ')"); }
    else if (t.phase === "slip") await p.click("button:has-text('しない')");
    else if (t.phase === "discard") await p.click("button:has-text('ターン終了')");
    await sleep(300);
  }
  check(await A.evaluate(() => S.game.step === "plan" && S.game.round === 2), "全員走り終わったら次のラウンド");
  check(await A.evaluate(() => Object.values(S.game.P).every((p) => p.pos >= 0)), "全員がスタートラインを越えた");
  // 拡大
  await ps[1].click("button:has-text('×2.6')"); await sleep(300);
  const sw = await ps[1].evaluate(() => { const w = document.querySelector(".mapwrap"); return [w.scrollWidth, w.clientWidth, w.scrollLeft]; });
  check(sw[0] > sw[1] * 2, "拡大で盤が大きくなる " + sw);
  await ps[1].screenshot({ path: SHOT + "heat_mobile_zoom.png" });
  const txt = await A.evaluate(() => document.body.innerText);
  const where = await A.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/\bnull\b/.test(n.nodeValue)) out.push(n.parentElement.outerHTML.slice(0, 200)); return out; }); console.log(where);
  const bad = (txt.match(/.{0,40}(undefined|null|NaN).{0,40}/g) || []); check(!bad.length, "undefined などが出ていない " + JSON.stringify(bad));
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
