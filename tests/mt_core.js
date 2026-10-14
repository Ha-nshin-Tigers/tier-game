const core = require("../games/mini/matchy.js"), T = core._t;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids, cfg = {}) {
  const st = { timer: null, finished: null, ms: 0 };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  core.start(c, cfg);
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const H = (c, id, m) => core.handle(c, id, m);
check(T.compare([1, 2, 3, 4, 5], [1, 5, 9, 8, 7]).pts === 5, "得点: 同じ順番3+違う順番2");
check(T.compare([1, 2], [2, 1]).pts === 4 && T.compare([1, 2, 3], [4, 5, 6]).pts === 0, "得点: 入れ替わり2+2・一致なし0");
check(T.cardsAt(0) === 5 && T.cardsAt(29) === 2, "スタートは5枚、終盤は2枚");
{
  const { c, g, st, fire } = mk(["a", "b", "c", "d"], { pairs: "order" });
  check(!g.odd && g.teams.length === 2 && g.teams[0].ids.join() === "a,b", "4人: 入室順でペア2組");
  check(g.step === "call" && g.caller === "a" && core.view(c, "b").card === null, "番号を言う前はお題が見えない");
  check(H(c, "b", { a: "call", n: 3 }) !== undefined, "番号を言えるのは親だけ");
  H(c, "a", { a: "call", n: 3 });
  check(g.step === "pick" && g.theme.word === g.card[2], "3番のお題に決まる");
  check(H(c, "a", { a: "pick", cards: [1, 2, 3] }) === "5枚選んでください" && H(c, "a", { a: "pick", cards: [1, 1, 2, 3, 4] }) !== undefined, "枚数・重複のチェック");
  H(c, "a", { a: "pick", cards: [1, 2, 3, 4, 5] });
  check(core.view(c, "b").picks.a === undefined && core.view(c, "b").picked.includes("a"), "ほかの人の選んだカードは見えない(出したことは見える)");
  H(c, "b", { a: "pick", cards: [1, 5, 9, 8, 7] }); H(c, "c", { a: "pick", cards: [10, 11, 12, 13, 14] }); H(c, "d", { a: "pick", cards: [14, 13, 12, 11, 10] });
  check(g.step === "reveal" && g.teams[0].pos === 5 && g.teams[1].pos === 2 + 2 + 3 + 2 + 2, "全員出したら答え合わせ: a&b 5点・c&d 11点");
  check(core.view(c, "a").picks.c.length === 5, "答え合わせで全員のカードが見える");
  H(c, "c", { a: "next" });
  check(g.round === 2 && g.caller === "b" && core.view(c, "c").need === 4, "次のラウンド: 親が交代・11マス目は4枚");
}
{
  // 奇数: 参照プレイヤー
  const { c, g, st, fire } = mk(["a", "b", "c"], { ref: "c" });
  check(g.odd && g.ref === "c" && g.teams.length === 2 && core.view(c, "c").need === 5, "3人: c が参照プレイヤー(いつも5枚)・コマ2つ");
  fire(); // 時間切れで番号はランダム
  check(g.step === "pick", "時間切れで番号は自動");
  H(c, "c", { a: "pick", cards: [0, 1, 2, 3, 4] }); H(c, "a", { a: "pick", cards: [0, 1, 2, 3, 4] });
  fire(); // b は出さない
  check(g.step === "reveal" && g.teams[0].pos === 15 && g.teams[1].pos === 0, "参照と全部一致で15点・出さなかった人は0点");
  fire();
  H(c, g.caller, { a: "call", n: 1 });
  H(c, "c", { a: "pick", cards: [0, 1, 2, 3, 4] }); H(c, "a", { a: "pick", cards: [0, 1, 2, 3] }); H(c, "b", { a: "pick", cards: [0, 1, 2, 3, 4] });
  fire(); H(c, g.caller, { a: "call", n: 1 });
  H(c, "c", { a: "pick", cards: [0, 1, 2, 3, 4] }); H(c, "a", { a: "pick", cards: [0, 1] }); H(c, "b", { a: "pick", cards: [0, 1, 2, 3] });
  check(g.winner && g.winner.ids.join() === "a", "ゴールに着いたチームの勝ち(15+12+6=33≥30)");
  fire(); check(st.finished && st.finished.a > st.finished.b, "終了・a が1位");
}
{
  // 同時ゴール → 同点決勝
  const { c, g, st, fire } = mk(["a", "b", "c", "d"], { pairs: "order" });
  g.teams[0].pos = 28; g.teams[1].pos = 28;
  H(c, "a", { a: "call", n: 1 });
  const p = (x, cards) => H(c, x, { a: "pick", cards });
  p("a", [0, 1]); p("b", [0, 1]); p("c", [0, 1]); p("d", [0, 1]);
  check(g.playoff && g.playoff.length === 2 && !g.winner, "2組が同時にゴール → 同点決勝");
  fire(); H(c, g.caller, { a: "call", n: 2 });
  p("a", [0, 1]); p("b", [0, 1]); p("c", [0, 1]); p("d", [1, 0]);
  check(g.winner && g.winner.ids.join() === "a,b", "決勝で点の多いペアの勝ち");
}
{
  // ランダムに遊んで必ず終わる・抜けても大丈夫
  for (let n = 0; n < 300; n++) {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"].slice(0, 3 + (n % 6));
    const { c, g, st, fire } = mk(ids, { level: ["easy", "hard", "mix"][n % 3] });
    let guard = 0;
    while (!st.finished && guard++ < 500) {
      if (g.step === "call") H(c, g.caller, { a: "call", n: 1 + (guard % 12) });
      else if (g.step === "pick") for (const id of [...g.order]) { const k = T.need(g, id), pool = Array.from({ length: 12 }, (_, i) => i); H(c, id, { a: "pick", cards: pool.sort(() => Math.random() - 0.5).slice(0, k) }); }
      else fire();
      if (n % 11 === 0 && guard === 5 && g.order.length > 3) core.onLeave(c, g.order[1]);
    }
    if (!st.finished) { check(false, `終わらない n=${n} round=${g.round}`); break; }
  }
  check(true, "3〜8人でランダムに300回遊んで全部終わる");
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
