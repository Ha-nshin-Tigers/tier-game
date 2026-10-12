"use strict";
// 散弾ルーレット — ルール本体(単独ゲーム /shotgun と、ドタバタ大会の両方で使う)
// ショットガンに実弾と空砲を混ぜて込める。発数は公開、順番は秘密。
// 自分の番に「自分を撃つ」か「ほかの人を撃つ」。自分を撃って空砲ならもう一度自分の番。
// 実弾でライフが減り、0で脱落。弾がなくなったら込め直してアイテムを配る。最後の1人が勝ち。
// 弾の並びはサーバだけが持つ。虫メガネ・使い捨て携帯で分かったことは使った本人にだけ送る。

const ITEMS = {
  glass:    { name: "虫メガネ", icon: "🔍", desc: "今込められている弾が実弾か空砲か分かる(自分だけ)" },
  cig:      { name: "タバコ", icon: "🚬", desc: "ライフを1回復(最大まで)" },
  beer:     { name: "ビール", icon: "🍺", desc: "今の弾を1発抜いて捨てる(全員に見える)" },
  cuffs:    { name: "手錠", icon: "⛓️", desc: "番の順で次の人を1回休みにする" },
  saw:      { name: "ノコギリ", icon: "🪚", desc: "この番の次の1発のダメージが2になる" },
  medicine: { name: "期限切れ薬", icon: "💊", desc: "50%でライフ+2、50%でライフ−1" },
  phone:    { name: "使い捨て携帯", icon: "📱", desc: "このあと何発目かの弾の種類が分かる(自分だけ)" },
  inverter: { name: "インバータ", icon: "🔄", desc: "今の弾の実弾と空砲を入れ替える" },
  adrenaline: { name: "アドレナリン", icon: "💉", desc: "ほかの人のアイテムを1つ奪ってすぐ使う" },
  jammer:   { name: "ジャマー", icon: "📡", desc: "選んだ相手を1回休みにする" },
  remote:   { name: "リモコン", icon: "🎛️", desc: "番の回る向きを逆にする" },
};
const ITEM_KEYS = Object.keys(ITEMS);
// 相手を選ぶアイテム
const NEEDS_TARGET = new Set(["jammer", "adrenaline"]);
// 細かいルール(ホストが変えられる)。weights はアイテムごとの出やすさ 0=出ない 1=少ない 2=ふつう 3=多い
const DEFAULTS = {
  lives: 4, turnSecs: 40,
  perLoad: 2,          // 1回の装填で配るアイテムの数(0〜4。"r" は1〜4のランダム)
  maxItems: 8,         // 持てる上限
  shells: "normal",    // 込める弾の数: few=2〜4 / normal=2〜8 / many=5〜8
  liveRatio: "normal", // 実弾の割合: low / normal / high
  noDup: false,        // 1回の配布で同じアイテムが重ならないようにする
  selfAgain: true,     // 自分を撃って空砲ならもう一度自分の番
  weights: Object.fromEntries(ITEM_KEYS.map((k) => [k, 2])),
};
const SHELL_RANGE = { few: [2, 4], normal: [2, 8], many: [5, 8] };
const LIVE_RATIO = { low: [0.2, 0.4], normal: [0.35, 0.65], high: [0.6, 0.8] };
const WEIGHT = [0, 1, 3, 6]; // 出やすさの段階 → 抽選の重み
const SHOT_SHOW_MS = 2200, LOAD_SHOW_MS = 3500;

const rand = (n) => Math.floor(Math.random() * n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// settings: { lives, items: {key: bool}, turnSecs(0=なし) }
// 設定を検証して、使える値だけにそろえる(単独ゲームのサーバからも使う)
function normalize(raw) {
  const r = raw || {}, d = DEFAULTS, out = { ...d, weights: { ...d.weights } };
  if ([2, 3, 4, 5, 6].includes(r.lives)) out.lives = r.lives;
  if ([0, 30, 40, 60].includes(r.turnSecs)) out.turnSecs = r.turnSecs;
  if ([0, 1, 2, 3, 4, "r"].includes(r.perLoad)) out.perLoad = r.perLoad;
  if ([4, 6, 8].includes(r.maxItems)) out.maxItems = r.maxItems;
  if (r.shells in SHELL_RANGE) out.shells = r.shells;
  if (r.liveRatio in LIVE_RATIO) out.liveRatio = r.liveRatio;
  if (typeof r.noDup === "boolean") out.noDup = r.noDup;
  if (typeof r.selfAgain === "boolean") out.selfAgain = r.selfAgain;
  if (r.weights && typeof r.weights === "object") for (const k of ITEM_KEYS) if ([0, 1, 2, 3].includes(r.weights[k])) out.weights[k] = r.weights[k];
  // 古い形式(使う/使わない)にも対応
  if (r.items && typeof r.items === "object") for (const k of ITEM_KEYS) if (r.items[k] === false) out.weights[k] = 0;
  return out;
}

function start(c, settings) {
  const s = normalize(settings);
  const seats = shuffle(c.members());
  const st = {};
  for (const id of seats) st[id] = { hp: s.lives, items: [], alive: true, cuffed: false, know: {} };
  c.g = {
    key: "shotgun", seats, st, maxHp: s.lives, cfg: s, turnMs: (s.turnSecs || 0) * 1000,
    shells: [], pos: 0, load: 0, counts: null, spent: [], dir: 1, turnId: seats[rand(seats.length)], saw: false,
    step: "load", out: [], seq: 0, event: null, log: [],
  };
  reload(c);
}
const alive = (c) => c.g.seats.filter((id) => c.g.st[id].alive && c.has(id));
function log(c, t) { c.g.log.push(t); if (c.g.log.length > 10) c.g.log.shift(); }
function emit(c, ev) { c.g.seq += 1; c.g.event = { ...ev, seq: c.g.seq }; }
const nm = (c, id) => c.nameOf(id);

// アイテムを1つ抽選(出やすさの重み付き)。exclude に入っている種類は除く。出せる種類がなければ null
function drawItem(cfg, exclude) {
  const cand = ITEM_KEYS.filter((k) => cfg.weights[k] > 0 && !exclude.includes(k));
  const total = cand.reduce((n, k) => n + WEIGHT[cfg.weights[k]], 0);
  if (!total) return null;
  let x = Math.random() * total;
  for (const k of cand) { x -= WEIGHT[cfg.weights[k]]; if (x < 0) return k; }
  return cand[cand.length - 1];
}
// 込め直し: 設定の範囲の発数(実弾・空砲を最低1発ずつ)。アイテムを配る
function reload(c) {
  const g = c.g, cfg = g.cfg;
  if (alive(c).length < 2) return finish(c);
  const [lo, hi] = SHELL_RANGE[cfg.shells], [r0, r1] = LIVE_RATIO[cfg.liveRatio];
  const n = lo + rand(hi - lo + 1);
  const live = Math.max(1, Math.min(n - 1, Math.round(n * (r0 + Math.random() * (r1 - r0)))));
  g.shells = shuffle([...Array(live).fill("live"), ...Array(n - live).fill("blank")]);
  g.pos = 0; g.load += 1; g.spent = []; g.saw = false;
  g.counts = { live, blank: n - live };
  for (const id of g.seats) g.st[id].know = {};
  const dealt = {};
  for (const id of alive(c)) {
    const s = g.st[id], got = [];
    const count = cfg.perLoad === "r" ? 1 + rand(4) : cfg.perLoad;
    for (let i = 0; i < count && s.items.length < cfg.maxItems; i++) {
      const k = drawItem(cfg, cfg.noDup ? got : []);
      if (!k) break;
      s.items.push(k); got.push(k);
    }
    dealt[id] = got;
  }
  log(c, `装填${g.load}: 実弾${live}発・空砲${n - live}発`);
  emit(c, { type: "load", live, blank: n - live, dealt });
  g.step = "load";
  c.setTimer(LOAD_SHOW_MS, () => { g.step = "turn"; beginTurn(c); });
}
const remaining = (g) => g.shells.length - g.pos;
// 手番を始める。休み(手錠・ジャマー)の人は飛ばす
function beginTurn(c) {
  const g = c.g;
  if (alive(c).length < 2) return finish(c);
  let guard = 0;
  while (guard++ < 20) {
    const s = g.st[g.turnId];
    if (!s || !s.alive || !c.has(g.turnId)) { g.turnId = nextOf(c, g.turnId); continue; }
    if (s.cuffed) { s.cuffed = false; log(c, `${nm(c, g.turnId)} は1回休み`); emit(c, { type: "skip", who: g.turnId }); g.turnId = nextOf(c, g.turnId); continue; }
    break;
  }
  g.saw = false; g.step = "turn";
  if (g.turnMs) c.setTimer(g.turnMs, () => autoShoot(c)); else c.clearTimer();
}
// 番の向き(リモコンで逆になる)で次の生きている人
function nextOf(c, id) {
  const g = c.g, s = g.seats, i = s.indexOf(id);
  for (let k = 1; k <= s.length; k++) {
    const q = s[(((i + g.dir * k) % s.length) + s.length) % s.length];
    if (g.st[q].alive && c.has(q)) return q;
  }
  return id;
}
// 時間切れ: ほかの生きている人をランダムに撃つ
function autoShoot(c) {
  const g = c.g;
  if (g.step !== "turn") return;
  const others = alive(c).filter((id) => id !== g.turnId);
  if (others.length) shoot(c, g.turnId, others[rand(others.length)], true);
}
function damage(c, id, n, why) {
  const s = c.g.st[id];
  s.hp = Math.max(0, s.hp - n);
  if (s.hp === 0 && s.alive) {
    s.alive = false; s.items = []; s.cuffed = false; c.g.out.push(id);
    log(c, `${nm(c, id)} 脱落${why ? "(" + why + ")" : ""}`);
    return true;
  }
  return false;
}
function shoot(c, pid, target, auto) {
  const g = c.g;
  if (g.step !== "turn" || g.turnId !== pid) return;
  if (!g.st[target] || !g.st[target].alive) return "その人は撃てません";
  c.clearTimer();
  const shell = g.shells[g.pos];
  g.pos += 1; g.spent.push(shell);
  const dmg = shell === "live" ? (g.saw ? 2 : 1) : 0;
  let died = false;
  if (dmg) died = damage(c, target, dmg);
  const self = target === pid;
  log(c, `${nm(c, pid)} → ${self ? "自分" : nm(c, target)}: ${shell === "live" ? `実弾！ −${dmg}` : "空砲"}${auto ? "(時間切れ)" : ""}`);
  emit(c, { type: "shot", by: pid, target, shell, dmg, died, auto: !!auto });
  g.saw = false;
  g.step = "shot";
  // 自分を撃って空砲なら続けて自分の番。それ以外は次の人へ
  const again = self && shell === "blank" && g.cfg.selfAgain;
  c.setTimer(SHOT_SHOW_MS, () => {
    if (alive(c).length < 2) return finish(c);
    if (!again || !g.st[pid].alive) g.turnId = nextOf(c, pid);
    if (remaining(g) <= 0) return reload(c);
    beginTurn(c);
  });
}

// アイテムを使う。adrenalineFrom: アドレナリンで奪ったときの持ち主
function useItem(c, pid, idx, target, pick, adrenalineFrom) {
  const g = c.g, owner = adrenalineFrom || pid, s = g.st[owner], me = g.st[pid];
  if (g.step !== "turn" || g.turnId !== pid) return;
  if (!Number.isInteger(idx) || idx < 0 || idx >= s.items.length) return;
  const key = s.items[idx];
  if (adrenalineFrom && key === "adrenaline") return "アドレナリンでアドレナリンは奪えません";
  const e = cannotUse(c, pid, key, target);
  if (e) return e;
  if (key === "adrenaline") {
    // 奪うアイテムが今使えるかを先に確かめる(使えないのにアドレナリンだけ消えないように)
    const ts = g.st[target];
    if (!Number.isInteger(pick) || pick < 0 || pick >= ts.items.length) return "奪うアイテムを選んでください";
    const stolen = ts.items[pick];
    if (stolen === "adrenaline") return "アドレナリンでアドレナリンは奪えません";
    const e2 = cannotUse(c, pid, stolen, autoTarget(c, pid, stolen));
    if (e2) return e2;
  }
  s.items.splice(idx, 1);
  const by = adrenalineFrom ? `${nm(c, pid)}(${nm(c, adrenalineFrom)} から奪って)` : nm(c, pid);
  const ev = { type: "item", by: pid, item: key, from: adrenalineFrom || null };
  switch (key) {
    case "glass": {
      me.know[g.pos] = g.shells[g.pos];
      log(c, `${by}: 虫メガネで今の弾を見た`);
      break;
    }
    case "cig":
      me.hp = Math.min(g.maxHp, me.hp + 1);
      log(c, `${by}: タバコでライフ+1`);
      break;
    case "beer": {
      const shell = g.shells[g.pos];
      g.pos += 1; g.spent.push(shell);
      ev.shell = shell;
      log(c, `${by}: ビールで弾を抜いた → ${shell === "live" ? "実弾" : "空砲"}`);
      break;
    }
    case "cuffs": {
      const t = nextOf(c, pid);
      g.st[t].cuffed = true; ev.target = t;
      log(c, `${by}: 手錠 → ${nm(c, t)} は次の番が休み`);
      break;
    }
    case "jammer":
      g.st[target].cuffed = true; ev.target = target;
      log(c, `${by}: ジャマー → ${nm(c, target)} は次の番が休み`);
      break;
    case "saw":
      g.saw = true;
      log(c, `${by}: ノコギリ(次の1発はダメージ2)`);
      break;
    case "medicine": {
      const ok = Math.random() < 0.5;
      ev.ok = ok;
      if (ok) { me.hp = Math.min(g.maxHp, me.hp + 2); log(c, `${by}: 期限切れ薬 → ライフ+2`); }
      else {
        log(c, `${by}: 期限切れ薬 → ライフ−1`);
        if (damage(c, pid, 1, "期限切れ薬")) {
          ev.died = true; emit(c, ev);
          // 自分の番に脱落したら次の人へ
          if (alive(c).length < 2) return finish(c);
          g.turnId = nextOf(c, pid);
          beginTurn(c);
          return;
        }
      }
      break;
    }
    case "phone": {
      const left = remaining(g);
      if (left <= 1) { log(c, `${by}: 使い捨て携帯 → 「どうしようもないね…」`); ev.none = true; break; }
      const k = 1 + rand(left - 1); // 今の弾を0として、このあとk発目
      me.know[g.pos + k] = g.shells[g.pos + k];
      log(c, `${by}: 使い捨て携帯で先の弾を聞いた`);
      break;
    }
    case "inverter":
      g.shells[g.pos] = g.shells[g.pos] === "live" ? "blank" : "live";
      // 今の弾を知っていた人の知識も入れ替える(使ったことは全員に見えるので推理できる)
      for (const id of g.seats) if (g.st[id].know[g.pos]) g.st[id].know[g.pos] = g.shells[g.pos];
      log(c, `${by}: インバータで今の弾を入れ替えた`);
      break;
    case "adrenaline": {
      // 相手のアイテムを奪ってすぐ使う(使えるかは上で確認済み)
      const ts = g.st[target];
      log(c, `${by}: アドレナリンで ${nm(c, target)} の ${ITEMS[ts.items[pick]].name} を奪う`);
      emit(c, ev);
      useItem(c, pid, pick, autoTarget(c, pid, ts.items[pick]), null, target);
      return;
    }
    case "remote":
      g.dir *= -1;
      log(c, `${by}: リモコンで番の向きが逆になった`);
      break;
  }
  emit(c, ev);
  // ビールで最後の弾を抜いたら込め直し(番はそのまま)
  if (remaining(g) <= 0) { c.clearTimer(); reload(c); }
}
// アドレナリンで奪ったアイテムが相手を選ぶ種類なら、番の順で次の人を相手にする
function autoTarget(c, pid, key) { return NEEDS_TARGET.has(key) ? nextOf(c, pid) : null; }
// そのアイテムを今使えないなら理由を返す
function cannotUse(c, pid, key, target) {
  const g = c.g, me = g.st[pid];
  const others = alive(c).filter((id) => id !== pid);
  if (NEEDS_TARGET.has(key) && !others.includes(target)) return "相手を選んでください";
  if (key === "cuffs" && g.seats.some((id) => g.st[id].cuffed)) return "まだ休み中の人がいるので手錠は使えません";
  if (key === "jammer" && g.st[target].cuffed) return "その人はもう休み中です";
  if (key === "saw" && g.saw) return "ノコギリはもう使っています";
  if (key === "cig" && me.hp >= g.maxHp) return "ライフは満タンです";
  if (key === "adrenaline" && !others.some((id) => g.st[id].items.some((k) => k !== "adrenaline"))) return "奪えるアイテムを持っている人がいません";
  return null;
}

function finish(c) {
  const g = c.g, raw = {};
  c.clearTimer();
  g.step = "end";
  g.out.forEach((id, i) => { raw[id] = i; });
  for (const id of alive(c)) raw[id] = g.out.length + 1;
  c.finish(raw);
}

function handle(c, pid, m) {
  const g = c.g;
  if (!g.st[pid] || !g.st[pid].alive) return;
  if (m.a === "shoot") return shoot(c, pid, m.target);
  if (m.a === "item") {
    const e = useItem(c, pid, m.idx, m.target, m.pick, null);
    return e;
  }
}
// 抜けた人は脱落扱い。手番の人なら次へ
function onLeave(c, pid) {
  const g = c.g, s = g.st[pid];
  if (!s || !s.alive) return;
  s.alive = false; s.items = []; g.out.push(pid);
  if (alive(c).length < 2) return finish(c);
  if (g.step === "turn" && g.turnId === pid) { g.turnId = nextOf(c, pid); beginTurn(c); }
}
function view(c, me) {
  const g = c.g, mine = g.st[me];
  // 自分が知っている弾(今より先のものだけ)。キーは「今の弾から何発目か」(0=今の弾)
  const know = {};
  if (mine) for (const [k, v] of Object.entries(mine.know)) if (+k >= g.pos) know[+k - g.pos] = v;
  return {
    step: g.step, load: g.load, turnId: g.turnId, dir: g.dir, saw: g.saw, maxHp: g.maxHp,
    counts: g.counts, remaining: remaining(g), spent: g.spent,
    seats: g.seats.map((id) => ({ id, hp: g.st[id].hp, alive: g.st[id].alive && c.has(id), items: g.st[id].items, cuffed: g.st[id].cuffed })),
    know, event: g.event, log: g.log, items: ITEMS, selfAgain: g.cfg.selfAgain, maxItems: g.cfg.maxItems,
  };
}

module.exports = { start, handle, view, onLeave, normalize, ITEMS, ITEM_KEYS, DEFAULTS };
