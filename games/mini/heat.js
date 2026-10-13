"use strict";
// ヒート(Heat: Pedal to the Metal 風)のルール本体。部屋・入室は games/heat.js が受け持つ。
// 出典: 本家の基本ルールブック(英語版)と Board Game Arena の遊び方ページ。
//   デッキ: スピードカード1〜4を各3枚・スタートアップグレード(0・5・ヒート1枚)・ストレス3枚。エンジンにヒート6枚。
//   ラウンド: ①ギアを変える(±1、±2はヒート1) ②ギアの数だけカードを伏せる(ここまで全員同時)
//   ③先頭の車から順に公開して進む ④最後尾(5台以上なら後ろ2台)はアドレナリン(+1マス・クールダウン+1)
//   ⑤リアクト(クールダウン: 1速3・2速1 / ブースト: ヒート1でめくって進む、1ターン1回)
//   ⑥スリップストリーム(横か1マス前に車がいれば+2マス) ⑦コーナー(速度が制限を超えた分ヒートを払う。払えないとスピン)
//   ⑧捨て札(ストレス・ヒート・5は捨てられない) ⑨7枚まで引く。
// コース: 盤面画像から読み取った4コース(各区間のマス数の合計が盤の表示と一致することを確認済み)。
//   cells は盤(1650×1100)上の各マスの中心。index 0 はゴールラインのすぐ先のマス。corners[].at はコーナーラインの先の最初のマス。

const TRACKS = {
  usa: {
    name: "USA", laps: 2, heat: 6, stress: 3, n: 69,
    corners: [{ at: 12, lim: 4, x: 1524, y: 925 }, { at: 33, lim: 3, x: 160, y: 989 }, { at: 49, lim: 3, x: 771, y: 105 }, { at: 57, lim: 2, x: 610, y: 628 }],
    cells: "1277,216 1343,235 1402,278 1447,335 1476,400 1499,468 1517,537 1535,607 1548,678 1558,751 1560,826 1540,894 1503,949 1450,986 1389,1002 1324,1004 1256,1002 1189,1002 1121,1000 1054,998 986,999 920,1003 852,1006 785,1007 716,1007 650,1003 583,1000 515,999 447,1000 380,1003 315,1011 250,1018 187,1006 139,958 134,884 180,827 253,809 321,782 381,735 422,673 447,604 469,532 491,461 515,392 543,323 576,257 617,193 665,135 732,104 806,122 842,188 827,264 783,328 740,393 701,459 660,526 620,592 627,659 694,681 745,632 783,569 824,508 866,448 909,389 957,331 1006,276 1064,230 1131,205 1207,203",
  },
  italia: {
    name: "Italia", laps: 3, heat: 6, stress: 3, n: 54,
    corners: [{ at: 10, lim: 5, x: 967, y: 981 }, { at: 19, lim: 2, x: 710, y: 445 }, { at: 26, lim: 3, x: 667, y: 938 }],
    cells: "1322,476 1326,546 1321,617 1302,684 1264,742 1214,792 1161,836 1111,886 1058,934 1000,973 930,980 866,950 828,890 812,820 796,751 778,682 762,612 745,544 727,475 668,441 606,486 620,571 641,653 664,735 688,816 686,900 637,956 568,960 509,922 483,857 465,788 449,718 434,649 423,581 418,511 390,451 389,377 408,309 442,247 492,193 547,147 608,115 676,96 748,86 822,83 898,85 970,94 1040,109 1105,136 1163,176 1212,227 1251,287 1282,349 1311,412",
  },
  france: {
    name: "France", laps: 2, heat: 6, stress: 3, n: 60,
    corners: [{ at: 12, lim: 5, x: 171, y: 490 }, { at: 20, lim: 2, x: 655, y: 172 }, { at: 27, lim: 4, x: 537, y: 637 }, { at: 39, lim: 3, x: 1045, y: 139 }, { at: 47, lim: 4, x: 1492, y: 479 }],
    cells: "791,959 721,947 654,930 589,906 527,875 470,835 416,787 366,732 324,676 278,621 221,579 180,524 175,450 210,382 277,346 353,328 426,306 498,281 565,244 621,189 692,184 723,253 674,318 620,380 573,446 536,517 528,598 558,667 622,704 696,704 763,673 823,630 879,576 926,518 963,454 993,387 1008,314 1001,238 1020,167 1081,125 1158,137 1202,201 1221,278 1255,348 1315,400 1390,420 1462,450 1504,511 1507,582 1478,645 1421,688 1366,735 1311,781 1257,827 1199,867 1137,900 1073,926 1006,946 937,958 864,963",
  },
  gb: {
    name: "Great Britain", laps: 2, heat: 6, stress: 3, n: 63,
    corners: [{ at: 15, lim: 10, x: 1466, y: 111 }, { at: 30, lim: 6, x: 1196, y: 988 }, { at: 37, lim: 5, x: 1158, y: 517 }, { at: 43, lim: 4, x: 720, y: 600 }, { at: 48, lim: 3, x: 981, y: 840 }],
    cells: "515,179 564,135 621,103 683,84 751,79 820,76 889,79 958,77 1027,80 1096,80 1167,80 1236,81 1305,77 1373,82 1437,96 1495,130 1539,187 1557,256 1560,330 1555,403 1542,473 1527,543 1511,612 1489,678 1463,743 1432,806 1395,858 1351,914 1297,963 1232,989 1159,977 1103,922 1085,847 1093,767 1119,695 1159,630 1169,554 1130,487 1052,473 981,510 911,547 828,551 750,572 709,640 729,717 801,756 881,776 954,812 979,878 932,930 861,907 793,877 726,846 659,814 594,777 532,733 485,672 453,605 435,532 430,455 441,379 462,307 481,235",
  },
};
for (const t of Object.values(TRACKS)) t.xy = t.cells.split(" ").map((p) => p.split(",").map(Number));

const HAND = 7, MAX_GEAR = 4;
const COOL_BY_GEAR = [0, 3, 1, 0, 0];
// カードの種類: s1〜s4 スピード / u0・u5 スタートアップグレード / h ヒート / x ストレス
const CARDS = {
  s1: { v: 1, speed: true }, s2: { v: 2, speed: true }, s3: { v: 3, speed: true }, s4: { v: 4, speed: true },
  u0: { v: 0, up: true }, u5: { v: 5, up: true, keep: true }, h: { heat: true, keep: true }, x: { stress: true, keep: true },
};

const DEFAULTS = { track: "usa", laps: 0, planSecs: 60, turnSecs: 45 };
function normalize(raw) {
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  return {
    track: pick(raw.track, Object.keys(TRACKS), DEFAULTS.track),
    laps: pick(Number(raw.laps), [0, 1, 2, 3], DEFAULTS.laps), // 0 = 盤に書かれた周回数
    planSecs: pick(Number(raw.planSecs), [30, 45, 60, 90, 120], DEFAULTS.planSecs),
    turnSecs: pick(Number(raw.turnSecs), [20, 30, 45, 60, 90], DEFAULTS.turnSecs),
  };
}

const log = (g, t) => { g.log.push(t); if (g.log.length > 120) g.log.shift(); };
const nm = (c, id) => c.nameOf(id);
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const val = (k) => CARDS[k].v || 0;
const cardName = (k) => (k === "h" ? "ヒート" : k === "x" ? "ストレス" : String(val(k)));

function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const T = TRACKS[cfg.track];
  const order = shuffle(c.members().slice(), rnd); // スタートグリッドの順(1番がポールポジション)
  const g = {
    cfg, track: cfg.track, N: T.n, laps: cfg.laps || T.laps, order, P: {}, round: 0, step: "plan", moveOrder: [], mi: 0, turn: null,
    hall: [], started: order.length, log: [], nextId: 1, rnd, seq: 0,
  };
  g.goal = g.laps * g.N;
  order.forEach((id, i) => {
    const mk = (k) => ({ id: g.nextId++, k });
    const deck = [];
    for (const k of ["s1", "s2", "s3", "s4"]) for (let j = 0; j < 3; j++) deck.push(mk(k));
    deck.push(mk("u0"), mk("u5"), mk("h"));
    for (let j = 0; j < T.stress; j++) deck.push(mk("x"));
    const engine = []; for (let j = 0; j < T.heat; j++) engine.push(mk("h"));
    // グリッド: 1・2番が最前列(ゴールラインのすぐ手前のマス)
    g.P[id] = { deck: shuffle(deck, rnd), hand: [], discard: [], engine, gear: 1, play: [], plan: null, pos: -1 - Math.floor(i / 2), spot: i % 2, done: false, laps: 0, last: null };
    draw(g, id, HAND);
  });
  c.g = g;
  log(g, `${T.name}・${g.laps}周のレース開始！`);
  newRound(c);
}

// ---- デッキ ----
function refill(g, p) {
  if (p.deck.length || !p.discard.length) return;
  p.deck = shuffle(p.discard, g.rnd); p.discard = [];
}
function draw(g, id, upTo) {
  const p = g.P[id];
  while (p.hand.length < upTo) { refill(g, p); if (!p.deck.length) break; p.hand.push(p.deck.pop()); }
}
// ストレス・ブースト: スピードカードが出るまでめくる(ほかのカードは捨て札へ)
function flipSpeed(g, id) {
  const p = g.P[id], skipped = [];
  for (let guard = 0; guard < 60; guard++) {
    refill(g, p);
    if (!p.deck.length) break;
    const card = p.deck.pop();
    if (CARDS[card.k].speed) { p.play.push(card); return { card, skipped }; }
    p.discard.push(card); skipped.push(card.k);
  }
  return { card: null, skipped };
}
function payHeat(g, id, n) {
  const p = g.P[id], x = Math.min(n, p.engine.length);
  for (let i = 0; i < x; i++) p.discard.push(p.engine.pop());
  return x;
}

// ---- 盤 ----
const active = (g) => g.order.filter((id) => g.P[id] && !g.P[id].done);
const onTrack = (g) => g.order.filter((id) => g.P[id] && !g.P[id].removed);
function occupants(g, pos, except) { return onTrack(g).filter((id) => id !== except && g.P[id].pos === pos); }
// 進む先のマスがいっぱい(2台)なら、空きのある最初のマスまで下がる
function place(g, id, target) {
  const p = g.P[id];
  let t = target;
  while (occupants(g, t, id).length >= 2) t--;
  const taken = occupants(g, t, id).map((o) => g.P[o].spot);
  p.pos = t; p.spot = taken.includes(0) ? 1 : 0;
  return t;
}
// 前にいる順(同じマスならレースライン側が前)
const ahead = (g, a, b) => g.P[b].pos - g.P[a].pos || g.P[a].spot - g.P[b].spot;
function cornersBetween(g, from, to) {
  const T = TRACKS[g.track], out = [];
  for (let lap = Math.floor(Math.max(from, 0) / g.N) - 1; lap <= Math.floor(to / g.N) + 1; lap++)
    for (let ci = 0; ci < T.corners.length; ci++) {
      const x = lap * g.N + T.corners[ci].at;
      if (x > from && x <= to && x <= g.goal) out.push({ x, ci, lim: T.corners[ci].lim });
    }
  return out.sort((a, b) => a.x - b.x);
}
function nextCorner(g, pos) {
  const T = TRACKS[g.track];
  let best = null;
  for (let lap = Math.floor(Math.max(pos, 0) / g.N); lap <= Math.floor(Math.max(pos, 0) / g.N) + 1; lap++)
    for (let ci = 0; ci < T.corners.length; ci++) {
      const x = lap * g.N + T.corners[ci].at;
      if (x > pos && x <= g.goal && (!best || x < best.x)) best = { x, ci, lim: T.corners[ci].lim, dist: x - pos };
    }
  return best;
}

// ---- ラウンド ----
function newRound(c) {
  const g = c.g;
  g.round++;
  g.step = "plan"; g.turn = null; g.mi = 0; g.moveOrder = []; g.seq++;
  for (const id of active(g)) Object.assign(g.P[id], { plan: null, play: [], last: null });
  arm(c);
}
function planOf(g, id, shift, ids) {
  const p = g.P[id];
  if (![-2, -1, 0, 1, 2].includes(shift)) return "ギアの変え方が正しくありません";
  const gear = p.gear + shift;
  if (gear < 1 || gear > MAX_GEAR) return "ギアは1〜4です";
  if (Math.abs(shift) === 2 && !p.engine.length) return "2段変えるにはエンジンにヒートが1枚必要です";
  if (!Array.isArray(ids)) return "カードを選んでください";
  const uniq = [...new Set(ids.map(Number))];
  const cards = uniq.map((x) => p.hand.find((cd) => cd.id === x));
  if (cards.some((cd) => !cd)) return "手札にないカードがあります";
  const playable = p.hand.filter((cd) => !CARDS[cd.k].heat).length;
  const clutter = playable < gear;
  if (cards.length !== gear) return `${gear}速なのでカードは${gear}枚です`;
  if (!clutter && cards.some((cd) => CARDS[cd.k].heat)) return "ヒートカードは出せません";
  if (clutter && cards.filter((cd) => !CARDS[cd.k].heat).length !== playable) return "出せるカードは全部出してください(足りない分だけヒート)";
  return { shift, gear, ids: uniq, clutter };
}
function submitPlan(c, id, m) {
  const g = c.g;
  if (g.step !== "plan" || !g.P[id] || g.P[id].done) return "今はカードを出せません";
  const r = planOf(g, id, Number(m.shift), m.ids);
  if (typeof r === "string") return r;
  g.P[id].plan = r;
  if (active(g).every((x) => g.P[x].plan || !c.has(x))) beginMoves(c);
}
function autoPlan(g, id) {
  const p = g.P[id];
  const playable = p.hand.filter((cd) => !CARDS[cd.k].heat);
  const gear = p.gear;
  // 時間切れ: ギアはそのまま、小さい数字から出す(ストレスは先に)
  const sorted = playable.slice().sort((a, b) => (CARDS[b.k].stress ? 1 : 0) - (CARDS[a.k].stress ? 1 : 0) || val(a.k) - val(b.k));
  let ids = sorted.slice(0, gear).map((cd) => cd.id);
  if (ids.length < gear) ids = ids.concat(p.hand.filter((cd) => CARDS[cd.k].heat).slice(0, gear - ids.length).map((cd) => cd.id));
  return planOf(g, id, 0, ids);
}
function beginMoves(c) {
  const g = c.g;
  for (const id of active(g)) {
    const p = g.P[id];
    if (!p.plan || typeof p.plan === "string") p.plan = autoPlan(g, id);
    if (typeof p.plan === "string") p.plan = { shift: 0, gear: p.gear, ids: p.hand.slice(0, p.gear).map((cd) => cd.id), clutter: true };
    const { shift, gear, ids } = p.plan;
    if (Math.abs(shift) === 2) payHeat(g, id, 1);
    p.gear = gear;
    p.play = ids.map((x) => p.hand.find((cd) => cd.id === x)).filter(Boolean);
    p.hand = p.hand.filter((cd) => !ids.includes(cd.id));
  }
  g.moveOrder = active(g).sort((a, b) => ahead(g, a, b));
  const k = g.started >= 5 ? 2 : 1;
  g.adrenaline = g.moveOrder.slice(-k);
  g.step = "move"; g.mi = 0;
  startTurn(c);
}

// ---- 1台ずつ ----
function startTurn(c) {
  const g = c.g;
  while (g.mi < g.moveOrder.length && (!g.P[g.moveOrder[g.mi]] || g.P[g.moveOrder[g.mi]].done)) g.mi++;
  if (g.mi >= g.moveOrder.length) return endRound(c);
  const id = g.moveOrder[g.mi], p = g.P[id];
  const t = g.turn = { pid: id, start: p.pos, speed: 0, flips: [], phase: "react", adrenaline: g.adrenaline.includes(id), adrUsed: false, boosted: false, cool: COOL_BY_GEAR[p.gear], coolUsed: 0, notes: [] };
  if (t.adrenaline) t.cool += 1;
  g.seq++;
  if (p.plan.clutter) {
    // 手札がヒートだらけ: 動けない。ギアは1速、出したカードは捨て札へ
    log(g, `${nm(c, id)} はオーバーヒートで動けない(1速へ)`);
    p.gear = 1;
    p.last = { speed: 0, clutter: true, from: p.pos, to: p.pos };
    return finishTurn(c, []);
  }
  let speed = 0;
  for (const cd of p.play.slice()) {
    if (CARDS[cd.k].stress) {
      const f = flipSpeed(g, id);
      t.flips.push({ by: "stress", card: f.card && f.card.k, skipped: f.skipped });
      if (f.card) speed += val(f.card.k);
    } else speed += val(cd.k);
  }
  t.speed = speed;
  place(g, id, p.pos + speed);
  log(g, `${nm(c, id)}: ${p.gear}速・スピード${speed}`);
  arm(c);
}
function boost(c, id) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!t || t.pid !== id || t.phase !== "react") return;
  if (t.boosted) return "ブーストは1ターンに1回です";
  if (!p.engine.length) return "エンジンにヒートがありません";
  payHeat(g, id, 1);
  t.boosted = true;
  const f = flipSpeed(g, id);
  t.flips.push({ by: "boost", card: f.card && f.card.k, skipped: f.skipped });
  if (f.card) { t.speed += val(f.card.k); place(g, id, p.pos + val(f.card.k)); }
  log(g, `${nm(c, id)} はブースト(+${f.card ? val(f.card.k) : 0})`);
}
function adrenalineMove(c, id) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!t || t.pid !== id || t.phase !== "react" || !t.adrenaline || t.adrUsed) return;
  t.adrUsed = true; t.speed += 1;
  place(g, id, p.pos + 1);
  log(g, `${nm(c, id)} はアドレナリンで+1`);
}
function cooldown(c, id, n) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!t || t.pid !== id || t.phase !== "react") return;
  const can = Math.min(t.cool - t.coolUsed, p.hand.filter((cd) => cd.k === "h").length, Math.max(1, Number(n) || 1));
  if (can <= 0) return "クールダウンできるヒートがありません";
  for (let i = 0; i < can; i++) { const k = p.hand.findIndex((cd) => cd.k === "h"); p.engine.push(p.hand.splice(k, 1)[0]); }
  t.coolUsed += can;
  log(g, `${nm(c, id)} はクールダウン${can}`);
}
function slipAllowed(g, id) {
  const p = g.P[id];
  if (p.pos + 2 >= g.goal) return false; // 最終周: ゴールを越えるスリップストリーム・越えたあとのスリップストリームは不可
  return occupants(g, p.pos, id).length > 0 || occupants(g, p.pos + 1, id).length > 0;
}
function reactDone(c, id) {
  const g = c.g, t = g.turn;
  if (!t || t.pid !== id || t.phase !== "react") return;
  if (slipAllowed(g, id)) { t.phase = "slip"; g.seq++; return arm(c); }
  corners(c);
}
function slip(c, id, yes) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!t || t.pid !== id || t.phase !== "slip") return;
  if (yes) { place(g, id, p.pos + 2); t.slipped = true; log(g, `${nm(c, id)} はスリップストリーム(+2)`); }
  corners(c);
}
// コーナー: 通ったコーナーごとに、速度が制限を超えた分のヒートを払う。払えなければスピン
function corners(c) {
  const g = c.g, t = g.turn, id = t.pid, p = g.P[id];
  t.corners = [];
  for (const cr of cornersBetween(g, t.start, p.pos)) {
    const over = t.speed - cr.lim;
    if (over <= 0) { t.corners.push({ lim: cr.lim, paid: 0 }); continue; }
    if (p.engine.length >= over) { payHeat(g, id, over); t.corners.push({ lim: cr.lim, paid: over }); log(g, `${nm(c, id)}: コーナー(制限${cr.lim})でヒート${over}`); continue; }
    const paid = payHeat(g, id, over);
    const stress = p.gear <= 2 ? 1 : 2;
    for (let i = 0; i < stress; i++) p.hand.push({ id: g.nextId++, k: "x" });
    p.gear = 1;
    place(g, id, cr.x - 1);
    t.corners.push({ lim: cr.lim, paid, spin: true, stress });
    t.spun = true;
    log(g, `${nm(c, id)} はコーナー(制限${cr.lim})でスピン！ストレス+${stress}・1速へ`);
    break;
  }
  t.phase = "discard"; g.seq++;
  arm(c);
}
function discard(c, id, ids) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!t || t.pid !== id || t.phase !== "discard") return;
  const list = Array.isArray(ids) ? [...new Set(ids.map(Number))] : [];
  const cards = list.map((x) => p.hand.find((cd) => cd.id === x)).filter(Boolean);
  if (cards.some((cd) => CARDS[cd.k].keep)) return "ストレス・ヒート・5のカードは捨てられません";
  p.hand = p.hand.filter((cd) => !cards.includes(cd));
  p.discard.push(...cards);
  finishTurn(c, cards);
}
function finishTurn(c, discarded) {
  const g = c.g, t = g.turn, id = t.pid, p = g.P[id];
  p.discard.push(...p.play);
  p.last = p.last || { speed: t.speed, from: t.start, to: p.pos, flips: t.flips, corners: t.corners || [], slipped: !!t.slipped, boosted: t.boosted, spun: !!t.spun, discarded: discarded.length };
  p.shown = p.play.map((cd) => cd.k);
  p.play = [];
  draw(g, id, HAND);
  if (p.pos >= g.goal && !p.crossed) { p.crossed = true; log(g, `🏁 ${nm(c, id)} がゴール！`); }
  g.turn = null; g.mi++;
  startTurn(c);
}
function endRound(c) {
  const g = c.g;
  // ゴールした車はラウンドの終わりに盤から外して表彰台へ(同じラウンドなら前にいる順)
  const fin = active(g).filter((id) => g.P[id].crossed).sort((a, b) => ahead(g, a, b));
  for (const id of fin) { g.P[id].done = true; g.P[id].removed = true; g.hall.push(id); }
  if (!active(g).filter((id) => c.has(id)).length) return endGame(c);
  newRound(c);
}
function endGame(c) {
  const g = c.g;
  g.step = "end"; g.turn = null;
  // まだ走っていた人(途中で抜けた等)は、前にいる順で後ろに並べる
  const rest = g.order.filter((id) => g.P[id] && !g.hall.includes(id)).sort((a, b) => ahead(g, a, b));
  g.result = [...g.hall, ...rest];
  log(g, `レース終了！優勝は ${nm(c, g.result[0])}`);
  const n = g.result.length;
  c.finish(Object.fromEntries(g.result.filter((id) => c.has(id)).map((id, i) => [id, n - i])));
}

// ---- 時間切れ ----
function autoTurn(c) {
  const g = c.g, t = g.turn;
  if (!t) return;
  const id = t.pid, p = g.P[id];
  if (t.phase === "react") {
    if (t.adrenaline && !t.adrUsed) adrenalineMove(c, id);
    const hs = p.hand.filter((cd) => cd.k === "h").length;
    if (t.cool - t.coolUsed > 0 && hs) cooldown(c, id, t.cool - t.coolUsed);
    reactDone(c, id);
  }
  if (g.turn === t && t.phase === "slip") slip(c, id, false);
  if (g.turn === t && t.phase === "discard") discard(c, id, []);
}
function arm(c) {
  const g = c.g;
  if (g.step === "plan") {
    const key = "plan:" + g.round;
    if (g.armKey === key) return;
    g.armKey = key;
    return c.setTimer(g.cfg.planSecs * 1000, () => { g.armKey = null; if (g.step === "plan" && g.armKey == null) { log(g, "時間切れ(まだの人はギアそのまま・小さいカードから)"); beginMoves(c); } });
  }
  if (g.step === "move" && g.turn) {
    const key = "turn:" + g.round + ":" + g.mi + ":" + g.turn.phase;
    if (g.armKey === key) return;
    g.armKey = key;
    const away = !c.live().includes(g.turn.pid);
    return c.setTimer((away ? 10 : g.cfg.turnSecs) * 1000, () => { g.armKey = null; autoTurn(c); });
  }
  c.clearTimer();
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step === "end" || !g.P[pid]) return;
  let r;
  switch (m.a) {
    case "plan": r = submitPlan(c, pid, m); break;
    case "unplan": if (g.step === "plan" && g.P[pid].plan) g.P[pid].plan = null; break;
    case "boost": r = boost(c, pid); break;
    case "adr": r = adrenalineMove(c, pid); break;
    case "cool": r = cooldown(c, pid, m.n); break;
    case "react": r = reactDone(c, pid); break;
    case "slip": r = slip(c, pid, !!m.yes); break;
    case "discard": r = discard(c, pid, m.ids); break;
    default: return;
  }
  if (g.step !== "end") arm(c);
  return r;
}

function onLeave(c, pid) {
  const g = c.g;
  if (!g || !g.P[pid]) return;
  log(g, `${nm(c, pid)} が抜けました`);
  const p = g.P[pid];
  p.done = true; p.removed = true; p.left = true;
  if (g.step === "end") return;
  if (g.step === "plan" && active(g).every((x) => g.P[x].plan || !c.has(x))) {
    if (active(g).filter((id) => c.has(id)).length) return beginMoves(c);
  }
  if (g.step === "move" && g.turn && g.turn.pid === pid) { g.turn = null; g.mi++; return startTurn(c); }
  if (!active(g).filter((id) => c.has(id)).length) return endGame(c);
}

function view(c, me) {
  const g = c.g, T = TRACKS[g.track];
  const P = {};
  for (const id of g.order) {
    const p = g.P[id];
    if (!p) continue;
    const nc = nextCorner(g, p.pos);
    P[id] = {
      pos: p.pos, spot: p.spot, gear: p.gear, engine: p.engine.length, hand: p.hand.length, deck: p.deck.length, discard: p.discard.length,
      top: p.discard.length ? p.discard[p.discard.length - 1].k : null, ready: !!p.plan, done: !!p.done, left: !!p.left, crossed: !!p.crossed,
      lap: Math.min(g.laps, Math.max(0, Math.floor(p.pos / g.N)) + 1), playCount: p.play.length, shown: g.step === "move" && g.moveOrder.indexOf(id) < g.mi ? p.shown : null,
      revealed: g.turn && g.turn.pid === id ? p.play.map((cd) => cd.k) : null, last: p.last, next: nc ? { dist: nc.dist, lim: nc.lim } : null,
      heatInHand: id === me ? p.hand.filter((cd) => cd.k === "h").length : null,
    };
  }
  const mine = g.P[me];
  return {
    cfg: g.cfg, track: { id: g.track, name: T.name, n: g.N, corners: T.corners, cells: T.xy }, laps: g.laps, goal: g.goal, round: g.round, step: g.step,
    order: g.order, P, moveOrder: g.moveOrder, mi: g.mi, adrenaline: g.adrenaline || [], hall: g.hall, result: g.result || null,
    turn: g.turn ? { pid: g.turn.pid, phase: g.turn.phase, speed: g.turn.speed, flips: g.turn.flips, adrenaline: g.turn.adrenaline, adrUsed: g.turn.adrUsed, boosted: g.turn.boosted,
      coolLeft: g.turn.cool - g.turn.coolUsed, start: g.turn.start, corners: g.turn.corners || null, slipOK: g.turn.phase === "slip" } : null,
    hand: mine ? mine.hand : [], plan: mine && mine.plan ? mine.plan : null, cards: CARDS, coolByGear: COOL_BY_GEAR, log: g.log,
  };
}

module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, TRACKS, CARDS, _t: { place, cornersBetween, nextCorner, flipSpeed, planOf, beginMoves, slipAllowed, endRound } };
