const core = require("../games/mini/bombanana.js"), T = core._t;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids = ["a", "b", "c"], cfg = {}) {
  const st = { finished: null };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: () => {}, clearTimer: () => {}, finish: (r) => { st.finished = r; } };
  core.start(c, cfg);
  const g = c.g; T.begin(g);
  const blind = ids.find((x) => g.role[x] === "blind"), deaf = ids.find((x) => g.role[x] === "deaf"), mute = ids.find((x) => g.role[x] === "mute");
  return { c, g, st, blind, deaf, mute };
}
const H = (c, id, m) => core.handle(c, id, m);
// 正しい操作を作る(テスト用の「完璧なチーム」)
function solve(c, g, blind, i) {
  const m = g.bomb.mods[i], A = (x) => H(c, blind, { a: "act", mod: i, ...x });
  switch (m.kind) {
    case "cable": return A({ part: m.colors.indexOf(T.CABLE[m.n][m.led]) });
    case "slider": return m.colors.forEach((col, k) => A({ part: k, dir: T.SLIDER[col][k] }));
    case "direction": { let guard = 0; while (!m.solved && guard++ < 9) A({ dir: T.dirAnswer(m.num, m.led) }); return; }
    case "calc": { for (const d of String(m.res)) A({ part: m.keys.indexOf(+d) }); A({ part: 10 }); return A({ part: m.keys.indexOf(T.CALC2[m.led][m.res % 2 ? 0 : 1]) }); }
    case "symbol": { let guard = 0; while (!m.solved && guard++ < 9) A({ part: m.buttons.indexOf(T.SYMBOL[m.syms[m.sound]][m.stage]) }); return; }
    case "piano": return T.PIANO[m.octave][m.led].forEach((k) => A({ part: k }));
    case "soundboard": return T.SOUND[m.nums[m.sound]][m.colors[m.sound]].forEach((p) => A({ part: p }));
    case "monkey": { let guard = 0; while (!m.solved && guard++ < 9) { const ans = m.heats.map((h, k) => T.MONKEY[m.buttons[h]][k]); for (const col of ans) A({ part: m.buttons.indexOf(col) }); } return; }
    case "morse": { m.digits.forEach((d, k) => { while (m.dials[k] !== d) A({ what: "dial", part: k }); }); return A({ what: "enter" }); }
    case "maze": {
      // 幅優先で道を探す
      const W = T.MAZES[m.num], prev = { [m.at]: null }, q = [m.at];
      while (q.length) { const x = q.shift(); if (x === m.goal) break; [0, 1, 2, 3].forEach((k) => { if (W[x][k]) return; const n = x + [-6, 1, 6, -1][k]; if (!(n in prev)) { prev[n] = [x, k]; q.push(n); } }); }
      const path = []; let x = m.goal; while (prev[x]) { path.unshift(prev[x][1]); x = prev[x][0]; }
      return path.forEach((k) => A({ dir: ["up", "right", "down", "left"][k] }));
    }
    case "switch": { m.lights.forEach((col, k) => { if (T.SWITCH_RULE[col].up(m.nums[k]) !== m.up[k]) A({ what: "toggle", part: k }); }); return A({ what: "enter" }); }
  }
}
// 全モジュールを正しく解ける
for (const kind of ["cable", "slider", "direction", "calc", "symbol", "piano", "soundboard", "monkey", "morse", "maze", "switch"]) {
  let ok = 0;
  for (let n = 0; n < 40; n++) {
    const { c, g, blind } = mk(["a", "b", "c"], { mode: "custom", custom: { secs: 300, mistakes: 1, mods: [kind], chaos: [] } });
    solve(c, g, blind, 0);
    if (g.step === "clear" && g.bomb.strikes === 0) ok++;
  }
  check(ok === 40, `${kind}: 正しい手順で40回とも解除・ミス0`);
}
{
  const { c, g, blind, deaf, mute, st } = mk(["a", "b", "c"], { mode: "custom", custom: { secs: 300, mistakes: 1, mods: ["cable", "cable"], chaos: [] } });
  check(new Set(Object.values(g.role)).size === 3, "3人に3つの役割");
  check(H(c, deaf, { a: "act", mod: 0, part: 0 }) === "爆弾に触れられるのは見ざるだけです", "見ざる以外は爆弾を操作できない");
  const vb = core.view(c, blind), vd = core.view(c, deaf), vm = core.view(c, mute);
  check(vb.bomb.mods[0].colors === null && vb.bomb.mods[0].led === null && vb.bomb.mods[0].n >= 3, "見ざるには色とランプが見えない(本数は分かる)");
  check(Array.isArray(vd.bomb.mods[0].colors) && vd.bomb.mods[0].led, "聞かざるには色とランプが見える");
  const man = H(c, mute, { a: "manual" });
  check(vm.bomb.mods[0].kind === "hidden" && man.manual && man.manual.cable[3], "言わざるには爆弾が見えず、マニュアルだけ");
  check(typeof H(c, blind, { a: "manual" }) === "string" && typeof H(c, deaf, { a: "manual" }) === "string", "マニュアルは言わざるだけ");
  check(typeof H(c, mute, { a: "say", text: "赤" }) === "string", "言わざるはしゃべれない");
  const s1 = H(c, blind, { a: "say", text: "2本目?" }), s2 = H(c, deaf, { a: "say", text: "左から2本目" });
  check(s1.say.to.join() === mute && s2.say.to.sort().join() === [blind, mute].sort().join(), "声: 見ざる→言わざる、聞かざる→見ざる・言わざる(聞かざるには届かない)");
  // ミス2回で爆発(許されるミス1)
  const m0 = g.bomb.mods[0], wrong = m0.colors.findIndex((x) => x !== T.CABLE[m0.n][m0.led]);
  H(c, blind, { a: "act", mod: 0, part: wrong });
  check(g.bomb.strikes === 1 && g.step === "play", "ミス1回はまだ大丈夫");
  const m1 = g.bomb.mods[1], wrong1 = m1.colors.findIndex((x) => x !== T.CABLE[m1.n][m1.led]);
  H(c, blind, { a: "act", mod: 1, part: wrong1 });
  check(g.step === "boom" && st.finished, "ミスが上限を超えたら爆発");
}
{
  // 時間切れ・カオス
  const { c, g, blind } = mk(["a", "b", "c"], { mode: "custom", custom: { secs: 120, mistakes: 3, mods: ["cable"], chaos: ["pressure", "rslider", "alarm"] } });
  const pr = g.bomb.mods.findIndex((m) => m.kind === "pressure"), rs = g.bomb.mods.findIndex((m) => m.kind === "rslider"), al = g.bomb.mods.findIndex((m) => m.kind === "alarm");
  g.bomb.mods[pr].v = 99.9; core.tick(c);
  check(g.bomb.strikes === 1, "圧力が上がりきるとミス");
  H(c, blind, { a: "act", mod: pr, what: "press" }); check(g.bomb.mods[pr].v < 50, "真ん中のボタンで圧力が下がる");
  g.bomb.mods[rs].v = 80; H(c, blind, { a: "act", mod: rs, what: "pull" }); check(g.bomb.mods[rs].v === 0, "スライダーを引き下げる");
  g.bomb.mods[al].next = Date.now() - 1; core.tick(c);
  const hot = [...g.bomb.mods[al].hot];
  check(g.bomb.mods[al].active && hot.length === 3, "アラーム: 熱いボタン3つ");
  check(core.view(c, blind).bomb.mods[al].hot.length === 3 && core.view(c, g.order.find((x) => g.role[x] === "deaf")).bomb.mods[al].hot === null, "熱さは見ざるにだけ分かる");
  for (const h of hot) H(c, blind, { a: "act", mod: al, part: h });
  check(!g.bomb.mods[al].active && g.bomb.strikes === 1, "熱いボタンを全部押すとアラームが止まる");
  // カオスは解かなくても、解除モジュールが全部終われば成功
  solve(c, g, blind, 0);
  check(g.step === "clear", "解除モジュールを全部解けば、カオスが残っていても成功");
  const { c: c2, g: g2 } = mk(["a", "b", "c"], { mode: "custom", custom: { secs: 120, mistakes: 3, mods: ["cable"], chaos: [] } });
  g2.bomb.end = Date.now() - 1; core.tick(c2);
  check(g2.step === "boom" && g2.result.why === "時間切れ", "時間切れで爆発");
}
{
  // 環境ギミック
  const { c, g, deaf } = mk(["a", "b", "c"], { mode: "custom", custom: { secs: 300, mistakes: 3, mods: ["cable"], chaos: [], hazards: true } });
  g.hazard.next = Date.now() - 1; core.tick(c);
  check(g.hazard.dark || g.hazard.noise, "停電か騒音が起きる");
  const which = g.hazard.dark ? "lamp" : "radio";
  H(c, deaf, { a: "env", what: which });
  check(!g.hazard.dark && !g.hazard.noise, "ランプ/ラジオを操作すると直る(だれでもできる)");
}
{
  // キャンペーン: 30レベルのモジュールの数・時間
  const lv = core.CAMPAIGN;
  check(lv.length === 30 && lv[0][0] === 150 && lv[0][1] === 1 && lv[29][3].join() === "alarm,alarm", "キャンペーン30レベル(Lv1: 2分30秒・ミス1、Lv30: アラーム2つ)");
  for (let L = 1; L <= 30; L++) {
    const { c, g, blind } = mk(["a", "b", "c"], { mode: "campaign", level: L });
    for (let i = 0; i < g.bomb.mods.length; i++) if (!["pressure", "rslider", "alarm"].includes(g.bomb.mods[i].kind)) solve(c, g, blind, i);
    if (g.step !== "clear") { check(false, `レベル${L}が解けない`); break; }
    if (L === 30) check(true, "全30レベル、正しい手順で解除できる");
  }
  const { c, g, blind } = mk(["a", "b", "c"], { mode: "campaign", level: 3 });
  for (let i = 0; i < g.bomb.mods.length; i++) solve(c, g, blind, i);
  H(c, blind, { a: "next" });
  check(g.level === 4 && g.step === "brief", "成功したら次のレベルへ");
}
{
  // エンドレス
  const { c, g, blind } = mk(["a", "b", "c"], { mode: "endless" });
  const end0 = g.bomb.end;
  solve(c, g, blind, 0);
  check(g.score === 1, "エンドレス: 解くと点が入る");
  for (let i = 1; i < g.bomb.mods.length; i++) solve(c, g, blind, i);
  check(g.wave === 1 && g.step === "brief", "ウェーブを全部解くと次の爆弾");
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
