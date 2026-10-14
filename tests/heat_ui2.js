const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "J" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 2; i++) {
    const p = await (await b.newContext(i ? { viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/heat" + (i ? "?room=" + R : "")); await p.fill("#lName", "p" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B] = ps; await sleep(300);
  await A.selectOption("select >> nth=0", "japan"); await sleep(200);
  await A.selectOption("select >> nth=1", "all"); await sleep(200);
  await A.selectOption("select >> nth=2", "1"); await sleep(200);
  await A.check(".toggle input"); await sleep(300);
  check(await B.evaluate(() => S.settings.track === "japan" && S.settings.garage === "all" && S.settings.weather === true && S.settings.laps === 1), "拡張コース・ガレージ・天候の設定が全員に反映");
  await A.click("button:has-text('スタート')"); await sleep(700);
  check(await A.evaluate(() => S.game.step === "draft"), "ガレージ: ドラフトから始まる");
  await A.screenshot({ path: SHOT + "heat_draft.png" });
  for (let k = 0; k < 6; k++) {
    const cur = await A.evaluate(() => S.game.draft?.cur); if (!cur) break;
    const P = (await A.evaluate(() => me)) === cur ? A : B;
    check(await P.locator(".hand.draft button.hc").count() >= 3, `ドラフト${k + 1}: カードを選べる`);
    await P.locator(".hand.draft button.hc").first().click(); await sleep(350);
  }
  check(await A.evaluate(() => S.game.step === "plan" && Object.values(S.game.P).every((p) => p.ups.length === 3)), "3巡のドラフトが終わってレース開始");
  check(await A.locator("svg.track path[stroke='#3fa6e0']").count() === 19, "水たまり19マスを表示");
  check(await A.locator("svg.track line[stroke='#3e8ef7']").count() === 2, "シケイン(青い線)2本");
  check(await A.locator(".mapnotes").count() === 1 && /天候/.test(await A.locator(".mapnotes").innerText()), "天候・路面の説明");
  await A.screenshot({ path: SHOT + "heat_japan.png" });
  // 数ラウンド進める(手札の先頭から)
  for (let r = 0; r < 4; r++) {
    for (const p of ps) {
      if (!(await p.evaluate(() => S.game.step === "plan" && !S.game.P[me].ready))) continue;
      const n = await p.locator(".dash button.hc").count();
      if (n) await p.locator(".dash button.hc").first().click();
      await sleep(80);
      const btn = p.locator("button:has-text('決定')"); if (await btn.isEnabled()) await btn.click();
      await sleep(200);
    }
    for (let k = 0; k < 12; k++) {
      const t = await A.evaluate(() => S.game.turn && { pid: S.game.turn.pid, phase: S.game.turn.phase });
      if (!t) break;
      const p = (await A.evaluate(() => me)) === t.pid ? A : B;
      if (t.phase === "choose") await p.click(".prompt button:has-text('決定')");
      else if (t.phase === "react") await p.click(".prompt button:has-text('次へ')");
      else if (t.phase === "slip") await p.click("button:has-text('しない')");
      else if (t.phase === "discard") await p.click("button:has-text('ターン終了')");
      await sleep(250);
    }
  }
  check(await A.evaluate(() => S.game.round >= 3), "ラウンドが進む " + await A.evaluate(() => S.game.round));
  await B.screenshot({ path: SHOT + "heat_mobile_japan.png", fullPage: true });
  const txt = await A.evaluate(() => document.body.innerText);
  check(!/undefined|NaN/.test(txt), "undefined などが出ていない");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
