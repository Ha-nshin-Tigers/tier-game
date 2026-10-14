const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const N of [4, 3]) {
    const R = "T" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
    for (let i = 0; i < N; i++) {
      const p = await (await b.newContext(i === 1 ? { viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 950 } })).newPage();
      p.on("pageerror", (e) => errs.push(e.message));
      p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
      await p.goto("http://localhost:3123/matchy" + (i ? "?room=" + R : "")); await p.fill("#lName", ["あき", "べに", "ちか", "だい"][i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
    }
    const [A, B] = ps;
    if (N === 4) await A.selectOption("select >> nth=2", "order"); await sleep(200);
    await A.click("button:has-text('スタート')"); await sleep(500);
    const g0 = await A.evaluate(() => S.game);
    check(N === 4 ? !g0.odd && g0.teams.length === 2 : g0.odd && g0.teams.length === 2 && !!g0.ref, `${N}人: ${N === 4 ? "ペア2組" : "参照プレイヤー+2人"}`);
    const pageOf = async (id) => { for (const p of ps) if (await p.evaluate(() => me) === id) return p; };
    const caller = await pageOf(g0.caller);
    check(await caller.locator(".nums button").count() === 12, "親には1〜12の番号ボタン");
    await caller.locator(".nums button").nth(4).click(); await sleep(400);
    check(await B.evaluate(() => S.game.step === "pick" && S.game.theme.n === 5) && await B.locator(".theme .w").count() === 1, "5番のお題が全員に出る");
    check(await B.locator(".photos .ph").count() === 42, "写真カード42枚");
    // 全員が同じ5枚(先頭から)を同じ順で選ぶ → 全チーム15点
    for (const p of ps) {
      const n = await p.evaluate(() => S.game.need);
      for (let k = 0; k < n; k++) { await p.locator(".photos .ph").nth(k).click(); await sleep(40); }
      if (p === B) await B.screenshot({ path: SHOT + `mt_pick_sp${N}.png`, fullPage: false });
      await p.click("button:has-text('これで決定')"); await sleep(150);
    }
    await sleep(400);
    check(await A.evaluate(() => S.game.step === "reveal" && S.game.teams.every((t) => t.pos === 15)), "答え合わせ: 全員一致で15点ずつ進む");
    check(await A.locator(".cmp .ph.m3").count() >= 10, "一致したカードが金色で出る");
    await A.screenshot({ path: SHOT + `mt_reveal_pc${N}.png`, fullPage: true });
    await B.click("button:has-text('次のラウンドへ')"); await sleep(400);
    check(await A.evaluate(() => S.game.round === 2 && S.game.step === "call"), "次のラウンドへ進む");
    const txt = await A.evaluate(() => document.body.innerText) + await B.evaluate(() => document.body.innerText);
    const bad = txt.match(/.{0,30}(undefined|NaN|null).{0,30}/g) || []; check(!bad.length, "undefined などが出ていない " + JSON.stringify(bad));
    check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  }
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
