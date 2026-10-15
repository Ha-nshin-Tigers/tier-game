"use strict";
// オリフラム(Oriflamme)のルール本体。部屋・入室は games/oriflamme.js が受け持つ。
// 各プレイヤーは同じ10種類のカード(自分の色)から、ランダムに3枚を除いた7枚を手札にする。全6ラウンド。
// 配置: 先手から順に1枚ずつ、伏せたまま「列」の左端か右端、または自分のカードの上に重ねて置く。
// 解決: 列の端から順に(向きはゲームの最初に決めて固定)、伏せたカードの持ち主は「公開する(上の影響力をもらって能力を使う)」か
//       「伏せたまま(影響力1を上に置く)」を選ぶ。表向きのカードは毎ラウンド能力を使う。
// カードを排除した人は影響力+1。6ラウンド後、影響力がいちばん多い人の勝ち(同点なら列に残っているカードが多い人)。
// ルールは公式ルールブック(英語版)に合わせている。はっきりしない点の扱い:
//  - 「待ち伏せ」が発動するのは排除されたとき(勅令で動かされたとき・密偵では発動しない)
//  - 「勅令」で動かすのは山のいちばん上のカードだけ(下に重なったカードはその場に残る)

const ROUNDS = 6, HAND = 7, START_INF = 1;
// カード名と能力の説明(このサイト独自の日本語訳)
const CARDS = {
  archer: { name: "弓兵", char: true, text: "列の先頭か最後尾のカード1枚を排除する。" },
  soldier: { name: "兵士", char: true, text: "となりのカード1枚を排除する。" },
  spy: { name: "密偵", char: true, text: "となりのカードの持ち主から影響力を1奪う。" },
  heir: { name: "後継者", char: true, text: "列にほかに同じ名前の表向きのカードがなければ、影響力+2。" },
  assassination: { name: "暗殺", char: false, text: "列のカード1枚を排除する。その後、このカードを捨てる。" },
  decree: { name: "勅令", char: false, text: "列のカード1枚を好きな位置へ動かす。その後、このカードを捨てる。" },
  lord: { name: "領主", char: true, text: "影響力+1。さらに、となりにある自分のカード1枚につき+1。" },
  shapeshifter: { name: "変身者", char: true, text: "となりの表向きの人物カード1枚の能力をまねる。" },
  ambush: { name: "待ち伏せ", char: false, text: "相手のカードに排除されたら、影響力+4、排除したカードも捨てる。自分で公開したときは影響力+1。どちらでも、このカードは上の影響力ごと捨てる(上の影響力はもらえない)。" },
  conspiracy: { name: "陰謀", char: false, text: "公開したとき、このカードの上の影響力を2倍にして受け取る。その後、このカードを捨てる。" },
};
const KINDS = Object.keys(CARDS);
// 変身者がまねられるのは人物カード(変身者どうしはまねても何も起きないので除く)
const COPYABLE = ["archer", "soldier", "spy", "heir", "lord"];
const TARGETED = ["archer", "soldier", "spy", "assassination", "decree", "shapeshifter"];

const DEFAULTS = { placeSecs: 60, actSecs: 45, dir: "L" };
function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, out = { ...DEFAULTS };
  if ([30, 60, 90, 0].includes(r.placeSecs)) out.placeSecs = r.placeSecs;
  if ([30, 45, 90, 0].includes(r.actSecs)) out.actSecs = r.actSecs;
  if (["L", "R", "random"].includes(r.dir)) out.dir = r.dir;
  return out;
}
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const nm = (c, id) => c.nameOf(id);
const cn = (k) => CARDS[k].name;
function log(g, t) { g.log.push(t); if (g.log.length > 60) g.log.splice(0, g.log.length - 60); }

function start(c, settings, rnd = Math.random) {
  const cfg = normalize(settings);
  const order = [...c.members()];
  // 解決の向き(左から/右から)はゲームの最初に決めて、最後まで変えない
  const dir = cfg.dir === "random" ? (rnd() < 0.5 ? "L" : "R") : cfg.dir;
  const g = c.g = { cfg, dir, order, first: 0, round: 0, step: "place", toPlace: [], queue: [], P: {}, res: null, pending: null, log: [], last: null, nid: 1, rnd, armKey: null };
  for (const id of order) {
    const deck = shuffle([...KINDS], rnd).slice(0, HAND); // 10枚から3枚をランダムに除く(何を除いたかはだれも知らない)
    g.P[id] = { hand: deck.map((k) => ({ id: g.nid++, k })), inf: START_INF, discard: [] };
  }
  g.first = Math.floor(rnd() * order.length);
  beginRound(c);
}

// ---- 列(左から右へ並ぶ「山」の並び。山の上のカードだけが有効) ----
const top = (s) => s.cards[s.cards.length - 1];
const idxOf = (g, sid) => g.queue.findIndex((s) => s.id === sid);
const stackOf = (g, sid) => g.queue.find((s) => s.id === sid) || null;
const neighbors = (g, sid) => { const i = idxOf(g, sid); return [g.queue[i - 1], g.queue[i + 1]].filter(Boolean); };
const ownerOf = (s) => top(s).owner;

function beginRound(c) {
  const g = c.g;
  if (g.round >= ROUNDS || g.order.length < 2) return end(c);
  g.round++;
  g.step = "place"; g.pending = null; g.res = null;
  const n = g.order.length;
  g.toPlace = Array.from({ length: n }, (_, i) => g.order[(g.first + i) % n]).filter((id) => g.P[id].hand.length);
  log(g, `ラウンド${g.round}: ${nm(c, g.order[g.first])} から順にカードを1枚ずつ置く`);
  if (!g.toPlace.length) return beginResolve(c);
  arm(c);
}

// 配置: where = "L"(左端) / "R"(右端) / 山の番号(自分のカードの上に重ねる)
function place(c, id, m) {
  const g = c.g, p = g.P[id];
  if (g.toPlace[0] !== id) return "あなたが置く番ではありません";
  const hi = p.hand.findIndex((x) => x.id === m.card);
  if (hi < 0) return "手札のカードを選んでください";
  let target = null;
  if (m.where !== "L" && m.where !== "R") {
    target = stackOf(g, m.where);
    if (!target || ownerOf(target) !== id) return "左端・右端、または自分のカードの上を選んでください";
  }
  const [card] = p.hand.splice(hi, 1);
  const cd = { id: card.id, k: card.k, owner: id, up: false, inf: 0 };
  if (target) target.cards.push(cd);
  else { const s = { id: g.nid++, cards: [cd] }; if (m.where === "L") g.queue.unshift(s); else g.queue.push(s); }
  g.last = { type: "place", by: id, where: target ? "on" : m.where, sid: target ? target.id : g.queue[m.where === "L" ? 0 : g.queue.length - 1].id };
  log(g, `${nm(c, id)} が${target ? "自分のカードの上" : m.where === "L" ? "左端" : "右端"}にカードを置いた`);
  g.toPlace.shift();
  if (!g.toPlace.length) return beginResolve(c);
  arm(c);
}

// ---- 解決 ----
function beginResolve(c) {
  const g = c.g;
  g.step = "resolve";
  g.res = { done: [], cur: null };
  log(g, `ラウンド${g.round}: 列の${g.dir === "L" ? "左" : "右"}から順に解決`);
  advance(c);
}
// 解決の向きに並べた列
const inDir = (g) => g.dir === "R" ? [...g.queue].reverse() : g.queue;
// 次に解決する山: 解決の向きに見て、まだ解決していない最初の山
// (解決した山より手前にあるものは「解決済み」扱い。勅令で解決済みの位置へ動いた山は、そのラウンドは解決しない)
function advance(c) {
  const g = c.g;
  g.pending = null;
  if (g.step === "end") return;
  const next = inDir(g).find((s) => !g.res.done.includes(s.id));
  if (!next) return endRound(c);
  g.res.cur = next.id; g.res.done.push(next.id);
  const t = top(next);
  if (t.up) return useAbility(c, next.id, false);
  g.pending = { type: "reveal", by: t.owner, sid: next.id };
  arm(c);
}
function decide(c, id, m) {
  const g = c.g, pd = g.pending;
  if (!pd || pd.type !== "reveal" || pd.by !== id) return "あなたが決める番ではありません";
  const s = stackOf(g, pd.sid), t = top(s);
  if (!m.reveal) {
    t.inf += 1;
    g.last = { type: "hide", by: id, sid: s.id };
    log(g, `${nm(c, id)} は伏せたまま(影響力1を上に置いた)`);
    return advance(c);
  }
  t.up = true;
  // 陰謀は上の影響力の2倍。待ち伏せは上の影響力をもらえない(捨てる)
  const gain = t.k === "conspiracy" ? t.inf * 2 : t.k === "ambush" ? 0 : t.inf;
  g.P[id].inf += gain; t.inf = 0;
  g.last = { type: "reveal", by: id, sid: s.id, k: t.k, gain };
  log(g, `${nm(c, id)} が「${cn(t.k)}」を公開` + (gain ? `(上の影響力${t.k === "conspiracy" ? "×2" : ""} +${gain})` : ""));
  useAbility(c, s.id, true);
}

// 能力の対象になれる山(as: 実際に使う能力。変身者がまねたときは、まねた能力)
function optionsFor(g, sid, as) {
  const s = stackOf(g, sid); if (!s) return [];
  const me = top(s).owner;
  const others = g.queue.filter((x) => x.id !== sid);
  switch (as) {
    case "archer": { const ends = [g.queue[0], g.queue[g.queue.length - 1]].filter((x) => x && x.id !== sid); return [...new Set(ends.map((x) => x.id))]; }
    case "soldier": return neighbors(g, sid).map((x) => x.id);
    // 密偵: となりのカードの持ち主(自分のこともある。そのときは増えも減りもしない)
    case "spy": return neighbors(g, sid).map((x) => x.id);
    case "assassination": case "decree": return others.map((x) => x.id);
    case "shapeshifter": return neighbors(g, sid).filter((x) => top(x).up && COPYABLE.includes(top(x).k)).map((x) => x.id);
    default: return [];
  }
}
function useAbility(c, sid, justRevealed) {
  const g = c.g, s = stackOf(g, sid), t = top(s), me = t.owner;
  switch (t.k) {
    case "heir": return heir(c, sid, t.id) || finishCard(c, t.id);
    case "lord": { const n = neighbors(g, sid).filter((x) => ownerOf(x) === me).length; g.P[me].inf += 1 + n; log(g, `「領主」: ${nm(c, me)} が影響力+${1 + n}`); return finishCard(c, t.id); }
    case "ambush": if (justRevealed) { g.P[me].inf += 1; log(g, `「待ち伏せ」: ${nm(c, me)} が影響力+1`); } return finishCard(c, t.id);
    case "conspiracy": return finishCard(c, t.id);
    default: return askTarget(c, sid, t.k, t.id);
  }
}
// 後継者: 列にほかに同じ名前の表向き(重なっていない)カードがなければ+2。
// 変身者がまねたときは、名前は「変身者」のまま → ほかに表向きの変身者がいなければ+2
function heir(c, sid, cardId, copied) {
  const g = c.g, t = top(stackOf(g, sid)), me = t.owner, name = copied ? "shapeshifter" : "heir";
  const ups = g.queue.filter((x) => x.id !== sid && top(x).up && top(x).k === name).length;
  if (!ups) { g.P[me].inf += 2; log(g, `「後継者」: ${nm(c, me)} が影響力+2`); }
  else log(g, `「後継者」: ほかに表向きの「${cn(name)}」があるので何も起きない`);
}
function askTarget(c, sid, as, cardId) {
  const g = c.g, opts = optionsFor(g, sid, as), me = top(stackOf(g, sid)).owner;
  if (!opts.length) {
    log(g, `「${cn(as)}」: 対象がないので何も起きない`);
    return finishCard(c, cardId);
  }
  // 能力は使えるなら必ず使う(自分のカードしかなければ自分のカード)。対象が1つだけなら自動で(変身者と勅令は選ぶ)
  if (opts.length === 1 && !["decree", "shapeshifter"].includes(as)) return applyTarget(c, sid, as, cardId, opts[0]);
  g.pending = { type: "target", by: me, sid, as, cardId, options: opts };
  arm(c);
}
function target(c, id, m) {
  const g = c.g, pd = g.pending;
  if (!pd || pd.by !== id || (pd.type !== "target" && pd.type !== "move")) return "あなたが選ぶ番ではありません";
  if (pd.type === "move") {
    if (!pd.positions.includes(m.pos)) return "動かす先を選んでください";
    return moveTo(c, pd, m.pos);
  }
  if (!pd.options.includes(m.sid)) return "光っているカードから選んでください";
  applyTarget(c, pd.sid, pd.as, pd.cardId, m.sid);
}
function applyTarget(c, sid, as, cardId, tid) {
  const g = c.g, actor = stackOf(g, sid), me = top(actor).owner, t = stackOf(g, tid);
  g.pending = null;
  switch (as) {
    case "archer": case "soldier": case "assassination":
      g.last = { type: "elim", by: me, sid, tid, as };
      eliminate(c, me, cardId, t, as);
      return finishCard(c, cardId);
    case "spy": {
      const victim = ownerOf(t), n = victim === me ? 0 : Math.min(1, g.P[victim].inf);
      g.P[victim].inf -= n; g.P[me].inf += n;
      g.last = { type: "spy", by: me, sid, tid };
      log(g, victim === me ? `「密偵」: となりが自分のカードなので、自分から奪う(変わらない)` : `「密偵」: ${nm(c, me)} が ${nm(c, victim)} から影響力を${n}奪った`);
      return finishCard(c, cardId);
    }
    case "shapeshifter": {
      const k = top(t).k;
      log(g, `「変身者」: となりの「${cn(k)}」をまねる`);
      if (k === "heir") { heir(c, sid, cardId, true); return finishCard(c, cardId); }
      if (k === "lord") { const n = neighbors(g, sid).filter((x) => ownerOf(x) === me).length; g.P[me].inf += 1 + n; log(g, `${nm(c, me)} が影響力+${1 + n}`); return finishCard(c, cardId); }
      return askTarget(c, sid, k, cardId);
    }
    case "decree": {
      // 動かすカードを決めたら、次は置き場所
      g.pending = { type: "move", by: me, sid, as, cardId, tid, ...movePlaces(g, tid) };
      return arm(c);
    }
  }
}
// 勅令の置き場所: 動かすカード(山のいちばん上)を抜いたあとの列 rest で、何番目に入れるか(ほかのカードの上には置けない)
// 1枚だけの山なら元の位置は除く。下にカードが残る山なら、どこでもよい(その山のとなりも「動いた」ことになる)
function movePlaces(g, tid) {
  const s = stackOf(g, tid), alone = s.cards.length === 1;
  const rest = g.queue.filter((x) => !(alone && x.id === tid)).map((x) => x.id);
  const from = idxOf(g, tid);
  const positions = Array.from({ length: rest.length + 1 }, (_, i) => i).filter((i) => !(alone && i === from));
  return { rest, positions };
}
function moveTo(c, pd, pos) {
  const g = c.g, src = stackOf(g, pd.tid);
  let s;
  if (src.cards.length === 1) { s = src; g.queue.splice(idxOf(g, src.id), 1); }
  else s = { id: g.nid++, cards: [src.cards.pop()] }; // 上の1枚だけ動かす(下のカードはその場に残り、また有効になる)
  const before = pd.rest[pos];
  g.queue.splice(before == null ? g.queue.length : idxOf(g, before), 0, s);
  g.last = { type: "move", by: pd.by, sid: pd.sid, tid: pd.tid, pos };
  log(g, `「勅令」: ${nm(c, pd.by)} がカードを左から${idxOf(g, s.id) + 1}番目へ動かした`);
  finishCard(c, pd.cardId);
}
// 排除: 山の上のカードを捨て札へ。排除した人は影響力+1(自分のカードでも)。カードの上の影響力はなくなる
function eliminate(c, by, attackerId, s, as) {
  const g = c.g, t = s.cards.pop();
  if (!s.cards.length) g.queue.splice(idxOf(g, s.id), 1);
  g.P[t.owner].discard.push(t.k);
  g.P[by].inf += 1;
  if (!t.up && t.k === "ambush") {
    // 待ち伏せ: 相手のカードに排除されたら持ち主+4。自分のカードで排除したら「自分で公開した」ことになり+1。
    // どちらでも、排除したカードも捨てる(排除した人の+1はそのまま)
    const own = t.owner === by;
    g.P[t.owner].inf += own ? 1 : 4;
    log(g, `「${cn(as)}」が伏せたカードを排除(${nm(c, by)} +1) → それは「待ち伏せ」！ ${nm(c, t.owner)} が影響力+${own ? 1 : 4}、${cn(as)}も捨てる`);
    markBehind(g); // 排除したカードの山が消えても、解決の位置がずれないように先に印をつける
    removeCard(c, attackerId);
    return;
  }
  log(g, `「${cn(as)}」: ${nm(c, t.owner)} の${t.up ? "「" + cn(t.k) + "」" : "伏せたカード(" + cn(t.k) + ")"}を排除(${nm(c, by)} 影響力+1)`);
}
// カードを列から取り除く(捨てる。だれの得点にもならない)
function removeCard(c, cardId) {
  const g = c.g;
  for (const s of g.queue) {
    const i = s.cards.findIndex((x) => x.id === cardId);
    if (i < 0) continue;
    const [t] = s.cards.splice(i, 1);
    g.P[t.owner].discard.push(t.k);
    if (!s.cards.length) g.queue.splice(idxOf(g, s.id), 1);
    return t;
  }
  return null;
}
// いま解決している山と、それより手前(解決の向きで)の山を「解決済み」にする(勅令で動いた山・排除で詰まった列でも順番がずれないように)
function markBehind(g) {
  if (!g.res) return;
  const q = inDir(g), i = q.findIndex((s) => s.id === g.res.cur);
  for (let j = 0; j <= i; j++) if (!g.res.done.includes(q[j].id)) g.res.done.push(q[j].id);
}
// 1枚の解決の終わり: 使ったら捨てるカード(暗殺・勅令・待ち伏せ・陰謀)を捨てて次へ
function finishCard(c, cardId) {
  const g = c.g;
  markBehind(g);
  for (const s of g.queue) { const t = s.cards.find((x) => x.id === cardId); if (t && ["assassination", "decree", "ambush", "conspiracy"].includes(t.k) && t.up) { removeCard(c, cardId); break; } }
  advance(c);
}
function endRound(c) {
  const g = c.g;
  g.first = (g.first + 1) % g.order.length;
  beginRound(c);
}
function end(c) {
  const g = c.g;
  g.step = "end"; g.pending = null; c.clearTimer();
  // 同点なら、列に残っているカード(重なったカードも数える)が多い人が上
  const raw = {}, tie = {};
  for (const id of g.order) { raw[id] = g.P[id].inf; tie[id] = g.queue.reduce((a, s) => a + s.cards.filter((x) => x.owner === id).length, 0); }
  const best = Math.max(...Object.values(raw)), top1 = g.order.filter((id) => raw[id] === best);
  const bestTie = Math.max(...top1.map((id) => tie[id])), win = top1.filter((id) => tie[id] === bestTie);
  log(g, `🏆 ${win.map((id) => nm(c, id)).join("・")} の勝ち！(影響力${best}${top1.length > 1 ? `・同点のため列のカード${bestTie}枚で比べた` : ""})`);
  g.tie = tie;
  c.finish(raw, tie);
}

// ---- 持ち時間: 配置は右端に手札の1枚目 / 公開の判断は伏せたまま / 対象は無作為 ----
function arm(c) {
  const g = c.g;
  if (g.step === "end") return c.clearTimer();
  const who = g.step === "place" ? g.toPlace[0] : g.pending && g.pending.by;
  if (!who) return c.clearTimer();
  const away = !c.live().includes(who);
  const key = [g.round, g.step, who, g.pending ? g.pending.type + g.pending.sid : g.toPlace.length, away].join("|");
  if (g.armKey === key) return;
  g.armKey = key;
  const secs = g.step === "place" ? g.cfg.placeSecs : g.cfg.actSecs;
  const ms = away ? 15000 : secs * 1000;
  if (!ms) return c.clearTimer();
  c.setTimer(ms, () => { g.armKey = null; timeout(c); });
}
function timeout(c) {
  const g = c.g;
  if (g.step === "place") { const id = g.toPlace[0], p = g.P[id]; log(g, `${nm(c, id)} は時間切れ(手札から自動で右端へ)`); return place(c, id, { card: p.hand[Math.floor(g.rnd() * p.hand.length)].id, where: "R" }); }
  const pd = g.pending; if (!pd) return;
  log(g, `${nm(c, pd.by)} は時間切れ`);
  if (pd.type === "reveal") return decide(c, pd.by, { reveal: false });
  if (pd.type === "target") return target(c, pd.by, { sid: pd.options[Math.floor(g.rnd() * pd.options.length)] });
  if (pd.type === "move") return target(c, pd.by, { pos: pd.positions[Math.floor(g.rnd() * pd.positions.length)] });
}
function onPresence(c) { const g = c.g; if (g && g.step !== "end") arm(c); }

function handle(c, pid, m) {
  const g = c.g;
  if (!g || g.step === "end" || !g.P[pid]) return;
  let r;
  if (m.a === "place" && g.step === "place") r = place(c, pid, m);
  else if (m.a === "decide" && g.step === "resolve") r = decide(c, pid, { reveal: !!m.reveal });
  else if (m.a === "target" && g.step === "resolve") r = target(c, pid, m);
  else return;
  if (typeof r === "string") return r;
}
// 抜けた人: 手札と列のカードを取り除き、その人の番なら先へ進める
function onLeave(c, pid) {
  const g = c.g;
  if (!g || g.step === "end" || !g.P[pid]) return;
  log(g, `${nm(c, pid)} が抜けた(列のカードも取り除く)`);
  const wasCur = g.res && g.res.cur != null && (stackOf(g, g.res.cur) ? ownerOf(stackOf(g, g.res.cur)) === pid : false);
  const pd = g.pending;
  g.queue = g.queue.filter((s) => ownerOf(s) !== pid);
  const fi = g.order.indexOf(pid);
  g.order = g.order.filter((x) => x !== pid);
  if (fi >= 0 && fi < g.first) g.first--;
  if (g.first >= g.order.length) g.first = 0;
  delete g.P[pid];
  g.armKey = null;
  if (g.order.length < 2) return end(c);
  if (g.step === "place") {
    g.toPlace = g.toPlace.filter((x) => x !== pid);
    if (!g.toPlace.length) return beginResolve(c);
    return arm(c);
  }
  if (g.step === "resolve") {
    if (wasCur || (pd && pd.by === pid)) return advance(c);
    if (pd && pd.type === "target") { pd.options = optionsFor(g, pd.sid, pd.as); if (!pd.options.length) return finishCard(c, pd.cardId); }
    if (pd && pd.type === "move" && !stackOf(g, pd.tid)) return finishCard(c, pd.cardId);
    if (pd && pd.type === "move") Object.assign(pd, movePlaces(g, pd.tid));
    arm(c);
  }
}

function view(c, me) {
  const g = c.g, done = g.step === "end";
  const cardView = (t) => ({ id: t.id, owner: t.owner, up: t.up, inf: t.inf, k: t.up || t.owner === me || done ? t.k : null });
  return {
    step: g.step, round: g.round, rounds: ROUNDS, order: g.order, first: g.first, dir: g.dir, tie: done ? g.tie || null : null,
    placer: g.step === "place" ? g.toPlace[0] || null : null,
    queue: g.queue.map((s) => ({ id: s.id, top: cardView(top(s)), under: s.cards.slice(0, -1).map((t) => (t.owner === me || done ? { k: t.k, up: t.up, inf: t.inf } : { k: t.up ? t.k : null, up: t.up, inf: t.inf })) })),
    cur: g.step === "resolve" && g.res ? g.res.cur : null,
    done: g.step === "resolve" && g.res ? g.res.done : [],
    players: Object.fromEntries(g.order.map((id) => [id, { inf: g.P[id].inf, hand: g.P[id].hand.length, discard: g.P[id].discard }])),
    hand: g.P[me] ? g.P[me].hand : null,
    pending: g.pending ? { type: g.pending.type, by: g.pending.by, sid: g.pending.sid, as: g.pending.as || null, options: g.pending.options || null, tid: g.pending.tid || null, positions: g.pending.positions || null, rest: g.pending.rest || null } : null,
    last: g.last, log: g.log.slice(-30),
  };
}

module.exports = { start, handle, view, onLeave, onPresence, normalize, DEFAULTS, CARDS, KINDS, ROUNDS, HAND, _t: { optionsFor, eliminate, advance } };
