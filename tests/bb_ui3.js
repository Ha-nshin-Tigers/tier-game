const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SH = require("path").join(__dirname, ".shots") + "/";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
  const mk = async (mob) => (await b.newContext(mob ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } })).newPage();
  const R = "D" + Math.random().toString(36).slice(2, 5).toUpperCase(), errs = [];
  const A = await mk(), B = await mk(), C = await mk(true), X = await mk();
  for (const p of [A, B, C, X]) p.on("pageerror", (e) => errs.push(e.message));
  for (const [p, n] of [[A, "あき"], [B, "べに"], [C, "ちか"], [X, "えく"]]) { await p.goto(`http://localhost:3123/bombanana?room=${R}`); await p.fill("#lName", n); await p.fill("#lRoom", R); await p.click("#lJoin"); await sleep(400); }
  // 抜けた人の役割が残らない
  await X.click(".rolecard:has-text('見ざる')"); await sleep(300);
  check((await A.locator(".rolecard:has-text('見ざる') .who").textContent()).includes("えく"), "4人目が見ざるを選ぶ");
  await X.close(); await sleep(800);
  check((await A.locator(".rolecard:has-text('見ざる') .who").textContent()).includes("空き"), "その人が抜けると見ざるは空きに戻る(「退出した人」が残らない)");
  await A.click(".rolecard:has-text('見ざる')"); await sleep(200); await B.click(".rolecard:has-text('聞かざる')"); await sleep(200); await C.click(".rolecard:has-text('言わざる')"); await sleep(300);
  check(await A.evaluate(() => S.settings.mode) === "tutorial", "はじめは「練習」モード");
  await A.click("button:has-text('スタート')"); await sleep(4500);
  check((await A.locator(".hints").textContent()).includes("ケーブル") && (await B.locator(".hints").textContent()).includes("ランプの色"), "練習: 見ざる・聞かざるに役割ごとのヒント");
  check((await C.locator(".hints").textContent()).includes("マニュアル"), "練習: 言わざるにもヒント");
  await B.evaluate(() => setFocus(0)); await sleep(500); await B.screenshot({ path: SH + "bb9_tutorial_deaf.png" });
  await B.evaluate(() => setFocus(null)); await sleep(400); await B.screenshot({ path: SH + "bb9b_marks_deaf.png" });
  await C.screenshot({ path: SH + "bb10_tutorial_mute_sp.png", fullPage: true });
  // メモリ: 何百回状態が届いても、形・画像の数が増え続けない
  const info = () => A.evaluate(() => ({ g: scene3d.renderer.info.memory.geometries, t: scene3d.renderer.info.memory.textures }));
  const infoB = () => B.evaluate(() => ({ g: scene3d.renderer.info.memory.geometries, t: scene3d.renderer.info.memory.textures }));
  for (let k = 0; k < 6; k++) { await B.evaluate((k) => act("point", { at: [k * 0.1, 1, 0] }), k); await sleep(300); }
  const b0 = await infoB();
  for (let k = 0; k < 40; k++) { await B.evaluate((k) => act("point", { at: [0.1 * (k % 5), 1, 0.1] }), k); await sleep(260); }
  // モジュールを何度も作り直させる(ダイヤルのように状態が変わる操作の代わりに、見た目の作り直しを直接)
  await B.evaluate(() => { for (let k = 0; k < 200; k++) { scene3d._st.modKeys = []; scene3d.update(S.game); } }); await sleep(1500);
  const b1 = await infoB();
  check(b1.g <= b0.g + 40 && b1.t <= b0.t + 10, `指差し40回・作り直し200回でも形・画像が増え続けない(形 ${b0.g}→${b1.g}・画像 ${b0.t}→${b1.t})`);
  // キーボード(見ざる・PC)
  await A.click("#stage", { position: { x: 5, y: 5 } }).catch(() => {}); await sleep(200);
  await A.keyboard.press("1"); await sleep(300);
  check((await A.locator("#readout").textContent()).includes("モジュール1"), "数字キーでモジュールへ・読み上げ: " + (await A.locator("#readout").textContent()));
  await A.keyboard.press("ArrowRight"); await sleep(300);
  const r2 = await A.locator("#readout").textContent();
  check(r2.length > 0, "→キーで次の部品をさわる: " + r2);
  // 正しいケーブルをキーボードで切る
  const m0 = await B.evaluate(() => S.game.bomb.mods.findIndex((m) => m.kind === "cable"));
  const mods = await B.evaluate(() => S.game.bomb.mods), man = await C.evaluate(() => MANUAL.cable), cm = mods[m0];
  const want = cm.colors.indexOf(man[cm.n][cm.led]);
  await A.keyboard.press(String(m0 + 1)); await sleep(200);
  for (let k = 0; k < 20; k++) { const t = await A.locator("#readout").textContent(); if (t.includes(`奥から${want + 1}本目`)) break; await A.keyboard.press("ArrowRight"); await sleep(150); }
  await A.keyboard.press("Enter"); await sleep(600);
  check(await B.evaluate((i) => S.game.bomb.mods[i].solved, m0), "Enter で正しいケーブルを切って解除");
  // スマホの長押し=さわる(押さない)
  check(await C.evaluate(() => typeof onLong) === "function", "長押しの処理がある");
  // 方向も解く(練習を最後まで)
  const md = await B.evaluate(() => S.game.bomb.mods.findIndex((m) => m.kind === "direction"));
  const DIR = await C.evaluate(() => MANUAL.direction);
  for (let k = 0; k < 4; k++) {
    const m = await B.evaluate((i) => S.game.bomb.mods[i], md); if (m.solved) break;
    const d = DIR.find(([ns]) => ns.includes(m.num))[1][["red", "blue", "green", "yellow"].indexOf(m.led)];
    await A.evaluate(([i, d]) => doAct({ mod: i, part: d, act: "dir" }), [md, d]); await sleep(500);
  }
  await sleep(500);
  check(await A.evaluate(() => S.game.step) === "clear", "練習をクリア");
  await sleep(1200); await B.screenshot({ path: SH + "bb11_confetti.png" });
  const before = await A.evaluate(() => S.game.role);
  await A.click("#ov button:has-text('役割を回して')"); await sleep(4500);
  const after = await A.evaluate(() => S.game.role), nx = { blind: "deaf", deaf: "mute", mute: "blind" };
  check(Object.keys(before).every((id) => after[id] === nx[before[id]]), "「役割を回して」で全員の役割が一つずつ回る");
  check(await A.evaluate(() => myRole()) === "deaf" && await A.locator(".man").count() === 0, "画面も新しい役割に切り替わる");
  check(await C.evaluate(() => myRole()) === "blind" && await C.locator("#sayIn").count() === 1, "言わざるだった人が見ざるになり話せる");
  // 爆発の演出でエラーが出ない
  await A.evaluate(() => scene3d.boom()); await sleep(800); await A.screenshot({ path: SH + "bb12_boom.png" });
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs.slice(0, 3)));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
