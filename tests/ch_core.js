// チャレンジャーズのルール本体のテスト(通信なし)
const core = require("../games/mini/challengers.js"), T = core._t;
let fails = 0; const check = (c, m) => { if (!c || !process.env.QUIET) console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids, cfg = {}) {
  const st = { finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, finish: (r) => { st.finished = r; } };
  core.start(c, cfg); c.g.names = Object.fromEntries(ids.map((x) => [x, x]));
  return { c, g: c.g, st };
}
// カード一覧
const total = core.LIST.filter((x) => x[3] !== "S").reduce((n, x) => n + x[5], 0);
const bySet = {}; for (const x of core.LIST) if (x[3] !== "S") bySet[x[2]] = (bySet[x[2]] || 0) + x[5];
check(Object.entries(bySet).filter(([k]) => k !== "city").every(([, n]) => n === 40) && bySet.city === 20, "各セット40枚・都市20枚(本家どおり) " + JSON.stringify(bySet));
check(core.LIST.filter((x) => x[3] === "S").reduce((n, x) => n + x[5], 0) === 6, "スターター6枚");
check(new Set(core.LIST.map((x) => x[1])).size === 72, "カードの種類 " + new Set(core.LIST.map((x) => x[1])).size);
// 準備
{
  const { g } = mk(["a", "b", "c", "d"]);
  const used = Object.values(g.piles).reduce((n, p) => n + p.length, 0) + Object.values(g.draft).reduce((n, d) => n + d.display.length, 0);
  check(used === 20 + 40 * 5 && !Object.values(g.piles).flat().some((x) => core.CARDS[x.k].set === g.exclude), `5セット+都市(${used}枚)、外したセットは入らない`);
  check(g.schedule.length === 7 && g.schedule.every((r) => r.length === 2), "4人: 7ラウンド分の対戦表");
  const met = {}; for (const r of g.schedule.slice(0, 3)) for (const [x, y] of r) met[[x, y].sort()] = (met[[x, y].sort()] || 0) + 1;
  check(Object.keys(met).length === 6, "最初の3ラウンドで全員と1回ずつ当たる");
}
{ const { g } = mk(["a", "b", "c"]); check(g.robot && g.seats.includes("robot") && g.schedule[0].length === 2, "3人: ロボットが入る"); }
// デッキフェイズ
{
  const { c, g } = mk(["a", "b"]);
  const d = g.draft.a;
  check(d.step === "pick" && d.display.length === 5 && d.display.every((x) => x.lv === "A") && d.need === 2, "ラウンド1: レベルAから5枚見て2枚選ぶ");
  const before = d.display.map((x) => x.id).join();
  core.handle(c, "a", { a: "redraw" }); check(d.display.map((x) => x.id).join() !== before && typeof core.handle(c, "a", { a: "redraw" }) === "string", "引き直しは1回だけ");
  core.handle(c, "a", { a: "pick", id: d.display[0].id });
  let guard = 0; while (g.draft.a.step === "extra" && guard++ < 3) core.handle(c, "a", { a: "extra" });
  if (g.draft.a.step === "pick") core.handle(c, "a", { a: "pick", id: g.draft.a.display[0].id });
  while (g.draft.a.step === "extra" && guard++ < 6) core.handle(c, "a", { a: "extra" });
  check(g.draft.a.step === "trim" && g.decks.a.length === 8, "2枚選ぶとデッキ8枚");
  const nb = g.decks.a.filter((x) => x.k === "newbie").map((x) => x.id);
  core.handle(c, "a", { a: "trim", ids: nb });
  check(g.draft.a.step === "done" && g.decks.a.length === 5 && !g.discards.A.some((x) => x.k === "newbie"), "削る: 新入り3枚を外す(スターターは箱へ)");
  check(typeof core.handle(c, "b", { a: "trim", ids: [] }) === "undefined", "選ぶ前に削ることはできない(何も起きない)");
}
// 強さの計算とマッチ
function setup(cards1, cards2, opts = {}) {
  const { g } = mk(["a", "b"]);
  g.decks.a = cards1.map((k) => ({ id: ++g.uid, k, lv: "A", bonus: 0 }));
  g.decks.b = cards2.map((k) => ({ id: ++g.uid, k, lv: "A", bonus: 0 }));
  const m = T.newMatch(g, "a", "b", 0, false);
  m.z.a.deck = g.decks.a.slice(); m.z.b.deck = g.decks.b.slice(); // シャッフルしない
  m.q = [{ t: "start", pid: opts.first || "a" }];
  return { g, m, run: (n = 200) => { let t = Date.now() + 5000; while (!m.winner && n-- > 0) { if (m.prompt) T.answer(g, m, m.prompt.pid, opts.ans ? opts.ans(m) : null); T.stepMatch(g, m, (t += 10000)); } } };
}
{
  const { g, m, run } = setup(["dog"], ["newbie", "newbie", "talent"]);
  run(4); // 旗を出す → 1枚ずつ3回公開(1回の進行で1枚)
  check(m.flag === "b" && m.z.b.park.length === 3 && m.z.a.bench.length === 1, "攻撃: 1+1+2=4 ≥ 犬3 で旗を取る(出したカードは旗の下へ)");
  run();
  check(m.winner === "b" && m.why === "デッキがなくなった", "攻撃側がデッキ切れで負け");
}
{
  // ベンチ7席目で負け: a は違う名前のカードを7種類出しては取られる
  const { g, m, run } = setup(["newbie", "talent", "pig", "cat", "pony", "spider", "parrot", "cow"], ["dragon", "dragon", "dragon", "dragon", "dragon", "dragon", "dragon", "dragon"], { first: "a" });
  run();
  check(m.winner === "b" && /ベンチ/.test(m.why), "ベンチが6席で足りなくなったら負け: " + m.why);
}
{
  // 同じ名前は同じ席
  const { g, m } = setup([], []);
  T.toBench(g, m, "a", [{ id: 901, k: "newbie", lv: "S", bonus: 0 }, { id: 902, k: "newbie", lv: "S", bonus: 0 }, { id: 903, k: "talent", lv: "S", bonus: 0 }]);
  check(m.z.a.bench.length === 2 && m.z.a.bench[0].length === 2, "同じ名前のカードは1つの席");
}
// 効果
const P = (g, m, who, k, ctx, setupFn) => { const card = { id: 999, k, lv: "A", bonus: 0 }; if (setupFn) setupFn(m); T.onReveal(g, m, who, card); return T.power(g, m, who, card, ctx); };
{
  const { g, m } = setup(["newbie"], ["newbie"]); m.attacker = "a"; m.flag = "b";
  const bench = (ks) => { m.z.a.bench = []; T.toBench(g, m, "a", ks.map((k, i) => ({ id: 500 + i, k, lv: "A", bonus: 0 }))); };
  bench([]); check(P(g, m, "a", "hermit", "attack") === 4, "隠者: ベンチに都市なし → 2+2");
  bench(["newbie"]); check(P(g, m, "a", "hermit", "attack") === 2, "隠者: ベンチに都市あり → 2");
  bench(["newbie"]); check(P(g, m, "a", "jester", "attack") === 4, "道化: ベンチにパワー1 → 1+3");
  bench(["pig", "cat", "cat"]); check(P(g, m, "a", "stableboy", "attack") === 5, "馬小屋小僧: パワー3が3枚 → 2+3");
  bench(["vendor", "vendor"]); check(P(g, m, "a", "pony", "attack") === 5, "売り子2枚: 遊園地 +2(同じ名前は足し算)");
  bench(["makeup"]); check(P(g, m, "a", "newbie", "attack") === 3 && P(g, m, "a", "newbie", "defend") === 1, "メイクさん: パワー1は攻撃時だけ +2");
  bench([]); check(P(g, m, "a", "gangster", "attack") === 4 && P(g, m, "a", "gangster", "defend") === 2, "ギャング: 攻撃中だけ +2");
  bench([]); check(P(g, m, "a", "treasure", "defend") === 4 && P(g, m, "a", "skeleton", "defend") === 3, "お宝 +2・ガイコツ +1(旗の所持中)");
  bench(["pig", "vendor", "skeleton"]); check(P(g, m, "a", "mascot", "attack") === 5, "マスコット: ベンチのセット3種 → 2+3");
  bench(["pig"]); check(P(g, m, "a", "mime", "attack") === 6 && P(g, m, "a", "magician", "defend") === 10, "マイム 1+空き5・手品師 5+空き5");
  bench(["skeleton", "butler"]); check(P(g, m, "a", "teen", "attack") === 4, "ティーンエイジャー: お化け屋敷2枚 → 2+2");
  bench(["parrot"]); check(P(g, m, "a", "merman", "attack") === 4, "人魚: 難破船あり → 1+3");
  bench(["cook"]); check(P(g, m, "a", "pig", "defend") === 4 && P(g, m, "a", "pig", "attack") === 3, "コック: 旗のカードだけ +1");
  bench(["bard", "director"]); check(P(g, m, "a", "cat", "attack") === 5 && P(g, m, "a", "cat", "defend") === 3, "吟遊詩人+監督: 映画の猫は攻撃時 3+1+1");
  bench(["ai", "blacksmith", "band"]); check(P(g, m, "a", "talent", "defend") === 4 && P(g, m, "a", "cow", "defend") === 4, "人工知能(パワー2 +1)・鍛冶屋(都市 +1)・楽隊(宇宙 +1)");
  g.trophies.b = [{ round: 1, fans: 2 }, { round: 2, fans: 2 }]; bench([]); check(P(g, m, "a", "knight", "attack") === 5, "騎士: 相手のトロフィー2つ → 3+2");
  m.z.a.deck = [{ id: 1, k: "pig", lv: "A", bonus: 0 }]; bench([]); check(P(g, m, "a", "lifeguard", "attack") === 6, "ライフガード: デッキ1枚以下 → 4+2");
}
{
  // 王子: 旗を失うと消耗パイルへ。救出ポッド: 除外してBのカードを消耗パイルへ
  const { g, m, run } = setup(["prince", "newbie"], ["dragon", "dragon"]); run(2);
  check(m.z.a.exhaust.some((x) => x.k === "prince") && !m.z.a.bench.length, "王子: ベンチではなく消耗パイルへ");
  const s2 = setup(["rescuepod", "newbie"], ["pig", "pig"]); s2.run(2);
  check(s2.m.z.a.removed.length === 1 && s2.m.z.a.exhaust.length === 1 && s2.m.z.a.exhaust[0].lv === "B", "救出ポッド: 除外して、Bのカードを消耗パイルへ");
}
{
  // ピエロ・ヒロインのファン、カウボーイ
  const { g, m, run } = setup(["newbie"], ["clown"], { first: "a" }); run(2);
  check(g.fans.b === 2, "ピエロ: 旗を取ったらファン+2");
  const s = setup(["pig", "talent", "cat"], ["cowboy", "dragon"], { first: "a" }); s.run(2);
  check(s.m.z.a.bench.length === 2 && s.m.z.a.deck.length === 1, "カウボーイ: 相手はデッキの上をベンチへ");
}
{
  // 選択: 執事はベンチの1枚だけの席から消耗パイルへ(自動)
  const { g, m } = setup(["butler"], ["newbie"]); m.attacker = "a"; m.flag = "b";
  T.toBench(g, m, "a", [{ id: 701, k: "pig", lv: "A", bonus: 0 }, { id: 702, k: "cat", lv: "A", bonus: 0 }, { id: 703, k: "cat", lv: "A", bonus: 0 }]);
  T.onReveal(g, m, "a", { id: 704, k: "butler", lv: "A", bonus: 0 });
  check(m.prompt && m.prompt.kind === "benchPick" && m.prompt.max === 2, "執事: 選択を聞く");
  T.answer(g, m, "a", null);
  check(m.z.a.bench.length === 1 && m.z.a.exhaust.length === 2, "自動: 1枚だけの席(豚)から外して席を空ける");
  const s = setup(["juggler", "pig", "dragon", "newbie"], ["newbie"]); s.m.attacker = "a"; s.m.flag = "b"; s.m.z.a.deck.shift();
  T.onReveal(s.g, s.m, "a", { id: 705, k: "juggler", lv: "A", bonus: 0 });
  const ids = s.m.prompt.cards; T.answer(s.g, s.m, "a", [ids[2], ids[0], ids[1]]);
  check(s.m.z.a.deck.map((x) => x.k).join() === "newbie,pig,dragon", "曲芸師: 好きな順に並べ替え");
}
// たくさん遊んで決着(2〜8人、ロボットあり)・カードの枚数が保たれる
{
  let ended = 0, bad = "";
  for (let n = 0; n < 60; n++) {
    const ids = Array.from({ length: 2 + (n % 7) }, (_, k) => "p" + k);
    const { c, g, st } = mk(ids, { speed: "fast" });
    let now = Date.now(), guard = 0;
    const count0 = () => Object.values(g.decks).reduce((s, d) => s + d.length, 0) + Object.values(g.piles).reduce((s, p) => s + p.length, 0) + Object.values(g.discards).reduce((s, p) => s + p.length, 0);
    while (!st.finished && guard++ < 20000) {
      for (const id of g.humans) {
        const d = g.draft[id];
        if (g.phase === "deck" && d.step === "pick" && Math.random() < 0.5) core.handle(c, id, { a: "pick", id: d.display[Math.floor(Math.random() * d.display.length)].id });
        else if (g.phase === "deck" && d.step === "extra") core.handle(c, id, { a: "extra", ids: Math.random() < 0.5 ? g.decks[id].slice(0, d.removeFor).map((x) => x.id) : null });
        else if ((g.phase === "deck" || g.phase === "finalTrim") && d.step === "trim") core.handle(c, id, { a: "trim", ids: Math.random() < 0.3 ? g.decks[id].slice(0, 1).map((x) => x.id) : [] });
        else if (g.phase === "deck" && d.step === "choose") core.handle(c, id, { a: "opt", i: Math.floor(Math.random() * d.opts.length) });
      }
      for (const m of g.matches) if (m.prompt && Math.random() < 0.5) core.handle(c, m.prompt.pid, { a: "answer", ids: Math.random() < 0.5 ? m.prompt.cards.slice(0, 1) : null });
      now += 500; core.tick(c, now);
      if (g.phase === "deck" && g.round > 1) { const tot = Object.values(g.decks).reduce((s, d) => s + d.length, 0); if (tot < g.seats.length) bad = "デッキが空"; }
    }
    if (st.finished) ended++; else bad = bad || `決着せず phase=${g.phase} round=${g.round}`;
    if (bad) break;
  }
  check(!bad && ended === 60, `ランダム対戦 ${ended}/60 回が決着(2〜8人) ${bad}`);
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
