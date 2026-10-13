"use strict";
// エルドラドを目指して(The Quest for El Dorado 風)のルール本体。部屋・入室は games/eldorado.js が受け持つ。
// デッキ構築 × レース。手札4枚で、カードのパワーと同じ種類の地形を進むか、市場でカードを1枚買う。
// 盤面(地形ボードのマスと、公式ルールブックの4つのコース・バリケード)は本家に合わせた。

// ---------------------------------------------------------------
// カード(本家と同じ。市場の各カードは3枚ずつ)
// sym: j=ナタ(ジャングル) w=パドル(川) v=コイン(村) *=どれか1つ  a=アクション
// ---------------------------------------------------------------
const CARDS = {
  explorer: { name: "探検家", sym: "j", p: 1 }, traveler: { name: "旅行者", sym: "v", p: 1 }, sailor: { name: "水夫", sym: "w", p: 1 },
  scout: { name: "偵察者", sym: "j", p: 2, cost: 1 }, trailblazer: { name: "先駆者", sym: "j", p: 3, cost: 3 }, pioneer: { name: "開拓者", sym: "j", p: 5, cost: 5 },
  giant: { name: "大きなナタ", sym: "j", p: 6, cost: 3, once: true }, captain: { name: "船長", sym: "w", p: 3, cost: 2 },
  photographer: { name: "写真家", sym: "v", p: 2, cost: 2 }, journalist: { name: "記者", sym: "v", p: 3, cost: 3 },
  chest: { name: "宝箱", sym: "v", p: 4, cost: 3, once: true }, millionaire: { name: "大富豪", sym: "v", p: 4, cost: 5 },
  jack: { name: "なんでも屋", sym: "*", p: 1, cost: 2 }, adventurer: { name: "冒険家", sym: "*", p: 2, cost: 4 }, plane: { name: "プロペラ機", sym: "*", p: 4, cost: 4, once: true },
  transmitter: { name: "電信機", sym: "a", cost: 4, once: true, text: "好きなカード1枚を無料でもらう(市場の外のカードも可)" },
  cartographer: { name: "製図家", sym: "a", cost: 4, text: "カードを2枚引く" },
  scientist: { name: "科学者", sym: "a", cost: 4, text: "カードを1枚引き、そのあと手札1枚をゲームから除外してよい" },
  compass: { name: "コンパス", sym: "a", cost: 2, once: true, text: "カードを3枚引く" },
  travellog: { name: "探検記録", sym: "a", cost: 3, once: true, text: "カードを2枚引き、そのあと手札を2枚まで除外してよい" },
  native: { name: "原住民", sym: "a", cost: 5, text: "となりのマスへ1マス、条件を無視して進む(バリケードも壊せる)" },
};
const MARKET0 = ["scout", "trailblazer", "jack", "photographer", "chest", "transmitter"];
const RESERVE0 = ["pioneer", "giant", "captain", "journalist", "millionaire", "adventurer", "plane", "cartographer", "scientist", "compass", "travellog", "native"];
const COPIES = 3, HAND = 4;
// バリケード(本家: 1〜6 番。ジャングル1・村1・荒地1・川1・ジャングル2・荒地2)。番号は同点のときの決め手
const BLOCKADES = [{ n: 1, t: "j", v: 1 }, { n: 2, t: "v", v: 1 }, { n: 3, t: "r", v: 1 }, { n: 4, t: "w", v: 1 }, { n: 5, t: "j", v: 2 }, { n: 6, t: "r", v: 2 }];

// ---------------------------------------------------------------
// 地形ボード(1枚37マス。上の行から 4,5,6,7,6,5,4 マス)
// jN ジャングル / wN 川 / vN 村 / rN 荒地(N枚捨てる) / cN ベースキャンプ(N枚除外) / mm 山 / sN スタート
// マスの並びは ShlomoAlon/el-dorado(非公式のデジタル版)が本家のタイル画像から1マスずつ写したものを使用
// ---------------------------------------------------------------
const BOARDS = {
  A: ["j1 c1 j1 j1", "w1 mm j1 j1 v1", "j1 mm v1 j1 j1 j1", "j1 v1 j1 w1 j1 v1 j1", "j1 j1 v1 j1 w1 j1", "j1 j1 j1 j1 j1", "s1 s2 s3 s4"],
  B: ["j1 w1 c1 w1", "j1 j1 v1 mm j1", "j1 v1 j1 j1 j1 j1", "w1 j1 v1 j1 v1 j1 j1", "j1 j1 w1 j1 j1 j1", "j1 j1 j1 j1 j1", "s4 s3 s2 s1"],
  C: ["j1 j1 r1 r1", "j1 v1 r1 w1 w1", "w1 w1 v1 v1 r1 w1", "w1 v1 r1 mm w1 r1 r1", "v1 r1 w1 w1 v1 v1", "v1 r1 j1 v1 w1", "j1 j1 w1 w1"],
  D: ["j2 j1 mm w3", "j1 j1 v3 v1 mm", "j1 w1 j1 mm v3 j1", "j2 w1 w2 mm j1 j1 j2", "j1 w1 w1 w2 w1 j1", "j1 w1 w1 w1 j1", "j1 j1 j1 j2"],
  F: ["j1 mm mm w1", "j2 j1 mm w1 w1", "r1 j1 w2 w3 w1 r1", "r1 v1 v2 mm j2 j1 r1", "r1 v1 r2 j1 j1 r1", "j1 j3 j1 w2 w2", "c1 j2 r1 c2"],
  G: ["j1 j1 j1 j1", "j1 j2 v1 mm j1", "v1 v2 v2 r1 v1 j1", "mm mm v4 v3 v2 j2 c1", "v1 v2 v2 r1 v1 j1", "j1 j2 v1 mm j1", "j1 j1 j1 j1"],
  I: ["j1 j1 j1 j1", "v1 j1 mm j1 j1", "v1 v2 j1 mm j2 j1", "v1 v2 j1 j2 c3 mm mm", "v2 r3 mm mm j2 j1", "w2 w1 w1 j1 j1", "w2 w2 w1 j1"],
  J: ["w1 w1 w1 w1", "w1 mm w2 w1 r2", "w1 w2 j1 j2 r2 r1", "v1 v1 j2 c1 j1 r2 r1", "v1 v2 j1 j1 r2 r1", "v1 v2 v2 mm r1", "v1 v1 v1 r2"],
  K: ["c1 j2 j2 j1", "j1 j1 w3 j1 j2", "j1 j2 j1 j3 j1 j2", "j2 j1 j3 j1 j3 j1 j2", "j2 j1 j3 j1 j2 j1", "j2 j1 v4 j1 j1", "j1 j2 j2 c1"],
  L: ["w1 c1 c1 j3", "j1 w1 w1 j3 j1", "j2 j1 j1 j3 j1 j2", "j2 j1 mm j1 mm j1 j2", "j1 j2 j2 j1 j2 j1", "v2 c2 v2 j1 j1", "j2 j2 j1 mm"],
  M: ["j1 j1 j1 c1", "j1 v4 mm mm w4", "j1 v2 j1 j1 w1 mm", "mm j1 j1 r2 j1 j1 mm", "mm mm mm mm r2 j1", "j1 j1 j1 r2 j1", "w1 w1 j1 j1"],
  N: ["j1 j1 j1 j1", "v1 j1 j2 j1 w1", "v1 v2 j1 w1 w1 w1", "w1 w1 v3 v4 v3 v2 v1", "w1 w1 w1 j1 v2 v1", "j1 j1 j2 j1 j1", "j1 j1 j1 j1"],
};
// 公式ルールブックのコース: [ボード, 中心の q, r, 回転(60°単位)]、ゴール(エルドラド)の中央マスと、その地形
const COURSES = {
  first: { name: "はじめての探検", diff: "かんたん", p: [["B", 0, 0, 2], ["C", 7, -3, 5], ["N", 11, 0, 2], ["I", 14, 4, 2], ["K", 21, -1, 0]], e: [25, -5], s: "w" },
  hills: { name: "黄金の丘", diff: "かんたん", p: [["B", 0, 0, 1], ["C", 3, -7, 0], ["G", 7, -14, 4], ["K", 11, -11, 1], ["J", 14, -7, 1], ["N", 21, -10, 4]], e: [25, -10], s: "j" },
  winding: { name: "曲がりくねった道", diff: "ふつう", p: [["B", 0, 0, 2], ["I", 7, -3, 4], ["F", 11, 0, 4], ["G", 8, 7, 2], ["C", 15, 4, 1], ["N", 19, 7, 5]], e: [23, 7], s: "w" },
  witch: { name: "魔女の大釜", diff: "むずかしい", p: [["A", 0, 0, 0], ["L", 7, -4, 5], ["G", 14, -7, 4], ["D", 18, -4, 4], ["M", 14, 3, 0], ["I", 7, 7, 5]], e: [3, 7], s: "w" },
};
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const K = (q, r) => q + "," + r;
const rot = (q, r, k) => { for (let i = 0; i < k; i++) [q, r] = [-r, q + r]; return [q, r]; };
function parseTok(t) {
  if (t === "mm") return { t: "m", v: 0 };
  if (t[0] === "s") return { t: "s", v: 0, n: +t[1] };
  return { t: t[0], v: +t.slice(1) };
}
// コースを組み立てる: マス(q,r → 地形)・ボードの境目(バリケード)・スタート・ゴール
function buildCourse(id, rnd) {
  const C = COURSES[id], hex = {};
  C.p.forEach(([name, cq, cr, k], ti) => {
    BOARDS[name].forEach((row, i) => {
      const r = i - 3, toks = row.split(" "), qmin = Math.max(-3, -r - 3);
      toks.forEach((tok, j) => { const [lq, lr] = rot(qmin + j, r, k); const q = cq + lq, rr = cr + lr; hex[K(q, rr)] = { q, r: rr, ...parseTok(tok), tile: ti }; });
    });
  });
  const nT = C.p.length;
  // エルドラド: 最後のボードに接する3マス(指定のマスと、その両どなり)
  const touch = (q, r) => !hex[K(q, r)] && DIRS.some(([a, b]) => { const n = hex[K(q + a, r + b)]; return n && n.tile === nT - 1 && n.t !== "m"; });
  const [eq, er] = C.e;
  let side = null;
  for (let d = 0; d < 3 && !side; d++) { const a = [eq + DIRS[d][0], er + DIRS[d][1]], b = [eq - DIRS[d][0], er - DIRS[d][1]]; if (touch(...a) && touch(...b)) side = [a, b]; }
  if (!side) side = DIRS.map(([a, b]) => [eq + a, er + b]).filter((x) => touch(...x)).slice(0, 2);
  for (const [q, r] of [[eq, er], ...side]) hex[K(q, r)] = { q, r, t: "g", sym: C.s, v: 1, tile: nT };
  // ボードの境目(順番に隣り合うボードの間)。ここにバリケードを1つずつ(ランダム)
  const conns = [];
  for (let i = 0; i < nT - 1; i++) conns.push({ a: i, b: i + 1 });
  const deal = shuffle([...BLOCKADES], rnd);
  const blockades = conns.map((cn, i) => ({ ...deal[i], a: cn.a, b: cn.b, by: null }));
  const starts = Object.values(hex).filter((h) => h.t === "s").sort((x, y) => x.n - y.n).map((h) => K(h.q, h.r));
  const goals = Object.values(hex).filter((h) => h.t === "g").map((h) => K(h.q, h.r));
  return { id, name: C.name, hex, blockades, starts, goals, endSym: C.s };
}
const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const DEFAULTS = { course: "first", turnSecs: 120 };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if (COURSES[r.course]) out.course = r.course;
  if ([0, 60, 120, 180].includes(r.turnSecs)) out.turnSecs = r.turnSecs;
  return out;
}

// ---------------------------------------------------------------
// 準備
// ---------------------------------------------------------------
const nb = (key) => { const [q, r] = key.split(",").map(Number); return DIRS.map(([a, b]) => K(q + a, r + b)); };
function start(c, settings) {
  const cfg = normalize(settings);
  const order = shuffle([...c.members()]);
  const course = buildCourse(cfg.course);
  const g = c.g = { cfg, course, order, cur: 0, P: {}, uid: 0, market: MARKET0.map((k) => ({ k, n: COPIES })), reserve: Object.fromEntries(RESERVE0.map((k) => [k, COPIES])),
    bought: false, move: null, pending: null, finalRound: false, endIdx: null, log: [], turnNo: 1, step: "play", result: null };
  // 2人は1人2コマ(スタート1・3 と 2・4)。3〜4人は1人1コマ
  const two = order.length === 2;
  order.forEach((id, i) => {
    const deck = shuffle([...Array(3).fill("explorer"), ...Array(4).fill("traveler"), "sailor"].map((k) => ({ id: ++g.uid, k })));
    const pieces = two ? [course.starts[i], course.starts[i + 2]] : [course.starts[i]];
    g.P[id] = { deck, hand: [], discard: [], played: [], removed: 0, pieces, done: pieces.map(() => false), blockades: [] };
    draw(g, id, HAND);
  });
  log(g, `コース「${course.name}」。${nm(c, order[0])} からスタート`);
  arm(c);
}
const nm = (c, id) => c.nameOf(id);
function log(g, t) { g.log.push(t); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); }
function draw(g, id, n) {
  const p = g.P[id];
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) { if (!p.discard.length) break; p.deck = shuffle(p.discard); p.discard = []; }
    p.hand.push(p.deck.pop());
  }
}
const curId = (g) => g.order[g.cur];
const occupied = (g, key) => g.order.some((id) => g.P[id].pieces.some((k, i) => !g.P[id].done[i] && k === key));
// ボードの境目にバリケードが残っていれば、その間は通れない
function blockadeBetween(g, a, b) {
  const ha = g.course.hex[a], hb = g.course.hex[b];
  if (!ha || !hb || Math.abs(ha.tile - hb.tile) !== 1) return null;
  const bl = g.course.blockades.find((x) => x.a === Math.min(ha.tile, hb.tile) && x.b === Math.max(ha.tile, hb.tile));
  return bl && !bl.by ? bl : null;
}
// コインの価値: コインのカードはパワー、どれかを選べるカードもパワー、ほかは 0.5
const coinOf = (card) => { const d = CARDS[card.k]; return d.sym === "v" || d.sym === "*" ? d.p : 0.5; };

// 手札から出す。アイテム(1回限り)を効果に使ったときはゲームから除外、それ以外は場に出す
function playFromHand(g, id, cardId, useEffect) {
  const p = g.P[id], i = p.hand.findIndex((x) => x.id === cardId);
  if (i < 0) return null;
  const [card] = p.hand.splice(i, 1);
  if (useEffect && CARDS[card.k].once) p.removed++; else p.played.push(card);
  return card;
}
function pieceAt(g, id, piece) { const p = g.P[id]; return Number.isInteger(piece) && p.pieces[piece] != null && !p.done[piece] ? piece : p.done.findIndex((d) => !d); }

// ---------------------------------------------------------------
// 移動
// ---------------------------------------------------------------
// カード1枚で進む(残ったパワーで続けて進める)。to: 隣のマス
function moveWithCard(c, id, m) {
  const g = c.g, p = g.P[id], hex = g.course.hex;
  let mv = g.move;
  if (!mv || mv.card !== m.card) {
    // 新しいカードを使う
    const card = p.hand.find((x) => x.id === m.card);
    if (!card) return "そのカードは手札にありません";
    const d = CARDS[card.k];
    if (d.sym === "a") return "アクションカードでは進めません";
    const piece = pieceAt(g, id, m.piece);
    if (piece < 0) return "動かせるコマがありません";
    mv = { card: card.id, k: card.k, sym: d.sym, left: d.p, piece };
  }
  const from = p.pieces[mv.piece], to = m.to, h = hex[to];
  if (!h || !nb(from).includes(to)) return "となりのマスを選んでください";
  if (h.t === "m") return "山には入れません";
  if (h.t === "s") return "スタートのマスには戻れません";
  if (occupied(g, to)) return "ほかのコマがいるマスには入れません";
  if (blockadeBetween(g, from, to)) return "先にバリケードを取り除いてください";
  if (h.t === "r" || h.t === "c") return "荒地・ベースキャンプは「カードを選んで入る」で入ります";
  const need = h.t === "g" ? h.sym : h.t;
  const sym = mv.sym === "*" ? (mv.fixed || need) : mv.sym;
  if (sym !== need) return `このマスには${SYMJ[need]}が必要です`;
  if (h.v > mv.left) return `パワーが足りません(必要 ${h.v} / 残り ${mv.left})`;
  // 確定: 新しいカードなら手札から出す
  if (g.move !== mv) { endMove(g); playFromHand(g, id, mv.card, true); g.move = mv; }
  mv.fixed = sym; mv.left -= h.v;
  enter(c, id, mv.piece, to);
  if (g.move && mv.left <= 0) g.move = null;
}
const SYMJ = { j: "ナタ", w: "パドル", v: "コイン" };
function endMove(g) { g.move = null; }
function enter(c, id, piece, to) {
  const g = c.g, p = g.P[id], h = g.course.hex[to];
  p.pieces[piece] = to;
  if (h.t === "g") {
    p.done[piece] = true; g.move = null;
    log(g, `${nm(c, id)} のコマがエルドラドに到着！`);
    if (p.done.every(Boolean) && !g.finalRound) {
      // 最後のラウンド: このラウンドの最後の人まで遊んで終わり(最後の人なら今すぐ終わり)
      g.finalRound = true; g.endIdx = g.order.length - 1;
      log(g, "最後のラウンド！");
    }
  }
}
// 荒地(N枚捨てる)・ベースキャンプ(N枚ゲームから除外)に入る
function enterWithCards(c, id, m) {
  const g = c.g, p = g.P[id], hex = g.course.hex, piece = pieceAt(g, id, m.piece);
  if (piece < 0) return;
  const from = p.pieces[piece], h = hex[m.to];
  if (!h || !nb(from).includes(m.to)) return "となりのマスを選んでください";
  if (h.t !== "r" && h.t !== "c") return "このマスはカードの種類とパワーで入ります";
  if (occupied(g, m.to)) return "ほかのコマがいるマスには入れません";
  if (blockadeBetween(g, from, m.to)) return "先にバリケードを取り除いてください";
  const ids = Array.isArray(m.cards) ? [...new Set(m.cards)] : [];
  if (ids.length !== h.v || !ids.every((x) => p.hand.some((y) => y.id === x))) return `手札から${h.v}枚選んでください`;
  endMove(g);
  for (const x of ids) {
    const card = playFromHand(g, id, x, false);
    if (h.t === "c") { p.played.pop(); p.removed++; } // ベースキャンプ: 使ったカードはゲームから除外
  }
  if (h.t === "c") log(g, `${nm(c, id)} がベースキャンプでカードを${ids.length}枚除外`);
  enter(c, id, piece, m.to);
}
// バリケードを取り除く(となりのボードとの境目にいるとき)
function breakBlockade(c, id, m) {
  const g = c.g, p = g.P[id], bl = g.course.blockades.find((x) => x.n === m.n);
  if (!bl || bl.by) return "そのバリケードはありません";
  const piece = pieceAt(g, id, m.piece);
  if (piece < 0) return;
  const from = p.pieces[piece];
  if (!nb(from).some((x) => blockadeBetween(g, from, x) === bl)) return "そのバリケードのとなりにいません";
  if (bl.t === "r") {
    const ids = Array.isArray(m.cards) ? [...new Set(m.cards)] : [];
    if (ids.length !== bl.v || !ids.every((x) => p.hand.some((y) => y.id === x))) return `手札から${bl.v}枚選んでください`;
    endMove(g); for (const x of ids) playFromHand(g, id, x, false);
  } else {
    let mv = g.move;
    if (!mv || mv.card !== m.card) {
      const card = p.hand.find((x) => x.id === m.card); if (!card) return "カードを選んでください";
      const d = CARDS[card.k]; if (d.sym === "a") return "アクションカードでは取り除けません";
      mv = { card: card.id, k: card.k, sym: d.sym, left: d.p, piece };
    }
    const sym = mv.sym === "*" ? (mv.fixed || bl.t) : mv.sym;
    if (sym !== bl.t) return `このバリケードには${SYMJ[bl.t]}が必要です`;
    if (bl.v > mv.left) return "パワーが足りません";
    if (g.move !== mv) { endMove(g); playFromHand(g, id, mv.card, true); g.move = mv; }
    mv.fixed = sym; mv.left -= bl.v;
    if (mv.left <= 0) g.move = null;
  }
  bl.by = id; p.blockades.push(bl.n);
  log(g, `${nm(c, id)} がバリケード(${bl.n})を取り除いた`);
}

// ---------------------------------------------------------------
// 購入・アクション
// ---------------------------------------------------------------
function buy(c, id, m, free) {
  const g = c.g, p = g.P[id], k = m.k, d = CARDS[k];
  if (!d || !d.cost) return "買えないカードです";
  const slot = g.market.findIndex((s) => s && s.k === k);
  const hole = g.market.findIndex((s) => !s);
  if (slot < 0) {
    if (!g.reserve[k]) return "売り切れです";
    if (hole < 0 && !free) return "市場に空きがないので、市場の外のカードは買えません";
  }
  if (!free) {
    if (g.bought) return "カードを買えるのは1ターンに1枚です";
    const ids = Array.isArray(m.cards) ? [...new Set(m.cards)] : [];
    if (!ids.every((x) => p.hand.some((y) => y.id === x))) return "手札のカードで払ってください";
    const total = ids.reduce((n, x) => n + coinOf(p.hand.find((y) => y.id === x)), 0);
    if (total < d.cost) return `コインが足りません(${total} / ${d.cost})`;
    endMove(g);
    // コインとして効果を使ったアイテム(宝箱・プロペラ機)は除外。0.5 として使ったものは場へ
    for (const x of ids) { const card = p.hand.find((y) => y.id === x); playFromHand(g, id, x, CARDS[card.k].once && (CARDS[card.k].sym === "v" || CARDS[card.k].sym === "*")); }
    g.bought = true;
  }
  // 市場から1枚減らす。市場の外から買ったら、その山を空きに置く
  if (slot >= 0) { g.market[slot].n--; if (!g.market[slot].n) g.market[slot] = null; }
  else { g.reserve[k]--; const left = g.reserve[k]; delete g.reserve[k]; if (hole >= 0) { if (left) g.market[hole] = { k, n: left }; } else if (left) g.reserve[k] = left; }
  p.discard.push({ id: ++g.uid, k });
  log(g, `${nm(c, id)} が ${d.name} を${free ? "電信機でもらった" : "買った"}`);
}
function action(c, id, m) {
  const g = c.g, p = g.P[id], card = p.hand.find((x) => x.id === m.card);
  if (!card || CARDS[card.k].sym !== "a") return "アクションカードを選んでください";
  const k = card.k;
  if (k === "transmitter") { const e = buy(c, id, { k: m.k }, true); if (e) return e; }
  if (k === "native") {
    const piece = pieceAt(g, id, m.piece); if (piece < 0) return;
    const from = p.pieces[piece], h = g.course.hex[m.to];
    if (!h || !nb(from).includes(m.to)) return "となりのマスを選んでください";
    if (h.t === "m" || h.t === "s") return "そのマスには入れません";
    if (occupied(g, m.to)) return "ほかのコマがいるマスには入れません";
    const bl = blockadeBetween(g, from, m.to);
    if (bl) { bl.by = id; p.blockades.push(bl.n); log(g, `${nm(c, id)} が原住民でバリケード(${bl.n})を取り除いた`); }
    endMove(g); playFromHand(g, id, card.id, true);
    enter(c, id, piece, m.to);
    log(g, `${nm(c, id)} が原住民で1マス進んだ`);
    return;
  }
  endMove(g);
  playFromHand(g, id, card.id, true);
  if (k === "cartographer") draw(g, id, 2);
  if (k === "compass") draw(g, id, 3);
  if (k === "scientist") { draw(g, id, 1); g.pending = { pid: id, max: 1, title: "科学者: 手札から1枚ゲームから除外してよい" }; }
  if (k === "travellog") { draw(g, id, 2); g.pending = { pid: id, max: 2, title: "探検記録: 手札から2枚までゲームから除外してよい" }; }
  log(g, `${nm(c, id)} が ${CARDS[k].name} を使った`);
}
function trash(c, id, ids) {
  const g = c.g, p = g.P[id], pd = g.pending;
  if (!pd || pd.pid !== id) return;
  const list = (Array.isArray(ids) ? [...new Set(ids)] : []).slice(0, pd.max).filter((x) => p.hand.some((y) => y.id === x));
  for (const x of list) { p.hand.splice(p.hand.findIndex((y) => y.id === x), 1); p.removed++; }
  if (list.length) log(g, `${nm(c, id)} が手札を${list.length}枚ゲームから除外`);
  g.pending = null;
}

// ---------------------------------------------------------------
// ターンの終わり・ゲームの終わり
// ---------------------------------------------------------------
function endTurn(c, id, keepIds) {
  const g = c.g, p = g.P[id];
  g.pending = null; endMove(g);
  p.discard.push(...p.played); p.played = [];
  const keep = new Set(Array.isArray(keepIds) ? keepIds : p.hand.map((x) => x.id));
  p.discard.push(...p.hand.filter((x) => !keep.has(x.id)));
  p.hand = p.hand.filter((x) => keep.has(x.id));
  draw(g, id, HAND - p.hand.length);
  g.bought = false;
  if (g.finalRound && g.cur >= g.endIdx) return finish(c);
  g.cur = (g.cur + 1) % g.order.length;
  if (g.cur === 0) g.turnNo++;
  // 全部のコマが着いた人の番は飛ばす(最後のラウンドでなければ起きない)
  arm(c);
}
// ゴールまでの近さ(着かなかった人の順位用): 入れるマスをたどった歩数
function distance(g, from) {
  const hex = g.course.hex, seen = new Set([from]), q = [[from, 0]];
  while (q.length) {
    const [k, d] = q.shift();
    if (hex[k].t === "g") return d;
    for (const n of nb(k)) if (hex[n] && !seen.has(n) && hex[n].t !== "m" && hex[n].t !== "s") { seen.add(n); q.push([n, d + 1]); }
  }
  return 999;
}
function finish(c) {
  const g = c.g;
  g.step = "end"; c.clearTimer();
  const score = (id) => {
    const p = g.P[id], arrived = p.done.every(Boolean);
    const dist = p.pieces.reduce((n, k, i) => n + (p.done[i] ? 0 : distance(g, k)), 0);
    return { id, arrived, nb: p.blockades.length, top: Math.max(0, ...p.blockades), dist };
  };
  const rows = g.order.map(score).sort((a, b) => (b.arrived - a.arrived) || (b.nb - a.nb) || (b.top - a.top) || (a.dist - b.dist));
  g.result = rows;
  const raw = {};
  rows.forEach((r, i) => { raw[r.id] = 100 - i; });
  // 同じ条件(着いた・バリケード数・最大番号が同じ)は同順位
  rows.forEach((r, i) => { if (i && r.arrived && rows[i - 1].arrived && r.nb === rows[i - 1].nb && r.top === rows[i - 1].top) raw[r.id] = raw[rows[i - 1].id]; });
  log(g, rows[0].arrived ? `🏆 ${nm(c, rows[0].id)} の勝ち！` : "ゲーム終了");
  c.finish(raw);
}
// 持ち時間(時間切れはそのままターン終了。手札は残す)。切断中の人は20秒
function arm(c) {
  const g = c.g;
  if (g.step !== "play") return c.clearTimer();
  const id = curId(g), away = !c.live().includes(id);
  const ms = away ? 20000 : g.cfg.turnSecs * 1000;
  if (!ms) return c.clearTimer();
  const turn = g.turnNo + ":" + g.cur;
  c.setTimer(ms, () => { if (g.step === "play" && g.turnNo + ":" + g.cur === turn) { log(g, `${nm(c, id)} は時間切れ`); endTurn(c, id); } });
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step !== "play") return;
  if (curId(g) !== pid) return "あなたの番ではありません";
  if (g.pending && m.a !== "trash") return "先に除外するカードを決めてください";
  switch (m.a) {
    case "move": return moveWithCard(c, pid, m);
    case "enterCards": return enterWithCards(c, pid, m);
    case "blockade": return breakBlockade(c, pid, m);
    case "buy": return buy(c, pid, m, false);
    case "action": return action(c, pid, m);
    case "trash": return trash(c, pid, m.ids);
    case "stop": endMove(g); return;
    case "end": return endTurn(c, pid, m.keep);
    default: return;
  }
}
function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step !== "play" || !g.P[pid]) return;
  // 抜けた人のコマは盤から外し、順番からも外す
  const i = g.order.indexOf(pid);
  log(g, `${nm(c, pid)} が抜けた`);
  delete g.P[pid]; g.order.splice(i, 1);
  if (g.order.length < 1) return;
  if (g.cur > i) g.cur--;
  if (g.cur >= g.order.length) { g.cur = 0; g.turnNo++; }
  if (g.endIdx != null) g.endIdx = Math.min(g.endIdx, g.order.length - 1);
  g.move = null; g.pending = null; g.bought = false;
  arm(c);
}

function view(c, me) {
  const g = c.g, mine = g.P[me];
  const hexes = Object.entries(g.course.hex).map(([k, h]) => [k, h.t, h.v, h.sym || null, h.tile]);
  return {
    step: g.step, cfg: g.cfg, course: { id: g.course.id, name: g.course.name, endSym: g.course.endSym }, hexes,
    blockades: g.course.blockades.map((b) => ({ n: b.n, t: b.t, v: b.v, a: b.a, b: b.b, by: b.by })),
    order: g.order, cur: curId(g), turnNo: g.turnNo, finalRound: g.finalRound,
    P: Object.fromEntries(g.order.map((id) => { const p = g.P[id]; return [id, { pieces: p.pieces, done: p.done, deck: p.deck.length, discard: p.discard.length, hand: p.hand.length, played: p.played.map((x) => x.k), removed: p.removed, blockades: p.blockades, deckSize: p.deck.length + p.discard.length + p.hand.length + p.played.length }]; })),
    hand: mine ? mine.hand : null, myDeck: mine ? [...mine.deck, ...mine.discard, ...mine.hand, ...mine.played].map((x) => x.k) : null,
    market: g.market, reserve: g.reserve, bought: g.bought, move: g.move && curId(g) === me ? g.move : g.move ? { k: g.move.k, left: g.move.left, sym: g.move.fixed || g.move.sym } : null,
    pending: g.pending && g.pending.pid === me ? g.pending : null, result: g.result, log: g.log.slice(-14),
  };
}

module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, CARDS, COURSES, BOARDS, MARKET0, RESERVE0, _t: { buildCourse, distance, coinOf, blockadeBetween } };
