const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "H" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const p = await (await b.newContext(i === 1 ? { viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 950 } })).newPage();
    p.on("pageerror", (e) => errs.push(i + ": " + e.message));
    await p.goto("http://localhost:3123/eldorado" + (i ? "?room=" + R : "")); await p.fill("#lName", "p" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A] = ps; await sleep(300);
  await A.locator(".toggle input").nth(0).check(); await sleep(250);
  check(await ps[2].evaluate(() => S.settings.caves && !S.settings.hh), "洞窟ルールのオン/オフが全員に反映");
  await A.locator(".toggle input").nth(1).check(); await sleep(250);
  check(await A.evaluate(() => S.settings.hh && S.settings.caves) && await A.locator(".toggle input").nth(0).isDisabled(), "拡張オンで洞窟ルールも自動でオン(外せない)");
  await A.selectOption("select >> nth=0", "demon"); await sleep(250);
  check(await A.locator(".toggle input").nth(1).isDisabled() && /推定/.test(await A.locator("#main").textContent()), "英雄と呪いのコースでは拡張が外せない・推定の注記");
  await A.screenshot({ path: "h1_lobby.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(700);
  const svg = await A.locator("svg.hexmap").textContent();
  check(svg.includes("👹") && svg.includes("🍺") && svg.includes("⛏4"), "盤面に魔物マス・酒場・洞窟(残り4)を表示");
  check(await A.evaluate(() => S.game.hand.length + S.game.P[me].deck === 9), "初期デッキ9枚(動物カード入り)");
  // 自分の番の人の画面で、描画だけの確認(状態を手で入れる)
  const cur = await A.evaluate(() => S.game.cur); let P; for (const p of ps) if (await p.evaluate(() => me) === cur) P = p;
  await P.evaluate(() => { const g = S.game; g.tokens = [{ id: 9001, k: "j2" }, { id: 9002, k: "draw" }, { id: 9003, k: "protect" }]; g.P[me].curses = [{ id: 9101, k: "lethJ" }]; render(); });
  const t1 = await P.locator(".handbox").textContent();
  check(/洞窟トークン\(3\)/.test(t1) && /ナタ2/.test(t1) && /不調\(ナタ\)/.test(t1) && /選んだもので解く/.test(t1), "洞窟トークンと呪いを表示");
  const pet = await P.evaluate(() => S.game.hand.findIndex((c) => DB.cards[c.k].boost));
  if (pet >= 0) { await P.locator(".handbox .cards .ecard").nth(pet).click(); await sleep(100); check(/特殊能力を使う/.test(await P.locator(".handbox").textContent()), "動物カードを選ぶと特殊能力のチェック"); }
  else check(true, "(動物カードが手札にない回)");
  await P.evaluate(() => { S.game.pending = { type: "hero", opts: ["nathan", "lara", "mary"] }; render(); });
  check(await P.locator(".prompt .ecard").count() === 3 && /酒場/.test(await P.locator(".prompt").textContent()), "英雄を選ぶ画面");
  await P.screenshot({ path: "h2_hero.png" });
  await P.evaluate(() => { S.game.pending = { type: "protect", curse: "voodoo" }; render(); });
  check(/呪術/.test(await P.locator(".prompt").textContent()), "呪いよけの確認画面");
  await P.evaluate(() => { S.game.pending = null; S.game.steps = { kind: "voodoo", mover: me, owner: S.game.order.find((x) => x !== me), piece: 0, left: 2, targets: [S.game.hexes[50][0]] }; render(); });
  check(/呪術/.test(await P.locator(".prompt").textContent()) && await P.locator("polygon.can").count() === 1, "ほかの人のコマを動かす画面(行き先だけ光る)");
  await P.evaluate(() => { S.game.steps = null; render(); });
  // ほかの人の画面: 待ちの表示
  let O; for (const p of ps) if (p !== P) { O = p; break; }
  await O.evaluate((c) => { S.game.pending = { type: "hero", pid: c }; render(); }, cur);
  check(/選んでいます/.test(await O.locator(".say").first().textContent()), "ほかの人の選択待ちの表示");
  await ps[1].screenshot({ path: "h3_sp.png", fullPage: true });
  const all = await A.evaluate(() => document.getElementById("game").innerText);
  check(!/\bnull\b|undefined|NaN/.test(all), "null などが出ていない");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
