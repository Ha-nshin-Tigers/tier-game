const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "Y" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const errs = [], ps = [], names = ["あきら", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 664 } : { width: 1000, height: 820 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    await p.goto("http://localhost:3123/party" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B, C] = ps;
  await sleep(500);
  for (const t of ["1試合目を外す", "1試合目を外す"]) { await A.click(`button[aria-label='${t}']`); await sleep(150); }
  await A.click("button:has-text('+ 📊 ティア表')"); await sleep(150);
  await A.click("button:has-text('+ 🔢 かくれナンバー')"); await sleep(150);
  await A.click("button:has-text('+ 🃏 ウソつき酒場')"); await sleep(150);
  await A.click("button[aria-label='1試合目を外す']"); await sleep(200);
  console.log("playlist:", (await A.locator(".playlist li .nm").allTextContents()).join(" → "));
  await B.screenshot({ path: "x0_lobby_sp.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(7600);
  const fits = async (tag) => { const m = await B.evaluate(() => ({ b: document.getElementById("main").getBoundingClientRect().bottom, ih: innerHeight })); console.log(tag, Math.round(m.b), "/", m.ih, m.b <= m.ih ? "1画面に収まる" : "はみ出し(縦スクロール)"); };
  // ---- ティア表: 3ラウンド ----
  for (let r = 0; r < 3; r++) {
    let parent = null; for (const p of ps) if (await p.locator("text=あなたが親です").count()) parent = p;
    if (r === 0) { await fits("tier-rank"); await (parent === B ? A : B).screenshot({ path: "x1_tier_wait.png" }); }
    for (let k = 0; k < 5; k++) await parent.click(".words .word:not([disabled]) >> nth=0");
    if (r === 0) await parent.screenshot({ path: "x2_tier_parent.png" });
    await parent.click("button:has-text('これで決定')"); await sleep(400);
    for (const p of ps) { if (p === parent) continue; for (let k = 0; k < 5; k++) await p.click(".words .word:not([disabled]) >> nth=" + (k % 2 ? 0 : 0)); await p.click("button:has-text('これで決定')"); }
    await sleep(800);
    if (r === 0) { await B.screenshot({ path: "x3_tier_show_sp.png", fullPage: true }); await fits("tier-show"); }
    await sleep(9200);
  }
  await sleep(500); await A.click("button:has-text('次の試合へ')"); await sleep(7600);
  // ---- かくれナンバー: 3ラウンド ----
  for (let r = 0; r < 3; r++) {
    if (r === 0) await fits("number-hint");
    for (const p of ps) { await p.fill("input[aria-label='ヒント']", "ヒント" + r); await p.click("button:has-text('確定')"); await sleep(150); }
    await sleep(500);
    if (r === 0) { await B.screenshot({ path: "x4_number_arrange_sp.png" }); await fits("number-arrange"); }
    await A.click("button[aria-label='下へ'] >> nth=0"); await sleep(200);
    for (const p of ps) { await p.click("button:has-text('この並びでOK')"); await sleep(100); }
    await sleep(600);
    if (r === 0) await B.screenshot({ path: "x5_number_show_sp.png" });
    await sleep(8200);
  }
  await sleep(500); await A.click("button:has-text('次の試合へ')"); await sleep(7600);
  // ---- ウソつき酒場: 決着まで ----
  await fits("liar-play");
  let shot = false;
  for (let k = 0; k < 400; k++) {
    let acted = false;
    for (const p of ps) {
      if (await p.locator("button:has-text('引き金を引く')").count()) { if (!shot) { await p.screenshot({ path: "x7_liar_trigger.png" }); shot = true; } await p.click("button:has-text('引き金を引く')"); acted = true; break; }
      if (await p.locator("button.liarbtn:has-text('ウソつき！')").count()) { await p.click("button.liarbtn:has-text('ウソつき！')"); acted = true; break; }
      const card = p.locator(".cards button.pc");
      if (await card.count() && await p.locator(".say:has-text('あなたの番')").count() + await p.locator("p:has-text('あなたの番')").count()) {
        if (k === 0) await p.screenshot({ path: "x6_liar_turn.png" });
        await card.nth(0).click(); await p.click("button.primary.big"); acted = true; break;
      }
    }
    if (await A.locator("text=の結果").count()) break;
    await sleep(acted ? 300 : 700);
  }
  await A.screenshot({ path: "x8_liar_result.png", fullPage: true });
  console.log("結果画面:", await A.locator(".say").first().textContent());
  console.log("errors", errs);
  await browser.close();
})();
