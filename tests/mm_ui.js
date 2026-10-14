const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "M" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 2; i++) {
    const p = await (await b.newContext(i ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 900 } })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/mortar" + (i ? "?room=" + R : "")); await p.fill("#lName", ["あき", "べに"][i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B] = ps;
  check((await A.title()).includes("Mortar Mayhem"), "題名");
  await A.selectOption("select >> nth=0", "slow"); await sleep(200);
  check(await B.evaluate(() => S.settings.speed === "slow"), "設定が全員に反映");
  await B.screenshot({ path: SHOT + "mm_lobby_sp.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(500);
  check(await A.evaluate(() => S.game.step === "ready" && S.game.len === 3), "第1ラウンド: 矢印3つ");
  // 見本
  await A.waitForFunction(() => S.game.step === "show", null, { timeout: 5000 });
  await sleep(300);
  check(await B.locator(".arw.now").count() === 1, "見本: 矢印が1つずつ大きく出る");
  await B.screenshot({ path: SHOT + "mm_show_sp.png", fullPage: false });
  const seq = await A.evaluate(() => S.game.seq);
  await A.waitForFunction(() => S.game.step === "act", null, { timeout: 8000 });
  check(await A.evaluate(() => S.game.seq.length === 0) && await A.locator(".pad button").count() === 4, "砲撃: 矢印は隠れて、操作ボタン4つ");
  const KEY = { U: "ArrowUp", D: "ArrowDown", L: "ArrowLeft", R: "ArrowRight" }, WRONG = { U: "D", D: "U", L: "R", R: "L" };
  for (let i = 0; i < seq.length; i++) {
    await A.keyboard.press(KEY[seq[i]]); // PC はキーボード
    const lab = { U: "上", D: "下", L: "左", R: "右" }[i === 0 ? WRONG[seq[0]] : seq[i]];
    await B.locator(`.pad button[aria-label="${lab}"]`).tap().catch(() => {});
    await sleep(200);
    if (i === 0) { check(await A.locator(".cell.ghost").count() === 1 && await A.locator(".pad button.on").count() === 1, "選んだ向きの先のマスが点線で出る"); await A.screenshot({ path: SHOT + "mm_act_pc.png" }); }
    const b0 = await A.evaluate(() => S.game.beat);
    await A.waitForFunction((b0) => S.game.beat > b0 || S.game.step !== "act", b0, { timeout: 5000 });
    if (i === 0) { check(await A.evaluate(() => S.game.P[me].alive) && await B.evaluate(() => !S.game.P[me].alive), "正しい向きは無事・間違えたら吹き飛ぶ"); check(await A.locator(".cell.boom").count() >= 20, "爆発の演出"); await B.screenshot({ path: SHOT + "mm_boom_sp.png", fullPage: true }); break; }
  }
  await A.waitForFunction(() => S.game.step === "end", null, { timeout: 15000 });
  check(await A.locator(".say:has-text('あき さんの勝ち')").count() === 1 && await A.locator(".rank tr").count() === 2, "生き残った人の勝ち・順位表");
  await A.screenshot({ path: SHOT + "mm_end_pc.png", fullPage: true });
  await A.click("button:has-text('待機画面に戻る')"); await sleep(400);
  check(await A.evaluate(() => S.phase === "lobby"), "待機画面に戻れる");
  const txt = await A.evaluate(() => document.body.innerText) + await B.evaluate(() => document.body.innerText);
  const bad = txt.match(/.{0,30}(undefined|NaN|null).{0,30}/g) || []; check(!bad.length, "undefined などが出ていない " + JSON.stringify(bad));
  // ひとり練習
  {
    const p = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:3123/mortar"); await p.fill("#lName", "ソロ"); await p.click("#lCreate"); await sleep(500);
    check(await p.locator("button:has-text('スタート')").isEnabled(), "1人でもスタートできる");
    await p.click("button:has-text('スタート')");
    await p.waitForFunction(() => S.game.step === "show", null, { timeout: 5000 }); await sleep(100);
    const s2 = await p.evaluate(() => S.game.seq);
    await p.waitForFunction(() => S.game.step === "act", null, { timeout: 8000 });
    for (const d of s2) { const b0 = await p.evaluate(() => S.game.beat); await p.locator(`.pad button[aria-label="${{ U: "上", D: "下", L: "左", R: "右" }[d]}"]`).tap(); await p.waitForFunction((b0) => S.game.beat > b0 || S.game.step !== "act", b0, { timeout: 5000 }); }
    check(await p.evaluate(() => S.game.P[me].alive && S.game.step === "result"), "ひとり: 3つ正解してラウンドクリア");
    await p.waitForFunction(() => S.game.round === 2, null, { timeout: 6000 });
    check(await p.evaluate(() => S.game.len === 4), "2ラウンド目は矢印4つ");
  }
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
