const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/liar/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "22222", token: "tok" + name.toLowerCase() + "2222222222222222", S: null };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
(async () => {
  const R = "T" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const cs = ["Ivy", "Jay"].map(client); await Promise.all(cs.map((c) => c.open));
  for (const c of cs) { c.send({ t: "join", room: R, name: c.name, pid: c.pid, token: c.token }); await sleep(40); }
  cs[0].send({ t: "setTurnSecs", sec: 30 }); await sleep(50); cs[0].send({ t: "start" }); await sleep(100);
  const first = cs[0].S.turnId;
  await sleep(31000);
  const ok1 = cs[0].S.pile === 1 && cs[0].S.lastPlay?.by === first && cs[0].S.turnId !== first;
  console.log((ok1 ? "OK  " : "NG  ") + "時間切れで自動的に1枚出して次の人へ");
  await sleep(30500);
  const ok2 = cs[0].S.phase === "reveal" || cs[0].S.pile === 2;
  console.log((ok2 ? "OK  " : "NG  ") + "次の人も時間切れで自動処理: " + cs[0].S.phase + " pile=" + cs[0].S.pile);
  process.exit(0);
})();
