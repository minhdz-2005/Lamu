import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import {
  chromium,
  type Browser,
  type Page,
} from "../frontend/node_modules/playwright";
import { pair, contract } from "./helpers";
import {
  recoveryConfig,
  mailConfig,
} from "../services/identity-service/src/security/config";
import {
  SecurityMailWorker,
  SmtpSecurityMailSender,
} from "../services/identity-service/src/security/mail.worker";
import {
  CloudinaryProvider,
  mediaConfig,
} from "../services/identity-service/src/media/cloudinary";

// Only runs through the existing disposable test-db runner with its isolated Mailpit.
const enabled =
  !!process.env.MAILPIT_URL &&
  new URL(process.env.DATABASE_URL ?? "http://invalid").pathname ===
    "/identity_test";
(enabled ? describe : describe.skip)(
  "Frontend real browser → Next proxy → Gateway → Identity → isolated PostgreSQL/Mailpit",
  () => {
    let apps: Awaited<ReturnType<typeof pair>>,
      browser: Browser,
      next: ChildProcess,
      origin: string,
      smtp: SmtpSecurityMailSender;
    let worker: SecurityMailWorker;
    const media =
      process.env.REAL_CLOUDINARY_SMOKE === "1"
        ? mediaConfig({
            ...process.env,
            CLOUDINARY_ASSET_PREFIX: "lamu/test-browser/" + randomUUID(),
          })
        : undefined;
    const cloudinary = media && new CloudinaryProvider(media);
    beforeAll(async () => {
      apps = await pair(
        {},
        recoveryConfig(process.env),
        media && { config: media, provider: cloudinary },
      );
      await apps.gateway.listen(0, "127.0.0.1");
      const reservation = createServer();
      await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
      const port = (reservation.address() as { port: number }).port;
      await new Promise<void>((r) => reservation.close(() => r()));
      origin = "http://127.0.0.1:" + port;
      next = spawn(
        process.execPath,
        [
          resolve("frontend/node_modules/next/dist/bin/next"),
          "start",
          "-p",
          String(port),
          "-H",
          "127.0.0.1",
        ],
        {
          cwd: resolve("frontend"),
          env: {
            ...process.env,
            IDENTITY_GATEWAY_URL: await apps.gateway.getUrl(),
            NEXT_PUBLIC_AUTH_MODE: "real",
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
      expect((await fetch(origin + "/auth")).ok).toBe(true);
      browser = await chromium.launch({ channel: "chrome", headless: true });
      smtp = new SmtpSecurityMailSender(mailConfig(process.env));
      worker = new SecurityMailWorker(
        apps.db,
        recoveryConfig(process.env),
        smtp,
      );
    }, 60000);
    afterAll(async () => {
      await browser?.close();
      smtp?.transport.close();
      next?.kill();
      await apps?.close();
    });
    async function fillLogin(page: Page, email: string, password: string) {
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.locator("button[type=submit]").click();
    }
    const mePath = "/api/identity/users/me";
    async function createBrowserAccount(page: Page) {
      const input = {
        email: randomUUID() + "@me.lamu.test",
        password: " OriginalBrowser!2026 ",
        display_name: "Avatar Browser",
      };
      const response = await page.request.post(
        origin + "/api/identity/auth/register",
        { data: input },
      );
      expect(response.status()).toBe(200);
      return { ...input, userId: (await response.json()).user_id as string };
    }

    async function signInOnMe(page: Page, email: string, password: string) {
      await page.goto(origin + "/auth");
      await fillLogin(page, email, password);
      await page.waitForURL(origin + "/me");
      await page.getByRole("heading", { name: "Thông tin cá nhân" }).waitFor();
    }

    async function fillChange(
      page: Page,
      current: string,
      next: string,
      confirmation = next,
    ) {
      await page.getByLabel("Mật khẩu hiện tại", { exact: true }).fill(current);
      await page.getByLabel("Mật khẩu mới", { exact: true }).fill(next);
      await page.getByLabel("Xác nhận mật khẩu mới").fill(confirmation);
      await page.getByRole("button", { name: "Lưu mật khẩu" }).click();
    }

    it("ME password: wrong password retains both sessions, a successful change revokes both", async () => {
      const first = await browser.newContext();
      const second = await browser.newContext();
      try {
        const a = await first.newPage(),
          b = await second.newPage();
        const input = await createBrowserAccount(a);
        const next = " UpdatedBrowser!2026 ";
        await Promise.all(
          [a, b].map((page) => signInOnMe(page, input.email, input.password)),
        );
        await a.getByRole("button", { name: "Đổi mật khẩu" }).click();
        await fillChange(a, input.password, "short");
        await a
          .getByText("Mật khẩu mới cần từ 8 đến 128 ký tự.", { exact: true })
          .waitFor();
        await fillChange(a, input.password, next, "Different");
        await a
          .getByText("Xác nhận mật khẩu mới không khớp.", { exact: true })
          .waitFor();
        await fillChange(a, "wrong-current-password", next);
        await a
          .getByText("Mật khẩu hiện tại không đúng.", { exact: true })
          .waitFor();
        expect(await a.locator(":focus").getAttribute("name")).toBe(
          "current_password",
        );
        for (const page of [a, b]) {
          const profile = page.waitForResponse(
            (r) => r.url().endsWith(mePath) && r.status() === 200,
          );
          await page
            .getByRole("button", { name: "Tải lại", exact: true })
            .click();
          await profile;
          expect(page.url()).toBe(origin + "/me");
        }
        const previousAccess = await Promise.all(
          [a, b].map((page) =>
            page.evaluate(
              () =>
                JSON.parse(localStorage.getItem("lamu.session.v2.real") ?? "{}")
                  .access as string,
            ),
          ),
        );
        await fillChange(a, input.password, next);
        await a.waitForURL(/\/auth\?.*reason=password-changed/);
        await a
          .getByText("Đã đổi mật khẩu. Vui lòng đăng nhập lại.", {
            exact: true,
          })
          .waitFor();
        for (const access of previousAccess)
          expect(
            (
              await a.request.get(origin + mePath, {
                headers: { Authorization: "Bearer " + access },
              })
            ).status(),
          ).toBe(401);
        await b.getByRole("button", { name: "Đổi mật khẩu" }).click();
        await fillChange(b, input.password, next);
        await b
          .getByText("Phiên đã hết hạn. Vui lòng đăng nhập lại.", {
            exact: true,
          })
          .waitFor();
        await b.reload();
        await b.waitForURL(/\/auth\?/);
        const rejected = a.waitForResponse(
          (r) =>
            r.url().endsWith("/api/identity/auth/login") && r.status() === 401,
        );
        await fillLogin(a, input.email, input.password);
        const response = await rejected;
        const requestId = response.headers()["x-request-id"];
        expect(requestId).toMatch(/^[a-f0-9-]{36}$/i);
        const notice = a.locator('.lamu-auth-notice[role="alert"]');
        await notice.waitFor();
        expect(await notice.innerText()).toContain(
          "Email hoặc mật khẩu không đúng.",
        );
        expect(await notice.textContent()).not.toContain(requestId);
        expect(await notice.locator("details").count()).toBe(0);
        await fillLogin(a, input.email, next);
        await a.waitForURL(origin + "/me");
      } finally {
        await first.close();
        await second.close();
      }
    }, 60000);

    it("ME password: lost response after a real commit leaves outcome unknown and never resends", async () => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const input = await createBrowserAccount(page);
        const next = " NetworkChange!2026 ";
        await signInOnMe(page, input.email, input.password);
        let writes = 0;
        let committed = 0;
        await page.route("**/api/identity/users/me/password", async (route) => {
          writes++;
          committed = (await route.fetch()).status();
          await route.abort();
        });
        await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
        await fillChange(page, input.password, next);
        await page.getByText(/Chưa xác định được mật khẩu đã đổi/).waitFor();
        expect(committed).toBe(200);
        expect(writes).toBe(1);
        expect(page.url()).toBe(origin + "/me");
        await page.getByRole("button", { name: "Đăng nhập lại" }).click();
        await page.waitForURL(/\/auth\?/);
        await fillLogin(page, input.email, next);
        await page.waitForURL(origin + "/me");
      } finally {
        await context.close();
      }
    }, 60000);

    (cloudinary ? it : it.skip)(
      "ME avatar: both pickers, signed upload, replay after lost response, and reload",
      async () => {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        });
        let userId: string | undefined;
        try {
          const page = await context.newPage();
          const input = await createBrowserAccount(page);
          userId = input.userId;
          await signInOnMe(page, input.email, input.password);
          const large = page.locator("button.lamu-account-avatarLarge");
          const small = page.locator("button.lamu-account-avatarSmall");
          expect(await large.textContent()).toBe("AB");
          expect(await small.textContent()).toBe("AB");
          expect(
            await page
              .getByRole("button", { name: "Đổi ảnh đại diện", exact: true })
              .count(),
          ).toBe(2);

          let dropped = false;
          let uploadHasBearer = false;
          const revisions: string[] = [];
          const commitIds: string[] = [];
          page.on("request", (req) => {
            if (new URL(req.url()).hostname === "api.cloudinary.com")
              uploadHasBearer ||= Boolean(req.headers().authorization);
            if (req.url().endsWith(mePath + "/avatar/upload-intents"))
              revisions.push(req.postDataJSON().expected_revision);
            if (req.url().endsWith(mePath + "/avatar"))
              commitIds.push(req.postDataJSON().intent_id);
          });
          await page.route("**/api/identity/users/me/avatar", async (route) => {
            if (dropped) return route.continue();
            const result = await route.fetch();
            if (result.ok()) {
              dropped = true;
              return route.abort();
            }
            return route.fulfill({ response: result });
          });
          const cancel = page.waitForEvent("filechooser");
          await large.press("Enter");
          await (await cancel).setFiles([]);
          expect(revisions).toEqual([]);
          const invalid = page.waitForEvent("filechooser");
          await large.press("Enter");
          await (
            await invalid
          ).setFiles({
            name: "invalid.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("test"),
          });
          await page.getByText(/Chọn ảnh JPG, PNG hoặc WebP/).waitFor();
          expect(revisions).toEqual([]);

          async function choose(
            button: typeof large,
            name: string,
            color: string,
            pickerPage = page,
          ) {
            const png = await pickerPage.evaluate((fill) => {
              const canvas = document.createElement("canvas");
              canvas.width = 8;
              canvas.height = 8;
              const drawing = canvas.getContext("2d")!;
              drawing.fillStyle = fill;
              drawing.fillRect(0, 0, 8, 8);
              return canvas.toDataURL("image/png").split(",")[1];
            }, color);
            const chooser = pickerPage.waitForEvent("filechooser");
            await button.press("Enter");
            await (
              await chooser
            ).setFiles({
              name,
              mimeType: "image/png",
              buffer: Buffer.from(png, "base64"),
            });
          }
          async function change(
            button: typeof large,
            name: string,
            color: string,
          ) {
            await choose(button, name, color);
            await page
              .getByText("Đã cập nhật ảnh đại diện.", { exact: true })
              .waitFor();
            const src = await large.locator("img").getAttribute("src");
            expect(src).toBeTruthy();
            expect(await small.locator("img").getAttribute("src")).toBe(src);
            await page.waitForFunction(
              () =>
                Array.from(
                  document.querySelectorAll<HTMLImageElement>(
                    ".lamu-account-avatar img",
                  ),
                ).filter((img) => img.complete && img.naturalWidth > 0)
                  .length === 2,
            );
            return src;
          }
          await page.route("https://api.cloudinary.com/**", (route) =>
            route.abort(),
          );
          await choose(large, "failed.png", "green");
          await page
            .getByText(
              "Không tải được ảnh lên. Vui lòng chọn ảnh và thử lại.",
              { exact: true },
            )
            .waitFor();
          expect(await large.textContent()).toBe("AB");
          expect(await small.textContent()).toBe("AB");
          await page.unroute("https://api.cloudinary.com/**");
          const a = await change(large, "A.png", "red");
          let staleReads = 0;
          await page.route("**/api/identity/users/me", async (route) => {
            const result = await route.fetch();
            const profile = await result.json();
            if (profile.avatar.revision !== "2")
              return route.fulfill({ response: result });
            staleReads++;
            return route.fulfill({
              response: result,
              json: { ...profile, avatar: { url: a, revision: "1" } },
            });
          });
          const b = await change(small, "B.png", "blue");
          expect(b).not.toBe(a);
          expect(revisions).toEqual(["0", "0", "1"]);
          expect(staleReads).toBeGreaterThan(0);
          expect(commitIds).toHaveLength(3);
          expect(commitIds[0]).toBe(commitIds[1]);
          expect(uploadHasBearer).toBe(false);
          await page.unroute("**/api/identity/users/me");
          await page.reload();
          expect(await large.locator("img").getAttribute("src")).toBe(b);
          expect(await small.locator("img").getAttribute("src")).toBe(b);

          const competing = await browser.newContext();
          try {
            const tab = await competing.newPage();
            await signInOnMe(tab, input.email, input.password);
            await choose(
              tab.locator("button.lamu-account-avatarLarge"),
              "C.png",
              "purple",
              tab,
            );
            await tab
              .getByText("Đã cập nhật ảnh đại diện.", { exact: true })
              .waitFor();
            const c = await tab
              .locator(".lamu-account-avatarLarge img")
              .getAttribute("src");
            expect(c).not.toBe(b);
            await choose(small, "conflict.png", "orange");
            await page
              .getByText(/Ảnh đại diện đã thay đổi ở phiên khác/)
              .waitFor();
            expect(revisions.at(-1)).toBe("2");
            expect(await large.locator("img").getAttribute("src")).toBe(c);
            expect(await small.locator("img").getAttribute("src")).toBe(c);
          } finally {
            await competing.close();
          }
        } finally {
          await context.close();
          if (userId && cloudinary) {
            const intents = await apps.db.mediaUploadIntent.findMany({
              where: { user_id: userId },
            });
            const cleanup = await Promise.allSettled(
              intents.map((intent) =>
                cloudinary.destroy(intent.expected_public_id),
              ),
            );
            expect(
              cleanup.every((result) => result.status === "fulfilled"),
            ).toBe(true);
          }
        }
      },
      120000,
    );
    it("T01/T02/T10/T11/T14/T17/T18: register, verified profile, logout, mail recovery and login new password", async () => {
      const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        page = await context.newPage();
      const email = randomUUID() + "@frontend.lamu.test",
        password = " BrowserPassword!2026 ",
        newPassword = " UpdatedPassword!2026 ";
      const paths: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/api/")) paths.push(new URL(r.url()).pathname);
      });
      await page.goto(origin + "/auth");
      await page.locator("#auth-tab-register").click();
      await page.locator("#display_name").fill("Browser Real Identity");
      const profileResponse = page.waitForResponse(
        (r) => r.url().endsWith("/api/identity/users/me") && r.status() === 200,
      );
      await fillLogin(page, email, password);
      const profile = await (await profileResponse).json();
      contract("Profile", profile);
      expect(
        profile.email === email &&
          profile.display_name === "Browser Real Identity",
      ).toBe(true);
      await page.waitForURL(origin + "/me");
      expect(await apps.db.user.count({ where: { email } })).toBe(1);
      // Verify the real provider profile before continuing the auth flow.
      let old = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("lamu.session.v2.real")!),
      );
      await page.goto(origin + "/events");
      await page
        .getByRole("button", { name: "Đăng xuất", exact: true })
        .click();
      await page.waitForURL(origin + "/auth");
      await fillLogin(page, email, password);
      await page.waitForURL(origin + "/me");
      old = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("lamu.session.v2.real")!),
      );
      const otherTab = await context.newPage();
      await otherTab.goto(origin + "/events");
      await page.goto(origin + "/auth?mode=recovery");
      await page.locator("#recovery-email").fill(email);
      await page.locator("button[type=submit]").click();
      await page.locator("#recovery-code").waitFor();
      await worker.tick();
      const list = (await (
        await fetch(process.env.MAILPIT_URL + "/api/v1/messages")
      ).json()) as {
        messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
      };
      const msg = list.messages.find((m) =>
        m.To.some((t) => t.Address === email),
      );
      expect(!!msg).toBe(true);
      const detail = (await (
        await fetch(process.env.MAILPIT_URL + "/api/v1/message/" + msg!.ID)
      ).json()) as { Text: string };
      const code = detail.Text.match(/\b\d{6}\b/)?.[0];
      expect(!!code).toBe(true);
      await page.locator("#recovery-code").fill(code!);
      await page.locator("button[type=submit]").click();
      await page.locator("#new-password").waitFor();
      expect(
        await page.evaluate(
          () =>
            !Object.values(localStorage).some((v) =>
              String(v).includes("reset_token"),
            ) && !location.href.includes("reset_token"),
        ),
      ).toBe(true);
      await page.locator("#new-password").fill(newPassword);
      await page.locator("#confirm-password").fill(newPassword);
      await page.locator("button[type=submit]").click();
      await page
        .getByText("Mật khẩu đã được đổi. Hãy đăng nhập lại.", { exact: true })
        .waitFor();
      await otherTab.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("lamu.session.v2.real")!).access ===
          null,
      );
      const base = await apps.gateway.getUrl();
      const post = (path: string, body: unknown) =>
        fetch(base + "/api/auth/" + path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      expect((await post("login", { email, password })).status).toBe(401);
      expect(
        (await post("refresh", { refresh_token: old.refresh })).status,
      ).toBe(401);
      expect(
        (
          await fetch(base + "/api/users/me", {
            headers: { Authorization: "Bearer " + old.access },
          })
        ).status,
      ).toBe(401);
      await page
        .getByRole("button", { name: "Trở lại đăng nhập", exact: true })
        .click();
      await fillLogin(page, email, newPassword);
      await page.waitForURL(origin + "/me");
      expect(
        paths.includes("/api/identity/auth/register") &&
          paths.includes("/api/identity/auth/login") &&
          paths.includes("/api/identity/auth/reset-password"),
      ).toBe(true);
      expect(
        paths.every(
          (p) => p.startsWith("/api/identity/") || !p.includes("/auth/"),
        ),
      ).toBe(true);
      await context.close();
    }, 90000);
    it("T08: two tabs bootstrap a rejected access token with exactly one rotation, then logout synchronizes", async () => {
      const context = await browser.newContext(),
        page = await context.newPage();
      const email = randomUUID() + "@race.lamu.test",
        password = "RacePassword!2026";
      const base = await apps.gateway.getUrl();
      await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, display_name: "Race" }),
      });
      await page.goto(origin + "/auth");
      await fillLogin(page, email, password);
      await page.waitForURL(origin + "/me");
      const second = await context.newPage();
      await second.goto(origin + "/me");
      let refreshes = 0;
      context.on("request", (r) => {
        if (r.url().endsWith("/api/identity/auth/refresh")) refreshes++;
      });
      await page.evaluate(async () => {
        await navigator.locks.request("lamu.session.v2.real", () => {
          const s = JSON.parse(localStorage.getItem("lamu.session.v2.real")!);
          s.access = "expired";
          delete s.profile;
          localStorage.setItem("lamu.session.v2.real", JSON.stringify(s));
        });
      });
      await Promise.all([
        page.goto(origin + "/auth"),
        second.goto(origin + "/auth"),
      ]);
      await Promise.all([
        page.waitForURL(origin + "/me"),
        second.waitForURL(origin + "/me"),
      ]);
      expect(refreshes).toBe(1);
      await Promise.all([
        page.goto(origin + "/events"),
        second.goto(origin + "/events"),
      ]);
      await page
        .getByRole("button", { name: "Đăng xuất", exact: true })
        .click();
      await page.waitForURL(origin + "/auth");
      await second.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("lamu.session.v2.real")!).access ===
          null,
      );
      expect(
        await second
          .getByRole("button", { name: "Đăng xuất", exact: true })
          .count(),
      ).toBe(0);
      await context.close();
    }, 60000);
    it("T03/T16: register commits once; injected lost login response retries only login", async () => {
      const context = await browser.newContext(),
        page = await context.newPage();
      const email = randomUUID() + "@partial.lamu.test";
      let registrations = 0,
        logins = 0;
      context.on("request", (r) => {
        if (r.url().endsWith("/api/identity/auth/register")) registrations++;
      });
      await page.route("**/api/identity/auth/login", async (route) => {
        if (++logins === 1)
          await route.fulfill({
            status: 504,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "UPSTREAM_TIMEOUT" } }),
          });
        else await route.continue();
      });
      await page.goto(origin + "/auth");
      await page.locator("#auth-tab-register").click();
      await page.locator("#display_name").fill("Partial");
      await fillLogin(page, email, "PartialPassword!2026");
      await page
        .getByText("Tài khoản đã được tạo.", { exact: false })
        .waitFor();
      await page.getByText(/Yêu cầu quá thời gian/).waitFor();
      await page.locator("button[type=submit]").click();
      await page.waitForURL(origin + "/me");
      expect(registrations).toBe(1);
      expect(logins).toBe(2);
      expect(await apps.db.user.count({ where: { email } })).toBe(1);
      await context.close();
    }, 45000);
    it("T13/T18: keyboard, mobile/theme, leading-zero OTP, recovery reload and stale response cancellation (browser fault fixtures)", async () => {
      const context = await browser.newContext({
          viewport: { width: 360, height: 780 },
        }),
        page = await context.newPage();
      let sends = 0;
      await page.route(
        "**/api/identity/auth/forgot-password",
        async (route) => {
          sends++;
          await new Promise((resolve) => setTimeout(resolve, 100));
          await route.fulfill({
            status: 202,
            contentType: "application/json",
            body: '{"status":"OK"}',
          });
        },
      );
      let code = "";
      await page.route(
        "**/api/identity/auth/verify-reset-code",
        async (route) => {
          code = route.request().postDataJSON().code;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              reset_token: "a".repeat(43),
              expires_in: 300,
            }),
          });
        },
      );
      await page.goto(origin + "/auth?mode=recovery");
      await page.locator("#recovery-email").fill("keyboard@frontend.lamu.test");
      await page.locator("#recovery-email").press("Enter");
      await page.evaluate(() => {
        const form = document.querySelector("form");
        form?.requestSubmit();
        form?.requestSubmit();
      });
      await page.locator("#recovery-code").waitFor();
      expect(sends).toBe(1);
      expect(
        await page
          .locator("#recovery-code")
          .evaluate((el) => el === document.activeElement),
      ).toBe(true);
      await page.locator("#recovery-code").fill("012345");
      await page.locator("#recovery-code").press("Enter");
      await page.locator("#new-password").waitFor();
      expect(code).toBe("012345");
      expect(
        await page.evaluate(() =>
          Object.values(localStorage).every(
            (v) => !String(v).includes("reset_token"),
          ),
        ),
      ).toBe(true);
      await page.reload();
      await page.locator("#recovery-email").waitFor();
      expect(await page.locator("#new-password").count()).toBe(0);
      await page
        .getByRole("button", { name: "Chuyển chế độ sáng tối" })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.dataset.theme === "dark",
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await context.close();
    }, 45000);
    it("T16: lost verify/reset responses never replay mutations or claim success (real commits, browser response dropped)", async () => {
      for (const lost of ["verify-reset-code", "reset-password"]) {
        const context = await browser.newContext(),
          page = await context.newPage();
        const email = randomUUID() + "@lost.lamu.test",
          password = "LostPassword!2026";
        const base = await apps.gateway.getUrl();
        await fetch(base + "/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            display_name: "Lost response",
          }),
        });
        let attempts = 0,
          committed = 0,
          finish!: () => void;
        const completed = new Promise<void>((resolve) => {
          finish = resolve;
        });
        await page.route("**/api/identity/auth/" + lost, async (route) => {
          attempts++;
          try {
            const response = await fetch(
              origin + "/api/identity/auth/" + lost,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: route.request().postData(),
                signal: AbortSignal.timeout(10000),
              },
            );
            committed = response.status;
            await response.arrayBuffer();
          } catch {
            committed = -1;
          }
          await route.abort();
          finish();
        });
        await page.goto(origin + "/auth?mode=recovery");
        await page.locator("#recovery-email").fill(email);
        await page.locator("button[type=submit]").click();
        await page.locator("#recovery-code").waitFor();
        await worker.tick();
        const list = (await (
          await fetch(process.env.MAILPIT_URL + "/api/v1/messages")
        ).json()) as {
          messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
        };
        const message = list.messages.find((m) =>
          m.To.some((t) => t.Address === email),
        );
        expect(!!message).toBe(true);
        const detail = (await (
          await fetch(
            process.env.MAILPIT_URL + "/api/v1/message/" + message!.ID,
          )
        ).json()) as { Text: string };
        await page
          .locator("#recovery-code")
          .fill(detail.Text.match(/\b\d{6}\b/)![0]);
        await page.locator("button[type=submit]").click();
        if (lost === "reset-password") {
          await page.locator("#new-password").waitFor();
          await page.locator("#new-password").fill("ChangedAfterLoss!2026");
          await page.locator("#confirm-password").fill("ChangedAfterLoss!2026");
          await page.locator("button[type=submit]").click();
          await page
            .getByText("Kết quả đổi mật khẩu chưa xác định.", { exact: false })
            .waitFor();
          expect(
            (
              await fetch(base + "/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email,
                  password: "ChangedAfterLoss!2026",
                }),
              })
            ).status,
          ).toBe(200);
        } else {
          await page.getByRole("alert").waitFor();
          expect(await page.locator("#new-password").count()).toBe(0);
        }
        await completed;
        expect(committed).toBe(200);
        expect(attempts).toBe(1);
        expect(
          await page
            .getByText("Mật khẩu đã được đổi. Hãy đăng nhập lại.", {
              exact: true,
            })
            .count(),
        ).toBe(0);
        await context.close();
      }
    }, 60000);
    it("F06/T17: Next/Gateway ignores spoofed forwarding IP and fixed proxy has no business routes", async () => {
      const window = Math.floor(Date.now() / 3600000);
      const key = (ip: string) =>
        createHmac(
          "sha256",
          Buffer.from(recoveryConfig(process.env).hmac, "hex"),
        )
          .update("forgot-ip:" + ip + ":" + window)
          .digest("hex");
      const before =
        (
          await apps.db.securityRateBucket.findUnique({
            where: { key: key("127.0.0.1") },
          })
        )?.count ?? 0;
      const result = await fetch(
        origin + "/api/identity/auth/forgot-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-IP": "spoofed-browser",
            "X-Forwarded-For": "8.8.8.8",
          },
          body: JSON.stringify({
            email: "absent-" + randomUUID() + "@frontend.lamu.test",
          }),
        },
      );
      expect(result.status).toBe(202);
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(!!result.headers.get("x-request-id")).toBe(true);
      expect(
        (
          await apps.db.securityRateBucket.findUnique({
            where: { key: key("127.0.0.1") },
          })
        )?.count,
      ).toBe(before + 1);
      expect(
        await apps.db.securityRateBucket.findUnique({
          where: { key: key("spoofed-browser") },
        }),
      ).toBeNull();
      expect((await fetch(origin + "/api/identity/organizations")).status).toBe(
        404,
      );
    });
    it("F02: cross-tab lock has bounded wait and browser releases it when owning tab crashes/closes", async () => {
      const context = await browser.newContext(),
        owner = await context.newPage(),
        waiter = await context.newPage();
      const base = await apps.gateway.getUrl(),
        email = randomUUID() + "@lock.lamu.test",
        password = "LockPassword!2026";
      await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: "Lock" }),
      });
      await owner.goto(origin + "/auth");
      await waiter.goto(origin + "/auth");
      await owner.evaluate(() => {
        void navigator.locks.request(
          "lamu.session.v2.real",
          () => new Promise(() => {}),
        );
      });
      await owner.waitForFunction(
        async () =>
          !!(await navigator.locks.query()).held?.some(
            (l) => l.name === "lamu.session.v2.real",
          ),
      );
      await fillLogin(waiter, email, password);
      await waiter
        .getByText(
          "Phiên đang được cập nhật ở tab khác. Hãy chờ rồi thử lại.",
          { exact: true },
        )
        .waitFor({ timeout: 20000 });
      await owner.close();
      await waiter.locator("button[type=submit]").click();
      await waiter.waitForURL(origin + "/me");
      await context.close();
    }, 45000);
    async function pageUser(label: string) {
      const email = randomUUID() + "@identity-pages.lamu.test";
      const password = "BrowserIdentity!2026";
      const base = await apps.gateway.getUrl();
      const register = await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, display_name: label }),
      });
      expect(register.status).toBe(200);
      const { user_id: id } = (await register.json()) as { user_id: string };
      const login = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      expect(login.status).toBe(200);
      const tokens = (await login.json()) as {
        access_token: string;
        refresh_token: string;
      };
      return { id, email, password, ...tokens };
    }

    async function browserSession(
      actor: Awaited<ReturnType<typeof pageUser>>,
      refreshOnly = false,
    ) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        ({ access, refresh, generation }) => {
          const key = "lamu.session.v2.real";
          if (!localStorage.getItem(key)) {
            localStorage.setItem(
              key,
              JSON.stringify({ version: 2, access, refresh, generation }),
            );
          }
        },
        {
          access: refreshOnly ? null : actor.access_token,
          refresh: actor.refresh_token,
          generation: randomUUID(),
        },
      );
      return context;
    }

    async function pageApi(
      actor: Awaited<ReturnType<typeof pageUser>>,
      path: string,
      method = "GET",
      body?: object,
    ) {
      return fetch(origin + "/api/identity" + path, {
        method,
        headers: {
          Authorization: "Bearer " + actor.access_token,
          "Content-Type": "application/json",
          ...(method === "GET" ? {} : { "Idempotency-Key": randomUUID() }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }

    async function providerOrg(
      owner: Awaited<ReturnType<typeof pageUser>>,
      name: string,
    ) {
      const response = await pageApi(owner, "/organizations", "POST", { name });
      expect(response.status).toBe(201);
      return ((await response.json()) as { organization_id: string })
        .organization_id;
    }

    it("Organization profile: keyboard edits, late profile response on return to list, and scoped controls", async () => {
      const owner = await pageUser("Profile Owner");
      const member = await pageUser("Profile Member");
      const org = await providerOrg(owner, "Browser profile organization");
      await providerOrg(member, "Member's own organization");
      await apps.db.membership.create({
        data: { organization_id: org, user_id: member.id },
      });
      const context = await browserSession(owner);
      const memberContext = await browserSession(member);
      const path = "/organizations/" + org;
      const page = await context.newPage();
      let release = () => {};
      try {
        await page.goto(origin + path);
        const edit = page.getByRole("button", { name: "Sửa mô tả" });
        await edit.press("Enter");
        const draft = page.getByRole("textbox", { name: "Mô tả tổ chức" });
        expect(
          await draft.evaluate((field) => field === document.activeElement),
        ).toBe(true);
        await draft.fill("Bản nháp đã hủy");
        await page
          .getByRole("button", { name: "Hủy", exact: true })
          .press("Enter");
        await page.getByText("Chưa có mô tả.").waitFor();

        let held!: () => void;
        const waiting = new Promise<void>((resolve) => {
          held = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let first = true;
        await page.route("**" + mePath, async (route) => {
          if (!first) return route.continue();
          first = false;
          const stale = await route.fetch();
          held();
          await gate;
          await route.fulfill({ response: stale });
        });
        await page.evaluate(() => {
          const key = "lamu.session.v2.real";
          const cached = JSON.parse(localStorage.getItem(key)!);
          cached.profile.display_name += " ";
          localStorage.setItem(key, JSON.stringify(cached));
          dispatchEvent(new Event("focus"));
        });
        await waiting;
        await edit.press("Enter");
        await draft.fill("Một mô tả đã lưu.\nDòng thứ hai.");
        await page.getByRole("button", { name: "Lưu mô tả" }).press("Enter");
        await page.getByRole("status").getByText("Đã lưu mô tả.").waitFor();
        const description = page.getByText(/Một mô tả đã lưu/);
        expect(await description.textContent()).toContain("\nDòng thứ hai.");
        await page
          .getByRole("navigation", { name: "Tổ chức của tôi" })
          .getByRole("link")
          .click();
        await page.waitForURL(origin + "/organizations");
        await description.waitFor();
        const refreshed = page.waitForResponse((r) => r.url().endsWith(mePath));
        release();
        await refreshed;
        await description.waitFor();
        await page.reload();
        await description.waitFor();

        const memberPage = await memberContext.newPage();
        await memberPage.goto(origin + path);
        await memberPage.getByText(/Một mô tả đã lưu/).waitFor();
        expect(
          await memberPage.getByRole("button", { name: "Sửa mô tả" }).count(),
        ).toBe(0);
        expect(
          await memberPage
            .getByRole("button", { name: "Cập nhật ảnh bìa" })
            .count(),
        ).toBe(0);
        expect(
          (await pageApi(member, path, "PATCH", { description: null })).status,
        ).toBe(403);

        await page.goto(origin + path);
        await edit.click();
        await draft.fill(" \n ");
        await page.getByRole("button", { name: "Lưu mô tả" }).click();
        await page.getByText("Chưa có mô tả.").waitFor();
        await page.reload();
        await page.getByText("Chưa có mô tả.").waitFor();
      } finally {
        release();
        await Promise.all([context.close(), memberContext.close()]);
      }
    }, 60000);

    (cloudinary ? it : it.skip)(
      "Organization cover: OWNER and ADMIN upload via the browser, recover commit and reconcile a stale revision",
      async () => {
        const owner = await pageUser("Cover Owner");
        const admin = await pageUser("Cover Admin");
        const org = await providerOrg(owner, "Browser cover organization");
        const role = await apps.db.role.findFirstOrThrow({
          where: { code: "ADMIN", scope: "ORG", organization_id: null },
        });
        const membership = await apps.db.membership.create({
          data: { organization_id: org, user_id: admin.id },
        });
        await apps.db.membershipRole.create({
          data: {
            membership_id: membership.id,
            role_id: role.id,
            resource_type: "ORG",
          },
        });
        const ownerContext = await browserSession(owner),
          adminContext = await browserSession(admin);
        const path = "/organizations/" + org;
        try {
          const ownerPage = await ownerContext.newPage(),
            adminPage = await adminContext.newPage();
          await ownerPage.setViewportSize({ width: 1280, height: 900 });
          await ownerPage.goto(origin + path);
          await ownerPage.getByText("Chưa có ảnh bìa").waitFor();
          const commits: string[] = [];
          let uploadHasBearer = false;
          for (const page of [ownerPage, adminPage])
            page.on("request", (req) => {
              if (new URL(req.url()).hostname === "api.cloudinary.com")
                uploadHasBearer ||= Boolean(req.headers().authorization);
              if (
                req.url().endsWith("/api/identity" + path + "/cover") &&
                req.method() === "PUT"
              )
                commits.push(req.postDataJSON().intent_id);
            });
          async function select(page: Page, name: string) {
            await page
              .getByRole("button", { name: "Cập nhật ảnh bìa" })
              .press("Enter");
            const picker = page.getByLabel("Chọn tệp ảnh bìa");
            await picker.waitFor();
            await expectFocus(picker);
            await picker.setInputFiles(
              resolve("frontend/public/preview/organization-cover.png"),
            );
            const preview = page.getByRole("img", {
              name: "Xem trước ảnh bìa",
            });
            await checkBanner(preview);
            expect(await picker.inputValue()).toContain(name);
          }
          async function expectFocus(picker: ReturnType<Page["getByLabel"]>) {
            await picker.evaluate((input) => {
              if (input !== document.activeElement)
                throw new Error("Expected file picker focus");
            });
          }
          async function checkBanner(banner: ReturnType<Page["getByRole"]>) {
            await banner.waitFor();
            await banner.evaluate((image) =>
              (image as HTMLImageElement).decode(),
            );
            const box = (await banner.boundingBox())!;
            expect(box.width / box.height).toBeCloseTo(3, 2);
          }
          const save = (page: Page) =>
            page.getByRole("button", { name: "Lưu ảnh bìa" }).press("Enter");
          const filename = "organization-cover.png";
          await select(ownerPage, filename);
          await save(ownerPage);
          await ownerPage.getByText("Đã cập nhật ảnh bìa.").waitFor();
          const ownerCover = ownerPage.getByRole("img", {
            name: "Ảnh bìa tổ chức",
          });
          await checkBanner(ownerCover);
          const first = await ownerCover.getAttribute("src");
          expect(first).toContain("w_1500,h_500");

          await adminPage.goto(origin + path);
          await adminPage.getByRole("button", { name: "Sửa mô tả" }).click();
          await adminPage
            .getByRole("textbox", { name: "Mô tả tổ chức" })
            .fill("Đã sửa bởi ADMIN");
          await adminPage.getByRole("button", { name: "Lưu mô tả" }).click();
          await adminPage.getByText("Đã lưu mô tả.").waitFor();
          const adminCover = adminPage.getByRole("img", {
            name: "Ảnh bìa tổ chức",
          });
          await checkBanner(adminCover);
          await select(adminPage, filename);
          await adminPage.route("https://api.cloudinary.com/**", (route) =>
            route.abort(),
          );
          await save(adminPage);
          await adminPage
            .getByRole("alert")
            .getByText(/Không tải được ảnh lên/)
            .waitFor();
          expect(await adminCover.getAttribute("src")).toEqual(first);
          await adminPage.unroute("https://api.cloudinary.com/**");
          let lost = false;
          await adminPage.route(
            "**/api/identity" + path + "/cover",
            async (route) => {
              if (lost) return route.continue();
              const response = await route.fetch();
              if (!response.ok()) return route.fulfill({ response });
              lost = true;
              return route.abort();
            },
          );
          await save(adminPage);
          await adminPage.getByText("Đã cập nhật ảnh bìa.").waitFor();
          await checkBanner(adminCover);
          const second = await adminCover.getAttribute("src");
          expect(second).not.toEqual(first);
          expect(lost).toBe(true);
          expect(commits).toHaveLength(3);
          expect(commits[1]).toEqual(commits[2]);
          expect(uploadHasBearer).toBe(false);

          await select(ownerPage, filename);
          await save(ownerPage);
          await ownerPage
            .getByRole("alert")
            .getByText(/Ảnh bìa đã thay đổi/)
            .waitFor();
          expect(await ownerCover.getAttribute("src")).toEqual(second);
          await adminPage
            .getByRole("navigation", { name: "Tổ chức của tôi" })
            .getByRole("link")
            .click();
          const thumb = adminPage
            .getByRole("row")
            .filter({ hasText: "Browser cover organization" })
            .locator("img");
          await thumb.waitFor();
          expect(await thumb.getAttribute("src")).toEqual(second);
          expect(await thumb.boundingBox()).toMatchObject({
            width: 96,
            height: 32,
          });
          await adminPage.reload();
          await thumb.waitFor();
          expect(await thumb.getAttribute("src")).toEqual(second);
          expect(
            await adminPage.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        } finally {
          await Promise.all([ownerContext.close(), adminContext.close()]);
          const intents = await apps.db.mediaUploadIntent.findMany({
            where: { organization_id: org },
          });
          await Promise.allSettled(
            intents.map((intent) =>
              cloudinary!.destroy(intent.expected_public_id),
            ),
          );
        }
      },
      90000,
    );

    it("Identity pages: real Account, refresh-only bootstrap, Profile updates across tabs, auto-slug and deep link", async () => {
      const actor = await pageUser("Account Browser");
      const context = await browserSession(actor, true);
      const account = await context.newPage(),
        organizations = await context.newPage();
      let refreshes = 0;
      context.on("request", (request) => {
        if (request.url().endsWith("/api/identity/auth/refresh")) refreshes++;
      });
      try {
        await Promise.all([
          account.goto(origin + "/me"),
          organizations.goto(origin + "/organizations"),
        ]);
        await account
          .getByRole("heading", { name: "Tài khoản của tôi" })
          .waitFor();
        await account.getByText(actor.email, { exact: true }).waitFor();
        await organizations
          .getByText(/Bạn chưa tham gia tổ chức nào/)
          .first()
          .waitFor();
        expect(refreshes).toBe(1);
        const open = organizations
          .getByRole("button", { name: "Tạo tổ chức", exact: true })
          .first();
        await open.focus();
        await organizations.keyboard.press("Enter");
        const dialog = organizations.getByRole("dialog", {
          name: "Tạo tổ chức",
        });
        await dialog.getByRole("textbox", { name: /Tên tổ chức/ }).waitFor();
        expect(
          await dialog
            .getByRole("textbox", { name: /Tên tổ chức/ })
            .evaluate((input) => input === document.activeElement),
        ).toBe(true);
        await dialog
          .getByRole("textbox", { name: /Tên tổ chức/ })
          .fill("CLB Công nghệ");
        await organizations.keyboard.press("Tab");
        const description = dialog.getByRole("textbox", {
          name: /Mô tả tổ chức/,
        });
        expect(
          await description.evaluate(
            (input) => input === document.activeElement,
          ),
        ).toBe(true);
        await description.fill("Chia sẻ dự án.\nGặp nhau thứ Năm.");
        const result = organizations.waitForResponse(
          (response) =>
            response.url().endsWith("/api/identity/organizations") &&
            response.request().method() === "POST",
        );
        await dialog
          .getByRole("button", { name: "Tạo tổ chức", exact: true })
          .click();
        const created = await result;
        expect(created.status()).toBe(201);
        expect(created.request().postDataJSON()).toEqual({
          name: "CLB Công nghệ",
          description: "Chia sẻ dự án.\nGặp nhau thứ Năm.",
        });
        const { organization_id: id } = await created.json();
        await account
          .getByRole("link", { name: /CLB Công nghệ/ })
          .first()
          .waitFor();
        await organizations.goto(origin + "/organizations/" + id);
        await organizations
          .getByRole("heading", { name: "CLB Công nghệ", exact: true })
          .first()
          .waitFor();
        await organizations
          .getByText(/clb-cong-nghe/)
          .first()
          .waitFor();
        await organizations.getByText(/Chia sẻ dự án/).waitFor();

        const another = await browser.newContext();
        try {
          const deep = await another.newPage();
          await deep.goto(
            origin + "/auth?next=" + encodeURIComponent("/organizations/" + id),
          );
          await fillLogin(deep, actor.email, actor.password);
          await deep.waitForURL(origin + "/organizations/" + id);
        } finally {
          await another.close();
        }
      } finally {
        await context.close();
      }
    }, 60000);

    it("Identity pages: lost committed create retries with the original key and keeps a receipt after Profile read failure", async () => {
      const actor = await pageUser("Create fault Browser");
      const context = await browserSession(actor);
      const page = await context.newPage();
      const writes: Array<{ key?: string; body: unknown }> = [];
      try {
        await page.goto(origin + "/organizations");
        await page
          .getByText(/Bạn chưa tham gia tổ chức nào/)
          .first()
          .waitFor();
        await page.route("**/api/identity/organizations", async (route) => {
          const request = route.request();
          writes.push({
            key: request.headers()["idempotency-key"],
            body: request.postDataJSON(),
          });
          const response = await route.fetch();
          if (writes.length === 1) await route.abort("failed");
          else await route.fulfill({ response });
        });
        await page.route("**/api/identity/users/me", (route) =>
          route.fulfill({
            status: 502,
            json: { error: { code: "UPSTREAM_UNAVAILABLE" } },
          }),
        );
        await page
          .getByRole("button", { name: "Tạo tổ chức", exact: true })
          .first()
          .click();
        const dialog = page.getByRole("dialog", { name: "Tạo tổ chức" });
        await dialog.getByRole("textbox", { name: /Tên tổ chức/ }).fill("Đ");
        await dialog
          .getByRole("button", { name: "Tạo tổ chức", exact: true })
          .click();
        await page
          .getByRole("button", { name: /Kiểm tra lại thao tác/ })
          .click();
        await dialog.getByRole("link", { name: /Mở tổ chức/ }).waitFor();
        await dialog
          .getByText("Đã tạo tổ chức. Danh sách chưa được cập nhật.")
          .waitFor();
        expect(writes.length).toBe(2);
        expect(writes[0]).toEqual(writes[1]);
        expect(writes[0].body).toEqual({ name: "Đ" });
        expect(
          await apps.db.organization.count({ where: { created_by: actor.id } }),
        ).toBe(1);
      } finally {
        await context.close();
      }
    }, 45000);

    it("Identity pages: invite, reload sent rows, revoke, then recipient accepts a new invitation", async () => {
      const owner = await pageUser("Invitation Owner");
      const recipient = await pageUser("Invitation Recipient");
      const outsider = await pageUser("Invitation Outsider");
      const org = await providerOrg(owner, "Browser Invitation Org");
      const ownerContext = await browserSession(owner);
      const recipientContext = await browserSession(recipient);
      const ownerPage = await ownerContext.newPage(),
        inbox = await recipientContext.newPage();
      const sent = "/organizations/" + org + "/members/invitations";
      try {
        expect(
          (await pageApi(outsider, sent + "?limit=20&offset=0")).status,
        ).toBe(403);
        await ownerPage.goto(origin + "/organizations/" + org);
        const sentTab = ownerPage.getByRole("tab", { name: "Lời mời đã gửi" });
        await sentTab.click();
        await ownerPage
          .getByRole("button", { name: "Mời thành viên", exact: true })
          .first()
          .click();
        const invite = ownerPage.getByRole("dialog", {
          name: "Mời thành viên",
        });
        await invite
          .getByRole("textbox", { name: /Địa chỉ email/ })
          .fill(recipient.email);
        const created = ownerPage.waitForResponse(
          (r) => r.url().endsWith(sent) && r.request().method() === "POST",
        );
        await invite
          .getByRole("button", { name: "Tạo lời mời trong ứng dụng" })
          .click();
        expect((await created).status()).toBe(201);
        await ownerPage.reload();
        await sentTab.click();
        const row = ownerPage.getByRole("article", {
          name: "Invitation Recipient",
        });
        await row.getByText(recipient.email, { exact: true }).waitFor();
        await row.getByRole("button", { name: "Thu hồi lời mời" }).click();
        const revoke = ownerPage.getByRole("dialog", {
          name: "Thu hồi lời mời?",
        });
        const revoked = ownerPage.waitForResponse((r) =>
          r.url().endsWith("/revoke"),
        );
        await revoke.getByRole("button", { name: "Thu hồi lời mời" }).click();
        expect((await revoked).status()).toBe(200);
        await inbox.goto(origin + "/me/invitations");
        await inbox.getByRole("heading", { name: "Lời mời của tôi" }).waitFor();
        await inbox
          .getByText(/Đã thu hồi/)
          .first()
          .waitFor();

        const next = await pageApi(owner, sent, "POST", {
          email: recipient.email,
          roles: [],
        });
        expect(next.status).toBe(201);
        await inbox.reload();
        await inbox
          .getByRole("button", { name: "Chấp nhận", exact: true })
          .click();
        const accept = inbox.getByRole("dialog", { name: /Chấp nhận lời mời/ });
        const accepted = inbox.waitForResponse((r) =>
          r.url().endsWith("/accept"),
        );
        await accept
          .getByRole("button", { name: "Chấp nhận", exact: true })
          .click();
        expect((await accepted).status()).toBe(200);
        await inbox.goto(origin + "/organizations/" + org);
        await inbox
          .getByRole("heading", { name: "Browser Invitation Org", exact: true })
          .first()
          .waitFor();
        expect(
          await inbox.getByRole("tab", { name: "Lời mời đã gửi" }).count(),
        ).toBe(0);
      } finally {
        await ownerContext.close();
        await recipientContext.close();
      }
    }, 60000);

    it("Identity pages: org 403 retains Profile, then LOCKED profile 403 clears session", async () => {
      const actor = await pageUser("Locked Browser");
      const owner = await pageUser("Other Browser");
      const org = await providerOrg(owner, "Private Organization");
      const context = await browserSession(actor);
      const page = await context.newPage();
      try {
        const path = "/api/identity/organizations/" + org;
        const orgForbidden = page.waitForResponse(
          (r) => r.url().endsWith(path) && r.status() === 403,
        );
        await page.goto(origin + "/organizations/" + org);
        await orgForbidden;
        await page.getByRole("button", { name: "Đăng xuất" }).waitFor();
        expect(
          await page
            .getByRole("heading", { name: "Private Organization" })
            .count(),
        ).toBe(0);
        await apps.db.user.update({
          where: { id: actor.id },
          data: { status: "LOCKED" },
        });
        await page.goto(origin + "/me");
        await page.waitForFunction(() => {
          const value = JSON.parse(
            localStorage.getItem("lamu.session.v2.real")!,
          );
          return (
            value.unavailable && value.access === null && value.refresh === null
          );
        });
        expect(await page.getByText(actor.email, { exact: true }).count()).toBe(
          0,
        );
      } finally {
        await context.close();
      }
    }, 45000);

    it("Identity pages: ADMIN reads members, OWNER gets last-owner error and can self-demote only after promotion", async () => {
      const owner = await pageUser("First Browser Owner");
      const admin = await pageUser("Browser Admin");
      const org = await providerOrg(owner, "Browser Roles Org");
      const path = "/organizations/" + org;
      const invitation = await pageApi(
        owner,
        path + "/members/invitations",
        "POST",
        {
          email: admin.email,
          roles: [{ code: "ADMIN", resource_type: "ORG", resource_id: org }],
        },
      );
      expect(invitation.status).toBe(201);
      const { invitation_id: invite } = (await invitation.json()) as {
        invitation_id: string;
      };
      expect(
        (
          await pageApi(
            admin,
            "/users/me/invitations/" + invite + "/accept",
            "POST",
          )
        ).status,
      ).toBe(200);
      const ownerContext = await browserSession(owner);
      const adminContext = await browserSession(admin);
      try {
        const ownerPage = await ownerContext.newPage();
        const adminPage = await adminContext.newPage();
        await Promise.all([
          ownerPage.goto(origin + path),
          adminPage.goto(origin + path),
        ]);
        const members = (page: Page) =>
          page.getByRole("tab", { name: "Thành viên", exact: true });
        await members(adminPage).click();
        await adminPage
          .getByText("First Browser Owner", { exact: true })
          .first()
          .waitFor();
        expect(
          await adminPage.getByRole("button", { name: "Đổi vai trò" }).count(),
        ).toBe(0);
        expect(
          await adminPage.getByRole("tab", { name: "Lời mời đã gửi" }).count(),
        ).toBe(0);
        await members(ownerPage).click();
        const openEditor = async (name: string) => {
          await ownerPage
            .getByRole("row")
            .filter({ hasText: name })
            .getByRole("button", { name: "Đổi vai trò" })
            .click();
          return ownerPage.getByRole("dialog", { name: "Đổi vai trò" });
        };
        const save = async (
          dialog: Awaited<ReturnType<typeof openEditor>>,
          target: string,
        ) => {
          const response = ownerPage.waitForResponse((r) =>
            r.url().endsWith("/members/" + target + "/roles"),
          );
          await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
          return response;
        };
        const ownDialog = await openEditor("First Browser Owner");
        await ownDialog
          .getByRole("checkbox", { name: /Không có vai trò/ })
          .check();
        const denied = await save(ownDialog, owner.id);
        expect(denied.status()).toBe(409);
        expect(
          ((await denied.json()) as { error: { code: string } }).error.code,
        ).toBe("LAST_OWNER_REQUIRED");
        await ownDialog.getByText(/ít nhất một chủ sở hữu/i).waitFor();
        await ownerPage.keyboard.press("Escape");
        const promote = await openEditor("Browser Admin");
        await promote.getByRole("checkbox", { name: /^OWNER/ }).check();
        expect((await save(promote, admin.id)).status()).toBe(200);
        await promote.waitFor({ state: "hidden" });
        const demote = await openEditor("First Browser Owner");
        await demote
          .getByRole("checkbox", { name: /Không có vai trò/ })
          .check();
        expect((await save(demote, owner.id)).status()).toBe(200);
        await ownerPage
          .getByRole("tab", { name: "Lời mời đã gửi" })
          .waitFor({ state: "hidden" });
        await ownerPage
          .getByRole("heading", { name: "Browser Roles Org", exact: true })
          .first()
          .waitFor();
        expect(
          (await pageApi(owner, path + "/members/invitations")).status,
        ).toBe(403);
        expect(
          (await pageApi(admin, path + "/members/invitations")).status,
        ).toBe(200);
      } finally {
        await ownerContext.close();
        await adminContext.close();
      }
    }, 60000);

    it("Identity pages: server inbox pagination renders the EVENT snapshot and allows bodyless decline", async () => {
      const owner = await pageUser("Pagination Inbox Owner");
      const recipient = await pageUser("Pagination Inbox Recipient");
      const org = await providerOrg(owner, "Paginated Invitations Org");
      const created = await pageApi(
        owner,
        `/organizations/${org}/members/invitations`,
        "POST",
        {
          email: recipient.email,
          roles: [],
        },
      );
      expect(created.status).toBe(201);
      const { invitation_id: target } = (await created.json()) as {
        invitation_id: string;
      };
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      await apps.db.organizationInvitation.update({
        where: { id: target },
        data: {
          created_at: new Date(now - 2 * day),
          expires_at: new Date(now + 5 * day),
          roles: [
            {
              code: "SPEAKER",
              resource_type: "EVENT",
              resource_id: randomUUID(),
            },
          ],
        },
      });
      await apps.db.organizationInvitation.createMany({
        data: Array.from({ length: 20 }, (_, index) => {
          const createdAt = new Date(now - (index + 1) * 1000);
          return {
            organization_id: org,
            inviter_user_id: owner.id,
            invitee_user_id: recipient.id,
            roles: [],
            status: "DECLINED",
            created_at: createdAt,
            expires_at: new Date(createdAt.getTime() + 7 * day),
            processed_at: createdAt,
          };
        }),
      });
      const context = await browserSession(recipient);
      const page = await context.newPage();
      try {
        await page.goto(origin + "/me/invitations");
        await page
          .getByRole("navigation", { name: "Phân trang lời mời" })
          .waitFor();
        expect(await page.getByRole("article").count()).toBe(20);
        expect(
          (
            await page
              .getByRole("navigation", { name: "Phân trang lời mời" })
              .innerText()
          ).includes("21"),
        ).toBe(true);

        const secondPage = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/identity/users/me/invitations" &&
            url.searchParams.get("limit") === "20" &&
            url.searchParams.get("offset") === "20"
          );
        });
        await page.getByRole("button", { name: "Sau", exact: true }).click();
        const paged = await secondPage;
        expect(paged.status()).toBe(200);
        expect((await paged.json()).total).toBe(21);

        const article = page.getByRole("article", {
          name: "Paginated Invitations Org",
        });
        const decline = article.getByRole("button", {
          name: "Từ chối",
          exact: true,
        });
        await decline.waitFor();
        await article
          .getByText("Phạm vi sự kiện chưa được tích hợp", { exact: true })
          .waitFor();
        expect(
          await article
            .getByRole("button", { name: "Chấp nhận", exact: true })
            .isDisabled(),
        ).toBe(true);
        expect(await page.getByRole("article").count()).toBe(1);
        await decline.click();
        const declined = page.waitForResponse((response) =>
          response.url().endsWith(`/${target}/decline`),
        );
        await page
          .getByRole("dialog", { name: "Từ chối lời mời?" })
          .getByRole("button", { name: "Từ chối", exact: true })
          .click();
        const result = await declined;
        expect(result.status()).toBe(200);
        expect(result.request().postData()).toBeNull();
        await page.getByText("Đã từ chối lời mời.", { exact: true }).waitFor();
        expect(
          (
            await apps.db.organizationInvitation.findUniqueOrThrow({
              where: { id: target },
            })
          ).status,
        ).toBe("DECLINED");
      } finally {
        await context.close();
      }
    }, 45_000);

    it("Identity pages: lost accepted response retries the same empty request after the row is terminal", async () => {
      const owner = await pageUser("Lost Accept Owner");
      const recipient = await pageUser("Lost Accept Recipient");
      const org = await providerOrg(owner, "Lost Accept Org");
      const created = await pageApi(
        owner,
        `/organizations/${org}/members/invitations`,
        "POST",
        {
          email: recipient.email,
          roles: [],
        },
      );
      expect(created.status).toBe(201);
      const { invitation_id: target } = (await created.json()) as {
        invitation_id: string;
      };
      const context = await browserSession(recipient);
      const page = await context.newPage();
      const requests: Array<{
        key?: string;
        body: string | null;
        status: number;
      }> = [];
      try {
        await page.route(
          `**/api/identity/users/me/invitations/${target}/accept`,
          async (route) => {
            const upstream = await route.fetch();
            requests.push({
              key: route.request().headers()["idempotency-key"],
              body: route.request().postData(),
              status: upstream.status(),
            });
            if (requests.length === 1) await route.abort("failed");
            else await route.fulfill({ response: upstream });
          },
        );

        await page.goto(origin + "/me/invitations");
        const article = page.getByRole("article", { name: "Lost Accept Org" });
        await article
          .getByRole("button", { name: "Chấp nhận", exact: true })
          .click();
        const dialog = page.getByRole("dialog", { name: "Chấp nhận lời mời?" });
        await dialog
          .getByRole("button", { name: "Chấp nhận", exact: true })
          .click();
        const check = dialog.getByRole("button", {
          name: "Kiểm tra lại thao tác",
        });
        await check.waitFor();
        await dialog
          .getByRole("button", { name: "Quay lại", exact: true })
          .click();
        await article.getByText("Đã chấp nhận", { exact: true }).waitFor();
        await article
          .getByRole("button", { name: "Kiểm tra lại thao tác" })
          .click();
        await check.click();
        await page
          .getByText("Đã chấp nhận lời mời.", { exact: true })
          .waitFor();
        expect(requests).toHaveLength(2);
        expect(requests[0].key).toBeTruthy();
        expect(requests[0].body).toBeNull();
        expect(requests[0].status).toBe(200);
        expect(requests[1]).toEqual(requests[0]);
        expect(
          await apps.db.membership.count({
            where: { organization_id: org, user_id: recipient.id },
          }),
        ).toBe(1);
      } finally {
        await context.close();
      }
    }, 45_000);

    it("Identity pages: OWNER permission loss purges sent contacts while keeping the active session", async () => {
      const owner = await pageUser("Original Owner");
      const coOwner = await pageUser("New Owner");
      const invitee = await pageUser("Sent Privacy Recipient");
      const org = await providerOrg(owner, "Private Sent Org");
      const path = "/organizations/" + org;
      const sent = path + "/members/invitations";
      const invited = await pageApi(owner, sent, "POST", {
        email: coOwner.email,
        roles: [{ code: "OWNER", resource_type: "ORG", resource_id: org }],
      });
      expect(invited.status).toBe(201);
      const { invitation_id: id } = (await invited.json()) as {
        invitation_id: string;
      };
      expect(
        (
          await pageApi(
            coOwner,
            "/users/me/invitations/" + id + "/accept",
            "POST",
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await pageApi(owner, sent, "POST", {
            email: invitee.email,
            roles: [],
          })
        ).status,
      ).toBe(201);
      const context = await browserSession(owner);
      const page = await context.newPage();
      try {
        await page.goto(origin + path);
        const sentTab = page.getByRole("tab", { name: "Lời mời đã gửi" });
        const overview = page.getByRole("tab", {
          name: "Tổng quan",
          exact: true,
        });
        await overview.focus();
        await page.keyboard.press("End");
        expect(await sentTab.getAttribute("aria-selected")).toBe("true");
        await page.getByText(invitee.email, { exact: true }).waitFor();
        expect(
          await page.evaluate(
            (email) => JSON.stringify(localStorage).includes(email),
            invitee.email,
          ),
        ).toBe(false);
        expect(
          (
            await pageApi(
              coOwner,
              path + "/members/" + owner.id + "/roles",
              "PUT",
              { roles: [] },
            )
          ).status,
        ).toBe(200);
        const denied = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === "/api/identity" + sent &&
            r.status() === 403,
        );
        await page
          .getByRole("button", { name: "Tải lại", exact: true })
          .click();
        expect((await denied).status()).toBe(403);
        await sentTab.waitFor({ state: "hidden" });
        await page
          .getByRole("heading", { name: "Private Sent Org", exact: true })
          .first()
          .waitFor();
        expect(await sentTab.count()).toBe(0);
        expect(
          await page.getByText(invitee.email, { exact: true }).count(),
        ).toBe(0);
        await page
          .getByRole("button", { name: "Đăng xuất", exact: true })
          .waitFor();
      } finally {
        await context.close();
      }
    }, 45000);

    it("Identity pages: failed logout reports local clear and a second tab loses its Profile", async () => {
      const actor = await pageUser("Logout Browser");
      const context = await browserSession(actor);
      try {
        const page = await context.newPage(),
          second = await context.newPage();
        await Promise.all([
          page.goto(origin + "/me"),
          second.goto(origin + "/me"),
        ]);
        await page.getByText(actor.email, { exact: true }).waitFor();
        await second.getByText(actor.email, { exact: true }).waitFor();
        await page.route("**/api/identity/auth/logout", (route) =>
          route.fulfill({
            status: 502,
            json: { error: { code: "UPSTREAM_UNAVAILABLE" } },
          }),
        );
        await page
          .getByRole("button", { name: "Đăng xuất", exact: true })
          .click();
        await page
          .getByText(/Chưa xác nhận được việc thu hồi phiên trên máy chủ/)
          .waitFor();
        expect(page.url()).toBe(origin + "/me");
        expect(await page.getByText(actor.email, { exact: true }).count()).toBe(
          0,
        );
        await second.waitForURL(origin + "/auth?next=%2Fme");
        expect(
          await second.getByText(actor.email, { exact: true }).count(),
        ).toBe(0);
      } finally {
        await context.close();
      }
    }, 45000);

    it("Identity pages: switching organizations discards a late sent-list response and production ignores preview query", async () => {
      const owner = await pageUser("Switch Owner");
      const recipient = await pageUser("Switch Recipient");
      const first = await providerOrg(owner, "Switch Org A");
      const second = await providerOrg(owner, "Switch Org B");
      const firstUrl = "/organizations/" + first;
      const sent = firstUrl + "/members/invitations";
      expect(
        (
          await pageApi(owner, sent, "POST", {
            email: recipient.email,
            roles: [],
          })
        ).status,
      ).toBe(201);
      const context = await browserSession(owner);
      const page = await context.newPage();
      let ready!: () => void, release!: () => void, completed!: () => void;
      const responseRead = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const routeDone = new Promise<void>((resolve) => {
        completed = resolve;
      });
      try {
        await page.route("**/api/identity" + sent + "?*", async (route) => {
          try {
            const upstream = await route.fetch();
            if (upstream.status() !== 200)
              throw new Error("Expected an authorized sent-list response");
            ready();
            await hold;
            await route.fulfill({ response: upstream }).catch(() => {});
          } finally {
            completed();
          }
        });
        await page.goto(origin + firstUrl + "?detailPreview=forbidden");
        await page
          .getByRole("heading", { name: "Switch Org A", exact: true })
          .first()
          .waitFor();
        const theme = page.getByRole("button", {
          name: "Chuyển chế độ sáng tối",
        });
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        await theme.click();
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "light",
        );
        await page.getByRole("tab", { name: "Lời mời đã gửi" }).click();
        await responseRead;
        await page
          .getByRole("link", { name: "Tổ chức của tôi", exact: true })
          .click();
        await page
          .getByRole("link", { name: "Mở tổ chức: Switch Org B", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Switch Org B", exact: true })
          .first()
          .waitFor();
        release();
        await routeDone;
        await page.getByRole("tab", { name: "Lời mời đã gửi" }).click();
        await page
          .getByText("Chưa có lời mời đã gửi.", { exact: true })
          .waitFor();
        expect(
          await page.getByText(recipient.email, { exact: true }).count(),
        ).toBe(0);
      } finally {
        release();
        await context.close();
      }
    }, 45000);

    it("F06/T16: stopped Gateway produces real 502 and never mock login success", async () => {
      await apps.gateway.close();
      const response = await fetch(origin + "/api/identity/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "demo@luma.dev",
          password: "password123",
        }),
      });
      expect(response.status).toBe(502);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("UPSTREAM_UNAVAILABLE");
    });
  },
);
