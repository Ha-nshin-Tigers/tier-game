// ダンダンティアーの画面のテスト(3人・1人はスマホ幅)。3つのモードを画面で遊ぶ
const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "D" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const p = await (await b.newContext(i === 1 ? { viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true, acceptDownloads: true } : { viewport: { width: 1200, height: 950 }, acceptDownloads: true })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/dantier" + (i ? "?room=" + R : "")); await p.fill("#lName", ["あき", "べに", "ちか"][i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A] = ps;
  const ids = await Promise.all(ps.map((p) => p.evaluate(() => me)));
  const pageOf = (id) => ps[ids.indexOf(id)];
  check((await A.title()).includes("ダンダンティアー"), "題名");
  check(await A.locator("ol.rules li").count() >= 4, "待機画面: 遊び方");
  await A.fill("#themeIn", "深夜に食べると特に美味しいもの"); await A.click("button:has-text('決める')"); await sleep(300);
  check(await ps[2].evaluate(() => S.settings.theme === "深夜に食べると特に美味しいもの"), "ホストがお題を決められる");
  await A.selectOption("select >> nth=1", "3"); await sleep(250); // クリアに必要な連続正解: 3回
  await A.click("button:has-text('スタート')"); await sleep(500);

  // ---- 本編 ----
  for (let round = 0; round < 6; round++) {
    const st = await A.evaluate(() => ({ step: S.game.step, giver: S.game.cur?.giver }));
    if (st.step === "end") break;
    const G = pageOf(st.giver), others = ps.filter((p) => p !== G);
    if (round === 0) {
      check(await G.locator(".secret").count() === 1 && await others[0].locator(".secret").count() === 0, "秘密のランクは出題する人にだけ見える");
      await G.screenshot({ path: SHOT + "dt_clue.png", fullPage: true });
    }
    await G.fill("#clueIn", ["ラーメン", "アイス", "おにぎり", "ポテチ", "カップ麺", "焼き鳥"][round]); await G.click("button:has-text('この言葉で出題')"); await sleep(300);
    const secret = await G.evaluate(() => S.game.cur.secret), lo = await A.evaluate(() => S.game.lo);
    const Q = others[round % 2];
    // 1ラウンド目: ヒントを使ってからわざと外す、2ラウンド目以降: 正解を選んで決定
    if (round === 0) {
      await Q.click("button:has-text('ヒント')"); await sleep(300);
      check(await Q.locator(".ranks button.gone").count() === 2, "ヒントで2つのランクが消える");
      // 当てる側には正解が見えないので、出題した人の画面(正解が見える)で「正解でない」ランクを探して押す(テストのため)
      const w = await G.evaluate(() => { const g = S.game; for (let r = g.lo; r <= g.hi; r++) if (r !== g.cur.secret && !g.cur.removed.includes(r)) return r; });
      await Q.locator(".ranks button").nth(w - lo).click(); await sleep(250);
      check(await others[1 - (round % 2)].locator(".ranks button .who").nth(w - lo).textContent() !== " ", "みんなの選んだランクが見える");
      await Q.screenshot({ path: SHOT + "dt_guess" + (Q === ps[1] ? "_sp" : "") + ".png", fullPage: true });
      await Q.locator("button:has-text('で決定')").click(); await Q.locator("button:has-text('もう一度押すと実行')").click(); await sleep(400);
      check(await A.evaluate(() => S.game.step === "result" && !S.game.cur.ok && S.game.streak === 0), "はずれ → 連続0・結果表示");
      check(await A.locator(".verdict.ng").count() === 1 && await A.locator(".tier .item").count() === 1, "はずれでも言葉は表に残る");
    } else {
      await Q.locator(".ranks button").nth(secret - lo).click(); await sleep(200);
      await Q.locator("button:has-text('で決定')").click(); await Q.locator("button:has-text('もう一度押すと実行')").click(); await sleep(400);
    }
    const step = await A.evaluate(() => S.game.step);
    if (step === "result") { await A.click("button:has-text('次のラウンドへ')"); await sleep(400); }
  }
  check(await A.evaluate(() => S.game.step === "end" && S.game.cleared), "3回連続正解でクリア");
  check(await A.locator(".tier .item").count() === 4, "表に4つの言葉");
  await A.screenshot({ path: SHOT + "dt_clear.png", fullPage: true });
  const [dl] = await Promise.all([A.waitForEvent("download", { timeout: 5000 }).catch(() => null), A.click("button:has-text('表を画像で保存')")]);
  check(dl && /\.png$/.test(dl.suggestedFilename()), "表を画像で保存できる");
  await A.click("button:has-text('待機画面に戻る')"); await sleep(400);

  // ---- みんなでティアー ----
  await A.selectOption("select >> nth=0", "together"); await sleep(250);
  await A.click("button:has-text('スタート')"); await sleep(500);
  await ps[1].fill("#addIn", "カレー"); await ps[1].locator('.trow[data-rank="S"]').click(); await sleep(250);
  await ps[2].fill("#addIn", "ナポリタン"); await ps[2].locator('.trow[data-rank="B"]').click(); await sleep(250);
  check(await A.locator(".tier .item").count() === 2, "言葉を書いて行を押すと置ける(みんなに見える)");
  await A.locator('.item:has-text("ナポリタン")').click(); await sleep(150); await A.locator('.trow[data-rank="A"]').click(); await sleep(300);
  check(await A.evaluate(() => S.game.items.find((x) => x.text === "ナポリタン").rank === 3), "言葉を押して別の行を押すと動く");
  await A.click("button:has-text('上に「SS」を足す')"); await sleep(250);
  check(await ps[1].locator('.trow[data-rank="SS"]').count() === 1, "上にランクを足せる");
  await ps[1].screenshot({ path: SHOT + "dt_together_sp.png", fullPage: true });
  await A.click("button:has-text('これで完成')"); await A.click("button:has-text('もう一度押すと実行')"); await sleep(400);
  check(await A.evaluate(() => S.game.step === "end"), "ホストが完成");
  await A.click("button:has-text('待機画面に戻る')"); await sleep(400);

  // ---- じぶんのティアー ----
  await A.selectOption("select >> nth=0", "mine"); await sleep(250);
  await A.click("button:has-text('スタート')"); await sleep(500);
  for (let k = 0; k < 3; k++) {
    const mk = await A.evaluate(() => S.game.cur.maker), M = pageOf(mk);
    for (const [t, r] of [["たこ焼き", "S"], ["焼きそば", "B"], ["わたあめ", "D"]]) { await M.fill("#addIn", t + k); await M.locator(`.trow[data-rank="${r}"]`).click(); await sleep(150); }
    await M.click("button:has-text('この表で出題')"); await sleep(400);
    for (const P of ps.filter((p) => p !== M)) {
      const n = await P.locator(".gitem").count();
      if (k === 0) check(n === 3, "当てる人には言葉が3つ(ランクは見えない)");
      for (let i = 0; i < n; i++) await P.locator(".gitem").nth(i).locator("button").nth(i).click(); // てきとうに選ぶ
      await sleep(200);
      await P.click("button:has-text('これで回答')"); await sleep(250);
    }
    await sleep(300);
    if (k === 0) { check(await A.evaluate(() => S.game.step === "reveal") && await A.locator("table.res").count() === 1, "全員回答で答え合わせ(表と点数)"); await ps[1].screenshot({ path: SHOT + "dt_reveal_sp.png", fullPage: true }); }
    if (await A.evaluate(() => S.game.step) === "reveal") { await A.click("button:has-text('次へ')"); await sleep(400); }
  }
  check(await A.evaluate(() => S.phase === "finished" && S.game.step === "end") && await A.locator("table.rank tr").count() === 3, "全員作り終えたら最終結果");
  check(await ps[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "スマホ幅で横にはみ出さない");
  const txt = (await Promise.all(ps.map((p) => p.evaluate(() => document.body.innerText)))).join("\n");
  const bad = txt.match(/.{0,30}(undefined|NaN|null|\[object).{0,30}/g) || []; check(!bad.length, "undefined などが出ていない " + JSON.stringify(bad));
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
  process.exit(fails ? 1 : 0);
})();
