const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://localhost:3123/"); await sleep(2500);
  const cdp = await ctx.newCDPSession(p);
  const r = await cdp.send("Page.getInstallabilityErrors");
  const m = await cdp.send("Page.getAppManifest");
  console.log("installability errors:", JSON.stringify(r.installabilityErrors));
  console.log("manifest errors:", JSON.stringify(m.errors), "url:", m.url);
  console.log("sw:", await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  // 画面遷移は今まで通り動く
  await p.goto("http://localhost:3123/heat"); console.log("heat title:", await p.title());
  console.log("errs", errs); await b.close();
})();
