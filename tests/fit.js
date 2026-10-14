const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const R = "F" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const sizes = [[390, 664, "iphone"], [360, 640, "android"], [844, 390, "landscape"], [1200, 800, "pc"]];
  const ps = [], errs = [];
  for (let i = 0; i < sizes.length; i++) {
    const [w, hh] = sizes[i];
    const p = await (await browser.newContext({ viewport: { width: w, height: hh }, hasTouch: w < 900, isMobile: w < 900 })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:3123/liar" + (i ? "?room=" + R : "")); await p.fill("#lName", "P" + i); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  await sleep(4000);
  await ps[0].click("text=ゲーム開始"); await sleep(2500);
  const measure = async (tag) => { for (let i = 0; i < ps.length; i++) { const m = await ps[i].evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, compact: document.body.classList.contains("compact"), stageH: document.getElementById("stage").clientHeight })); console.log(tag, sizes[i][2], JSON.stringify(m), m.sh <= m.ih + 1 && m.sw <= m.iw + 1 ? "収まる" : "はみ出し"); } };
  await measure("play");
  for (let i = 0; i < 4; i++) await ps[i].screenshot({ path: `fit_play_${sizes[i][2]}.png`, timeout: 60000 });
  // 手番の人がカードを選んで出す → 次の人が指摘
  const turn = async () => { for (const p of ps) if (await p.locator(".say >> text=あなたの番です").count()) return p; };
  let tp = await turn(); await tp.locator(".cards button.pc").nth(0).click(); await tp.locator(".cards button.pc").nth(1).click();
  await tp.screenshot({ path: "fit_select.png", timeout: 60000 });
  await tp.click("button.primary.big"); await sleep(800);
  tp = await turn(); await tp.click("button.liar"); await sleep(2500);
  await measure("reveal");
  for (const p of ps) if (await p.locator("button.trigger").count()) await p.screenshot({ path: "fit_trigger.png", timeout: 60000 });
  // メニューとスタンプ
  await ps[0].click(".menuBtn"); await sleep(400); await ps[0].screenshot({ path: "fit_menu.png", timeout: 60000 });
  await ps[0].click(".closeDrawer"); await sleep(300);
  await ps[1].click(".stampToggle"); await sleep(300); await ps[1].screenshot({ path: "fit_stamp.png", timeout: 60000 });
  console.log("errors", errs);
  await browser.close();
})();
