"use strict";
// シティチェイス(City Chase 風)のルール本体。部屋・入室は games/citychase.js が受け持つ。
// 犯人1人と警察チーム(ほかの全員)。5×5のビル街で、犯人は車をビルに隠しながら毎ラウンドとなりのビルへ逃げ、
// 通ったビルには痕跡(ラウンドの番号)を残す。警察は3機のヘリで交差点を移動し、まわりのビルを調べる。
// 11ラウンド逃げ切れば犯人の勝ち、車を見つける(または犯人が動けなくなる)と警察の勝ち。

const B = 5, I = B - 1, HELIS = 3, ROUNDS = 11;
const DEFAULTS = { thief: "random", thiefSecs: 60, policeSecs: 120 };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if (typeof r.thief === "string" && /^[a-z0-9]{1,32}$/.test(r.thief)) out.thief = r.thief;
  if ([30, 60, 90, 0].includes(r.thiefSecs)) out.thiefSecs = r.thiefSecs;
  if ([60, 120, 180, 0].includes(r.policeSecs)) out.policeSecs = r.policeSecs;
  return out;
}
const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const K = (x, y) => x + "," + y;
const P = (k) => k.split(",").map(Number);
const inB = (x, y) => x >= 0 && y >= 0 && x < B && y < B;
const inI = (x, y) => x >= 0 && y >= 0 && x < I && y < I;
// ビルのタテヨコのとなり / 交差点のタテヨコのとなり / 交差点を囲む4つのビル
const nbB = (k) => { const [x, y] = P(k); return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [x + a, y + b]).filter(([a, b]) => inB(a, b)).map(([a, b]) => K(a, b)); };
const nbI = (k) => { const [x, y] = P(k); return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [x + a, y + b]).filter(([a, b]) => inI(a, b)).map(([a, b]) => K(a, b)); };
const around = (k) => { const [x, y] = P(k); return [K(x, y), K(x + 1, y), K(x, y + 1), K(x + 1, y + 1)]; };

function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const order = [...c.members()];
  const thief = order.includes(cfg.thief) ? cfg.thief : order[Math.floor(rnd() * order.length)];
  // ビルの高さ(見た目だけ。本家は好きな高さのビルを好きな場所に立てる)
  const heights = {}; for (let x = 0; x < B; x++) for (let y = 0; y < B; y++) heights[K(x, y)] = 1 + Math.floor(rnd() * 3);
  const g = c.g = { cfg, order, thief, police: order.filter((x) => x !== thief), round: 0, step: "place", helis: [], acted: [], car: null, traces: {}, found: {}, empty: {}, heights, log: [], result: null, winner: null, last: null, rnd };
  log(g, `犯人は ${c.nameOf(thief)}。警察はヘリコプター3機を交差点に置いてください`);
  arm(c);
}
function log(g, t) { g.log.push(t); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); }
const isPolice = (g, id) => g.police.includes(id);

// 警察: ヘリを置く(準備)
function place(c, id, m) {
  const g = c.g;
  if (!isPolice(g, id)) return "ヘリを置くのは警察です";
  if (typeof m.at !== "string" || !inI(...P(m.at))) return "交差点を選んでください";
  if (g.helis.includes(m.at)) return "そこにはもうヘリがいます";
  g.helis.push(m.at);
  if (g.helis.length >= HELIS) beginThief(c);
  else arm(c);
}
function beginThief(c) {
  const g = c.g;
  g.round++; g.step = "thief";
  log(g, `ラウンド${g.round}: 犯人が逃げています(警察は見ないで待つ)`);
  // 動けるビルがない → 包囲されて警察の勝ち
  if (g.round > 1 && !moves(g).length) { log(g, "犯人は動けるビルがない！包囲成功"); return end(c, "police"); }
  arm(c);
}
// 犯人が次に行けるビル: 1ラウンド目はどこでも、2ラウンド目からは今のビルのタテヨコのとなりで、痕跡のないビル
function moves(g) {
  if (!g.car) { const all = []; for (let x = 0; x < B; x++) for (let y = 0; y < B; y++) all.push(K(x, y)); return all; }
  return nbB(g.car).filter((k) => !g.traces[k]);
}
function hide(c, id, m) {
  const g = c.g;
  if (id !== g.thief) return "犯人の番です";
  if (!moves(g).includes(m.to)) return g.car ? "今のビルのタテヨコのとなりで、痕跡のないビルを選んでください" : "ビルを選んでください";
  g.car = m.to; g.traces[m.to] = g.round; // 痕跡(ラウンドの番号)は車と一緒にビルへ。車が出ていっても残る
  g.step = "police"; g.acted = [];
  log(g, `ラウンド${g.round}: 警察の番(ヘリ1機ずつ、移動か捜索)`);
  arm(c);
}
// 警察: ヘリ1機の行動(移動 or 捜索 or パス)
function heli(c, id, m) {
  const g = c.g;
  if (!isPolice(g, id)) return "ヘリを動かすのは警察です";
  const i = m.h;
  if (!Number.isInteger(i) || i < 0 || i >= HELIS) return "ヘリを選んでください";
  if (g.acted.includes(i)) return "このヘリはこのラウンドもう行動しました";
  const at = g.helis[i];
  if (m.kind === "move") {
    if (!nbI(at).includes(m.to)) return "タテヨコのとなりの交差点を選んでください";
    if (g.helis.includes(m.to)) return "ほかのヘリがいる交差点には行けません";
    g.helis[i] = m.to; g.acted.push(i);
    g.last = { kind: "move", h: i, to: m.to, by: id };
  } else if (m.kind === "search") {
    if (!around(at).includes(m.to)) return "ヘリのまわりの4つのビルから選んでください";
    g.acted.push(i);
    if (g.car === m.to) { g.found[m.to] = g.traces[m.to]; g.last = { kind: "search", h: i, to: m.to, by: id, hit: "car" }; log(g, `🚁${i + 1} がビルを調べた → 車を発見！`); return end(c, "police"); }
    if (g.traces[m.to]) { g.found[m.to] = g.traces[m.to]; g.last = { kind: "search", h: i, to: m.to, by: id, hit: "trace", n: g.traces[m.to] }; log(g, `🚁${i + 1} がビルを調べた → ラウンド${g.traces[m.to]}の痕跡を発見！`); }
    else { g.empty[m.to] = g.round; g.last = { kind: "search", h: i, to: m.to, by: id, hit: null }; log(g, `🚁${i + 1} がビルを調べた → なにもない`); }
  } else if (m.kind === "pass") { g.acted.push(i); g.last = { kind: "pass", h: i, by: id }; }
  else return;
  if (g.acted.length >= HELIS) endPolice(c);
  else arm(c);
}
function endPolice(c) {
  const g = c.g;
  if (g.round >= ROUNDS) { log(g, `${ROUNDS}ラウンド逃げ切った！`); return end(c, "thief"); }
  beginThief(c);
}
function end(c, side) {
  const g = c.g;
  g.step = "end"; g.winner = side; c.clearTimer();
  log(g, side === "thief" ? `🏆 犯人 ${c.nameOf(g.thief)} の勝ち！` : "🏆 警察チームの勝ち！");
  const raw = {}; for (const id of g.order) raw[id] = (side === "thief") === (id === g.thief) ? 1 : 0;
  g.result = { winner: side, car: g.car, traces: g.traces };
  c.finish(raw);
}
// 時間切れ: 犯人はランダムに逃げる / 警察は残りのヘリがパス / ヘリの配置はランダム
function arm(c) {
  const g = c.g;
  if (g.step === "end") return c.clearTimer();
  const secs = g.step === "thief" ? g.cfg.thiefSecs : g.step === "police" ? g.cfg.policeSecs : 60;
  const away = g.step === "thief" ? !c.live().includes(g.thief) : !g.police.some((x) => c.live().includes(x));
  const ms = away ? 15000 : secs * 1000;
  if (!ms) return c.clearTimer();
  c.setTimer(ms, () => {
    if (g.step === "place") { while (g.helis.length < HELIS) { const free = []; for (let x = 0; x < I; x++) for (let y = 0; y < I; y++) if (!g.helis.includes(K(x, y))) free.push(K(x, y)); g.helis.push(free[Math.floor(g.rnd() * free.length)]); } log(g, "時間切れ: 残りのヘリを置いた"); beginThief(c); }
    else if (g.step === "thief") { const ms2 = moves(g); log(g, "時間切れ: 犯人は自動で逃げた"); hide(c, g.thief, { to: ms2[Math.floor(g.rnd() * ms2.length)] }); }
    else if (g.step === "police") { log(g, "時間切れ: 残りのヘリは何もしない"); for (let i = 0; i < HELIS; i++) if (!g.acted.includes(i)) g.acted.push(i); endPolice(c); }
  });
}
function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step === "end") return;
  if (m.a === "place" && g.step === "place") return place(c, pid, m);
  if (m.a === "hide" && g.step === "thief") return hide(c, pid, m);
  if (m.a === "heli" && g.step === "police") return heli(c, pid, m);
}
function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step === "end") return;
  g.order = g.order.filter((x) => x !== pid);
  if (pid === g.thief) { log(g, `犯人 ${c.nameOf(pid)} が抜けた`); return end(c, "police"); }
  g.police = g.police.filter((x) => x !== pid);
  log(g, `${c.nameOf(pid)} が抜けた`);
  if (!g.police.length) return end(c, "thief");
  arm(c);
}
function view(c, me) {
  const g = c.g, thief = me === g.thief, all = thief || g.step === "end";
  return {
    step: g.step, round: g.round, rounds: ROUNDS, B, I, thief: g.thief, police: g.police, order: g.order, helis: g.helis, acted: g.acted, heights: g.heights,
    // 犯人(と終了後)には車と全部の痕跡。警察には見つけた痕跡と、調べて空だったビルだけ
    car: all ? g.car : null, traces: all ? g.traces : g.found, found: g.found, empty: g.empty,
    moves: thief && g.step === "thief" ? moves(g) : null,
    last: g.last, winner: g.winner, log: g.log.slice(-14),
  };
}
module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, ROUNDS, _t: { moves, nbB, nbI, around } };
