"use strict";
// ミニゲーム集 — 3種のミニゲームを、単独で(/bridge /bomb /memory)、または
// 好きな順番で並べた大会(/party「ドタバタ大会」)として遊ぶ。順位点の合計で競う
//   ひとりじめ橋: こっそり橋を選ぶ。かぶった橋は崩れて0点
//   爆弾回し    : 爆発の時刻はサーバだけが知る。爆発したときに持っていた人が脱落
//   おぼえて料理: 材料を覚えて、並んだ食材から正しく選ぶ
// 秘密の情報(ほかの人の選択・爆発時刻・入力中のレシピ)は公開の段階まで送らない。
// 部屋は遊び方(mode)ごとに別。同じ部屋コードでも橋と爆弾は別の部屋になる。

const { WebSocketServer } = require("ws");
// 大会で遊べるほかのゲーム(大会版)。1ゲーム=1ファイルで、start / handle / view / onLeave を持つ
const MINI = {
  tier: require("./mini/tier"),
  liar: require("./mini/liar"),
  number: require("./mini/number"),
  shotgun: require("./mini/shotgun"),
  eshiri: require("./mini/eshiri"),
};

const WS_PATH = "/party/ws";
const MIN_PLAYERS = 2, MAX_PLAYERS = 8, MAX_ROOMS = 500;
const SINGLE_GAMES = ["bridge", "bomb", "memory"];  // 単独のページ(/bridge など)でも遊べるミニゲーム
const GAMES = [...SINGLE_GAMES, ...Object.keys(MINI)]; // 大会で並べられるゲーム
const MODES = ["party", ...SINGLE_GAMES];    // party = 大会。それ以外はそのゲームだけを繰り返し遊ぶ
const DEFAULT_PLAYLIST = ["bridge", "bomb", "memory"];
const MAX_PLAYLIST = 9;                      // 大会で並べられる試合数
const RANK_PTS = [10, 7, 5, 3, 2, 1, 1, 1]; // ゲームごとの順位点(同点は上の順位の点)
const INTRO_MS = 7000;   // ゲーム紹介を見せる時間
const RESULT_MS = 15000; // 順位発表のあと自動で次へ
const ROOM_IDLE_MS = 30 * 60 * 1000;

// ひとりじめ橋
const BRIDGE_ROUNDS = 3, BRIDGE_PICK_MS = 15000, BRIDGE_SHOW_MS = 6000;
// 爆弾回し
const FUSE_MIN_MS = 9000, FUSE_MAX_MS = 22000; // 爆発までの時間(毎回ランダム・秘密)
const BOMB_HOLD_MS = 700;                      // 受け取ってから渡せるようになるまで
const BOMB_BOOM_MS = 3500;                     // 爆発を見せてから次の爆弾へ
// おぼえて料理
const MEM_LENGTHS = [3, 4, 5], MEM_SHOW_MS = 4000, MEM_INPUT_MS = 15000, MEM_RESULT_MS = 6000, MEM_GRID = 12;
const MEM_SPEED_BONUS = [3, 2, 1]; // 全問正解した人のうち早い順
const INGREDIENTS = [
  ["tomato", "🍅", "トマト"], ["carrot", "🥕", "にんじん"], ["onion", "🧅", "たまねぎ"], ["potato", "🥔", "じゃがいも"],
  ["mushroom", "🍄", "きのこ"], ["corn", "🌽", "とうもろこし"], ["egg", "🥚", "たまご"], ["cheese", "🧀", "チーズ"],
  ["fish", "🐟", "さかな"], ["chicken", "🍗", "とりにく"], ["beef", "🥩", "ぎゅうにく"], ["shrimp", "🍤", "えび"],
  ["broccoli", "🥦", "ブロッコリー"], ["eggplant", "🍆", "なす"], ["lemon", "🍋", "レモン"], ["apple", "🍎", "りんご"],
  ["banana", "🍌", "バナナ"], ["strawberry", "🍓", "いちご"], ["bread", "🍞", "パン"], ["rice", "🍚", "ごはん"],
  ["milk", "🥛", "ぎゅうにゅう"], ["butter", "🧈", "バター"], ["pepper", "🌶️", "とうがらし"], ["garlic", "🧄", "にんにく"],
].map(([id, icon, name]) => ({ id, icon, name }));
const ING_IDS = new Set(INGREDIENTS.map((x) => x.id));

// ---------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------
// 制御文字・見えない書式文字を取り除く
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => typeof s === "string" ? s.replace(BAD_CHARS, "").trim().slice(0, max) : "";
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const rand = (n) => Math.floor(Math.random() * n);

// ---------------------------------------------------------------
// 部屋と進行
// phase: lobby → intro(ゲーム紹介) → play(ミニゲーム) → result(そのゲームの順位) → intro … → final(総合結果)
// ---------------------------------------------------------------
const rooms = new Map();

function newRoom(code, mode) {
  return {
    code, mode, phase: "lobby", playlist: [...DEFAULT_PLAYLIST],
    players: new Map(),
    roster: [],        // このゲームの参加者 pid(開始時に接続していた人)
    seq: [], gi: 0,    // 遊ぶゲームの順番と、いま何番目か
    total: {},         // 合計の順位点(単独ゲームは「もう一度」をまたいで通算)
    game: null,        // いま遊んでいるミニゲームの状態
    result: null,      // 直前のミニゲームの順位発表
    timer: null, deadline: 0, emptySince: null,
  };
}
const connected = (p) => p && p.sockets.size > 0;
const order = (room) => [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
// ゲームのホスト: いちばん早く入った、接続中の人。抜けたら次の人に自動で移る
const hostOf = (room) => (order(room).find(connected) || {}).id || null;
const nameOf = (room, id) => (room.players.get(id) || {}).name || "退出した人";
// 参加者のうち、まだ部屋にいる人 / そのうち接続中の人
const members = (room) => room.roster.filter((id) => room.players.has(id));
const liveMembers = (room) => members(room).filter((id) => connected(room.players.get(id)));

function clearTimer(room) { clearTimeout(room.timer); room.timer = null; room.deadline = 0; }
function setTimer(room, ms, fn) {
  clearTimer(room);
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    room.timer = null; room.deadline = 0;
    // ここで例外が出てもサーバ全体(ほかのゲームの部屋も)が落ちないようにする
    try { fn(); } catch (e) { console.error("ミニゲーム集 タイマー処理エラー:", e); }
    broadcast(room);
  }, ms);
}

function toLobby(room) {
  clearTimer(room);
  Object.assign(room, { phase: "lobby", roster: [], seq: [], gi: 0, total: {}, game: null, result: null });
}
// keepTotals: 単独ゲームの「もう一度遊ぶ」では通算点を残す
function startParty(room, keepTotals) {
  room.roster = order(room).filter(connected).slice(0, MAX_PLAYERS).map((p) => p.id);
  room.seq = room.mode === "party" ? [...room.playlist] : [room.mode];
  room.gi = 0; room.result = null;
  if (!keepTotals) room.total = {};
  for (const id of room.roster) room.total[id] = room.total[id] || 0;
  intro(room);
}
function intro(room) {
  room.phase = "intro"; room.game = { key: room.seq[room.gi] };
  setTimer(room, INTRO_MS, () => startGame(room));
}
function startGame(room) {
  if (members(room).length < MIN_PLAYERS) return toLobby(room);
  room.phase = "play";
  const key = room.seq[room.gi];
  if (key === "bridge") bridgeStart(room);
  else if (key === "bomb") bombStart(room);
  else if (key === "memory") memoryStart(room);
  else MINI[key].start(ctxOf(room));
}
// 大会版ゲーム(games/mini/)に渡す、部屋の操作の窓口
function ctxOf(room) {
  return {
    get g() { return room.game; },
    set g(v) { room.game = v; },
    members: () => members(room),
    live: () => liveMembers(room),
    has: (id) => room.players.has(id),
    nameOf: (id) => nameOf(room, id),
    setTimer: (ms, fn) => setTimer(room, ms, fn),
    clearTimer: () => clearTimer(room),
    finish: (raw) => finishGame(room, raw),
    // 絵しりとりの絵の線など、特定の人にだけ送るもの
    sendTo: (id, msg) => { const p = room.players.get(id); if (p) for (const ws of p.sockets) send(ws, msg); },
  };
}
// ミニゲームの素点(raw: 大きいほど良い)から順位と順位点を決めて合計に足す
function finishGame(room, raw) {
  clearTimer(room);
  const ids = members(room);
  const rows = ids.map((id) => ({ id, raw: raw[id] || 0 })).sort((a, b) => b.raw - a.raw);
  rows.forEach((r, i) => {
    r.rank = i > 0 && r.raw === rows[i - 1].raw ? rows[i - 1].rank : i + 1;
    r.pts = RANK_PTS[r.rank - 1] || 0;
    room.total[r.id] = (room.total[r.id] || 0) + r.pts;
    r.total = room.total[r.id];
    r.name = nameOf(room, r.id);
  });
  room.result = { key: room.game.key, rows, last: room.gi >= room.seq.length - 1 };
  if (room.mode !== "party") require("./lobby").report(room.mode, room.code, rows); // 単独ゲームはパーティーの通算成績へ
  room.phase = "result";
  // 単独ゲームは結果のまま止めて「もう一度遊ぶ」を待つ。大会は少し見せてから次の試合へ
  if (room.mode === "party") setTimer(room, RESULT_MS, () => next(room));
}
function next(room) {
  if (room.phase !== "result") return;
  clearTimer(room);
  room.gi += 1;
  if (room.gi >= room.seq.length) {
    room.phase = "final"; room.game = null;
    // 大会の総合順位をパーティーの通算成績へ
    require("./lobby").report("party", room.code, require("./lobby").rankByScore(members(room).map((id) => ({ id, score: room.total[id] || 0 }))));
    return;
  }
  intro(room);
}

// ---------------------------------------------------------------
// ひとりじめ橋
// ---------------------------------------------------------------
function bridgeStart(room) {
  room.game = { key: "bridge", round: 0, step: "pick", values: [], picks: new Map(), score: {}, last: null };
  bridgeRound(room);
}
function bridgeRound(room) {
  const g = room.game;
  g.round += 1;
  // 橋の数は人数(最低3本)。点数は 1〜本数 をばらばらに並べる
  const n = Math.max(3, members(room).length);
  g.values = shuffle(Array.from({ length: n }, (_, i) => i + 1));
  g.picks = new Map(); g.last = null; g.step = "pick";
  setTimer(room, BRIDGE_PICK_MS, () => bridgeResolve(room));
}
function bridgeResolve(room) {
  const g = room.game;
  if (g.step !== "pick") return;
  clearTimer(room);
  const count = g.values.map(() => 0);
  for (const [id, i] of g.picks) if (room.players.has(id)) count[i] += 1;
  const gained = {}, picks = {};
  for (const id of members(room)) {
    const i = g.picks.get(id);
    picks[id] = i == null ? null : i;
    gained[id] = i != null && count[i] === 1 ? g.values[i] : 0;
    g.score[id] = (g.score[id] || 0) + gained[id];
  }
  g.last = { picks, gained, collapsed: count.map((c) => c >= 2) };
  g.step = "show";
  setTimer(room, BRIDGE_SHOW_MS, () => {
    if (g.round >= BRIDGE_ROUNDS) finishGame(room, g.score);
    else bridgeRound(room);
  });
}

// ---------------------------------------------------------------
// 爆弾回し
// ---------------------------------------------------------------
function bombStart(room) {
  room.game = { key: "bomb", alive: shuffle(members(room)), out: [], holder: null, receivedAt: 0, fuseAt: 0, step: "fuse", boom: null, round: 0 };
  bombFuse(room);
}
function bombFuse(room) {
  const g = room.game;
  g.alive = g.alive.filter((id) => room.players.has(id));
  if (g.alive.length <= 1) return bombFinish(room);
  g.round += 1;
  g.holder = g.alive[rand(g.alive.length)];
  g.receivedAt = Date.now(); g.step = "fuse"; g.boom = null;
  const fuse = FUSE_MIN_MS + rand(FUSE_MAX_MS - FUSE_MIN_MS);
  // 爆発の時刻は送らない(タイマーで締め切りを表示しないよう deadline も消す)
  setTimer(room, fuse, () => bombExplode(room));
  room.deadline = 0;
}
function bombExplode(room) {
  const g = room.game;
  if (g.step !== "fuse") return;
  const id = g.holder;
  g.out.push(id);
  g.alive = g.alive.filter((x) => x !== id);
  g.step = "boom"; g.boom = id; g.holder = null;
  setTimer(room, BOMB_BOOM_MS, () => (g.alive.filter((x) => room.players.has(x)).length <= 1 ? bombFinish(room) : bombFuse(room)));
}
function bombFinish(room) {
  const g = room.game;
  // 先に脱落した人ほど低い。最後まで残った人がいちばん上
  const raw = {};
  g.out.forEach((id, i) => { raw[id] = i; });
  for (const id of g.alive) raw[id] = g.out.length + 1;
  finishGame(room, raw);
}

// ---------------------------------------------------------------
// おぼえて料理
// ---------------------------------------------------------------
function memoryStart(room) {
  room.game = { key: "memory", round: 0, step: "show", recipe: [], grid: [], answers: new Map(), score: {}, last: null };
  memoryRound(room);
}
function memoryRound(room) {
  const g = room.game;
  g.round += 1;
  const all = shuffle(INGREDIENTS.map((x) => x.id));
  g.recipe = all.slice(0, MEM_LENGTHS[g.round - 1]);
  g.grid = shuffle([...g.recipe, ...all.slice(g.recipe.length, MEM_GRID)]);
  g.answers = new Map(); g.last = null; g.step = "show";
  setTimer(room, MEM_SHOW_MS, () => {
    g.step = "input"; g.inputAt = Date.now();
    setTimer(room, MEM_INPUT_MS, () => memoryResolve(room));
  });
}
function memoryResolve(room) {
  const g = room.game;
  if (g.step !== "input") return;
  clearTimer(room);
  const recipe = new Set(g.recipe), rows = {};
  for (const id of members(room)) {
    const a = g.answers.get(id);
    const sel = a ? a.sel : [];
    const correct = sel.filter((x) => recipe.has(x)).length, wrong = sel.length - correct;
    const perfect = correct === g.recipe.length && wrong === 0;
    rows[id] = { sel, correct, wrong, perfect, at: a ? a.at : null, pts: Math.max(0, correct * 2 - wrong) + (perfect ? 2 : 0), bonus: 0 };
  }
  // 全問正解した人のうち、提出が早い順にボーナス
  Object.entries(rows).filter(([, r]) => r.perfect).sort((a, b) => a[1].at - b[1].at)
    .forEach(([, r], i) => { r.bonus = MEM_SPEED_BONUS[i] || 0; r.pts += r.bonus; });
  for (const [id, r] of Object.entries(rows)) g.score[id] = (g.score[id] || 0) + r.pts;
  g.last = { recipe: g.recipe, rows };
  g.step = "result";
  setTimer(room, MEM_RESULT_MS, () => {
    if (g.round >= MEM_LENGTHS.length) finishGame(room, g.score);
    else memoryRound(room);
  });
}

// ---------------------------------------------------------------
// 送信
// ---------------------------------------------------------------
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function gameView(room, me) {
  const g = room.game;
  if (!g) return null;
  if (room.phase === "intro") return { key: g.key };
  if (MINI[g.key]) return { key: g.key, ...MINI[g.key].view(ctxOf(room), me) };
  if (g.key === "bridge") {
    const mine = g.picks.get(me);
    return { key: "bridge", round: g.round, rounds: BRIDGE_ROUNDS, step: g.step, values: g.values, score: g.score,
      myPick: mine == null ? null : mine,
      picked: members(room).filter((id) => g.picks.has(id)), // 誰が選び終わったか(どれを選んだかは公開まで秘密)
      last: g.step === "show" ? g.last : null };
  }
  if (g.key === "bomb") {
    return { key: "bomb", step: g.step, alive: g.alive, out: g.out, holder: g.holder, boom: g.boom, round: g.round,
      canPassAt: g.holder === me ? g.receivedAt + BOMB_HOLD_MS : 0 };
  }
  // おぼえて料理: レシピは「見せる」段階と結果だけ。入力中は送らない
  const a = g.answers.get(me);
  return { key: "memory", round: g.round, rounds: MEM_LENGTHS.length, step: g.step, score: g.score,
    recipe: g.step === "show" ? g.recipe : null, need: g.recipe.length,
    grid: g.step === "input" ? g.grid : null,
    submitted: members(room).filter((id) => g.answers.has(id)),
    mySel: a ? a.sel : null,
    last: g.step === "result" ? g.last : null };
}
function view(room, me) {
  return {
    t: "state", me, now: Date.now(),
    room: {
      code: room.code, mode: room.mode, phase: room.phase, gameHostId: hostOf(room), playlist: room.playlist,
      seq: room.seq, gi: room.gi, deadline: room.deadline,
      players: order(room).map((p) => ({ id: p.id, name: p.name, connected: connected(p), inGame: room.roster.includes(p.id), total: room.total[p.id] || 0 })),
      roster: members(room),
      game: gameView(room, me),
      result: room.phase === "result" ? room.result : null,
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
  broadcast(room);
}
function removePlayer(room, pid) {
  if (!room.players.has(pid)) return;
  room.players.delete(pid);
  if (room.phase !== "lobby" && room.phase !== "final" && members(room).length < MIN_PLAYERS) toLobby(room);
  else if (room.phase === "play" && room.game) {
    const g = room.game;
    if (g.key === "bomb") {
      g.alive = g.alive.filter((id) => id !== pid);
      // 爆弾を持っていた人が抜けたら、残りの誰かに持たせる
      if (g.step === "fuse" && g.holder === pid) { if (g.alive.length <= 1) bombFinish(room); else { g.holder = g.alive[rand(g.alive.length)]; g.receivedAt = Date.now(); } }
      else if (g.alive.length <= 1 && g.step === "fuse") bombFinish(room);
    } else if (g.key === "bridge") checkBridge(room);
    else if (g.key === "memory") checkMemory(room);
    else if (MINI[g.key]) MINI[g.key].onLeave(ctxOf(room), pid);
  }
  broadcast(room);
}
// 接続中の参加者が全員そろったら締め切りを待たずに進める
function checkBridge(room) {
  const g = room.game, ids = liveMembers(room);
  if (g.step === "pick" && ids.length && ids.every((id) => g.picks.has(id))) bridgeResolve(room);
}
function checkMemory(room) {
  const g = room.game, ids = liveMembers(room);
  if (g.step === "input" && ids.length && ids.every((id) => g.answers.has(id))) memoryResolve(room);
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
    const mode = MODES.includes(m.mode) ? m.mode : "party";
    let room = rooms.get(mode + ":" + code);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) return err(ws, "部屋がいっぱいです。しばらくしてから試してください");
      room = newRoom(code, mode);
      rooms.set(mode + ":" + code, room);
    }
    let p = room.players.get(pid);
    if (p && p.token !== token) return err(ws, "この部屋に入れませんでした。ページを再読み込みしてください");
    if (!p) {
      // 遊べるのは8人まで。ゲーム中でも観戦として入れるように少し余裕を持たせる
      if (room.players.size >= MAX_PLAYERS + 4) return err(ws, "この部屋は満員です");
      p = { id: pid, token, name, joinedAt: Date.now(), sockets: new Set() };
      room.players.set(pid, p);
    }
    if (ws.room) detach(ws);
    p.name = name;
    p.sockets.add(ws);
    ws.room = room; ws.pid = pid;
    room.emptySince = null;
    send(ws, { t: "joined", room: code, ingredients: INGREDIENTS });
    return broadcast(room);
  }

  const room = ws.room;
  const p = room && room.players.get(ws.pid);
  if (!p) return err(ws, "部屋に入っていません");
  const isGM = p.id === hostOf(room);
  const inGame = room.roster.includes(p.id);
  const g = room.game;
  if (["setPlaylist", "start", "next", "reset", "kick"].includes(m.t) && !isGM) return err(ws, "この操作はホストだけができます");

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
    case "setPlaylist": {
      // 大会で遊ぶ試合の並び(同じゲームを何回入れてもよい。1〜9試合)
      if (room.mode !== "party" || room.phase !== "lobby" || !Array.isArray(m.list)) return;
      const list = m.list.filter((k) => GAMES.includes(k)).slice(0, MAX_PLAYLIST);
      if (!list.length) return err(ws, "1試合以上えらんでください");
      room.playlist = list;
      break;
    }
    case "start":
      if (room.phase !== "lobby") return;
      if (order(room).filter(connected).length < MIN_PLAYERS) return err(ws, `${MIN_PLAYERS}人以上でスタートできます`);
      startParty(room);
      break;
    case "next":
      // 順位発表を飛ばして次へ
      next(room);
      break;
    case "pick":
      // ひとりじめ橋: 締め切りまでは選び直せる
      if (room.phase !== "play" || !g || g.key !== "bridge" || g.step !== "pick" || !inGame) return;
      if (!Number.isInteger(m.i) || m.i < 0 || m.i >= g.values.length) return;
      g.picks.set(p.id, m.i);
      checkBridge(room);
      break;
    case "pass": {
      // 爆弾回し: 持っている人が、生き残っているほかの人へ渡す
      if (room.phase !== "play" || !g || g.key !== "bomb" || g.step !== "fuse" || g.holder !== p.id) return;
      if (Date.now() < g.receivedAt + BOMB_HOLD_MS) return;
      if (m.to === p.id || !g.alive.includes(m.to) || !room.players.has(m.to)) return;
      g.holder = m.to; g.receivedAt = Date.now();
      break;
    }
    case "cook": {
      // おぼえて料理: 選んだ食材を提出(1回だけ)
      if (room.phase !== "play" || !g || g.key !== "memory" || g.step !== "input" || !inGame || g.answers.has(p.id)) return;
      if (!Array.isArray(m.sel)) return;
      const sel = [...new Set(m.sel.filter((x) => typeof x === "string" && ING_IDS.has(x) && g.grid.includes(x)))].slice(0, MEM_GRID);
      g.answers.set(p.id, { sel, at: Date.now() });
      checkMemory(room);
      break;
    }
    case "mini": {
      // 大会版ゲームへの操作(中身はゲームごとのファイルで判定する)
      if (room.phase !== "play" || !g || !MINI[g.key] || typeof m.a !== "string") return;
      // 観戦の人は絵しりとりの絵を見ることだけできる(見てよいかはルール本体で判定)
      if (!inGame && !(g.key === "eshiri" && m.a === "pic")) return;
      // 絵しりとりの答え合わせを早めに終えるのはホストだけ
      if (g.key === "eshiri" && m.a === "done" && !isGM) return err(ws, "この操作はホストだけができます");
      const e = MINI[g.key].handle(ctxOf(room), p.id, m);
      if (typeof e === "string") return err(ws, e);
      // 線を描く・入力途中の言葉・絵の取得は状態が変わらないので一斉送信しない
      if (["stroke", "undo", "clear", "words", "pic"].includes(m.a)) return;
      break;
    }
    case "again":
      // 大会: 総合結果から待機画面へ。単独ゲーム: 結果から同じメンバーで次の試合(通算点は残す)
      if (room.mode === "party") { if (room.phase !== "final") return; toLobby(room); break; }
      if (room.phase !== "result") return;
      if (order(room).filter(connected).length < MIN_PLAYERS) return err(ws, `${MIN_PLAYERS}人以上で遊べます`);
      startParty(room, true);
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
// 絵しりとりの線を送るので、1回に受け取れる量を少し大きくする
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.budget = 40;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (buf) => {
    if (--ws.budget < 0) return; // 送りすぎは捨てる
    let m;
    try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m.t !== "string") return;
    try { handle(ws, m); } catch (e) { console.error("ミニゲーム集 処理エラー:", e); }
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

module.exports = { WS_PATH, wss, rooms, INGREDIENTS, setTierTopics: MINI.tier.setTopicSource, setNumberTopics: MINI.number.setTopics };
