// The shared-event funnel, end to end (2026-11 Stockholm Open ticket draw:
// one /e/<id> link posted in Facebook groups, WhatsApp, Meetup and Instagram).
//   guest opens the link → "I'm in" → signup keeps the event + the sharer's code
//   → (onboarding hands off to the saved destination) → the board books them.
// Plus the in-app-browser trap: Facebook/Instagram webviews must not offer
// Google sign-in, which Google blocks there (403 disallowed_useragent).
import { test, expect, type Page } from "@playwright/test";
import { mockSupabase, EVENT } from "./helpers";

const SB = "**/*.supabase.co/**";
const INSTAGRAM_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.21.82 (iPhone15,2; iOS 18_1; sv_SE; sv; scale=3.00; 1179x2556; 648420713)";
const FACEBOOK_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/479.0.0.48.110;]";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

test("guest: shared event link → I'm in → signup carries the event and the sharer's code", async ({ page }) => {
  await mockSupabase(page, "guest");
  await page.goto("/e/e-1?code=OKSANA-007");
  await expect(page.getByText(EVENT.title)).toBeVisible();
  await page.getByRole("button", { name: /I'm in/ }).click();
  await expect(page).toHaveURL(/\/auth/);
  const url = new URL(page.url());
  expect(url.searchParams.get("code")).toBe("OKSANA-007");
  expect(await page.evaluate(() => localStorage.getItem("courtship.next"))).toBe("/board?join_event=e-1");
  // The invite code reached the form (prefilled, optional)
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
});

for (const [name, ua] of [["Instagram", INSTAGRAM_UA], ["Facebook", FACEBOOK_UA]] as const) {
  test.describe(`inside the ${name} app`, () => {
    test.use({ userAgent: ua });
    test("no Google button (blocked there) — email signup with a one-line why", async ({ page }) => {
      await mockSupabase(page, "guest");
      await page.goto("/e/e-1?code=OKSANA-007");
      await page.getByRole("button", { name: /I'm in/ }).click();
      await expect(page).toHaveURL(/\/auth/);
      await settle(page);
      await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
      await expect(page.getByText(/Google sign-in is blocked/)).toBeVisible();
      await expect(page.locator("input[type=email]")).toBeVisible();
      await expect(page.locator("input[type=password]")).toBeVisible();
    });
  });
}

test("a normal browser still offers Google and shows no in-app note", async ({ page }) => {
  await mockSupabase(page, "guest");
  await page.goto("/auth");
  await settle(page);
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
  await expect(page.getByText(/Google sign-in is blocked/)).toHaveCount(0);
});

test("after onboarding the new member lands on /board?join_event and is booked exactly once", async ({ page }) => {
  await mockSupabase(page, "member");
  const joins: string[] = [];
  await page.route(SB, async (route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/rpc/join_event")) {
      joins.push(route.request().postData() ?? "");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ ok: true, reason: "ok", attendee_status: "booked" }]) });
    }
    return route.fallback();
  });
  await page.goto("/board?join_event=e-1");
  await expect(page.locator("#ev-e-1")).toBeVisible();
  await settle(page);
  expect(joins.length, "booked exactly once").toBe(1);
  expect(joins[0]).toContain("e-1");
  await expect(page).not.toHaveURL(/join_event/);
});
