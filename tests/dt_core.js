// ダンダンティアーのルール本体(games/mini/dantier.js)のテスト。ブラウザもサーバも使わない
const core = require("../games/mini/dantier.js"), L = core.LADDER;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function seeded(s) { return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
function mk(ids, cfg = {}, seed = 1) {
  const st = { timer: null, finished: null, ms: 0 };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; st.ms = 0; }, finish: (r) => { st.finished = r; } };
  core.start(c, cfg, seeded(seed));
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const H = (c, id, m, host) => core.handle(c, id, m, host);

// ---- 本編 ----
{
  const { c, g, st } = mk(["a", "b", "c"], { theme: "おにぎりの具", target: 3, hints: 1 });
  check(g.mode === "secret" && g.theme === "おにぎりの具" && g.lo === 2 && g.hi === 6 && g.step === "clue", "本編: お題・S〜Dの5段・出題から");
  const giver = g.cur.giver, others = g.order.filter((x) => x !== giver);
  check(core.view(c, giver).cur.secret === g.cur.secret && core.view(c, others[0]).cur.secret === null, "秘密のランクは出題する人にだけ見える");
  check(H(c, others[0], { a: "clue", text: "鮭" }) === "あなたが出題する番ではありません", "出題する人以外は言葉を出せない");
  check(H(c, giver, { a: "clue", text: "   " }) === "言葉を入れてください", "空の言葉は出せない");
  H(c, giver, { a: "clue", text: "鮭" });
  check(g.step === "guess" && g.cur.text === "鮭" && st.ms === 120000, "言葉を出すと相談(120秒)");
  check(H(c, giver, { a: "pick", rank: 3 }) === "当てる人だけが選べます", "出題した人は選べない");
  check(H(c, others[0], { a: "pick", rank: 0 }) === "そのランクは選べません", "表にないランク(SSS)は選べない");
  H(c, others[0], { a: "pick", rank: 3 }); H(c, others[1], { a: "pick", rank: 4 });
  check(core.view(c, others[1]).cur.picks[others[0]] === 3, "みんなの選んだランクが見える");
  H(c, others[0], { a: "hint" });
  check(g.cur.removed.length === 2 && !g.cur.removed.includes(g.cur.secret) && g.hintsLeft === 0, "ヒント: 正解ではないランクを2つ消す");
  check(H(c, others[1], { a: "hint" }) === "このラウンドはもうヒントを使いました", "ヒントは1ラウンド1回");
  check(Object.values(g.cur.picks).every((r) => !g.cur.removed.includes(r)), "消えたランクを選んでいた人の選択は外れる");
  const secret = g.cur.secret;
  H(c, others[0], { a: "decide", rank: secret });
  check(g.step === "result" && g.cur.ok && g.streak === 1 && g.items.length === 1 && g.items[0].rank === secret, "正解: 連続+1・言葉は秘密のランクの行に");
  const lo = g.lo, hi = g.hi;
  check((secret === 2 && g.lo === 1) || (secret === 6 && g.hi === 7) || (secret > 2 && secret < 6 && lo === 2 && hi === 6), "端のランクが出題されたら外側が増える(そうでなければそのまま)");
  H(c, others[0], { a: "next" });
  check(g.step === "clue" && g.cur.giver !== giver && g.round === 2, "次のラウンドは次の人が出題");
}
{
  // はずれで連続がリセット・言葉は残る / クリア
  const { c, g, st } = mk(["a", "b"], { target: 3 });
  const play = (ok) => { const gv = g.cur.giver, o = g.order.find((x) => x !== gv); H(c, gv, { a: "clue", text: "x" + g.round }); const r = ok ? g.cur.secret : [g.lo, g.hi, g.lo + 1].find((x) => x !== g.cur.secret); H(c, o, { a: "decide", rank: r }); if (g.step === "result") H(c, o, { a: "next" }); };
  play(true); play(true); play(false);
  check(g.streak === 0 && g.best === 2 && g.items.length === 3 && g.items[2].ok === false, "はずれ: 連続は0に、言葉は表に残る");
  play(true); play(true); play(true);
  check(g.step === "end" && g.cleared && st.finished && Object.values(st.finished).every((v) => v === 1), "3回連続正解でクリア(全員1位で通算へ)");
}
{
  // 表の広がり: 端が出続けると SSS〜G まで
  const { c, g } = mk(["a", "b"], { target: 7 });
  let n = 0;
  while (g.step !== "end" && n++ < 60) {
    g.cur.secret = n % 2 ? g.lo : g.hi; // 端を出題させる
    const gv = g.cur.giver, o = g.order.find((x) => x !== gv); H(c, gv, { a: "clue", text: "w" + n });
    H(c, o, { a: "decide", rank: g.lo === g.cur.secret ? g.hi : g.lo }); // わざと外す
    if (g.step === "result") H(c, o, { a: "next" });
    if (g.lo === 0 && g.hi === 9) break;
  }
  check(g.lo === 0 && g.hi === 9, "端が出題されるたびに広がり、最大で SSS〜G");
}
{
  // 時間切れ: 出題 → 次の人 / 相談 → いちばん多く選ばれたランク
  const { c, g, fire } = mk(["a", "b", "c"]);
  const g1 = g.cur.giver; fire();
  check(g.step === "clue" && g.cur.giver !== g1 && g.items.length === 0, "言葉を考える時間切れ: 次の人が出題(言葉は増えない)");
  const gv = g.cur.giver, o = g.order.filter((x) => x !== gv);
  H(c, gv, { a: "clue", text: "y" });
  H(c, o[0], { a: "pick", rank: g.cur.secret }); H(c, o[1], { a: "pick", rank: g.cur.secret });
  fire();
  check(g.step === "result" && g.cur.ok, "相談の時間切れ: いちばん多く選ばれたランクで答える");
  fire();
  check(g.step === "clue", "結果は少しすると自動で次へ");
}
{
  // 出題する人が抜けた
  const { c, g } = mk(["a", "b", "c"]);
  const gv = g.cur.giver, r0 = g.round;
  core.onLeave(c, gv);
  check(g.step === "clue" && g.cur.giver !== gv && g.round === r0 && !g.order.includes(gv), "出題する人が抜けたら、次の人が出題(ラウンドはやり直し)");
}

// ---- みんなでティアー ----
{
  const { c, g, st } = mk(["a", "b"], { mode: "together", theme: "寿司ネタ" });
  check(g.step === "build" && st.timer === null, "みんなでティアー: 時間制限なしで作る");
  H(c, "a", { a: "add", text: "サーモン", rank: 2 }); H(c, "b", { a: "add", text: "たまご", rank: 5 });
  check(H(c, "b", { a: "add", text: "サーモン", rank: 3 }) === "同じ言葉がもうあります", "同じ言葉は置けない");
  const id = g.items[1].id;
  H(c, "a", { a: "move", id, rank: 3 });
  check(g.items[1].rank === 3, "だれでも動かせる");
  H(c, "a", { a: "expand", side: "top" }); H(c, "a", { a: "expand", side: "bottom" });
  check(g.lo === 1 && g.hi === 7, "上下にランクを足せる");
  check(H(c, "b", { a: "complete" }, false) === "完成させるのはホストです", "完成はホストだけ");
  H(c, "a", { a: "remove", id });
  H(c, "a", { a: "complete" }, true);
  check(g.step === "end" && g.items.length === 1 && st.finished, "消す・ホストが完成");
}

// ---- じぶんのティアー ----
{
  const { c, g, st, fire } = mk(["a", "b", "c"], { mode: "mine", theme: "おやつ" });
  const mk1 = g.cur.maker, gs = g.order.filter((x) => x !== mk1);
  check(g.step === "make" && st.ms === 180000, "じぶんのティアー: 作る人から(180秒)");
  check(H(c, gs[0], { a: "add", text: "x", rank: 2 }) === "作る人だけが置けます", "作る人以外は置けない");
  H(c, mk1, { a: "add", text: "ポテチ", rank: 2 }); H(c, mk1, { a: "add", text: "せんべい", rank: 4 });
  check(H(c, mk1, { a: "publish" }) === "言葉を3個以上置いてください", "3個以上で公開");
  H(c, mk1, { a: "add", text: "グミ", rank: 6 });
  check(core.view(c, gs[0]).cur.items.length === 0 && core.view(c, gs[0]).cur.count === 3, "作っている間、ほかの人には個数だけ");
  H(c, mk1, { a: "publish" });
  const v = core.view(c, gs[0]).cur;
  check(g.step === "guess" && v.items.length === 3 && v.items.every((x) => x.rank === undefined), "当てる人には言葉だけ(ランクは見えない)");
  const [p, s, gm] = g.cur.items;
  H(c, gs[0], { a: "pick", id: p.id, rank: 2 }); H(c, gs[0], { a: "pick", id: s.id, rank: 5 }); // ぴったり・1つずれ
  check(H(c, gs[0], { a: "gdone" }) === "全部の言葉のランクを選んでください", "全部選ぶまで回答できない");
  H(c, gs[0], { a: "pick", id: gm.id, rank: 2 }); H(c, gs[0], { a: "gdone" });
  check(g.step === "guess", "全員の回答を待つ");
  for (const x of g.cur.items) H(c, gs[1], { a: "pick", id: x.id, rank: x.rank });
  H(c, gs[1], { a: "gdone" });
  check(g.step === "reveal" && g.cur.pts[gs[0]] === 3 && g.cur.pts[gs[1]] === 6 && g.cur.pts[mk1] === 4, `答え合わせ: ぴったり2・1つずれ1、作った人は平均(${JSON.stringify(g.cur.pts)})`);
  fire();
  check(g.step === "make" && g.cur.maker !== mk1, "次の人が作る");
  // 残り2人: 作る時間切れ(3個未満)は飛ばす・3個以上なら公開
  fire();
  check(g.step === "make", "作る時間切れ(3個未満)は次の人へ");
  const m3 = g.cur.maker; for (const t of ["a1", "a2", "a3"]) H(c, m3, { a: "add", text: t, rank: 3 });
  fire();
  check(g.step === "guess", "作る時間切れ(3個以上)はそのまま公開");
  fire(); fire();
  check(g.step === "end" && st.finished && Object.keys(st.finished).length === 3, "全員作り終えたら終了(合計点で順位)");
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
process.exit(fails ? 1 : 0);
