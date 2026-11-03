// The watchdog's brain (supabase/functions/watchdog/{checks,report}.ts) is pure
// TypeScript, so what reaches Oksana's Telegram is tested here, with a fake
// network, without Deno.
import { describe, expect, it } from "vitest";
import {
  buildFingerprint, checkAssets, checkAuthSettings, checkFunction, checkGoogleBroker, checkRpc, checkSite, chunkUrls,
  factsToChecks, metaFor, runChecks, DEFAULT_FUNCTIONS, type Check, type Env,
} from "../../supabase/functions/watchdog/checks";
import {
  diffChecks, formatBuildChange, formatHeartbeat, formatHello, formatPlayerErrors, formatRun, groupOutage, heartbeatDue,
  localDayHour, normalizeMessage, selectPlayerErrors, splitTelegram, stockholm, type CheckMemory,
} from "../../supabase/functions/watchdog/report";

const ENV: Env = { site: "https://court-ship.com", supabaseUrl: "https://x.supabase.co", anonKey: "anon", functions: DEFAULT_FUNCTIONS };
const HOME = `<!doctype html><html><head><title>Courtship</title><link rel="stylesheet" href="/assets/styles-abc.css"><script type="module" src="/assets/main-1a2b.js"></script><link rel="modulepreload" href="/assets/vendor-9z.js"></head><body>Courtship — Tennis partners</body></html>`;

type Rule = { match: (url: string, init?: RequestInit) => boolean; res: () => Response };
const res = (status: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status, headers });
const jsonRes = (status: number, body: unknown) => res(status, JSON.stringify(body), { "content-type": "application/json" });
function fakeFetch(rules: Rule[], log: string[] = []) {
  return async (url: string, init?: RequestInit) => {
    log.push(`${init?.method ?? "GET"} ${url}`);
    const r = rules.find((x) => x.match(url, init));
    if (!r) return res(404, "no rule");
    return r.res();
  };
}
const healthy = (): Rule[] => [
  { match: (u) => u === "https://court-ship.com/", res: () => res(200, HOME, { "content-type": "text/html" }) },
  { match: (u) => u.startsWith("https://court-ship.com/board"), res: () => res(200, "<html>Courtship board</html>") },
  { match: (u) => u.startsWith("https://court-ship.com/auth"), res: () => res(200, "<html>Courtship Sign in with Google</html>") },
  { match: (u) => u.startsWith("https://court-ship.com/e/"), res: () => res(200, "<html>Courtship Mystery Saturday</html>") },
  { match: (u) => u.startsWith("https://court-ship.com/g/"), res: () => res(200, "<html>Courtship USIF</html>") },
  { match: (u) => u.startsWith("https://court-ship.com/assets/") && u.endsWith(".js"), res: () => res(200, "console.log(1)", { "content-type": "text/javascript" }) },
  { match: (u) => u.startsWith("https://court-ship.com/~oauth/initiate"), res: () => res(302, "", { location: "https://accounts.google.com/v3/signin/identifier?client_id=1" }) },
  { match: (u) => u.startsWith("https://x.supabase.co/rest/v1/rpc/"), res: () => jsonRes(200, [{ id: 1 }, { id: 2 }]) },
  { match: (u) => u.startsWith("https://x.supabase.co/auth/v1/settings"), res: () => jsonRes(200, { external: { google: true, email: true }, disable_signup: false }) },
  { match: (u, i) => u.startsWith("https://x.supabase.co/functions/v1/") && i?.method === "OPTIONS", res: () => res(200, "ok", { "access-control-allow-origin": "*" }) },
  { match: (u, i) => u.startsWith("https://x.supabase.co/functions/v1/") && i?.method === "POST", res: () => jsonRes(401, { ok: false, error: "not_authenticated" }) },
];
const FACTS = {
  net: { total: 12, failed: 0, samples: [] }, cron: [{ name: "courtship-lifecycle-emails", active: true }, { name: "courtship-watchdog", active: true }],
  cron_runs: [{ name: "courtship-watchdog", status: "succeeded" }], mail: { sent: 3, failed: 0, samples: [] },
  client_errors: [], open_games: 2, pending_events: 1, profiles: 101, latest_event: { id: "e1", title: "Mystery Saturday" }, latest_game: { id: "g1" },
};
const noSleep = { retryDelayMs: 0, sleep: async () => {} };

describe("site checks", () => {
  it("a healthy page is green with its timing", async () => {
    const c = await checkSite(fakeFetch(healthy()), "site_home", "https://court-ship.com/");
    expect(c.ok).toBe(true);
    expect(c.detail).toMatch(/200 in \d+ ms/);
    expect(c.html).toContain("Courtship");
  });
  it("a 500, a non-app page, an error marker and a missing must-have are red with the reason", async () => {
    const f = fakeFetch([
      { match: (u) => u.endsWith("/500"), res: () => res(500, "Internal Server Error") },
      { match: (u) => u.endsWith("/other"), res: () => res(200, "<html>Welcome to nginx</html>") },
      { match: (u) => u.endsWith("/boundary"), res: () => res(200, "<html>Courtship — Something went wrong</html>") },
      { match: (u) => u.endsWith("/auth"), res: () => res(200, "<html>Courtship — email only</html>") },
    ]);
    expect((await checkSite(f, "a", "https://s/500")).detail).toContain("HTTP 500");
    expect((await checkSite(f, "a", "https://s/other")).detail).toContain("not the app");
    expect((await checkSite(f, "a", "https://s/boundary")).detail).toContain("Something went wrong");
    expect((await checkSite(f, "a", "https://s/auth", [/Google/])).detail).toContain("missing “/Google/”");
  });
  it("a network failure is red and says unreachable", async () => {
    const f = async () => { throw new Error("getaddrinfo ENOTFOUND"); };
    const c = await checkSite(f as any, "site_home", "https://court-ship.com/");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("unreachable: getaddrinfo ENOTFOUND");
  });
  it("finds the page's js/css files and fingerprints the build by their names", () => {
    const urls = chunkUrls(HOME, "https://court-ship.com");
    expect(urls).toEqual(["https://court-ship.com/assets/styles-abc.css", "https://court-ship.com/assets/main-1a2b.js", "https://court-ship.com/assets/vendor-9z.js"]);
    expect(chunkUrls('<script src="https://cdn.x/y.js?v=1"></script><script src="rel.js"></script>', "https://s/")).toEqual(["https://cdn.x/y.js", "https://s/rel.js"]);
    const fp = buildFingerprint(urls);
    expect(fp).toMatch(/^[0-9a-f]+$/);
    expect(buildFingerprint([...urls].reverse())).toBe(fp);
    expect(buildFingerprint(["https://court-ship.com/assets/main-FFFF.js"])).not.toBe(fp);
  });
  it("assets: the first two scripts must come back as javascript", async () => {
    const urls = chunkUrls(HOME, "https://court-ship.com");
    expect((await checkAssets(fakeFetch(healthy()), urls)).ok).toBe(true);
    const gone = fakeFetch([{ match: () => true, res: () => res(404, "<html>Courtship</html>", { "content-type": "text/html" }) }]);
    const c = await checkAssets(gone, urls);
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("main-1a2b.js → 404 text/html");
    expect((await checkAssets(fakeFetch([]), [])).skipped).toBe(true);
    const boom = async () => { throw new Error("reset"); };
    expect((await checkAssets(boom as any, urls)).detail).toContain("→ reset");
  });
});

describe("api / auth / function checks", () => {
  it("an RPC answers → green with the row count; an HTTP error → red with the body", async () => {
    expect((await checkRpc(fakeFetch(healthy()), ENV, "api_board", "public_board")).detail).toMatch(/public_board answers in \d+ ms \(2 rows\)/);
    const f = fakeFetch([{ match: () => true, res: () => jsonRes(503, { message: "db down" }) }]);
    const c = await checkRpc(f, ENV, "api_board", "public_board");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("HTTP 503");
    expect(c.detail).toContain("db down");
    const one = fakeFetch([{ match: () => true, res: () => jsonRes(200, { players: 3 }) }]);
    expect((await checkRpc(one, ENV, "api_players", "public_players")).detail).toContain("(1 row)");
    const boom = async () => { throw new Error("timeout"); };
    expect((await checkRpc(boom as any, ENV, "api_board", "public_board")).detail).toContain("unreachable: timeout");
  });
  it("Google start: reaching accounts.google.com — directly or via the broker's own hop — is green; loops, errors and dead ends are red", async () => {
    const direct = await checkGoogleBroker(fakeFetch(healthy()), "https://court-ship.com");
    expect(direct.ok).toBe(true);
    expect(direct.detail).toContain("reaches Google in 1 hop");
    const viaBroker = fakeFetch([
      { match: (u) => u.includes("/~oauth/initiate"), res: () => res(302, "", { location: "https://oauth.lovable.app/authorize?x=1" }) },
      { match: (u) => u.startsWith("https://oauth.lovable.app/"), res: () => res(302, "", { location: "https://accounts.google.com/v3/signin/identifier?client_id=1" }) },
    ]);
    const hop = await checkGoogleBroker(viaBroker, "https://court-ship.com");
    expect(hop.ok).toBe(true);
    expect(hop.detail).toContain("reaches Google in 2 hops");
    const loop = fakeFetch([{ match: () => true, res: () => res(302, "", { location: "https://court-ship.com/auth?error=legacy" }) }]);
    expect((await checkGoogleBroker(loop, "https://court-ship.com")).detail).toContain("never reaches accounts.google.com");
    const broken = fakeFetch([{ match: () => true, res: () => res(404, "not found") }]);
    expect((await checkGoogleBroker(broken, "https://court-ship.com")).detail).toContain("HTTP 404 at https://court-ship.com/~oauth/initiate");
    const deadEnd = fakeFetch([
      { match: (u) => u.includes("/~oauth/initiate"), res: () => res(302, "", { location: "https://oauth.lovable.app/authorize" }) },
      { match: () => true, res: () => res(403, "disallowed") },
    ]);
    expect((await checkGoogleBroker(deadEnd, "https://court-ship.com")).detail).toContain("HTTP 403 at https://oauth.lovable.app/authorize (after https://oauth.lovable.app/authorize)");
    const boom = async () => { throw new Error("tls") };
    expect((await checkGoogleBroker(boom as any, "https://court-ship.com")).detail).toContain("unreachable: tls");
  });
  it("auth settings: Google off or sign-ups closed are red", async () => {
    expect((await checkAuthSettings(fakeFetch(healthy()), ENV)).ok).toBe(true);
    const off = fakeFetch([{ match: () => true, res: () => jsonRes(200, { external: { google: false } }) }]);
    expect((await checkAuthSettings(off, ENV)).detail).toContain("Google provider is OFF");
    const closed = fakeFetch([{ match: () => true, res: () => jsonRes(200, { external: { google: true }, disable_signup: true }) }]);
    expect((await checkAuthSettings(closed, ENV)).detail).toContain("sign-ups are DISABLED");
    const http = fakeFetch([{ match: () => true, res: () => res(500) }]);
    expect((await checkAuthSettings(http, ENV)).detail).toContain("HTTP 500");
    const boom = async () => { throw new Error("x") };
    expect((await checkAuthSettings(boom as any, ENV)).ok).toBe(false);
  });
  it("edge functions: deployed + CORS + guarded is green; 404, no CORS, 5xx and misconfiguration are red", async () => {
    const log: string[] = [];
    const ok = await checkFunction(fakeFetch(healthy(), log), ENV, "lifecycle-emails");
    expect(ok.ok).toBe(true);
    expect(ok.detail).toContain("HTTP 401");
    // the probe never carries the DB secret and lifecycle is a dry run
    expect(log.some((l) => l.startsWith("POST https://x.supabase.co/functions/v1/lifecycle-emails"))).toBe(true);
    const missing = fakeFetch([{ match: () => true, res: () => res(404, "NOT_FOUND") }]);
    expect((await checkFunction(missing, ENV, "sos-notify")).detail).toContain("not deployed (404)");
    const noCors = fakeFetch([{ match: (_u, i) => i?.method === "OPTIONS", res: () => res(200, "ok") }]);
    expect((await checkFunction(noCors, ENV, "sos-notify")).detail).toContain("no CORS header");
    const crash = fakeFetch([
      { match: (_u, i) => i?.method === "OPTIONS", res: () => res(200, "ok", { "access-control-allow-origin": "*" }) },
      { match: () => true, res: () => res(500, "TypeError: boom") },
    ]);
    expect((await checkFunction(crash, ENV, "email-notify")).detail).toContain("crashed → HTTP 500");
    const misconfigured = fakeFetch([
      { match: (_u, i) => i?.method === "OPTIONS", res: () => res(200, "ok", { "access-control-allow-origin": "*" }) },
      { match: () => true, res: () => jsonRes(200, { ok: false, error: "No email provider key (BREVO_API_KEY) configured" }) },
    ]);
    expect((await checkFunction(misconfigured, ENV, "email-broadcast")).detail).toContain("misconfigured");
    const gone404post = fakeFetch([
      { match: (_u, i) => i?.method === "OPTIONS", res: () => res(200, "ok", { "access-control-allow-origin": "*" }) },
      { match: () => true, res: () => res(404, "") },
    ]);
    expect((await checkFunction(gone404post, ENV, "email-broadcast")).detail).toContain("not deployed (404)");
    const boom = async () => { throw new Error("x") };
    expect((await checkFunction(boom as any, ENV, "x")).ok).toBe(false);
  });
});

describe("facts → checks", () => {
  it("healthy facts give three green rows", () => {
    const rows = factsToChecks(FACTS);
    expect(rows.map((r) => `${r.id}:${r.ok}`)).toEqual(["db_webhooks:true", "db_cron:true", "db_mail:true"]);
  });
  it("failed background calls, a missing cron, a failed run and failed emails are red with samples", () => {
    const rows = factsToChecks({
      ...FACTS,
      net: { total: 10, failed: 3, samples: [{ status: 404, body: "NOT_FOUND" }] },
      cron: [{ name: "courtship-watchdog", active: true }],
      mail: { sent: 1, failed: 2, samples: [{ template: "broadcast", status: "failed", error: "401 unauthorized" }] },
    });
    expect(rows.find((r) => r.id === "db_webhooks")!.detail).toContain("3 of 10 background calls failed in the last hour — e.g. 404 NOT_FOUND");
    expect(rows.find((r) => r.id === "db_cron")!.detail).toContain("missing or paused: courtship-lifecycle-emails");
    expect(rows.find((r) => r.id === "db_mail")!.detail).toContain("2 emails failed in the last hour — broadcast: 401 unauthorized");
    const failedRun = factsToChecks({ ...FACTS, cron_runs: [{ name: "courtship-watchdog", status: "failed", message: "connection refused" }] });
    expect(failedRun.find((r) => r.id === "db_cron")!.detail).toContain("courtship-watchdog: failed connection refused");
  });
  it("no facts at all = the SQL is missing; unavailable pg_net is a skipped green", () => {
    expect(factsToChecks(null)[0]).toMatchObject({ id: "db_facts", ok: false });
    const rows = factsToChecks({ ...FACTS, net: { unavailable: "permission denied" }, mail: { unavailable: "x" } });
    expect(rows.find((r) => r.id === "db_webhooks")).toMatchObject({ ok: true, skipped: true });
    expect(rows.find((r) => r.id === "db_mail")).toBeUndefined();
  });
  it("metaFor knows every id, including edge functions by name", () => {
    expect(metaFor("fn_sos-notify").name).toBe("Edge function sos-notify");
    expect(metaFor("fn_sos-notify").action).toContain("Deploy the edge function sos-notify");
    expect(metaFor("site_home").players).toContain("does not open");
    expect(metaFor("whatever").name).toBe("whatever");
  });
});

describe("runChecks", () => {
  it("probes everything in parallel, checks the share pages with real ids and the assets of the landing page", async () => {
    const log: string[] = [];
    const { checks, fingerprint } = await runChecks(fakeFetch(healthy(), log), ENV, FACTS, noSleep);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.id).sort()).toEqual([
      "api_board", "api_players", "auth_google", "auth_settings", "db_cron", "db_mail", "db_webhooks",
      ...DEFAULT_FUNCTIONS.map((f) => `fn_${f}`), "site_assets", "site_auth", "site_board", "site_event", "site_game", "site_home",
    ].sort());
    expect(log).toContain("GET https://court-ship.com/e/e1");
    expect(log).toContain("GET https://court-ship.com/g/g1");
    expect(fingerprint).toMatch(/^[0-9a-f]+$/);
    expect(checks.some((c) => (c as any).html)).toBe(false); // html never leaks into the stored checks
  });
  it("a red probe is retried once before it counts, so a one-off hiccup never pages anyone", async () => {
    let boardCalls = 0;
    const rules = healthy();
    rules.unshift({ match: (u) => u.startsWith("https://court-ship.com/board"), res: () => (++boardCalls === 1 ? res(502, "bad gateway") : res(200, "<html>Courtship</html>")) });
    const { checks } = await runChecks(fakeFetch(rules), ENV, FACTS, noSleep);
    expect(boardCalls).toBe(2);
    expect(checks.find((c) => c.id === "site_board")!.ok).toBe(true);
  });
  it("without facts the share pages are not probed and the SQL row is red", async () => {
    const { checks } = await runChecks(fakeFetch(healthy()), ENV, null, noSleep);
    expect(checks.find((c) => c.id === "site_event")).toBeUndefined();
    expect(checks.find((c) => c.id === "db_facts")).toMatchObject({ ok: false });
  });
  it("when the landing page is down the assets check is skipped, not red", async () => {
    const rules = healthy();
    rules.unshift({ match: (u) => u === "https://court-ship.com/", res: () => res(503, "down") });
    const { checks, fingerprint } = await runChecks(fakeFetch(rules), ENV, FACTS, noSleep);
    expect(checks.find((c) => c.id === "site_home")!.ok).toBe(false);
    expect(checks.find((c) => c.id === "site_assets")).toMatchObject({ ok: true, skipped: true });
    expect(fingerprint).toBeNull();
  });
});

const chk = (id: string, ok: boolean, detail = "d"): Check => ({ id, ok, detail });
const T0 = "2026-10-24T10:00:00.000Z";
const plus = (min: number) => new Date(new Date(T0).getTime() + min * 60000).toISOString();

describe("memory + transitions", () => {
  it("first sight of a red check is a 'down'; staying red is silent; green again is an 'up' with the downtime", () => {
    const r1 = diffChecks({}, [chk("site_home", true), chk("api_board", false, "HTTP 503")], T0);
    expect(r1.events).toEqual([{ type: "down", check: chk("api_board", false, "HTTP 503") }]);
    const r2 = diffChecks(r1.memory, [chk("site_home", true), chk("api_board", false, "HTTP 503")], plus(5));
    expect(r2.events).toEqual([]);
    const r3 = diffChecks(r2.memory, [chk("site_home", true), chk("api_board", true)], plus(17));
    expect(r3.events).toEqual([{ type: "up", check: chk("api_board", true), downMin: 17 }]);
    expect(r3.memory.api_board.ok).toBe(true);
    expect(r3.memory.site_home.since).toBe(T0);
  });
  it("a check that stays down gets one 'still down' reminder a day", () => {
    const r1 = diffChecks({}, [chk("fn_sos-notify", false)], T0);
    const r2 = diffChecks(r1.memory, [chk("fn_sos-notify", false)], plus(23 * 60));
    expect(r2.events).toEqual([]);
    const r3 = diffChecks(r2.memory, [chk("fn_sos-notify", false)], plus(24 * 60 + 1));
    expect(r3.events).toEqual([{ type: "still", check: chk("fn_sos-notify", false), downMin: 24 * 60 + 1 }]);
    const r4 = diffChecks(r3.memory, [chk("fn_sos-notify", false)], plus(24 * 60 + 30));
    expect(r4.events).toEqual([]);
  });
  it("a check that vanishes (no public game to probe) is forgotten, not alarmed", () => {
    const r1 = diffChecks({}, [chk("site_game", true)], T0);
    const r2 = diffChecks(r1.memory, [], plus(5));
    expect(r2.events).toEqual([]);
    expect(r2.memory).toEqual({});
  });
  it("a whole-API outage is one line, its children muted; the recovery lists them", () => {
    const downs = [chk("api_board", false, "HTTP 503"), chk("api_players", false), chk("fn_sos-notify", false), chk("auth_settings", false), chk("site_home", false, "x")]
      .map((check) => ({ type: "down" as const, check }));
    const g = groupOutage(downs);
    expect(g.map((e) => e.check.id)).toEqual(["api", "site_home"]);
    expect(g[0].check.detail).toContain("database/API unreachable — HTTP 503");
    expect(groupOutage(downs.slice(0, 1)).length).toBe(1);
  });
});

describe("words in Telegram", () => {
  it("a run with nothing new says nothing", () => {
    expect(formatRun([], T0)).toBeNull();
  });
  it("a down message names the check, what players see, the one action and the raw detail, in Stockholm time", () => {
    const text = formatRun([{ type: "down", check: chk("auth_google", false, "HTTP 404: not found") }], T0)!;
    expect(text).toContain("🔴 Courtship — 1 problem · lör 24 okt 12:00");
    expect(text).toContain("❌ Google sign-in (start)");
    expect(text).toContain("Players: “Continue with Google” fails or 404s");
    expect(text).toContain("Do: Lovable → Cloud → Users → Settings → Google must be ON");
    expect(text).toContain("Detail: HTTP 404: not found");
  });
  it("recoveries and reminders have their own sections with human durations", () => {
    const text = formatRun([
      { type: "up", check: chk("site_board", true), downMin: 17 },
      { type: "up", check: chk("db_mail", true), downMin: 60 * 5 },
      { type: "still", check: chk("fn_email-notify", false, "404"), downMin: 60 * 24 * 3 },
    ], T0)!;
    expect(text).toContain("🟢 Back to normal");
    expect(text).toContain("• Board page — was down 17 min");
    expect(text).toContain("• Email delivery — was down 5 h");
    expect(text).toContain("⏳ Still down");
    expect(text).toContain("• Edge function email-notify — 3 d — 404");
  });
  it("normalizes player errors so ids and numbers never defeat the dedupe", () => {
    expect(normalizeMessage("Row 7473c147-15d3-4609-a2c1-dd27de795ba1 failed after 300 ms", "/e/7473c147-15d3-4609-a2c1-dd27de795ba1?x=1"))
      .toBe("row <id> failed after <n> ms@/e/<id>");
    expect(normalizeMessage("A", "")).toBe("a@");
  });
  it("tells a new error at once, counts repeats, stays quiet on the same error within 6 h, speaks again after", () => {
    const e = (at: string, message = "Failed to fetch", where = "/board") => ({ at, kind: "promise", message, where, signed_in: true });
    const s1 = selectPlayerErrors([e(T0), e(plus(1)), e(plus(2), "Failed to fetch", "/me")], {}, plus(2));
    expect(s1.tell.map((t) => `${t.where}×${t.n}`)).toEqual(["/board×2", "/me×1"]);
    const s2 = selectPlayerErrors([e(plus(10))], s1.seen, plus(10));
    expect(s2.tell).toEqual([]);
    expect(s2.seen[normalizeMessage("Failed to fetch", "/board")].n).toBe(3);
    const s3 = selectPlayerErrors([e(plus(7 * 60))], s2.seen, plus(7 * 60));
    expect(s3.tell.length).toBe(1);
    // memory older than 12 h is dropped
    const s4 = selectPlayerErrors([], s3.seen, plus(20 * 60));
    expect(Object.keys(s4.seen)).toEqual([]);
    // junk rows are ignored
    expect(selectPlayerErrors([null as any, { at: T0, kind: "x", message: "", where: "" }], {}, T0).tell).toEqual([]);
  });
  it("formats player errors with who/where/count and caps the list", () => {
    const tell = Array.from({ length: 7 }, (_, i) => ({ at: T0, kind: "shown", message: `Error ${i}`, where: `/p${i}`, signed_in: i % 2 === 0, details: i === 0 ? "stack line 1\nline 2" : null, n: i + 1 }));
    const text = formatPlayerErrors(tell, T0)!;
    expect(text).toContain("👤 A player hit an error");
    expect(text).toContain("⚠️ Error 0");
    expect(text).toContain("where: /p0 · member · shown");
    expect(text).toContain("where: /p1 · guest · shown · ×2");
    expect(text).toContain("stack line 1 line 2");
    expect(text).toContain("…and 2 more");
    expect(text).toContain("Do: open Admin → Health");
    expect(formatPlayerErrors([], T0)).toBeNull();
  });
  it("heartbeat is due once per Stockholm day at or after 08:00 — also across the DST change", () => {
    expect(heartbeatDue("2026-10-24T05:59:00Z", undefined)).toMatchObject({ due: false, day: "2026-10-24" }); // 07:59 CEST
    expect(heartbeatDue("2026-10-24T06:00:00Z", undefined)).toMatchObject({ due: true, day: "2026-10-24" });  // 08:00 CEST
    expect(heartbeatDue("2026-10-24T06:05:00Z", "2026-10-24").due).toBe(false);
    expect(heartbeatDue("2026-10-26T06:30:00Z", "2026-10-25")).toMatchObject({ due: false, day: "2026-10-26" }); // 07:30 CET after DST
    expect(heartbeatDue("2026-10-26T07:00:00Z", "2026-10-25")).toMatchObject({ due: true, day: "2026-10-26" });  // 08:00 CET
    expect(localDayHour("2026-12-31T23:30:00Z")).toEqual({ day: "2027-01-01", hour: 0 });
  });
  it("the heartbeat, hello and build lines read like a person wrote them", () => {
    const checks = [chk("site_home", true), { ...chk("api_board", true), ms: 3100 }, chk("db_mail", false, "2 failed")];
    const hb = formatHeartbeat(checks, FACTS, "2026-10-24T06:00:00Z", 3);
    expect(hb).toContain("🟠 Courtship morning check · lör 24 okt 08:00");
    expect(hb).toContain("2/3 checks green — down: Email delivery");
    expect(hb).toContain("3 player errors in 24 h");
    expect(hb).toContain("2 open games · 1 event waiting for approval · 101 players");
    expect(hb).toContain("slowest: Database: board 3100 ms");
    expect(formatHeartbeat([chk("a", true)], {}, T0, 1)).toContain("✅ Courtship morning check");
    expect(formatHeartbeat([chk("a", true)], {}, T0, 1)).toContain("1 player error in 24 h");
    expect(formatHello(checks, T0)).toContain("Right now: 2/3 green — down: Email delivery.");
    expect(formatHello([chk("a", true)], T0)).toContain("1/1 green.");
    expect(formatBuildChange(T0)).toContain("🚀 New build live on court-ship.com · lör 24 okt 12:00");
    expect(stockholm("2026-01-05T11:05:00Z")).toBe("mån 5 jan 12:05");
  });
  it("splits a long message on lines under Telegram's cap", () => {
    const text = Array.from({ length: 300 }, (_, i) => `line ${i} ${"x".repeat(20)}`).join("\n");
    const parts = splitTelegram(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 3900)).toBe(true);
    expect(parts.join("\n")).toBe(text);
    expect(splitTelegram("short")).toEqual(["short"]);
  });
});
