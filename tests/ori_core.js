// オリフラムのルール本体(games/mini/oriflamme.js)のテスト。ブラウザもサーバも使わない
const core = require("../games/mini/oriflamme.js"), T = core._t;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function seeded(s) { return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
function mk(ids, cfg = {}, seed = 1) {
  const st = { timer: null, finished: null, ms: 0 };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  core.start(c, cfg, seeded(seed));
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const H = (c, id, m) => core.handle(c, id, m);
// 列を直接つくって、解決フェーズから始める。spec: [[種類, 持ち主, 表向き?, 上の影響力], ...] を山ごとに(後ろが上)
let cid = 1000;
function scene(ids, spec, inf = {}) {
  const t = mk(ids), g = t.g;
  g.queue = spec.map((cards, i) => ({ id: 500 + i, cards: cards.map(([k, owner, up = false, n = 0]) => ({ id: cid++, k, owner, up, inf: n })) }));
  for (const id of ids) g.P[id].inf = inf[id] ?? 1;
  g.step = "resolve"; g.round = 1; g.res = { done: [], right: g.queue.map((s) => s.id), cur: null };
  T.advance(t.c);
  return t;
}
const tops = (g) => g.queue.map((s) => s.cards[s.cards.length - 1].k + ":" + s.cards[s.cards.length - 1].owner).join(" ");

// ---- 始まり ----
{
  const { c, g } = mk(["a", "b", "c"]);
  check(Object.values(g.P).every((p) => p.hand.length === 7 && new Set(p.hand.map((x) => x.k)).size === 7 && p.inf === 1), "10種類から7枚(重複なし)・影響力1で始まる");
  check(g.step === "place" && g.round === 1 && g.toPlace.length === 3 && g.toPlace[0] === g.order[g.first], "ラウンド1の配置から・先手から順に");
  const first = g.toPlace[0], other = g.toPlace[1];
  check(H(c, other, { a: "place", card: g.P[other].hand[0].id, where: "L" }) === "あなたが置く番ではありません", "順番以外は置けない");
  check(H(c, first, { a: "place", card: 99999, where: "L" }) === "手札のカードを選んでください", "手札にないカードは置けない");
  H(c, first, { a: "place", card: g.P[first].hand[0].id, where: "L" });
  const sid = g.queue[0].id;
  check(H(c, other, { a: "place", card: g.P[other].hand[0].id, where: sid }) === "左端・右端、または自分のカードの上を選んでください", "ほかの人のカードの上には置けない");
  H(c, other, { a: "place", card: g.P[other].hand[0].id, where: "R" });
  const third = g.toPlace[0];
  const v = core.view(c, other);
  check(v.queue[0].top.k === null && v.queue[1].top.k !== null, "ほかの人の伏せたカードは見えない・自分のは見える");
  H(c, third, { a: "place", card: g.P[third].hand[0].id, where: "L" });
  check(g.step === "resolve" && g.pending && g.pending.type === "reveal" && g.pending.sid === g.queue[0].id, "全員置いたら左から解決(公開するか選ぶ)");
}
// ---- 伏せたまま → 影響力がたまる。公開でもらえる ----
{
  const { c, g } = scene(["a", "b"], [[["lord", "a"]], [["heir", "b"]]]);
  H(c, "a", { a: "decide", reveal: false });
  check(g.queue[0].cards[0].inf === 1 && g.pending.by === "b", "伏せたまま → カードの上に影響力1、次の山へ");
  H(c, "b", { a: "decide", reveal: true });
  check(g.P.b.inf === 3, "後継者を公開: ほかに表向きの後継者がいなければ+2");
}
// ---- 領主: +1 と となりの自分のカード ----
{
  const { c, g } = scene(["a", "b"], [[["heir", "a", true]], [["lord", "a"]], [["spy", "a"]], [["soldier", "b", true]]]);
  // 後継者(表向き)は自動で+2
  check(g.P.a.inf === 3 && g.pending.sid === 501, "表向きのカードは毎ラウンド能力を使う(後継者+2)");
  H(c, "a", { a: "decide", reveal: true });
  check(g.P.a.inf === 3 + 1 + 2, "領主: +1、となりの自分のカード2枚で+2");
}
// ---- 後継者が2枚表向き → どちらも何も起きない ----
{
  const { g } = scene(["a", "b"], [[["heir", "a", true]], [["heir", "b", true]]]);
  check(g.P.a.inf === 1 && g.P.b.inf === 1 && g.step === "place", "後継者が2枚とも表向きなら何も起きない");
}
// ---- 兵士: となりを排除して+1、上の影響力はなくなる ----
{
  const { c, g } = scene(["a", "b", "c"], [[["lord", "b", false, 3]], [["soldier", "a"]], [["spy", "c", false, 2]]]);
  H(c, "b", { a: "decide", reveal: false });
  H(c, "a", { a: "decide", reveal: true });
  check(g.pending.type === "target" && g.pending.options.join() === "500,502", "兵士: となり2枚から選ぶ");
  check(H(c, "a", { a: "target", sid: 999 }) === "光っているカードから選んでください", "対象外は選べない");
  H(c, "a", { a: "target", sid: 502 });
  check(g.P.a.inf === 2 && g.P.c.discard.includes("spy") && g.queue.length === 2, "排除: 排除した人+1・カードは捨て札へ(上の影響力2はなくなる)");
}
// ---- 弓兵: 先頭か最後尾 ----
{
  const { c, g } = scene(["a", "b"], [[["archer", "a"]], [["lord", "b"]], [["heir", "b"]]]);
  H(c, "a", { a: "decide", reveal: true });
  check(g.queue.length === 2 && g.queue[1].cards[0].k === "lord" && g.P.a.inf === 2, "弓兵: 自分が先頭なら対象は最後尾だけ(1つなので自動)");
}
{
  const { c, g } = scene(["a", "b"], [[["lord", "b", true]], [["archer", "a"]], [["heir", "b"]]]);
  H(c, "a", { a: "decide", reveal: true });
  check(g.pending && g.pending.options.join() === "500,502", "弓兵: 先頭と最後尾から選ぶ");
}
{
  // 対象が1つだけなら自動
  const { c, g } = scene(["a", "b"], [[["archer", "a"]], [["lord", "b"]]]);
  H(c, "a", { a: "decide", reveal: true });
  check(g.queue.length === 1 && g.P.a.inf === 2, "対象が1つだけなら自動で使う");
}
// ---- 待ち伏せ(公式ルールブックの例どおり) ----
{
  // 相手の兵士が排除: 兵士の持ち主は排除で+1、待ち伏せの持ち主は+4。兵士も待ち伏せも(上の影響力ごと)捨てる
  const { c, g } = scene(["a", "b"], [[["soldier", "a"]], [["ambush", "b", false, 3]]]);
  H(c, "a", { a: "decide", reveal: true });
  check(g.P.a.inf === 2 && g.P.b.inf === 5 && g.queue.length === 0 && g.P.a.discard.includes("soldier") && g.P.b.discard.includes("ambush"), "相手の待ち伏せを排除: 排除した人+1・待ち伏せの持ち主+4・両方捨てる");
}
{
  // 自分の兵士が自分の待ち伏せを排除: 排除で+1、自分で公開した扱いで+1 = +2。両方捨てる
  const { c, g } = scene(["a", "b"], [[["soldier", "a"]], [["ambush", "a", false, 2]]]);
  H(c, "a", { a: "decide", reveal: true });
  check(g.P.a.inf === 3 && g.queue.length === 0 && g.P.a.discard.filter((k) => k === "soldier" || k === "ambush").length === 2, "自分の待ち伏せを排除: +2(排除+1・公開+1)・両方捨てる");
}
{
  const { c, g } = scene(["a", "b"], [[["ambush", "b", false, 2]], [["lord", "a"]]]);
  H(c, "b", { a: "decide", reveal: true });
  check(g.P.b.inf === 1 + 1 && g.queue.length === 1 && g.P.b.discard.includes("ambush"), "待ち伏せを自分で公開: +1だけ(上の影響力2はもらえず捨てる)");
}
// ---- 陰謀: 上の影響力を2倍 ----
{
  const { c, g } = scene(["a", "b"], [[["conspiracy", "a", false, 3]], [["lord", "b"]]]);
  H(c, "a", { a: "decide", reveal: true });
  check(g.P.a.inf === 1 + 6 && g.queue.length === 1 && g.P.a.discard.includes("conspiracy"), "陰謀: 上の影響力3 → 6、その後捨てる");
}
// ---- 密偵: となりの持ち主から1奪う ----
{
  const { c, g } = scene(["a", "b", "c"], [[["lord", "b", true]], [["spy", "a"]], [["heir", "a", true]]], { a: 1, b: 2, c: 5 });
  H(c, "a", { a: "decide", reveal: true });
  check(g.pending.type === "target" && g.pending.options.join() === "500,502", "密偵: となりのカード(自分のカードも)から選ぶ");
  H(c, "a", { a: "target", sid: 500 });
  check(g.P.b.inf === 2 && g.P.a.inf === 4, "密偵: となりの持ち主から1奪う(領主+1 のあと。最後に表向きの後継者+2)");
}
{
  const { c, g } = scene(["a", "b"], [[["spy", "a"]], [["lord", "a"]]], { a: 3, b: 3 });
  H(c, "a", { a: "decide", reveal: true });
  check(g.P.a.inf === 3 && g.P.b.inf === 3, "密偵: となりが自分のカードだけなら、自分から奪う(変わらない)");
}
{
  const { c, g } = scene(["a", "b"], [[["lord", "b", false]], [["spy", "a"]]], { a: 1, b: 0 });
  H(c, "b", { a: "decide", reveal: false });
  H(c, "a", { a: "decide", reveal: true });
  check(g.P.a.inf === 1 && g.P.b.inf === 0, "密偵: 相手の影響力が0なら何も起きない");
}
// ---- 暗殺: どれでも1枚、その後捨てる ----
{
  const { c, g } = scene(["a", "b"], [[["lord", "b", false]], [["heir", "b", false]], [["assassination", "a"]]]);
  H(c, "b", { a: "decide", reveal: false }); H(c, "b", { a: "decide", reveal: false });
  H(c, "a", { a: "decide", reveal: true });
  check(g.pending.options.join() === "500,501", "暗殺: 自分以外のどれでも");
  H(c, "a", { a: "target", sid: 500 });
  check(g.P.a.inf === 2 && g.queue.length === 1 && g.P.a.discard.includes("assassination"), "暗殺: 排除して+1、暗殺は捨てる");
}
// ---- 勅令: 好きな位置へ動かす ----
{
  const { c, g } = scene(["a", "b"], [[["decree", "a"]], [["lord", "b"]], [["heir", "b"]]]);
  H(c, "a", { a: "decide", reveal: true });
  H(c, "a", { a: "target", sid: 502 });
  check(g.pending.type === "move" && g.pending.positions.join() === "0,1", "勅令: 動かす先(元の位置以外)");
  H(c, "a", { a: "target", pos: 0 });
  check(tops(g) === "heir:b lord:b" && g.P.a.discard.includes("decree"), "勅令: 先頭へ動かし、勅令は捨てる");
  check(g.pending && g.pending.sid === 501, "解決は続きから(解決済みの位置=先頭へ動いた山は、このラウンドは解決しない)");
}
// ---- 変身者: となりの表向きの人物をまねる ----
{
  const { c, g } = scene(["a", "b"], [[["soldier", "b", true]], [["shapeshifter", "a"]], [["lord", "b"]], [["heir", "b"]]]);
  // 先頭の兵士(b、表向き)は となりの変身者を排除するしかない
  check(g.queue.length === 3 && g.P.b.inf === 2, "表向きの兵士は毎ラウンド能力を使う(対象1つ → 自動)");
}
{
  const { c, g } = scene(["a", "b"], [[["lord", "b", true]], [["shapeshifter", "a"]], [["heir", "b", true]]], { a: 1, b: 3 });
  H(c, "a", { a: "decide", reveal: true });
  check(g.pending.type === "target" && g.pending.options.join() === "500,502", "変身者: となりの表向きの人物から選ぶ");
  H(c, "a", { a: "target", sid: 500 });
  check(g.P.a.inf === 2, "変身者が領主をまねる: +1(となりに自分のカードなし)");
}
// ---- 自分のカードの上に重ねる → 上が排除されると下が戻る ----
{
  const { c, g } = scene(["a", "b"], [[["soldier", "b"]], [["heir", "a", true], ["lord", "a"]]]);
  H(c, "b", { a: "decide", reveal: true });
  check(g.queue.length === 2 && g.queue[1].cards.length === 1 && g.queue[1].cards[0].k === "heir", "重ねた上のカードが排除されると、下のカードがまた有効になる");
  check(g.P.a.inf === 3, "戻った下の後継者(表向き)がそのまま解決される");
}
// ---- 変身者が後継者をまねる: 名前は「変身者」のまま ----
{
  const { c, g } = scene(["a", "b"], [[["heir", "b", true]], [["shapeshifter", "a"]], [["lord", "b"]]], { a: 1, b: 1 });
  H(c, "a", { a: "decide", reveal: true });
  H(c, "a", { a: "target", sid: 500 });
  check(g.P.a.inf === 3, "変身者が(列で1枚だけの)後継者をまねる: ほかに表向きの変身者がいなければ+2");
}
{
  const { c, g } = scene(["a", "b"], [[["heir", "b", true]], [["shapeshifter", "a"]], [["shapeshifter", "b", true]]], { a: 1, b: 1 });
  H(c, "a", { a: "decide", reveal: true });
  check(g.pending && g.pending.options.join() === "500", "変身者は変身者をまねられない");
  H(c, "a", { a: "target", sid: 500 });
  check(g.P.a.inf === 1, "ほかに表向きの変身者がいれば、後継者をまねても何も起きない");
}
// ---- 解決の向き: 右から ----
{
  const t = mk(["a", "b"], { dir: "R" }), g = t.g;
  g.queue = [[["lord", "a"]], [["heir", "b"]]].map((cards, i) => ({ id: 500 + i, cards: cards.map(([k, owner]) => ({ id: cid++, k, owner, up: false, inf: 0 })) }));
  g.step = "resolve"; g.round = 1; g.res = { done: [], cur: null }; T.advance(t.c);
  check(g.dir === "R" && g.pending.sid === 501, "解決の向き「右から」: 右端から解決する");
}
// ---- 勅令: 重なった山は上の1枚だけ動く ----
{
  const { c, g } = scene(["a", "b"], [[["decree", "a"]], [["heir", "b", true], ["lord", "b"]], [["spy", "a"]]]);
  H(c, "a", { a: "decide", reveal: true });
  H(c, "a", { a: "target", sid: 501 });
  check(g.pending.type === "move" && g.pending.positions.length === 4, "重なった山の上を動かす: 置き場所はどこでも(4か所)");
  H(c, "a", { a: "target", pos: 3 });
  check(tops(g) === "heir:b spy:a lord:b" && g.queue[0].cards.length === 1, "上の領主だけ最後尾へ。下の後継者はその場に残る(勅令は捨てる)");
}
// ---- 同点は列のカードが多い人が上 ----
{
  const t = mk(["a", "b"]), g = t.g;
  g.queue = [{ id: 1, cards: [{ id: 1, k: "lord", owner: "b", up: true, inf: 0 }, { id: 2, k: "heir", owner: "b", up: true, inf: 0 }] }, { id: 2, cards: [{ id: 3, k: "spy", owner: "a", up: true, inf: 0 }] }];
  g.P.a.inf = 5; g.P.b.inf = 5; g.round = 6; g.step = "resolve"; g.res = { done: [1, 2], cur: 2 };
  T.advance(t.c);
  check(g.step === "end" && /b の勝ち/.test(g.log[g.log.length - 1]) && g.tie.b === 2 && g.tie.a === 1, "同点なら列に残っているカード(重なったカードも)が多い人の勝ち");
}
// ---- 時間切れ ----
{
  const { c, g, fire, st } = mk(["a", "b", "c"], { placeSecs: 30 });
  check(st.ms === 30000, "配置の持ち時間");
  const id = g.toPlace[0]; fire();
  check(g.P[id].hand.length === 6 && g.queue.length === 1, "配置の時間切れ: 手札から自動で置く");
}
{
  const t = scene(["a", "b"], [[["lord", "a"]], [["heir", "b"]]]);
  t.fire();
  check(t.g.queue[0].cards[0].inf === 1 && !t.g.queue[0].cards[0].up, "公開するかの時間切れ: 伏せたまま");
}
// ---- 抜けた人 ----
{
  const t = scene(["a", "b", "c"], [[["lord", "a"]], [["heir", "b"]], [["spy", "c"]]]);
  core.onLeave(t.c, "a");
  check(t.g.queue.length === 2 && t.g.pending.by === "b" && !t.g.P.a, "解決中に抜けたら、その人のカードを取り除いて次へ");
}
// ---- 通しで遊ぶ(ランダムな操作で1000回): 止まらない・カードの枚数が合う・6ラウンドで終わる ----
{
  let ended = 0, bad = 0, maxSteps = 0;
  for (let s = 1; s <= 1000; s++) {
    const n = 2 + (s % 4), ids = ["p", "q", "r", "s", "t"].slice(0, n);
    const t = mk(ids, {}, s), g = t.g, r = seeded(s * 7);
    let steps = 0;
    while (g.step !== "end" && steps < 2000) {
      steps++;
      if (r() < 0.03) { t.fire(); continue; } // ときどき時間切れ
      if (g.step === "place") {
        const id = g.toPlace[0], p = g.P[id], mine = g.queue.filter((x) => x.cards[x.cards.length - 1].owner === id);
        const where = mine.length && r() < 0.25 ? mine[Math.floor(r() * mine.length)].id : r() < 0.5 ? "L" : "R";
        H(t.c, id, { a: "place", card: p.hand[Math.floor(r() * p.hand.length)].id, where });
      } else if (g.pending) {
        const pd = g.pending;
        if (pd.type === "reveal") H(t.c, pd.by, { a: "decide", reveal: r() < 0.6 });
        else if (pd.type === "target") H(t.c, pd.by, { a: "target", sid: pd.options[Math.floor(r() * pd.options.length)] });
        else H(t.c, pd.by, { a: "target", pos: pd.positions[Math.floor(r() * pd.positions.length)] });
      } else { bad++; break; }
      // 枚数: 手札+列+捨て札 = 7、影響力は0以上
      for (const id of ids) {
        const inQ = g.queue.reduce((a, x) => a + x.cards.filter((y) => y.owner === id).length, 0);
        if (g.P[id].hand.length + inQ + g.P[id].discard.length !== 7 || g.P[id].inf < 0) { bad++; break; }
      }
    }
    maxSteps = Math.max(maxSteps, steps);
    if (g.step === "end" && t.st.finished && g.round === 6 && Object.values(g.P).every((p) => p.hand.length === 1)) ended++;
  }
  check(ended === 1000 && bad === 0, `ランダムに1000回: 全部6ラウンドで決着(${ended})・手札は1枚残る・枚数や影響力の不整合${bad}件・最長${maxSteps}手`);
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
process.exit(fails ? 1 : 0);
