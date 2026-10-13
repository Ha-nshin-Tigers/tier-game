"use strict";
// パーティー(/lobby) — 先にみんなで集まってから、ホストが選んだゲームへ全員でいっしょに移動する。
// ゲームの中身は持たない。メンバー・ホスト・「いま遊ぶゲーム」だけを覚えて配る。
// 各ゲームの画面は public/js/partybar.js でこのサーバにつながり、ホストが次のゲームを選ぶと自動で移動する。

const { WebSocketServer } = require("ws");

const WS_PATH = "/lobby/ws";
const MAX_ROOMS = 500, MAX_MEMBERS = 16;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000; // だれもつながっていない状態が3時間続いたら片づける
// 移動先のゲーム。code はゲームの部屋コードの後ろにつける2文字(パーティーのコード4文字+2文字=6文字)
const GAMES = [
  ["tier", "みんなでティア表", "TI", 2, 12], ["number", "かくれナンバー", "NU", 2, 12], ["liar", "ウソつき酒場", "LI", 2, 6], ["shotgun", "散弾ルーレット", "SG", 2, 6],
  ["insider", "インサイダー", "IN", 4, 8], ["coyote", "コヨーテ", "CO", 2, 10], ["guessclub", "ゲスクラブ", "GC", 2, 8], ["matchy", "マッチィマッチ", "MM", 3, 8],
  ["eshiri", "絵しりとり", "ES", 2, 8], ["challengers", "チャレンジャーズ", "CH", 2, 8], ["eldorado", "エルドラドを目指して", "EL", 2, 4], ["heat", "ヒート", "HE", 2, 6],
  ["monopoly", "不動産王", "MO", 2, 8], ["citychase", "シティチェイス", "CC", 2, 4], ["mortar", "モーターメイヘム", "MT", 1, 8],
  ["bridge", "ひとりじめ橋", "BR", 2, 8], ["bomb", "爆弾回し", "BO", 2, 8], ["memory", "おぼえて料理", "ME", 2, 8], ["party", "ドタバタ大会", "PA", 2, 8],
].map(([key, name, suffix, min, max]) => ({ key, name, suffix, min, max }));
const GAME = Object.fromEntries(GAMES.map((g) => [g.key, g]));

const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => typeof s === "string" ? s.replace(BAD_CHARS, "").trim().slice(0, max) : "";

const rooms = new Map();
const connected = (p) => p && p.sockets.size > 0;
const order = (room) => [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
const hostOf = (room) => (order(room).find(connected) || order(room)[0] || {}).id || null;

function view(room, me) {
  return {
    t: "state", me,
    room: {
      code: room.code, host: hostOf(room), game: room.game, games: GAMES,
      members: order(room).map((p) => ({ id: p.id, name: p.name, connected: connected(p), where: connected(p) ? p.where : null })),
    },
  };
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room) { for (const p of room.members.values()) for (const ws of p.sockets) send(ws, view(room, p.id)); }
const err = (ws, msg) => send(ws, { t: "error", msg });
function detach(ws) {
  const room = ws.room;
  if (!room) return;
  const p = room.members.get(ws.pid);
  if (p) p.sockets.delete(ws);
  ws.room = null;
  if (![...room.members.values()].some(connected)) room.emptySince = Date.now();
  broadcast(room);
}

function handle(ws, m) {
  if (m.t === "join") {
    const code = String(m.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const name = cleanStr(m.name, 12);
    const pid = typeof m.pid === "string" && /^[a-z0-9]{8,32}$/.test(m.pid) ? m.pid : null;
    const token = typeof m.token === "string" && /^[a-z0-9]{16,64}$/.test(m.token) ? m.token : null;
    if (code.length !== 4) return err(ws, "パーティーのコードは4文字の英数字です");
    if (!name) return err(ws, "ニックネームを入れてください");
    if (!pid || !token) return err(ws, "ページを再読み込みしてください");
    let room = rooms.get(code);
    if (!room) {
      if (m.create === false) return err(ws, "そのパーティーは見つかりませんでした(コードを確かめてください)");
      if (rooms.size >= MAX_ROOMS) return err(ws, "パーティーがいっぱいです。しばらくしてから試してください");
      room = { code, members: new Map(), game: null, seq: 0, emptySince: null };
      rooms.set(code, room);
    }
    let p = room.members.get(pid);
    if (p && p.token !== token) return err(ws, "このパーティーに入れませんでした。ページを再読み込みしてください");
    if (!p) {
      if (room.members.size >= MAX_MEMBERS) return err(ws, "このパーティーは満員です");
      p = { id: pid, token, name, joinedAt: Date.now(), sockets: new Set(), where: null };
      room.members.set(pid, p);
    }
    if (ws.room) detach(ws);
    p.name = name; p.sockets.add(ws); p.where = typeof m.where === "string" && GAME[m.where] ? m.where : null;
    ws.room = room; ws.pid = pid; room.emptySince = null;
    send(ws, { t: "joined", room: code });
    return broadcast(room);
  }
  const room = ws.room, p = room && room.members.get(ws.pid);
  if (!p) return err(ws, "パーティーに入っていません");
  switch (m.t) {
    case "pick": {
      // 次のゲーム(ホストだけ)。全員の画面がそのゲームの部屋へ移動する
      if (p.id !== hostOf(room)) return err(ws, "次のゲームを選べるのはホストだけです");
      const g = GAME[m.game];
      if (!g) return;
      room.seq++;
      room.game = { key: g.key, name: g.name, path: "/" + g.key, roomCode: room.code + g.suffix, seq: room.seq, by: p.id };
      break;
    }
    case "lobby":
      // ホスト: みんなでパーティーの画面へ戻る
      if (p.id !== hostOf(room)) return err(ws, "この操作はホストだけができます");
      room.seq++;
      room.game = { key: null, name: "パーティーの画面", path: "/lobby", roomCode: room.code, seq: room.seq, by: p.id };
      break;
    case "where":
      p.where = typeof m.where === "string" && GAME[m.where] ? m.where : null;
      break;
    case "leave":
      room.members.delete(p.id);
      ws.room = null;
      if (!room.members.size) { rooms.delete(room.code); return; }
      break;
    default:
      return;
  }
  broadcast(room);
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
wss.on("connection", (ws) => {
  ws.isAlive = true; ws.budget = 30;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (buf) => {
    if (--ws.budget < 0) return;
    let m;
    try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m.t !== "string") return;
    try { handle(ws, m); } catch (e) { console.error("パーティー 処理エラー:", e); }
  });
  ws.on("close", () => detach(ws));
});
setInterval(() => { for (const ws of wss.clients) ws.budget = Math.min(30, ws.budget + 10); }, 1000);
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);
setInterval(() => { const now = Date.now(); for (const [code, room] of rooms) if (room.emptySince && now - room.emptySince > ROOM_IDLE_MS) rooms.delete(code); }, 60000);

module.exports = { WS_PATH, wss, GAMES, _t: { rooms, handle } };
