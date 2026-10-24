import { beforeEach, describe, expect, it } from "vitest";
import { courtsById, invalidateCourts, warmCourts } from "./courtsCache";

const ROWS = [{ id: "c1", name: "UTK-hallen", city: "Uppsala", area: null }, { id: "c2", name: "KLTK", city: "Stockholm", area: "Östermalm" }];
function client(rows: any = ROWS, delayMs = 0) {
  const calls: string[] = [];
  const c = { calls, from: (t: string) => ({ select: async (cols: string) => { calls.push(`${t}:${cols}`); if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); return { data: rows, error: null }; } }) };
  return c;
}

describe("courtsById", () => {
  beforeEach(() => invalidateCourts());
  it("fetches once and serves the rest from memory", async () => {
    const c = client();
    const a = await courtsById(c, 1000);
    expect(a.get("c1")?.name).toBe("UTK-hallen");
    const b = await courtsById(c, 2000);
    expect(b).toBe(a);
    expect(c.calls).toEqual(["courts:id,name,city,area"]);
  });
  it("concurrent callers share one request", async () => {
    const c = client(ROWS, 20);
    const [a, b, d] = await Promise.all([courtsById(c, 1), courtsById(c, 2), courtsById(c, 3)]);
    expect(c.calls.length).toBe(1);
    expect(a).toBe(b); expect(b).toBe(d);
  });
  it("refetches after the TTL, after invalidation, and tolerates null data", async () => {
    const c = client();
    await courtsById(c, 0);
    await courtsById(c, 5 * 60_000 + 1);
    expect(c.calls.length).toBe(2);
    invalidateCourts();
    await courtsById(c, 5 * 60_000 + 2);
    expect(c.calls.length).toBe(3);
    invalidateCourts();
    const empty = await courtsById(client(null), 0);
    expect(empty.size).toBe(0);
  });
  it("warmCourts starts the fetch and never throws", async () => {
    const c = client();
    warmCourts(c);
    await new Promise((r) => setTimeout(r, 0));
    expect(c.calls.length).toBe(1);
    invalidateCourts();
    const boom = { from: () => ({ select: async () => { throw new Error("down"); } }) };
    warmCourts(boom);
    await new Promise((r) => setTimeout(r, 0));
    // a failed warm-up leaves nothing cached; the next call retries
    const again = client();
    await courtsById(again, 0);
    expect(again.calls.length).toBe(1);
  });
});
