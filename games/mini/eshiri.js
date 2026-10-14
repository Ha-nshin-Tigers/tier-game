"use strict";
// 絵しりとり — ルール本体(単独ゲーム /eshiri と、ドタバタ大会の両方で使う)
// 自分の番の人は、前の絵が何かを推理して(=読み取り)、その最後の文字から始まる言葉を絵だけで描く。
// 言葉は答え合わせまで本人以外に送らない。絵は「見てよい人」にだけ送る(前の絵だけ / 実況)。
// 進め方: relay = 全員で1本を順番に / sim = 人数分を同時に回す(お絵かき伝言ゲーム風)
// 絵の線は c.sendTo で個別に送る(状態の一斉送信には入れない。重くなるため)

const DEFAULTS = { mode: "relay", laps: 1, view: "prev", scoring: "both", drawSecs: 60 };
const START_WORDS = ["しりとり", "りんご", "ごりら", "らっぱ", "ぱんだ", "だるま", "まくら", "らくだ", "すいか", "かめ", "めだか", "かさ", "さかな", "なす", "すずめ"];
const REVEAL_MS = 90000; // 大会では答え合わせを見せてから終える
const MAX_STROKES = 500, MAX_POINTS = 16000, MAX_STROKE_POINTS = 800, WORD_MAX = 15;

const rand = (n) => Math.floor(Math.random() * n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---- 言葉の扱い: カタカナはひらがなに、小さい文字は大きい文字として比べる ----
const SMALL = { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "っ": "つ", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "ゎ": "わ", "ゕ": "か", "ゖ": "け" };
function toHira(s) {
  return String(s || "").normalize("NFKC").replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/\s+/g, "");
}
const isWord = (w) => /^[ぁ-ゖー]+$/.test(w) && w.length <= WORD_MAX;
// 比べるとき用(小さい文字を大きく)
const norm = (w) => [...toHira(w)].map((ch) => SMALL[ch] || ch).join("");
// しりとりで次に使う文字(最後の「ー」は飛ばし、小さい文字は大きく)
function lastChar(w) {
  const a = [...toHira(w)].filter((ch) => ch !== "ー");
  const ch = a[a.length - 1] || "";
  return SMALL[ch] || ch;
}
const firstChar = (w) => { const ch = [...toHira(w)][0] || ""; return SMALL[ch] || ch; };

function normalize(raw) {
  const r = raw || {}, out = { ...DEFAULTS };
  if (r.mode === "relay" || r.mode === "sim") out.mode = r.mode;
  if ([1, 2, 3].includes(r.laps)) out.laps = r.laps;
  if (r.view === "prev" || r.view === "live") out.view = r.view;
  if (r.scoring === "both" || r.scoring === "coop") out.scoring = r.scoring;
  if ([0, 45, 60, 90].includes(r.drawSecs)) out.drawSecs = r.drawSecs;
  return out;
}

let didSeq = 0;
function newLink(by) { return { by, did: "d" + (++didSeq).toString(36) + rand(1e6).toString(36), guess: "", word: "", done: false, strokes: [], points: 0 }; }

function start(c, settings) {
  const cfg = normalize(settings);
  const players = shuffle(c.members());
  const g = c.g = { key: "eshiri", cfg, players, step: "draw", chains: [], round: 0, turn: 0, scores: {}, coop: null, endAt: 0 };
  if (cfg.mode === "relay") {
    g.chains = [{ start: START_WORDS[rand(START_WORDS.length)], links: [] }];
    g.order = []; for (let k = 0; k < cfg.laps; k++) g.order.push(...players);
    relayTurn(c);
  } else {
    const words = shuffle([...START_WORDS]);
    g.chains = players.map((_, i) => ({ start: words[i % words.length], links: [] }));
    simRound(c);
  }
}
const timer = (c, fn) => { if (c.g.cfg.drawSecs) c.setTimer(c.g.cfg.drawSecs * 1000, fn); else c.clearTimer(); };

// ---- 1本のしりとり ----
function relayTurn(c) {
  const g = c.g;
  while (g.turn < g.order.length && !c.has(g.order[g.turn])) g.turn += 1; // 抜けた人の番は飛ばす
  if (g.turn >= g.order.length) return reveal(c);
  g.chains[0].links.push(newLink(g.order[g.turn]));
  timer(c, () => { finishLink(c, current(c)); relayNext(c); });
}
function relayNext(c) { const g = c.g; g.turn += 1; relayTurn(c); }
const current = (c) => { const l = c.g.chains[0].links; return l[l.length - 1]; };

// ---- 全員同時 ----
// round r で、しりとり k を描くのは players[(k + r) % n]
function simRound(c) {
  const g = c.g, n = g.players.length;
  if (g.round >= n) return reveal(c);
  g.chains.forEach((ch, k) => {
    const by = g.players[(k + g.round) % n];
    const l = newLink(by);
    if (!c.has(by)) { l.done = true; l.skipped = true; } // 抜けた人の分は空欄
    ch.links.push(l);
  });
  timer(c, () => { for (const ch of g.chains) finishLink(c, ch.links[ch.links.length - 1]); g.round += 1; simRound(c); });
  checkSim(c);
}
function checkSim(c) {
  const g = c.g;
  const cur = g.chains.map((ch) => ch.links[ch.links.length - 1]);
  // 接続中の人が全員描き終えたら次へ(切断中の人は締め切りまで待つ)
  if (cur.every((l) => l.done || !c.live().includes(l.by))) {
    if (cur.some((l) => !l.done) && g.cfg.drawSecs) return; // 切断中の人がいれば時間切れを待つ
    for (const l of cur) finishLink(c, l);
    g.round += 1; simRound(c);
  }
}
function finishLink(c, l) { if (!l || l.done) return; l.done = true; if (!l.word) l.word = ""; }

// その link の前のお題(最初はスタートの言葉)
function chainOf(g, did) { for (const ch of g.chains) { const i = ch.links.findIndex((l) => l.did === did); if (i >= 0) return { ch, i }; } return null; }
function prevOf(g, did) { const f = chainOf(g, did); return f && f.i > 0 ? f.ch.links[f.i - 1] : null; }
function myLink(c, pid) {
  const g = c.g;
  if (g.step !== "draw") return null;
  if (g.cfg.mode === "relay") { const l = current(c); return l && l.by === pid && !l.done ? l : null; }
  for (const ch of g.chains) { const l = ch.links[ch.links.length - 1]; if (l.by === pid && !l.done) return l; }
  return null;
}
// 自分の言葉が始まるべき文字(自分が読み取った前の言葉、なければスタートの言葉の最後の文字)。
// 読み取りが「ん」で終わったときは続けようがないので、どの文字からでもよい("" を返す)
function needChar(g, l) {
  const f = chainOf(g, l.did);
  const ch = lastChar(f.i === 0 ? f.ch.start : l.guess);
  return ch === "ん" ? "" : ch;
}
// この人がこの絵を見てよいか
function canSee(c, pid, did) {
  const g = c.g, f = chainOf(g, did);
  if (!f) return false;
  const l = f.ch.links[f.i];
  if (g.step !== "draw" || l.by === pid) return true; // 答え合わせ後は全部、自分の絵はいつでも
  if (g.cfg.mode === "relay" && g.cfg.view === "live") return true;
  // 前の絵だけ: 次の人が自分の番になったら見える
  const next = f.ch.links[f.i + 1];
  return !!(next && next.by === pid && l.done);
}

function reveal(c) {
  const g = c.g;
  c.clearTimer();
  g.step = "reveal";
  const scores = {}; let ok = 0, total = 0;
  for (const id of g.players) scores[id] = 0;
  for (const ch of g.chains) ch.links.forEach((l, i) => {
    if (i === 0) return;
    const p = ch.links[i - 1];
    total += 1;
    l.ok = !!p.word && !!l.guess && norm(l.guess) === norm(p.word);
    if (l.ok) { ok += 1; scores[l.by] = (scores[l.by] || 0) + 2; scores[p.by] = (scores[p.by] || 0) + 1; }
  });
  g.scores = scores; g.coop = { ok, total };
  // 絵を全員に送り直す(答え合わせでは全部見える)
  for (const id of c.members()) for (const ch of g.chains) for (const l of ch.links) c.sendTo(id, { t: "pic", did: l.did, strokes: l.strokes });
  if (c.revealMs !== 0) c.setTimer(c.revealMs || REVEAL_MS, () => finish(c));
}
function finish(c) { c.clearTimer(); c.g.step = "end"; c.finish(c.g.cfg.scoring === "coop" ? {} : c.g.scores); }

// 描いている線を見てよい人へ流す
function relayStroke(c, l, msg) {
  for (const id of c.members()) if (id !== l.by && canSee(c, id, l.did)) c.sendTo(id, msg);
}

function handle(c, pid, m) {
  const g = c.g;
  if (m.a === "pic") {
    // 絵の線をまとめて欲しい(見てよい人だけ)
    if (typeof m.did === "string" && canSee(c, pid, m.did)) { const f = chainOf(g, m.did); c.sendTo(pid, { t: "pic", did: m.did, strokes: f.ch.links[f.i].strokes }); }
    return;
  }
  if (m.a === "done" && g.step === "reveal") { finish(c); return; } // 答え合わせを終える(単独ゲームのホスト用)
  const l = myLink(c, pid);
  if (!l) return;
  if (m.a === "stroke") {
    const s = m.s;
    if (!s || !Array.isArray(s.p) || s.p.length < 2 || s.p.length > MAX_STROKE_POINTS * 2 || l.strokes.length >= MAX_STROKES) return;
    if (l.points + s.p.length / 2 > MAX_POINTS) return "これ以上描けません";
    const p = s.p.map((v) => Math.max(0, Math.min(1000, Math.round(+v || 0))));
    const st = { c: /^#[0-9a-f]{6}$/i.test(s.c) ? s.c : "#181b23", w: [3, 8, 18, 40].includes(s.w) ? s.w : 8, p };
    l.strokes.push(st); l.points += p.length / 2;
    relayStroke(c, l, { t: "stroke", did: l.did, s: st });
    return;
  }
  if (m.a === "undo") { const st = l.strokes.pop(); if (st) l.points -= st.p.length / 2; relayStroke(c, l, { t: "undo", did: l.did }); return; }
  if (m.a === "clear") { l.strokes = []; l.points = 0; relayStroke(c, l, { t: "clear", did: l.did }); return; }
  if (m.a === "words") {
    // 入力途中の言葉を預かる(時間切れのときに使う)。確定の検証は submit で
    const f = chainOf(g, l.did);
    if (f.i > 0) l.guess = toHira(m.guess).slice(0, WORD_MAX);
    l.word = toHira(m.word).slice(0, WORD_MAX);
    return;
  }
  if (m.a === "submit") {
    const f = chainOf(g, l.did);
    const guess = toHira(m.guess), word = toHira(m.word);
    if (f.i > 0 && !isWord(guess)) return "前の絵が何だと思ったか、ひらがなで入れてください";
    if (f.i > 0) l.guess = guess;
    if (!isWord(word)) return "描いた言葉をひらがなで入れてください";
    const need = needChar(g, l);
    if (need && firstChar(word) !== need) return `「${need}」から始まる言葉にしてください`;
    if (lastChar(word) === "ん") return "「ん」で終わる言葉は使えません";
    if (!l.strokes.length) return "絵を描いてください";
    l.word = word; l.done = true;
    if (g.cfg.mode === "relay") { c.clearTimer(); relayNext(c); }
    else checkSim(c);
  }
}
function onLeave(c, pid) {
  const g = c.g;
  if (g.step !== "draw") return;
  if (g.cfg.mode === "relay") { const l = current(c); if (l && l.by === pid && !l.done) { finishLink(c, l); c.clearTimer(); relayNext(c); } }
  else { for (const ch of g.chains) { const l = ch.links[ch.links.length - 1]; if (l.by === pid) finishLink(c, l); } checkSim(c); }
}
// 時間なし設定で止まったときに、ホストが今の番(回)を締め切る
function skip(c) {
  const g = c.g;
  if (g.step !== "draw") return;
  c.clearTimer();
  if (g.cfg.mode === "relay") { finishLink(c, current(c)); relayNext(c); }
  else { for (const ch of g.chains) finishLink(c, ch.links[ch.links.length - 1]); g.round += 1; simRound(c); }
}

function view(c, me) {
  const g = c.g, mine = myLink(c, me);
  const v = { step: g.step, mode: g.cfg.mode, cfg: g.cfg, players: g.players };
  if (g.step === "draw") {
    if (g.cfg.mode === "relay") {
      const l = current(c);
      v.turn = { by: l.by, did: l.did, n: g.turn + 1, total: g.order.length, watch: canSee(c, me, l.did) };
    } else {
      const cur = g.chains.map((ch) => ch.links[ch.links.length - 1]);
      v.round = { n: g.round + 1, total: g.players.length, done: cur.filter((l) => l.done && !l.skipped).map((l) => l.by) };
    }
    if (mine) {
      const f = chainOf(g, mine.did), prev = f.i > 0 ? f.ch.links[f.i - 1] : null;
      v.task = { did: mine.did, first: f.i === 0, start: f.i === 0 ? f.ch.start : null, prevDid: prev ? prev.did : null, prevBy: prev ? prev.by : null, prevEmpty: !!(prev && !prev.strokes.length) };
    }
  } else {
    // 答え合わせ: 全部の言葉と読み取り
    v.chains = g.chains.map((ch) => ({ start: ch.start, links: ch.links.map((l) => ({ by: l.by, did: l.did, guess: l.guess, word: l.word, ok: !!l.ok, skipped: !!l.skipped })) }));
    v.coop = g.coop;
    v.scores = g.cfg.scoring === "coop" ? null : g.scores;
  }
  return v;
}

module.exports = { start, handle, view, onLeave, skip, normalize, DEFAULTS, lastChar, toHira };
