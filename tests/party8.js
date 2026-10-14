const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/party/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "55555", token: "tok" + name.toLowerCase() + "5555555555555555", S: null };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
const waitFor = async (c, fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (c.S && fn(c.S)) return true; await sleep(50); } return false; };
(async () => {
  const R = "E" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const cs = ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh", "Ii"].map(client); await Promise.all(cs.map((c) => c.open));
  for (const c of cs) { c.send({ t: "join", room: R, name: c.name, pid: c.pid, token: c.token }); await sleep(30); }
  await sleep(100);
  const A = cs[0], spec = cs[8];
  check(A.S.players.length === 9, "9人が入室できる(8人+観戦1人)");
  A.send({ t: "start" }); await sleep(100);
  check(A.S.roster.length === 8 && !A.S.roster.includes(spec.pid), "先に入った8人が参加・9人目は観戦");
  await waitFor(A, (s) => s.phase === "play");
  check(A.S.game.values.length === 8, "橋は8本(8人)");
  cs.slice(0, 8).forEach((c, i) => c.send({ t: "pick", i }));
  spec.send({ t: "pick", i: 0 }); await sleep(150);
  check(A.S.game.step === "show" && Object.values(A.S.game.last.gained).every((v) => v > 0) && !(spec.pid in A.S.game.last.picks), "8人全員が別々の橋→全員得点・観戦者の選択は無視");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
