const core = require("../games/mini/coyote.js"), T = core._test;
let fails = 0; const check = (c, m) => { if (!c || !process.env.QUIET) console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids = ["a", "b", "c", "d"], cfg = {}) {
  const st = { timer: null, finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  core.start(c, cfg);
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
check(core.makeDeck(true).length === 36 && core.makeDeck(false).length === 32, "山札36枚(特殊なしは32枚)");
// 見え方
{ const { c, g } = mk(); const v = core.view(c, "a"); check(v.cards.a === null && v.cards.b !== null && Object.keys(v.cards).length === 4, "自分のカードだけ見えない"); }
// 合計の計算
const setHands = (g, arr) => g.order.forEach((id, k) => { g.hands[id] = arr[k]; });
{ const { g } = mk(); setHands(g, [{ v: 5 }, { v: 10 }, { v: -5 }, { v: 3 }]); check(T.total(g).sum === 13, "数字の合計 5+10-5+3=13"); }
{ const { g } = mk(); setHands(g, [{ v: 5 }, { v: 10 }, { s: "x2", v: 0 }, { v: 3 }]); check(T.total(g).sum === 36, "×2: (5+10+3)×2=36"); }
{ const { g } = mk(); setHands(g, [{ v: 5 }, { v: 20 }, { s: "max0", v: 0 }, { v: 3 }]); check(T.total(g).sum === 8, "MAX→0: 20 が 0 → 8"); }
{ const { g } = mk(); setHands(g, [{ v: 20 }, { v: 10 }, { s: "max0", v: 0 }, { s: "x2", v: 0 }]); check(T.total(g).sum === 20, "MAX→0 してから ×2: (0+10)×2=20"); }
{ const { g } = mk(); setHands(g, [{ v: 5 }, { v: 1 }, { s: "draw", v: 0 }, { v: 3 }]); g.deck.push({ s: "x2", v: 0 }, { v: 15 }); const t = T.total(g); check(t.sum === 24, "？: 山札の上(15)を足す → 24"); }
{ const { g } = mk(); setHands(g, [{ v: 5 }, { v: 1 }, { s: "draw", v: 0 }, { v: 3 }]); g.deck.push({ v: 4 }, { s: "x2", v: 0 }); const t = T.total(g); check(t.sum === 13, "？: 特殊カードが出たら引き直す(4) → 13"); }
{ const { g } = mk(); setHands(g, [{ v: -10 }, { v: 1 }, { s: "night", v: 0 }, { v: 3 }]); check(T.total(g).sum === -6 && T.total(g).night, "夜は0(あとでシャッフル)"); }
// 勝ち負け
{
  const { c, g, fire } = mk(); setHands(g, [{ v: 5 }, { v: 5 }, { v: 5 }, { v: 5 }]); // 合計20
  const [a, b, cc, d] = g.order;
  check(typeof core.handle(c, b, { a: "declare", n: 5 }) === "string", "番でない人は言えない");
  check(typeof core.handle(c, a, { a: "coyote" }) === "string", "最初の人はコヨーテできない");
  core.handle(c, a, { a: "declare", n: 10 }); check(typeof core.handle(c, b, { a: "declare", n: 10 }) === "string", "前より大きい数しか言えない");
  core.handle(c, b, { a: "declare", n: 21 }); core.handle(c, cc, { a: "coyote" });
  check(g.reveal.sum === 20 && g.reveal.loser === b && g.lives[b] === 2, "言った21 > 合計20 → 言った人がライフ−1");
  fire(); check(g.step === "bid" && g.turn === b && g.round === 2, "次の回は負けた人から");
  setHands(g, [{ v: 5 }, { v: 5 }, { v: 5 }, { v: 5 }]);
  core.handle(c, b, { a: "declare", n: 20 }); core.handle(c, cc, { a: "coyote" });
  check(g.reveal.loser === cc && g.lives[cc] === 2, "言った20 = 合計20(以下) → コヨーテした人がライフ−1");
}
// 脱落と勝ち
{
  const { c, g, st, fire } = mk(["a", "b", "c"], { lives: 1 });
  const [a, b, cc] = g.order; setHands(g, [{ v: 1 }, { v: 1 }, { v: 1 }]);
  core.handle(c, a, { a: "declare", n: 9 }); core.handle(c, b, { a: "coyote" });
  check(g.lives[a] === 0 && g.reveal.out, "ライフ0で脱落");
  fire(); check(g.turn === b && !g.hands[a], "脱落した人の次の人から。脱落した人にはカードを配らない");
  core.handle(c, b, { a: "declare", n: 99 }); core.handle(c, cc, { a: "coyote" });
  check(g.step === "end" && st.finished[cc] > st.finished[b] && st.finished[b] > st.finished[a], "最後の1人が勝ち(順位は脱落の遅い順)");
}
// 時間切れ
{ const { c, g, fire } = mk(); const f = g.turn; fire(); check(g.bids.length === 1 && g.bids[0].by === f && g.bids[0].n === 1, "時間切れ(最初の人)は 1 を言う"); fire(); check(g.step === "reveal", "時間切れ(2人目以降)はコヨーテ"); }
// たくさん遊んで決着・山札の枚数が保たれる
{
  let ended = 0;
  for (let n = 0; n < 300; n++) {
    const ids = Array.from({ length: 2 + (n % 9) }, (_, k) => "p" + k);
    const { c, g, st, fire } = mk(ids, { lives: 1 + (n % 5), specials: n % 4 !== 0 });
    let guard = 0;
    while (!st.finished && guard++ < 5000) {
      if (g.step === "bid") { const last = g.bids.length ? g.bids[g.bids.length - 1].n : 0; if (g.bids.length && Math.random() < 0.4) core.handle(c, g.turn, { a: "coyote" }); else core.handle(c, g.turn, { a: "declare", n: last + 1 + Math.floor(Math.random() * 8) }); }
      else fire();
      const cnt = g.deck.length + g.discard.length + (g.step === "bid" ? Object.keys(g.hands).length : 0);
      if (g.step === "bid" && cnt !== (g.cfg.specials ? 36 : 32)) { check(false, `カードの枚数が合わない ${cnt}`); break; }
    }
    if (st.finished) ended++;
    if (fails) break;
  }
  check(ended === 300, `ランダム対戦 ${ended}/300 回が決着(2〜10人・カード枚数も一定)`);
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
