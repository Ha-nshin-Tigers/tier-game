// テスト用: 遊び方ガイドの自動表示を「見た」ことにする(既存のテストがガイドに邪魔されないように)
const pw = require("playwright-core");
const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const b = await orig(...a);
  const nc = b.newContext.bind(b);
  b.newContext = async (...o) => { const ctx = await nc(...o); await ctx.addInitScript(() => { for (const k of ["tier", "number", "liar", "shotgun", "insider", "coyote", "guessclub", "matchy", "eshiri", "challengers", "eldorado", "heat", "monopoly", "citychase", "oriflamme", "mortar", "bridge", "bomb", "memory", "bombanana"]) try { localStorage.setItem("tier:guide:seen:" + k, "1"); } catch {} }); return ctx; };
  return b;
};
