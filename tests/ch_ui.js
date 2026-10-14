const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "H" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [], names = ["あき", "べに", "ちか"];
  for (let i = 0; i < 3; i++) {
    const mob = i === 1;
    const p = await (await b.newContext(mob ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 950 } })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    await p.goto("http://localhost:3123/challengers" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A, B, Cc] = ps; await sleep(400);
  check((await A.locator("h1").first().textContent()).includes("Challengers"), "題名に本家名");
  await A.selectOption("select >> nth=2", "fast"); await A.selectOption("select >> nth=0", "space"); await sleep(200);
  await A.screenshot({ path: "ch1_lobby.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(500);
  check(await A.evaluate(() => S.game.robot && S.game.seats.length === 4 && S.game.exclude === "space"), "3人 → ロボット入り4席・宇宙を外す");
  let shots = 0, prompts = 0, rounds = new Set();
  for (let k = 0; k < 400; k++) {
    const st = await A.evaluate(() => ({ phase: S.phase, gp: S.game?.phase, round: S.game?.round }));
    if (st.phase === "finished" || st.gp === "end") break;
    rounds.add(st.round);
    for (const p of ps) {
      const d = await p.evaluate(() => S.game?.draft && { step: S.game.draft.step, phase: S.game.phase });
      if (!d) continue;
      if ((d.phase === "deck" || d.phase === "finalTrim") && d.step === "choose") await p.click("#main button.big.primary");
      else if (d.phase === "deck" && d.step === "pick") { if (shots === 0 && p === B) { await B.screenshot({ path: "ch2_draft_sp.png", fullPage: true }); shots++; } await p.locator("#main .cards button.card").first().click(); }
      else if (d.phase === "deck" && d.step === "extra") await p.click("button:has-text('しない')");
      else if ((d.phase === "deck" || d.phase === "finalTrim") && d.step === "trim") await p.click("button:has-text('決定')");
      const pr = await p.evaluate(() => S.game?.matches?.some((m) => m.prompt?.mine));
      if (pr) { const dbg = await p.evaluate(() => ({ view: local.view, phase: S.game.phase, ms: S.game.matches.map((m) => ({ id: m.id, a: m.a, b: m.b, pr: m.prompt })), me, main: document.getElementById("main").innerText.slice(0, 300), errs: window.__errs })); if (!(await p.locator(".prompt").count())) { console.log("DEBUG", JSON.stringify(dbg)); break; } prompts++; if (prompts === 1) await p.screenshot({ path: "ch4_prompt.png", fullPage: true }); await p.locator(".prompt button:has-text('おまかせ')").click(); }
    }
    if (st.gp === "match" && st.round === 2 && shots === 1) { await sleep(1500); await A.screenshot({ path: "ch3_match_pc.png", fullPage: true }); await B.screenshot({ path: "ch3_match_sp.png", fullPage: true }); shots++; }
    await sleep(300);
  }
  const fin = await A.evaluate(() => ({ phase: S.phase, result: S.game?.result, totals: S.game?.totals, ranking: S.ranking }));
  check(fin.phase === "finished" && fin.result?.winner, `最後(決勝)まで遊べた ラウンド: ${[...rounds].join(",")} / 選択 ${prompts}回`);
  check(fin.totals && Object.keys(fin.totals).length === 3, "最後に全員のファンが公開");
  await A.screenshot({ path: "ch5_end.png", fullPage: true });
  for (const p of ps) { const t = await p.evaluate(() => document.getElementById("game").innerText); if (/\bnull\b|undefined|NaN/.test(t)) check(false, "null などが出ている: " + t.match(/.{0,30}(null|undefined|NaN).{0,30}/)[0]); }
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs.slice(0, 3)));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
