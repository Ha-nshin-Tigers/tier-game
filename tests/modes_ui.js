const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errs = [];
  const mk = async (url, name, room, create) => {
    const p = await (await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(url); await p.fill("#lName", name); if (create) await p.fill("#lRoom", room); await p.click("#lJoin"); await sleep(500); return p;
  };
  const R = "V" + Math.random().toString(36).slice(2, 6).toUpperCase();
  // 単独: 爆弾回し
  const A = await mk("http://localhost:3123/bomb", "あきら", R, true), B = await mk("http://localhost:3123/bomb?room=" + R, "べに");
  await A.screenshot({ path: "m1_bomb_lobby.png", fullPage: true });
  console.log("title:", await A.title(), "/ h1:", await A.locator("#game h1").textContent(), "/ URL:", A.url());
  // 大会: 試合の並び
  const R2 = "W" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const C = await mk("http://localhost:3123/party", "ちか", R2, true), D = await mk("http://localhost:3123/party?room=" + R2, "だい");
  await C.click("button:has-text('+ 💣 爆弾回し')"); await sleep(200);
  await C.click("button[aria-label='4試合目を上へ']"); await sleep(200);
  await C.screenshot({ path: "m2_party_playlist.png", fullPage: true });
  console.log("playlist:", (await C.locator(".playlist li .nm").allTextContents()).join(" → "));
  // ホーム
  const H = await (await browser.newContext({ viewport: { width: 390, height: 664 } })).newPage();
  await H.goto("http://localhost:3123/"); await H.screenshot({ path: "m3_home.png", fullPage: true });
  console.log("home cards:", (await H.locator(".game .name").allTextContents()).join(" / "));
  console.log("errors", errs);
  await browser.close();
})();
