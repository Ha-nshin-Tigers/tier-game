const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (c, fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (c.S && fn(c.S)) return true; } catch {} await sleep(50); } return false; };
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name, path) { const ws = new WebSocket("ws://localhost:3123" + path); const c = { ws, pid: "pid" + name + "88888", token: "tok" + name + "8888888888888888", S: null };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; }); c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c; }
(async () => {
  const R = "C" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const [A, B] = ["qa", "qb"].map((n) => client(n, "/eshiri/ws")); await Promise.all([A.open, B.open]);
  A.send({ t: "join", room: R, name: "A", pid: A.pid, token: A.token }); await sleep(50);
  B.send({ t: "join", room: R, name: "B", pid: B.pid, token: B.token }); await sleep(80);
  check(A.S.settings.scoring === "coop", "単独の新しい部屋は「協力のみ」が初期設定");
  A.send({ t: "settings", s: { drawSecs: 0 } }); A.send({ t: "start" }); await sleep(100);
  // 2人で描いて答え合わせまで
  let prevWord = "";
  for (let k = 0; k < 2; k++) {
    const cur = [A, B].find((c) => c.S.game.task); const t = cur.S.game.task;
    cur.send({ t: "game", a: "stroke", s: { c: 0, w: 8, p: [10, 10, 500, 500] } });
    const L = require("../games/mini/eshiri.js").lastChar;
    const guess = t.first ? "" : prevWord, need = t.first ? L(t.start) : L(guess), word = need + "かめ"; prevWord = word;
    cur.send({ t: "game", a: "submit", guess, word }); await sleep(150);
  }
  check(A.S.game.step === "reveal" && A.S.game.scores === null && A.S.game.coop, "答え合わせに個人の点数は出ない(つながった数だけ)");
  A.send({ t: "again" }); await waitFor(A, (s) => s.phase === "lobby");
  const host = A.S.gameHostId === A.pid ? A : B;
  host.send({ t: "settings", s: { scoring: "both" } });
  check(await waitFor(A, (s) => s.settings.scoring === "both"), "ホストが「個人戦+協力」に戻せる");
  // 大会は個人戦のまま
  const P = client("qp", "/party/ws"), Q = client("qq", "/party/ws"); await Promise.all([P.open, Q.open]);
  const R2 = "D" + R.slice(1);
  P.send({ t: "join", room: R2, name: "P", pid: P.pid, token: P.token }); await sleep(50);
  Q.send({ t: "join", room: R2, name: "Q", pid: Q.pid, token: Q.token }); await sleep(50);
  P.send({ t: "setPlaylist", list: ["eshiri"] }); P.send({ t: "start" });
  check(await waitFor(P, (s) => s.phase === "play" && s.game.cfg.scoring === "both"), "大会の絵しりとりは個人戦のまま");
  console.log(fails ? `NG ${fails}件` : "全項目OK"); process.exit(0);
})();
