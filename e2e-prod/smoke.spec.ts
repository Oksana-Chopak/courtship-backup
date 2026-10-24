// PRODUCTION smoke, in a real browser, no mocks (2026-10-24).
// Every screen a player can reach as a guest — and, with a monitor account,
// every member screen — must open on court-ship.com without an error boundary,
// without a leaked dictionary key, without uncaught JS errors, and with the
// thing the screen exists for visible. Failures reach Oksana's Telegram through
// scripts/watch-report.mjs (screenshot attached).
//
// Env: WATCH_SITE (default https://court-ship.com), WATCH_EMAIL + WATCH_PASSWORD
// (optional monitor account → member screens), SUPABASE anon key is read from
// .env / VITE_SUPABASE_PUBLISHABLE_KEY (public).
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { collectErrors, ERROR_TEXTS, findRawKey, mockSupabase } from "../e2e/helpers";

// WATCH_MOCK=1 runs this spec against the local build with the network mock —
// only to prove the selectors and flows themselves (the sandbox cannot reach
// production). Real runs have no mocks at all.
const MOCK = process.env.WATCH_MOCK === "1";
test.beforeEach(async ({ page }) => { if (MOCK) await mockSupabase(page, "guest"); });

const SITE = (process.env.WATCH_SITE || "https://court-ship.com").replace(/\/$/, "");
function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  try { return readFileSync(".env", "utf8").match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"))?.[1] ?? ""; } catch { return ""; }
}
const SB_URL = env("VITE_SUPABASE_URL");
const ANON = env("VITE_SUPABASE_PUBLISHABLE_KEY");

/** Console noise that is not a broken screen. */
const NOISE = [/ResizeObserver/, /favicon/, /third-party cookie/i, /Download the React DevTools/, /\[vite\]/, /preload/i, /net::ERR_BLOCKED_BY_CLIENT/, /service worker/i, /sw\.js/];
const real = (msgs: string[]) => msgs.filter((m) => !NOISE.some((n) => n.test(m)));

async function assertHealthy(page: Page, where: string, errs: { pageErrors: string[]; consoleErrors: string[] }) {
  const text = await page.locator("body").innerText();
  for (const bad of ERROR_TEXTS) expect(text, `${where}: a player would see an error — “${bad}”`).not.toContain(bad);
  const key = findRawKey(text);
  expect(key, `${where}: a dictionary key leaked onto the screen → ${key}`).toBeNull();
  expect(real(errs.pageErrors), `${where}: uncaught JS error`).toEqual([]);
}

async function open(page: Page, path: string): Promise<{ pageErrors: string[]; consoleErrors: string[] }> {
  const errs = collectErrors(page);
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(res?.status(), `${path}: HTTP status`).toBeLessThan(400);
  await page.waitForLoadState("networkidle").catch(() => {});
  return errs;
}

// ── what is on the board right now (so share pages are checked with live ids) ─
async function latest(): Promise<{ eventId: string | null; gameId: string | null }> {
  if (!SB_URL || !ANON) return { eventId: null, gameId: null };
  const h = { apikey: ANON, Authorization: `Bearer ${ANON}`, "content-type": "application/json" };
  let eventId: string | null = null, gameId: string | null = null;
  try {
    const ev = await fetch(`${SB_URL}/rest/v1/event_requests?select=id&status=eq.approved&starts_at=gt.${new Date().toISOString()}&order=starts_at.asc&limit=1`, { headers: h }).then((r) => r.json());
    eventId = Array.isArray(ev) && ev[0]?.id ? String(ev[0].id) : null;
  } catch { /* no event */ }
  try {
    const b = await fetch(`${SB_URL}/rest/v1/rpc/public_board`, { method: "POST", headers: h, body: "{}" }).then((r) => r.json());
    gameId = Array.isArray(b) && b[0]?.id ? String(b[0].id) : null;
  } catch { /* no game */ }
  return { eventId, gameId };
}

test.describe("guest screens", () => {
  test("landing: headline, the live pulse and the way in", async ({ page }) => {
    const errs = await open(page, "/");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("link", { name: /Look around|Titta runt/i }).first()).toBeVisible();
    await assertHealthy(page, "/", errs);
  });

  test("board: opens for a guest and shows games or an honest empty state", async ({ page }) => {
    const errs = await open(page, "/board");
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForTimeout(1500); // data arrives after the shell
    const text = await page.getByRole("main").innerText();
    expect(text.length, "/board rendered nothing").toBeGreaterThan(40);
    await assertHealthy(page, "/board", errs);
  });

  for (const path of ["/players", "/leaders"]) {
    test(`${path}: opens for a guest`, async ({ page }) => {
      const errs = await open(page, path);
      await expect(page.getByRole("main")).toBeVisible();
      await page.waitForTimeout(1200);
      await assertHealthy(page, path, errs);
    });
  }

  test("sign-in page: Google button + email form, both modes", async ({ page }) => {
    for (const mode of ["login", "signup"]) {
      const errs = await open(page, `/auth?mode=${mode}`);
      await expect(page.locator("#auth-email")).toBeVisible();
      await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
      await assertHealthy(page, `/auth?mode=${mode}`, errs);
    }
  });

  test("“Sign in with Google” really hands the browser to Google", async ({ page, context }) => {
    test.skip(MOCK, "needs the real broker");
    await open(page, "/auth?mode=login");
    const btn = page.getByRole("button", { name: /Google/ });
    await expect(btn).toBeVisible();
    // the app goes to /~oauth/initiate (Lovable's broker) which must 302 to Google
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/~oauth/initiate"), { timeout: 15000 }),
      btn.click(),
    ]);
    expect(req.url()).toContain("provider=google");
    expect(req.url()).toContain(encodeURIComponent(`${SITE}/auth`));
    await page.waitForURL(/accounts\.google\.com|oauth\.lovable\.app/, { timeout: 20000 });
    expect(page.url(), "the broker did not reach Google").toMatch(/accounts\.google\.com/);
    await context.clearCookies();
  });

  test("post-a-game wizard opens for a guest (step 1 of 3)", async ({ page }) => {
    const errs = await open(page, "/post");
    await expect(page.getByText("1/3")).toBeVisible();
    await assertHealthy(page, "/post", errs);
  });

  test("share pages for the newest event and game render server-side with their content", async ({ page }) => {
    const { eventId, gameId } = await latest();
    test.skip(!eventId && !gameId, "nothing public on the board right now");
    if (eventId) {
      const errs = await open(page, `/e/${eventId}`);
      await expect(page.getByRole("button", { name: /I'm in|Jag är med|in/i }).first()).toBeVisible();
      await assertHealthy(page, `/e/${eventId}`, errs);
    }
    if (gameId) {
      const errs = await open(page, `/g/${gameId}`);
      await expect(page.getByText(/Courtship/).first()).toBeVisible();
      await assertHealthy(page, `/g/${gameId}`, errs);
    }
  });

  test("legal pages and the email-check page open", async ({ page }) => {
    for (const path of ["/privacy", "/terms", "/check-email?email=a%40b.se"]) {
      const errs = await open(page, path);
      await expect(page.locator("body")).toContainText(/Courtship/);
      await assertHealthy(page, path, errs);
    }
  });
});

const EMAIL = process.env.WATCH_EMAIL ?? "";
const PASSWORD = process.env.WATCH_PASSWORD ?? "";

test.describe("member screens (monitor account)", () => {
  test.skip(!EMAIL || !PASSWORD, "WATCH_EMAIL / WATCH_PASSWORD not set");

  test("sign in with email, then every member screen opens", async ({ page }) => {
    test.setTimeout(150_000);
    const errs = await open(page, "/auth?mode=login");
    await page.locator("#auth-email").fill(EMAIL);
    await page.locator("input[type=password]").first().fill(PASSWORD);
    await page.locator("form button[type=submit], form button:not([type=button])").first().click();
    await page.waitForURL(/\/(board|onboarding)/, { timeout: 30000 });
    expect(page.url(), "the monitor account must have a profile — it landed on onboarding").not.toContain("/onboarding");
    await assertHealthy(page, "/auth → sign in", errs);

    const screens: Array<[string, RegExp]> = [
      ["/board", /./],
      ["/me", /./],
      ["/players", /./],
      ["/settings", /./],
      ["/games", /./],
      ["/progress", /./],
      ["/help", /./],
      ["/sos/new", /1\/3/],
      ["/events/new", /./],
      ["/leaders", /./],
    ];
    for (const [path, must] of screens) {
      const e = await open(page, path);
      await expect(page.getByRole("main")).toBeVisible();
      await page.waitForTimeout(1000);
      const text = await page.getByRole("main").innerText();
      expect(text, `${path}: must show ${must}`).toMatch(must);
      expect(page.url(), `${path}: bounced to sign-in — the session was lost`).not.toMatch(/\/auth\b/);
      await assertHealthy(page, path, e);
    }
    // the shell's tab bar is there (the member chrome rendered)
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
});
