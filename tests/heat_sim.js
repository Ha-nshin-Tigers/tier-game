const core = require("../games/mini/heat.js");
let fails = 0, games = 0, spins = 0, rounds = 0;
for (let seed = 1; seed <= 240; seed++) {
  const track = Object.keys(core.TRACKS)[seed % 4], n = 2 + (seed % 5);
  const ids = "abcdef".slice(0, n).split(""); const st = {};
  const c = { g: null, members: () => ids, live: () => ids, has: (x) => ids.includes(x), nameOf: (x) => x, setTimer: (ms, fn) => { st.t = fn; }, clearTimer: () => { st.t = null; }, finish: (r) => { st.f = r; } };
  let s = seed * 7919; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  core.start(c, { track, laps: seed % 3 === 0 && track !== "espana" ? 0 : 1, garage: ["off", "basic", "advanced", "all"][seed % 4], weather: seed % 2 === 0 }, rnd);
  for (let k = 0; k < 40 && c.g.step === "draft"; k++) core.handle(c, c.g.draft.order[c.g.draft.i], { a: "pick", i: Math.floor(rnd() * c.g.draft.market.length) });
  const g = c.g; const H = (id, m) => core.handle(c, id, m);
  const total = (id) => { const p = g.P[id]; return p.deck.length + p.hand.length + p.discard.length + p.play.length + p.engine.length; };
  const base = Object.fromEntries(ids.map((id) => [id, total(id)]));
  const st0 = Object.fromEntries(ids.map((id) => [id, [...g.P[id].deck, ...g.P[id].hand, ...g.P[id].discard].filter((cd) => cd.k === "x").length]));
  let guard = 0;
  while (g.step !== "end" && guard++ < 5000) {
    if (g.step === "plan") {
      for (const id of ids) {
        const p = g.P[id]; if (p.done || p.plan) continue;
        if (rnd() < 0.05) continue; // たまに時間切れ
        const shift = [-1, 0, 1, 1, 2, -2][Math.floor(rnd() * 6)];
        const gear = Math.min(4, Math.max(1, p.gear + shift)), sh = gear - p.gear;
        const playable = p.hand.filter((cd) => cd.k !== "h"); const heat = p.hand.filter((cd) => cd.k === "h");
        let pick = playable.sort(() => rnd() - 0.5).slice(0, gear).map((cd) => cd.id);
        if (pick.length < gear) pick = pick.concat(heat.slice(0, gear - pick.length).map((cd) => cd.id));
        const r = H(id, { a: "plan", shift: sh, ids: pick });
        if (typeof r === "string" && !/ヒートが|ギアは/.test(r)) { console.log("plan NG", r); fails++; }
      }
      if (g.step === "plan") st.t && st.t();
    } else if (g.turn) {
      const t = g.turn, id = t.pid;
      if (rnd() < 0.05) { st.t && st.t(); continue; }
      if (t.phase === "choose") { H(id, { a: "choose", vals: t.choices.map((ch) => ch.opts[Math.floor(rnd() * ch.opts.length)]) }); continue; }
      if (t.phase === "react") {
        const P = g.P[id];
        if (rnd() < 0.5) H(id, { a: "reduce", n: 3 });
        if (rnd() < 0.5) H(id, { a: "supercool" });
        if (rnd() < 0.5) H(id, { a: "accel" });
        if (rnd() < 0.5 && t.pool.salvage) H(id, { a: "salvage", ids: P.discard.filter(() => rnd() < 0.5).map((cd) => cd.id) });
        const dc = P.hand.find((cd) => core.CARDS[cd.k] && core.CARDS[cd.k].sym && core.CARDS[cd.k].sym.direct);
        if (dc && rnd() < 0.6) H(id, { a: "direct", id: dc.id });
        if (t.pool.refresh.length && rnd() < 0.6) H(id, { a: "refresh", id: t.pool.refresh[0] });
        const dt = core._t.draftTargets(g, id); if (dt.length && rnd() < 0.7) H(id, { a: "draft", k: dt[dt.length - 1] });
        if (rnd() < 0.4) H(id, { a: "boost" });
        if (rnd() < 0.7) H(id, { a: "cool", n: 3 });
        if (rnd() < 0.5) H(id, { a: "adr" });
        H(id, { a: "react" });
      } else if (t.phase === "slip") H(id, { a: "slip", yes: rnd() < 0.6 });
      else if (t.phase === "discard") {
        const ok = g.P[id].hand.filter((cd) => !core.CARDS[cd.k].keep);
        H(id, { a: "discard", ids: ok.filter(() => rnd() < 0.3).map((cd) => cd.id) });
      }
    } else { console.log("stuck", g.step); fails++; break; }
    // 不変条件: カードの枚数(スピンでもらうストレス分だけ増える)・位置の重なり
    for (const id of ids) {
      const p = g.P[id]; const extra = (p._x = p._x || 0);
      const stressNow = [...p.deck, ...p.hand, ...p.discard, ...p.play].filter((cd) => cd.k === "x").length;
      if (total(id) - base[id] !== stressNow - st0[id]) { console.log("count NG", seed, id, total(id), base[id], stressNow); fails++; break; }
      if (p.hand.length > 7 + 4 && !g.turn) { console.log("hand NG", p.hand.length); fails++; }
      if (p.engine.length < 0 || p.gear < 1 || p.gear > 4) { console.log("state NG"); fails++; }
    }
    const occ = {};
    for (const id of ids) { const p = g.P[id]; if (p.removed) continue; const k = p.pos + ":" + p.spot; if (occ[k]) { console.log("overlap", seed, k); fails++; } occ[k] = 1; }
    if (fails > 5) break;
  }
  if (g.step !== "end") { console.log("not finished", seed, track, n, g.round); fails++; }
  games++; rounds += g.round; spins += g.log.filter((t) => t.includes("スピン")).length;
  if (fails > 5) break;
}
console.log(`${games}レース・平均${(rounds / games).toFixed(1)}ラウンド・スピン${spins}回`);
console.log(fails ? `NG ${fails}件` : "全項目OK");
