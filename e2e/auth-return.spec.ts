// The Google sign-in RETURN leg (2026-10-24, "вхід через Google злітає").
// Lovable's broker / Supabase land on /auth with the outcome in the URL hash.
// Three things must hold, and none did before:
//   1. an error in the hash is SAID (toast) and REPORTED (Admin → Health), not
//      swallowed into a silent login form;
//   2. tokens in the hash sign the player in and land them on the board;
//   3. tokens that supabase-js cannot turn into a session are reported too.
import { test, expect } from "@playwright/test";
import { mockSupabase, ME_USER, profile } from "./helpers";

const TOKENS = "#access_token=fake-access&refresh_token=fake-refresh&expires_in=3600&token_type=bearer&type=signup";

test("an OAuth error in the hash is shown to the player and reported to Health", async ({ page }) => {
  await mockSupabase(page, "guest");
  const reported = page.waitForRequest((r) => r.url().includes("/rest/v1/rpc/report_client_error") && r.method() === "POST");
  await page.goto("/auth?mode=login#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user");
  await expect(page.getByText(/Database error saving new user \(unexpected_failure\)/)).toBeVisible();
  const req = await reported;
  const body = req.postDataJSON();
  expect(body._message).toContain("oauth_return: Database error saving new user");
  expect(body._kind).toBe("shown");
  // the login form is still there (the player can retry or use email) and the
  // hash no longer carries the error (a refresh must not replay it)
  await expect(page.locator("#auth-email")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("tokens in the hash sign the player in and land on the board", async ({ page }) => {
  await mockSupabase(page, "guest"); // no stored session: everything must come from the hash
  // the auth server recognizes the access token; the profile exists
  await page.route("**/*.supabase.co/auth/v1/user**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ME_USER) }));
  await page.route("**/*.supabase.co/rest/v1/profiles**", (route) => {
    const single = (route.request().headers()["accept"] ?? "").includes("object");
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? profile(false) : [profile(false)]) });
  });
  await page.goto(`/auth?mode=login${TOKENS}`);
  await page.waitForURL(/\/board/, { timeout: 15000 });
  await expect(page.getByRole("main")).toContainText(/Linnea|Johan/);
  // no error toast on the happy path
  await expect(page.getByText(/didn’t complete|gick inte igenom/)).toHaveCount(0);
});

test("tokens the auth server rejects are reported instead of silently showing the login form", async ({ page }) => {
  await mockSupabase(page, "guest"); // /auth/v1/user answers 401 → supabase-js cannot build a session
  const reported = page.waitForRequest((r) => r.url().includes("/rest/v1/rpc/report_client_error") && r.method() === "POST");
  await page.goto(`/auth?mode=login${TOKENS}`);
  await expect(page.getByText(/Google sign-in didn’t complete/)).toBeVisible();
  const body = (await reported).postDataJSON();
  expect(body._message).toContain("oauth_return: tokens but no session");
  await expect(page.locator("#auth-email")).toBeVisible();
});
