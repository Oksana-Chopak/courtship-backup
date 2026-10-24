import { defineConfig, devices } from "@playwright/test";

// The REAL-BROWSER watch of production (2026-10-24): e2e-prod/*.spec.ts opens
// court-ship.com on a phone viewport like a player would — no mocks — and
// scripts/watch-report.mjs turns failures into a Telegram message with the
// screenshot. Scheduled from GitHub Actions (scripts/github-watch.yml); runs
// anywhere with: npm run watch:prod
export default defineConfig({
  testDir: "./e2e-prod",
  timeout: 45_000,
  retries: 1,                // a flaky network is not an outage; a second failure is
  workers: 2,
  outputDir: "watch-results",
  reporter: [["line"], ["json", { outputFile: "watch-results/results.json" }]],
  use: {
    baseURL: (process.env.WATCH_SITE || "https://court-ship.com").replace(/\/$/, ""),
    ...devices["Pixel 7"],
    contextOptions: { reducedMotion: "reduce" },
    timezoneId: "Europe/Stockholm",
    locale: "en-GB",
    screenshot: "only-on-failure",
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
});
