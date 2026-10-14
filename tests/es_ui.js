const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = { "り": "りす", "す": "すいか", "か": "からす", "ら": "らくだ", "だ": "だるま", "ま": "まくら", "ご": "ごま", "ぱ": "ぱせり", "め": "めだか", "さ": "さる", "る": "るびー", "び": "びーる", "な": "なす", "い": "いす", "せ": "せみ", "み": "みかさ", "こ": "こま", "つ": "つみき", "き": "きつね", "ね": "ねこ", "や": "やかた", "た": "たこ", "し": "しか", "ろ": "ろば" };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "J" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const errs = [], ps = [], names = ["あきら", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 700 } : { width: 1000, height: 900 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    await p.goto("http://localhost:3123/eshiri" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B, C] = ps; await sleep(500);
  await A.selectOption("select >> nth=4", "0"); await sleep(200);   // 描く時間なし(テストのため)
  await A.screenshot({ path: "e1_lobby.png", fullPage: true });
  const draw = async (p, k) => {
    const box = await p.locator("canvas.drawpad").boundingBox();
    const x0 = box.x + box.width * 0.2, y0 = box.y + box.height * (0.3 + k * 0.1);
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(x0 + i * box.width * 0.05, y0 + Math.sin(i / 2) * box.height * 0.1);
    await p.mouse.up();
  };
  const myTurn = async () => { for (const p of ps) if (await p.locator(".say:has-text('あなたの番')").count()) return p; return null; };
  const play = async (p, wrongGuess) => {
    const start = await p.locator(".word").count() ? (await p.locator(".word").textContent()).replace(/[「」]/g, "") : null;
    let need;
    if (p.__mobileShot !== true && p === B) { const m = await B.evaluate(() => ({ b: Math.round(document.getElementById("submitBtn").getBoundingClientRect().bottom), ih: innerHeight })); console.log("スマホで自分の番(「描けた！」ボタンの下端):", m.b, "/", m.ih, m.b <= m.ih ? "1画面に収まる" : "スクロールあり"); await B.screenshot({ path: "e3_turn_sp.png" }); p.__mobileShot = true; }
    if (await p.locator("input[aria-label='前の絵は何？']").count()) {
      const g = wrongGuess || p.__expect || "ねこ";
      await p.fill("input[aria-label='前の絵は何？']", g); need = [...g].filter((x) => x !== "ー").slice(-1)[0];
    } else need = [...start].filter((x) => x !== "ー").slice(-1)[0];
    const word = W[need] || need + "かめ"; p.__last = word;
    await p.fill("input[aria-label='描く言葉']", word);
    await draw(p, 0); await draw(p, 1);
    await p.click("#submitBtn"); await sleep(500);
    return word;
  };
  // 1本のしりとり(前の絵だけ)
  await A.click("button:has-text('スタート')"); await sleep(800);
  await (await myTurn() === A ? B : A).screenshot({ path: "e2_wait.png" });
  let words = [];
  for (let k = 0; k < 3; k++) {
    const p = await myTurn();
    if (!p) { console.log("自分の番の人が見つからない"); break; }
    if (k > 0) p.__expect = words[k - 1];
    if (k === 1) await p.screenshot({ path: "e4_turn2.png" });
    words.push(await play(p, k === 2 ? "ねこ" : null));
  }
  await sleep(600);
  console.log("答え合わせ:", await A.locator(".big2").textContent());
  await A.screenshot({ path: "e5_reveal_pc.png", fullPage: true });
  await B.screenshot({ path: "e6_reveal_sp.png", fullPage: true });
  const pix = await A.evaluate(() => [...document.querySelectorAll("canvas.drawview")].map((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) n++; return n; }));
  console.log("答え合わせの絵(黒い画素数):", pix.join(", "));
  // 実況モード
  await A.click("button:has-text('もう一度遊ぶ')"); await sleep(400);
  await A.selectOption("select >> nth=2", "live"); await sleep(200);
  await A.click("button:has-text('スタート')"); await sleep(800);
  const dp = await myTurn(), viewer = ps.find((p) => p !== dp);
  await draw(dp, 0); await sleep(500);
  const seen = await viewer.evaluate(() => { const c = document.querySelector(".watch canvas"); if (!c) return -1; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) n++; return n; });
  console.log("実況: ほかの人に見えている線の画素数", seen);
  await viewer.screenshot({ path: "e7_live.png" });
  await A.click("button:has-text('待機画面に戻す')"); await A.click("button:has-text('もう一度押すと実行')"); await sleep(400);
  // 全員同時
  await A.selectOption("select >> nth=0", "sim"); await sleep(300);
  await A.click("button:has-text('スタート')"); await sleep(800);
  for (let r = 0; r < 3; r++) {
    for (const p of ps) { if (await p.locator(".say:has-text('あなたの番')").count()) await play(p); }
    await sleep(700);
  }
  console.log("全員同時の答え合わせ:", await A.locator(".big2").count() ? await A.locator(".big2").textContent() : "まだ");
  await C.screenshot({ path: "e8_sim_reveal.png", fullPage: true });
  console.log("errors", errs);
  await browser.close();
})();
