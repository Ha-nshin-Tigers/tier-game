// 不動産王のルール本体を直接動かすテスト(通信なし)
const core = require("../games/mini/monopoly.js");
let fails = 0; const check = (c, m) => { if (!c) { console.log("NG  " + m); fails++; } else if (!process.env.QUIET) console.log("OK  " + m); };
function mkCtx(ids, cfg) {
  const st = { timer: null, finished: null, live: new Set(ids) };
  const c = {
    g: null, members: () => ids, live: () => ids.filter((x) => st.live.has(x)), has: () => true, nameOf: (id) => id,
    setTimer: (ms, fn) => { st.timer = { ms, fn }; }, clearTimer: () => { st.timer = null; }, finish: (raw) => { st.finished = raw; },
  };
  core.start(c, cfg || {});
  return { c, st, fire: () => { const t = st.timer; st.timer = null; if (t) t.fn(); } };
}
const A = "a", B = "b", C = "c";
// ---- 家賃 ----
{
  const { c } = mkCtx([A, B]); const g = c.g;
  g.own[1].owner = A; check(core._rentOf(c, 1) === 2, "茶1軒だけ: 2");
  g.own[3].owner = A; check(core._rentOf(c, 1) === 4, "同じ色を全部: 2倍の4");
  g.own[1].houses = 3; check(core._rentOf(c, 1) === 90, "家3軒: 90");
  g.own[5].owner = A; g.own[15].owner = A; check(core._rentOf(c, 5) === 50, "駅2つ: 50");
  g.own[25].owner = A; g.own[35].owner = A; check(core._rentOf(c, 5) === 200, "駅4つ: 200");
  g.own[12].owner = A; check(core._rentOf(c, 12, { dice: 7 }) === 28, "公共1つ: 目×4");
  g.own[28].owner = A; check(core._rentOf(c, 12, { dice: 7 }) === 70, "公共2つ: 目×10");
  g.own[3].mort = true; check(core._rentOf(c, 3) === 0, "抵当中は0");
}
// ---- 建てる・売る・抵当 ----
{
  const { c } = mkCtx([A, B]); const g = c.g; const p = g.P[A]; p.cash = 5000;
  const h = (a, sq) => core.handle(c, A, { a, sq });
  g.own[6].owner = A; g.own[8].owner = A;
  check(typeof h("build", 6) === "string", "色がそろうまで建てられない");
  g.own[9].owner = A;
  check(h("build", 6) === undefined && g.own[6].houses === 1, "そろったら建てられる");
  check(typeof h("build", 6) === "string", "均等に建てないとだめ");
  h("build", 8); h("build", 9); h("build", 6);
  check(g.own[6].houses === 2 && g.houses === 28, "家の在庫が減る(32→28)");
  check(typeof h("mortgage", 8) === "string", "建物がある色は抵当に入れられない");
  check(typeof h("sell", 8) === "string", "均等に売らないとだめ(多い所から)");
  check(h("sell", 6) === undefined && g.own[6].houses === 1 && g.houses === 29, "売ると在庫に戻る");
  for (const s of [6, 8, 9]) while (g.own[s].houses) { const e = h("sell", s); if (e) { for (const t of [6, 8, 9]) h("sell", t); } }
  const before = p.cash; h("mortgage", 8);
  check(g.own[8].mort && p.cash === before + 50, "抵当で半額");
  check(typeof h("build", 6) === "string", "抵当がある色には建てられない");
  h("unmortgage", 8); check(!g.own[8].mort && p.cash === before + 50 - 55, "抵当を外すのは1割増し(55)");
  // ホテル
  for (let k = 0; k < 4; k++) for (const s of [6, 8, 9]) h("build", s);
  h("build", 6); check(g.own[6].houses === 5 && g.hotels === 11 && g.houses === 32 - 12 + 4, "ホテルで家4軒が戻る");
  g.houses = 0; check(h("build", 8) === undefined && g.own[8].houses === 5, "家の在庫がなくてもホテルは建つ(家4軒が戻る)");
}
// ---- 在庫切れ ----
{
  const { c } = mkCtx([A, B]); const g = c.g; g.P[A].cash = 5000; g.own[1].owner = A; g.own[3].owner = A; g.houses = 0;
  check(/残っていません/.test(core.handle(c, A, { a: "build", sq: 1 })), "銀行に家がなければ建てられない");
}
// ---- 刑務所 ----
{
  const { c, fire } = mkCtx([A, B]); const g = c.g; const cur = g.order[0];
  g.P[cur].jailed = true; g.P[cur].pos = 10;
  core.handle(c, cur, { a: "payJail" });
  check(!g.P[cur].jailed && g.P[cur].cash === 1450, "保釈金50で出所");
  g.P[cur].jailed = true; g.P[cur].jailCards.push("chance");
  const len = g.decks.chance.length;
  core.handle(c, cur, { a: "useCard" });
  check(!g.P[cur].jailed && g.decks.chance.length === len + 1, "カードで出所(山札に戻る)");
}
// ---- 競売 ----
{
  const { c, fire } = mkCtx([A, B]); const g = c.g; const cur = g.order[0], other = g.order[1];
  g.P[cur].pos = 0; g.pending = 1; g.step = "buy";
  core.handle(c, cur, { a: "decline" });
  check(g.step === "auction", "買わない→競売");
  check(typeof core.handle(c, other, { a: "bid", amount: 99999 }) === "string", "持ち金以上は入札できない");
  core.handle(c, other, { a: "bid", amount: 10 }); core.handle(c, cur, { a: "bid", amount: 30 });
  check(typeof core.handle(c, other, { a: "bid", amount: 30 }) === "string", "同額は不可");
  fire();
  check(g.own[1].owner === cur && g.P[cur].cash === 1470 && g.step === "act", "最高額の人が落札");
}
// ---- 借金と破産 ----
{
  const { c, st } = mkCtx([A, B, C]); const g = c.g; const [x, y, z] = g.order;
  g.own[39].owner = y; g.own[37].owner = y; g.own[39].houses = 5; g.own[37].houses = 5; g.hotels -= 2;
  g.own[1].owner = x; g.own[3].owner = x; g.own[1].houses = 1; g.own[3].houses = 1; g.houses -= 2;
  g.P[x].cash = 100; g.P[x].pos = 35; g.step = "roll";
  // 39 に止まらせる: 直接 land を使えないので、位置を動かして pay を呼ぶ
  g.P[x].pos = 39; g.debts = []; 
  core.handle(c, x, { a: "noop" });
  const land = require("../games/mini/monopoly.js");
  // 払えない借金を作る
  g.debts.push({ pid: x, to: y, amount: 2000, why: "テスト" });
  check(typeof core.handle(c, x, { a: "pay" }) === "string", "足りなければ払えない");
  check(typeof core.handle(c, x, { a: "end" }) === "string" || g.step !== "act", "借金があるとターンを終えられない");
  core.handle(c, x, { a: "autoPay" });
  check(g.debts.length === 1 && g.own[1].houses === 0 && g.own[1].mort, "自動で集める: 家を売り、抵当に入れる");
  const yCash = g.P[y].cash;
  core.handle(c, x, { a: "bankrupt" });
  check(g.P[x].out && g.own[1].owner === y && g.own[1].mort && g.P[y].cash === yCash + 100 + 25 + 25 + 30 + 30 - 6, "破産: 財産は相手へ(抵当のまま・本家どおりなら利子1割=3+3を払う)");
  check(g.order[g.cur] !== x, "破産した人の番は飛ばす");
}
// ---- 取引 ----
{
  const { c } = mkCtx([A, B]); const g = c.g;
  g.own[1].owner = A; g.own[3].owner = B; g.own[3].mort = true; g.P[A].jailCards.push("chest");
  check(typeof core.handle(c, A, { a: "offer", to: B, give: { props: [3] }, get: {} }) === "string", "人の土地は出せない");
  core.handle(c, A, { a: "offer", to: B, give: { props: [1], cash: 100, cards: 1 }, get: { props: [3] } });
  check(g.trades.length === 1, "取引を出せる");
  check(core.handle(c, A, { a: "answer", id: g.trades[0].id, ok: true }) === undefined && g.trades.length === 1, "出した人は承認できない");
  core.handle(c, B, { a: "answer", id: g.trades[0].id, ok: true });
  check(g.own[1].owner === B && g.own[3].owner === A && g.P[A].cash === 1500 - 100 - 3 && g.P[B].cash === 1600 && g.P[B].jailCards.length === 1, "成立: 土地・お金・カードが入れ替わり、抵当の利子(1割=3)を払う");
}
// ---- たくさん遊んで、壊れないか(時間切れ任せ + ランダム操作) ----
{
  let games = 0, turns = 0, maxTurns = 0, ended = 0;
  for (let n = 0; n < 300; n++) {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6"].slice(0, 2 + (n % 5));
    const { c, st, fire } = mkCtx(ids, { startCash: [1000, 1500, 2000][n % 3], map: n % 2 ? "world" : "japan", rules: n % 3 === 0 ? core.PRESETS.original : { ...core.PRESETS.official, freeParking: n % 2 === 0 } });
    const g = c.g; games++;
    let steps = 0;
    while (!st.finished && steps < 200000) {
      steps++;
      const cur = g.order.find((id, i) => i === g.order.indexOf(g.order[g.cur]));
      const who = g.order.filter((id) => !g.P[id].out);
      const r = Math.random();
      const pid = who[Math.floor(Math.random() * who.length)];
      if (r < 0.15) core.handle(c, pid, { a: ["build", "sell", "mortgage", "unmortgage"][Math.floor(Math.random() * 4)], sq: Math.floor(Math.random() * 40) });
      else if (r < 0.2) { const to = who[Math.floor(Math.random() * who.length)]; core.handle(c, pid, { a: "offer", to, give: { cash: Math.floor(Math.random() * 100), props: [Math.floor(Math.random() * 40)] }, get: { props: [Math.floor(Math.random() * 40)] } }); }
      else if (r < 0.25 && g.trades.length) { const t = g.trades[0]; core.handle(c, t.to, { a: "answer", id: t.id, ok: Math.random() < 0.5 }); }
      else if (r < 0.3 && g.step === "auction") core.handle(c, pid, { a: "bid", amount: (g.auction.bid || 0) + 1 + Math.floor(Math.random() * 50) });
      else if (r < 0.32 && g.step === "auction" && g.auction.kind === "house") core.handle(c, pid, { a: "bid", amount: (g.auction.bid || 0) + 60 });
      else if (r < 0.5 && g.step === "buy") core.handle(c, g.order[g.cur], { a: Math.random() < 0.85 ? "buy" : "decline" });
      else if (r < 0.6) { for (let sq = 0; sq < 40; sq++) core.handle(c, pid, { a: "build", sq }); }
      else if (r < 0.63) {
        // 色をそろえる取引(相手の持つ1枚を、値段の2倍で買う)を持ちかけて、相手は受ける
        for (const [grp, list] of Object.entries(core.G)) {
          const mine = list.filter((k) => g.own[k].owner === pid).length, other = list.find((k) => g.own[k].owner && g.own[k].owner !== pid);
          if (mine === list.length - 1 && other != null && g.P[pid].cash > core.SQ[other].price * 2) {
            const to = g.own[other].owner; core.handle(c, pid, { a: "offer", to, give: { cash: core.SQ[other].price * 2 }, get: { props: [other] } });
            const t = g.trades.find((x) => x.from === pid && x.to === to); if (t) core.handle(c, to, { a: "answer", id: t.id, ok: true });
            break;
          }
        }
      }
      else fire();
      // 不変条件
      for (const id of g.order) if (g.P[id].cash < 0) { check(false, `お金がマイナス ${g.P[id].cash}`); break; }
      let hs = g.houses, ht = g.hotels;
      for (const o of g.own) if (o) { if (o.houses === 5) ht++; else hs += o.houses; if (o.owner && g.P[o.owner].out) check(false, "破産した人が土地を持っている"); if (o.houses && o.mort) check(false, "抵当中に建物"); }
      if (hs !== 32 || ht !== 12) { check(false, `家の数が合わない ${hs}/${ht}`); break; }
      if (g.pot < 0) check(false, "駐車場がマイナス");
      if (fails > 5) break;
    }
    if (st.finished) ended++;
    maxTurns = Math.max(maxTurns, g.turnNo); turns += g.turnNo;
    if (fails > 5) break;
  }
  check(ended === games, `ランダム対戦 ${ended}/${games}回が決着(平均${Math.round(turns / games)}手番・最長${maxTurns})`);
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
