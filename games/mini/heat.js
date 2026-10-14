"use strict";
// ヒート(Heat: Pedal to the Metal 風)のルール本体。部屋・入室は games/heat.js が受け持つ。
// 出典: 本家の基本ルールブック・上級ルールブック(英語版)、拡張 Heavy Rain / Tunnel Vision のルールブック(英語版)、
//       Board Game Arena の遊び方ページと画面の画像。
//   デッキ: スピードカード1〜4を各3枚・スタートアップグレード(0・5・ヒート1枚)・ストレス。エンジンにヒート。
//   ラウンド: ①ギアを変える(±1、±2はヒート1) ②ギアの数だけカードを伏せる(ここまで全員同時)
//   ③先頭の車から順に公開して進む ④最後尾(5台以上なら後ろ2台)はアドレナリン(+1マス・クールダウン+1)
//   ⑤リアクト(クールダウン: 1速3・2速1 / ブースト: ヒート1でめくって進む、1ターン1回 / アップグレードの記号)
//   ⑥スリップストリーム(横か1マス前に車がいれば+2マス) ⑦コーナー(速度が制限を超えた分ヒートを払う。払えないとスピン)
//   ⑧捨て札(ストレス・ヒート・5は捨てられない) ⑨7枚まで引く。
// モジュール(設定で選ぶ):
//   ガレージ: スタートアップグレードの代わりに、アップグレードカードを3巡のドラフトで3枚選ぶ
//   天候と路面: 天候トークン1枚(準備の変更と、天候区間の効果)・コーナーごとに路面トークン1枚
// コース: 盤面画像から読み取った8コース。cells は盤(1650×1100)上の各マスの中心。
//   index 0 はゴールラインのすぐ先のマス。corners[].at はコーナーラインの先の最初のマス。
//   flood = 水たまりのマス(Heavy Rain)、tunnel = トンネルのマス(Tunnel Vision)、chicanes = シケインになっている2本のコーナー(at の組)

const TRACKS = {
  usa: {
    name: "USA", laps: 2, heat: 6, stress: 3, n: 69,
    corners: [{ at: 12, lim: 4, x: 1524, y: 925 }, { at: 33, lim: 3, x: 160, y: 989 }, { at: 49, lim: 3, x: 771, y: 105 }, { at: 57, lim: 2, x: 610, y: 628 }],
    cells: "1277,216 1343,235 1402,278 1447,335 1476,400 1499,468 1517,537 1535,607 1548,678 1558,751 1560,826 1540,894 1503,949 1450,986 1389,1002 1324,1004 1256,1002 1189,1002 1121,1000 1054,998 986,999 920,1003 852,1006 785,1007 716,1007 650,1003 583,1000 515,999 447,1000 380,1003 315,1011 250,1018 187,1006 139,958 134,884 180,827 253,809 321,782 381,735 422,673 447,604 469,532 491,461 515,392 543,323 576,257 617,193 665,135 732,104 806,122 842,188 827,264 783,328 740,393 701,459 660,526 620,592 627,659 694,681 745,632 783,569 824,508 866,448 909,389 957,331 1006,276 1064,230 1131,205 1207,203",
  },
  italia: {
    name: "Italia", laps: 3, heat: 6, stress: 3, n: 54,
    corners: [{ at: 10, lim: 5, x: 967, y: 981 }, { at: 19, lim: 2, x: 710, y: 445 }, { at: 26, lim: 3, x: 667, y: 938 }],
    cells: "1322,476 1326,546 1321,617 1302,684 1264,742 1214,792 1161,836 1111,886 1058,934 1000,973 930,980 866,950 828,890 812,820 796,751 778,682 762,612 745,544 727,475 668,441 606,486 620,571 641,653 664,735 688,816 686,900 637,956 568,960 509,922 483,857 465,788 449,718 434,649 423,581 418,511 390,451 389,377 408,309 442,247 492,193 547,147 608,115 676,96 748,86 822,83 898,85 970,94 1040,109 1105,136 1163,176 1212,227 1251,287 1282,349 1311,412",
  },
  france: {
    name: "France", laps: 2, heat: 6, stress: 3, n: 60,
    corners: [{ at: 12, lim: 5, x: 171, y: 490 }, { at: 20, lim: 2, x: 655, y: 172 }, { at: 27, lim: 4, x: 537, y: 637 }, { at: 39, lim: 3, x: 1045, y: 139 }, { at: 47, lim: 4, x: 1492, y: 479 }],
    cells: "791,959 721,947 654,930 589,906 527,875 470,835 416,787 366,732 324,676 278,621 221,579 180,524 175,450 210,382 277,346 353,328 426,306 498,281 565,244 621,189 692,184 723,253 674,318 620,380 573,446 536,517 528,598 558,667 622,704 696,704 763,673 823,630 879,576 926,518 963,454 993,387 1008,314 1001,238 1020,167 1081,125 1158,137 1202,201 1221,278 1255,348 1315,400 1390,420 1462,450 1504,511 1507,582 1478,645 1421,688 1366,735 1311,781 1257,827 1199,867 1137,900 1073,926 1006,946 937,958 864,963",
  },
  gb: {
    name: "Great Britain", laps: 2, heat: 6, stress: 3, n: 63,
    corners: [{ at: 15, lim: 10, x: 1466, y: 111 }, { at: 30, lim: 6, x: 1196, y: 988 }, { at: 37, lim: 5, x: 1158, y: 517 }, { at: 43, lim: 4, x: 720, y: 600 }, { at: 48, lim: 3, x: 981, y: 840 }],
    cells: "515,179 564,135 621,103 683,84 751,79 820,76 889,79 958,77 1027,80 1096,80 1167,80 1236,81 1305,77 1373,82 1437,96 1495,130 1539,187 1557,256 1560,330 1555,403 1542,473 1527,543 1511,612 1489,678 1463,743 1432,806 1395,858 1351,914 1297,963 1232,989 1159,977 1103,922 1085,847 1093,767 1119,695 1159,630 1169,554 1130,487 1052,473 981,510 911,547 828,551 750,572 709,640 729,717 801,756 881,776 954,812 979,878 932,930 861,907 793,877 726,846 659,814 594,777 532,733 485,672 453,605 435,532 430,455 441,379 462,307 481,235",
  },
  japan: {
    name: "Japan", laps: 2, heat: 7, stress: 3, n: 60, exp: "hr",
    corners: [{ at: 10, lim: 4, x: 1520, y: 679 }, { at: 12, lim: 4, x: 1384, y: 555 }, { at: 18, lim: 2, x: 1553, y: 139 }, { at: 45, lim: 5, x: 126, y: 815 }, { at: 53, lim: 3, x: 423, y: 254 }],
    flood: [5, 6, 7, 8, 9, 10, 39, 40, 41, 42, 43, 44, 49, 50, 51, 52, 53, 54, 55],
    chicanes: [[10, 12]],
    cells: "875,546 946,561 1016,584 1084,612 1149,646 1213,683 1280,712 1352,727 1425,726 1495,704 1514,629 1434,568 1351,527 1329,444 1351,361 1413,300 1481,246 1537,179 1552,100 1491,56 1413,67 1336,86 1259,105 1182,125 1106,149 1038,188 999,256 986,334 980,414 968,492 951,570 935,647 917,725 891,799 847,865 785,914 711,943 635,963 557,981 479,993 399,996 321,985 246,960 179,918 134,854 127,773 157,695 204,625 250,555 279,476 293,393 318,314 382,262 464,259 528,305 524,387 564,457 635,499 716,520 797,533",
  },
  mexico: {
    name: "Mexico", laps: 3, heat: 6, stress: 2, n: 60, exp: "hr",
    corners: [{ at: 14, lim: 7, x: 185, y: 433 }, { at: 19, lim: 7, x: 278, y: 96 }, { at: 38, lim: 6, x: 1528, y: 142 }, { at: 44, lim: 4, x: 1313, y: 544 }, { at: 50, lim: 2, x: 1546, y: 944 }, { at: 51, lim: 2, x: 1449, y: 953 }],
    chicanes: [[14, 19], [50, 51]],
    cells: "767,996 696,986 622,975 550,962 473,943 402,916 338,885 277,850 215,809 156,760 108,696 95,615 113,540 161,472 190,392 154,312 124,228 156,146 234,99 321,112 376,179 420,246 477,295 545,326 614,344 685,357 755,366 827,372 900,373 971,368 1046,353 1113,321 1169,276 1217,222 1266,162 1328,116 1410,97 1495,114 1544,192 1522,277 1478,339 1419,390 1358,438 1311,503 1341,580 1412,626 1472,673 1516,735 1541,802 1557,891 1499,963 1411,946 1335,958 1264,973 1198,984 1130,992 1053,1000 976,1005 905,1005 835,999",
  },
  espana: {
    name: "España", laps: 1, heat: 6, stress: 3, n: 109, exp: "tv",
    corners: [{ at: 11, lim: 5, x: 396, y: 931 }, { at: 15, lim: 4, x: 253, y: 640 }, { at: 29, lim: 4, x: 1113, y: 300 }, { at: 32, lim: 4, x: 912, y: 245 }, { at: 44, lim: 2, x: 67, y: 245 }, { at: 65, lim: 5, x: 1485, y: 161 }, { at: 85, lim: 2, x: 409, y: 712 }, { at: 92, lim: 3, x: 853, y: 774 }, { at: 95, lim: 4, x: 1097, y: 871 }, { at: 98, lim: 4, x: 1185, y: 653 }, { at: 103, lim: 3, x: 1487, y: 816 }],
    tunnel: [16, 17, 18, 19, 20, 21, 22, 23, 37, 38, 39, 40, 41, 46, 47, 48, 62, 63, 64, 65, 66, 67, 68, 69, 79, 80, 81, 82, 83, 84, 85, 86, 87],
    chicanes: [[29, 32], [95, 98]],
    cells: "1117,951 1048,953 979,955 910,956 841,957 772,958 703,959 634,959 565,958 496,955 428,943 355,912 293,851 258,770 242,683 272,609 328,563 396,534 467,520 540,511 613,505 686,501 759,497 832,488 904,476 976,466 1048,452 1104,407 1118,336 1099,261 1032,217 950,227 880,263 811,291 738,302 663,303 589,304 515,316 441,322 367,322 292,322 218,322 144,319 82,279 68,210 115,161 184,150 255,150 326,149 397,147 468,142 538,140 609,139 680,138 751,137 822,137 892,136 963,136 1034,135 1105,134 1176,133 1246,130 1317,127 1388,125 1456,140 1509,189 1540,255 1546,328 1527,399 1481,456 1422,500 1353,525 1280,533 1207,540 1134,547 1061,555 988,567 917,585 847,607 774,621 701,624 627,626 554,628 481,638 421,677 405,752 431,827 504,856 581,833 654,798 732,779 813,772 897,782 974,827 1053,870 1134,850 1152,770 1159,687 1216,623 1298,602 1376,636 1434,699 1475,775 1490,851 1456,910 1394,939 1325,948 1256,951 1186,951",
  },
  nederland: {
    name: "Nederland", laps: 3, heat: 6, stress: 3, n: 55, exp: "tv",
    corners: [{ at: 9, lim: 5, x: 109, y: 647 }, { at: 13, lim: 5, x: 337, y: 456 }, { at: 16, lim: 3, x: 338, y: 194 }, { at: 26, lim: 8, x: 969, y: 384 }, { at: 34, lim: 4, x: 1478, y: 148 }],
    chicanes: [[9, 13]],
    cells: "571,1000 501,984 433,960 376,917 320,873 259,836 202,791 147,745 112,683 118,609 162,544 232,509 306,480 357,414 344,324 319,236 365,174 432,165 496,188 559,216 621,245 683,274 745,303 807,332 870,359 935,381 1005,379 1071,350 1132,311 1192,270 1252,229 1311,187 1372,148 1443,139 1507,166 1544,223 1545,292 1523,357 1489,416 1452,474 1414,532 1376,590 1339,648 1302,705 1264,763 1220,816 1168,861 1111,899 1046,923 979,939 911,949 843,960 775,971 707,980 640,994",
  },
};
for (const t of Object.values(TRACKS)) {
  t.xy = t.cells.split(" ").map((p) => p.split(",").map(Number));
  t.flood = t.flood || []; t.tunnel = t.tunnel || []; t.chicanes = t.chicanes || [];
  // 路面トークンを置く単位(シケインは2本で1つ)。sectorStart = その単位のあとの区間が始まるマス
  const groups = [];
  for (const c of t.corners) {
    const ch = t.chicanes.find((p) => p.includes(c.at));
    if (ch && ch[0] !== c.at) continue;
    groups.push({ ats: ch ? ch.slice() : [c.at], lim: c.lim, x: c.x, y: c.y });
  }
  for (const gr of groups) gr.sectorStart = gr.ats[gr.ats.length - 1];
  t.groups = groups;
}

const HAND = 7, MAX_GEAR = 4;
const COOL_BY_GEAR = [0, 3, 1, 0, 0];
// 基本のカード: s1〜s4 スピード / u0・u5 スタートアップグレード / h ヒート / x ストレス
const CARDS = {
  s1: { v: 1, speed: true }, s2: { v: 2, speed: true }, s3: { v: 3, speed: true }, s4: { v: 4, speed: true },
  u0: { v: 0, up: true }, u5: { v: 5, up: true, keep: true }, h: { heat: true, keep: true }, x: { stress: true, keep: true },
};
// アップグレードカード(ガレージ)。BGA の画像の番号どおり。各2枚。
//   [分類, スピード(数か、選べる数の配列。なしは null), 記号]
//   記号: boost=＋(めくる) heat=ヒート(必須) scrap=スクラップ(必須) adjust=制限速度の増減(必須)
//         cool=クールダウン reduce=ストレスを捨てる slip=スリップストリーム+ salvage=捨て札から戻す refresh=山札の上に戻せる
//         direct=手札から直接出せる accel=めくった枚数ぶん加速 superCool=捨て札のヒートをエンジンへ draft=ドラフト移動
// 1〜17 が基本(17はヒート)、18〜48 が上級(48はヒート)、49〜54 は Heavy Rain、55〜60 は Tunnel Vision。
const UPG = {
  1: ["4wd", 4, { boost: 1 }], 2: ["4wd", null, { boost: 3 }], 3: ["4wd", null, { boost: 1, cool: 3 }],
  4: ["body", 3, { reduce: 2 }], 5: ["body", 5, { reduce: 1 }], 6: ["body", 1, { reduce: 3 }],
  7: ["brakes", [1, 2, 3, 4], { heat: 1 }], 8: ["brakes", [1, 3], {}], 9: ["brakes", [2, 4], {}], 10: ["brakes", [1, 5], {}],
  11: ["cooling", 6, { heat: 1, cool: 1 }], 12: ["cooling", 1, { cool: 2 }], 13: ["cooling", 3, { cool: 1 }],
  14: ["rpm", 1, { slip: 2 }], 15: ["rpm", 2, { slip: 2 }], 16: ["rpm", 3, { slip: 2 }],
  17: ["heat", null, {}],
  18: ["body", 6, { reduce: 3, heat: 1 }], 19: ["body", 2, { reduce: 1, cool: 1, scrap: 2 }], 20: ["body", 2, { reduce: 1, slip: 1 }],
  21: ["cooling", 4, { scrap: 2, cool: 1 }], 22: ["fuel", 2, { salvage: 2 }], 23: ["fuel", null, { boost: 1, salvage: 2, cool: 1 }],
  24: ["gas", 1, { direct: 1, scrap: 1 }], 25: ["gas", 2, { direct: 1, scrap: 2 }], 26: ["gas", 3, { direct: 1, scrap: 3 }],
  27: ["gas", 4, { direct: 1, heat: 1, cool: 1 }], 28: ["gas", 1, { direct: 1, accel: 1, scrap: 1 }],
  29: ["rpm", null, { boost: 1, slip: 3 }], 30: ["rpm", 1, { heat: 1, slip: 3 }], 31: ["rpm", [1, 2], { slip: 1 }],
  32: ["susp", 2, { refresh: 1, reduce: 1 }], 33: ["susp", 2, { refresh: 1, cool: 1 }], 34: ["susp", 4, { refresh: 1 }], 35: ["susp", 1, { refresh: 1, slip: 1 }],
  36: ["tires", 2, { adjust: -1, cool: 3 }], 37: ["tires", 1, { scrap: 2, adjust: 1 }], 38: ["tires", 2, { scrap: 2, adjust: 1 }],
  39: ["tires", 3, { adjust: -1, cool: 2 }], 40: ["tires", null, { boost: 1, adjust: 1, slip: 1, cool: 1 }], 41: ["tires", null, { boost: 2, adjust: 2 }],
  42: ["turbo", 7, { heat: 2, cool: 1 }], 43: ["turbo", 8, { heat: 1, scrap: 6 }],
  44: ["wings", 4, { heat: 1, scrap: 2, adjust: 2 }], 45: ["wings", 3, { heat: 1, scrap: 2, adjust: 2 }], 46: ["wings", 6, { heat: 2, adjust: 3 }],
  47: ["4wd", null, { boost: 1, accel: 1 }], 48: ["heat", null, {}],
  49: ["air", 1, { superCool: 1, salvage: 4, adjust: -1 }], 50: ["air", 0, { superCool: 1, slip: 1, reduce: 1 }], 51: ["air", 1, { superCool: 1, cool: 1, scrap: 1 }],
  52: ["air", 3, { superCool: 1, scrap: 3 }], 53: ["air", 4, { superCool: 1, scrap: 4 }], 54: ["air", null, { boost: 1, superCool: 1, refresh: 1, adjust: -1 }],
  55: ["fwing", null, { boost: 1, draft: 3 }], 56: ["fwing", 0, { draft: 1, direct: 1, refresh: 1, scrap: 1 }], 57: ["fwing", 2, { draft: 2, salvage: 2, scrap: 5 }],
  58: ["fwing", 3, { draft: 1, adjust: 1, scrap: 3 }], 59: ["fwing", 4, { draft: 1, refresh: 1, scrap: 4 }], 60: ["fwing", 6, { draft: 2, heat: 1 }],
};
const CAT = { "4wd": "四輪駆動", body: "ボディ", brakes: "ブレーキ", cooling: "冷却装置", rpm: "R.P.M.", fuel: "燃料", gas: "アクセル", susp: "サスペンション", tires: "タイヤ", turbo: "ターボ", wings: "ウイング", air: "エアインテーク", fwing: "フロントウイング", heat: "ヒート" };
for (const [n, [cat, v, sym]] of Object.entries(UPG)) {
  if (cat === "heat") continue; // ヒートのアップグレードは、ふつうのヒートカード(h)としてデッキに入る
  CARDS["g" + n] = { up: true, upg: Number(n), cat, name: CAT[cat], v: Array.isArray(v) ? null : v || 0, choices: Array.isArray(v) ? v : null, plus: v === null, sym };
}
const POOL = { basic: range(1, 17), advanced: range(18, 48).concat(range(49, 60)), all: range(1, 60) };
function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

// 天候トークン(準備の変更 / 天候区間の効果)
const WEATHER = [
  { setup: "ストレスを1枚減らす", eff: "nocool", effName: "クールダウン禁止" },
  { setup: "エンジンのヒート+1", eff: "noslip", effName: "スリップストリーム開始禁止" },
  { setup: "ストレスを1枚増やす", eff: "slip2", effName: "スリップストリーム+2" },
  { setup: "エンジンのヒート-1", eff: "cool1", effName: "クールダウン+1" },
  { setup: "ヒート3枚を山札に混ぜる", eff: "cool1", effName: "クールダウン+1" },
  { setup: "ヒート3枚を捨て札に置く", eff: "slip2", effName: "スリップストリーム+2" },
];
// 路面トークン(12枚。種類ごとの枚数は資料がなく各2枚と推定)
const ROAD = [
  { k: "weather", name: "天候", sector: true },
  { k: "overheat", name: "オーバーヒート(超過のヒート+1)" },
  { k: "limDown", name: "制限速度-1" },
  { k: "limUp", name: "制限速度+1" },
  { k: "heatCtl", name: "ヒートなしでブースト", sector: true },
  { k: "slip1", name: "スリップストリーム+1", sector: true },
];

const DEFAULTS = { track: "usa", laps: 0, planSecs: 60, turnSecs: 45, garage: "off", weather: false };
function normalize(raw) {
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  return {
    track: pick(raw.track, Object.keys(TRACKS), DEFAULTS.track),
    laps: pick(Number(raw.laps), [0, 1, 2, 3], DEFAULTS.laps), // 0 = 盤に書かれた周回数
    planSecs: pick(Number(raw.planSecs), [30, 45, 60, 90, 120], DEFAULTS.planSecs),
    turnSecs: pick(Number(raw.turnSecs), [20, 30, 45, 60, 90], DEFAULTS.turnSecs),
    garage: pick(raw.garage, ["off", "basic", "advanced", "all"], DEFAULTS.garage),
    weather: !!raw.weather,
  };
}

const log = (g, t) => { g.log.push(t); if (g.log.length > 150) g.log.shift(); };
const nm = (c, id) => c.nameOf(id);
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const def = (k) => CARDS[k] || {};
const val = (k) => def(k).v || 0;
const sym = (k) => def(k).sym || {};
const isHeat = (k) => k === "h";

function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const T = TRACKS[cfg.track];
  const order = shuffle(c.members().slice(), rnd); // スタートグリッドの順(1番がポールポジション)
  const g = {
    cfg, track: cfg.track, N: T.n, laps: cfg.laps || T.laps, order, P: {}, round: 0, step: "plan", moveOrder: [], mi: 0, turn: null,
    hall: [], started: order.length, log: [], nextId: 1, rnd, seq: 0, weather: null, road: {},
  };
  g.goal = g.laps * g.N;
  const mk = (k) => ({ id: g.nextId++, k });
  let heat = T.heat, stress = T.stress, heatToDeck = 0, heatToDiscard = 0;
  // 天候と路面(準備のときに決める)
  if (cfg.weather) {
    g.weather = Math.floor(rnd() * WEATHER.length);
    const w = g.weather;
    if (w === 0) stress = Math.max(0, stress - 1);
    if (w === 1) heat += 1;
    if (w === 2) stress += 1;
    if (w === 3) heat = Math.max(0, heat - 1);
    if (w === 4) heatToDeck = 3;
    if (w === 5) heatToDiscard = 3;
    const bag = shuffle([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5], rnd);
    T.groups.forEach((gr, i) => { g.road[i] = bag[i % bag.length]; });
    log(g, `天候: ${WEATHER[w].setup}(天候区間は${WEATHER[w].effName})`);
  }
  order.forEach((id, i) => {
    const deck = [];
    for (const k of ["s1", "s2", "s3", "s4"]) for (let j = 0; j < 3; j++) deck.push(mk(k));
    if (cfg.garage === "off") deck.push(mk("u0"), mk("u5"), mk("h"));
    for (let j = 0; j < stress; j++) deck.push(mk("x"));
    const engine = [];
    for (let j = 0; j < heat; j++) engine.push(mk("h"));
    const discard = [];
    for (let j = 0; j < heatToDeck && engine.length; j++) deck.push(engine.pop());
    for (let j = 0; j < heatToDiscard && engine.length; j++) discard.push(engine.pop());
    // グリッド: 1・2番が最前列(ゴールラインのすぐ手前のマス)
    g.P[id] = { deck, hand: [], discard, engine, gear: 1, play: [], plan: null, pos: -1 - Math.floor(i / 2), spot: i % 2, done: false, last: null, ups: [] };
  });
  c.g = g;
  log(g, `${T.name}・${g.laps}周のレース開始！`);
  if (cfg.garage !== "off") return startDraft(c);
  dealHands(g);
  newRound(c);
}
function dealHands(g) {
  for (const id of g.order) { const p = g.P[id]; shuffle(p.deck, g.rnd); draw(g, id, HAND); }
}

// ---- ガレージ(アップグレードのドラフト) ----
// 1巡目: 後ろの車から / 2巡目: 前の車から / 3巡目: 後ろの車から。場には人数+3枚。残りは捨てる
function startDraft(c) {
  const g = c.g;
  const supply = [];
  for (const n of POOL[g.cfg.garage]) { if (UPG[n][0] === "heat") supply.push("h", "h"); else supply.push("g" + n, "g" + n); }
  g.supply = shuffle(supply, g.rnd);
  g.step = "draft";
  g.draft = { round: 0 };
  nextDraftRound(c);
}
function nextDraftRound(c) {
  const g = c.g, d = g.draft;
  d.round++;
  if (d.round > 3) {
    g.draft = null; g.supply = null;
    for (const id of g.order) for (const k of g.P[id].ups) g.P[id].deck.push({ id: g.nextId++, k });
    log(g, "アップグレードを選び終わりました");
    dealHands(g);
    return newRound(c);
  }
  const grid = g.order.slice(); // 1番が先頭
  d.order = d.round === 2 ? grid : grid.slice().reverse();
  d.order = d.order.filter((id) => g.P[id] && !g.P[id].left);
  d.market = g.supply.splice(0, d.order.length + 3);
  d.i = 0;
  g.seq++;
  arm(c);
}
function pickUpgrade(c, id, idx) {
  const g = c.g, d = g.draft;
  if (g.step !== "draft" || !d || d.order[d.i] !== id) return "今は選べません";
  if (!Number.isInteger(idx) || idx < 0 || idx >= d.market.length) return "カードを選んでください";
  const k = d.market.splice(idx, 1)[0];
  g.P[id].ups.push(k);
  log(g, `${nm(c, id)} が「${k === "h" ? "ヒート" : def(k).name}」を選びました`);
  d.i++;
  g.seq++;
  while (d.i < d.order.length && !c.has(d.order[d.i])) d.i++;
  if (d.i >= d.order.length) return nextDraftRound(c);
  arm(c);
}

// ---- デッキ ----
function refill(g, p) {
  if (p.deck.length || !p.discard.length) return;
  p.deck = shuffle(p.discard, g.rnd); p.discard = [];
}
function draw(g, id, upTo) {
  const p = g.P[id];
  while (p.hand.length < upTo) { refill(g, p); if (!p.deck.length) break; p.hand.push(p.deck.pop()); }
}
// ストレス・ブースト・＋: スピードカードが出るまでめくる(ほかのカードは捨て札へ)
function flipSpeed(g, id) {
  const p = g.P[id], skipped = [];
  for (let guard = 0; guard < 80; guard++) {
    refill(g, p);
    if (!p.deck.length) break;
    const card = p.deck.pop();
    if (def(card.k).speed) { p.play.push(card); return { card, skipped }; }
    p.discard.push(card); skipped.push(card.k);
  }
  return { card: null, skipped };
}
function payHeat(g, id, n) {
  const p = g.P[id], x = Math.min(n, p.engine.length);
  for (let i = 0; i < x; i++) p.discard.push(p.engine.pop());
  return x;
}

// ---- 盤 ----
const active = (g) => g.order.filter((id) => g.P[id] && !g.P[id].done);
const onTrack = (g) => g.order.filter((id) => g.P[id] && !g.P[id].removed);
function occupants(g, pos, except) { return onTrack(g).filter((id) => id !== except && g.P[id].pos === pos); }
const modN = (g, pos) => ((pos % g.N) + g.N) % g.N;
// 進む先のマスがいっぱい(2台)なら、空きのある最初のマスまで下がる
function place(g, id, target) {
  const p = g.P[id];
  let t = target;
  while (occupants(g, t, id).length >= 2) t--;
  const taken = occupants(g, t, id).map((o) => g.P[o].spot);
  p.pos = t; p.spot = taken.includes(0) ? 1 : 0;
  return t;
}
// 前にいる順(同じマスならレースライン側が前)
const ahead = (g, a, b) => g.P[b].pos - g.P[a].pos || g.P[a].spot - g.P[b].spot;
function groupOf(g, ci) { const T = TRACKS[g.track]; const at = T.corners[ci].at; return T.groups.findIndex((gr) => gr.ats.includes(at)); }
function cornerInfo(g, ci) {
  const T = TRACKS[g.track], gi = groupOf(g, ci);
  const r = g.cfg.weather ? g.road[gi] : null;
  let lim = T.corners[ci].lim;
  if (r === 2) lim -= 1;
  if (r === 3) lim += 1;
  return { lim, overheat: r === 1, printed: T.corners[ci].lim };
}
function cornersBetween(g, from, to) {
  const T = TRACKS[g.track], out = [];
  for (let lap = Math.floor(Math.max(from, 0) / g.N) - 1; lap <= Math.floor(to / g.N) + 1; lap++)
    for (let ci = 0; ci < T.corners.length; ci++) {
      const x = lap * g.N + T.corners[ci].at;
      if (x > from && x <= to && x <= g.goal) out.push({ x, ci, ...cornerInfo(g, ci) });
    }
  return out.sort((a, b) => a.x - b.x);
}
function nextCorner(g, pos) {
  const T = TRACKS[g.track];
  let best = null;
  for (let lap = Math.floor(Math.max(pos, 0) / g.N); lap <= Math.floor(Math.max(pos, 0) / g.N) + 1; lap++)
    for (let ci = 0; ci < T.corners.length; ci++) {
      const x = lap * g.N + T.corners[ci].at;
      if (x > pos && x <= g.goal && (!best || x < best.x)) best = { x, ci, ...cornerInfo(g, ci), dist: x - pos };
    }
  return best;
}
// そのマスの区間についている効果(路面トークンの区間効果と天候)
function sectorEffects(g, pos) {
  if (!g.cfg.weather) return [];
  const T = TRACKS[g.track], s = modN(g, pos);
  let gi = -1, best = -1;
  T.groups.forEach((gr, i) => { const d = (s - gr.sectorStart + g.N) % g.N; if (best < 0 || d < best) { best = d; gi = i; } });
  const r = g.road[gi];
  if (r === 0) return [WEATHER[g.weather].eff];
  if (r === 4) return ["heatCtl"];
  if (r === 5) return ["slip1"];
  return [];
}
const isFlood = (g, pos) => pos >= 0 && TRACKS[g.track].flood.includes(modN(g, pos));
const isTunnel = (g, pos) => pos >= 0 && TRACKS[g.track].tunnel.includes(modN(g, pos));

// ---- ラウンド ----
function newRound(c) {
  const g = c.g;
  g.round++;
  g.step = "plan"; g.turn = null; g.mi = 0; g.moveOrder = []; g.seq++;
  for (const id of active(g)) Object.assign(g.P[id], { plan: null, play: [], last: null, flooded: isFlood(g, g.P[id].pos) });
  arm(c);
}
// ギアを変えるのに要るヒート: 2段で1、水たまりの上から下げると+1
function shiftCost(p, shift) { return (Math.abs(shift) === 2 ? 1 : 0) + (shift < 0 && p.flooded ? 1 : 0); }
function planOf(g, id, shift, ids) {
  const p = g.P[id];
  if (![-2, -1, 0, 1, 2].includes(shift)) return "ギアの変え方が正しくありません";
  const gear = p.gear + shift;
  if (gear < 1 || gear > MAX_GEAR) return "ギアは1〜4です";
  const cost = shiftCost(p, shift);
  if (cost > p.engine.length) return `このギアに変えるにはエンジンにヒートが${cost}枚必要です`;
  if (!Array.isArray(ids)) return "カードを選んでください";
  const uniq = [...new Set(ids.map(Number))];
  const cards = uniq.map((x) => p.hand.find((cd) => cd.id === x));
  if (cards.some((cd) => !cd)) return "手札にないカードがあります";
  const playable = p.hand.filter((cd) => !isHeat(cd.k)).length;
  const clutter = playable < gear;
  if (cards.length !== gear) return `${gear}速なのでカードは${gear}枚です`;
  if (!clutter && cards.some((cd) => isHeat(cd.k))) return "ヒートカードは出せません";
  if (clutter && cards.filter((cd) => !isHeat(cd.k)).length !== playable) return "出せるカードは全部出してください(足りない分だけヒート)";
  return { shift, gear, ids: uniq, clutter, cost };
}
function submitPlan(c, id, m) {
  const g = c.g;
  if (g.step !== "plan" || !g.P[id] || g.P[id].done) return "今はカードを出せません";
  const r = planOf(g, id, Number(m.shift), m.ids);
  if (typeof r === "string") return r;
  g.P[id].plan = r;
  if (active(g).every((x) => g.P[x].plan || !c.has(x))) beginMoves(c);
}
function autoPlan(g, id) {
  const p = g.P[id];
  const playable = p.hand.filter((cd) => !isHeat(cd.k));
  const gear = p.gear;
  // 時間切れ: ギアはそのまま、小さい数字から出す(ストレスは先に)
  const sorted = playable.slice().sort((a, b) => (def(b.k).stress ? 1 : 0) - (def(a.k).stress ? 1 : 0) || val(a.k) - val(b.k));
  let ids = sorted.slice(0, gear).map((cd) => cd.id);
  if (ids.length < gear) ids = ids.concat(p.hand.filter((cd) => isHeat(cd.k)).slice(0, gear - ids.length).map((cd) => cd.id));
  return planOf(g, id, 0, ids);
}
function beginMoves(c) {
  const g = c.g;
  for (const id of active(g)) {
    const p = g.P[id];
    if (!p.plan || typeof p.plan === "string") p.plan = autoPlan(g, id);
    if (typeof p.plan === "string") p.plan = { shift: 0, gear: p.gear, ids: p.hand.slice(0, p.gear).map((cd) => cd.id), clutter: true, cost: 0 };
    const { gear, ids, cost } = p.plan;
    if (cost) payHeat(g, id, cost);
    p.gear = gear;
    p.play = ids.map((x) => p.hand.find((cd) => cd.id === x)).filter(Boolean);
    p.hand = p.hand.filter((cd) => !ids.includes(cd.id));
  }
  g.moveOrder = active(g).sort((a, b) => ahead(g, a, b));
  const k = g.started >= 5 ? 2 : 1;
  g.adrenaline = g.moveOrder.slice(-k);
  g.step = "move"; g.mi = 0;
  startTurn(c);
}

// ---- 1台ずつ ----
function newPool() { return { cool: 0, reduce: 0, slip: 0, salvage: 0, superCool: 0, draft: 0, accel: 0, adjust: 0, scrap: 0, refresh: [] }; }
function startTurn(c) {
  const g = c.g;
  while (g.mi < g.moveOrder.length && (!g.P[g.moveOrder[g.mi]] || g.P[g.moveOrder[g.mi]].done)) g.mi++;
  if (g.mi >= g.moveOrder.length) return endRound(c);
  const id = g.moveOrder[g.mi], p = g.P[id];
  const t = g.turn = {
    pid: id, start: p.pos, speed: 0, flips: [], flipCount: 0, phase: "react", adrenaline: g.adrenaline.includes(id), adrUsed: false, boosted: false,
    pool: newPool(), used: { cool: 0, reduce: 0, salvage: 0, superCool: 0, draft: 0, accel: false }, choices: [], notes: [],
  };
  t.pool.cool = COOL_BY_GEAR[p.gear] + (t.adrenaline ? 1 : 0);
  g.seq++;
  if (p.plan.clutter) {
    // 手札がヒートだらけ: 動けない。ギアは1速、出したカードは捨て札へ
    log(g, `${nm(c, id)} はオーバーヒートで動けない(1速へ)`);
    p.gear = 1;
    p.last = { speed: 0, clutter: true, from: p.pos, to: p.pos };
    return finishTurn(c, []);
  }
  for (const cd of p.play.slice()) revealCard(g, id, cd);
  // 選べるスピード(ブレーキなど)が残っていれば、まず選んでもらう
  if (t.choices.length) { t.phase = "choose"; return arm(c); }
  moveBySpeed(c);
}
// 1枚を公開して効果を集める(公開時とダイレクトプレイで共通)
function revealCard(g, id, cd) {
  const t = g.turn, p = g.P[id], d = def(cd.k);
  const flip = (by) => {
    const f = flipSpeed(g, id);
    t.flips.push({ by, card: f.card && f.card.k, skipped: f.skipped });
    t.flipCount += 1 + f.skipped.length;
    if (f.card) t.speed += val(f.card.k);
  };
  if (d.stress) return flip("stress");
  if (!d.upg) { t.speed += val(cd.k); return; }
  const s = d.sym;
  // ヒートを払えないアップグレードは、ストレスと同じ扱いになる
  if (s.heat && p.engine.length < s.heat) { t.notes.push(`${d.name}のヒートが払えずストレス扱い`); return flip("stress"); }
  if (s.heat) payHeat(g, id, s.heat);
  if (d.choices) t.choices.push({ cid: cd.id, opts: d.choices });
  else t.speed += d.v || 0;
  for (let i = 0; i < (s.boost || 0) + (d.plus && !s.boost ? 1 : 0); i++) flip("plus");
  for (const k of ["cool", "reduce", "slip", "salvage", "superCool", "draft", "accel", "adjust", "scrap"]) if (s[k]) t.pool[k] += s[k];
  if (s.refresh) t.pool.refresh.push(cd.id);
}
function choose(c, id, vals) {
  const g = c.g, t = g.turn;
  if (!t || t.pid !== id || t.phase !== "choose") return;
  const list = Array.isArray(vals) ? vals.map(Number) : [];
  t.choices.forEach((ch, i) => { const v = ch.opts.includes(list[i]) ? list[i] : ch.opts[0]; t.speed += v; ch.v = v; });
  t.choices = [];
  moveBySpeed(c);
}
function moveBySpeed(c) {
  const g = c.g, t = g.turn, id = t.pid, p = g.P[id];
  t.phase = "react";
  place(g, id, t.start + t.speed);
  log(g, `${nm(c, id)}: ${p.gear}速・スピード${t.speed}` + (t.notes.length ? `(${t.notes.join("・")})` : ""));
  g.seq++;
  arm(c);
}
const inReact = (g, id) => g.turn && g.turn.pid === id && g.turn.phase === "react";
function boost(c, id) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id)) return;
  if (t.boosted) return "ブーストは1ターンに1回です";
  const free = sectorEffects(g, p.pos).includes("heatCtl");
  if (!free && !p.engine.length) return "エンジンにヒートがありません";
  if (!free) payHeat(g, id, 1);
  t.boosted = true;
  const f = flipSpeed(g, id);
  t.flips.push({ by: "boost", card: f.card && f.card.k, skipped: f.skipped });
  t.flipCount += 1 + f.skipped.length;
  if (f.card) { t.speed += val(f.card.k); place(g, id, p.pos + val(f.card.k)); }
  log(g, `${nm(c, id)} はブースト(+${f.card ? val(f.card.k) : 0})` + (free ? "・ヒートなし" : ""));
}
function adrenalineMove(c, id) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id) || !t.adrenaline || t.adrUsed) return;
  t.adrUsed = true; t.speed += 1;
  place(g, id, p.pos + 1);
  log(g, `${nm(c, id)} はアドレナリンで+1`);
}
function coolLeft(g) {
  const t = g.turn, p = g.P[t.pid], fx = sectorEffects(g, p.pos);
  if (fx.includes("nocool")) return 0;
  return t.pool.cool + (fx.includes("cool1") ? 1 : 0) - t.used.cool;
}
function cooldown(c, id, n) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id)) return;
  if (sectorEffects(g, p.pos).includes("nocool")) return "この区間ではクールダウンできません(天候)";
  const can = Math.min(coolLeft(g), p.hand.filter((cd) => isHeat(cd.k)).length, Math.max(1, Number(n) || 1));
  if (can <= 0) return "クールダウンできるヒートがありません";
  for (let i = 0; i < can; i++) { const k = p.hand.findIndex((cd) => isHeat(cd.k)); p.engine.push(p.hand.splice(k, 1)[0]); }
  t.used.cool += can;
  log(g, `${nm(c, id)} はクールダウン${can}`);
}
// ストレスを捨てる(トンネルの中では捨てられない)
function reduceStress(c, id, n) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id)) return;
  if (isTunnel(g, p.pos)) return "トンネルの中では手札を捨てられません";
  const can = Math.min(t.pool.reduce - t.used.reduce, p.hand.filter((cd) => cd.k === "x").length, Math.max(1, Number(n) || 1));
  if (can <= 0) return "捨てられるストレスがありません";
  for (let i = 0; i < can; i++) { const k = p.hand.findIndex((cd) => cd.k === "x"); p.discard.push(p.hand.splice(k, 1)[0]); }
  t.used.reduce += can;
  log(g, `${nm(c, id)} はストレスを${can}枚捨てた`);
}
// 捨て札から選んだカードを山札に混ぜる
function salvage(c, id, ids) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id)) return;
  const left = t.pool.salvage - t.used.salvage;
  if (left <= 0) return "サルベージできません";
  const list = (Array.isArray(ids) ? [...new Set(ids.map(Number))] : []).slice(0, left);
  const cards = list.map((x) => p.discard.find((cd) => cd.id === x)).filter(Boolean);
  p.discard = p.discard.filter((cd) => !cards.includes(cd));
  p.deck.push(...cards); shuffle(p.deck, g.rnd);
  t.used.salvage = t.pool.salvage;
  log(g, `${nm(c, id)} は捨て札から${cards.length}枚を山札に戻した`);
}
// スーパークール: 捨て札のヒートをエンジンへ
function superCool(c, id) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id)) return;
  const left = t.pool.superCool - t.used.superCool;
  if (left <= 0) return;
  let n = 0;
  for (let i = 0; i < left; i++) { const k = p.discard.findIndex((cd) => isHeat(cd.k)); if (k < 0) break; p.engine.push(p.discard.splice(k, 1)[0]); n++; }
  t.used.superCool = t.pool.superCool;
  log(g, `${nm(c, id)} はスーパークール(捨て札のヒート${n}枚をエンジンへ)`);
}
// 加速: このターンにめくった枚数ぶんスピード+1(使うなら全部)
function accelerate(c, id) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id) || !t.pool.accel || t.used.accel) return;
  t.used.accel = true;
  const add = t.flipCount * t.pool.accel;
  t.speed += add;
  place(g, id, p.pos + add);
  log(g, `${nm(c, id)} は加速(+${add})`);
}
// ダイレクトプレイ: 手札から出して、ふつうに出したのと同じように使う
function directPlay(c, id, cid) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id)) return;
  const cd = p.hand.find((x) => x.id === Number(cid));
  if (!cd || !sym(cd.k).direct) return "そのカードは直接出せません";
  p.hand = p.hand.filter((x) => x !== cd);
  p.play.push(cd);
  const before = t.speed;
  revealCard(g, id, cd);
  // 選べるスピードのカードは小さい方(ダイレクトで出すカードには該当なし)
  for (const ch of t.choices) t.speed += ch.opts[0];
  t.choices = [];
  place(g, id, p.pos + (t.speed - before));
  log(g, `${nm(c, id)} は「${def(cd.k).name}」を直接出した(+${t.speed - before})`);
}
// ドラフト: 空いたマスだけを通って、前のマスに車がいるマスまで進む(スピードには入らない)
function draftTargets(g, id) {
  const t = g.turn, p = g.P[id], left = t.pool.draft - t.used.draft, out = [];
  for (let k = 1; k <= left; k++) {
    if (occupants(g, p.pos + k, id).length) break;
    if (occupants(g, p.pos + k + 1, id).length) out.push(k);
  }
  return out;
}
function draft(c, id, k) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id)) return;
  if (!draftTargets(g, id).includes(Number(k))) return "そこへはドラフトできません";
  t.used.draft += Number(k);
  place(g, id, p.pos + Number(k));
  log(g, `${nm(c, id)} はドラフト(+${k})`);
}
function toggleRefresh(c, id, cid) {
  const g = c.g, t = g.turn;
  if (!inReact(g, id) || !t.pool.refresh.includes(Number(cid))) return;
  t.refreshOn = t.refreshOn || [];
  const i = t.refreshOn.indexOf(Number(cid));
  if (i >= 0) t.refreshOn.splice(i, 1); else t.refreshOn.push(Number(cid));
}
function slipDist(g, id) {
  const t = g.turn, p = g.P[id], fx = sectorEffects(g, p.pos);
  return 2 + t.pool.slip + (fx.includes("slip1") ? 1 : 0) + (fx.includes("slip2") ? 2 : 0);
}
function slipAllowed(g, id) {
  const p = g.P[id];
  if (p.pos + 2 >= g.goal) return false; // 最終周: ゴールを越えるスリップストリーム・越えたあとのスリップストリームは不可
  if (sectorEffects(g, p.pos).includes("noslip")) return false;
  return occupants(g, p.pos, id).length > 0 || occupants(g, p.pos + 1, id).length > 0;
}
function reactDone(c, id) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!inReact(g, id)) return;
  // 必須の記号: スクラップ(山札の上から捨て札へ)
  for (let i = 0; i < t.pool.scrap; i++) { refill(g, p); if (!p.deck.length) break; p.discard.push(p.deck.pop()); }
  // リフレッシュ: 選んだカードを山札の上に戻す
  for (const cid of t.refreshOn || []) {
    const k = p.play.findIndex((cd) => cd.id === cid);
    if (k >= 0) p.deck.push(p.play.splice(k, 1)[0]);
  }
  if (slipAllowed(g, id)) { t.phase = "slip"; t.slipBy = slipDist(g, id); g.seq++; return arm(c); }
  corners(c);
}
function slip(c, id, yes) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!t || t.pid !== id || t.phase !== "slip") return;
  if (yes) {
    // 最終周はゴールの先へは出られない
    const d = Math.min(t.slipBy, g.goal - 1 - p.pos);
    place(g, id, p.pos + d); t.slipped = true; log(g, `${nm(c, id)} はスリップストリーム(+${d})`);
  }
  corners(c);
}
// コーナー: 通ったコーナーごとに、速度が制限を超えた分のヒートを払う。払えなければスピン
function corners(c) {
  const g = c.g, t = g.turn, id = t.pid, p = g.P[id];
  t.corners = [];
  for (const cr of cornersBetween(g, t.start, p.pos)) {
    const lim = cr.lim + t.pool.adjust;
    let over = t.speed - lim;
    if (over > 0 && cr.overheat) over += 1;
    if (over <= 0) { t.corners.push({ lim, paid: 0 }); continue; }
    if (p.engine.length >= over) { payHeat(g, id, over); t.corners.push({ lim, paid: over }); log(g, `${nm(c, id)}: コーナー(制限${lim})でヒート${over}`); continue; }
    const paid = payHeat(g, id, over);
    const stress = p.gear <= 2 ? 1 : 2;
    for (let i = 0; i < stress; i++) p.hand.push({ id: g.nextId++, k: "x" });
    p.gear = 1;
    place(g, id, cr.x - 1);
    t.corners.push({ lim, paid, spin: true, stress });
    t.spun = true;
    log(g, `${nm(c, id)} はコーナー(制限${lim})でスピン！ストレス+${stress}・1速へ`);
    break;
  }
  t.phase = "discard"; g.seq++;
  // トンネルの中では捨てられないので、そのまま終わる
  if (isTunnel(g, p.pos)) return finishTurn(c, []);
  arm(c);
}
function discard(c, id, ids) {
  const g = c.g, t = g.turn, p = g.P[id];
  if (!t || t.pid !== id || t.phase !== "discard") return;
  const list = Array.isArray(ids) ? [...new Set(ids.map(Number))] : [];
  const cards = list.map((x) => p.hand.find((cd) => cd.id === x)).filter(Boolean);
  if (cards.some((cd) => def(cd.k).keep)) return "ストレス・ヒート・5のカードは捨てられません";
  if (cards.length && isTunnel(g, p.pos)) return "トンネルの中では手札を捨てられません";
  p.hand = p.hand.filter((cd) => !cards.includes(cd));
  p.discard.push(...cards);
  finishTurn(c, cards);
}
function finishTurn(c, discarded) {
  const g = c.g, t = g.turn, id = t.pid, p = g.P[id];
  p.discard.push(...p.play);
  p.last = p.last || { speed: t.speed, from: t.start, to: p.pos, flips: t.flips, corners: t.corners || [], slipped: !!t.slipped, boosted: t.boosted, spun: !!t.spun, discarded: discarded.length };
  p.shown = p.play.map((cd) => cd.k);
  p.play = [];
  draw(g, id, HAND);
  if (p.pos >= g.goal && !p.crossed) { p.crossed = true; log(g, `🏁 ${nm(c, id)} がゴール！`); }
  g.turn = null; g.mi++;
  startTurn(c);
}
function endRound(c) {
  const g = c.g;
  // ゴールした車はラウンドの終わりに盤から外して表彰台へ(同じラウンドなら前にいる順)
  const fin = active(g).filter((id) => g.P[id].crossed).sort((a, b) => ahead(g, a, b));
  for (const id of fin) { g.P[id].done = true; g.P[id].removed = true; g.hall.push(id); }
  if (!active(g).filter((id) => c.has(id)).length) return endGame(c);
  newRound(c);
}
function endGame(c) {
  const g = c.g;
  g.step = "end"; g.turn = null;
  // まだ走っていた人(途中で抜けた等)は、前にいる順で後ろに並べる
  const rest = g.order.filter((id) => g.P[id] && !g.hall.includes(id)).sort((a, b) => ahead(g, a, b));
  g.result = [...g.hall, ...rest];
  log(g, `レース終了！優勝は ${nm(c, g.result[0])}`);
  const n = g.result.length;
  c.finish(Object.fromEntries(g.result.filter((id) => c.has(id)).map((id, i) => [id, n - i])));
}

// ---- 時間切れ ----
function autoTurn(c) {
  const g = c.g, t = g.turn;
  if (!t) return;
  const id = t.pid, p = g.P[id];
  if (t.phase === "choose") choose(c, id, []);
  if (g.turn === t && t.phase === "react") {
    if (t.adrenaline && !t.adrUsed) adrenalineMove(c, id);
    if (coolLeft(g) > 0 && p.hand.some((cd) => isHeat(cd.k))) cooldown(c, id, coolLeft(g));
    if (t.pool.superCool > t.used.superCool) superCool(c, id);
    if (t.pool.reduce > t.used.reduce && !isTunnel(g, p.pos) && p.hand.some((cd) => cd.k === "x")) reduceStress(c, id, t.pool.reduce);
    reactDone(c, id);
  }
  if (g.turn === t && t.phase === "slip") slip(c, id, false);
  if (g.turn === t && t.phase === "discard") discard(c, id, []);
}
function arm(c) {
  const g = c.g;
  if (g.step === "draft" && g.draft) {
    const d = g.draft, who = d.order[d.i], key = "draft:" + d.round + ":" + d.i + ":" + c.live().includes(who);
    if (g.armKey === key) return;
    g.armKey = key;
    return c.setTimer((c.live().includes(who) ? 40 : 10) * 1000, () => { g.armKey = null; if (g.step === "draft" && g.draft && g.draft.order[g.draft.i] === who) pickUpgrade(c, who, 0); });
  }
  if (g.step === "plan") {
    const key = "plan:" + g.round;
    if (g.armKey === key) return;
    g.armKey = key;
    return c.setTimer(g.cfg.planSecs * 1000, () => { g.armKey = null; if (g.step === "plan" && g.armKey == null) { log(g, "時間切れ(まだの人はギアそのまま・小さいカードから)"); beginMoves(c); } });
  }
  if (g.step === "move" && g.turn) {
    const away = !c.live().includes(g.turn.pid), key = "turn:" + g.round + ":" + g.mi + ":" + g.turn.phase + ":" + away;
    if (g.armKey === key) return;
    g.armKey = key;
    return c.setTimer((away ? 10 : g.cfg.turnSecs) * 1000, () => { g.armKey = null; autoTurn(c); });
  }
  c.clearTimer();
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step === "end" || !g.P[pid]) return;
  let r;
  switch (m.a) {
    case "pick": r = pickUpgrade(c, pid, Number(m.i)); break;
    case "plan": r = submitPlan(c, pid, m); break;
    case "unplan": if (g.step === "plan" && g.P[pid].plan) g.P[pid].plan = null; break;
    case "choose": r = choose(c, pid, m.vals); break;
    case "boost": r = boost(c, pid); break;
    case "adr": r = adrenalineMove(c, pid); break;
    case "cool": r = cooldown(c, pid, m.n); break;
    case "reduce": r = reduceStress(c, pid, m.n); break;
    case "salvage": r = salvage(c, pid, m.ids); break;
    case "supercool": r = superCool(c, pid); break;
    case "accel": r = accelerate(c, pid); break;
    case "direct": r = directPlay(c, pid, m.id); break;
    case "draft": r = draft(c, pid, m.k); break;
    case "refresh": r = toggleRefresh(c, pid, m.id); break;
    case "react": r = reactDone(c, pid); break;
    case "slip": r = slip(c, pid, !!m.yes); break;
    case "discard": r = discard(c, pid, m.ids); break;
    default: return;
  }
  if (g.step !== "end") arm(c);
  return r;
}

function onLeave(c, pid) {
  const g = c.g;
  if (!g || !g.P[pid]) return;
  log(g, `${nm(c, pid)} が抜けました`);
  const p = g.P[pid];
  p.done = true; p.removed = true; p.left = true;
  if (g.step === "end") return;
  if (g.step === "draft" && g.draft) {
    if (g.draft.order[g.draft.i] === pid) { g.draft.i++; while (g.draft.i < g.draft.order.length && !c.has(g.draft.order[g.draft.i])) g.draft.i++; if (g.draft.i >= g.draft.order.length) return nextDraftRound(c); g.seq++; return arm(c); }
    return;
  }
  if (g.step === "plan" && active(g).every((x) => g.P[x].plan || !c.has(x))) {
    if (active(g).filter((id) => c.has(id)).length) return beginMoves(c);
  }
  if (g.step === "move" && g.turn && g.turn.pid === pid) { g.turn = null; g.mi++; return startTurn(c); }
  if (!active(g).filter((id) => c.has(id)).length) return endGame(c);
}

function view(c, me) {
  const g = c.g, T = TRACKS[g.track];
  const P = {};
  for (const id of g.order) {
    const p = g.P[id];
    if (!p) continue;
    const nc = nextCorner(g, p.pos);
    P[id] = {
      pos: p.pos, spot: p.spot, gear: p.gear, engine: p.engine.length, hand: p.hand.length, deck: p.deck.length, discard: p.discard.length,
      top: p.discard.length ? p.discard[p.discard.length - 1].k : null, ready: !!p.plan, done: !!p.done, left: !!p.left, crossed: !!p.crossed,
      lap: Math.min(g.laps, Math.max(0, Math.floor(p.pos / g.N)) + 1), playCount: p.play.length, shown: g.step === "move" && g.moveOrder.indexOf(id) < g.mi ? p.shown : null,
      revealed: g.turn && g.turn.pid === id ? p.play.map((cd) => cd.k) : null, last: p.last, next: nc ? { dist: nc.dist, lim: nc.lim } : null,
      heatInHand: id === me ? p.hand.filter((cd) => isHeat(cd.k)).length : null, ups: p.ups, flooded: !!p.flooded,
      fx: sectorEffects(g, p.pos), tunnel: isTunnel(g, p.pos),
    };
  }
  const mine = g.P[me];
  const t = g.turn;
  let turn = null;
  if (t) {
    turn = { pid: t.pid, phase: t.phase, speed: t.speed, flips: t.flips, adrenaline: t.adrenaline, adrUsed: t.adrUsed, boosted: t.boosted, start: t.start,
      corners: t.corners || null, notes: t.notes, pool: t.pool, used: t.used, coolLeft: coolLeft(g), choices: t.choices, slipBy: t.slipBy || null, refreshOn: t.refreshOn || [],
      flipCount: t.flipCount };
    if (t.pid === me && t.phase === "react") {
      turn.draftTo = draftTargets(g, me);
      if (t.pool.salvage > t.used.salvage) turn.discardList = mine.discard.map((cd) => ({ id: cd.id, k: cd.k }));
      turn.playIds = mine.play.map((cd) => ({ id: cd.id, k: cd.k }));
    }
  }
  return {
    cfg: g.cfg, track: { id: g.track, name: T.name, n: g.N, corners: T.corners.map((cr, ci) => ({ ...cr, ...cornerInfo(g, ci) })), cells: T.xy, flood: T.flood, tunnel: T.tunnel, chicanes: T.chicanes },
    laps: g.laps, goal: g.goal, round: g.round, step: g.step, weather: g.weather, road: g.cfg.weather ? T.groups.map((gr, i) => ({ ats: gr.ats, x: gr.x, y: gr.y, t: g.road[i] })) : null,
    order: g.order, P, moveOrder: g.moveOrder, mi: g.mi, adrenaline: g.adrenaline || [], hall: g.hall, result: g.result || null, turn,
    draft: g.draft ? { round: g.draft.round, market: g.draft.market, cur: g.draft.order[g.draft.i], order: g.draft.order } : null,
    hand: mine ? mine.hand : [], plan: mine && mine.plan ? mine.plan : null, coolByGear: COOL_BY_GEAR, log: g.log,
  };
}

module.exports = {
  start, handle, view, onLeave, onPresence: (c) => { if (c.g && c.g.step !== "end") arm(c); }, normalize, DEFAULTS, TRACKS, CARDS, UPG, WEATHER, ROAD,
  _t: { place, cornersBetween, nextCorner, flipSpeed, planOf, beginMoves, slipAllowed, endRound, sectorEffects, draftTargets, revealCard },
};
