const core = require("../games/mini/insider.js");
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids = ["a", "b", "c", "d", "e"], prev, cfg = {}) {
  const st = { timer: null, ms: 0 };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; } };
  core.start(c, cfg, prev);
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
// 役職と秘密
{
  const { c, g } = mk();
  const vs = g.players.map((id) => core.view(c, id));
  check(vs.filter((v) => v.role === "master").length === 1 && vs.filter((v) => v.role === "insider").length === 1 && g.master !== g.insider, "マスター1人・インサイダー1人(別の人)");
  check(vs.every((v) => (v.role === "common") === (v.word === null)), "お題はマスターとインサイダーだけが見える");
  check(vs.every((v) => v.insider === null), "インサイダーがだれかは結果まで送らない");
  const w = g.word; core.handle(c, g.master, { a: "redraw" }); check(g.word !== w && g.redraws === 1, "マスターはお題を変えられる");
  check(core.handle(c, g.insider, { a: "begin" }) === undefined && g.step === "ready", "マスター以外は始められない");
  core.handle(c, g.master, { a: "begin" }); check(g.step === "question", "質問タイム開始");
  const asker = g.players.find((id) => id !== g.master);
  core.handle(c, asker, { a: "ask", text: "食べ物ですか？" });
  check(g.qs.length === 1 && core.handle(c, g.master, { a: "ask", text: "x" }) === undefined && g.qs.length === 1, "質問できる(マスターは質問しない)");
  core.handle(c, asker, { a: "answer", id: 1, ans: "yes" }); check(g.qs[0].ans === null, "答えられるのはマスターだけ");
  core.handle(c, g.master, { a: "answer", id: 1, ans: "yes" }); check(g.qs[0].ans === "yes", "マスターが「はい」");
}
// 時間切れ
{ const { c, g, fire } = mk(); fire(); check(g.step === "question", "準備は1分で自動スタート"); fire(); check(g.step === "result" && g.result.how === "timeout" && !g.result.commonsWin && !g.result.insiderWin, "時間切れは全員の負け"); }
// 投票1で答えた人(インサイダー)を見抜く
{
  const { c, g, st, fire } = mk(); core.handle(c, g.master, { a: "begin" });
  g.startedAt = Date.now() - 95000;
  core.handle(c, g.master, { a: "correct", who: g.insider });
  check(g.step === "discuss" && Math.abs(st.ms - 95000) < 1000, "正解 → かかった時間(95秒)だけ話し合い");
  core.handle(c, g.master, { a: "toVote" }); check(g.step === "vote1", "マスターが投票へ進められる");
  core.handle(c, g.insider, { a: "vote1", yes: false }); check(!(g.insider in g.votes1), "答えた人は投票1をしない");
  for (const id of g.players) if (id !== g.insider) core.handle(c, id, { a: "vote1", yes: true });
  check(g.step === "result" && g.result.how === "caught1" && g.result.commonsWin, "過半数で見抜いた → 庶民の勝ち(全員投票で締め切り)");
  check(g.players.every((id) => g.wins[id] === (id === g.insider ? 0 : 1)), "勝ち数: インサイダー以外+1");
  // 次のラウンド: マスター交代・勝ち数を引き継ぐ
  const m2 = mk(g.players, g);
  check(m2.g.master === g.players[(g.players.indexOf(g.master) + 1) % g.players.length] && m2.g.wins[g.master] === 1 && m2.g.round === 2 && m2.g.word !== g.word, "次のラウンド: マスターは順番に交代、勝ち数を引き継ぎ、お題は変わる");
}
// 投票1で庶民を疑う → インサイダーの勝ち
{
  const { c, g } = mk(); core.handle(c, g.master, { a: "begin" });
  const common = g.players.find((id) => id !== g.master && id !== g.insider);
  core.handle(c, g.master, { a: "correct", who: common }); core.handle(c, g.master, { a: "toVote" });
  for (const id of g.players) if (id !== common) core.handle(c, id, { a: "vote1", yes: true });
  check(g.result.how === "wrong1" && g.result.insiderWin && g.wins[g.insider] === 1, "庶民を疑って過半数 → インサイダーの勝ち");
}
// 投票2
for (const [label, target, how] of [["インサイダーに集まる", "insider", "caught2"], ["違う人に集まる", "other", "escaped"], ["同票", "tie", "escaped"]]) {
  const { c, g } = mk(); core.handle(c, g.master, { a: "begin" });
  const commons = g.players.filter((id) => id !== g.master && id !== g.insider);
  core.handle(c, g.master, { a: "correct", who: commons[0] }); core.handle(c, g.master, { a: "toVote" });
  for (const id of g.players) if (id !== commons[0]) core.handle(c, id, { a: "vote1", yes: false });
  check(g.step === "vote2", `投票1が過半数でない → 投票2(${label})`);
  g.players.forEach((id, k) => {
    let t = target === "insider" ? g.insider : target === "other" ? commons[1] : (k % 2 ? g.insider : commons[1]);
    if (t === id) t = target === "insider" ? commons[1] : commons[2] || g.insider; // マスターには投票できない
    core.handle(c, id, { a: "vote2", who: t });
  });
  check(g.step === "result" && g.result.how === how, `投票2: ${label} → ${how} ${JSON.stringify(g.vote2.count)}`);
}
// 本当の同票(2票ずつ)
{
  const { c, g } = mk(["a", "b", "c", "d", "e", "f"]); core.handle(c, g.master, { a: "begin" });
  const cm = g.players.filter((id) => id !== g.master && id !== g.insider);
  core.handle(c, g.master, { a: "correct", who: cm[0] }); core.handle(c, g.master, { a: "toVote" });
  for (const id of g.players) if (id !== cm[0]) core.handle(c, id, { a: "vote1", yes: false });
  // インサイダー2票・cm[1]2票・cm[2]1票・cm[3]1票(自分には投票しない)
  const plan = [[g.master, g.insider], [cm[0], g.insider], [cm[2], cm[1]], [cm[3], cm[1]], [g.insider, cm[2]], [cm[1], cm[3]]];
  for (const [v, t] of plan) core.handle(c, v, { a: "vote2", who: t });
  const top = g.vote2.top;
  check(g.step === "result" && (top.length > 1 ? g.result.how === "escaped" : true), `投票2: 同票(${JSON.stringify(g.vote2.count)}) → インサイダーの勝ち`);
  check(top.length > 1, "同票の場面が作れている");
}
// 抜けたとき
{ const { c, g } = mk(); core.handle(c, g.master, { a: "begin" }); core.onLeave(c, g.insider); check(g.step === "result" && g.result.how === "aborted", "インサイダーが抜けたらラウンドは流れる"); }
console.log(fails ? `NG ${fails}件` : "全項目OK");
