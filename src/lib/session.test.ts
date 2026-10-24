import { describe, expect, it } from "vitest";
import { SessionGate } from "./session";

const client = (session: any, error: any = null, throws = false) => ({
  auth: { getSession: async () => { if (throws) throw new Error("boom"); return { data: { session }, error }; } },
});
const anna = { id: "u1", email: "anna@x.se", email_confirmed_at: "2026-01-01" };

describe("SessionGate.currentUser", () => {
  it("returns the local session's user without asking the server", async () => {
    const g = new SessionGate();
    expect(await g.currentUser(client({ user: anna }))).toEqual({ user: anna, unsure: false });
  });
  it("no session and no error = a guest, and forgets the previous member", async () => {
    const g = new SessionGate();
    await g.currentUser(client({ user: anna }));
    expect(await g.currentUser(client(null))).toEqual({ user: null, unsure: false });
    // the memory was cleared: a later network failure no longer resurrects Anna
    expect(await g.currentUser(client(null, { message: "Failed to fetch" }))).toEqual({ user: null, unsure: true });
  });
  it("a dead refresh token is a real sign-out", async () => {
    const g = new SessionGate();
    await g.currentUser(client({ user: anna }));
    for (const m of ["Invalid Refresh Token: Already Used", "refresh_token_not_found", "Session expired", "Auth session missing!"]) {
      expect(await g.currentUser(client(null, { message: m }))).toEqual({ user: null, unsure: false });
      await g.currentUser(client({ user: anna }));
    }
  });
  it("a network failure keeps the last known member signed in (unsure)", async () => {
    const g = new SessionGate();
    await g.currentUser(client({ user: anna }));
    expect(await g.currentUser(client(null, { message: "Failed to fetch" }))).toEqual({ user: anna, unsure: true });
    expect(await g.currentUser(client(null, null, true))).toEqual({ user: anna, unsure: true });
  });
  it("a network failure on a cold tab (no member seen yet) is a guest, flagged unsure", async () => {
    const g = new SessionGate();
    expect(await g.currentUser(client(null, { message: "NetworkError" }))).toEqual({ user: null, unsure: true });
    expect(await g.currentUser(client(null, null, true))).toEqual({ user: null, unsure: true });
  });
  it("tolerates a client that returns no data object at all, or an error without a message", async () => {
    const g = new SessionGate();
    const c = { auth: { getSession: async () => ({ data: null, error: null }) } };
    expect(await g.currentUser(c as any)).toEqual({ user: null, unsure: false });
    expect(await g.currentUser(client(null, {}))).toEqual({ user: null, unsure: true });
  });
});
