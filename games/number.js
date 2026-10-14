"use strict";
// かくれナンバー — ゲームサーバ(数字をことばで伝えて並べる協力ゲーム)
// 各自の数字はサーバだけが持ち、公開まではその本人にしか送らない。
// 全員がお題に沿ったヒント(ことば)を出し、みんなで小さい順に並べられたら成功。
// 部屋はティア表とは別管理(同じ部屋コードでも別の部屋になる)。

const { WebSocketServer } = require("ws");
// 生存確認の間隔(タブを閉じた人に早めに気づくため)。確認に応答がないまま次の確認が来たら切断扱い=最大30秒ほどで気づく
const PING_MS = 15000;

const WS_PATH = "/number/ws";
const NUM_MIN = 1, NUM_MAX = 100;
const MAX_PLAYERS = 12, MAX_ROOMS = 500;
const HINT_MAX = 24, TOPIC_MAX = 24, SCALE_MAX = 12;
const LIVES = [0, 1, 3, 5]; // 0 = ライフなし(何回失敗しても続けられる)
const ROOM_IDLE_MS = 30 * 60 * 1000;

// お題: name=お題、low=1 側の意味、high=100 側の意味
const TOPICS = [
  { name: "怖いもの", low: "平気", high: "震えるほど怖い" },
  { name: "好きな食べ物", low: "あまり好きじゃない", high: "大好物" },
  { name: "生き物の強さ", low: "弱い", high: "最強" },
  { name: "もらってうれしいプレゼント", low: "いらない", high: "最高にうれしい" },
  { name: "行ってみたい場所", low: "行かなくていい", high: "今すぐ行きたい" },
  { name: "人気の職業", low: "人気がない", high: "大人気" },
  { name: "無人島に持っていきたいもの", low: "役に立たない", high: "絶対に必要" },
  { name: "テンションが上がる瞬間", low: "ちょっとだけ", high: "最高潮" },
  { name: "言われてうれしい言葉", low: "うれしくない", high: "泣くほどうれしい" },
  { name: "値段が高いもの", low: "安い", high: "高い" },
  { name: "重いもの", low: "軽い", high: "重い" },
  { name: "大きいもの", low: "小さい", high: "大きい" },
  { name: "速いもの", low: "遅い", high: "速い" },
  { name: "モテそうな特技", low: "モテない", high: "めちゃモテる" },
  { name: "朝ごはんに食べたいもの", low: "食べたくない", high: "毎朝食べたい" },
  { name: "ゾンビの世界で役立つもの", low: "役に立たない", high: "頼りになる" },
  { name: "子どもに人気なもの", low: "人気がない", high: "大人気" },
  { name: "キャラクターの強さ", low: "弱い", high: "最強" },
  { name: "イライラすること", low: "気にならない", high: "我慢できない" },
  { name: "恥ずかしいこと", low: "平気", high: "恥ずかしすぎる" },
  { name: "デートで行きたい場所", low: "行きたくない", high: "絶対行きたい" },
  { name: "ありがたい発明", low: "なくてもいい", high: "ないと困る" },
  { name: "疲れること", low: "楽", high: "へとへと" },
  { name: "冬にうれしいもの", low: "うれしくない", high: "最高" },
  { name: "夏にうれしいもの", low: "うれしくない", high: "最高" },
  { name: "カッコいい名前", low: "ダサい", high: "カッコいい" },
  { name: "寝る前にしたいこと", low: "したくない", high: "毎晩したい" },
  { name: "人気のアニメ・漫画キャラ", low: "人気がない", high: "大人気" },
  { name: "お金を払ってでもやりたいこと", low: "払いたくない", high: "いくらでも払う" },
  { name: "甘いもの", low: "甘くない", high: "激甘" },
];

// ---------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------
// 制御文字・見えない書式文字を取り除く
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => typeof s === "string" ? s.replace(BAD_CHARS, "").trim().slice(0, max) : "";
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// 重ならない数字を n 個配る
function deal(n) {
  const pool = [];
  for (let i = NUM_MIN; i <= NUM_MAX; i++) pool.push(i);
  return shuffle(pool).slice(0, n);
}

// ---------------------------------------------------------------
// 部屋とゲーム進行
// phase: lobby → hint(ヒントを書く) → arrange(みんなで並べる) → reveal(公開) → hint … → finished
// ---------------------------------------------------------------
const rooms = new Map();

function newRoom(code) {
  return {
    code, phase: "lobby", round: 0, maxLives: 3, lives: 0, cleared: 0,
    players: new Map(),
    hands: new Map(),   // このラウンドの参加者 pid → {num, hint, done}
    order: [],          // 並べ中の順番(pid の配列。上ほど小さい)
    ready: new Set(),   // 「この並びでOK」を押した pid
    topic: null, recent: [], result: null, history: [], emptySince: null,
  };
}
const connected = (p) => p && p.sockets.size > 0;
const order = (room) => [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
// ゲームのホスト: いちばん早く入った、接続中の人。抜けたら次の人に自動で移る
const hostOf = (room) => (order(room).find(connected) || {}).id || null;
// このラウンドに参加していて、いま接続中の人
const activeIds = (room) => [...room.hands.keys()].filter((id) => connected(room.players.get(id)));

function pickTopic(room) {
  let pool = TOPICS.filter((t) => !room.recent.includes(t.name));
  if (!pool.length) { room.recent = []; pool = TOPICS; }
  const t = pool[Math.floor(Math.random() * pool.length)];
  room.recent.push(t.name);
  if (room.recent.length > Math.min(10, TOPICS.length - 1)) room.recent.shift();
  return { ...t };
}
function clearHints(room) { for (const h of room.hands.values()) { h.hint = ""; h.done = false; } }

function toLobby(room) {
  Object.assign(room, { phase: "lobby", topic: null, order: [], result: null });
  room.hands.clear();
  room.ready.clear();
}
function startRound(room) {
  const live = order(room).filter(connected);
  if (live.length < 2) return toLobby(room);
  room.round += 1;
  room.topic = pickTopic(room);
  const nums = deal(live.length);
  room.hands = new Map(live.map((p, i) => [p.id, { num: nums[i], hint: "", done: false }]));
  room.order = [];
  room.ready.clear();
  room.result = null;
  room.phase = "hint";
}
// ヒントを出していない人はこのラウンドから外して、並べる段階へ
function toArrange(room) {
  if (room.phase !== "hint") return;
  for (const [id, h] of room.hands) if (!h.done) room.hands.delete(id);
  if (room.hands.size < 2) return toLobby(room);
  room.order = shuffle([...room.hands.keys()]);
  room.ready.clear();
  room.phase = "arrange";
}
// 接続中の参加者が全員ヒントを確定したら並べる段階へ
function checkHints(room) {
  if (room.phase !== "hint") return;
  const ids = activeIds(room);
  if (ids.length && ids.every((id) => room.hands.get(id).done)) toArrange(room);
}
// 接続中の参加者が全員「OK」なら公開
function checkReady(room) {
  if (room.phase !== "arrange") return;
  const ids = activeIds(room);
  if (ids.length && ids.every((id) => room.ready.has(id))) reveal(room);
}
function reveal(room) {
  if (room.phase !== "arrange") return;
  const entries = room.order.map((id) => {
    const h = room.hands.get(id), p = room.players.get(id);
    return { id, name: p ? p.name : "退出した人", hint: h.hint, num: h.num };
  });
  const sorted = entries.map((e) => e.num).sort((a, b) => a - b);
  // その位置に本来来るべき数字と一致していれば正解
  const ok = entries.map((e, i) => e.num === sorted[i]);
  const success = ok.every(Boolean);
  if (success) room.cleared += 1;
  else if (room.maxLives) room.lives = Math.max(0, room.lives - 1);
  const gameOver = !!room.maxLives && room.lives <= 0;
  room.result = { round: room.round, topic: room.topic, entries, ok, success, gameOver };
  room.history.push({ round: room.round, topic: room.topic.name, success, n: entries.length, okN: ok.filter(Boolean).length });
  room.phase = "reveal";
}
function finish(room) {
  room.phase = "finished";
  // 協力ゲームなので順位はなし(パーティーの記録には「遊んだ」だけ残す)
  require("./lobby").report("number", room.code, [...room.players.keys()].map((id) => ({ id, rank: null })));
}

// ---------------------------------------------------------------
// 送信
// ---------------------------------------------------------------
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function view(room, me) {
  const P = room.phase, mine = room.hands.get(me);
  const nameOf = (id) => (room.players.get(id) || {}).name || "退出した人";
  return {
    t: "state", me,
    room: {
      code: room.code, phase: P, round: room.round, gameHostId: hostOf(room),
      maxLives: room.maxLives, lives: room.lives, cleared: room.cleared, topic: room.topic,
      players: order(room).map((p) => {
        const h = room.hands.get(p.id);
        return { id: p.id, name: p.name, connected: connected(p), inRound: !!h,
          done: P === "hint" && !!h && h.done, ready: P === "arrange" && room.ready.has(p.id) };
      }),
      // 自分の数字とヒントだけ。ほかの人の数字は公開まで送らない
      mine: mine ? { num: mine.num, hint: mine.hint, done: mine.done } : null,
      entries: P === "arrange" ? room.order.map((id) => ({ id, name: nameOf(id), hint: room.hands.get(id).hint })) : null,
      result: P === "reveal" || P === "finished" ? room.result : null,
      history: P === "finished" ? room.history : null,
    },
  };
}
function broadcast(room) {
  for (const p of room.players.values()) for (const ws of p.sockets) send(ws, view(room, p.id));
}
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
  // 残りの全員がそろっていれば先へ進める
  checkHints(room);
  checkReady(room);
  broadcast(room);
}
function removePlayer(room, pid) {
  if (!room.players.has(pid)) return;
  room.players.delete(pid);
  room.hands.delete(pid);
  room.ready.delete(pid);
  room.order = room.order.filter((id) => id !== pid);
  if (room.players.size < 2 && room.phase !== "lobby") toLobby(room);
  else if (room.phase === "arrange" && room.hands.size < 2) toLobby(room);
  else { checkHints(room); checkReady(room); }
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
      p = { id: pid, token, name, joinedAt: Date.now(), sockets: new Set() };
      room.players.set(pid, p);
    }
    if (ws.room) detach(ws);
    p.name = name;
    p.sockets.add(ws);
    ws.room = room; ws.pid = pid;
    room.emptySince = null;
    send(ws, { t: "joined", room: code });
    return broadcast(room);
  }

  const room = ws.room;
  const p = room && room.players.get(ws.pid);
  if (!p) return err(ws, "部屋に入っていません");
  const isGM = p.id === hostOf(room);   // ゲームのホスト
  const mine = room.hands.get(p.id);     // このラウンドの自分の手札(観戦中は無し)
  // 設定・進行の管理系はホストだけ
  if (["setLives", "start", "reroll", "setTopic", "closeHints", "revealNow", "endGame", "reset", "kick"].includes(m.t) && !isGM)
    return err(ws, "この操作はホストだけができます");

  switch (m.t) {
    case "leave":
      ws.room = null;
      p.sockets.delete(ws);
      return removePlayer(room, p.id);
    case "kick": {
      // ホストがほかのプレイヤーを退出させる
      if (m.id === p.id) return;
      const target = room.players.get(m.id);
      if (!target) return;
      for (const s of target.sockets) { send(s, { t: "kicked" }); s.room = null; }
      target.sockets.clear();
      return removePlayer(room, target.id);
    }
    case "setLives":
      if (room.phase === "lobby" && LIVES.includes(m.lives)) room.maxLives = m.lives;
      break;
    case "start": {
      if (room.phase !== "lobby") return;
      if (order(room).filter(connected).length < 2) return err(ws, "2人以上でスタートできます");
      Object.assign(room, { round: 0, lives: room.maxLives, cleared: 0, history: [], recent: [] });
      startRound(room);
      break;
    }
    case "hint": {
      if (room.phase !== "hint" || !mine) return;
      const w = cleanStr(m.hint, HINT_MAX);
      if (!w) return err(ws, "ヒントを入れてください");
      mine.hint = w; mine.done = true;
      checkHints(room);
      break;
    }
    case "unhint":
      // 「変更する」: 並べる段階に進む前なら確定を取り消せる
      if (room.phase !== "hint" || !mine) return;
      mine.done = false;
      break;
    case "reroll":
      // お題を引き直す。前のお題で書いたヒントは使えないので消す
      if (room.phase !== "hint") return;
      room.topic = pickTopic(room);
      clearHints(room);
      break;
    case "setTopic": {
      // ホストが自由にお題を決める(この部屋のこのラウンドだけ)
      if (room.phase !== "hint") return;
      const name = cleanStr(m.name, TOPIC_MAX);
      if (!name) return err(ws, "お題を入れてください");
      room.topic = { name, low: cleanStr(m.low, SCALE_MAX) || "小さい", high: cleanStr(m.high, SCALE_MAX) || "大きい", custom: true };
      clearHints(room);
      break;
    }
    case "closeHints":
      // ヒント待ちを打ち切る(まだ出していない人はこのラウンドは観戦)
      toArrange(room);
      break;
    case "move": {
      // 並べ替え: 誰が動かしても全員の画面に反映。動いたら全員のOKを取り消す
      if (room.phase !== "arrange" || !mine) return;
      const from = room.order.indexOf(m.id), to = m.to;
      if (from < 0 || !Number.isInteger(to) || to < 0 || to >= room.order.length || from === to) return;
      room.order.splice(to, 0, room.order.splice(from, 1)[0]);
      room.ready.clear();
      break;
    }
    case "ready":
      if (room.phase !== "arrange" || !mine) return;
      if (m.on) room.ready.add(p.id); else room.ready.delete(p.id);
      checkReady(room);
      break;
    case "revealNow":
      reveal(room);
      break;
    case "next":
      if (room.phase !== "reveal") return;
      if (room.result && room.result.gameOver) finish(room);
      else startRound(room);
      break;
    case "endGame":
      if (room.phase !== "reveal") return;
      finish(room);
      break;
    case "again":
      // 結果画面の「もう一度遊ぶ」(誰でも押せる)
      if (room.phase !== "finished") return;
      toLobby(room);
      break;
    case "reset":
      toLobby(room);
      break;
    default:
      return;
  }
  broadcast(room);
}

// ---------------------------------------------------------------
// WebSocket(server.js の upgrade から WS_PATH の接続だけが回ってくる)
// ---------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.budget = 40;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (buf) => {
    if (--ws.budget < 0) return; // 送りすぎは捨てる
    let m;
    try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m.t !== "string") return;
    try { handle(ws, m); } catch (e) { console.error("かくれナンバー 処理エラー:", e); }
  });
  ws.on("close", () => detach(ws));
});

// 送信回数の予算回復・切れた接続の掃除・空き部屋の削除
setInterval(() => { for (const ws of wss.clients) ws.budget = Math.min(40, ws.budget + 20); }, 1000);
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, PING_MS);
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms)
    if (room.emptySince && now - room.emptySince > ROOM_IDLE_MS) rooms.delete(code);
}, 60000);

module.exports = { WS_PATH, wss, TOPICS, rooms };
