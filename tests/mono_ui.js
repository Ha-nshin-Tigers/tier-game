const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const R = "M" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const errs = [], ps = [], names = ["あきら", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 760 } : { width: 1280, height: 900 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    p.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errs.push(names[i] + " " + r.status() + " " + r.url()); });
    await p.goto("http://localhost:3123/monopoly" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B, C] = ps; await sleep(400);
  await A.selectOption("select >> nth=0", "world"); await sleep(200);
  // 細かいルール
  check(await A.locator(".ruleset button.on:has-text('本家どおり')").count() === 1, "最初は「本家どおり」");
  check(await B.locator(".ruleset input[type=checkbox]").first().isDisabled(), "ホスト以外はルールを変えられない");
  await A.click(".ruleset button:has-text('オリジナル')"); await sleep(250);
  check(await B.evaluate(() => Object.values(S.settings.rules).every((v) => v === false)) && await A.locator(".ruleset button.on:has-text('オリジナル')").count() === 1, "「オリジナル」ボタンで一括切り替え(ほかの人にも反映)");
  await A.locator(".ruleset label", { hasText: "無料駐車場" }).locator("input").check(); await sleep(250);
  check(await B.evaluate(() => S.settings.rules.freeParking === true && S.settings.rules.bankAuction === false) && /カスタム/.test(await A.locator(".ruleset").textContent()), "1つだけ変えられる(ほかはそのまま・「カスタム」表示)");
  await A.click(".ruleset button:has-text('本家どおり')"); await sleep(250);
  await A.locator(".ruleset label", { hasText: "無料駐車場" }).locator("input").check(); await sleep(250);
  await A.screenshot({ path: "m0_rules.png", fullPage: true });
  await A.screenshot({ path: "m1_lobby.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(600);
  check(await A.locator("#board2d .cell").count() === 40, "盤面に40マス");
  check((await A.locator("#board2d").textContent()).includes("ニューヨーク"), "世界の地図");
  const st = (p) => p.evaluate(() => ({ cur: S.game.cur, me, step: S.game.step, again: S.game.again, debts: S.game.debts.length, phase: S.phase }));
  const pageOf = async (id) => { for (const p of ps) if ((await st(p)).me === id) return p; };
  let bought = 0, auctions = 0, rolls = 0, auctionSq = null, bidder = null;
  for (let k = 0; k < 40; k++) {
    const s = await st(A); if (s.phase !== "play") break;
    const p = await pageOf(s.cur);
    if (s.debts) { for (const q of ps) { if (await q.locator("button:has-text('自動で集めて払う')").count()) await q.click("button:has-text('自動で集めて払う')"); } await sleep(300); continue; }
    if (s.step === "roll") { const b = p.locator("#act button:has-text('振る')").first(); await b.click(); rolls++; await sleep(700); continue; }
    if (s.step === "buy") {
      if (auctions === 0) { auctionSq = await p.evaluate(() => S.game.pending); await p.click("button:has-text('買わない')"); auctions++; await sleep(300);
        // 競売: 別の人が入札
        const other = ps.find((q) => q !== p); bidder = await other.evaluate(() => me);
        await other.click("#act button:has-text('+10')"); await sleep(200);
        await A.screenshot({ path: "m3_auction.png" });
        await other.evaluate(() => {}); await sleep(21500);
        continue; }
      const can = await p.locator("#act button:has-text('買う(')").isEnabled();
      if (can) { await p.click("#act button:has-text('買う(')"); bought++; } else await p.click("button:has-text('買わない')");
      await sleep(300); continue;
    }
    if (s.step === "auction") { await sleep(3000); continue; }
    if (s.step === "act") { if (s.again) await p.click("#act button:has-text('もう一度振る')"); else await p.click("#act button:has-text('ターン終了')"); await sleep(400); continue; }
  }
  const g = await A.evaluate(() => S.game);
  check(rolls >= 8, `UIでサイコロ ${rolls}回`);
  check(bought >= 1, `UIで購入 ${bought}件`);
  check(auctionSq != null && g.own[auctionSq].owner === bidder, "競売: 入札した人が落札(" + g.board[auctionSq].name + ")");
  await A.screenshot({ path: "m2_board_pc.png" });
  check(await A.evaluate(() => S.game.cfg.rules.freeParking && S.game.cfg.rules.bankAuction) && await A.locator("#board2d .pot").count() === 1, "ゲームに設定したルールが入る(駐車場の貯金が見える)");
  for (const p of ps) { const t = await p.evaluate(() => document.getElementById("game").innerText); if (/\bnull\b|undefined|NaN/.test(t)) check(false, "画面に null/undefined/NaN が出ている: " + t.match(/.{0,20}(null|undefined|NaN).{0,20}/)[0]); }
  await B.screenshot({ path: "m4_board_sp.png", fullPage: true });
  // 盤面がスマホ幅に収まる
  const bw = await B.evaluate(() => { const r = document.getElementById("board2d").getBoundingClientRect(); return { w: r.width, right: r.right, sw: document.documentElement.scrollWidth }; });
  check(bw.right <= 390 && bw.sw <= 390, `スマホで横にはみ出さない(盤 ${Math.round(bw.w)}px)`);
  // マスの説明
  await A.click("#board2d .cell >> nth=39"); await sleep(200);
  check(await A.locator("dialog#info[open]").count() === 1 && /ホテル/.test(await A.locator("#info").textContent()), "マスを押すと使用料の表");
  await A.screenshot({ path: "m5_info.png" });
  await A.click("#info button:has-text('閉じる')");
  // 取引: A が 自分の土地(あれば)を B に提案 → B が受ける
  const myProps = await A.evaluate(() => S.game.own.map((o, i) => (o?.owner === me ? i : -1)).filter((i) => i >= 0));
  await A.click("button:has-text('取引を持ちかける')"); await sleep(200);
  const bId = await B.evaluate(() => me);
  await A.selectOption("#trades select", bId); await sleep(200);
  if (myProps.length) await A.locator("#trades .tcol >> nth=0").locator("input[type=checkbox]").first().check();
  await A.locator("#trades .tcol >> nth=1").locator("input[type=number]").fill("10");
  await A.click("button:has-text('提案する')"); await sleep(400);
  check(await B.locator("#trades button:has-text('受ける')").count() === 1, "相手に取引の提案が届く");
  await B.screenshot({ path: "m6_trade_sp.png", fullPage: true });
  const bCash = await B.evaluate(() => S.game.P[me].cash);
  await B.click("#trades button:has-text('受ける')"); await sleep(400);
  const after = await B.evaluate(() => ({ cash: S.game.P[me].cash, log: S.game.log.slice(-3) }));
  check(after.cash === bCash - 10 || after.log.some((l) => l.includes("取引成立")), "取引成立: " + after.log.slice(-1));
  // 3D
  await C.click("#viewBtn"); await sleep(3000);
  const has3d = await C.evaluate(() => !!View3D && !document.getElementById("stage3d").hidden);
  check(has3d, "3D表示に切り替わる");
  await C.screenshot({ path: "m7_3d_pc.png" });
  await B.click("#viewBtn"); await sleep(3000);
  await B.screenshot({ path: "m8_3d_sp.png" });
  await C.click("#viewBtn"); await sleep(300);
  check(await C.locator("#board2d .cell").count() === 40, "2Dに戻せる");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs.slice(0, 5)));
  console.log(fails ? `NG ${fails}件` : "全項目OK");
  await browser.close();
})();
