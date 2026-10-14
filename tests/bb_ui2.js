const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SH = require("path").join(__dirname, ".shots") + "/";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
  const mk = async (mob) => { const ctx = await b.newContext(mob ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } }); return ctx.newPage(); };
  const R = "C" + Math.random().toString(36).slice(2, 5).toUpperCase(), errs = [];
  const A = await mk(true), B = await mk(), C = await mk();
  for (const p of [A, B, C]) p.on("pageerror", (e) => errs.push(e.message));
  for (const [p, n] of [[B, "べに"], [A, "あき"], [C, "ちか"]]) { await p.goto(`http://localhost:3123/bombanana?room=${R}`); await p.fill("#lName", n); await p.fill("#lRoom", R); await p.click("#lJoin"); await sleep(500); }
  await A.click(".rolecard:has-text('見ざる')"); await sleep(200); await B.click(".rolecard:has-text('聞かざる')"); await sleep(200); await C.click(".rolecard:has-text('言わざる')"); await sleep(300);
  await B.selectOption("select >> nth=0", "campaign"); await sleep(400); await B.selectOption("select >> nth=1", "29"); await sleep(300);
  await B.click("button:has-text('スタート')"); await sleep(4500);
  const kinds = await B.evaluate(() => S.game.bomb.mods.map((m) => m.kind));
  check(kinds.length === 7, "レベル29: モジュール7個 " + kinds.join(","));
  await B.evaluate(() => setFocus(null)); await sleep(500);
  await B.screenshot({ path: SH + "bb6_lv29_deaf.png" });
  check(await A.locator(".seg button:has-text('さわる')").count() === 1, "スマホの見ざるに「さわる/押す」切り替え");
  // 見ざる(スマホ): さわるモードでタップ → 読み上げ・操作はしない
  await A.click(".seg button:has-text('さわる')");
  await A.evaluate(() => setFocus(0)); await sleep(500);
  const strikes0 = await B.evaluate(() => S.game.bomb.strikes);
  const box = await A.locator("#stage").boundingBox();
  await A.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await sleep(600);
  check((await A.locator("#readout").textContent()).length > 0, "さわるモードのタップで読み上げ: " + await A.locator("#readout").textContent());
  check(await B.evaluate(() => S.game.bomb.strikes) === strikes0, "さわるだけではミスにならない");
  await A.screenshot({ path: SH + "bb7_blind_sp.png" });
  for (const t of ["迷路", "シンボル", "サウンドボード"]) { await C.click(`.mtabs button:has-text('${t}')`); await sleep(150); }
  await C.screenshot({ path: SH + "bb8_mute_manual_pc.png" });
  // 停電
  await B.evaluate(() => 0);
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
