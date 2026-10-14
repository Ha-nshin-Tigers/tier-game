const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
const rnd = (n) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, "x");
function client(path, join) {
  const ws = new WebSocket("ws://localhost:3123" + path); const c = { ws, st: null, msgs: [] };
  ws.on("message", (b) => { const m = JSON.parse(b); c.msgs.push(m); if (m.t === "state") c.st = m; });
  c.ready = new Promise((r) => ws.on("open", () => { ws.send(JSON.stringify(join)); r(); }));
  c.send = (m) => ws.send(JSON.stringify(m));
  return c;
}
(async () => {
  const code = "Q" + rnd(3).toUpperCase().replace(/[^A-Z0-9]/g, "Z");
  const ids = [0, 1, 2].map(() => ({ pid: rnd(16), token: rnd(32) }));
  const L = ids.map((x, i) => client("/lobby/ws", { t: "join", room: code, name: "p" + i, ...x, create: i === 0 }));
  for (const c of L) { await c.ready; await sleep(150); }
  await sleep(300);
  check(L[0].st.room.host === ids[0].pid && L[0].st.room.members.length === 3, "パーティー3人・最初の人がホスト");
  // ホストを渡す
  L[1].send({ t: "host", to: ids[2].pid }); await sleep(200);
  check(L[0].st.room.host === ids[0].pid, "ホスト以外は渡せない");
  L[0].send({ t: "host", to: ids[1].pid }); await sleep(200);
  check(L[0].st.room.host === ids[1].pid, "ホストを p1 に渡した");
  // 投票
  L[0].send({ t: "mode", mode: "vote" }); await sleep(150);
  check(L[0].st.room.mode === "host", "前のホストは決め方を変えられない");
  L[1].send({ t: "mode", mode: "vote" }); await sleep(150);
  check(L[2].st.room.mode === "vote", "投票モードに");
  L[0].send({ t: "vote", game: "mortar" }); L[1].send({ t: "vote", game: "heat" }); await sleep(150);
  check(Object.keys(L[0].st.room.votes).length === 2 && !L[0].st.room.game, "2人投票(まだ決まらない)");
  L[2].send({ t: "vote", game: "mortar" }); await sleep(200);
  check(L[0].st.room.game && L[0].st.room.game.key === "mortar" && !Object.keys(L[0].st.room.votes).length, "全員投票 → 多いモーターメイヘムに決定");
  // モーターメイヘムを2人で遊ぶ: p0 は正解、p1 は動かない
  const room = code + "MT";
  const G = ids.slice(0, 2).map((x, i) => client("/mortar/ws", { t: "join", room, name: "p" + i, ...x }));
  for (const c of G) { await c.ready; await sleep(150); }
  await sleep(200);
  G[0].send({ t: "start" });
  let seq = null;
  for (let i = 0; i < 60 && !seq; i++) { await sleep(100); const g = G[0].st && G[0].st.room.game; if (g && g.step === "show") seq = g.seq; }
  for (let i = 0; i < 100; i++) { await sleep(100); if (G[0].st.room.game.step === "act") break; }
  for (let k = 0; k < seq.length; k++) {
    G[0].send({ t: "game", a: "move", d: seq[k] });
    const b0 = G[0].st.room.game.beat;
    for (let i = 0; i < 60; i++) { await sleep(100); const g = G[0].st.room.game; if (!g || g.beat > b0 || g.step !== "act") break; }
  }
  for (let i = 0; i < 80; i++) { await sleep(100); if (G[0].st.room.phase === "finished") break; }
  await sleep(300);
  const sc = L[0].st.room.scores;
  check(G[0].st.room.phase === "finished" && sc[ids[0].pid].pts === 3 && sc[ids[1].pid].pts === 2 && sc[ids[0].pid].wins === 1, "ゲームの結果が通算成績に: 1位+3・2位+2 " + JSON.stringify(Object.values(sc)));
  check(L[0].st.room.history.length === 1 && L[0].st.room.history[0].game === "モーターメイヘム", "これまでのゲームに記録");
  // パーティー外の部屋の結果は記録されない(コードが違う)
  for (const c of [...L, ...G]) c.ws.close();
  console.log(fails ? `NG ${fails}件` : "全項目OK"); process.exit(0);
})();
