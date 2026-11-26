// 大会(ドタバタ大会)で、ダンダンティアー(じぶんのティアー)とオリフラムを続けて遊ぶ(3人・1人はスマホ幅)
const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "N" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 760 } : { width: 1100, height: 900 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/party" + (i ? "?room=" + R : "")); await p.fill("#lName", "P" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A] = ps; await sleep(400);
  check(await A.locator("button:has-text('ダンダンティアー')").count() >= 1 && await A.locator("button:has-text('オリフラム')").count() >= 1, "大会の一覧に2本がある");
  await A.click("button:has-text('+ 🏆 ダンダンティアー')"); await sleep(150);
  await A.click("button:has-text('+ 👑 オリフラム')"); await sleep(150);
  for (let k = 0; k < 3; k++) { await A.click("button[aria-label='1試合目を外す']"); await sleep(120); }
  const pl = (await A.locator(".playlist li .nm").allTextContents()).join(" → ");
  check(/ダンダンティアー.*オリフラム/.test(pl), "並び: " + pl);
  await A.click("button:has-text('スタート')"); await sleep(7500);
  const ids = await Promise.all(ps.map((p) => p.evaluate(() => me)));
  const pageOf = (id) => ps[ids.indexOf(id)];
  // ---- ダンダンティアー(じぶんのティアー): 画面で作って、画面で当てる ----
  check(await A.evaluate(() => S.game?.key === "dantier" && S.game.mode === "mine"), "1試合目: ダンダンティアー(じぶんのティアー)");
  for (let k = 0; k < 3; k++) {
    const mk = await A.evaluate(() => S.game.cur.maker), M = pageOf(mk);
    for (const [t, r] of [["カレー", "S"], ["うどん", "B"], ["パセリ", "D"]]) { await M.fill("#addIn", t + k); await M.locator(`.dtui .trow[data-rank="${r}"]`).click(); await sleep(200); }
    if (k === 0) check(await M.locator(".dtui .tier .item").count() === 3, "入力中でも置いた言葉がすぐ表に出る");
    await M.click("button:has-text('この表で出題')"); await sleep(400);
    for (const P of ps.filter((p) => p !== M)) {
      const n = await P.locator(".dtui .gitem").count();
      for (let i = 0; i < n; i++) await P.locator(".dtui .gitem").nth(i).locator("button").nth(1).click();
      await sleep(150); await P.click("button:has-text('これで回答')"); await sleep(250);
    }
    await sleep(300);
    if (k === 0) await ps[1].screenshot({ path: "pn_dt_reveal_sp.png", fullPage: true });
    if (await A.evaluate(() => S.game?.step) === "reveal") { await A.click("button:has-text('次へ')"); await sleep(400); }
  }
  await sleep(500);
  check(await A.locator("text=ダンダンティアー の結果").count() === 1, "ダンダンティアーの結果(順位点)");
  // ---- オリフラム: 次の試合へ ----
  await A.click("button:has-text('次の試合へ')").catch(() => {}); await sleep(8000);
  check(await A.evaluate(() => S.game?.key === "oriflamme" && S.game.step === "place"), "2試合目: オリフラム");
  // 1手は画面で置く
  const placer = await A.evaluate(() => S.game.placer), Pp = pageOf(placer);
  await Pp.locator(".ori .hand .card").first().click(); await sleep(150); await Pp.click("button:has-text('左端に置く')"); await sleep(300);
  check(await A.evaluate(() => S.game.queue.length === 1), "大会の画面でもカードを置ける");
  await ps[1].screenshot({ path: "pn_ori_sp.png", fullPage: true });
  for (let k = 0; k < 400; k++) {
    const st = await A.evaluate(() => S.phase === "play" && S.game?.key === "oriflamme" ? { step: S.game.step, placer: S.game.placer, pd: S.game.pending } : null);
    if (!st || st.step === "end") break;
    if (st.step === "place" && st.placer) await pageOf(st.placer).evaluate(() => send({ t: "mini", a: "place", card: S.game.hand[0].id, where: "R" }));
    else if (st.pd) {
      const p = pageOf(st.pd.by);
      if (st.pd.type === "reveal") await p.evaluate(() => send({ t: "mini", a: "decide", reveal: Math.random() < 0.6 }));
      else if (st.pd.type === "target") await p.evaluate(() => send({ t: "mini", a: "target", sid: S.game.pending.options[0] }));
      else await p.evaluate(() => send({ t: "mini", a: "target", pos: S.game.pending.positions[0] }));
    }
    await sleep(60);
  }
  await sleep(800);
  check(await A.locator("text=オリフラム の結果").count() === 1, "オリフラムの結果(影響力と順位点)");
  check(await ps[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "スマホ幅で横にはみ出さない");
  const txt = (await Promise.all(ps.map((p) => p.evaluate(() => document.body.innerText)))).join("\n");
  const bad = txt.match(/.{0,30}(undefined|NaN|\[object).{0,30}/g) || []; check(!bad.length, "undefined などが出ていない " + JSON.stringify(bad));
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs.slice(0, 3)));
  console.log(fails ? `NG ${fails}件` : "全項目OK");
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
