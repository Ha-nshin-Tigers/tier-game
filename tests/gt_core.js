const core = require("../games/mini/eldorado.js"), T = core._t;
let fails = 0; const check = (c, m) => { if (!c || !process.env.QUIET) console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids = ["a", "b", "c"], cfg = {}) {
  const st = { timer: null, finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  core.start(c, { course: "gt_first", ...cfg });
  return { c, g: c.g, st };
}
const nbs = (k) => { const [q, r] = k.split(",").map(Number); return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([a, b]) => `${q + a},${r + b}`); };
const H = (c, id, m) => core.handle(c, id, m);
const GT = Object.keys(core.COURSES).filter((k) => core.COURSES[k].exp === "gt");
check(GT.length === 5, "黄金の神殿のコース5つ " + GT.join(","));
// タイルの写し: 地形ごとのマス数(1a/1b=61, ほか37)
for (const [t, rows] of Object.entries(core.GT_BOARDS)) { const n = rows.join(" ").split(" ").length; check(n === (t[0] === "1" ? 61 : 37), `タイル${t}: ${n}マス`); }
for (const id of GT) {
  const C = core.COURSES[id];
  for (const opts of [{}, { eldoMod: true, palMod: true }]) {
    const cs = T.buildCourse(id, opts), hs = Object.values(cs.hex);
    const expect = C.p.reduce((n, [b]) => n + core.GT_BOARDS[b].join(" ").split(" ").length, 0) + 9;
    const starts = cs.starts.length, gates = hs.filter((h) => h.gate).length;
    // スタートから、神殿の9マスと門(のとなり)へ行けるか(バリケード・柵は無視、山・守護者は通れない)
    const seen = new Set(cs.starts), q = [...cs.starts];
    while (q.length) { const k = q.shift(); for (const n of nbs(k)) { const h = cs.hex[n]; if (h && !seen.has(n) && h.t !== "m" && h.t !== "q" && h.t !== "s" && !h.gate) { seen.add(n); q.push(n); } } }
    const temples = hs.filter((h) => h.temple), reachT = temples.every((h) => seen.has(`${h.q},${h.r}`));
    const gateNb = nbs(cs.gate).some((n) => seen.has(n));
    const colors = new Set(temples.map((h) => h.temple));
    const guards = Object.keys(cs.guards).length;
    const tag = opts.eldoMod ? "(モジュールあり)" : "";
    check(hs.length === expect && starts === 4 && gates === 1, `${id}${tag}: マス${hs.length}(重なりなし)・スタート4・門1`);
    check(temples.length === 9 && colors.size === 3 && reachT && gateNb, `${id}${tag}: 神殿3つ×3マス・全部と門に行ける`);
    check(cs.blockades.length >= 2 && cs.blockades.every((b) => b.a === 0) && guards <= 8, `${id}${tag}: バリケード${cs.blockades.length}(スタートとの境目)・守護者${guards}`);
    if (opts.eldoMod) check(hs.filter((h) => h.eldo).length === 4 && hs.filter((h) => h.pal).length === 6, `${id}: エルドのタイル4・柵3マス×2`);
  }
}
check(core.normalize({ course: "gt_easy", hh: true, caves: true }).gt && !core.normalize({ course: "gt_easy", hh: true }).hh && !core.normalize({ course: "gt_easy", caves: true }).caves, "黄金の神殿は洞窟・英雄と呪いなし");
check(!core.normalize({ course: "first" }).gt, "基本コースは黄金の神殿ではない");
// 準備
{
  const { g } = mk();
  const p = g.P[g.order[0]], all = [...p.hand, ...p.deck].map((x) => x.k).sort().join();
  check(p.hand.length === 4 && all === [...core.GT_MARKET0.slice(0, 0), "g_photo", "g_photo", "g_scout", "g_skipper", "g_student", "g_student", "g_tourist", "g_tourist"].sort().join(), "初期デッキ8枚・手札4枚");
  check(g.market.map((s) => s.k).join() === core.GT_MARKET0.join() && Object.keys(g.reserve).length === 12, "市場6種・市場の外12種");
  check(p.eldo === 0 && p.gems.length === 0, "エルド0・宝石0で開始");
}
// ルール単体
const setHand = (g, id, ks) => { const p = g.P[id]; p.hand = ks.map((k) => ({ id: ++g.uid, k })); return p.hand; };
const place = (g, id, key, i = 0) => { g.P[id].pieces[i] = key; };
const findHex = (g, f) => Object.keys(g.course.hex).find((k) => f(g.course.hex[k], k));
{
  const { c, g } = mk();
  const id = g.order[0], p = g.P[id];
  // たいまつのマスへ学生で
  const from = findHex(g, (h, k) => h.tile === 0 && h.t === "f" && nbs(k).some((n) => g.course.hex[n] && g.course.hex[n].t === "f" && g.course.hex[n].v === 1 && g.course.hex[n].tile === 0) && !g.order.some((o) => g.P[o].pieces.includes(k)));
  const to = nbs(from).find((n) => g.course.hex[n] && g.course.hex[n].t === "f" && g.course.hex[n].v === 1 && g.course.hex[n].tile === 0);
  place(g, id, from);
  const [st] = setHand(g, id, ["g_student", "g_scout"]);
  check(H(c, id, { a: "move", card: st.id + 1, to }) === "このマスにはたいまつが必要です", "ナタのカードで遺跡には入れない");
  check(H(c, id, { a: "move", card: st.id, to }) === undefined && p.pieces[0] === to, "学生(たいまつ1)で遺跡1へ");
  // エルドで村1へ
  const vfrom = findHex(g, (h, k) => !h.temple && nbs(k).some((n) => g.course.hex[n] && g.course.hex[n].t === "v" && g.course.hex[n].v === 1) && h.t !== "m" && h.t !== "q" && !g.order.some((o) => g.P[o].pieces.includes(k)));
  const vto = nbs(vfrom).find((n) => g.course.hex[n] && g.course.hex[n].t === "v" && g.course.hex[n].v === 1);
  g.move = null; place(g, id, vfrom); g.bought = false;
  check(/エルドがありません/.test(H(c, id, { a: "eldo", to: vto }) || ""), "エルドが無いと村へ進めない");
  p.eldo = 1; g.course.blockades.forEach((b) => (b.by = "x"));
  check(H(c, id, { a: "eldo", to: vto }) === undefined && p.eldo === 0 && p.pieces[0] === vto, "エルド1つで村1へ");
  // エルドは3つまで
  p.eldo = 3; const [gat] = setHand(g, id, ["g_gatherer"]);
  H(c, id, { a: "action", card: gat.id });
  check(p.eldo === 3 && p.hand.length === 1, "採集者: エルドは3つまで・1枚引く");
}
{
  // 神殿: 止まると宝石(1色1つ)。エルドを払う面
  const { c, g } = mk();
  const id = g.order[0], p = g.P[id];
  g.course.blockades.forEach((b) => (b.by = "x"));
  const red = findHex(g, (h) => h.temple === "red" && h.v === 1), redFrom = nbs(red).find((n) => g.course.hex[n] && !g.course.hex[n].temple && g.course.hex[n].t !== "m" && g.course.hex[n].t !== "q");
  place(g, id, redFrom);
  const [ge] = setHand(g, id, ["g_gentleman"]); // たいまつ2(赤はたいまつの面)
  check(H(c, id, { a: "move", card: ge.id, to: red }) === undefined && p.gems.join() === "" , "神殿のマスに入っただけ(パワー残り)ではまだ");
  H(c, id, { a: "stop" });
  check(p.gems.join() === "red", "止まると赤の宝石");
  const green = findHex(g, (h) => h.temple === "green"), gFrom = nbs(green).find((n) => g.course.hex[n] && !g.course.hex[n].temple && !["m", "q"].includes(g.course.hex[n].t));
  place(g, id, gFrom); p.eldo = 0;
  check(/エルド/.test(H(c, id, { a: "move", card: setHand(g, id, ["g_canteen"])[0].id, to: green }) || ""), "エルドの面はカードでは入れない");
  p.eldo = 2;
  check(H(c, id, { a: "eldo", to: green }) === undefined && p.gems.join() === "red,green" && p.eldo === 1, "エルド1つで緑の神殿へ→緑の宝石");
  // 門: 宝石3つで門のとなりに来たら脱出
  p.gems = ["red", "green", "blue"];
  const free = (n) => g.course.hex[n] && "fjwv".includes(g.course.hex[n].t) && !g.order.some((o) => g.P[o].pieces.includes(n));
  const gateNb = nbs(g.course.gate).find(free);
  const pre = nbs(gateNb).find((n) => free(n) && !nbs(n).includes(g.course.gate));
  place(g, id, pre); g.move = null;
  check(H(c, id, { a: "move", card: setHand(g, id, ["g_jeep"])[0].id, to: gateNb }) === undefined && p.done[0] && g.finalRound, "宝石3つで門のとなり→自動で脱出・最後のラウンド");
}
{
  // 守護者: となりに止まると表に。効果「強欲」
  const { c, g } = mk();
  const id = g.order[0], p = g.P[id];
  g.course.blockades.forEach((b) => (b.by = "x"));
  const gk = Object.keys(g.course.guards)[0]; g.course.guards[gk].k = "lose";
  const adj = nbs(gk).find((n) => g.course.hex[n] && "fjwv".includes(g.course.hex[n].t) && g.course.hex[n].v === 1);
  const pre = nbs(adj).find((n) => g.course.hex[n] && "fjwv".includes(g.course.hex[n].t) && !nbs(n).includes(gk) && n !== gk);
  if (adj && pre) {
    place(g, id, pre); p.eldo = 2; g.P[id].gnear[0] = [];
    const t = g.course.hex[adj].t, card = { f: "g_student", j: "g_scout", w: "g_skipper", v: "g_tourist" }[t];
    H(c, id, { a: "move", card: setHand(g, id, [card])[0].id, to: adj }); H(c, id, { a: "stop" });
    check(g.course.guards[gk].open && p.eldo === 0, "守護者のとなりに止まる→表になり、強欲でエルドを失う");
  } else check(false, "守護者テストの場所が見つからない");
  // 「知恵」: ほかの人が1枚引いてよい(順番に聞く)
  const { c: c2, g: g2 } = mk();
  const id2 = g2.order[0]; g2.course.blockades.forEach((b) => (b.by = "x"));
  const gk2 = Object.keys(g2.course.guards)[0]; g2.course.guards[gk2].k = "draw";
  const adj2 = nbs(gk2).find((n) => g2.course.hex[n] && g2.course.hex[n].t === "f" && g2.course.hex[n].v === 1);
  if (adj2) {
    const pre2 = nbs(adj2).find((n) => g2.course.hex[n] && g2.course.hex[n].t !== "m" && g2.course.hex[n].t !== "q" && !nbs(n).includes(gk2));
    place(g2, id2, pre2); g2.P[id2].gnear[0] = [];
    H(c2, id2, { a: "move", card: setHand(g2, id2, ["g_student"])[0].id, to: adj2 }); H(c2, id2, { a: "stop" });
    const o1 = g2.order[1], n0 = g2.P[o1].hand.length;
    check(g2.pending && g2.pending.type === "optdraw" && g2.pending.pid === o1, "知恵: 次の人に「引きますか」");
    H(c2, o1, { a: "opt", yes: true });
    check(g2.P[o1].hand.length === n0 + 1 && g2.pending && g2.pending.pid === g2.order[2], "引いた→その次の人へ");
    H(c2, g2.order[2], { a: "opt", yes: false });
    check(!g2.pending, "全員答えたら終わり");
  }
}
{
  // バリケード 13(ほかの全員エルド1)・14(エルド1つ失う)・9(たいまつ1)
  const { c, g } = mk();
  const id = g.order[0], p = g.P[id];
  for (const [n, t, v] of [[13, "xeldo", 0], [14, "xpay", 1], [9, "f", 1]]) {
    const bl = g.course.blockades[0]; Object.assign(bl, { n, t, v, by: null });
    const edge = Object.keys(g.course.hex).find((k) => g.course.hex[k].tile === 0 && nbs(k).some((x) => g.course.hex[x] && g.course.hex[x].tile === bl.b) && !g.order.some((o) => g.P[o].pieces.includes(k)) && g.course.hex[k].t !== "m");
    place(g, id, edge); g.move = null; g.bought = false;
    const blocked = nbs(edge).find((x) => g.course.hex[x] && g.course.hex[x].tile === bl.b);
    const others = g.order.filter((o) => o !== id).map((o) => g.P[o].eldo);
    if (t === "xpay") { p.eldo = 0; check(/エルド/.test(H(c, id, { a: "blockade", n }) || ""), "バリケード14: エルドがないと取れない"); p.eldo = 1; }
    const e = t === "f" ? H(c, id, { a: "blockade", n, card: setHand(g, id, ["g_student"])[0].id }) : H(c, id, { a: "blockade", n });
    check(e === undefined && bl.by === id && p.blockades.includes(n), `バリケード${n}を取った`);
    if (t === "xeldo") check(g.order.filter((o) => o !== id).every((o, i) => g.P[o].eldo === Math.min(3, others[i] + 1)), "13: ほかの全員がエルド1つ");
    if (t === "xpay") check(p.eldo === 0, "14: エルド1つ失う");
    if (t === "f") check(!!blocked, "9: たいまつのカードで取れる");
  }
}
{
  // カードを使わなかったターンはエルド1つ
  const { c, g } = mk();
  const id = g.order[0];
  H(c, id, { a: "end", keep: g.P[id].hand.map((x) => x.id) });
  check(g.P[id].eldo === 1, "カードを使わずにターン終了→エルド1つ");
  const id2 = g.order[1]; const [x] = g.P[id2].hand;
  H(c, id2, { a: "buy", k: "g_tutor", cards: g.P[id2].hand.map((y) => y.id) });
  H(c, id2, { a: "end", keep: [] });
  check(g.P[id2].eldo === 0 || g.P[id2].discard.some((y) => y.k === "g_tutor"), "買ったターンはもらえない");
  // エルドで払う
  const id3 = g.order[2], p3 = g.P[id3]; p3.eldo = 3; setHand(g, id3, ["g_student"]);
  check(H(c, id3, { a: "buy", k: "g_tutor", cards: [p3.hand[0].id], eldo: 2 }) === undefined && p3.eldo === 1, "エルド2つ+0.5コインで家庭教師(2)");
}
{
  // 新しい装備: 市場の外から買える
  const { c, g } = mk();
  const id = g.order[0], p = g.P[id];
  const [hat] = setHand(g, id, ["g_hat", "g_photo", "g_photo"]);
  H(c, id, { a: "action", card: hat.id });
  check(p.eldo === 3 && g.anyBuy, "新しい装備: エルド3つ");
  check(H(c, id, { a: "buy", k: "g_professor", cards: p.hand.map((x) => x.id), eldo: 3 }) === undefined && g.market.every((s) => s.k !== "g_professor") && g.reserve.g_professor === 2, "市場の外の教授を買えた(山は市場に移らない)");
  check(p.gone.some((x) => x.k === "g_hat"), "新しい装備は1回限り(除外)");
}
{
  // 巻物: 2マス条件無視・バリケードも取る
  const { c, g } = mk();
  const id = g.order[0], p = g.P[id], bl = g.course.blockades[0];
  const edge = Object.keys(g.course.hex).find((k) => g.course.hex[k].tile === 0 && nbs(k).some((x) => g.course.hex[x] && g.course.hex[x].tile === bl.b && !["m", "q"].includes(g.course.hex[x].t)) && !g.order.some((o) => g.P[o].pieces.includes(k)) && g.course.hex[k].t !== "m");
  place(g, id, edge);
  const [sc] = setHand(g, id, ["g_scroll"]);
  H(c, id, { a: "action", card: sc.id });
  const to = g.steps.targets || T.stepTargets(g, g.steps).find((x) => g.course.hex[x].tile === bl.b);
  const tgt = T.stepTargets(g, g.steps).find((x) => g.course.hex[x].tile === bl.b);
  check(!!tgt, "巻物: バリケードの向こうへ行ける");
  H(c, id, { a: "step", to: tgt });
  check(bl.by === id && g.steps && g.steps.left === 1, "巻物でバリケードを取った・あと1回");
  H(c, id, { a: "stepDone" });
  check(p.gone.some((x) => x.k === "g_scroll"), "巻物は1回限り");
  // 装備屋
  const [of] = setHand(g, id, ["g_outfit"]); p.eldo = 2;
  check(/エルドが足りません/.test(H(c, id, { a: "action", card: of.id, n: 3 }) || ""), "装備屋: エルドが足りないと3マスは無理");
  check(H(c, id, { a: "action", card: of.id, n: 2 }) === undefined && p.eldo === 0 && g.steps.left === 2, "装備屋: エルド2つで2マス");
}
{
  // 2人: 緑の宝石は2コマを同じ2人用マスに
  const { c, g } = mk(["a", "b"]);
  const id = g.order[0], p = g.P[id];
  g.course.blockades.forEach((b) => (b.by = "x"));
  const two = findHex(g, (h) => h.two);
  const around = nbs(two).filter((n) => g.course.hex[n] && !["m", "q"].includes(g.course.hex[n].t) && !g.course.hex[n].temple);
  place(g, id, two, 0); place(g, id, around[0], 1); p.eldo = 3;
  T.autoResolve(c);
  // コマ0だけ止まっても取れない
  g.P[id].gems = [];
  const other = nbs(two).find((n) => g.course.hex[n] && g.course.hex[n].temple === "green" && n !== two) || around[1];
  // 2つ目のコマを2人用マスへ(エルドの面ならエルド、そうでなければカード)
  const h2 = g.course.hex[two];
  const r = h2.t === "e" ? H(c, id, { a: "eldo", to: two, piece: 1 }) : H(c, id, { a: "move", card: setHand(g, id, ["g_jeep"])[0].id, to: two, piece: 1 });
  if (h2.t !== "e") H(c, id, { a: "stop" });
  check(r === undefined && p.pieces[0] === two && p.pieces[1] === two && p.gems.includes("green"), "2人: 自分の2コマで同じ2人用マスに→緑の宝石");
}
// たくさん遊んで決着(必要な宝石の神殿→門へ向かう簡単なプレイヤー)
function sim(n, cfg) {
  const ids = ["p1", "p2", "p3", "p4"].slice(0, 2 + (n % 3));
  const { c, g, st } = mk(ids, cfg);
  let guard = 0, errs = 0;
  const hex = g.course.hex;
  const bfs = (targets) => { const d = {}; const q = [...targets]; for (const k of q) d[k] = 0; while (q.length) { const k = q.shift(); for (const nn of nbs(k)) { const h = hex[nn]; if (h && d[nn] == null && h.t !== "m" && h.t !== "q" && !h.gate) { d[nn] = d[k] + 1; if (h.t !== "s") q.push(nn); } } } return d; };
  const gateD = bfs(nbs(g.course.gate).filter((k) => hex[k]));
  const tD = {}; for (const col of ["red", "green", "blue"]) tD[col] = bfs(Object.keys(hex).filter((k) => hex[k].temple === col && (ids.length > 2 || col !== "green" || hex[k].two)));
  while (!st.finished && guard++ < 1500) {
    const id = g.order[g.cur], p = g.P[id];
    const need = ["red", "green", "blue"].filter((x) => !p.gems.includes(x));
    // 2人の緑: もう1つのコマが2人用マスにいれば、そこへ集まる
    const pairT = (pi) => { if (ids.length !== 2 || !need.includes("green")) return null; const o = p.pieces.find((k, i) => i !== pi && !p.done[i] && hex[k].two); return o || null; };
    const cache = {};
    const distOf = (k, pi = curPi) => {
      if (!need.length) return gateD[k] ?? 999;
      const pt = pairT(pi);
      const ds = need.map((x) => x === "green" && pt ? (cache[pt] ||= bfs([pt]))[k] ?? 999 : tD[x][k] ?? 999);
      return Math.min(...ds);
    };
    let curPi = 0;
    for (let k = 0; k < 16 && !st.finished; k++) {
      if (g.pending || g.steps) {
        if ((g.pending && g.pending.pid !== id) || (g.steps && g.steps.mover !== id)) { T.autoResolve(c); continue; }
        // 山札が少ないときは除外しない(テスト用のボットが札を減らしすぎて動けなくなるのを防ぐ)
        if (g.pending) { const pd = g.pending; if (pd.type === "trash") { const total = p.deck.length + p.discard.length + p.hand.length + p.played.length; H(c, id, { a: "trash", ids: total <= 8 ? [] : p.hand.filter((x) => ["g_student", "g_tourist"].includes(x.k)).slice(0, Math.min(pd.max, total - 8)).map((x) => x.id) }); } else H(c, id, { a: "opt", yes: true }); continue; }
        const pc = g.P[g.steps.owner].pieces[g.steps.piece]; curPi = g.steps.piece;
        const tg = T.stepTargets(g, g.steps).sort((x, y) => distOf(x) - distOf(y));
        if (tg.length && distOf(tg[0]) < distOf(pc)) H(c, id, { a: "step", to: tg[0] }); else H(c, id, { a: "stepDone" });
        continue;
      }
      let did = false;
      for (let pi = 0; pi < p.pieces.length && !did; pi++) {
        if (p.done[pi]) continue;
        curPi = g.move ? g.move.piece : pi;
        if (g.order.length === 2 && g.canExit !== null && T.canExit(g, id, pi) && p.done.some(Boolean) === false && p.pieces.every((x, i) => i === pi || T.canExit(g, id, i))) { H(c, id, { a: "gate", piece: pi }); did = true; break; }
        if (g.order.length === 2 && T.canExit(g, id, pi) && p.done.some((d, i) => d || T.canExit(g, id, i) && i !== pi)) { H(c, id, { a: "gate", piece: pi }); did = true; break; }
        const from = g.move ? p.pieces[g.move.piece] : p.pieces[pi];
        for (const b of g.course.blockades) if (!b.by) {
          if (b.t[0] === "x") H(c, id, { a: "blockade", n: b.n, piece: pi });
          else for (const card of [...p.hand]) { if (b.by) break; H(c, id, { a: "blockade", n: b.n, card: card.id, piece: pi }); }
          if (b.by === id) did = true;
        }
        const here = distOf(from);
        // 詰まったとき(ラウンドが進んでも宝石が増えない)はわざと遠回りしてゆずる
        const stuck = g.turnNo - (p.lastGain || 0) > 25;
        const better = stuck && Math.random() < 0.5 ? T.neighbors(g, from).sort(() => Math.random() - 0.5)
          : T.neighbors(g, from).filter((x) => distOf(x) < here || (k > 8 && Math.random() < 0.3 && distOf(x) <= here + 1)).sort((x, y) => distOf(x) - distOf(y));
        for (const to of better) {
          const h = hex[to];
          if (h.t === "c") { if ([...p.deck, ...p.discard, ...p.hand, ...p.played].length - h.v >= 8 && p.hand.length >= h.v + 1 && !H(c, id, { a: "enterCards", to, piece: pi, cards: p.hand.slice(0, h.v).map((x) => x.id) })) { did = true; break; } continue; }
          if (h.t === "e" || (h.t === "v" && h.v === 1 && p.eldo)) { if (!H(c, id, { a: "eldo", to, piece: pi })) { did = true; break; } if (h.t === "e") continue; }
          const cand = g.move ? [{ card: g.move.card }] : p.hand.map((x) => ({ card: x.id }));
          for (const src of cand) if (!H(c, id, { a: "move", ...src, to, piece: pi })) { did = true; break; }
          if (did) break;
        }
      }
      if (!did) {
        const act = p.hand.find((x) => core.CARDS[x.k].a);
        if (act && !H(c, id, { a: "action", card: act.id, n: Math.min(3, Math.max(1, p.eldo)) })) continue;
        break;
      }
    }
    if (st.finished) break;
    for (const i of g.order) { const P = g.P[i]; const sc = P.gems.length * 10 + P.done.filter(Boolean).length; if (sc !== P.lastSc) { P.lastSc = sc; P.lastGain = g.turnNo; } }
    if (g.pending || g.steps) T.autoResolve(c);
    if (!g.bought) for (const k of ["g_professor", "g_sponsor", "g_jeep", "g_pilot", "g_master", "g_healer", "g_canteen", "g_gentleman", "g_smuggler", "g_scroll", "g_tutor"]) if (!H(c, id, { a: "buy", k, cards: p.hand.map((x) => x.id), eldo: p.eldo })) break;
    H(c, id, { a: "end", keep: [] });
    if (g.pending || g.steps) T.autoResolve(c);
    // 同じマスに2つのコマ(2人の緑の2人用マスで自分の2コマだけは可)・山/守護者の上にいない
    const pos = g.order.flatMap((i) => g.P[i].pieces.filter((_, k) => !g.P[i].done[k]).map((k) => [i, k]));
    const byK = {}; for (const [i, k] of pos) (byK[k] ||= new Set()).add(i);
    for (const [k, s] of Object.entries(byK)) { const cnt = pos.filter((x) => x[1] === k).length; if (cnt > 1 && !(s.size === 1 && hex[k].two && g.order.length === 2)) errs++; }
    if (pos.some(([, k]) => ["m", "q"].includes(hex[k].t) || hex[k].gate)) errs++;
    for (const i of g.order) { const P = g.P[i]; const all = [...P.deck, ...P.discard, ...P.hand, ...P.played].map((x) => x.id); if (new Set(all).size !== all.length || P.eldo < 0 || P.eldo > 3 || new Set(P.gems).size !== P.gems.length) errs++; }
  }
  return { ended: !!st.finished, turns: g.turnNo, errs, winner: st.finished && g.result[0].arrived };
}
for (const [label, cfgOf] of [["基本", (k) => ({ course: k })], ["エルド・柵モジュール", (k) => ({ course: k, eldoMod: true, palMod: true })]]) {
  let ended = 0, turns = 0, maxT = 0, errs = 0, win = 0; const N = 100;
  for (let n = 0; n < N; n++) { const r = sim(n, cfgOf(GT[n % GT.length])); if (r.ended) ended++; if (r.winner) win++; turns += r.turns; maxT = Math.max(maxT, r.turns); errs += r.errs; }
  check(ended >= N * 0.9 && !errs, `${label}: ${ended}/${N} 回が決着(脱出あり${win})・平均${Math.round(turns / N)}ラウンド・最長${maxT}・不整合${errs}`);
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
