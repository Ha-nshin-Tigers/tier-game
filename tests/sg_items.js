const core = require("../games/mini/shotgun.js");
let fails = 0; const check = (c, m) => { console.log((c ? "OK  " : "NG  ") + m); if (!c) fails++; };
// タイマーは手動で進める偽の部屋
function mk(ids) {
  const room = { game: null, timer: null, finished: null };
  const c = {
    get g() { return room.game; }, set g(v) { room.game = v; },
    members: () => ids, live: () => ids, has: (id) => ids.includes(id), nameOf: (id) => id,
    setTimer: (ms, fn) => { room.timer = fn; }, clearTimer: () => { room.timer = null; }, finish: (raw) => { room.finished = raw; },
  };
  core.start(c, { lives: 4, turnSecs: 0 });
  room.timer && (() => { const f = room.timer; room.timer = null; f(); })();
  return { c, room, run() { const f = room.timer; room.timer = null; f && f(); } };
}
function setup(shells, items, turn = "a") {
  const t = mk(["a", "b", "c"]);
  const g = t.c.g;
  g.seats = ["a", "b", "c"]; g.turnId = turn; g.step = "turn"; g.dir = 1;
  g.shells = shells; g.pos = 0; g.spent = [];
  for (const id of g.seats) Object.assign(g.st[id], { hp: 3, items: [], cuffed: false, know: {}, alive: true });
  g.maxHp = 4; g.st[turn].items = items;
  return { ...t, g };
}
const view = (t, me) => core.view(t.c, me);
let t;
t = setup(["live", "blank"], ["glass"]); core.handle(t.c, "a", { a: "item", idx: 0 });
check(view(t, "a").know[0] === "live" && !Object.keys(view(t, "b").know).length, "虫メガネ: 今の弾が本人だけに分かる");
t = setup(["live", "blank"], ["cig"]); core.handle(t.c, "a", { a: "item", idx: 0 });
check(t.g.st.a.hp === 4, "タバコ: ライフ+1");
t = setup(["live", "blank"], ["cig"]); t.g.st.a.hp = 4; const e1 = core.handle(t.c, "a", { a: "item", idx: 0 });
check(typeof e1 === "string" && t.g.st.a.items.length === 1, "タバコ: 満タンなら使えない(消えない)");
t = setup(["live", "blank"], ["beer"]); core.handle(t.c, "a", { a: "item", idx: 0 });
check(t.g.pos === 1 && t.g.spent[0] === "live" && t.g.event.shell === "live" && t.g.turnId === "a", "ビール: 今の弾を抜いて全員に見せる・番はそのまま");
t = setup(["live"], ["beer"]); core.handle(t.c, "a", { a: "item", idx: 0 });
check(t.g.step === "load" && t.g.turnId === "a", "ビール: 最後の弾を抜いたら込め直し・番はそのまま");
t = setup(["live", "blank"], ["cuffs"]); core.handle(t.c, "a", { a: "item", idx: 0 });
check(t.g.st.b.cuffed, "手錠: 番の順で次の人(b)が休み");
core.handle(t.c, "a", { a: "shoot", target: "c" }); t.run();
check(t.g.turnId === "c" && !t.g.st.b.cuffed, "手錠: b の番は飛ばされて c の番");
t = setup(["live", "blank"], ["saw"]); core.handle(t.c, "a", { a: "item", idx: 0 }); core.handle(t.c, "a", { a: "shoot", target: "b" });
check(t.g.st.b.hp === 1, "ノコギリ: 実弾のダメージが2");
t = setup(["live", "blank"], ["medicine"]); let up = 0, down = 0;
for (let i = 0; i < 200; i++) { const x = setup(["live", "blank"], ["medicine"]); core.handle(x.c, "a", { a: "item", idx: 0 }); if (x.g.st.a.hp === 4) up++; else if (x.g.st.a.hp === 2) down++; }
check(up > 60 && down > 60 && up + down === 200, `期限切れ薬: 回復(上限まで)と−1がおよそ半々(${up}/${down})`);
t = setup(["live", "blank", "live"], ["phone"]); core.handle(t.c, "a", { a: "item", idx: 0 });
const k = Object.keys(view(t, "a").know);
check(k.length === 1 && +k[0] >= 1 && view(t, "a").know[k[0]] === t.g.shells[+k[0]], "使い捨て携帯: 先の1発が本人だけに分かる(今の弾以外)");
t = setup(["live", "blank"], ["glass", "inverter"]); core.handle(t.c, "a", { a: "item", idx: 0 }); core.handle(t.c, "a", { a: "item", idx: 0 });
check(t.g.shells[0] === "blank" && view(t, "a").know[0] === "blank", "インバータ: 今の弾が入れ替わる(知っていた内容も更新)");
t = setup(["live", "blank"], ["jammer"]); core.handle(t.c, "a", { a: "item", idx: 0, target: "c" });
check(t.g.st.c.cuffed && !t.g.st.b.cuffed, "ジャマー: 選んだ相手(c)が休み");
t = setup(["live", "blank"], ["remote"]); core.handle(t.c, "a", { a: "item", idx: 0 }); core.handle(t.c, "a", { a: "shoot", target: "b" }); t.run();
check(t.g.turnId === "c", "リモコン: 番が逆回り(a→c)");
t = setup(["live", "blank"], ["adrenaline"]); t.g.st.b.items = ["saw"];
core.handle(t.c, "a", { a: "item", idx: 0, target: "b", pick: 0 });
check(t.g.saw && t.g.st.b.items.length === 0 && t.g.st.a.items.length === 0, "アドレナリン: 相手のノコギリを奪ってその場で使う");
t = setup(["live", "blank"], ["adrenaline"]); t.g.st.b.items = ["cig"]; t.g.st.a.hp = 4;
const e2 = core.handle(t.c, "a", { a: "item", idx: 0, target: "b", pick: 0 });
check(typeof e2 === "string" && t.g.st.a.items.length === 1 && t.g.st.b.items.length === 1, "アドレナリン: 使えないアイテムなら何も消えない");
// 撃つ
t = setup(["blank", "live"], []); core.handle(t.c, "a", { a: "shoot", target: "a" }); t.run();
check(t.g.turnId === "a" && t.g.st.a.hp === 3, "自分に空砲 → もう一度自分の番");
t = setup(["blank", "live"], []); core.handle(t.c, "a", { a: "shoot", target: "b" }); t.run();
check(t.g.turnId === "b", "相手に空砲 → 次の人の番");
t = setup(["live", "live"], []); t.g.st.b.hp = 1; core.handle(t.c, "a", { a: "shoot", target: "b" });
check(!t.g.st.b.alive && t.g.out.includes("b"), "実弾でライフ0 → 脱落");
t = setup(["live"], []); t.g.st.b.hp = 1; t.g.st.c.hp = 1; core.handle(t.c, "a", { a: "shoot", target: "b" }); t.run();
check(t.g.step === "load", "弾がなくなったら込め直し");
console.log(fails ? `\n${fails}件 失敗` : "\n全項目OK"); process.exit(fails ? 1 : 0);
