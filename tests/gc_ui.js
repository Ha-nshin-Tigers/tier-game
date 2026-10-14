const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "G" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/guessclub" + (i ? "?room=" + R : "")); await p.fill("#lName", "p" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A] = ps; await sleep(300);
  check(await A.title() === "ゲスクラブ（Guess Club風）", "題名");
  check(await A.locator("select").count() === 3, "設定3つ(書く時間・持ち時間・罰金)");
  await A.selectOption("select >> nth=2", "off"); await sleep(300);
  check(await ps[1].evaluate(() => S.settings.penalty === "off"), "設定が全員に反映");
  await A.selectOption("select >> nth=2", "hand"); await sleep(200);
  await A.click("button:has-text('スタート')"); await sleep(600);
  const ids = await Promise.all(ps.map((p) => p.evaluate(() => me)));
  const by = (id) => ps[ids.indexOf(id)];
  const parent = await A.evaluate(() => S.game.parent), P = by(parent);
  check(await P.locator(".prompt button").count() >= 4, "親にお題の候補が出る");
  check(await ps.find((p) => p !== P).locator(".prompt").count() === 0, "親以外は待つ");
  await P.fill(".prompt input", "果物"); await P.click("button:has-text('このお題にする')"); await sleep(400);
  for (const p of ps) if (p !== P) { await p.click("button:has-text('OK')"); await sleep(150); }
  await sleep(300);
  check(await A.evaluate(() => S.game.step === "write" && S.game.topic === "果物"), "お題が決まって書く段階へ");
  const sets = [["りんご", "みかん", "バナナ", "ぶどう", "もも", "なし"], ["リンゴ", "メロン", "スイカ", "いちご", "キウイ", "ばなな"], ["かき", "くり", "うめ", "ゆず", "レモン", "マンゴー"]];
  for (let i = 0; i < 3; i++) {
    const p = ps[i], inputs = p.locator(".answers input");
    check(await inputs.count() === 6, `p${i}: 入力欄6つ`);
    for (let k = 0; k < 6; k++) { await inputs.nth(k).fill(sets[i][k]); }
    // 入力の途中で状態が変わっても書いた文字が消えない
    if (i === 0) { await sleep(1000); check(await inputs.nth(5).inputValue() === "なし", "書いている途中で画面が更新されても文字が残る"); }
    await p.click("button:has-text('書けた！')"); await sleep(300);
  }
  await sleep(400);
  check(await A.evaluate(() => S.game.step === "act"), "全員書けたら手番開始");
  const cur = await A.evaluate(() => S.game.cur), C = by(cur);
  const ci = ids.indexOf(cur);
  check(await C.locator(".prompt button.ans").count() === 6, "手番の人は手札6枚から出せる");
  // 手番の人が1枚目を出す
  await C.locator(".prompt button.ans").first().click(); await sleep(500);
  const played = await A.evaluate(() => (S.game.played || S.game.last).card.t);
  for (const p of ps) if (p !== C && (await p.locator("button:has-text('持っていない')").count())) { await p.click("button:has-text('持っていない')"); await sleep(200); }
  await sleep(400);
  const last = await A.evaluate(() => S.game.last);
  check(last && last.card.t === played, `出したカード「${played}」の結果: ${last && (last.result.ok ? "一致" : "不一致")}`);
  check(await A.locator(".lastplay").count() === 1, "結果の表示");
  // 次の人は賭ける
  const cur2 = await A.evaluate(() => S.game.cur), C2 = by(cur2);
  check(await C2.locator("button.slot.can").count() === 14, "賭けられるマス14(0〜12・13+)");
  await C2.locator("button.slot.can").nth(3).click(); await sleep(400);
  check(await A.evaluate(() => S.game.bets.length === 1 && S.game.bets[0].slot === 3), "賭けた");
  check(await A.locator(".slot .dots i").count() === 1, "マーカーが表示される");
  // 早送り: サーバに直接出させる
  for (let k = 0; k < 60; k++) {
    const st = await A.evaluate(() => S.game.step); if (st !== "act") break;
    const g = await A.evaluate(() => ({ cur: S.game.cur, claims: !!S.game.claims, by: S.game.played?.by }));
    if (g.claims) { for (const p of ps) { const pid = await p.evaluate(() => me); if (pid !== g.by && await p.locator("button:has-text('持っていない')").count()) await p.click("button:has-text('持っていない')"); } await sleep(250); continue; }
    const p = by(g.cur); await p.locator(".prompt button.ans").first().click(); await sleep(300);
  }
  check(await A.evaluate(() => S.game.step === "result"), "ラウンド終了→結果");
  check(await A.locator("button:has-text('次のラウンドへ')").count() === 1, "次のラウンドへボタン");
  check(await A.locator(".outs .ans").count() === 18, "みんなの答えが全部見える(18枚)");
  for (const p of ps) { await p.click("button:has-text('次のラウンドへ')"); await sleep(150); }
  await sleep(400);
  check(await A.evaluate(() => S.game.round === 2 && S.game.step === "topic"), "第2ラウンドへ(親が交代)");
  const txt = await A.evaluate(() => document.body.innerText);
  check(!/undefined|null|NaN/.test(txt), "undefined などが出ていない");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
