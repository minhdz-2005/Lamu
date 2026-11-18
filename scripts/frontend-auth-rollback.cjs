// Local build rollback drill; no DB, migration, mail or deployment.
const { spawn, spawnSync } = require("node:child_process");
const { createServer } = require("node:net");
const { resolve } = require("node:path");
const { chromium } = require("../frontend/node_modules/playwright");
const cli = resolve("frontend/node_modules/next/dist/bin/next");
const cwd = resolve("frontend");
function build(mode) {
  const result = spawnSync(process.execPath, [cli, "build"], {
    cwd,
    env: { ...process.env, NEXT_PUBLIC_AUTH_MODE: mode },
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error("Build " + mode + " failed: " + result.stderr);
  console.log("PASS build " + mode);
}
(async () => {
  let server, browser;
  try {
    build("mock");
    const reservation = createServer();
    await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
    const port = reservation.address().port;
    await new Promise((r) => reservation.close(r));
    const origin = "http://127.0.0.1:" + port;
    server = spawn(
      process.execPath,
      [cli, "start", "-p", String(port), "-H", "127.0.0.1"],
      {
        cwd,
        env: {
          ...process.env,
          NEXT_PUBLIC_AUTH_MODE: "mock",
          IDENTITY_GATEWAY_URL: "http://127.0.0.1:9",
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin + "/auth")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage();
    const paths = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/")) paths.push(new URL(r.url()).pathname);
    });
    await page.goto(origin + "/auth");
    await page.evaluate(() =>
      localStorage.setItem("lamu.session.v2.real", "rollback-sentinel"),
    );
    await page.locator("#email").fill("demo@luma.dev");
    await page.locator("#password").fill("password123");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(origin + "/me");
    const isolated = await page.evaluate(
      () =>
        !!JSON.parse(localStorage.getItem("lamu.session.v2.mock")).access &&
        localStorage.getItem("lamu.session.v2.real") === "rollback-sentinel",
    );
    if (
      !isolated ||
      !paths.includes("/api/auth/login") ||
      paths.some((p) => p.startsWith("/api/identity/"))
    )
      throw new Error("Mode isolation failed");
    console.log(
      "PASS browser mock login with Gateway unavailable; real namespace untouched",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server?.kill();
    try {
      build("real");
      console.log(
        "PASS restored real production build; restart/reload required to switch running processes",
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
})();
