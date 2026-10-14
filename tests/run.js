#!/usr/bin/env node
"use strict";
// テストをまとめて回す: サーバを起動して(ポート3123)、tests/ の各テストを1本ずつ動かし、結果をまとめる。
//   npm test                … 全部(ブラウザのテストも)
//   npm run test:core       … ブラウザを使わないテストだけ(速い)
//   npm run test:ui         … ブラウザのテストだけ
//   node tests/run.js bb_   … 名前に「bb_」を含むテストだけ
// ブラウザのテストは playwright-core を使う。ブラウザの場所は環境変数 CHROMIUM_PATH(無ければ playwright の既定)。
// 合否: 終了コードが0以外・「NG」で始まる行・処理されなかったエラーがあれば失敗。スクリーンショットは tests/.shots/ に出る。

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, ".."), PORT = 3123, SHOTS = path.join(__dirname, ".shots");
const SKIP = new Set(["run.js", "noguide.js"]);
// 時間のかかるテスト(全ゲームを順に開くなど)は長めに待つ
const SLOW = { "lobby_all.js": 1500, "audit.js": 600, "party_fix2.js": 300 };
const args = process.argv.slice(2), coreOnly = args.includes("--core"), uiOnly = args.includes("--ui"), filters = args.filter((a) => !a.startsWith("--"));

const usesBrowser = (f) => /playwright/.test(fs.readFileSync(path.join(__dirname, f), "utf8"));
let files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".js") && !SKIP.has(f)).sort();
if (coreOnly) files = files.filter((f) => !usesBrowser(f));
if (uiOnly) files = files.filter((f) => usesBrowser(f));
if (filters.length) files = files.filter((f) => filters.some((x) => f.includes(x)));

const alive = () => new Promise((res) => { const r = http.get({ host: "localhost", port: PORT, path: "/healthz", timeout: 1000 }, (s) => { s.resume(); res(s.statusCode === 200); }); r.on("error", () => res(false)); r.on("timeout", () => { r.destroy(); res(false); }); });
let server = null, ours = false; // ours: このランナーがサーバを起動したか(もともと動いていたサーバは止めない)
async function ensureServer() {
  if (await alive()) return;
  ours = true;
  server = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
  for (let i = 0; i < 60; i++) { if (await alive()) return; await new Promise((r) => setTimeout(r, 250)); }
  throw new Error("サーバが起動しませんでした");
}
function runOne(f) {
  return new Promise((res) => {
    const t0 = Date.now(), out = [];
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "noguide.js"), path.join(__dirname, f)], { cwd: SHOTS, env: process.env });
    const limit = setTimeout(() => { out.push("NG  時間切れ(" + (SLOW[f] || 240) + "秒)"); p.kill("SIGKILL"); }, (SLOW[f] || 240) * 1000);
    p.stdout.on("data", (d) => out.push(String(d)));
    p.stderr.on("data", (d) => out.push(String(d)));
    p.on("close", (code) => {
      clearTimeout(limit);
      const text = out.join(""), ng = text.split("\n").filter((l) => /^NG/.test(l));
      res({ f, ok: !ng.length && code === 0, ng, code, sec: Math.round((Date.now() - t0) / 1000), text });
    });
  });
}
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const results = [];
  for (const f of files) {
    await ensureServer(); // テストがサーバを止めることがある(更新のお知らせのテスト)ので毎回確かめる
    const r = await runOne(f);
    results.push(r);
    console.log(`${r.ok ? "✔" : "✘"} ${f} (${r.sec}秒)${r.ok ? "" : "\n    " + (r.ng.length ? r.ng.join("\n    ") : r.text.trim().split("\n").slice(-6).join("\n    "))}`);
  }
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} 本が成功${bad.length ? `・失敗: ${bad.map((r) => r.f).join(", ")}` : ""}`);
  // 起動したサーバを止める(テストが起動し直したサーバも含めて、ポートを使っているもの)
  if (ours) {
    if (server) server.kill();
    try { const pid = require("child_process").execSync(`lsof -ti tcp:${PORT} -sTCP:LISTEN`).toString().trim().split("\n")[0]; if (pid) process.kill(+pid); } catch {}
  }
  process.exit(bad.length ? 1 : 0);
})();
