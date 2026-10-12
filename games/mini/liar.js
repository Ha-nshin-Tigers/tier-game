"use strict";
// ドタバタ大会のミニゲーム: ウソつき酒場(大会版・2D)
// ルールはウソつき酒場と同じ。テーブルカード(K/Q/A)だと言い張って1〜3枚伏せて出し、次の人は出すか「ウソつき！」。
// ウソなら出した人、本当なら指摘した人が自分のリボルバー(6発中1発が実弾)の引き金を引く。最後の1人が1位。
// 手札と弾の位置はサーバだけが持つ。大会は8人まで入るので、7〜8人は山札40枚にする。

const RANKS = ["K", "Q", "A"];
const HAND = 5, CHAMBERS = 6;
const TURN_MS = 40000, TRIGGER_MS = 15000, SHOT_MS = 4000;
const RANK_NAME = { K: "キング", Q: "クイーン", A: "エース", J: "ジョーカー" };

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const rand = (n) => Math.floor(Math.random() * n);
// 山札: 4人まで20枚(各6+ジョーカー2)、6人まで30枚(各9+3)、8人まで40枚(各12+4)
function makeDeck(n) {
  const k = n <= 4 ? 6 : n <= 6 ? 9 : 12, j = n <= 4 ? 2 : n <= 6 ? 3 : 4, deck = [];
  let id = 0;
  for (const r of RANKS) for (let i = 0; i < k; i++) deck.push({ id: "c" + id++, r });
  for (let i = 0; i < j; i++) deck.push({ id: "c" + id++, r: "J" });
  return shuffle(deck);
}

function start(c) {
  const seats = shuffle(c.members());
  const st = {};
  for (const id of seats) st[id] = { alive: true, hand: [], bullet: 1 + rand(CHAMBERS), pulls: 0 };
  c.g = { key: "liar", seats, st, out: [], round: 0, tableRank: null, lastPlay: null, pile: 0, turnId: null, step: "play", reveal: null, shot: null, log: [] };
  startRound(c, seats[rand(seats.length)]);
}
const alive = (c) => c.g.seats.filter((id) => c.g.st[id].alive && c.has(id));
function log(c, t) { c.g.log.push(t); if (c.g.log.length > 8) c.g.log.shift(); }
// id の次の席の、生きている人(cond を満たす人)
function nextSeat(c, id, cond = () => true) {
  const s = c.g.seats, i = s.indexOf(id);
  for (let k = 1; k <= s.length; k++) {
    const q = s[(Math.max(i, 0) + k) % s.length];
    if (c.g.st[q].alive && c.has(q) && cond(q)) return q;
  }
  return null;
}
function startRound(c, first) {
  const g = c.g, ids = alive(c);
  if (ids.length < 2) return finish(c);
  g.round += 1;
  g.tableRank = RANKS[rand(RANKS.length)];
  const deck = makeDeck(g.seats.length);
  for (const id of g.seats) g.st[id].hand = [];
  for (const id of ids) g.st[id].hand = deck.splice(0, HAND);
  Object.assign(g, { lastPlay: null, pile: 0, reveal: null, shot: null, step: "play" });
  log(c, `ラウンド${g.round}: テーブルカードは「${RANK_NAME[g.tableRank]}」`);
  setTurn(c, ids.includes(first) ? first : nextSeat(c, first));
}
// 次の手番: 直前に出した人以外で手札が残っている人。いなければ次の人は指摘するしかない
function responderAfter(c, id) {
  return nextSeat(c, id, (q) => q !== id && c.g.st[q].hand.length > 0) || nextSeat(c, id, (q) => q !== id);
}
function setTurn(c, id) {
  c.g.turnId = id;
  c.setTimer(TURN_MS, () => {
    // 時間切れ: 出せるなら1枚出す、出せなければ指摘
    const s = c.g.st[c.g.turnId];
    if (s && s.hand.length) play(c, c.g.turnId, [s.hand[rand(s.hand.length)].id], true);
    else callLiar(c, c.g.turnId, true);
  });
}
function play(c, pid, ids, auto) {
  const g = c.g, s = g.st[pid], cards = [];
  for (const id of ids) { const x = s.hand.find((h) => h.id === id); if (x && !cards.includes(x)) cards.push(x); }
  if (cards.length < 1 || cards.length > 3 || cards.length !== ids.length) return "1〜3枚選んでください";
  s.hand = s.hand.filter((x) => !cards.includes(x));
  g.lastPlay = { by: pid, cards };
  g.pile += cards.length;
  log(c, `${c.nameOf(pid)}: 「${RANK_NAME[g.tableRank]}」を${cards.length}枚${auto ? "(時間切れ)" : ""}`);
  setTurn(c, responderAfter(c, pid));
}
function callLiar(c, pid, auto) {
  const g = c.g, lp = g.lastPlay;
  if (!lp) return "まだ誰もカードを出していません";
  const honest = lp.cards.every((x) => x.r === g.tableRank || x.r === "J");
  const target = honest ? pid : lp.by;
  g.reveal = { caller: pid, by: lp.by, cards: lp.cards, honest, target };
  g.step = "reveal";
  log(c, `${c.nameOf(pid)}: ウソつき！${auto ? "(時間切れ)" : ""} → ${honest ? "本当" : "ウソ"}。${c.nameOf(target)} が引き金`);
  c.setTimer(TRIGGER_MS, () => pull(c));
}
function pull(c) {
  const g = c.g;
  if (g.step !== "reveal") return;
  const t = g.reveal.target, s = g.st[t];
  s.pulls += 1;
  const died = s.pulls >= s.bullet;
  if (died) { s.alive = false; s.hand = []; g.out.push(t); }
  g.shot = { target: t, died, pulls: s.pulls };
  g.step = "shot";
  log(c, `${c.nameOf(t)}: ${died ? "バン！ 脱落" : "カチッ…セーフ"}(${s.pulls}発目)`);
  c.setTimer(SHOT_MS, () => {
    if (alive(c).length < 2) return finish(c);
    startRound(c, g.st[t].alive && c.has(t) ? t : nextSeat(c, t));
  });
}
function finish(c) {
  const g = c.g, raw = {};
  g.out.forEach((id, i) => { raw[id] = i; });
  for (const id of alive(c)) raw[id] = g.out.length + 1;
  c.finish(raw);
}

function handle(c, pid, m) {
  const g = c.g, s = g.st[pid];
  if (!s) return;
  if (m.a === "play") {
    if (g.step !== "play" || g.turnId !== pid || !s.alive || !Array.isArray(m.ids)) return;
    return play(c, pid, m.ids.filter((x) => typeof x === "string").slice(0, 3));
  }
  if (m.a === "liar") {
    if (g.step !== "play" || g.turnId !== pid || !s.alive || !g.lastPlay || g.lastPlay.by === pid) return;
    return callLiar(c, pid);
  }
  if (m.a === "pull") {
    if (g.step === "reveal" && g.reveal.target === pid) pull(c);
  }
}
// 抜けた人は脱落扱い。進行に関わる人なら、その場で進め直す
function onLeave(c, pid) {
  const g = c.g, s = g.st[pid];
  if (!s || !s.alive) return;
  s.alive = false; s.hand = []; g.out.push(pid);
  if (alive(c).length < 2) { c.clearTimer(); return finish(c); }
  if (g.step === "play") {
    if (g.lastPlay && g.lastPlay.by === pid) return startRound(c, nextSeat(c, pid));
    if (g.turnId === pid) setTurn(c, g.lastPlay ? responderAfter(c, g.lastPlay.by) : nextSeat(c, pid));
  } else if (g.step === "reveal" && g.reveal.target === pid) startRound(c, nextSeat(c, pid));
}
function view(c, me) {
  const g = c.g, mine = g.st[me];
  const turn = g.step === "play" && g.turnId === me && mine && mine.alive;
  return {
    step: g.step, round: g.round, tableRank: g.tableRank, pile: g.pile, turnId: g.turnId, chambers: CHAMBERS,
    seats: g.seats.map((id) => ({ id, alive: g.st[id].alive && c.has(id), hand: g.st[id].hand.length, pulls: g.st[id].pulls })),
    lastPlay: g.lastPlay ? { by: g.lastPlay.by, count: g.lastPlay.cards.length } : null,
    myHand: mine && mine.alive ? mine.hand : [],
    canPlay: !!turn && mine.hand.length > 0,
    canCall: !!turn && !!g.lastPlay && g.lastPlay.by !== me,
    reveal: g.step === "reveal" || g.step === "shot" ? g.reveal : null,
    shot: g.step === "shot" ? g.shot : null,
    log: g.log,
  };
}

module.exports = { start, handle, view, onLeave };
