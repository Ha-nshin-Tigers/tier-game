const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errs = [];
  const mk = async (w, hh) => { const p = await (await browser.newContext({ viewport: { width: w, height: hh } })).newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p; };
  const P = await mk(1100, 800), M = await mk(390, 844);
  await P.goto("http://localhost:3123/"); await P.screenshot({ path: "h_pc.png", fullPage: true });
  await M.goto("http://localhost:3123/"); await M.screenshot({ path: "h_sp.png", fullPage: true });
  console.log("SP scrollWidth", await M.evaluate(() => document.documentElement.scrollWidth));
  await M.click("text=みんなでティア表"); await M.waitForLoadState(); console.log("click tier ->", M.url());
  await M.fill("#lName", "てすと"); await M.click("#lCreate"); await sleep(600);
  const inv = await M.inputValue("#inviteLink"); console.log("tier URL", M.url(), "invite", inv);
  // 古い形式のリンクで別の人が入れるか
  const Q = await mk(390, 844); const code = inv.split("room=")[1];
  await Q.goto("http://localhost:3123/?room=" + code); console.log("old link ->", Q.url());
  await Q.fill("#lName", "ふるい"); await Q.click("#lJoin"); await sleep(600);
  console.log("players seen by M:", await M.locator(".players li").count());
  // 部屋を出たらティア表の入室画面(/tier)に戻る
  await M.click("text=部屋を出る"); await M.click("text=もう一度押すと実行"); await sleep(300); console.log("after leave", M.url());
  await M.click("text=← ゲームを選ぶ"); await M.waitForLoadState(); console.log("back ->", M.url());
  await M.click("text=かくれナンバー"); await M.waitForLoadState(); console.log("click number ->", M.url());
  console.log("errors", errs);
  await browser.close();
})();
