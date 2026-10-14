const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SH = require("path").join(__dirname, ".shots") + "/";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const mk = async (mob) => { const ctx = await b.newContext(mob ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } }); return ctx.newPage(); };
  const R = "B" + Math.random().toString(36).slice(2, 5).toUpperCase(), errs = [];
  const A = await mk(), B = await mk(), C = await mk(true);
  for (const p of [A, B, C]) p.on("pageerror", (e) => errs.push(e.message));
  for (const [p, n] of [[A, "あき"], [B, "べに"], [C, "ちか"]]) { await p.goto(`http://localhost:3123/bombanana?room=${R}`); await p.fill("#lName", n); await p.fill("#lRoom", R); await p.click("#lJoin"); await sleep(500); }
  await A.click(".rolecard:has-text('見ざる')"); await sleep(250);
  await B.click(".rolecard:has-text('聞かざる')"); await sleep(250);
  await C.click(".rolecard:has-text('言わざる')"); await sleep(400);
  check((await A.locator(".rolecard.mine").textContent()).includes("見ざる"), "役割を選べる");
  await A.screenshot({ path: SH + "bb1_lobby_pc.png", fullPage: true });
  await A.selectOption("select >> nth=0", "custom"); await sleep(400);
  // カスタム: ケーブルだけにする
  const st = await A.evaluate(() => S.settings.custom);
  await A.evaluate((cu) => send({ t: "settings", s: { custom: { ...cu, mods: ["cable"], chaos: [], mistakes: 3 } } }), st); await sleep(400);
  await A.click("button:has-text('スタート')"); await sleep(4500);
  check(await A.locator("#stage").count() === 1 && await B.locator("#stage").count() === 1, "3Dの舞台が出る");
  check(await A.evaluate(() => S.game.step) === "play", "爆弾スタート");
  check(await A.evaluate(() => S.game.bomb.mods[0].colors) === null && Array.isArray(await B.evaluate(() => S.game.bomb.mods[0].colors)), "見ざるに色なし・聞かざるに色あり");
  check(await C.locator(".man table").count() > 0, "言わざるにマニュアル");
  check(await C.locator("#sayIn").count() === 0 && await A.locator("#sayIn").count() === 1, "言わざるは話せない");
  check(await A.evaluate(() => !!document.querySelector(".pb-chat")) === false, "全員の文字チャットは出ない");
  // 声のルート
  await B.fill("#sayIn", "奥から2本目"); await B.press("#sayIn", "Enter"); await sleep(500);
  check((await A.locator("#caps").textContent()).includes("奥から2本目") && (await C.locator("#caps").textContent()).includes("奥から2本目"), "聞かざるの声→見ざる・言わざる");
  await A.fill("#sayIn", "了解"); await A.press("#sayIn", "Enter"); await sleep(500);
  check((await C.locator("#caps").textContent()).includes("了解") && !(await B.locator("#caps").textContent()).includes("了解"), "見ざるの声→言わざるだけ(聞かざるに届かない)");
  // エモート(聞かざるに見える)
  await C.click(".emos button >> nth=0"); await sleep(600);
  await B.screenshot({ path: SH + "bb2_deaf_pc.png" });
  await A.screenshot({ path: SH + "bb3_blind_pc.png" });
  await C.screenshot({ path: SH + "bb4_mute_sp.png", fullPage: true });
  // 正解のケーブルを3Dでクリック
  const m0 = await B.evaluate(() => S.game.bomb.mods[0]);
  const man = await C.evaluate(() => MANUAL.cable);
  const idx = m0.colors.indexOf(man[m0.n][m0.led]);
  await A.evaluate(() => scene3d.focus(0)); await sleep(400);
  const pos = await A.evaluate((idx) => {
    const st = scene3d._st, g = st.modGroups[0], cam = scene3d.camera, T = scene3d.three; let p = null;
    g.traverse((o) => { if (!p && o.isMesh && o.userData.pick && o.userData.pick.part === idx && o.geometry.type === "CylinderGeometry") { p = new T.Vector3(); o.getWorldPosition(p); } });
    p.project(cam); const r = document.getElementById("stage").getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, idx);
  await A.mouse.move(pos.x, pos.y); await sleep(300);
  check((await A.locator("#readout").textContent()).includes(`奥から${idx + 1}本目`), "触ると読み上げ(ケーブル何本目)");
  await A.mouse.click(pos.x, pos.y); await sleep(800);
  check(await A.evaluate(() => S.game.step) === "clear", "3Dでクリックして正しいケーブルを切ると解除");
  check((await B.locator("#ov").textContent()).includes("解除成功"), "結果表示");
  await B.screenshot({ path: SH + "bb5_clear.png" });
  await A.click("#ov button:has-text('もう一度')"); await sleep(4500);
  check(await A.evaluate(() => S.game.step) === "play", "もう一度遊べる");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
