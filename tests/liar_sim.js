const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOM = "L" + Math.random().toString(36).slice(2, 6).toUpperCase();
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/liar/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "00000", token: "tok" + name.toLowerCase() + "0000000000000000", S: null, msgs: [] };
  ws.on("message", (b) => { const m = JSON.parse(b); c.msgs.push(m); if (m.t === "state") c.S = m.room; });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
(async () => {
  const cs = ["Aki", "Ben", "Cho", "Dai", "Eri", "Fuu", "Gin"].map(client);
  await Promise.all(cs.map((c) => c.open));
  for (const c of cs) { c.send({ t: "join", room: ROOM, name: c.name, pid: c.pid, token: c.token }); await sleep(40); }
  await sleep(100);
  const [A] = cs; const by = (id) => cs.find((c) => c.pid === id);
  check(A.S.players.length === 7 && A.S.phase === "lobby", "7人入室(6席+観戦1)");
  A.send({ t: "start" }); await sleep(150);
  check(A.S.phase === "play" && A.S.seats.length === 6, "開始: 6席");
  const G = cs[6];
  check(G.S.myHand.length === 0 && !G.S.players.find((p) => p.id === G.pid).alive, "7人目は観戦(手札なし)");
  check(cs.slice(0, 6).every((c) => c.S.myHand.length === 5), "6人に5枚ずつ");
  const all = cs.slice(0, 6).flatMap((c) => c.S.myHand.map((x) => x.id));
  check(new Set(all).size === 30, "30枚の山札から重複なく配布");
  const raw = JSON.stringify(cs[1].msgs.filter((m) => m.t === "state").pop());
  check(!cs[0].S.myHand.some((x) => raw.includes(`"id":"${x.id}"`)), "他人の手札は送られない");
  // 手番の人が2枚出す
  let T = by(A.S.turnId);
  check(!T.S.canCall && T.S.canPlay, "最初の手番は出すだけ(指摘不可)");
  const notTurn = cs.find((c) => c.pid !== A.S.turnId && c.S.players.find((p) => p.id === c.pid).alive);
  notTurn.send({ t: "play", ids: [notTurn.S.myHand[0].id] }); await sleep(80);
  check(A.S.lastPlay === null, "手番でない人は出せない");
  const two = T.S.myHand.slice(0, 2);
  T.send({ t: "play", ids: two.map((x) => x.id) }); await sleep(100);
  check(A.S.lastPlay && A.S.lastPlay.count === 2 && A.S.pile === 2 && !JSON.stringify(A.S).includes(`"id":"${two[0].id}"`) || A.pid === T.pid, "2枚出した(中身は非公開)");
  const R = by(A.S.turnId);
  check(R.S.canCall && R.S.canPlay && R.pid !== T.pid, "次の人は出すか指摘を選べる");
  const honest = two.every((x) => x.r === A.S.tableRank || x.r === "J");
  R.send({ t: "liar" }); await sleep(100);
  check(A.S.phase === "reveal" && A.S.reveal.cards.length === 2 && A.S.reveal.honest === honest, `指摘→公開(本当だった=${honest})`);
  const target = honest ? R.pid : T.pid;
  check(A.S.reveal.target === target, "罰を受ける人が正しい");
  by(target === T.pid ? R.pid : T.pid).send({ t: "pull" }); await sleep(80);
  check(A.S.phase === "reveal", "本人以外は引き金を引けない");
  by(target).send({ t: "pull" }); await sleep(100);
  check(A.S.phase === "shot" && A.S.shot.target === target && A.S.shot.pulls === 1, "引き金→結果(1発目)");
  await sleep(4800);
  check(A.S.phase === "play" && A.S.round === 2, "数秒後に次のラウンドへ");
  // スタンプ
  A.send({ t: "stamp", i: 3 }); A.send({ t: "stamp", i: 4 }); await sleep(100);
  const st = cs[2].msgs.filter((m) => m.t === "stamp");
  check(st.length === 1 && st[0].i === 3 && st[0].from === A.pid, "スタンプが全員に届く(連打は間引く)");
  // 脱落するまで続けて最後に勝者が出るか(毎回すぐ指摘)
  let guard = 0;
  while (A.S.phase !== "finished" && guard++ < 3000) {
    if (A.S.phase === "play") {
      const t = by(A.S.turnId);
      if (t.S.canCall) t.send({ t: "liar" }); else t.send({ t: "play", ids: [t.S.myHand[0].id] });
      await sleep(60);
    } else if (A.S.phase === "reveal") { by(A.S.reveal.target).send({ t: "pull" }); await sleep(60); }
    else await sleep(300);
  }
  if (A.S.phase !== "finished") console.log("DEBUG guard", guard, JSON.stringify({ phase: A.S.phase, turn: A.S.turnId, lp: A.S.lastPlay, players: A.S.players.map((p) => [p.name, p.alive, p.hand, p.pulls, p.connected]), reveal: A.S.reveal && A.S.reveal.target, log: A.S.log.slice(-4) }));
  const aliveN = A.S.players.filter((p) => p.alive).length;
  check(A.S.phase === "finished" && aliveN === 1 && A.S.winner, `最後の1人が勝者 (${by(A.S.winner)?.name})`);
  check(A.S.players.every((p) => p.pulls <= 6), "6発以内に必ず実弾");
  A.send({ t: "again" }); await sleep(100);
  check(A.S.phase === "lobby", "もう一度→待機");
  // 途中退出: 2人だけで開始→1人退出で終了
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
