const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/party/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "66666", token: "tok" + name.toLowerCase() + "6666666666666666", S: null };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
const waitFor = async (c, fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (c.S && fn(c.S)) return true; await sleep(50); } return false; };
(async () => {
  const R = "M" + Math.random().toString(36).slice(2, 6).toUpperCase();
  // 同じ部屋コードでも遊び方が違えば別の部屋
  const [A, B] = ["Ann", "Bob"].map(client), X = client("Xen");
  await Promise.all([A.open, B.open, X.open]);
  A.send({ t: "join", room: R, mode: "bridge", name: "Ann", pid: A.pid, token: A.token }); await sleep(40);
  B.send({ t: "join", room: R, mode: "bridge", name: "Bob", pid: B.pid, token: B.token }); await sleep(40);
  X.send({ t: "join", room: R, mode: "bomb", name: "Xen", pid: X.pid, token: X.token }); await sleep(100);
  check(A.S.mode === "bridge" && A.S.players.length === 2 && X.S.mode === "bomb" && X.S.players.length === 1, "同じ部屋コードでも橋と爆弾は別の部屋");
  // 単独: 橋
  A.send({ t: "start" }); await sleep(100);
  check(A.S.seq.join() === "bridge", "単独モードは橋だけ");
  for (let r = 1; r <= 3; r++) { await waitFor(A, (s) => s.phase === "play" && s.game.round === r && s.game.step === "pick"); A.send({ t: "pick", i: 0 }); B.send({ t: "pick", i: 1 }); await sleep(100); }
  check(await waitFor(A, (s) => s.phase === "result"), "1試合で結果");
  await sleep(16000);
  check(A.S.phase === "result", "単独モードは結果画面で止まる(自動で進まない)");
  const t1 = A.S.players.map((p) => p.total).sort().join();
  B.send({ t: "again" }); await sleep(100);
  check(A.S.phase === "intro" && A.S.game.key === "bridge", "「もう一度遊ぶ」で同じゲームの次の試合(誰でも押せる)");
  check(A.S.players.map((p) => p.total).sort().join() === t1, "通算点は残る");
  for (let r = 1; r <= 3; r++) { await waitFor(A, (s) => s.phase === "play" && s.game.round === r && s.game.step === "pick"); A.send({ t: "pick", i: 0 }); B.send({ t: "pick", i: 1 }); await sleep(100); }
  await waitFor(A, (s) => s.phase === "result");
  check(A.S.players.reduce((n, p) => n + p.total, 0) > Number(t1.split(",").reduce((a, b) => +a + +b, 0)), "2試合目の順位点が通算に加わる");
  A.send({ t: "setPlaylist", list: ["bomb"] }); await sleep(60);
  check(A.S.playlist.join() === "bridge,bomb,memory", "単独モードでは大会の並びは変えられない");
  // 大会: 同じゲームを2回並べる
  const R2 = "N" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const [C, D] = ["Cat", "Dan"].map(client); await Promise.all([C.open, D.open]);
  C.send({ t: "join", room: R2, name: "Cat", pid: C.pid, token: C.token }); await sleep(40);
  D.send({ t: "join", room: R2, name: "Dan", pid: D.pid, token: D.token }); await sleep(80);
  check(C.S.mode === "party", "mode を送らない古い画面は大会として扱う");
  C.send({ t: "setPlaylist", list: ["bridge", "bridge", "xxx", "memory"] }); await sleep(60);
  check(C.S.playlist.join() === "bridge,bridge,memory", "同じゲームを2回並べられる・不正なゲーム名は除外");
  C.send({ t: "setPlaylist", list: Array(20).fill("bomb") }); await sleep(60);
  check(C.S.playlist.length === 9, "最大9試合");
  C.send({ t: "setPlaylist", list: ["bridge", "bridge"] }); await sleep(60);
  C.send({ t: "start" }); await sleep(100);
  check(C.S.seq.join() === "bridge,bridge", "並べた順に試合が組まれる");
  for (let k = 0; k < 2; k++) {
    for (let r = 1; r <= 3; r++) { await waitFor(C, (s) => s.phase === "play" && s.game.round === r && s.game.step === "pick"); C.send({ t: "pick", i: 0 }); D.send({ t: "pick", i: 1 }); await sleep(100); }
    await waitFor(C, (s) => s.phase === "result"); C.send({ t: "next" }); await sleep(100);
  }
  check(C.S.phase === "final", "2試合のあと総合結果");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
