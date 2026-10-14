"use strict";
// 小さな保存庫: Upstash Redis(環境変数があれば)か、ローカルファイル(data/ の下)に JSON を1つずつ保存する。
// サーバの再起動・本番への反映でメモリの中身が消えても、パーティーと通算成績を戻せるようにするために使う。
// ※ローカルファイルは Render の無料プランでは反映のたびに消える。ずっと残すには Upstash の設定が必要。

const fs = require("fs");
const path = require("path");

const UP_URL = process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const DIR = path.join(__dirname, "..", "data");
const remote = !!(UP_URL && UP_TOKEN);

async function upstash(cmd) {
  const r = await fetch(UP_URL, { method: "POST", headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error("Upstash HTTP " + r.status);
  return (await r.json()).result;
}
const fileOf = (key) => path.join(DIR, key.replace(/[^a-z0-9_-]/gi, "_") + ".json");

async function load(key) {
  try {
    if (remote) { const s = await upstash(["GET", "tier-game:" + key]); return s ? JSON.parse(s) : null; }
    const f = fileOf(key);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  } catch (e) { console.error(`保存庫 ${key} の読み込みに失敗:`, e.message); return null; }
}
let chain = Promise.resolve();
// 保存は順番に(前の保存が終わってから次)。失敗してもゲームは止めない
function save(key, data) {
  const body = JSON.stringify(data);
  chain = chain.then(async () => {
    if (remote) await upstash(["SET", "tier-game:" + key, body]);
    else { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(fileOf(key), body); }
  }).catch((e) => console.error(`保存庫 ${key} の保存に失敗:`, e.message));
  return chain;
}
module.exports = { load, save, remote, flush: () => chain };
