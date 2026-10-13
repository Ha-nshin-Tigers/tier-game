"use strict";
// インサイダー(インサイダーゲーム風)のルール本体。部屋・入室は games/insider.js が受け持つ。
// 役職: マスター(公開・お題を知る) / インサイダー(秘密・お題を知る) / 庶民(お題を知らない)
// 流れ: 質問タイム(はい/いいえ で答えてお題を当てる) → 当たったら、かかった時間だけ話し合い →
//       投票1「答えた人はインサイダー？」 → 過半数でなければ 投票2「インサイダーはだれ？」 → 結果

const WORDS = [
  "りんご", "バナナ", "いちご", "すいか", "みかん", "ぶどう", "もも", "メロン", "レモン", "パイナップル",
  "カレー", "ラーメン", "すし", "ハンバーガー", "ピザ", "おにぎり", "たまご", "パン", "チーズ", "アイスクリーム",
  "ケーキ", "チョコレート", "ポテトチップス", "ドーナツ", "コーヒー", "牛乳", "みそしる", "うどん", "やきにく", "たこやき",
  "いぬ", "ねこ", "うさぎ", "パンダ", "ライオン", "ぞう", "キリン", "ペンギン", "イルカ", "クジラ",
  "カメ", "ヘビ", "カエル", "ハムスター", "ニワトリ", "ウマ", "サル", "クマ", "コアラ", "カブトムシ",
  "えんぴつ", "けしゴム", "ノート", "はさみ", "のり", "定規", "ホッチキス", "黒板", "ランドセル", "辞書",
  "スマートフォン", "テレビ", "冷蔵庫", "電子レンジ", "せんたく機", "エアコン", "そうじ機", "パソコン", "カメラ", "ドライヤー",
  "時計", "めがね", "かさ", "さいふ", "かばん", "くつ", "ぼうし", "マフラー", "てぶくろ", "ネクタイ",
  "歯ブラシ", "タオル", "まくら", "ふとん", "かがみ", "カーテン", "いす", "つくえ", "ソファ", "電球",
  "自転車", "自動車", "バス", "電車", "新幹線", "飛行機", "船", "ヘリコプター", "ロケット", "タクシー",
  "学校", "病院", "図書館", "公園", "駅", "空港", "コンビニ", "遊園地", "動物園", "水族館",
  "映画館", "温泉", "神社", "お城", "海", "山", "川", "砂漠", "島", "森",
  "太陽", "月", "星", "雲", "雨", "雪", "虹", "かみなり", "台風", "地震",
  "サッカー", "野球", "テニス", "バスケットボール", "水泳", "スキー", "マラソン", "ボウリング", "卓球", "ゴルフ",
  "ピアノ", "ギター", "ドラム", "バイオリン", "カラオケ", "ダンス", "まんが", "アニメ", "ゲーム", "トランプ",
  "医者", "先生", "警察官", "消防士", "パイロット", "コック", "サンタクロース", "忍者", "王様", "ロボット",
  "誕生日", "お正月", "クリスマス", "ハロウィン", "花火", "結婚式", "運動会", "修学旅行", "夏休み", "バレンタイン",
  "雪だるま", "風船", "シャボン玉", "たこ", "けん玉", "ブランコ", "すべり台", "砂場", "かくれんぼ", "おにごっこ",
  "ひまわり", "さくら", "チューリップ", "バラ", "サボテン", "どんぐり", "きのこ", "たけのこ", "落ち葉", "四つ葉のクローバー",
  "ピラミッド", "エッフェル塔", "富士山", "東京タワー", "自由の女神", "万里の長城", "宇宙", "恐竜", "おばけ", "宝くじ",
];

const DEFAULTS = { qSecs: 300, master: "rotate" };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if ([180, 300, 420].includes(r.qSecs)) out.qSecs = r.qSecs;
  if (["rotate", "random"].includes(r.master)) out.master = r.master;
  return out;
}
const VOTE_SECS = 30, MAX_Q = 200, Q_LEN = 60, REDRAW_MAX = 3;
// 制御文字・見えない文字・書字方向を変える文字(質問の文字から取り除く)
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 127], [8203, 8207], [8232, 8238], [8294, 8297]].map(([x, y]) => String.fromCharCode(x) + "-" + String.fromCharCode(y)).join("") + "]", "g");
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// start: ラウンドを始める。prev(前のラウンドの g)があれば勝ち数とマスターの順番を引き継ぐ
function start(c, settings, prev) {
  const cfg = normalize(settings);
  const players = c.members().filter((id) => c.has(id));
  const wins = prev && prev.wins ? { ...prev.wins } : {};
  for (const id of players) wins[id] = wins[id] || 0;
  let master;
  if (cfg.master === "random" || !prev) master = pick(players);
  else { const i = players.indexOf(prev.master); master = players[(i + 1) % players.length]; }
  const insider = pick(players.filter((id) => id !== master));
  const used = prev && prev.used ? [...prev.used] : [];
  c.g = {
    cfg, players, master, insider, wins, used, round: (prev ? prev.round : 0) + 1,
    word: null, redraws: 0, step: "ready", qs: [], qSeq: 0,
    startedAt: 0, solvedAt: 0, answerer: null, votes1: {}, votes2: {}, result: null,
  };
  newWord(c);
  // 準備: マスターがお題を確認して「スタート」(お題は変えられる)
  c.setTimer(60000, () => beginQuestions(c));
}
function newWord(c) {
  const g = c.g;
  let pool = WORDS.filter((w) => !g.used.includes(w));
  if (!pool.length) { g.used = []; pool = WORDS; }
  g.word = pick(pool); g.used.push(g.word);
}
function beginQuestions(c) {
  const g = c.g;
  if (g.step !== "ready") return;
  g.step = "question"; g.startedAt = Date.now();
  c.setTimer(g.cfg.qSecs * 1000, () => finish(c, "timeout"));
}
// 正解が出た: かかった時間だけ話し合い(砂時計をひっくり返すのと同じ)
function solved(c, answerer) {
  const g = c.g;
  g.step = "discuss"; g.answerer = answerer; g.solvedAt = Date.now();
  const used = Math.max(10000, g.solvedAt - g.startedAt);
  c.setTimer(used, () => toVote1(c));
}
function toVote1(c) {
  const g = c.g;
  if (g.step !== "discuss") return;
  g.step = "vote1";
  c.setTimer(VOTE_SECS * 1000, () => closeVote1(c));
}
const voters1 = (g, live) => g.players.filter((id) => id !== g.answerer && live.includes(id));
function closeVote1(c) {
  const g = c.g;
  if (g.step !== "vote1") return;
  const vs = voters1(g, c.live()), yes = vs.filter((id) => g.votes1[id] === true).length;
  g.vote1 = { yes, total: vs.length };
  if (yes * 2 > vs.length) return finish(c, g.answerer === g.insider ? "caught1" : "wrong1");
  g.step = "vote2";
  c.setTimer(VOTE_SECS * 1000, () => closeVote2(c));
}
function closeVote2(c) {
  const g = c.g;
  if (g.step !== "vote2") return;
  const count = {};
  for (const [v, t] of Object.entries(g.votes2)) if (g.players.includes(v) && g.players.includes(t)) count[t] = (count[t] || 0) + 1;
  const max = Math.max(0, ...Object.values(count));
  const top = Object.keys(count).filter((id) => count[id] === max);
  g.vote2 = { count, top };
  // 1人に決まり、その人がインサイダーなら庶民の勝ち。同票はインサイダーを特定できなかった扱い
  finish(c, top.length === 1 && top[0] === g.insider ? "caught2" : "escaped");
}
function finish(c, how) {
  const g = c.g;
  c.clearTimer();
  g.step = "result";
  const commonsWin = how === "caught1" || how === "caught2";
  const insiderWin = how === "wrong1" || how === "escaped";
  g.result = { how, commonsWin, insiderWin };
  if (commonsWin) for (const id of g.players) if (id !== g.insider) g.wins[id]++;
  if (insiderWin) g.wins[g.insider]++;
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g || !g.players.includes(pid)) return;
  const isMaster = pid === g.master;
  switch (m.a) {
    case "redraw":
      if (!isMaster || g.step !== "ready") return;
      if (g.redraws >= REDRAW_MAX) return `お題を変えられるのは${REDRAW_MAX}回までです`;
      g.redraws++; newWord(c);
      return;
    case "begin":
      if (!isMaster || g.step !== "ready") return;
      return beginQuestions(c);
    case "ask": {
      // 画面に書く質問(通話で話してもよい)
      if (g.step !== "question" || isMaster) return;
      const text = typeof m.text === "string" ? m.text.replace(BAD_CHARS, "").trim().slice(0, Q_LEN) : "";
      if (!text) return "質問を入れてください";
      if (g.qs.length >= MAX_Q) return "質問が多すぎます";
      if (g.qs.filter((q) => q.by === pid && !q.ans).length >= 3) return "答えを待っている質問が3つあります";
      g.qs.push({ id: ++g.qSeq, by: pid, text, ans: null });
      return;
    }
    case "answer": {
      if (!isMaster || g.step !== "question") return;
      const q = g.qs.find((x) => x.id === m.id);
      if (!q || !["yes", "no", "idk"].includes(m.ans)) return;
      q.ans = m.ans;
      return;
    }
    case "correct": {
      // マスター: 正解が出た(答えた人を選ぶ)
      if (!isMaster || g.step !== "question") return;
      if (typeof m.who !== "string" || m.who === g.master || !g.players.includes(m.who)) return "答えた人を選んでください";
      const q = g.qs.find((x) => x.id === m.id);
      if (q) q.ans = "correct";
      return solved(c, m.who);
    }
    case "toVote":
      if (!isMaster || g.step !== "discuss") return;
      return toVote1(c);
    case "vote1":
      if (g.step !== "vote1" || pid === g.answerer || typeof m.yes !== "boolean") return;
      g.votes1[pid] = m.yes;
      if (voters1(g, c.live()).every((id) => id in g.votes1)) closeVote1(c);
      return;
    case "vote2":
      if (g.step !== "vote2" || typeof m.who !== "string" || m.who === pid || !g.players.includes(m.who)) return;
      g.votes2[pid] = m.who;
      if (g.players.filter((id) => c.live().includes(id)).every((id) => id in g.votes2)) closeVote2(c);
      return;
    default:
      return;
  }
}

function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step === "result") return;
  // マスターかインサイダーが抜けたら、このラウンドは続けられないので流す
  if (pid === g.master || pid === g.insider) { g.result = null; finish(c, "aborted"); return; }
  g.players = g.players.filter((id) => id !== pid);
  if (g.step === "vote1" && voters1(g, c.live()).every((id) => id in g.votes1)) closeVote1(c);
  else if (g.step === "vote2" && g.players.filter((id) => c.live().includes(id)).every((id) => id in g.votes2)) closeVote2(c);
}

function view(c, me) {
  const g = c.g, done = g.step === "result";
  const role = me === g.master ? "master" : me === g.insider ? "insider" : g.players.includes(me) ? "common" : null;
  return {
    step: g.step, round: g.round, cfg: g.cfg, players: g.players, master: g.master, wins: g.wins, redraws: g.redraws, redrawMax: REDRAW_MAX,
    // お題は当たった時点で全員に公開(答えた人が口に出しているので)
    role, word: g.answerer || done || role === "master" || role === "insider" ? g.word : null,
    insider: done ? g.insider : null,
    qs: g.qs.slice(-60), answerer: g.answerer,
    elapsed: g.solvedAt ? g.solvedAt - g.startedAt : null,
    voted1: Object.keys(g.votes1), voted2: Object.keys(g.votes2), myVote1: g.votes1[me] ?? null, myVote2: g.votes2[me] ?? null,
    vote1: done || g.step === "vote2" ? g.vote1 || null : null,
    vote2: done ? g.vote2 || null : null,
    votes2: done ? g.votes2 : null,
    result: g.result,
  };
}

module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, WORDS };
