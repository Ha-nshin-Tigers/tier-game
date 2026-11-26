// テスト用: 遊び方ガイドの自動表示を「見た」ことにする(既存のテストがガイドに邪魔されないように)。
// 3Dが遅いテスト環境で「軽量モードのおすすめ」が出ないように、それも「案内済み」にする
const pw = require("playwright-core");
const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const b = await orig(...a);
  const nc = b.newContext.bind(b);
  b.newContext = async (...o) => { const ctx = await nc(...o); await ctx.addInitScript(() => { try { localStorage.setItem("tier:liteAsked", "1"); } catch {} for (const k of ["tier", "number", "liar", "shotgun", "insider", "coyote", "guessclub", "matchy", "eshiri", "challengers", "eldorado", "heat", "monopoly", "citychase", "oriflamme", "dantier", "mortar", "bridge", "bomb", "memory", "bombanana"]) try { localStorage.setItem("tier:guide:seen:" + k, "1"); } catch {} }); return ctx; };
  return b;
};
