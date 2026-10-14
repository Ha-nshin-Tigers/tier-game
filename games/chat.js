"use strict";
// 文字チャット(/chat/ws) — 全ゲーム・パーティー共通。画面(ゲーム名)と部屋コードの組ごとに、短い文をやりとりする。
// ゲームの中身とは関係なく、public/js/partybar.js のチャット欄からつながる。

const { WebSocketServer } = require("ws");

const WS_PATH = "/chat/ws";
const MAX_LEN = 80, KEEP = 40, GAP_MS = 800, ROOM_IDLE_MS = 60 * 60 * 1000, MAX_ROOMS = 2000;
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => typeof s === "string" ? s.replace(BAD_CHARS, "").trim().slice(0, max) : "";

const rooms = new Map(); // key("heat:ABCD") → { sockets: Set, log: [], emptySince }
// その部屋のメンバーか確かめる関数(server.js が渡す)。(page, code, pid, token) → メンバーの名前 か null
let verify = null;
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

function handle(ws, m) {
  if (m.t === "join") {
    const key = typeof m.key === "string" && /^[a-z]{2,12}:[A-Z0-9]{4,6}$/.test(m.key) ? m.key : null;
    const pid = typeof m.pid === "string" && /^[a-z0-9]{8,32}$/.test(m.pid) ? m.pid : null;
    const token = typeof m.token === "string" ? m.token : "";
    if (!key || !pid) return;
    // 部屋のメンバーだけが読み書きできる。名前は部屋に登録された名前を使う(なりすまし防止)
    const [page, code] = key.split(":");
    const known = verify ? verify(page, code, pid, token) : null;
    if (verify && !known) return send(ws, { t: "denied" });
    const name = known || cleanStr(m.name, 12) || "だれか";
    if (ws.room) leave(ws);
    let room = rooms.get(key);
    if (!room) { if (rooms.size >= MAX_ROOMS) return; room = { sockets: new Set(), log: [], emptySince: null }; rooms.set(key, room); }
    room.sockets.add(ws); room.emptySince = null;
    ws.room = room; ws.pid = pid; ws.name = name; ws.key = key; ws.token = token;
    return send(ws, { t: "log", log: room.log });
  }
  if (m.t === "say" && ws.room) {
    const text = cleanStr(m.text, MAX_LEN);
    if (!text) return;
    const now = Date.now();
    if (now - (ws.last || 0) < GAP_MS) return; // 連投しすぎは捨てる
    ws.last = now;
    if (!verify && typeof m.name === "string") ws.name = cleanStr(m.name, 12) || ws.name;
    else if (verify) { const [page, code] = ws.key.split(":"); const nm = verify(page, code, ws.pid, ws.token); if (!nm) return; ws.name = nm; } // 名前を変えたら追いつく・外された人は書けない
    const msg = { pid: ws.pid, name: ws.name, text, at: now };
    ws.room.log.push(msg); if (ws.room.log.length > KEEP) ws.room.log.shift();
    for (const s of ws.room.sockets) send(s, { t: "msg", msg });
  }
}
function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.sockets.delete(ws); ws.room = null;
  if (!room.sockets.size) room.emptySince = Date.now();
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 });
wss.on("connection", (ws) => {
  ws.isAlive = true; ws.budget = 20;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (buf) => {
    if (--ws.budget < 0) return;
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m.t !== "string") return;
    try { handle(ws, m); } catch (e) { console.error("チャット 処理エラー:", e); }
  });
  ws.on("close", () => leave(ws));
});
setInterval(() => { for (const ws of wss.clients) ws.budget = Math.min(20, ws.budget + 5); }, 1000);
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);
setInterval(() => { const now = Date.now(); for (const [k, r] of rooms) if (r.emptySince && now - r.emptySince > ROOM_IDLE_MS) rooms.delete(k); }, 60000);

module.exports = { WS_PATH, wss, setVerify: (f) => { verify = f; } };
