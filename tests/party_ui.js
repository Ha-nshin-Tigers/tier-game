const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "U" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const errs = [], ps = [];
  const names = ["あきら", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 664 } : { width: 1000, height: 820 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    await p.goto("http://localhost:3123/party" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B, C] = ps;
  await sleep(600);
  await B.screenshot({ path: "p1_lobby_sp.png", fullPage: true });
  await A.click("text=スタート"); await sleep(1200);
  await B.screenshot({ path: "p2_intro_sp.png" });
  await sleep(6500);
  const fits = async (tag) => { const m = await B.evaluate(() => ({ main: document.getElementById("main").getBoundingClientRect().bottom, ih: innerHeight })); console.log(tag, "ミニゲームの下端", Math.round(m.main), "/ 画面の高さ", m.ih, m.main <= m.ih ? "1画面に収まる" : "はみ出し"); };
  // 橋
  await fits("bridge");
  await A.click(".bridge >> nth=0"); await B.click(".bridge >> nth=0"); await sleep(200);
  await B.screenshot({ path: "p3_bridge_pick_sp.png" });
  await C.click(".bridge >> nth=2"); await sleep(900);
  await B.screenshot({ path: "p4_bridge_show_sp.png" });
  await A.screenshot({ path: "p4_bridge_show_pc.png" });
  for (let r = 0; r < 2; r++) { await sleep(6000); await A.click(".bridge >> nth=0"); await B.click(".bridge >> nth=1"); await C.click(".bridge >> nth=2"); await sleep(300); }
  await sleep(6500);
  await B.screenshot({ path: "p5_result_sp.png" });
  await A.click("text=次のゲームへ"); await sleep(7600);
  // 爆弾
  await fits("bomb");
  const holderPage = async () => { for (const p of ps) if (await p.locator(".hot").count()) return p; return null; };
  let hp = await holderPage();
  await (hp === B ? A : B).screenshot({ path: "p6_bomb_watch.png" });
  if (hp) { await hp.screenshot({ path: "p7_bomb_holder.png" }); await sleep(800); await hp.click("button.seat:not([disabled]) >> nth=0"); }
  // 爆発まで待つ
  for (let k = 0; k < 60; k++) { if (await A.locator(".boom").count()) break; await sleep(500); }
  await B.screenshot({ path: "p8_bomb_boom_sp.png" });
  for (let k = 0; k < 120; k++) { if (await A.locator("text=次のゲームへ").count()) break; await sleep(500); }
  await A.click("text=次のゲームへ"); await sleep(7600);
  // 料理
  await fits("memory-show");
  await B.screenshot({ path: "p9_mem_show_sp.png" });
  await sleep(4300);
  await fits("memory-input");
  await B.click(".gbtn >> nth=0"); await B.click(".gbtn >> nth=3"); await sleep(200);
  await B.screenshot({ path: "p10_mem_input_sp.png" });
  for (const p of ps) { if (p !== B) await p.click(".gbtn >> nth=1"); await p.click("button:has-text('完成！')"); }
  await sleep(800);
  await B.screenshot({ path: "p11_mem_result_sp.png", fullPage: true });
  for (let r = 0; r < 2; r++) { await sleep(6000); await sleep(4300); for (const p of ps) { await p.click(".gbtn >> nth=2"); await p.click("button:has-text('完成！')"); } await sleep(500); }
  await sleep(6500);
  for (let k = 0; k < 60; k++) { if (await B.locator('.champ').count()) break; if (await A.locator("button:has-text('総合結果へ')").count()) await A.click("button:has-text('総合結果へ')").catch(() => {}); await sleep(500); }
  await B.screenshot({ path: "p12_final_sp.png", fullPage: true });
  console.log("SP横はみ出し", await B.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  console.log("errors", errs);
  await browser.close();
})();
