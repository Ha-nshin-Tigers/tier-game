const { chromium } = require("playwright-core");
const { execSync, spawn } = require("child_process");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SH = require("path").join(__dirname, ".shots") + "/";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
  const mk = async () => (await b.newContext({ viewport: { width: 1100, height: 860 } })).newPage();
  const A = await mk(), B = await mk(), C = await mk(), errs = [];
  for (const p of [A, B, C]) p.on("pageerror", (e) => errs.push(e.message));
  await A.goto("http://localhost:3123/lobby"); await A.fill("#jName", "あき"); await A.click("#jCreate"); await sleep(800);
  const code = await A.evaluate(() => Party.state.code);
  for (const [p, n] of [[B, "べに"], [C, "ちか"]]) { await p.goto("http://localhost:3123/lobby?code=" + code); await p.fill("#jName", n); await p.click("#jJoin"); await sleep(700); }
  await A.click(".games button:has-text('ボムバナナ')"); await sleep(5000);
  check(await A.evaluate(() => location.pathname) === "/bombanana" && await B.evaluate(() => !!(S && S.code)), "パーティーから3人でボムバナナへ移動");
  await A.evaluate(() => send({ t: "settings", s: { mode: "custom", custom: { secs: 300, mistakes: 1, mods: ["cable", "cable"], chaos: [], hazards: false } } })); await sleep(400);
  await A.click("button:has-text('スタート')"); await sleep(4500);
  const pages = [A, B, C], roles = await Promise.all(pages.map((p) => p.evaluate(() => myRole())));
  const blind = pages[roles.indexOf("blind")], deaf = pages[roles.indexOf("deaf")];
  const mods = await deaf.evaluate(() => S.game.bomb.mods), man = { 3: { red: "blue", blue: "green", green: "yellow", yellow: "red" }, 4: { red: "green", blue: "yellow", green: "red", yellow: "blue" }, 5: { red: "yellow", blue: "red", green: "blue", yellow: "green" } };
  for (let i = 0; i < 2; i++) { const m = mods[i], w = m.colors.findIndex((c) => c !== man[m.n][m.led]); await blind.evaluate(([i, w]) => doAct({ mod: i, part: w, act: "cut" }), [i, w]); await sleep(400); }
  await sleep(1800);
  check(await A.evaluate(() => S.game.step) === "boom", "わざとミス2回で爆発");
  check((await B.locator(".partybar .pb-note").textContent()).includes("ゲームおわり"), "ゲームが終わると「ゲームおわり！次は？」が出る");
  await B.screenshot({ path: SH + "party_end.png" });
  await A.locator(".partybar button:has-text('みんなでパーティーへ戻る')").click(); await sleep(2500);
  check(await B.evaluate(() => location.pathname) === "/lobby", "ホストの「みんなでパーティーへ戻る」で全員がパーティーの画面へ");
  check((await A.locator("#partyBox").textContent()).includes("0点"), "爆発は通算成績0点");
  await A.click("summary:has-text('これまでのゲーム')"); await sleep(200);
  check((await A.locator(".hist").textContent()).includes("爆発"), "記録に「カスタム 爆発」の一言");
  await B.click(".games button:has-text('ヒート')"); await sleep(700);
  check(await A.evaluate(() => document.querySelector("details").open), "ほかの人が操作しても、開いた「これまでのゲーム」が閉じない");
  // サーバの更新: 止まる前のお知らせ → 再起動後にパーティーが戻る
  execSync("kill -TERM $(lsof -ti tcp:3123 -sTCP:LISTEN)"); await sleep(1500);
  const ban = await A.evaluate(() => document.getElementById("pb-banner")?.textContent || "");
  check(ban.includes("サーバを更新"), "止まる前に「サーバを更新します」のお知らせ: " + ban.slice(0, 30));
  spawn("node", ["server.js"], { cwd: require("path").join(__dirname, ".."), env: { ...process.env, PORT: "3123" }, detached: true, stdio: "ignore" }).unref();
  await sleep(9000);
  const st = await A.evaluate(() => Party.state && { n: Party.state.members.length, h: Party.state.history.length });
  check(st && st.n === 3 && st.h === 1, "再起動のあと、同じパーティー(3人・記録1件)に自動でつながり直す " + JSON.stringify(st));
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs.slice(0, 3)));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
