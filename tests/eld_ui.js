const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "E" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [], names = ["あき", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await b.newContext(mob ? { viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 950 } })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    p.on("response", (r) => { if (r.status() >= 400) errs.push(names[i] + " " + r.status() + " " + r.url()); });
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(names[i] + " console: " + m.text()); });
    await p.goto("http://localhost:3123/eldorado" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A] = ps; await sleep(300);
  check((await A.locator("h1").first().textContent()).includes("El Dorado"), "題名に本家名");
  check(await A.locator("select >> nth=0 >> option").count() === 18, "コース18種(基本7・英雄と呪い6・黄金の神殿5)を選べる");
  await A.selectOption("select >> nth=0", "hills"); await sleep(200);
  check(await ps[2].evaluate(() => S.settings.course === "hills"), "コース設定が全員に反映");
  await A.screenshot({ path: "el1_lobby.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(600);
  check(await A.evaluate(() => S.game.order.length === 3 && S.game.hand.length === 4), "3人で開始・手札4枚");
  check(await A.locator("svg.hexmap polygon").count() > 100, "六角マスの盤面を表示");
  const pageOf = async (id) => { for (const p of ps) if (await p.evaluate(() => me) === id) return p; };
  let moved = 0, bought = 0;
  for (let turn = 0; turn < 9; turn++) {
    const cur = await A.evaluate(() => S.game.cur), p = await pageOf(cur);
    // 進めるマスとカードを探す(となりの同じ種類・パワー以下)
    const plan = await p.evaluate(() => {
      const g = S.game, hx = new Map(g.hexes.map(([k, t, v, sym]) => [k, { t, v, sym }]));
      const from = g.P[me].pieces[myPiece(g)];
      for (const c of g.hand) { const d = DB.cards[c.k]; if (!d.p || d.a) continue;
        for (const n of nbKeys(from)) { const h = hx.get(n); if (!h) continue; const need = h.t === "g" ? h.sym : h.t;
          if ((d.s || []).includes(need) && h.v <= d.p && document.querySelector(`g[data-k="${n}"] polygon.can`)) return { id: c.id, to: n, k: c.k }; } }
      return null;
    });
    if (plan) {
      const before = await p.evaluate(() => S.game.P[me].pieces.join());
      await p.locator(".handbox .cards .ecard").nth(await p.evaluate((id) => S.game.hand.findIndex((c) => c.id === id), plan.id)).click();
      await p.locator(`g[data-k="${plan.to}"]`).click({ force: true }); await sleep(300);
      const after = await p.evaluate(() => S.game.P[me].pieces.join());
      if (after !== before) moved++;
      if (turn === 0) await p.screenshot({ path: "el2_move.png", fullPage: true });
    }
    // 残りのカードで買えるものを買う
    const buy = await p.evaluate(() => {
      const g = S.game, ids = g.hand.map((c) => c.id), coins = g.hand.reduce((n, c) => n + coinOf(c), 0);
      const s = g.market.filter(Boolean).filter((s) => DB.cards[s.k].cost <= coins).sort((a, b) => DB.cards[b.k].cost - DB.cards[a.k].cost)[0];
      return s && g.hand.length ? { k: s.k, n: g.hand.length } : null;
    });
    if (buy) {
      for (let i = 0; i < buy.n; i++) await p.locator(".handbox .cards .ecard").nth(i).click();
      const disc = await p.evaluate(() => S.game.P[me].discard);
      await p.locator(".market > .cards .ecard", { hasText: await p.evaluate((k) => DB.cards[k].name, buy.k) }).first().click(); await sleep(300);
      if (await p.evaluate(() => S.game.bought)) bought++;
    }
    if (turn === 1) await ps[1].screenshot({ path: "el3_sp.png", fullPage: true });
    await p.click("button:has-text('ターン終了')"); await sleep(350);
    check(await p.evaluate(() => S.game.P[me].hand === 4 || S.game.hand.length === 4), `ターン${turn + 1}: 終了後に手札4枚`);
  }
  check(moved >= 3, `マスを押して進めた(${moved}回)`);
  check(bought >= 2, `市場で買えた(${bought}回)`);
  const log = await A.evaluate(() => S.game.log.join("\n"));
  check(/買った/.test(log), "記録に購入が出る");
  // 結果画面の表示(描画だけ確認)
  await A.evaluate(() => { const g = S.game; g.step = "end"; g.result = g.order.map((id, i) => ({ id, arrived: i === 0, nb: 2 - i, top: 3, dist: i * 4 })); render(); });
  const t = await A.locator("#main").textContent();
  check(/一番乗り/.test(t) && /あと4マス/.test(t), "結果画面の表示");
  const all = await ps[1].evaluate(() => document.getElementById("game").innerText);
  check(!/\bnull\b|undefined|NaN/.test(all), "null などが出ていない");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
