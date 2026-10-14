const core = require("../games/mini/shotgun.js");
const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function game(settings, ids = ["a", "b", "c"]) {
  const room = { game: null, timer: null };
  const c = { get g() { return room.game; }, set g(v) { room.game = v; }, members: () => ids, live: () => ids, has: (id) => ids.includes(id), nameOf: (id) => id,
    setTimer: (ms, fn) => { room.timer = fn; }, clearTimer: () => { room.timer = null; }, finish: () => {} };
  core.start(c, settings);
  return { c, g: room.game, run() { const f = room.timer; room.timer = null; f && f(); } };
}
// 込める弾の数・実弾の割合
let ok = true, okL = true, lo = 99, hi = 0;
for (let i = 0; i < 300; i++) { const g = game({ shells: "few" }).g; const n = g.shells.length; if (n < 2 || n > 4) ok = false; }
check(ok, "込める弾 少なめ: 2〜4発");
for (let i = 0; i < 300; i++) { const g = game({ shells: "many" }).g; const n = g.shells.length; lo = Math.min(lo, n); hi = Math.max(hi, n); if (!g.shells.includes("live") || !g.shells.includes("blank")) okL = false; }
check(lo >= 5 && hi <= 8 && okL, `込める弾 多め: 5〜8発(${lo}〜${hi})・実弾/空砲は最低1発ずつ`);
let rl = 0, rh = 0;
for (let i = 0; i < 300; i++) { const a = game({ shells: "many", liveRatio: "low" }).g, b = game({ shells: "many", liveRatio: "high" }).g; rl += a.counts.live / a.shells.length; rh += b.counts.live / b.shells.length; }
check(rl / 300 < 0.4 && rh / 300 > 0.6, `実弾の割合 少なめ ${(rl / 3).toFixed(0)}% / 多め ${(rh / 3).toFixed(0)}%`);
// 配る数・上限・重なり・出やすさ
check(Object.values(game({ perLoad: 0 }).g.st).every((s) => s.items.length === 0), "配る数0: アイテムなし");
check(Object.values(game({ perLoad: 4 }).g.st).every((s) => s.items.length === 4), "配る数4: 4個ずつ");
let rmin = 9, rmax = 0;
for (let i = 0; i < 200; i++) for (const s of Object.values(game({ perLoad: "r" }).g.st)) { rmin = Math.min(rmin, s.items.length); rmax = Math.max(rmax, s.items.length); }
check(rmin === 1 && rmax === 4, `ランダム: 1〜4個(${rmin}〜${rmax})`);
const t = game({ perLoad: 4, maxItems: 6 }); for (const id of t.g.seats) t.g.st[id].items = ["cig", "cig", "cig", "cig"]; t.g.shells = []; t.g.pos = 0; t.g.step = "turn";
core.handle(t.c, t.g.turnId, { a: "shoot", target: t.g.turnId }); // 弾がない → このテストでは込め直しを直接呼ぶ
const t2 = game({ perLoad: 4, maxItems: 6 }); for (const id of t2.g.seats) t2.g.st[id].items = ["cig", "cig", "cig", "cig"];
t2.g.shells = ["blank"]; t2.g.pos = 0; t2.g.step = "turn"; const tid = t2.g.turnId; const other = t2.g.seats.find((x) => x !== tid);
core.handle(t2.c, tid, { a: "shoot", target: other }); t2.run();
check(t2.g.seats.every((id) => t2.g.st[id].items.length === 6), "上限6: 4個持っていたら2個だけ増える");
let dupFound = false; for (let i = 0; i < 300; i++) for (const s of Object.values(game({ perLoad: 4, noDup: true }).g.st)) if (new Set(s.items).size !== s.items.length) dupFound = true;
check(!dupFound, "重ならない設定: 1回の配布で同じアイテムなし");
let bad = false, cnt = { saw: 0, cig: 0 };
for (let i = 0; i < 400; i++) for (const s of Object.values(game({ perLoad: 4, weights: { glass: 0, beer: 0, saw: 3, cig: 1 } }).g.st)) for (const k of s.items) { if (k === "glass" || k === "beer") bad = true; if (k in cnt) cnt[k]++; }
check(!bad && cnt.saw > cnt.cig * 3, `出やすさ: 出ないは出ない・多い(ノコギリ${cnt.saw}) > 少ない(タバコ${cnt.cig})`);
// 自分を撃って空砲
const s1 = game({ selfAgain: false }); s1.g.shells = ["blank", "live"]; s1.g.pos = 0; s1.g.step = "turn"; const me1 = s1.g.turnId;
core.handle(s1.c, me1, { a: "shoot", target: me1 }); s1.run();
check(s1.g.turnId !== me1, "自分を撃って空砲→次の人(続けない設定)");
// サーバ経由: ホストだけが変えられる・リセット・出るアイテム0は拒否
(async () => {
  const R = "T" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const mk = (n) => { const ws = new WebSocket("ws://localhost:3123/shotgun/ws"); const c = { ws, S: null, errs: [], pid: "pid" + n + "99999", token: "tok" + n + "9999999999999999" };
    ws.on("message", (b) => { const m = JSON.parse(b); if (m.t === "state") c.S = m.room; if (m.t === "error") c.errs.push(m.msg); }); c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on("open", r)); return c; };
  const A = mk("aa"), B = mk("bb"); await Promise.all([A.open, B.open]);
  A.send({ t: "join", room: R, name: "A", pid: A.pid, token: A.token }); await sleep(40); B.send({ t: "join", room: R, name: "B", pid: B.pid, token: B.token }); await sleep(80);
  A.send({ t: "settings", s: { perLoad: "r", shells: "few", noDup: true, selfAgain: false, weights: { saw: 3 }, lives: 99 } }); await sleep(60);
  const st = A.S.settings;
  check(st.perLoad === "r" && st.shells === "few" && st.noDup && !st.selfAgain && st.weights.saw === 3 && st.lives === 4, "ホストの設定が反映・不正な値(ライフ99)は無視");
  B.send({ t: "settings", s: { shells: "many" } }); await sleep(60);
  check(A.S.settings.shells === "few", "ホスト以外は変えられない");
  A.send({ t: "settings", s: { weights: Object.fromEntries(A.S.itemKeys.map((k) => [k, 0])) } }); await sleep(60);
  check(A.errs.some((e) => /1つ以上/.test(e)) && A.S.settings.weights.saw === 3, "出るアイテムが0になる設定は拒否");
  A.send({ t: "settings", s: { reset: true } }); await sleep(60);
  check(A.S.settings.shells === "normal" && A.S.settings.perLoad === 2 && A.S.settings.selfAgain, "おすすめ設定に戻す");
  console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
})();
