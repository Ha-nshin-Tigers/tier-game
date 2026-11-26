// ダンダンティアーの「遊んでいる画面」(ティアー表・出題・相談・答え合わせ)。単独のページ(/dantier)と大会(/party)で共通。
// 使う側は DtUI.render(main, g, env) を呼ぶ。env = { me, nameOf, act, remaining, rerender, isGM, isMember, flash, again, ranking, inParty }
//   g: ルール本体(games/mini/dantier.js)の view。act(a, x): 操作をサーバへ送る。inParty: 大会の中(終わったあとの順位や「待機画面に戻る」は大会の画面が出す)
// 見た目は .dtui の中だけに効く(大会の画面のほかの部品と名前がぶつからないように)
(function () {
  "use strict";
  const { h, $, twoStep } = window.TG;
  // ランクの色(上ほど赤く、下ほど青〜灰色)
  const RCOL = { SSS: "#ff4d79", SS: "#ff6b57", S: "#ff9a48", A: "#f7cf4a", B: "#b5dc5f", C: "#5ccf91", D: "#52b9e8", E: "#7b96ff", F: "#a88af0", G: "#b3b8c2" };
  const state = { sel: null }; // 選んでいる言葉(表を作るとき)
  let E = null; // いま描いている画面の env
  const CSS = `
.dtui .theme { font-family: var(--display); font-size: clamp(18px, 4.5vw, 24px); line-height: 1.3; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--gold) 30%, var(--surface)); border: 2px solid var(--fg); overflow-wrap: anywhere; }
.dtui .theme small { display: block; font-family: var(--body); font-size: 12px; font-weight: 700; color: var(--muted); }
.dtui .word { display: inline-block; font-family: var(--display); font-size: clamp(22px, 6vw, 32px); padding: 4px 14px; border-radius: 8px; background: var(--fg); color: var(--surface); overflow-wrap: anywhere; }
.dtui .secret { display: inline-grid; place-items: center; min-width: 74px; height: 74px; padding: 0 10px; border-radius: 12px; font-family: var(--display); font-size: 40px; color: #181b23; border: 3px solid #181b23; }
.dtui .meter { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.dtui .meter i { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--fg); }
.dtui .meter i.on { background: var(--gold); }
/* ティアー表 */
.dtui .tier { display: grid; gap: 3px; border-radius: 10px; overflow: hidden; border: 2px solid var(--fg); background: var(--fg); }
.dtui .trow { display: grid; grid-template-columns: 64px minmax(0, 1fr); min-height: 52px; background: var(--surface); }
.dtui .trow .lab { display: grid; place-items: center; font-family: var(--display); font-size: 22px; color: #181b23; }
.dtui .trow .cells { display: flex; flex-wrap: wrap; gap: 5px; align-content: center; padding: 6px; min-width: 0; }
.dtui .trow.can { cursor: pointer; } .dtui .trow.can .cells { background: color-mix(in srgb, var(--gold) 18%, var(--surface)); }
.dtui .trow.new .lab { animation: dt-pop 0.6s ease-out; }
.dtui .item { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 6px; background: var(--bg); border: 1.5px solid var(--line); font-weight: 700; font-size: 14px; overflow-wrap: anywhere; max-width: 100%; }
.dtui button.item { cursor: pointer; font-family: var(--body); min-height: 34px; }
.dtui .item.sel { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.dtui .item .ng { color: var(--bad); font-size: 12px; } /* はずれたラウンドの言葉(置き場所は正しいランク) */
.dtui .item .by { font-size: 11px; color: var(--muted); font-weight: 500; }
/* ランクを選ぶボタン */
.dtui .ranks { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
.dtui .ranks button { padding: 8px 4px; display: grid; gap: 2px; justify-items: center; font-family: var(--display); font-size: 20px; color: #181b23; border-width: 2px; }
.dtui .ranks button.mine { box-shadow: 0 0 0 3px var(--accent); }
.dtui .ranks button.gone { opacity: .25; text-decoration: line-through; }
.dtui .ranks button .who { font-family: var(--body); font-size: 10.5px; font-weight: 700; line-height: 1.2; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dtui .ranks.sm button { font-size: 15px; padding: 4px 2px; } .dtui .ranks.sm { grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 4px; }
.dtui .gitem { display: grid; gap: 4px; padding: 8px; border: 1.5px solid var(--line); border-radius: 8px; }
.dtui .res { width: 100%; border-collapse: collapse; font-size: 13px; } .dtui .res td, .dtui .res th { padding: 3px 6px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; } /* スマホで見出しが縦に折れないように(はみ出す分は横にスクロール) */ .res .ok { color: var(--good); font-weight: 700; } .dtui .res .near { color: #b7791f; font-weight: 700; } .dtui .res .ng { color: var(--bad); }
.dtui .verdict { padding: 10px 14px; border-radius: 8px; border: 2px solid var(--fg); font-family: var(--display); font-size: 20px; }
.dtui .verdict.ok { background: color-mix(in srgb, var(--good) 20%, var(--surface)); } .dtui .verdict.ng { background: color-mix(in srgb, var(--bad) 16%, var(--surface)); }
.dtui .addrow { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; }

@keyframes dt-pop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
.dtui { display: grid; gap: 10px; }
@media (max-width: 520px) {
  .dtui .trow { grid-template-columns: 48px minmax(0, 1fr); min-height: 44px; }
  .dtui .trow .lab { font-size: 18px; }
  .dtui .ranks { grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); }
  .dtui .addrow { grid-template-columns: minmax(0, 1fr) auto; } .dtui .addrow button { grid-column: 1 / -1; }
}`;
  { const st = document.createElement("style"); st.textContent = CSS; document.head.append(st); }

// ティアー表。items: [{id,text,rank,by,ok}]。opt.onRow(rank) で行を押せる、opt.onItem(it) で言葉を押せる
function tierEl(g, items, opt = {}) {
  const box = h("div", { class: "tier", role: "list", "aria-label": "ティアー表" });
  for (let r = g.lo; r <= g.hi; r++) {
    const L = g.ladder[r], can = opt.onRow && !(opt.skip || []).includes(r);
    const row = h("div", { class: "trow" + (can ? " can" : "") + (opt.grew === L ? " new" : ""), role: "listitem", "data-rank": L,
      onclick: can ? (e) => { if (!e.target.closest(".item")) opt.onRow(r); } : undefined },
      h("div", { class: "lab", style: `background:${RCOL[L]}` }, L),
      h("div", { class: "cells" }, ...items.filter((x) => x.rank === r).map((x) => opt.onItem
        ? h("button", { type: "button", class: "item" + (state.sel === x.id ? " sel" : ""), onclick: () => opt.onItem(x) }, x.text)
        : h("span", { class: "item", title: (x.by ? E.nameOf(x.by) + "さんの言葉" : "") + (x.ok === false ? "(このラウンドははずれ)" : "") }, x.text, x.ok === false ? h("span", { class: "ng", "aria-label": "はずれ" }, "✗") : null, opt.showBy && x.by ? h("span", { class: "by" }, E.nameOf(x.by)) : null))));
    box.append(row);
  }
  return box;
}
// 完成したティアー表を1枚の画像にして保存
function saveImage(g, items, title) {
  const W = 960, LAB = 110, PAD = 14, LH = 34, FONT = '700 20px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
  const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
  ctx.font = FONT;
  // 行ごとに言葉を折り返して高さを決める
  const rows = [];
  for (let r = g.lo; r <= g.hi; r++) {
    const lines = [[]]; let x = 0;
    for (const it of items.filter((y) => y.rank === r)) { const w = ctx.measureText(it.text).width + 26; if (x + w > W - LAB - PAD * 2 && lines[lines.length - 1].length) { lines.push([]); x = 0; } lines[lines.length - 1].push([it.text, w]); x += w + 8; }
    rows.push({ r, lines, hgt: Math.max(70, lines.length * (LH + 8) + 18) });
  }
  const top = 76, H = top + rows.reduce((a, x) => a + x.hgt + 4, 0) + 30;
  cv.width = W; cv.height = H;
  ctx.fillStyle = "#181b23"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff"; ctx.font = '400 28px "Dela Gothic One", sans-serif'; ctx.textBaseline = "middle";
  ctx.fillText(title.slice(0, 36), PAD, 38);
  let y = top;
  for (const row of rows) {
    const L = g.ladder[row.r];
    ctx.fillStyle = RCOL[L]; ctx.fillRect(0, y, LAB, row.hgt);
    ctx.fillStyle = "#181b23"; ctx.font = '400 34px "Dela Gothic One", sans-serif'; ctx.textAlign = "center"; ctx.fillText(L, LAB / 2, y + row.hgt / 2);
    ctx.textAlign = "left"; ctx.fillStyle = "#2a2e38"; ctx.fillRect(LAB, y, W - LAB, row.hgt);
    ctx.font = FONT;
    row.lines.forEach((ln, i) => { let x = LAB + PAD; const yy = y + 12 + i * (LH + 8); for (const [t, w] of ln) { ctx.fillStyle = "#eef0f6"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, yy, w, LH, 6) : ctx.rect(x, yy, w, LH); ctx.fill(); ctx.fillStyle = "#181b23"; ctx.fillText(t, x + 13, yy + LH / 2 + 1); x += w + 8; } });
    y += row.hgt + 4;
  }
  ctx.fillStyle = "#a1a7b6"; ctx.font = '500 14px "Zen Kaku Gothic New", sans-serif'; ctx.fillText("みんなのあそびば・ダンダンティアー", PAD, H - 15);
  const a = document.createElement("a"); a.download = "tier-" + Date.now() + ".png"; a.href = cv.toDataURL("image/png"); document.body.append(a); a.click(); a.remove();
}
const themeEl = (g) => h("div", { class: "theme" }, h("small", {}, "お題"), g.theme);
const cdEl = () => E.remaining() != null && E.g.step !== "end" ? h("span", { class: "cd", id: "cdText" }, E.remaining() + "秒") : null;

// ---------- 本編 ----------
function renderSecret(main, g) {
  const cur = g.cur, giver = cur?.giver === E.me, guesser = E.isMember() && !giver;
  const meter = h("div", { class: "meter", "aria-label": `連続正解 ${g.streak}/${g.target}` }, h("b", { class: "small" }, "連続正解 "), ...Array.from({ length: g.target }, (_, i) => h("i", { class: i < g.streak ? "on" : "" })),
    h("span", { class: "small muted" }, ` ${g.streak}/${g.target}・ヒント残り${g.hintsLeft}・最高${g.best}`));
  let say = "";
  if (g.step === "end") say = g.cleared ? `🎉 ${g.target}回連続正解でクリア！(${g.round}ラウンド)` : `ここで終了(${g.round}ラウンド・最高${g.best}回連続)`;
  else if (g.step === "clue") say = giver ? "あなたが出題: 秘密のランクに合う言葉を考えて送ってください" : `${E.nameOf(cur.giver)} さんが言葉を考えています…`;
  else if (g.step === "guess") say = giver ? "みんなが当てるのを見守りましょう(しゃべってヒントを出すのはなし)" : "この言葉は何ランク？ 相談して選び、だれか1人が「決定」";
  else if (g.step === "result") say = cur.ok ? "⭕ 正解！" : "❌ はずれ…";
  main.append(h("div", { class: "head" }, h("div", { class: "say" + (g.step === "end" || (g.step === "result" && cur.ok) ? " good" : g.step === "result" ? " red" : "") }, say), cdEl()), themeEl(g), meter);

  if (g.step === "clue" && giver) {
    main.append(h("div", { class: "btns" }, h("span", {}, "あなたにだけ見える秘密のランク: "), h("span", { class: "secret", style: `background:${RCOL[g.ladder[cur.secret]]}` }, g.ladder[cur.secret])),
      h("form", { class: "addrow", onsubmit: (e) => { e.preventDefault(); const v = $("clueIn").value.trim(); if (v) E.act("clue", { text: v }); } },
        h("input", { type: "text", id: "clueIn", maxlength: "24", placeholder: `「${g.theme}」で ${g.ladder[cur.secret]} ランクっぽいもの`, autocomplete: "off" }),
        h("button", { class: "primary", type: "submit" }, "この言葉で出題")),
      h("p", { class: "small muted", style: "margin:0" }, `今の表は ${g.ladder[g.lo]}〜${g.ladder[g.hi]}。いちばん上が ${g.ladder[g.lo]}、いちばん下が ${g.ladder[g.hi]} です。`));
  }
  if ((g.step === "guess" || g.step === "result") && cur) {
    main.append(h("div", { style: "text-align:center" }, h("div", { class: "small muted" }, `${E.nameOf(cur.giver)} さんの言葉`), h("div", { class: "word" }, cur.text)));
  }
  if (g.step === "guess") {
    const counts = {}; for (const [p, r] of Object.entries(cur.picks)) (counts[r] || (counts[r] = [])).push(p);
    const mine = cur.picks[E.me];
    const btns = [];
    for (let r = g.lo; r <= g.hi; r++) {
      const L = g.ladder[r], gone = cur.removed.includes(r);
      btns.push(h("button", { type: "button", class: (mine === r ? "mine" : "") + (gone ? " gone" : "") + (giver && cur.secret === r ? " mine" : ""), style: `background:${RCOL[L]}`, disabled: !guesser || gone, "aria-pressed": mine === r ? "true" : "false",
        onclick: () => E.act("pick", { rank: mine === r ? null : r }) }, L, h("span", { class: "who" }, (counts[r] || []).map(nameOf).join("・") || " ")));
    }
    main.append(h("div", { class: "ranks", role: "group", "aria-label": "ランクを選ぶ" }, ...btns));
    if (guesser) main.append(h("div", { class: "btns" },
      mine != null ? twoStep(`「${g.ladder[mine]}」で決定`, () => E.act("decide", { rank: mine }), "primary big") : h("span", { class: "small muted" }, "ランクを選ぶと「決定」ボタンが出ます(みんなの選んだランクが見えます)"),
      h("button", { type: "button", class: "ghost", disabled: cur.hinted || g.hintsLeft <= 0, onclick: () => E.act("hint") }, cur.hinted ? "ヒント使用済み" : `ヒント(正解ではないランクを2つ消す・残り${g.hintsLeft})`)));
    else if (giver) main.append(h("p", { class: "small muted", style: "margin:0" }, "正解は ", h("b", {}, g.ladder[cur.secret]), "(あなたにだけ見えています)"));
  }
  if (g.step === "result") {
    main.append(h("div", { class: "verdict " + (cur.ok ? "ok" : "ng") }, `正解は ${g.ladder[cur.secret]} ランク`, cur.answer != null ? `(答え: ${g.ladder[cur.answer]})` : "(答えなし)",
      cur.grew ? h("div", { class: "small", style: "font-family:var(--body)" }, `端のランクだったので「${cur.grew}」ランクが増えました！`) : null),
      h("div", { class: "btns" }, E.isMember() ? h("button", { type: "button", class: "primary", onclick: () => E.act("next") }, "次のラウンドへ") : null, h("span", { class: "small muted" }, "(しばらくすると自動で進みます)")));
  }
  main.append(h("h2", { style: "font-size:16px" }, "ティアー表"), tierEl(g, g.items, { grew: g.step === "result" ? cur?.grew : null }));
  // クリアするまで終わらないので、ホストはここで終わりにして表を見られる
  if (g.step !== "end" && E.isGM()) main.append(h("div", { class: "btns" }, twoStep("ここで終わりにして表を見る", () => E.act("giveup"), "ghost")));
  if (g.step === "end") main.append(h("div", { class: "btns" }, h("button", { type: "button", onclick: () => saveImage(g, g.items, g.theme) }, "表を画像で保存"), h("button", { class: "primary", type: "button", onclick: () => E.again() }, "待機画面に戻る")));
}

// ---------- みんなでティアー ----------
function editor(g, items, canEdit, extra) {
  // 言葉を書いて、ランクの行を押すとそこに置ける。置いた言葉を押して選ぶと、ほかの行へ動かしたり消したりできる
  const box = h("div", { style: "display:grid;gap:8px" });
  if (canEdit) {
    box.append(h("form", { class: "addrow", onsubmit: (e) => { e.preventDefault(); } },
      h("input", { type: "text", id: "addIn", maxlength: "24", placeholder: "言葉を書いて、置きたいランクの行を押す", autocomplete: "off" }),
      state.sel != null ? h("button", { type: "button", class: "danger", onclick: () => { E.act("remove", { id: state.sel }); state.sel = null; } }, "選んだ言葉を消す") : h("span"),
      state.sel != null ? h("button", { type: "button", class: "ghost", onclick: () => { state.sel = null; E.rerender(); } }, "選ぶのをやめる") : h("span")),
      h("p", { class: "small muted", style: "margin:0" }, state.sel != null ? "動かす先のランクの行を押してください。" : "書いた言葉は、ランクの行を押すとそこに置かれます。置いた言葉を押すと、選んで動かせます。"));
  }
  box.append(tierEl(g, items, canEdit ? {
    onRow: (r) => {
      // 入力欄に言葉があれば新しく置く(選んでいた言葉の選択はやめる)。なければ、選んだ言葉を動かす
      const el = $("addIn"), v = el ? el.value.trim() : "";
      if (!v && state.sel != null) { E.act("move", { id: state.sel, rank: r }); state.sel = null; return; }
      state.sel = null;
      if (!v) { E.flash("先に言葉を書いてください", true); el?.focus(); return; }
      E.act("add", { text: v, rank: r }); el.value = ""; el.focus();
    },
    // 入力欄に言葉が書いてあるときは、置いてある言葉の上を押しても、その行に置く(言葉が増えても置きやすいように)
    onItem: (x) => { const el = $("addIn"), v = el ? el.value.trim() : ""; if (v) { state.sel = null; E.act("add", { text: v, rank: x.rank }); el.value = ""; el.focus(); return; } state.sel = state.sel === x.id ? null : x.id; E.rerender(); },
  } : {}));
  if (extra) box.append(extra);
  return box;
}
function renderTogether(main, g) {
  main.append(h("div", { class: "head" }, h("div", { class: "say" + (g.step === "end" ? " good" : "") }, g.step === "end" ? "ティアー表が完成！" : "みんなで1枚のティアー表を作ろう"), cdEl()), themeEl(g));
  const edit = g.step === "build" && E.isMember();
  main.append(editor(g, g.items, edit, edit ? h("div", { class: "btns" },
    h("button", { type: "button", class: "ghost tiny", disabled: g.lo <= 0, onclick: () => E.act("expand", { side: "top" }) }, g.lo > 0 ? `上に「${g.ladder[g.lo - 1]}」を足す` : "上はSSSまで"),
    h("button", { type: "button", class: "ghost tiny", disabled: g.hi >= g.ladder.length - 1, onclick: () => E.act("expand", { side: "bottom" }) }, g.hi < g.ladder.length - 1 ? `下に「${g.ladder[g.hi + 1]}」を足す` : "下はGまで"),
    E.isGM() ? twoStep("これで完成", () => E.act("complete"), "primary") : h("span", { class: "small muted" }, "ホストが「これで完成」を押すと終わります")) : null));
  if (g.step === "end") main.append(h("div", { class: "btns" }, h("button", { type: "button", onclick: () => saveImage(g, g.items, g.theme) }, "表を画像で保存"), h("button", { class: "primary", type: "button", onclick: () => E.again() }, "待機画面に戻る")));
}

// ---------- じぶんのティアー ----------
function renderMine(main, g) {
  const cur = g.cur, maker = cur?.maker === E.me, guesser = E.isMember() && !maker;
  let say = "";
  if (g.step === "end") say = "ゲーム終了";
  else if (g.step === "make") say = maker ? "あなたのティアー表を作ってください(3〜10個)" : `${E.nameOf(cur.maker)} さんがティアー表を作っています…(今${cur.count}個)`;
  else if (g.step === "guess") say = maker ? "みんながあなたの表を当てています" : `${E.nameOf(cur.maker)} さんの表を当てよう: 言葉ごとにランクを選ぶ`;
  else if (g.step === "reveal") say = `${E.nameOf(cur.maker)} さんの表の答え合わせ`;
  main.append(h("div", { class: "head" }, h("div", { class: "say" + (g.step === "end" ? " good" : "") }, say), cdEl()), themeEl(g));
  if (g.step === "make" && maker) {
    main.append(editor(g, cur.items, true, h("div", { class: "btns" },
      h("button", { type: "button", class: "primary", disabled: cur.items.length < 3, onclick: () => E.act("publish") }, `この表で出題(${cur.items.length}個)`),
      h("span", { class: "small muted" }, "3〜10個。ほかの人は言葉だけを見て、それぞれのランクを当てます"))));
  }
  if (g.step === "guess" && guesser) {
    const done = cur.done.includes(E.me);
    main.append(h("div", { style: "display:grid;gap:6px" }, ...cur.items.map((x) => {
      const sel = cur.myGuess[x.id];
      const rb = []; for (let r = g.lo; r <= g.hi; r++) { const L = g.ladder[r]; rb.push(h("button", { type: "button", class: sel === r ? "mine" : "", style: `background:${RCOL[L]}`, disabled: done, "aria-pressed": sel === r ? "true" : "false", onclick: () => E.act("pick", { id: x.id, rank: r }) }, L)); }
      return h("div", { class: "gitem" }, h("b", {}, x.text), h("div", { class: "ranks sm", role: "group", "aria-label": `${x.text}のランク` }, ...rb));
    })), h("div", { class: "btns" }, done ? h("span", { class: "small muted" }, `回答しました。みんなを待っています(${cur.done.length}人)`) : h("button", { type: "button", class: "primary big", disabled: cur.items.some((x) => cur.myGuess[x.id] == null), onclick: () => E.act("gdone") }, "これで回答")));
  } else if (g.step === "guess") main.append(h("p", { class: "muted" }, `回答した人: ${cur.done.map(nameOf).join("・") || "まだいません"}`), maker ? tierEl(g, cur.items) : null);
  if ((g.step === "reveal" || g.step === "end") && cur && cur.guesses) {
    main.append(h("h2", { style: "font-size:16px" }, `${E.nameOf(cur.maker)} さんのティアー表`), tierEl(g, cur.items));
    const ps = g.order.filter((p) => p !== cur.maker);
    main.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "res" }, h("thead", {}, h("tr", {}, h("th", {}, "言葉"), h("th", {}, "答え"), ...ps.map((p) => h("th", {}, E.nameOf(p))))),
      h("tbody", {}, ...cur.items.map((x) => h("tr", {}, h("td", {}, x.text), h("td", {}, h("b", {}, g.ladder[x.rank])), ...ps.map((p) => {
        const gr = (cur.guesses[p] || {})[x.id]; const d = gr == null ? 9 : Math.abs(gr - x.rank);
        return h("td", { class: d === 0 ? "ok" : d === 1 ? "near" : "ng" }, gr == null ? "—" : g.ladder[gr] + (d === 0 ? " ◎" : d === 1 ? " ○" : ""));
      }))), h("tr", {}, h("td", {}, "点数"), h("td", {}, ""), ...ps.map((p) => h("td", {}, h("b", {}, `+${cur.pts?.[p] ?? 0}`))))))),
      h("p", { class: "small muted", style: "margin:0" }, `ぴったり2点・1つずれ1点。作った ${E.nameOf(cur.maker)} さんは、当てた人の平均点 +${cur.pts?.[cur.maker] ?? 0}`));
    if (g.step === "reveal") main.append(h("div", { class: "btns" }, E.isMember() ? h("button", { type: "button", class: "primary", onclick: () => E.act("next") }, "次へ") : null, h("button", { type: "button", class: "ghost", onclick: () => saveImage(g, cur.items, `${E.nameOf(cur.maker)}の「${g.theme}」`) }, "この表を画像で保存")));
  }
  if (g.step === "end" && !E.inParty) { // 大会では、順位は大会の画面が出す
    const rows = E.ranking || [];
    main.append(h("h2", { style: "font-size:16px" }, "最終結果"), h("table", { class: "rank" }, h("tbody", {}, ...rows.map((r) => h("tr", { class: r.id === E.me ? "me" : "" }, h("td", {}, r.rank === 1 ? "🏆 1位" : `${r.rank}位`), h("td", {}, r.name), h("td", { class: "n" }, `${r.raw}点`))))),
      h("div", { class: "btns" }, h("button", { class: "primary", type: "button", onclick: () => E.again() }, "待機画面に戻る")));
  }
}


  function render(main, g, env) {
    E = { ...env, g };
    const box = h("div", { class: "dtui" });
    if (g.mode === "secret") renderSecret(box, g);
    else if (g.mode === "together") renderTogether(box, g);
    else renderMine(box, g);
    main.append(box);
  }
  window.DtUI = { render, tierEl: (g, items, opt) => tierEl(g, items, opt), RCOL, state };
})();
