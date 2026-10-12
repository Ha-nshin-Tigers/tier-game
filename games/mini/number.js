"use strict";
// ドタバタ大会のミニゲーム: かくれナンバー(大会版)
// 元は協力ゲーム。大会では個人の点を付けるため、3ラウンドのそれぞれで
// 「自分のカードが正しい位置に並んだ人に+2点」「全員そろったら全員に+1点」とする。
// 各自の数字は公開まで本人にしか送らない。

const NUM_MIN = 1, NUM_MAX = 100, ROUNDS = 3;
const HINT_MS = 60000, ARRANGE_MS = 120000, SHOW_MS = 8000;
const PTS_OK = 2, PTS_ALL = 1, HINT_MAX = 24;

let topics = [{ name: "怖いもの", low: "平気", high: "震えるほど怖い" }];
function setTopics(list) { if (Array.isArray(list) && list.length) topics = list; }

const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => typeof s === "string" ? s.replace(BAD_CHARS, "").trim().slice(0, max) : "";
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function start(c) {
  c.g = { key: "number", round: 0, topic: null, used: [], hands: new Map(), order: [], ready: new Set(), step: "hint", score: {}, last: null };
  nextRound(c);
}
function nextRound(c) {
  const g = c.g;
  if (g.round >= ROUNDS) return c.finish(g.score);
  g.round += 1;
  const fresh = topics.filter((t) => !g.used.includes(t.name));
  g.topic = { ...(fresh.length ? fresh : topics)[Math.floor(Math.random() * (fresh.length || topics.length))] };
  g.used.push(g.topic.name);
  const ids = c.members();
  const pool = shuffle(Array.from({ length: NUM_MAX - NUM_MIN + 1 }, (_, i) => NUM_MIN + i));
  g.hands = new Map(ids.map((id, i) => [id, { num: pool[i], hint: "", done: false }]));
  Object.assign(g, { order: [], ready: new Set(), step: "hint", last: null });
  c.setTimer(HINT_MS, () => toArrange(c));
}
// ヒントを出していない人は「(ヒントなし)」のまま並べる対象に入れる(大会では全員に点のチャンスを残す)
function toArrange(c) {
  const g = c.g;
  if (g.step !== "hint") return;
  for (const [id, h] of g.hands) { if (!c.has(id)) g.hands.delete(id); else if (!h.done) { h.hint = h.hint || "(ヒントなし)"; h.done = true; } }
  if (g.hands.size < 2) return c.finish(g.score);
  g.order = shuffle([...g.hands.keys()]);
  g.ready = new Set(); g.step = "arrange";
  c.setTimer(ARRANGE_MS, () => reveal(c));
}
function reveal(c) {
  const g = c.g;
  if (g.step !== "arrange") return;
  c.clearTimer();
  const entries = g.order.filter((id) => g.hands.has(id)).map((id) => ({ id, hint: g.hands.get(id).hint, num: g.hands.get(id).num }));
  const sorted = entries.map((e) => e.num).sort((a, b) => a - b);
  const ok = entries.map((e, i) => e.num === sorted[i]);
  const all = ok.every(Boolean);
  const gained = {};
  entries.forEach((e, i) => { gained[e.id] = (ok[i] ? PTS_OK : 0) + (all ? PTS_ALL : 0); g.score[e.id] = (g.score[e.id] || 0) + gained[e.id]; });
  g.last = { entries, ok, all, gained };
  g.step = "show";
  c.setTimer(SHOW_MS, () => nextRound(c));
}
function checkHints(c) {
  const g = c.g, ids = c.live().filter((id) => g.hands.has(id));
  if (g.step === "hint" && ids.length && ids.every((id) => g.hands.get(id).done)) toArrange(c);
}
function checkReady(c) {
  const g = c.g, ids = c.live().filter((id) => g.hands.has(id));
  if (g.step === "arrange" && ids.length && ids.every((id) => g.ready.has(id))) reveal(c);
}

function handle(c, pid, m) {
  const g = c.g, h = g.hands.get(pid);
  if (!h) return;
  if (m.a === "hint") {
    if (g.step !== "hint") return;
    const w = cleanStr(m.hint, HINT_MAX);
    if (!w) return "ヒントを入れてください";
    h.hint = w; h.done = true;
    return checkHints(c);
  }
  if (m.a === "unhint") { if (g.step === "hint") h.done = false; return; }
  if (m.a === "move") {
    // 誰が動かしても全員の画面に反映。動いたら全員のOKを取り消す
    if (g.step !== "arrange") return;
    const from = g.order.indexOf(m.id), to = m.to;
    if (from < 0 || !Number.isInteger(to) || to < 0 || to >= g.order.length || from === to) return;
    g.order.splice(to, 0, g.order.splice(from, 1)[0]);
    g.ready.clear();
    return;
  }
  if (m.a === "ready") {
    if (g.step !== "arrange") return;
    if (m.on) g.ready.add(pid); else g.ready.delete(pid);
    return checkReady(c);
  }
}
function onLeave(c, pid) {
  const g = c.g;
  g.hands.delete(pid); g.ready.delete(pid);
  g.order = g.order.filter((id) => id !== pid);
  if (g.step === "hint") checkHints(c);
  else if (g.step === "arrange") { if (g.order.length < 2) reveal(c); else checkReady(c); }
}
function view(c, me) {
  const g = c.g, h = g.hands.get(me);
  return {
    step: g.step, round: g.round, rounds: ROUNDS, topic: g.topic, score: g.score,
    mine: h ? { num: h.num, hint: h.hint, done: h.done } : null,
    done: [...g.hands].filter(([, x]) => x.done).map(([id]) => id),
    ready: [...g.ready],
    // 並べ中はヒントだけ(数字は公開まで送らない)
    entries: g.step === "arrange" ? g.order.map((id) => ({ id, hint: g.hands.get(id).hint })) : null,
    last: g.step === "show" ? g.last : null,
  };
}

module.exports = { start, handle, view, onLeave, setTopics };
