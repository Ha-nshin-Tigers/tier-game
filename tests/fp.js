const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const R = "P" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const ps = [], errs = [];
  const names = ["あきら", "べに", "ちか", "だい", "えり", "ふう"];
  for (let i = 0; i < 6; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 664 } : { width: 1100, height: 760 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    if (i >= 2) await p.addInitScript(() => { window.__no3d = true; });
    await p.goto("http://localhost:3123/liar" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R);
    if (i >= 2) await p.evaluate(() => localStorage.setItem("liar:view", JSON.stringify("2d")));
    await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  await sleep(4000); await ps[0].click("text=ゲーム開始"); await sleep(2500);
  const A = ps[0], B = ps[1];
  await A.screenshot({ path: "fp_front_pc.png", timeout: 60000 });
  await B.screenshot({ path: "fp_front_sp.png", timeout: 60000 });
  // ドラッグで右を向く(指を左へ動かす)
  const box = await A.locator("#stage canvas").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await A.mouse.move(cx, cy); await A.mouse.down(); for (let k = 1; k <= 10; k++) await A.mouse.move(cx - k * 30, cy); await A.mouse.up(); await sleep(900);
  await A.screenshot({ path: "fp_right_pc.png", timeout: 60000 });
  await A.mouse.move(cx, cy); await A.mouse.down(); for (let k = 1; k <= 20; k++) await A.mouse.move(cx + k * 30, cy); await A.mouse.up(); await sleep(900);
  await A.screenshot({ path: "fp_left_pc.png", timeout: 60000 });
  await A.click(".lookFront"); await sleep(900);
  // スマホ: スワイプで左を向いてスタンプを受ける
  const sb = await B.locator("#stage canvas").boundingBox();
  await B.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await B.mouse.down(); for (let k = 1; k <= 8; k++) await B.mouse.move(sb.x + sb.width / 2 + k * 25, sb.y + sb.height / 2); await B.mouse.up(); await sleep(900);
  await B.screenshot({ path: "fp_swipe_sp.png", timeout: 60000 });
  console.log("frontBtn visible on A after reset:", await A.locator(".lookFront").isVisible());
  console.log("errors", errs);
  await browser.close();
})();
