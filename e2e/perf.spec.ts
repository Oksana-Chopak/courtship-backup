// Perf probe (2026-10-24): how long until a player sees something, on a
// throttled phone (1.6 Mbps, 150 ms RTT, 4× slower CPU), against the local
// production build with the network mock + an artificial PERF_LAT ms per
// Supabase request (≈ Sweden → Supabase round-trip). Prints, never fails.
//   PERF=1 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test e2e/perf.spec.ts --reporter=line
// Skipped in the gate (informational, ~30 s).
import { test, type Page } from "@playwright/test";
import { mockSupabase, type Role } from "./helpers";

test.skip(!process.env.PERF, "perf probe — run with PERF=1");

const LAT = Number(process.env.PERF_LAT ?? 220);

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

async function measure(page: Page, role: Role, path: string, ready: string) {
  await mockSupabase(page, role);
  // artificial RTT for every Supabase call, logged with its timing
  const sb: { url: string; t: number }[] = [];
  const t0ref = { t: 0 };
  await page.route("**/*.supabase.co/**", async (route) => {
    sb.push({ url: route.request().url().replace(/^https?:\/\/[^/]+/, "").slice(0, 70), t: Date.now() - t0ref.t });
    await new Promise((r) => setTimeout(r, LAT));
    await route.fallback();
  });
  await throttle(page);
  t0ref.t = Date.now();
  await page.goto(path, { waitUntil: "commit" });
  const tCommit = Date.now() - t0ref.t;
  await page.waitForSelector(ready, { timeout: 60000 });
  const tReady = Date.now() - t0ref.t;
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint").map((p) => `${p.name}=${Math.round(p.startTime)}`);
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
    const css = res.filter((r) => /\.css(\?|$)/.test(r.name));
    const bytes = (xs: PerformanceResourceTiming[]) => xs.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0);
    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      paints,
      jsFiles: js.length, jsKB: Math.round(bytes(js) / 1024), cssKB: Math.round(bytes(css) / 1024),
      fonts: res.filter((r) => /\.woff2/.test(r.name)).length,
    };
  });
  const text = (await page.locator("body").innerText()).length;
  console.log(`\n== ${role} ${path} → ready "${ready}" at ${tReady} ms (commit ${tCommit} ms)`);
  console.log(`   ttfb ${perf.ttfb} · DCL ${perf.dcl} · ${perf.paints.join(" ")} · js ${perf.jsFiles} files ${perf.jsKB} KB · css ${perf.cssKB} KB · fonts ${perf.fonts} · body text ${text} chars`);
  console.log(`   supabase calls: ${sb.length}` + (sb.length ? ` — first at ${sb[0].t} ms, last at ${sb[sb.length - 1].t} ms` : ""));
  const waves: string[] = [];
  let wave: typeof sb = [];
  for (const c of sb) { if (wave.length && c.t - wave[0].t > LAT * 0.8) { waves.push(`[${wave[0].t}ms] ${wave.length}× ${wave.map((w) => w.url.replace("/rest/v1/", "").split("?")[0]).join(", ")}`); wave = []; } wave.push(c); }
  if (wave.length) waves.push(`[${wave[0].t}ms] ${wave.length}× ${wave.map((w) => w.url.replace("/rest/v1/", "").split("?")[0]).join(", ")}`);
  for (const w of waves) console.log(`   wave ${w}`);
}

test("perf: guest landing", async ({ page }) => { await measure(page, "guest", "/", "h1"); });
test("perf: guest board", async ({ page }) => { await measure(page, "guest", "/board", "text=Linnea"); });
test("perf: member board", async ({ page }) => { await measure(page, "member", "/board", "text=Linnea"); });
test("perf: member me", async ({ page }) => { await measure(page, "member", "/me", "[data-testid=me-identity]"); });
test("perf: member players", async ({ page }) => { await measure(page, "member", "/players", "text=Johan"); });
test("perf: guest auth", async ({ page }) => { await measure(page, "guest", "/auth?mode=login", "#auth-email"); });
