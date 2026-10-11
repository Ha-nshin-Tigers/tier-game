"use strict";
// みんなでティア表 — ゲームサーバ
// 親の答えはサーバだけが持ち、答え合わせまでほかのプレイヤーには送らない。
// タイマー・得点計算もサーバ側で行う(親がページを閉じても時間切れで答え合わせになる)。

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const TIERS = ["S", "A", "B", "C", "D"];
const PTS_EXACT = 3, PTS_NEAR = 1, PTS_PERFECT = 5;
const DURATIONS = [30, 60, 90, 120];
const MAX_PLAYERS = 12, MAX_ROOMS = 500, MAX_TOPICS = 300;
const ROOM_IDLE_MS = 30 * 60 * 1000;

const BANK = {
  "好きな食べ物": ["カレー","寿司","ラーメン","焼肉","ピザ","ハンバーグ","餃子","天ぷら","オムライス","うどん","パスタ","からあげ","たこ焼き","すき焼き","牛丼"],
  "理想の休日": ["二度寝","温泉","カラオケ","映画館","買い物","筋トレ","読書","ゲーム","キャンプ","カフェ巡り","料理","掃除","昼寝","ドライブ","美術館"],
  "人生で大事なもの": ["お金","時間","友達","家族","健康","恋人","仕事","趣味","睡眠","自由","名誉","ペット","才能","若さ","推し"],
  "好きな季節イベント": ["花見","夏祭り","花火大会","海水浴","紅葉狩り","ハロウィン","クリスマス","大晦日","初詣","バレンタイン","誕生日","ゴールデンウィーク","お盆","雪遊び","お月見"],
  "飼ってみたい動物": ["犬","猫","パンダ","ペンギン","カピバラ","ライオン","うさぎ","イルカ","フクロウ","ハリネズミ","コアラ","キリン","ハムスター","ナマケモノ","シマエナガ"],
  "アニメの世界に転生": ["ワンピース","NARUTO","鬼滅の刃","呪術廻戦","鋼の錬金術師"],
  "恋人に求める条件": ["顔","性格","価値観","趣味","愛情表現"],
  "恋人にされたら冷める行動": ["食べかたが汚い","異性との距離が近い","束縛","元恋人の話をする","悪口が多い"],
  "恋人にされてうれしいこと": ["サプライズ","手料理","誉め言葉","プレゼント","エッチの誘い"],
  "許せる異性との関わり": ["2人でゲーム","2人で映画","朝まで通話","2人で飲み","元恋人とあう"],
  "理想の告白": ["夜景","帰り道","花火大会","旅行先","屋上"],
  "好きな女の子の服装": ["かわいい系","ストリート系","清楚系","セクシー系","地雷系"],
};

// ---------------------------------------------------------------
// お題の保存(Upstash Redis があればそこへ、無ければローカルファイル)
// ---------------------------------------------------------------
const UP_URL = process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TOPIC_KEY = "tier-game:topics";
const DATA_FILE = path.join(__dirname, "data", "topics.json");
let topics = []; // {id, name, words, by(pid), byName, at}

async function upstash(cmd) {
  const r = await fetch(UP_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error("Upstash HTTP " + r.status);
  return (await r.json()).result;
}
async function loadTopics() {
  try {
    if (UP_URL && UP_TOKEN) {
      const s = await upstash(["GET", TOPIC_KEY]);
      topics = s ? JSON.parse(s) : [];
    } else if (fs.existsSync(DATA_FILE)) {
      topics = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    console.error("お題の読み込みに失敗:", e.message);
    topics = [];
  }
  if (!Array.isArray(topics)) topics = [];
  console.log(`お題の保存先: ${UP_URL && UP_TOKEN ? "Upstash Redis" : "ローカルファイル(再起動で消える場合あり)"} / ${topics.length}件`);
}
let saveChain = Promise.resolve();
function saveTopics() {
  const body = JSON.stringify(topics);
  saveChain = saveChain.then(async () => {
    if (UP_URL && UP_TOKEN) await upstash(["SET", TOPIC_KEY, body]);
    else {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, body);
    }
  }).catch((e) => console.error("お題の保存に失敗:", e.message));
}
function allTopics() {
  const o = { ...BANK };
  for (const t of topics) if (!(t.name in o)) o[t.name] = t.words;
  return o;
}

// ---------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------
const rid = (n) => crypto.randomBytes(n).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, n).toLowerCase() || "x";
// 制御文字・見えない書式文字を取り除く
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => typeof s === "string" ? s.replace(BAD_CHARS, "").trim().slice(0, max) : "";
const tierOf = (arr, w) => TIERS.find((t) => arr[t] === w) || null;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickWords(topic) { return shuffle([...(allTopics()[topic] || [])]).slice(0, 5); }
function randomTopic(except) {
  const ks = Object.keys(allTopics()).filter((k) => k !== except);
  return ks[Math.floor(Math.random() * ks.length)];
}
// 5つのワードを S〜D に1つずつ置いた並びかを検証して、きれいな形で返す
function cleanArr(arr, words) {
  if (!arr || typeof arr !== "object") return null;
  const out = {}, used = new Set();
  for (const t of TIERS) {
    const w = arr[t];
    if (typeof w !== "string" || !words.includes(w) || used.has(w)) return null;
    out[t] = w; used.add(w);
  }
  return out;
}
function scoreGuess(answer, guess) {
  let s = 0, exact = 0;
  for (const t of TIERS) {
    const g = tierOf(guess, answer[t]);
    if (!g) continue;
    const d = Math.abs(TIERS.indexOf(t) - TIERS.indexOf(g));
    if (d === 0) { s += PTS_EXACT; exact++; } else if (d === 1) s += PTS_NEAR;
  }
  return s + (exact === 5 ? PTS_PERFECT : 0);
}

// ---------------------------------------------------------------
// 部屋とゲーム進行
// ---------------------------------------------------------------
const rooms = new Map();

function newRoom(code) {
  return {
    code, phase: "lobby", round: 0, hostId: null, topic: "", words: [], deadline: 0, duration: 60,
    players: new Map(), answer: null, guesses: new Map(), result: null, timer: null, emptySince: null,
  };
}
const connected = (p) => p && p.sockets.size > 0;
const order = (room) => [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);

function startRound(room, hostId) {
  clearTimeout(room.timer);
  room.round += 1;
  room.hostId = hostId;
  room.topic = randomTopic(room.topic);
  room.words = pickWords(room.topic);
  room.answer = null;
  room.guesses.clear();
  room.result = null;
  room.deadline = 0;
  room.phase = "ranking";
}
function toLobby(room) {
  clearTimeout(room.timer);
  Object.assign(room, { phase: "lobby", hostId: null, topic: "", words: [], deadline: 0, answer: null, result: null });
  room.guesses.clear();
}
function nextRound(room) {
  const live = order(room).filter(connected);
  if (live.length < 2) return toLobby(room);
  const all = order(room);
  const i = all.findIndex((p) => p.id === room.hostId);
  for (let k = 1; k <= all.length; k++) {
    const p = all[(Math.max(i, -1) + k) % all.length];
    if (connected(p)) return startRound(room, p.id);
  }
  toLobby(room);
}
function reveal(room) {
  if (room.phase !== "guessing" || !room.answer) return;
  clearTimeout(room.timer);
  const rows = [];
  for (const p of order(room)) {
    const g = room.guesses.get(p.id);
    if (!g || p.id === room.hostId) continue;
    const s = scoreGuess(room.answer, g);
    p.score += s;
    rows.push({ id: p.id, name: p.name, guess: g, score: s });
  }
  const host = room.players.get(room.hostId);
  room.result = { round: room.round, topic: room.topic, words: room.words, answer: room.answer, hostId: room.hostId, hostName: host ? host.name : "(退出した親)", rows };
  room.phase = "reveal";
  broadcast(room);
}
function allGuessed(room) {
  const gs = order(room).filter((p) => p.id !== room.hostId && connected(p));
  return gs.length > 0 && gs.every((p) => room.guesses.has(p.id));
}

// ---------------------------------------------------------------
// 送信
// ---------------------------------------------------------------
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function view(room, me) {
  return {
    t: "state", now: Date.now(), me,
    room: {
      code: room.code, phase: room.phase, round: room.round, hostId: room.hostId, topic: room.topic,
      words: room.words, deadline: room.deadline, duration: room.duration,
      players: order(room).map((p) => ({ id: p.id, name: p.name, score: p.score, connected: connected(p), submitted: room.phase === "guessing" && room.guesses.has(p.id) })),
      result: room.phase === "reveal" ? room.result : null,
      myGuess: room.phase === "guessing" ? room.guesses.get(me) || null : null,
    },
  };
}
function broadcast(room) {
  for (const p of room.players.values()) for (const ws of p.sockets) send(ws, view(room, p.id));
}
function topicsMsg(ws) {
  return { t: "topics", builtin: BANK, list: topics.map((t) => ({ id: t.id, name: t.name, words: t.words, byName: t.byName, mine: !!ws.pid && t.by === ws.pid })) };
}
function broadcastTopics() { for (const ws of wss.clients) send(ws, topicsMsg(ws)); }
const err = (ws, msg) => send(ws, { t: "error", msg });

// ---------------------------------------------------------------
// メッセージ処理
// ---------------------------------------------------------------
function detach(ws) {
  const room = ws.room;
  if (!room) return;
  const p = room.players.get(ws.pid);
  if (p) p.sockets.delete(ws);
  ws.room = null;
  if (![...room.players.values()].some(connected)) room.emptySince = Date.now();
  // 予想中に残りの全員が提出済みになったら答え合わせ
  if (room.phase === "guessing" && allGuessed(room)) return reveal(room);
  broadcast(room);
}
function removePlayer(room, pid) {
  const p = room.players.get(pid);
  if (!p) return;
  room.players.delete(pid);
  room.guesses.delete(pid);
  if (room.players.size < 2 && room.phase !== "lobby") toLobby(room);
  else if (pid === room.hostId && room.phase === "ranking") nextRound(room);
  else if (room.phase === "guessing" && allGuessed(room)) return reveal(room);
  broadcast(room);
}

function handle(ws, m) {
  if (m.t === "join") {
    const code = String(m.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const name = cleanStr(m.name, 12);
    const pid = typeof m.pid === "string" && /^[a-z0-9]{8,32}$/.test(m.pid) ? m.pid : null;
    const token = typeof m.token === "string" && /^[a-z0-9]{16,64}$/.test(m.token) ? m.token : null;
    if (code.length < 4) return err(ws, "部屋コードは4〜6文字の英数字です");
    if (!name) return err(ws, "ニックネームを入れてください");
    if (!pid || !token) return err(ws, "ページを再読み込みしてください");
    let room = rooms.get(code);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) return err(ws, "部屋がいっぱいです。しばらくしてから試してください");
      room = newRoom(code);
      rooms.set(code, room);
    }
    let p = room.players.get(pid);
    if (p && p.token !== token) return err(ws, "この部屋に入れませんでした。ページを再読み込みしてください");
    if (!p) {
      if (room.players.size >= MAX_PLAYERS) return err(ws, `この部屋は満員です(${MAX_PLAYERS}人まで)`);
      p = { id: pid, token, name, score: 0, joinedAt: Date.now(), sockets: new Set() };
      room.players.set(pid, p);
    }
    if (ws.room) detach(ws);
    p.name = name;
    p.sockets.add(ws);
    ws.room = room; ws.pid = pid;
    room.emptySince = null;
    send(ws, { t: "joined", room: code });
    send(ws, topicsMsg(ws));
    return broadcast(room);
  }

  // お題の追加・削除(部屋に入っていれば誰でも)
  if (m.t === "addTopic" || m.t === "delTopic") {
    if (!ws.pid) return err(ws, "部屋に入ってから操作してください");
    if (m.t === "addTopic") {
      const name = cleanStr(m.name, 20);
      const words = [];
      if (Array.isArray(m.words)) for (const w of m.words.map((x) => cleanStr(x, 16))) if (w && !words.includes(w)) words.push(w);
      if (!name) return err(ws, "お題の名前を入れてください");
      if (name in allTopics()) return err(ws, "同じ名前のお題がもうあります");
      if (words.length < 5) return err(ws, "ワードは5個以上必要です");
      if (words.length > 30) return err(ws, "ワードは30個までです");
      if (topics.length >= MAX_TOPICS) return err(ws, `お題は${MAX_TOPICS}件までです。使わないものを削除してください`);
      const me = ws.room && ws.room.players.get(ws.pid);
      topics.push({ id: rid(10), name, words, by: ws.pid, byName: me ? me.name : "", at: Date.now() });
      send(ws, { t: "info", msg: `「${name}」を保存しました` });
    } else {
      const i = topics.findIndex((t) => t.id === m.id);
      if (i < 0) return;
      if (topics[i].by !== ws.pid) return err(ws, "削除できるのはお題を作った人だけです");
      topics.splice(i, 1);
    }
    saveTopics();
    return broadcastTopics();
  }

  const room = ws.room;
  const p = room && room.players.get(ws.pid);
  if (!p) return err(ws, "部屋に入っていません");
  const isHost = p.id === room.hostId;

  switch (m.t) {
    case "leave":
      ws.room = null;
      p.sockets.delete(ws);
      return removePlayer(room, p.id);
    case "setDuration":
      if (room.phase === "lobby" && DURATIONS.includes(m.sec)) room.duration = m.sec;
      break;
    case "start":
      if (room.phase !== "lobby") return;
      if (order(room).filter(connected).length < 2) return err(ws, "2人以上でスタートできます");
      startRound(room, p.id);
      break;
    case "pickTopic":
      if (room.phase !== "ranking" || !isHost || !(m.name in allTopics())) return;
      room.topic = m.name; room.words = pickWords(m.name);
      break;
    case "reroll":
      if (room.phase !== "ranking" || !isHost) return;
      if (!(room.topic in allTopics())) room.topic = randomTopic();
      room.words = pickWords(room.topic);
      break;
    case "editTopic":
      if (room.phase !== "ranking" || !isHost) return;
      room.topic = cleanStr(m.text, 30);
      break;
    case "editWord": {
      if (room.phase !== "ranking" || !isHost) return;
      const i = m.i, w = cleanStr(m.w, 16);
      if (!Number.isInteger(i) || i < 0 || i >= room.words.length || !w || room.words.includes(w)) break;
      room.words = room.words.map((x, k) => (k === i ? w : x));
      break;
    }
    case "submitAnswer": {
      if (room.phase !== "ranking" || !isHost) return;
      const a = cleanArr(m.arr, room.words);
      if (!a) return err(ws, "5つ全部を S〜D に1つずつ置いてください");
      room.answer = a;
      room.phase = "guessing";
      room.deadline = Date.now() + room.duration * 1000;
      room.timer = setTimeout(() => reveal(room), room.duration * 1000 + 800);
      break;
    }
    case "guess": {
      if (room.phase !== "guessing" || isHost || Date.now() > room.deadline + 500) return;
      const g = cleanArr(m.arr, room.words);
      if (!g) return;
      room.guesses.set(p.id, g);
      if (allGuessed(room)) return reveal(room);
      break;
    }
    case "revealNow":
      if (room.phase === "guessing" && isHost) return reveal(room);
      return;
    case "next":
      if (room.phase !== "reveal") return;
      nextRound(room);
      break;
    case "skip":
      // 親が接続していないまま並べる段階で止まったとき用
      if (room.phase === "ranking" && !connected(room.players.get(room.hostId))) nextRound(room);
      break;
    case "reset":
      toLobby(room);
      room.round = 0;
      for (const q of room.players.values()) q.score = 0;
      break;
    default:
      return;
  }
  broadcast(room);
}

// ---------------------------------------------------------------
// HTTP + WebSocket
// ---------------------------------------------------------------
const INDEX = path.join(__dirname, "public", "index.html");
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    fs.readFile(INDEX, (e, buf) => {
      if (e) { res.writeHead(500); return res.end("index.html が見つかりません"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(buf);
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("ページが見つかりません");
});

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.budget = 40;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (buf) => {
    if (--ws.budget < 0) return; // 送りすぎは捨てる
    let m;
    try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m.t !== "string") return;
    try { handle(ws, m); } catch (e) { console.error("処理エラー:", e); }
  });
  ws.on("close", () => detach(ws));
  send(ws, topicsMsg(ws));
});

// 送信回数の予算回復・切れた接続の掃除・空き部屋の削除
setInterval(() => { for (const ws of wss.clients) ws.budget = Math.min(40, ws.budget + 20); }, 1000);
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms)
    if (room.emptySince && now - room.emptySince > ROOM_IDLE_MS) { clearTimeout(room.timer); rooms.delete(code); }
}, 60000);

loadTopics().then(() => server.listen(PORT, () => console.log(`起動しました: http://localhost:${PORT}`)));
