"use strict";
// コヨーテ(Coyote 風) — ゲームサーバ(/coyote)
// ルール本体は games/mini/coyote.js。ここは部屋・入室・設定・結果だけを受け持つ。

const { WebSocketServer } = require("ws");
const core = require("./mini/coyote");

const WS_PATH = "/coyote/ws";
const MIN_PLAYERS = 2, MAX_PLAYERS = 10, MAX_ROOMS = 500;
const STAMPS = ["コヨーテ！", "ほんとに？", "信じて", "顔に出てる", "ナイス", "ごめん", "急いで！", "w"];
const STAMP_GAP_MS = 1200;
const ROOM_IDLE_MS = 30 * 60 * 1000;

const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => typeof s === "string" ? s.replace(BAD_CHARS, "").trim().slice(0, max) : "";

const rooms = new Map();
function newRoom(code) {
  return {
    code, phase: "lobby", players: new Map(), roster: [], game: null, ranking: null, timer: null, deadline: 0, emptySince: null,
    settings: core.normalize({}),
  };
}
const connected = (p) => p && p.sockets.size > 0;
const order = (room) => [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
const hostOf = (room) => (order(room).find(connected) || {}).id || null;
const members = (room) => room.roster.filter((id) => room.players.has(id));
const nameOf = (room, id) => (room.players.get(id) || {}).name || "退出した人";

function clearTimer(room) { clearTimeout(room.timer); room.timer = null; room.deadline = 0; }
function setTimer(room, ms, fn) {
  clearTimer(room);
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    room.timer = null; room.deadline = 0;
    // ここで例外が出てもサーバ全体(ほかのゲームの部屋も)が落ちないようにする
    try { fn(); } catch (e) { console.error("コヨーテ タイマー処理エラー:", e); }
    broadcast(room);
  }, ms);
}
function ctxOf(room) {
  return {
    get g() { return room.game; },
    set g(v) { room.game = v; },
    members: () => members(room),
    live: () => members(room).filter((id) => connected(room.players.get(id))),
    has: (id) => room.players.has(id),
    nameOf: (id) => nameOf(room, id),
    setTimer: (ms, fn) => setTimer(room, ms, fn),
    clearTimer: () => clearTimer(room),
    finish: (raw) => finish(room, raw),
  };
}
function finish(room, raw) {
  clearTimer(room);
  const rows = Object.entries(raw).map(([id, v]) => ({ id, raw: v, name: nameOf(room, id) })).sort((a, b) => b.raw - a.raw);
  rows.forEach((r, i) => { r.rank = i > 0 && r.raw === rows[i - 1].raw ? rows[i - 1].rank : i + 1; });
  room.ranking = rows;
  room.phase = "finished";
  require("./lobby").report("coyote", room.code, rows); // パーティーの通算成績へ
}
function toLobby(room) {
  clearTimer(room);
  Object.assign(room, { phase: "lobby", roster: [], game: null, ranking: null });
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function view(room, me) {
  return {
    t: "state", me, now: Date.now(),
    room: {
      code: room.code, phase: room.phase, gameHostId: hostOf(room), settings: room.settings, deadline: room.deadline,
      players: order(room).map((p) => ({ id: p.id, name: p.name, connected: connected(p), inGame: room.roster.includes(p.id) })),
      roster: members(room),
      game: room.game && room.phase !== "lobby" ? core.view(ctxOf(room), me) : null,
      ranking: room.phase === "finished" ? room.ranking : null,
      stamps: STAMPS,
    },
  };
}
function broadcast(room) { for (const p of room.players.values()) for (const ws of p.sockets) send(ws, view(room, p.id)); }
function broadcastRaw(room, msg) { for (const p of room.players.values()) for (const ws of p.sockets) send(ws, msg); }
const err = (ws, msg) => send(ws, { t: "error", msg });

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
  room.players.delete(pid);
  // 抜けた人は破産扱い(残りが1人になればその人の勝ち)
  if (room.phase === "play") core.onLeave(ctxOf(room), pid);
  if (room.phase === "play" && members(room).length < MIN_PLAYERS) toLobby(room);
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
      // 遊べるのは10人まで。ゲーム中でも観戦として入れるように少し余裕を持たせる
      if (room.players.size >= MAX_PLAYERS + 4) return err(ws, "この部屋は満員です");
      p = { id: pid, token, name, joinedAt: Date.now(), sockets: new Set(), lastStamp: 0 };
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
  if (["settings", "start", "reset", "kick"].includes(m.t) && !isGM) return err(ws, "この操作はホストだけができます");

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
    case "settings":
      // ライフ・持ち時間・特殊カード(値の検証はルール本体の normalize で行う)
      if (room.phase !== "lobby" || !m.s || typeof m.s !== "object") return;
      room.settings = core.normalize({ ...room.settings, ...m.s });
      break;
    case "start": {
      if (room.phase !== "lobby") return;
      const live = order(room).filter(connected);
      if (live.length < MIN_PLAYERS) return err(ws, `${MIN_PLAYERS}人以上でスタートできます`);
      room.roster = live.slice(0, MAX_PLAYERS).map((x) => x.id);
      room.ranking = null;
      room.phase = "play";
      core.start(ctxOf(room), room.settings);
      if (live.length > MAX_PLAYERS) send(ws, { t: "info", msg: `遊べるのは${MAX_PLAYERS}人までです。先に入った${MAX_PLAYERS}人で始めました(ほかの人は観戦)` });
      break;
    }
    case "game": {
      if (room.phase !== "play" || typeof m.a !== "string") return;
      if (!room.roster.includes(p.id)) return;
      const e = core.handle(ctxOf(room), p.id, m);
      if (typeof e === "string") return err(ws, e);
      break;
    }
    case "stamp": {
      // 一言スタンプ: その場で全員に流すだけ
      const i = Number.isInteger(m.i) ? m.i : -1;
      if (i < 0 || i >= STAMPS.length) return;
      const now = Date.now();
      if (now - p.lastStamp < STAMP_GAP_MS) return;
      p.lastStamp = now;
      return broadcastRaw(room, { t: "stamp", from: p.id, i });
    }
    case "again":
      // 結果から待機画面へ
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

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.budget = 60;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (buf) => {
    if (--ws.budget < 0) return; // 送りすぎは捨てる
    let m;
    try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m.t !== "string") return;
    try { handle(ws, m); } catch (e) { console.error("コヨーテ 処理エラー:", e); }
  });
  ws.on("close", () => detach(ws));
});
setInterval(() => { for (const ws of wss.clients) ws.budget = Math.min(60, ws.budget + 30); }, 1000);
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
