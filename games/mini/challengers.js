"use strict";
// チャレンジャーズ(Challengers! 風)のルール本体。部屋・入室は games/challengers.js が受け持つ。
// 全7ラウンド。各ラウンド: デッキフェイズ(5枚から1〜2枚選ぶ・デッキを削る) → マッチフェイズ(1対1の旗の取り合い。自動で進む)。
// 3人以上は7ラウンド後にファンの多い2人が決勝。2人は決勝なし(11人差で即勝利)。人数が奇数ならロボットが入る。
// カード・ルールは本家どおり(カード一覧は kuribodo.com の早見表、ルールは公式ルールブックと BGA の説明より)。

// ---------------------------------------------------------------
// カード
// ---------------------------------------------------------------
const SETS = {
  city: { name: "都市", icon: "🏙️", color: "#8a96a8" }, castle: { name: "城", icon: "🏰", color: "#c9a227" }, film: { name: "映画スタジオ", icon: "🎬", color: "#d0463f" },
  funfair: { name: "遊園地", icon: "🎈", color: "#e47bb4" }, haunted: { name: "お化け屋敷", icon: "👻", color: "#7d5ab5" }, shipwreck: { name: "難破船", icon: "⚓", color: "#2f8fb5" },
  space: { name: "宇宙", icon: "🪐", color: "#3fa36b" },
};
// [key, 名前, セット, レベル, パワー, 枚数, 効果の文]
const LIST = [
  // スターター(各プレイヤー6枚)
  ["newbie", "新入り", "city", "S", 1, 3, ""], ["talent", "タレント", "city", "S", 2, 1, ""], ["dog", "犬", "city", "S", 3, 1, ""], ["champion", "チャンピオン", "city", "S", 4, 1, ""],
  // レベルA
  ["reporter", "リポーター", "city", "A", 2, 4, "デッキの上から2枚を見て、1枚を一番上に、もう1枚を一番下に置く"], ["talent", "タレント", "city", "A", 2, 3, ""],
  ["hermit", "隠者", "castle", "A", 2, 4, "ベンチに都市のカードがなければ +2"], ["jester", "道化", "castle", "A", 1, 4, "ベンチに基本パワー1のカードが1枚以上あれば +3"],
  ["stableboy", "馬小屋小僧", "castle", "A", 2, 4, "ベンチの基本パワー3のカード1枚につき +1"], ["pig", "豚", "castle", "A", 3, 3, ""],
  ["makeup", "メイクさん", "film", "A", 1, 4, "【ベンチ時】基本パワー1の自分のカードは攻撃時 +2"], ["moviestar", "映画スター", "film", "A", 2, 4, "ベンチから「新入り」を2枚までデッキの上に置く"],
  ["gangster", "ギャング", "film", "A", 2, 4, "【攻撃中】+2"], ["cat", "猫", "film", "A", 3, 3, ""],
  ["clown", "ピエロ", "funfair", "A", 1, 4, "このカードが旗を取ったら、ファン+2"], ["juggler", "曲芸師", "funfair", "A", 2, 4, "デッキの上から3枚を見て、好きな順に戻す"],
  ["vendor", "売り子", "funfair", "A", 2, 4, "【ベンチ時】自分の遊園地のカード +1"], ["pony", "ポニー", "funfair", "A", 3, 3, ""],
  ["skeleton", "ガイコツ", "haunted", "A", 2, 8, "【旗の所持中】+1"], ["butler", "執事", "haunted", "A", 1, 4, "ベンチのカードを2枚まで消耗パイルへ"], ["spider", "蜘蛛", "haunted", "A", 3, 3, ""],
  ["treasure", "お宝", "shipwreck", "A", 2, 4, "【旗の所持中】+2"], ["merman", "人魚", "shipwreck", "A", 1, 4, "ベンチに難破船のカードが1枚以上あれば +3"],
  ["sailor", "船乗り", "shipwreck", "A", 2, 4, "デッキを全部見て、1枚を一番下に置く"], ["parrot", "オウム", "shipwreck", "A", 3, 3, ""],
  ["rescuepod", "救出ポッド", "space", "A", 1, 4, "【旗を失った時】このカードをゲームから除外し、レベルBの山の一番上を自分の消耗パイルへ"],
  ["shapeshifter", "シェイプシフター", "space", "A", 2, 4, "【選んだ時】デッキから1枚除外して、もう1枚選べる"], ["ai", "人工知能", "space", "A", 2, 3, "【ベンチ時】基本パワー2の自分のカード +1"], ["cow", "牛", "space", "A", 3, 3, ""],
  // レベルB
  ["mascot", "マスコット", "city", "B", 2, 4, "ベンチにある異なるセットのアイコン1つにつき +1"], ["dog", "犬", "city", "B", 3, 3, ""],
  ["blacksmith", "鍛冶屋", "castle", "B", 3, 4, "【ベンチ時】自分の都市のカード +1"], ["sorcerer", "ソーサラー", "castle", "B", 4, 4, "ベンチの基本パワー3以下のカード1枚を消耗パイルへ移してよい"],
  ["knight", "騎士", "castle", "B", 3, 4, "【攻撃中】相手のトロフィー1つにつき +1"], ["horse", "馬", "castle", "B", 5, 3, ""],
  ["director", "監督", "film", "B", 4, 4, "【ベンチ時】自分の映画スタジオのカードは攻撃時 +1"], ["cowboy", "カウボーイ", "film", "B", 3, 4, "このカードが旗を取ったら、相手はデッキの一番上のカードをベンチに置く"],
  ["comic", "コミックのキャラ", "film", "B", 4, 4, "【旗を失った時】次の攻撃で最初に出すカード +2"], ["lion", "ライオン", "film", "B", 5, 3, ""],
  ["pyro", "花火師", "funfair", "B", 4, 4, "自分のデッキが1枚以下なら、ファン+2"], ["seer", "予言者", "funfair", "B", 4, 4, "【旗を失った時】デッキから好きな1枚を一番上に置く"],
  ["mime", "マイム", "funfair", "B", 1, 4, "ベンチの空き1つにつき +1"], ["duck", "ゴムのアヒルちゃん", "funfair", "B", 5, 3, ""],
  ["necro", "ネクロマンサー", "haunted", "B", 3, 4, "ベンチの基本パワー2のカード1枚をデッキの上に置く"], ["ghost", "幽霊", "haunted", "B", 1, 4, "相手はデッキの一番上のカードを消耗パイルへ"],
  ["teen", "ティーンエイジャー", "haunted", "B", 2, 4, "ベンチのお化け屋敷のカード1枚につき +1"], ["bat", "コウモリ", "haunted", "B", 5, 3, ""],
  ["cook", "コック", "shipwreck", "B", 2, 4, "【ベンチ時】旗を持っている自分のカード +1"], ["lifeguard", "ライフガード", "shipwreck", "B", 4, 4, "自分のデッキが1枚以下なら +2"],
  ["pilot", "水先案内人", "shipwreck", "B", 4, 4, "【旗を失った時】デッキの上から2枚を見て、1枚を一番上、もう1枚を一番下に置く"], ["shark", "サメ", "shipwreck", "B", 5, 3, ""],
  ["band", "楽隊", "space", "B", 3, 4, "【ベンチ時】自分の宇宙のカード +1"], ["clone", "クローン", "space", "B", 4, 5, "【選んだ時】ファン+1"],
  ["ufo", "UFO", "space", "B", 3, 4, "レベルAの山の上から2枚を見ずに自分のデッキの一番下に置く"], ["alien", "エイリアン", "space", "B", 5, 3, ""],
  // レベルC
  ["bus", "遠征バス", "city", "C", 6, 4, "自分のトロフィーが3つ以下なら、ファン+2"], ["champion", "チャンピオン", "city", "C", 4, 2, ""],
  ["prince", "王子", "castle", "C", 5, 4, "【旗を失った時】このカードを消耗パイルへ(ベンチに置かない)"], ["bard", "吟遊詩人", "castle", "C", 4, 4, "【ベンチ時】自分のカードは攻撃時 +1"], ["dragon", "ドラゴン", "castle", "C", 7, 2, ""],
  ["heroine", "ヒロイン", "film", "C", 5, 4, "このカードが旗を取ったら、ファン+3"], ["villain", "ヴィラン", "film", "C", 10, 4, "レベルAの山の一番上を見ずに自分のデッキの上に置く"], ["trex", "ティラノサウルス", "film", "C", 7, 2, ""],
  ["magician", "手品師", "funfair", "C", 5, 4, "【旗の所持中】ベンチの空き1つにつき +1"], ["bumper", "バンパーカー", "funfair", "C", 6, 4, "デッキの上から3枚を見て、好きな順に戻す"], ["teddy", "テディベア", "funfair", "C", 7, 2, ""],
  ["vampire", "吸血鬼", "haunted", "C", 4, 4, "ベンチのレベルBのカード1枚をデッキの上に置く"], ["vacuum", "掃除機", "haunted", "C", 5, 4, "ベンチのカードを2枚まで消耗パイルへ"], ["werewolf", "人狼", "haunted", "C", 7, 2, ""],
  ["siren", "セイレーン", "shipwreck", "C", 6, 4, "相手のベンチのカード1枚を相手の消耗パイルへ移してよい"], ["sub", "潜水艦", "shipwreck", "C", 9, 4, "自分のデッキの一番下のカードを消耗パイルへ"], ["kraken", "クラーケン", "shipwreck", "C", 7, 2, ""],
  ["hologram", "ホログラム", "space", "C", 4, 4, "相手はレベルBの山の一番上を見ずにデッキの上に置く"], ["scifan", "SFオタク", "space", "C", 6, 4, "【選んだ時】デッキから2枚除外して、もう1枚選べる"], ["slime", "スライム", "space", "C", 7, 2, ""],
];
const CARDS = {};
for (const [key, name, set, lv, power, copies, text] of LIST) if (!CARDS[key]) CARDS[key] = { key, name, set, power, text };
const ADD_SETS = ["castle", "film", "funfair", "haunted", "shipwreck", "space"];

// ラウンドごとに選べる山(A を2枚 など)。R2 は資料になく R1 と同じとした
const ROUND_OPTS = { 1: [["A", 2]], 2: [["A", 2]], 3: [["A", 2], ["B", 1]], 4: [["A", 2], ["B", 2]], 5: [["B", 2]], 6: [["B", 2], ["C", 1]], 7: [["C", 2]] };
// 公園ごとのトロフィー(裏のファン数)。ラウンドごとに4枚
const TROPHY_FANS = { 1: [2, 2, 2, 3], 2: [2, 2, 3, 3], 3: [3, 3, 4, 4], 4: [5, 5, 6, 6], 5: [6, 6, 6, 7], 6: [7, 7, 7, 8], 7: [9, 9, 10, 10] };
const BENCH = 6, ROBOT = "robot";

const DEFAULTS = { exclude: "random", deckSecs: 120, speed: "normal" };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if (r.exclude === "random" || ADD_SETS.includes(r.exclude)) out.exclude = r.exclude;
  if ([90, 120, 180].includes(r.deckSecs)) out.deckSecs = r.deckSecs;
  if (["normal", "fast", "slow"].includes(r.speed)) out.speed = r.speed;
  return out;
}
const STEP_MS = { slow: 1300, normal: 850, fast: 400 }, PROMPT_MS = 20000, AFTER_MATCH_MS = 6000;

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const C = (card) => CARDS[card.k];
const isHuman = (id) => id !== ROBOT;

// ---------------------------------------------------------------
// 準備
// ---------------------------------------------------------------
function newCard(g, k, lv) { return { id: ++g.uid, k, lv, bonus: 0 }; }
function log(g, t) { g.log.push(t); if (g.log.length > 60) g.log.splice(0, g.log.length - 60); }
function start(c, settings) {
  const cfg = normalize(settings);
  const humans = shuffle([...c.members()]);
  const robot = humans.length % 2 === 1 && humans.length > 1;
  const seats = robot ? [...humans, ROBOT] : [...humans];
  const exclude = cfg.exclude === "random" ? ADD_SETS[Math.floor(Math.random() * ADD_SETS.length)] : cfg.exclude;
  const g = c.g = {
    cfg, exclude, humans, seats, robot, uid: 0, round: 0, phase: "deck", log: [], deadline: 0,
    decks: {}, fans: {}, trophies: {}, piles: { A: [], B: [], C: [] }, discards: { A: [], B: [], C: [] },
    parks: [], schedule: [], draft: {}, matches: [], final: null, result: null, changed: true,
  };
  // 山札: 都市 + 5セット
  for (const [key, , set, lv, , copies] of LIST) {
    if (lv === "S" || (set !== "city" && set === exclude)) continue;
    for (let k = 0; k < copies; k++) g.piles[lv].push(newCard(g, key, lv));
  }
  for (const lv of "ABC") shuffle(g.piles[lv]);
  for (const id of seats) {
    g.decks[id] = [];
    for (const [key, , , lv, , copies] of LIST) if (lv === "S") for (let k = 0; k < copies; k++) g.decks[id].push(newCard(g, key, "S"));
    g.fans[id] = 0; g.trophies[id] = [];
  }
  // 公園(2人ずつ)と、ラウンドごとのトロフィー(裏のファン数はランダム)
  const nParks = seats.length / 2;
  for (let p = 0; p < nParks; p++) g.parks.push({ trophies: {} });
  for (let r = 1; r <= 7; r++) { const fans = shuffle([...TROPHY_FANS[r]]); g.parks.forEach((pk, i) => { pk.trophies[r] = fans[i]; }); }
  // 対戦表: 総当たり(円の方法)。7ラウンドに足りなければ最初から繰り返す
  const n = seats.length, rounds = [];
  const ring = seats.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const pairs = [], line = [seats[0], ...ring];
    for (let i = 0; i < n / 2; i++) pairs.push([line[i], line[n - 1 - i]]);
    rounds.push(pairs); ring.unshift(ring.pop());
  }
  for (let r = 0; r < 7; r++) g.schedule.push(rounds[r % rounds.length]);
  log(g, `使うセット: 都市・${ADD_SETS.filter((s) => s !== exclude).map((s) => SETS[s].name).join("・")}(${SETS[exclude].name}は使わない)`);
  startDeckPhase(c);
}

// ---------------------------------------------------------------
// デッキフェイズ(各自が同時に)
// ---------------------------------------------------------------
function drawPile(g, lv) {
  if (!g.piles[lv].length) { g.piles[lv] = shuffle(g.discards[lv]); g.discards[lv] = []; }
  return g.piles[lv].pop() || null;
}
function discard(g, card) { if (card.lv === "S") return; g.discards[card.lv].push(Object.assign(card, { bonus: 0 })); }
function startDeckPhase(c) {
  const g = c.g;
  g.round++; g.phase = "deck"; g.matches = [];
  g.deadline = Date.now() + g.cfg.deckSecs * 1000;
  const opts = ROUND_OPTS[g.round];
  for (const id of g.seats) {
    const d = g.draft[id] = { opts, opt: null, display: [], picks: 0, need: 0, redrawn: false, step: "choose", extra: 0, removeFor: 0 };
    if (opts.length === 1) chooseOpt(g, id, 0);
    if (!isHuman(id)) autoDraft(g, id);
  }
  log(g, `第${g.round}ラウンド: デッキフェイズ`);
}
function chooseOpt(g, id, i) {
  const d = g.draft[id], [lv, n] = d.opts[i];
  d.opt = i; d.lv = lv; d.need = n; d.step = "pick";
  d.display = []; for (let k = 0; k < 5; k++) { const x = drawPile(g, lv); if (x) d.display.push(x); }
}
function redraw(g, id) {
  const d = g.draft[id];
  if (d.redrawn || d.step !== "pick") return "引き直しは1回までです";
  d.redrawn = true;
  const n = d.display.length;
  for (const x of d.display) discard(g, x);
  d.display = []; for (let k = 0; k < n; k++) { const x = drawPile(g, d.lv); if (x) d.display.push(x); }
}
function pick(g, id, cardId) {
  const d = g.draft[id], i = d.display.findIndex((x) => x.id === cardId);
  if (d.step !== "pick" || i < 0) return "選べません";
  const card = d.display.splice(i, 1)[0];
  g.decks[id].push(card); d.picks++;
  if (card.k === "clone") { g.fans[id] += 1; log(g, `${nm(g, id)} のクローン: ファン+1`); }
  if (card.k === "shapeshifter" || card.k === "scifan") {
    // 【選んだ時】デッキから除外すれば、もう1枚選べる(しなくてもよい)
    d.removeFor = card.k === "scifan" ? 2 : 1; d.step = "extra";
    return;
  }
  afterPick(g, id);
}
function afterPick(g, id) {
  const d = g.draft[id];
  if (d.picks >= d.need + d.extra || !d.display.length) { for (const x of d.display) discard(g, x); d.display = []; d.step = "trim"; }
  else d.step = "pick";
}
// シェイプシフター / SFオタク: デッキから removeFor 枚除外して、もう1枚
function extraChoice(g, id, ids) {
  const d = g.draft[id];
  if (d.step !== "extra") return;
  if (Array.isArray(ids) && ids.length === d.removeFor) {
    const deck = g.decks[id];
    if (!ids.every((x) => deck.some((y) => y.id === x)) || new Set(ids).size !== ids.length) return "除外するカードを選び直してください";
    for (const x of ids) { const j = deck.findIndex((y) => y.id === x); deck.splice(j, 1); } // 除外(ゲームから取り除く)
    d.extra++;
    log(g, `${nm(g, id)} がデッキから${ids.length}枚除外して、もう1枚選ぶ`);
  }
  d.removeFor = 0;
  afterPick(g, id);
}
function trim(g, id, ids) {
  const d = g.draft[id], deck = g.decks[id];
  if (d.step !== "trim") return;
  const set = new Set(Array.isArray(ids) ? ids : []);
  if (deck.filter((x) => !set.has(x.id)).length < 1) return "デッキを0枚にはできません";
  for (const x of deck.filter((y) => set.has(y.id))) discard(g, x);
  g.decks[id] = deck.filter((x) => !set.has(x.id));
  d.step = "done";
}
// 時間切れ・ロボット: 山を選び、パワーの高い順に選ぶ(削らない)
function autoDraft(g, id) {
  const d = g.draft[id];
  let guard = 20;
  while (d.step !== "done" && guard-- > 0) {
    if (d.step === "choose") chooseOpt(g, id, d.opts.length - 1);
    else if (d.step === "pick") { const best = [...d.display].sort((a, b) => C(b).power - C(a).power)[0]; if (best) pick(g, id, best.id); else afterPick(g, id); }
    else if (d.step === "extra") extraChoice(g, id, null);
    else if (d.step === "trim") trim(g, id, []);
  }
}
const nm = (g, id) => (id === ROBOT ? "ロボット" : g.names?.[id] || "?");

// ---------------------------------------------------------------
// マッチ(1対1の旗の取り合い)。サーバが1手ずつ進め、選択が必要な効果では本人に聞く
// ---------------------------------------------------------------
// 各プレイヤーの場: deck(上が先頭), bench(席ごとの配列), exhaust(消耗パイル), park(旗の山。最後が旗のカード), rev(攻撃で出したカード)
function newMatch(g, a, b, parkIdx, isFinal) {
  const z = {};
  for (const id of [a, b]) z[id] = { deck: shuffle(g.decks[id].map((x) => Object.assign(x, { bonus: 0 }))), bench: [], exhaust: [], park: [], rev: [], removed: [], next2: 0 };
  // 先に旗を持つのは、ラウンド番号の大きいトロフィーを持つ人。同じなら旗を投げて(ランダム)
  const top = (id) => Math.max(0, ...g.trophies[id].map((t) => t.round));
  let first = top(a) > top(b) ? a : top(b) > top(a) ? b : Math.random() < 0.5 ? a : b;
  // id は公園の番号(同じラウンドで重ならない)
  const m = { id: parkIdx, a, b, park: parkIdx, final: !!isFinal, z, flag: null, attacker: null, q: [], prompt: null, winner: null, loser: null, why: "", log: [], nextAt: Date.now() + 1200, ev: 0 };
  m.q.push({ t: "start", pid: first });
  return m;
}
const opp = (m, id) => (id === m.a ? m.b : m.a);
const mlog = (m, t) => { m.log.push(t); if (m.log.length > 40) m.log.shift(); };
const benchCards = (zz) => zz.bench.flat();
const flagCard = (m) => (m.flag ? m.z[m.flag].park[m.z[m.flag].park.length - 1] : null);
const emptySeats = (zz) => BENCH - zz.bench.length;

// カードの強さ(ctx: "attack" | "defend")
function power(g, m, owner, card, ctx) {
  const zz = m.z[owner], b = benchCards(zz), cd = C(card);
  let p = cd.power + card.bonus;
  const cnt = (k) => b.filter((x) => x.k === k).length;
  if (cd.set === "funfair") p += cnt("vendor");
  if (cd.power === 2) p += cnt("ai");
  if (cd.set === "city") p += cnt("blacksmith");
  if (cd.set === "space") p += cnt("band");
  if (ctx === "attack") {
    if (cd.power === 1) p += 2 * cnt("makeup");
    if (cd.set === "film") p += cnt("director");
    p += cnt("bard");
    if (card.k === "gangster") p += 2;
    if (card.k === "knight") p += (g.trophies[opp(m, owner)] || []).length;
  } else {
    p += cnt("cook");
    if (card.k === "skeleton") p += 1;
    if (card.k === "treasure") p += 2;
    if (card.k === "magician") p += emptySeats(zz);
  }
  return p;
}
const attackTotal = (g, m) => m.z[m.attacker].rev.reduce((n, x) => n + power(g, m, m.attacker, x, "attack"), 0);
const defenseTotal = (g, m) => { const f = flagCard(m); return f ? power(g, m, m.flag, f, "defend") : 0; };

function lose(g, m, who, why) { if (m.winner) return; m.loser = who; m.winner = opp(m, who); m.why = why; m.q = []; m.prompt = null; mlog(m, `${nm(g, who)} の負け(${why})`); }
// ベンチに置く(同じ名前は同じ席)。席が足りなければその人の負け
function toBench(g, m, id, cards) {
  const zz = m.z[id];
  for (const card of cards) {
    const seat = zz.bench.find((s) => C(s[0]).name === C(card).name);
    if (seat) seat.push(card);
    else if (zz.bench.length < BENCH) zz.bench.push([card]);
    else { zz.park = zz.park.filter((x) => x !== card); return lose(g, m, id, "ベンチがいっぱい"), false; }
  }
  return true;
}
function removeFromBench(zz, cardId) {
  for (let i = 0; i < zz.bench.length; i++) { const j = zz.bench[i].findIndex((x) => x.id === cardId); if (j >= 0) { const [x] = zz.bench[i].splice(j, 1); if (!zz.bench[i].length) zz.bench.splice(i, 1); return x; } }
  return null;
}

// 公開したときの効果(キーワードなし)
function onReveal(g, m, id, card) {
  const zz = m.z[id], other = m.z[opp(m, id)], b = benchCards(zz), k = card.k;
  const deckLow = zz.deck.length <= 1;
  if (zz.next2) { card.bonus += 2; zz.next2 = 0; mlog(m, `コミックのキャラの効果で ${C(card).name} +2`); }
  if (k === "hermit" && !b.some((x) => C(x).set === "city")) card.bonus += 2;
  if (k === "jester" && b.some((x) => C(x).power === 1)) card.bonus += 3;
  if (k === "stableboy") card.bonus += b.filter((x) => C(x).power === 3).length;
  if (k === "merman" && b.some((x) => C(x).set === "shipwreck")) card.bonus += 3;
  if (k === "mascot") card.bonus += new Set(b.map((x) => C(x).set)).size;
  if (k === "mime") card.bonus += emptySeats(zz);
  if (k === "teen") card.bonus += b.filter((x) => C(x).set === "haunted").length;
  if (k === "lifeguard" && deckLow) card.bonus += 2;
  if (k === "pyro" && deckLow) fans(g, m, id, 2, "花火師");
  if (k === "bus" && g.trophies[id].length <= 3) fans(g, m, id, 2, "遠征バス");
  if (k === "ghost" && other.deck.length) { other.exhaust.push(other.deck.shift()); mlog(m, `幽霊: ${nm(g, opp(m, id))} のデッキの一番上を消耗パイルへ`); }
  if (k === "sub" && zz.deck.length) { zz.exhaust.push(zz.deck.pop()); mlog(m, "潜水艦: デッキの一番下を消耗パイルへ"); }
  if (k === "ufo") { for (let i = 0; i < 2; i++) { const x = drawPile(g, "A"); if (x) zz.deck.push(x); } mlog(m, "UFO: レベルAの山から2枚をデッキの下へ"); }
  if (k === "villain") { const x = drawPile(g, "A"); if (x) zz.deck.unshift(x); mlog(m, "ヴィラン: レベルAの山から1枚をデッキの上へ"); }
  if (k === "hologram") { const x = drawPile(g, "B"); if (x) other.deck.unshift(x); mlog(m, `ホログラム: ${nm(g, opp(m, id))} のデッキの上にレベルBのカード`); }
  // 選択が必要な効果
  if (k === "reporter" && zz.deck.length >= 2) return ask(g, m, id, "topBottom", { cards: zz.deck.slice(0, 2).map((x) => x.id), title: "リポーター: 一番上に置くカードを選ぶ(もう1枚は一番下へ)" });
  if ((k === "juggler" || k === "bumper") && zz.deck.length >= 2) return ask(g, m, id, "order", { cards: zz.deck.slice(0, 3).map((x) => x.id), title: `${C(card).name}: 上に来る順に並べる` });
  if (k === "sailor" && zz.deck.length >= 2) return ask(g, m, id, "deckOne", { cards: zz.deck.map((x) => x.id), to: "bottom", title: "船乗り: 一番下に置くカードを1枚選ぶ" });
  if (k === "butler" || k === "vacuum") { if (b.length) return ask(g, m, id, "benchPick", { cards: b.map((x) => x.id), max: 2, min: 0, side: id, title: `${C(card).name}: 消耗パイルへ移すカードを2枚まで` }); }
  if (k === "sorcerer") { const ok = b.filter((x) => C(x).power <= 3); if (ok.length) return ask(g, m, id, "benchPick", { cards: ok.map((x) => x.id), max: 1, min: 0, side: id, title: "ソーサラー: 消耗パイルへ移すカード(基本パワー3以下)を1枚まで" }); }
  if (k === "necro") { const ok = b.filter((x) => C(x).power === 2); if (ok.length) return ask(g, m, id, "benchPick", { cards: ok.map((x) => x.id), max: 1, min: 1, side: id, toDeck: true, title: "ネクロマンサー: デッキの上に置くカード(基本パワー2)を1枚" }); }
  if (k === "vampire") { const ok = b.filter((x) => x.lv === "B"); if (ok.length) return ask(g, m, id, "benchPick", { cards: ok.map((x) => x.id), max: 1, min: 1, side: id, toDeck: true, title: "吸血鬼: デッキの上に置くレベルBのカードを1枚" }); }
  if (k === "moviestar") { const ok = b.filter((x) => x.k === "newbie"); if (ok.length) return ask(g, m, id, "benchPick", { cards: ok.map((x) => x.id), max: 2, min: 0, side: id, toDeck: true, title: "映画スター: デッキの上に置く「新入り」を2枚まで" }); }
  if (k === "siren") { const ob = benchCards(other); if (ob.length) return ask(g, m, id, "benchPick", { cards: ob.map((x) => x.id), max: 1, min: 0, side: opp(m, id), title: `セイレーン: ${nm(g, opp(m, id))} のベンチから消耗パイルへ移すカードを1枚まで` }); }
}
function fans(g, m, id, n, why) { if (!isHuman(id)) return; g.fans[id] += n; mlog(m, `${nm(g, id)} ファン+${n}(${why})`); }

// 選択を聞く(ロボットはすぐ自動で決める)
function ask(g, m, pid, kind, o) {
  m.prompt = { pid, kind, ...o, deadline: Date.now() + PROMPT_MS };
  if (!isHuman(pid)) answer(g, m, pid, null);
}
function answer(g, m, pid, ans) {
  const p = m.prompt;
  if (!p || p.pid !== pid) return "選ぶ番ではありません";
  const zz = m.z[pid], all = (id) => [...m.z[m.a].deck, ...m.z[m.b].deck, ...benchCards(m.z[m.a]), ...benchCards(m.z[m.b])].find((x) => x.id === id);
  const pw = (id) => { const x = all(id); return x ? C(x).power : 0; };
  let pickIds = Array.isArray(ans) ? ans.filter((x) => p.cards.includes(x)) : null;
  if (p.kind === "topBottom") {
    const topId = pickIds && pickIds.length === 1 ? pickIds[0] : [...p.cards].sort((x, y) => pw(y) - pw(x))[0];
    const [c1, c2] = zz.deck.splice(0, 2), top = c1.id === topId ? c1 : c2, bot = top === c1 ? c2 : c1;
    zz.deck.unshift(top); zz.deck.push(bot);
  } else if (p.kind === "order") {
    const ids = pickIds && pickIds.length === p.cards.length && new Set(pickIds).size === pickIds.length ? pickIds : [...p.cards].sort((x, y) => pw(y) - pw(x));
    const got = zz.deck.splice(0, p.cards.length);
    zz.deck.unshift(...ids.map((id) => got.find((x) => x.id === id)));
  } else if (p.kind === "deckOne") {
    const id = pickIds && pickIds.length === 1 ? pickIds[0] : [...p.cards].sort((x, y) => (p.to === "top" ? pw(y) - pw(x) : pw(x) - pw(y)))[0];
    const i = zz.deck.findIndex((x) => x.id === id), [x] = zz.deck.splice(i, 1);
    if (p.to === "top") zz.deck.unshift(x); else zz.deck.push(x);
  } else if (p.kind === "benchPick") {
    let ids = pickIds ? [...new Set(pickIds)].slice(0, p.max) : null;
    if (!ids || ids.length < p.min) ids = defaultBenchPick(g, m, p);
    const side = m.z[p.side];
    for (const id of ids) {
      const x = removeFromBench(side, id); if (!x) continue;
      if (p.toDeck) side.deck.unshift(x); else side.exhaust.push(x);
    }
    if (ids.length) mlog(m, `${p.title.split(":")[0]}: ${ids.length}枚`);
  }
  m.prompt = null; m.ev++;
  m.nextAt = Math.min(m.nextAt, Date.now() + 300);
}
// 自動の選び方: 自分のベンチを空ける(1枚だけの席から)/ デッキに戻すなら強いカード / 相手のベンチは「ベンチ時」効果のカード
function defaultBenchPick(g, m, p) {
  const side = m.z[p.side];
  if (p.toDeck) return [...p.cards].sort((x, y) => C(benchCards(side).find((c) => c.id === y)).power - C(benchCards(side).find((c) => c.id === x)).power).slice(0, p.max);
  if (p.side !== p.pid) { const buff = benchCards(side).filter((x) => p.cards.includes(x.id) && /ベンチ時/.test(C(x).text)); return buff.length ? [buff[0].id] : []; }
  const seats = side.bench.map((s) => s.filter((x) => p.cards.includes(x.id))).filter((s) => s.length).sort((x, y) => x.length - y.length);
  const out = []; for (const s of seats) for (const x of s) if (out.length < p.max) out.push(x.id);
  return out;
}

// 1手進める(選択待ちなら止まる)。戻り値: 何か変わったか
function stepMatch(g, m, now) {
  if (m.winner || m.prompt || now < m.nextAt) return false;
  let guard = 30;
  while (!m.winner && !m.prompt && m.q.length && guard-- > 0) {
    const a = m.q.shift();
    if (a.t === "start") {
      const zz = m.z[a.pid];
      if (!zz.deck.length) { lose(g, m, a.pid, "デッキがない"); break; }
      const card = zz.deck.shift(); zz.park.push(card); m.flag = a.pid; m.attacker = opp(m, a.pid);
      mlog(m, `${nm(g, a.pid)} が ${C(card).name} を出して旗を持つ`);
      onReveal(g, m, a.pid, card);
      m.q.push({ t: "reveal" });
      m.nextAt = now + STEP_MS[g.cfg.speed]; m.ev++; return true;
    }
    if (a.t === "reveal") {
      const id = m.attacker, zz = m.z[id];
      if (!zz.deck.length) { lose(g, m, id, "デッキがなくなった"); break; }
      const card = zz.deck.shift(); zz.rev.push(card);
      onReveal(g, m, id, card);
      m.q.push({ t: "compare" });
      m.ev++;
      if (m.prompt) return true;
      continue;
    }
    if (a.t === "compare") {
      const at = attackTotal(g, m), df = defenseTotal(g, m);
      if (at >= df) { m.q.push({ t: "capture" }); continue; }
      m.q.push({ t: "reveal" }); m.nextAt = now + STEP_MS[g.cfg.speed]; return true;
    }
    if (a.t === "capture") {
      // 旗を失った時の効果 → 失った側のカードをベンチへ → 旗を取った時の効果(この順)
      const loserId = m.flag, winnerId = m.attacker, lz = m.z[loserId];
      const lost = lz.park.pop();
      mlog(m, `${nm(g, winnerId)} が攻撃 ${attackTotal(g, m)} で旗を取った(${C(lost).name} ${power(g, m, loserId, lost, "defend")})`);
      let cards = [...lz.park, lost];
      if (lost.k === "prince") { lz.exhaust.push(lost); cards = [...lz.park]; mlog(m, "王子: 消耗パイルへ"); }
      if (lost.k === "rescuepod") { lz.removed.push(lost); cards = [...lz.park]; const x = drawPile(g, "B"); if (x) lz.exhaust.push(x); mlog(m, "救出ポッド: 除外して、レベルBのカードを消耗パイルへ"); }
      if (lost.k === "comic") lz.next2 = 1;
      lz.park = [];
      m.q.push({ t: "bench", pid: loserId, cards }, { t: "gain", pid: winnerId });
      if (lost.k === "seer" && lz.deck.length >= 2) ask(g, m, loserId, "deckOne", { cards: lz.deck.map((x) => x.id), to: "top", title: "予言者: 一番上に置くカードを1枚選ぶ" });
      else if (lost.k === "pilot" && lz.deck.length >= 2) ask(g, m, loserId, "topBottom", { cards: lz.deck.slice(0, 2).map((x) => x.id), title: "水先案内人: 一番上に置くカードを選ぶ(もう1枚は一番下へ)" });
      m.ev++;
      continue;
    }
    if (a.t === "bench") { if (!toBench(g, m, a.pid, a.cards)) break; continue; }
    if (a.t === "gain") {
      // 攻撃側: 最後に出したカードが旗を持ち、ほかはその下へ
      const winnerId = a.pid, loserId = opp(m, winnerId), wz = m.z[winnerId], lz = m.z[loserId];
      wz.park = [...wz.rev]; wz.rev = []; m.flag = winnerId; m.attacker = loserId;
      const top = wz.park[wz.park.length - 1];
      if (top.k === "clown") fans(g, m, winnerId, 2, "ピエロ");
      if (top.k === "heroine") fans(g, m, winnerId, 3, "ヒロイン");
      if (top.k === "cowboy" && lz.deck.length) { mlog(m, `カウボーイ: ${nm(g, loserId)} はデッキの一番上をベンチへ`); if (!toBench(g, m, loserId, [lz.deck.shift()])) break; }
      m.q.push({ t: "reveal" }); m.nextAt = now + STEP_MS[g.cfg.speed]; m.ev++; return true;
    }
  }
  return true;
}

// ---------------------------------------------------------------
// ラウンドの流れ
// ---------------------------------------------------------------
function startMatchPhase(c) {
  const g = c.g;
  for (const id of g.seats) if (g.draft[id] && g.draft[id].step !== "done") autoDraft(g, id);
  g.phase = "match"; g.deadline = 0; g.allDoneAt = 0;
  g.matches = g.schedule[g.round - 1].map(([a, b], i) => newMatch(g, a, b, i, false));
  log(g, `第${g.round}ラウンド: マッチ開始`);
}
// マッチが終わったら: 勝った人がこのラウンドのトロフィー(ロボットが勝ったら箱へ)。カードは全部デッキに戻す
function closeMatch(g, m) {
  if (m.closed) return; m.closed = true;
  for (const id of [m.a, m.b]) {
    const zz = m.z[id];
    g.decks[id] = [...zz.deck, ...benchCards(zz), ...zz.exhaust, ...zz.park, ...zz.rev].map((x) => Object.assign(x, { bonus: 0 }));
  }
  if (m.final) { log(g, `決勝: ${nm(g, m.winner)} の勝ち！`); return; }
  if (isHuman(m.winner)) { const f = g.parks[m.park].trophies[g.round]; g.trophies[m.winner].push({ round: g.round, fans: f }); }
  log(g, `第${g.round}ラウンド: ${nm(g, m.winner)} が ${nm(g, m.loser)} に勝利(${m.why})`);
}
const totalFans = (g, id) => g.fans[id] + g.trophies[id].reduce((n, t) => n + t.fans, 0);
function standings(g) {
  return [...g.humans].sort((x, y) => totalFans(g, y) - totalFans(g, x) || g.trophies[y].length - g.trophies[x].length
    || Math.max(0, ...g.trophies[y].map((t) => t.round)) - Math.max(0, ...g.trophies[x].map((t) => t.round)));
}
function afterRound(c) {
  const g = c.g;
  // 2人: 11人以上の差で即勝利。7ラウンドでファンの多い人の勝ち
  if (g.humans.length === 2) {
    const [x, y] = standings(g);
    if (totalFans(g, x) - totalFans(g, y) >= 11 || g.round >= 7) return end(c, x, y);
  }
  if (g.round < 7) return startDeckPhase(c);
  // 3人以上: ファンの多い2人で決勝。決勝の前にデッキを削れる
  const [x, y] = standings(g);
  g.final = { a: x, b: y };
  g.phase = "finalTrim"; g.deadline = Date.now() + 60000;
  for (const id of g.seats) g.draft[id] = { step: id === x || id === y ? "trim" : "done", opts: [], display: [] };
  log(g, `決勝は ${nm(g, x)} と ${nm(g, y)}！`);
}
function startFinal(c) {
  const g = c.g;
  for (const id of [g.final.a, g.final.b]) if (g.draft[id].step !== "done") trim(g, id, []);
  g.phase = "final"; g.deadline = 0;
  g.matches = [newMatch(g, g.final.a, g.final.b, 0, true)];
}
function end(c, winner, second) {
  const g = c.g;
  g.phase = "end"; g.result = { winner, second };
  const order = standings(g).filter((id) => id !== winner && id !== second);
  const raw = {}; [winner, second, ...order].forEach((id, k) => { if (id) raw[id] = 100 - k; });
  c.finish(raw);
}

// サーバの時計で進める(部屋ごとに 200ms おきに呼ばれる)。何か変わったら true
function tick(c, now) {
  const g = c.g;
  if (!g || g.phase === "end") return false;
  g.names = Object.fromEntries(g.humans.map((id) => [id, c.nameOf(id)]));
  // 抜けた人は自動で進める
  for (const id of g.left || []) {
    if ((g.phase === "deck" || g.phase === "finalTrim") && g.draft[id] && g.draft[id].step !== "done") autoDraft(g, id);
    for (const m of g.matches) if (m.prompt && m.prompt.pid === id) answer(g, m, id, null);
  }
  if (g.phase === "deck") {
    if (g.humans.every((id) => g.draft[id].step === "done") || now >= g.deadline) { startMatchPhase(c); return true; }
    return false;
  }
  if (g.phase === "finalTrim") {
    if ([g.final.a, g.final.b].every((id) => g.draft[id].step === "done") || now >= g.deadline) { startFinal(c); return true; }
    return false;
  }
  let changed = false;
  for (const m of g.matches) {
    if (m.prompt && now >= m.prompt.deadline) { answer(g, m, m.prompt.pid, null); changed = true; }
    if (stepMatch(g, m, now)) changed = true;
    if (m.winner && !m.closed) { closeMatch(g, m); changed = true; }
  }
  if (g.matches.every((m) => m.closed)) {
    if (!g.allDoneAt) { g.allDoneAt = now; changed = true; }
    else if (now - g.allDoneAt >= AFTER_MATCH_MS) {
      if (g.phase === "final") { const m = g.matches[0]; end(c, m.winner, m.loser); }
      else afterRound(c);
      return true;
    }
  }
  return changed;
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g || !g.seats.includes(pid)) return;
  g.names = Object.fromEntries(g.humans.map((id) => [id, c.nameOf(id)]));
  const d = g.draft[pid];
  switch (m.a) {
    case "opt": if (g.phase !== "deck" || d.step !== "choose" || !(m.i in d.opts)) return; return chooseOpt(g, pid, m.i);
    case "pick": if (g.phase !== "deck") return; return pick(g, pid, m.id);
    case "redraw": if (g.phase !== "deck") return; return redraw(g, pid);
    case "extra": if (g.phase !== "deck") return; return extraChoice(g, pid, m.ids || null);
    case "trim": if (g.phase !== "deck" && g.phase !== "finalTrim") return; return trim(g, pid, m.ids);
    case "answer": {
      const mt = g.matches.find((x) => x.prompt && x.prompt.pid === pid);
      if (!mt) return;
      return answer(g, mt, pid, Array.isArray(m.ids) ? m.ids : null);
    }
    default: return;
  }
}
// 抜けた人: このゲームはロボット扱いで自動で進める(席を抜くと対戦表が崩れるため)
function onLeave(c, pid) {
  const g = c.g;
  if (!g || !g.seats.includes(pid)) return;
  g.left = g.left || []; if (!g.left.includes(pid)) g.left.push(pid);
}

// ---------------------------------------------------------------
// 見せるもの(デッキの中身は本人だけ。トロフィーのファン数は本人だけ(2人なら公開))
// ---------------------------------------------------------------
const cardV = (x, p) => ({ id: x.id, k: x.k, lv: x.lv, ...(p != null ? { p } : {}) });
function matchView(g, m, me) {
  const side = (id) => {
    const zz = m.z[id];
    return {
      id, deck: zz.deck.length, exhaust: zz.exhaust.length, removed: zz.removed.length,
      bench: zz.bench.map((s) => ({ k: s[0].k, n: s.length, lv: s.map((x) => x.lv) })),
      park: zz.park.length ? { top: cardV(zz.park[zz.park.length - 1], m.flag === id ? power(g, m, id, zz.park[zz.park.length - 1], "defend") : null), under: zz.park.length - 1 } : null,
      rev: zz.rev.map((x) => cardV(x, power(g, m, id, x, "attack"))), next2: zz.next2,
    };
  };
  const pr = m.prompt;
  let prompt = null;
  if (pr) {
    const all = [...m.z[m.a].deck, ...m.z[m.b].deck, ...benchCards(m.z[m.a]), ...benchCards(m.z[m.b])];
    prompt = pr.pid === me ? { mine: true, kind: pr.kind, title: pr.title, max: pr.max, min: pr.min, deadline: pr.deadline, cards: pr.cards.map((id) => cardV(all.find((x) => x.id === id))) } : { mine: false, who: pr.pid };
  }
  return {
    id: m.id, a: m.a, b: m.b, park: m.park, final: m.final, flag: m.flag, attacker: m.attacker,
    atk: m.attacker && m.z[m.attacker].rev.length ? attackTotal(g, m) : 0, def: defenseTotal(g, m),
    sides: { [m.a]: side(m.a), [m.b]: side(m.b) }, winner: m.winner, why: m.why, log: m.log.slice(-8), prompt, ev: m.ev,
  };
}
function view(c, me) {
  const g = c.g, two = g.humans.length === 2, done = g.phase === "end";
  const d = g.draft[me];
  return {
    phase: g.phase, round: g.round, cfg: g.cfg, exclude: g.exclude, seats: g.seats, humans: g.humans, robot: g.robot,
    fans: g.fans, totals: two || done ? Object.fromEntries(g.humans.map((id) => [id, totalFans(g, id)])) : null,
    trophies: Object.fromEntries(g.seats.map((id) => [id, g.trophies[id].map((t) => ({ round: t.round, fans: two || done || id === me ? t.fans : null }))])),
    myDeck: g.decks[me] ? g.decks[me].map((x) => cardV(x)) : null,
    draft: d ? { step: d.step, opts: d.opts, opt: d.opt, need: d.need + (d.extra || 0), picks: d.picks, redrawn: d.redrawn, removeFor: d.removeFor, display: (d.display || []).map((x) => cardV(x)) } : null,
    draftDone: Object.fromEntries(g.seats.map((id) => [id, g.draft[id] ? g.draft[id].step === "done" : true])),
    pairs: g.round ? g.schedule[g.round - 1] : [], final: g.final, deadline: g.deadline,
    matches: g.matches.map((m) => matchView(g, m, me)),
    result: g.result, log: g.log.slice(-12),
    piles: { A: g.piles.A.length, B: g.piles.B.length, C: g.piles.C.length },
  };
}

module.exports = { start, tick, handle, view, onLeave, normalize, DEFAULTS, CARDS, SETS, LIST, ROUND_OPTS, ROBOT, _t: { newMatch, stepMatch, power, answer, closeMatch, toBench, onReveal, autoDraft, standings, totalFans } };
