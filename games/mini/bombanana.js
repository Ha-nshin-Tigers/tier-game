"use strict";
// ボムバナナ(BOMBANANA! 風)のルール本体。部屋・入室は games/bombanana.js が受け持つ。
// 3人協力の爆弾解除。役割は3匹のサル:
//   見ざる(blind) … 爆弾に触れて操作できる唯一の役。色・画面の表示・ランプは見えない(輪郭だけ)。点字・熱・音は触って分かる
//   言わざる(mute) … マニュアルを読める唯一の役。しゃべれない(声・文字なし)。ジェスチャー・エモート・指差しだけ
//   聞かざる(deaf) … 爆弾の見た目(色・画面・ランプ)と仲間のジェスチャーが見える。しゃべれるが、ほかの声とゲームの音が聞こえない
// 爆弾にはモジュールがいくつか付いていて、全部の解除モジュールを解けば成功。時間切れ・ミスの上限超えで爆発。
// カオスモジュール(圧力・せり上がりスライダー・アラーム)は解くものではなく、爆弾が解除されるまで見張り続ける。
//
// 出典: 公式発表(役割・14モジュール・3モード・環境ギミック)と、プレイヤーがまとめた資料(v1.0.0)。
// ケーブル・方向・電卓の表はプレイヤーが確認した表どおり。ほかのモジュールの表は公開されていないため、このサイトで作った。

const ROLES = ["blind", "deaf", "mute"];
const ROLE_NAME = { blind: "見ざる", deaf: "聞かざる", mute: "言わざる" };
// 声が届く向き: 見ざる→言わざる、聞かざる→見ざる・言わざる(言わざるはしゃべれない・聞かざるは聞こえない)
const HEARS = { blind: ["deaf"], mute: ["blind", "deaf"], deaf: [] }; // 聞く人 → 声が聞こえる相手
const COLORS = ["red", "blue", "green", "yellow"];
const COLOR_JA = { red: "赤", blue: "青", green: "緑", yellow: "黄" };
const DIRS = ["up", "right", "down", "left"];
const DIR_JA = { up: "上", right: "右", down: "下", left: "左" };

// ---- 決まった表を作るための乱数(マニュアルとサーバで同じ表になる) ----
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R0 = seeded(20260902);
const pickR = (arr, r = R0) => arr[Math.floor(r() * arr.length)];
const shuffle = (a, r = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- マニュアル(言わざるだけが見る) ----
// ケーブル: 本数と点灯ランプの色 → 切るケーブルの色(3本・4本はプレイヤー確認の表。5本はこのサイトで作った)
const CABLE = { 3: { red: "blue", blue: "green", green: "yellow", yellow: "red" }, 4: { red: "green", blue: "yellow", green: "red", yellow: "blue" }, 5: { red: "yellow", blue: "red", green: "blue", yellow: "green" } };
// 方向: 点字の数字とランプの色 → 押す向き(プレイヤー確認の表)
const DIRECTION = [[[1, 4], ["up", "right", "left", "down"]], [[2, 7], ["right", "down", "up", "left"]], [[3, 5], ["left", "up", "right", "up"]], [[6, 8], ["up", "left", "down", "right"]], [[9], ["down", "up", "left", "right"]]];
const dirAnswer = (n, led) => DIRECTION.find(([ns]) => ns.includes(n))[1][COLORS.indexOf(led)];
// 電卓の2段目: ランプの色と答えの奇数・偶数 → 押す数字(プレイヤー確認の表)
const CALC2 = { red: [3, 5], green: [2, 9], blue: [0, 1], yellow: [7, 0] }; // [奇数, 偶数]
// スイッチ: 上のランプの色ごとの決まりで、下の点字の数字から上下を決める(このサイトで作った)
const SWITCH_RULE = { red: { text: "数字が奇数なら上", up: (n) => n % 2 === 1 }, blue: { text: "数字が5以上なら上", up: (n) => n >= 5 }, green: { text: "数字が偶数なら上", up: (n) => n % 2 === 0 }, yellow: { text: "数字が3以下なら上", up: (n) => n <= 3 } };
// カラースライダー: 色と位置(左から1〜4) → 上か下(このサイトで作った)
const SLIDER = Object.fromEntries(COLORS.map((c) => [c, [0, 1, 2, 3].map(() => (R0() < 0.5 ? "up" : "down"))]));
// シンボル: 記号と段階(1〜3) → 押すボタンの色(このサイトで作った)
const SYMBOLS = ["star", "star_o", "tri", "tri_o", "hourglass", "moon", "wave", "eye"];
const SYMBOL_JA = { star: "塗りつぶしの星", star_o: "白抜きの星", tri: "塗りつぶしの三角", tri_o: "白抜きの三角", hourglass: "砂時計", moon: "三日月", wave: "波", eye: "目" };
const SYMBOL = Object.fromEntries(SYMBOLS.map((s) => [s, [0, 1, 2].map(() => pickR(COLORS))]));
// ピアノ: 点字のオクターブ(1〜3)とランプの色 → 弾く鍵盤の番号(1〜7)4つ(このサイトで作った)
const PIANO = Object.fromEntries([1, 2, 3].map((o) => [o, Object.fromEntries(COLORS.map((c) => [c, [0, 1, 2, 3].map(() => 1 + Math.floor(R0() * 7))]))]));
// サウンドボード: 音の鳴るボタンの点字(1〜9)と色 → 押す3か所(3×3の位置 0〜8)(このサイトで作った)
const SOUND = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, Object.fromEntries(COLORS.map((c) => [c, shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], R0).slice(0, 3)]))]));
const POS_JA = ["左上", "上の真ん中", "右上", "左の真ん中", "真ん中", "右の真ん中", "左下", "下の真ん中", "右下"];
// サルまね: 熱いボタンの色と段階(1〜4) → 足す色(このサイトで作った)
const MONKEY = Object.fromEntries(COLORS.map((c) => [c, [0, 1, 2, 3].map(() => pickR(COLORS))]));
// モールス: 数字のモールス信号(5つの短点・長点。国際モールス符号どおり)
const MORSE = { 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", 0: "-----" };
// 迷路: 番号(1〜6)ごとに 6×6 の迷路(壁はマニュアルにだけ描いてある)。決まった乱数で作る
const MAZE_N = 6;
function makeMaze(r) {
  // 各マスの壁: [上, 右, 下, 左] true=壁
  const w = Array.from({ length: MAZE_N * MAZE_N }, () => [true, true, true, true]);
  const seen = new Set([0]), st = [0];
  while (st.length) {
    const c = st[st.length - 1], x = c % MAZE_N, y = Math.floor(c / MAZE_N);
    const nb = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]].map(([dx, dy, a, b]) => [x + dx, y + dy, a, b]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < MAZE_N && ny < MAZE_N && !seen.has(ny * MAZE_N + nx));
    if (!nb.length) { st.pop(); continue; }
    const [nx, ny, a, b] = nb[Math.floor(r() * nb.length)], n = ny * MAZE_N + nx;
    w[c][a] = false; w[n][b] = false; seen.add(n); st.push(n);
  }
  // 少し壁を抜いて道を増やす
  for (let i = 0; i < 6; i++) { const c = Math.floor(r() * MAZE_N * MAZE_N), x = c % MAZE_N; if (x < MAZE_N - 1) { w[c][1] = false; w[c + 1][3] = false; } }
  return w;
}
const MAZES = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [n, makeMaze(R0)]));

const MODULES = {
  cable: { name: "ケーブル", level: "easy" }, slider: { name: "カラースライダー", level: "easy" }, direction: { name: "方向", level: "easy" }, calc: { name: "電卓", level: "easy" },
  symbol: { name: "シンボル", level: "medium" }, piano: { name: "ピアノ", level: "medium" }, soundboard: { name: "サウンドボード", level: "medium" },
  monkey: { name: "サルまね", level: "hard" }, morse: { name: "モールス", level: "hard" }, maze: { name: "迷路", level: "hard" }, switch: { name: "スイッチ", level: "hard" },
  pressure: { name: "圧力(カオス)", level: "chaos" }, rslider: { name: "せり上がりスライダー(カオス)", level: "chaos" }, alarm: { name: "アラーム(カオス)", level: "chaos" },
};
const POOL = { easy: ["cable", "slider", "direction", "calc"], medium: ["symbol", "piano", "soundboard"], hard: ["monkey", "morse", "maze", "switch"] };
// キャンペーン30レベル(時間・許されるミス・モジュール・カオス)。プレイヤーがまとめた v1.0.0 のデータどおり
// E/M/H = その難しさからランダム
const CAMPAIGN = [
  [150, 1, ["cable"], []], [150, 1, ["slider"], []], [150, 3, ["cable", "slider"], []], [180, 3, ["slider", "direction"], ["rslider"]],
  [180, 3, ["slider", "calc"], ["rslider"]], [210, 3, ["calc", "cable", "slider"], []], [240, 3, ["E", "E", "E", "E"], ["rslider"]], [210, 3, ["E", "symbol"], ["pressure"]],
  [210, 3, ["E", "piano"], ["pressure"]], [240, 3, ["symbol", "piano"], ["alarm"]], [240, 3, ["soundboard", "symbol"], ["alarm"]], [240, 3, ["E", "soundboard", "M"], []],
  [240, 3, ["M", "M", "E"], ["pressure", "rslider"]], [240, 3, ["M", "M", "M"], ["pressure", "alarm"]], [240, 3, ["E", "E", "M", "M"], ["rslider", "alarm"]], [240, 3, ["E", "E", "switch"], ["pressure", "alarm"]],
  [240, 3, ["E", "M", "switch"], ["alarm", "rslider"]], [240, 3, ["E", "maze"], ["alarm"]], [240, 3, ["E", "M", "maze"], ["rslider", "alarm"]], [300, 3, ["E", "maze", "switch"], ["pressure", "alarm"]],
  [300, 3, ["E", "E", "morse"], ["rslider", "alarm"]], [300, 3, ["E", "M", "morse"], []], [300, 3, ["E", "E", "monkey"], ["rslider", "pressure"]], [300, 3, ["E", "monkey", "maze"], ["pressure", "rslider"]],
  [300, 3, ["M", "H", "H"], []], [240, 3, ["E", "M", "H"], []], [240, 3, ["M", "H", "H"], []], [240, 3, ["H", "H", "H"], ["rslider", "pressure", "alarm"]],
  [300, 3, ["H", "H", "H"], ["rslider", "pressure", "pressure", "alarm"]], [300, 3, ["H", "H", "H", "H"], ["alarm", "alarm"]],
];
// 環境ギミック(停電・騒音)は、キャンペーンでは11レベル目から(出る時期は公表されていないのでこのサイトで決めた)
const HAZARD_FROM = 11;

// 練習: 時間たっぷり・ミス5回まで・ケーブルと方向だけ。ヒントと番号の札つき
const TUTORIAL = { secs: 600, mistakes: 5, mods: ["cable", "direction"], chaos: [], hazards: false };
const DEFAULTS = { mode: "tutorial", level: 1, guide: true, custom: { secs: 300, mistakes: 3, mods: ["cable", "direction", "calc", "slider"], chaos: [], hazards: false }, roles: {} };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = JSON.parse(JSON.stringify(DEFAULTS));
  if (["tutorial", "campaign", "endless", "custom"].includes(r.mode)) out.mode = r.mode;
  if (typeof r.guide === "boolean") out.guide = r.guide;
  if (Number.isInteger(r.level) && r.level >= 1 && r.level <= 30) out.level = r.level;
  const c = r.custom && typeof r.custom === "object" ? r.custom : {};
  if ([120, 180, 240, 300, 420, 600].includes(c.secs)) out.custom.secs = c.secs;
  if ([1, 2, 3, 4, 5].includes(c.mistakes)) out.custom.mistakes = c.mistakes;
  if (Array.isArray(c.mods)) { const m = c.mods.filter((k) => MODULES[k] && MODULES[k].level !== "chaos").slice(0, 8); if (m.length) out.custom.mods = m; }
  if (Array.isArray(c.chaos)) out.custom.chaos = c.chaos.filter((k) => MODULES[k] && MODULES[k].level === "chaos").slice(0, 4);
  if (typeof c.hazards === "boolean") out.custom.hazards = c.hazards;
  // 役割の希望(部屋のメンバーID → 役割)
  if (r.roles && typeof r.roles === "object") for (const [id, ro] of Object.entries(r.roles)) if (/^[a-z0-9]{1,32}$/.test(id) && ROLES.includes(ro)) out.roles[id] = ro;
  return out;
}

// ---------------------------------------------------------------
// モジュールを作る(状態はサーバだけが持つ。見え方は view で役割ごとに分ける)
// ---------------------------------------------------------------
const ri = (n, r = Math.random) => Math.floor(r() * n);
function makeModule(kind, r = Math.random) {
  const m = { kind, solved: false };
  if (kind === "cable") {
    const n = 3 + ri(3, r), led = COLORS[ri(4, r)], target = CABLE[n][led];
    // 切る色はちょうど1本だけにする
    const others = COLORS.filter((c) => c !== target), cols = Array.from({ length: n - 1 }, () => others[ri(3, r)]);
    cols.splice(ri(n, r), 0, target);
    Object.assign(m, { n, led, colors: cols, cut: cols.map(() => false) });
  } else if (kind === "slider") {
    Object.assign(m, { colors: shuffle([...COLORS], r), pos: [0, 0, 0, 0] }); // 0=真ん中 1=上 -1=下
  } else if (kind === "direction") {
    Object.assign(m, { stages: 2 + ri(2, r), stage: 0 }); newDirStage(m, r);
  } else if (kind === "calc") {
    const op = ri(3, r); let a, b, res;
    if (op === 0) { a = 10 + ri(80, r); b = 1 + ri(99 - a, r); res = a + b; }
    else if (op === 1) { a = 20 + ri(80, r); b = 1 + ri(a, r); res = a - b; }
    else { a = 2 + ri(8, r); b = 2 + ri(8, r); res = a * b; }
    Object.assign(m, { expr: `${a} ${["+", "−", "×"][op]} ${b} =`, res, typed: "", stage: 0, led: null, keys: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], r) });
  } else if (kind === "symbol") {
    Object.assign(m, { stage: 0, stages: 3, ptr: 0, buttons: shuffle([...COLORS], r) }); newSymbolStage(m, r);
  } else if (kind === "piano") {
    Object.assign(m, { octave: 1 + ri(3, r), led: COLORS[ri(4, r)], played: [] });
  } else if (kind === "soundboard") {
    Object.assign(m, { nums: Array.from({ length: 9 }, () => 1 + ri(9, r)), colors: Array.from({ length: 9 }, () => COLORS[ri(4, r)]), sound: ri(9, r), pressed: [] });
  } else if (kind === "monkey") {
    Object.assign(m, { buttons: shuffle([...COLORS], r), stage: 0, stages: 3 + ri(2, r), heats: [], input: [] }); m.heats.push(ri(4, r));
  } else if (kind === "morse") {
    Object.assign(m, { digits: [ri(10, r), ri(10, r), ri(10, r)], dials: [0, 0, 0] });
  } else if (kind === "maze") {
    const num = 1 + ri(6, r); let s, g;
    do { s = ri(36, r); g = ri(36, r); } while (Math.abs((s % 6) - (g % 6)) + Math.abs(Math.floor(s / 6) - Math.floor(g / 6)) < 4);
    Object.assign(m, { num, at: s, goal: g });
  } else if (kind === "switch") {
    Object.assign(m, { lights: Array.from({ length: 4 }, () => COLORS[ri(4, r)]), nums: Array.from({ length: 4 }, () => 1 + ri(9, r)), up: [false, false, false, false] });
  } else if (kind === "pressure") Object.assign(m, { v: 10, rate: 2.6 }); // 1秒あたり上がる量(0〜100)
  else if (kind === "rslider") Object.assign(m, { v: 0, rate: 2.9 });
  else if (kind === "alarm") Object.assign(m, { active: false, hot: [], until: 0, next: 0 });
  return m;
}
function newDirStage(m, r = Math.random) { m.led = COLORS[ri(4, r)]; m.num = 1 + ri(9, r); }
function newSymbolStage(m, r = Math.random) { m.syms = shuffle([...SYMBOLS], r).slice(0, 4); m.sound = ri(4, r); }
const isChaos = (m) => MODULES[m.kind].level === "chaos";

// ---------------------------------------------------------------
// 準備・進行
// ---------------------------------------------------------------
function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const order = [...c.members()].slice(0, 3);
  // 役割: 希望がそろっていればそのまま、足りない分はランダム
  const role = {}, free = [...ROLES];
  for (const id of order) { const want = cfg.roles[id]; if (want && free.includes(want)) { role[id] = want; free.splice(free.indexOf(want), 1); } }
  shuffle(free, rnd);
  for (const id of order) if (!role[id]) role[id] = free.shift();
  const g = c.g = { cfg, order, role, level: cfg.level, step: "brief", bomb: null, wave: 0, score: 0, log: [], fx: [], fxId: 0, emotes: {}, points: {}, result: null, rnd, hazard: { dark: false, noise: false, next: 0 }, hands: {} };
  newBomb(c);
  log(g, cfg.mode === "campaign" ? `キャンペーン レベル${g.level}` : cfg.mode === "endless" ? "エンドレス" : cfg.mode === "tutorial" ? "練習" : "カスタム");
}
function log(g, t) { g.log.push(t); if (g.log.length > 30) g.log.splice(0, g.log.length - 30); }
const fx = (g, kind, data = {}) => { g.fx.push({ id: ++g.fxId, kind, ...data, at: Date.now() }); if (g.fx.length > 40) g.fx.splice(0, g.fx.length - 40); };
function loadout(g) {
  const r = g.rnd, pick = (lv) => POOL[lv][ri(POOL[lv].length, r)];
  if (g.cfg.mode === "tutorial") return { ...TUTORIAL, mods: [...TUTORIAL.mods] };
  if (g.cfg.mode === "custom") { const cu = g.cfg.custom; return { secs: cu.secs, mistakes: cu.mistakes, mods: [...cu.mods], chaos: [...cu.chaos], hazards: cu.hazards }; }
  if (g.cfg.mode === "endless") {
    // ウェーブが進むほどモジュールが増えて難しくなる。時間はウェーブをまたいで続く(解くと延びる)
    const w = g.wave, n = Math.min(5, 2 + Math.floor(w / 2));
    const lv = w < 2 ? ["easy"] : w < 4 ? ["easy", "medium"] : ["easy", "medium", "hard"];
    const chaos = w >= 2 ? [["rslider", "pressure", "alarm"][ri(3, r)]] : [];
    if (w >= 5) chaos.push(["rslider", "pressure", "alarm"][ri(3, r)]);
    return { secs: null, mistakes: 3, mods: Array.from({ length: n }, () => pick(lv[ri(lv.length, r)])), chaos, hazards: w >= 3 };
  }
  const [secs, mistakes, mods, chaos] = CAMPAIGN[g.level - 1];
  return { secs, mistakes, mods: mods.map((k) => (k === "E" ? pick("easy") : k === "M" ? pick("medium") : k === "H" ? pick("hard") : k)), chaos: [...chaos], hazards: g.level >= HAZARD_FROM };
}
function newBomb(c) {
  const g = c.g, lo = loadout(g), now = Date.now();
  const mods = [...lo.mods.map((k) => makeModule(k, g.rnd)), ...lo.chaos.map((k) => makeModule(k, g.rnd))];
  for (const m of mods) if (m.kind === "alarm") m.next = now + 30000 + ri(25000, g.rnd);
  const prevEnd = g.bomb && g.cfg.mode === "endless" ? g.bomb.end : null;
  g.bomb = { mods, mistakes: lo.mistakes, strikes: g.cfg.mode === "endless" && g.bomb ? g.bomb.strikes : 0, secs: lo.secs, end: 0, hazards: lo.hazards, startAt: 0 };
  g.step = "brief"; g.hazard = { dark: false, noise: false, next: 0 };
  // 説明の時間(3秒)のあとに開始
  g.briefUntil = now + 3500;
  g.bomb.pendingEnd = prevEnd;
}
function begin(g) {
  const now = Date.now(), b = g.bomb;
  g.step = "play"; b.startAt = now;
  b.end = b.pendingEnd ? b.pendingEnd + 3500 : now + (b.secs || 240) * 1000; // エンドレスは前のウェーブの残り時間を引き継ぐ
  if (b.hazards) g.hazard.next = now + 40000 + ri(30000, g.rnd);
}
// ミス: 上限を超えたら爆発
function strike(c, mi, why) {
  const g = c.g, b = g.bomb;
  b.strikes++;
  fx(g, "strike", { mod: mi, why });
  log(g, `❌ ミス(${b.strikes}/${b.mistakes + 1}回目で爆発): ${MODULES[b.mods[mi].kind].name} ${why || ""}`);
  if (b.strikes > b.mistakes) explode(c, "ミスが多すぎた");
}
function explode(c, why) {
  const g = c.g;
  if (g.step !== "play") return;
  g.step = "boom"; fx(g, "boom");
  log(g, `💥 ドカーン！(${why})`);
  g.result = { ok: false, why, level: g.level, wave: g.wave, score: g.score };
  c.clearTimer();
  c.finish(Object.fromEntries(g.order.map((id) => [id, g.cfg.mode === "endless" ? g.score : 0])));
}
function solved(c, mi) {
  const g = c.g, b = g.bomb, m = b.mods[mi];
  m.solved = true; fx(g, "solved", { mod: mi });
  log(g, `✅ ${MODULES[m.kind].name} を解除`);
  if (g.cfg.mode === "endless") { g.score++; b.end += 30000; } // エンドレス: 解くと30秒延びる
  if (b.mods.every((x) => x.solved || isChaos(x))) {
    if (g.cfg.mode === "endless") { g.wave++; log(g, `ウェーブ${g.wave}クリア！次の爆弾`); newBomb(c); return; }
    g.step = "clear"; fx(g, "clear");
    log(g, "🎉 爆弾を解除した！");
    g.result = { ok: true, level: g.level, left: Math.max(0, Math.round((b.end - Date.now()) / 1000)) };
    c.clearTimer();
    c.finish(Object.fromEntries(g.order.map((id) => [id, 1])));
  }
}
// 0.25秒ごと: 時間・カオス・環境ギミック
function tick(c) {
  const g = c.g, now = Date.now();
  if (g.step === "brief" && now >= g.briefUntil) begin(g);
  if (g.step !== "play") return;
  const b = g.bomb, dt = 0.25;
  if (now >= b.end) return explode(c, "時間切れ");
  b.mods.forEach((m, i) => {
    if (m.kind === "pressure" || m.kind === "rslider") {
      m.v += m.rate * dt;
      if (m.v >= 100) { m.v = m.kind === "pressure" ? 50 : 30; strike(c, i, m.kind === "pressure" ? "圧力が上がりきった" : "スライダーが上がりきった"); }
    } else if (m.kind === "alarm") {
      if (!m.active && now >= m.next) { m.active = true; m.hot = shuffle([0, 1, 2, 3, 4, 5], g.rnd).slice(0, 3); m.until = now + 10000; fx(g, "alarm", { mod: i }); log(g, "🚨 アラーム！熱いボタンを10秒以内に全部押す"); }
      else if (m.active && now >= m.until) { m.active = false; m.hot = []; m.next = now + 35000 + ri(30000, g.rnd); strike(c, i, "アラームを止められなかった"); }
    }
  });
  if (g.step !== "play") return;
  // 環境ギミック: 停電(ランプをつける)・騒音(ラジオを止める)
  if (b.hazards && g.hazard.next && now >= g.hazard.next && !g.hazard.dark && !g.hazard.noise) {
    if (g.rnd() < 0.5) { g.hazard.dark = true; log(g, "💡 停電！ランプをつけて"); fx(g, "dark"); }
    else { g.hazard.noise = true; log(g, "📻 ラジオが大音量！止めて"); fx(g, "noise"); }
    g.hazard.next = 0;
  }
}

// ---------------------------------------------------------------
// 見ざるの操作(爆弾に触れられるのは見ざるだけ)
// ---------------------------------------------------------------
function act(c, id, m) {
  const g = c.g, b = g.bomb;
  if (g.step !== "play") return;
  if (g.role[id] !== "blind") return "爆弾に触れられるのは見ざるだけです";
  const i = m.mod, mod = b.mods[i];
  if (!mod || (mod.solved && !isChaos(mod))) return;
  const p = m.part;
  switch (mod.kind) {
    case "cable": {
      if (!Number.isInteger(p) || p < 0 || p >= mod.n || mod.cut[p]) return;
      mod.cut[p] = true; fx(g, "snip", { mod: i });
      if (mod.colors[p] === CABLE[mod.n][mod.led]) solved(c, i); else strike(c, i, "ちがうケーブルを切った");
      return;
    }
    case "slider": {
      if (!Number.isInteger(p) || p < 0 || p > 3 || !["up", "down"].includes(m.dir)) return;
      const want = SLIDER[mod.colors[p]][p];
      if (m.dir !== want) { strike(c, i, "スライダーの向きがちがう"); mod.pos[p] = 0; return; }
      mod.pos[p] = want === "up" ? 1 : -1;
      if (mod.colors.every((col, k) => mod.pos[k] === (SLIDER[col][k] === "up" ? 1 : -1))) solved(c, i);
      return;
    }
    case "direction": {
      if (!DIRS.includes(m.dir)) return;
      if (m.dir !== dirAnswer(mod.num, mod.led)) { strike(c, i, "ちがう向きを押した"); newDirStage(mod, g.rnd); return; }
      mod.stage++;
      if (mod.stage >= mod.stages) solved(c, i); else newDirStage(mod, g.rnd);
      return;
    }
    case "calc": {
      if (!Number.isInteger(p) || p < 0 || p > 10) return; // 0〜9=数字キー(位置) 10=「=」
      if (mod.stage === 0) {
        if (p === 10) {
          if (String(mod.res) === mod.typed) { mod.stage = 1; mod.led = COLORS[ri(4, g.rnd)]; fx(g, "beep", { mod: i, tone: 880 }); }
          else { mod.typed = ""; strike(c, i, "計算の答えがちがう"); }
        } else if (mod.typed.length < 3) { mod.typed += String(mod.keys[p]); fx(g, "click", { mod: i }); }
        return;
      }
      if (p === 10) return;
      const want = CALC2[mod.led][mod.res % 2 === 1 ? 0 : 1];
      if (mod.keys[p] === want) solved(c, i); else strike(c, i, "2段目の数字がちがう");
      return;
    }
    case "symbol": {
      if (m.what === "turn") { mod.ptr = (mod.ptr + (m.dir === -1 ? 3 : 1)) % 4; if (mod.ptr === mod.sound) fx(g, "chime", { mod: i }); return; }
      if (!Number.isInteger(p) || p < 0 || p > 3) return;
      const want = SYMBOL[mod.syms[mod.sound]][mod.stage];
      if (mod.buttons[p] !== want) { strike(c, i, "シンボルのボタンがちがう"); return; }
      mod.stage++;
      if (mod.stage >= mod.stages) solved(c, i); else { newSymbolStage(mod, g.rnd); fx(g, "beep", { mod: i, tone: 1046 }); }
      return;
    }
    case "piano": {
      if (!Number.isInteger(p) || p < 1 || p > 7) return;
      fx(g, "note", { mod: i, key: p });
      const want = PIANO[mod.octave][mod.led];
      if (want[mod.played.length] !== p) { mod.played = []; strike(c, i, "ちがう鍵盤を弾いた"); return; }
      mod.played.push(p);
      if (mod.played.length >= want.length) solved(c, i);
      return;
    }
    case "soundboard": {
      if (!Number.isInteger(p) || p < 0 || p > 8) return;
      const want = SOUND[mod.nums[mod.sound]][mod.colors[mod.sound]];
      fx(g, "click", { mod: i });
      if (want[mod.pressed.length] !== p) { mod.pressed = []; strike(c, i, "ちがう位置を押した"); return; }
      mod.pressed.push(p);
      if (mod.pressed.length >= want.length) solved(c, i);
      return;
    }
    case "monkey": {
      if (!Number.isInteger(p) || p < 0 || p > 3) return;
      // 答え: これまでの各段階の「熱いボタンの色 → マニュアルの色」を順に
      const answer = mod.heats.map((h, k) => MONKEY[mod.buttons[h]][k]);
      if (mod.buttons[p] !== answer[mod.input.length]) { mod.input = []; strike(c, i, "サルまねの順番がちがう"); return; }
      mod.input.push(p); fx(g, "beep", { mod: i, tone: 660 + p * 110 });
      if (mod.input.length >= answer.length) {
        mod.stage++; mod.input = [];
        if (mod.stage >= mod.stages) solved(c, i); else mod.heats.push(ri(4, g.rnd));
      }
      return;
    }
    case "morse": {
      if (m.what === "dial" && Number.isInteger(p) && p >= 0 && p < 3) { mod.dials[p] = (mod.dials[p] + (m.dir === -1 ? 9 : 1)) % 10; fx(g, "click", { mod: i }); return; }
      if (m.what === "enter") { if (mod.dials.every((d, k) => d === mod.digits[k])) solved(c, i); else strike(c, i, "モールスの数字がちがう"); }
      return;
    }
    case "maze": {
      if (!DIRS.includes(m.dir)) return;
      const x = mod.at % 6, y = Math.floor(mod.at / 6), k = DIRS.indexOf(m.dir);
      if (MAZES[mod.num][mod.at][k]) { strike(c, i, "迷路の壁にぶつかった"); return; }
      const nx = x + [0, 1, 0, -1][k], ny = y + [-1, 0, 1, 0][k];
      mod.at = ny * 6 + nx; fx(g, "click", { mod: i });
      if (mod.at === mod.goal) solved(c, i);
      return;
    }
    case "switch": {
      if (m.what === "toggle" && Number.isInteger(p) && p >= 0 && p < 4) { mod.up[p] = !mod.up[p]; fx(g, "click", { mod: i }); return; }
      if (m.what === "enter") {
        const ok = mod.lights.every((col, k) => SWITCH_RULE[col].up(mod.nums[k]) === mod.up[k]);
        if (ok) solved(c, i); else strike(c, i, "スイッチの組み合わせがちがう");
      }
      return;
    }
    case "pressure": if (m.what === "press") { mod.v = Math.max(0, mod.v - 22); fx(g, "hiss", { mod: i }); } return;
    case "rslider": if (m.what === "pull") { mod.v = 0; fx(g, "click", { mod: i }); } return;
    case "alarm": {
      if (!mod.active || !Number.isInteger(p) || p < 0 || p > 5) return;
      if (!mod.hot.includes(p)) { strike(c, i, "熱くないボタンを押した"); return; }
      mod.hot = mod.hot.filter((x) => x !== p);
      if (!mod.hot.length) { mod.active = false; mod.next = Date.now() + 35000 + ri(30000, g.rnd); log(g, "アラームを止めた"); fx(g, "alarmoff", { mod: i }); }
      return;
    }
  }
}
// 見ざるが触った(点字・熱・音を確かめる)。触った位置はほかの人にも見え、音は見ざると言わざるに聞こえる
function touch(c, id, m) {
  const g = c.g;
  if (g.step !== "play" || g.role[id] !== "blind") return;
  const mod = g.bomb.mods[m.mod];
  if (!mod) return;
  g.hands[id] = { mod: m.mod, part: m.part == null ? null : m.part, at: Date.now() };
  if (mod.kind === "soundboard" && m.part === mod.sound) fx(g, "chime", { mod: m.mod });
  if (mod.kind === "morse" && Number.isInteger(m.part) && m.part >= 0 && m.part < 3) fx(g, "morse", { mod: m.mod, code: MORSE[mod.digits[m.part]] });
  if (mod.kind === "symbol" && mod.ptr === mod.sound && m.part === "wheel") fx(g, "chime", { mod: m.mod });
}
// 環境とのかかわり(だれでも): ランプ・ラジオ・ビンタ・バナナ投げ・エモート・指差し
function env(c, id, m) {
  const g = c.g;
  if (m.what === "lamp" && g.hazard.dark) { g.hazard.dark = false; g.hazard.next = Date.now() + 40000 + ri(30000, g.rnd); log(g, `${ROLE_NAME[g.role[id]]}がランプをつけた`); fx(g, "light"); }
  else if (m.what === "radio" && g.hazard.noise) { g.hazard.noise = false; g.hazard.next = Date.now() + 40000 + ri(30000, g.rnd); log(g, `${ROLE_NAME[g.role[id]]}がラジオを止めた`); fx(g, "quiet"); }
  else if (m.what === "slap" && g.order.includes(m.to) && m.to !== id) fx(g, "slap", { from: id, to: m.to });
  else if (m.what === "banana" && g.order.includes(m.to) && m.to !== id) fx(g, "banana", { from: id, to: m.to });
}
const EMOTES = ["yes", "no", "n1", "n2", "n3", "n4", "n5", "up", "down", "left", "right", "ok", "what", "angry", "wave", "laugh"];
function emote(c, id, e) {
  const g = c.g;
  if (!EMOTES.includes(e)) return;
  g.emotes[id] = { e, at: Date.now() }; fx(g, "emote", { from: id, e });
}
function point(c, id, m) {
  const g = c.g, v = Array.isArray(m.at) && m.at.length === 3 && m.at.every((x) => Number.isFinite(x) && Math.abs(x) < 50) ? m.at.map((x) => Math.round(x * 100) / 100) : null;
  g.points[id] = v ? { at: v, t: Date.now() } : null;
}
// 声(文字): 話せる役(見ざる・聞かざる)だけ。届くのは聞こえる相手だけ(サーバの host が配る)
function say(c, id, text) {
  const g = c.g, ro = g.role[id];
  if (ro === "mute") return "言わざるはしゃべれません(ジェスチャーとエモートで伝えます)";
  const t = typeof text === "string" ? text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) : "";
  if (!t) return;
  const to = g.order.filter((x) => x !== id && (HEARS[g.role[x]] || []).includes(ro));
  return { say: { from: id, text: g.hazard.noise ? garble(t) : t, to } };
}
// 騒音中は声がところどころ聞き取れない
const garble = (t) => [...t].map((ch, i) => (i % 3 === 1 ? "…" : ch)).join("");

function handle(c, pid, m) {
  const g = c.g;
  if (!g || !g.order.includes(pid)) return;
  if (m.a === "act") return act(c, pid, m);
  if (m.a === "touch") return touch(c, pid, m);
  if (m.a === "env") return env(c, pid, m);
  if (m.a === "emote") return emote(c, pid, m.e);
  if (m.a === "point") return point(c, pid, m);
  if (m.a === "say") return say(c, pid, m.text);
  // マニュアル(言わざるだけ。大きいので毎回の送信には入れず、頼まれたときに1回送る)
  if (m.a === "manual") return g.role[pid] === "mute" ? { manual: manual() } : "マニュアルを読めるのは言わざるだけです";
  if (m.a === "next" && (g.step === "clear" || g.step === "boom")) {
    // キャンペーン: 成功なら次のレベル、失敗なら同じレベルをもう一度
    if (g.cfg.mode === "campaign" && g.step === "clear" && g.level < 30) g.level++;
    if (g.cfg.mode === "endless") { g.wave = 0; g.score = 0; g.bomb = null; }
    // 役割を回す: 見ざる→聞かざる→言わざる→見ざる
    if (m.rotate) { const next = { blind: "deaf", deaf: "mute", mute: "blind" }; for (const id of g.order) g.role[id] = next[g.role[id]]; log(g, "役割を交代した"); }
    g.result = null; newBomb(c);
    return { restart: true };
  }
}
function onLeave(c, pid) {
  const g = c.g;
  if (!g) return;
  if (g.step === "play" || g.step === "brief") { g.step = "boom"; g.result = { ok: false, why: "仲間が抜けた", level: g.level }; c.clearTimer(); }
}

// ---------------------------------------------------------------
// 見え方(役割ごと)
// ---------------------------------------------------------------
// 見ざる: 形と触った感じだけ(色・画面・ランプは見えない)。点字の数字・熱は分かる
// 聞かざる: 見た目は全部(色・画面・ランプ・点字の点)。熱と音は分からない
// 言わざる: 爆弾は見えない(マニュアルを読んでいる)
const danger = (m) => (m.v > 75 ? 2 : m.v > 50 ? 1 : 0);
function modView(m, ro) {
  const k = m.kind, B = ro === "blind", v = { kind: k, solved: m.solved };
  // 言わざる: 爆弾は見えないが、カオスの音(シューという音・サイレン)は聞こえる
  if (ro === "mute") return { kind: "hidden", solved: m.solved, lvl: k === "pressure" || k === "rslider" ? danger(m) : undefined, active: k === "alarm" ? m.active : undefined, chaos: isChaos(m) || undefined };
  if (k === "cable") Object.assign(v, { n: m.n, cut: m.cut, colors: B ? null : m.colors, led: B ? null : m.led });
  else if (k === "slider") Object.assign(v, { colors: B ? null : m.colors, pos: m.pos });
  else if (k === "direction") Object.assign(v, { led: B ? null : m.led, num: m.num, stage: m.stage, stages: m.stages });
  else if (k === "calc") Object.assign(v, { expr: B ? null : m.expr, typed: B ? null : m.typed, stage: m.stage, led: B ? null : m.led, keys: m.keys });
  else if (k === "symbol") Object.assign(v, { syms: B ? null : m.syms, ptr: m.ptr, stage: m.stage, stages: m.stages, buttons: B ? null : m.buttons });
  else if (k === "piano") Object.assign(v, { octave: m.octave, led: B ? null : m.led, played: m.played.length });
  else if (k === "soundboard") Object.assign(v, { nums: m.nums, colors: B ? null : m.colors, pressed: m.pressed.length });
  else if (k === "monkey") Object.assign(v, { buttons: B ? null : m.buttons, stage: m.stage, stages: m.stages, input: m.input.length, hot: B ? m.heats[m.heats.length - 1] : null });
  else if (k === "morse") Object.assign(v, { dials: m.dials, lit: null });
  else if (k === "maze") Object.assign(v, { num: m.num, at: B ? null : m.at, goal: B ? null : m.goal });
  else if (k === "switch") Object.assign(v, { lights: B ? null : m.lights, nums: m.nums, up: m.up });
  else if (k === "pressure" || k === "rslider") Object.assign(v, { v: B ? null : Math.round(m.v), rate: m.rate, urgent: B ? m.v > 70 : null, lvl: danger(m) });
  else if (k === "alarm") Object.assign(v, { active: m.active, hot: B ? m.hot : null, until: m.until });
  return v;
}
function manual() {
  return {
    cable: CABLE, direction: DIRECTION, calc2: CALC2, switch: Object.fromEntries(COLORS.map((c) => [c, SWITCH_RULE[c].text])), slider: SLIDER,
    symbol: SYMBOL, symbolNames: SYMBOL_JA, piano: PIANO, sound: SOUND, posNames: POS_JA, monkey: MONKEY, morse: MORSE, mazes: MAZES,
  };
}
function view(c, me) {
  const g = c.g, ro = g.role[me] || "watch", b = g.bomb;
  // 観戦の人は聞かざると同じ見え方
  const seeAs = ro === "watch" ? "deaf" : ro;
  // ゲームの音(fx)は聞こえる人にだけ(聞かざるは聞こえない)
  const audible = new Set(["chime", "morse", "note", "beep", "click", "hiss", "snip", "alarm", "alarmoff", "boom", "noise", "quiet"]);
  const fxs = g.fx.filter((f) => !(audible.has(f.kind) && seeAs === "deaf") || ["boom", "alarm"].includes(f.kind));
  return {
    step: g.step, mode: g.cfg.mode, guide: g.cfg.guide || g.cfg.mode === "tutorial", level: g.level, wave: g.wave, score: g.score, order: g.order, role: g.role, me: ro,
    bomb: b ? { mods: b.mods.map((m) => modView(m, seeAs)), strikes: b.strikes, mistakes: b.mistakes, end: b.end, briefUntil: g.briefUntil, startAt: b.startAt } : null,
    hazard: g.hazard, hands: g.hands, emotes: g.emotes, points: g.points, fx: fxs, result: g.result, log: g.log.slice(-10),
  };
}
module.exports = { start, handle, view, onLeave, normalize, tick, manual, DEFAULTS, ROLES, ROLE_NAME, HEARS, MODULES, CAMPAIGN, EMOTES, COLORS, _t: { makeModule, act, CABLE, dirAnswer, CALC2, SLIDER, SYMBOL, PIANO, SOUND, MONKEY, MORSE, MAZES, SWITCH_RULE, solved, newBomb, begin } };
