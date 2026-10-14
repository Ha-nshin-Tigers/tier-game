const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const R = "G" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const errs = [], ps = [], names = ["あきら", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 664 } : { width: 1100, height: 780 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/fonts|404|net::/.test(m.text())) errs.push(names[i] + ": " + m.text()); });
    await p.goto("http://localhost:3123/shotgun" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B] = ps;
  await sleep(3500);
  await A.screenshot({ path: "s1_lobby_pc.png", fullPage: true });
  await A.click("button:has-text('ゲーム開始')"); await sleep(1200);
  await A.screenshot({ path: "s2_load_pc.png" });
  await sleep(3200);
  const fits = async (tag) => { const m = await B.evaluate(() => ({ b: document.documentElement.scrollHeight, ih: innerHeight })); console.log(tag, m.b, "/", m.ih, m.b <= m.ih + 1 ? "1画面に収まる" : "はみ出し"); };
  await fits("turn");
  const turnPage = async () => { for (const p of ps) if (await p.locator(".say:has-text('あなたの番')").count()) return p; return null; };
  let shotTaken = 0;
  for (let k = 0; k < 14; k++) {
    const tp = await turnPage();
    if (!tp) { await sleep(700); continue; }
    if (k === 0) await tp.screenshot({ path: "s3_myturn.png" });
    // アイテムがあれば1つ使ってみる(相手選択が必要なものは飛ばす)
    const ib = tp.locator(".ibtn:not([disabled])");
    if (await ib.count() && k % 2 === 0) {
      const label = await ib.first().getAttribute("aria-label");
      if (!/ジャマー|アドレナリン/.test(label)) { await ib.first().click(); await sleep(900); if (k === 0) await (tp === A ? B : A).screenshot({ path: "s4_item_seen.png" }); continue; }
    }
    const shoot = tp.locator(".shootbtn");
    await shoot.first().click(); shotTaken++;
    await sleep(650);
    if (shotTaken === 1) { await A.screenshot({ path: "s5_shot_pc.png" }); await B.screenshot({ path: "s6_shot_sp.png" }); }
    await sleep(2200);
    if (await A.locator("text=優勝").count()) break;
  }
  await fits("after");
  await B.screenshot({ path: "s7_sp.png" });
  console.log("errors", errs);
  await browser.close();
})();
