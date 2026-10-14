const L = require("../games/lobby.js"), { rooms, handle } = L._t;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
const sock = (pid) => ({ pid, readyState: 1, out: [], send(s) { this.out.push(JSON.parse(s)); }, close() {} });
const tok = (p) => p + "tokentokentoken1";
const join = (ws, code, name) => handle(ws, { t: "join", room: code, name, pid: ws.pid, token: tok(ws.pid) });
const A = sock("aaaaaaaa"), B = sock("bbbbbbbb"), C = sock("cccccccc");
join(A, "QWER", "あき"); join(B, "QWER", "べに"); join(C, "QWER", "ちか");
const room = rooms.get("QWER");
// 協力ゲーム: 成功=全員1位、失敗=0点、記録に一言
L.report("bombanana", "QWERBB", [{ id: A.pid, rank: null }, { id: B.pid, rank: null }, { id: C.pid, rank: null }], "爆発");
check(room.scores[A.pid].pts === 0 && room.history.at(-1).note === "爆発", "協力ゲームの失敗は0点・記録に「爆発」");
L.report("bombanana", "QWERBB", [{ id: A.pid, rank: 1 }, { id: B.pid, rank: 1 }, { id: C.pid, rank: 1 }], "解除成功");
check(room.scores[A.pid].pts === 3 && room.scores[C.pid].wins === 1, "成功は全員1位(+3点)");
// 投票: 投票していない人が抜けたら決まる
handle(A, { t: "mode", mode: "vote" });
handle(A, { t: "vote", game: "tier" }); handle(B, { t: "vote", game: "tier" });
check(!room.game, "まだ1人投票していない");
handle(C, { t: "leave" });
check(room.game && room.game.key === "tier", "投票していない人が抜けると、残りの投票で決まる");
// 外す
join(C, "QWER", "ちか");
handle(B, { t: "kick", id: C.pid });
check(room.members.has(C.pid), "ホスト以外は外せない");
handle(A, { t: "kick", id: C.pid });
check(!room.members.has(C.pid) && C.out.some((m) => m.t === "kicked"), "ホストが外すと、その人に知らせて外れる");
// 名前を変える・やりたい
handle(B, { t: "rename", name: "べにこ" });
check(room.members.get(B.pid).name === "べにこ" && room.scores[B.pid].name === "べにこ", "名前を変えると通算成績の名前も変わる");
handle(A, { t: "mode", mode: "host" });
handle(B, { t: "want", game: "heat" });
check(room.wants[B.pid] === "heat", "「やりたい👍」を伝えられる");
handle(B, { t: "want", game: "heat" });
check(!room.wants[B.pid], "もう一度押すと取り消し");
// 保存と復元
const snap = JSON.parse(JSON.stringify(L._t.snapshot()));
rooms.clear();
const store = require("../games/store.js");
store.save("parties", snap).then(async () => {
  await L.restore();
  const r2 = rooms.get("QWER");
  check(r2 && r2.scores[A.pid].pts === 3 && r2.members.size === 2 && r2.history.length === 2, "保存して復元すると、メンバー・通算成績・記録が戻る");
  const A2 = sock(A.pid); join(A2, "QWER", "あき");
  check(A2.out.some((m) => m.t === "joined") && r2.members.get(A.pid).sockets.size === 1, "復元したパーティーに同じ人がそのまま戻れる");
  const X = sock("xxxxxxxx"); handle(X, { t: "join", room: "QWER", name: "なり", pid: A.pid, token: "wrongtokenwrongtoken" });
  check(X.out.some((m) => m.t === "error"), "別の人が同じIDでなりすますことはできない");
  console.log(fails ? `NG ${fails}件` : "全項目OK"); process.exit(0);
});
