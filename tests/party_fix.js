const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SH = require("path").join(__dirname, ".shots") + "/";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const mk = async (mob) => (await b.newContext(mob ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1100, height: 900 } })).newPage();
  const A = await mk(), B = await mk(true), C = await mk(), errs = [];
  for (const p of [A, B, C]) p.on("pageerror", (e) => errs.push(e.message));
  await A.goto("http://localhost:3123/lobby"); await A.fill("#jName", "あき"); await A.click("#jCreate"); await sleep(800);
  const code = await A.evaluate(() => Party.state.code);
  for (const [p, n] of [[B, "べに"], [C, "ちか"]]) { await p.goto("http://localhost:3123/lobby?code=" + code); await p.fill("#jName", n); await p.click("#jJoin"); await sleep(700); }
  check(await B.locator(".games button").count() === 20, "ホスト以外にもゲームの一覧が見える");
  check((await B.locator(".games button >> nth=0").textContent()).includes("。"), "ゲームに1行の説明がある");
  const bbText = await A.locator(".games button:has-text('ボムバナナ')").textContent();
  check(bbText.includes("3人・") && !bbText.includes("3〜3"), "「3〜3人」ではなく「3人」: " + bbText.slice(0, 30));
  await B.click(".games button:has-text('ヒート')"); await sleep(500);
  check((await A.locator(".games button:has-text('ヒート') .vc").textContent()).includes("👍1"), "ホストの画面に「やりたい👍1」");
  check((await A.locator(".games button >> nth=0").textContent()).includes("ヒート"), "やりたいが多いゲームが上に来る");
  // QRコード
  await A.click("button:has-text('QRコード')"); await sleep(600);
  check(await A.evaluate(() => { const i = document.querySelector(".qr img"); return i && i.complete && i.naturalWidth > 0; }), "QRコードが表示される");
  const bad = await A.evaluate(async () => (await fetch("/qr.svg?t=" + encodeURIComponent("https://evil.example/x"))).status);
  check(bad === 400, "ほかのサイトのリンクはQRコードにしない");
  // 名前を変える
  await C.click("button:has-text('名前を変える')"); await C.fill("#rnIn", "ちかこ"); await C.click(".rename button:has-text('保存')"); await sleep(600);
  check((await A.locator(".members").textContent()).includes("ちかこ"), "名前を変えるとみんなの画面に反映");
  // 外す
  await A.locator(".members li:has-text('ちかこ') button:has-text('外す')").click(); await sleep(200);
  await A.locator(".members li:has-text('ちかこ') button:has-text('もう一度で外す')").click(); await sleep(800);
  check(!(await A.locator(".members").textContent()).includes("ちかこ"), "ホストがメンバーを外せる");
  check(await C.locator("#joinBox").isVisible() && (await C.locator("#jMsg").textContent()).includes("外されました"), "外された人の画面: パーティーから抜けてお知らせ");
  await A.screenshot({ path: SH + "lobby2_host.png", fullPage: true }); await B.screenshot({ path: SH + "lobby2_guest_sp.png", fullPage: true });
  // 開いた「これまでのゲーム」が勝手に閉じない(記録はゲームの結果が必要なので、details の扱いだけ確かめる)
  // → B がやりたいを押して状態が変わっても、A の入力中の名前が消えない
  await A.click("button:has-text('名前を変える')"); await A.fill("#rnIn", "あきら途中"); await B.click(".games button:has-text('ヒート')"); await sleep(600);
  check(await A.inputValue("#rnIn") === "あきら途中", "ほかの人の操作で画面が更新されても、入力中の文字が消えない");
  await A.click(".rename button:has-text('やめる')");
  // トップ: 1人・パーティー・続きから
  await A.goto("http://localhost:3123/"); await sleep(600);
  check(await A.locator("#fPeople option[value='1']").count() === 1, "人数の絞り込みに「1人」");
  await A.selectOption("#fPeople", "1"); await sleep(300);
  check((await A.locator("#groups a.game").count()) === 1, "1人で遊べるゲームだけ出る");
  await A.selectOption("#fPeople", "0");
  check((await A.locator("#partyGo").textContent()).includes(code), "パーティーに入っていると「パーティー○○に戻る」");
  // 続きから: ゲームの部屋に入ってからトップへ
  await A.goto("http://localhost:3123/mortar"); await A.fill("#lName", "あき"); await A.fill("#lRoom", "RSMX"); await A.click("#lJoin"); await sleep(2000);
  await A.goto("http://localhost:3123/"); await sleep(600);
  check((await A.locator("#resume").textContent()).includes("RSMX"), "トップに「続きから: モーターメイヘム(部屋RSMX)」");
  await A.screenshot({ path: SH + "home2_pc.png" });
  // チャット: メンバーだけ
  const denied = await C.evaluate(() => new Promise((res) => { const w = new WebSocket("ws://" + location.host + "/chat/ws"); w.onopen = () => w.send(JSON.stringify({ t: "join", key: "mortar:RSMX", pid: "zzzzzzzzzz", token: "nottherighttoken00", name: "なりすまし" })); w.onmessage = (e) => res(JSON.parse(e.data).t); setTimeout(() => res("timeout"), 2000); }));
  check(denied === "denied", "部屋のメンバーでない人はチャットに入れない");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs.slice(0, 3)));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
})();
