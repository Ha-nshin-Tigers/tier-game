const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
  const mk = async (mob) => (await b.newContext(mob ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : {})).newPage();
  const R = "L" + Math.random().toString(36).slice(2, 5).toUpperCase();
  const A = await mk(true), B = await mk(), C = await mk(), errs = [];
  for (const p of [A, B, C]) p.on("pageerror", (e) => errs.push(e.message));
  for (const [p, n] of [[A, "あき"], [B, "べに"], [C, "ちか"]]) { await p.goto(`http://localhost:3123/bombanana?room=${R}`); await p.fill("#lName", n); await p.fill("#lRoom", R); await p.click("#lJoin"); await sleep(400); }
  await A.click(".rolecard:has-text('見ざる')"); await sleep(200); await B.click(".rolecard:has-text('聞かざる')"); await sleep(200); await C.click(".rolecard:has-text('言わざる')"); await sleep(300);
  await A.click("button:has-text('スタート')"); await sleep(4500);
  await A.evaluate(() => setFocus(0)); await sleep(500);
  // 見ざる(スマホ)のケーブルの位置
  const pos = await A.evaluate(() => { const g = scene3d._st.modGroups[0], T = scene3d.three; let p = null; g.traverse((o) => { if (!p && o.isMesh && o.userData.pick && o.userData.pick.act === "cut") { p = new T.Vector3(); o.getWorldPosition(p); } }); p.project(scene3d.camera); const r = document.getElementById("stage").getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; });
  const fire = (type, x, y) => A.evaluate(([type, x, y]) => document.getElementById("stage").dispatchEvent(new PointerEvent(type, { pointerType: "touch", clientX: x, clientY: y, bubbles: true, isPrimary: true })), [type, x, y]);
  const kind0 = await B.evaluate(() => S.game.bomb.mods[0].kind);
  await fire("pointerdown", pos.x, pos.y); await sleep(550); await fire("pointerup", pos.x, pos.y); await sleep(500);
  const cut = await B.evaluate(() => S.game.bomb.mods[0].cut ? S.game.bomb.mods[0].cut.some(Boolean) : null);
  check(kind0 === "cable" && (await A.locator("#readout").textContent()).includes("本目") && cut === false, "長押し: ケーブルを読み上げるだけで切らない: " + await A.locator("#readout").textContent());
  await fire("pointerdown", pos.x, pos.y); await sleep(80); await fire("pointerup", pos.x, pos.y); await sleep(600);
  check(await B.evaluate(() => S.game.bomb.mods[0].cut.some(Boolean)), "短いタップ: ケーブルを切る");
  // 指の操作は合成のイベントで再現しているため、カメラ操作のライブラリが「本物の指がない」と言うエラーは除く(実機では出ない)
  const real = errs.filter((m) => !/setPointerCapture/.test(m));
  check(real.length === 0, "ページエラーなし " + JSON.stringify(real.slice(0, 3)));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
