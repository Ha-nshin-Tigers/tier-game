// パーティー(みんなで移動)の共通スクリプト。各ゲームの画面・ホーム・パーティーの画面で読み込む。
// パーティーに入っていれば /lobby/ws につながり、ホストが次のゲームを選ぶと全員の画面がその部屋へ自動で移動する。
// 遊んでいる途中の人は、そのゲームが終わって待機画面に戻ったときに移動する(「今すぐ移動」も押せる)。
// パーティーの画面(/lobby)からは window.Party を使う。
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
      else if (m.t === "error") {
        lastErr = m.msg;
        // 入れなかった(コード違い・満員など)ときは、パーティーの情報を消す
        if (!st) { const w = ws; ws = null; info = null; store.del(KEY); try { w.close(); } catch {} }
        notify();
      }
    };
    ws.onclose = () => { const was = ws; ws = null; if (!info || !was) return; setTimeout(connect, Math.min(8000, 800 * 2 ** retry++)); };
  }
  // 遊んでいる途中か(ゲームの画面の状態 S を見る。待機中・結果画面なら途中ではない)
  function busy() {
    try {
      // eslint-disable-next-line no-undef
      const s = typeof S !== "undefined" ? S : null;
      return !!(s && s.phase && !["lobby", "finished", "final"].includes(s.phase));
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
  function autoJoin(tries = 0) {
    if (!info || params.get("party") !== "1") return;
    const login = document.getElementById("login"), btn = document.getElementById("lJoin"), nm = document.getElementById("lName"), rm = document.getElementById("lRoom");
    if (!login || !btn || !nm || !rm) return;
    if (login.hidden) return; // もう入っている
    if (btn.disabled) { if (tries < 20) setTimeout(() => autoJoin(tries + 1), 300); return; } // 前回の部屋に戻っている途中
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
.partybar a { color: var(--accent, #3446c4); font-weight: 700; }
body.has-partybar { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)) !important; }`;
      document.head.append(css);
      bar = document.createElement("div"); bar.className = "partybar"; document.body.append(bar); document.body.classList.add("has-partybar");
      bar.addEventListener("click", onBarClick);
    }
    const n = st ? st.members.length : 0, gname = (k) => (st && st.games.find((x) => x.key === k) || {}).name || k;
    let html = "";
    if (pending) html += `<div class="pb-note">次は「${esc(pending.name)}」(このゲームが終わったら移動します) <button class="pb-b" data-act="gonow">今すぐ移動</button></div>`;
    if (open) {
      html += `<div class="pb-panel"><b>🎉 パーティー ${esc(info.code)}</b>`;
      if (lastErr) html += `<div class="pb-muted" style="color:#c4323a">${esc(lastErr)}</div>`;
      if (st) {
        html += `<ul>${st.members.map((p) => `<li><span>${esc(p.name)}${p.id === st.host ? " 👑" : ""}${p.id === me ? "(あなた)" : ""}</span><span class="pb-muted">${p.connected ? (p.where ? esc(gname(p.where)) : "パーティーの画面") : "移動中/切断"}</span></li>`).join("")}</ul>`;
        if (isHost()) html += `<div class="pb-muted">ホストのあなたが次のゲームを選ぶと、みんなの画面がいっしょに移動します:</div><div class="pb-games">${st.games.map((x) => `<button class="pb-b${x.key === page ? " cur" : ""}" data-game="${x.key}">${esc(x.name)}<span class="pb-muted"> ${x.min}〜${x.max}人</span></button>`).join("")}</div><button class="pb-b" data-act="lobbyall">みんなでパーティーの画面へ戻る</button>`;
        else html += `<div class="pb-muted">次のゲームはホスト(👑)が選びます。選ばれると自動で移動します。</div>`;
      }
      html += `<div style="display:flex;gap:10px;flex-wrap:wrap"><a href="/lobby" data-act="hub">パーティーの画面</a><a href="#" data-act="leave">パーティーを抜ける</a></div></div>`;
    }
    html += `<button class="pb-pill" data-act="toggle" aria-expanded="${open}">🎉 パーティー ${esc(info.code)}・${n}人${st && st.game && st.game.key && st.game.key !== page ? `・次:${esc(st.game.name)}` : ""}</button>`;
    bar.innerHTML = html;
  }
  let leaveArmed = 0;
  function onBarClick(e) {
    const t = e.target.closest("[data-act],[data-game]");
    if (!t) return;
    const a = t.dataset.act;
    if (t.dataset.game) { e.preventDefault(); api.pick(t.dataset.game); return; }
    if (a === "toggle") { open = !open; drawBar(); }
    else if (a === "gonow" && pending) go(pending);
    else if (a === "lobbyall") api.backAll();
    else if (a === "hub") { if (st && st.game) markSeen(st.game.seq); }
    else if (a === "leave") {
      e.preventDefault();
      if (Date.now() - leaveArmed > 3000) { leaveArmed = Date.now(); t.textContent = "もう一度押すと抜けます"; return; }
      api.leave();
    }
  }

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
    backAll() { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "lobby" })); },
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
