// Watchdog — the checks (pure; `fetch` is injected so vitest runs them with a
// fake network, and Deno runs them for real every 5 minutes). 2026-10-24.
//
// Every check answers the founder's question "is it working for players right
// now?" with one line: ok / not ok, a plain-words detail, and — when not ok —
// the ONE thing to do (CHECK_META.action). Ids are stable: the alerting layer
// keys its memory on them.

export type Check = { id: string; ok: boolean; detail: string; ms?: number; skipped?: boolean };
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
export type Env = {
  site: string;            // https://court-ship.com
  supabaseUrl: string;     // https://<ref>.supabase.co
  anonKey: string;
  functions: string[];     // edge functions the app calls
};

export const DEFAULT_FUNCTIONS = ["sos-notify", "notify-users", "email-notify", "email-broadcast", "lifecycle-emails"];

/** Texts that mean "a player just saw an error" — SSR HTML must never contain them. */
export const ERROR_MARKERS = [
  "Something went wrong", "This page didn't load", "Sidan kunde inte laddas", "Double fault on our side", "Dubbelfel på vår sida",
  "Missing Supabase environment variable", "Internal Server Error", "Application error",
];

/** Friendly name · what players see when it fails · the one action. */
export const CHECK_META: Record<string, { name: string; players: string; action: string }> = {
  site_home:    { name: "Landing page",            players: "court-ship.com does not open",                 action: "Lovable → Publish → Update (a broken deploy); if it stays red 10 min, send this to Claude" },
  site_board:   { name: "Board page",              players: "the board does not open",                      action: "Lovable → Publish → Update; if it stays red, send this to Claude" },
  site_auth:    { name: "Sign-in page",            players: "nobody can sign in or sign up",                action: "Lovable → Publish → Update; if it stays red, send this to Claude" },
  site_event:   { name: "Event share page",        players: "shared event links show an error",             action: "send this to Claude" },
  site_game:    { name: "Game share page",         players: "shared game links show an error",              action: "send this to Claude" },
  site_assets:  { name: "App code files",          players: "the app shows a blank screen after loading",   action: "Lovable → Publish → Update (files of the last deploy are missing)" },
  api_board:    { name: "Database: board",         players: "the board is empty or spinning forever",       action: "Lovable → Cloud → check the database is up; if it stays red 10 min, send this to Claude" },
  api_players:  { name: "Database: players",       players: "the players tab is empty",                     action: "same as the board" },
  auth_google:  { name: "Google sign-in (start)",  players: "“Continue with Google” fails or 404s",         action: "Lovable → Cloud → Users → Settings → Google must be ON (Managed by Lovable); then send this to Claude" },
  auth_settings:{ name: "Auth settings",           players: "Google is off or sign-ups are closed",         action: "Lovable → Cloud → Users → Settings: Google ON, sign-ups allowed" },
  fn:           { name: "Edge function",           players: "pushes/emails do not go out, buttons show an error", action: "Lovable chat: “Deploy the edge function <name> exactly as in the repo”" },
  db_webhooks:  { name: "Background calls",        players: "pushes and emails silently do not arrive",     action: "look at the sample below; a 404 = redeploy that function in Lovable chat; a 401 = send this to Claude" },
  db_cron:      { name: "Scheduled jobs",          players: "daily emails stop",                            action: "send this to Claude (the cron job is missing or failing)" },
  db_mail:      { name: "Email delivery",          players: "emails bounce or fail",                        action: "Lovable → Cloud → Secrets: BREVO_API_KEY present? Brevo account OK? Then send this to Claude" },
  db_facts:     { name: "Watchdog's own SQL",      players: "(nothing yet — the watchdog is half-blind)",     action: "paste APPLY_WATCHDOG SQL in Lovable → Cloud → SQL editor" },
  api:          { name: "Database / API",          players: "nothing loads — board, players, sign-in all fail", action: "Lovable → Cloud (project paused?) and status.supabase.com; if it stays red 10 min, send this to Claude" },
};
export function metaFor(id: string) {
  return CHECK_META[id] ?? (id.startsWith("fn_") ? { ...CHECK_META.fn, name: `Edge function ${id.slice(3)}`, action: CHECK_META.fn.action.replace("<name>", id.slice(3)) } : { name: id, players: "", action: "send this to Claude" });
}

const timed = async <T>(f: () => Promise<T>): Promise<[T, number]> => { const t0 = Date.now(); const r = await f(); return [r, Date.now() - t0]; };

async function get(fetchFn: Fetch, url: string, init?: RequestInit, timeoutMs = 12000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try { return await fetchFn(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

function fail(id: string, detail: string, ms?: number): Check { return { id, ok: false, detail: detail.slice(0, 300), ms }; }

/** A server-rendered page: 200, looks like Courtship, no error text, optional must-have text. */
export async function checkSite(fetchFn: Fetch, id: string, url: string, mustContain: (string | RegExp)[] = []): Promise<Check & { html?: string }> {
  try {
    const [r, ms] = await timed(() => get(fetchFn, url, { headers: { accept: "text/html" }, redirect: "follow" }));
    const html = await r.text();
    if (r.status !== 200) return fail(id, `HTTP ${r.status} for ${url}`, ms);
    if (!/Courtship/i.test(html)) return fail(id, `${url} answered but is not the app (no “Courtship” in the page)`, ms);
    const marker = ERROR_MARKERS.find((m) => html.includes(m));
    if (marker) return fail(id, `${url} shows an error: “${marker}”`, ms);
    for (const m of mustContain) {
      const hit = typeof m === "string" ? html.includes(m) : m.test(html);
      if (!hit) return fail(id, `${url} is missing “${String(m)}”`, ms);
    }
    return { id, ok: true, detail: `200 in ${ms} ms`, ms, html };
  } catch (e) {
    return fail(id, `${url} unreachable: ${String((e as Error)?.message ?? e)}`);
  }
}

/** The JS files a page needs (what a deploy can silently lose). */
export function chunkUrls(html: string, site: string): string[] {
  const out = new Set<string>();
  const re = /<(?:script[^>]+src|link[^>]+href)=["']([^"']+\.(?:js|mjs|css))(?:\?[^"']*)?["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const u = m[1];
    try { out.add(new URL(u, `${site.replace(/\/$/, "")}/`).href); } catch { /* unparsable href */ }
  }
  return [...out];
}

/** A short, stable fingerprint of the deployed build (which chunk files the page references). */
export function buildFingerprint(urls: string[]): string {
  const names = urls.map((u) => u.split("/").pop() ?? u).sort().join("|");
  let h = 0;
  for (let i = 0; i < names.length; i++) h = (h * 31 + names.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export async function checkAssets(fetchFn: Fetch, urls: string[]): Promise<Check> {
  const id = "site_assets";
  const pick = urls.filter((u) => /\.(m?js)(\?|$)/.test(u)).slice(0, 2);
  if (!pick.length) return { id, ok: true, detail: "no script files referenced (nothing to check)", skipped: true };
  const bad: string[] = [];
  let total = 0;
  for (const u of pick) {
    try {
      const [r, ms] = await timed(() => get(fetchFn, u));
      total += ms;
      const ct = r.headers.get("content-type") ?? "";
      if (r.status !== 200 || !/javascript|ecmascript/i.test(ct)) bad.push(`${u.split("/").pop()} → ${r.status} ${ct.split(";")[0]}`);
    } catch (e) { bad.push(`${u.split("/").pop()} → ${String((e as Error)?.message ?? e)}`); }
  }
  return bad.length ? fail(id, bad.join("; "), total) : { id, ok: true, detail: `${pick.length} files load (${total} ms)`, ms: total };
}

/** A public RPC through PostgREST, as the app calls it (anon). */
export async function checkRpc(fetchFn: Fetch, env: Env, id: string, name: string, body: unknown = {}): Promise<Check> {
  try {
    const [r, ms] = await timed(() => get(fetchFn, `${env.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }));
    if (r.status >= 400) return fail(id, `${name} → HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`, ms);
    const data = await r.json().catch(() => null);
    const n = Array.isArray(data) ? data.length : data == null ? 0 : 1;
    return { id, ok: true, detail: `${name} answers in ${ms} ms (${n} row${n === 1 ? "" : "s"})`, ms };
  } catch (e) {
    return fail(id, `${name} unreachable: ${String((e as Error)?.message ?? e)}`);
  }
}

/** “Continue with Google” — the broker must hand the browser to Google. The
 *  first hop may go through oauth.lovable.app; up to four redirects are
 *  followed by hand, with a browser-like User-Agent (the broker is built for
 *  browsers, not for Deno's default one). 2026-11-03: the first version only
 *  accepted a direct 302 to accounts.google.com and rang false. */
const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 CourtshipWatchdog";
export async function checkGoogleBroker(fetchFn: Fetch, site: string): Promise<Check> {
  const id = "auth_google";
  let url = `${site}/~oauth/initiate?provider=google&redirect_uri=${encodeURIComponent(`${site}/auth`)}&state=watchdog`;
  const hops: string[] = [];
  const t0 = Date.now();
  try {
    for (let i = 0; i < 5; i++) {
      const r = await get(fetchFn, url, { redirect: "manual", headers: { "user-agent": BROWSER_UA, accept: "text/html,*/*" } });
      const loc = r.headers.get("location") ?? "";
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = new URL(loc, url).href;
        hops.push(next.replace(/\?.*$/, ""));
        if (/^https:\/\/accounts\.google\.com\//.test(next)) return { id, ok: true, detail: `reaches Google in ${hops.length} hop${hops.length === 1 ? "" : "s"} (${Date.now() - t0} ms)`, ms: Date.now() - t0 };
        url = next;
        continue;
      }
      return fail(id, `HTTP ${r.status} at ${url.replace(/\?.*$/, "")}${hops.length ? ` (after ${hops.join(" → ")})` : ""}: ${(await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 140)}`, Date.now() - t0);
    }
    return fail(id, `never reaches accounts.google.com: ${hops.join(" → ")}`, Date.now() - t0);
  } catch (e) {
    return fail(id, `unreachable: ${String((e as Error)?.message ?? e)}${hops.length ? ` (after ${hops.join(" → ")})` : ""}`);
  }
}

/** Supabase Auth settings: Google enabled, sign-ups open. */
export async function checkAuthSettings(fetchFn: Fetch, env: Env): Promise<Check> {
  const id = "auth_settings";
  try {
    const [r, ms] = await timed(() => get(fetchFn, `${env.supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.anonKey } }));
    if (r.status !== 200) return fail(id, `auth/v1/settings → HTTP ${r.status}`, ms);
    const s = await r.json().catch(() => ({})) as any;
    const google = s?.external?.google === true;
    const closed = s?.disable_signup === true;
    if (!google) return fail(id, "Google provider is OFF in Supabase Auth", ms);
    if (closed) return fail(id, "sign-ups are DISABLED in Supabase Auth", ms);
    return { id, ok: true, detail: `Google on, sign-ups open (${ms} ms)`, ms };
  } catch (e) {
    return fail(id, `unreachable: ${String((e as Error)?.message ?? e)}`);
  }
}

/** An edge function is deployed, answers the browser's preflight, and guards itself. */
export async function checkFunction(fetchFn: Fetch, env: Env, name: string): Promise<Check> {
  const id = `fn_${name}`;
  const url = `${env.supabaseUrl}/functions/v1/${name}`;
  try {
    const [pre, ms1] = await timed(() => get(fetchFn, url, { method: "OPTIONS", headers: { origin: env.site, "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type, apikey" } }));
    if (pre.status === 404) return fail(id, "not deployed (404) — the app's buttons that use it fail", ms1);
    if (pre.status >= 400 || !pre.headers.get("access-control-allow-origin")) return fail(id, `preflight → HTTP ${pre.status}, no CORS header — the browser cannot call it`, ms1);
    // never with the DB secret: a probe must not do real work (lifecycle = dry run)
    const body = name === "lifecycle-emails" ? { dry: true } : {};
    const [r, ms2] = await timed(() => get(fetchFn, url, { method: "POST", headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
    const text = await r.text().catch(() => "");
    if (r.status === 404) return fail(id, "not deployed (404)", ms1 + ms2);
    if (r.status >= 500) return fail(id, `crashed → HTTP ${r.status}: ${text.slice(0, 160)}`, ms1 + ms2);
    let j: any = null; try { j = JSON.parse(text); } catch { /* not json */ }
    if (r.status === 200 && j && j.ok === false && /No email provider|not configured|missing/i.test(String(j.error ?? ""))) return fail(id, `answers but is misconfigured: ${String(j.error).slice(0, 120)}`, ms1 + ms2);
    return { id, ok: true, detail: `deployed, CORS ok, guarded (HTTP ${r.status}) in ${ms1 + ms2} ms`, ms: ms1 + ms2 };
  } catch (e) {
    return fail(id, `unreachable: ${String((e as Error)?.message ?? e)}`);
  }
}

/** Server facts (watchdog_facts) → checks. */
export function factsToChecks(facts: any): Check[] {
  const out: Check[] = [];
  if (!facts || typeof facts !== "object") return [{ id: "db_facts", ok: false, detail: "watchdog_facts() returned nothing — SQL not applied?" }];
  const net = facts.net ?? {};
  if (net.unavailable) out.push({ id: "db_webhooks", ok: true, detail: `pg_net log unavailable (${String(net.unavailable).slice(0, 80)})`, skipped: true });
  else {
    const failed = Number(net.failed ?? 0), total = Number(net.total ?? 0);
    const sample = Array.isArray(net.samples) && net.samples[0] ? ` — e.g. ${net.samples[0].status ?? net.samples[0].error ?? "?"} ${String(net.samples[0].body ?? "").slice(0, 100)}` : "";
    out.push(failed ? { id: "db_webhooks", ok: false, detail: `${failed} of ${total} background calls failed in the last hour${sample}` } : { id: "db_webhooks", ok: true, detail: `${total} background calls in the last hour, none failed` });
  }
  const cron: any[] = Array.isArray(facts.cron) ? facts.cron : [];
  const runs: any[] = Array.isArray(facts.cron_runs) ? facts.cron_runs : [];
  const need = ["courtship-lifecycle-emails", "courtship-watchdog"];
  const missing = need.filter((n) => !cron.some((c) => c?.name === n && c?.active !== false));
  const failedRuns = runs.filter((r) => r && r.status && r.status !== "succeeded" && need.includes(r.name));
  if (missing.length) out.push({ id: "db_cron", ok: false, detail: `missing or paused: ${missing.join(", ")}` });
  else if (failedRuns.length) out.push({ id: "db_cron", ok: false, detail: failedRuns.map((r) => `${r.name}: ${r.status} ${String(r.message ?? "").slice(0, 80)}`).join("; ") });
  else out.push({ id: "db_cron", ok: true, detail: `${need.length} jobs scheduled, last runs succeeded` });
  const mail = facts.mail ?? {};
  if (!mail.unavailable) {
    const failed = Number(mail.failed ?? 0);
    const s = Array.isArray(mail.samples) && mail.samples[0] ? ` — ${mail.samples[0].template}: ${String(mail.samples[0].error ?? mail.samples[0].status).slice(0, 100)}` : "";
    out.push(failed ? { id: "db_mail", ok: false, detail: `${failed} email${failed === 1 ? "" : "s"} failed in the last hour${s}` } : { id: "db_mail", ok: true, detail: `${Number(mail.sent ?? 0)} sent in the last hour, none failed` });
  }
  return out;
}

/** Everything, in parallel; anything red is retried once after a pause so a
 *  single hiccup never pages anyone. */
export async function runChecks(fetchFn: Fetch, env: Env, facts: any, opts: { retryDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<{ checks: Check[]; fingerprint: string | null }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const retryDelayMs = opts.retryDelayMs ?? 8000;
  const site = env.site.replace(/\/$/, "");
  const ev = facts?.latest_event?.id ? String(facts.latest_event.id) : null;
  const g = facts?.latest_game?.id ? String(facts.latest_game.id) : null;

  const probes: Record<string, () => Promise<Check>> = {
    site_home: () => checkSite(fetchFn, "site_home", `${site}/`),
    site_board: () => checkSite(fetchFn, "site_board", `${site}/board`),
    site_auth: () => checkSite(fetchFn, "site_auth", `${site}/auth?mode=login`, [/Google/]),
    api_board: () => checkRpc(fetchFn, env, "api_board", "public_board"),
    api_players: () => checkRpc(fetchFn, env, "api_players", "public_players"),
    auth_google: () => checkGoogleBroker(fetchFn, site),
    auth_settings: () => checkAuthSettings(fetchFn, env),
  };
  if (ev) probes.site_event = () => checkSite(fetchFn, "site_event", `${site}/e/${ev}`);
  if (g) probes.site_game = () => checkSite(fetchFn, "site_game", `${site}/g/${g}`);
  for (const f of env.functions) probes[`fn_${f}`] = () => checkFunction(fetchFn, env, f);

  const ids = Object.keys(probes);
  let results = await Promise.all(ids.map((id) => probes[id]()));
  const home = results.find((c) => c.id === "site_home") as (Check & { html?: string }) | undefined;
  const urls = home?.html ? chunkUrls(home.html, site) : [];
  const fingerprint = urls.length ? buildFingerprint(urls) : null;
  results.push(urls.length ? await checkAssets(fetchFn, urls) : { id: "site_assets", ok: true, detail: "landing page unavailable — files not checked", skipped: true });

  const red = results.filter((c) => !c.ok);
  if (red.length) {
    await sleep(retryDelayMs);
    const again = await Promise.all(red.map((c) => (probes[c.id] ? probes[c.id]() : Promise.resolve(c))));
    const byId = new Map(again.map((c) => [c.id, c]));
    results = results.map((c) => byId.get(c.id) ?? c);
  }
  // the facts rows are not retried (they are a reading, not a probe)
  const all = [...results.map(({ html: _h, ...c }: any) => c as Check), ...factsToChecks(facts)];
  return { checks: all, fingerprint };
}
