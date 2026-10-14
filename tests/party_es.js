const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = { "り": "りす", "す": "すいか", "か": "からす", "ら": "らくだ", "だ": "だるま", "ま": "まくら", "ご": "ごま", "こ": "こま", "ね": "ねこ", "た": "たこ" };
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "P" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const errs = [], ps = [], names = ["あきら", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await browser.newContext({ viewport: mob ? { width: 390, height: 700 } : { width: 1000, height: 900 }, isMobile: mob, hasTouch: mob })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    await p.goto("http://localhost:3123/party" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A, B, C] = ps; await sleep(400);
  // 並びを「絵しりとり」だけにする(× で全部消してから追加)
  await A.evaluate(() => send({ t: "setPlaylist", list: ["eshiri"] })); await sleep(200);
  check(await A.locator("button:has-text('絵しりとり')").count() > 0, "大会のゲーム追加ボタンに絵しりとりがある");
  await A.click("button:has-text('スタート')");
  await A.waitForFunction(() => S.phase === "play", null, { timeout: 20000 });
  // 観戦者が途中から入る
  const V = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  V.on("pageerror", (e) => errs.push("観戦: " + e.message));
  await V.goto("http://localhost:3123/party?room=" + R); await V.fill("#lName", "みる"); await V.click("#lJoin"); await sleep(500);
  const draw = async (p, k) => {
    const box = await p.locator("canvas.drawpad").boundingBox();
    const x0 = box.x + box.width * 0.2, y0 = box.y + box.height * (0.3 + k * 0.1);
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(x0 + i * box.width * 0.05, y0 + Math.sin(i / 2) * box.height * 0.1);
    await p.mouse.up();
  };
  const myTurn = async () => { for (const p of ps) if (await p.locator(".say:has-text('あなたの番')").count()) return p; return null; };
  let prevWord = null;
  for (let k = 0; k < 3; k++) {
    let p = null; for (let t = 0; t < 40 && !p; t++) { p = await myTurn(); if (!p) await sleep(100); }
    if (!p) { check(false, "自分の番の人が見つからない"); break; }
    if (p === B) { const m = await B.evaluate(() => Math.round(document.getElementById("esSubmit").getBoundingClientRect().bottom)); check(m <= 700, `スマホで「描けた！」まで1画面(${m}/700, ${prevWord ? "前の絵あり" : "お題"})`); await B.screenshot({ path: "pe_turn_sp.png" }); }
    let need;
    if (prevWord) { const g = k === 2 ? "ねこ" : prevWord; await p.fill("input[aria-label='前の絵は何？']", g); need = [...g].slice(-1)[0]; }
    else { const st = (await p.locator(".esw").textContent()).replace(/[「」]/g, ""); need = [...st].filter((x) => x !== "ー").slice(-1)[0]; }
    const word = W[need] || need + "かめ";
    await p.fill("input[aria-label='描く言葉']", word);
    // 入力中(フォーカスあり)に状態が届いても画用紙が消えないこと
    await draw(p, 0); await p.focus("input[aria-label='描く言葉']"); await sleep(300); await draw(p, 1);
    check(await p.evaluate(() => local.esPad.count()) === 2, `${k + 1}人目: 2本描けている`);
    await p.click("#esSubmit"); await sleep(600);
    prevWord = word;
  }
  await A.waitForFunction(() => S.game?.step === "reveal", null, { timeout: 5000 }).catch(() => {});
  await sleep(800);
  check(/つながった: 1 \/ 2/.test(await A.locator(".say.good").textContent()), "答え合わせ: つながった 1/2");
  const pix = async (p) => p.evaluate(() => [...document.querySelectorAll("#main canvas.drawview")].map((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) n++; return n; }));
  const pa = await pix(A), pv = await pix(V);
  check(pa.length === 3 && pa.every((n) => n > 100), "参加者に絵が3枚見える " + pa.join(","));
  check(pv.length === 3 && pv.every((n) => n > 100), "観戦者にも絵が3枚見える " + pv.join(","));
  await A.screenshot({ path: "pe_reveal_pc.png", fullPage: true });
  await B.screenshot({ path: "pe_reveal_sp.png", fullPage: true });
  // ホスト以外は締められない
  await B.evaluate(() => send({ t: "mini", a: "done" })); await sleep(300);
  check(await A.evaluate(() => S.game?.step) === "reveal", "ホスト以外の「done」は無視される");
  await A.click("button:has-text('結果へ')"); await sleep(500);
  check(await A.evaluate(() => S.phase) === "result", "ホストの「結果へ」で結果画面");
  const rows = await A.evaluate(() => S.result.rows.map((r) => r.raw));
  check(rows.reduce((a, b) => a + b, 0) === 3, "絵の点の合計 = 2+1(1か所つながった) " + rows.join(","));
  await A.screenshot({ path: "pe_result_pc.png", fullPage: true });
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK");
  await browser.close();
})();
