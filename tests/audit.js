const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = ["", "lobby", "tier", "number", "liar", "shotgun", "insider", "coyote", "guessclub", "matchy", "eshiri", "challengers", "eldorado", "heat", "monopoly", "citychase", "mortar", "bridge", "bomb", "memory", "party"];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const vp of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    for (const pg of pages) {
      const p = await ctx.newPage(); const errs = [];
      p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 90)); });
      const t0 = Date.now();
      await p.goto("http://localhost:3123/" + pg, { waitUntil: "load" }); await sleep(400);
      const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, title: document.title, desc: !!document.querySelector('meta[name=description]'), icon: !!document.querySelector('link[rel~=icon]'), small: [...document.querySelectorAll("button, a, input, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 32; }).length }));
      console.log(`${vp.width} /${pg.padEnd(12)} ${Date.now() - t0}ms overflow:${r.sw > r.iw ? r.sw : "-"} smallTap:${r.small} icon:${r.icon} desc:${r.desc} err:${JSON.stringify(errs)}`);
      await p.close();
    }
  }
  await b.close();
})();
