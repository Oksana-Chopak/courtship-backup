#!/usr/bin/env node
// Turns a `npm run watch:prod` run (Playwright JSON at watch-results/results.json)
// into ONE Telegram message for Oksana — only when something failed, or always
// when WATCH_ALWAYS_REPORT=1 (the morning "all screens open" line). Failing
// tests attach their screenshot. Plain text, no markup, so nothing is lost to a
// parse error. 2026-10-24.
//
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (required to send),
//      WATCH_ALWAYS_REPORT=1 (optional), WATCH_RESULTS (default watch-results/results.json)
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT = process.env.TELEGRAM_CHAT_ID ?? "";
const FILE = process.env.WATCH_RESULTS ?? "watch-results/results.json";
const SITE = process.env.WATCH_SITE ?? "https://court-ship.com";

const stockholm = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(d).replace(/\./g, "");

/** Flatten Playwright's JSON report into [{title, status, error, screenshot}]. */
export function flatten(report) {
  const out = [];
  const walk = (suite, trail) => {
    for (const s of suite.suites ?? []) walk(s, [...trail, s.title].filter(Boolean));
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        const status = t.status ?? last?.status ?? "unknown"; // expected | unexpected | flaky | skipped
        const err = last?.errors?.[0]?.message ?? last?.error?.message ?? "";
        const shot = (last?.attachments ?? []).find((a) => a.name === "screenshot" && a.path)?.path ?? null;
        out.push({ title: [...trail, spec.title].join(" › "), status, error: err.replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 6).join("\n").slice(0, 600), screenshot: shot });
      }
    }
  };
  walk(report, []);
  return out;
}

/** The message. null when there is nothing to say. */
export function compose(tests, { always = false, now = new Date() } = {}) {
  const failed = tests.filter((t) => t.status === "unexpected" || t.status === "timedOut");
  const flaky = tests.filter((t) => t.status === "flaky");
  const passed = tests.filter((t) => t.status === "expected");
  const skipped = tests.filter((t) => t.status === "skipped");
  if (!failed.length && !always) return null;
  const lines = [];
  if (failed.length) {
    lines.push(`🔴 Courtship — ${failed.length} screen${failed.length === 1 ? "" : "s"} broken in a real browser · ${stockholm(now)}`);
    for (const t of failed) lines.push("", `❌ ${t.title}`, t.error ? `   ${t.error.split("\n")[0].slice(0, 220)}` : "");
    lines.push("", `Do: open ${SITE} on your phone and look; then send this message to Claude. Screenshots follow.`);
  } else {
    lines.push(`✅ Courtship — all ${passed.length} browser screens open · ${stockholm(now)}`);
  }
  if (flaky.length) lines.push("", `⚠️ passed on retry (slow?): ${flaky.map((t) => t.title).join("; ")}`);
  if (skipped.length) lines.push(`(${skipped.length} skipped — e.g. no monitor account or nothing public on the board)`);
  return lines.filter((l) => l !== undefined).join("\n");
}

async function send(text) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: text.slice(0, 4000), disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`sendMessage ${r.status} ${await r.text()}`);
}
async function sendPhoto(path, caption) {
  const form = new FormData();
  form.set("chat_id", CHAT);
  form.set("caption", caption.slice(0, 1000));
  form.set("photo", new Blob([readFileSync(path)], { type: "image/png" }), basename(path));
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: "POST", body: form });
  if (!r.ok) console.error(`sendPhoto ${r.status} ${await r.text()}`);
}

async function main() {
  if (!existsSync(FILE)) { console.error(`no results at ${FILE}`); process.exit(2); }
  const tests = flatten(JSON.parse(readFileSync(FILE, "utf8")));
  const text = compose(tests, { always: process.env.WATCH_ALWAYS_REPORT === "1" });
  const failed = tests.filter((t) => t.status === "unexpected" || t.status === "timedOut");
  console.log(`${tests.length} tests, ${failed.length} failed${text ? "" : " — nothing to report"}`);
  if (!text) return;
  if (!TOKEN || !CHAT) { console.log(text); console.error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — printed instead"); process.exit(failed.length ? 1 : 0); }
  await send(text);
  for (const t of failed) if (t.screenshot && existsSync(t.screenshot)) await sendPhoto(t.screenshot, `❌ ${t.title}`);
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) main().catch((e) => { console.error(e); process.exit(1); });
