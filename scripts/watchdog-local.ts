// Local end-to-end of the watchdog edge function (Deno), no network (2026-10-24):
// one fake server plays Supabase (REST, RPC, auth), the site, the edge
// functions and Telegram; the real function is imported and driven through
// its three entry points. Proves the glue the unit tests cannot: pairing by
// code, hello on first run, silence when nothing changed, 🔴 on a break,
// 🟢 on recovery, instant 👤 on a player error, admin "run now".
//
//   deno run -A --no-config --no-lock --node-modules-dir=none \
//     --import-map=/tmp/deno-importmap.json scripts/watchdog-local.ts
const FAKE = 9999, FN = 8787;
const SECRET = "shh-secret";
const ADMIN_JWT = "admin-jwt";
const PAIR = "ABC123";

// ── fake world ───────────────────────────────────────────────────────────────
const state: Record<string, unknown> = {};
const config: Record<string, string> = { notify_secret: SECRET, telegram_pair_code: PAIR };
const telegram: string[] = [];
let boardStatus = 200;
let pairNow = true;
const clientErrors: any[] = [];
const factsErrors: any[] = [];
const HOME = `<html><head><title>Courtship</title><script type="module" src="/site/assets/main-1.js"></script></head><body>Courtship</body></html>`;

function j(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
const fake = Deno.serve({ port: FAKE, onListen() {} }, async (req) => {
  const u = new URL(req.url);
  const p = u.pathname;
  // site
  if (p === "/site/") return new Response(HOME, { headers: { "content-type": "text/html" } });
  if (p === "/site/board") return new Response(boardStatus === 200 ? "<html>Courtship board</html>" : "down", { status: boardStatus });
  if (p.startsWith("/site/auth")) return new Response("<html>Courtship Sign in with Google</html>");
  if (p.startsWith("/site/e/") || p.startsWith("/site/g/")) return new Response("<html>Courtship share</html>");
  if (p.startsWith("/site/assets/")) return new Response("console.log(1)", { headers: { "content-type": "text/javascript" } });
  if (p === "/site/~oauth/initiate") return new Response(null, { status: 302, headers: { location: "https://accounts.google.com/v3/signin/identifier?x=1" } });
  // supabase auth
  if (p === "/auth/v1/settings") return j({ external: { google: true }, disable_signup: false });
  if (p === "/auth/v1/user") return req.headers.get("authorization") === `Bearer ${ADMIN_JWT}` ? j({ id: "admin-1", email: "o@x.se", aud: "authenticated", role: "authenticated" }) : j({ message: "bad jwt" }, 401);
  // edge functions
  if (p.startsWith("/functions/v1/")) return req.method === "OPTIONS" ? new Response("ok", { headers: { "access-control-allow-origin": "*" } }) : j({ ok: false, error: "not_authenticated" }, 401);
  // rest
  if (p === "/rest/v1/rpc/watchdog_facts") {
    const body = await req.json().catch(() => ({}));
    const since = String(body?._since ?? "");
    return j({ at: new Date().toISOString(), net: { total: 3, failed: 0, samples: [] }, cron: [{ name: "courtship-lifecycle-emails", active: true }, { name: "courtship-watchdog", active: true }], cron_runs: [], lifecycle_enabled: true, lifecycle_last_sent: null,
      client_errors: factsErrors.filter((e) => e.at > since), mail: { sent: 1, failed: 0, samples: [] }, open_games: 1, pending_events: 0, profiles: 101, latest_event: { id: "e1", title: "x" }, latest_game: { id: "g1" } });
  }
  if (p.startsWith("/rest/v1/rpc/")) return j([{ id: 1 }]);
  if (p === "/rest/v1/internal_config") {
    if (req.method === "POST") { const b = await req.json(); for (const r of Array.isArray(b) ? b : [b]) config[r.key] = r.value; return j([], 201); }
    const key = (u.searchParams.get("key") ?? "").replace("eq.", "");
    return j(config[key] != null ? [{ value: config[key] }] : []);
  }
  if (p === "/rest/v1/watchdog_state") {
    if (req.method === "POST") { const b = await req.json(); for (const r of Array.isArray(b) ? b : [b]) state[r.key] = r.value; return j([], 201); }
    const key = (u.searchParams.get("key") ?? "").replace("eq.", "");
    return j(state[key] !== undefined ? [{ value: state[key] }] : []);
  }
  if (p === "/rest/v1/profiles") return j([{ is_admin: true }]);
  if (p === "/rest/v1/client_errors") {
    const id = (u.searchParams.get("id") ?? "").replace("eq.", "");
    if (id) return j(clientErrors.filter((e) => e.id === id));
    return new Response(req.method === "HEAD" ? null : "[]", { status: 200, headers: { "content-range": "0-0/2", "content-type": "application/json" } });
  }
  // telegram
  if (p.endsWith("/sendMessage")) { const b = await req.json(); telegram.push(String(b.text)); return j({ ok: true, result: {} }); }
  if (p.endsWith("/getUpdates")) return j({ ok: true, result: pairNow ? [{ message: { text: `/start ${PAIR}`, chat: { id: 777 } } }] : [] });
  return new Response("fake: no route " + p, { status: 404 });
});

// ── the function under test ──────────────────────────────────────────────────
Deno.env.set("SUPABASE_URL", `http://127.0.0.1:${FAKE}`);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("WATCHDOG_SITE", `http://127.0.0.1:${FAKE}/site`);
Deno.env.set("TELEGRAM_BOT_TOKEN", "bot-token");
Deno.env.set("TELEGRAM_API", `http://127.0.0.1:${FAKE}`);
Deno.env.set("WATCHDOG_RETRY_MS", "50");
// Supabase's runtime provides Deno.serve on :8000; locally we pick a port by
// patching Deno.serve before importing the module.
const realServe = Deno.serve;
let fnServer: Deno.HttpServer | null = null;
(Deno as any).serve = (handler: any) => { fnServer = realServe({ port: FN, onListen() {} }, handler); return fnServer; };
await import("../supabase/functions/watchdog/index.ts");
(Deno as any).serve = realServe;

const call = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`http://127.0.0.1:${FN}/`, { method: "POST", headers: { "content-type": "application/json", apikey: "anon", Authorization: "Bearer anon", ...headers }, body: JSON.stringify(body) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Wait until the function has written something new (or 8 s). */
async function settle(before: () => unknown) {
  const b = JSON.stringify(before());
  for (let i = 0; i < 80; i++) { await sleep(100); if (JSON.stringify(before()) !== b) break; }
  await sleep(300);
}
const runStamp = () => (state.last_run as any)?.at ?? null;
const tgCount = () => telegram.length;
function assert(cond: unknown, msg: string) { if (!cond) { console.error("❌", msg); console.error("telegram so far:", telegram); Deno.exit(1); } console.log("✅", msg); }

// 0. a stranger is refused
assert((await call({ event: "tick" })).status === 401, "no secret, no admin → 401");

// 1. first tick: pairs by code, says hello, remembers the picture
let r = await call({ event: "tick" }, { "x-notify-secret": SECRET });
assert(r.status === 200 || r.status === 202, `tick accepted (${r.status})`);
await settle(runStamp);
assert(config.telegram_chat_id === "777", "paired with the chat that sent /start <code>");
assert(telegram.length === 1 && telegram[0].startsWith("👋 Courtship watchdog connected"), "first run says hello");
assert(telegram[0].includes("green"), "hello carries the current picture");
const lr = state.last_run as any;
assert(lr && lr.bad === 0 && lr.ok > 10, `last_run saved: ${lr?.ok} green, ${lr?.bad} red`);

// 2. second tick, nothing changed: silence
pairNow = false;
await call({ event: "tick" }, { "x-notify-secret": SECRET }); await settle(runStamp);
assert(telegram.length === 1, "nothing changed → no message");

// 3. the board breaks (twice in a row — the retry must not mask a real outage)
boardStatus = 503;
await call({ event: "tick" }, { "x-notify-secret": SECRET }); await settle(runStamp);
assert(telegram.length === 2 && telegram[1].startsWith("🔴 Courtship — 1 problem"), "board down → one 🔴 message");
assert(telegram[1].includes("Board page") && telegram[1].includes("HTTP 503") && telegram[1].includes("Do: "), "the message names the check, the detail and the action");
await call({ event: "tick" }, { "x-notify-secret": SECRET }); await settle(runStamp);
assert(telegram.length === 2, "still down → no repeat");

// 4. recovery
boardStatus = 200;
await call({ event: "tick" }, { "x-notify-secret": SECRET }); await settle(runStamp);
assert(telegram.length === 3 && telegram[2].startsWith("🟢 Back to normal") && telegram[2].includes("Board page"), "board back → 🟢 with the name");

// 5. a player error, forwarded the second it lands (and not repeated by the next tick)
const err = { id: "ce-1", at: new Date().toISOString(), kind: "shown", message: "oauth_return: Database error saving new user (unexpected_failure)", where_: "/auth", details: null, user_id: null };
clientErrors.push(err);
factsErrors.push({ id: err.id, at: err.at, kind: err.kind, message: err.message, where: err.where_, details: null, signed_in: false });
r = await call({ event: "client_error", id: "ce-1" }, { "x-notify-secret": SECRET }); await settle(tgCount);
assert(telegram.length === 4 && telegram[3].startsWith("👤 A player hit an error") && telegram[3].includes("Database error saving new user"), "player error → instant 👤 message");
await call({ event: "tick" }, { "x-notify-secret": SECRET }); await settle(runStamp);
assert(telegram.length === 4, "the tick does not repeat the forwarded error");

// 6. admin "run now": awaited, returns the report
r = await call({ event: "run_now" }, { Authorization: `Bearer ${ADMIN_JWT}` });
const body = await r.json();
assert(r.status === 200 && body.ok && Array.isArray(body.checks) && body.checks.length > 10 && body.paired === true, `run_now returns ${body.checks?.length} checks`);

console.log("\n🎾 watchdog local e2e: all green");
fnServer?.shutdown(); fake.shutdown();
Deno.exit(0);
