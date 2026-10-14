// ルール切り替え(本家どおり/オリジナル/個別)のテスト
const core = require("../games/mini/monopoly.js"), T = core._test;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(rules, ids = ["a", "b", "c"]) {
  const st = { timer: null, finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  core.start(c, { rules });
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; if (f) f(); } };
}
const O = core.PRESETS.official, X = core.PRESETS.original;
// 設定
check(JSON.stringify(core.normalize({}).rules) === JSON.stringify(O), "初期設定は本家どおり");
check(JSON.stringify(core.normalize({ preset: "original" }).rules) === JSON.stringify(X), "「オリジナル」で一括切り替え");
check(core.normalize({ rules: { ...O, freeParking: true } }).rules.freeParking === true && core.normalize({ rules: { bankAuction: "x" } }).rules.bankAuction === true, "1つずつ変えられる・変な値は初期値");
// 銀行への破産 → 競売
for (const [R, name] of [[O, "本家"], [X, "オリジナル"]]) {
  const { c, g, fire } = mk(R); const [x, y, z] = g.order;
  g.own[1].owner = z; g.own[3].owner = z; g.own[3].mort = true; g.P[z].cash = 0;
  g.debts.push({ pid: z, to: null, amount: 500, why: "テスト" });
  core.handle(c, z, { a: "bankrupt" });
  if (R === O) {
    check(g.step === "auction" && g.auction.sq === 1 && g.queue.length === 1, `${name}: 銀行に戻った土地は競売(続けて2件)`);
    core.handle(c, y, { a: "bid", amount: 10 }); fire();
    check(g.own[1].owner === y && g.step === "auction" && g.auction.sq === 3 && !g.own[3].mort, `${name}: 1件目を落札 → 2件目(抵当は外れた状態)`);
    fire();
    check(g.step === "roll" && g.own[3].owner === null, `${name}: 入札なしは銀行のまま、終わったら元の進行へ`);
  } else check(g.step === "roll" && g.own[1].owner === null && !g.own[3].mort, `${name}: 競売なしで銀行のものに戻る`);
}
// 破産で抵当の土地を受け取ったら利子 + その番は元金で外せる
for (const [R, name] of [[O, "本家"], [X, "オリジナル"]]) {
  const { c, g } = mk(R); const [x, y, z] = g.order;
  g.own[39].owner = z; g.own[39].mort = true; g.P[z].cash = 0;
  g.debts.push({ pid: z, to: y, amount: 500, why: "テスト" });
  const before = g.P[y].cash; core.handle(c, z, { a: "bankrupt" });
  const paid = before - g.P[y].cash;
  check(g.own[39].owner === y && paid === (R === O ? 20 : 0), `${name}: 破産で受け取った抵当の利子 ${paid}`);
  check(core.view(c, y).unmort[39] === (R === O ? 200 : 220), `${name}: 受け取ったその番に外す費用 ${core.view(c, y).unmort[39]}`);
}
{
  const { c, g } = mk(O); const [x, y] = g.order;
  g.own[39].owner = y; g.own[39].mort = true; g.own[39].fresh = true;
  const v1 = core.view(c, y).unmort[39];
  T.beginTurn(c);
  check(v1 === 200 && core.view(c, y).unmort[39] === 220, "番が変わると元金だけで外せる期間は終わる(200 → 220)");
}
// 取引で抵当を受け取る → 利子は払う、その番は元金で外せる(本家)/1割増し(オリジナル)
for (const [R, name] of [[O, "本家"], [X, "オリジナル"]]) {
  const { c, g } = mk(R, ["a", "b"]); const [x, y] = g.order;
  g.own[37].owner = x; g.own[37].mort = true;
  core.handle(c, x, { a: "offer", to: y, give: { props: [37] }, get: { cash: 10 } });
  core.handle(c, y, { a: "answer", id: g.trades[0].id, ok: true });
  const cash = g.P[y].cash; core.handle(c, y, { a: "unmortgage", sq: 37 });
  check(cash === 1500 - 10 - 18 && cash - g.P[y].cash === (R === O ? 175 : 193), `${name}: 取引の利子18を払い、外す費用は ${cash - g.P[y].cash}`);
}
// 競売の入札上限
for (const [R, name] of [[O, "本家"], [X, "オリジナル"]]) {
  const { c, g, fire } = mk(R, ["a", "b"]); const [x, y] = g.order;
  g.P[y].cash = 100; g.own[39].owner = y; // 抵当で +200 作れる
  g.pending = 37; g.step = "buy"; core.handle(c, x, { a: "decline" });
  const e = core.handle(c, y, { a: "bid", amount: 250 });
  if (R === O) {
    check(e === undefined && g.auction.by === y, `${name}: 現金100でも、抵当で作れる300まで入札できる`);
    fire();
    check(g.own[37].owner === y && g.debts.length === 1 && g.debts[0].amount === 250, `${name}: 落札して、足りない代金は支払い待ち`);
    core.handle(c, y, { a: "autoPay" });
    check(!g.debts.length && g.own[37].mort && g.P[y].cash === 100 + 175 - 250, `${name}: 抵当でお金を作って払える(安い土地から抵当: 落札した土地 +175)`);
  } else check(typeof e === "string" && /持っているお金/.test(e), `${name}: 持っている現金までしか入札できない`);
}
// 家の競売
for (const [R, name] of [[O, "本家"], [X, "オリジナル"]]) {
  const { c, g, fire } = mk(R, ["a", "b"]); const [x, y] = g.order;
  g.own[1].owner = x; g.own[3].owner = x; g.own[6].owner = y; g.own[8].owner = y; g.own[9].owner = y; g.P[x].cash = g.P[y].cash = 2000;
  g.houses = 4;
  core.handle(c, x, { a: "build", sq: 1 });
  if (R === O) {
    check(g.step === "auction" && g.auction.kind === "house", `${name}: 家が残り4軒、ほかにも建てたい人がいれば家の競売`);
    check(/以上で入札/.test(core.handle(c, y, { a: "bid", amount: 10, sq: 6 })), `${name}: 家の値段より安くは入札できない`);
    core.handle(c, x, { a: "bid", amount: 50, sq: 1 }); core.handle(c, y, { a: "bid", amount: 80, sq: 6 });
    fire();
    check(g.own[6].houses === 1 && g.houses === 3 && g.P[y].cash === 2000 - 80 && g.own[1].houses === 0, `${name}: 落札した人が選んだ土地に建つ(80で)`);
    check(g.step === "roll", `${name}: 終わったら元の進行へ`);
    g.own[6].owner = null; g.own[6].houses = 0; g.houses = 4;
    core.handle(c, x, { a: "build", sq: 1 });
    check(g.own[1].houses === 1 && g.step === "roll", `${name}: 建てたいのが自分だけなら普通に建つ`);
  } else check(g.own[1].houses === 1 && g.step !== "auction", `${name}: 競売なしで普通に建つ`);
}
// 何人かに払えずに破産
for (const [R, name] of [[O, "本家"], [X, "オリジナル"]]) {
  const { c, g } = mk(R); const [x, y, z] = g.order;
  g.P[x].cash = 90; g.own[5].owner = x;
  g.debts.push({ pid: x, to: y, amount: 100, why: "t" }, { pid: x, to: z, amount: 50, why: "t" });
  const cy = g.P[y].cash, cz = g.P[z].cash;
  core.handle(c, x, { a: "bankrupt" });
  if (R === O) check(g.P[y].cash - cy === 60 && g.P[z].cash - cz === 30 && g.own[5].owner === null, `${name}: 現金90を 100:50 で分け(60と30)、土地は銀行へ`);
  else check(g.P[y].cash - cy === 90 && g.own[5].owner === y, `${name}: 先頭の人に全部`);
}
// 無料駐車場
for (const fp of [true, false]) {
  const { c, g } = mk({ ...O, freeParking: fp }); const [x, y] = g.order;
  g.P[x].pos = 2; T.advance(c, x, 2); // 所得税200
  check(g.pot === (fp ? 200 : 0), `駐車場${fp ? "あり" : "なし"}: 税金 → ${fp ? "駐車場に貯まる" : "銀行"}`);
  const before = g.P[y].cash; g.P[y].pos = 15; T.advance(c, y, 5);
  check(g.P[y].cash - before === (fp ? 200 : 0) && g.pot === 0, `駐車場${fp ? "あり" : "なし"}: 止まった人が ${fp ? "200もらう" : "何もなし"}`);
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
