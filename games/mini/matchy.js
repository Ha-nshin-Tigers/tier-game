"use strict";
// マッチィマッチ:相性チェックゲーム(Matchy Matchy / Compatibility 風)のルール本体。部屋・入室は games/matchy.js が受け持つ。
// お題に合うと思う写真カードを、全員同じ42枚から選んで「関連が強い順」に並べる。
// 偶数人数: 2人1組のペアで、相方と同じカード・同じ順番なら得点。奇数人数: 「参照プレイヤー」と比べて各自が得点。
// 同じカード+同じ順番=3点、同じカード+違う順番=2点。点数だけコマを進め、ゴールに最初に着いたチームの勝ち。

// 写真カード(42枚)。本家は写真。ここでは絵文字の「場面」と短い説明で代わりにする(このサイト独自)
const PHOTOS = [
  ["🧸🗑️", "ゴミ捨て場のぬいぐるみ"], ["🎢", "ジェットコースター"], ["🎂🥳", "ひとりの誕生日"], ["🔮👵", "占い師のおばあさん"], ["🎅", "サンタクロース"], ["🐟🐟🐟", "魚の群れ"],
  ["🌋", "噴火する火山"], ["🏝️", "南の島"], ["🚀", "ロケット発射"], ["☔", "雨の日の傘"], ["🐈💤", "昼寝する猫"], ["🏋️", "重量挙げ"],
  ["🍜", "湯気の立つラーメン"], ["💍", "指輪"], ["🕰️", "古い柱時計"], ["🧊", "氷"], ["🔥", "たき火"], ["👶", "赤ちゃん"],
  ["🐘", "ゾウ"], ["🪶", "羽根"], ["🎈", "風船"], ["💸", "飛んでいくお金"], ["🏰", "お城"], ["🌃", "夜の街"],
  ["🌸", "桜並木"], ["🏔️", "雪山"], ["🐝", "ハチ"], ["🧹", "ほうき"], ["📚", "本の山"], ["🎤", "カラオケ"],
  ["🚑", "救急車"], ["🍄", "キノコ"], ["🧘", "瞑想"], ["🤡", "ピエロ"], ["🐢", "カメ"], ["⚡", "雷"],
  ["🎁", "プレゼント"], ["🕳️", "深い穴"], ["🌈", "虹"], ["🦷", "歯医者"], ["🍦", "アイスクリーム"], ["🛸", "UFO"],
];
// お題(テーマ)。本家は576個。ここではこのサイトで作ったもの(かんたん=緑の面・むずかしい=ピンクの面のつもり)
const THEMES = {
  easy: ("軽い 重い 熱い 冷たい 甘い 速い 遅い 大きい 小さい 古い 新しい 高い 柔らかい 硬い うるさい 静か 明るい 暗い きれい 汚い " +
    "楽しい 悲しい 怖い 優しい 危ない 安心 眠い 元気 疲れた 痛い かわいい かっこいい 不思議 懐かしい 高級 安い 便利 面倒 さわやか 夏 " +
    "冬 春 秋 夜 朝 雨 雪 海 山 空 家族 友達 恋 結婚 誕生日 お祭り 旅行 学校 仕事 休日 " +
    "お金 食べ物 動物 乗り物 音楽 スポーツ 病院 魔法 宇宙 未来 昔 子ども お年寄り ヒーロー 悪者 王様 夢 秘密 驚き 幸運 " +
    "失敗 成功 自由 平和 冒険 挑戦 我慢 努力 待つ 逃げる 守る 壊れる 光る 浮かぶ 落ちる 回る 増える 消える 育つ 始まり 終わり").split(" "),
  hard: ("迷信 イワシ 哲学 正義 嫉妬 虚無 気まずい 反抗期 月曜日 締め切り 給料日 二日酔い 筋肉痛 満員電車 寝坊 言い訳 本音 建前 黒歴史 お約束 " +
    "中年 青春 老後 運命 宿命 偶然 必然 矛盾 皮肉 謙虚 傲慢 見栄 意地 根性 義理 人情 わびさび もったいない 腹八分 一期一会 " +
    "猫かぶり 八方美人 縁の下 灯台下暗し 棚からぼたもち 猫に小判 豚に真珠 二兎を追う 石の上にも三年 急がば回れ 塩対応 神対応 ドヤ顔 チート 炎上 バズる 推し 沼 尊い エモい " +
    "量子 重力 時間 無限 ゼロ 素数 宇宙人 タイムマシン ロボット 人工知能 予言 呪い お化け 天国 地獄 迷路 鏡 影 仮面 正体 " +
    "スパイ 探偵 怪盗 忍者 侍 海賊 魔女 勇者 魔王 ラスボス 伏線 どんでん返し 大団円 最終回 打ち切り 続編 前日譚 都市伝説 七不思議 デジャヴ").split(" "),
};
const GOAL = 30;
// コマのいるマスで選ぶ枚数(本家は「マスに書かれた数」。ここでは先へ進むほど少なくなる配置にした=推定)
const cardsAt = (pos) => (pos < 8 ? 5 : pos < 16 ? 4 : pos < 23 ? 3 : 2);
const DEFAULTS = { pickSecs: 90, level: "easy", ref: "random", pairs: "random" };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if ([60, 90, 120, 180].includes(r.pickSecs)) out.pickSecs = r.pickSecs;
  if (["easy", "hard", "mix"].includes(r.level)) out.level = r.level;
  if (typeof r.ref === "string" && /^[a-z0-9]{1,32}$/.test(r.ref)) out.ref = r.ref;
  if (["random", "order"].includes(r.pairs)) out.pairs = r.pairs;
  return out;
}
const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CALL_MS = 20000, REVEAL_MS = 25000;

function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const order = [...c.members()];
  const odd = order.length % 2 === 1;
  let ref = null, teams;
  if (odd) {
    ref = order.includes(cfg.ref) ? cfg.ref : order[Math.floor(rnd() * order.length)];
    teams = order.filter((x) => x !== ref).map((id) => ({ ids: [id], pos: 0, last: null }));
  } else {
    const list = cfg.pairs === "order" ? [...order] : shuffle([...order], rnd);
    teams = []; for (let i = 0; i < list.length; i += 2) teams.push({ ids: [list[i], list[i + 1]], pos: 0, last: null });
  }
  const pool = cfg.level === "mix" ? [...THEMES.easy, ...THEMES.hard] : [...THEMES[cfg.level]];
  const g = c.g = { cfg, order, odd, ref, teams, round: 0, step: "call", caller: null, card: null, theme: null, picks: {}, playoff: null, winner: null, themes: shuffle(pool, rnd), log: [], result: null, rnd };
  log(g, odd ? `奇数人数: ${c.nameOf(ref)} が参照プレイヤー。いちばん相性のいい人はだれ？` : `ペア: ${teams.map((t) => t.ids.map((x) => c.nameOf(x)).join("&")).join(" / ")}`);
  newRound(c);
}
function log(g, t) { g.log.push(t); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); }
const teamOf = (g, id) => g.teams.find((t) => t.ids.includes(id));
// その人が選ぶ枚数: 参照プレイヤーはいつも5枚、ほかはチームのコマのマスの数
const need = (g, id) => (id === g.ref ? 5 : cardsAt(teamOf(g, id) ? teamOf(g, id).pos : 0));
function newRound(c) {
  const g = c.g;
  g.round++; g.step = "call"; g.picks = {}; g.theme = null;
  g.caller = g.order[(g.round - 1) % g.order.length];
  // テーマカード: 12個のお題(番号を先に言ってからめくる)
  if (g.themes.length < 12) g.themes.push(...shuffle(g.cfg.level === "mix" ? [...THEMES.easy, ...THEMES.hard] : [...THEMES[g.cfg.level]], g.rnd));
  g.card = g.themes.splice(0, 12);
  c.setTimer(CALL_MS, () => call(c, g.caller, 1 + Math.floor(g.rnd() * 12)));
}
function call(c, id, n) {
  const g = c.g;
  if (g.step !== "call") return;
  if (id !== g.caller) return "番号を言うのは " + c.nameOf(g.caller) + " さんです";
  if (!Number.isInteger(n) || n < 1 || n > 12) return "1〜12の番号を選んでください";
  g.theme = { n, word: g.card[n - 1] };
  g.step = "pick";
  log(g, `ラウンド${g.round}: ${c.nameOf(id)} が ${n}番 →お題「${g.theme.word}」`);
  c.setTimer(g.cfg.pickSecs * 1000, () => reveal(c));
}
function pick(c, id, list) {
  const g = c.g;
  if (g.step !== "pick") return;
  if (!g.order.includes(id)) return;
  const n = need(g, id);
  const arr = Array.isArray(list) ? list.filter((x) => Number.isInteger(x) && x >= 0 && x < PHOTOS.length) : [];
  if (new Set(arr).size !== arr.length) return "同じカードは1回だけ選べます";
  if (arr.length !== n) return `${n}枚選んでください`;
  g.picks[id] = arr;
  if (g.order.every((x) => g.picks[x])) reveal(c);
}
// 2人の並びを比べる: 同じカード+同じ順番=3点、同じカード+違う順番=2点
function compare(a, b) {
  let pts = 0; const hits = [];
  a.forEach((card, i) => { const j = b.indexOf(card); if (j < 0) return; const same = i === j; pts += same ? 3 : 2; hits.push({ card, i, j, same }); });
  return { pts, hits };
}
function reveal(c) {
  const g = c.g;
  if (g.step !== "pick") return;
  g.step = "reveal";
  for (const id of g.order) if (!g.picks[id]) g.picks[id] = []; // 時間切れで出さなかった人は0枚
  const reached = [];
  for (const t of g.teams) {
    const [a, b] = g.odd ? [t.ids[0], g.ref] : t.ids;
    const r = a && b && g.picks[a] && g.picks[b] ? compare(g.picks[a], g.picks[b]) : { pts: 0, hits: [] };
    t.last = r;
    // 同点決勝のときは、決勝のチームだけが点を比べる(コマは動かさない)
    if (g.playoff) continue;
    t.pos = Math.min(GOAL, t.pos + r.pts);
    if (t.pos >= GOAL) reached.push(t);
  }
  const name = (t) => t.ids.map((x) => c.nameOf(x)).join("&");
  if (g.playoff) {
    const ts = g.teams.filter((t) => g.playoff.includes(t)), best = Math.max(...ts.map((t) => t.last.pts));
    const top = ts.filter((t) => t.last.pts === best);
    log(g, `同点決勝: ${ts.map((t) => `${name(t)} ${t.last.pts}点`).join("・")}`);
    if (top.length === 1) return finishLater(c, top[0]);
    g.playoff = top;
  } else {
    log(g, g.teams.map((t) => `${name(t)} +${t.last.pts}`).join(" / "));
    if (reached.length === 1) return finishLater(c, reached[0]);
    if (reached.length > 1) { g.playoff = reached; log(g, `${reached.map(name).join("・")} が同時にゴール！次のラウンドで同点決勝`); }
  }
  c.setTimer(REVEAL_MS, () => newRound(c));
}
// 答え合わせを見せてから終わる
function finishLater(c, team) {
  const g = c.g;
  g.winner = team;
  c.setTimer(REVEAL_MS, () => finish(c));
}
function finish(c) {
  const g = c.g;
  g.step = "end"; c.clearTimer();
  const raw = {};
  for (const id of g.order) { const t = teamOf(g, id); raw[id] = t ? (t === g.winner ? 1000 : t.pos) : -1; }
  if (g.ref) raw[g.ref] = g.winner ? 999 : 0; // 参照プレイヤーは順位の外(相性のいい相手を見つけた側)
  g.result = { winner: g.winner ? g.winner.ids : [], teams: g.teams.map((t) => ({ ids: t.ids, pos: t.pos })) };
  log(g, `🏆 ${g.winner.ids.map((x) => c.nameOf(x)).join("&")} の勝ち！` + (g.odd ? `(${c.nameOf(g.ref)} といちばん相性がいい)` : "(いちばん相性のいいペア)"));
  c.finish(raw);
}
function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step === "end") return;
  if (m.a === "call") return call(c, pid, m.n);
  if (m.a === "pick") return pick(c, pid, m.cards);
  if (m.a === "next" && g.step === "reveal" && !g.winner) { newRound(c); return; }
  if (m.a === "next" && g.step === "reveal" && g.winner) { finish(c); return; }
}
function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step === "end") return;
  g.order = g.order.filter((x) => x !== pid);
  delete g.picks[pid];
  log(g, `${c.nameOf(pid)} が抜けた`);
  if (pid === g.ref) {
    // 参照プレイヤーが抜けたら、いちばん後ろのチームの人が代わる
    const t = [...g.teams].sort((a, b) => a.pos - b.pos)[0];
    g.ref = t.ids[0]; g.teams = g.teams.filter((x) => x !== t);
    log(g, `${c.nameOf(g.ref)} が参照プレイヤーになった`);
  } else {
    const t = teamOf(g, pid);
    if (t) {
      t.ids = t.ids.filter((x) => x !== pid);
      // ペア戦(参照プレイヤーがいない)で1人になったチームは、もう一致できないので終わり(残った人は観戦)
      if (!t.ids.length || (!g.ref && t.ids.length === 1)) {
        if (t.ids.length) log(g, `相方が抜けたので ${c.nameOf(t.ids[0])} のチームは終わり(観戦)`);
        g.teams = g.teams.filter((x) => x !== t);
      }
    }
  }
  // 残りのチームが1つ以下(ペア戦では競う相手がいない)・遊ぶ人が2人未満なら、残ったチームの勝ちで終わる
  if (g.teams.length < 1 || g.order.length < 2 || (!g.ref && g.teams.length === 1)) { g.winner = g.teams[0] || null; if (g.winner) return finish(c); }
  if (g.step === "call" && pid === g.caller) { g.caller = g.order[0]; }
  if (g.step === "pick" && g.order.every((x) => g.picks[x])) reveal(c);
}
function view(c, me) {
  const g = c.g, open = g.step === "reveal" || g.step === "end";
  return {
    step: g.step, round: g.round, order: g.order, odd: g.odd, ref: g.ref, goal: GOAL, caller: g.caller, photos: PHOTOS,
    theme: g.theme, card: g.step === "call" ? null : g.card, // 番号を言う前はお題を見せない
    teams: g.teams.map((t) => ({ ids: t.ids, pos: t.pos, need: cardsAt(t.pos), last: open ? t.last : null })),
    need: g.order.includes(me) ? need(g, me) : 0,
    picked: g.order.filter((x) => g.picks[x]),
    picks: open ? g.picks : { [me]: g.picks[me] || null },
    playoff: g.playoff ? g.playoff.map((t) => t.ids) : null, winner: g.winner ? g.winner.ids : null,
    result: g.result, log: g.log.slice(-14),
  };
}
module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, PHOTOS, THEMES, GOAL, _t: { compare, cardsAt, need } };
