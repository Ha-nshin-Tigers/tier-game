"use strict";
// ゲスクラブ(Guess Club 風)のルール本体。部屋・入室は games/guessclub.js が受け持つ。
// 出典: 日本語版(コザイク)の遊び方の紹介と報酬表カードの写真。
//   初期資金$150・回答カード6枚・全3ラウンド。手番は「手札を1枚出す」か「$10で一致回数に賭ける」。
//   一致したら賞金ボウルを総取りしてガラストークン+1(ボウルに$30補充)、誰とも一致しなければ$10を払う。
//   予想マスは0〜12と13+、1マスにマーカー2つまで。マーカーは1人4つ。
//   誰かの手札がなくなったら得点計算: 罰金$20×枚数とボーナスをボウルへ → 予想が当たった人が総取り(2人なら半分ずつ)。
//   罰金は第2版に両方載っているルールから選べる: 残った手札1枚につき(第1版) / お題と関係ない回答1枚につき(正式)。

const START_MONEY = 150, CARDS = 6, MARKERS = 4, ROUNDS = 3;
const MATCH_REFILL = 30, MISS_FEE = 10, BET_FEE = 10, PENALTY = 20;
const TRACK = 14; // 予想マス 0〜12 と 13+(13 番目)
const SLOT_MAX = 2;
const MAX_LEN = 20;
// 報酬表カード(人数×ラウンド)
const BONUS = [[3, [30, 30, 50]], [5, [40, 40, 70]], [8, [50, 50, 100]]];
const bonusOf = (n, round) => BONUS.find(([max]) => n <= max)[1][Math.min(round, ROUNDS) - 1];

// お題の候補(このサイトで用意したもの。答えが10個以上あるものだけ)
const TOPICS = [
  "果物", "野菜", "動物園にいる動物", "海の生き物", "鳥", "虫", "犬の種類", "花",
  "日本の都道府県", "世界の国", "首都", "日本の山", "東京の駅", "観光地", "温泉地",
  "オリンピックの競技", "球技", "楽器", "スポーツで使う道具", "文房具", "台所にある物", "家電",
  "コンビニで買う物", "朝ごはんのメニュー", "お弁当のおかず", "ラーメンの具", "おにぎりの具", "寿司ネタ", "お菓子", "アイスの種類", "飲み物", "調味料", "パンの種類", "鍋料理の具",
  "色", "形", "曜日・月・季節の行事", "冬の季語っぽいもの", "夏といえば", "お正月といえば", "学校の行事", "教室にある物", "教科",
  "職業", "乗り物", "車のメーカー", "電車の路線", "童話・昔話", "ことわざの動物", "星座",
  "ゲーム機", "テレビ番組のジャンル", "アニメのキャラクター", "スーパーヒーロー", "有名な作曲家", "歴史上の人物",
  "体の部位", "病院の科", "ケガや病気", "天気", "趣味", "部活", "遊園地のアトラクション", "公園の遊具",
  "赤いもの", "丸いもの", "冷たいもの", "かたいもの", "においが強いもの", "カタカナ3文字の言葉", "「あ」で始まる言葉", "「ん」で終わる言葉",
];

const DEFAULTS = { writeSecs: 180, turnSecs: 45, penalty: "hand" };
function normalize(raw) {
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  return {
    writeSecs: pick(Number(raw.writeSecs), [90, 120, 180, 240, 300], DEFAULTS.writeSecs),
    turnSecs: pick(Number(raw.turnSecs), [20, 30, 45, 60, 90], DEFAULTS.turnSecs),
    // hand: 残った手札1枚につき$20 / off: お題と関係ない回答1枚につき$20(みんなで判定)
    penalty: pick(raw.penalty, ["hand", "off"], DEFAULTS.penalty),
  };
}

const log = (g, t) => { g.log.push(t); if (g.log.length > 80) g.log.shift(); };
const nm = (c, id) => c.nameOf(id);
const yen = (n) => "$" + n;
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const cleanStr = (s, max) => (typeof s === "string" ? s.replace(BAD_CHARS, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
// 同じ答えかどうか: 全角/半角・ひらがな/カタカナ・大文字/小文字・空白と記号の違いは同じとみなす
function canon(s) {
  return String(s || "").normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・、。,.!！?？「」『』()（）"'`~〜ー-]/g, "");
}

function start(c, settings, rnd = Math.random) {
  const order = shuffle(c.members().slice(), rnd);
  const P = {};
  for (const id of order) P[id] = { money: START_MONEY, hand: [], out: [], markers: MARKERS, written: false };
  c.g = {
    cfg: normalize(settings), order, P, round: 0, step: "topic", parent: null, topic: "", topicOpts: [], vetoes: [], cur: null,
    bowl: 0, glass: 0, bets: [], played: null, claims: null, results: null, flags: {}, flagDone: [], log: [], nextId: 1, seed: rnd,
    turnSeq: 0,
  };
  newRound(c);
}

function newRound(c) {
  const g = c.g;
  g.round++;
  g.parent = g.order[(g.round - 1) % g.order.length];
  g.step = "topic"; g.topic = ""; g.vetoes = []; g.cur = null;
  g.topicOpts = shuffle(TOPICS.slice(), g.seed).slice(0, 4);
  g.bowl = MATCH_REFILL; g.glass = 0; g.bets = []; g.played = null; g.claims = null; g.results = null; g.flags = {}; g.flagDone = [];
  for (const id of g.order) Object.assign(g.P[id], { hand: [], out: [], markers: MARKERS, written: false });
  log(g, `第${g.round}ラウンド: 親は ${nm(c, g.parent)}`);
  arm(c);
}

// ---- お題 ----
function setTopic(c, pid, text) {
  const g = c.g;
  if (g.step !== "topic" || pid !== g.parent) return "今はお題を決められません";
  const t = cleanStr(text, 30);
  if (!t) return "お題を入れてください";
  g.topic = t; g.vetoes = []; g.step = "confirm";
  log(g, `お題「${t}」`);
  arm(c);
}
function vote(c, pid, ok) {
  const g = c.g;
  if (g.step !== "confirm" || pid === g.parent) return;
  g.vetoes = g.vetoes.filter((x) => x.id !== pid);
  g.vetoes.push({ id: pid, ok: !!ok });
  checkVotes(c);
}
function checkVotes(c, force) {
  const g = c.g;
  const others = g.order.filter((id) => id !== g.parent && c.has(id));
  const ng = g.vetoes.filter((v) => !v.ok).length;
  // 半分より多くが「ダメ」なら出し直し。全員が答えたか時間切れで決める
  if (ng * 2 > others.length) {
    log(g, `お題「${g.topic}」は却下されました`);
    g.topic = ""; g.step = "topic"; g.vetoes = [];
    return arm(c);
  }
  if (force || g.vetoes.length >= others.length) beginWrite(c);
}
function beginWrite(c) {
  const g = c.g;
  g.step = "write";
  for (const id of g.order) { g.P[id].hand = []; g.P[id].written = false; }
  arm(c);
}

// ---- 回答を書く ----
function write(c, pid, answers) {
  const g = c.g;
  if (g.step !== "write" || !g.P[pid]) return;
  if (!Array.isArray(answers)) return "回答を送れませんでした";
  const list = answers.slice(0, CARDS).map((a) => cleanStr(a, MAX_LEN));
  const filled = list.filter(Boolean);
  const seen = new Set();
  for (const a of filled) { const k = canon(a); if (seen.has(k)) return `「${a}」が2枚あります。違う答えにしてください`; seen.add(k); }
  if (filled.length < CARDS) return `回答を${CARDS}つ書いてください(あと${CARDS - filled.length}つ)`;
  setHand(g, pid, filled);
  g.P[pid].written = true;
  if (g.order.every((id) => g.P[id].written || !c.has(id))) beginActions(c);
}
function setHand(g, pid, texts) {
  g.P[pid].hand = texts.map((t) => ({ id: g.nextId++, t }));
}
function beginActions(c) {
  const g = c.g;
  // 書き終わらなかった分は白紙(誰とも一致しない)
  for (const id of g.order) {
    const p = g.P[id];
    if (!p.written) {
      const mine = (p.draft || []).map((a) => cleanStr(a, MAX_LEN)).filter(Boolean);
      const uniq = []; const seen = new Set();
      for (const a of mine) if (!seen.has(canon(a))) { seen.add(canon(a)); uniq.push(a); }
      while (uniq.length < CARDS) uniq.push("");
      setHand(g, id, uniq.slice(0, CARDS));
      p.written = true;
    }
    delete p.draft;
  }
  g.step = "act";
  const i = g.order.indexOf(g.parent);
  g.cur = g.order[(i + 1) % g.order.length];
  log(g, "全員が書き終わりました。親の左隣から手番です");
  g.turnSeq++;
  arm(c);
}

// ---- 手番 ----
function nextTurn(c) {
  const g = c.g;
  if (g.order.some((id) => c.has(id) && g.P[id].hand.length === 0)) return scoring(c);
  const i = g.order.indexOf(g.cur);
  for (let k = 1; k <= g.order.length; k++) {
    const id = g.order[(i + k) % g.order.length];
    if (c.has(id)) { g.cur = id; break; }
  }
  g.turnSeq++;
  arm(c);
}
function pay(g, id, amt) {
  const p = g.P[id], x = Math.min(p.money, amt);
  p.money -= x; g.bowl += x;
  return x;
}
function play(c, pid, cardId) {
  const g = c.g;
  if (g.step !== "act" || g.cur !== pid || g.claims) return "今は出せません";
  const p = g.P[pid];
  const card = p.hand.find((x) => x.id === cardId);
  if (!card) return "そのカードは手札にありません";
  p.hand = p.hand.filter((x) => x !== card);
  p.out.push(card);
  // 書いた文字が同じ(表記ゆれは同じとみなす)カードは自動で出す。意味が同じものは本人が名乗り出る
  const auto = {};
  if (card.t) for (const id of g.order) {
    if (id === pid || !c.has(id)) continue;
    const m = g.P[id].hand.find((x) => canon(x.t) === canon(card.t));
    if (m) auto[id] = m.id;
  }
  g.played = { by: pid, card, matches: auto };
  g.claims = { open: true, passed: Object.keys(auto) };
  log(g, `${nm(c, pid)} が「${card.t || "(白紙)"}」を出しました`);
  // 名乗り出る人がいなければすぐ決める(全員一致済みか、白紙)
  const waiting = g.order.filter((id) => id !== pid && c.has(id) && !g.claims.passed.includes(id) && g.P[id].hand.length);
  if (!card.t || !waiting.length) return resolvePlay(c);
  arm(c);
}
function claim(c, pid, cardId) {
  const g = c.g;
  if (!g.claims || pid === g.played.by || g.claims.passed.includes(pid)) return;
  const p = g.P[pid];
  if (cardId != null) {
    const m = p.hand.find((x) => x.id === cardId);
    if (!m) return "そのカードは手札にありません";
    g.played.matches[pid] = m.id;
  }
  g.claims.passed.push(pid);
  const waiting = g.order.filter((id) => id !== g.played.by && c.has(id) && !g.claims.passed.includes(id) && g.P[id].hand.length);
  if (!waiting.length) resolvePlay(c);
}
function resolvePlay(c) {
  const g = c.g, pl = g.played, pid = pl.by;
  const ids = Object.keys(pl.matches).filter((id) => g.P[id]);
  for (const id of ids) {
    const p = g.P[id], m = p.hand.find((x) => x.id === pl.matches[id]);
    if (!m) continue;
    p.hand = p.hand.filter((x) => x !== m);
    p.out.push(m);
  }
  if (ids.length) {
    const won = g.bowl;
    g.P[pid].money += won; g.bowl = MATCH_REFILL; g.glass = Math.min(g.glass + 1, 99);
    log(g, `一致！(${ids.map((id) => nm(c, id)).join("・")}) ${nm(c, pid)} が賞金ボウルの${yen(won)}を獲得。一致${g.glass}回目`);
    pl.result = { ok: true, won, ids };
  } else {
    const x = pay(g, pid, MISS_FEE);
    log(g, `誰とも一致せず。${nm(c, pid)} は${yen(x)}をボウルへ`);
    pl.result = { ok: false, paid: x, ids: [] };
  }
  g.last = { ...pl };
  g.played = null; g.claims = null;
  nextTurn(c);
}
function bet(c, pid, slot) {
  const g = c.g;
  if (g.step !== "act" || g.cur !== pid || g.claims) return "今は賭けられません";
  const p = g.P[pid];
  if (!Number.isInteger(slot) || slot < 0 || slot >= TRACK) return "予想する数を選んでください";
  if (p.markers <= 0) return "マーカーが残っていません";
  if (p.money < BET_FEE) return `賭けるには${yen(BET_FEE)}必要です`;
  if (g.bets.filter((b) => b.slot === slot).length >= SLOT_MAX) return "その数にはもう2つ置かれています";
  pay(g, pid, BET_FEE);
  p.markers--;
  g.bets.push({ id: pid, slot, seq: g.bets.length });
  log(g, `${nm(c, pid)} が${yen(BET_FEE)}払って「${slotName(slot)}回」に賭けました`);
  g.last = null;
  nextTurn(c);
}
const slotName = (s) => (s >= TRACK - 1 ? `${TRACK - 1}+` : String(s));

// ---- 得点計算 ----
function scoring(c) {
  const g = c.g;
  g.cur = null;
  if (g.cfg.penalty === "off") {
    // お題と関係ない回答を、みんなで判定する(半分より多くの人が「関係ない」と押したら$20)
    g.step = "judge"; g.flags = {}; g.flagDone = [];
    log(g, "ラウンド終了。お題と関係ない回答がないか、みんなで確認します");
    return arm(c);
  }
  settle(c);
}
function flag(c, pid, cardId, on) {
  const g = c.g;
  if (g.step !== "judge" || !g.P[pid]) return;
  const owner = g.order.find((id) => [...g.P[id].hand, ...g.P[id].out].some((x) => x.id === cardId));
  if (!owner || owner === pid) return;
  const set = new Set(g.flags[cardId] || []);
  if (on) set.add(pid); else set.delete(pid);
  g.flags[cardId] = [...set];
}
function flagDone(c, pid) {
  const g = c.g;
  if (g.step !== "judge" || !g.P[pid] || g.flagDone.includes(pid)) return;
  g.flagDone.push(pid);
  if (g.order.every((id) => g.flagDone.includes(id) || !c.has(id))) settle(c);
}
function settle(c) {
  const g = c.g;
  const n = g.order.length;
  const fines = {};
  for (const id of g.order) {
    const p = g.P[id];
    let cnt;
    if (g.cfg.penalty === "off") {
      const voters = g.order.filter((x) => x !== id && c.has(x)).length;
      cnt = [...p.hand, ...p.out].filter((x) => !x.t || (g.flags[x.id] || []).length * 2 > voters).length;
    } else cnt = p.hand.length;
    if (cnt) fines[id] = pay(g, id, PENALTY * cnt);
  }
  const bonus = bonusOf(n, g.round);
  g.bowl += bonus;
  const pos = Math.min(g.glass, TRACK - 1);
  const winners = g.bets.filter((b) => b.slot === pos).sort((a, b) => a.seq - b.seq);
  const pot = g.bowl, gain = {};
  if (winners.length === 1) gain[winners[0].id] = pot;
  else if (winners.length >= 2) {
    const half = Math.floor(pot / 2);
    gain[winners[0].id] = (gain[winners[0].id] || 0) + pot - half; // 割り切れない分は先に置いた人
    gain[winners[1].id] = (gain[winners[1].id] || 0) + half;
  }
  for (const [id, v] of Object.entries(gain)) if (g.P[id]) g.P[id].money += v;
  g.bowl = 0;
  g.results = { round: g.round, glass: g.glass, slot: pos, fines, bonus, pot, gain, hands: Object.fromEntries(g.order.map((id) => [id, [...g.P[id].out, ...g.P[id].hand]])) };
  const fineTxt = Object.entries(fines).map(([id, v]) => `${nm(c, id)} -${yen(v)}`).join("・");
  log(g, `一致は${g.glass}回。${fineTxt ? "罰金: " + fineTxt + "。" : ""}ボーナス${yen(bonus)}を足してボウルは${yen(pot)}`);
  log(g, Object.keys(gain).length ? `予想的中: ${Object.entries(gain).map(([id, v]) => `${nm(c, id)} +${yen(v)}`).join("・")}` : "予想が当たった人はいません(ボウルは銀行へ)");
  g.step = "result";
  g.ready = [];
  arm(c);
}
function nextRound(c, pid) {
  const g = c.g;
  if (g.step !== "result") return;
  if (pid && !g.ready.includes(pid)) g.ready.push(pid);
  if (pid && !g.order.every((id) => g.ready.includes(id) || !c.has(id))) return;
  if (g.round >= ROUNDS) return endGame(c);
  newRound(c);
}
function endGame(c) {
  const g = c.g;
  g.step = "end";
  log(g, "ゲーム終了");
  c.finish(Object.fromEntries(g.order.filter((id) => c.has(id)).map((id) => [id, g.P[id].money])));
}

// ---- 時間切れ ----
function arm(c) {
  const g = c.g;
  const secs = g.step === "topic" ? 60 : g.step === "confirm" ? 20 : g.step === "write" ? g.cfg.writeSecs
    : g.step === "act" ? (g.claims ? 15 : g.cfg.turnSecs) : g.step === "judge" ? 60 : g.step === "result" ? 30 : 0;
  if (!secs) return c.clearTimer();
  const key = [g.step, g.round, g.turnSeq, g.claims ? "c" : "", g.topic].join(":");
  if (g.armKey === key) return;
  g.armKey = key;
  c.setTimer(secs * 1000, () => {
    g.armKey = null;
    if (g.step === "topic") { if (!c.has(g.parent)) g.parent = g.order.find((id) => c.has(id)) || g.parent; setTopic(c, g.parent, g.topicOpts[0]); return; }
    if (g.step === "confirm") return checkVotes(c, true);
    if (g.step === "write") return beginActions(c);
    if (g.step === "act" && g.claims) { g.claims.passed = g.order.filter((id) => id !== g.played.by); return resolvePlay(c); }
    if (g.step === "act") {
      // 時間切れ: 手札の先頭を出す
      const p = g.P[g.cur];
      log(g, `${nm(c, g.cur)} は時間切れ`);
      if (p && p.hand.length) return play(c, g.cur, p.hand[0].id);
      return nextTurn(c);
    }
    if (g.step === "judge") return settle(c);
    if (g.step === "result") return nextRound(c, null);
  });
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step === "end") return;
  switch (m.a) {
    case "topic": return setTopic(c, pid, m.text);
    case "vote": return vote(c, pid, m.ok);
    case "draft": // 書きかけの回答(時間切れのときに使う)
      if (g.step === "write" && g.P[pid] && Array.isArray(m.answers)) g.P[pid].draft = m.answers.slice(0, CARDS).map((a) => cleanStr(a, MAX_LEN));
      return { silent: true };
    case "write": return write(c, pid, m.answers);
    case "play": return play(c, pid, Number(m.id));
    case "claim": return claim(c, pid, m.id == null ? null : Number(m.id));
    case "bet": return bet(c, pid, Number(m.slot));
    case "flag": return flag(c, pid, Number(m.id), !!m.on);
    case "flagDone": return flagDone(c, pid);
    case "next": return nextRound(c, pid);
    default: return;
  }
}

function onLeave(c, pid) {
  const g = c.g;
  if (!g || !g.P[pid]) return;
  log(g, `${nm(c, pid)} が抜けました`);
  g.order = g.order.filter((id) => id !== pid);
  delete g.P[pid];
  g.bets = g.bets.filter((b) => b.id !== pid);
  if (!g.order.length) return;
  if (g.parent === pid) g.parent = g.order[0];
  if (g.step === "confirm") return checkVotes(c);
  if (g.step === "write" && g.order.every((id) => g.P[id].written || !c.has(id))) return beginActions(c);
  if (g.step === "act") {
    if (g.played && g.played.by === pid) { g.played = null; g.claims = null; }
    if (g.played) {
      delete g.played.matches[pid];
      const waiting = g.order.filter((id) => id !== g.played.by && c.has(id) && !g.claims.passed.includes(id) && g.P[id].hand.length);
      if (!waiting.length) return resolvePlay(c);
    }
    if (g.cur === pid || !g.cur) { g.cur = g.order[0]; g.turnSeq++; arm(c); }
  }
  if (g.step === "judge" && g.order.every((id) => g.flagDone.includes(id) || !c.has(id))) settle(c);
}

function view(c, me) {
  const g = c.g;
  const showAll = g.step === "judge" || g.step === "result" || g.step === "end";
  const P = {};
  for (const id of g.order) {
    const p = g.P[id];
    P[id] = { money: p.money, handCount: p.hand.length, out: p.out, markers: p.markers, written: p.written };
    if (showAll) P[id].hand = p.hand;
  }
  return {
    cfg: g.cfg, order: g.order, P, round: g.round, rounds: ROUNDS, step: g.step, parent: g.parent, topic: g.topic,
    topicOpts: g.parent === me ? g.topicOpts : [], vetoes: g.vetoes, cur: g.cur, bowl: g.bowl, glass: g.glass, bets: g.bets,
    played: g.played ? { by: g.played.by, card: g.played.card, matched: Object.keys(g.played.matches) } : null,
    claims: g.claims ? { passed: g.claims.passed } : null,
    last: g.last ? { by: g.last.by, card: g.last.card, result: g.last.result } : null,
    hand: g.P[me] ? g.P[me].hand : [], flags: g.flags, flagDone: g.flagDone, results: g.results, ready: g.ready || [],
    bonus: bonusOf(g.order.length, g.round), track: TRACK, slotMax: SLOT_MAX, log: g.log,
  };
}

module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, TOPICS, BONUS, _t: { canon, bonusOf, settle, scoring } };
