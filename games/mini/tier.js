"use strict";
// ドタバタ大会のミニゲーム: みんなでティア表(大会版)
// 全員が1回ずつ親になる。親は5つのワードを1〜5位に並べ、ほかの人は親の並びを予想する。
// 得点は元のティア表と同じ(ぴったり3点・1つずれ1点・全部ぴったりでボーナス5点)。親の答えは公開まで送らない。

const TIERS = ["S", "A", "B", "C", "D"];
const PTS_EXACT = 3, PTS_NEAR = 1, PTS_PERFECT = 5;
const RANK_MS = 60000, GUESS_MS = 45000, SHOW_MS = 9000;

let topicSource = () => ({}); // server.js からお題(標準+みんなのお題)を受け取る
function setTopicSource(fn) { topicSource = fn; }

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const tierOf = (arr, w) => TIERS.find((t) => arr[t] === w) || null;
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
    const d = Math.abs(TIERS.indexOf(t) - TIERS.indexOf(tierOf(guess, answer[t])));
    if (d === 0) { s += PTS_EXACT; exact++; } else if (d === 1) s += PTS_NEAR;
  }
  return s + (exact === 5 ? PTS_PERFECT : 0);
}
function pickTopic(used) {
  const all = topicSource();
  const names = Object.keys(all).filter((k) => Array.isArray(all[k]) && all[k].length >= 5);
  const fresh = names.filter((k) => !used.includes(k));
  const name = (fresh.length ? fresh : names)[Math.floor(Math.random() * (fresh.length || names.length))];
  return { name, words: shuffle([...all[name]]).slice(0, 5) };
}

function start(c) {
  c.g = { key: "tier", parents: shuffle(c.members()), ri: -1, parent: null, topic: "", words: [], answer: null, guesses: new Map(), step: "rank", score: {}, used: [], last: null };
  nextRound(c);
}
function nextRound(c) {
  const g = c.g;
  g.ri += 1;
  // 抜けた人の番は飛ばす
  while (g.ri < g.parents.length && !c.has(g.parents[g.ri])) g.ri += 1;
  if (g.ri >= g.parents.length) return c.finish(g.score);
  g.parent = g.parents[g.ri];
  const t = pickTopic(g.used);
  g.used.push(t.name);
  Object.assign(g, { topic: t.name, words: t.words, answer: null, guesses: new Map(), step: "rank", last: null });
  // 親が時間切れなら、ランダムに並べて進める(大会が止まらないように)
  c.setTimer(RANK_MS, () => { const w = shuffle([...g.words]); setAnswer(c, Object.fromEntries(TIERS.map((t, i) => [t, w[i]]))); });
}
function setAnswer(c, arr) {
  const g = c.g;
  g.answer = arr; g.step = "guess";
  c.setTimer(GUESS_MS, () => reveal(c));
}
function guessers(c) { return c.members().filter((id) => id !== c.g.parent); }
function reveal(c) {
  const g = c.g;
  if (g.step !== "guess") return;
  c.clearTimer();
  const rows = [];
  for (const id of guessers(c)) {
    const guess = g.guesses.get(id);
    const s = guess ? scoreGuess(g.answer, guess) : 0;
    g.score[id] = (g.score[id] || 0) + s;
    rows.push({ id, guess: guess || null, pts: s });
  }
  g.last = { answer: g.answer, rows };
  g.step = "show";
  c.setTimer(SHOW_MS, () => nextRound(c));
}

function handle(c, pid, m) {
  const g = c.g;
  if (m.a === "answer") {
    if (g.step !== "rank" || pid !== g.parent) return;
    const a = cleanArr(m.arr, g.words);
    if (!a) return "5つ全部を 1位〜5位 に置いてください";
    setAnswer(c, a);
    return;
  }
  if (m.a === "guess") {
    if (g.step !== "guess" || pid === g.parent || !c.members().includes(pid)) return;
    const a = cleanArr(m.arr, g.words);
    if (!a) return "5つ全部を 1位〜5位 に置いてください";
    g.guesses.set(pid, a);
    // 接続中の予想する人が全員そろったら公開
    const live = c.live().filter((id) => id !== g.parent);
    if (live.length && live.every((id) => g.guesses.has(id))) reveal(c);
  }
}
function onLeave(c, pid) {
  const g = c.g;
  if (pid === g.parent && g.step !== "show") { c.clearTimer(); nextRound(c); return; }
  if (g.step === "guess") {
    const live = c.live().filter((id) => id !== g.parent);
    if (live.length && live.every((id) => g.guesses.has(id))) reveal(c);
  }
}
function view(c, me) {
  const g = c.g;
  return {
    step: g.step, round: g.ri + 1, rounds: g.parents.length, parent: g.parent, topic: g.topic, words: g.words, score: g.score,
    // 親の答えは親本人と公開後だけ
    myAnswer: me === g.parent ? g.answer : null,
    myGuess: g.guesses.get(me) || null,
    guessed: [...g.guesses.keys()],
    last: g.step === "show" ? g.last : null,
  };
}

module.exports = { start, handle, view, onLeave, setTopicSource, TIERS };
