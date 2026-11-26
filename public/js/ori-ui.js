// オリフラムの「遊んでいる画面」(列・手札・公開や対象の操作)。単独のページ(/oriflamme)と大会(/party)で共通。
// 使う側は OriUI.render(main, g, env) を呼ぶ。env = { me, cards, nameOf, colorOf, act, remaining, rerender, afterHead }
//   g: ルール本体(games/mini/oriflamme.js)の view、cards: カード名と能力の説明、act(a, x): 操作をサーバへ送る
// 見た目は .ori の中だけに効く(大会の画面のほかの部品と名前がぶつからないように)
(function () {
  "use strict";
  const { h } = window.TG;
  const ICON = { archer: "🏹", soldier: "⚔️", spy: "🕵️", heir: "👑", assassination: "🗡️", decree: "📜", lord: "🏰", shapeshifter: "🎭", ambush: "🪤", conspiracy: "🕯️" };
  const ORDER = ["archer", "soldier", "spy", "heir", "assassination", "decree", "lord", "shapeshifter", "ambush", "conspiracy"];
  const state = { sel: null }; // 選んでいる手札
  const CSS = `
.ori { display: grid; gap: 10px; }
.ori .table { background: var(--felt, #2f3b2f); border-radius: 12px; padding: 12px 8px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.ori .row { display: flex; gap: 6px; align-items: stretch; width: max-content; min-width: 100%; justify-content: center; padding: 4px 2px; }
.ori .row .empty { color: #d9d3c4; font-size: 14px; padding: 40px 12px; }
.ori .slot { width: 34px; flex: none; border: 2px dashed #e2b545; border-radius: 8px; background: rgba(226,181,69,.15); color: #f6e7b5; font-size: 12px; font-weight: 700; padding: 0; writing-mode: vertical-rl; letter-spacing: .1em; cursor: pointer; animation: ori-pulse 1.2s ease-in-out infinite; }
.ori .stack { position: relative; flex: none; padding-bottom: 20px; }
.ori .card { position: relative; width: 104px; min-height: 148px; border-radius: 9px; border: 3px solid var(--fam); background: linear-gradient(180deg, #fffaf0 0%, #f1e6cc 100%); color: #1d1a18; padding: 6px 7px 8px; display: grid; grid-template-rows: auto auto auto 1fr; align-content: start; gap: 3px; text-align: left; font-family: var(--body); font-weight: 500; box-shadow: inset 0 0 0 2px rgba(120,90,40,.18), 0 2px 0 rgba(0,0,0,.35); cursor: default; }
.ori .card .fam { height: 6px; border-radius: 3px; background: var(--fam); }
.ori .card .kind { position: absolute; top: 11px; right: 7px; font-size: 9.5px; font-weight: 700; color: #7a6440; letter-spacing: .05em; }
.ori .card .ic { justify-self: center; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; font-size: 22px; line-height: 1; background: radial-gradient(circle at 35% 30%, #fff 0%, color-mix(in srgb, var(--fam) 30%, #fff) 70%); border: 2px solid var(--fam); box-shadow: 0 1px 0 rgba(0,0,0,.25); }
.ori .card .nm { font-family: var(--display); font-size: 15px; text-align: center; line-height: 1.2; }
.ori .card .tx { font-size: 10.5px; line-height: 1.35; color: #4b4540; }
.ori .card.back { background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--fam) 75%, #000) 0 8px, color-mix(in srgb, var(--fam) 55%, #000) 8px 16px); color: #fff; place-items: center; grid-template-rows: 1fr auto; }
.ori .card.back .q { font-family: var(--display); font-size: 30px; text-shadow: 0 2px 0 rgba(0,0,0,.4); display: grid; justify-items: center; line-height: 1.1; }
.ori .card.back .q small { font-family: var(--body); font-size: 22px; opacity: .55; }
.ori .card.back.mine { outline: 2px dashed #fff; outline-offset: -7px; }
.ori .card.back .peek { font-size: 11px; font-weight: 700; background: rgba(0,0,0,.55); border-radius: 4px; padding: 1px 6px; text-align: center; }
.ori .card .who { position: absolute; left: 0; right: 0; bottom: -20px; text-align: center; font-size: 11px; font-weight: 700; color: #f2ecdf; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ori .tok { position: absolute; top: -8px; right: -8px; min-width: 26px; height: 26px; border-radius: 13px; background: var(--gold, #e2b545); color: #1d1a18; font-weight: 700; font-size: 13px; display: grid; place-items: center; border: 2px solid #1d1a18; padding: 0 5px; z-index: 2; }
.ori .under { position: absolute; top: -8px; left: -6px; font-size: 10px; font-weight: 700; background: #1d1a18; color: #fff; border-radius: 4px; padding: 0 5px; z-index: 2; }
.ori .stack.cur .card { box-shadow: 0 0 0 4px #ffd36b, 0 0 18px #ffd36b; }
.ori .stack.done .card { filter: saturate(.75) brightness(.92); }
.ori .stack.can { cursor: pointer; } .ori .stack.can .card { cursor: pointer; box-shadow: 0 0 0 4px #ff7b6b; animation: ori-pulse 1.2s ease-in-out infinite; }
.ori .stack.hit .card { box-shadow: 0 0 0 4px #ff4d4d; }
@keyframes ori-pulse { 50% { opacity: .65; } }
.ori .hand { display: flex; gap: 6px; overflow-x: auto; padding: 4px 2px 8px; -webkit-overflow-scrolling: touch; }
.ori .hand .card { cursor: pointer; flex: none; align-content: start; } /* 縮めずに横スクロール(スマホで文字がつぶれないように) */
.ori .hand .card.sel { transform: translateY(-6px); box-shadow: 0 0 0 4px var(--accent), 0 6px 0 rgba(0,0,0,.3); }
.ori .hand button.card { padding: 6px 7px 8px; }
.ori .act { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ori .ref { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 6px; margin: 6px 0 0; padding: 0; list-style: none; }
.ori .ref li { font-size: 13px; padding: 6px 8px; border: 1.5px solid var(--line); border-radius: 8px; }
.ori .ref b { font-family: var(--display); font-weight: 400; }
@media (max-width: 520px) {
  .ori .card { width: 88px; min-height: 128px; }
  .ori .card .tx { font-size: 9.5px; }
  .ori .card .ic { font-size: 19px; width: 34px; height: 34px; }
  .ori .card .nm { font-size: 13.5px; }
}`;
  { const st = document.createElement("style"); st.textContent = CSS; document.head.append(st); }

  // カード1枚の絵。k が null なら裏向き(持ち主の色の模様)
  function cardEl(env, k, owner, opts = {}) {
    const fam = env.colorOf(owner), name = (x) => env.cards?.[x]?.name || x;
    if (!k || opts.back) {
      return h("div", { class: "card back" + (opts.mine ? " mine" : ""), style: `--fam:${fam}`, title: k ? `伏せたカード(あなたの${name(k)})` : "伏せたカード" },
        h("div", { class: "q" }, h("small", { "aria-hidden": "true" }, "⚜"), "?"), k ? h("div", { class: "peek" }, ICON[k] + " " + name(k)) : h("div", {}),
        opts.who ? h("div", { class: "who" }, opts.who) : null);
    }
    const d = env.cards[k];
    return h(opts.button ? "button" : "div", { type: opts.button ? "button" : undefined, class: "card" + (opts.sel ? " sel" : ""), style: `--fam:${fam}`, onclick: opts.onclick, "aria-pressed": opts.button ? (opts.sel ? "true" : "false") : undefined },
      h("div", { class: "fam" }), h("span", { class: "kind" }, d.char ? "人物" : "策略"), h("div", { class: "ic" }, ICON[k]), h("div", { class: "nm" }, d.name), h("div", { class: "tx" }, d.text),
      opts.who ? h("div", { class: "who" }, opts.who) : null);
  }
  // 列の描画。押せる山(対象・重ねる先)と、勅令の置き場所(山のすきま)
  function tableEl(env, g) {
    const { me, act, nameOf } = env, pd = g.pending, mine = pd && pd.by === me;
    const name = (x) => env.cards?.[x]?.name || x;
    const row = h("div", { class: "row" });
    const canStack = (s) => (g.step === "place" && g.placer === me && state.sel != null && s.top.owner === me) || (mine && pd.type === "target" && pd.options.includes(s.id));
    const tapStack = (s) => {
      if (g.step === "place") return act("place", { card: state.sel, where: s.id });
      if (pd && pd.type === "target") return act("target", { sid: s.id });
    };
    // 勅令の置き場所: 動かすカードを抜いたあとの列(pd.rest)で何番目に入れるか。画面では山のあいだに「ここへ」を出す
    const moving = mine && pd.type === "move";
    const rest = moving ? pd.rest : [];
    const slot = (i) => moving && pd.positions.includes(i) ? h("button", { type: "button", class: "slot", "aria-label": `${i + 1}番目へ動かす`, onclick: () => act("target", { pos: i }) }, "ここへ") : null;
    if (!g.queue.length) row.append(h("div", { class: "empty" }, "まだカードがありません"));
    for (const s of g.queue) {
      if (moving && rest.includes(s.id)) row.append(slot(rest.indexOf(s.id)));
      const t = s.top, isMine = t.owner === me;
      const can = canStack(s);
      const lastHit = g.last && (g.last.tid === s.id) && g.step !== "end";
      const st = h("div", { class: "stack" + (s.id === g.cur ? " cur" : "") + (g.done.includes(s.id) && s.id !== g.cur ? " done" : "") + (can ? " can" : "") + (moving && s.id === pd.tid ? " hit" : "") + (lastHit ? " hit" : ""),
        role: can ? "button" : undefined, tabindex: can ? "0" : undefined, "aria-label": can ? (g.step === "place" ? "このカードの上に重ねる" : "このカードを選ぶ") : undefined,
        onclick: can ? () => tapStack(s) : undefined, onkeydown: can ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapStack(s); } } : undefined },
        // 終了後は伏せたカードも表にして見せる(「伏せ」の印つき)
        t.up || g.step === "end" ? cardEl(env, t.k, t.owner, { who: nameOf(t.owner) + (t.up ? "" : "(伏せ)") }) : cardEl(env, t.k, t.owner, { back: true, mine: isMine, who: nameOf(t.owner) }),
        !t.up && t.inf ? h("span", { class: "tok", title: "上にたまった影響力" }, "●" + t.inf) : null,
        s.under.length ? h("span", { class: "under", title: s.under.map((u) => u.k ? name(u.k) + (u.up ? "(表)" : "(伏せ)") : "伏せたカード").join("・") }, `下に${s.under.length}枚`) : null);
      row.append(st);
    }
    if (moving) row.append(slot(rest.length));
    return h("div", { class: "table" }, row);
  }
  // 遊んでいる画面: 見出し(だれが何をしているか)・列・操作・手札・カードの一覧
  function render(main, g, env) {
    const { me, act, nameOf, remaining } = env, name = (x) => env.cards?.[x]?.name || x;
    if (state.sel != null && !(g.hand || []).some((c) => c.id === state.sel)) state.sel = null;
    if (g.step !== "place" || g.placer !== me) state.sel = null;
    const box = h("div", { class: "ori" });
    const pd = g.pending, mine = pd && pd.by === me;
    const curStack = g.queue.find((s) => s.id === g.cur);
    let say;
    if (g.step === "end") say = "ゲーム終了";
    else if (g.step === "place") say = g.placer === me ? "あなたの番: 手札を1枚選んで、列に置いてください" : `${nameOf(g.placer)} さんがカードを置いています`;
    else if (!pd) say = "解決中…";
    else if (pd.type === "reveal") say = mine ? "あなたのカードの番: 公開しますか？" : `${nameOf(pd.by)} さんが、公開するか考えています`;
    else if (pd.type === "target") say = mine ? `「${name(pd.as)}」の対象を選んでください(光っているカード)` : `${nameOf(pd.by)} さんが「${name(pd.as)}」の対象を選んでいます`;
    else say = mine ? "「勅令」: 動かす先を選んでください(光っている「ここへ」)" : `${nameOf(pd.by)} さんが「勅令」で動かす先を選んでいます`;
    const r = remaining();
    box.append(h("div", { class: "head" }, h("div", { class: "say" + (g.step === "end" ? " good" : "") }, say),
      r != null && g.step !== "end" ? h("span", { class: "cd", id: "cdText" }, r + "秒") : null));
    if (env.afterHead) env.afterHead(box);
    // 列
    box.append(h("div", { class: "small muted", style: "margin:0" }, g.step === "end" ? "最後の列(全部のカードを表にしています)" : `ラウンド${g.round}/${g.rounds}。列: ${g.dir === "L" ? "左から右へ ➡" : "⬅ 右から左へ"} 順に解決します(このゲームのあいだ同じ向き)。● はカードの上にたまった影響力`));
    box.append(tableEl(env, g));
    // 操作
    if (g.step === "place" && g.placer === me) {
      const sel = state.sel;
      box.append(h("div", { class: "act" },
        h("button", { type: "button", class: "primary", disabled: sel == null, onclick: () => act("place", { card: sel, where: "L" }) }, "← 左端に置く"),
        h("button", { type: "button", class: "primary", disabled: sel == null, onclick: () => act("place", { card: sel, where: "R" }) }, "右端に置く →")),
        h("p", { class: "small muted", style: "text-align:center;margin:0" }, sel == null ? "まず下の手札から1枚選んでください。" : "左端・右端のほか、列の光っている自分のカードを押すと、その上に重ねて置けます(下のカードは隠れます)。"));
    }
    if (pd && pd.type === "reveal" && mine && curStack) {
      const k = curStack.top.k, inf = curStack.top.inf;
      box.append(h("div", { class: "act" },
        h("button", { type: "button", class: "primary big", onclick: () => act("decide", { reveal: true }) }, `公開する(${name(k)})`),
        h("button", { type: "button", class: "big", onclick: () => act("decide", { reveal: false }) }, "伏せたまま(影響力+1を上に置く)")),
        h("p", { class: "small muted", style: "text-align:center;margin:0" }, k === "ambush" ? `待ち伏せは公開すると影響力+1(上の${inf}はもらえず捨てる)。伏せたままにすると上に影響力が1たまります(相手に排除されたら+4)。` : (inf ? `公開すると、上にたまった影響力${inf}${k === "conspiracy" ? "の2倍" : ""}をもらってから能力を使います。` : "公開すると、能力を使います。") + "伏せたままにすると、上に影響力が1たまります。"));
    }
    // 手札
    if (g.hand) {
      box.append(h("h2", { style: "font-size:16px" }, g.step === "end" ? `使わなかった手札(${g.hand.length}枚)` : `あなたの手札(${g.hand.length}枚)`));
      const canPick = g.step === "place" && g.placer === me;
      box.append(h("div", { class: "hand" }, ...[...g.hand].sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k)).map((c) => cardEl(env, c.k, me, { button: true, sel: state.sel === c.id, onclick: () => { if (!canPick) return; state.sel = state.sel === c.id ? null : c.id; env.rerender(); } }))),
        g.hand.length && !canPick && g.step === "place" ? h("p", { class: "small muted", style: "margin:0" }, "自分の番になったら、ここから1枚選んで置きます。") : null);
    } else if (g.step !== "end") box.append(h("p", { class: "muted small" }, "観戦中です。"));
    box.append(refEl(env, "カードの一覧(10種類・各家に1枚ずつ)"));
    main.append(box);
  }
  // カードの一覧(折りたたみ)
  function refEl(env, title) {
    return h("details", { class: "ori" }, h("summary", { class: "small" }, title),
      h("ul", { class: "ref" }, ...ORDER.map((k) => h("li", {}, ICON[k], " ", h("b", {}, env.cards[k].name), ": ", env.cards[k].text))));
  }
  // 音: 自分の番になった・公開・排除など(前の状態 pg と今の状態 g を比べる)
  function sound(pg, g, me, Sound) {
    if (!g || !pg) return;
    const myTurn = (x) => (x.step === "place" && x.placer === me) || (x.pending && x.pending.by === me);
    if (myTurn(g) && !myTurn(pg)) Sound.play("turn");
    if (g.last && JSON.stringify(g.last) !== JSON.stringify(pg.last)) Sound.play(g.last.type === "reveal" ? "reveal" : g.last.type === "elim" || g.last.type === "spy" ? "done" : "tap");
  }
  window.OriUI = { render, refEl, sound, ICON, ORDER, state };
})();
