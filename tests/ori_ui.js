// オリフラムの画面のテスト(3人・1人はスマホ幅)。1ラウンド目は画面を押して遊び、残りは操作関数で最後まで進める
const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = require("path").join(__dirname, ".shots") + "/" + "";
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const R = "O" + Math.random().toString(36).slice(2, 6).toUpperCase(), errs = [], ps = [];
  for (let i = 0; i < 3; i++) {
    const p = await (await b.newContext(i === 1 ? { viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 950 } })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:3123/oriflamme" + (i ? "?room=" + R : "")); await p.fill("#lName", ["あき", "べに", "ちか"][i]); if (!i) await p.fill("#lRoom", R); await p.click("#lJoin"); ps.push(p); await sleep(300);
  }
  const [A] = ps;
  check((await A.title()).includes("オリフラム"), "題名");
  check(await A.locator("ol.rules li").count() >= 5 && await A.locator(".ref li").count() === 10, "待機画面: 遊び方とカード10種類の一覧");
  await A.click("button:has-text('スタート')"); await sleep(500);
  const ids = await Promise.all(ps.map((p) => p.evaluate(() => me)));
  const pageOf = (id) => ps[ids.indexOf(id)];
  check(await A.evaluate(() => S.game.step === "place" && S.game.hand.length === 7), "配置から・手札7枚");
  // 1ラウンド目: 画面で置く(1人目は左端、2人目は右端、3人目は自分のカードの上…がなければ左端)
  for (let k = 0; k < 3; k++) {
    const id = await A.evaluate(() => S.game.placer), p = pageOf(id);
    await p.locator(".hand .card").first().click(); await sleep(120);
    if (k === 0) {
      check(await p.locator(".hand .card.sel").count() === 1, "手札を選ぶと持ち上がる");
      await p.click("button:has-text('左端に置く')");
    } else await p.click("button:has-text('右端に置く')");
    await sleep(300);
  }
  check(await A.evaluate(() => S.game.step === "resolve" && S.game.queue.length === 3), "3人置いたら解決へ");
  const vis = await Promise.all(ps.map((p) => p.evaluate(() => S.game.queue.map((s) => s.top.k === null ? "?" : "o").join(""))));
  check(vis.every((v) => (v.match(/o/g) || []).length === 1), "列で中身が見えるのは自分のカードだけ " + vis.join(","));
  await ps[1].screenshot({ path: SHOT + "ori_place_sp.png", fullPage: true });
  // 解決: 最初のカードの持ち主は「伏せたまま」、ほかは公開して対象があれば光っているカードを押す
  let guard = 0;
  while (guard++ < 30) {
    const st = await A.evaluate(() => ({ step: S.game.step, pd: S.game.pending, round: S.game.round }));
    if (st.step !== "resolve" || st.round !== 1) break;
    if (!st.pd) { await sleep(150); continue; }
    const p = pageOf(st.pd.by);
    if (st.pd.type === "reveal") {
      if (guard === 1) { await p.click("button:has-text('伏せたまま')"); await sleep(250); check(await A.evaluate(() => S.game.queue[0].top.inf === 1), "伏せたまま → カードの上に●1"); }
      else { await p.click("button:has-text('公開する')"); }
    } else if (st.pd.type === "target") {
      check(await p.locator(".stack.can").count() === st.pd.options.length, `対象が光る(${st.pd.as})`);
      await p.screenshot({ path: SHOT + "ori_target.png", fullPage: true });
      await p.locator(".stack.can").first().click();
    } else {
      check(await p.locator(".slot").count() === st.pd.positions.length, "勅令: 動かす先が出る");
      await p.locator(".slot").first().click();
    }
    await sleep(300);
  }
  check(await A.evaluate(() => S.game.round === 2 && S.game.step === "place"), "1ラウンド目の解決が終わり、ラウンド2の配置へ");
  await A.screenshot({ path: SHOT + "ori_round2_pc.png", fullPage: true });
  // 自分のカードの上に重ねる
  {
    const id = await A.evaluate(() => S.game.placer), p = pageOf(id);
    const own = await p.evaluate(() => S.game.queue.filter((s) => s.top.owner === me).length);
    await p.locator(".hand .card").first().click(); await sleep(150);
    if (own) {
      check(await p.locator(".stack.can").count() === own, "手札を選ぶと、重ねられる自分のカードが光る");
      await p.locator(".stack.can").first().click(); await sleep(300);
      check(await A.evaluate(() => S.game.queue.some((s) => s.under.length === 1)) && await A.locator(".under").count() >= 1, "重ねると「下に1枚」");
    } else { await p.click("button:has-text('左端に置く')"); await sleep(300); }
  }
  // 残りは操作関数で最後まで(公開は半分くらい)
  guard = 0;
  while (guard++ < 400) {
    const st = await A.evaluate(() => ({ step: S.game.step, placer: S.game.placer, pd: S.game.pending }));
    if (st.step === "end") break;
    if (st.step === "place" && st.placer) { const p = pageOf(st.placer); await p.evaluate(() => act("place", { card: S.game.hand[0].id, where: Math.random() < 0.5 ? "L" : "R" })); }
    else if (st.pd) {
      const p = pageOf(st.pd.by);
      if (st.pd.type === "reveal") await p.evaluate(() => act("decide", { reveal: Math.random() < 0.6 }));
      else if (st.pd.type === "target") await p.evaluate(() => act("target", { sid: S.game.pending.options[0] }));
      else await p.evaluate(() => act("target", { pos: S.game.pending.positions[0] }));
    }
    await sleep(60);
  }
  await sleep(400);
  check(await A.evaluate(() => S.phase === "finished" && S.game.step === "end"), "6ラウンドで終わる");
  check(await A.locator(".rank tr").count() === 3 && await A.locator("text=待機画面に戻る").count() >= 1, "結果: 3人の順位と影響力");
  check(await A.evaluate(() => S.game.queue.every((s) => s.top.k)) && await A.locator(".table .card.back").count() === 0, "終了後は列の全部のカードが表になる");
  await A.screenshot({ path: SHOT + "ori_end_pc.png", fullPage: true });
  await ps[1].screenshot({ path: SHOT + "ori_end_sp.png", fullPage: true });
  check(await ps[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "スマホ幅で横にはみ出さない");
  const txt = (await Promise.all(ps.map((p) => p.evaluate(() => document.body.innerText)))).join("\n");
  const bad = txt.match(/.{0,30}(undefined|NaN|null|\[object).{0,30}/g) || []; check(!bad.length, "undefined などが出ていない " + JSON.stringify(bad));
  // 勅令の置き場所の表示(状態を直接与えて描く): 重なった山の上を動かす → 置き場所4か所、押すと pos が送られる
  const decree = await ps[2].evaluate(() => {
    const sent = []; const orig = ws.send; ws.send = (d) => { const m = JSON.parse(d); if (m.t === "game") sent.push([m.a, { pos: m.pos }]); };
    const P = (id, k, owner, up, under = []) => ({ id, top: { id: id * 10, owner, up, inf: 0, k }, under });
    S = JSON.parse(JSON.stringify(S)); S.phase = "play";
    Object.assign(S.game, { step: "resolve", cur: 1, done: [1], queue: [P(1, "decree", me, true), P(2, "lord", me, false, [{ k: "heir", up: true, inf: 0 }]), P(3, "spy", S.game.order[1], true)],
      pending: { type: "move", by: me, sid: 1, as: "decree", tid: 2, rest: [1, 2, 3], positions: [0, 1, 2, 3], options: null } });
    render();
    const n = document.querySelectorAll(".slot").length, under = document.querySelectorAll(".under").length;
    document.querySelectorAll(".slot")[3].click();
    ws.send = orig;
    return { n, under, sent };
  });
  check(decree.n === 4 && decree.under === 1 && JSON.stringify(decree.sent) === '[["target",{"pos":3}]]', "勅令: 置き場所「ここへ」が4か所・押すと位置が送られる・重なった山に「下に1枚」 " + JSON.stringify(decree));
  await A.click("text=待機画面に戻る"); await sleep(400);
  check(await A.evaluate(() => S.phase === "lobby"), "待機画面に戻れる");
  check(errs.length === 0, "ページエラーなし " + JSON.stringify(errs));
  console.log(fails ? `NG ${fails}件` : "全項目OK"); await b.close();
  process.exit(fails ? 1 : 0);
})();
