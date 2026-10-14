const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/shotgun/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "88888", token: "tok" + name.toLowerCase() + "8888888888888888", S: null, raw: "", errs: [], stamps: [] };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") { c.S = m.room; c.raw = String(b); } if (m.t === "error") c.errs.push(m.msg); if (m.t === "stamp") c.stamps.push(m); });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
const waitFor = async (c, fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (c.S && fn(c.S)) return true; await sleep(30); } return false; };
const G = (c) => c.S.game, seat = (c, id) => G(c).seats.find((s) => s.id === id);
(async () => {
  const R = "S" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const cs = ["Ann", "Bob", "Cat"].map(client); await Promise.all(cs.map((c) => c.open));
  for (const c of cs) { c.send({ t: "join", room: R, name: c.name, pid: c.pid, token: c.token }); await sleep(40); }
  await sleep(80);
  const [A, B, C] = cs, by = (id) => cs.find((c) => c.pid === id);
  B.send({ t: "settings", s: { lives: 2 } }); await sleep(60);
  check(A.S.settings.lives === 4, "ホスト以外は設定を変えられない");
  A.send({ t: "settings", s: { lives: 3, turnSecs: 0, weights: { cuffs: 0, medicine: 0, jammer: 0, remote: 0 } } }); await sleep(60);
  check(A.S.settings.lives === 3 && A.S.settings.weights.cuffs === 0, "ライフ・アイテムの設定");
  A.send({ t: "start" }); await sleep(80);
  check(A.S.phase === "play" && G(A).step === "load" && G(A).seats.every((s) => s.hp === 3), "開始→装填(ライフ3)");
  const cnt = G(A).counts;
  check(cnt.live >= 1 && cnt.blank >= 1 && cnt.live + cnt.blank >= 2 && cnt.live + cnt.blank <= 8, `弾は2〜8発で実弾・空砲が最低1発(実${cnt.live}/空${cnt.blank})`);
  check(!("shells" in G(A)) && !/"shells":\[/.test(A.raw) && !/"(live|blank)","(live|blank)"/.test(JSON.stringify(G(A).spent)), "弾の並びは送られない");
  check(G(A).seats.every((s) => s.items.length === 2 && s.items.every((k) => !["cuffs", "medicine", "jammer", "remote"].includes(k))), "アイテム2つずつ・オフにした種類は出ない");
  await waitFor(A, (s) => s.game.step === "turn");
  let T = by(G(A).turnId);
  const other = cs.find((c) => c !== T);
  other.send({ t: "game", a: "shoot", target: T.pid }); await sleep(60);
  check(G(A).step === "turn" && G(A).spent.length === 0, "手番でない人は撃てない");
  // 虫メガネを持っていれば使って、自分だけに見えることを確認
  let gi = seat(T, T.pid).items.indexOf("glass");
  if (gi >= 0) {
    T.send({ t: "game", a: "item", idx: gi }); await sleep(80);
    check(G(T).know[0] && !Object.keys(G(other).know).length, "虫メガネの結果は本人だけ");
  } else console.log("(虫メガネを持っていないので省略)");
  // 自分を撃つ: 空砲なら続けて自分の番、実弾ならライフ−1で次の人
  const hpBefore = seat(T, T.pid).hp;
  T.send({ t: "game", a: "shoot", target: T.pid }); await sleep(80);
  const ev = G(A).event;
  check(ev.type === "shot" && ev.target === T.pid, "自分を撃った結果が全員に届く");
  await waitFor(A, (s) => s.game.step !== "shot", 5000);
  if (ev.shell === "blank") check(G(A).turnId === T.pid || G(A).step === "load", "自分を撃って空砲→もう一度自分の番");
  else check(seat(A, T.pid).hp === hpBefore - 1 && G(A).turnId !== T.pid, "自分を撃って実弾→ライフ−1・次の人へ");
  // 決着まで: 手番の人がアイテムを試しつつ、ほかの人を撃つ
  let guard = 0, used = new Set();
  while (A.S.phase === "play" && guard++ < 2000) {
    const g = G(A);
    if (g.step !== "turn") { await sleep(60); continue; }
    T = by(g.turnId);
    const me = seat(T, T.pid);
    if (me.items.length && Math.random() < 0.5) {
      const k = me.items[0]; const tgt = g.seats.find((s) => s.alive && s.id !== T.pid);
      const vic = g.seats.find((s) => s.alive && s.id !== T.pid && s.items.some((x) => x !== "adrenaline"));
      T.send({ t: "game", a: "item", idx: 0, target: (vic || tgt).id, pick: vic ? vic.items.findIndex((x) => x !== "adrenaline") : 0 });
      used.add(k); await sleep(60);
      if (T.errs.length) T.errs = [];
      continue;
    }
    const tgt = g.seats.find((s) => s.alive && s.id !== T.pid);
    T.send({ t: "game", a: "shoot", target: tgt.id }); await sleep(60);
  }
  check(A.S.phase === "finished" && A.S.ranking[0].rank === 1 && A.S.ranking.length === 3, "最後の1人が1位で結果発表");
  console.log("  使ったアイテム:", [...used].join(","));
  // スタンプ
  B.send({ t: "stamp", i: 1 }); await sleep(80);
  check(C.stamps.some((s) => s.from === B.pid && s.i === 1), "スタンプが届く");
  // 2回目: 手番の人が抜ける
  A.send({ t: "again" }); await sleep(60); A.send({ t: "start" });
  await waitFor(A, (s) => s.phase === "play" && s.game.step === "turn");
  const t2 = by(G(A).turnId), stay = cs.find((c) => c !== t2);
  t2.send({ t: "leave" }); await sleep(150);
  check(stay.S.phase === "play" && G(stay).turnId !== t2.pid, "手番の人が抜けても続く");
  const res = await fetch("http://localhost:3123/healthz").then((r) => r.text()).catch(() => "down");
  check(res === "ok", "サーバは動き続けている");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
