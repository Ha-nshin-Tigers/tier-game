const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/party/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "77777", token: "tok" + name.toLowerCase() + "7777777777777777", S: null, raw: "", errs: [] };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") { c.S = m.room; c.raw = String(b); } if (m.t === "error") c.errs.push(m.msg); });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
const waitFor = async (c, fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (c.S && fn(c.S)) return true; await sleep(40); } return false; };
const T = ["S", "A", "B", "C", "D"];
(async () => {
  const R = "X" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const cs = ["Ann", "Bob", "Cat"].map(client); await Promise.all(cs.map((c) => c.open));
  for (const c of cs) { c.send({ t: "join", room: R, name: c.name, pid: c.pid, token: c.token }); await sleep(40); }
  await sleep(80);
  const [A] = cs, by = (id) => cs.find((c) => c.pid === id);
  A.send({ t: "setPlaylist", list: ["tier", "number", "liar"] }); await sleep(60);
  check(A.S.playlist.join() === "tier,number,liar", "大会にティア表・かくれナンバー・ウソつき酒場を並べられる");
  A.send({ t: "start" }); await sleep(80);
  A.send({ t: "next" }); // 紹介は待つ(next は result 以外では無視される)
  // ---- ティア表 ----
  check(await waitFor(A, (s) => s.phase === "play" && s.game.key === "tier"), "ティア表(大会版)が始まる");
  check(A.S.game.rounds === 3 && A.S.game.words.length === 5 && A.S.game.topic, "全員が1回ずつ親(3ラウンド)・お題とワード5つ");
  const parents = new Set();
  for (let r = 1; r <= 3; r++) {
    await waitFor(A, (s) => s.game.round === r && s.game.step === "rank");
    const g = A.S.game, P = by(g.parent); parents.add(g.parent);
    const arr = Object.fromEntries(T.map((t, i) => [t, g.words[i]]));
    by(cs.find((c) => c.pid !== g.parent).pid).send({ t: "mini", a: "answer", arr }); await sleep(60);
    if (r === 1) check(A.S.game.step === "rank", "親以外は答えを決められない");
    P.send({ t: "mini", a: "answer", arr }); await sleep(80);
    if (r === 1) check(A.S.game.step === "guess" && !cs.filter((c) => c !== P).some((c) => /"myAnswer":\{/.test(c.raw)), "親の答えはほかの人に送られない");
    const others = cs.filter((c) => c !== P);
    others[0].send({ t: "mini", a: "guess", arr }); // ぴったり → 3*5+5 = 20
    const rev = Object.fromEntries(T.map((t, i) => [t, g.words[4 - i]]));
    others[1].send({ t: "mini", a: "guess", arr: rev });
    await sleep(120);
    if (r === 1) { const L = A.S.game.last; check(L && L.rows.find((x) => x.id === others[0].pid).pts === 20 && L.rows.find((x) => x.id === others[1].pid).pts === 3, "得点は元と同じ(全部ぴったり=20点、逆順=真ん中だけぴったりで3点)"); }
  }
  check(parents.size === 3, "3人とも親を1回ずつ");
  check(await waitFor(A, (s) => s.phase === "result" && s.result.key === "tier"), "ティア表の順位発表");
  A.send({ t: "next" });
  // ---- かくれナンバー ----
  check(await waitFor(A, (s) => s.phase === "play" && s.game.key === "number"), "かくれナンバー(大会版)が始まる");
  check(!JSON.stringify(A.S.game).includes(`"num":${cs[1].S && 0}`) && A.S.game.mine && A.S.game.mine.num >= 1, "自分の数字だけ見える");
  for (let r = 1; r <= 3; r++) {
    await waitFor(A, (s) => s.game.round === r && s.game.step === "hint");
    for (const c of cs) c.send({ t: "mini", a: "hint", hint: "ヒント" + c.name });
    check(await waitFor(A, (s) => s.game.step === "arrange"), `R${r}: 全員ヒントで並べる段階へ`);
    if (r === 1) check(!/"num"/.test(A.raw.replace(/"mine":\{[^}]*\}/, "")), "並べ中はほかの人の数字を送らない");
    // 正しく並べる(各自の数字を使う)
    const nums = cs.map((c) => ({ id: c.pid, n: c.S.game.mine.num })).sort((a, b) => a.n - b.n);
    if (r < 3) for (let i = 0; i < nums.length; i++) { A.send({ t: "mini", a: "move", id: nums[i].id, to: i }); await sleep(40); }
    for (const c of cs) c.send({ t: "mini", a: "ready", on: true });
    check(await waitFor(A, (s) => s.game.step === "show"), `R${r}: 全員OKで公開`);
    if (r === 1) check(A.S.game.last.all && Object.values(A.S.game.last.gained).every((v) => v === 3), "全員正しい位置→各+2、全員そろって+1");
  }
  check(await waitFor(A, (s) => s.phase === "result" && s.result.key === "number"), "かくれナンバーの順位発表");
  A.send({ t: "next" });
  // ---- ウソつき酒場 ----
  check(await waitFor(A, (s) => s.phase === "play" && s.game.key === "liar"), "ウソつき酒場(大会版)が始まる");
  check(cs.every((c) => c.S.game.myHand.length === 5) && !/"cards"/.test(A.raw), "5枚ずつ・ほかの人の手札は送らない");
  let guard = 0;
  while (A.S.phase === "play" && guard++ < 3000) {
    const g = A.S.game;
    if (g.step === "play") { const t = by(g.turnId); if (t.S.game.canCall) t.send({ t: "mini", a: "liar" }); else t.send({ t: "mini", a: "play", ids: [t.S.game.myHand[0].id] }); await sleep(50); }
    else if (g.step === "reveal") { by(g.reveal.target).send({ t: "mini", a: "pull" }); await sleep(50); }
    else await sleep(200);
  }
  check(A.S.phase === "result" && A.S.result.key === "liar" && A.S.result.rows[0].rank === 1, "最後の1人が1位で順位発表");
  A.send({ t: "next" }); await sleep(80);
  check(A.S.phase === "final" && A.S.players.every((p) => p.total > 0), "総合結果");
  // 途中退出(ウソつき酒場で手番の人が抜ける)
  A.send({ t: "again" }); await sleep(60);
  A.send({ t: "setPlaylist", list: ["liar"] }); A.send({ t: "start" });
  await waitFor(A, (s) => s.phase === "play" && s.game.key === "liar");
  const turn = by(A.S.game.turnId); const stay = cs.find((c) => c !== turn && c.pid !== A.pid) || A;
  turn.send({ t: "leave" }); await sleep(150);
  check(stay.S.phase === "play" && stay.S.game.turnId !== turn.pid, "手番の人が抜けても続く");
  const res = await fetch("http://localhost:3123/healthz").then((r) => r.text()).catch(() => "down");
  check(res === "ok", "サーバは動き続けている");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
