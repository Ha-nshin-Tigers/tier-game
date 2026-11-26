"use strict";
// ダンダンティアー(「みんなでダンダンティアー！」風)のルール本体。部屋・入室は games/dantier.js が受け持つ。
// 3つのモード:
//  secret   … 本編(協力)。1人にだけ「秘密のランク」が見える。その人がランクに合いそうな言葉を出し、
//              ほかの人が相談して何ランクかを当てる。当たれば連続正解+1、外れたら0に戻る(言葉は表に残る)。
//              決めた回数だけ連続で当てたらクリア。表の端のランクが出題されると、その外側のランクが増える(S〜D → SSS〜G)。
//              ヒント(回数限定)で、正解ではないランクを最大2つ消せる。
//  together … みんなでティアー。ランクなしで、みんなで1枚のティアー表を自由に作る。
//  mine     … じぶんのティアー。作る人が1人で作ったティアー表の並びを、ほかの人が当てる(ぴったり2点・1つずれ1点)。
// 記事(公式の紹介)に書かれていない細かい決まりは、このサイトで決めた(README に記載)。

const LADDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F", "G"];
const START_LO = 2, START_HI = 6; // 最初は S〜D
const MAX_TEXT = 24, MAX_ITEMS = 80, MINE_MIN = 3, MINE_MAX = 10;
// お題(ティアー表のテーマ)。ホストが自由に入力することもできる
const THEMES = [
  "深夜に食べると特に美味しいもの", "朝ごはんに食べたいもの", "コンビニで買うとテンションが上がるもの", "給食で好きだったメニュー", "おにぎりの具",
  "ラーメンのトッピング", "鍋に入れたい具", "カレーに合うもの", "お祭りの屋台", "冬に食べたいもの", "夏に飲みたいもの", "お弁当のおかず",
  "おやつ", "パンの種類", "寿司ネタ", "焼肉の部位", "ピザの具", "ファミレスのメニュー", "旅行のおみやげ", "誕生日にもらってうれしいもの",
  "休日の過ごし方", "テンションが上がる瞬間", "ちょっと幸せな瞬間", "地味にうれしいこと", "朝起きてすぐやること", "やる気が出る言葉",
  "言われてうれしいほめ言葉", "子どものころの遊び", "学校行事", "部活", "習い事", "あこがれの職業", "住んでみたい場所", "行ってみたい国",
  "旅行先でやりたいこと", "遊園地のアトラクション", "動物園で見たい動物", "飼ってみたい動物", "強そうな動物", "かわいい生き物", "海の生き物",
  "昆虫", "恐竜", "季節のイベント", "春といえば", "夏といえば", "秋といえば", "冬といえば", "雨の日にしたいこと", "家にあってほしい家電",
  "便利な道具", "100円ショップで買うもの", "文房具", "部屋に置きたいもの", "持ち歩くもの", "スマホでよく使うもの", "ゲームのジャンル",
  "スポーツ", "見ていて楽しいスポーツ", "運動会の種目", "乗り物", "乗ってみたい乗り物", "ヒーローの必殺技っぽい言葉", "異世界に持っていきたいもの",
  "無人島に持っていくもの", "宝くじが当たったら買うもの", "魔法が使えたらやりたいこと", "タイムマシンで行きたい時代", "眠くなるもの",
  "緊張する場面", "怖いもの", "苦手な虫", "落ち着く音", "好きな色のもの", "丸いもの", "赤いもの", "高いところにあるもの", "やわらかいもの",
  "あったかいもの", "冷たいもの", "長いもの", "小さいもの", "大きいもの", "においが好きなもの", "人気がありそうな名前の付け方",
];
const DEFAULTS = { mode: "secret", theme: "", target: 5, hints: 2, clueSecs: 90, guessSecs: 120, makeSecs: 180, cycles: 1 };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if (["secret", "together", "mine"].includes(r.mode)) out.mode = r.mode;
  if (typeof r.theme === "string") out.theme = clean(r.theme, 40);
  if ([3, 5, 7].includes(r.target)) out.target = r.target;
  if ([0, 1, 2, 3, 5].includes(r.hints)) out.hints = r.hints;
  if ([60, 90, 180, 0].includes(r.clueSecs)) out.clueSecs = r.clueSecs;
  if ([60, 120, 180, 0].includes(r.guessSecs)) out.guessSecs = r.guessSecs;
  if ([120, 180, 300, 0].includes(r.makeSecs)) out.makeSecs = r.makeSecs;
  if ([1, 2].includes(r.cycles)) out.cycles = r.cycles;
  return out;
}
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
function clean(s, max) { return typeof s === "string" ? s.replace(BAD_CHARS, "").replace(/\s+/g, " ").trim().slice(0, max) : ""; }
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const nm = (c, id) => c.nameOf(id);
function log(g, t) { g.log.push(t); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); }
const visible = (g) => { const a = []; for (let i = g.lo; i <= g.hi; i++) a.push(i); return a; };
const okRank = (g, r) => Number.isInteger(r) && r >= g.lo && r <= g.hi;

function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const order = [...c.members()];
  const theme = cfg.theme || THEMES[Math.floor(rnd() * THEMES.length)];
  const g = c.g = { cfg, mode: cfg.mode, order, theme, lo: START_LO, hi: START_HI, items: [], nid: 1, log: [], rnd, armKey: null,
    step: null, turn: 0, round: 0, streak: 0, best: 0, hintsLeft: cfg.hints, cur: null, scores: Object.fromEntries(order.map((id) => [id, 0])), played: 0, makes: {}, last: null };
  log(g, `お題「${theme}」`);
  if (g.mode === "secret") beginClue(c);
  else if (g.mode === "together") { g.step = "build"; arm(c); }
  else beginMake(c);
}

// ================= 本編(秘密のランクを当てる) =================
function beginClue(c) {
  const g = c.g;
  // g.turn は「今の番の人」の g.order での位置(抜けた人がいたら onLeave で詰める)
  g.turn %= g.order.length;
  g.round = g.played + 1; // 飛ばした出題(時間切れ・抜けた)は数えない
  const giver = g.order[g.turn];
  const vis = visible(g);
  g.cur = { giver, secret: vis[Math.floor(g.rnd() * vis.length)], text: "", picks: {}, removed: [], hinted: false, answer: null, ok: null };
  g.step = "clue";
  log(g, `ラウンド${g.round}: ${nm(c, giver)} が出題(秘密のランクに合う言葉を考え中)`);
  arm(c);
}
// 答えを言ってしまう言葉: 「ランク」「ティア」を含む、ランク名だけ、「S級」「A位」など
function saysRank(text) {
  const t = text.normalize("NFKC").toUpperCase().replace(/\s+/g, "");
  if (LADDER.includes(t.replace(/[!！?？。、.,ー~〜]+$/g, ""))) return true; // ランク名だけ
  // ランク名のすぐ後に「ランク」「ティア」「級」などが続く(「Sランク」「Aティア」「B級」)。「フランクフルト」「ティアラ」は通す
  return /(^|[^A-Z])(SSS|SS|[SABCDEFG])(ランク|ティア|TIER|RANK|級|位|クラス|判定|評価)/.test(t);
}
function clue(c, id, m) {
  const g = c.g, cur = g.cur;
  if (g.step !== "clue" || cur.giver !== id) return "あなたが出題する番ではありません";
  const text = clean(m.text, MAX_TEXT);
  if (!text) return "言葉を入れてください";
  if (saysRank(text)) return "ランクそのもの(「Sランク」など)は書けません。お題に合う言葉で伝えてください";
  cur.text = text; g.step = "guess";
  log(g, `${nm(c, id)} の言葉「${text}」 → みんなで何ランクか相談`);
  arm(c);
}
// 当てる側: 自分の予想を選ぶ(みんなに見える)。決定はだれか1人が押す
function pick(c, id, m) {
  const g = c.g, cur = g.cur;
  if (g.step !== "guess" || id === cur.giver) return "当てる人だけが選べます";
  if (m.rank === null) { delete cur.picks[id]; return; }
  if (!okRank(g, m.rank) || cur.removed.includes(m.rank)) return "そのランクは選べません";
  cur.picks[id] = m.rank;
}
function hint(c, id) {
  const g = c.g, cur = g.cur;
  if (g.step !== "guess" || id === cur.giver) return "当てる人だけが使えます";
  if (cur.hinted) return "このラウンドはもうヒントを使いました";
  if (g.hintsLeft <= 0) return "ヒントはもう残っていません";
  // 正解ではないランクを最大2つ消す
  const wrong = shuffle(visible(g).filter((r) => r !== cur.secret && !cur.removed.includes(r)), g.rnd);
  cur.removed.push(...wrong.slice(0, 2));
  cur.hinted = true; g.hintsLeft--;
  for (const [p, r] of Object.entries(cur.picks)) if (cur.removed.includes(r)) delete cur.picks[p];
  log(g, `${nm(c, id)} がヒントを使った(${cur.removed.map((r) => LADDER[r]).join("・")} は正解ではない)`);
}
function decide(c, id, m) {
  const g = c.g, cur = g.cur;
  if (g.step !== "guess" || id === cur.giver) return "当てる人だけが決定できます";
  if (!okRank(g, m.rank) || cur.removed.includes(m.rank)) return "そのランクは選べません";
  answer(c, m.rank, id);
}
function answer(c, rank, by) {
  const g = c.g, cur = g.cur;
  cur.answer = rank; cur.ok = rank === cur.secret; cur.by = by || null; g.played++;
  g.items.push({ id: g.nid++, text: cur.text, by: cur.giver, rank: cur.secret, round: g.round, ok: cur.ok });
  if (cur.ok) { g.streak++; g.best = Math.max(g.best, g.streak); }
  else g.streak = 0;
  log(g, `答え ${rank == null ? "(なし)" : LADDER[rank]} → 正解は ${LADDER[cur.secret]}。${cur.ok ? `正解！ 連続${g.streak}回` : "はずれ… 連続正解は0に"}`);
  // 表の端のランクが出題されたら、その外側のランクが増える
  cur.grew = null;
  if (cur.secret === g.lo && g.lo > 0) { g.lo--; cur.grew = LADDER[g.lo]; }
  else if (cur.secret === g.hi && g.hi < LADDER.length - 1) { g.hi++; cur.grew = LADDER[g.hi]; }
  if (cur.grew) log(g, `端のランクが出題されたので「${cur.grew}」ランクが増えた`);
  g.last = { type: "answer", ok: cur.ok, secret: cur.secret, answer: rank };
  if (g.streak >= g.cfg.target) {
    g.step = "end"; g.cleared = true; c.clearTimer();
    log(g, `🎉 ${g.cfg.target}回連続正解でクリア！(${g.round}ラウンド)`);
    const raw = {}; for (const id of g.order) raw[id] = 1;
    return c.finish(raw);
  }
  g.step = "result";
  arm(c);
}
// あきらめて表を見る(ホストだけ。本編はクリアしないと終わらないので)
function giveup(c, id, isHost) {
  const g = c.g;
  if (g.mode !== "secret") return;
  if (!isHost) return "終わらせるのはホストです";
  g.step = "end"; g.cleared = false; c.clearTimer();
  log(g, `ここで終了(${g.round}ラウンド・最高${g.best}回連続)`);
  const raw = {}; for (const id2 of g.order) raw[id2] = 0;
  c.finish(raw);
}
function next(c) {
  const g = c.g;
  if (g.mode === "secret" && g.step === "result") { g.turn++; return beginClue(c); }
  if (g.mode === "mine" && g.step === "reveal") { g.turn++; return beginMake(c); }
}

// ================= みんなでティアー(ランクなしで1枚の表を作る) =================
function add(c, id, m) {
  const g = c.g;
  const text = clean(m.text, MAX_TEXT);
  if (!text) return "言葉を入れてください";
  if (!okRank(g, m.rank)) return "ランクを選んでください";
  const mineMode = g.mode === "mine";
  if (mineMode && (g.step !== "make" || g.cur.maker !== id)) return "作る人だけが置けます";
  if (!mineMode && g.step !== "build") return;
  const list = mineMode ? g.cur.items : g.items;
  if (list.length >= (mineMode ? MINE_MAX : MAX_ITEMS)) return mineMode ? `置けるのは${MINE_MAX}個までです` : "これ以上置けません";
  if (list.some((x) => x.text === text)) return "同じ言葉がもうあります";
  list.push({ id: g.nid++, text, by: id, rank: m.rank });
}
function move(c, id, m) {
  const g = c.g, mineMode = g.mode === "mine";
  if (mineMode && (g.step !== "make" || g.cur.maker !== id)) return "作る人だけが動かせます";
  if (!mineMode && g.step !== "build") return;
  const it = (mineMode ? g.cur.items : g.items).find((x) => x.id === m.id);
  if (!it) return;
  if (!okRank(g, m.rank)) return "ランクを選んでください";
  it.rank = m.rank;
}
function remove(c, id, m) {
  const g = c.g, mineMode = g.mode === "mine";
  if (mineMode && (g.step !== "make" || g.cur.maker !== id)) return "作る人だけが消せます";
  if (!mineMode && g.step !== "build") return;
  const list = mineMode ? g.cur.items : g.items, i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) list.splice(i, 1);
}
// 端のランクを増やす(みんなでティアー)
function expand(c, id, m) {
  const g = c.g;
  if (g.mode !== "together" || g.step !== "build") return;
  if (m.side === "top" && g.lo > 0) g.lo--;
  else if (m.side === "bottom" && g.hi < LADDER.length - 1) g.hi++;
  // 空の端のランクを減らす
  else if (m.side === "-top" && g.lo < START_LO && !g.items.some((x) => x.rank === g.lo)) g.lo++;
  else if (m.side === "-bottom" && g.hi > START_HI && !g.items.some((x) => x.rank === g.hi)) g.hi--;
}
function complete(c, id, isHost) {
  const g = c.g;
  if (g.mode !== "together" || g.step !== "build") return;
  if (!isHost) return "完成させるのはホストです";
  if (!g.items.length) return "まだ言葉がありません";
  g.step = "end"; c.clearTimer();
  log(g, `ティアー表が完成！(${g.items.length}個)`);
  const raw = {}; for (const pid of g.order) raw[pid] = 1;
  c.finish(raw);
}

// ================= じぶんのティアー(作る人の並びを当てる) =================
// 作る人: 今の位置から順に、まだ決めた回数だけ作っていない人。全員作り終えたら終わり
function beginMake(c) {
  const g = c.g, n = g.order.length;
  let maker = null;
  for (let k = 0; k < n; k++) { const id = g.order[(g.turn + k) % n]; if ((g.makes[id] || 0) < g.cfg.cycles) { g.turn = (g.turn + k) % n; maker = id; break; } }
  if (!maker) return endMine(c);
  g.makes[maker] = (g.makes[maker] || 0) + 1;
  g.round = g.played + 1;
  g.cur = { maker, items: [], guesses: {}, done: [], pts: null };
  g.step = "make";
  log(g, `ラウンド${g.round}: ${nm(c, maker)} が自分のティアー表を作っています`);
  arm(c);
}
function publish(c, id) {
  const g = c.g, cur = g.cur;
  if (g.step !== "make" || cur.maker !== id) return "作る人だけが公開できます";
  if (cur.items.length < MINE_MIN) return `言葉を${MINE_MIN}個以上置いてください`;
  // 当てる側には、言葉だけをばらばらの順で見せる
  cur.shown = shuffle(cur.items.map((x) => x.id), g.rnd);
  g.step = "guess";
  log(g, `${nm(c, id)} のティアー表(${cur.items.length}個)を当てよう`);
  arm(c);
}
function gpick(c, id, m) {
  const g = c.g, cur = g.cur;
  if (g.step !== "guess" || id === cur.maker || !g.order.includes(id)) return "当てる人だけが選べます";
  if (cur.done.includes(id)) return "もう回答しました";
  if (!cur.items.some((x) => x.id === m.id)) return;
  if (!okRank(g, m.rank)) return "ランクを選んでください";
  (cur.guesses[id] || (cur.guesses[id] = {}))[m.id] = m.rank;
}
function gdone(c, id) {
  const g = c.g, cur = g.cur;
  if (g.step !== "guess" || id === cur.maker || !g.order.includes(id)) return;
  const gs = cur.guesses[id] || {};
  if (cur.items.some((x) => gs[x.id] == null)) return "全部の言葉のランクを選んでください";
  if (!cur.done.includes(id)) cur.done.push(id);
  if (guessers(c).every((p) => cur.done.includes(p))) reveal(c);
}
const guessers = (c) => { const g = c.g; return g.order.filter((p) => p !== g.cur.maker && c.live().includes(p)); };
function reveal(c) {
  const g = c.g, cur = g.cur;
  const pts = {};
  for (const p of g.order) {
    if (p === cur.maker) continue;
    const gs = cur.guesses[p] || {};
    pts[p] = cur.items.reduce((a, x) => a + (gs[x.id] == null ? 0 : gs[x.id] === x.rank ? 2 : Math.abs(gs[x.id] - x.rank) === 1 ? 1 : 0), 0);
  }
  const vals = Object.values(pts);
  pts[cur.maker] = vals.length ? Math.floor(vals.reduce((a, b) => a + b, 0) / vals.length) : 0; // 作る人は当てた人たちの平均点
  for (const [p, v] of Object.entries(pts)) g.scores[p] = (g.scores[p] || 0) + v;
  cur.pts = pts; g.played++;
  g.step = "reveal";
  log(g, `答え合わせ: ${Object.entries(pts).map(([p, v]) => `${nm(c, p)} +${v}`).join("・")}`);
  arm(c);
}
function endMine(c) {
  const g = c.g;
  g.step = "end"; c.clearTimer();
  const raw = {}; for (const p of g.order) raw[p] = g.scores[p] || 0;
  const best = Math.max(...Object.values(raw));
  log(g, `🏆 ${g.order.filter((p) => raw[p] === best).map((p) => nm(c, p)).join("・")} の勝ち！(${best}点)`);
  c.finish(raw);
}

// ================= 持ち時間 =================
function arm(c) {
  const g = c.g;
  if (!g || g.step === "end" || g.step === "build") return c.clearTimer();
  let who = null, secs = 0;
  if (g.step === "clue") { who = g.cur.giver; secs = g.cfg.clueSecs; }
  else if (g.step === "guess") secs = g.cfg.guessSecs;
  else if (g.step === "make") { who = g.cur.maker; secs = g.cfg.makeSecs; }
  else if (g.step === "result") secs = 12; // 結果を見る時間(「次へ」でも進む)
  else if (g.step === "reveal") secs = 30; // 答え合わせの表は長いので長め
  const away = who != null && !c.live().includes(who);
  const key = [g.round, g.step, who, away].join("|");
  if (g.armKey === key) return;
  g.armKey = key;
  const ms = away ? 15000 : secs * 1000;
  if (!ms) return c.clearTimer();
  c.setTimer(ms, () => { g.armKey = null; timeout(c); });
}
function timeout(c) {
  const g = c.g;
  if (g.step === "clue") { log(g, `${nm(c, g.cur.giver)} は時間切れ(次の人が出題)`); g.turn++; return beginClue(c); }
  if (g.step === "guess" && g.mode === "secret") {
    // いちばん多く選ばれたランクで答える(同じ数ならその中からランダム。だれも選んでいなければはずれ)
    const cnt = {}; for (const r of Object.values(g.cur.picks)) cnt[r] = (cnt[r] || 0) + 1;
    const best = Math.max(0, ...Object.values(cnt)), top = Object.keys(cnt).filter((r) => cnt[r] === best).map(Number);
    log(g, "時間切れ: いちばん多く選ばれたランクで答える");
    return answer(c, top.length ? top[Math.floor(g.rnd() * top.length)] : null, null);
  }
  if (g.step === "make") {
    if (g.cur.items.length >= MINE_MIN) { log(g, "時間切れ: そのまま公開"); return publish(c, g.cur.maker); }
    log(g, `${nm(c, g.cur.maker)} は時間切れ(次の人へ)`); g.turn++; return beginMake(c); // 作れなかった回も1回と数える(何度も待たないように)
  }
  if (g.step === "guess" && g.mode === "mine") { log(g, "時間切れ: 答え合わせ"); return reveal(c); }
  if (g.step === "result" || g.step === "reveal") return next(c);
}
// 切断・再接続: 持ち時間を掛け直す。じぶんのティアーで、残りの(つながっている)当てる人が全員回答済みなら答え合わせ
function onPresence(c) {
  const g = c.g;
  if (!g || g.step === "end") return;
  if (g.mode === "mine" && g.step === "guess" && g.cur.done.length && guessers(c).every((p) => g.cur.done.includes(p))) return reveal(c);
  arm(c);
}

function handle(c, pid, m, isHost) {
  const g = c.g;
  if (!g || g.step === "end") return;
  const inGame = g.order.includes(pid);
  if (!inGame) return "観戦中は操作できません";
  switch (m.a) {
    case "clue": return clue(c, pid, m);
    case "pick": return g.mode === "secret" ? pick(c, pid, m) : gpick(c, pid, m);
    case "hint": return hint(c, pid);
    case "decide": return decide(c, pid, m);
    case "next": return next(c);
    case "giveup": return giveup(c, pid, isHost);
    case "add": return add(c, pid, m);
    case "move": return move(c, pid, m);
    case "remove": return remove(c, pid, m);
    case "expand": return expand(c, pid, m);
    case "complete": return complete(c, pid, isHost);
    case "publish": return publish(c, pid);
    case "gdone": return gdone(c, pid);
  }
}
// 抜けた人: 出題・作る番ならその番を飛ばす
function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step === "end") return;
  log(g, `${nm(c, pid)} が抜けた`);
  // 番の人の位置を詰める: 抜けた人が今の番より前なら1つ前へ。今の番の人が抜けて、そのラウンドをやり直すときはそのまま(次の人の番になる)
  const i = g.order.indexOf(pid), cur = g.cur;
  const redo = cur && ((cur.giver === pid && (g.step === "clue" || g.step === "guess")) || (cur.maker === pid && (g.step === "make" || g.step === "guess")));
  if (i >= 0 && (i < g.turn || (i === g.turn && !redo))) g.turn--;
  g.order = g.order.filter((x) => x !== pid);
  if (g.turn < 0) g.turn = 0;
  g.armKey = null;
  if (g.order.length < 2 && g.mode !== "together") { if (g.mode === "mine") return endMine(c); g.step = "end"; return c.clearTimer(); }
  if (!g.order.length) { g.step = "end"; return c.clearTimer(); }
  if (g.mode === "secret" && g.cur) {
    delete g.cur.picks[pid];
    // 出題する人が抜けたら、そのラウンドはやり直し(次の人が出題)
    if (redo) return beginClue(c);
  }
  if (g.mode === "mine" && g.cur) {
    if (redo) return beginMake(c);
    if (g.step === "guess" && guessers(c).every((p) => g.cur.done.includes(p))) return reveal(c);
  }
  arm(c);
}

function view(c, me) {
  const g = c.g, cur = g.cur, end = g.step === "end";
  const v = { mode: g.mode, step: g.step, theme: g.theme, order: g.order, ladder: LADDER, lo: g.lo, hi: g.hi, round: g.round, log: g.log.slice(-16), cfg: g.cfg };
  if (g.mode === "secret") {
    Object.assign(v, { items: g.items, streak: g.streak, best: g.best, target: g.cfg.target, hintsLeft: g.hintsLeft, cleared: !!g.cleared });
    if (cur) {
      const reveal = g.step === "result" || end || cur.giver === me;
      v.cur = { giver: cur.giver, text: cur.text, picks: cur.picks, removed: cur.removed, hinted: cur.hinted, answer: cur.answer, ok: cur.ok, by: cur.by || null, grew: cur.grew || null,
        secret: reveal ? cur.secret : null };
    }
  } else if (g.mode === "together") v.items = g.items;
  else {
    v.scores = g.scores;
    if (cur) {
      const own = cur.maker === me, open = g.step === "reveal" || end;
      v.cur = { maker: cur.maker, done: cur.done, pts: cur.pts,
        // 作っている間: 作る人には自分の表、ほかの人には個数だけ / 当てる間: 当てる人には言葉だけ(ランクなし) / 答え合わせ: 全部
        items: own || open ? cur.items : g.step === "guess" ? cur.shown.map((id) => ({ id, text: cur.items.find((x) => x.id === id).text })) : [],
        count: cur.items.length,
        myGuess: cur.guesses[me] || {}, guesses: open ? cur.guesses : null };
    }
  }
  return v;
}

module.exports = { start, handle, view, onLeave, onPresence, normalize, DEFAULTS, LADDER, THEMES, START_LO, START_HI, MINE_MIN, MINE_MAX, _t: { answer, reveal, visible, saysRank } };
