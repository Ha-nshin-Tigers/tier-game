"use strict";
// ウソつき酒場 — ゲームサーバ(カードのブラフ+ロシアンルーレット)
// 手札・リボルバーの弾の位置はサーバだけが持ち、手札は本人にだけ送る。
// 出されたカードは「ウソつき！」で指摘されたときだけ全員に公開する。

const { WebSocketServer } = require("ws");

const WS_PATH = "/liar/ws";
const MIN_PLAYERS = 2, MAX_PLAYERS = 6, MAX_ROOMS = 500;
const HAND = 5;                   // 1ラウンドに配る枚数
const CHAMBERS = 6;               // リボルバーの弾倉の数(1発だけ実弾)
const RANKS = ["K", "Q", "A"];    // テーブルカードになるもの。J(ジョーカー)は何にでもなる
const TURN_SECS = [30, 60, 0];    // 手番の制限時間(0 = なし)
const TRIGGER_MS = 20000;         // 引き金を引くまでの待ち時間(過ぎたら自動)
const SHOT_SHOW_MS = 4500;        // 撃った結果を見せてから次のラウンドへ
const STAMP_GAP_MS = 1200;        // スタンプの連打防止
const STAMPS = ["本当だって", "怪しい…", "信じて！", "ウソつき！", "ドキドキ", "やめて〜", "勝負！", "ナイス", "ごめん", "w"];
const ROOM_IDLE_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------
// 制御文字・見えない書式文字を取り除く
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => typeof s === "string" ? s.replace(BAD_CHARS, "").trim().slice(0, max) : "";
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const rand = (n) => Math.floor(Math.random() * n);
// 山札: 4人までは20枚(K/Q/A 各6・ジョーカー2)、5人以上は30枚(各9・ジョーカー3)
function makeDeck(n) {
  const k = n <= 4 ? 6 : 9, j = n <= 4 ? 2 : 3, deck = [];
  let id = 0;
  for (const r of RANKS) for (let i = 0; i < k; i++) deck.push({ id: "c" + id++, r });
  for (let i = 0; i < j; i++) deck.push({ id: "c" + id++, r: "J" });
  return shuffle(deck);
}

// ---------------------------------------------------------------
// 部屋とゲーム進行
// phase: lobby → play(手番で出す/指摘する) → reveal(公開して引き金を待つ) → shot(撃った結果) → play … → finished
// ---------------------------------------------------------------
const rooms = new Map();

function newRoom(code) {
  return {
    code, phase: "lobby", round: 0, turnSecs: 60,
    players: new Map(),
    seats: [],          // このゲームの参加者 pid(席順)
    tableRank: null, lastPlay: null, pile: 0, turnId: null, deadline: 0, timer: null,
    reveal: null, shot: null, winner: null, log: [], emptySince: null,
  };
}
const connected = (p) => p && p.sockets.size > 0;
const order = (room) => [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
// ゲームのホスト: いちばん早く入った、接続中の人。抜けたら次の人に自動で移る
const hostOf = (room) => (order(room).find(connected) || {}).id || null;
const seat = (room, id) => room.players.get(id);
const alive = (room) => room.seats.filter((id) => seat(room, id) && seat(room, id).alive);
function pushLog(room, text) { room.log.push(text); if (room.log.length > 30) room.log.shift(); }
function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : "退出した人"; }

// id の次の席の、生きている人(cond を満たす人)。見つからなければ null
function nextSeat(room, id, cond = () => true) {
  const s = room.seats, i = s.indexOf(id);
  for (let k = 1; k <= s.length; k++) {
    const q = s[(Math.max(i, 0) + k) % s.length];
    const p = seat(room, q);
    if (p && p.alive && cond(p)) return q;
  }
  return null;
}

function clearTimer(room) { clearTimeout(room.timer); room.timer = null; room.deadline = 0; }
function setTimer(room, ms, fn) {
  clearTimer(room);
  if (!ms) return;
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    room.timer = null;
    // ここで例外が出てもサーバ全体(ほかのゲームの部屋も)が落ちないようにする
    try { fn(); } catch (e) { console.error("ウソつき酒場 タイマー処理エラー:", e); }
    broadcast(room);
  }, ms);
}

function toLobby(room) {
  clearTimer(room);
  Object.assign(room, { phase: "lobby", seats: [], tableRank: null, lastPlay: null, pile: 0, turnId: null, reveal: null, shot: null, winner: null });
  for (const p of room.players.values()) Object.assign(p, { alive: false, hand: [], bullet: 0, pulls: 0 });
}
function startGame(room) {
  const live = order(room).filter(connected).slice(0, MAX_PLAYERS);
  room.seats = live.map((p) => p.id);
  for (const p of room.players.values()) Object.assign(p, { alive: false, hand: [], bullet: 0, pulls: 0 });
  // 弾の位置(1〜6発目のどれか)は各自のリボルバーごとにこっそり決める
  for (const p of live) Object.assign(p, { alive: true, bullet: 1 + rand(CHAMBERS), pulls: 0 });
  room.round = 0; room.log = []; room.winner = null;
  startRound(room, room.seats[rand(room.seats.length)]);
}
function startRound(room, first) {
  const ids = alive(room);
  if (ids.length < 2) return finish(room);
  room.round += 1;
  room.tableRank = RANKS[rand(RANKS.length)];
  const deck = makeDeck(room.seats.length);
  // 途中で抜けた人の席は残っている(席順を保つため)ので、いる人だけ手札を空にする
  for (const id of room.seats) { const p = seat(room, id); if (p) p.hand = []; }
  for (const id of ids) seat(room, id).hand = deck.splice(0, HAND);
  room.lastPlay = null; room.pile = 0; room.reveal = null; room.shot = null;
  room.phase = "play";
  const p = seat(room, first);
  setTurn(room, p && p.alive ? first : nextSeat(room, first));
  pushLog(room, `ラウンド${room.round}: テーブルカードは「${rankName(room.tableRank)}」`);
}
const rankName = (r) => ({ K: "キング", Q: "クイーン", A: "エース", J: "ジョーカー" })[r] || r;

// 手番の人。直前に出した人以外で、手札が残っている次の人。
// ほかに手札を持つ人がいなければ、次の人は指摘するしかない
function responderAfter(room, id) {
  return nextSeat(room, id, (p) => p.id !== id && p.hand.length > 0) || nextSeat(room, id, (p) => p.id !== id);
}
function setTurn(room, id) {
  room.turnId = id;
  setTimer(room, room.turnSecs * 1000, () => autoAct(room));
}
// 時間切れ: 出せるなら1枚出す、出せなければ指摘
function autoAct(room) {
  if (room.phase !== "play") return;
  const p = seat(room, room.turnId);
  if (!p) return;
  if (p.hand.length) play(room, p, [p.hand[rand(p.hand.length)].id], true);
  else callLiar(room, p, true);
}

function play(room, p, ids, auto) {
  const cards = [];
  for (const id of ids) { const c = p.hand.find((x) => x.id === id); if (c && !cards.includes(c)) cards.push(c); }
  if (cards.length < 1 || cards.length > 3 || cards.length !== ids.length) return "1〜3枚選んでください";
  p.hand = p.hand.filter((c) => !cards.includes(c));
  room.lastPlay = { by: p.id, cards, at: Date.now() };
  room.pile += cards.length;
  pushLog(room, `${p.name}: 「${rankName(room.tableRank)}」を${cards.length}枚${auto ? "(時間切れ)" : ""}`);
  setTurn(room, responderAfter(room, p.id));
  return null;
}
function callLiar(room, p, auto) {
  const lp = room.lastPlay;
  if (!lp) return "まだ誰もカードを出していません";
  const honest = lp.cards.every((c) => c.r === room.tableRank || c.r === "J");
  const target = honest ? p.id : lp.by;
  clearTimer(room);
  room.reveal = { caller: p.id, by: lp.by, cards: lp.cards, honest, target, auto: !!auto };
  room.phase = "reveal";
  pushLog(room, `${p.name}: ウソつき！${auto ? "(時間切れ)" : ""} → ${honest ? "本当だった" : "ウソだった"}。${nameOf(room, target)} が引き金を引く`);
  setTimer(room, TRIGGER_MS, () => pull(room, true));
  return null;
}
function pull(room, auto) {
  if (room.phase !== "reveal") return;
  const p = seat(room, room.reveal.target);
  clearTimer(room);
  let died = false;
  if (p && p.alive) {
    p.pulls += 1;
    died = p.pulls >= p.bullet;
    if (died) { p.alive = false; p.hand = []; }
  }
  room.shot = { target: room.reveal.target, died, pulls: p ? p.pulls : 0, auto: !!auto };
  room.phase = "shot";
  pushLog(room, `${nameOf(room, room.reveal.target)}: ${died ? "バン！ 脱落" : "カチッ…セーフ"}(${room.shot.pulls}発目)`);
  // 結果を見せてから次のラウンド。撃たれた人(脱落ならその次の人)から始める
  setTimer(room, SHOT_SHOW_MS, () => {
    if (alive(room).length < 2) return finish(room);
    const t = room.shot.target, tp = seat(room, t);
    startRound(room, tp && tp.alive ? t : nextSeat(room, t));
  });
}
function finish(room) {
  clearTimer(room);
  const a = alive(room);
  room.winner = a.length === 1 ? a[0] : null;
  room.phase = "finished";
  if (room.winner) pushLog(room, `${nameOf(room, room.winner)} の勝ち！`);
  // パーティーの通算成績へ(勝った人だけ1位。ほかの人は順位なし)
  require("./lobby").report("liar", room.code, room.seats.map((id) => ({ id, rank: id === room.winner ? 1 : null })));
}

// 席から人がいなくなった(退出・追い出し)ときの後始末
function dropSeat(room, id) {
  const p = seat(room, id);
  if (!room.seats.includes(id)) return;
  if (room.phase === "lobby" || room.phase === "finished") { room.seats = room.seats.filter((x) => x !== id); return; }
  if (p) { p.alive = false; p.hand = []; }
  if (alive(room).length < 2) return finish(room);
  if (room.phase === "play") {
    // 直前に出した人が抜けたら指摘できないので、その場でラウンドをやり直す
    if (room.lastPlay && room.lastPlay.by === id) return startRound(room, nextSeat(room, id));
    if (room.turnId === id) setTurn(room, room.lastPlay ? responderAfter(room, room.lastPlay.by) : nextSeat(room, id));
  } else if (room.phase === "reveal" && room.reveal.target === id) {
    clearTimer(room);
    startRound(room, nextSeat(room, id));
  }
}

// ---------------------------------------------------------------
// 送信
// ---------------------------------------------------------------
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function view(room, me) {
  const P = room.phase, mine = room.players.get(me);
  const inGame = P !== "lobby";
  const turn = P === "play" && room.turnId === me && mine && mine.alive;
  return {
    t: "state", me, now: Date.now(),
    room: {
      code: room.code, phase: P, round: room.round, gameHostId: hostOf(room), turnSecs: room.turnSecs,
      tableRank: room.tableRank, pile: room.pile, turnId: room.turnId, deadline: room.deadline,
      // 出されたカードは枚数だけ(中身は指摘されるまで秘密)
      lastPlay: room.lastPlay ? { by: room.lastPlay.by, count: room.lastPlay.cards.length } : null,
      players: order(room).map((p) => ({
        id: p.id, name: p.name, connected: connected(p),
        seat: room.seats.indexOf(p.id), alive: inGame ? !!p.alive : false,
        hand: inGame && p.alive ? p.hand.length : 0, pulls: inGame ? p.pulls : 0,
      })),
      seats: room.seats,
      myHand: mine && inGame && mine.alive ? mine.hand : [],
      canPlay: !!turn && mine.hand.length > 0,
      canCall: !!turn && !!room.lastPlay && room.lastPlay.by !== me,
      reveal: P === "reveal" || P === "shot" ? room.reveal : null,
      shot: P === "shot" ? room.shot : null,
      winner: room.winner,
      log: room.log.slice(-8),
      chambers: CHAMBERS, stamps: STAMPS, deckInfo: room.seats.length > 4 ? "30枚(K・Q・A 各9 + ジョーカー3)" : "20枚(K・Q・A 各6 + ジョーカー2)",
    },
  };
}
function broadcast(room) {
  for (const p of room.players.values()) for (const ws of p.sockets) send(ws, view(room, p.id));
}
function broadcastRaw(room, msg) {
  for (const p of room.players.values()) for (const ws of p.sockets) send(ws, msg);
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
  broadcast(room);
}
function removePlayer(room, pid) {
  if (!room.players.has(pid)) return;
  dropSeat(room, pid);
  room.players.delete(pid);
  if (room.players.size < 2 && room.phase !== "lobby") toLobby(room);
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
      // 席は6つ。ゲーム中でも観戦として入れるように少し余裕を持たせる
      if (room.players.size >= MAX_PLAYERS + 4) return err(ws, "この部屋は満員です");
      p = { id: pid, token, name, joinedAt: Date.now(), sockets: new Set(), alive: false, hand: [], bullet: 0, pulls: 0, lastStamp: 0 };
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
  const isGM = p.id === hostOf(room);
  if (["setTurnSecs", "start", "reset", "kick"].includes(m.t) && !isGM) return err(ws, "この操作はホストだけができます");

  switch (m.t) {
    case "leave":
      ws.room = null;
      p.sockets.delete(ws);
      return removePlayer(room, p.id);
    case "kick": {
      if (m.id === p.id) return;
      const target = room.players.get(m.id);
      if (!target) return;
      for (const s of target.sockets) { send(s, { t: "kicked" }); s.room = null; }
      target.sockets.clear();
      return removePlayer(room, target.id);
    }
    case "setTurnSecs":
      if (room.phase === "lobby" && TURN_SECS.includes(m.sec)) room.turnSecs = m.sec;
      break;
    case "start": {
      if (room.phase !== "lobby") return;
      const n = order(room).filter(connected).length;
      if (n < MIN_PLAYERS) return err(ws, `${MIN_PLAYERS}人以上でスタートできます`);
      startGame(room);
      if (n > MAX_PLAYERS) send(ws, { t: "info", msg: `席は${MAX_PLAYERS}つです。先に入った${MAX_PLAYERS}人で始めました(ほかの人は観戦)` });
      break;
    }
    case "play": {
      if (room.phase !== "play" || room.turnId !== p.id || !p.alive) return;
      if (!Array.isArray(m.ids)) return;
      const e = play(room, p, m.ids.filter((x) => typeof x === "string").slice(0, 3));
      if (e) return err(ws, e);
      break;
    }
    case "liar": {
      if (room.phase !== "play" || room.turnId !== p.id || !p.alive) return;
      if (!room.lastPlay || room.lastPlay.by === p.id) return;
      const e = callLiar(room, p);
      if (e) return err(ws, e);
      break;
    }
    case "pull":
      // 引き金は撃たれる本人が引く
      if (room.phase !== "reveal" || room.reveal.target !== p.id) return;
      pull(room);
      break;
    case "stamp": {
      // 一言スタンプ: その場で全員に流すだけ(状態には残さない)
      const i = Number.isInteger(m.i) ? m.i : -1;
      if (i < 0 || i >= STAMPS.length) return;
      const now = Date.now();
      if (now - p.lastStamp < STAMP_GAP_MS) return;
      p.lastStamp = now;
      return broadcastRaw(room, { t: "stamp", from: p.id, i });
    }
    case "again":
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
    try { handle(ws, m); } catch (e) { console.error("ウソつき酒場 処理エラー:", e); }
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
}, 30000);
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms)
    if (room.emptySince && now - room.emptySince > ROOM_IDLE_MS) { clearTimer(room); rooms.delete(code); }
}, 60000);

module.exports = { WS_PATH, wss };
