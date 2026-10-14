const core = require("../games/mini/eldorado.js"), T = core._t;
let fails = 0; const check = (c, m) => { if (!c || !process.env.QUIET) console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids = ["a", "b", "c"], cfg = {}) {
  const st = { timer: null, finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  core.start(c, cfg);
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const nbs = (k) => { const [q, r] = k.split(",").map(Number); return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([a, b]) => `${q + a},${r + b}`); };
const H = (c, id, m) => core.handle(c, id, m);
// コース: 全部のコースでタイルが重ならない・スタートからゴールへ行ける・ボードの境目がつながっている
for (const id of Object.keys(core.COURSES).filter((k) => core.COURSES[k].exp !== "gt")) {
  const C = core.COURSES[id], cs = T.buildCourse(id, { hh: true });
  const hs = Object.values(cs.hex);
  const nT = C.p.length, expect = C.p.reduce((n, [b]) => n + core.BOARDS[b].join(" ").split(" ").length, 0) + 3 + (C.tv ? 3 : 0);
  check(hs.length === expect, `${id}: マスの数 ${hs.length}(タイルが重ならない)`);
  for (let i = 0; i < nT - 1; i++) {
    const edges = hs.filter((h) => h.tile === i && h.t !== "m").filter((h) => nbs(`${h.q},${h.r}`).some((n) => cs.hex[n] && cs.hex[n].tile === i + 1 && cs.hex[n].t !== "m")).length;
    if (edges < 2) check(false, `${id}: ボード${i}と${i + 1}がつながっていない`);
  }
  const seen = new Set(cs.starts), q = [...cs.starts]; let ok = false;
  while (q.length) { const k = q.shift(); if (cs.hex[k].t === "g") { ok = true; break; } for (const n of nbs(k)) if (cs.hex[n] && !seen.has(n) && cs.hex[n].t !== "m" && cs.hex[n].t !== "s") { seen.add(n); q.push(n); } }
  const tavOk = !C.tv || cs.tavern.every((k) => nbs(k).some((n) => cs.hex[n] && cs.hex[n].tile < nT));
  check(ok && tavOk && cs.starts.length === 4 && cs.goals.length === 3 && cs.blockades.length === nT - 1 && cs.caves.length <= 9, `${id}: スタート4・ゴール3・バリケード${nT - 1}・洞窟${cs.caves.length}・ゴールまで行ける${C.tv ? "・酒場" : ""}`);
}
// 設定
check(core.normalize({ course: "demon" }).hh && core.normalize({ course: "demon", hh: false }).hh && core.normalize({ hh: true }).caves, "英雄と呪いのコースは拡張あり・拡張はいつも洞窟ルール");
check(!core.normalize({}).caves && !core.normalize({}).hh, "既定は基本ルールのみ");
// 準備
{
  const { g } = mk();
  const p = g.P[g.order[0]];
  check(p.hand.length === 4 && p.deck.length === 4 && [...p.hand, ...p.deck].filter((x) => x.k === "traveler").length === 4, "初期デッキ8枚(探検家3・旅行者4・水夫1)、手札4枚");
  check(g.market.map((s) => s.k).join() === "scout,trailblazer,jack,photographer,chest,transmitter" && Object.keys(g.reserve).length === 12, "市場6種・市場の外12種(各3枚)");
  check(!Object.keys(g.caveTok).length && !g.curses.length, "基本ルールでは洞窟トークン・呪いなし");
}
{ const { g } = mk(["a", "b"]); check(g.P[g.order[0]].pieces.length === 2 && g.P[g.order[0]].pieces[1] === g.course.starts[2], "2人: 1人2コマ(スタート1・3 と 2・4)"); }
{
  const { g } = mk(["a", "b", "c"], { course: "winding", caves: true });
  const n = Object.values(g.caveTok).reduce((s, x) => s + x.length, 0);
  check(n === g.course.caves.length * 4 && !g.supply.length, `洞窟ルール: 洞窟${g.course.caves.length}か所に4個ずつ(控えなし)`);
  const all = {}; const { g: g2 } = mk(["a", "b"], { course: "pass" });
  for (const t of [...Object.values(g2.caveTok).flat(), ...g2.supply]) all[t.k] = (all[t.k] || 0) + 1;
  check(Object.values(all).reduce((a, b) => a + b, 0) === 54 && all.j2 === 3 && all.draw === 4 && all.protect, "拡張: 洞窟トークン54個(基本36+拡張18)、余りは控え");
  check(g2.curses.length === 20 && g2.demons === 15 && g2.heroes.length === 10 && Object.keys(g2.reserve).length === 16, "拡張: 呪い20・魔物15・英雄10・市場の外16種");
  const deck = [...g2.P[g2.order[0]].deck, ...g2.P[g2.order[0]].hand].map((x) => x.k);
  check(deck.length === 9 && deck.some((k) => ["frank", "leroy", "luna", "polly"].includes(k)), "拡張: 動物カードが初期デッキの9枚目");
}
// テスト用の小さな盤面に置き換える
function setHand(g, id, ks) { g.P[id].hand = ks.map((k) => ({ id: ++g.uid, k })); return [...g.P[id].hand]; } // 写しを返す(手札は出すと減るため)
function tiny(g, cells) {
  g.course.hex = {};
  for (const [k, t, v, tile, extra] of cells) { const [q, r] = k.split(",").map(Number); g.course.hex[k] = { q, r, t, v, tile: tile || 0, ...(t === "g" ? { sym: "w" } : {}), ...(extra || {}) }; }
  g.course.blockades = []; g.course.caves = Object.keys(g.course.hex).filter((k) => g.course.hex[k].cave); g.course.tavern = Object.keys(g.course.hex).filter((k) => g.course.hex[k].tavern);
  g.course.tunnels = {}; for (const [k, h] of Object.entries(g.course.hex)) if (h.t === "t") (g.course.tunnels[h.tile] ||= []).push(k);
  for (const id of g.order) g.P[id].pieces = g.P[id].pieces.map(() => "99,99"), g.P[id].near = g.P[id].pieces.map(() => []);
}
const place = (g, id, k) => { g.P[id].pieces = [k]; g.P[id].done = [false]; g.P[id].near = [[]]; };
{
  const { c, g } = mk(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 2], ["2,0", "j", 1], ["3,0", "w", 1], ["0,1", "r", 2], ["1,1", "c", 1], ["-1,0", "m", 0]]);
  place(g, a, "0,0");
  const [ex, tb, sa] = setHand(g, a, ["explorer", "trailblazer", "sailor", "traveler"]);
  check(/パワーが足りません/.test(H(c, a, { a: "move", card: ex.id, to: "1,0" })), "パワー1ではパワー2のマスに入れない");
  check(H(c, a, { a: "move", card: tb.id, to: "1,0" }) === undefined && g.P[a].pieces[0] === "1,0" && g.move.left === 1, "先駆者(3)でパワー2のマスへ、残り1");
  H(c, a, { a: "move", card: tb.id, to: "2,0" }); check(g.P[a].pieces[0] === "2,0" && !g.move, "残りのパワーで続けて進む");
  check(/パドル/.test(H(c, a, { a: "move", card: ex.id, to: "3,0" })), "地形が違うと入れない(川にはパドル)");
  H(c, a, { a: "move", card: sa.id, to: "3,0" }); check(g.P[a].pieces[0] === "3,0", "水夫で川へ");
}
{
  const { c, g } = mk(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1], ["1,0", "r", 2], ["0,1", "c", 1], ["-1,0", "m", 0], ["1,-1", "j", 1]]);
  place(g, a, "0,0");
  const h = setHand(g, a, ["explorer", "traveler", "sailor", "traveler"]);
  check(/山/.test(H(c, a, { a: "move", card: h[0].id, to: "-1,0" })), "山には入れない");
  g.P[g.order[1]].pieces = ["1,-1"];
  check(/ほかのコマ/.test(H(c, a, { a: "move", card: h[0].id, to: "1,-1" })), "ほかのコマのマスには入れない");
  check(/2枚/.test(H(c, a, { a: "enterCards", to: "1,0", cards: [h[0].id] })), "荒地(2): 2枚必要");
  H(c, a, { a: "enterCards", to: "1,0", cards: [h[0].id, h[1].id] });
  check(g.P[a].pieces[0] === "1,0" && g.P[a].played.length === 2, "荒地: 2枚捨てて入る(捨て札へ)");
  g.P[a].pieces = ["0,0"]; const before = g.P[a].gone.length;
  H(c, a, { a: "enterCards", to: "0,1", cards: [h[2].id] });
  check(g.P[a].pieces[0] === "0,1" && g.P[a].gone.length === before + 1, "ベースキャンプ: カードをゲームから除外して入る");
}
// 買ったあとは進めない
{
  const { c, g } = mk(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 1]]); place(g, a, "0,0");
  const h = setHand(g, a, ["explorer", "traveler", "traveler", "explorer"]);
  H(c, a, { a: "buy", k: "scout", cards: [h[1].id] });
  check(/買ったあと/.test(H(c, a, { a: "move", card: h[0].id, to: "1,0" })), "カードを買ったあとは進めない(先に進んでから買う)");
}
// バリケード
{
  const { c, g } = mk(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1, 0], ["1,0", "j", 1, 1], ["2,0", "j", 1, 1]]);
  g.course.blockades = [{ n: 5, t: "j", v: 2, a: 0, b: 1, by: null }];
  place(g, a, "0,0");
  const h = setHand(g, a, ["explorer", "trailblazer", "traveler", "traveler"]);
  check(/バリケード/.test(H(c, a, { a: "move", card: h[1].id, to: "1,0" })), "バリケードがあると通れない");
  check(/パワーが足りません/.test(H(c, a, { a: "blockade", n: 5, card: h[0].id })), "ナタ1ではナタ2のバリケードは取れない");
  H(c, a, { a: "blockade", n: 5, card: h[1].id });
  check(g.course.blockades[0].by === a && g.P[a].blockades.includes(5) && g.move.left === 1, "先駆者(3)でバリケード(2)を取り、残り1");
  H(c, a, { a: "move", card: h[1].id, to: "1,0" }); check(g.P[a].pieces[0] === "1,0", "残り1で先へ進む");
}
// 購入
{
  const { c, g } = mk(); const a = g.order[0];
  const h = setHand(g, a, ["traveler", "traveler", "explorer", "chest"]);
  check(/足りません/.test(H(c, a, { a: "buy", k: "trailblazer", cards: [h[0].id, h[1].id] })), "2コインでは先駆者(3)は買えない");
  check(/足りません/.test(H(c, a, { a: "buy", k: "trailblazer", cards: [h[0].id, h[1].id, h[2].id] })), "旅行者1+1+探検家0.5=2.5でも買えない");
}
{
  const { c, g } = mk(); const a = g.order[0];
  const h = setHand(g, a, ["traveler", "traveler", "explorer", "sailor"]);
  const e = H(c, a, { a: "buy", k: "trailblazer", cards: h.map((x) => x.id) });
  check(e === undefined && g.P[a].discard.some((x) => x.k === "trailblazer"), "旅行者1+1+探検家0.5+水夫0.5=3で先駆者を買う");
  check(/1枚/.test(H(c, a, { a: "buy", k: "scout", cards: [] }) || ""), "1ターンに1枚まで");
}
{
  const { c, g } = mk(); const a = g.order[0];
  check(/空き/.test(H(c, a, { a: "buy", k: "pioneer", cards: setHand(g, a, ["millionaire", "traveler", "traveler", "traveler"]).map((x) => x.id) })), "市場に空きがなければ市場の外は買えない");
  g.market[0] = null;
  H(c, a, { a: "buy", k: "pioneer", cards: g.P[a].hand.map((x) => x.id) });
  check(g.market[0] && g.market[0].k === "pioneer" && g.market[0].n === 2 && !g.reserve.pioneer, "空きがあれば買えて、その山が市場に入る");
  check(g.P[a].gone.length === 0, "大富豪(アイテムではない)は除外されない");
}
{
  const { c, g } = mk(); const a = g.order[0];
  const h = setHand(g, a, ["chest", "explorer", "explorer", "explorer"]);
  H(c, a, { a: "buy", k: "trailblazer", cards: [h[0].id] });
  check(g.P[a].gone.length === 1 && !g.P[a].played.some((x) => x.k === "chest"), "宝箱(4コイン)を使ったら除外");
}
// アクション
{
  const { c, g } = mk(); const a = g.order[0];
  const h = setHand(g, a, ["travellog", "explorer", "explorer", "explorer"]);
  H(c, a, { a: "action", card: h[0].id });
  check(g.P[a].hand.length === 5 && g.pending && g.pending.max === 2 && g.P[a].gone.length === 1, "探検記録: 2枚引いて、自分は除外、除外の選択待ち");
  check(/先に/.test(H(c, a, { a: "end" })), "選択が終わるまでほかの操作はできない");
  H(c, a, { a: "trash", ids: [h[1].id, h[2].id] });
  check(g.P[a].hand.length === 3 && g.P[a].gone.length === 3 && !g.pending, "手札2枚を除外");
  const t = setHand(g, a, ["transmitter"]);
  g.market[5] = { k: "transmitter", n: 2 };
  H(c, a, { a: "action", card: t[0].id, k: "native" });
  check(g.P[a].discard.some((x) => x.k === "native") && g.reserve.native === 2, "電信機: 市場の外のカードも無料でもらえる");
}
{
  const { c, g } = mk(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1, 0], ["1,0", "w", 3, 1], ["-1,0", "m", 0]]);
  g.course.blockades = [{ n: 2, t: "v", v: 1, a: 0, b: 1, by: null }];
  place(g, a, "0,0");
  const h = setHand(g, a, ["native", "explorer"]);
  check(/進め/.test(H(c, a, { a: "action", card: h[0].id, to: "-1,0" }) || "") && g.P[a].pieces[0] === "0,0", "原住民でも山には入れない");
  H(c, a, { a: "action", card: h[0].id, to: "1,0" });
  check(g.P[a].pieces[0] === "1,0" && g.course.blockades[0].by === a, "原住民: 条件無視で1マス、バリケードも取れる");
}
// ゴールと最後のラウンド
{
  const { c, g, st } = mk(["a", "b", "c"]);
  tiny(g, [["0,0", "w", 1], ["1,0", "g", 1], ["5,5", "j", 1], ["6,5", "j", 1], ["7,7", "j", 1], ["8,7", "j", 1]]);
  const [x, y, z] = g.order;
  place(g, x, "5,5"); place(g, y, "0,0"); place(g, z, "7,7");
  H(c, x, { a: "end" });
  const h = setHand(g, y, ["sailor"]);
  H(c, y, { a: "move", card: h[0].id, to: "1,0" });
  check(g.P[y].done[0] && g.finalRound, "エルドラドに着くと最後のラウンド");
  H(c, y, { a: "end" });
  check(!st.finished && g.order[g.cur] === z, "ラウンドの最後の人まで続く");
  H(c, z, { a: "end" });
  check(st.finished && st.finished[y] === 100, "ラウンドが終わったら着いた人の勝ち");
}
// ---------------- 洞窟ルール ----------------
{
  const { c, g } = mk(["a", "b", "c"], { caves: true }); const a = g.order[0];
  // 洞窟 1,-1 のとなり: 0,0 / 1,0 / 2,-1(3,-1 はとなりではない)
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 1], ["2,0", "j", 1], ["2,-1", "j", 1], ["3,-1", "j", 1], ["1,-1", "m", 0, 0, { cave: true }]]);
  g.caveTok = { "1,-1": [{ id: 901, k: "j2" }, { id: 902, k: "draw" }, { id: 903, k: "pass" }, { id: 904, k: "change" }] };
  place(g, a, "0,0");
  const h = setHand(g, a, ["trailblazer", "explorer", "explorer", "explorer"]);
  H(c, a, { a: "move", card: h[0].id, to: "1,0" }); // 先駆者で通過中(残り2)
  check(!g.P[a].tokens.length, "洞窟のとなりを通過中はもらえない");
  H(c, a, { a: "stop" });
  check(g.P[a].tokens.length === 1 && g.P[a].tokens[0].k === "j2", "洞窟のとなりで止まったら1つもらう");
  H(c, a, { a: "move", card: h[1].id, to: "2,-1" });
  check(g.P[a].tokens.length === 1, "同じ洞窟のとなりを移っても、もうもらえない");
  H(c, a, { a: "move", card: h[2].id, to: "3,-1" });
  H(c, a, { a: "move", card: h[3].id, to: "2,-1" });
  check(g.P[a].tokens.length === 2 && g.P[a].tokens[1].k === "draw", "一度離れてから止まると、また1つもらえる");
  // 記号トークンで進む・1枚引く
  const nh = setHand(g, a, ["explorer"]);
  H(c, a, { a: "token", id: 902 });
  check(g.P[a].hand.length === 2 && g.P[a].tokens.length === 1, "1枚引くトークン");
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 2], ["2,0", "v", 1]]); place(g, a, "0,0");
  H(c, a, { a: "move", token: 901, to: "1,0" });
  check(g.P[a].pieces[0] === "1,0" && !g.P[a].tokens.length && g.tokBox.length === 2, "ナタ2のトークンで進む(使ったら箱へ)");
}
{
  const { c, g } = mk(["a", "b", "c"], { caves: true }); const a = g.order[0];
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 1], ["2,0", "w", 3]]); place(g, a, "0,0"); g.P[g.order[1]].pieces = ["1,0"];
  g.P[a].tokens = [{ id: 801, k: "pass" }, { id: 802, k: "change" }, { id: 803, k: "v2" }, { id: 804, k: "swap" }, { id: 805, k: "trash" }, { id: 806, k: "keep" }];
  const h = setHand(g, a, ["trailblazer", "explorer", "giant", "traveler"]);
  H(c, a, { a: "token", id: 801 });
  check(H(c, a, { a: "move", card: h[1].id, to: "1,0" }) === undefined && g.P[a].pieces[0] === "1,0", "すり抜け: ほかのコマのマスに入れる");
  H(c, a, { a: "token", id: 802 });
  check(H(c, a, { a: "move", card: h[0].id, to: "2,0" }) === undefined && g.P[a].pieces[0] === "2,0", "記号変更: 先駆者(ナタ3)をパドル3として使う");
  H(c, a, { a: "buy", k: "trailblazer", cards: [h[3].id], tokens: [803] });
  check(g.bought && g.P[a].discard.some((x) => x.k === "trailblazer"), "コイン2のトークン+旅行者1で3コイン");
  g.bought = false; g.P[a].hand.push({ id: 7001, k: "explorer" }, { id: 7002, k: "explorer" });
  H(c, a, { a: "token", id: 804, cards: [7001, 7002] });
  check(g.P[a].hand.length === 3 && g.P[a].played.some((x) => x.id === 7001), "入れ替え: 2枚を場に出して2枚引く");
  const x = g.P[a].hand[0]; H(c, a, { a: "token", id: 805, card: x.id });
  check(!g.P[a].hand.includes(x) && g.P[a].gone.includes(x), "除外トークン: 手札1枚をゲームから除外");
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 6]]); place(g, a, "0,0"); g.bought = false;
  const gi = g.P[a].hand.find((y) => y.k === "giant") || (g.P[a].hand.push({ id: 7003, k: "giant" }), g.P[a].hand.at(-1));
  H(c, a, { a: "move", card: gi.id, to: "1,0" });
  check(g.P[a].gone.some((y) => y.k === "giant"), "大きなナタを使うと除外");
  H(c, a, { a: "token", id: 806 });
  check(!g.P[a].gone.some((y) => y.id === gi.id) && g.P[a].played.some((y) => y.id === gi.id), "アイテム温存: 除外せず場へ(捨て札へ行く)");
}
// ---------------- 英雄と呪い ----------------
function hh(ids = ["a", "b", "c"]) { const r = mk(ids, { course: "journey" }); r.g.curses = []; r.g.curseBox = []; return r; }
const giveCurses = (g, ks) => { g.curses = ks.map((k) => ({ id: ++g.uid, k })); };
{
  const { c, g } = hh(); const [a, b] = g.order;
  tiny(g, [["0,0", "j", 1], ["1,0", "d", 2], ["2,0", "j", 1], ["3,0", "j", 1]]); place(g, a, "0,0");
  giveCurses(g, ["torment", "lethJ"]);
  const h = setHand(g, a, ["explorer", "scout", "trailblazer", "traveler"]);
  H(c, a, { a: "demon", to: "1,0" });
  check(g.P[a].pieces[0] === "1,0" && g.P[a].discard.some((x) => x.k === "demon") && g.demons === 14, "魔物マス(2): 呪い2枚。苦痛で魔物カードが捨て札に");
  check(g.P[a].curses.length === 1 && /ナタ/.test(H(c, a, { a: "move", card: h[0].id, to: "2,0" })), "不調(ナタ): ナタが使えない");
  check(/2以上/.test(H(c, a, { a: "lift", curse: g.P[a].curses[0].id, cards: [h[0].id] })), "不調(ナタ)は ナタ2以上を捨てないと解けない");
  H(c, a, { a: "lift", curse: g.P[a].curses[0].id, cards: [h[1].id] });
  check(!g.P[a].curses.length && H(c, a, { a: "move", card: h[2].id, to: "2,0" }) === undefined, "偵察者(ナタ2)を捨てて解き、また進める");
}
{
  const { c, g } = hh(); const [a, b] = g.order;
  tiny(g, [["0,0", "j", 1], ["1,0", "d", 1], ["2,0", "j", 1], ["3,0", "j", 1], ["1,1", "j", 1]]); place(g, a, "0,0"); place(g, b, "3,0");
  giveCurses(g, ["voodoo"]);
  H(c, a, { a: "demon", to: "1,0" });
  check(g.steps && g.steps.kind === "voodoo" && g.steps.mover === b && g.steps.owner === a, "呪術: 左どなり(次の手番の人)があなたのコマを動かす");
  check(/ほかの人/.test(H(c, a, { a: "end" })), "動かし終わるまで待つ");
  check(/動かせるマス/.test(H(c, b, { a: "stepDone" })), "動かせるのに途中でやめることはできない");
  H(c, b, { a: "step", to: "2,0" }); H(c, b, { a: "step", to: "1,0" });
  check(!g.steps && g.P[a].pieces[0] === "1,0", "2回動かして終わり(空いているマスだけ)");
}
{
  const { c, g } = hh(); const [a, b, d] = g.order;
  tiny(g, [["0,0", "j", 1], ["1,0", "d", 1], ["5,0", "j", 1], ["6,0", "j", 1], ["8,0", "j", 1], ["9,0", "j", 1]]); place(g, a, "0,0"); place(g, b, "5,0"); place(g, d, "8,0");
  giveCurses(g, ["paralysis"]);
  H(c, a, { a: "demon", to: "1,0" });
  check(g.steps && g.steps.kind === "paralysis" && g.steps.mover === b, "昏睡: ほかの人が順番に自分のコマを動かせる");
  H(c, b, { a: "step", to: "6,0" });
  check(g.steps && g.steps.mover === d, "次の人へ");
  H(c, d, { a: "stepDone" });
  check(!g.steps && g.P[b].pieces[0] === "6,0" && g.P[d].pieces[0] === "8,0", "動かさなくてもよい");
}
{
  const { c, g } = hh(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1], ["1,0", "d", 1]]); place(g, a, "0,0");
  giveCurses(g, ["misfortune"]); g.P[a].tokens = [{ id: 501, k: "protect" }];
  H(c, a, { a: "demon", to: "1,0" });
  check(g.pending && g.pending.type === "protect", "呪いよけ: 呪いを見てから防ぐか決める");
  H(c, a, { a: "protect", yes: true });
  check(!g.P[a].curses.length && !g.P[a].tokens.length, "呪いよけで不運を防いだ");
  giveCurses(g, ["misfortune", "misery", "cavefever"]); g.P[a].pieces = ["0,0"];
  tiny(g, [["0,0", "j", 1], ["1,0", "d", 3], ["2,0", "j", 1]]); place(g, a, "0,0");
  H(c, a, { a: "demon", to: "1,0" });
  const h = setHand(g, a, ["explorer", "explorer", "native", "scout"]);
  check(/不運/.test(H(c, a, { a: "move", card: h[3].id, to: "2,0" })), "不運: カードが使えない");
  H(c, a, { a: "lift", curse: g.P[a].curses.find((x) => x.k === "misfortune").id, cards: [h[0].id, h[1].id] });
  check(/苦悩/.test(H(c, a, { a: "action", card: h[2].id, to: "2,0" })), "苦悩: 紫のカードが使えない");
  H(c, a, { a: "lift", curse: g.P[a].curses.find((x) => x.k === "misery").id, cards: [h[2].id] });
  g.P[a].tokens = [{ id: 502, k: "draw" }, { id: 503, k: "draw" }];
  check(/洞窟恐怖症/.test(H(c, a, { a: "token", id: 502 })), "洞窟恐怖症: トークンが使えない");
  H(c, a, { a: "lift", curse: g.P[a].curses.find((x) => x.k === "cavefever").id, tokens: [502] });
  check(!g.P[a].curses.length && H(c, a, { a: "token", id: 503 }) === undefined, "トークン1つを箱へ戻して解き、使えるようになる");
}
{
  const { c, g } = hh(); const a = g.order[0];
  // トンネル: 同じタイルのトンネル同士はとなり
  tiny(g, [["0,0", "j", 1], ["1,0", "t", 1], ["9,0", "t", 2], ["10,0", "j", 1]]); place(g, a, "0,0");
  giveCurses(g, ["torment", "torment", "torment"]);
  H(c, a, { a: "demon", to: "1,0" });
  check(H(c, a, { a: "demon", to: "9,0" }) === undefined && g.P[a].pieces[0] === "9,0" && g.P[a].discard.filter((x) => x.k === "demon").length === 3, "トンネルで離れたトンネルへ(着いた先の呪いも引く)");
}
{
  const { c, g } = hh(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1, 0], ["1,0", "j", 1, 1]]); g.course.blockades = [{ n: 7, t: "d", v: 1, a: 0, b: 1, by: null }]; place(g, a, "0,0");
  giveCurses(g, ["torment"]);
  H(c, a, { a: "blockade", n: 7 });
  check(g.course.blockades[0].by === a && g.P[a].discard.some((x) => x.k === "demon"), "魔物バリケード: 呪いを1枚引いて取り除く");
}
{
  const { c, g } = hh(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1], ["1,0", "v", 1, 0, { tavern: true }], ["2,0", "v", 1, 0, { tavern: true }]]); place(g, a, "0,0");
  g.heroes = ["nathan", "lara", "henry", "mary"];
  g.P[a].hand = []; const h = setHand(g, a, ["traveler", "traveler"]);
  H(c, a, { a: "move", card: h[0].id, to: "1,0" });
  check(g.pending && g.pending.type === "hero" && g.pending.opts.length === 3, "酒場で止まったら英雄を3枚から選ぶ");
  H(c, a, { a: "hero", k: "lara" });
  check(g.P[a].hand.some((x) => x.k === "lara") && g.heroes.length === 3 && g.P[a].hero, "選んだ英雄は手札へ。残り2枚は戻す");
  H(c, a, { a: "move", card: h[1].id, to: "2,0" });
  check(!g.pending, "英雄は1人1枚まで");
}
{
  const { c, g } = hh(); const [a, b, d] = g.order;
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 1], ["2,0", "w", 2], ["3,0", "d", 1], ["4,0", "j", 3], ["0,1", "m", 0], ["5,0", "j", 1], ["6,0", "j", 1], ["7,0", "j", 1]]); place(g, a, "0,0"); place(g, b, "5,0"); place(g, d, "7,0");
  let h = setHand(g, a, ["nathan"]);
  H(c, a, { a: "action", card: h[0].id });
  check(g.steps && g.steps.kind === "nathan" && g.steps.left === 3, "ネイサン: 3回まで進む");
  check(/動かせません/.test(H(c, a, { a: "step", to: "2,0" })) && g.steps.left === 3, "記号2つのマスへは行けない");
  H(c, a, { a: "step", to: "1,0" }); H(c, a, { a: "stepDone" });
  check(!g.steps && g.P[a].pieces[0] === "1,0", "途中でやめられる");
  h = setHand(g, a, ["gertrude"]);
  H(c, a, { a: "action", card: h[0].id });
  for (const to of ["2,0", "3,0", "4,0", "5,0"]) H(c, a, { a: "step", to });
  check(g.P[a].pieces[0] === "5,0" && !g.curses.length && g.P[a].gone.some((x) => x.k === "gertrude"), "ガートルード: 条件無視(魔物マスで呪い無し)・ほかのコマのマスも可、使ったら除外");
  H(c, a, { a: "stepDone" });
  h = setHand(g, a, ["lara"]); place(g, a, "1,0");
  H(c, a, { a: "action", card: h[0].id });
  check(g.steps && g.steps.kind === "lara" && g.steps.mover === a && g.steps.owner === b, "ララ: ほかの人のコマを動かす");
  H(c, a, { a: "step", to: "4,0" }); H(c, a, { a: "step", to: "6,0" });
  check(g.P[b].pieces[0] === "4,0" && g.P[d].pieces[0] === "6,0" && !g.steps, "全員のコマを1マスずつ");
  h = setHand(g, a, ["isabella"]);
  H(c, a, { a: "action", card: h[0].id, to: "0,1" });
  check(g.P[a].pieces[0] === "0,1", "イザベラ: 空いている山にも入れる");
}
{
  const { c, g } = hh(); const a = g.order[0];
  let h = setHand(g, a, ["henry", "magellan"]);
  H(c, a, { a: "action", card: h[0].id, k: "scout" });
  check(g.P[a].deck.at(-1).k === "scout" && g.market[0].n === 2 && !g.bought, "ヘンリー: 市場のカードを山札の一番上へ(購入ではない)");
  g.supply = [{ id: 601, k: "draw" }];
  H(c, a, { a: "action", card: h[1].id });
  const n = g.P[a].hand.length;
  H(c, a, { a: "token", id: 601 });
  check(g.P[a].tokens.some((x) => x.id === 601) && g.P[a].hand.length === n + 1, "マゼラン博士: 控えからトークン、その直後の1つはなくならない");
  g.P[a].hand.push({ id: 6001, k: "demon" }, { id: 6002, k: "demon" });
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 3]]); place(g, a, "0,0");
  h = setHand(g, a, ["mary", "demon", "demon", "explorer"]);
  H(c, a, { a: "move", card: h[0].id, to: "1,0" });
  check(g.pending && g.pending.only === "demon", "メアリー: 手札の魔物カードを除外できる");
  H(c, a, { a: "trash", ids: [h[1].id, h[2].id, h[3].id] });
  check(g.P[a].hand.length === 1 && g.P[a].hand[0].k === "explorer" && g.demons === 17, "魔物カードだけ除外(魔物の山へ戻る)");
}
{
  const { c, g } = hh(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1], ["1,0", "v", 3], ["2,0", "j", 4], ["0,1", "m", 0]]); place(g, a, "0,0");
  const h = setHand(g, a, ["polly", "leroy", "geologist", "caveexp"]);
  check(/足りません/.test(H(c, a, { a: "move", card: h[0].id, to: "1,0" })), "ポリー: ふだんはコイン1");
  H(c, a, { a: "move", card: h[0].id, to: "1,0", boost: true });
  check(g.P[a].pieces[0] === "1,0" && g.P[a].gone.some((x) => x.k === "polly"), "ポリー: 特殊能力でコイン3、使ったら除外");
  H(c, a, { a: "move", card: h[1].id, to: "2,0", boost: true });
  check(g.P[a].pieces[0] === "2,0", "リロイ: 特殊能力でナタ4");
  place(g, a, "1,0"); tiny(g, [["1,0", "j", 1], ["1,1", "m", 0], ["0,1", "d", 2]]); place(g, a, "1,0");
  H(c, a, { a: "action", card: h[2].id, to: "1,1" });
  check(g.P[a].pieces[0] === "1,1", "地質学者: 空いている山へ");
  g.supply = [{ id: 701, k: "pass" }];
  H(c, a, { a: "action", card: h[3].id });
  check(g.P[a].tokens.some((x) => x.id === 701), "洞窟探検家: 控えから洞窟トークン");
}
{
  const { c, g } = hh(); const a = g.order[0];
  tiny(g, [["0,0", "j", 1], ["1,0", "j", 5], ["2,0", "w", 5]]); place(g, a, "0,0");
  giveCurses(g, ["torment"]);
  const h = setHand(g, a, ["shaman"]);
  H(c, a, { a: "action", card: h[0].id });
  H(c, a, { a: "step", to: "1,0" }); H(c, a, { a: "step", to: "2,0" });
  check(g.P[a].pieces[0] === "2,0" && g.P[a].discard.some((x) => x.k === "demon"), "シャーマン: 2マス進んでから呪いを1枚");
  g.bought = false; g.market[2] = null; g.P[a].tokens = [{ id: 711, k: "market" }];
  setHand(g, a, ["millionaire", "traveler"]);
  check(/空き/.test(H(c, a, { a: "buy", k: "shaman", cards: g.P[a].hand.map((x) => x.id) }) || "x") === false, "市場に空きがあれば買える(確認)");
  g.market[2] = { k: "jack", n: 1 }; g.bought = false;
  setHand(g, a, ["millionaire", "traveler"]);
  H(c, a, { a: "buy", k: "geologist", cards: g.P[a].hand.map((x) => x.id), access: 711 });
  check(g.P[a].discard.some((x) => x.k === "geologist") && g.reserve.geologist === 2 && !g.market.some((s) => s && s.k === "geologist"), "市場への道: 空きがなくても市場の外を買える(山は動かない)");
}
// 時間切れ: ほかの人の入力待ちは自動で片づく
{
  const { c, g, st, fire } = hh(); const [a, b] = g.order;
  tiny(g, [["0,0", "j", 1], ["1,0", "d", 1], ["2,0", "j", 1], ["3,0", "j", 1]]); place(g, a, "0,0");
  giveCurses(g, ["voodoo"]);
  H(c, a, { a: "demon", to: "1,0" });
  check(st.ms === 20000, "ほかの人の入力待ちは20秒");
  fire();
  check(!g.steps && g.P[a].pieces[0] !== "1,0" && g.order[g.cur] === a, "時間切れで自動で動かす(手番はそのまま)");
}
// たくさん遊んで決着(ゴールに近づく手を選ぶ簡単なプレイヤー)
function sim(n, cfg) {
  const ids = ["p1", "p2", "p3", "p4"].slice(0, 2 + (n % 3));
  const { c, g, st } = mk(ids, cfg);
  const dist = {};
  let guard = 0, errs = 0;
  while (!st.finished && guard++ < 3000) {
    const id = g.order[g.cur], p = g.P[id];
    const mx = { j: 0, w: 0, v: 0 };
    for (const x of [...p.deck, ...p.discard, ...p.hand]) for (const s of core.CARDS[x.k].s || []) mx[s] = Math.max(mx[s], core.CARDS[x.k].p);
    const ok = (h) => h.t === "r" || h.t === "c" || h.t === "d" || h.t === "t" || (h.t === "g" ? mx[h.sym] >= 1 : mx[h.t] >= h.v);
    for (const k2 in dist) delete dist[k2];
    { const q2 = [...g.course.goals]; for (const k2 of q2) dist[k2] = 0; while (q2.length) { const k2 = q2.shift(); for (const nn of nbs(k2)) { const h = g.course.hex[nn]; if (h && dist[nn] == null && h.t !== "m") { dist[nn] = dist[k2] + 1; if (h.t !== "s" && ok(h)) q2.push(nn); } } } }
    for (let k = 0; k < 16 && !st.finished; k++) {
      if (g.pending || g.steps) {
        if ((g.pending && g.pending.pid !== id) || (g.steps && g.steps.mover !== id)) { T.autoResolve(c); continue; }
        if (g.pending) { const pd = g.pending; if (pd.type === "trash") H(c, id, { a: "trash", ids: p.hand.filter((x) => x.k === "demon" || (!pd.only && (x.k === "traveler" || x.k === "explorer"))).slice(0, pd.max).map((x) => x.id) }); else if (pd.type === "hero") H(c, id, { a: "hero", k: pd.opts[0] }); else H(c, id, { a: "protect", yes: true }); continue; }
        const tg = T.stepTargets(g, g.steps).filter((x) => dist[x] != null).sort((x, y) => dist[x] - dist[y]);
        if (tg.length && dist[tg[0]] < dist[g.P[g.steps.owner].pieces[g.steps.piece]]) H(c, id, { a: "step", to: tg[0] }); else if (H(c, id, { a: "stepDone" })) T.autoResolve(c);
        continue;
      }
      // 呪いを解く
      for (const cu of [...p.curses]) {
        const d = core.CURSES[cu.k];
        if (cu.k === "misfortune" && p.hand.length >= 3) H(c, id, { a: "lift", curse: cu.id, cards: p.hand.slice(0, 2).map((x) => x.id) });
        else if (cu.k === "cavefever" && p.tokens.length) H(c, id, { a: "lift", curse: cu.id, tokens: [p.tokens[0].id] });
        else if (cu.k === "misery") { const x = p.hand.find((y) => core.CARDS[y.k].a); if (x) H(c, id, { a: "lift", curse: cu.id, cards: [x.id] }); }
        else if (d.sym) { const x = p.hand.find((y) => (core.CARDS[y.k].s || []).includes(d.sym) && core.CARDS[y.k].p >= d.need); if (x) H(c, id, { a: "lift", curse: cu.id, cards: [x.id] }); }
      }
      let did = false;
      for (let pi = 0; pi < p.pieces.length && !did; pi++) {
        if (p.done[pi]) continue;
        const from = g.move ? p.pieces[g.move.piece] : p.pieces[pi];
        for (const b of g.course.blockades) if (!b.by) { const before = b.by; if (b.t === "d") H(c, id, { a: "blockade", n: b.n, piece: pi }); else for (const card of [...p.hand]) { if (b.by) break; H(c, id, { a: "blockade", n: b.n, card: card.id, piece: pi, cards: p.hand.slice(0, b.v).map((x) => x.id) }); } if (b.by && !before) did = true; }
        const better = T.neighbors(g, from).filter((x) => dist[x] != null && (dist[x] < dist[from] || (k > 7 && Math.random() < 0.35 && dist[x] <= dist[from] + 1))).sort((x, y) => dist[x] - dist[y]);
        for (const to of better) {
          const h = g.course.hex[to];
          if (h.t === "d" || h.t === "t") { if (!H(c, id, { a: "demon", to, piece: pi })) { did = true; break; } continue; }
          if (h.t === "r" || h.t === "c") { if (p.hand.length >= h.v + 1 && !H(c, id, { a: "enterCards", to, piece: pi, cards: p.hand.slice(0, h.v).map((x) => x.id) })) { did = true; break; } continue; }
          const cand = g.move ? [g.move.token != null ? { token: g.move.token } : { card: g.move.card }] : [...p.hand.map((x) => ({ card: x.id })), ...p.tokens.filter((t) => core.TOKENS[t.k].s).map((t) => ({ token: t.id }))];
          for (const src of cand) if (!H(c, id, { a: "move", ...src, to, piece: pi })) { did = true; break; }
          if (did) break;
        }
      }
      if (!did) {
        const act = p.hand.find((x) => core.CARDS[x.k].a);
        if (act && !H(c, id, { a: "action", card: act.id, k: "pioneer" })) continue;
        const tk = p.tokens.find((t) => ["draw", "pass", "change"].includes(t.k));
        if (tk && !H(c, id, { a: "token", id: tk.id })) continue;
        break;
      }
    }
    if (st.finished) break;
    if (g.pending || g.steps) T.autoResolve(c);
    if (!g.bought) for (const k of [...(mx.w < 2 ? ["captain", "jack", "hunter", "adventurer", "native"] : []), ...(mx.v < 2 ? ["photographer"] : []), "pioneer", "millionaire", "adventurer", "captain", "trailblazer", "journalist", "scout", "photographer", "jack"]) if (!H(c, id, { a: "buy", k, cards: p.hand.map((x) => x.id), tokens: p.tokens.filter((t) => core.TOKENS[t.k].s === "v").map((t) => t.id) })) break;
    const e = H(c, id, { a: "end", keep: [] });
    if (e === undefined && g.order[g.cur] === id && !st.finished && g.order.length > 1 && (g.pending || g.steps)) T.autoResolve(c), H(c, id, { a: "end", keep: [] });
    if (!cfg.hh && !cfg.caves) {
      const pos = g.order.flatMap((i) => g.P[i].pieces.filter((_, k) => !g.P[i].done[k]));
      if (new Set(pos).size !== pos.length) { errs++; break; }
      if (pos.some((k) => g.course.hex[k].t === "m")) { errs++; break; }
    }
    // カードの枚数が保存されている(どこかへ消えたり増えたりしない)
    for (const i of g.order) { const P = g.P[i]; const all = [...P.deck, ...P.discard, ...P.hand, ...P.played].map((x) => x.id); if (new Set(all).size !== all.length) errs++; }
  }
  return { ended: !!st.finished, turns: g.turnNo, errs };
}
for (const [label, list, cfgOf] of [
  ["基本(7コース)", ["first", "home", "hills", "winding", "serpentine", "witch", "swamp"], (k) => ({ course: k })],
  ["洞窟ルール", ["first", "home", "hills", "winding", "serpentine", "witch", "swamp"], (k) => ({ course: k, caves: true })],
  ["英雄と呪い(13コース)", Object.keys(core.COURSES).filter((k) => core.COURSES[k].exp !== "gt"), (k) => ({ course: k, hh: true })],
]) {
  let ended = 0, turns = 0, maxT = 0, errs = 0; const N = 84;
  for (let n = 0; n < N; n++) { const r = sim(n, cfgOf(list[n % list.length])); if (r.ended) ended++; turns += r.turns; maxT = Math.max(maxT, r.turns); errs += r.errs; }
  check(ended >= N * 0.95 && !errs, `${label}: ${ended}/${N} 回が決着(平均${Math.round(turns / N)}ラウンド・最長${maxT})・不整合${errs}`);
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
