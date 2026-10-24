// Watchdog — memory, transitions and the words in Telegram (pure). 2026-10-24.
//
// Rules the founder can rely on:
//   • one message per run, only when something CHANGED (🔴 went down / 🟢 came
//     back) — never 20 messages for one blip; a check still down after a day
//     gets one "still down" reminder a day;
//   • a player's error is forwarded at once, the same (normalized) error at
//     most once per 6 h, with a count;
//   • every morning at 08:00 Stockholm one "✅ all green" heartbeat — silence
//     is never mistaken for health;
//   • a new build going live is one informative line, so breakage can be tied
//     to a Publish.
import { metaFor, type Check } from "./checks.ts";

export const TZ = "Europe/Stockholm";
export const ERROR_DEDUPE_MS = 6 * 3600e3;
export const STILL_DOWN_REMIND_MS = 24 * 3600e3;

export type CheckMemory = Record<string, { ok: boolean; since: string; detail: string; reminded?: string }>;
export type Event =
  | { type: "down"; check: Check }
  | { type: "up"; check: Check; downMin: number }
  | { type: "still"; check: Check; downMin: number };

/** "lör 24 okt 15:42" in Stockholm time. */
export function stockholm(iso: string | number | Date, tz: string = TZ): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d).replace(/\./g, "");
}

/** The local calendar day ("2026-10-24") and hour in Stockholm. */
export function localDayHour(iso: string | number | Date, tz: string = TZ): { day: string; hour: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, timeZone: tz }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

/** Compare this run with the memory → what changed. */
export function diffChecks(memory: CheckMemory, checks: Check[], nowIso: string): { memory: CheckMemory; events: Event[] } {
  const next: CheckMemory = {};
  const events: Event[] = [];
  const now = new Date(nowIso).getTime();
  for (const c of checks) {
    const prev = memory[c.id];
    if (c.ok) {
      next[c.id] = { ok: true, since: prev?.ok ? prev.since : nowIso, detail: c.detail };
      if (prev && !prev.ok) events.push({ type: "up", check: c, downMin: Math.max(1, Math.round((now - new Date(prev.since).getTime()) / 60000)) });
    } else {
      if (!prev || prev.ok) {
        next[c.id] = { ok: false, since: nowIso, detail: c.detail, reminded: nowIso };
        events.push({ type: "down", check: c });
      } else {
        const downMin = Math.round((now - new Date(prev.since).getTime()) / 60000);
        const lastReminded = new Date(prev.reminded ?? prev.since).getTime();
        const remind = now - lastReminded >= STILL_DOWN_REMIND_MS;
        next[c.id] = { ok: false, since: prev.since, detail: c.detail, reminded: remind ? nowIso : prev.reminded ?? prev.since };
        if (remind) events.push({ type: "still", check: c, downMin });
      }
    }
  }
  // checks that disappeared (e.g. no public game to probe) are simply forgotten
  return { memory: next, events };
}

function humanDuration(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}

/** When the whole API is down, its children (functions, auth settings) add
 *  nothing — one line says it. The memory still tracks every id, so the
 *  recovery lists them all once. */
export function groupOutage(downs: Extract<Event, { type: "down" }>[]): Extract<Event, { type: "down" }>[] {
  const api = downs.filter((e) => e.check.id.startsWith("api_"));
  if (api.length < 3) return downs;
  const rest = downs.filter((e) => !e.check.id.startsWith("api_") && !e.check.id.startsWith("fn_") && e.check.id !== "auth_settings");
  return [{ type: "down", check: { id: "api", ok: false, detail: `database/API unreachable — ${api[0].check.detail}` } }, ...rest];
}

/** The Telegram text for a run's transitions, or null when nothing changed. */
export function formatRun(events: Event[], nowIso: string, tz: string = TZ): string | null {
  if (!events.length) return null;
  const downs = groupOutage(events.filter((e) => e.type === "down") as Extract<Event, { type: "down" }>[]);
  const stills = events.filter((e) => e.type === "still") as Extract<Event, { type: "still" }>[];
  const ups = events.filter((e) => e.type === "up") as Extract<Event, { type: "up" }>[];
  const lines: string[] = [];
  const stamp = stockholm(nowIso, tz);
  if (downs.length) {
    lines.push(`🔴 Courtship — ${downs.length} problem${downs.length === 1 ? "" : "s"} · ${stamp}`);
    for (const e of downs) {
      const m = metaFor(e.check.id);
      lines.push("", `❌ ${m.name}`, `   Players: ${m.players}`, `   Do: ${m.action}`, `   Detail: ${e.check.detail}`);
    }
  }
  if (stills.length) {
    if (lines.length) lines.push("");
    lines.push(`⏳ Still down · ${stamp}`);
    for (const e of stills) lines.push(`• ${metaFor(e.check.id).name} — ${humanDuration(e.downMin)} — ${e.check.detail}`);
  }
  if (ups.length) {
    if (lines.length) lines.push("");
    lines.push(`🟢 Back to normal · ${stamp}`);
    for (const e of ups) lines.push(`• ${metaFor(e.check.id).name} — was down ${humanDuration(e.downMin)}`);
  }
  return lines.join("\n");
}

/** "Database error saving new user (unexpected_failure) at /auth?code=ABC" →
 *  stable key: lowercase, uuids/numbers/query strings removed. */
export function normalizeMessage(message: string, where = ""): string {
  const clean = (s: string) => s.toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/\?.*$/, "")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ").trim();
  return `${clean(message).slice(0, 160)}@${clean(where).slice(0, 60)}`;
}

export type PlayerError = { id?: string; at: string; kind: string; message: string; where: string; details?: string | null; signed_in?: boolean };
export type SeenErrors = Record<string, { at: string; n: number }>;

/** Which of these errors to tell about now (deduped), and the updated memory. */
export function selectPlayerErrors(errors: PlayerError[], seen: SeenErrors, nowIso: string, dedupeMs: number = ERROR_DEDUPE_MS): { tell: Array<PlayerError & { n: number }>; seen: SeenErrors } {
  const now = new Date(nowIso).getTime();
  const next: SeenErrors = {};
  // forget entries older than 2 × dedupe (keeps the memory small)
  for (const [k, v] of Object.entries(seen)) if (now - new Date(v.at).getTime() < dedupeMs * 2) next[k] = v;
  const counts = new Map<string, PlayerError & { n: number }>();
  for (const e of errors) {
    if (!e || !e.message) continue;
    const key = normalizeMessage(e.message, e.where);
    const prev = next[key];
    const entry = counts.get(key);
    if (entry) { entry.n++; continue; }
    if (prev && now - new Date(prev.at).getTime() < dedupeMs) { next[key] = { at: prev.at, n: prev.n + 1 }; continue; }
    counts.set(key, { ...e, n: 1 });
  }
  const tell = [...counts.values()];
  for (const t of tell) next[normalizeMessage(t.message, t.where)] = { at: nowIso, n: t.n };
  return { tell, seen: next };
}

/** The Telegram text for player errors (at most 5 lines + "N more"). */
export function formatPlayerErrors(tell: Array<PlayerError & { n: number }>, nowIso: string, tz: string = TZ): string | null {
  if (!tell.length) return null;
  const shown = tell.slice(0, 5);
  const lines = [`👤 A player hit an error · ${stockholm(nowIso, tz)}`];
  for (const e of shown) {
    const who = e.signed_in ? "member" : "guest";
    lines.push("", `⚠️ ${e.message.slice(0, 200)}`, `   where: ${e.where || "?"} · ${who} · ${e.kind}${e.n > 1 ? ` · ×${e.n}` : ""}`);
    if (e.details) lines.push(`   ${String(e.details).replace(/\s+/g, " ").slice(0, 160)}`);
  }
  if (tell.length > shown.length) lines.push("", `…and ${tell.length - shown.length} more`);
  lines.push("", "Do: open Admin → Health for the full list; if it repeats, send this to Claude.");
  return lines.join("\n");
}

/** The 08:00 Stockholm heartbeat: due once per local day at/after 08:00. */
export function heartbeatDue(nowIso: string, lastDay: string | undefined, tz: string = TZ, hour = 8): { due: boolean; day: string } {
  const { day, hour: h } = localDayHour(nowIso, tz);
  return { due: h >= hour && lastDay !== day, day };
}

export function formatHeartbeat(checks: Check[], facts: any, nowIso: string, errors24h: number, tz: string = TZ): string {
  const bad = checks.filter((c) => !c.ok);
  const slowest = [...checks].filter((c) => typeof c.ms === "number").sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))[0];
  const lines = [
    bad.length ? `🟠 Courtship morning check · ${stockholm(nowIso, tz)}` : `✅ Courtship morning check · ${stockholm(nowIso, tz)}`,
    `${checks.length - bad.length}/${checks.length} checks green${bad.length ? ` — down: ${bad.map((c) => metaFor(c.id).name).join(", ")}` : ""}`,
    `${errors24h} player error${errors24h === 1 ? "" : "s"} in 24 h`,
    `${Number(facts?.open_games ?? 0)} open game${Number(facts?.open_games ?? 0) === 1 ? "" : "s"} · ${Number(facts?.pending_events ?? 0)} event${Number(facts?.pending_events ?? 0) === 1 ? "" : "s"} waiting for approval · ${Number(facts?.profiles ?? 0)} players`,
  ];
  if (slowest && (slowest.ms ?? 0) > 2500) lines.push(`slowest: ${metaFor(slowest.id).name} ${slowest.ms} ms`);
  return lines.join("\n");
}

export function formatHello(checks: Check[], nowIso: string, tz: string = TZ): string {
  const bad = checks.filter((c) => !c.ok);
  return [
    `👋 Courtship watchdog connected · ${stockholm(nowIso, tz)}`,
    "I check the site, the database, sign-in (incl. Google), the email/push functions and every player error — every 5 minutes.",
    "You hear from me when something breaks, when it recovers, and every morning at 08:00.",
    `Right now: ${checks.length - bad.length}/${checks.length} green${bad.length ? ` — down: ${bad.map((c) => metaFor(c.id).name).join(", ")}` : ""}.`,
  ].join("\n");
}

export function formatBuildChange(nowIso: string, tz: string = TZ): string {
  return `🚀 New build live on court-ship.com · ${stockholm(nowIso, tz)} (if anything breaks from now on, it is this deploy)`;
}

/** Telegram caps a message at 4096 chars — split on lines. */
export function splitTelegram(text: string, max = 3900): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > max) { out.push(cur); cur = line; } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) out.push(cur);
  return out;
}
