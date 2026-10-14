const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "G" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [], names = ["あき", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await b.newContext(mob ? { viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 950 } })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(names[i] + " console: " + m.text()); });
    await p.goto("http://localhost:3123/eldorado" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A] = ps; await sleep(300);
  const opts = await A.locator("select >> nth=0 >> option").allTextContents();
  check(opts.length === 18 && opts.filter((t) => t.includes("【黄金の神殿】")).length === 5, "コース18種(うち黄金の神殿5つ) " + opts.filter((t) => t.includes("黄金")).join("/"));
  await A.selectOption("select >> nth=0", "gt_first"); await sleep(250);
  check(await A.locator("h2:has-text('黄金の神殿')").count() === 1, "黄金の神殿の遊び方に切り替わる");
  await A.click("label:has-text('エルドのモジュール') input"); await sleep(200);
  await A.click("label:has-text('柵のモジュール') input"); await sleep(200);
  check(await ps[1].evaluate(() => S.settings.course === "gt_first" && S.settings.eldoMod && S.settings.palMod && S.settings.gt), "設定(コース・モジュール)が全員に反映");
  await ps[1].screenshot({ path: SHOT + "gt_lobby_sp.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(700);
  check(await A.evaluate(() => S.game.cfg.gt && S.game.hand.length === 4 && S.game.hand.every((c) => c.k.startsWith("g_"))), "黄金の神殿で開始・手札4枚");
  check(await A.locator("svg.hexmap text:has-text('門')").count() === 1, "門を表示");
  check(await A.locator("svg.hexmap text:has-text('守?')").count() >= 6, "守護者(裏向き)を表示");
  check(await A.locator("svg.hexmap text:has-text('E1')").count() === 3, "エルドを払う神殿マス3つ");
  check(await A.locator(".pextra:has-text('宝石')").count() === 3, "探検隊に宝石の欄");
  await A.screenshot({ path: SHOT + "gt_board_pc.png", fullPage: false });
  const pageOf = async (id) => { for (const p of ps) if (await p.evaluate(() => me) === id) return p; };
  // 1人目: カードで1マス進む
  let moved = false;
  {
    const cur = await A.evaluate(() => S.game.cur), p = await pageOf(cur);
    const plan = await p.evaluate(() => {
      const g = S.game, hx = new Map(g.hexes.map(([k, t, v]) => [k, { t, v }]));
      const from = g.P[me].pieces[0], [q, r] = from.split(",").map(Number);
      const occ = new Set(g.order.flatMap((id) => g.P[id].pieces));
      for (const [a, bb] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
        const k = `${q + a},${r + bb}`, h = hx.get(k); if (!h || occ.has(k)) continue;
        const c = g.hand.find((x) => (DB.cards[x.k].s || []).includes(h.t) && DB.cards[x.k].p >= h.v);
        if (c) return { k, card: c.id };
      }
      return null;
    });
    if (plan) {
      await p.locator(".handbox button.ecard").nth(await p.evaluate((id) => S.game.hand.findIndex((x) => x.id === id), plan.card)).click(); await sleep(150);
      await p.locator(`svg.hexmap g[data-k="${plan.k}"]`).click(); await sleep(400);
      moved = await p.evaluate((k) => S.game.P[me].pieces[0] === k, plan.k);
    }
    check(moved, "カードを選んでマスを押すと進む");
    await p.click("button:has-text('ターン終了')"); await sleep(400);
  }
  // 2人目(スマホ): 何も使わずにターン終了 → エルド1つ
  {
    const cur = await A.evaluate(() => S.game.cur), p = await pageOf(cur);
    await p.click("button:has-text('ターン終了')"); await sleep(400);
    check(await A.evaluate((id) => S.game.P[id].eldo === 1, cur), "カードを使わずにターン終了 → エルド1つ");
    await p.screenshot({ path: SHOT + "gt_mobile.png", fullPage: true });
  }
  // 3人目: 終了 → 1人目 → 2人目でエルドを使って買う
  for (let i = 0; i < 2; i++) { const cur = await A.evaluate(() => S.game.cur), p = await pageOf(cur); await p.click("button:has-text('ターン終了')"); await sleep(400); }
  {
    const cur = await A.evaluate(() => S.game.cur), p = await pageOf(cur);
    check(await p.locator("button:has-text('エルドで進む')").count() === 1, "エルドがあると「エルドで進む」");
    const e0 = await p.evaluate(() => S.game.P[me].eldo);
    await p.click(".handbox button:has-text('＋')"); await sleep(150);
    const hand = await p.evaluate(() => S.game.hand.map((c) => c.k));
    // 家庭教師(2): エルド1 + 手札から1〜2枚
    const n = await p.locator(".handbox button.ecard").count();
    for (let k = 0; k < Math.min(2, n); k++) { await p.locator(".handbox button.ecard").nth(k).click(); await sleep(80); }
    await p.locator(".market button.ecard:has-text('家庭教師')").click(); await sleep(400);
    check(await p.evaluate((e0) => S.game.bought && S.game.P[me].eldo === e0 - 1 && S.game.P[me].discard >= 1, e0), `エルド1つ+手札で家庭教師を買えた(エルド${e0}→${e0 - 1}) ` + hand.join("/"));
    await p.click("button:has-text('ターン終了')"); await sleep(400);
  }
  const txt = await A.evaluate(() => document.body.innerText);
  const bad = (txt.match(/.{0,30}(undefined|NaN|\[object).{0,30}/g) || []); check(!bad.length, "undefined などが出ていない " + JSON.stringify(bad));
  await A.screenshot({ path: SHOT + "gt_board_pc2.png", fullPage: true });
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
