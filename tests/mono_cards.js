const core = require("../games/mini/monopoly.js"), T = core._test;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk() { const c = { g: null, members: () => ["a", "b", "c"], live: () => ["a", "b", "c"], has: () => true, nameOf: (x) => x, setTimer() {}, clearTimer() {}, finish() {} }; core.start(c, {}); return c; }
const card = (kind, k, pos, setup) => { const c = mk(), g = c.g, id = g.order[0]; g.P[id].pos = pos; if (setup) setup(g, id); g.decks[kind] = [k, ...g.decks[kind].filter((x) => x !== k)]; T.drawCard(c, id, kind); return { c, g, id, others: g.order.slice(1) }; };
{ const { g, id } = card("chance", 0, 7); check(g.P[id].pos === 0 && g.P[id].cash === 1700, "チャンス: スタートへ(+200)"); }
{ const { g, id } = card("chance", 1, 36); check(g.P[id].pos === 24 && g.P[id].cash === 1700 && g.step !== "x" && g.pending === 24, "赤3へ(スタート通過+200、空き地なので購入待ち)"); }
{ const { g, id } = card("chance", 4, 7, (g, id) => { g.own[15].owner = g.order[1]; }); check(g.P[id].pos === 15 && g.P[id].cash === 1500 - 50 && g.P[g.order[1]].cash === 1550, "最寄りの駅: 通常の2倍(25×2)"); }
{ const { g, id } = card("chance", 3, 36, (g) => { g.own[12].owner = g.order[1]; }); const paid = 1500 + 200 - g.P[id].cash; check(g.P[id].pos === 12 && paid >= 20 && paid <= 120 && paid % 10 === 0, `最寄りの公共会社: 振り直して10倍(${paid})`); }
{ const { g, id } = card("chance", 7, 7); check(g.P[id].jailCards.length === 1 && !g.decks.chance.includes(7), "刑務所カードは手元へ(山札から抜ける)"); }
{ const { g, id } = card("chance", 8, 36, (g) => { g.decks.chest = [15, ...g.decks.chest.filter((x) => x !== 15)]; }); check(g.P[id].pos === 33, "3マス戻る(36→33 共同基金も引く)"); }
{ const { g, id } = card("chance", 9, 7); check(g.P[id].pos === 10 && g.P[id].jailed && g.P[id].cash === 1500, "刑務所へ(200万なし)"); }
{ const { g, id } = card("chance", 10, 7, (g, id) => { g.own[1].owner = id; g.own[3].owner = id; g.own[1].houses = 2; g.own[3].houses = 5; }); check(g.P[id].cash === 1500 - 50 - 100, "修理: 家25×2+ホテル100"); }
{ const { g, id, others } = card("chance", 14, 7); check(g.P[id].cash === 1400 && others.every((o) => g.P[o].cash === 1550), "議長: 全員に50"); }
{ const { g, id, others } = card("chest", 8, 2, (g) => { g.P[g.order[2]].cash = 5; }); check(g.P[id].cash === 1510 && g.debts.length === 1 && g.debts[0].pid === g.order[2], "誕生日: 払えない人は借金になる"); }
{ const { g, id } = card("chance", 13, 7); check(g.P[id].pos === 39 && g.P[id].cash === 1500, "最高級地へ(通過なし)"); }
// スタート通過・刑務所マス・ゾロ目3回
{ const c = mk(), g = c.g, id = g.order[0]; g.P[id].pos = 38; T.advance(c, id, 3); check(g.P[id].pos === 1 && g.P[id].cash === 1700, "スタート通過で+200"); }
{ const c = mk(), g = c.g, id = g.order[0]; g.P[id].pos = 25; T.advance(c, id, 5); check(g.P[id].jailed && g.P[id].pos === 10, "「刑務所へ」マス"); }
{ const c = mk(), g = c.g, id = g.order[0]; g.P[id].pos = 2; T.advance(c, id, 2); check(g.P[id].cash === 1300, "所得税200"); }
console.log(fails ? `NG ${fails}件` : "全項目OK");
