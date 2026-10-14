const core = require("../games/mini/heat.js"), T = core._t;
let fails = 0; const check = (c, m) => { if (!c || !process.env.QUIET) console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids = ["a", "b", "c"], cfg = {}, seed = 1) {
  const st = { timer: null, finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: (x) => ids.includes(x), nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  core.start(c, cfg, rnd);
  return { c, g: c.g, st, ids, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const H = (c, id, m) => core.handle(c, id, m);
const K = (g, id, k) => g.P[id].hand.filter((cd) => cd.k === k).map((cd) => cd.id);
// 手札を好きな札にする(テスト用)
let NID = 9000;
function setHand(g, id, ks) { const p = g.P[id]; p.hand = ks.map((k) => ({ id: NID++, k })); }
// ほかの人のターンを済ませて、id の番まで進める
function until(x, id) {
  const g = x.g;
  for (let k = 0; k < 20 && g.turn && g.turn.pid !== id; k++) { const o = g.turn.pid; H(x.c, o, { a: "react" }); if (g.turn && g.turn.phase === "slip") H(x.c, o, { a: "slip", yes: false }); if (g.turn && g.turn.pid === o) H(x.c, o, { a: "discard", ids: [] }); }
}

// コース
for (const [k, t] of Object.entries(core.TRACKS)) {
  const sum = t.corners.length;
  check(t.xy.length === t.n && t.corners.every((c, i) => i === 0 || c.at > t.corners[i - 1].at), `${t.name}: ${t.n}マス・コーナー${sum}・${t.laps}周・ヒート${t.heat}・ストレス${t.stress}`);
}
check([core.TRACKS.usa.n, core.TRACKS.italia.n, core.TRACKS.france.n, core.TRACKS.gb.n].join() === "69,54,60,63", "1周のマス数が盤の表示どおり(USA69・Italia54・France60・GB63)");
check(core.TRACKS.gb.corners.map((c) => c.lim).join() === "10,6,5,4,3" && core.TRACKS.usa.corners.map((c) => c.lim).join() === "4,3,3,2", "制限速度(GB 10・6・5・4・3 / USA 4・3・3・2)");

// 準備
{
  const x = mk(); const g = x.g, p = g.P[g.order[0]];
  const all = [...p.hand, ...p.deck];
  check(all.length === 18 && p.hand.length === 7 && p.engine.length === 6 && p.gear === 1, "デッキ18枚(スピード12・0・5・ヒート1・ストレス3)、手札7、エンジンにヒート6、1速");
  check(all.filter((c) => c.k === "x").length === 3 && all.filter((c) => c.k === "h").length === 1, "ストレス3・デッキのヒート1");
  check(g.order.map((id) => g.P[id].pos + ":" + g.P[id].spot).join() === "-1:0,-1:1,-2:0", "グリッド: 1・2番が最前列");
  check(g.goal === 138 && g.step === "plan", "USAは2周(138マス)");
}
{ const x = mk(["a", "b"], { laps: 1, track: "italia" }); check(x.g.goal === 54 && x.g.laps === 1, "周回数を1周にできる"); }

// ギアとカード
{
  const x = mk(); const g = x.g, [a] = g.order;
  setHand(g, a, ["s1", "s2", "s3", "s4", "u5", "h", "x"]);
  check(typeof H(x.c, a, { a: "plan", shift: 0, ids: [] }) === "string", "1速なら1枚");
  check(typeof H(x.c, a, { a: "plan", shift: 3, ids: [] }) === "string", "ギアは±2まで");
  check(typeof H(x.c, a, { a: "plan", shift: 0, ids: K(g, a, "h") }) === "string", "ヒートは出せない");
  const e0 = g.P[a].engine.length;
  H(x.c, a, { a: "plan", shift: 2, ids: [...K(g, a, "s4"), ...K(g, a, "s3"), ...K(g, a, "u5")] });
  check(g.P[a].plan && g.P[a].plan.gear === 3, "2段上げて3速・3枚");
  for (const id of g.order.slice(1)) H(x.c, id, { a: "plan", shift: 0, ids: [g.P[id].hand.find((cd) => cd.k !== "h").id] });
  check(g.P[a].engine.length === e0 - 1, "2段変えるとヒート1");
  check(g.step === "move" && g.moveOrder[0] === a, "全員出したら先頭の車から");
  check(g.turn.pid === a && g.turn.speed === 12 && g.P[a].pos === -1 + 12, "スピード4+3+5=12で進む");
}
// 手札がヒートだらけ
{
  const x = mk(["a", "b"]); const g = x.g;
  g.P.a.gear = 3; setHand(g, "a", ["s1", "h", "h", "h", "h", "h", "h"]);
  check(typeof H(x.c, "a", { a: "plan", shift: 0, ids: [...K(g, "a", "s1"), ...K(g, "a", "h").slice(0, 1)] }) === "string", "出せる札が足りないときも枚数はギアの数");
  H(x.c, "a", { a: "plan", shift: 0, ids: [...K(g, "a", "s1"), ...K(g, "a", "h").slice(0, 2)] });
  H(x.c, "b", { a: "plan", shift: 0, ids: [g.P.b.hand.find((cd) => cd.k !== "h").id] });
  until(x, "a"); until(x, "zz");
  check(g.log.some((t) => t.includes("a はオーバーヒート")) && g.P.a.gear === 1 && g.P.a.pos === -1, "オーバーヒート: 動かず1速へ");
}
// ストレス
{
  const x = mk(["a", "b"]); const g = x.g;
  setHand(g, "a", ["x", "s1", "s1", "s1", "s1", "s1", "s1"]);
  g.P.a.deck = [{ id: 1, k: "s3" }, { id: 2, k: "h" }, { id: 3, k: "u0" }]; // 上から u0 → h → s3
  H(x.c, "a", { a: "plan", shift: 0, ids: K(g, "a", "x") });
  H(x.c, "b", { a: "plan", shift: 0, ids: [g.P.b.hand.find((cd) => cd.k !== "h").id] });
  until(x, "a");
  const t = g.turn && g.turn.pid === "a" ? g.turn : null;
  check(t && t.speed === 3 && t.flips[0].skipped.join() === "u0,h", "ストレス: スピードカードが出るまでめくる(ほかは捨て札)");
}
// 置き場所(ふさがっていたら後ろへ)
{
  const x = mk(["a", "b", "c"]); const g = x.g;
  g.P.b.pos = 10; g.P.b.spot = 0; g.P.c.pos = 10; g.P.c.spot = 1;
  T.place(g, "a", 10);
  check(g.P.a.pos === 9 && g.P.a.spot === 0, "2台いるマスには止まれず、1つ手前へ");
  T.place(g, "a", 11);
  check(g.P.a.pos === 11 && g.P.a.spot === 0, "空いていればレースライン側");
}
// コーナー
{
  check(T.cornersBetween({ cfg: {}, track: "usa", N: 69, goal: 138 }, 5, 40).map((c) => c.lim).join() === "4,3", "通ったコーナーを順に(USA: 5→40で 4・3)");
  check(T.cornersBetween({ cfg: {}, track: "usa", N: 69, goal: 138 }, 60, 85).map((c) => c.x).join() === "81", "2周目のコーナーも");
  check(T.cornersBetween({ cfg: {}, track: "usa", N: 69, goal: 69 }, 60, 85).length === 0, "ゴールの先のコーナーは無視");
}
function moveA(x, ks, opt = {}) {
  const g = x.g;
  setHand(g, "a", ks.concat(["s1", "s1", "s1", "s1", "s1", "s1", "s1"]).slice(0, 7));
  g.P.a.gear = opt.gear || ks.length;
  H(x.c, "a", { a: "plan", shift: 0, ids: g.P.a.hand.slice(0, ks.length).map((cd) => cd.id) });
  for (const id of g.order) if (id !== "a" && !g.P[id].done) H(x.c, id, { a: "plan", shift: 0, ids: g.P[id].hand.filter((cd) => cd.k !== "h").slice(0, g.P[id].gear).map((cd) => cd.id) });
}
{
  const x = mk(["a", "b"]); const g = x.g;
  g.P.a.pos = 8; g.P.b.pos = -20; // aが先頭(USA: 12マス目の手前がコーナー制限4)
  moveA(x, ["s3", "s4"]);
  check(g.turn.pid === "a" && g.P.a.pos === 15, "a: 8→15");
  const e = g.P.a.engine.length;
  H(x.c, "a", { a: "react" });
  if (g.turn.phase === "slip") H(x.c, "a", { a: "slip", yes: false });
  check(g.P.a.engine.length === e - 3 && g.turn.corners[0].paid === 3, "スピード7で制限4のコーナー → ヒート3");
  H(x.c, "a", { a: "discard", ids: [] });
}
{
  const x = mk(["a", "b"]); const g = x.g;
  g.P.a.pos = 8; g.P.b.pos = -20;
  g.P.a.engine = g.P.a.engine.slice(0, 1);
  moveA(x, ["s4", "s4", "s4"]);
  H(x.c, "a", { a: "react" });
  if (g.turn.phase === "slip") H(x.c, "a", { a: "slip", yes: false });
  const t = g.turn;
  check(t.corners[0].spin && g.P.a.pos === 11 && g.P.a.engine.length === 0 && g.P.a.gear === 1 && g.P.a.hand.filter((cd) => cd.k === "x").length === 2, "払えない → スピン: コーナーの手前へ・ヒート全部払う・3速以上はストレス2枚・1速");
}
// ブースト・クールダウン・アドレナリン
{
  const x = mk(["a", "b"]); const g = x.g;
  g.P.a.pos = 30; g.P.b.pos = 20; // bが最後尾 → アドレナリン
  setHand(g, "b", ["s1", "h", "h", "h", "s2", "s2", "s2"]); g.P.b.gear = 1;
  H(x.c, "b", { a: "plan", shift: 0, ids: [g.P.b.hand[0].id] });
  setHand(g, "a", ["s1", "s1", "s1", "s1", "s1", "s1", "s1"]); g.P.a.gear = 1;
  H(x.c, "a", { a: "plan", shift: 0, ids: [g.P.a.hand[0].id] });
  check(g.turn.pid === "a", "先頭のaから");
  H(x.c, "a", { a: "react" }); if (g.turn.phase === "slip") H(x.c, "a", { a: "slip", yes: false }); H(x.c, "a", { a: "discard", ids: [] });
  check(g.turn.pid === "b" && g.turn.adrenaline && g.turn.pool.cool === 4, "最後尾はアドレナリン(1速クールダウン3+1)");
  const e = g.P.b.engine.length;
  H(x.c, "b", { a: "cool", n: 4 });
  check(g.P.b.engine.length === e + 3 && g.P.b.hand.filter((cd) => cd.k === "h").length === 0, "クールダウン: 手札のヒートをエンジンへ");
  g.P.b.deck = [{ id: 77, k: "s4" }];
  H(x.c, "b", { a: "boost" });
  check(g.turn.speed === 5 && g.P.b.pos === 25 && g.P.b.engine.length === e + 2, "ブースト: ヒート1でめくって+4");
  check(typeof H(x.c, "b", { a: "boost" }) === "string", "ブーストは1回まで");
  H(x.c, "b", { a: "adr" });
  check(g.turn.speed === 6 && g.P.b.pos === 26, "アドレナリンで+1");
}
// スリップストリーム
{
  const x = mk(["a", "b"]); const g = x.g;
  g.P.a.pos = 40; g.P.b.pos = 20;
  moveA(x, ["s1"]);
  H(x.c, "a", { a: "react" }); if (g.turn.phase === "slip") H(x.c, "a", { a: "slip", yes: false }); H(x.c, "a", { a: "discard", ids: [] });
  // b を a(41) の1つ後ろ(40)に着くようにする
  g.P.b.pos = 38;
  g.turn.speed = 0;
  core._t.place(g, "b", 40);
  H(x.c, "b", { a: "react" });
  check(g.turn.phase === "slip", "1マス前に車 → スリップストリームできる");
  H(x.c, "b", { a: "slip", yes: true });
  check(g.P.b.pos === 42, "+2マス");
}
{
  const g = { cfg: {}, track: "usa", N: 69, goal: 69, P: { a: { pos: 67, spot: 0 }, b: { pos: 68, spot: 0 } }, order: ["a", "b"] };
  check(!T.slipAllowed(g, "a"), "最終周はゴールを越えるスリップストリーム不可");
}
// 捨て札
{
  const x = mk(["a", "b"]); const g = x.g;
  g.P.a.pos = 40; g.P.b.pos = 0;
  moveA(x, ["s1"]);
  H(x.c, "a", { a: "react" }); if (g.turn.phase === "slip") H(x.c, "a", { a: "slip", yes: false });
  setHand(g, "a", ["u5", "x", "h", "u0", "s2", "s3"]);
  check(typeof H(x.c, "a", { a: "discard", ids: K(g, "a", "u5") }) === "string" && typeof H(x.c, "a", { a: "discard", ids: K(g, "a", "x") }) === "string", "5・ストレス・ヒートは捨てられない");
  H(x.c, "a", { a: "discard", ids: [...K(g, "a", "u0"), ...K(g, "a", "s2")] });
  check(g.P.a.hand.length === 7 && g.turn.pid === "b", "捨てたあと7枚まで引いて次の人へ");
}
// 完走まで(全部時間切れで自動)
for (const track of Object.keys(core.TRACKS)) for (const n of [2, 4, 6]) {
  const ids = "abcdef".slice(0, n).split("");
  const x = mk(ids, { track, laps: 1 }, n * 7 + track.length);
  let guard = 0;
  while (x.g.step !== "end" && guard++ < 3000) x.fire();
  const g = x.g;
  check(g.step === "end" && x.st.finished && g.result.length === n && g.round < 80, `${track}・${n}人・1周: 時間切れだけで完走(${g.round}ラウンド)`);
}
// 抜けても止まらない
{
  const x = mk(["a", "b", "c"]); const g = x.g;
  H(x.c, "a", { a: "plan", shift: 0, ids: [g.P.a.hand.find((cd) => cd.k !== "h").id] });
  H(x.c, "b", { a: "plan", shift: 0, ids: [g.P.b.hand.find((cd) => cd.k !== "h").id] });
  x.ids.splice(x.ids.indexOf("c"), 1); core.onLeave(x.c, "c");
  check(g.step === "move", "最後の1人が抜けたら、残りで進む");
  const cur = g.turn.pid; x.ids.splice(x.ids.indexOf(cur), 1); core.onLeave(x.c, cur);
  check(g.step === "plan" || (g.turn && g.turn.pid !== cur), "動いている人が抜けたら次へ");
}
// view
{
  const x = mk(); const v = core.view(x.c, "a");
  check(v.hand.length === 7 && v.track.cells.length === 69 && v.P.b.hand === 7 && !("deck" in v.P.b && Array.isArray(v.P.b.deck)), "見える情報: 自分の手札だけ");
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
process.exit(fails ? 1 : 0);
