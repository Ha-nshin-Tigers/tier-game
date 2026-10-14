const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/liar/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "11111", token: "tok" + name.toLowerCase() + "1111111111111111", S: null };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
async function setup(n) {
  const R = "V" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const cs = ["Ann", "Bob", "Cat", "Don"].slice(0, n).map(client);
  await Promise.all(cs.map((c) => c.open));
  for (const c of cs) { c.send({ t: "join", room: R, name: c.name, pid: c.pid, token: c.token }); await sleep(40); }
  await sleep(80); cs[0].send({ t: "start" }); await sleep(120);
  return cs;
}
(async () => {
  // 1) 手番の人が退出 → 次の人の番になる
  let cs = await setup(3), by = (id) => cs.find((c) => c.pid === id), obs = () => cs.find((c) => c.ws.readyState === 1 && c.S);
  let t = by(cs[0].S.turnId), o = cs.find((c) => c !== t);
  t.send({ t: "leave" }); await sleep(120);
  check(o.S.phase === "play" && o.S.turnId !== t.pid && !o.S.players.some((p) => p.id === t.pid), "手番の人が退出→次の人の番");
  // 2人になったあと1人退出 → 終了(勝者あり)
  const rest = cs.filter((c) => c !== t);
  rest[0].send({ t: "leave" }); await sleep(120);
  check(["finished", "lobby"].includes(rest[1].S.phase), "残り1人になったら終了: " + rest[1].S.phase);
  // 2) 直前に出した人が退出 → ラウンドやり直し
  cs = await setup(3); by = (id) => cs.find((c) => c.pid === id);
  t = by(cs[0].S.turnId); const r0 = cs[0].S.round;
  t.send({ t: "play", ids: [t.S.myHand[0].id] }); await sleep(100);
  o = cs.find((c) => c !== t);
  t.send({ t: "leave" }); await sleep(120);
  check(o.S.phase === "play" && o.S.round === r0 + 1 && o.S.lastPlay === null, "直前に出した人が退出→ラウンドやり直し");
  // 3) 引き金待ちの人を追い出す → 次のラウンド
  cs = await setup(4); by = (id) => cs.find((c) => c.pid === id);
  t = by(cs[0].S.turnId); t.send({ t: "play", ids: [t.S.myHand[0].id] }); await sleep(100);
  const r = by(cs[0].S.turnId); r.send({ t: "liar" }); await sleep(100);
  const target = by(cs[0].S.reveal.target), host = cs[0];
  if (target === host) { console.log("(ホストが対象のため追い出しテストは省略)"); }
  else { host.send({ t: "kick", id: target.pid }); await sleep(150);
    check(host.S.phase === "play" && !host.S.players.some((p) => p.id === target.pid), "引き金待ちの人を追い出し→次のラウンド"); }
  // 4) 切断して時間切れ → 自動で出す(30秒設定)
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
