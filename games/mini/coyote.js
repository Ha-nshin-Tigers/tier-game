"use strict";
// コヨーテ(Coyote 風)のルール本体。部屋・入室は games/coyote.js が受け持つ。
// 自分のカードだけ見えない(おでこに掲げる)。順番に「場の合計は○○以上」と数字を上げていくか、
// 前の人の数字が合計を超えていると思ったら「コヨーテ！」。公開して、間違っていた方がライフ−1。ライフ0で脱落、最後の1人が勝ち。

// 山札36枚(本家と同じ): 数字32枚 + 特殊4枚
const NUMBERS = [[20, 1], [15, 2], [10, 3], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [0, 3], [-5, 2], [-10, 1]];
const SPECIALS = ["x2", "max0", "draw", "night"]; // ×2 / MAX→0 / ?(山札から1枚) / 夜(0。この回のあと全部シャッフル)
function makeDeck(specials) {
  const d = [];
  for (const [v, n] of NUMBERS) for (let k = 0; k < n; k++) d.push({ v });
  if (specials) for (const s of SPECIALS) d.push({ s, v: 0 });
  return d;
}
const DEFAULTS = { lives: 3, turnSecs: 60, specials: true };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if ([1, 2, 3, 4, 5].includes(r.lives)) out.lives = r.lives;
  if ([0, 30, 60, 90].includes(r.turnSecs)) out.turnSecs = r.turnSecs;
  if (typeof r.specials === "boolean") out.specials = r.specials;
  return out;
}
const REVEAL_MS = 9000, AWAY_MS = 20000, MAX_DECLARE = 999;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function start(c, settings) {
  const cfg = normalize(settings);
  const order = shuffle([...c.members()]);
  c.g = {
    cfg, order, lives: Object.fromEntries(order.map((id) => [id, cfg.lives])), outOrder: [],
    deck: shuffle(makeDeck(cfg.specials)), discard: [], hands: {}, round: 0,
    turn: null, bids: [], step: "bid", reveal: null, log: [],
  };
  deal(c, order[0]);
}
const alive = (g) => g.order.filter((id) => g.lives[id] > 0);
function draw(g) {
  if (!g.deck.length) { g.deck = shuffle(g.discard); g.discard = []; }
  return g.deck.pop();
}
function deal(c, first) {
  const g = c.g;
  g.round++; g.hands = {}; g.bids = []; g.reveal = null; g.step = "bid";
  for (const id of alive(g)) g.hands[id] = draw(g);
  g.turn = first;
  arm(c);
}
// 席順で id の次の(生きている)人。id 自身が脱落していても、その席の次から探す
function next(g, id) { const o = g.order, i = o.indexOf(id); for (let k = 1; k <= o.length; k++) { const x = o[(i + k) % o.length]; if (g.lives[x] > 0) return x; } return null; }

// 合計の計算: ? を山札から引く → MAX→0 → ×2 の順
function total(g) {
  const cards = alive(g).map((id) => ({ id, ...g.hands[id] })), steps = [], extra = [];
  let night = cards.some((x) => x.s === "night");
  for (const x of cards) if (x.s === "draw") {
    // ? : 山札の一番上をめくってその数字を使う(特殊カードが出たら捨てて引き直す)
    let d = draw(g), guard = 0;
    while (d.s && d.s !== "night" && guard++ < 40) { g.discard.push(d); d = draw(g); }
    if (d.s === "night") night = true;
    x.drawn = d; x.val = d.v; extra.push(d);
    steps.push(`？ → 山札から ${label(d)}`);
  }
  for (const x of cards) if (x.val == null) x.val = x.v;
  if (cards.some((x) => x.s === "max0")) {
    const nums = cards.filter((x) => !x.s || x.s === "draw" || x.s === "night");
    const mx = nums.length ? Math.max(...nums.map((x) => x.val)) : null;
    const hit = mx != null && mx > 0 ? nums.find((x) => x.val === mx) : null;
    if (hit) { hit.val = 0; hit.zeroed = true; steps.push(`MAX→0: いちばん大きい ${mx} を 0 に`); }
    else steps.push("MAX→0: 0 にする数字なし");
  }
  let sum = cards.reduce((n, x) => n + x.val, 0);
  if (cards.some((x) => x.s === "x2")) { steps.push(`×2: ${sum} × 2`); sum *= 2; }
  return { cards, sum, steps, night, extra };
}
const label = (x) => (x.s === "x2" ? "×2" : x.s === "max0" ? "MAX→0" : x.s === "draw" ? "？" : x.s === "night" ? "夜(0)" : String(x.v));

function declare(c, pid, n) {
  const g = c.g, last = g.bids.length ? g.bids[g.bids.length - 1].n : null;
  if (!Number.isInteger(n) || n > MAX_DECLARE || n < -MAX_DECLARE) return "数字を入れてください";
  if (last != null && n <= last) return `${last + 1} 以上を言ってください`;
  g.bids.push({ by: pid, n });
  g.turn = next(g, pid);
}
function coyote(c, pid) {
  const g = c.g;
  const lastBid = g.bids[g.bids.length - 1];
  const t = total(g);
  const over = lastBid.n > t.sum; // 言った数字が合計より大きい → 言った人の負け
  const loser = over ? lastBid.by : pid;
  g.lives[loser]--;
  const out = g.lives[loser] <= 0;
  if (out) g.outOrder.push(loser);
  g.reveal = { caller: pid, bid: lastBid, sum: t.sum, steps: t.steps, cards: t.cards.map((x) => ({ id: x.id, card: label(x), val: x.val, drawn: x.drawn ? label(x.drawn) : null, zeroed: !!x.zeroed })), loser, out, night: t.night };
  g.log.push(`第${g.round}回: ${c.nameOf(pid)} が「コヨーテ！」 言った数 ${lastBid.n} / 合計 ${t.sum} → ${c.nameOf(loser)} のライフ−1${out ? "(脱落)" : ""}`);
  if (g.log.length > 30) g.log.shift();
  // 使ったカードを捨て札へ。夜が出ていたら全部集めてシャッフル
  for (const id of Object.keys(g.hands)) g.discard.push(g.hands[id]);
  g.discard.push(...t.extra);
  if (t.night) { g.deck = shuffle([...g.deck, ...g.discard]); g.discard = []; g.reveal.reshuffled = true; }
  g.step = "reveal"; g.turn = null;
  // 次の回は負けた人から(脱落したらその次の人から)
  g.nextFirst = out ? next(g, loser) : loser;
  if (alive(g).length <= 1) { g.step = "end"; c.clearTimer(); return end(c); }
  c.setTimer(REVEAL_MS, () => deal(c, g.nextFirst));
}
function end(c) {
  const g = c.g, raw = {};
  g.outOrder.forEach((id, k) => { raw[id] = k + 1; });
  for (const id of alive(g)) raw[id] = g.order.length + 1;
  c.finish(raw);
}
// 持ち時間: 時間切れは「コヨーテ！」できればコヨーテ、最初の人は 1 を言う
function arm(c) {
  const g = c.g;
  if (g.step !== "bid") return;
  const away = !c.live().includes(g.turn);
  const ms = away ? AWAY_MS : g.cfg.turnSecs * 1000;
  if (!ms) return c.clearTimer();
  const turn = g.turn, nBids = g.bids.length;
  c.setTimer(ms, () => {
    if (g.step !== "bid" || g.turn !== turn || g.bids.length !== nBids) return;
    if (g.bids.length) coyote(c, turn); else { declare(c, turn, 1); arm(c); }
  });
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step !== "bid" || g.turn !== pid || !(g.lives[pid] > 0)) return m.a === "declare" || m.a === "coyote" ? "あなたの番ではありません" : undefined;
  if (m.a === "declare") { const e = declare(c, pid, m.n); if (e) return e; return arm(c); }
  if (m.a === "coyote") { if (!g.bids.length) return "最初の人は数字を言ってください"; return coyote(c, pid); }
}
function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step === "end" || !(g.lives[pid] > 0)) return;
  g.lives[pid] = 0; g.outOrder.push(pid);
  // 数字を言っている途中なら手札を捨て札へ。公開中(コヨーテ!のあと)は、もう捨て札に入っているので入れない(二重になってカードが増える)
  if (g.hands[pid]) { if (g.step === "bid") g.discard.push(g.hands[pid]); delete g.hands[pid]; }
  if (alive(g).length <= 1) { g.step = "end"; c.clearTimer(); return end(c); }
  if (g.step === "bid" && g.turn === pid) { g.turn = next(g, pid); arm(c); }
  if (g.nextFirst === pid) g.nextFirst = next(g, pid);
}
function view(c, me) {
  const g = c.g, open = g.step !== "bid";
  // 自分のカードだけ見えない(公開後は全部見える)
  const cards = Object.fromEntries(Object.entries(g.hands).map(([id, x]) => [id, id === me && !open ? null : label(x)]));
  return {
    cfg: g.cfg, order: g.order, lives: g.lives, round: g.round, step: g.step, turn: g.turn, bids: g.bids, cards,
    reveal: g.reveal, log: g.log.slice(-8), deckLeft: g.deck.length, discardCount: g.discard.length,
  };
}
module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, makeDeck, _test: { total, label } };
