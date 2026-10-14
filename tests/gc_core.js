const core = require("../games/mini/guessclub.js"), T = core._t;
let fails = 0; const check = (c, m) => { if (!c || !process.env.QUIET) console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids = ["a", "b", "c"], cfg = {}) {
  const st = { timer: null, finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: (x) => ids.includes(x), nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  let i = 0; core.start(c, cfg, () => ((i++ * 0.37) % 1));
  return { c, g: c.g, st, ids, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const H = (c, id, m) => core.handle(c, id, m);
const W = (x, id, ans) => H(x.c, id, { a: "write", answers: ans });
function toWrite(x, topic = "果物") {
  H(x.c, x.g.parent, { a: "topic", text: topic });
  for (const id of x.g.order) if (id !== x.g.parent) H(x.c, id, { a: "vote", ok: true });
}

// 表記ゆれ
check(T.canon("リンゴ") === T.canon("りんご") && T.canon("ＡＢＣ") === T.canon("abc") && T.canon("さくら んぼ") === T.canon("さくらんぼ"), "カタカナ/ひらがな・全角/半角・空白の違いは同じ答え");
check(T.bonusOf(3, 1) === 30 && T.bonusOf(3, 3) === 50 && T.bonusOf(5, 3) === 70 && T.bonusOf(8, 2) === 50 && T.bonusOf(6, 3) === 100, "報酬表(2-3人30/30/50・4-5人40/40/70・6-8人50/50/100)");

// 準備とお題
{
  const x = mk();
  const g = x.g;
  check(g.order.every((id) => g.P[id].money === 150 && g.P[id].markers === 4) && g.round === 1 && g.step === "topic" && g.bowl === 30, "初期資金$150・マーカー4つ・第1ラウンド・ボウル$30");
  check(typeof H(x.c, g.order.find((id) => id !== g.parent), { a: "topic", text: "果物" }) === "string", "親以外はお題を決められない");
  H(x.c, g.parent, { a: "topic", text: "果物" });
  const others = g.order.filter((id) => id !== g.parent);
  H(x.c, others[0], { a: "vote", ok: false }); H(x.c, others[1], { a: "vote", ok: false });
  check(g.step === "topic" && g.topic === "", "半分より多くが拒否するとお題を出し直し");
  H(x.c, g.parent, { a: "topic", text: "野菜" });
  H(x.c, others[0], { a: "vote", ok: false }); H(x.c, others[1], { a: "vote", ok: true });
  check(g.step === "write" && g.topic === "野菜", "半分以下の拒否なら決定");
}
// 書く
{
  const x = mk(); const g = x.g; toWrite(x);
  const [a] = g.order;
  check(typeof W(x, a, ["りんご", "リンゴ", "みかん", "ぶどう", "もも", "なし"]) === "string", "同じ答えを2枚は書けない");
  check(typeof W(x, a, ["りんご", "みかん", "", "ぶどう", "もも", "なし"]) === "string", "6つ全部書く");
  W(x, a, ["りんご", "みかん", "バナナ", "ぶどう", "もも", "なし"]);
  check(g.step === "write" && g.P[a].hand.length === 6, "書き終わった人の手札6枚");
  H(x.c, g.order[1], { a: "draft", answers: ["りんご", "いちご"] });
  x.fire();
  check(g.step === "act" && g.P[g.order[1]].hand.map((c) => c.t).join() === "りんご,いちご,,,," && g.P[g.order[2]].hand.every((c) => c.t === ""), "時間切れ: 書きかけはそのまま、残りは白紙");
  check(g.cur === g.order[(g.order.indexOf(g.parent) + 1) % 3], "親の左隣から手番");
}
// 出す・一致・賭け
{
  const x = mk(); const g = x.g; toWrite(x);
  const [a, b, c] = g.order;
  W(x, a, ["りんご", "みかん", "バナナ", "ぶどう", "もも", "なし"]);
  W(x, b, ["リンゴ", "メロン", "スイカ", "いちご", "キウイ", "ライム"]);
  W(x, c, ["林檎", "かき", "くり", "うめ", "ゆず", "レモン"]);
  g.cur = a;
  const card = g.P[a].hand.find((k) => k.t === "りんご");
  H(x.c, a, { a: "play", id: card.id });
  check(g.claims && g.played.matches[b] && !g.played.matches[c], "書き方の違うだけの答えは自動で一致");
  H(x.c, c, { a: "claim", id: g.P[c].hand.find((k) => k.t === "林檎").id });
  check(!g.claims && g.P[a].money === 180 && g.bowl === 30 && g.glass === 1 && g.P[a].hand.length === 5 && g.P[b].hand.length === 5 && g.P[c].hand.length === 5, "一致: ボウルの$30を獲得・ボウルに$30補充・ガラス+1・一致した人もカードを出す");
  check(g.cur === b, "次の人へ");
  H(x.c, b, { a: "play", id: g.P[b].hand.find((k) => k.t === "メロン").id });
  H(x.c, a, { a: "claim", id: null }); H(x.c, c, { a: "claim", id: null });
  check(g.P[b].money === 140 && g.bowl === 40 && g.glass === 1, "誰とも一致しない: $10をボウルへ");
  check(typeof H(x.c, c, { a: "bet", slot: 99 }) === "string", "予想は0〜13+");
  H(x.c, c, { a: "bet", slot: 3 });
  check(g.P[c].money === 140 && g.P[c].markers === 3 && g.bowl === 50, "賭け: $10を払ってマーカーを置く");
  H(x.c, a, { a: "bet", slot: 3 });
  check(typeof H(x.c, b, { a: "bet", slot: 3 }) === "string", "1マスにマーカーは2つまで");
  H(x.c, b, { a: "bet", slot: 1 });
  check(g.bets.length === 3, "賭け3つ");
  // a が手札を出し切って終了: 残りを自動で一致させない答えにして早送り
  for (let k = 0; k < 80 && g.step === "act"; k++) {
    const id = g.cur;
    if (g.claims) { const by = g.played.by; for (const o of g.order) if (o !== by && g.claims) H(x.c, o, { a: "claim", id: null }); continue; }
    const p = g.P[id];
    if (id === a) H(x.c, id, { a: "play", id: p.hand[0].id }); else H(x.c, id, { a: "play", id: p.hand[0].id });
  }
  check(g.step === "result" && g.order.some((id) => g.P[id].hand.length === 0), "誰かの手札がなくなったらラウンド終了");
}
// 精算(手札罰金・ボーナス・半分ずつ)
{
  const x = mk(["a", "b", "c", "d"]); const g = x.g;
  g.step = "act"; g.glass = 2; g.bowl = 25;
  g.P.a.hand = []; g.P.b.hand = [{ id: 1, t: "x" }, { id: 2, t: "y" }]; g.P.c.hand = [{ id: 3, t: "z" }]; g.P.d.hand = [];
  g.bets = [{ id: "c", slot: 2, seq: 0 }, { id: "d", slot: 2, seq: 1 }, { id: "a", slot: 5, seq: 2 }];
  const before = { ...Object.fromEntries(Object.entries(g.P).map(([k, v]) => [k, v.money])) };
  T.scoring(x.c);
  const pot = 25 + 40 + 20 + 40; // ボウル+罰金(b40,c20)+ボーナス40(4人・第1ラウンド)
  check(g.results.pot === pot && g.results.bonus === 40, `ボウル = 残り${25}+罰金${60}+ボーナス40 = $${pot}`);
  check(g.P.c.money === before.c - 20 + Math.ceil(pot / 2) && g.P.d.money === before.d + Math.floor(pot / 2), "正解2人は半分ずつ(割り切れない分は先に置いた人)");
  check(g.bowl === 0 && g.step === "result", "ボウルは空に");
}
{
  const x = mk(["a", "b"]); const g = x.g;
  g.step = "act"; g.glass = 15; g.bowl = 10; g.P.a.hand = []; g.P.b.hand = [];
  g.bets = [{ id: "a", slot: 13, seq: 0 }];
  T.scoring(x.c);
  check(g.P.a.money === 150 + 10 + 30, "一致13回以上は「13+」が当たり");
}
{
  const x = mk(["a", "b"]); const g = x.g;
  g.step = "act"; g.glass = 1; g.bowl = 10; g.P.a.hand = []; g.P.b.hand = [];
  g.bets = [{ id: "a", slot: 4, seq: 0 }];
  T.scoring(x.c);
  check(g.P.a.money === 150 && g.P.b.money === 150 && g.bowl === 0, "誰も当たらなければボウルは銀行へ");
}
// お題と関係ない回答ルール
{
  const x = mk(["a", "b", "c"], { penalty: "off" }); const g = x.g;
  g.step = "act"; g.glass = 0; g.bowl = 30;
  g.P.a.hand = []; g.P.a.out = [{ id: 1, t: "りんご" }, { id: 2, t: "くるま" }];
  g.P.b.hand = [{ id: 3, t: "いちご" }, { id: 4, t: "メロン" }]; g.P.c.hand = [{ id: 5, t: "" }];
  T.scoring(x.c);
  check(g.step === "judge", "正式ルール: ラウンド後にみんなで判定");
  H(x.c, "b", { a: "flag", id: 2, on: true }); H(x.c, "c", { a: "flag", id: 2, on: true }); H(x.c, "a", { a: "flag", id: 2, on: true });
  H(x.c, "b", { a: "flag", id: 3, on: true });
  for (const id of ["a", "b", "c"]) H(x.c, id, { a: "flagDone" });
  check(g.results.fines.a === 20 && !g.results.fines.b && g.results.fines.c === 20, "半分より多くが「関係ない」とした回答と白紙だけ$20(残った手札は罰金なし・自分の札には押せない)");
}
// 3ラウンドで終了
{
  const x = mk(["a", "b"]); const g = x.g;
  for (let r = 0; r < 3; r++) {
    toWrite(x);
    for (const id of g.order) W(x, id, ["1あ", "2い", "3う", "4え", "5お", "6か"].map((s) => s + id));
    for (let k = 0; k < 80 && g.step === "act"; k++) {
      if (g.claims) { const by = g.played.by; for (const o of g.order) if (o !== by && g.claims) H(x.c, o, { a: "claim", id: null }); continue; }
      H(x.c, g.cur, { a: "play", id: g.P[g.cur].hand[0].id });
    }
    for (const id of g.order) H(x.c, id, { a: "next" });
  }
  check(g.step === "end" && x.st.finished && Object.keys(x.st.finished).length === 2, "3ラウンドで終了して順位");
}
// 抜けても止まらない
{
  const x = mk(["a", "b", "c"]); const g = x.g; toWrite(x);
  for (const id of g.order) W(x, id, ["1", "2", "3", "4", "5", "6"].map((s) => s + id));
  g.cur = "a";
  H(x.c, "a", { a: "play", id: g.P.a.hand[0].id });
  H(x.c, "b", { a: "claim", id: null });
  x.ids.splice(x.ids.indexOf("c"), 1);
  core.onLeave(x.c, "c");
  check(!g.claims && g.cur === "b", "名乗り待ちの人が抜けたら、そのまま決まって次の人へ");
}
// 時間切れで進む
{
  const x = mk(); const g = x.g;
  x.fire(); check(g.step === "confirm" && g.topic, "お題の時間切れ: 候補の1つ目");
  x.fire(); check(g.step === "write", "承認の時間切れ: 決定");
  x.fire(); check(g.step === "act", "書く時間切れ: 白紙で開始");
  const cur = g.cur; x.fire(); check(g.cur !== cur || g.step !== "act" || g.claims === null, "手番の時間切れ: 1枚出す");
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
process.exit(fails ? 1 : 0);
