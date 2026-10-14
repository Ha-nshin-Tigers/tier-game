const core = require("../games/mini/mortar.js"), T = core._t;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids, cfg = {}) {
  const st = { timer: null, finished: null, ms: 0 };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  core.start(c, cfg);
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const H = (c, id, m) => core.handle(c, id, m);
// 並びが盤に収まる
for (const N of [5, 6]) for (let len = 3; len <= 12; len++) for (let k = 0; k < 50; k++) {
  const s = T.makeSeq(len, N), p = T.pathOf(s);
  const w = Math.max(...p.map((a) => a[0])) - Math.min(...p.map((a) => a[0])), h = Math.max(...p.map((a) => a[1])) - Math.min(...p.map((a) => a[1]));
  if (s.length !== len || w > N - 1 || h > N - 1) { check(false, `並びがはみ出す N${N} len${len}`); break; }
}
check(true, "並びはいつも盤に収まる(5×5・6×6、3〜12歩)");
check(core.normalize({ speed: "x", lives: 9 }).speed === "normal" && core.normalize({ lives: 3 }).lives === 3, "設定の検証");
// 進行: ready → show → act(ビート) → result
const answer = (g, id, i) => { const p = T.pathOf(g.seq); return g.seq[i]; };
{
  const { c, g, st, fire } = mk(["a", "b", "c"]);
  check(g.step === "ready" && g.round === 1 && g.seq.length === 3 && g.N === 5, "1ラウンド目: 矢印3つ・5×5");
  check(core.view(c, "a").seq.length === 0 || core.view(c, "a").step !== "act", "準備中");
  fire(); check(g.step === "show" && core.view(c, "a").seq.length === 3 && st.ms === 3 * 800 + 500, "見本: 並びが見える・表示時間");
  check(H(c, "a", { a: "move", d: "U" }) === "砲撃が始まってから動けます", "見本の間は動けない");
  fire(); check(g.step === "act" && core.view(c, "a").seq.length === 0, "砲撃中は並びが見えない");
  // a は正解、b は間違い、c は何もしない
  for (let i = 0; i < 3; i++) {
    H(c, "a", { a: "move", d: g.seq[i] });
    if (i === 0) { const wrong = { U: "D", D: "U", L: "R", R: "L" }[g.seq[0]]; H(c, "b", { a: "move", d: wrong }); }
    if (i === 0) check(core.view(c, "b").pend !== null && core.view(c, "a").pend === g.seq[0], "選んだ向きは自分にだけ見える");
    fire();
    if (i === 0) {
      check(g.P.a.alive && !g.P.b.alive && !g.P.c.alive, "正解は無事・間違い/動かないと吹き飛ぶ");
      check(g.boom.length >= 22 && g.boom.length <= 24 && !g.boom.includes(g.P.a.pos.join(",")), "正しいマス(3人分)以外は爆発 " + g.boom.length);
    }
    if (g.step !== "act") break;
  }
  check(g.step === "result", "生き残りが1人 → ラウンドの終わり");
  fire(); check(g.step === "end" && st.finished && st.finished.a > st.finished.b && st.finished.b === st.finished.c, "終了: aの勝ち・bとcは同順位");
}
{
  // ライフ2: 1回目のミスは被弾して正しいマスへ。ラウンドが進むと長く速く
  const { c, g, st, fire } = mk(["a", "b"], { lives: 2, speed: "fast" });
  fire(); fire();
  H(c, "a", { a: "move", d: { U: "D", D: "U", L: "R", R: "L" }[g.seq[0]] }); H(c, "b", { a: "move", d: g.seq[0] }); fire();
  const p = T.pathOf(g.seq), want = [g.P.a.pos[0], g.P.a.pos[1]];
  check(g.P.a.alive && g.P.a.lives === 1 && g.P.a.hit, "ライフ2: 被弾してライフ1");
  for (let i = 1; i < g.seq.length; i++) { H(c, "a", { a: "move", d: g.seq[i] }); H(c, "b", { a: "move", d: g.seq[i] }); fire(); }
  check(g.step === "result", "最後まで動けた");
  fire(); check(g.step === "ready" && g.round === 2 && g.seq.length === 4 && g.beatMs < 1300, "2ラウンド目: 矢印4つ・少し速い");
}
{
  // ひとり練習: 吹き飛ぶまで続く
  const { c, g, st, fire } = mk(["solo"]);
  for (let r = 0; r < 3; r++) { fire(); fire(); for (let i = 0; i < g.seq.length; i++) { H(c, "solo", { a: "move", d: g.seq[i] }); fire(); } fire(); }
  check(g.round === 4 && g.P.solo.cleared === 3, "ひとり: 3ラウンドクリアして4ラウンド目へ");
  fire(); fire(); fire();
  check(g.step === "result", "動かないと吹き飛ぶ"); fire();
  check(g.step === "end" && st.finished, "ひとり: 吹き飛んだら終わり");
}
{
  // 8人: 6×6、ランダムに遊んでも終わる・抜けても大丈夫
  for (let n = 0; n < 200; n++) {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"].slice(0, 1 + (n % 8));
    const { c, g, st, fire } = mk(ids, { lives: 1 + (n % 3) });
    let guard = 0;
    while (!st.finished && guard++ < 2000) {
      if (g.step === "act") for (const id of g.order) if (g.P[id].alive) H(c, id, { a: "move", d: Math.random() < 0.85 ? g.seq[g.beat] : "U" });
      if (n % 7 === 0 && guard === 30 && g.order.length > 1) core.onLeave(c, g.order[0]);
      fire();
    }
    if (!st.finished) { check(false, `終わらない n=${n}`); break; }
    const rows = g.result; if (!rows || rows.length !== g.order.length) { check(false, "結果の人数"); break; }
  }
  check(true, "1〜8人・ライフ1〜3でランダムに200回遊んで全部終わる");
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
