"use strict";
// ボムバナナ(BOMBANANA! 風) — ゲームサーバ(/bombanana)
// ルール本体は games/mini/bombanana.js。ここは部屋・入室・設定・結果だけを受け持つ。

const { WebSocketServer } = require("ws");
const core = require("./mini/bombanana");

const WS_PATH = "/bombanana/ws";
const MIN_PLAYERS = 3, MAX_PLAYERS = 3, MAX_ROOMS = 500;
const STAMPS = ["ナイス！", "まって！", "急いで！", "ごめん", "どれ？", "もう一回", "やばい", "w"];
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
    try { fn(); } catch (e) { console.error("ボムバナナ タイマー処理エラー:", e); }
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
    sendTo: (id, msg) => { const p = room.players.get(id); if (p) for (const ws of p.sockets) send(ws, msg); },
  };
}
function finish(room, raw) {
  clearTimer(room);
  // 協力ゲーム: 全員同じ結果。解除成功なら全員1位扱い、爆発・エンドレスは順位なし(0点)
  const g = room.game, ok = !!(g && g.result && g.result.ok), endless = g && g.cfg.mode === "endless";
  const rows = Object.entries(raw).map(([id, v]) => ({ id, raw: v, name: nameOf(room, id), rank: ok && !endless ? 1 : null }));
  room.ranking = rows;
  room.phase = "finished";
  const note = !g ? "" : endless ? `エンドレス ${g.score || 0}点` : `${g.cfg.mode === "campaign" ? "レベル" + g.level + " " : ""}${ok ? "解除成功" : "爆発"}`;
  require("./lobby").report("bombanana", room.code, rows, note); // パーティーの通算成績へ
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
      code: room.code, phase: room.phase, gameHostId: hostOf(room), settings: { ...room.settings, roles: Object.fromEntries(Object.entries(room.settings.roles).filter(([id]) => connected(room.players.get(id)))) }, deadline: room.deadline,
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
  if (room.settings.roles[pid]) { const roles = { ...room.settings.roles }; delete roles[pid]; room.settings = core.normalize({ ...room.settings, roles }); }
  // 抜けた人は手番から外す(だれもいなくなったら待機画面へ)
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
      // 遊べるのは3人(ほかの人は観戦)。ゲーム中でも観戦として入れるように少し余裕を持たせる
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
    send(ws, { t: "db", mods: core.MODULES, campaign: core.CAMPAIGN.map(([secs, mistakes, mods, chaos]) => ({ secs, mistakes, mods, chaos })), emotes: core.EMOTES, roleName: core.ROLE_NAME });
    return broadcast(room);
  }

  const room = ws.room;
  const p = room && room.players.get(ws.pid);
  if (!p) return err(ws, "部屋に入っていません");
  const isGM = p.id === hostOf(room);
  if (["settings", "start", "reset", "kick", "randomRoles"].includes(m.t) && !isGM) return err(ws, "この操作はホストだけができます");

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
      // モード・レベル・カスタムの設定(値の検証はルール本体の normalize で行う)。役割の希望は各自が "role" で送る
      if (room.phase !== "lobby" || !m.s || typeof m.s !== "object") return;
      room.settings = core.normalize({ ...room.settings, ...m.s, roles: room.settings.roles });
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
    case "role": {
      // 自分の役割の希望(待機画面で)。同じ役割の人がいたら、その人の希望は外れる
      if (room.phase !== "lobby") return;
      const ro = core.ROLES.includes(m.role) ? m.role : null, roles = { ...room.settings.roles };
      for (const [id, r] of Object.entries(roles)) if (r === ro || id === p.id) delete roles[id];
      if (ro) roles[p.id] = ro;
      room.settings = core.normalize({ ...room.settings, roles });
      break;
    }
    case "randomRoles": {
      // ランダムロールボタン(ホスト): 入っている人に役割をランダムに割り振る
      if (room.phase !== "lobby") return;
      const live = order(room).filter(connected).slice(0, 3), ros = [...core.ROLES].sort(() => Math.random() - 0.5), roles = {};
      live.forEach((x, i) => { roles[x.id] = ros[i]; });
      room.settings = core.normalize({ ...room.settings, roles });
      break;
    }
    case "rtc": {
      // ボイスチャットの接続情報の中継。声が届く組み合わせ(話す人→聞く人)のあいだだけ
      const g = room.game;
      if (!g || room.phase !== "play" || !g.role[p.id] || !g.role[m.to] || typeof m.data !== "object" || !m.data) return;
      const a = g.role[p.id], b = g.role[m.to];
      if (!((core.HEARS[b] || []).includes(a) || (core.HEARS[a] || []).includes(b))) return;
      const target = room.players.get(m.to);
      if (target) for (const s of target.sockets) send(s, { t: "rtc", from: p.id, data: m.data });
      return;
    }
    case "game": {
      if (typeof m.a !== "string") return;
      // 結果画面から次の爆弾へ(キャンペーンは次のレベル・失敗なら同じレベル)
      if (m.a === "next" && room.phase === "finished" && room.game && room.roster.includes(p.id)) { room.phase = "play"; room.ranking = null; core.handle(ctxOf(room), p.id, m); break; }
      if (room.phase !== "play") return;
      if (!room.roster.includes(p.id)) return;
      const e = core.handle(ctxOf(room), p.id, m);
      if (typeof e === "string") return err(ws, e);
      if (e && e.manual) { for (const s of p.sockets) send(s, { t: "manual", data: e.manual }); return; }
      if (e && e.say) {
        // 声(文字): 聞こえる人にだけ届ける
        for (const id of e.say.to) { const t = room.players.get(id); if (t) for (const s of t.sockets) send(s, { t: "say", from: p.id, text: e.say.text }); }
        for (const s of p.sockets) send(s, { t: "say", from: p.id, text: e.say.text, self: true });
        return;
      }
      if (m.a === "touch" || m.a === "point") return; // 触る・指差しは次の定期送信で配る(送りすぎ防止)
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
    try { handle(ws, m); } catch (e) { console.error("ボムバナナ 処理エラー:", e); }
  });
  ws.on("close", () => detach(ws));
});
setInterval(() => { for (const ws of wss.clients) ws.budget = Math.min(60, ws.budget + 30); }, 1000);
// 0.25秒ごと: 時間・カオス・環境ギミックを進めて、遊んでいる部屋に配る
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase !== "play" || !room.game) continue;
    try { core.tick(ctxOf(room)); } catch (e) { console.error("ボムバナナ 進行エラー:", e); }
    broadcast(room);
  }
}, 250);
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

module.exports = { WS_PATH, wss, rooms };
