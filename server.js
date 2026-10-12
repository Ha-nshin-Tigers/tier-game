"use strict";
// みんなでティア表 — ゲームサーバ
// 親の答えはサーバだけが持ち、答え合わせまでほかのプレイヤーには送らない。
// タイマー・得点計算もサーバ側で行う(親がページを閉じても時間切れで答え合わせになる)。

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const number = require("./games/number"); // かくれナンバー(/number)

const PORT = process.env.PORT || 3000;
const TIERS = ["S", "A", "B", "C", "D"];
const PTS_EXACT = 3, PTS_NEAR = 1, PTS_PERFECT = 5;
const DURATIONS = [30, 60, 90, 120];
const GOALS = [0, 20, 30, 50, 80]; // 0 = 終了点なし(好きなだけ遊ぶ)
const MAX_PLAYERS = 12, MAX_ROOMS = 500, MAX_TOPICS = 300;
const WORD_MAX = 24; // ワード1つの最大文字数
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
  "好きな女の子の髪型": ["ショートヘア","ツインテール","ハーフアップ","ポニーテール","ロングヘア","ウルフカット","お団子"],
};

// 標準お題のジャンル(載っていないものは「その他」)
const GENRE = {
  "好きな食べ物": "日常", "理想の休日": "日常", "人生で大事なもの": "日常", "好きな季節イベント": "日常", "飼ってみたい動物": "日常",
  "恋人に求める条件": "恋愛", "恋人にされたら冷める行動": "恋愛", "恋人にされてうれしいこと": "恋愛", "許せる異性との関わり": "恋愛",
  "理想の告白": "恋愛", "好きな女の子の服装": "恋愛", "好きな女の子の髪型": "恋愛",
  "アニメの世界に転生": "アニメ・エンタメ",
};

// ---------------------------------------------------------------
// お題の保存(Upstash Redis があればそこへ、無ければローカルファイル)
// ---------------------------------------------------------------
const UP_URL = process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TOPIC_KEY = "tier-game:topics";
const DATA_FILE = path.join(__dirname, "data", "topics.json");
let topics = []; // {id, name, words, genre, by(pid), byName, at}
let genreOverride = {}; // 標準お題のジャンルを後から変えたもの {お題名: ジャンル}

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
  let data = null;
  try {
    if (UP_URL && UP_TOKEN) {
      const s = await upstash(["GET", TOPIC_KEY]);
      data = s ? JSON.parse(s) : null;
    } else if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    console.error("お題の読み込みに失敗:", e.message);
  }
  // 旧形式(お題の配列だけ)と新形式({topics, genres})の両方を読む
  if (Array.isArray(data)) topics = data;
  else if (data && typeof data === "object") {
    topics = Array.isArray(data.topics) ? data.topics : [];
    genreOverride = data.genres && typeof data.genres === "object" ? data.genres : {};
  }
  console.log(`お題の保存先: ${UP_URL && UP_TOKEN ? "Upstash Redis" : "ローカルファイル(再起動で消える場合あり)"} / ${topics.length}件`);
}
let saveChain = Promise.resolve();
function saveTopics() {
  const body = JSON.stringify({ topics, genres: genreOverride });
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
function builtinGenres() {
  const o = {};
  for (const name of Object.keys(BANK)) o[name] = genreOverride[name] || GENRE[name] || "その他";
  return o;
}
function genreOf(name) {
  if (name in BANK) return builtinGenres()[name];
  const t = topics.find((x) => x.name === name);
  return (t && t.genre) || "その他";
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
// off: その部屋で「おやすみ中」にしたお題名の Set。全部おやすみなら全お題から選ぶ
function randomTopic(except, off) {
  const all = Object.keys(allTopics());
  const on = off ? all.filter((k) => !off.has(k)) : all;
  const pool = on.length ? on : all;
  const ks = pool.length > 1 ? pool.filter((k) => k !== except) : pool;
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
    code, phase: "lobby", round: 0, hostId: null, topic: "", words: [], deadline: 0, duration: 60, goal: 0,
    players: new Map(), answer: null, guesses: new Map(), result: null, timer: null, emptySince: null,
    off: new Set(), // 出題しない(おやすみ中)お題名
    history: [], awards: null, // history: 答え合わせ済みラウンドの {hostId, answer, guesses}
  };
}
const connected = (p) => p && p.sockets.size > 0;
const order = (room) => [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
// ゲームのホスト(親とは別): いちばん早く入った、接続中の人。抜けたら次の人に自動で移る
const hostOf = (room) => (order(room).find(connected) || {}).id || null;

function startRound(room, hostId) {
  clearTimeout(room.timer);
  room.round += 1;
  room.hostId = hostId;
  room.topic = randomTopic(room.topic, room.off);
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
  // 終了点に届いた人がいればゲーム終了(同点なら全員優勝)
  let winners = [];
  if (room.goal) {
    const top = Math.max(...[...room.players.values()].map((p) => p.score));
    if (top >= room.goal) winners = order(room).filter((p) => p.score === top).map((p) => ({ id: p.id, name: p.name }));
  }
  room.result = { round: room.round, topic: room.topic, words: room.words, answer: room.answer, hostId: room.hostId, hostName: host ? host.name : "(退出した親)", rows, winners };
  room.history.push({ hostId: room.hostId, answer: room.answer, guesses: rows.map((r) => ({ id: r.id, guess: r.guess })) });
  room.phase = "reveal";
  broadcast(room);
}

// ---------------------------------------------------------------
// 表彰(名探偵賞・マッチ度)
// ---------------------------------------------------------------
// 2つの並びの近さ(0〜100%)。ワードごとの順位差が 0 なら4点、4ずれで0点として合計/20
function similarity(a, b) {
  let s = 0;
  for (const t of TIERS) {
    const w = a[t], j = TIERS.indexOf(tierOf(b, w));
    if (j >= 0) s += 4 - Math.abs(TIERS.indexOf(t) - j);
  }
  return Math.round((s / 20) * 100);
}
function computeAwards(room) {
  const nameOf = (id) => (room.players.get(id) || {}).name || "退出した人";
  // 名探偵賞: ぴったり当てた数の合計が最多の人
  const stat = {};
  for (const h of room.history) for (const g of h.guesses) {
    const s = (stat[g.id] ||= { exact: 0, tries: 0 });
    s.exact += TIERS.filter((t) => g.guess[t] === h.answer[t]).length;
    s.tries += 1;
  }
  const stats = Object.entries(stat).map(([id, s]) => ({ id, name: nameOf(id), exact: s.exact, tries: s.tries, rate: Math.round((s.exact / (s.tries * 5)) * 100) }))
    .sort((a, b) => b.exact - a.exact || b.rate - a.rate);
  const best = stats.length ? stats[0].exact : 0;
  const detectives = best > 0 ? stats.filter((s) => s.exact === best) : [];
  // マッチ度: 親とその並びを予想した人の組ごとに、両方向の結果を平均
  const pairs = new Map();
  for (const h of room.history) for (const g of h.guesses) {
    const key = [h.hostId, g.id].sort().join("|");
    const p = pairs.get(key) || { a: key.split("|")[0], b: key.split("|")[1], sum: 0, n: 0 };
    p.sum += similarity(h.answer, g.guess); p.n += 1;
    pairs.set(key, p);
  }
  const matches = [...pairs.values()].map((p) => ({ names: [nameOf(p.a), nameOf(p.b)], match: Math.round(p.sum / p.n), rounds: p.n }))
    .sort((x, y) => y.match - x.match || y.rounds - x.rounds).slice(0, 5);
  return { detectives, stats, matches };
}
function finish(room) {
  clearTimeout(room.timer);
  if (room.result && !room.result.winners.length) {
    const top = Math.max(...[...room.players.values()].map((p) => p.score));
    room.result.winners = order(room).filter((p) => p.score === top).map((p) => ({ id: p.id, name: p.name }));
  }
  room.awards = computeAwards(room);
  room.phase = "finished";
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
      words: room.words, deadline: room.deadline, duration: room.duration, goal: room.goal, gameHostId: hostOf(room),
      players: order(room).map((p) => ({ id: p.id, name: p.name, score: p.score, connected: connected(p), submitted: room.phase === "guessing" && room.guesses.has(p.id) })),
      result: room.phase === "reveal" || room.phase === "finished" ? room.result : null,
      awards: room.phase === "finished" ? room.awards : null,
      off: [...room.off],
      myGuess: room.phase === "guessing" ? room.guesses.get(me) || null : null,
    },
  };
}
function broadcast(room) {
  for (const p of room.players.values()) for (const ws of p.sockets) send(ws, view(room, p.id));
}
function topicsMsg(ws) {
  return { t: "topics", builtin: BANK, genres: builtinGenres(), list: topics.map((t) => ({ id: t.id, name: t.name, words: t.words, genre: t.genre || "その他", byName: t.byName, mine: !!ws.pid && t.by === ws.pid })) };
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

  // お題のジャンル変更: 標準お題はホスト、追加お題は作った人かホスト
  if (m.t === "setGenre") {
    if (!ws.pid || !ws.room) return err(ws, "部屋に入ってから操作してください");
    const isGM = hostOf(ws.room) === ws.pid;
    const genre = cleanStr(m.genre, 12) || "その他";
    if (m.name in BANK) {
      if (!isGM) return err(ws, "標準のお題のジャンルはホストだけが変えられます");
      genreOverride[m.name] = genre;
    } else {
      const t = topics.find((x) => x.name === m.name);
      if (!t) return;
      if (t.by !== ws.pid && !isGM) return err(ws, "ジャンルを変えられるのは作った人かホストだけです");
      t.genre = genre;
    }
    saveTopics();
    return broadcastTopics();
  }

  // 追加お題のワードを書き換える(作った人かホスト)
  if (m.t === "updateTopic") {
    if (!ws.pid || !ws.room) return err(ws, "部屋に入ってから操作してください");
    const t = topics.find((x) => x.name === m.name);
    if (!t) return err(ws, "そのお題は見つかりません");
    if (t.by !== ws.pid && hostOf(ws.room) !== ws.pid) return err(ws, "書き換えられるのは作った人かホストだけです");
    const words = [];
    if (Array.isArray(m.words)) for (const w of m.words.map((x) => cleanStr(x, WORD_MAX))) if (w && !words.includes(w)) words.push(w);
    if (words.length < 5 || words.length > 30) return err(ws, "ワードは5〜30個にしてください");
    t.words = words;
    saveTopics();
    return broadcastTopics();
  }

  // お題の追加・削除(部屋に入っていれば誰でも)
  if (m.t === "addTopic" || m.t === "delTopic") {
    if (!ws.pid) return err(ws, "部屋に入ってから操作してください");
    if (m.t === "addTopic") {
      const name = cleanStr(m.name, 20);
      const words = [];
      if (Array.isArray(m.words)) for (const w of m.words.map((x) => cleanStr(x, WORD_MAX))) if (w && !words.includes(w)) words.push(w);
      if (!name) return err(ws, "お題の名前を入れてください");
      if (name in allTopics()) return err(ws, "同じ名前のお題がもうあります");
      if (words.length < 5) return err(ws, "ワードは5個以上必要です");
      if (words.length > 30) return err(ws, "ワードは30個までです");
      if (topics.length >= MAX_TOPICS) return err(ws, `お題は${MAX_TOPICS}件までです。使わないものを削除してください`);
      const me = ws.room && ws.room.players.get(ws.pid);
      const genre = cleanStr(m.genre, 12) || "その他";
      topics.push({ id: rid(10), name, words, genre, by: ws.pid, byName: me ? me.name : "", at: Date.now() });
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
  const isHost = p.id === room.hostId;   // そのラウンドの親
  const isGM = p.id === hostOf(room);    // ゲームのホスト
  // 設定・進行の管理系はホストだけ
  if (["setDuration", "setGoal", "toggleTopic", "toggleAll", "toggleGenre", "reset", "endGame"].includes(m.t) && !isGM)
    return err(ws, "この操作はホストだけができます");

  switch (m.t) {
    case "leave":
      ws.room = null;
      p.sockets.delete(ws);
      return removePlayer(room, p.id);
    case "setDuration":
      if (room.phase === "lobby" && DURATIONS.includes(m.sec)) room.duration = m.sec;
      break;
    case "setGoal":
      if (room.phase === "lobby" && GOALS.includes(m.pts)) room.goal = m.pts;
      break;
    case "start": {
      if (room.phase !== "lobby") return;
      if (!isGM) return err(ws, "ゲームを始められるのはホストだけです");
      const live = order(room).filter(connected);
      if (live.length < 2) return err(ws, "2人以上でスタートできます");
      // 最初の親はランダム。以降は参加順に交代
      startRound(room, live[Math.floor(Math.random() * live.length)].id);
      break;
    }
    case "reroll":
      // 親の「お題をランダムで変える」: 別のお題とワードを引き直す
      if (room.phase !== "ranking" || !isHost) return;
      room.topic = randomTopic(room.topic, room.off);
      room.words = pickWords(room.topic);
      break;
    case "kick": {
      // ホストがほかのプレイヤーを退出させる
      if (!isGM || m.id === p.id) return;
      const target = room.players.get(m.id);
      if (!target) return;
      for (const s of target.sockets) { send(s, { t: "kicked" }); s.room = null; }
      target.sockets.clear();
      return removePlayer(room, target.id);
    }
    case "submitAnswer": {
      if (room.phase !== "ranking" || !isHost) return;
      const a = cleanArr(m.arr, room.words);
      if (!a) return err(ws, "5つ全部を 1位〜5位 に置いてください");
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
      room.guesses.set(p.id, g); // 「確定する」で届く
      if (allGuessed(room)) return reveal(room);
      break;
    }
    case "toggleTopic": {
      // お題を「出題する / おやすみ中」に切り替え(部屋ごと・いつでも)
      const name = typeof m.name === "string" ? m.name : "";
      if (!(name in allTopics())) return;
      if (m.on) room.off.delete(name); else room.off.add(name);
      break;
    }
    case "toggleAll":
      room.off = m.on ? new Set() : new Set(Object.keys(allTopics()));
      break;
    case "toggleGenre":
      for (const name of Object.keys(allTopics())) if (genreOf(name) === m.genre) { if (m.on) room.off.delete(name); else room.off.add(name); }
      break;
    case "unguess":
      // 「変更する」: 締切前なら確定を取り消す
      if (room.phase !== "guessing" || isHost || Date.now() > room.deadline) return;
      room.guesses.delete(p.id);
      break;
    case "revealNow":
      if (room.phase === "guessing" && isHost) return reveal(room);
      return;
    case "next":
      if (room.phase !== "reveal") return;
      if (room.result && room.result.winners.length) finish(room);
      else nextRound(room);
      break;
    case "endGame":
      // 終了点を決めずに遊んでいるときの「ゲームを終えて結果発表」
      if (room.phase !== "reveal") return;
      finish(room);
      break;
    case "skip":
      // 親が接続していないまま並べる段階で止まったとき用
      if (room.phase === "ranking" && !connected(room.players.get(room.hostId))) nextRound(room);
      break;
    case "reset":
      toLobby(room);
      room.round = 0;
      room.history = [];
      room.awards = null;
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
// URL → 画面ファイル(/ はゲームを選ぶホーム画面)
const PAGES = {
  "/": "index.html", "/index.html": "index.html",
  "/tier": "tier.html", "/tier/": "tier.html",
  "/number": "number.html", "/number/": "number.html",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  // 以前のティア表の招待リンク(/?room=ABCD)はティア表へ転送する
  if (url.pathname === "/" && url.searchParams.has("room")) {
    res.writeHead(302, { Location: "/tier" + url.search });
    return res.end();
  }
  const page = PAGES[url.pathname];
  if (page) {
    fs.readFile(path.join(__dirname, "public", page), (e, buf) => {
      if (e) { res.writeHead(500); return res.end(page + " が見つかりません"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(buf);
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("ページが見つかりません");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
// WebSocket の振り分け: かくれナンバーの接続だけ専用へ、それ以外はこれまで通りティア表へ
server.on("upgrade", (req, socket, head) => {
  const target = new URL(req.url, "http://x").pathname === number.WS_PATH ? number.wss : wss;
  target.handleUpgrade(req, socket, head, (ws) => target.emit("connection", ws, req));
});
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
