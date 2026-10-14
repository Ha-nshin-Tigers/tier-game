const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "C" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [], names = ["あき", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await b.newContext(mob ? { viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true } : { viewport: { width: 1100, height: 900 } })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    await p.goto("http://localhost:3123/coyote" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A] = ps; await sleep(300);
  check((await A.locator("h1").first().textContent()).includes("Coyote"), "題名に本家名");
  await A.selectOption("select >> nth=0", "1"); await sleep(200); // ライフ1で早く終わらせる
  await A.screenshot({ path: "c1_lobby.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(500);
  const seen = await A.evaluate(() => S.game.cards);
  const myId = await A.evaluate(() => me);
  check(seen[myId] === null && Object.values(seen).filter((x) => x !== null).length === 2, "自分のカードだけ見えない(ほか2人は見える)");
  check(await A.locator(".seat .cc.back").count() === 1, "自分の席は裏向き表示");
  const pageOf = async (id) => { for (const p of ps) if (await p.evaluate(() => me) === id) return p; };
  let rounds = 0;
  for (let k = 0; k < 30; k++) {
    const st = await A.evaluate(() => ({ phase: S.phase, step: S.game?.step, turn: S.game?.turn, bids: S.game?.bids.length }));
    if (st.phase === "finished") break;
    if (st.step !== "bid") { await sleep(9500); continue; }
    const p = await pageOf(st.turn);
    if (st.bids === 0) { await p.fill("#bidInput", "3"); await p.click("button:has-text('言う')"); }
    else if (st.bids === 1) { if (k < 3) await p.screenshot({ path: "c2_turn.png" }); await p.locator(".btns button.ghost").first().click(); }
    else { await p.click("button:has-text('コヨーテ！')"); rounds++; await sleep(400); if (rounds === 1) { await ps[1].screenshot({ path: "c3_reveal_sp.png", fullPage: true }); const t = await A.locator("#main").textContent(); check(/合計/.test(t) && /ライフ−1/.test(t), "公開: 合計と、だれのライフが減ったか"); check(await A.evaluate(() => Object.values(S.game.cards).every((x) => x !== null)), "公開中は全員のカードが見える"); } }
    await sleep(300);
  }
  check(await A.evaluate(() => S.phase === "finished" && S.ranking.length === 3), `最後の1人まで遊べた(${rounds}回)`);
  await A.screenshot({ path: "c4_end.png", fullPage: true });
  const t = await ps[1].evaluate(() => document.getElementById("game").innerText);
  check(!/\bnull\b|undefined|NaN/.test(t), "null などが出ていない");
  await A.click("button:has-text('待機画面に戻る')"); await sleep(300);
  check(await A.evaluate(() => S.phase === "lobby"), "待機画面に戻れる");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
