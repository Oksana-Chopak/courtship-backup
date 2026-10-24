// Supabase Edge Function: watchdog (2026-10-24)
// "A screen broke → Oksana knows in Telegram within minutes."
//
// Called three ways:
//   • pg_cron every 5 min:          { event: "tick" }          (x-notify-secret from the DB)
//   • trigger on client_errors:     { event: "client_error", id } (x-notify-secret) — instant
//   • Admin → Health "Run now":     { event: "run_now" }       (admin JWT) — awaited, returns the report
// What a tick does: watchdog_facts() → the checks (site, API, Google sign-in,
// edge functions, DB facts; red ones retried once) → compare with memory →
// ONE Telegram message if something went down / came back → forward new player
// errors (deduped) → 08:00 heartbeat → "new build live" → save memory →
// optional dead-man ping (HEALTHCHECKS_PING_URL).
//
// Secrets (Lovable → Cloud → Secrets): TELEGRAM_BOT_TOKEN (required to speak);
// optional WATCHDOG_SITE (default https://court-ship.com), HEALTHCHECKS_PING_URL.
// The chat id is PAIRED, not typed: Admin → Health shows a code; Oksana sends
// "/start <code>" to her bot; the next tick finds that message and stores the
// chat id in internal_config. Nobody else can pair.
import { createClient } from "npm:@supabase/supabase-js@2";
import { DEFAULT_FUNCTIONS, runChecks, type Check, type Env } from "./checks.ts";
import {
  diffChecks, formatBuildChange, formatHeartbeat, formatHello, formatPlayerErrors, formatRun, heartbeatDue,
  selectPlayerErrors, splitTelegram, type CheckMemory, type PlayerError, type SeenErrors,
} from "./report.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE = (Deno.env.get("WATCHDOG_SITE") ?? "https://court-ship.com").replace(/\/$/, "");
const BOT = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const PING = Deno.env.get("HEALTHCHECKS_PING_URL") ?? "";
const TG_API = (Deno.env.get("TELEGRAM_API") ?? "https://api.telegram.org").replace(/\/$/, ""); // overridable for the local harness

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

const sb = () => createClient(SUPABASE_URL, SERVICE_KEY);

// ── state helpers (watchdog_state + internal_config) ────────────────────────
async function getState<T>(db: any, key: string, fallback: T): Promise<T> {
  const { data } = await db.from("watchdog_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
async function setState(db: any, key: string, value: unknown): Promise<void> {
  await db.from("watchdog_state").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}
async function getConfig(db: any, key: string): Promise<string | null> {
  const { data } = await db.from("internal_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

// ── Telegram ─────────────────────────────────────────────────────────────────
async function sendTelegram(db: any, chatId: string | null, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!BOT) return { ok: false, error: "TELEGRAM_BOT_TOKEN not set" };
  if (!chatId) return { ok: false, error: "not paired yet" };
  let last: { ok: boolean; error?: string } = { ok: true };
  for (const part of splitTelegram(text)) {
    try {
      const r = await fetch(`${TG_API}/bot${BOT}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: part, disable_web_page_preview: true }),
      });
      if (!r.ok) last = { ok: false, error: `${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}` };
    } catch (e) { last = { ok: false, error: String(e).slice(0, 160) }; }
  }
  await setState(db, "telegram", { last_at: new Date().toISOString(), last_ok: last.ok, last_error: last.error ?? null, last_text: text.slice(0, 200) });
  return last;
}

/** Pairing: find "/start <code>" (or just the code) among the bot's recent messages. */
async function tryPair(db: any): Promise<string | null> {
  if (!BOT) return null;
  const code = (await getConfig(db, "telegram_pair_code"))?.toUpperCase();
  if (!code) return null;
  try {
    const r = await fetch(`${TG_API}/bot${BOT}/getUpdates?limit=100&allowed_updates=%5B%22message%22%5D`);
    const j = await r.json().catch(() => ({}));
    const updates: any[] = Array.isArray(j?.result) ? j.result : [];
    const hit = [...updates].reverse().find((u) => String(u?.message?.text ?? "").toUpperCase().includes(code) && u?.message?.chat?.id);
    if (!hit) return null;
    const chatId = String(hit.message.chat.id);
    await db.from("internal_config").upsert({ key: "telegram_chat_id", value: chatId }, { onConflict: "key" });
    return chatId;
  } catch { return null; }
}

// ── one run ──────────────────────────────────────────────────────────────────
type RunResult = { checks: Check[]; sent: string[]; telegram: { ok: boolean; error?: string } | null; paired: boolean };

async function run(trigger: "tick" | "run_now"): Promise<RunResult> {
  const db = sb();
  const now = new Date();
  const nowIso = now.toISOString();
  const sent: string[] = [];
  let tg: { ok: boolean; error?: string } | null = null;

  // pairing (cheap: one Telegram call only while unpaired)
  let chatId = await getConfig(db, "telegram_chat_id");
  let justPaired = false;
  if (!chatId) { chatId = await tryPair(db); justPaired = !!chatId; }

  // facts (watermark = the newest player error already handled)
  const watermark = await getState<string>(db, "errors_watermark", new Date(now.getTime() - 10 * 60000).toISOString());
  const { data: facts, error: factsErr } = await db.rpc("watchdog_facts", { _since: watermark });
  const env: Env = { site: SITE, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, functions: DEFAULT_FUNCTIONS };
  const { checks, fingerprint } = await runChecks(fetch as any, env, factsErr ? null : facts, { retryDelayMs: Number(Deno.env.get("WATCHDOG_RETRY_MS") ?? 8000) });
  if (factsErr) checks.push({ id: "db_facts", ok: false, detail: `watchdog_facts(): ${factsErr.message} — SQL not applied?` });

  // transitions → one message
  const memory = await getState<CheckMemory>(db, "checks", {});
  const first = Object.keys(memory).length === 0;
  const { memory: nextMemory, events } = diffChecks(memory, checks, nowIso);
  if (first) {
    // the very first run: say hello (with the current picture), not "20 things went down"
    if (chatId) { tg = await sendTelegram(db, chatId, formatHello(checks, nowIso)); if (tg.ok) sent.push("hello"); }
  } else {
    const text = formatRun(events, nowIso);
    if (text && chatId) { tg = await sendTelegram(db, chatId, text); if (tg.ok) sent.push("run"); }
  }
  if (justPaired && !first && chatId) { tg = await sendTelegram(db, chatId, formatHello(checks, nowIso)); if (tg.ok) sent.push("hello"); }
  await setState(db, "checks", nextMemory);

  // player errors since the watermark → forward (deduped)
  const errors: PlayerError[] = Array.isArray(facts?.client_errors) ? facts.client_errors : [];
  if (errors.length) {
    const seen = await getState<SeenErrors>(db, "errors_seen", {});
    const { tell, seen: nextSeen } = selectPlayerErrors(errors, seen, nowIso);
    const text = formatPlayerErrors(tell, nowIso);
    if (text && chatId) { tg = await sendTelegram(db, chatId, text); if (tg.ok) sent.push(`errors:${tell.length}`); }
    await setState(db, "errors_seen", nextSeen);
    const newest = errors.map((e) => e.at).sort().pop();
    if (newest) await setState(db, "errors_watermark", newest);
  }

  // 08:00 Stockholm heartbeat, once a day
  const hbDay = await getState<string>(db, "heartbeat_day", "");
  const hb = heartbeatDue(nowIso, hbDay || undefined);
  if (first && hb.due) await setState(db, "heartbeat_day", hb.day); // the hello already carried today's picture
  else if (hb.due && trigger === "tick") {
    const { count } = await db.from("client_errors").select("id", { count: "exact", head: true }).gt("at", new Date(now.getTime() - 24 * 3600e3).toISOString());
    if (chatId) { tg = await sendTelegram(db, chatId, formatHeartbeat(checks, facts, nowIso, Number(count ?? 0))); if (tg.ok) sent.push("heartbeat"); }
    await setState(db, "heartbeat_day", hb.day);
  }

  // a new build went live (chunk names changed) — one informative line
  if (fingerprint) {
    const prevBuild = await getState<string>(db, "build", "");
    if (prevBuild && prevBuild !== fingerprint && chatId) { tg = await sendTelegram(db, chatId, formatBuildChange(nowIso)); if (tg.ok) sent.push("build"); }
    if (prevBuild !== fingerprint) await setState(db, "build", fingerprint);
  }

  await setState(db, "last_run", {
    at: nowIso, trigger, ok: checks.filter((c) => c.ok).length, bad: checks.filter((c) => !c.ok).length,
    down: checks.filter((c) => !c.ok).map((c) => ({ id: c.id, detail: c.detail })), paired: !!chatId, sent,
  });

  // dead-man's switch: an outside service notices when these pings stop
  if (PING) { try { await fetch(PING, { method: "POST", body: `ok=${checks.filter((c) => c.ok).length} bad=${checks.filter((c) => !c.ok).length}` }); } catch { /* best effort */ } }

  return { checks, sent, telegram: tg, paired: !!chatId };
}

/** One player error, the second it lands (the trigger passes its id). */
async function forwardClientError(id: string): Promise<void> {
  const db = sb();
  const nowIso = new Date().toISOString();
  const { data: row } = await db.from("client_errors").select("id,at,kind,message,where_,details,user_id").eq("id", id).maybeSingle();
  if (!row) return;
  const chatId = await getConfig(db, "telegram_chat_id");
  const seen = await getState<SeenErrors>(db, "errors_seen", {});
  const e: PlayerError = { id: row.id, at: row.at, kind: row.kind, message: row.message, where: row.where_, details: row.details, signed_in: !!row.user_id };
  const { tell, seen: nextSeen } = selectPlayerErrors([e], seen, nowIso);
  await setState(db, "errors_seen", nextSeen);
  // the tick must not tell it again
  const wm = await getState<string>(db, "errors_watermark", "");
  if (!wm || row.at > wm) await setState(db, "errors_watermark", row.at);
  const text = formatPlayerErrors(tell, nowIso);
  if (text && chatId) await sendTelegram(db, chatId, text);
}

// ── who may call ─────────────────────────────────────────────────────────────
async function callerAllowed(req: Request): Promise<"db" | "admin" | null> {
  const secret = req.headers.get("x-notify-secret");
  if (secret) {
    const envSecret = Deno.env.get("NOTIFY_SECRET") ?? "";
    if (envSecret && secret === envSecret) return "db";
    const dbSecret = await getConfig(sb(), "notify_secret");
    if (dbSecret && secret === dbSecret) return "db";
  }
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (jwt && jwt !== ANON_KEY) {
    const db = sb();
    const { data } = await db.auth.getUser(jwt);
    const uid = data?.user?.id;
    if (uid) {
      const { data: me } = await db.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
      if (me?.is_admin) return "admin";
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const who = await callerAllowed(req);
    if (!who) return json({ ok: false, error: "not_allowed" }, 401);
    const body = await req.json().catch(() => ({}));
    const event = String(body?.event ?? "tick");

    if (event === "client_error" && body?.id) {
      const p = forwardClientError(String(body.id));
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) { EdgeRuntime.waitUntil(p); return json({ ok: true, queued: true }, 202); }
      await p;
      return json({ ok: true });
    }
    if (event === "run_now" || who === "admin") {
      const r = await run("run_now");
      return json({ ok: true, ...r });
    }
    // tick: answer the DB at once (pg_net waits ~5 s), work in the background
    const p = run("tick");
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) { EdgeRuntime.waitUntil(p); return json({ ok: true, queued: true }, 202); }
    const r = await p;
    return json({ ok: true, sent: r.sent, bad: r.checks.filter((c) => !c.ok).length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
