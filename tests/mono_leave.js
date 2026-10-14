const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) { const ws = new WebSocket("ws://localhost:3123/monopoly/ws"); const c = { ws, pid: "pid" + name + "77777", token: "tok" + name + "7777777777777777", S: null, errs: [] };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; if (m.t === "error") c.errs.push(m.msg); }); c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c; }
(async () => {
  const R = "L" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const [A, B, X] = ["aa", "bb", "xx"].map(client); await Promise.all([A.open, B.open, X.open]);
  A.send({ t: "join", room: R, name: "A", pid: A.pid, token: A.token }); await sleep(50);
  B.send({ t: "join", room: R, name: "B", pid: B.pid, token: B.token }); await sleep(50);
  B.send({ t: "settings", s: { map: "world" } }); await sleep(50);
  check(A.S.settings.map === "japan" && B.errs.length === 1, "設定はホストだけ");
  A.send({ t: "start" }); await sleep(100);
  check(A.S.phase === "play" && A.S.game.order.length === 2, "2人で開始");
  X.send({ t: "join", room: R, name: "X", pid: X.pid, token: X.token }); await sleep(80);
  X.send({ t: "game", a: "roll" }); await sleep(80);
  check(!X.S.game.P[X.pid] && A.S.game.rollSeq === 0, "観戦者は操作できない");
  const cur = A.S.game.cur, other = cur === A.pid ? B : A, curC = cur === A.pid ? A : B;
  other.send({ t: "game", a: "roll" }); await sleep(80);
  check(A.S.game.rollSeq === 0, "番でない人は振れない");
  curC.send({ t: "game", a: "roll" }); await sleep(80);
  check(A.S.game.rollSeq === 1, "番の人は振れる");
  B.send({ t: "leave" }); await sleep(150);
  check(A.S.phase === "finished" && A.S.ranking[0].id === A.pid, "相手が抜けたら残った人の勝ち");
  A.send({ t: "again" }); await sleep(80);
  check(A.S.phase === "lobby", "待機画面に戻れる");
  console.log(fails ? `NG ${fails}件` : "全項目OK"); process.exit(0);
})();
