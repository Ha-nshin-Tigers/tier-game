"use strict";
// エルドラドを目指して(The Quest for El Dorado 風)のルール本体。部屋・入室は games/eldorado.js が受け持つ。
// デッキ構築 × レース。手札4枚で、カードのパワーと同じ種類の地形を進むか、市場でカードを1枚買う。
// 盤面(地形タイル・公式ルールブックのコース)・洞窟ルール・拡張「英雄と呪い」を本家に合わせて入れた。

// ---------------------------------------------------------------
// カード。s: 使える記号(j=ナタ w=パドル v=コイン)。a: アクション(紫)。once: 1回限りのアイテム
// boost: 動物カードの特殊能力(使うとゲームから除外)。exp: "hh" は拡張「英雄と呪い」
// ---------------------------------------------------------------
const JWV = ["j", "w", "v"];
const CARDS = {
  explorer: { name: "探検家", s: ["j"], p: 1 }, traveler: { name: "旅行者", s: ["v"], p: 1 }, sailor: { name: "水夫", s: ["w"], p: 1 },
  scout: { name: "偵察者", s: ["j"], p: 2, cost: 1 }, trailblazer: { name: "先駆者", s: ["j"], p: 3, cost: 3 }, pioneer: { name: "開拓者", s: ["j"], p: 5, cost: 5 },
  giant: { name: "大きなナタ", s: ["j"], p: 6, cost: 3, once: true }, captain: { name: "船長", s: ["w"], p: 3, cost: 2 },
  photographer: { name: "写真家", s: ["v"], p: 2, cost: 2 }, journalist: { name: "記者", s: ["v"], p: 3, cost: 3 },
  chest: { name: "宝箱", s: ["v"], p: 4, cost: 3, once: true }, millionaire: { name: "大富豪", s: ["v"], p: 4, cost: 5 },
  jack: { name: "なんでも屋", s: JWV, p: 1, cost: 2 }, adventurer: { name: "冒険家", s: JWV, p: 2, cost: 4 }, plane: { name: "プロペラ機", s: JWV, p: 4, cost: 4, once: true },
  transmitter: { name: "電信機", a: true, cost: 4, once: true, text: "好きなカード1枚を無料でもらう(市場の外のカードも可)" },
  cartographer: { name: "製図家", a: true, cost: 4, text: "カードを2枚引く" },
  scientist: { name: "科学者", a: true, cost: 4, text: "カードを1枚引き、そのあと手札1枚をゲームから除外してよい" },
  compass: { name: "コンパス", a: true, cost: 2, once: true, text: "カードを3枚引く" },
  travellog: { name: "探検記録", a: true, cost: 3, once: true, text: "カードを2枚引き、そのあと手札を2枚まで除外してよい" },
  native: { name: "原住民", a: true, cost: 5, text: "となりのマスへ1マス、条件を無視して進む(バリケードも壊せる。山・ほかのコマのマスは不可)" },
  // 拡張「英雄と呪い」: 市場の外に並ぶ新しいカード
  shaman: { name: "シャーマン", a: true, cost: 4, exp: "hh", text: "原住民のように2回まで1マスずつ進む。そのあと呪いを1枚引く" },
  geologist: { name: "地質学者", a: true, cost: 3, exp: "hh", text: "となりの魔物マス(呪いを引かない)か、空いている山へ1マス進む" },
  caveexp: { name: "洞窟探検家", a: true, cost: 3, exp: "hh", text: "控えの洞窟トークンを1つもらう" },
  hunter: { name: "狩猟者", s: ["j", "w"], p: 3, cost: 4, exp: "hh" },
  // 動物カード(初期デッキの9枚目。特殊能力を使うとゲームから除外)
  frank: { name: "フランク", s: JWV, p: 1, boost: 2, exp: "hh", pet: true },
  leroy: { name: "リロイ", s: ["j"], p: 2, boost: 4, exp: "hh", pet: true },
  luna: { name: "ルナ", s: ["j", "w"], p: 1, boost: 3, exp: "hh", pet: true },
  polly: { name: "ポリー", s: ["v"], p: 1, boost: 3, exp: "hh", pet: true },
  // 魔物カード(効果なし。0.5コイン・荒地には使える)
  demon: { name: "魔物", s: [], p: 0, exp: "hh", demon: true },
  // 英雄(酒場で1人1枚。手札に直接入る)
  amelia: { name: "アメリア・ロックハート", s: JWV, p: 3, hero: true, exp: "hh" },
  scrooge: { name: "スクルージ・ブライ", s: ["v"], p: 6, hero: true, exp: "hh" },
  dundee: { name: "クリストファー・ダンディ", s: ["j", "w"], p: 4, hero: true, exp: "hh" },
  mary: { name: "メアリー・リプリー", s: ["j"], p: 6, hero: true, exp: "hh", text: "進む前に、手札の魔物カードを好きなだけ除外できる" },
  magellan: { name: "イアン・マゼラン博士", a: true, hero: true, exp: "hh", text: "控えの洞窟トークンを1つもらう。そのあと次に使う洞窟トークン1つは、なくならない" },
  henry: { name: "ヘンリー・スリープウッド", a: true, hero: true, exp: "hh", text: "市場(ボードの上)のカード1枚を無料で山札の一番上に置く。購入には数えない" },
  nathan: { name: "ネイサン・クック", a: true, hero: true, exp: "hh", text: "記号1つのマス(魔物マスも)へ3回まで進む。条件は無視。記号1つのバリケードも壊せる" },
  gertrude: { name: "ガートルード・エヴァディーン", a: true, hero: true, once: true, exp: "hh", text: "6回まで1マスずつ進む。ほかのコマのマス・空いている山も可。条件無視・バリケードも壊せる。使ったらゲームから除外" },
  isabella: { name: "イザベラ・ジョーンズ", a: true, hero: true, exp: "hh", text: "1マス進む。ほかのコマのマス・空いている山も可。条件無視・バリケードも壊せる" },
  lara: { name: "ララ・オマリー", a: true, hero: true, exp: "hh", text: "ほかの人のコマ全部を、それぞれとなりの空いているマスへ動かす(条件無視)" },
};
const MARKET0 = ["scout", "trailblazer", "jack", "photographer", "chest", "transmitter"];
const RESERVE0 = ["pioneer", "giant", "captain", "journalist", "millionaire", "adventurer", "plane", "cartographer", "scientist", "compass", "travellog", "native"];
const RESERVE_HH = ["shaman", "geologist", "caveexp", "hunter"];
const PETS = ["frank", "leroy", "luna", "polly"];
const HEROES = ["amelia", "scrooge", "dundee", "mary", "magellan", "henry", "nathan", "gertrude", "isabella", "lara"];
const DEMONS = 15, COPIES = 3, HAND = 4;
// バリケード(1〜6 が基本、7・8 は拡張の魔物バリケード=呪いを1枚引いて通る)。番号は同点のときの決め手
const BLOCKADES = [{ n: 1, t: "j", v: 1 }, { n: 2, t: "v", v: 1 }, { n: 3, t: "r", v: 1 }, { n: 4, t: "w", v: 1 }, { n: 5, t: "j", v: 2 }, { n: 6, t: "r", v: 2 }];
const BLOCKADES_HH = [{ n: 7, t: "d", v: 1 }, { n: 8, t: "d", v: 1 }];

// 洞窟トークン。基本36個の内訳は公式ルールブック(独語版)の表記どおり。
// 拡張の18個は種類別の内訳が公表資料に無いため推定(est)
const TOKENS = {
  j1: { name: "ナタ1", s: "j", p: 1, n: 2 }, w1: { name: "パドル1", s: "w", p: 1, n: 2 }, v1: { name: "コイン1", s: "v", p: 1, n: 2 },
  j2: { name: "ナタ2", s: "j", p: 2, n: 3 }, w2: { name: "パドル2", s: "w", p: 2, n: 3 }, v2: { name: "コイン2", s: "v", p: 2, n: 3 },
  j3: { name: "ナタ3", s: "j", p: 3, n: 2 },
  draw: { name: "1枚引く", n: 4, text: "カードを1枚引く(このターンに使える)" },
  trash: { name: "除外", n: 4, text: "手札1枚をゲームから除外" },
  swap: { name: "入れ替え", n: 3, text: "手札1〜4枚を場に出し、同じ枚数を引く" },
  keep: { name: "アイテム温存", n: 2, text: "直前に効果を使った1回限りのカードを、除外せず捨て札へ" },
  pass: { name: "すり抜け", n: 2, text: "このターンの残り、ほかのコマのいるマスにも入れる・通れる" },
  native: { name: "原住民", n: 2, text: "原住民と同じ: となりへ1マス、条件を無視して進む" },
  change: { name: "記号変更", n: 2, text: "次に使うカード1枚の記号を変える(パワーはそのまま)" },
  banish: { name: "魔物払い", n: 5, exp: "hh", est: true, text: "手札の魔物カード1枚を、ほかの人の捨て札へ" },
  protect: { name: "呪いよけ", n: 5, exp: "hh", est: true, text: "呪いを引いたとき、それを見てから無効にできる(持っているだけで使える)" },
  geostep: { name: "地質学者の一歩", n: 4, exp: "hh", est: true, text: "地質学者と同じ: となりの魔物マス(呪い無し)か空いている山へ" },
  market: { name: "市場への道", n: 4, exp: "hh", est: true, text: "市場に空きがなくても、市場の外のカードを買える(山は動かさない)" },
};
// 呪い(20枚)。内訳は国内レビュー記事(英雄と呪い 日本語版)の記載どおり
const CURSES = {
  lethJ: { name: "不調(ナタ)", n: 1, keep: true, sym: "j", need: 2, text: "ナタが使えない。ナタのパワー2以上を捨てると解ける" },
  lethW: { name: "不調(パドル)", n: 1, keep: true, sym: "w", need: 1, text: "パドルが使えない。パドルのパワー1以上を捨てると解ける" },
  lethV: { name: "不調(コイン)", n: 1, keep: true, sym: "v", need: 2, text: "コインが使えない。コインのパワー2以上を捨てると解ける" },
  misery: { name: "苦悩", n: 1, keep: true, text: "アクションカード(紫)が使えない。紫のカード1枚を効果を使わずに捨てると解ける" },
  misfortune: { name: "不運", n: 2, keep: true, text: "カードが一切使えない。手札2枚を捨てると解ける" },
  cavefever: { name: "洞窟恐怖症", n: 2, keep: true, text: "洞窟トークンが使えない。洞窟トークン1つを使わずに箱へ戻すと解ける" },
  torment: { name: "苦痛", n: 6, text: "魔物カード1枚が捨て札に入る" },
  paralysis: { name: "昏睡", n: 3, text: "ほかの人が順番に、自分のコマをとなりの空いているマスへ動かせる" },
  voodoo: { name: "呪術", n: 3, text: "左どなり(次の手番の人)が、あなたが今動かしたコマを2回となりの空いているマスへ動かす" },
};

// ---------------------------------------------------------------
// 地形タイル(1枚37マス=上から 4,5,6,7,6,5,4 マス / 帯タイル16マス=5,6,5 マス)
// jN ジャングル / wN 川 / vN 村 / rN 荒地(N枚捨てる) / cN ベースキャンプ(N枚除外) / mm 山 / cv 洞窟のある山
// dN 魔物(呪いN枚) / tN トンネルのある魔物(呪いN枚) / sN スタート
// A〜N は ShlomoAlon/el-dorado(非公式のデジタル版)の写しを、BoardGameHelpers の地形タイル一覧の画像と
// 1マスずつ照合して使用(洞窟の位置は画像から)。E・H・O〜R・S〜X は同一覧の画像から写した。
// どのタイルも同一覧に載っている地形ごとのマス数と一致することを確認済み
// ---------------------------------------------------------------
const BOARDS = {
  A: ["j1 c1 j1 j1", "w1 mm j1 j1 v1", "j1 cv v1 j1 j1 j1", "j1 v1 j1 w1 j1 v1 j1", "j1 j1 v1 j1 w1 j1", "j1 j1 j1 j1 j1", "s1 s2 s3 s4"],
  B: ["j1 w1 c1 w1", "j1 j1 v1 cv j1", "j1 v1 j1 j1 j1 j1", "w1 j1 v1 j1 v1 j1 j1", "j1 j1 w1 j1 j1 j1", "j1 j1 j1 j1 j1", "s4 s3 s2 s1"],
  C: ["j1 j1 r1 r1", "j1 v1 r1 w1 w1", "w1 w1 v1 v1 r1 w1", "w1 v1 r1 cv w1 r1 r1", "v1 r1 w1 w1 v1 v1", "v1 r1 j1 v1 w1", "j1 j1 w1 w1"],
  D: ["j2 j1 mm w3", "j1 j1 v3 v1 mm", "j1 w1 j1 mm v3 j1", "j2 w1 w2 cv j1 j1 j2", "j1 w1 w1 w2 w1 j1", "j1 w1 w1 w1 j1", "j1 j1 j1 j2"],
  E: ["c1 v1 v1 v1", "j1 j2 j1 cv v1", "r1 j1 mm w1 w1 j1", "j1 j2 j3 w1 j1 j2 r1", "j1 r1 r3 r1 mm j1", "r1 mm j2 w2 j1", "mm r1 r1 j1"],
  F: ["j1 mm cv w1", "j2 j1 mm w1 w1", "r1 j1 w2 w3 w1 r1", "r1 v1 v2 mm j2 j1 r1", "r1 v1 r2 j1 j1 r1", "j1 j3 j1 w2 w2", "c1 j2 r1 c2"],
  G: ["j1 j1 j1 j1", "j1 j2 v1 mm j1", "v1 v2 v2 r1 v1 j1", "mm cv v4 v3 v2 j2 c1", "v1 v2 v2 r1 v1 j1", "j1 j2 v1 mm j1", "j1 j1 j1 j1"],
  H: ["w1 w2 w2 w2", "v1 w1 w1 w1 w2", "v2 v2 v1 v1 w1 w2", "v3 cv v2 v2 v1 j1 j1", "v2 v2 v1 v1 j1 j2", "v1 j1 j1 j1 j2", "j1 j2 j2 j2"],
  I: ["j1 j1 j1 j1", "v1 j1 mm j1 j1", "v1 v2 j1 mm j2 j1", "v1 v2 j1 j2 c3 mm cv", "v2 r3 mm mm j2 j1", "w2 w1 w1 j1 j1", "w2 w2 w1 j1"],
  J: ["w1 w1 w1 w1", "w1 mm w2 w1 r2", "w1 w2 j1 j2 r2 r1", "v1 v1 j2 c1 j1 r2 r1", "v1 v2 j1 j1 r2 r1", "v1 v2 v2 cv r1", "v1 v1 v1 r2"],
  K: ["c1 j2 j2 j1", "j1 j1 w3 j1 j2", "j1 j2 j1 j3 j1 j2", "j2 j1 j3 j1 j3 j1 j2", "j2 j1 j3 j1 j2 j1", "j2 j1 v4 j1 j1", "j1 j2 j2 c1"],
  L: ["w1 c1 c1 j3", "j1 w1 w1 j3 j1", "j2 j1 j1 j3 j1 j2", "j2 j1 mm j1 cv j1 j2", "j1 j2 j2 j1 j2 j1", "v2 c2 v2 j1 j1", "j2 j2 j1 mm"],
  M: ["j1 j1 j1 c1", "j1 v4 mm mm w4", "j1 v2 j1 j1 w1 cv", "mm j1 j1 r2 j1 j1 mm", "mm mm mm mm r2 j1", "j1 j1 j1 r2 j1", "w1 w1 j1 j1"],
  N: ["j1 j1 j1 j1", "v1 j1 j2 j1 w1", "v1 v2 j1 w1 w1 w1", "w1 w1 v3 v4 v3 v2 v1", "w1 w1 w1 j1 v2 v1", "j1 j1 j2 j1 j1", "j1 j1 j1 j1"],
  O: ["v2 v1 r1 j2 r2", "v1 mm w4 mm mm r1", "v1 w1 j2 j1 r1"],
  P: ["w3 w2 w1 w2 w3", "r1 w1 w1 w1 w1 j1", "w1 j2 w3 r2 w1"],
  Q: ["r1 v1 v1 w1 j3", "j2 r1 j2 v3 w1 j2", "j1 r3 j1 j1 w2"],
  R: ["j1 j1 mm v1 v1", "j1 j3 mm v1 c1 v1", "j1 j1 mm v1 v1"],
  S: ["v2 d1 j1 w1", "t1 j1 w2 v1 j2", "v1 w1 v2 j3 t2 v1", "j1 c1 j2 cv v2 w1 j2", "v2 w1 v2 w1 j2 v1", "j1 t1 j1 d1 w1", "v1 w1 v2 j1"],
  T: ["d1 v1 v1 d1", "w1 j3 j4 d2 mm", "d1 w1 v1 v1 w1 w1", "d1 cv mm d2 v4 cv c1", "d1 j1 v1 v1 j1 j1", "j1 w2 w3 d2 mm", "d1 v1 v1 d1"],
  U: ["d1 w1 w1 w1", "v2 w3 w1 t2 w2", "v2 v1 mm w1 w1 w2", "v1 t1 v1 cv mm j4 mm", "v1 v1 mm j1 j1 j2", "v1 v3 j2 t1 j1", "d1 j2 j2 j1"],
  V: ["w1 w2 mm w1", "w2 w1 w1 w1 j3", "w1 d1 d1 w2 d2 j3", "mm w1 d1 w1 w1 w1 w1", "w1 w2 w1 mm cv w3", "w2 j3 w1 w1 w1", "c1 j3 j2 j1"],
  W: ["cv w2 w1 j1", "j2 d1 d1 w2 j1", "w1 j2 mm w1 d1 j2", "d1 j3 v2 r2 w2 j2 t2", "j1 t1 v1 mm j2 w1", "j1 v3 d1 d1 j3", "d1 v1 w1 mm"],
  X: ["j1 j2 j3 d1", "d1 t2 d1 j2 j3", "j3 j2 j3 d1 d1 j1", "w1 w2 w1 j2 j2 t2 d1", "j3 t1 w2 w1 j3 j1", "v2 c1 cv w2 d1", "v3 v2 j3 w1"],
};
// 公式ルールブック(基本・英雄と呪い)のコース。p: [タイル, 基準マスの q, r, 回転(60°単位)]、g: ゴール3マス、s: ゴールの地形
// tv: 酒場の3マス(tt: 村 v / 荒地 r)。配置は BoardGameHelpers のコース表示から換算(タイルの重なり・連結・ゴールの位置を検査済み)
// 「はじめての探検」だけは ShlomoAlon/el-dorado の配置(公式の配置図から写したもの)を使用
const COURSES = {
  first: { name: "はじめての探検", diff: "かんたん", p: [["B", 0, 0, 2], ["C", 7, -3, 5], ["N", 11, 0, 2], ["I", 14, 4, 2], ["K", 21, -1, 0]], g: ["25,-5", "24,-5", "25,-4"], s: "w" },
  home: { name: "最後の直線", diff: "かんたん", p: [["B", 0, 0, 2], ["J", 7, -3, 0], ["Q", 9, 0, 5], ["K", 12, 2, 1], ["M", 16, 5, 5], ["C", 19, 9, 1]], g: ["23,8", "23,9", "22,10"], s: "j" },
  hills: { name: "黄金の丘", diff: "かんたん", p: [["B", 0, 0, 1], ["C", 3, -7, 0], ["G", 7, -14, 4], ["K", 11, -11, 4], ["J", 14, -7, 1], ["N", 21, -10, 4]], g: ["25,-11", "25,-10", "24,-9"], s: "j" },
  winding: { name: "曲がりくねった道", diff: "かんたん", p: [["B", 0, 0, 2], ["I", 7, -3, 4], ["F", 11, 0, 4], ["G", 8, 7, 2], ["C", 15, 4, 1], ["N", 19, 7, 5]], g: ["23,6", "23,7", "22,8"], s: "w" },
  serpentine: { name: "うねる道", diff: "かんたん", p: [["A", 0, 0, 1], ["C", 4, 3, 4], ["E", 11, -1, 1], ["G", 8, -5, 3], ["J", 15, -9, 3], ["M", 19, -6, 5]], g: ["20,-3", "19,-2", "18,-2"], s: "w" },
  witch: { name: "魔女の大釜", diff: "ふつう", p: [["A", 0, 0, 0], ["L", 7, -4, 5], ["G", 14, -7, 4], ["D", 18, -4, 4], ["M", 14, 3, 0], ["I", 7, 7, 5]], g: ["3,8", "3,7", "4,6"], s: "w" },
  swamp: { name: "湿地帯", diff: "ふつう", p: [["A", 0, 0, 0], ["R", 5, -3, 1], ["D", 10, -5, 2], ["H", 13, -1, 2], ["E", 16, 3, 1], ["O", 11, 7, 4], ["K", 6, 9, 0]], g: ["3,13", "2,13", "2,12"], s: "w" },
  journey: { name: "未知への旅", diff: "かんたん", exp: "hh", p: [["B", 0, 0, 5], ["N", -7, 3, 5], ["T", -11, 0, 4], ["X", -18, 4, 1], ["C", -22, 11, 5], ["U", -25, 18, 3]], g: ["-24,21", "-25,22", "-26,22"], s: "j", tv: ["-6,-1", "-5,-1", "-4,-1"], tt: "v" },
  blind: { name: "死角", diff: "ふつう", exp: "hh", p: [["A", 0, 0, 4], ["U", -4, -3, 4], ["Q", -3, -8, 0], ["K", -9, -5, 0], ["T", -13, -8, 4], ["W", -20, -4, 2], ["H", -23, 3, 4]], g: ["-22,6", "-23,7", "-24,7"], s: "j", tv: ["-5,1", "-6,1", "-7,1"], tt: "v" },
  demon: { name: "魔物の谷", diff: "ふつう", exp: "hh", p: [["A", 0, 0, 0], ["X", 7, -3, 3], ["H", 14, -6, 5], ["I", 21, -10, 1], ["S", 18, -14, 3], ["U", 11, -11, 3]], g: ["7,-10", "7,-11", "8,-12"], s: "w", tv: ["6,1", "5,1", "4,1"], tt: "v" },
  delta: { name: "川の三角州", diff: "むずかしい", exp: "hh", p: [["A", 0, 0, 1], ["I", 4, 3, 4], ["S", 1, 10, 1], ["D", 8, 7, 3], ["X", 5, 14, 5], ["Q", 0, 17, 1], ["V", -5, 20, 0]], g: ["-8,24", "-9,24", "-9,23"], s: "j", tv: ["5,-1", "6,-1", "7,-1"], tt: "r" },
  pilgrims: { name: "巡礼者の道", diff: "むずかしい", exp: "hh", p: [["B", 0, 0, 2], ["R", 5, -2, 4], ["T", 10, -5, 2], ["L", 13, -1, 4], ["F", 16, 3, 1], ["V", 19, 7, 2], ["X", 16, 14, 1]], g: ["12,15", "12,14", "13,13"], s: "j", tv: ["11,-9", "12,-9", "13,-9"], tt: "r" },
  pass: { name: "峠越え", diff: "むずかしい", exp: "hh", p: [["B", 0, 0, 4], ["R", -3, 5, 0], ["M", -5, 10, 0], ["W", -9, 17, 0], ["O", -15, 19, 3], ["D", -13, 14, 2], ["U", -20, 17, 2], ["T", -23, 13, 4]], g: ["-24,10", "-23,9", "-22,9"], s: "w", tv: ["-8,9", "-7,8", "-6,7"], tt: "r" },
};
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const K = (q, r) => q + "," + r;
const rot = (q, r, k) => { for (let i = 0; i < k; i++) [q, r] = [-r, q + r]; return [q, r]; };
function parseTok(t) {
  if (t === "mm") return { t: "m", v: 0 };
  if (t === "cv") return { t: "m", v: 0, cave: true };
  if (t[0] === "s") return { t: "s", v: 0, n: +t[1] };
  return { t: t[0], v: +t.slice(1) };
}
// タイルのマス(基準マスからの相対 q,r)。37マスのタイルは中央、帯タイルは真ん中の行の3つ目が基準
function localHexes(rows) {
  const out = [];
  if (rows.length === 7) rows.forEach((row, i) => { const r = i - 3, qmin = Math.max(-3, -r - 3); row.split(" ").forEach((t, j) => out.push([qmin + j, r, t])); });
  else rows.forEach((row, i) => { const r = i - 1, q0 = r === -1 ? -1 : -2; row.split(" ").forEach((t, j) => out.push([q0 + j, r, t])); });
  return out;
}
const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// コースを組み立てる: マス・ボードの境目(バリケード)・スタート・ゴール・酒場・洞窟・トンネル
function buildCourse(id, opts = {}, rnd = Math.random) {
  const C = COURSES[id], hex = {};
  C.p.forEach(([name, cq, cr, k], ti) => {
    for (const [lq, lr, tok] of localHexes(BOARDS[name])) { const [a, b] = rot(lq, lr, k); const q = cq + a, r = cr + b; hex[K(q, r)] = { q, r, ...parseTok(tok), tile: ti }; }
  });
  const nT = C.p.length;
  for (const key of C.g) { const [q, r] = key.split(",").map(Number); hex[key] = { q, r, t: "g", sym: C.s, v: 1, tile: nT }; }
  for (const key of C.tv || []) { const [q, r] = key.split(",").map(Number); hex[key] = { q, r, t: C.tt, v: 1, tile: nT + 1, tavern: true }; }
  // ボードの境目(順番に隣り合うボードの間)にバリケードを1つずつ(ランダム)
  const pool = shuffle([...BLOCKADES, ...(opts.hh ? BLOCKADES_HH : [])], rnd);
  const blockades = [];
  for (let i = 0; i < nT - 1 && pool.length; i++) blockades.push({ ...pool.shift(), a: i, b: i + 1, by: null });
  // トンネル: 同じタイルのトンネル同士はとなりどうし
  const tunnels = {};
  for (const [key, h] of Object.entries(hex)) if (h.t === "t") (tunnels[h.tile] ||= []).push(key);
  const starts = Object.values(hex).filter((h) => h.t === "s").sort((x, y) => x.n - y.n).map((h) => K(h.q, h.r));
  const caves = Object.keys(hex).filter((k) => hex[k].cave);
  return { id, name: C.name, hex, blockades, starts, goals: [...C.g], tavern: [...(C.tv || [])], caves, tunnels, endSym: C.s };
}

const DEFAULTS = { course: "first", turnSecs: 120, caves: false, hh: false };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if (COURSES[r.course]) out.course = r.course;
  if ([0, 60, 120, 180].includes(r.turnSecs)) out.turnSecs = r.turnSecs;
  if (typeof r.caves === "boolean") out.caves = r.caves;
  if (typeof r.hh === "boolean") out.hh = r.hh;
  // 英雄と呪いのコースは拡張が必要。拡張はいつも洞窟ルールで遊ぶ(公式)
  if (COURSES[out.course].exp === "hh") out.hh = true;
  if (out.hh) out.caves = true;
  return out;
}

// ---------------------------------------------------------------
// 準備
// ---------------------------------------------------------------
const nb = (key) => { const [q, r] = key.split(",").map(Number); return DIRS.map(([a, b]) => K(q + a, r + b)); };
function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const order = shuffle([...c.members()], rnd);
  const course = buildCourse(cfg.course, cfg, rnd);
  const reserve = Object.fromEntries([...RESERVE0, ...(cfg.hh ? RESERVE_HH : [])].map((k) => [k, COPIES]));
  const g = c.g = { cfg, course, order, cur: 0, P: {}, uid: 0, market: MARKET0.map((k) => ({ k, n: COPIES })), reserve,
    bought: false, move: null, steps: null, pending: null, q: [], change: false, passAll: false, lastItem: null, keepToken: false,
    finalRound: false, endIdx: null, log: [], turnNo: 1, step: "play", result: null,
    caveTok: {}, supply: [], tokBox: [], curses: [], curseBox: [], demons: cfg.hh ? DEMONS : 0, heroes: cfg.hh ? shuffle([...HEROES], rnd) : [] };
  // 洞窟トークン: 洞窟1つに4個ずつ。拡張ありなら残りは控え(なくなったら使用済みを混ぜ直す)
  if (cfg.caves) {
    const bag = [];
    for (const [k, d] of Object.entries(TOKENS)) if (!d.exp || cfg.hh) for (let i = 0; i < d.n; i++) bag.push({ id: ++g.uid, k });
    shuffle(bag, rnd);
    for (const key of course.caves) g.caveTok[key] = bag.splice(0, 4);
    if (cfg.hh) g.supply = bag;
  }
  if (cfg.hh) for (const [k, d] of Object.entries(CURSES)) for (let i = 0; i < d.n; i++) g.curses.push({ id: ++g.uid, k });
  shuffle(g.curses, rnd);
  const pets = shuffle([...PETS], rnd);
  // 2人は1人2コマ(スタート1・3 と 2・4)。3〜4人は1人1コマ
  const two = order.length === 2;
  order.forEach((id, i) => {
    const ks = [...Array(3).fill("explorer"), ...Array(4).fill("traveler"), "sailor", ...(cfg.hh ? [pets[i]] : [])];
    const deck = shuffle(ks.map((k) => ({ id: ++g.uid, k })), rnd);
    const pieces = two ? [course.starts[i], course.starts[i + 2]] : [course.starts[i]];
    g.P[id] = { deck, hand: [], discard: [], played: [], gone: [], pieces, done: pieces.map(() => false), blockades: [], tokens: [], curses: [], near: pieces.map(() => []), hero: false };
    draw(g, id, HAND);
  });
  log(g, `コース「${course.name}」。${nm(c, order[0])} からスタート`);
  arm(c);
}
const nm = (c, id) => c.nameOf(id);
function log(g, t) { g.log.push(t); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); }
function draw(g, id, n) {
  const p = g.P[id];
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) { if (!p.discard.length) break; p.deck = shuffle(p.discard); p.discard = []; }
    p.hand.push(p.deck.pop());
  }
}
const curId = (g) => g.order[g.cur];
const piecesAt = (g, key) => g.order.filter((id) => g.P[id].pieces.some((k, i) => !g.P[id].done[i] && k === key));
const occupied = (g, key) => piecesAt(g, key).length > 0;
const isMountain = (h) => h && h.t === "m";
// 空いている山: 洞窟の無い山か、洞窟トークンがもう無い山
const emptyMountain = (g, key) => isMountain(g.course.hex[key]) && !(g.course.hex[key].cave && (g.caveTok[key] || []).length);
// ボードの境目にバリケードが残っていれば、その間は通れない
function blockadeBetween(g, a, b) {
  const ha = g.course.hex[a], hb = g.course.hex[b];
  if (!ha || !hb || Math.abs(ha.tile - hb.tile) !== 1) return null;
  const bl = g.course.blockades.find((x) => x.a === Math.min(ha.tile, hb.tile) && x.b === Math.max(ha.tile, hb.tile));
  return bl && !bl.by ? bl : null;
}
// となり(トンネル同士もとなり)
function neighbors(g, key, tunnel = true) {
  const out = nb(key).filter((k) => g.course.hex[k]);
  const h = g.course.hex[key];
  if (tunnel && h && h.t === "t") for (const k of g.course.tunnels[h.tile] || []) if (k !== key) out.push(k);
  return out;
}
const cardDef = (card) => CARDS[card.k];
const curse = (p, k) => p.curses.find((x) => x.k === k);
const symBlocked = (p, s) => p.curses.some((x) => CURSES[x.k].sym === s);
// コインの価値: コインの記号を持つカードはパワー(動物の特殊能力ならその値)、ほかは 0.5。不調(コイン)中は 0.5
function coinOf(g, p, card, boost) {
  const d = cardDef(card);
  if (g.change && g.changeCard === card.id) return d.p || 0.5;
  if (d.s && d.s.includes("v") && !symBlocked(p, "v")) return boost && d.boost ? d.boost : d.p;
  return 0.5;
}

// 手札から出す。アイテム(1回限り)を効果に使ったときはゲームから除外、それ以外は場に出す
function playFromHand(g, id, cardId, useEffect) {
  const p = g.P[id], i = p.hand.findIndex((x) => x.id === cardId);
  if (i < 0) return null;
  const [card] = p.hand.splice(i, 1);
  if (useEffect && cardDef(card).once) { removeCard(g, id, card); g.lastItem = card.id; }
  else p.played.push(card);
  return card;
}
// ゲームから除外。魔物カードは魔物の山へ戻る
function removeCard(g, id, card) {
  if (cardDef(card).demon) g.demons++;
  else g.P[id].gone.push(card);
}
function pieceAt(g, id, piece) { const p = g.P[id]; return Number.isInteger(piece) && p.pieces[piece] != null && !p.done[piece] ? piece : p.done.findIndex((d) => !d); }

// ---------------------------------------------------------------
// 制限(呪い)のチェック
// ---------------------------------------------------------------
function canPlayCards(p) { return curse(p, "misfortune") ? "不運の呪い: 先に手札2枚を捨てて解いてください" : null; }
function canPlayAction(p) { return canPlayCards(p) || (curse(p, "misery") ? "苦悩の呪い: 先に紫のカード1枚を捨てて解いてください" : null); }
function canPlayToken(p) { return curse(p, "cavefever") ? "洞窟恐怖症の呪い: 先に洞窟トークン1つを箱へ戻して解いてください" : null; }
const SYMJ = { j: "ナタ", w: "パドル", v: "コイン" };

// 移動に使う「パワーの出どころ」: 手札のカード(m.card)か、洞窟の記号トークン(m.token)
function powerSource(g, id, m) {
  const p = g.P[id];
  if (m.token != null) {
    const e = canPlayToken(p); if (e) return { e };
    const t = p.tokens.find((x) => x.id === m.token), d = t && TOKENS[t.k];
    if (!d || !d.s) return { e: "その洞窟トークンでは進めません" };
    return { src: { token: t.id, k: t.k, syms: [d.s], left: d.p } };
  }
  const e = canPlayCards(p); if (e) return { e };
  const card = p.hand.find((x) => x.id === m.card);
  if (!card) return { e: "そのカードは手札にありません" };
  const d = cardDef(card);
  if (d.a) return { e: "アクションカードでは進めません" };
  if (!d.s || !d.s.length) return { e: "このカードでは進めません" };
  const boost = !!(m.boost && d.boost);
  const syms = g.change ? JWV : d.s;
  return { src: { card: card.id, k: card.k, syms, left: boost ? d.boost : d.p, boost, changed: g.change } };
}
// パワーの出どころを確定(手札から場へ出す・トークンを使う)
function commitSource(c, id, mv) {
  const g = c.g, p = g.P[id];
  if (mv.token != null) useToken(g, id, mv.token);
  else {
    const card = p.hand.find((x) => x.id === mv.card);
    if (mv.boost) { p.hand.splice(p.hand.indexOf(card), 1); removeCard(g, id, card); log(g, `${nm(c, id)} が ${cardDef(card).name} の特殊能力を使った`); }
    else playFromHand(g, id, mv.card, true);
    if (mv.changed) { g.change = false; g.changeCard = null; }
    // メアリー: 進む前に手札の魔物カードを除外できる
    if (mv.k === "mary" && p.hand.some((x) => cardDef(x).demon)) g.pending = { type: "trash", pid: id, max: p.hand.filter((x) => cardDef(x).demon).length, only: "demon", title: "メアリー: 手札の魔物カードを好きなだけ除外できます" };
  }
}
// 洞窟トークンを使う(箱へ)。マゼラン博士の直後の1つはなくならない
function useToken(g, id, tokId) {
  const p = g.P[id], i = p.tokens.findIndex((x) => x.id === tokId);
  if (i < 0) return null;
  const t = p.tokens[i];
  if (g.keepToken) { g.keepToken = false; return t; }
  p.tokens.splice(i, 1); g.tokBox.push(t);
  return t;
}

// ---------------------------------------------------------------
// 移動
// ---------------------------------------------------------------
function movable(g) { return g.bought ? "カードを買ったあとは進めません(先に進んでから買います)" : null; }
// カード1枚(またはトークン)で進む(残ったパワーで続けて進める)。to: 隣のマス
function moveWithCard(c, id, m) {
  const g = c.g, p = g.P[id], hex = g.course.hex;
  const e0 = movable(g); if (e0) return e0;
  let mv = g.move, fresh = false;
  if (!mv || (m.card != null && mv.card !== m.card) || (m.token != null && mv.token !== m.token)) {
    const { e, src } = powerSource(g, id, m); if (e) return e;
    const piece = pieceAt(g, id, m.piece);
    if (piece < 0) return "動かせるコマがありません";
    mv = { ...src, piece }; fresh = true;
  }
  const from = p.pieces[mv.piece], to = m.to, h = hex[to];
  if (!h || !nb(from).includes(to)) return "となりのマスを選んでください";
  if (h.t === "m") return "山には入れません";
  if (h.t === "s") return "スタートのマスには戻れません";
  if (occupied(g, to) && !g.passAll) return "ほかのコマがいるマスには入れません";
  if (blockadeBetween(g, from, to)) return "先にバリケードを取り除いてください";
  if (h.t === "r" || h.t === "c") return "荒地・ベースキャンプは手札を選んで入ります";
  if (h.t === "d" || h.t === "t") return "魔物マスはカードを使わずに入ります(呪いを引きます)";
  const need = h.t === "g" ? h.sym : h.t;
  const sym = mv.syms.length > 1 ? (mv.fixed || need) : mv.syms[0];
  if (!mv.syms.includes(need) || sym !== need) return `このマスには${SYMJ[need]}が必要です`;
  if (symBlocked(p, need)) return `不調の呪い: ${SYMJ[need]}が使えません`;
  if (h.v > mv.left) return `パワーが足りません(必要 ${h.v} / 残り ${mv.left})`;
  if (fresh) { endMove(c); commitSource(c, id, mv); g.move = mv; }
  mv.fixed = sym; mv.left -= h.v; mv.moved = true;
  enter(c, id, mv.piece, to);
  if (g.move === mv && mv.left <= 0) endMove(c);
  pump(c);
}
// 動きが止まった(カード1枚の移動の終わり・荒地/ベースキャンプ・魔物マス・原住民など)
function endMove(c) {
  const g = c.g, mv = g.move;
  if (!mv) return;
  g.move = null;
  if (mv.moved) stopAt(c, curId(g), mv.piece);
}
// 止まったマスでの出来事: 洞窟(となりに止まったら1つ。同じ洞窟は一度離れてから)・酒場
function stopAt(c, id, piece) {
  const g = c.g, p = g.P[id];
  if (!p || p.done[piece]) return;
  const pos = p.pieces[piece];
  if (g.cfg.caves) {
    const now = nb(pos).filter((k) => g.course.hex[k] && g.course.hex[k].cave);
    for (const k of now) if (!p.near[piece].includes(k)) {
      const t = (g.caveTok[k] || []).shift();
      if (t) { p.tokens.push(t); log(g, `${nm(c, id)} が洞窟で「${TOKENS[t.k].name}」を見つけた`); }
    }
    p.near[piece] = now;
  }
  if (g.cfg.hh && g.course.tavern.includes(pos) && !p.hero && g.heroes.length) {
    p.hero = true;
    const opts = g.heroes.splice(0, 3);
    g.pending = { type: "hero", pid: id, opts };
    log(g, `${nm(c, id)} が酒場で英雄を探している`);
  }
}
function enter(c, id, piece, to) {
  const g = c.g, p = g.P[id], h = g.course.hex[to];
  p.pieces[piece] = to;
  if (h.t === "g") {
    p.done[piece] = true; if (g.move && g.move.piece === piece) g.move = null;
    log(g, `${nm(c, id)} のコマがエルドラドに到着！`);
    if (p.done.every(Boolean) && !g.finalRound) {
      // 最後のラウンド: このラウンドの最後の人まで遊んで終わり(最後の人なら今すぐ終わり)
      g.finalRound = true; g.endIdx = g.order.length - 1;
      log(g, "最後のラウンド！");
    }
  }
}
// 荒地(N枚捨てる)・ベースキャンプ(N枚ゲームから除外)に入る
function enterWithCards(c, id, m) {
  const g = c.g, p = g.P[id], hex = g.course.hex, piece = pieceAt(g, id, m.piece);
  const e0 = movable(g) || canPlayCards(p); if (e0) return e0;
  if (piece < 0) return;
  const from = p.pieces[piece], h = hex[m.to];
  if (!h || !nb(from).includes(m.to)) return "となりのマスを選んでください";
  if (h.t !== "r" && h.t !== "c") return "このマスはカードの種類とパワーで入ります";
  if (occupied(g, m.to) && !g.passAll) return "ほかのコマがいるマスには入れません";
  if (blockadeBetween(g, from, m.to)) return "先にバリケードを取り除いてください";
  const ids = Array.isArray(m.cards) ? [...new Set(m.cards)] : [];
  if (ids.length !== h.v || !ids.every((x) => p.hand.some((y) => y.id === x))) return `手札から${h.v}枚選んでください`;
  endMove(c);
  for (const x of ids) {
    if (h.t === "c") { const card = p.hand.splice(p.hand.findIndex((y) => y.id === x), 1)[0]; removeCard(g, id, card); } // ベースキャンプ: ゲームから除外
    else playFromHand(g, id, x, false);
  }
  if (h.t === "c") log(g, `${nm(c, id)} がベースキャンプでカードを${ids.length}枚除外`);
  enter(c, id, piece, m.to);
  stopAt(c, id, piece);
  pump(c);
}
// 魔物マス・トンネル: カードは使わず、記された数だけ呪いを引いて入る
function enterDemon(c, id, m) {
  const g = c.g, p = g.P[id], hex = g.course.hex, piece = pieceAt(g, id, m.piece);
  const e0 = movable(g); if (e0) return e0;
  if (piece < 0) return;
  const from = p.pieces[piece], h = hex[m.to];
  if (!h || (h.t !== "d" && h.t !== "t")) return "魔物マスを選んでください";
  if (!neighbors(g, from).includes(m.to)) return "となりのマス(またはトンネルでつながったマス)を選んでください";
  if (occupied(g, m.to) && !g.passAll) return "ほかのコマがいるマスには入れません";
  if (blockadeBetween(g, from, m.to)) return "先にバリケードを取り除いてください";
  endMove(c);
  enter(c, id, piece, m.to);
  stopAt(c, id, piece);
  log(g, `${nm(c, id)} が魔物マスに入った(呪い${h.v}枚)`);
  for (let i = 0; i < h.v; i++) g.q.push({ t: "curse", pid: id, piece });
  pump(c);
}
// バリケードを取り除く(となりのボードとの境目にいるとき)
function breakBlockade(c, id, m) {
  const g = c.g, p = g.P[id], bl = g.course.blockades.find((x) => x.n === m.n);
  if (!bl || bl.by) return "そのバリケードはありません";
  const e0 = movable(g); if (e0) return e0;
  const piece = g.move ? g.move.piece : pieceAt(g, id, m.piece);
  if (piece < 0) return;
  const from = p.pieces[piece];
  if (!nb(from).some((x) => blockadeBetween(g, from, x) === bl)) return "そのバリケードのとなりにいません";
  if (bl.t === "d") {
    endMove(c);
    g.q.push({ t: "curse", pid: id, piece });
  } else if (bl.t === "r") {
    const e = canPlayCards(p); if (e) return e;
    const ids = Array.isArray(m.cards) ? [...new Set(m.cards)] : [];
    if (ids.length !== bl.v || !ids.every((x) => p.hand.some((y) => y.id === x))) return `手札から${bl.v}枚選んでください`;
    endMove(c); for (const x of ids) playFromHand(g, id, x, false);
  } else {
    let mv = g.move, fresh = false;
    if (!mv || (m.card != null && mv.card !== m.card) || (m.token != null && mv.token !== m.token)) {
      const { e, src } = powerSource(g, id, m); if (e) return e;
      mv = { ...src, piece }; fresh = true;
    }
    const sym = mv.syms.length > 1 ? (mv.fixed || bl.t) : mv.syms[0];
    if (!mv.syms.includes(bl.t) || sym !== bl.t) return `このバリケードには${SYMJ[bl.t]}が必要です`;
    if (symBlocked(p, bl.t)) return `不調の呪い: ${SYMJ[bl.t]}が使えません`;
    if (bl.v > mv.left) return "パワーが足りません";
    if (fresh) { endMove(c); commitSource(c, id, mv); g.move = mv; }
    mv.fixed = sym; mv.left -= bl.v;
    if (mv.left <= 0) endMove(c);
  }
  takeBlockade(c, id, bl);
  pump(c);
}
function takeBlockade(c, id, bl) {
  const g = c.g;
  bl.by = id; g.P[id].blockades.push(bl.n);
  log(g, `${nm(c, id)} がバリケード(${bl.n})を取り除いた`);
}

// ---------------------------------------------------------------
// 条件を無視して進む効果(原住民・シャーマン・英雄など)と、ほかの人のコマを動かす呪い
// kind ごとの決まり: occ ほかのコマのマス可 / mt 空いている山可 / bl バリケードを壊せる(bl1 は記号1つだけ)
// demonOnly 魔物マスか空いている山だけ / single 記号1つのマスだけ / foreign ほかの人のコマを動かす(トンネル・バリケード・ゴール不可)
// ---------------------------------------------------------------
const STEP = {
  native: { n: 1, bl: true }, shaman: { n: 2, bl: true }, geologist: { n: 1, demonOnly: true },
  isabella: { n: 1, occ: true, mt: true, bl: true }, nathan: { n: 3, single: true, bl1: true }, gertrude: { n: 6, occ: true, mt: true, bl: true },
  voodoo: { n: 2, foreign: true, must: true }, paralysis: { n: 1, foreign: true }, lara: { n: 1, foreign: true, must: true },
};
function stepTargets(g, st) {
  const R = STEP[st.kind], p = g.P[st.owner], from = p.pieces[st.piece], hex = g.course.hex, out = [];
  for (const to of neighbors(g, from, !R.foreign)) {
    const h = hex[to];
    if (!h || h.t === "s") continue;
    if (R.foreign && (h.t === "g" || nb(from).indexOf(to) < 0)) continue;
    if (isMountain(h) && !((R.mt || R.demonOnly) && emptyMountain(g, to))) continue;
    if (R.demonOnly && !isMountain(h) && h.t !== "d" && h.t !== "t") continue;
    if (R.single && h.v !== 1) continue;
    if (occupied(g, to) && !(R.occ || (g.passAll && !R.foreign))) continue;
    const bl = blockadeBetween(g, from, to);
    if (bl && !(R.bl || (R.bl1 && bl.v === 1 && bl.t !== "d"))) continue;
    out.push(to);
  }
  return out;
}
function startSteps(c, st) {
  const g = c.g;
  st.left = STEP[st.kind].n;
  g.steps = st;
  if (!stepTargets(g, st).length) finishSteps(c);
}
function doStep(c, pid, to) {
  const g = c.g, st = g.steps;
  if (!st || st.mover !== pid) return;
  if (!stepTargets(g, st).includes(to)) return "そのマスには動かせません";
  const p = g.P[st.owner], from = p.pieces[st.piece];
  const bl = blockadeBetween(g, from, to);
  if (bl) takeBlockade(c, st.owner, bl);
  if (STEP[st.kind].foreign) { p.pieces[st.piece] = to; log(g, `${nm(c, pid)} が ${nm(c, st.owner)} のコマを動かした`); }
  else enter(c, st.owner, st.piece, to);
  st.left--; st.moved = true;
  if (st.left <= 0 || p.done[st.piece] || !stepTargets(g, st).length) finishSteps(c);
  pump(c);
}
function finishSteps(c) {
  const g = c.g, st = g.steps;
  g.steps = null;
  if (!st) return;
  if (!STEP[st.kind].foreign && st.moved) stopAt(c, st.owner, st.piece);
  if (st.then) g.q.unshift(...st.then);
}
// 順番待ちの処理(呪いを1枚ずつ・ほかの人が動かす番など)。入力待ちになったら止まる
function pump(c) {
  const g = c.g;
  let guard = 0;
  while (!g.pending && !g.steps && g.q.length && g.step === "play" && guard++ < 200) {
    const t = g.q.shift();
    if (t.t === "curse") drawCurse(c, t.pid, t.piece);
    else if (t.t === "steps") { if (g.P[t.owner] && !g.P[t.owner].done[t.piece]) startSteps(c, t); }
  }
  arm(c);
}

// ---------------------------------------------------------------
// 呪い
// ---------------------------------------------------------------
function drawCurse(c, id, piece) {
  const g = c.g, p = g.P[id];
  if (!p) return;
  if (!g.curses.length) { g.curses = shuffle(g.curseBox); g.curseBox = []; }
  const cu = g.curses.shift();
  if (!cu) return;
  // 呪いよけを持っていれば、見てから無効にするか決められる
  if (p.tokens.some((x) => x.k === "protect") && !curse(p, "cavefever")) { g.pending = { type: "protect", pid: id, curse: cu, piece }; return; }
  applyCurse(c, id, cu, piece);
}
function applyCurse(c, id, cu, piece) {
  const g = c.g, p = g.P[id], d = CURSES[cu.k];
  log(g, `${nm(c, id)} に呪い「${d.name}」`);
  if (d.keep) { p.curses.push(cu); return; }
  g.curseBox.push(cu);
  if (cu.k === "torment") { if (g.demons > 0) { g.demons--; p.discard.push({ id: ++g.uid, k: "demon" }); } }
  else if (cu.k === "voodoo") {
    const left = g.order[(g.order.indexOf(id) + 1) % g.order.length];
    if (left && left !== id && piece != null && !p.done[piece]) g.q.unshift({ t: "steps", kind: "voodoo", mover: left, owner: id, piece });
  } else if (cu.k === "paralysis") {
    const i0 = g.order.indexOf(id), tasks = [];
    for (let k = 1; k < g.order.length; k++) { const o = g.order[(i0 + k) % g.order.length]; g.P[o].pieces.forEach((_, pc) => { if (!g.P[o].done[pc]) tasks.push({ t: "steps", kind: "paralysis", mover: o, owner: o, piece: pc }); }); }
    g.q.unshift(...tasks);
  }
}
// 呪いを解く: 不調=その記号のパワー分を捨てる / 苦悩=紫1枚 / 不運=2枚 / 洞窟恐怖症=トークン1つを箱へ
function lift(c, id, m) {
  const g = c.g, p = g.P[id], cu = p.curses.find((x) => x.id === m.curse);
  if (!cu) return "その呪いはありません";
  const d = CURSES[cu.k];
  const ids = Array.isArray(m.cards) ? [...new Set(m.cards)].filter((x) => p.hand.some((y) => y.id === x)) : [];
  const toks = Array.isArray(m.tokens) ? [...new Set(m.tokens)].filter((x) => p.tokens.some((y) => y.id === x)) : [];
  const cards = ids.map((x) => p.hand.find((y) => y.id === x));
  if (d.sym) {
    const pw = cards.reduce((n, cd) => n + ((cardDef(cd).s || []).includes(d.sym) ? cardDef(cd).p : 0), 0)
      + toks.reduce((n, t) => n + (TOKENS[p.tokens.find((y) => y.id === t).k].s === d.sym ? TOKENS[p.tokens.find((y) => y.id === t).k].p : 0), 0);
    if (pw < d.need) return `${SYMJ[d.sym]}のパワーが${d.need}以上必要です(いま ${pw})`;
  } else if (cu.k === "misery") { if (cards.length !== 1 || !cardDef(cards[0]).a || toks.length) return "紫のカードを1枚選んでください"; }
  else if (cu.k === "misfortune") { if (cards.length !== 2 || toks.length) return "手札を2枚選んでください"; }
  else if (cu.k === "cavefever") { if (toks.length !== 1 || cards.length) return "洞窟トークンを1つ選んでください"; }
  endMove(c);
  for (const x of ids) playFromHand(g, id, x, false);
  for (const t of toks) { const i = p.tokens.findIndex((y) => y.id === t); g.tokBox.push(...p.tokens.splice(i, 1)); }
  p.curses.splice(p.curses.indexOf(cu), 1); g.curseBox.push(cu);
  log(g, `${nm(c, id)} が呪い「${d.name}」を解いた`);
  pump(c);
}

// ---------------------------------------------------------------
// 購入・アクション・洞窟トークン
// ---------------------------------------------------------------
function buy(c, id, m, free) {
  const g = c.g, p = g.P[id], k = m.k, d = CARDS[k];
  if (!d || !d.cost) return "買えないカードです";
  const slot = g.market.findIndex((s) => s && s.k === k);
  const hole = g.market.findIndex((s) => !s);
  const access = !free && m.access != null ? p.tokens.find((x) => x.id === m.access && x.k === "market") : null;
  if (slot < 0) {
    if (!g.reserve[k]) return "売り切れです";
    if (hole < 0 && !free && !access) return "市場に空きがないので、市場の外のカードは買えません";
  }
  if (!free) {
    if (g.bought) return "カードを買えるのは1ターンに1枚です";
    const ids = Array.isArray(m.cards) ? [...new Set(m.cards)] : [];
    const toks = Array.isArray(m.tokens) ? [...new Set(m.tokens)] : [];
    if (ids.length) { const e = canPlayCards(p); if (e) return e; }
    if (toks.length || access) { const e = canPlayToken(p); if (e) return e; }
    if (!ids.every((x) => p.hand.some((y) => y.id === x))) return "手札のカードで払ってください";
    if (!toks.every((x) => p.tokens.some((y) => y.id === x && TOKENS[y.k].s === "v"))) return "コインの洞窟トークンだけ使えます";
    if (toks.length && symBlocked(p, "v")) return "不調の呪い: コインが使えません";
    const boost = m.boost != null ? ids.find((x) => x === m.boost && cardDef(p.hand.find((y) => y.id === x)).boost) : null;
    const total = ids.reduce((n, x) => n + coinOf(g, p, p.hand.find((y) => y.id === x), x === boost), 0) + toks.reduce((n, x) => n + TOKENS[p.tokens.find((y) => y.id === x).k].p, 0);
    if (total < d.cost) return `コインが足りません(${total} / ${d.cost})`;
    endMove(c);
    // コインとして効果を使ったアイテム(宝箱・プロペラ機)は除外。0.5 として使ったものは場へ
    for (const x of ids) {
      const card = p.hand.find((y) => y.id === x), cd = cardDef(card);
      if (x === boost) { p.hand.splice(p.hand.indexOf(card), 1); removeCard(g, id, card); continue; }
      playFromHand(g, id, x, cd.once && cd.s && cd.s.includes("v"));
      if (g.changeCard === x) { g.change = false; g.changeCard = null; }
    }
    for (const x of toks) useToken(g, id, x);
    if (access) useToken(g, id, access.id);
    g.bought = true;
  }
  // 市場から1枚減らす。市場の外から買ったら、その山を空きに置く(市場への道を使ったときは置かない)
  if (slot >= 0) { g.market[slot].n--; if (!g.market[slot].n) g.market[slot] = null; }
  else {
    g.reserve[k]--; const left = g.reserve[k]; delete g.reserve[k];
    if (hole >= 0 && !access) { if (left) g.market[hole] = { k, n: left }; } else if (left) g.reserve[k] = left;
  }
  p.discard.push({ id: ++g.uid, k });
  log(g, `${nm(c, id)} が ${d.name} を${free ? "電信機でもらった" : "買った"}`);
  pump(c);
}
function takeSupplyToken(c, id) {
  const g = c.g;
  if (!g.supply.length) { g.supply = shuffle(g.tokBox); g.tokBox = []; }
  const t = g.supply.shift();
  if (t) { g.P[id].tokens.push(t); log(g, `${nm(c, id)} が洞窟トークン「${TOKENS[t.k].name}」をもらった`); }
}
function action(c, id, m) {
  const g = c.g, p = g.P[id], card = p.hand.find((x) => x.id === m.card);
  if (!card || !cardDef(card).a) return "アクションカードを選んでください";
  const e0 = canPlayAction(p); if (e0) return e0;
  const k = card.k;
  const MOVE = { native: 1, shaman: 1, geologist: 1, isabella: 1, nathan: 1, gertrude: 1 };
  if (MOVE[k]) {
    const e = movable(g); if (e) return e;
    const piece = pieceAt(g, id, m.piece); if (piece < 0) return "動かせるコマがありません";
    // 行き先を指定して使うとき(1マスだけのカード)は、先に行けるか確かめる
    if (m.to != null && !stepTargets(g, { kind: k, mover: id, owner: id, piece }).includes(m.to)) return "そのマスには進めません";
    endMove(c);
    playFromHand(g, id, card.id, true); // ガートルードは1回限りなのでここで除外される
    log(g, `${nm(c, id)} が ${CARDS[k].name} を使った`);
    startSteps(c, { kind: k, mover: id, owner: id, piece, then: k === "shaman" ? [{ t: "curse", pid: id, piece }] : null });
    if (m.to != null && g.steps) doStep(c, id, m.to);
    pump(c);
    return;
  }
  if (k === "transmitter") { if (!m.k) return "もらうカードを選んでください"; const e = buy(c, id, { k: m.k }, true); if (e) return e; }
  if (k === "henry") {
    const s = g.market.findIndex((x) => x && x.k === m.k);
    if (s < 0) return "市場(ボードの上)のカードを選んでください";
    g.market[s].n--; const kk = g.market[s].k; if (!g.market[s].n) g.market[s] = null;
    p.deck.push({ id: ++g.uid, k: kk });
    log(g, `${nm(c, id)} が ${CARDS[kk].name} を山札の上に置いた`);
  }
  if (k === "lara") {
    const tasks = [];
    for (const o of g.order) if (o !== id) g.P[o].pieces.forEach((_, pc) => { if (!g.P[o].done[pc]) tasks.push({ t: "steps", kind: "lara", mover: id, owner: o, piece: pc }); });
    g.q.unshift(...tasks);
  }
  endMove(c);
  playFromHand(g, id, card.id, true);
  if (k === "cartographer") draw(g, id, 2);
  if (k === "compass") draw(g, id, 3);
  if (k === "scientist") { draw(g, id, 1); g.pending = { type: "trash", pid: id, max: 1, title: "科学者: 手札から1枚ゲームから除外してよい" }; }
  if (k === "travellog") { draw(g, id, 2); g.pending = { type: "trash", pid: id, max: 2, title: "探検記録: 手札から2枚までゲームから除外してよい" }; }
  if (k === "caveexp") takeSupplyToken(c, id);
  if (k === "magellan") { takeSupplyToken(c, id); g.keepToken = true; }
  log(g, `${nm(c, id)} が ${CARDS[k].name} を使った`);
  pump(c);
}
// 洞窟トークン(記号のトークンは移動・購入で使う)
function token(c, id, m) {
  const g = c.g, p = g.P[id], t = p.tokens.find((x) => x.id === m.id);
  if (!t) return "その洞窟トークンはありません";
  const e0 = canPlayToken(p); if (e0) return e0;
  const k = t.k;
  if (TOKENS[k].s) return "記号のトークンは、進むときか買うときに選びます";
  if (k === "protect") return "呪いよけは、呪いを引いたときに使えます";
  if (k === "market") return "市場への道は、買うときに使います";
  if (k === "native" || k === "geostep") {
    const e = movable(g); if (e) return e;
    const piece = pieceAt(g, id, m.piece); if (piece < 0) return "動かせるコマがありません";
    const st = { kind: k === "native" ? "native" : "geologist", mover: id, owner: id, piece, left: 1 };
    if (m.to == null || !stepTargets(g, st).includes(m.to)) return "進むマス(となり)を選んでください";
    endMove(c); useToken(g, id, t.id);
    startSteps(c, st); doStep(c, id, m.to);
    return;
  }
  if (k === "trash") {
    const card = p.hand.find((x) => x.id === m.card); if (!card) return "除外する手札を選んでください";
    useToken(g, id, t.id); p.hand.splice(p.hand.indexOf(card), 1); removeCard(g, id, card);
    log(g, `${nm(c, id)} が手札1枚をゲームから除外`);
  } else if (k === "swap") {
    const ids = Array.isArray(m.cards) ? [...new Set(m.cards)].filter((x) => p.hand.some((y) => y.id === x)) : [];
    if (ids.length < 1 || ids.length > 4) return "入れ替える手札を1〜4枚選んでください";
    endMove(c); useToken(g, id, t.id);
    for (const x of ids) playFromHand(g, id, x, false);
    draw(g, id, ids.length);
  } else if (k === "draw") { useToken(g, id, t.id); draw(g, id, 1); }
  else if (k === "keep") {
    const i = p.gone.findIndex((x) => x.id === g.lastItem);
    if (i < 0) return "直前に効果を使った1回限りのカードがありません";
    useToken(g, id, t.id); p.played.push(...p.gone.splice(i, 1)); g.lastItem = null;
  } else if (k === "pass") { useToken(g, id, t.id); g.passAll = true; }
  else if (k === "change") { useToken(g, id, t.id); g.change = true; g.changeCard = m.card != null ? m.card : null; }
  else if (k === "banish") {
    const card = p.hand.find((x) => x.id === m.card && cardDef(x).demon); if (!card) return "手札の魔物カードを選んでください";
    if (!g.P[m.target] || m.target === id) return "渡す相手を選んでください";
    useToken(g, id, t.id); p.hand.splice(p.hand.indexOf(card), 1); g.P[m.target].discard.push(card);
    log(g, `${nm(c, id)} が魔物カードを ${nm(c, m.target)} の捨て札へ`);
  }
  if (k !== "banish" && k !== "trash") log(g, `${nm(c, id)} が洞窟トークン「${TOKENS[k].name}」を使った`);
  pump(c);
}
function trash(c, id, ids) {
  const g = c.g, p = g.P[id], pd = g.pending;
  if (!pd || pd.pid !== id || pd.type !== "trash") return;
  const list = (Array.isArray(ids) ? [...new Set(ids)] : []).filter((x) => p.hand.some((y) => y.id === x && (!pd.only || cardDef(y).demon))).slice(0, pd.max);
  for (const x of list) { const card = p.hand.splice(p.hand.findIndex((y) => y.id === x), 1)[0]; removeCard(g, id, card); }
  if (list.length) log(g, `${nm(c, id)} が手札を${list.length}枚ゲームから除外`);
  g.pending = null;
  pump(c);
}
function chooseHero(c, id, k) {
  const g = c.g, pd = g.pending;
  if (!pd || pd.type !== "hero" || pd.pid !== id) return;
  const pick = pd.opts.includes(k) ? k : pd.opts[0];
  g.P[id].hand.push({ id: ++g.uid, k: pick });
  g.heroes.push(...pd.opts.filter((x) => x !== pick)); shuffle(g.heroes);
  g.pending = null;
  log(g, `${nm(c, id)} が英雄 ${CARDS[pick].name} を仲間にした`);
  pump(c);
}
function protect(c, id, yes) {
  const g = c.g, pd = g.pending;
  if (!pd || pd.type !== "protect" || pd.pid !== id) return;
  g.pending = null;
  const p = g.P[id];
  if (yes) {
    const t = p.tokens.find((x) => x.k === "protect");
    useToken(g, id, t.id); g.curseBox.push(pd.curse);
    log(g, `${nm(c, id)} が呪いよけで「${CURSES[pd.curse.k].name}」を防いだ`);
  } else applyCurse(c, id, pd.curse, pd.piece);
  pump(c);
}

// ---------------------------------------------------------------
// ターンの終わり・ゲームの終わり
// ---------------------------------------------------------------
function endTurn(c, id, keepIds, force) {
  const g = c.g, p = g.P[id];
  // 止まったことで洞窟・酒場が起きたら、先にそれを済ませてもらう(時間切れのときは自動で)
  endMove(c); pump(c);
  if (g.pending || g.steps || g.q.length) { if (!force) return; autoResolve(c); }
  if (g.step !== "play" || curId(g) !== id) return;
  p.discard.push(...p.played); p.played = [];
  const keep = new Set(Array.isArray(keepIds) ? keepIds : p.hand.map((x) => x.id));
  p.discard.push(...p.hand.filter((x) => !keep.has(x.id)));
  p.hand = p.hand.filter((x) => keep.has(x.id));
  draw(g, id, HAND - p.hand.length);
  Object.assign(g, { bought: false, change: false, changeCard: null, passAll: false, lastItem: null, keepToken: false });
  if (g.finalRound && g.cur >= g.endIdx) return finish(c);
  g.cur = (g.cur + 1) % g.order.length;
  if (g.cur === 0) g.turnNo++;
  arm(c);
}
// 入力待ちを自動で片づける(時間切れ・切断・ターン終了時)
function autoResolve(c) {
  const g = c.g;
  for (let guard = 0; guard < 300 && g.step === "play" && (g.pending || g.steps || g.q.length); guard++) {
    if (g.pending) {
      const pd = g.pending;
      if (pd.type === "trash") trash(c, pd.pid, []);
      else if (pd.type === "hero") chooseHero(c, pd.pid, pd.opts[0]);
      else if (pd.type === "protect") protect(c, pd.pid, true);
      else g.pending = null;
    } else if (g.steps) {
      const st = g.steps, R = STEP[st.kind];
      if (!R.must) { finishSteps(c); pump(c); continue; }
      // ほかの人を動かす(必ず動かす)ときは、ゴールから遠ざける
      const opts = stepTargets(g, st);
      if (!opts.length) { finishSteps(c); pump(c); continue; }
      opts.sort((a, b) => distance(g, b) - distance(g, a));
      doStep(c, st.mover, opts[0]);
    } else pump(c);
  }
}
// ゴールまでの近さ(着かなかった人の順位用): 入れるマスをたどった歩数
function distance(g, from) {
  const hex = g.course.hex, seen = new Set([from]), q = [[from, 0]];
  while (q.length) {
    const [k, d] = q.shift();
    if (hex[k].t === "g") return d;
    for (const n of neighbors(g, k)) if (hex[n] && !seen.has(n) && hex[n].t !== "m" && hex[n].t !== "s") { seen.add(n); q.push([n, d + 1]); }
  }
  return 999;
}
function finish(c) {
  const g = c.g;
  g.step = "end"; c.clearTimer();
  const score = (id) => {
    const p = g.P[id], arrived = p.done.every(Boolean);
    const dist = p.pieces.reduce((n, k, i) => n + (p.done[i] ? 0 : distance(g, k)), 0);
    return { id, arrived, nb: p.blockades.length, top: Math.max(0, ...p.blockades), dist };
  };
  const rows = g.order.map(score).sort((a, b) => (b.arrived - a.arrived) || (b.nb - a.nb) || (b.top - a.top) || (a.dist - b.dist));
  g.result = rows;
  const raw = {};
  rows.forEach((r, i) => { raw[r.id] = 100 - i; });
  // 同じ条件(着いた・バリケード数・最大番号が同じ)は同順位
  rows.forEach((r, i) => { if (i && r.arrived && rows[i - 1].arrived && r.nb === rows[i - 1].nb && r.top === rows[i - 1].top) raw[r.id] = raw[rows[i - 1].id]; });
  log(g, rows[0].arrived ? `🏆 ${nm(c, rows[0].id)} の勝ち！` : "ゲーム終了");
  c.finish(raw);
}
// 持ち時間: 手番の人(時間切れはターン終了。手札は残す)。ほかの人の入力待ちは20秒(切断中も20秒)
function arm(c) {
  const g = c.g;
  if (g.step !== "play") return c.clearTimer();
  const waitFor = g.pending ? g.pending.pid : g.steps ? g.steps.mover : curId(g);
  const away = !c.live().includes(waitFor);
  const other = waitFor !== curId(g);
  const ms = away || other ? 20000 : g.cfg.turnSecs * 1000;
  // 手番の人の持ち時間は、手番のあいだ1回だけ。ほかの人の入力待ちは、そのたびに20秒
  const key = away || other ? [g.turnNo, g.cur, waitFor, g.pending ? g.pending.type : "", g.steps ? g.steps.kind + g.steps.left : "", g.q.length].join(":") : g.turnNo + ":" + g.cur;
  if (g.armKey === key && g.armed) return;
  g.armKey = key; g.armed = !!ms;
  if (!ms) return c.clearTimer();
  c.setTimer(ms, () => {
    g.armed = false;
    if (g.step !== "play") return;
    if (other || away) {
      autoResolve(c);
      if (other) { g.armKey = null; arm(c); return; }
    }
    const id = curId(g);
    log(g, `${nm(c, id)} は時間切れ`);
    endTurn(c, id, undefined, true);
  });
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step !== "play") return;
  // ほかの人への入力待ち(呪いよけ・英雄選び・除外・コマを動かす)
  if (g.pending) {
    if (g.pending.pid !== pid) return "ほかの人の選択を待っています";
    if (m.a === "trash") return trash(c, pid, m.ids);
    if (m.a === "hero") return chooseHero(c, pid, m.k);
    if (m.a === "protect") return protect(c, pid, !!m.yes);
    return "先に表示中の選択をしてください";
  }
  if (g.steps) {
    if (g.steps.mover !== pid) return "ほかの人がコマを動かしています";
    if (m.a === "step") return doStep(c, pid, m.to);
    if (m.a === "stepDone") {
      if (STEP[g.steps.kind].must && stepTargets(g, g.steps).length) return "動かせるマスがあるときは動かしてください";
      finishSteps(c); pump(c); return;
    }
    return "先にコマの移動を終えてください";
  }
  if (curId(g) !== pid) return "あなたの番ではありません";
  switch (m.a) {
    case "move": return moveWithCard(c, pid, m);
    case "enterCards": return enterWithCards(c, pid, m);
    case "demon": return enterDemon(c, pid, m);
    case "blockade": return breakBlockade(c, pid, m);
    case "buy": return buy(c, pid, m, false);
    case "action": return action(c, pid, m);
    case "token": return token(c, pid, m);
    case "lift": return lift(c, pid, m);
    case "stop": endMove(c); pump(c); return;
    case "end": return endTurn(c, pid, m.keep, false);
    default: return;
  }
}
function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step !== "play" || !g.P[pid]) return;
  // 抜けた人のコマは盤から外し、順番からも外す
  if ((g.pending && g.pending.pid === pid) || (g.steps && (g.steps.mover === pid || g.steps.owner === pid))) { g.pending = null; g.steps = null; }
  g.q = g.q.filter((t) => t.pid !== pid && t.mover !== pid && t.owner !== pid);
  const i = g.order.indexOf(pid), wasCur = g.cur === i;
  log(g, `${nm(c, pid)} が抜けた`);
  delete g.P[pid]; g.order.splice(i, 1);
  if (g.order.length < 1) return;
  if (g.cur > i) g.cur--;
  if (g.cur >= g.order.length) { g.cur = 0; g.turnNo++; }
  if (g.endIdx != null) g.endIdx = Math.min(g.endIdx, g.order.length - 1);
  if (wasCur) Object.assign(g, { move: null, pending: null, steps: null, q: [], bought: false, change: false, passAll: false });
  arm(c);
}

function view(c, me) {
  const g = c.g, mine = g.P[me];
  const hexes = Object.entries(g.course.hex).map(([k, h]) => [k, h.t, h.v, h.sym || null, h.tile, h.cave ? (g.caveTok[k] || []).length : null, h.tavern ? 1 : 0]);
  const pub = (id) => { const p = g.P[id]; return { pieces: p.pieces, done: p.done, deck: p.deck.length, discard: p.discard.length, hand: p.hand.length, played: p.played.map((x) => x.k), removed: p.gone.length, blockades: p.blockades, deckSize: p.deck.length + p.discard.length + p.hand.length + p.played.length, tokens: p.tokens.map((t) => t.k), curses: p.curses.map((x) => ({ id: x.id, k: x.k })), hero: p.hero }; };
  const pd = g.pending;
  return {
    step: g.step, cfg: g.cfg, course: { id: g.course.id, name: g.course.name, endSym: g.course.endSym }, hexes,
    blockades: g.course.blockades.map((b) => ({ n: b.n, t: b.t, v: b.v, a: b.a, b: b.b, by: b.by })),
    order: g.order, cur: curId(g), turnNo: g.turnNo, finalRound: g.finalRound,
    P: Object.fromEntries(g.order.map((id) => [id, pub(id)])),
    hand: mine ? mine.hand : null, tokens: mine ? mine.tokens : null, myDeck: mine ? [...mine.deck, ...mine.discard, ...mine.hand, ...mine.played].map((x) => x.k) : null,
    market: g.market, reserve: g.reserve, bought: g.bought, change: g.change, passAll: g.passAll, keepToken: g.keepToken, lastItem: !!g.lastItem && curId(g) === me,
    move: g.move && curId(g) === me ? g.move : g.move ? { k: g.move.k, left: g.move.left, fixed: g.move.fixed } : null,
    steps: g.steps ? { kind: g.steps.kind, mover: g.steps.mover, owner: g.steps.owner, piece: g.steps.piece, left: g.steps.left, targets: g.steps.mover === me ? stepTargets(g, g.steps) : [] } : null,
    pending: pd ? (pd.pid === me ? { type: pd.type, max: pd.max, only: pd.only, title: pd.title, opts: pd.opts, curse: pd.curse && pd.curse.k } : { type: pd.type, pid: pd.pid }) : null,
    supply: g.supply.length, demons: g.demons, heroes: g.heroes.length, cursesLeft: g.curses.length,
    result: g.result, log: g.log.slice(-14),
  };
}

module.exports = { start, handle, view, onLeave, normalize, DEFAULTS, CARDS, COURSES, BOARDS, TOKENS, CURSES, MARKET0, RESERVE0, RESERVE_HH, _t: { buildCourse, distance, coinOf, blockadeBetween, stepTargets, neighbors, autoResolve } };
