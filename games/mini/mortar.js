"use strict";
// モーターメイヘム(Mortar Mayhem 風)のルール本体。部屋・入室は games/mortar.js が受け持つ。
// ラウンドの最初に矢印の並び(全員共通)を見て覚える。矢印が消えたら砲撃開始: ビートごとに1マスずつ、
// 覚えた順に動く。正しいマス以外は爆発するので、間違えたらアウト。最後まで生き残った人の勝ち。

const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const KEYS = Object.keys(DIRS);
// 速さ: 見本の矢印1つの表示時間・1ビートの長さ(ms)。ラウンドが進むと少しずつ速くなる
const SPEED = { slow: { show: 1000, beat: 2200 }, normal: { show: 800, beat: 1700 }, fast: { show: 600, beat: 1300 } };
const READY_MS = 1800, GAP_MS = 500, RESULT_MS = 2800, MAX_LEN = 12, MAX_ROUND = 40;
const DEFAULTS = { speed: "normal", lives: 1, startLen: 3 };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if (SPEED[r.speed]) out.speed = r.speed;
  if ([1, 2, 3].includes(r.lives)) out.lives = r.lives;
  if ([3, 4, 5].includes(r.startLen)) out.startLen = r.startLen;
  return out;
}
const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const K = (x, y) => x + "," + y;
// 矢印の並びとその道のり(スタートからのずれ)
function pathOf(seq) { let x = 0, y = 0; const out = [[0, 0]]; for (const d of seq) { x += DIRS[d][0]; y += DIRS[d][1]; out.push([x, y]); } return out; }
// 盤からはみ出さない並びを作る(道のりの幅・高さが盤より2つ以上小さい=スタート地点の候補が複数ある)
function makeSeq(len, N, rnd = Math.random) {
  let best = null;
  for (let t = 0; t < 400; t++) {
    const seq = Array.from({ length: len }, () => KEYS[Math.floor(rnd() * 4)]);
    const p = pathOf(seq), w = Math.max(...p.map((a) => a[0])) - Math.min(...p.map((a) => a[0])), h = Math.max(...p.map((a) => a[1])) - Math.min(...p.map((a) => a[1]));
    if (w <= N - 2 && h <= N - 2) return seq;
    if (!best || Math.max(w, h) < best[0]) best = [Math.max(w, h), seq];
  }
  return best[1];
}
const gridSize = (n) => (n <= 3 ? 5 : 6);

function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const order = [...c.members()];
  const g = c.g = { cfg, order, startN: order.length, N: gridSize(order.length), round: 0, step: "ready", seq: [], beat: 0, P: {}, boom: [], phaseAt: 0, showMs: 0, beatMs: 0, log: [], result: null, rnd };
  for (const id of order) g.P[id] = { pos: null, start: null, alive: true, lives: cfg.lives, pend: null, hit: false, died: null, cleared: 0 };
  log(g, order.length === 1 ? "ひとりで練習: 何ラウンド生き残れるか" : `${order.length}人で開始。最後まで生き残った人の勝ち`);
  newRound(c);
}
function log(g, t) { g.log.push(t); if (g.log.length > 30) g.log.splice(0, g.log.length - 30); }
const alive = (g) => g.order.filter((id) => g.P[id] && g.P[id].alive);
const timing = (g) => {
  const s = SPEED[g.cfg.speed], r = g.round - 1;
  return { show: Math.max(400, s.show - r * 20), beat: Math.max(700, s.beat - r * 60) };
};
function newRound(c) {
  const g = c.g;
  g.round++;
  const len = Math.min(MAX_LEN, g.cfg.startLen + g.round - 1);
  g.seq = makeSeq(len, g.N, g.rnd);
  const p = pathOf(g.seq), minX = Math.min(...p.map((a) => a[0])), maxX = Math.max(...p.map((a) => a[0])), minY = Math.min(...p.map((a) => a[1])), maxY = Math.max(...p.map((a) => a[1]));
  // スタート地点: 道のりが盤に収まるマス。できるだけ別々のマスに
  const cells = [];
  for (let x = -minX; x <= g.N - 1 - maxX; x++) for (let y = -minY; y <= g.N - 1 - maxY; y++) cells.push([x, y]);
  const pool = shuffle([...cells], g.rnd);
  alive(g).forEach((id, i) => {
    const P = g.P[id], s = pool[i % pool.length];
    Object.assign(P, { start: s, pos: [...s], pend: null, hit: false });
  });
  g.beat = 0; g.boom = [];
  const t = timing(g);
  g.showMs = t.show; g.beatMs = t.beat;
  setStep(c, "ready", READY_MS, () => setStep(c, "show", len * t.show + GAP_MS, () => beginAct(c)));
}
function setStep(c, step, ms, fn) {
  const g = c.g;
  g.step = step; g.phaseAt = Date.now();
  c.setTimer(ms, fn);
}
function beginAct(c) {
  const g = c.g;
  for (const id of alive(g)) g.P[id].pend = null;
  setStep(c, "act", g.beatMs, () => doBeat(c));
}
// ビート: 全員の動きを同時に出す。正しいマス(覚えた並びどおり)以外は爆発
function doBeat(c) {
  const g = c.g, i = g.beat, p = pathOf(g.seq);
  const ids = alive(g), safe = new Set();
  for (const id of ids) { const P = g.P[id]; safe.add(K(P.start[0] + p[i + 1][0], P.start[1] + p[i + 1][1])); }
  g.boom = [];
  for (let x = 0; x < g.N; x++) for (let y = 0; y < g.N; y++) if (!safe.has(K(x, y))) g.boom.push(K(x, y));
  for (const id of ids) {
    const P = g.P[id], d = P.pend;
    P.hit = false;
    // 動かなかった・盤の外へ動こうとした → その場にとどまる
    if (d) { const nx = P.pos[0] + DIRS[d][0], ny = P.pos[1] + DIRS[d][1]; if (nx >= 0 && ny >= 0 && nx < g.N && ny < g.N) P.pos = [nx, ny]; }
    const want = [P.start[0] + p[i + 1][0], P.start[1] + p[i + 1][1]];
    P.pend = null;
    if (P.pos[0] === want[0] && P.pos[1] === want[1]) continue;
    P.hit = true; P.lives--;
    if (P.lives <= 0) { P.alive = false; P.died = { round: g.round, beat: i }; log(g, `💥 ${c.nameOf(id)} が吹き飛んだ(${g.round}ラウンド目・${i + 1}歩目)`); }
    else { P.pos = want; log(g, `💥 ${c.nameOf(id)} が被弾(のこりライフ${P.lives})`); } // ライフが残れば正しいマスへ戻って続ける
  }
  g.beat++;
  if (g.beat >= g.seq.length || !alive(g).length) return endRound(c);
  setStep(c, "act", g.beatMs, () => doBeat(c));
}
function endRound(c) {
  const g = c.g;
  for (const id of alive(g)) g.P[id].cleared = g.round;
  // ひとり練習かは開始時の人数で決める(対戦の途中で相手が抜けても練習にはならず、残った人の勝ち)
  const left = alive(g).length, solo = (g.startN || g.order.length) === 1;
  // 2人以上: 生き残りが1人以下で終わり / ひとり: 吹き飛んだら終わり
  const over = solo ? left === 0 : left <= 1;
  if (over || g.round >= MAX_ROUND) return setStep(c, "result", RESULT_MS, () => finish(c));
  setStep(c, "result", RESULT_MS, () => newRound(c));
}
function finish(c) {
  const g = c.g;
  g.step = "end"; c.clearTimer();
  // 生き残り > 後で吹き飛んだ人。同じビートで吹き飛んだ人は同じ順位
  const val = (id) => { const P = g.P[id]; return P.alive ? 1e6 : P.died.round * 100 + P.died.beat; };
  const rows = g.order.map((id) => ({ id, alive: g.P[id].alive, cleared: g.P[id].cleared, died: g.P[id].died })).sort((a, b) => val(b.id) - val(a.id));
  g.result = rows;
  const raw = {}; for (const r of rows) raw[r.id] = val(r.id);
  const win = rows.filter((r) => val(r.id) === val(rows[0].id));
  log(g, g.order.length === 1 ? `${g.P[g.order[0]].cleared}ラウンドをクリア` : `🏆 ${win.map((r) => c.nameOf(r.id)).join("・")} の勝ち！`);
  c.finish(raw);
}
function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step === "end") return;
  const P = g.P[pid];
  if (!P) return;
  if (m.a === "move") {
    if (g.step !== "act") return "砲撃が始まってから動けます";
    if (!P.alive) return;
    if (m.d !== null && !DIRS[m.d]) return;
    P.pend = m.d; // ビートまでは変えられる
    return;
  }
}
function onLeave(c, pid) {
  const g = c.g;
  if (!g || !g.P[pid]) return;
  log(g, `${c.nameOf(pid)} が抜けた`);
  delete g.P[pid]; g.order = g.order.filter((x) => x !== pid);
}
function view(c, me) {
  const g = c.g, show = g.step === "show" || g.step === "result" || g.step === "end";
  return {
    step: g.step, round: g.round, len: g.seq.length, N: g.N, cfg: g.cfg, order: g.order, beat: g.beat,
    // 並びは見本の間と答え合わせのときだけ。砲撃中は終わった歩数ぶんだけ
    seq: show ? g.seq : g.seq.slice(0, g.beat),
    phaseAt: g.phaseAt, showMs: g.showMs, beatMs: g.beatMs, boom: g.boom,
    P: Object.fromEntries(g.order.map((id) => { const P = g.P[id]; return [id, { pos: P.pos, alive: P.alive, lives: P.lives, hit: P.hit, died: P.died, cleared: P.cleared }]; })),
    pend: g.P[me] ? g.P[me].pend : null,
    result: g.result, log: g.log.slice(-12),
  };
}
module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, SPEED, _t: { makeSeq, pathOf, doBeat, endRound, gridSize } };
