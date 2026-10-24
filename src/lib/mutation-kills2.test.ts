// @vitest-environment jsdom
// Mutation-hardening layer 2: RUNTIME survivors from the first Stryker run.
// Three ideas run through this file:
//   1. The supabase mock RECORDS every argument, so table/column/rpc-name
//      literals are pinned at the client boundary (schema-drift protection).
//   2. Every test is SELF-CONTAINED (own navigator/clipboard/storage state) —
//      under Stryker only the covering tests run, in a fresh jsdom, so a test
//      that leans on a neighbour's setup would silently stop killing.
//   3. Assertions are EXACT (toBe/toEqual on whole objects and strings) —
//      toContain lets replace()/template mutants slip through.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const H = vi.hoisted(() => ({
  calls: [] as { m: string; a: unknown[] }[],
  queue: [] as unknown[], // outcomes for terminal awaits, consumed in order
  fallback: { data: null, error: null } as unknown,
  user: { id: "u-oxy" } as { id: string } | null,
  toastOk: [] as unknown[][],
  toastErr: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client", () => {
  const outcome = () => (H.queue.length ? H.queue.shift() : H.fallback);
  const settle = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    const o = outcome();
    return o instanceof Error ? (rej ? rej(o) : Promise.reject(o)) : res(o);
  };
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "insert", "update", "delete", "single", "maybeSingle", "limit"]) {
      c[m] = (...a: unknown[]) => { H.calls.push({ m, a }); return c; };
    }
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => settle(res, rej);
    return c;
  };
  return {
    supabase: {
      from: (...a: unknown[]) => { H.calls.push({ m: "from", a }); return chain(); },
      rpc: (...a: unknown[]) => {
        H.calls.push({ m: "rpc", a });
        const o = outcome();
        return o instanceof Error ? Promise.reject(o) : Promise.resolve(o);
      },
      auth: { getUser: async () => ({ data: { user: H.user } }), getSession: async () => ({ data: { session: H.user ? { user: H.user } : null }, error: null }) },
    },
  };
});
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => { H.toastOk.push(a); },
    error: (...a: unknown[]) => { H.toastErr.push(a); },
  },
}));

const args = (m: string) => H.calls.filter((c) => c.m === m).map((c) => c.a);

beforeEach(() => {
  localStorage.clear();
  H.calls.length = 0;
  H.queue.length = 0;
  H.toastOk.length = 0;
  H.toastErr.length = 0;
  H.user = { id: "u-oxy" };
});
afterEach(() => {
  vi.useRealTimers();
  delete (navigator as unknown as Record<string, unknown>).share;
  delete (navigator as unknown as Record<string, unknown>).clipboard;
  delete (document as unknown as Record<string, unknown>).execCommand;
});

/* ────────────────────────── courtship.ts runtime arms ───────────────────── */

describe("courtship: meta helpers pinned exactly", () => {
  it("sportMeta all three sports + default", async () => {
    const M = await import("./courtship");
    expect(M.sportMeta("padel")).toEqual({ emoji: "🏓", key: "sport.padel" });
    expect(M.sportMeta("badminton")).toEqual({ emoji: "🏸", key: "sport.badminton" });
    expect(M.sportMeta("tennis")).toEqual({ emoji: "🎾", key: "sport.tennis" });
    expect(M.sportMeta(null)).toEqual({ emoji: "🎾", key: "sport.tennis" });
    expect(M.sportMeta(undefined)).toEqual({ emoji: "🎾", key: "sport.tennis" });
  });
  it("courtTypeMeta full matrix incl. degrade-to-outdoor", async () => {
    const M = await import("./courtship");
    expect(M.courtTypeMeta("indoor", "en")).toEqual({ label: "Indoor", emoji: "🏠" });
    expect(M.courtTypeMeta("outdoor", "en")).toEqual({ label: "Outdoor", emoji: "☀️" });
    expect(M.courtTypeMeta("indoor", "sv")).toEqual({ label: "Inne", emoji: "🏠" });
    expect(M.courtTypeMeta("outdoor", "sv")).toEqual({ label: "Ute", emoji: "☀️" });
    expect(M.courtTypeMeta(null)).toEqual({ label: "Outdoor", emoji: "☀️" });
    expect(M.courtTypeMeta("hoverboard")).toEqual({ label: "Outdoor", emoji: "☀️" });
  });
  it("durationLabel: the 90-minute arm is the observable one", async () => {
    const M = await import("./courtship");
    expect(M.durationLabel(90)).toBe("1.5h");
    expect(M.durationLabel(60)).toBe("1h");
    expect(M.durationLabel(120)).toBe("2h");
    expect(M.durationLabel(180)).toBe("3h");
  });
  it("hourRange pads exactly two digits for non-zero minutes", async () => {
    const M = await import("./courtship");
    const a = new Date(); a.setHours(9, 5, 0, 0);
    const b = new Date(); b.setHours(11, 0, 0, 0);
    expect(M.hourRange(a, b)).toBe("9:05–11");
  });
  it("spotsNeeded mapping", async () => {
    const M = await import("./courtship");
    expect(M.spotsNeeded("doubles_need3")).toBe(3);
    expect(M.spotsNeeded("doubles_need2")).toBe(2);
    expect(M.spotsNeeded("doubles_need1")).toBe(1);
    expect(M.spotsNeeded("singles")).toBe(1);
  });
});

describe("courtship: whenLabel exact strings (locale + dictionary)", () => {
  const FROZEN = new Date("2026-08-19T12:00:00.000Z");
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FROZEN); });

  it("EN today/tomorrow/other-day exact", async () => {
    const M = await import("./courtship");
    localStorage.removeItem("courtship.lang");
    expect(M.whenLabel("2026-08-19T13:07:00.000Z")).toBe("Today 13:07");
    expect(M.whenLabel("2026-08-20T13:07:00.000Z")).toBe("Tomorrow 13:07");
    expect(M.whenLabel("2026-08-24T13:07:00.000Z")).toBe("Mon 24 Aug · 13:07");
  });
  it("SV via the exact courtship.lang storage key", async () => {
    const M = await import("./courtship");
    localStorage.setItem("courtship.lang", "sv");
    expect(M.whenLabel("2026-08-19T13:07:00.000Z")).toBe("Idag 13:07");
    expect(M.whenLabel("2026-08-20T13:07:00.000Z")).toBe("Imorgon 13:07");
    expect(M.whenLabel("2026-08-24T13:07:00.000Z")).toBe("mån 24 aug. · 13:07");
  });
});

describe("courtship: tier guards and first/top tier edges (all four ladders)", () => {
  it("0 / negative / NaN are calmly null", async () => {
    const M = await import("./courtship");
    for (const fn of [M.activityTier, M.rescuerTier, M.recruiterTier, M.matchmakerTier]) {
      expect(fn(0)).toBeNull();
      expect(fn(-5)).toBeNull();
      expect(fn(NaN)).toBeNull();
    }
  });
  it("first tier carries the exact next threshold", async () => {
    const M = await import("./courtship");
    expect(M.activityTier(1)).toEqual({ level: 1, name: "Rookie", emoji: "🎾", at: 1, next: 10, nextName: "Regular" });
    expect(M.rescuerTier(1)).toEqual({ level: 1, name: "Set Saver", emoji: "🎾", at: 1, next: 3, nextName: "Match Medic" });
    expect(M.recruiterTier(1)).toEqual({ level: 1, name: "Wingman", emoji: "🤝", at: 1, next: 3, nextName: "Connector" });
    expect(M.matchmakerTier(1)).toEqual({ level: 1, name: "Host", emoji: "🎪", at: 1, next: 4, nextName: "Organizer" });
  });
  it("top tier is maxed: next and nextName are null", async () => {
    const M = await import("./courtship");
    expect(M.activityTier(400)).toEqual({ level: 7, name: "GOAT", emoji: "🐐", at: 400, next: null, nextName: null });
    expect(M.rescuerTier(100)).toEqual({ level: 5, name: "Living Legend", emoji: "🏆", at: 100, next: null, nextName: null });
    expect(M.recruiterTier(25)).toEqual({ level: 5, name: "Legend", emoji: "🌟", at: 25, next: null, nextName: null });
    expect(M.matchmakerTier(40)).toEqual({ level: 5, name: "Impresario", emoji: "🌟", at: 40, next: null, nextName: null });
  });
});

/* ────────────────────────── celebrate.ts runtime arms ───────────────────── */

const PROGRESS_KEY = "courtship.progress";

describe("celebrate: exact celebration objects per kind", () => {
  it("game 9→10 (level-up into Regular)", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 9, rescues: 2, referrals: 2, hosted: 3 }));
    expect(checkCelebration(10, 2, 2, 3)).toEqual({
      kind: "game", count: 10, leveledUp: true, tierName: "Regular", tierEmoji: "🟢",
      toNext: 15, nextName: "Local", track: "activity", tierLevel: 2, nextLevel: 3,
    });
  });
  it("rescue 2→3 (Match Medic)", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 5, rescues: 2, referrals: 2, hosted: 3 }));
    expect(checkCelebration(5, 3, 2, 3)).toEqual({
      kind: "rescue", count: 3, leveledUp: true, tierName: "Match Medic", tierEmoji: "🚑",
      toNext: 7, nextName: "Court Hero", track: "rescuer", tierLevel: 2, nextLevel: 3,
    });
  });
  it("recruit 2→3 (Connector)", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 5, rescues: 2, referrals: 2, hosted: 3 }));
    expect(checkCelebration(5, 2, 3, 3)).toEqual({
      kind: "recruit", count: 3, leveledUp: true, tierName: "Connector", tierEmoji: "🔗",
      toNext: 4, nextName: "Influencer", track: "recruiter", tierLevel: 2, nextLevel: 3,
    });
  });
  it("host 3→4 (Organizer)", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 5, rescues: 2, referrals: 2, hosted: 3 }));
    expect(checkCelebration(5, 2, 2, 4)).toEqual({
      kind: "host", count: 4, leveledUp: true, tierName: "Organizer", tierEmoji: "📅",
      toNext: 6, nextName: "Ringleader", track: "matchmaker", tierLevel: 2, nextLevel: 3,
    });
  });
  it("maxed ladder: GOAT has no next", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 400, rescues: 0, referrals: 0, hosted: 0 }));
    expect(checkCelebration(401, 0, 0, 0)).toEqual({
      kind: "game", count: 401, leveledUp: false, tierName: "GOAT", tierEmoji: "🐐",
      toNext: null, nextName: null, track: "activity", tierLevel: 7, nextLevel: null,
    });
  });
});

describe("celebrate: baseline shape guards actually gate", () => {
  it("baseline missing rescues → rejected as first run (no false celebration)", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 1 }));
    expect(checkCelebration(2, 0, 0, 0)).toBeNull();
  });
  it("baseline with non-number rescues → rejected as first run", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 0, rescues: "nope" }));
    expect(checkCelebration(1, 1, 0, 0)).toBeNull();
  });
  it("legacy baseline with STRING referrals → treated as current, never fires", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 1, rescues: 0, referrals: "1", hosted: 0 }));
    expect(checkCelebration(1, 0, 2, 0)).toBeNull();
  });
  it("legacy baseline with STRING hosted → treated as current, never fires", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: 1, rescues: 0, referrals: 0, hosted: "2" }));
    expect(checkCelebration(1, 0, 0, 3)).toBeNull();
  });
  it("baseline with STRING games → rejected as first run (both typeof arms gate)", async () => {
    const { checkCelebration } = await import("./celebrate");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ games: "1", rescues: 0 }));
    expect(checkCelebration(2, 0, 0, 0)).toBeNull();
  });
});

/* ──────────────────────────── share.ts runtime arms ─────────────────────── */

describe("share: storage key + guards", () => {
  it("rememberNext writes under the literal courtship.next key (first share import lands here)", async () => {
    const S = await import("./share");
    S.rememberNext("/z");
    expect(localStorage.getItem("courtship.next")).toBe("/z");
    expect(S.consumeNext()).toBe("/z");
  });
  it("an invalid next must NOT clobber a remembered one", async () => {
    const S = await import("./share");
    S.rememberNext("/a");
    S.rememberNext("");            // rejected — must not overwrite
    S.rememberNext("https://evil.com");
    expect(S.consumeNext()).toBe("/a");
  });
  it("consuming an empty slot touches nothing", async () => {
    const S = await import("./share");
    const rm = vi.spyOn(Storage.prototype, "removeItem");
    expect(S.consumeNext()).toBeNull();
    expect(rm).not.toHaveBeenCalled();
    rm.mockRestore();
  });
});

describe("share: rpc names + exact message assembly", () => {
  it("invite + game links call the ensure_my_invite_code rpc literally", async () => {
    const S = await import("./share");
    H.queue.push({ data: "ZZZ" }, { data: "ZZZ" });
    await S.myInviteLink();
    await S.myGameShareLink("g1");
    expect(args("rpc")).toEqual([["ensure_my_invite_code"], ["ensure_my_invite_code"]]);
  });
  it("shareInvite: byte-exact final message (no leftover placeholders, no mangling)", async () => {
    const S = await import("./share");
    H.queue.push({ data: "ZZZ" }, { data: { name: "  Oksana Chopak " } });
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).share = share;
    await S.shareInvite("Join: {link} code {code}", "copied");
    // plain invite → the LIVE BOARD with the inviter's first name (trimmed,
    // first word only) — value first, the code rides into signup
    expect(share.mock.calls[0][0]).toEqual({
      text: `Join: ${window.location.origin}/board?code=ZZZ&by=Oksana code ZZZ`,
    });
    expect(args("from")).toEqual([["profiles"]]);
    expect(args("select")).toEqual([["name"]]);
    expect(args("eq")).toEqual([["id", "u-oxy"]]);
  });
  it("myInviteLink: the inviter name is capped at 30 chars, and skipped when unknown", async () => {
    const S = await import("./share");
    const long = "Abcdefghijklmnopqrstuvwxyzabcdefghij"; // 36 chars, no spaces
    H.queue.push({ data: "ZZZ" }, { data: { name: long } });
    expect(await S.myInviteLink()).toBe(`${window.location.origin}/board?code=ZZZ&by=${long.slice(0, 30)}`);
    for (const bad of [{ data: { name: "" } }, { data: { name: "   " } }, { data: { name: null } }, { data: null }, new Error("net")]) {
      H.queue.push({ data: "ZZZ" }, bad);
      expect(await S.myInviteLink()).toBe(`${window.location.origin}/board?code=ZZZ`);
    }
  });
  it("myInviteLink: signed out → no profile lookup at all; a deep-link next → /auth and no lookup either", async () => {
    const S = await import("./share");
    H.user = null;
    H.queue.push({ data: "ZZZ" });
    expect(await S.myInviteLink()).toBe(`${window.location.origin}/board?code=ZZZ`);
    expect(args("from")).toEqual([]);
    H.user = { id: "u-oxy" };
    H.queue.push({ data: "ZZZ" });
    expect(await S.myInviteLink("/sos/1?join=t")).toBe(`${window.location.origin}/auth?code=ZZZ&next=%2Fsos%2F1%3Fjoin%3Dt`);
    expect(args("from")).toEqual([]);
  });
  it("shareInvite with a code-less link: the {code} slot goes out EMPTY, byte-exact", async () => {
    const S = await import("./share");
    H.queue.push({ data: null }); // rpc succeeded but returned no code
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).share = share;
    await S.shareInvite("m {link} c={code}", "copied");
    expect(share.mock.calls[0][0]).toEqual({ text: `m ${window.location.origin} c=` });
  });
  it("shareTo: link already present → shared once, byte-exact", async () => {
    const S = await import("./share");
    H.queue.push({ data: null }); // code-less → link is origin + next-less? no: shareTo passes next
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).share = share;
    await S.shareTo("/events", `Come: ${window.location.origin}`, "copied");
    // code rpc returned null → myInviteLink degrades to bare origin, which the
    // template already contains → NO append, text goes out untouched.
    expect(share.mock.calls[0][0]).toEqual({ text: `Come: ${window.location.origin}` });
  });
  it("shareTo: lost placeholder → trimmed message + single space + link", async () => {
    const S = await import("./share");
    H.queue.push({ data: null });
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).share = share;
    await S.shareTo("/events", "Come play!   ", "copied");
    expect(share.mock.calls[0][0]).toEqual({ text: `Come play! ${window.location.origin}` });
  });
});

describe("share: legacy copy path — the textarea ritual is load-bearing", () => {
  it("execCommand copy sees a readonly, off-screen textarea holding the text, and it is removed after", async () => {
    const S = await import("./share");
    (navigator as unknown as Record<string, unknown>).clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error("denied")),
    };
    let seen: Record<string, unknown> | null = null;
    (document as Document & { execCommand?: unknown }).execCommand = vi.fn((cmd: string) => {
      const ta = document.querySelector("textarea") as HTMLTextAreaElement;
      seen = {
        cmd,
        value: ta.value,
        readonly: ta.getAttribute("readonly"),
        position: ta.style.position,
        opacity: ta.style.opacity,
        attached: ta.parentNode === document.body,
      };
      return true;
    });
    await S.copyText("hello", "copied!");
    expect(seen).toEqual({ cmd: "copy", value: "hello", readonly: "", position: "fixed", opacity: "0", attached: true });
    expect(document.querySelector("textarea")).toBeNull();
    expect(H.toastOk).toEqual([["copied!"]]);
  });
});

describe("share: AbortError must not leak into the clipboard", () => {
  it("user cancel → clipboard NEVER touched, no toasts at all", async () => {
    const S = await import("./share");
    const e = new Error("cancel"); e.name = "AbortError";
    (navigator as unknown as Record<string, unknown>).share = vi.fn().mockRejectedValue(e);
    const writeText = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).clipboard = { writeText };
    await S.shareMessage("msg", "copied");
    expect(writeText).not.toHaveBeenCalled();
    expect(H.toastOk).toEqual([]);
    expect(H.toastErr).toEqual([]);
  });
});

/* ─────────────────────────── draftGame.ts runtime arms ──────────────────── */

const DRAFT = {
  court_id: "c1", city: "Uppsala", play_at: "2027-01-01T10:00:00.000Z",
  play_until: "2027-01-01T12:00:00.000Z", court_type_any: true, format: "singles",
  level_min: 2, level_max: 4, court_status: "booked", court_type: "indoor",
  duration_min: 90, note: "hi",
};

describe("draftGame: the insert contract is pinned at the boundary", () => {
  it("publishes into sos_requests selecting id, with the exact row", async () => {
    const D = await import("./draftGame");
    localStorage.setItem("courtship.draftGame", JSON.stringify(DRAFT));
    H.queue.push({ data: { id: "g7" }, error: null });
    expect(await D.publishDraftGame("u-oxy")).toEqual({ id: "g7", reason: null });
    expect(args("from")).toEqual([["sos_requests"]]);
    expect(args("select")).toEqual([["id"]]);
    expect(args("single")).toEqual([[]]);
    expect(args("insert")).toEqual([[{
      caller_id: "u-oxy", play_at: DRAFT.play_at, play_until: DRAFT.play_until,
      court_type_any: true, court_id: "c1", format: "singles", level_min: 2,
      level_max: 4, court_status: "booked", note: "hi", status: "active",
      kind: "open", auto_flare: true, flared_at: null, court_type: "indoor",
      duration_min: 90,
    }]]);
    expect(localStorage.getItem("courtship.draftGame")).toBeNull(); // cleared on success
  });

  it("accumulative column drops: each retry hits sos_requests/id and sheds exactly one column", async () => {
    const D = await import("./draftGame");
    localStorage.setItem("courtship.draftGame", JSON.stringify(DRAFT));
    H.queue.push(
      { data: null, error: { message: "column court_type_any does not exist" } },
      { data: null, error: { message: "column play_until does not exist" } },
      { data: null, error: { message: "column duration_min does not exist" } },
      { data: { id: "g8" }, error: null },
    );
    expect(await D.publishDraftGame("u-oxy")).toEqual({ id: "g8", reason: null });
    expect(args("from")).toEqual([["sos_requests"], ["sos_requests"], ["sos_requests"], ["sos_requests"]]);
    expect(args("select")).toEqual([["id"], ["id"], ["id"], ["id"]]);
    const inserted = args("insert").map((a) => Object.keys(a[0] as object).sort());
    expect(inserted[0]).toContain("court_type_any");
    expect(inserted[1]).not.toContain("court_type_any");
    expect(inserted[1]).toContain("play_until");
    expect(inserted[2]).not.toContain("play_until");
    expect(inserted[2]).toContain("duration_min");
    expect(inserted[3]).not.toContain("duration_min");
  });

  it("stale boundary is exactly now+5min: AT the line publishes, 1s inside is stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"));
    const D = await import("./draftGame");
    // exactly at the boundary → NOT stale → an insert is attempted
    localStorage.setItem("courtship.draftGame", JSON.stringify({ ...DRAFT, play_at: "2026-08-19T12:05:00.000Z" }));
    H.queue.push({ data: { id: "gEdge" }, error: null });
    expect(await D.publishDraftGame("u-oxy")).toEqual({ id: "gEdge", reason: null });
    expect(args("from").length).toBe(1);
    // one second inside the window → stale, draft kept, NO insert
    H.calls.length = 0;
    localStorage.setItem("courtship.draftGame", JSON.stringify({ ...DRAFT, play_at: "2026-08-19T12:04:59.000Z" }));
    expect(await D.publishDraftGame("u-oxy")).toEqual({ id: null, reason: "stale" });
    expect(args("from").length).toBe(0);
    expect(localStorage.getItem("courtship.draftGame")).not.toBeNull();
  });

  it("a null data payload (no error object) resolves calmly to failed — never throws", async () => {
    const D = await import("./draftGame");
    localStorage.setItem("courtship.draftGame", JSON.stringify(DRAFT));
    H.queue.push({ data: null, error: null });
    await expect(D.publishDraftGame("u-oxy")).resolves.toEqual({ id: null, reason: "failed" });
    expect(localStorage.getItem("courtship.draftGame")).not.toBeNull(); // kept for the wizard
  });
});

/* ─────────────────────── cities / areas / courts boundaries ─────────────── */

describe("cities: query args + fallback are exact", () => {
  it("fetchCities queries cities(name,timezone,granularity_min) active-only ordered by sort, and seeds granularity", async () => {
    vi.resetModules();
    const C = await import("./cities");
    const M = await import("./courtship");
    H.queue.push({ data: [{ name: "Visby", timezone: "Europe/Stockholm", granularity_min: 15 }], error: null });
    const rows = await C.fetchCities();
    expect(rows).toEqual([{ name: "Visby", timezone: "Europe/Stockholm", granularity_min: 15 }]);
    expect(args("from")).toEqual([["cities"]]);
    expect(args("select")).toEqual([["name,timezone,granularity_min"]]);
    expect(args("eq")).toEqual([["active", true]]);
    expect(args("order")).toEqual([["sort"]]);
    expect(M.cityGranularity("Visby")).toBe(15); // side-effect seeding
  });
  it("null data → the exact static fallback trio with real granularities", async () => {
    vi.resetModules();
    const C = await import("./cities");
    H.queue.push({ data: null, error: null });
    expect(await C.fetchCities()).toEqual([
      { name: "Uppsala", timezone: "Europe/Stockholm", granularity_min: 60 },
      { name: "Stockholm", timezone: "Europe/Stockholm", granularity_min: 30 },
      { name: "Miami", timezone: "Europe/Stockholm", granularity_min: 60 },
    ]);
  });
});

describe("areas: query args + inflight dedupe are exact", () => {
  it("fetchCityAreas queries city_areas(city,area,sort) ordered by city then sort — and concurrent callers share ONE flight", async () => {
    vi.resetModules();
    const A = await import("./areas");
    H.queue.push({ data: [{ city: "Uppsala", area: "Luthagen", sort: 1 }], error: null });
    const [r1, r2] = await Promise.all([A.fetchCityAreas(), A.fetchCityAreas()]);
    expect(r1).toEqual({ Uppsala: ["Luthagen"] });
    expect(r2).toBe(r1);
    expect(args("from")).toEqual([["city_areas"]]); // exactly one query
    expect(args("select")).toEqual([["city,area,sort"]]);
    expect(args("order")).toEqual([["city"], ["sort"]]);
  });
});

describe("courts: query args + custom-court insert are exact", () => {
  it("fetchCourtsForPicker: courts(cols) hidden=false ordered is_custom,name", async () => {
    const K = await import("./courts");
    H.queue.push({ data: [], error: null });
    await K.fetchCourtsForPicker();
    expect(args("from")).toEqual([["courts"]]);
    expect(args("select")).toEqual([["id,name,area,city,is_custom,hidden,created_by"]]);
    expect(args("eq")).toEqual([["hidden", false]]);
    expect(args("order")).toEqual([["is_custom"], ["name"]]);
  });
  it("addCustomCourt: missing area degrades to null, row pinned exactly", async () => {
    const K = await import("./courts");
    H.queue.push({ data: { id: "c9", name: "Backyard", area: null, city: "Uppsala", is_custom: true, hidden: false, created_by: "u-oxy" }, error: null });
    await K.addCustomCourt({ name: "  Backyard ", area: null, city: "Uppsala" });
    expect(args("from")).toEqual([["courts"]]);
    expect(args("insert")).toEqual([[{
      name: "Backyard", area: null, city: "Uppsala", is_custom: true, created_by: "u-oxy", hidden: false,
    }]]);
    expect(args("select")).toEqual([["id,name,area,city,is_custom,hidden,created_by"]]);
  });
  it("admin ops call their rpcs by exact name", async () => {
    const K = await import("./courts");
    H.queue.push({ data: [], error: null }, { data: null, error: null }, { data: null, error: null });
    await K.adminListCustomCourts();
    await K.adminSetCourtHidden("c1", true);
    await K.adminUpdateCourt("c1", "N", "A");
    expect(args("rpc")).toEqual([
      ["admin_courts_list"],
      ["admin_set_court_hidden", { _court_id: "c1", _hidden: true }],
      ["admin_update_court", { _court_id: "c1", _name: "N", _area: "A" }],
    ]);
  });
});
