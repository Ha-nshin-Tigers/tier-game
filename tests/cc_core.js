const core = require("../games/mini/citychase.js"), T = core._t;
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
function mk(ids, cfg = {}) {
  const st = { timer: null, finished: null, ms: 0 };
  const c = { g: null, members: () => ids, live: () => ids, has: () => true, nameOf: (x) => x, setTimer: (ms, fn) => { st.timer = fn; st.ms = ms; }, clearTimer: () => { st.timer = null; }, finish: (r) => { st.finished = r; } };
  core.start(c, cfg);
  return { c, g: c.g, st, fire: () => { const f = st.timer; st.timer = null; f && f(); } };
}
const H = (c, id, m) => core.handle(c, id, m);
{
  const { c, g, st } = mk(["a", "b", "c"], { thief: "b" });
  check(g.thief === "b" && g.police.join() === "a,c" && g.step === "place", "犯人役を指定・警察2人・ヘリの配置から");
  check(H(c, "b", { a: "place", at: "0,0" }) === "ヘリを置くのは警察です", "犯人はヘリを置けない");
  H(c, "a", { a: "place", at: "0,0" }); check(H(c, "c", { a: "place", at: "0,0" }) === "そこにはもうヘリがいます", "同じ交差点に2機は置けない");
  check(H(c, "c", { a: "place", at: "4,4" }) === "交差点を選んでください", "交差点は4×4");
  H(c, "c", { a: "place", at: "1,1" }); H(c, "a", { a: "place", at: "3,3" });
  check(g.step === "thief" && g.round === 1, "3機置いたら犯人の番");
  check(core.view(c, "a").car === null && core.view(c, "b").moves.length === 25, "警察には車が見えない・犯人は1ラウンド目はどこでも");
  H(c, "b", { a: "hide", to: "4,4" });
  check(g.step === "police" && g.traces["4,4"] === 1 && Object.keys(core.view(c, "a").traces).length === 0, "車を隠すと痕跡1。警察には見えない");
  check(H(c, "a", { a: "heli", h: 0, kind: "search", to: "2,2" }) === "ヘリのまわりの4つのビルから選んでください", "捜索はヘリのまわり4つだけ");
  H(c, "a", { a: "heli", h: 0, kind: "search", to: "1,1" }); check(g.empty["1,1"] === 1, "空のビルは記録");
  check(H(c, "c", { a: "heli", h: 1, kind: "move", to: "2,2" }) === "タテヨコのとなりの交差点を選んでください", "ヘリはタテヨコ1マス");
  H(c, "c", { a: "heli", h: 1, kind: "move", to: "1,2" });
  check(H(c, "a", { a: "heli", h: 1, kind: "pass" }) === "このヘリはこのラウンドもう行動しました", "1機1回");
  H(c, "a", { a: "heli", h: 2, kind: "move", to: "3,2" });
  check(g.step === "thief" && g.round === 2, "3機行動したら次のラウンド");
  check(core.view(c, "b").moves.sort().join() === "3,4,4,3", "犯人はタテヨコのとなり(痕跡なし)へ");
  check(H(c, "b", { a: "hide", to: "3,3" }) !== undefined, "ナナメは不可");
  H(c, "b", { a: "hide", to: "4,3" });
  // 痕跡を見つける → 車を見つける
  g.helis[2] = "3,3"; H(c, "a", { a: "heli", h: 2, kind: "search", to: "4,4" });
  check(core.view(c, "a").traces["4,4"] === 1, "痕跡を見つけると番号が見える");
  H(c, "a", { a: "heli", h: 0, kind: "search", to: "4,3".replace("4,3", "0,1") });
  H(c, "c", { a: "heli", h: 1, kind: "pass" });
  // 3ラウンド目
  const before = g.car; H(c, "b", { a: "hide", to: T.moves(g)[0] });
  H(c, "a", { a: "heli", h: 2, kind: "search", to: g.car === "4,3" || T.around(g.helis[2]).includes(g.car) ? g.car : T.around(g.helis[2])[0] });
  if (T.around(g.helis[2]).includes(g.car)) check(g.step === "end" && st.finished.a === 1 && st.finished.c === 1 && st.finished.b === 0, "車を見つけたら警察の勝ち");
}
{
  // 11ラウンド逃げ切り・包囲
  let thiefWin = 0, policeWin = 0, surround = 0;
  for (let n = 0; n < 400; n++) {
    const ids = ["a", "b", "c", "d"].slice(0, 2 + (n % 3));
    const { c, g, st, fire } = mk(ids);
    for (let k = 0; k < 3; k++) H(c, g.police[0], { a: "place", at: `${k},${k}` });
    let guard = 0;
    while (!st.finished && guard++ < 200) {
      if (g.step === "thief") { const ms = T.moves(g); H(c, g.thief, { a: "hide", to: ms[Math.floor(Math.random() * ms.length)] }); }
      else if (g.step === "police") for (let h = 0; h < 3 && g.step === "police"; h++) {
        if (Math.random() < 0.5) H(c, g.police[h % g.police.length], { a: "heli", h, kind: "search", to: T.around(g.helis[h])[Math.floor(Math.random() * 4)] });
        else { const to = T.nbI(g.helis[h]).filter((x) => !g.helis.includes(x)); if (to.length) H(c, g.police[0], { a: "heli", h, kind: "move", to: to[0] }); else H(c, g.police[0], { a: "heli", h, kind: "pass" }); }
      }
      if (n % 9 === 0) fire();
    }
    if (!st.finished) { check(false, "終わらない"); break; }
    if (g.winner === "thief") { thiefWin++; if (g.round !== 11) check(false, "11ラウンド前に犯人勝ち"); } else policeWin++;
    if (g.log.some((x) => x.includes("包囲"))) surround++;
  }
  check(thiefWin > 0 && policeWin > 0, `ランダムに400回: 犯人${thiefWin}勝・警察${policeWin}勝(包囲${surround})`);
}
{
  // 時間切れ・抜ける
  const { c, g, st, fire } = mk(["a", "b"], { thief: "a" });
  fire(); check(g.helis.length === 3 && g.step === "thief", "時間切れでヘリは自動配置");
  fire(); check(g.step === "police" && g.car, "時間切れで犯人は自動で隠れる");
  fire(); check(g.step === "thief" && g.round === 2, "時間切れで警察はパス");
  core.onLeave(c, "b"); check(st.finished && g.winner === "thief", "警察が全員抜けたら犯人の勝ち");
}
console.log(fails ? `NG ${fails}件` : "全項目OK");
