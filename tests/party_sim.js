const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/party/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "44444", token: "tok" + name.toLowerCase() + "4444444444444444", S: null, raw: [] };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") { c.S = m.room; c.raw.push(String(b)); } if (m.t === "joined") c.ing = m.ingredients; });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
const waitFor = async (c, fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { if (c.S && fn(c.S)) return true; await sleep(50); } return false; };
(async () => {
  const R = "Q" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const cs = ["Ann", "Bob", "Cat"].map(client); await Promise.all(cs.map((c) => c.open));
  for (const c of cs) { c.send({ t: "join", room: R, name: c.name, pid: c.pid, token: c.token }); await sleep(40); }
  await sleep(100);
  const [A, B, C] = cs, by = (id) => cs.find((c) => c.pid === id);
  check(A.S.phase === "lobby" && A.ing.length === 24, "3人入室・食材リスト受信");
  B.send({ t: "start" }); await sleep(80);
  check(A.S.phase === "lobby", "ホスト以外は開始できない");
  A.send({ t: "start" }); await sleep(100);
  check(A.S.phase === "intro" && A.S.game.key === "bridge" && A.S.seq.length === 3, "開始→ゲーム紹介(橋)");
  // ---- 橋 ----
  check(await waitFor(A, (s) => s.phase === "play"), "紹介のあと橋が始まる");
  check(A.S.game.values.length === 3, "橋は3本(3人)");
  // R1: A と B がかぶり、C はひとり
  A.send({ t: "pick", i: 0 }); B.send({ t: "pick", i: 0 }); await sleep(80);
  const leak = A.raw[A.raw.length - 1];
  check(!/"picks"/.test(leak) && A.S.game.picked.length === 2 && A.S.game.last === null, "公開前はほかの人の選択が送られない");
  C.send({ t: "pick", i: 1 }); await sleep(120);
  const g1 = A.S.game;
  check(g1.step === "show" && g1.last.collapsed[0] && !g1.last.collapsed[1], "全員選んだら即公開・かぶった橋は崩落");
  check(g1.last.gained[A.pid] === 0 && g1.last.gained[C.pid] === g1.values[1], "崩落は0点・ひとりじめは橋の点");
  for (let r = 2; r <= 3; r++) {
    await waitFor(A, (s) => s.game?.key === "bridge" && s.game.round === r && s.game.step === "pick");
    A.send({ t: "pick", i: 0 }); B.send({ t: "pick", i: 1 }); C.send({ t: "pick", i: 2 }); await sleep(120);
  }
  check(await waitFor(A, (s) => s.phase === "result"), "3ラウンド後に橋の順位発表");
  const rr = A.S.result.rows;
  check(rr.length === 3 && rr[0].pts === 10 && rr.every((r) => r.total === r.pts), "順位点(1位10点)が合計に入る");
  A.send({ t: "next" }); await sleep(100);
  check(A.S.phase === "intro" && A.S.game.key === "bomb", "ホストの「次へ」で爆弾回しの紹介へ");
  // ---- 爆弾 ----
  check(await waitFor(A, (s) => s.phase === "play"), "爆弾回しが始まる");
  check(A.S.deadline === 0 && !/fuse/i.test(JSON.stringify(A.S.game).replace(/"step":"fuse"/, "")), "爆発時刻は送られない");
  let H = by(A.S.game.holder), other = cs.find((c) => c !== H);
  H.send({ t: "pass", to: other.pid }); await sleep(80);
  check(A.S.game.holder === H.pid, "受け取った直後は渡せない");
  await sleep(750);
  other.send({ t: "pass", to: H.pid }); await sleep(80);
  check(A.S.game.holder === H.pid, "持っていない人は渡せない");
  H.send({ t: "pass", to: other.pid }); await sleep(80);
  check(A.S.game.holder === other.pid, "0.7秒後に渡せる");
  check(await waitFor(A, (s) => s.game?.step === "boom", 25000), "爆発して脱落");
  const first = A.S.game.boom;
  check(await waitFor(A, (s) => s.phase === "result", 40000), "最後の1人になったら順位発表");
  const br = A.S.result.rows;
  check(br[br.length - 1].id === first && br[0].rank === 1, "最初に脱落した人が最下位");
  A.send({ t: "next" }); await sleep(100);
  // ---- 料理 ----
  check(await waitFor(A, (s) => s.phase === "play" && s.game.key === "memory"), "おぼえて料理が始まる");
  const recipe = A.S.game.recipe;
  check(recipe && recipe.length === 3 && !A.S.game.grid, "最初はレシピだけ見える(3個)");
  check(await waitFor(A, (s) => s.game.step === "input"), "入力の段階へ");
  check(A.S.game.recipe === null && A.S.game.grid.length === 12 && recipe.every((x) => A.S.game.grid.includes(x)), "入力中はレシピを送らない・12個に正解が含まれる");
  const wrong = A.S.game.grid.find((x) => !recipe.includes(x));
  A.send({ t: "cook", sel: recipe }); await sleep(60);
  B.send({ t: "cook", sel: [recipe[0], wrong] }); await sleep(60);
  A.send({ t: "cook", sel: [] }); await sleep(40);
  C.send({ t: "cook", sel: recipe }); await sleep(120);
  const L = A.S.game.last;
  check(L && L.rows[A.pid].perfect && L.rows[A.pid].pts === 3 * 2 + 2 + 3, "全問正解・1番乗りで +11点");
  check(L.rows[C.pid].bonus === 2 && L.rows[B.pid].pts === 1, "2番目はボーナス+2・まちがいは−1");
  for (let r = 2; r <= 3; r++) {
    await waitFor(A, (s) => s.game?.key === "memory" && s.game.round === r && s.game.step === "show");
    const rc = A.S.game.recipe;
    check(rc.length === r + 2, `ラウンド${r}は材料${r + 2}個`);
    await waitFor(A, (s) => s.game.step === "input");
    for (const c of cs) c.send({ t: "cook", sel: rc });
    await sleep(120);
  }
  check(await waitFor(A, (s) => s.phase === "result" && s.result.last), "料理の順位発表(最後)");
  A.send({ t: "next" }); await sleep(100);
  check(A.S.phase === "final" && A.S.players.every((p) => p.total > 0), "総合結果");
  C.send({ t: "again" }); await sleep(80);
  check(A.S.phase === "final", "ホスト以外は「もう一度」で戻せない");
  A.send({ t: "again" }); await sleep(80);
  check(A.S.phase === "lobby", "ホストの「もう一度」→待機");
  // ---- 途中退出 ----
  A.send({ t: "setPlaylist", list: [] }); await sleep(60);
  check(A.S.playlist.length === 3, "0試合にはできない");
  A.send({ t: "setPlaylist", list: ["bomb"] }); await sleep(60);
  check(A.S.playlist.join() === "bomb", "試合の並びを変更できる");
  A.send({ t: "start" }); await waitFor(A, (s) => s.phase === "play");
  const hold = by(A.S.game.holder);
  hold.send({ t: "leave" }); await sleep(120);
  const rest = cs.find((c) => c !== hold);
  check(rest.S.phase === "play" && rest.S.game.holder && rest.S.game.holder !== hold.pid, "爆弾を持った人が退出→ほかの人に移る");
  const res = await fetch("http://localhost:3123/healthz").then((r) => r.text()).catch(() => "down");
  check(res === "ok", "サーバは動き続けている");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
