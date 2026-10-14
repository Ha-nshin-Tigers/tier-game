"use strict";
// 不動産王(モノポリー風のボードゲーム)のルール本体。部屋・入室は games/monopoly.js が受け持つ。
// ルールは本家にほぼ合わせる: 購入・競売・家とホテル(均等に建てる・家の在庫あり)・抵当・プレイヤー同士の取引・
// 刑務所・チャンス/共同基金カード・破産。最後の1人が勝ち。
// お金の単位は「万」(本家の $ と同じ数字)。

// ---------------------------------------------------------------
// 盤面(マスの並びと値段は本家と同じ。名前は地図ごとに差し替える)
// ---------------------------------------------------------------
const G = { brown: [1, 3], lblue: [6, 8, 9], pink: [11, 13, 14], orange: [16, 18, 19], red: [21, 23, 24], yellow: [26, 27, 29], green: [31, 32, 34], dblue: [37, 39] };
const GROUP_COLOR = { brown: "#8b5a2b", lblue: "#9fd4f5", pink: "#d6438f", orange: "#f39a2b", red: "#e0343a", yellow: "#f2d43a", green: "#2f9e57", dblue: "#2c4fb3" };
const RR = [5, 15, 25, 35], UT = [12, 28];
const P = (group, price, house, rent) => ({ type: "prop", group, price, house, rent });
const SQ = [
  { type: "go" }, P("brown", 60, 50, [2, 10, 30, 90, 160, 250]), { type: "chest" }, P("brown", 60, 50, [4, 20, 60, 180, 320, 450]), { type: "tax", tax: 200 },
  { type: "rr", price: 200 }, P("lblue", 100, 50, [6, 30, 90, 270, 400, 550]), { type: "chance" }, P("lblue", 100, 50, [6, 30, 90, 270, 400, 550]), P("lblue", 120, 50, [8, 40, 100, 300, 450, 600]),
  { type: "jail" }, P("pink", 140, 100, [10, 50, 150, 450, 625, 750]), { type: "util", price: 150 }, P("pink", 140, 100, [10, 50, 150, 450, 625, 750]), P("pink", 160, 100, [12, 60, 180, 500, 700, 900]),
  { type: "rr", price: 200 }, P("orange", 180, 100, [14, 70, 200, 550, 750, 950]), { type: "chest" }, P("orange", 180, 100, [14, 70, 200, 550, 750, 950]), P("orange", 200, 100, [16, 80, 220, 600, 800, 1000]),
  { type: "free" }, P("red", 220, 150, [18, 90, 250, 700, 875, 1050]), { type: "chance" }, P("red", 220, 150, [18, 90, 250, 700, 875, 1050]), P("red", 240, 150, [20, 100, 300, 750, 925, 1100]),
  { type: "rr", price: 200 }, P("yellow", 260, 150, [22, 110, 330, 800, 975, 1150]), P("yellow", 260, 150, [22, 110, 330, 800, 975, 1150]), { type: "util", price: 150 }, P("yellow", 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { type: "gotojail" }, P("green", 300, 200, [26, 130, 390, 900, 1100, 1275]), P("green", 300, 200, [26, 130, 390, 900, 1100, 1275]), { type: "chest" }, P("green", 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  { type: "rr", price: 200 }, { type: "chance" }, P("dblue", 350, 200, [35, 175, 500, 1100, 1300, 1500]), { type: "tax", tax: 100 }, P("dblue", 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];
const BUYABLE = (i) => ["prop", "rr", "util"].includes(SQ[i].type);
const priceOf = (i) => SQ[i].price;

// 地図ごとのマスの名前(40マス)。日本: 安い順に地方→都会。世界: 安い順に新興都市→大都市
const COMMON = { go: "スタート", chest: "共同基金", chance: "チャンス", jail: "刑務所", free: "無料駐車場", gotojail: "刑務所へ" };
const MAP_NAMES = {
  japan: {
    title: "日本",
    names: { 1: "夕張", 3: "網走", 4: "所得税", 5: "東京駅", 6: "鳥取", 8: "松江", 9: "出雲", 11: "高知", 12: "電力会社", 13: "松山", 14: "徳島", 15: "名古屋駅", 16: "盛岡", 18: "青森", 19: "仙台",
      21: "岡山", 23: "金沢", 24: "広島", 25: "新大阪駅", 26: "那覇", 27: "札幌", 28: "水道局", 29: "福岡", 31: "神戸", 32: "京都", 34: "横浜", 35: "博多駅", 37: "六本木", 38: "ぜいたく税", 39: "銀座" },
  },
  world: {
    title: "世界",
    names: { 1: "カトマンズ", 3: "ウランバートル", 4: "所得税", 5: "羽田空港", 6: "ハノイ", 8: "マニラ", 9: "ジャカルタ", 11: "カイロ", 12: "電力会社", 13: "イスタンブール", 14: "ムンバイ", 15: "ヒースロー空港",
      16: "メキシコシティ", 18: "リオ", 19: "ブエノスアイレス", 21: "ソウル", 23: "台北", 24: "香港", 25: "JFK空港", 26: "シドニー", 27: "トロント", 28: "水道会社", 29: "ベルリン",
      31: "シンガポール", 32: "パリ", 34: "ドバイ", 35: "チャンギ空港", 37: "ロンドン", 38: "ぜいたく税", 39: "ニューヨーク" },
  },
};
function boardFor(map) {
  const names = MAP_NAMES[map].names;
  return SQ.map((s, i) => ({ ...s, name: names[i] || COMMON[s.type], color: s.group ? GROUP_COLOR[s.group] : null }));
}

// ---------------------------------------------------------------
// 設定
// ---------------------------------------------------------------
// 細かいルール(ホストが1つずつ切り替えられる)。「本家どおり」「オリジナル」は一括で切り替えるときの組み合わせ
const RULES = {
  bankAuction: "銀行への破産で戻った土地を競売にする",
  bankruptInterest: "破産で抵当中の土地を受け取ったら、すぐ利子(1割)を払う",
  liftOnReceive: "抵当中の土地を受け取ったその番のうちは、利子なし(元金だけ)で抵当を外せる",
  bidCredit: "競売で、売却・抵当で作れるお金まで入札できる(足りない分はあとで払う)",
  houseAuction: "銀行の家が残り4軒以下のとき、ほかにも建てたい人がいれば家を競売にする",
  multiSplit: "何人かに払えずに破産したら、現金は払う額に応じて分け、土地は銀行へ",
  freeParking: "税金・罰金を無料駐車場に貯めて、止まった人がもらう(ハウスルール)",
};
const PRESETS = {
  official: { bankAuction: true, bankruptInterest: true, liftOnReceive: true, bidCredit: true, houseAuction: true, multiSplit: true, freeParking: false },
  original: { bankAuction: false, bankruptInterest: false, liftOnReceive: false, bidCredit: false, houseAuction: false, multiSplit: false, freeParking: false },
};
const DEFAULTS = { map: "japan", startCash: 1500, turnSecs: 90, rules: PRESETS.official };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if (MAP_NAMES[r.map]) out.map = r.map;
  if ([1000, 1500, 2000].includes(r.startCash)) out.startCash = r.startCash;
  if ([0, 60, 90, 120].includes(r.turnSecs)) out.turnSecs = r.turnSecs;
  const rules = PRESETS[r.preset] || (r.rules && typeof r.rules === "object" ? r.rules : {});
  out.rules = Object.fromEntries(Object.keys(RULES).map((k) => [k, typeof rules[k] === "boolean" ? rules[k] : DEFAULTS.rules[k]]));
  return out;
}
const rule = (c, k) => !!c.g.cfg.rules[k];
const GO_PAY = 200, JAIL_FINE = 50, AUCTION_MS = 12000, AUCTION_FIRST_MS = 20000, AWAY_MS = 30000, LOG_MAX = 40;
const BANK_HOUSES = 32, BANK_HOTELS = 12, HOUSE_SHORT = 4;

// ---------------------------------------------------------------
// カード(16枚ずつ。本家と同じ内容)
// ---------------------------------------------------------------
// 名前はその場の地図から取る
const CHANCE = [
  { text: () => "スタートへ進む(200万もらう)", go: (c, id) => moveTo(c, id, 0) },
  { text: (b) => `${b[24].name}へ進む(スタートを通ったら200万)`, go: (c, id) => moveTo(c, id, 24) },
  { text: (b) => `${b[11].name}へ進む(スタートを通ったら200万)`, go: (c, id) => moveTo(c, id, 11) },
  { text: () => "いちばん近い公共会社へ進む。持ち主がいたら、サイコロを振って出た目の10倍を払う", go: (c, id) => moveNearest(c, id, UT, "util") },
  { text: (b) => `いちばん近い${b[5].name.endsWith("空港") ? "空港" : "駅"}へ進む。持ち主がいたら、通常の2倍を払う`, go: (c, id) => moveNearest(c, id, RR, "rr") },
  { text: (b) => `いちばん近い${b[5].name.endsWith("空港") ? "空港" : "駅"}へ進む。持ち主がいたら、通常の2倍を払う`, go: (c, id) => moveNearest(c, id, RR, "rr") },
  { text: () => "銀行から配当 50万もらう", go: (c, id) => gain(c, id, 50) },
  { text: () => "刑務所から出られるカード(持っておける・取引できる)", jailCard: true },
  { text: () => "3マス戻る", go: (c, id) => { const p = c.g.P[id], from = p.pos; p.pos = (p.pos + 37) % 40; ev(c, { type: "move", pid: id, from, to: p.pos, steps: -3 }); land(c, id); } },
  { text: () => "刑務所へ行く(スタートを通っても200万はもらえない)", go: (c, id) => toJail(c, id) },
  { text: () => "建物の修理: 家1軒につき25万、ホテル1軒につき100万払う", go: (c, id) => repairs(c, id, 25, 100) },
  { text: () => "スピード違反の罰金 15万払う", go: (c, id) => pay(c, id, null, 15, "罰金", true) },
  { text: (b) => `${b[5].name}へ進む(スタートを通ったら200万)`, go: (c, id) => moveTo(c, id, 5) },
  { text: (b) => `${b[39].name}へ進む`, go: (c, id) => moveTo(c, id, 39) },
  { text: () => "議長に選ばれた: ほかのプレイヤー全員に50万ずつ払う", go: (c, id) => { for (const o of alive(c)) if (o !== id) pay(c, id, o, 50, "議長"); } },
  { text: () => "建築ローンの満期 150万もらう", go: (c, id) => gain(c, id, 150) },
];
const CHEST = [
  { text: () => "スタートへ進む(200万もらう)", go: (c, id) => moveTo(c, id, 0) },
  { text: () => "銀行のミスで 200万もらう", go: (c, id) => gain(c, id, 200) },
  { text: () => "医者代 50万払う", go: (c, id) => pay(c, id, null, 50, "医者代", true) },
  { text: () => "株を売って 50万もらう", go: (c, id) => gain(c, id, 50) },
  { text: () => "刑務所から出られるカード(持っておける・取引できる)", jailCard: true },
  { text: () => "刑務所へ行く(スタートを通っても200万はもらえない)", go: (c, id) => toJail(c, id) },
  { text: () => "積立金の満期 100万もらう", go: (c, id) => gain(c, id, 100) },
  { text: () => "所得税の還付 20万もらう", go: (c, id) => gain(c, id, 20) },
  { text: () => "誕生日: ほかのプレイヤー全員から10万ずつもらう", go: (c, id) => { for (const o of alive(c)) if (o !== id) pay(c, o, id, 10, "誕生日のお祝い"); } },
  { text: () => "生命保険の満期 100万もらう", go: (c, id) => gain(c, id, 100) },
  { text: () => "入院費 100万払う", go: (c, id) => pay(c, id, null, 100, "入院費", true) },
  { text: () => "学費 50万払う", go: (c, id) => pay(c, id, null, 50, "学費", true) },
  { text: () => "相談料 25万もらう", go: (c, id) => gain(c, id, 25) },
  { text: () => "道路の修理: 家1軒につき40万、ホテル1軒につき115万払う", go: (c, id) => repairs(c, id, 40, 115) },
  { text: () => "美人コンテストで2位 10万もらう", go: (c, id) => gain(c, id, 10) },
  { text: () => "遺産 100万もらう", go: (c, id) => gain(c, id, 100) },
];
const DECKS = { chance: CHANCE, chest: CHEST };

// ---------------------------------------------------------------
// 小道具
// ---------------------------------------------------------------
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const die = () => 1 + Math.floor(Math.random() * 6);
const alive = (c) => c.g.order.filter((id) => !c.g.P[id].out);
const curId = (c) => c.g.order[c.g.cur];
const M = (n) => `${n}万`;
function log(c, text) { const g = c.g; g.log.push(text); if (g.log.length > LOG_MAX) g.log.splice(0, g.log.length - LOG_MAX); }
const nm = (c, id) => c.nameOf(id);
const sqName = (c, i) => c.g.board[i].name;
function ev(c, e) { c.g.ev = { seq: (c.g.ev ? c.g.ev.seq : 0) + 1, ...e }; }

const groupOf = (i) => SQ[i].group;
const ownsAll = (g, id, group) => G[group].every((k) => g.own[k].owner === id);
const groupHasBuildings = (g, group) => G[group].some((k) => g.own[k].houses > 0);
function rentOf(c, i, opt = {}) {
  const g = c.g, o = g.own[i], s = SQ[i];
  if (!o || !o.owner || o.mort) return 0;
  if (s.type === "prop") {
    if (o.houses > 0) return s.rent[o.houses];
    return s.rent[0] * (ownsAll(g, o.owner, s.group) ? 2 : 1);
  }
  if (s.type === "rr") {
    const n = RR.filter((k) => g.own[k].owner === o.owner).length;
    return 25 * 2 ** (n - 1) * (opt.rrDouble ? 2 : 1);
  }
  // 公共会社: 2つとも持っていれば出た目の10倍、1つなら4倍(カードで来たときは振り直して10倍)
  const both = UT.every((k) => g.own[k].owner === o.owner);
  return opt.utilRoll ? opt.utilRoll * 10 : (opt.dice || 0) * (both ? 10 : 4);
}
function worth(c, id) {
  // 資産(現金+土地の値段(抵当中は半分)+建物の値段)
  const g = c.g; let w = g.P[id].cash;
  for (let i = 0; i < 40; i++) {
    const o = g.own[i];
    if (!o || o.owner !== id) continue;
    w += o.mort ? priceOf(i) / 2 : priceOf(i);
    if (o.houses) w += o.houses * SQ[i].house;
  }
  return w;
}

// ---------------------------------------------------------------
// お金
// ---------------------------------------------------------------
function gain(c, id, n) { c.g.P[id].cash += n; }
// 払う(to が null なら銀行)。足りなければ「借金」として残し、本人が売却・抵当でお金を作るのを待つ
// fine: 税金・罰金(無料駐車場に貯めるルールのとき、銀行ではなく駐車場へ)
function pay(c, from, to, n, why, fine) {
  const g = c.g;
  if (n <= 0 || g.P[from].out) return;
  if (to && g.P[to].out) return;
  const pot = !to && !!fine && rule(c, "freeParking");
  if (!g.debts.some((d) => d.pid === from) && g.P[from].cash >= n) {
    g.P[from].cash -= n;
    if (to) g.P[to].cash += n;
    if (pot) g.pot += n;
    log(c, `${nm(c, from)} → ${to ? nm(c, to) : pot ? "無料駐車場" : "銀行"} ${M(n)}(${why})`);
    return;
  }
  g.debts.push({ pid: from, to, amount: n, why, pot });
  log(c, `${nm(c, from)} は ${M(n)} 足りない…(${why})。売却・抵当でお金を作るか、破産するか`);
}
function settleDebt(c, id) {
  const g = c.g, d = g.debts.find((x) => x.pid === id);
  if (!d) return "払うものはありません";
  if (g.P[id].cash < d.amount) return "お金が足りません。家を売るか、抵当に入れてください";
  g.debts.splice(g.debts.indexOf(d), 1);
  g.P[id].cash -= d.amount;
  if (d.to && !g.P[d.to].out) g.P[d.to].cash += d.amount;
  if (d.pot) g.pot += d.amount;
  log(c, `${nm(c, id)} → ${d.to ? nm(c, d.to) : d.pot ? "無料駐車場" : "銀行"} ${M(d.amount)}(${d.why})`);
  return null;
}
// 自動でお金を作る(時間切れ・「自動で集める」): 建物を売る → 抵当に入れる、の順
function autoRaise(c, id, need) {
  const g = c.g;
  const owned = () => g.own.map((o, i) => (o && o.owner === id ? i : -1)).filter((i) => i >= 0);
  let guard = 200;
  while (g.P[id].cash < need && guard-- > 0) {
    const withHouse = owned().filter((i) => g.own[i].houses > 0 && canSell(c, id, i) === null).sort((a, b) => g.own[b].houses - g.own[a].houses);
    if (withHouse.length) { doSell(c, id, withHouse[0]); continue; }
    const morts = owned().filter((i) => canMortgage(c, id, i) === null).sort((a, b) => priceOf(a) - priceOf(b));
    if (morts.length) { doMortgage(c, id, morts[0]); continue; }
    break;
  }
}

// ---------------------------------------------------------------
// 建物・抵当
// ---------------------------------------------------------------
function canBuild(c, id, i, ignoreCash) {
  const g = c.g, o = g.own[i], s = SQ[i];
  if (!o || o.owner !== id || s.type !== "prop") return "自分の土地ではありません";
  if (!ownsAll(g, id, s.group)) return "同じ色を全部持つと建てられます";
  if (G[s.group].some((k) => g.own[k].mort)) return "同じ色に抵当中の土地があります";
  if (o.houses >= 5) return "これ以上建てられません";
  if (G[s.group].some((k) => g.own[k].houses < o.houses)) return "同じ色の土地に均等に建ててください";
  if (o.houses === 4 ? g.hotels < 1 : g.houses < 1) return o.houses === 4 ? "銀行にホテルが残っていません" : "銀行に家が残っていません";
  if (!ignoreCash && g.P[id].cash < s.house) return "お金が足りません";
  return null;
}
function doBuild(c, id, i) {
  const g = c.g, o = g.own[i];
  g.P[id].cash -= SQ[i].house;
  if (o.houses === 4) { g.hotels--; g.houses += 4; } else g.houses--;
  o.houses++;
  log(c, `${nm(c, id)} が ${sqName(c, i)} に${o.houses === 5 ? "ホテル" : "家"}を建てた(${M(SQ[i].house)})`);
}
function canSell(c, id, i) {
  const g = c.g, o = g.own[i], s = SQ[i];
  if (!o || o.owner !== id || !o.houses) return "売る建物がありません";
  if (G[s.group].some((k) => g.own[k].houses > o.houses)) return "同じ色の土地から均等に売ってください";
  return null;
}
function doSell(c, id, i) {
  const g = c.g, o = g.own[i], half = SQ[i].house / 2;
  if (o.houses === 5) {
    // ホテルを家4軒に戻す。銀行の家が足りなければ、ある分だけ家にして残りも売る
    const keep = Math.min(4, g.houses);
    g.hotels++; g.houses -= keep;
    g.P[id].cash += half * (5 - keep);
    o.houses = keep;
    log(c, `${nm(c, id)} が ${sqName(c, i)} のホテルを売った(+${M(half * (5 - keep))})`);
  } else {
    g.houses++; o.houses--;
    g.P[id].cash += half;
    log(c, `${nm(c, id)} が ${sqName(c, i)} の家を売った(+${M(half)})`);
  }
}
function canMortgage(c, id, i) {
  const g = c.g, o = g.own[i];
  if (!o || o.owner !== id) return "自分の土地ではありません";
  if (o.mort) return "もう抵当に入っています";
  if (SQ[i].type === "prop" && groupHasBuildings(g, SQ[i].group)) return "同じ色の建物を先に売ってください";
  return null;
}
function doMortgage(c, id, i) {
  const g = c.g; g.own[i].mort = true; g.P[id].cash += priceOf(i) / 2;
  log(c, `${nm(c, id)} が ${sqName(c, i)} を抵当に入れた(+${M(priceOf(i) / 2)})`);
}
// 抵当額(半額)+1割。小数の誤差が出ないよう整数で計算。受け取ったばかり(fresh)なら利子は払い済みなので元金だけ
const unmortCost = (c, i) => (c.g.own[i].fresh ? priceOf(i) / 2 : Math.ceil(priceOf(i) * 11 / 20));
// 売却・抵当で作れるお金の上限(競売の入札上限に使う)
function raisable(c, id) {
  const g = c.g; let n = g.P[id].cash;
  for (let i = 0; i < 40; i++) { const o = g.own[i]; if (!o || o.owner !== id) continue; n += (SQ[i].house / 2 || 0) * (o.houses || 0); if (!o.mort) n += priceOf(i) / 2; }
  return n;
}
const bidLimit = (c, id) => (rule(c, "bidCredit") ? raisable(c, id) : c.g.P[id].cash);
// 受け取った抵当中の土地: 利子を払い(pay=true のとき)、その番のうちは元金で外せる印を付ける
function receiveMortgaged(c, to, props, payInterest, why) {
  const g = c.g; let fee = 0;
  for (const i of props) if (g.own[i].mort) { fee += Math.ceil(priceOf(i) / 20); if (rule(c, "liftOnReceive")) g.own[i].fresh = true; }
  if (payInterest && fee) pay(c, to, null, fee, why);
}

// ---------------------------------------------------------------
// 移動
// ---------------------------------------------------------------
function advance(c, id, steps) {
  const p = c.g.P[id], from = p.pos;
  p.pos = (p.pos + steps) % 40;
  if (p.pos < from) { p.cash += GO_PAY; log(c, `${nm(c, id)} はスタートを通過 +${M(GO_PAY)}`); }
  ev(c, { type: "move", pid: id, from, to: p.pos, steps });
  land(c, id);
}
function moveTo(c, id, to, opt) {
  const p = c.g.P[id], from = p.pos;
  if (to <= from) { p.cash += GO_PAY; log(c, `${nm(c, id)} はスタートを通過 +${M(GO_PAY)}`); }
  p.pos = to;
  ev(c, { type: "move", pid: id, from, to, steps: (to - from + 40) % 40 });
  land(c, id, opt);
}
function moveNearest(c, id, list, kind) {
  const pos = c.g.P[id].pos, to = list.find((k) => k > pos) ?? list[0];
  moveTo(c, id, to, kind === "rr" ? { rrDouble: true } : { utilCard: true });
}
function toJail(c, id) {
  const g = c.g, p = g.P[id];
  p.pos = 10; p.jailed = true; p.jailTries = 0;
  g.again = false;
  ev(c, { type: "jail", pid: id });
  log(c, `${nm(c, id)} は刑務所へ`);
}
function land(c, id, opt = {}) {
  const g = c.g, i = g.P[id].pos, s = SQ[i];
  if (BUYABLE(i)) {
    const o = g.own[i];
    if (!o.owner) { g.pending = i; return; } // 買うか競売にするかを本人が選ぶ
    if (o.owner === id) return;
    if (o.mort) { log(c, `${sqName(c, i)} は抵当中なので払わなくてよい`); return; }
    let utilRoll = 0;
    if (s.type === "util" && opt.utilCard) { const a = die(), b = die(); utilRoll = a + b; g.dice = [a, b]; g.rollSeq++; ev(c, { type: "dice", pid: id, dice: [a, b], extra: true }); log(c, `${nm(c, id)} が振り直し ${a}+${b}`); }
    const rent = rentOf(c, i, { dice: g.dice ? g.dice[0] + g.dice[1] : 0, rrDouble: opt.rrDouble, utilRoll });
    pay(c, id, o.owner, rent, `${sqName(c, i)} の使用料`);
    return;
  }
  if (s.type === "tax") return pay(c, id, null, s.tax, sqName(c, i), true);
  if (s.type === "gotojail") return toJail(c, id);
  if (s.type === "free" && g.pot > 0 && rule(c, "freeParking")) { log(c, `${nm(c, id)} が無料駐車場の ${M(g.pot)} をもらった！`); g.P[id].cash += g.pot; g.pot = 0; return; }
  if (s.type === "chance" || s.type === "chest") return drawCard(c, id, s.type);
}
function drawCard(c, id, kind) {
  const g = c.g, deck = g.decks[kind];
  const k = deck.shift(), card = DECKS[kind][k];
  const text = card.text(g.board);
  log(c, `${nm(c, id)} の${kind === "chance" ? "チャンス" : "共同基金"}: ${text}`);
  g.card = { seq: (g.card ? g.card.seq : 0) + 1, pid: id, kind, text };
  if (card.jailCard) { g.P[id].jailCards.push(kind); return; } // 使ったら山札の一番下に戻す
  deck.push(k);
  card.go(c, id);
}
function repairs(c, id, perHouse, perHotel) {
  const g = c.g; let n = 0;
  for (let i = 0; i < 40; i++) { const o = g.own[i]; if (o && o.owner === id && o.houses) n += o.houses === 5 ? perHotel : o.houses * perHouse; }
  if (n) pay(c, id, null, n, "修理代", true); else log(c, `${nm(c, id)} は建物がないので0万`);
}

// ---------------------------------------------------------------
// 進行
// ---------------------------------------------------------------
function start(c, settings) {
  const cfg = normalize(settings);
  const order = shuffle([...c.members()]);
  const P = {};
  for (const id of order) P[id] = { cash: cfg.startCash, pos: 0, jailed: false, jailTries: 0, jailCards: [], out: false };
  c.g = {
    cfg, board: boardFor(cfg.map), order, cur: 0, P,
    own: SQ.map((s, i) => (BUYABLE(i) ? { owner: null, houses: 0, mort: false } : null)),
    houses: BANK_HOUSES, hotels: BANK_HOTELS,
    decks: { chance: shuffle([...CHANCE.keys()]), chest: shuffle([...CHEST.keys()]) },
    step: "roll", dice: null, dbl: 0, again: false, pending: null, auction: null, debts: [], trades: [], tradeSeq: 0, queue: [], resume: null, pot: 0,
    log: [], ev: null, card: null, outOrder: [], turnNo: 1, rollSeq: 0,
  };
  log(c, `ゲーム開始！ 最初は ${nm(c, order[0])} の番`);
  arm(c);
}
function beginTurn(c) {
  const g = c.g;
  if (alive(c).length <= 1) return end(c);
  let guard = 0;
  do { g.cur = (g.cur + 1) % g.order.length; } while (g.P[curId(c)].out && guard++ < 20);
  Object.assign(g, { step: "roll", dbl: 0, again: false, pending: null, dice: null });
  for (const o of g.own) if (o) o.fresh = false; // 「元金だけで外せる」のはその番のうちだけ
  g.turnNo++;
  log(c, `${nm(c, curId(c))} の番`);
}
// 動いたあと: 買うかどうか → 終わったら「もう一度振る」か「ターン終了」
function afterMove(c) {
  const g = c.g;
  if (g.pending != null) g.step = "buy";
  else g.step = "act";
}
function roll(c, id) {
  const g = c.g, p = g.P[id];
  const a = die(), b = die(), dbl = a === b;
  g.dice = [a, b]; g.rollSeq++;
  ev(c, { type: "dice", pid: id, dice: [a, b] });
  if (p.jailed) {
    p.jailTries++;
    if (dbl) {
      p.jailed = false; p.jailTries = 0; g.again = false;
      log(c, `${nm(c, id)} は ${a}+${b} のゾロ目で出所！`);
      advance(c, id, a + b);
      return afterMove(c);
    }
    if (p.jailTries >= 3) {
      // 3回目も失敗: 50万払って、出た目だけ進む
      log(c, `${nm(c, id)} は ${a}+${b}。3回失敗したので ${M(JAIL_FINE)} 払って出所`);
      p.jailed = false; p.jailTries = 0; g.again = false;
      pay(c, id, null, JAIL_FINE, "保釈金", true);
      advance(c, id, a + b);
      return afterMove(c);
    }
    log(c, `${nm(c, id)} は ${a}+${b}。ゾロ目ではないので刑務所に残る(${p.jailTries}/3)`);
    g.again = false; g.step = "act";
    return;
  }
  log(c, `${nm(c, id)} が ${a}+${b}=${a + b}${dbl ? "(ゾロ目)" : ""}`);
  if (dbl) {
    g.dbl++;
    if (g.dbl >= 3) { log(c, "ゾロ目3回連続！"); toJail(c, id); g.step = "act"; return; }
  }
  g.again = dbl;
  advance(c, id, a + b);
  if (p.jailed) g.again = false;
  afterMove(c);
}
// 競売が終わったら resume の段階に戻る(買わなかった土地なら「ターン終了」待ち)
function startAuction(c, i) {
  const g = c.g;
  if (g.step !== "auction") g.resume = g.step === "buy" ? "act" : g.step;
  g.pending = null;
  g.auction = { kind: "land", sq: i, bid: 0, by: null, endsAt: Date.now() + AUCTION_FIRST_MS };
  g.step = "auction";
  log(c, `${sqName(c, i)} の競売スタート(だれでも入札できます)`);
}
// 家の競売(在庫が少ないとき)。入札する人は自分の建てる土地(spots)を選ぶ
function startHouseAuction(c, pid, sq) {
  const g = c.g;
  g.resume = g.step;
  g.auction = { kind: "house", sq, bid: 0, by: null, spots: { [pid]: sq }, endsAt: Date.now() + AUCTION_FIRST_MS };
  g.step = "auction";
  log(c, `銀行の家が残り${g.houses}軒。家1軒の競売スタート(建てられる人はだれでも入札できます)`);
}
function endAuction(c) {
  const g = c.g, a = g.auction;
  g.auction = null;
  const w = a.by && !g.P[a.by].out ? a.by : null;
  if (a.kind === "house") {
    const sq = w && a.spots[w];
    if (w && canBuild(c, w, sq, true) === null && g.P[w].cash >= a.bid) {
      g.P[w].cash -= a.bid; g.houses--; g.own[sq].houses++;
      log(c, `${nm(c, w)} が家1軒を ${M(a.bid)} で落札し、${sqName(c, sq)} に建てた`);
      ev(c, { type: "buy", pid: w, sq });
    } else log(c, "家の競売は成立しなかった");
  } else if (w && (g.P[w].cash >= a.bid || rule(c, "bidCredit"))) {
    g.own[a.sq].owner = w;
    log(c, `${nm(c, w)} が ${sqName(c, a.sq)} を ${M(a.bid)} で落札`);
    ev(c, { type: "buy", pid: w, sq: a.sq });
    pay(c, w, null, a.bid, `${sqName(c, a.sq)} の落札代金`); // 足りなければ売却・抵当で払う
  } else log(c, `${sqName(c, a.sq)} はだれも入札せず、銀行のまま`);
  if (g.step === "end") return;
  // 続けて銀行の土地の競売(買うかどうか選んでいる途中なら、それが済んでから)
  if (g.queue.length && g.resume !== "buy") return startAuction(c, g.queue.shift());
  g.step = g.resume || "act"; g.resume = null;
}
// 破産で銀行に戻った土地の競売を、進行の切れ目(サイコロ前・ターン終了前)で始める
function kickQueue(c) {
  const g = c.g;
  if (g.queue.length && (g.step === "roll" || g.step === "act") && !g.debts.length) startAuction(c, g.queue.shift());
}
// 家を建てられる自分の土地(お金は見ない)
function houseSpots(c, id) {
  const g = c.g, out = [];
  for (let i = 0; i < 40; i++) if (g.own[i] && g.own[i].houses < 4 && canBuild(c, id, i, true) === null) out.push(i);
  return out;
}

// 破産: to が プレイヤーならその人へ、null なら銀行へ全部
function bankrupt(c, id, to) {
  const g = c.g, p = g.P[id];
  if (p.out) return;
  if (to && g.P[to].out) to = null;
  // 何人かに払えないとき: 現金は払う額に応じて分け、土地は銀行へ(ルール)
  const creditors = [...new Set(g.debts.filter((d) => d.pid === id && d.to && !g.P[d.to].out).map((d) => d.to))];
  const split = rule(c, "multiSplit") && creditors.length > 1;
  if (split) to = null;
  // 建物は半額で銀行へ売る(その分も相手に渡る)
  for (let i = 0; i < 40; i++) {
    const o = g.own[i];
    if (!o || o.owner !== id || !o.houses) continue;
    const h = o.houses;
    if (h === 5) { g.hotels++; } else g.houses += h;
    p.cash += (SQ[i].house / 2) * h; o.houses = 0;
  }
  const got = [];
  for (let i = 0; i < 40; i++) {
    const o = g.own[i];
    if (!o || o.owner !== id) continue;
    got.push(i);
    if (to) o.owner = to; else { o.owner = null; o.mort = false; o.fresh = false; }
  }
  if (split) {
    const owed = g.debts.filter((d) => d.pid === id && d.to && !g.P[d.to].out), total = owed.reduce((n, d) => n + d.amount, 0);
    let left = Math.max(0, p.cash);
    owed.forEach((d, k) => { const part = k === owed.length - 1 ? left : Math.floor(Math.max(0, p.cash) * d.amount / total); left -= part; g.P[d.to].cash += part; });
    log(c, `${nm(c, id)} の現金 ${M(Math.max(0, p.cash))} を ${creditors.map((x) => nm(c, x)).join("・")} で分けた`);
  }
  if (to) { g.P[to].cash += Math.max(0, p.cash); g.P[to].jailCards.push(...p.jailCards); }
  else for (const k of p.jailCards) g.decks[k].push(k === "chance" ? 7 : 4);
  if (!to && rule(c, "bankAuction")) g.queue.push(...got); // 銀行に戻った土地は順に競売
  p.cash = 0; p.jailCards = []; p.out = true; p.jailed = false;
  g.outOrder.push(id);
  g.debts = g.debts.filter((d) => d.pid !== id && d.to !== id);
  g.trades = g.trades.filter((t) => t.from !== id && t.to !== id);
  if (g.auction && g.auction.by === id) { g.auction.by = null; g.auction.bid = 0; }
  log(c, `${nm(c, id)} が破産… ${to ? `財産は ${nm(c, to)} へ` : "財産は銀行へ"}`);
  ev(c, { type: "bankrupt", pid: id });
  if (alive(c).length <= 1) return end(c);
  if (to) receiveMortgaged(c, to, got, rule(c, "bankruptInterest"), "受け取った抵当の利子");
  if (curId(c) === id) {
    // 番の人が破産: 競売中ならそのまま続け、終わったら次の人の番から
    g.pending = null;
    if (g.step === "auction") { beginTurn(c); g.resume = "roll"; g.step = "auction"; }
    else beginTurn(c);
  }
}
function end(c) {
  const g = c.g;
  g.step = "end";
  const win = alive(c)[0];
  if (win) log(c, `🏆 ${nm(c, win)} の勝ち！`);
  // 順位: 最後まで残った人が1位、あとは破産が遅い順
  const raw = {};
  g.outOrder.forEach((id, k) => { raw[id] = k + 1; });
  for (const id of alive(c)) raw[id] = g.order.length + 1;
  c.finish(raw);
}

// ---------------------------------------------------------------
// 時間切れ(持ち時間。切断中の人は30秒)
// ---------------------------------------------------------------
// 番・段階・支払い・競売が変わったときだけ掛け直す(ほかの人の操作で番の人の持ち時間が延びないように)
function arm(c) {
  const g = c.g;
  if (g.step === "end") return c.clearTimer();
  kickQueue(c);
  const key = [g.step, g.cur, g.turnNo, g.dbl, g.again, g.debts.length, g.auction ? g.auction.endsAt : 0, c.live().join()].join("|");
  if (key === g.armKey) return;
  g.armKey = key;
  if (g.step === "auction") return c.setTimer(Math.max(500, g.auction.endsAt - Date.now()), () => { endAuction(c); g.armKey = null; arm(c); });
  const live = new Set(c.live());
  const who = g.debts.length ? g.debts.map((d) => d.pid) : [curId(c)];
  const away = who.some((id) => !live.has(id));
  const ms = away ? AWAY_MS : g.cfg.turnSecs * 1000;
  if (!ms) return c.clearTimer();
  c.setTimer(ms, () => { timeout(c); g.armKey = null; arm(c); });
}
function timeout(c) {
  const g = c.g;
  if (g.debts.length) {
    // 借金のある人: 自動でお金を作って払う。足りなければ破産
    for (const id of [...new Set(g.debts.map((d) => d.pid))]) {
      let d;
      while ((d = g.debts.find((x) => x.pid === id))) {
        autoRaise(c, id, d.amount);
        if (settleDebt(c, id)) { bankrupt(c, id, d.to); break; }
      }
      if (g.step === "end") return;
    }
    return;
  }
  const id = curId(c);
  log(c, `${nm(c, id)} は時間切れ`);
  if (g.step === "roll") return roll(c, id);
  if (g.step === "buy") return startAuction(c, g.pending);
  if (g.step === "act") { if (g.again) return roll(c, id); return beginTurn(c); }
}

// ---------------------------------------------------------------
// 取引
// ---------------------------------------------------------------
function cleanSide(c, id, s) {
  const g = c.g, o = s && typeof s === "object" ? s : {};
  const props = [...new Set((Array.isArray(o.props) ? o.props : []).filter((i) => Number.isInteger(i) && i >= 0 && i < 40))];
  const cash = Number.isInteger(o.cash) && o.cash > 0 ? Math.min(o.cash, 100000) : 0;
  const cards = Number.isInteger(o.cards) && o.cards > 0 ? Math.min(o.cards, 2) : 0;
  return { props, cash, cards };
}
function checkSide(c, id, s) {
  const g = c.g, p = g.P[id];
  for (const i of s.props) {
    const o = g.own[i];
    if (!o || o.owner !== id) return `${nm(c, id)} が持っていない土地があります`;
    if (SQ[i].type === "prop" && groupHasBuildings(g, SQ[i].group)) return `${sqName(c, i)} の色には建物があります(先に売ってください)`;
  }
  if (s.cash > p.cash) return `${nm(c, id)} のお金が足りません`;
  if (s.cards > p.jailCards.length) return `${nm(c, id)} は刑務所カードを持っていません`;
  return null;
}
// 抵当中の土地を受け取ったら、利子として1割を払う(本家ルール)
function mortFee(c, s) { return s.props.reduce((n, i) => n + (c.g.own[i].mort ? Math.ceil(priceOf(i) / 20) : 0), 0); }
function applyTrade(c, t) {
  const g = c.g;
  const move = (from, to, s) => {
    for (const i of s.props) g.own[i].owner = to;
    g.P[from].cash -= s.cash; g.P[to].cash += s.cash;
    for (let k = 0; k < s.cards; k++) g.P[to].jailCards.push(g.P[from].jailCards.pop());
  };
  move(t.from, t.to, t.give);
  move(t.to, t.from, t.get);
  const feeTo = mortFee(c, t.give), feeFrom = mortFee(c, t.get);
  g.P[t.to].cash -= feeTo; g.P[t.from].cash -= feeFrom;
  receiveMortgaged(c, t.to, t.give.props, false); receiveMortgaged(c, t.from, t.get.props, false);
  const desc = (s) => [...s.props.map((i) => sqName(c, i)), s.cash ? M(s.cash) : null, s.cards ? `刑務所カード${s.cards}枚` : null].filter(Boolean).join("・") || "なし";
  log(c, `取引成立: ${nm(c, t.from)}(${desc(t.give)}) ⇄ ${nm(c, t.to)}(${desc(t.get)})` + (feeTo + feeFrom ? ` 抵当の利子 ${feeTo ? `${nm(c, t.to)} ${M(feeTo)}` : ""}${feeFrom ? ` ${nm(c, t.from)} ${M(feeFrom)}` : ""}` : ""));
}

// ---------------------------------------------------------------
// 操作
// ---------------------------------------------------------------
function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step === "end") return;
  const me = g.P[pid];
  if (!me || me.out) return;
  const e = act(c, pid, m);
  if (typeof e === "string") return e;
  arm(c);
}
function act(c, pid, m) {
  const g = c.g, me = g.P[pid], myTurn = curId(c) === pid, myDebt = g.debts.some((d) => d.pid === pid);
  const sq = Number.isInteger(m.sq) && m.sq >= 0 && m.sq < 40 ? m.sq : -1;
  switch (m.a) {
    // ---- 番の人の操作 ----
    case "roll":
      if (!myTurn) return "あなたの番ではありません";
      if (g.debts.length) return "先に支払いを済ませてください";
      if (g.step === "roll" || (g.step === "act" && g.again)) return roll(c, pid);
      return;
    case "payJail":
      if (!myTurn || g.step !== "roll" || !me.jailed) return;
      if (me.cash < JAIL_FINE) return "お金が足りません";
      me.cash -= JAIL_FINE; me.jailed = false; me.jailTries = 0;
      if (rule(c, "freeParking")) g.pot += JAIL_FINE;
      log(c, `${nm(c, pid)} が保釈金 ${M(JAIL_FINE)} を払って出所`);
      return;
    case "useCard":
      if (!myTurn || g.step !== "roll" || !me.jailed || !me.jailCards.length) return;
      { const k = me.jailCards.pop(); g.decks[k].push(k === "chance" ? 7 : 4); }
      me.jailed = false; me.jailTries = 0;
      log(c, `${nm(c, pid)} が刑務所から出られるカードを使って出所`);
      return;
    case "buy": {
      if (!myTurn || g.step !== "buy") return;
      const i = g.pending;
      if (me.cash < priceOf(i)) return "お金が足りません(抵当に入れてお金を作るか、競売にしてください)";
      me.cash -= priceOf(i); g.own[i].owner = pid; g.pending = null;
      log(c, `${nm(c, pid)} が ${sqName(c, i)} を ${M(priceOf(i))} で購入`);
      ev(c, { type: "buy", pid, sq: i });
      g.step = "act";
      return;
    }
    case "decline":
      if (!myTurn || g.step !== "buy") return;
      return startAuction(c, g.pending);
    case "end":
      if (!myTurn || g.step !== "act" || g.again) return;
      if (g.debts.length) return "先に支払いを済ませてください";
      return beginTurn(c);
    // ---- 競売(だれでも) ----
    case "bid": {
      if (g.step !== "auction") return;
      const a = g.auction, n = m.amount;
      if (myDebt) return "支払いが残っているので入札できません";
      let spot = null;
      if (a.kind === "house") {
        // 家の競売: 建てる土地を選ぶ(その土地の家の値段以上で入札)
        spot = sq >= 0 ? sq : a.spots[pid] ?? houseSpots(c, pid)[0];
        if (spot == null || canBuild(c, pid, spot, true)) return "家を建てられる土地がありません";
        if (Number.isInteger(n) && n < SQ[spot].house) return `${M(SQ[spot].house)}(家の値段)以上で入札してください`;
      }
      if (!Number.isInteger(n) || n <= a.bid) return `${M(a.bid + 1)}以上で入札してください`;
      const lim = a.kind === "house" ? me.cash : bidLimit(c, pid);
      if (n > lim) return rule(c, "bidCredit") && a.kind !== "house" ? `入札できるのは ${M(lim)}(売却・抵当で作れるお金)までです` : "持っているお金より多くは入札できません";
      if (spot != null) a.spots[pid] = spot;
      a.bid = n; a.by = pid;
      a.endsAt = Math.max(a.endsAt, Date.now() + AUCTION_MS);
      log(c, `${nm(c, pid)} が ${M(n)} で入札`);
      return;
    }
    // ---- 支払い ----
    case "pay": return settleDebt(c, pid) || undefined;
    case "autoPay": {
      const d = g.debts.find((x) => x.pid === pid); if (!d) return;
      autoRaise(c, pid, d.amount);
      return settleDebt(c, pid) || undefined;
    }
    case "bankrupt": {
      const d = g.debts.find((x) => x.pid === pid);
      if (!d) return "破産できるのは払えないときだけです";
      return bankrupt(c, pid, d.to);
    }
    // ---- 土地の管理(いつでも。競売中はできない) ----
    case "build":
      if (g.step === "auction") return "競売中はできません";
      if (myDebt) return "支払いが残っています";
      { const e = canBuild(c, pid, sq); if (e) return e; }
      if (rule(c, "houseAuction") && g.own[sq].houses < 4 && g.houses <= HOUSE_SHORT && alive(c).some((o) => o !== pid && houseSpots(c, o).length)) return startHouseAuction(c, pid, sq);
      return doBuild(c, pid, sq);
    case "sell":
      { const e = canSell(c, pid, sq); if (e) return e; }
      return doSell(c, pid, sq);
    case "mortgage":
      { const e = canMortgage(c, pid, sq); if (e) return e; }
      return doMortgage(c, pid, sq);
    case "unmortgage": {
      const o = g.own[sq];
      if (!o || o.owner !== pid || !o.mort) return;
      if (myDebt) return "支払いが残っています";
      const cost = unmortCost(c, sq);
      if (me.cash < cost) return `お金が足りません(${M(cost)}必要)`;
      me.cash -= cost; o.mort = false; o.fresh = false;
      log(c, `${nm(c, pid)} が ${sqName(c, sq)} の抵当を外した(${M(cost)})`);
      return;
    }
    // ---- 取引 ----
    case "offer": {
      if (g.step === "auction") return "競売中は取引できません";
      const to = m.to;
      if (typeof to !== "string" || to === pid || !g.P[to] || g.P[to].out) return "相手を選んでください";
      if (g.trades.filter((t) => t.from === pid).length >= 3) return "出せる取引は3件までです";
      const give = cleanSide(c, pid, m.give), get = cleanSide(c, to, m.get);
      if (!give.props.length && !give.cash && !give.cards && !get.props.length && !get.cash && !get.cards) return "取引の中身を選んでください";
      const e = checkSide(c, pid, give) || checkSide(c, to, get);
      if (e) return e;
      g.trades.push({ id: ++g.tradeSeq, from: pid, to, give, get });
      log(c, `${nm(c, pid)} が ${nm(c, to)} に取引を持ちかけた`);
      return;
    }
    case "cancelOffer": {
      const t = g.trades.find((x) => x.id === m.id && x.from === pid); if (!t) return;
      g.trades.splice(g.trades.indexOf(t), 1);
      return;
    }
    case "answer": {
      const t = g.trades.find((x) => x.id === m.id && x.to === pid); if (!t) return;
      g.trades.splice(g.trades.indexOf(t), 1);
      if (!m.ok) { log(c, `${nm(c, pid)} が取引を断った`); return; }
      if (g.step === "auction") return "競売中は取引できません";
      const e = checkSide(c, t.from, t.give) || checkSide(c, t.to, t.get);
      if (e) return "取引できません: " + e;
      // 抵当の利子まで払えるか
      if (g.P[t.to].cash - t.get.cash + t.give.cash < mortFee(c, t.give)) return `抵当の利子(${M(mortFee(c, t.give))})が払えません`;
      if (g.P[t.from].cash - t.give.cash + t.get.cash < mortFee(c, t.get)) return `${nm(c, t.from)} が抵当の利子を払えません`;
      applyTrade(c, t);
      // 中身が変わった取引は取り下げ
      g.trades = g.trades.filter((x) => !checkSide(c, x.from, x.give) && !checkSide(c, x.to, x.get));
      return;
    }
    default:
      return;
  }
}

function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step === "end" || !g.P[pid] || g.P[pid].out) return;
  log(c, `${nm(c, pid)} が退出`);
  bankrupt(c, pid, null);
  if (g.step !== "end") arm(c);
}

function view(c, me) {
  const g = c.g;
  return {
    cfg: g.cfg, board: g.board, order: g.order, cur: curId(c), step: g.step,
    P: Object.fromEntries(g.order.map((id) => { const p = g.P[id]; return [id, { cash: p.cash, pos: p.pos, jailed: p.jailed, jailTries: p.jailTries, jailCards: p.jailCards.length, out: p.out, worth: worth(c, id) }]; })),
    own: g.own, houses: g.houses, hotels: g.hotels,
    dice: g.dice, again: g.again, dbl: g.dbl, pending: g.pending, auction: g.auction, debts: g.debts,
    trades: g.trades, log: g.log.slice(-20), ev: g.ev, card: g.card, turnNo: g.turnNo, rollSeq: g.rollSeq,
    rents: g.own.map((o, i) => (o && o.owner && !o.mort && SQ[i].type !== "util" ? rentOf(c, i) : null)),
    unmort: g.own.map((o, i) => (o ? unmortCost(c, i) : null)),
    pot: g.pot, myLimit: g.P[me] && !g.P[me].out ? bidLimit(c, me) : 0,
    mySpots: g.P[me] && !g.P[me].out ? houseSpots(c, me) : [],
  };
}

module.exports = { start, handle, view, onLeave, onPresence: (c) => { if (c.g && c.g.step !== "end") arm(c); }, normalize, DEFAULTS, RULES, PRESETS, MAP_NAMES, boardFor, SQ, G, RR, UT, _rentOf: rentOf, _test: { land, drawCard, advance, roll, beginTurn } };
