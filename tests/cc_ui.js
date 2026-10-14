const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "C" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const p = await (await b.newContext(i === 1 ? { viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 950 } })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/citychase" + (i ? "?room=" + R : "")); await p.fill("#lName", ["あき", "べに", "ちか"][i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B, Cc] = ps;
  check((await A.title()).includes("City Chase"), "題名");
  const bid = await B.evaluate(() => me);
  await A.selectOption("select >> nth=0", bid); await sleep(250);
  check(await B.evaluate(() => S.settings.thief === me), "犯人役をべにに指定");
  await A.click("button:has-text('スタート')"); await sleep(500);
  check(await A.evaluate(() => S.game.step === "place") && await A.locator("circle.ix.can").count() === 16, "警察: 交差点16か所が押せる");
  await A.locator("circle.ix.can").nth(0).click(); await sleep(150);
  await Cc.locator("circle.ix.can").nth(5).click(); await sleep(150);
  await A.locator("circle.ix.can").nth(13).click(); await sleep(300);
  check(await B.evaluate(() => S.game.step === "thief" && S.game.helis.length === 3), "ヘリ3機を置いたら犯人の番");
  check(await B.locator("g.bld.can").count() === 25, "犯人: 25棟どこでも選べる");
  await B.locator('g.bld[data-b="2,2"]').tap(); await sleep(300);
  check(await B.evaluate(() => S.game.car === "2,2") && await A.evaluate(() => S.game.car === null && !Object.keys(S.game.traces).length), "犯人には車が見え、警察には見えない");
  await B.screenshot({ path: SHOT + "cc_thief_sp.png", fullPage: true });
  // 警察: ヘリ1を選んで(2,2)が見えるところを探す
  const plan = await A.evaluate(() => { const g = S.game; for (let i = 0; i < 3; i++) { const [x, y] = g.helis[i].split(",").map(Number); if ([[0, 0], [1, 0], [0, 1], [1, 1]].some(([a, b]) => `${x + a},${y + b}` === "2,2")) return i; } return -1; });
  const searchH = plan >= 0 ? plan : 0;
  // まずほかのヘリで移動・パス
  const others = [0, 1, 2].filter((x) => x !== searchH);
  await A.locator(".helis button").nth(others[0]).click(); await sleep(150);
  check(await A.locator("circle.ix.can").count() >= 1 && await A.locator("g.bld.can").count() === 4, "ヘリを選ぶと移動先と捜索できる4棟が光る");
  await A.locator("circle.ix.can").first().click(); await sleep(250);
  await Cc.locator(".helis button").nth(others[1]).click(); await sleep(150);
  await Cc.click("button:has-text('は何もしない')"); await sleep(250);
  check(await A.evaluate(() => S.game.acted.length === 2), "2機が行動済み");
  await A.screenshot({ path: SHOT + "cc_police_pc.png", fullPage: false });
  await A.locator(".helis button").nth(searchH).click(); await sleep(150);
  if (plan >= 0) {
    await A.locator('g.bld.can[data-b="2,2"]').click(); await sleep(400);
    check(await A.evaluate(() => S.game.step === "end" && S.game.winner === "police"), "車のあるビルを捜索 → 警察の勝ち");
  } else {
    await A.locator("g.bld.can").first().click(); await sleep(400);
    check(await B.evaluate(() => S.game.step === "thief" && S.game.round === 2), "3機行動 → ラウンド2の犯人の番");
    check(await B.locator("g.bld.can").count() >= 2 && await B.locator("g.bld.can").count() <= 4, "犯人はタテヨコのとなりだけ選べる");
  }
  await A.screenshot({ path: SHOT + "cc_after_pc.png", fullPage: true });
  const txt = await A.evaluate(() => document.body.innerText) + await B.evaluate(() => document.body.innerText);
  const bad = txt.match(/.{0,30}(undefined|NaN|null).{0,30}/g) || []; check(!bad.length, "undefined などが出ていない " + JSON.stringify(bad));
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
