"use strict";
// お絵かきの共通部品(絵しりとり・ドタバタ大会で使う)
// 線は座標 0〜1000 の正方形で表す: { c: 色, w: 太さ, p: [x1, y1, x2, y2, ...] }
// Draw.pad(...)  … 描く人の画用紙と道具(色・太さ・消しゴム・ひとつ戻す・全部消す)
// Draw.view(did) … 絵を表示するキャンバス。サーバから届いた線(pic / stroke / undo / clear)で自動で描き直す
window.Draw = (() => {
  const COLORS = ["#181b23", "#e8574f", "#f0a03c", "#e6d14a", "#5cc46a", "#4d9de0", "#a46ee0", "#8a5a3c", "#f2a6c8"];
  const WIDTHS = [[3, "細"], [8, "中"], [18, "太"], [40, "極太"]];
  const ERASER = "#ffffff", MAX_PTS = 800;

  // 線を描く(白い背景から全部)
  function paint(canvas, strokes) {
    const g = canvas.getContext("2d"), s = canvas.width / 1000;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, canvas.width, canvas.height);
    for (const st of strokes || []) line(g, st, s);
  }
  function line(g, st, s) {
    const p = st.p;
    g.strokeStyle = st.c; g.fillStyle = st.c; g.lineWidth = st.w * s; g.lineCap = "round"; g.lineJoin = "round";
    if (p.length <= 4 && p[0] === p[2] && p[1] === p[3]) { g.beginPath(); g.arc(p[0] * s, p[1] * s, st.w * s / 2, 0, Math.PI * 2); g.fill(); return; }
    g.beginPath(); g.moveTo(p[0] * s, p[1] * s);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * s, p[i + 1] * s);
    g.stroke();
  }
  // キャンバスの解像度を表示サイズに合わせる(はっきり見えるように)
  function fit(canvas, strokes) {
    const w = Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
    if (w && canvas.width !== w) { canvas.width = w; canvas.height = w; }
    paint(canvas, strokes);
  }

  // ---- 表示用(サーバから届いた絵) ----
  const cache = new Map();   // did → 線の配列
  const views = new Map();   // did → Set(キャンバス)
  let requester = null;      // 足りない絵をサーバに頼む関数
  function setRequester(fn) { requester = fn; }
  function view(did, cls = "") {
    const cv = document.createElement("canvas");
    cv.className = "drawview " + cls; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "絵");
    if (!views.has(did)) views.set(did, new Set());
    views.get(did).add(cv);
    requestAnimationFrame(() => fit(cv, cache.get(did) || []));
    if (!cache.has(did) && requester) requester(did);
    return cv;
  }
  function repaint(did) {
    const set = views.get(did); if (!set) return;
    for (const cv of [...set]) { if (!cv.isConnected) { set.delete(cv); continue; } fit(cv, cache.get(did) || []); }
  }
  // サーバからのメッセージ(pic / stroke / undo / clear)を受け取る。扱ったら true
  function onMessage(m) {
    if (m.t === "pic") { cache.set(m.did, m.strokes || []); repaint(m.did); return true; }
    if (m.t === "stroke") { const a = cache.get(m.did) || []; a.push(m.s); cache.set(m.did, a); repaint(m.did); return true; }
    if (m.t === "undo") { const a = cache.get(m.did) || []; a.pop(); repaint(m.did); return true; }
    if (m.t === "clear") { cache.set(m.did, []); repaint(m.did); return true; }
    return false;
  }
  window.addEventListener("resize", () => { for (const did of views.keys()) repaint(did); });

  // ---- 描く人の画用紙 ----
  // on: { stroke(s), undo(), clear() } … 線を1本描き終えるたびにサーバへ送る
  function pad(on) {
    let color = COLORS[0], width = 8, strokes = [], cur = null, enabled = true;
    const cv = document.createElement("canvas");
    cv.className = "drawpad"; cv.setAttribute("aria-label", "画用紙(指やマウスで描く)");
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1000, Math.round((e.clientX - r.left) / r.width * 1000))), Math.max(0, Math.min(1000, Math.round((e.clientY - r.top) / r.height * 1000)))]; };
    cv.addEventListener("pointerdown", (e) => {
      if (!enabled) return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const [x, y] = pos(e); cur = { c: color, w: width, p: [x, y] };
    });
    cv.addEventListener("pointermove", (e) => {
      if (!cur) return;
      const [x, y] = pos(e), p = cur.p, n = p.length;
      if (Math.abs(x - p[n - 2]) + Math.abs(y - p[n - 1]) < 4) return; // 細かすぎる点は間引く
      p.push(x, y);
      const g = cv.getContext("2d"), s = cv.width / 1000;
      line(g, { c: cur.c, w: cur.w, p: p.slice(-4) }, s);
      if (p.length >= MAX_PTS * 2) { finish(); cur = { c: color, w: width, p: [x, y] }; } // 長い線は分けて送る
    });
    const finish = () => {
      if (!cur) return;
      if (cur.p.length === 2) cur.p.push(cur.p[0], cur.p[1]); // 点を打っただけ
      strokes.push(cur); on.stroke(cur); cur = null; fit(cv, strokes);
    };
    cv.addEventListener("pointerup", finish);
    cv.addEventListener("pointercancel", finish);

    const tools = document.createElement("div");
    tools.className = "drawtools";
    const sw = COLORS.map((c) => { const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.style.background = c; b.setAttribute("aria-label", "色"); b.onclick = () => { color = c; mark(); }; return b; });
    const er = document.createElement("button"); er.type = "button"; er.className = "tool"; er.textContent = "消しゴム"; er.onclick = () => { color = ERASER; mark(); };
    const ws = WIDTHS.map(([w, t]) => { const b = document.createElement("button"); b.type = "button"; b.className = "tool"; b.textContent = t; b.onclick = () => { width = w; mark(); }; b.dataset.w = w; return b; });
    const undo = document.createElement("button"); undo.type = "button"; undo.className = "tool"; undo.textContent = "↶ 戻す";
    undo.onclick = () => { if (!enabled || !strokes.length) return; strokes.pop(); fit(cv, strokes); on.undo(); };
    let armed = 0;
    const clr = document.createElement("button"); clr.type = "button"; clr.className = "tool danger"; clr.textContent = "全部消す";
    clr.onclick = () => {
      if (!enabled) return;
      if (Date.now() - armed > 2500) { armed = Date.now(); clr.textContent = "もう一度で消す"; setTimeout(() => (clr.textContent = "全部消す"), 2500); return; }
      armed = 0; clr.textContent = "全部消す"; strokes = []; fit(cv, strokes); on.clear();
    };
    function mark() {
      sw.forEach((b, i) => b.classList.toggle("on", COLORS[i] === color));
      er.classList.toggle("on", color === ERASER);
      ws.forEach((b) => b.classList.toggle("on", +b.dataset.w === width));
    }
    const row1 = document.createElement("div"); row1.className = "row"; row1.append(...sw, er);
    const row2 = document.createElement("div"); row2.className = "row"; row2.append(...ws, undo, clr);
    tools.append(row1, row2);
    mark();
    const el = document.createElement("div"); el.className = "drawwrap"; el.append(cv, tools);
    const ro = new ResizeObserver(() => fit(cv, strokes)); ro.observe(cv);
    return {
      el, count: () => strokes.length,
      setEnabled(b) { enabled = b; el.classList.toggle("off", !b); },
    };
  }
  return { pad, view, onMessage, setRequester, paint, cache };
})();
