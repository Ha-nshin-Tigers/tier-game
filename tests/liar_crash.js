const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/liar/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "33333", token: "tok" + name.toLowerCase() + "3333333333333333", S: null };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
(async () => {
  for (const how of ["leave", "kick"]) {
    const R = "C" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const cs = ["Kai", "Leo", "Mia"].map(client); await Promise.all(cs.map((c) => c.open));
    for (const c of cs) { c.send({ t: "join", room: R, name: c.name, pid: c.pid, token: c.token }); await sleep(40); }
    await sleep(80); cs[0].send({ t: "start" }); await sleep(120);
    const by = (id) => cs.find((c) => c.pid === id);
    // 手番でもホストでもない人を抜けさせる
    const out = cs.find((c) => c !== cs[0] && c.pid !== cs[0].S.turnId);
    if (how === "leave") out.send({ t: "leave" }); else cs[0].send({ t: "kick", id: out.pid });
    await sleep(150);
    const r0 = cs[0].S.round;
    const t = by(cs[0].S.turnId); t.send({ t: "play", ids: [t.S.myHand[0].id] }); await sleep(100);
    by(cs[0].S.turnId).send({ t: "liar" }); await sleep(100);
    by(cs[0].S.reveal.target).send({ t: "pull" }); await sleep(5200);
    const ph = cs[0].S.phase;
    check((ph === "play" && cs[0].S.round === r0 + 1) || ph === "finished", `${how === "leave" ? "途中退出" : "追い出し"}のあと次のラウンドへ進める(${ph})`);
    for (const c of cs) c.ws.close();
  }
  // サーバが生きているか
  const res = await fetch("http://localhost:3123/healthz").then((r) => r.text()).catch(() => "down");
  check(res === "ok", "サーバは動き続けている");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
