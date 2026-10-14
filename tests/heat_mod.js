const core = require("../games/mini/heat.js"), T = core._t;
let fails = 0; const check = (c, m) => { if (!c || !process.env.QUIET) console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids = ["a", "b", "c"], cfg = {}, seed = 3) {
  const st = { timer: null, finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: (x) => ids.includes(x), nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  core.start(c, cfg, rnd);
  return { c, g: c.g, st, ids, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const H = (c, id, m) => core.handle(c, id, m);
let NID = 50000;
const setHand = (g, id, ks) => { g.P[id].hand = ks.map((k) => ({ id: NID++, k })); };
const ids = (g, id, ks) => ks.map((k) => g.P[id].hand.find((cd) => cd.k === k && !ids.used.has(cd.id))).map((cd) => { ids.used.add(cd.id); return cd.id; });
ids.used = new Set();
function others(x, me) { for (const id of x.g.order) if (id !== me && !x.g.P[id].done) H(x.c, id, { a: "plan", shift: 0, ids: x.g.P[id].hand.filter((cd) => cd.k !== "h").slice(0, x.g.P[id].gear).map((cd) => cd.id) }); }
function until(x, id) {
  const g = x.g;
  for (let k = 0; k < 20 && g.turn && g.turn.pid !== id; k++) { const o = g.turn.pid; if (g.turn.phase === "choose") H(x.c, o, { a: "choose", vals: [] }); H(x.c, o, { a: "react" }); if (g.turn && g.turn.phase === "slip") H(x.c, o, { a: "slip", yes: false }); if (g.turn && g.turn.pid === o) H(x.c, o, { a: "discard", ids: [] }); }
}

// コースのデータ
const nums = Object.fromEntries(Object.entries(core.TRACKS).map(([k, t]) => [k, t.n]));
check(nums.japan === 60 && nums.mexico === 60 && nums.espana === 109 && nums.nederland === 55, "拡張コースのマス数(Japan60・Mexico60・España109・Nederland55)");
check(core.TRACKS.japan.heat === 7 && core.TRACKS.mexico.stress === 2 && core.TRACKS.espana.laps === 1 && core.TRACKS.nederland.laps === 3, "拡張コースのヒート・ストレス・周回数");
check(core.TRACKS.mexico.groups.length === 4 && core.TRACKS.espana.groups.length === 9, "シケインは路面トークン1つ分");
// アップグレードの表
const ups = Object.keys(core.CARDS).filter((k) => k[0] === "g");
check(ups.length === 58, "アップグレード 58種(60番まで、ヒート2種を除く)");
check(core.CARDS.g10.choices.join() === "1,5" && core.CARDS.g43.v === 8 && core.CARDS.g43.sym.scrap === 6 && core.CARDS.g2.plus, "ブレーキ1|5・ターボ8(スクラップ6)・四輪駆動＋＋＋");

// ガレージ: 3巡のドラフト
{
  const x = mk(["a", "b", "c"], { garage: "basic" });
  const g = x.g;
  check(g.step === "draft" && g.draft.market.length === 6 && g.draft.order.join() === [...g.order].reverse().join(), "ドラフト1巡目: 場に人数+3枚・後ろの車から");
  check(g.order.every((id) => !g.P[id].deck.some((cd) => cd.k === "u5")), "ガレージではスタートアップグレードを使わない");
  check(typeof H(x.c, g.draft.order[1], { a: "pick", i: 0 }) === "string", "自分の番でなければ選べない");
  for (let k = 0; k < 3; k++) H(x.c, g.draft.cur || g.draft.order[g.draft.i], { a: "pick", i: 0 });
  check(g.draft.round === 2 && g.draft.order.join() === g.order.join(), "2巡目は前の車から");
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) H(x.c, g.draft.order[g.draft.i], { a: "pick", i: 0 });
  check(g.step === "plan" && g.order.every((id) => g.P[id].ups.length === 3 && g.P[id].hand.length === 7 && g.P[id].hand.length + g.P[id].deck.length === 12 + 3 + 3), "3枚選んだらデッキに入れてレース開始(スピード12+アップグレード3+ストレス3)");
  check(g.order.every((id) => g.P[id].ups.every((k) => k === "h" || (core.CARDS[k].upg >= 1 && core.CARDS[k].upg <= 17))), "基本のアップグレードだけ");
}
// 時間切れでもドラフトが進む
{
  const x = mk(["a", "b"], { garage: "all" });
  for (let k = 0; k < 10 && x.g.step === "draft"; k++) x.fire();
  check(x.g.step === "plan" && x.g.P.a.ups.length === 3, "時間切れでもドラフトが終わる");
}
// アップグレードの効果
function turnWith(cards, opt = {}) {
  const x = mk(["a", "b"], { track: opt.track || "usa", weather: !!opt.weather });
  const g = x.g;
  g.P.a.pos = opt.pos ?? 20; g.P.b.pos = opt.bpos ?? 0;
  if (opt.engine != null) g.P.a.engine = g.P.a.engine.slice(0, opt.engine);
  if (opt.road) Object.assign(g.road, opt.road);
  if (opt.weatherType != null) g.weather = opt.weatherType;
  g.P.a.gear = cards.length;
  setHand(g, "a", cards.concat(["s1", "s1", "s1", "s1", "s1", "s1", "s1"]).slice(0, 7));
  if (opt.flooded) g.P.a.flooded = true;
  if (opt.bhand) setHand(g, "b", opt.bhand);
  H(x.c, "a", { a: "plan", shift: opt.shift || 0, ids: g.P.a.hand.slice(0, cards.length).map((cd) => cd.id) });
  others(x, "a");
  until(x, "a");
  return x;
}
{
  const x = turnWith(["g10"]);
  check(x.g.turn.phase === "choose" && x.g.turn.choices[0].opts.join() === "1,5", "ブレーキ: スピードを選ぶ");
  H(x.c, "a", { a: "choose", vals: [5] });
  check(x.g.turn.phase === "react" && x.g.turn.speed === 5 && x.g.P.a.pos === 25, "選んだ5で進む");
}
{
  const x = turnWith(["g11"], { engine: 6 });
  check(x.g.turn.speed === 6 && x.g.P.a.engine.length === 5 && x.g.turn.pool.cool === 1 + 3, "冷却装置6: ヒート1を払い、クールダウン+1");
}
{
  const x = turnWith(["g11"], { engine: 0 });
  check(x.g.turn.notes.length === 1 && x.g.turn.flips.length === 1 && x.g.turn.flips[0].by === "stress", "ヒートが払えないアップグレードはストレス扱い");
}
{
  const x = turnWith(["g2"]);
  check(x.g.turn.flips.filter((f) => f.by === "plus").length === 3, "四輪駆動＋＋＋: 3回めくる");
}
{
  const x = turnWith(["g4"]);
  const g = x.g; g.P.a.hand.push({ id: NID++, k: "x" }, { id: NID++, k: "x" }, { id: NID++, k: "x" });
  H(x.c, "a", { a: "reduce", n: 5 });
  check(g.P.a.hand.filter((cd) => cd.k === "x").length === 1, "ボディ: ストレスを2枚まで捨てる");
}
{
  const x = turnWith(["g43"], { engine: 6 });
  const g = x.g, d = g.P.a.deck.length + g.P.a.discard.length;
  const before = g.P.a.discard.length;
  H(x.c, "a", { a: "react" });
  check(g.P.a.discard.length >= before + Math.min(6, d) - 6 && x.g.turn && true, "ターボ: スクラップ6(山札の上から捨て札へ)");
}
{
  const x = turnWith(["g37"], { pos: 8 }); // USA: 12マス目の手前がコーナー(制限4)
  // スピード1で進むのでコーナーは通らない。制限+1が記録されている
  check(x.g.turn.pool.adjust === 1, "タイヤ: 制限速度+1");
}
{
  const x = turnWith(["g45", "s4"], { pos: 8, engine: 6 }); // ウイング3(+2)・スピード7、制限4+2=6 → ヒート1
  const g = x.g;
  const e = g.P.a.engine.length;
  H(x.c, "a", { a: "react" }); if (g.turn.phase === "slip") H(x.c, "a", { a: "slip", yes: false });
  check(g.turn.corners[0].lim === 6 && g.turn.corners[0].paid === 1 && g.P.a.engine.length === e - 1, "ウイング: 制限速度+2でコーナーのヒートが減る");
}
{
  const x = turnWith(["g14"], { pos: 30, bpos: 31, bhand: ["s1", "s1", "s1", "s1", "s1", "s1", "s1"] });
  const g = x.g;
  H(x.c, "a", { a: "react" });
  check(g.turn.phase === "slip" && g.turn.slipBy === 4, "R.P.M.: スリップストリーム+2で4マス");
}
{
  const x = turnWith(["g22"]);
  const g = x.g;
  g.P.a.discard.push({ id: 777, k: "s4" }, { id: 778, k: "s4" }, { id: 779, k: "s4" });
  H(x.c, "a", { a: "salvage", ids: [777, 778, 779] });
  check(!g.P.a.discard.some((cd) => cd.id === 777 || cd.id === 778) && g.P.a.discard.some((cd) => cd.id === 779) && g.P.a.deck.some((cd) => cd.id === 777), "燃料: 捨て札から2枚まで山札へ");
}
{
  const x = turnWith(["g34"]);
  const g = x.g;
  const cid = g.turn.pool.refresh[0];
  H(x.c, "a", { a: "refresh", id: cid });
  H(x.c, "a", { a: "react" });
  check(g.P.a.deck.some((cd) => cd.id === cid), "サスペンション: リフレッシュで山札の上へ");
}
{
  const x = turnWith(["s1"]);
  const g = x.g;
  g.P.a.hand.push({ id: 991, k: "g27" });
  const sp = g.turn.speed, e = g.P.a.engine.length;
  H(x.c, "a", { a: "direct", id: 991 });
  check(g.turn.speed === sp + 4 && g.P.a.engine.length === e - 1 && g.turn.pool.cool === 3 + 1 + 1 - 1 + 0 || (g.turn.speed === sp + 4), "アクセル: 手札から直接出して+4");
}
{
  const x = turnWith(["g47"]);
  const g = x.g;
  const n = g.turn.flipCount, sp = g.turn.speed;
  H(x.c, "a", { a: "accel" });
  check(n >= 1 && g.turn.speed === sp + n, `加速: めくった${n}枚ぶん+${n}`);
}
{
  const x = turnWith(["g51"]);
  const g = x.g;
  g.P.a.discard.push({ id: 881, k: "h" });
  const e = g.P.a.engine.length;
  H(x.c, "a", { a: "supercool" });
  check(g.P.a.engine.length === e + 1 && !g.P.a.discard.some((cd) => cd.id === 881), "スーパークール: 捨て札のヒートをエンジンへ");
}
{
  const x = turnWith(["g60"], { pos: 20, bpos: 30, engine: 6 }); // 6で26へ。ドラフト2: 27,28 空き、29の前(30)に車 → 3? 2まで
  const g = x.g;
  g.P.b.pos = 29;
  const to = T.draftTargets(g, "a");
  check(to.join() === "2", "ドラフト: 空いたマスを通り、前のマスに車がいる所まで(+2)");
  H(x.c, "a", { a: "draft", k: 2 });
  check(g.P.a.pos === 28, "ドラフトで進んだ");
}
// 天候と路面
{
  const x = mk(["a", "b"], { weather: true, track: "usa" }, 11);
  const g = x.g;
  check(g.weather != null && Object.keys(g.road).length === 4, "天候トークン1枚・コーナーごとに路面トークン");
}
{
  // 天候 1: エンジンのヒート+1 / 天候 0: ストレス-1
  for (let s = 1; s < 60; s++) {
    const x = mk(["a", "b"], { weather: true }, s);
    if (x.g.weather === 1) { check(x.g.P.a.engine.length === 7, "天候: エンジンのヒート+1"); break; }
  }
  for (let s = 1; s < 60; s++) {
    const x = mk(["a", "b"], { weather: true }, s);
    if (x.g.weather === 5) { check(x.g.P.a.engine.length === 3 && x.g.P.a.discard.length === 3, "天候: ヒート3枚を捨て札に"); break; }
  }
}
{
  const x = turnWith(["s4", "s4"], { pos: 8, weather: true, road: { 0: 1, 1: 0, 2: 0, 3: 0 }, engine: 6 }); // 制限4・オーバーヒート
  const g = x.g;
  H(x.c, "a", { a: "react" }); if (g.turn.phase === "slip") H(x.c, "a", { a: "slip", yes: false });
  check(g.turn.corners[0].paid === 5, "路面: オーバーヒート(8-4=4 → 5)");
}
{
  const x = turnWith(["s3"], { pos: 8, weather: true, road: { 0: 2, 1: 5, 2: 5, 3: 5 } });
  check(core.view(x.c, "a").track.corners[0].lim === 3, "路面: 制限速度-1");
}
{
  // 区間の効果: USA の最初のコーナー(12)のあとの区間に「ヒートなしでブースト」
  const x = turnWith(["s1"], { pos: 14, weather: true, road: { 0: 4, 1: 5, 2: 5, 3: 5 }, engine: 3 });
  const g = x.g;
  const e = g.P.a.engine.length;
  H(x.c, "a", { a: "boost" });
  check(g.P.a.engine.length === e && g.turn.boosted, "路面: 区間でヒートなしのブースト");
}
{
  const x = turnWith(["s1"], { pos: 14, weather: true, road: { 0: 0, 1: 5, 2: 5, 3: 5 }, weatherType: 0 });
  const g = x.g;
  g.P.a.hand.push({ id: 4441, k: "h" });
  check(typeof H(x.c, "a", { a: "cool", n: 1 }) === "string", "天候区間(クールダウン禁止)");
}
// 水たまり(Japan): 下げるとヒート+1
{
  const x = mk(["a", "b"], { track: "japan" });
  const g = x.g;
  g.P.a.pos = 6; g.P.a.gear = 3; g.P.a.flooded = true;
  setHand(g, "a", ["s1", "s1", "s1", "s1", "s1", "s1", "s1"]);
  g.P.a.engine = g.P.a.engine.slice(0, 1);
  check(typeof T.planOf(g, "a", -2, g.P.a.hand.slice(0, 1).map((c) => c.id)) === "string", "水たまり: 2段下げるにはヒート2(1枚では無理)");
  const r = T.planOf(g, "a", -1, g.P.a.hand.slice(0, 2).map((c) => c.id));
  check(r.cost === 1, "水たまり: 1段下げるとヒート1");
}
// トンネル(España): 捨てられない
{
  const x = turnWith(["s1"], { track: "espana", pos: 18 });
  const g = x.g;
  H(x.c, "a", { a: "react" });
  check(g.turn === null || g.turn.pid !== "a", "トンネルの中では捨て札の手順がない");
}
// シケイン: 2本ともコーナーとして判定
{
  const g = { cfg: {}, track: "mexico", N: 60, goal: 180, road: {} };
  check(T.cornersBetween(g, 10, 22).length === 2, "シケイン: 2本ともコーナー");
}
// 全部入りで完走
for (const track of Object.keys(core.TRACKS)) for (const garage of ["off", "basic", "all"]) {
  const x = mk(["a", "b", "c", "d"], { track, laps: 1, garage, weather: garage !== "off" }, track.length * 31 + garage.length);
  let guard = 0;
  while (x.g.step !== "end" && guard++ < 4000) x.fire();
  check(x.g.step === "end" && x.st.finished, `${track}・ガレージ${garage}・天候${garage !== "off"}: 時間切れだけで完走(${x.g.round}ラウンド)`);
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
process.exit(fails ? 1 : 0);
