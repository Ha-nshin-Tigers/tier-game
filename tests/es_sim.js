const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function client(name) {
  const ws = new WebSocket("ws://localhost:3123/eshiri/ws");
  const c = { ws, name, pid: "pid" + name.toLowerCase() + "12121", token: "tok" + name.toLowerCase() + "1212121212121212", S: null, errs: [], pics: {}, strokes: [] };
  ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; if (m.t === "error") c.errs.push(m.msg); if (m.t === "pic") c.pics[m.did] = m.strokes; if (m.t === "stroke") c.strokes.push(m); });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c;
}
const waitFor = async (c, fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (c.S && fn(c.S)) return true; await sleep(30); } return false; };
const G = (c) => c.S.game;
const stroke = { c: "#181b23", w: 8, p: [100, 100, 200, 200, 300, 150] };
const lastC = (w) => { const s = { "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ" }; const a = [...w].filter((x) => x !== "ー"); const ch = a[a.length - 1]; return s[ch] || ch; };
// ことばの候補(先頭の文字 → 「ん」で終わらない言葉)
const WORDS = { "り": "りす", "す": "すいか", "か": "からす", "ら": "らくだ", "だ": "だるま", "ま": "まくら", "ご": "ごま", "ぱ": "ぱせり", "め": "めだか", "さ": "さる", "る": "るびー", "び": "びーる", "な": "なす", "ず": "ずぼん", "い": "いす", "せ": "せみ", "み": "みかん" };
const wordFor = (ch) => WORDS[ch] || ch + "かな";
// お題(最初の言葉)が「ん」で終わると、次の人がだれも書けなくなる
{ const src = require("fs").readFileSync(require("path").join(__dirname, "../games/mini/eshiri.js"), "utf8"), es = require("../games/mini/eshiri.js");
  const list = JSON.parse(src.match(/START_WORDS = (\[[^\]]*\])/)[1]);
  check(list.every((w) => es.lastChar(w) !== "ん"), "最初のお題に「ん」で終わる言葉がない"); }
(async () => {
  const R = "E" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const cs = ["Ann", "Bob", "Cat"].map(client); await Promise.all(cs.map((c) => c.open));
  for (const c of cs) { c.send({ t: "join", room: R, name: c.name, pid: c.pid, token: c.token }); await sleep(40); }
  await sleep(80);
  const [A, B, C] = cs, by = (id) => cs.find((c) => c.pid === id);
  A.send({ t: "settings", s: { mode: "relay", laps: 1, view: "prev", scoring: "both", drawSecs: 0 } }); await sleep(60);
  A.send({ t: "start" }); await sleep(100);
  check(A.S.phase === "play" && G(A).step === "draw" && G(A).turn.total === 3, "1本のしりとり(1周・3人)が始まる");
  // 1人目
  let T = by(G(A).turn.by); const t1 = G(T).task;
  check(t1 && t1.first && t1.start && !t1.prevDid, `最初の人はお題「${t1.start}」から`);
  const others = cs.filter((c) => c !== T);
  check(others.every((c) => !G(c).task && !G(c).turn.watch), "前の絵だけ: ほかの人は描いている様子を見られない");
  T.send({ t: "game", a: "stroke", s: stroke }); await sleep(60);
  check(others.every((c) => c.strokes.length === 0), "線はほかの人に送られない");
  T.send({ t: "game", a: "submit", word: "あいう" }); await sleep(60);
  check(T.errs.some((e) => /から始まる/.test(e)), "始まりの文字が違うと提出できない");
  T.send({ t: "game", a: "submit", word: lastC(t1.start) + "んごん" }); await sleep(60);
  check(T.errs.some((e) => /ん/.test(e)), "「ん」で終わる言葉は使えない");
  const w1 = wordFor(lastC(t1.start));
  T.send({ t: "game", a: "submit", word: w1 }); await sleep(100);
  check(G(A).turn.n === 2, "提出したら次の人の番");
  // 2人目: 前の絵が見える・正しく読み取る(カタカナで入力しても OK)
  T = by(G(A).turn.by); const t2 = G(T).task;
  check(t2.prevDid === t1.did, "2人目は前の絵を受け取れる");
  T.send({ t: "game", a: "pic", did: t2.prevDid }); await sleep(80);
  check((T.pics[t2.prevDid] || []).length === 1, "前の絵の線が届く");
  const third = cs.find((c) => c !== T && c.pid !== by(t1.did) && !(c.pid === G(A).players[0]));
  const outsider = cs.find((c) => c !== T && c.pid !== G(A).players[0]);
  outsider.send({ t: "game", a: "pic", did: t1.did }); await sleep(80);
  check(!outsider.pics[t1.did], "番ではない人は前の絵をもらえない");
  const kata = w1.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  const w2 = wordFor(lastC(w1));
  T.send({ t: "game", a: "stroke", s: stroke }); T.send({ t: "game", a: "submit", guess: kata, word: w2 }); await sleep(100);
  check(G(A).turn.n === 3, "カタカナで入れた読み取りも受け付ける");
  // 3人目: わざと読み間違える
  T = by(G(A).turn.by);
  T.send({ t: "game", a: "stroke", s: stroke }); T.send({ t: "game", a: "submit", guess: "ねこ", word: "こま" }); await sleep(150);
  check(G(A).step === "reveal", "全員描いたら答え合わせ");
  const ch = G(A).chains[0];
  check(ch.links[1].ok && !ch.links[2].ok && G(A).coop.ok === 1 && G(A).coop.total === 2, "読み取りの○×・つながった数 1/2");
  const sc = G(A).scores; const p1 = ch.links[0].by, p2 = ch.links[1].by;
  check(sc[p2] === 2 && sc[p1] === 1, "読み取れた人+2・読み取ってもらえた人+1");
  check(cs.every((c) => ch.links.every((l) => c.pics[l.did])), "答え合わせでは全員に全部の絵が届く");
  B.send({ t: "again" }); await sleep(80);
  check(A.S.phase === "lobby", "もう一度遊ぶ→待機");
  // 実況モード
  A.send({ t: "settings", s: { view: "live" } }); await sleep(40); A.send({ t: "start" }); await sleep(100);
  T = by(G(A).turn.by); const watcher = cs.find((c) => c !== T); watcher.strokes = [];
  check(G(watcher).turn.watch, "実況: ほかの人も見られる");
  T.send({ t: "game", a: "stroke", s: stroke }); await sleep(80);
  check(watcher.strokes.length === 1, "実況: 線がリアルタイムで届く");
  A.send({ t: "reset" }); await sleep(60);
  // 全員同時
  A.send({ t: "settings", s: { mode: "sim", view: "prev", drawSecs: 0 } }); await sleep(40); A.send({ t: "start" }); await sleep(100);
  check(G(A).round.total === 3 && cs.every((c) => G(c).task && G(c).task.first), "全員同時: 3本・全員が1回目を描く");
  for (let r = 1; r <= 3; r++) {
    await waitFor(A, (s) => s.game.round?.n === r || s.game.step === "reveal");
    for (const c of cs) {
      const t = G(c).task; if (!t) continue;
      c.send({ t: "game", a: "stroke", s: stroke });
      if (t.first) c.send({ t: "game", a: "submit", word: wordFor(lastC(t.start)) });
      else { c.send({ t: "game", a: "pic", did: t.prevDid }); c.send({ t: "game", a: "submit", guess: "わからん", word: wordFor("ん") }); }
      await sleep(40);
    }
    await sleep(150);
    if (r > 1) { /* 読み取り失敗のまま提出できない → 言葉が「ん」から始まる。テストでは次で補う */ }
  }
  // 「わからん」の最後は「ん」なので提出できない → ホストが締め切る
  if (G(A).step !== "reveal") { A.send({ t: "skip" }); await sleep(100); A.send({ t: "skip" }); await sleep(100); }
  check(G(A).step === "reveal" && G(A).chains.length === 3 && G(A).chains.every((c) => c.links.length === 3), "全員同時: 3本×3人で答え合わせ(締め切りも使える)");
  const res = await fetch("http://localhost:3123/healthz").then((r) => r.text()).catch(() => "down");
  check(res === "ok", "サーバは動き続けている");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
