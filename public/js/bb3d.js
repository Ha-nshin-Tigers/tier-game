// ボムバナナの3D表示(three.js)。ミニバンの車内・3匹のサル・爆弾とモジュールを描き、見ざるの「触る」「押す」を受け取る。
// 見ざるの画面は、色・画面・ランプが見えない「黒地に白い輪郭」だけで描く。言わざるの画面では爆弾の中身は描かない。
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const COL = { red: 0xe5484d, blue: 0x3a7bd5, green: 0x2fa35a, yellow: 0xf2c94c };
const BRAILLE = { 1: [1], 2: [1, 2], 3: [1, 4], 4: [1, 4, 5], 5: [1, 5], 6: [1, 2, 4], 7: [1, 2, 4, 5], 8: [1, 2, 5], 9: [2, 4], 0: [2, 4, 5] };
// 席: 見ざる=爆弾の正面、聞かざる=左、言わざる=右(マニュアルを持って爆弾に背を向ける)
const SEATS = { blind: { x: 0, z: 1.55, ry: Math.PI }, deaf: { x: -1.6, z: 0.15, ry: -Math.PI / 2 }, mute: { x: 1.75, z: 0.3, ry: Math.PI / 2 } };
const CAM = { blind: [0, 2.6, 2.3], deaf: [-2.3, 2.5, 0.6], mute: [2.55, 1.9, 0.45], watch: [0, 3.4, 3.2] };

export function drawSymbol(ctx, name, x, y, s, color = "#181b23") {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = s * 0.09;
  const star = () => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.2 : s * 0.45, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); };
  const tri = () => { ctx.beginPath(); ctx.moveTo(0, -s * 0.42); ctx.lineTo(s * 0.42, s * 0.36); ctx.lineTo(-s * 0.42, s * 0.36); ctx.closePath(); };
  if (name === "star") { star(); ctx.fill(); } else if (name === "star_o") { star(); ctx.stroke(); }
  else if (name === "tri") { tri(); ctx.fill(); } else if (name === "tri_o") { tri(); ctx.stroke(); }
  else if (name === "hourglass") { ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.4); ctx.lineTo(s * 0.3, -s * 0.4); ctx.lineTo(-s * 0.3, s * 0.4); ctx.lineTo(s * 0.3, s * 0.4); ctx.closePath(); ctx.fill(); }
  else if (name === "moon") { ctx.beginPath(); ctx.arc(0, 0, s * 0.4, Math.PI * 0.3, Math.PI * 1.7); ctx.arc(s * 0.15, 0, s * 0.3, Math.PI * 1.6, Math.PI * 0.4, true); ctx.closePath(); ctx.fill(); }
  else if (name === "wave") { ctx.beginPath(); for (let i = -4; i <= 4; i++) ctx.lineTo(i * s * 0.1, Math.sin(i * 1.2) * s * 0.15); ctx.stroke(); ctx.beginPath(); for (let i = -4; i <= 4; i++) ctx.lineTo(i * s * 0.1, s * 0.22 + Math.sin(i * 1.2) * s * 0.15); ctx.stroke(); }
  else if (name === "eye") { ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.24, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.11, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function createScene(canvas, hooks) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.95, 0); controls.enableDamping = true; controls.minDistance = 0.35; controls.maxDistance = 4.5; controls.maxPolarAngle = Math.PI * 0.49; controls.enablePan = false;
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404050, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(2, 5, 3); scene.add(sun);
  const lamp = new THREE.PointLight(0xffe2a8, 6, 6); lamp.position.set(0, 2.4, 0); scene.add(lamp);

  const st = { role: "watch", blindView: false, mods: [], modKeys: [], modGroups: [], monkeys: {}, hands: {}, pointLines: {}, picks: [], hover: null, dark: false, t0: performance.now(), bomb: null, env: {}, live: [] };
  const world = new THREE.Group(); scene.add(world);
  const bombG = new THREE.Group(); world.add(bombG);
  const fxG = new THREE.Group(); scene.add(fxG);

  // ---- 部品づくり ----
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0.05, ...o });
  const box = (w, h, d, c, o) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o));
  const cyl = (r, h, c, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(c));
  const sph = (r, c, o) => new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat(c, o));
  function textTex(lines, w = 256, h = 128, opt = {}) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d");
    x.fillStyle = opt.bg || "#0d1a10"; x.fillRect(0, 0, w, h); x.fillStyle = opt.fg || "#7dff9b"; x.textAlign = "center"; x.textBaseline = "middle";
    const ls = Array.isArray(lines) ? lines : [lines]; ls.forEach((l, i) => { x.font = `bold ${opt.size || Math.floor(h / (ls.length + 0.6))}px monospace`; x.fillText(l, w / 2, h * (i + 1) / (ls.length + 1)); });
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function screen(w, d, lines, opt) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: textTex(lines, 256, Math.round(256 * d / w), opt) })); m.rotation.x = -Math.PI / 2; m.userData.screen = true; return m; }
  function braille(n, s = 0.022) {
    const g = new THREE.Group(), dots = BRAILLE[n] || [];
    for (const d of dots) { const col = d <= 3 ? 0 : 1, row = (d - 1) % 3; const b = sph(s * 0.35, 0xd8d0b8); b.position.set((col - 0.5) * s, 0.005, (row - 1) * s); b.scale.y = 0.5; g.add(b); }
    return g;
  }
  // 押せる・触れる部品: userData に { mod, part, act } をつける
  const pick = (obj, mod, part, act) => { obj.traverse((o) => { if (o.isMesh) o.userData.pick = { mod, part, act }; }); return obj; };

  // ---- 車内(ミニバン) ----
  const van = new THREE.Group(); world.add(van);
  const floor = box(5.2, 0.05, 4.2, 0x4a4036); floor.position.y = -0.03; van.add(floor);
  const wallMat = 0x8fa3b8;
  const wl = box(0.08, 2.6, 4.2, wallMat); wl.position.set(-2.6, 1.3, 0); van.add(wl);
  const wr = box(0.08, 2.6, 4.2, wallMat); wr.position.set(2.6, 1.3, 0); van.add(wr);
  const wb = box(5.2, 2.6, 0.08, 0x7a8ea4); wb.position.set(0, 1.3, -2.1); van.add(wb);
  const ceil = box(5.2, 0.05, 4.2, 0x6d7d8f); ceil.position.y = 2.62; van.add(ceil);
  for (const z of [-1.1, 0.9]) { const win = box(0.02, 0.7, 1.2, 0x9fd6ff, { emissive: 0x335577, emissiveIntensity: 0.6 }); win.position.set(-2.55, 1.6, z); van.add(win); const w2 = win.clone(); w2.position.x = 2.55; van.add(w2); }
  // 作業台と爆弾ケース
  const table = box(1.7, 0.08, 1.2, 0x8a5a33); table.position.set(0, 0.78, 0); van.add(table);
  for (const [x, z] of [[-0.75, -0.5], [0.75, -0.5], [-0.75, 0.5], [0.75, 0.5]]) { const leg = cyl(0.04, 0.78, 0x5b3b22); leg.position.set(x, 0.39, z); van.add(leg); }
  const caseM = box(1.45, 0.16, 0.95, 0x2f3b2c); caseM.position.set(0, 0.9, 0); van.add(caseM);
  bombG.position.set(0, 0.985, 0);
  // 時間とミスの表示(爆弾の手前)
  const timerMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.12), new THREE.MeshBasicMaterial({ map: textTex("0:00", 256, 85, { fg: "#ff5a4f" }) }));
  timerMesh.position.set(0, 0.92, 0.48); world.add(timerMesh);
  // 環境のもの: ランプ・ラジオ・色のついた小物(指差しで色を伝える用)
  const lampG = new THREE.Group(); const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 18, 1, true), mat(0xf0e0b0, { side: THREE.DoubleSide, emissive: 0xffd27a, emissiveIntensity: 0.8 })); shade.position.y = 2.35; lampG.add(shade);
  const cord = cyl(0.008, 0.2, 0x222222); cord.position.y = 2.5; lampG.add(cord); world.add(lampG); pick(lampG, -1, "lamp", "env");
  const radio = new THREE.Group(); const rb = box(0.42, 0.24, 0.16, 0x6b4b3a); radio.add(rb); const sp = cyl(0.07, 0.02, 0x222222); sp.rotation.x = Math.PI / 2; sp.position.set(-0.08, 0, 0.085); radio.add(sp);
  const ant = cyl(0.006, 0.4, 0xaaaaaa); ant.position.set(0.15, 0.3, 0); ant.rotation.z = -0.4; radio.add(ant); radio.position.set(-1.9, 0.95, -1.7); world.add(radio); pick(radio, -1, "radio", "env");
  const shelf = box(1.2, 0.05, 0.4, 0x6b5136); shelf.position.set(-1.9, 0.8, -1.75); world.add(shelf);
  const props = [["red", -2.2, 0.3, 1.3], ["blue", 2.15, 0.2, -1.4], ["green", -2.25, 0.25, -0.6], ["yellow", 1.0, 0.15, -1.7]];
  for (const [c, x, y, z] of props) {
    let o;
    if (c === "red") { o = new THREE.Group(); const b = cyl(0.12, 0.55, COL.red); b.position.y = 0.28; o.add(b); const n = cyl(0.03, 0.1, 0x222222); n.position.y = 0.6; o.add(n); }
    else if (c === "blue") { o = box(0.5, 0.36, 0.34, COL.blue); o.position.y = 0.18; }
    else if (c === "green") { o = new THREE.Group(); const pot = cyl(0.13, 0.2, 0x8a5a33); pot.position.y = 0.1; o.add(pot); const leaf = sph(0.24, COL.green); leaf.position.y = 0.38; o.add(leaf); }
    else { o = new THREE.Group(); const cr = box(0.55, 0.3, 0.4, 0x9c7a4a); cr.position.y = 0.15; o.add(cr); for (let k = 0; k < 4; k++) { const ba = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16, Math.PI), mat(COL.yellow)); ba.position.set(-0.18 + k * 0.12, 0.33, 0); ba.rotation.set(0, 0, Math.PI); o.add(ba); } }
    const holder = new THREE.Group(); holder.add(o); holder.position.set(x, y > 0.25 ? 0 : 0, z); world.add(holder);
  }

  // ---- サル ----
  function makeMonkey(role, name) {
    const g = new THREE.Group(), fur = 0x7a4e2c, face = 0xe9c39b;
    const body = sph(0.32, fur); body.scale.set(1, 1.15, 0.85); body.position.y = 0.55; g.add(body);
    const belly = sph(0.22, face); belly.scale.set(1, 1.1, 0.5); belly.position.set(0, 0.52, 0.2); g.add(belly);
    const head = new THREE.Group(); head.position.y = 1.08; g.add(head);
    const hd = sph(0.26, fur); head.add(hd);
    const fc = sph(0.2, face); fc.scale.set(1.05, 0.95, 0.6); fc.position.set(0, -0.03, 0.14); head.add(fc);
    for (const s of [-1, 1]) { const ear = sph(0.09, face); ear.position.set(0.26 * s, 0.02, 0); ear.scale.z = 0.5; head.add(ear); const eye = sph(0.035, 0x111111); eye.position.set(0.075 * s, 0.04, 0.24); head.add(eye); }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), mat(0x5a2b1a)); mouth.position.set(0, -0.08, 0.255); mouth.rotation.z = Math.PI; head.add(mouth);
    // 役割の目印: 見ざる=目隠し、聞かざる=耳あて、言わざる=口のテープ
    if (role === "blind") { const band = cyl(0.27, 0.07, 0x2b2b2b, 24); band.position.set(0, 0.04, 0.02); head.add(band); }
    if (role === "deaf") { for (const s of [-1, 1]) { const muff = sph(0.11, 0xd94040); muff.position.set(0.27 * s, 0.02, 0); head.add(muff); } const arc = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 20, Math.PI), mat(0x333333)); arc.position.y = 0.04; head.add(arc); }
    if (role === "mute") { const tape = box(0.16, 0.05, 0.02, 0xe8e2c8); tape.position.set(0, -0.08, 0.265); tape.rotation.z = 0.15; head.add(tape); mouth.visible = false; }
    // 腕(指差し・ビンタで動かす)
    const arms = [];
    for (const s of [-1, 1]) { const sh = new THREE.Group(); sh.position.set(0.3 * s, 0.75, 0); const arm = cyl(0.06, 0.45, fur); arm.position.y = -0.22; sh.add(arm); const hand = sph(0.08, face); hand.position.y = -0.47; sh.add(hand); sh.rotation.z = 0.25 * s; g.add(sh); arms.push(sh); }
    // マニュアル(言わざる)
    if (role === "mute") { const book = box(0.36, 0.03, 0.26, 0xd9c48a); book.position.set(0, 0.72, 0.32); book.rotation.x = -0.6; g.add(book); }
    // 名前と吹き出し
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex([name], 256, 64, { bg: "rgba(0,0,0,0.55)", fg: "#ffffff", size: 30 }), depthTest: false }));
    label.scale.set(0.6, 0.15, 1); label.position.y = 1.5; g.add(label);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex(["…"], 256, 128, { bg: "#ffffff", fg: "#181b23" }), depthTest: false }));
    bubble.scale.set(0.55, 0.28, 1); bubble.position.y = 1.85; bubble.visible = false; g.add(bubble);
    g.userData = { head, arms, bubble, mouth, label, role };
    const s = SEATS[role]; g.position.set(s.x, 0, s.z); g.rotation.y = s.ry;
    world.add(g);
    return g;
  }
  const monkeyLook = (g) => { const s = SEATS[g.userData.role]; g.lookAt(0, 0, 0); if (g.userData.role === "mute") g.rotation.y += Math.PI * 0.85; };

  // ---- モジュール ----
  const PW = 0.42; // モジュール1枚の大きさ
  const gridOf = (n) => { const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4; return [cols, Math.ceil(n / cols)]; };
  function slotPos(i, n) { const [cols, rows] = gridOf(n); const c = i % cols, r = Math.floor(i / cols); return [(c - (cols - 1) / 2) * (PW + 0.04), (r - (rows - 1) / 2) * (PW + 0.04)]; }
  // モジュールが多いときは爆弾ケースに収まるよう縮める
  const fitScale = (n) => { const [cols, rows] = gridOf(n); return Math.min(1, 1.4 / (cols * (PW + 0.04)), 0.9 / (rows * (PW + 0.04))); };
  function panel(color = 0x3b4148) { const p = box(PW, 0.04, PW, color); p.position.y = 0.02; return p; }
  function led(color, x, z) { const l = sph(0.025, color ? COL[color] : 0x333333, color ? { emissive: COL[color], emissiveIntensity: 1.2 } : {}); l.position.set(x, 0.06, z); return l; }
  function btn(color, x, z, w = 0.07, h = 0.03) { const b = cyl(w / 2, h, color != null ? COL[color] ?? color : 0x9aa0a8); b.position.set(x, 0.04 + h / 2, z); return b; }
  function buildModule(mv, i) {
    const g = new THREE.Group(); g.add(pick(panel(), i, "panel", "read"));
    const k = mv.kind;
    if (mv.solved) { const ok = led("green", PW / 2 - 0.04, -PW / 2 + 0.04); g.add(ok); }
    if (k === "hidden") { const cover = box(PW, 0.05, PW, 0x2a2f36); cover.position.y = 0.045; g.add(cover); return g; }
    if (k === "cable") {
      g.add(led(mv.led, -PW / 2 + 0.05, -PW / 2 + 0.05));
      for (let c = 0; c < mv.n; c++) {
        const z = -0.1 + c * (0.24 / Math.max(1, mv.n - 1)), color = mv.colors ? COL[mv.colors[c]] : 0x888888;
        const cg = new THREE.Group();
        if (mv.cut[c]) { for (const s of [-1, 1]) { const piece = cyl(0.014, 0.12, color); piece.rotation.z = Math.PI / 2; piece.position.set(s * 0.1, 0.07, z); cg.add(piece); } }
        else { const w = cyl(0.016, 0.32, color); w.rotation.z = Math.PI / 2; w.position.set(0, 0.07, z); cg.add(w); }
        for (const s of [-1, 1]) { const pin = box(0.03, 0.04, 0.04, 0x777777); pin.position.set(s * 0.17, 0.06, z); cg.add(pin); }
        g.add(pick(cg, i, c, "cut"));
      }
    } else if (k === "slider") {
      for (let s = 0; s < 4; s++) {
        const x = -0.14 + s * 0.093, slot = box(0.02, 0.01, 0.26, 0x111111); slot.position.set(x, 0.045, 0); g.add(slot);
        const knob = box(0.06, 0.05, 0.045, mv.colors ? COL[mv.colors[s]] : 0x888888); knob.position.set(x, 0.07, -(mv.pos[s]) * 0.09); g.add(pick(knob, i, s, "knob"));
        const up = btn(0x666666, x, -0.17, 0.05, 0.02), dn = btn(0x666666, x, 0.17, 0.05, 0.02);
        g.add(pick(up, i, s, "up")); g.add(pick(dn, i, s, "down"));
      }
    } else if (k === "direction") {
      g.add(led(mv.led, -PW / 2 + 0.05, -PW / 2 + 0.05));
      const br = braille(mv.num, 0.03); br.position.set(0, 0.04, 0); br.scale.setScalar(1.4); g.add(pick(br, i, "braille", "read"));
      const pad = box(0.08, 0.02, 0.08, 0x555b63); pad.position.set(0, 0.035, 0); g.add(pick(pad, i, "braille", "read"));
      for (const [d, x, z] of [["up", 0, -0.13], ["right", 0.13, 0], ["down", 0, 0.13], ["left", -0.13, 0]]) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 3), mat(0xb0b6be)); a.rotation.x = Math.PI / 2; a.rotation.z = { up: Math.PI, right: Math.PI / 2, down: 0, left: -Math.PI / 2 }[d]; a.position.set(x, 0.07, z); g.add(pick(a, i, d, "dir")); }
      for (let s = 0; s < mv.stages; s++) g.add(led(s < mv.stage ? "green" : null, 0.12 + s * 0.035, -PW / 2 + 0.05));
    } else if (k === "calc") {
      const scr = screen(0.3, 0.08, [mv.expr ? mv.expr + " " + (mv.typed || "") : " "], { size: 34 }); scr.position.set(0, 0.045, -0.15); g.add(scr);
      if (mv.stage === 1) g.add(led(mv.led || "red", 0.17, -0.15));
      mv.keys.forEach((d, p) => {
        const x = -0.1 + (p % 3) * 0.1, z = -0.06 + Math.floor(p / 3) * 0.075, kb = box(0.08, 0.025, 0.06, 0xd8dade); kb.position.set(x, 0.055, z);
        const kg = new THREE.Group(); kg.add(kb);
        const lab = screen(0.05, 0.04, [String(d)], { bg: "#d8dade", fg: "#181b23", size: 90 }); lab.position.set(x - 0.012, 0.069, z); kg.add(lab);
        const br = braille(d, 0.012); br.position.set(x + 0.025, 0.068, z); kg.add(br);
        g.add(pick(kg, i, p, "key"));
      });
      const eq = box(0.08, 0.025, 0.06, 0xf0a03c); eq.position.set(0.1, 0.055, 0.165); g.add(pick(eq, i, 10, "key"));
    } else if (k === "symbol") {
      const wheel = cyl(0.12, 0.03, 0xc9ced6, 32); wheel.position.set(-0.05, 0.06, -0.03); const wg = new THREE.Group(); wg.add(wheel);
      if (mv.syms) mv.syms.forEach((s, p) => { const a = p * Math.PI / 2 - Math.PI / 2; const cv = document.createElement("canvas"); cv.width = cv.height = 64; const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, 64, 64); drawSymbol(cx, s, 32, 32, 56); const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) })); pl.rotation.x = -Math.PI / 2; pl.userData.screen = true; pl.position.set(-0.05 + Math.cos(a) * 0.075, 0.077, -0.03 + Math.sin(a) * 0.075); wg.add(pl); });
      g.add(pick(wg, i, "wheel", "read"));
      const ptrA = mv.ptr * Math.PI / 2 - Math.PI / 2, ptr = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 3), mat(0xe5484d)); ptr.rotation.x = Math.PI / 2; ptr.rotation.z = -ptrA - Math.PI / 2; ptr.position.set(-0.05 + Math.cos(ptrA) * 0.16, 0.08, -0.03 + Math.sin(ptrA) * 0.16); g.add(ptr);
      const l = btn(0x666666, -0.17, 0.16, 0.05), r = btn(0x666666, 0.07, 0.16, 0.05); g.add(pick(l, i, -1, "turn")); g.add(pick(r, i, 1, "turn"));
      for (let p = 0; p < 4; p++) g.add(pick(btn(mv.buttons ? mv.buttons[p] : null, 0.15, -0.14 + p * 0.09, 0.06), i, p, "press"));
      for (let s = 0; s < mv.stages; s++) g.add(led(s < mv.stage ? "green" : null, -0.17 + s * 0.035, -PW / 2 + 0.04));
    } else if (k === "piano") {
      g.add(led(mv.led, PW / 2 - 0.05, -PW / 2 + 0.05));
      const ob = braille(mv.octave, 0.025); ob.position.set(-0.14, 0.04, -0.15); g.add(pick(ob, i, "octave", "read"));
      const plate = box(0.07, 0.01, 0.07, 0x555b63); plate.position.set(-0.14, 0.045, -0.15); g.add(pick(plate, i, "octave", "read"));
      for (let p = 1; p <= 7; p++) { const kg = new THREE.Group(); const key = box(0.045, 0.03, 0.2, 0xf5f5f0); key.position.set(-0.15 + (p - 1) * 0.05, 0.055, 0.06); kg.add(key); const br = braille(p, 0.011); br.position.set(-0.15 + (p - 1) * 0.05, 0.072, 0.13); kg.add(br); g.add(pick(kg, i, p, "key")); }
    } else if (k === "soundboard") {
      for (let p = 0; p < 9; p++) { const x = -0.12 + (p % 3) * 0.12, z = -0.12 + Math.floor(p / 3) * 0.12, bg = new THREE.Group(); const b = box(0.09, 0.03, 0.09, mv.colors ? COL[mv.colors[p]] : 0x888888); b.position.set(x, 0.055, z); bg.add(b); const br = braille(mv.nums[p], 0.014); br.position.set(x, 0.072, z); bg.add(br); g.add(pick(bg, i, p, "press")); }
    } else if (k === "monkey") {
      for (let p = 0; p < 4; p++) { const x = (p % 2 ? 0.08 : -0.08), z = (p < 2 ? -0.08 : 0.08); const b = box(0.13, 0.04, 0.13, mv.buttons ? COL[mv.buttons[p]] : 0x888888); b.position.set(x, 0.06, z); g.add(pick(b, i, p, "press")); }
      for (let s = 0; s < mv.stages; s++) g.add(led(s < mv.stage ? "green" : null, -0.17 + s * 0.035, -PW / 2 + 0.03));
    } else if (k === "morse") {
      for (let p = 0; p < 3; p++) {
        const x = -0.12 + p * 0.12, d = box(0.09, 0.02, 0.07, 0x111111); d.position.set(x, 0.05, -0.12); g.add(pick(d, i, p, "read"));
        const dial = screen(0.07, 0.06, [String(mv.dials[p])], { size: 70 }); dial.position.set(x, 0.045, 0.02); g.add(dial);
        const br = braille(mv.dials[p], 0.012); br.position.set(x + 0.045, 0.05, 0.02); g.add(br);
        g.add(pick(btn(0x777777, x, -0.04, 0.04, 0.02), i, p, "dialUp")); g.add(pick(btn(0x777777, x, 0.08, 0.04, 0.02), i, p, "dialDown"));
      }
      const en = box(0.2, 0.03, 0.05, 0xf0a03c); en.position.set(0, 0.055, 0.16); g.add(pick(en, i, "enter", "enter"));
    } else if (k === "maze") {
      const br = braille(mv.num, 0.022); br.position.set(-0.16, 0.04, -0.16); g.add(pick(br, i, "num", "read"));
      const plate = box(0.06, 0.01, 0.06, 0x555b63); plate.position.set(-0.16, 0.045, -0.16); g.add(pick(plate, i, "num", "read"));
      for (let c = 0; c < 36; c++) { const x = -0.06 + (c % 6) * 0.042, z = -0.14 + Math.floor(c / 6) * 0.042; const cell = box(0.034, 0.01, 0.034, c === mv.at ? COL.red : c === mv.goal ? COL.green : 0x262a30, (c === mv.at || c === mv.goal) ? { emissive: c === mv.at ? COL.red : COL.green, emissiveIntensity: 0.8 } : {}); cell.position.set(x, 0.047, z); g.add(cell); }
      for (const [d, x, z] of [["up", -0.16, 0.06], ["down", -0.16, 0.16], ["left", -0.19, 0.11], ["right", -0.13, 0.11]]) g.add(pick(btn(0xb0b6be, x, z, 0.035, 0.02), i, d, "dir"));
    } else if (k === "switch") {
      for (let p = 0; p < 4; p++) {
        const x = -0.14 + p * 0.093; g.add(led(mv.lights ? mv.lights[p] : null, x, -0.14));
        const base = box(0.05, 0.02, 0.07, 0x222222); base.position.set(x, 0.05, -0.02); g.add(base);
        const lever = cyl(0.012, 0.08, 0xcccccc); lever.position.set(x, 0.09, -0.02); lever.rotation.x = mv.up[p] ? -0.6 : 0.6; g.add(pick(lever, i, p, "toggle")); g.add(pick(base.clone(), i, p, "toggle"));
        const br = braille(mv.nums[p], 0.014); br.position.set(x, 0.045, 0.08); g.add(pick(br, i, p, "read"));
      }
      const en = box(0.2, 0.03, 0.05, 0xf0a03c); en.position.set(0, 0.055, 0.16); g.add(pick(en, i, "enter", "enter"));
    } else if (k === "pressure") {
      const dial = cyl(0.14, 0.02, 0xf2f2ea, 32); dial.position.set(0, 0.05, -0.05); g.add(dial);
      const needle = box(0.006, 0.01, 0.12, 0xe5484d); needle.position.set(0, 0.065, -0.05); needle.geometry.translate(0, 0, -0.06); g.add(needle); g.userData.needle = needle;
      const b = btn("red", 0, 0.14, 0.09, 0.04); g.add(pick(b, i, "press", "pressure"));
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.01, 3), mat(COL.yellow)); tri.position.set(0.16, 0.05, -0.17); g.add(tri);
    } else if (k === "rslider") {
      const track = box(0.04, 0.01, 0.32, 0x111111); track.position.set(0, 0.045, 0); g.add(track);
      const knob = box(0.12, 0.05, 0.05, 0xd9d9d9); knob.position.set(0, 0.07, 0); g.add(pick(knob, i, "pull", "pull")); g.userData.knob = knob;
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.01, 3), mat(COL.yellow)); tri.position.set(0.16, 0.05, -0.17); g.add(tri);
    } else if (k === "alarm") {
      const siren = sph(0.05, mv.active ? 0xff2020 : 0x552222, mv.active ? { emissive: 0xff0000, emissiveIntensity: 1.5 } : {}); siren.position.set(0, 0.08, -0.15); g.add(siren); g.userData.siren = siren;
      for (let p = 0; p < 6; p++) g.add(pick(btn(0xa0a6ae, -0.12 + (p % 3) * 0.12, 0.0 + Math.floor(p / 3) * 0.12, 0.08), i, p, "press"));
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.01, 3), mat(COL.yellow)); tri.position.set(0.16, 0.05, -0.17); g.add(tri);
    }
    return g;
  }
  // 見ざるの見え方: 黒地に白い輪郭だけ(色・画面・ランプは見えない)
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  function blindify(root, on = true) {
    const list = []; root.traverse((o) => { if (o.isMesh) list.push(o); });
    for (const o of list) {
      if (o.userData.screen) { o.visible = !on; continue; }
      if (on) {
        if (!o.userData.origMat) o.userData.origMat = o.material;
        o.material = blackMat;
        if (!o.userData.edged) { o.userData.edged = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), edgeMat); o.userData.edged.userData.pickParent = o; o.add(o.userData.edged); }
        o.userData.edged.visible = true;
      } else {
        if (o.userData.origMat) o.material = o.userData.origMat;
        if (o.userData.edged) o.userData.edged.visible = false;
      }
    }
  }
  // ---- 状態の反映 ----
  function setRole(role, names) {
    st.role = role; st.blindView = role === "blind";
    for (const g of Object.values(st.monkeys)) world.remove(g);
    st.monkeys = {};
    for (const [id, ro] of Object.entries(names.roles)) st.monkeys[id] = makeMonkey(ro, names.names[id] || ro);
    for (const g of Object.values(st.monkeys)) monkeyLook(g);
    // 自分のサルは視点の邪魔になるので自分の画面では描かない(ほかの人には見える)
    if (names.me && st.monkeys[names.me]) st.monkeys[names.me].visible = false;
    const c = CAM[role] || CAM.watch; camera.position.set(...c);
    controls.target.set(role === "mute" ? -0.5 : 0, role === "mute" ? 1.0 : 0.95, 0); controls.update();
    scene.background = new THREE.Color(st.blindView ? 0x000000 : 0x1b2027);
    blindify(world, st.blindView); if (st.blindView) lamp.intensity = 0;
    st.modKeys = [];
  }
  function update(v) {
    const b = v.bomb;
    if (!b) return;
    const n = b.mods.length;
    if (st.modGroups.length !== n) { for (const g of st.modGroups) if (g) bombG.remove(g); st.modGroups = new Array(n).fill(null); st.modKeys = []; bombG.scale.setScalar(fitScale(n)); }
    b.mods.forEach((mv, i) => {
      const live = mv.kind === "pressure" || mv.kind === "rslider";
      const key = JSON.stringify(live ? { ...mv, v: null, urgent: null } : mv);
      if (st.modKeys[i] === key && st.modGroups[i]) { st.modGroups[i].userData.mv = mv; st.modGroups[i].userData.got = performance.now(); return; }
      st.modKeys[i] = key;
      if (st.modGroups[i]) bombG.remove(st.modGroups[i]);
      const g = buildModule(mv, i); g.userData.mv = mv; g.userData.got = performance.now();
      const [x, z] = slotPos(i, n); g.position.set(x, 0, z);
      if (st.blindView) blindify(g);
      bombG.add(g); st.modGroups[i] = g;
    });
    st.bomb = b; st.v = v;
    // 停電: 部屋が暗くなる
    st.dark = !!v.hazard?.dark;
    // 見ざるの手(触っているところ)
    for (const [id, h] of Object.entries(v.hands || {})) {
      if (!st.hands[id]) { const hand = sph(0.035, 0xe9c39b, { emissive: 0x553311, emissiveIntensity: 0.3 }); scene.add(hand); st.hands[id] = hand; }
      const g = st.modGroups[h.mod]; if (!g) continue;
      let pos = new THREE.Vector3();
      g.traverse((o) => { if (o.isMesh && o.userData.pick && o.userData.pick.part === h.part) o.getWorldPosition(pos); });
      if (!pos.lengthSq()) g.getWorldPosition(pos);
      st.hands[id].position.copy(pos).add(new THREE.Vector3(0, 0.05, 0)); st.hands[id].visible = Date.now() - h.at < 8000 && !st.blindView;
    }
    // 指差し
    for (const [id, p] of Object.entries(v.points || {})) {
      const mk = st.monkeys[id]; if (!mk) continue;
      if (st.pointLines[id]) { scene.remove(st.pointLines[id]); st.pointLines[id] = null; }
      const arm = mk.userData.arms[1];
      if (!p || Date.now() - p.t > 6000) { arm.rotation.x = 0; continue; }
      const from = new THREE.Vector3(); mk.userData.head.getWorldPosition(from); from.y -= 0.25;
      const to = new THREE.Vector3(...p.at);
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffe14a, dashSize: 0.05, gapSize: 0.03 })); line.computeLineDistances();
      const dot = sph(0.03, 0xffe14a, { emissive: 0xffe14a, emissiveIntensity: 1 }); dot.position.copy(to); line.add(dot);
      line.visible = !st.blindView; scene.add(line); st.pointLines[id] = line; arm.rotation.x = -1.3;
    }
  }
  // エモート(吹き出し)・ビンタ・バナナ
  function showBubble(id, text, ms = 2600) {
    const mk = st.monkeys[id]; if (!mk) return;
    const b = mk.userData.bubble; b.material.map = textTex([text], 256, 128, { bg: "#ffffff", fg: "#181b23", size: text.length > 4 ? 34 : 64 }); b.material.needsUpdate = true;
    b.visible = !st.blindView; b.userData.until = performance.now() + ms;
  }
  function anim(kind, from, to) {
    const a = st.monkeys[from], b = st.monkeys[to]; if (!a || !b) return;
    if (kind === "slap") { a.userData.slapT = performance.now(); b.userData.hitT = performance.now(); }
    if (kind === "banana") {
      const ban = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 8, 16, Math.PI), mat(COL.yellow)); const p0 = new THREE.Vector3(); a.userData.head.getWorldPosition(p0); const p1 = new THREE.Vector3(); b.userData.head.getWorldPosition(p1);
      ban.userData = { p0, p1, t0: performance.now() }; fxG.add(ban); b.userData.hitT = performance.now() + 600;
    }
  }
  function talk(id, on) { const mk = st.monkeys[id]; if (mk) mk.userData.talkUntil = on ? performance.now() + 1500 : 0; }

  // ---- 見ざるの「触る」「押す」 ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitAt(ev) {
    const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(world.children, true);
    const solid = hits.filter((h) => h.object.isMesh && h.object.visible);
    return solid.length ? { pick: solid[0].object.userData.pick || null, point: solid[0].point } : null;
  }
  let downAt = null;
  canvas.addEventListener("pointerdown", (ev) => { downAt = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
  canvas.addEventListener("pointerup", (ev) => {
    if (!downAt) return; const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 8; downAt = null;
    if (moved) return; // 視点を回しただけ
    const h = hitAt(ev); hooks.onClick && hooks.onClick(h, ev);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (ev.pointerType !== "mouse") return;
    const h = hitAt(ev); const key = h && h.pick ? `${h.pick.mod}:${h.pick.part}` : null;
    if (key !== st.hover) { st.hover = key; hooks.onHover && hooks.onHover(h && h.pick ? h.pick : null); }
    canvas.style.cursor = h && h.pick ? "pointer" : "grab";
  });

  // ---- 毎フレーム ----
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); } }
  let timerText = "";
  function frame() {
    requestAnimationFrame(frame); resize(); controls.update();
    const now = performance.now(), t = (now - st.t0) / 1000;
    // カオスモジュールの動き(見た目): サーバの値から少し先を見て滑らかに
    for (const g of st.modGroups) {
      if (!g) continue; const mv = g.userData.mv; if (!mv) continue;
      if (mv.v != null && (g.userData.needle || g.userData.knob)) { const vv = Math.min(100, mv.v + mv.rate * (now - g.userData.got) / 1000 * 0); if (g.userData.needle) g.userData.needle.rotation.y = Math.PI * 0.75 - vv / 100 * Math.PI * 1.5; if (g.userData.knob) g.userData.knob.position.z = 0.13 - vv / 100 * 0.26; }
      else if (g.userData.knob && st.blindView) g.userData.knob.position.z = 0.13 - (mv.urgent ? 0.2 : 0.05);
      if (g.userData.siren && mv.active) g.userData.siren.scale.setScalar(1 + 0.25 * Math.sin(t * 12));
    }
    // 時間の表示
    if (st.bomb && st.v) {
      const left = st.v.step === "play" ? Math.max(0, st.bomb.end - (Date.now() + (hooks.offset ? hooks.offset() : 0))) : st.v.step === "brief" ? (st.bomb.end || 0) : 0;
      const s = Math.ceil(left / 1000), txt = st.v.step === "brief" ? "READY" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}  ${"✕".repeat(st.bomb.strikes)}`;
      if (txt !== timerText) { timerText = txt; timerMesh.material.map = textTex([txt], 256, 85, { fg: "#ff5a4f", size: 44 }); timerMesh.material.needsUpdate = true; timerMesh.visible = !st.blindView; }
    }
    // サルの動き: しゃべる口・ビンタ・バナナ・吹き出し
    for (const mk of Object.values(st.monkeys)) {
      const u = mk.userData;
      u.head.rotation.z = Math.sin(t * 1.3 + mk.position.x) * 0.05;
      if (u.mouth) u.mouth.scale.y = u.talkUntil > now ? 1 + Math.abs(Math.sin(t * 18)) * 1.5 : 1;
      if (u.slapT && now - u.slapT < 450) u.arms[0].rotation.x = -Math.sin((now - u.slapT) / 450 * Math.PI) * 1.8; else u.arms[0].rotation.x = 0;
      if (u.hitT && now > u.hitT && now - u.hitT < 500) u.head.rotation.y = Math.sin((now - u.hitT) / 500 * Math.PI * 4) * 0.5; else u.head.rotation.y = 0;
      if (u.bubble.visible && u.bubble.userData.until < now) u.bubble.visible = false;
    }
    for (const b of [...fxG.children]) { const k = (now - b.userData.t0) / 600; if (k >= 1) { fxG.remove(b); continue; } b.position.lerpVectors(b.userData.p0, b.userData.p1, k); b.position.y += Math.sin(k * Math.PI) * 0.5; b.rotation.z = k * 10; }
    // 停電(見ざるはもともと見えないので関係ない)
    if (!st.blindView) { lamp.intensity = st.dark ? 0 : 6; scene.children.forEach((o) => { if (o.isHemisphereLight) o.intensity = st.dark ? 0.08 : 1.1; if (o.isDirectionalLight) o.intensity = st.dark ? 0.05 : 1.2; }); }
    renderer.render(scene, camera);
  }
  frame();
  // モジュールに寄る(見ざるが手元を確かめやすいように)。i=null で元の視点
  function focus(i) {
    const g = i == null ? null : st.modGroups[i];
    if (!g) { const c = CAM[st.role] || CAM.watch; camera.position.set(...c); controls.target.set(st.role === "mute" ? -0.5 : 0, st.role === "mute" ? 1.0 : 0.95, 0); controls.update(); return; }
    const p = new THREE.Vector3(); g.getWorldPosition(p);
    controls.target.copy(p); camera.position.set(p.x, p.y + 0.62, p.z + 0.42); controls.update();
  }
  return { _st: st, setRole, update, focus, showBubble, anim, talk, camera, controls, renderer, three: THREE };
}
