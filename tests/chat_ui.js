const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "K" + Math.random().toString(36).slice(2, 5).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const p = await (await b.newContext(i === 1 ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 900 } })).newPage();
    p.on("pageerror", (e) => errs.push(e.message)); ps.push(p);
  }
  const [A, B, C] = ps;
  for (const [p, nm] of [[A, "あき"], [B, "べに"]]) { await p.goto(`http://localhost:3123/heat?room=${R}`); await p.fill("#lName", nm); await p.fill("#lRoom", R); await p.click("#lJoin"); await sleep(300); }
  await C.goto(`http://localhost:3123/heat`); await C.fill("#lName", "ちか"); await C.fill("#lRoom", R + "X"); await C.click("#lJoin");
  await sleep(2000);
  check(await A.locator(".pb-chat .pb-cbtn").count() === 1 && await B.locator(".pb-chat .pb-cbtn").count() === 1, "部屋に入ると右下にチャットボタン");
  await A.click(".pb-cbtn"); await sleep(200);
  await A.fill(".pb-chat input", "よろしく！"); await A.press(".pb-chat input", "Enter"); await sleep(500);
  check(await A.locator(".pb-cm.me:has-text('よろしく！')").count() === 1, "送ったメッセージが自分の欄に");
  check(await B.locator(".pb-badge").textContent() === "1" && await B.locator(".pb-peek:has-text('あき: よろしく！')").isVisible(), "相手には未読の数と、ちらっとプレビュー");
  check(await C.locator(".pb-badge").count() === 0, "ほかの部屋には届かない");
  await B.screenshot({ path: SHOT + "chat_peek_sp.png" });
  await B.click(".pb-cbtn"); await sleep(200);
  check(await B.locator(".pb-cm:has-text('よろしく！') small").textContent() === "あき" && await B.locator(".pb-badge").count() === 0, "開くと名前つきで読める・未読が消える");
  await B.fill(".pb-chat input", "<b>こんにちは</b>"); await B.click(".pb-chat form button"); await sleep(500);
  check(await A.locator(".pb-cm:has-text('<b>こんにちは</b>')").count() === 1, "HTMLはそのまま文字として表示(安全)");
  await B.screenshot({ path: SHOT + "chat_open_sp.png" });
  // あとから入った人にも履歴
  const D = await (await b.newContext()).newPage(); D.on("pageerror", (e) => errs.push(e.message));
  await D.goto(`http://localhost:3123/heat?room=${R}`); await D.fill("#lName", "だい"); await D.fill("#lRoom", R); await D.click("#lJoin"); await sleep(2200);
  await D.click(".pb-cbtn"); await sleep(200);
  check(await D.locator(".pb-cm").count() === 2, "あとから入った人も前のメッセージが読める");
  // ロビー(パーティー)でもチャット
  await A.goto("http://localhost:3123/lobby"); await A.fill("#jName", "あき"); await A.click("#jCreate"); await sleep(2200);
  check(await A.locator(".pb-chat .pb-cbtn").count() === 1, "パーティーの画面にもチャット");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
