// パーティー(みんなで移動)の共通スクリプト。各ゲームの画面・ホーム・パーティーの画面で読み込む。
// パーティーに入っていれば /lobby/ws につながり、ホストが次のゲームを選ぶと全員の画面がその部屋へ自動で移動する。
// 遊んでいる途中の人は、そのゲームが終わって待機画面に戻ったときに移動する(「今すぐ移動」も押せる)。
// パーティーの画面(/lobby)からは window.Party を使う。
// ついでに、どの画面でも使える便利機能もここに置く: 招待リンクの「共有」ボタン(LINE・Discord などの送り先を選ぶ)と、
// 部屋に入っている間はスマホの画面が自動で消えないようにする(Screen Wake Lock)。
(() => {
  const KEY = "tier:party", SEEN = "tier:party:seen";
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const rnd = (n, chars = "abcdefghijklmnopqrstuvwxyz0123456789") => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => chars[x % chars.length]).join(""); };
  let ident = store.get("tier:ident");
  if (!ident || !ident.pid || !ident.token) { ident = { pid: rnd(16), token: rnd(32) }; store.set("tier:ident", ident); }
  const page = location.pathname.replace(/\/+$/, "").slice(1);
  // 画面で起きたエラーをサーバのログに送る(直すため。1ページ5件まで・同じものは1回・このサイトのスクリプトのものだけ)
  {
    const sent = new Set();
    const report = (msg, src, line, stack) => {
      try {
        if (sent.size >= 5 || !msg) return;
        if (src && !String(src).startsWith(location.origin)) return; // 拡張機能などのエラーは送らない
        if (/ResizeObserver loop|Script error\.?$/.test(msg)) return;
        const key = msg + "|" + src + "|" + line; if (sent.has(key)) return; sent.add(key);
        const body = JSON.stringify({ page: page || "home", msg: String(msg).slice(0, 300), src: String(src || "").replace(location.origin, "").slice(0, 120), line, stack: String(stack || "").slice(0, 600), ua: navigator.userAgent.slice(0, 80) });
        if (navigator.sendBeacon) navigator.sendBeacon("/log", body); else fetch("/log", { method: "POST", body, keepalive: true }).catch(() => {});
      } catch {}
    };
    addEventListener("error", (e) => { if (e.message) report(e.message, e.filename, e.lineno, e.error && e.error.stack); });
    addEventListener("unhandledrejection", (e) => { const r = e.reason; report(r && r.message ? r.message : String(r), r && r.stack ? (r.stack.match(/https?:\/\/[^\s)]+/) || [location.href])[0] : location.href, 0, r && r.stack); });
  }
  const HUB = page === "lobby", HOME = page === "" || page === "index.html";
  const params = new URLSearchParams(location.search);

  let info = store.get(KEY), ws = null, st = null, me = null, retry = 0, lastErr = "", pending = null, open = false;
  const subs = [];
  const notify = () => { for (const f of subs) try { f(); } catch {} ; if (!HUB) drawBar(); };
  const seen = () => { const s = store.get(SEEN); return s && info && s.code === info.code ? s.seq : 0; };
  const markSeen = (seq) => { if (info) store.set(SEEN, { code: info.code, seq }); };
  const isHost = () => !!st && st.host === me;

  function connect() {
    if (!info || ws) return;
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/lobby/ws");
    ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ t: "join", room: info.code, name: info.name, pid: ident.pid, token: ident.token, where: HUB || HOME ? null : page, create: !!info.create })); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "joined") { if (info.create) { info.create = false; store.set(KEY, info); } lastErr = ""; }
      else if (m.t === "state") { st = m.room; me = m.me; follow(); notify(); }
      else if (m.t === "kicked") {
        // ホストにパーティーから外された
        const w = ws; ws = null; info = null; st = null; pending = null; store.del(KEY); lastErr = "ホストによってパーティーから外されました";
        try { w.close(); } catch {}
        notify(); banner(lastErr, 6000);
      }
      else if (m.t === "info" && m.msg) banner(m.msg, m.maint ? 20000 : 6000);
      else if (m.t === "error") {
        lastErr = m.msg;
        // 入れなかった(コード違い・満員など)ときは、パーティーの情報を消す
        if (!st) { const w = ws; ws = null; info = null; store.del(KEY); try { w.close(); } catch {} }
        notify();
      }
    };
    ws.onclose = () => { const was = ws; ws = null; if (!info || !was) return; setTimeout(connect, Math.min(8000, 800 * 2 ** retry++)); };
  }
  // 画面の上のお知らせ(サーバの更新・パーティーから外された など)
  function banner(text, ms) {
    let el = document.getElementById("pb-banner");
    if (!el) {
      el = document.createElement("div"); el.id = "pb-banner"; el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(8px + env(safe-area-inset-top,0px));z-index:70;width:min(560px,calc(100vw - 16px));padding:10px 14px;border-radius:10px;background:#181b23;color:#fff;font:700 14px/1.5 var(--body,system-ui,sans-serif);box-shadow:0 4px 16px rgba(0,0,0,.3);text-align:center";
      document.body.append(el);
    }
    el.textContent = text; el.hidden = false;
    clearTimeout(banner.t); banner.t = setTimeout(() => { el.hidden = true; }, ms);
  }
  // 遊んでいる途中か(ゲームの画面の状態 S を見る。待機中・結果画面なら途中ではない)
  function busy() {
    try {
      // eslint-disable-next-line no-undef
      const s = typeof S !== "undefined" ? S : null;
      if (!s || !s.phase) return false;
      // ミニゲームを単独で遊ぶ画面(ひとりじめ橋など)は、結果画面がそのまま終わりの画面
      if (["bridge", "bomb", "memory"].includes(page) && s.phase === "result") return false;
      return !["lobby", "finished", "final"].includes(s.phase);
    } catch { return false; }
  }
  const here = (g) => g.path === "/" + page && (!g.key || params.get("room") === g.roomCode);
  function go(g) {
    markSeen(g.seq); pending = null;
    location.href = g.key ? `${g.path}?room=${g.roomCode}&party=1` : g.path;
  }
  // ホストが選んだゲームへ: まだ見ていない選択なら移動(途中なら終わるまで待つ)
  function follow() {
    const g = st && st.game;
    if (!g || g.seq <= seen()) { pending = null; return; }
    if (here(g)) { markSeen(g.seq); pending = null; return; }
    if (busy()) { pending = g; return; }
    go(g);
  }
  setInterval(() => { if (pending && !busy()) go(pending); }, 1000);

  // パーティーから来たとき(URL に party=1): ゲームの入室画面に名前と部屋コードを入れて自動で入る
  // パーティーのホストがゲームの部屋でもホスト(スタートや設定を押せる人=最初に入った人)になるように、
  // ほかの人は少し遅れて入る
  function autoJoin(tries = 0, delayed = false) {
    if (!info || params.get("party") !== "1") return;
    if (!delayed) {
      if (!st && tries < 10) { setTimeout(() => autoJoin(tries + 1), 300); return; }
      if (st && st.host !== me) { setTimeout(() => autoJoin(0, true), 1500); return; }
    }
    const login = document.getElementById("login"), btn = document.getElementById("lJoin"), nm = document.getElementById("lName"), rm = document.getElementById("lRoom");
    if (!login || !btn || !nm || !rm) return;
    if (login.hidden) return; // もう入っている
    if (btn.disabled) { if (tries < 20) setTimeout(() => autoJoin(tries + 1, true), 300); return; } // 前回の部屋に戻っている途中
    if (!nm.value) nm.value = info.name;
    rm.value = params.get("room") || "";
    btn.click();
  }

  // ---- 画面の下のバー(ゲームの画面・ホーム) ----
  let bar = null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function drawBar() {
    if (!info) { if (bar) { bar.remove(); bar = null; document.body.classList.remove("has-partybar"); } return; }
    if (!bar) {
      const css = document.createElement("style");
      css.textContent = `
.partybar { position: fixed; left: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); z-index: 35; max-width: min(420px, calc(100vw - 16px)); font-family: var(--body, system-ui, sans-serif); font-size: 13px; color: var(--fg, #181b23); }
.partybar .pb-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 2px solid var(--fg, #181b23); background: var(--surface, #fff); color: var(--fg, #181b23); font-weight: 700; font-size: 13px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.18); }
.partybar .pb-panel { margin-bottom: 6px; padding: 10px; border-radius: 12px; border: 2px solid var(--fg, #181b23); background: var(--surface, #fff); box-shadow: 0 4px 16px rgba(0,0,0,.25); display: grid; gap: 8px; max-height: 60vh; overflow: auto; }
.partybar .pb-note { padding: 6px 10px; border-radius: 10px; background: #fff3c4; color: #181b23; border: 2px solid #d69e00; margin-bottom: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.partybar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; } .partybar li { display: flex; justify-content: space-between; gap: 8px; }
.partybar .pb-muted { color: var(--muted, #596070); font-size: 12px; }
.partybar .pb-games { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
.partybar button.pb-b { font-family: inherit; font-size: 12px; font-weight: 700; padding: 5px 8px; border-radius: 6px; border: 1.5px solid var(--fg, #181b23); background: var(--surface, #fff); color: var(--fg, #181b23); cursor: pointer; text-align: left; }
.partybar button.pb-b.cur { background: var(--fg, #181b23); color: var(--surface, #fff); }
.partybar button.pb-b.voted { border-color: var(--accent, #3446c4); border-width: 3px; }
.partybar a { color: var(--accent, #3446c4); font-weight: 700; }
body.has-partybar { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)) !important; }`;
      document.head.append(css);
      bar = document.createElement("div"); bar.className = "partybar"; document.body.append(bar); document.body.classList.add("has-partybar");
      bar.addEventListener("click", onBarClick);
    }
    const n = st ? st.members.filter((x) => x.connected).length : 0, gname = (k) => (st && st.games.find((x) => x.key === k) || {}).name || k;
    let html = "";
    if (pending) html += `<div class="pb-note">次は「${esc(pending.name)}」(このゲームが終わったら移動します) <button class="pb-b" data-act="gonow">今すぐ移動</button></div>`;
    else if (st && ended() && !open && endSeen !== endKey()) html += `<div class="pb-note">🎉 ゲームおわり！ 次は？ ${isHost() ? `<button class="pb-b" data-act="lobbyall">みんなでパーティーへ戻る</button><button class="pb-b" data-act="toggle">次のゲームを選ぶ</button>` : `<a href="/lobby" data-act="hub">パーティーの画面へ</a><button class="pb-b" data-act="toggle">やりたいゲームを伝える</button>`}<button class="pb-b" data-act="endok" aria-label="閉じる">×</button></div>`;
    if (open) {
      html += `<div class="pb-panel"><b>🎉 パーティー ${esc(info.code)}</b>`;
      if (lastErr) html += `<div class="pb-muted" style="color:#c4323a">${esc(lastErr)}</div>`;
      if (st) {
        html += `<ul>${st.members.map((p) => `<li><span>${esc(p.name)}${p.id === st.host ? " 👑" : ""}${p.id === me ? "(あなた)" : ""}</span><span class="pb-muted">${p.connected ? (p.where ? esc(gname(p.where)) : "パーティーの画面") : "移動中/切断"}</span></li>`).join("")}</ul>`;
        // 通算成績(上位3人)
        const sc = Object.values(st.scores || {}).sort((a, b) => b.pts - a.pts).slice(0, 3);
        if (sc.length) html += `<div class="pb-muted">通算成績: ${sc.map((r, i) => `${i + 1}位 ${esc(r.name)} ${r.pts}点`).join(" / ")}</div>`;
        const vote = st.mode === "vote", votes = st.votes || {}, cnt = {};
        for (const k of Object.values(votes)) cnt[k] = (cnt[k] || 0) + 1;
        const wcnt = {}; for (const k of Object.values(st.wants || {})) wcnt[k] = (wcnt[k] || 0) + 1;
        const btns = () => `<div class="pb-games">${st.games.map((x) => `<button class="pb-b${x.key === page ? " cur" : ""}${vote && votes[me] === x.key ? " voted" : ""}" data-game="${x.key}">${esc(x.name)}<span class="pb-muted"> ${x.min === x.max ? x.min : x.min + "〜" + x.max}人${vote && cnt[x.key] ? ` ・${cnt[x.key]}票` : ""}${!vote && wcnt[x.key] ? ` ・👍${wcnt[x.key]}` : ""}</span></button>`).join("")}</div>`;
        if (vote) {
          html += `<div class="pb-muted">次のゲームは投票で決めます(押すと投票・もう一度押すと取り消し)。全員が投票すると決まります。</div>${btns()}`;
          if (isHost()) html += `<button class="pb-b" data-act="decide">投票を締め切って決める</button><button class="pb-b" data-act="lobbyall">みんなでパーティーの画面へ戻る</button>`;
        } else if (isHost()) html += `<div class="pb-muted">ホストのあなたが次のゲームを選ぶと、みんなの画面がいっしょに移動します:</div>${btns()}<button class="pb-b" data-act="lobbyall">みんなでパーティーの画面へ戻る</button>`;
        else {
          const wants = st.wants || {};
          html += `<div class="pb-muted">次のゲームはホスト(👑)が選びます。やりたいゲームを押すと「やりたい👍」がホストに伝わります(もう一度押すと取り消し)。</div><div class="pb-games">${st.games.map((x) => { const c = Object.values(wants).filter((k) => k === x.key).length; return `<button class="pb-b${wants[me] === x.key ? " voted" : ""}" data-want="${x.key}">${esc(x.name)}<span class="pb-muted">${c ? ` 👍${c}` : ""}</span></button>`; }).join("")}</div>`;
        }
      }
      html += `<div style="display:flex;gap:10px;flex-wrap:wrap"><a href="/lobby" data-act="hub">パーティーの画面</a><a href="#" data-act="leave">パーティーを抜ける</a></div></div>`;
    }
    html += `<button class="pb-pill" data-act="toggle" aria-expanded="${open}">🎉 パーティー ${esc(info.code)}・${n}人${st && st.game && st.game.key && st.game.key !== page ? `・次:${esc(st.game.name)}` : ""}</button>`;
    bar.innerHTML = html;
  }
  let leaveArmed = 0, endSeen = -1;
  // ゲームが終わった画面か(結果・最終結果)
  function ended() {
    try {
      // eslint-disable-next-line no-undef
      const s = typeof S !== "undefined" ? S : null;
      if (!s || !s.phase) return false;
      if (["bridge", "bomb", "memory"].includes(page) && s.phase === "result") return true;
      return ["finished", "final"].includes(s.phase);
    } catch { return false; }
  }
  let wasEnded = false, endCount = 0; const endKey = () => endCount; // ゲームが終わるたびに1つ増える(閉じたお知らせは、次に終わるまで出さない)
  setInterval(() => { const e = !!info && ended(); if (e !== wasEnded) { wasEnded = e; if (e) endCount++; drawBar(); } }, 1000);
  function onBarClick(e) {
    const t = e.target.closest("[data-act],[data-game],[data-want]");
    if (!t) return;
    const a = t.dataset.act;
    if (t.dataset.want) { e.preventDefault(); api.want(t.dataset.want); return; }
    if (t.dataset.game) {
      e.preventDefault();
      if (st && st.mode === "vote") api.vote(st.votes && st.votes[me] === t.dataset.game ? null : t.dataset.game);
      else api.pick(t.dataset.game);
      return;
    }
    if (a === "toggle") { open = !open; drawBar(); }
    else if (a === "gonow" && pending) go(pending);
    else if (a === "endok") { endSeen = endKey(); drawBar(); }
    else if (a === "lobbyall") api.backAll();
    else if (a === "decide") api.decide();
    else if (a === "hub") { if (st && st.game) markSeen(st.game.seq); }
    else if (a === "leave") {
      e.preventDefault();
      if (Date.now() - leaveArmed > 3000) { leaveArmed = Date.now(); t.textContent = "もう一度押すと抜けます"; return; }
      api.leave();
    }
  }

  // ---- 招待リンクの「共有」ボタン: 押すと送り先(LINE・Discord・X・メール・コピー・端末の共有メニュー)を選ぶ ----
  const MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {}
    try { const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.append(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch { return false; }
  }
  // 送るときの文: 「○○で遊ぼう！」+ 招待リンク
  const gameTitle = () => (document.title.split(/[（(｜]/)[0] || "みんなのあそびば").trim();
  function shareSheet(url) {
    document.querySelectorAll(".pb-sheet").forEach((x) => x.remove());
    const text = `「${gameTitle()}」でいっしょに遊ぼう！ このリンクから部屋に入れます`;
    const enc = encodeURIComponent;
    const wrap = document.createElement("div");
    wrap.className = "pb-sheet"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-label", "招待リンクを送る");
    const opts = [
      ["line", "LINE で送る", "#06c755"],
      ["discord", "Discord に送る", "#5865f2"],
      ["x", "X(Twitter)に投稿", "#111111"],
      ["mail", "メールで送る", "#596070"],
      ["copy", "リンクをコピー", "#3446c4"],
    ];
    if (navigator.share) opts.push(["native", "そのほか(端末の共有メニュー)", "#3446c4"]);
    wrap.innerHTML = `<div class="pb-sheet-box"><b>招待リンクを送る</b><div class="pb-sheet-url">${esc(url)}</div>${opts.map(([k, label, c]) => `<button type="button" data-to="${k}" style="--c:${c}">${label}</button>`).join("")}<p class="pb-sheet-msg" aria-live="polite"></p><button type="button" data-to="close" class="pb-sheet-close">閉じる</button></div>`;
    const msg = (t) => { wrap.querySelector(".pb-sheet-msg").textContent = t; };
    const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", async (e) => {
      if (e.target === wrap) return close();
      const to = e.target.closest("[data-to]")?.dataset.to;
      if (!to) return;
      if (to === "close") return close();
      if (to === "line") { window.open(MOBILE ? `https://line.me/R/share?text=${enc(text + "\n" + url)}` : `https://social-plugins.line.me/lineit/share?url=${enc(url)}&text=${enc(text)}`, "_blank", "noopener"); return close(); }
      if (to === "x") { window.open(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`, "_blank", "noopener"); return close(); }
      if (to === "mail") { location.href = `mailto:?subject=${enc(gameTitle() + "の招待")}&body=${enc(text + "\n" + url)}`; return close(); }
      if (to === "native") { navigator.share({ title: document.title, text, url }).catch(() => {}); return close(); }
      if (to === "copy") { msg(await copyText(url) ? "コピーしました。好きなアプリに貼り付けて送ってください" : "コピーできませんでした。上のリンクを長押しで選んでコピーしてください"); return; }
      if (to === "discord") {
        // Discord には外から送る仕組みがないので、コピーしてから Discord を開く(あとは貼り付けるだけ)
        const ok = await copyText(text + " " + url);
        msg(ok ? "リンクをコピーしました。Discord を開くので、送りたいチャットに貼り付けて送ってください" : "コピーできませんでした。上のリンクを長押しで選んでコピーしてください");
        if (ok) setTimeout(() => window.open("https://discord.com/channels/@me", "_blank", "noopener"), 900);
      }
    });
    document.body.append(wrap);
    wrap.querySelector("button").focus();
  }
  let sheetCss = false;
  function addShare(force) {
    const boxes = document.querySelectorAll(".invite");
    if ((boxes.length || force) && !sheetCss) {
      sheetCss = true;
      const css = document.createElement("style");
      css.textContent = `
.pb-sheet { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.45); display: grid; place-items: end center; padding: 12px; }
@media (min-width: 600px) { .pb-sheet { place-items: center; } }
.pb-sheet-box { width: min(420px, 100%); display: grid; gap: 8px; padding: 16px; border-radius: 14px; background: var(--surface, #fff); color: var(--fg, #181b23); border: 2px solid var(--fg, #181b23); font-family: var(--body, system-ui, sans-serif); padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
.pb-sheet-box b { font-size: 16px; }
.pb-sheet-url { font-size: 12px; color: var(--muted, #596070); word-break: break-all; user-select: all; -webkit-user-select: all; }
.pb-sheet-box button { font-family: inherit; font-size: 15px; font-weight: 700; padding: 11px 14px; border-radius: 8px; border: 2px solid var(--c, #181b23); background: var(--c, #181b23); color: #fff; cursor: pointer; text-align: center; }
.pb-sheet-box button.pb-sheet-close { background: transparent; color: var(--fg, #181b23); border-color: var(--line, #cfd4de); }
.pb-sheet-msg { margin: 0; font-size: 13px; color: var(--good, #1f8a4c); min-height: 1em; }
.pb-sheet-box button:disabled { opacity: .4; cursor: default; }
.pb-guide-img { display: block; width: 100%; max-height: 38vh; object-fit: contain; object-position: top; border-radius: 10px; border: 1.5px solid var(--line, #cfd4de); background: var(--bg, #e9ecf2); }
.pb-guide-step { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: start; min-height: 110px; }
.pb-guide-step p { margin: 0; font-size: 16px; line-height: 1.7; }
.pb-guide-no { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--accent, #3446c4); color: #fff; font-weight: 700; font-size: 18px; }
.pb-guide-dots { display: flex; gap: 6px; justify-content: center; } .pb-guide-dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--line, #cfd4de); } .pb-guide-dots i.on { background: var(--accent, #3446c4); }
.pb-guide-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pb-help { position: fixed; right: 12px; bottom: calc(62px + env(safe-area-inset-bottom, 0px)); z-index: 36; width: 38px; height: 38px; border-radius: 50%; border: 2px solid var(--fg, #181b23); background: var(--surface, #fff); color: var(--fg, #181b23); font-weight: 700; font-size: 18px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.18); }`;
      document.head.append(css);
    }
    for (const box of boxes) {
      if (box.querySelector(".pb-share")) continue;
      const inp = box.querySelector("input"), copy = box.querySelector("button");
      if (!inp) continue;
      const b = document.createElement("button");
      b.type = "button"; b.className = "pb-share " + (copy ? copy.className : ""); b.textContent = "共有";
      b.addEventListener("click", () => shareSheet(inp.value));
      box.append(b);
    }
  }
  // ---- 部屋に入っている間は画面を消さない(画面が消えると接続が切れて、手番や時間切れを逃しやすい) ----
  let lock = null, locking = false;
  function inRoom() {
    try {
      // eslint-disable-next-line no-undef
      const s = typeof S !== "undefined" ? S : null;
      return !!(s && s.code);
    } catch { return false; }
  }
  async function wake() {
    if (!navigator.wakeLock || locking) return;
    const want = document.visibilityState === "visible" && inRoom();
    try {
      if (want && !lock) { locking = true; lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
      else if (!want && lock) { const l = lock; lock = null; await l.release(); }
    } catch { lock = null; } finally { locking = false; }
  }
  // ---- 文字チャット(部屋ごと。パーティーの画面ではパーティーごと) ----
  let cws = null, ckey = null, clog = [], copen = false, cunread = 0, cbox = null, cpeek = null;
  function chatKey() {
    if (HUB) return info && st ? "lobby:" + info.code : null;
    if (!/^[a-z]{2,12}$/.test(page) || !inRoom()) return null;
    // 文字チャットを置かないページ(ボムバナナは「しゃべれない・聞こえない」役があるので、全員が読み書きできるチャットはルールを壊す)
    if (window.PB_NO_CHAT) return null;
    // eslint-disable-next-line no-undef
    return page + ":" + S.code;
  }
  function chatName() {
    try {
      // eslint-disable-next-line no-undef
      const p = typeof S !== "undefined" && S && Array.isArray(S.players) ? S.players.find((x) => x.id === ident.pid) : null;
      if (p && p.name) return p.name;
    } catch {}
    return (info && info.name) || (store.get("tier:last") || {}).name || "だれか";
  }
  function chatConnect(key) {
    if (cws) { try { cws.close(); } catch {} cws = null; }
    ckey = key; clog = []; cunread = 0;
    if (!key) return drawChat();
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/chat/ws");
    cws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: "join", key, pid: ident.pid, token: ident.token, name: chatName() }));
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "log") { clog = m.log; drawChat(); }
      else if (m.t === "msg") {
        clog.push(m.msg); if (clog.length > 40) clog.shift();
        if (!copen && m.msg.pid !== ident.pid) { cunread++; peek(m.msg); }
        drawChat();
      }
    };
    ws.onclose = () => { if (cws === ws) { cws = null; setTimeout(() => { if (!cws && ckey === key) chatConnect(key); }, 2000); } };
  }
  function peek(msg) {
    if (!cpeek) { cpeek = document.createElement("div"); cpeek.className = "pb-peek"; document.body.append(cpeek); cpeek.addEventListener("click", () => { copen = true; cunread = 0; drawChat(); cpeek.hidden = true; }); }
    cpeek.textContent = `${msg.name}: ${msg.text}`; cpeek.hidden = false;
    clearTimeout(peek.t); peek.t = setTimeout(() => { cpeek.hidden = true; }, 4000);
  }
  let chatCss = false;
  function drawChat() {
    if (!chatCss) {
      chatCss = true;
      const css = document.createElement("style");
      css.textContent = `
/* 右下の💬・？ボタンが、ページのいちばん下の内容(コピーボタンなど)に重ならないように、下に余白をつくる */
body.has-pbchat .wrap::after { content: ""; display: block; height: 44px; }
.pb-chat { position: fixed; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); z-index: 36; display: grid; justify-items: end; gap: 6px; font-family: var(--body, system-ui, sans-serif); color: var(--fg, #181b23); }
.pb-chat .pb-cbtn { position: relative; width: 46px; height: 46px; border-radius: 50%; border: 2px solid var(--fg, #181b23); background: var(--surface, #fff); font-size: 20px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.18); }
.pb-chat .pb-badge { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; background: #e5484d; color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.pb-chat .pb-cpanel { width: min(340px, calc(100vw - 16px)); max-height: min(60vh, 420px); display: grid; grid-template-rows: auto 1fr auto; border-radius: 12px; border: 2px solid var(--fg, #181b23); background: var(--surface, #fff); box-shadow: 0 4px 16px rgba(0,0,0,.25); overflow: hidden; }
.pb-chat .pb-chead { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; font-weight: 700; font-size: 13px; border-bottom: 1px solid var(--line, #cfd4de); }
.pb-chat .pb-chead button { border: none; background: none; font-size: 18px; cursor: pointer; color: inherit; }
.pb-chat .pb-clog { overflow: auto; padding: 8px 10px; display: grid; gap: 4px; align-content: start; font-size: 14px; min-height: 120px; }
.pb-chat .pb-cm { justify-self: start; max-width: 85%; padding: 4px 9px; border-radius: 10px; background: var(--bg, #e9ecf2); overflow-wrap: anywhere; }
.pb-chat .pb-cm.me { justify-self: end; background: var(--accent, #3446c4); color: #fff; }
.pb-chat .pb-cm small { display: block; font-size: 11px; opacity: .75; }
.pb-chat form { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--line, #cfd4de); }
.pb-chat input { flex: 1; min-width: 0; font-family: inherit; font-size: 16px; padding: 6px 8px; border: 1.5px solid var(--line, #cfd4de); border-radius: 6px; background: var(--surface, #fff); color: var(--fg, #181b23); }
.pb-chat form button { font-family: inherit; font-weight: 700; font-size: 14px; padding: 6px 12px; border-radius: 6px; border: 1.5px solid var(--fg, #181b23); background: var(--fg, #181b23); color: var(--surface, #fff); cursor: pointer; }
.pb-chat form button:hover, .pb-chat form button:active { background: var(--accent, #3446c4) !important; border-color: var(--accent, #3446c4); color: #fff; }
.pb-peek { position: fixed; right: 62px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 36; max-width: min(260px, calc(100vw - 80px)); padding: 6px 10px; border-radius: 10px; background: var(--fg, #181b23); color: var(--surface, #fff); font-size: 13px; font-family: var(--body, system-ui, sans-serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }`;
      document.head.append(css);
    }
    if (!ckey) { if (cbox) { cbox.remove(); cbox = null; document.body.classList.remove("has-pbchat"); } return; }
    if (!cbox) {
      cbox = document.createElement("div"); cbox.className = "pb-chat"; document.body.append(cbox); document.body.classList.add("has-pbchat");
      cbox.addEventListener("click", (e) => {
        const a = e.target.closest("[data-c]")?.dataset.c;
        if (a === "toggle") { copen = !copen; cunread = 0; if (cpeek) cpeek.hidden = true; drawChat(); if (copen) cbox.querySelector("input")?.focus(); }
        else if (a === "close") { copen = false; drawChat(); }
      });
      cbox.addEventListener("submit", (e) => {
        e.preventDefault();
        const inp = cbox.querySelector("input"), text = inp.value.trim();
        if (!text || !cws || cws.readyState !== 1) return;
        cws.send(JSON.stringify({ t: "say", text, name: chatName() })); inp.value = ""; inp.focus();
      });
    }
    const draft = cbox.querySelector("input")?.value || "", hadFocus = document.activeElement && cbox.contains(document.activeElement);
    let html = "";
    if (copen) {
      html += `<div class="pb-cpanel" role="dialog" aria-label="チャット"><div class="pb-chead"><span>💬 チャット(この部屋の人だけ)</span><button type="button" data-c="close" aria-label="閉じる">×</button></div><div class="pb-clog">${clog.length ? clog.map((m) => `<div class="pb-cm${m.pid === ident.pid ? " me" : ""}"><small>${esc(m.name)}</small>${esc(m.text)}</div>`).join("") : '<div class="pb-muted" style="color:var(--muted,#596070);font-size:13px">まだメッセージはありません</div>'}</div><form><input type="text" maxlength="80" placeholder="メッセージ(80文字まで)" aria-label="メッセージ" enterkeyhint="send"><button type="submit">送る</button></form></div>`;
    }
    html += `<button type="button" class="pb-cbtn" data-c="toggle" aria-label="チャット" aria-expanded="${copen}">💬${cunread ? `<span class="pb-badge">${cunread}</span>` : ""}</button>`;
    cbox.innerHTML = html;
    if (copen) { const inp = cbox.querySelector("input"); inp.value = draft; if (hadFocus) inp.focus(); const lg = cbox.querySelector(".pb-clog"); lg.scrollTop = lg.scrollHeight; }
  }
  setInterval(() => { const k = chatKey(); if (k !== ckey) chatConnect(k); }, 1500);

  // ---- 遊び方ガイド: 待機画面の「遊び方」を覚えておき、はじめての人には手順で案内・いつでも「？」で開ける ----
  const GKEY = "tier:guide:" + page, GSEEN = "tier:guide:seen:" + page;
  let gbtn = null, gopen = null;
  function guideSteps() { const g = store.get(GKEY); return Array.isArray(g) && g.length ? g : null; }
  function guideTick() {
    if (HUB || HOME || page === "party") return; // 大会は試合ごとに遊び方が出る
    let s = null;
    // eslint-disable-next-line no-undef
    try { s = typeof S !== "undefined" ? S : null; } catch {}
    const ol = document.querySelector("ol.rules");
    if (ol && s && s.phase === "lobby") {
      const items = [...ol.children].map((li) => li.textContent.trim()).filter(Boolean);
      if (items.length && JSON.stringify(items) !== JSON.stringify(guideSteps())) store.set(GKEY, items);
      // 部屋に入って待っているときに、はじめての人へ1回だけ
      if (items.length && s.code && !store.get(GSEEN) && !gopen) { store.set(GSEEN, 1); openGuide(0); }
    }
    const steps = guideSteps();
    if (steps && s && s.code && !gbtn) {
      gbtn = document.createElement("button"); gbtn.type = "button"; gbtn.className = "pb-help"; gbtn.textContent = "？"; gbtn.setAttribute("aria-label", "遊び方");
      gbtn.addEventListener("click", () => openGuide(0)); document.body.append(gbtn);
    } else if (gbtn && !(steps && s && s.code)) { gbtn.remove(); gbtn = null; }
  }
  function openGuide(i) {
    const steps = guideSteps(); if (!steps) return;
    if (!gopen) {
      gopen = document.createElement("div"); gopen.className = "pb-sheet"; gopen.setAttribute("role", "dialog"); gopen.setAttribute("aria-modal", "true"); gopen.setAttribute("aria-label", "遊び方");
      gopen.addEventListener("click", (e) => {
        const a = e.target.closest("[data-g]")?.dataset.g;
        if (e.target === gopen || a === "close") { gopen.remove(); gopen = null; return; }
        if (a === "prev") openGuide(+gopen.dataset.i - 1);
        if (a === "next") openGuide(+gopen.dataset.i + 1);
      });
      document.body.append(gopen); addShare(true);
    }
    i = Math.max(0, Math.min(steps.length - 1, i)); gopen.dataset.i = i;
    const title = (document.title.split(/[（(｜]/)[0] || "").trim();
    gopen.innerHTML = `<div class="pb-sheet-box"><span class="pb-sheet-url">${esc(title)}の遊び方 ${i + 1} / ${steps.length}</span>${i === 0 && /^[a-z]{2,12}$/.test(page) ? `<img class="pb-guide-img" src="/guide/${page}.jpg" alt="${esc(title)}の遊んでいる画面" onerror="this.remove()">` : ""}<div class="pb-guide-step"><span class="pb-guide-no">${i + 1}</span><p>${esc(steps[i])}</p></div><div class="pb-guide-dots">${steps.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div><div class="pb-guide-nav"><button type="button" data-g="prev" style="--c:#596070" ${i === 0 ? "disabled" : ""}>← 前へ</button>${i < steps.length - 1 ? '<button type="button" data-g="next" style="--c:#3446c4">次へ →</button>' : '<button type="button" data-g="close" style="--c:#1f8a4c">わかった！</button>'}</div><button type="button" data-g="close" class="pb-sheet-close">閉じる(右下の「？」でいつでも見られます)</button></div>`;
    gopen.querySelector("[data-g=next],[data-g=close]")?.focus();
  }
  // ---- 観戦中のお知らせ: ゲームの途中で入った人(このゲームの参加者でない人)に、いまの立場と次にどうなるかを出す ----
  let wbar = null;
  function watchTick() {
    let s = null;
    // eslint-disable-next-line no-undef
    try { s = typeof S !== "undefined" ? S : null; } catch {}
    const meP = s && Array.isArray(s.players) ? s.players.find((x) => x.id === ident.pid) : null;
    const playing = s && s.phase && !["lobby", "finished", "final"].includes(s.phase);
    const watching = !!(playing && meP && meP.inGame === false);
    if (watching && !wbar) {
      wbar = document.createElement("div"); wbar.className = "pb-watch"; wbar.setAttribute("role", "status");
      const n = s.players.filter((x) => x.inGame).length;
      wbar.innerHTML = `👀 <b>観戦中</b>: いまのゲームは ${n}人で遊んでいます。終わって待機画面に戻ったら、次のゲームから参加できます(そのまま待っていればOK)。`;
      document.body.append(wbar);
      if (!document.getElementById("pb-watch-css")) { const css = document.createElement("style"); css.id = "pb-watch-css"; css.textContent = ".pb-watch { position: fixed; left: 50%; transform: translateX(-50%); top: calc(8px + env(safe-area-inset-top, 0px)); z-index: 34; width: min(560px, calc(100vw - 16px)); padding: 8px 12px; border-radius: 10px; background: #fff3c4; color: #181b23; border: 2px solid #d69e00; font-size: 13px; line-height: 1.5; font-family: var(--body, system-ui, sans-serif); box-shadow: 0 2px 8px rgba(0,0,0,.15); } body.has-pbwatch { padding-top: 76px !important; }"; document.head.append(css); }
      document.body.classList.add("has-pbwatch");
    } else if (!watching && wbar) { wbar.remove(); wbar = null; document.body.classList.remove("has-pbwatch"); }
  }
  // 最近遊んだ部屋を覚える(トップページの「続きから」用)
  function recentTick() {
    if (!/^[a-z]{2,12}$/.test(page) || HUB) return;
    let s = null;
    // eslint-disable-next-line no-undef
    try { s = typeof S !== "undefined" ? S : null; } catch {}
    if (!s || !s.code) return;
    const list = (store.get("tier:recent") || []).filter((x) => x && !(x.page === page && x.code === s.code));
    list.unshift({ page, code: s.code, title: gameTitle(), at: Date.now() });
    store.set("tier:recent", list.slice(0, 5));
  }
  // 3Dのゲームの画質ボタン(標準⇄軽量)。押すと設定を覚えて読み込み直す
  // 遊んでいる途中は出さない(スマホで操作ボタンに重なり、押し間違えると読み込み直してしまうため)。待機画面・結果画面だけ
  function gfxButton() {
    if (!window.PB_3D || !window.TG) return;
    let b = document.getElementById("pb-gfx");
    if (!b) {
      b = document.createElement("button");
      b.id = "pb-gfx"; b.type = "button";
      const lite = TG.lite();
      b.textContent = lite ? "画質: 軽量" : "画質: 標準";
      b.title = lite ? "押すと標準の画質にします(読み込み直します)" : "動きが重いときは押して軽量にします(読み込み直します)";
      b.style.cssText = "position:fixed;right:12px;bottom:calc(108px + env(safe-area-inset-bottom,0px));z-index:36;padding:4px 10px;border-radius:999px;border:2px solid var(--fg,#181b23);background:var(--surface,#fff);color:var(--fg,#181b23);font:700 12px var(--body,system-ui,sans-serif);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18)";
      b.addEventListener("click", () => {
        const to = TG.lite() ? "標準" : "軽量";
        if (!confirm(`画質を「${to}」にして、ページを読み込み直します。よろしいですか？`)) return;
        store.set("tier:lite", !TG.lite()); location.reload();
      });
      document.body.append(b);
    }
    b.hidden = busy();
  }
  setInterval(() => { addShare(); wake(); guideTick(); watchTick(); recentTick(); gfxButton(); }, 1500);
  // 招待欄が画面に出たらすぐ「共有」ボタンを付ける(1.5秒ごとの確認を待たない)
  let shareQ = false;
  if (document.body) new MutationObserver(() => { if (shareQ) return; shareQ = true; requestAnimationFrame(() => { shareQ = false; addShare(); }); })
    .observe(document.body, { childList: true, subtree: true });
  // ホーム画面に追加(PWA)のためのサービスワーカー(キャッシュはしない)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("/sw.js").catch(() => {});
  document.addEventListener("visibilitychange", () => wake());

  const api = {
    get state() { return st; }, get me() { return me; }, get info() { return info; }, get error() { return lastErr; }, isHost,
    onChange(f) { subs.push(f); },
    // パーティーに入る/作る(コード4文字)
    start(code, name, create) {
      info = { code: String(code).toUpperCase(), name, create: !!create }; store.set(KEY, info); lastErr = ""; st = null;
      if (ws) { try { ws.close(); } catch {} ws = null; }
      connect(); notify();
    },
    pick(game) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "pick", game })); },
    giveHost(to) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "host", to })); },
    setMode(mode) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "mode", mode })); },
    vote(game) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "vote", game })); },
    decide() { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "decide" })); },
    backAll() { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "lobby" })); },
    kick(id) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "kick", id })); },
    want(game) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "want", game })); },
    rename(name) {
      name = String(name || "").trim().slice(0, 12); if (!name || !info) return;
      info.name = name; store.set(KEY, info); const t = store.get("tier:last") || { room: "" }; store.set("tier:last", { ...t, name });
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "rename", name }));
    },
    leave() {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "leave" }));
      const w = ws; ws = null; info = null; st = null; pending = null; store.del(KEY);
      try { w && w.close(); } catch {}
      notify();
    },
  };
  window.Party = api;
  if (info) connect();
  if (!HUB) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { drawBar(); setTimeout(autoJoin, 300); }); else { drawBar(); setTimeout(autoJoin, 300); } }
})();
