// 全ゲームの画面で共通の部品(各ページの最初のスクリプトより先に読み込む)。
// 以前は17ページそれぞれに同じコードが書かれていた。ここを直せば全ページに効く。
// 使うページは「const { h, store, ... } = TG;」で取り出す。中身がページごとに違うものは、そのページに残してある。
// S(部屋の状態)・ws・me・offset・colorOf などは各ページで決まるもので、呼ばれたときにそのページの値を使う。
window.TG = (() => {
  const $ = (id) => document.getElementById(id);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  function rnd(n, chars = "abcdefghijklmnopqrstuvwxyz0123456789") { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => chars[x % chars.length]).join(""); }
  const Sound = {
    ctx: null, on: store.get("tier:sound") !== false,
    setOn(v) { this.on = v; store.set("tier:sound", v); if (v) { this.unlock(); this.play("tap"); } },
    unlock() { try { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === "suspended") this.ctx.resume(); } catch {} },
    seq: { tap: [[880, 0, .06]], join: [[660, 0, .08], [880, .08, .12]], turn: [[784, 0, .1], [988, .1, .1], [1318, .2, .18]], done: [[1046, 0, .07]],
      reveal: [[392, 0, .14], [523, .14, .14], [659, .28, .14], [1046, .42, .4]], tick: [[1000, 0, .05]] },
    play(name) {
      if (!this.on || !this.ctx || this.ctx.state !== "running") return;
      const t0 = this.ctx.currentTime, soft = name === "tick" || name === "done";
      for (const [f, s, d] of this.seq[name] || []) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = soft ? "square" : "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + s); g.gain.exponentialRampToValueAtTime(soft ? 0.05 : 0.14, t0 + s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
        o.connect(g).connect(this.ctx.destination); o.start(t0 + s); o.stop(t0 + s + d + 0.02);
      }
    },
  };
  function twoStep(label, action, cls = "ghost danger") {
    let armed = false, t;
    const b = h("button", { class: cls, type: "button" }, label);
    b.onclick = () => { if (!armed) { armed = true; b.textContent = "もう一度押すと実行"; t = setTimeout(() => { armed = false; b.textContent = label; }, 3000); return; } clearTimeout(t); action(); };
    return b;
  }
  function saveName(name) { const t = store.get("tier:last") || { room: "" }; store.set("tier:last", { ...t, name }); }
  const COLORS = ["#e8574f", "#f0a03c", "#e6d14a", "#5cc46a", "#4d9de0", "#a46ee0", "#ee7fc0", "#5fd0c8"];
  const player = (id) => S?.players.find((p) => p.id === id);
  const nameOf = (id) => player(id)?.name || "退出した人";
  const isGM = () => S.gameHostId === me;
  const remaining = () => S?.deadline ? Math.max(0, Math.ceil((S.deadline - (Date.now() + offset)) / 1000)) : null;
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  const chip = (id) => h("span", { class: "chip", style: `background:${colorOf(id)}` }, nameOf(id) + (id === me ? "(あなた)" : ""));
  // 3Dの画質: 「軽量」は解像度を下げ、なめらか処理(アンチエイリアス)と影を切る。古いスマホ向け。
  // 設定(tier:lite)が無ければ、メモリが少ない・コアが少ないスマホなら軽量にする
  const lite = () => {
    const v = store.get("tier:lite");
    if (typeof v === "boolean") return v;
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return !!((navigator.deviceMemory && navigator.deviceMemory <= 2) || (mobile && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
  };
  const gfx = () => { const l = lite(); return { lite: l, antialias: !l, pixelRatio: Math.min(window.devicePixelRatio || 1, l ? 1 : 1.75), shadows: !l }; };
  return { lite, gfx, $, h, store, rnd, Sound, twoStep, saveName, COLORS, player, nameOf, isGM, remaining, send, chip };
})();
