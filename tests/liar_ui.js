const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOM = "B" + Math.random().toString(36).slice(2, 6).toUpperCase();
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const mk = async (name, w, hh) => {
    const p = await (await browser.newContext({ viewport: { width: w, height: hh } })).newPage();
    p.on("pageerror", (e) => errs.push(name + ": " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|ERR_TUNNEL|ERR_PROXY|net::/.test(m.text())) errs.push(name + ": " + m.text()); });
    return p;
  };
  const names = ["あきら", "べに", "ちか", "だい"];
  const pages = [];
  for (let i = 0; i < 4; i++) pages.push(await mk(names[i], i === 1 ? 390 : 1200, i === 1 ? 844 : 900));
  await pages[0].goto("http://localhost:3123/liar"); await pages[0].fill("#lName", names[0]); await pages[0].fill("#lRoom", ROOM); await pages[0].click("#lJoin");
  for (let i = 1; i < 4; i++) { await pages[i].goto("http://localhost:3123/liar?room=" + ROOM + ""); await pages[i].fill("#lName", names[i]); await pages[i].click("#lJoin"); }
  await sleep(4000);
  await pages[0].screenshot({ path: "l1_lobby_pc.png" });
  await pages[0].click("text=ゲーム開始"); await sleep(2500);
  await pages[0].screenshot({ path: "l2_play_pc.png" });
  await pages[1].screenshot({ path: "l3_play_sp.png", fullPage: true });
  // 手番の人を探して2枚出す
  // 自分の番の画面を探す(番が回ってくるまで最大6秒待つ)
  const turnPage = async () => { for (let k = 0; k < 30; k++) { for (const p of pages) if (await p.locator("text=あなたの番です").count()) return p; await sleep(200); } return null; };
  let tp = await turnPage();
  const btns = tp.locator(".cards button.pc");
  await btns.nth(0).click(); await btns.nth(1).click();
  await tp.click("button.primary.big"); await sleep(1200);
  await pages[0].screenshot({ path: "l4_played_pc.png" });
  // 次の人がスタンプ→ウソつき
  tp = await turnPage();
  // スマホ幅の画面はスタンプの列がたたまれている(仕様)ので、たたまれていれば開いてから押す
  if (await tp.locator(".stampToggle").isVisible() && await tp.locator(".stamps.closed").count()) { await tp.click(".stampToggle"); await sleep(200); }
  await tp.click(".stamps button >> nth=1"); await sleep(400);
  for (const p of pages) if (p !== tp) { await p.screenshot({ path: "l5_stamp_pc.png" }); break; }
  await tp.click("button.liar"); await sleep(2600);
  await pages[0].screenshot({ path: "l6_reveal_pc.png" });
  // 撃たれる人が引き金
  let tg = null; for (const p of pages) if (await p.locator("button.trigger").count()) tg = p;
  await tg.screenshot({ path: "l7_target_view.png" });
  await tg.click("button.trigger"); await sleep(900);
  await pages[0].screenshot({ path: "l8_shot_pc.png" });
  await pages[1].screenshot({ path: "l9_shot_sp.png" });
  // 2D 表示への切り替え
  await pages[2].click("text=3D表示"); await sleep(500);
  await pages[2].screenshot({ path: "l10_2d.png" });
  console.log("SP scrollWidth", await pages[1].evaluate(() => document.documentElement.scrollWidth));
  console.log("errors", errs);
  await browser.close();
})();
