const WebSocket = require("ws");
const URL = "ws://localhost:3123";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (c, msg) => { console.log((c ? "OK  " : "NG  ") + msg); if (!c) fails++; };
function client(path, name, i) {
  const ws = new WebSocket(URL + path);
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "00000", token: "tok" + name.toLowerCase() + "0000000000000000", state: null, msgs: [] };
  ws.on("message", (b) => { const m = JSON.parse(b); c.msgs.push(m); if (m.t === "state") c.state = m.room; });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.open = new Promise((r) => ws.on("open", r));
  return c;
}
(async () => {
  // ---- かくれナンバー ----
  const [a, b, c] = ["Aki", "Ben", "Cho"].map((n) => client("/number/ws", n));
  await Promise.all([a, b, c].map((x) => x.open));
  for (const x of [a, b, c]) { x.send({ t: "join", room: "TEST", name: x.name, pid: x.pid, token: x.token }); await sleep(50); }
  await sleep(100);
  check(a.state.phase === "lobby" && a.state.players.length === 3, "3人が入室・待機中");
  check(a.state.gameHostId === a.pid, "最初に入った人がホスト");
  b.send({ t: "start" }); await sleep(100);
  check(b.msgs.some((m) => m.t === "error" && /ホスト/.test(m.msg)), "ホスト以外は開始できない");
  a.send({ t: "setLives", lives: 1 }); a.send({ t: "start" }); await sleep(100);
  check(a.state.phase === "hint" && a.state.round === 1 && a.state.lives === 1, "開始→ヒント段階・ライフ1");
  const nums = [a, b, c].map((x) => x.state.mine.num);
  check(new Set(nums).size === 3 && nums.every((n) => n >= 1 && n <= 100), "数字は1〜100で重複なし: " + nums);
  // 他人の数字が送られていないこと
  const raw = JSON.stringify(b.msgs.filter((m) => m.t === "state").pop());
  check(!raw.includes(`"num":${nums[0]},`) || nums[0] === nums[1], "Bの受信データにAの数字が含まれない");
  a.send({ t: "hint", hint: "ヒントA" }); b.send({ t: "hint", hint: "ヒントB" }); await sleep(100);
  check(a.state.phase === "hint" && a.state.players.filter((p) => p.done).length === 2, "2/3確定でまだヒント段階");
  a.send({ t: "unhint" }); await sleep(50);
  check(!a.state.mine.done, "変更するで確定を取り消せる");
  a.send({ t: "hint", hint: "ヒントA2" }); c.send({ t: "hint", hint: "ヒントC" }); await sleep(100);
  check(a.state.phase === "arrange" && a.state.entries.length === 3, "全員確定で並べる段階へ");
  check(a.state.entries.some((e) => e.hint === "ヒントA2") && !JSON.stringify(a.state.entries).includes('"num"'), "並べ中はヒントのみ(数字なし)");
  // 正しい順に並べる
  const byNum = [a, b, c].map((x) => ({ id: x.pid, num: x.state.mine.num })).sort((p, q) => p.num - q.num);
  for (let i = 0; i < byNum.length; i++) { b.send({ t: "move", id: byNum[i].id, to: i }); await sleep(40); }
  check(a.state.entries.map((e) => e.id).join() === byNum.map((x) => x.id).join(), "移動が全員に反映");
  a.send({ t: "ready", on: true }); b.send({ t: "ready", on: true }); await sleep(60);
  c.send({ t: "move", id: byNum[0].id, to: 1 }); await sleep(60);
  check(a.state.players.every((p) => !p.ready), "動かすと全員のOKが取り消される");
  c.send({ t: "move", id: byNum[0].id, to: 0 }); await sleep(60);
  for (const x of [a, b, c]) x.send({ t: "ready", on: true });
  await sleep(100);
  check(a.state.phase === "reveal" && a.state.result.success && a.state.cleared === 1, "全員OKで公開→成功");
  check(a.state.result.entries.every((e) => typeof e.num === "number"), "公開時に数字が見える");
  // ラウンド2: わざと逆順で失敗 → ライフ0 → 終了
  c.send({ t: "next" }); await sleep(100);
  check(a.state.phase === "hint" && a.state.round === 2, "次のラウンドへ");
  const t1 = a.state.topic.name; a.send({ t: "reroll" }); await sleep(60);
  check(a.state.topic.name !== t1, "お題の引き直し");
  a.send({ t: "setTopic", name: "自作お題", low: "低", high: "高" }); await sleep(60);
  check(a.state.topic.name === "自作お題" && a.state.topic.low === "低", "ホストが自分でお題を決められる");
  a.send({ t: "hint", hint: "x" }); b.send({ t: "hint", hint: "y" }); await sleep(60);
  a.send({ t: "closeHints" }); await sleep(60);
  check(a.state.phase === "arrange" && a.state.entries.length === 2 && !c.state.mine, "打ち切りで未確定の人は観戦に");
  c.send({ t: "move", id: a.pid, to: 1 }); await sleep(60);
  const ord = a.state.entries.map((e) => e.id).join();
  const r2 = [a, b].map((x) => ({ id: x.pid, num: x.state.mine.num })).sort((p, q) => q.num - p.num); // 逆順
  if (a.state.entries[0].id !== r2[0].id) b.send({ t: "move", id: r2[0].id, to: 0 });
  await sleep(60);
  a.send({ t: "ready", on: true }); b.send({ t: "ready", on: true }); await sleep(100);
  check(ord !== undefined && a.state.phase === "reveal" && !a.state.result.success && a.state.lives === 0 && a.state.result.gameOver, "逆順で失敗→ライフ0→ゲームオーバー");
  b.send({ t: "next" }); await sleep(60);
  check(a.state.phase === "finished" && a.state.history.length === 2, "結果画面(2ラウンド分の履歴)");
  c.send({ t: "again" }); await sleep(60);
  check(a.state.phase === "lobby", "もう一度遊ぶ→待機");
  // 切断で進行が止まらないこと
  a.send({ t: "setLives", lives: 0 }); a.send({ t: "start" }); await sleep(60);
  a.send({ t: "hint", hint: "p" }); b.send({ t: "hint", hint: "q" }); await sleep(40);
  c.ws.close(); await sleep(150);
  check(a.state.phase === "arrange" && a.state.entries.length === 2, "未確定の人が切断→残り全員で並べる段階へ");
  // ---- ティア表(従来の /ws)が今まで通り動くか ----
  const [x, y] = ["Xan", "Yui"].map((n) => client("/ws", n));
  await Promise.all([x.open, y.open]);
  x.send({ t: "join", room: "TEST", name: "Xan", pid: x.pid, token: x.token }); await sleep(50);
  y.send({ t: "join", room: "TEST", name: "Yui", pid: y.pid, token: y.token }); await sleep(100);
  check(x.msgs.some((m) => m.t === "topics") && x.state.phase === "lobby" && x.state.players.length === 2, "ティア表: お題一覧受信・入室できる(同じ部屋コードでも別部屋)");
  x.send({ t: "start" }); await sleep(100);
  check(x.state.phase === "ranking" && x.state.words.length === 5, "ティア表: ゲーム開始できる");
  const z = client("/", "Zed"); await z.open; await sleep(100);
  check(z.msgs.some((m) => m.t === "topics"), "ティア表: /ws 以外のパスでも従来どおりティア表に接続");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK");
  process.exit(fails ? 1 : 0);
})();
