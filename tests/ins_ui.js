const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "I" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [], names = ["あき", "べに", "ちか", "だい"];
  for (let i = 0; i < 4; i++) {
    const mob = i === 1;
    const p = await (await b.newContext(mob ? { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true } : { viewport: { width: 1100, height: 900 } })).newPage();
    p.on("pageerror", (e) => errs.push(names[i] + ": " + e.message));
    await p.goto("http://localhost:3123/insider" + (i ? "?room=" + R : "")); await p.fill("#lName", names[i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(250);
  }
  const [A] = ps; await sleep(300);
  check((await A.locator("h1").first().textContent()).includes("インサイダーゲーム"), "題名に本家名");
  await A.screenshot({ path: "i1_lobby.png", fullPage: true });
  await A.click("button:has-text('スタート')"); await sleep(500);
  const role = async (p) => p.evaluate(() => S.game.role);
  const by = async (r) => { for (const p of ps) if (await role(p) === r) return p; };
  const M = await by("master"), I = await by("insider"), commons = []; for (const p of ps) if (await role(p) === "common") commons.push(p);
  const word = await M.evaluate(() => S.game.word);
  check(word && await I.evaluate(() => S.game.word) === word && await commons[0].evaluate(() => S.game.word) === null, "お題: マスターとインサイダーに見え、庶民には見えない");
  check(/お題: ？？？/.test(await commons[0].locator(".rolecard").textContent()), "庶民の画面はお題が「？？？」");
  await M.screenshot({ path: "i2_master_ready.png" });
  await M.click("button:has-text('質問タイム開始')"); await sleep(300);
  // 庶民が質問(入力中にほかの人の質問が届いても消えない)
  const C = commons[0];
  await C.fill("#qInput", "食べ物ですか");
  await commons[1].fill("#qInput", "大きいですか"); await commons[1].press("#qInput", "Enter"); await sleep(400);
  check(await C.inputValue("#qInput") === "食べ物ですか", "入力中にほかの人の質問が届いても、入力は消えない");
  await C.click("button:has-text('質問する')"); await sleep(300);
  check(await M.locator(".qs li").count() === 2, "マスターに質問が2つ届く");
  await M.locator(".qs li", { hasText: "食べ物ですか" }).locator("button:has-text('はい')").click(); await sleep(300);
  check((await C.locator(".qs li", { hasText: "食べ物ですか" }).textContent()).includes("はい"), "マスターの「はい」がみんなに見える");
  await ps[1].screenshot({ path: "i3_question_sp.png" });
  await M.screenshot({ path: "i4_question_master.png" });
  // インサイダーが答えを書き、マスターが「正解！」
  await I.fill("#qInput", word + "ですか"); await I.press("#qInput", "Enter"); await sleep(300);
  await M.locator(".qs li", { hasText: word + "ですか" }).locator("button:has-text('正解！')").click(); await sleep(400);
  check(await A.evaluate(() => S.game.step) === "discuss" && (await C.locator(".say.good").textContent()).includes(word) && await C.evaluate(() => S.game.word) === word, "正解 → 話し合い(お題が庶民にも公開)");
  await M.click("button:has-text('投票へ')"); await sleep(300);
  check(await I.locator("button:has-text('インサイダーだと思う')").count() === 0, "答えた人(インサイダー)は投票1をしない");
  for (const p of ps) if (p !== I) await p.click("button:has-text('インサイダーだと思う')");
  await sleep(500);
  const txt = await C.locator("#main").textContent();
  check(/マスターと庶民の勝ち/.test(txt) && txt.includes("インサイダー:"), "投票1で見抜いて勝ち、結果でインサイダーがわかる");
  await C.screenshot({ path: "i5_result.png", fullPage: true });
  await A.click("button:has-text('次のラウンド')"); await sleep(400);
  check(await A.evaluate(() => S.game.round === 2 && S.game.step === "ready"), "次のラウンドへ");
  const t = await ps[1].evaluate(() => document.getElementById("game").innerText);
  check(!/\bnull\b|undefined|NaN/.test(t), "null などが出ていない");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
