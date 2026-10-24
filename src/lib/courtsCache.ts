// Courts are a small, slow-changing table that half the screens look up by id
// right after another query (sos_requests → courts, games → courts): a second
// round-trip on every screen, ~250 ms on a phone (2026-10-24 perf probe).
// One fetch per session (5 min), shared by concurrent callers.
import { supabase } from "@/integrations/supabase/client";

export type CourtLite = { id: string; name: string; city: string | null; area: string | null };

const TTL_MS = 5 * 60_000;
let cache: { at: number; byId: Map<string, CourtLite> } | null = null;
let inflight: Promise<Map<string, CourtLite>> | null = null;

async function load(client: any, at: number): Promise<Map<string, CourtLite>> {
  const { data } = await client.from("courts").select("id,name,city,area");
  const byId = new Map<string, CourtLite>(((data as CourtLite[] | null) ?? []).map((c) => [c.id, c]));
  cache = { at, byId };
  return byId;
}

/** All courts by id — from memory when fresh, one shared request otherwise. */
export function courtsById(client: any = supabase, now: number = Date.now()): Promise<Map<string, CourtLite>> {
  if (cache && now - cache.at < TTL_MS) return Promise.resolve(cache.byId);
  if (!inflight) inflight = load(client, now).finally(() => { inflight = null; });
  return inflight;
}

/** Start the fetch early (e.g. at the top of a screen's load) so it runs in
 *  parallel with the queries that will need it. */
export function warmCourts(client: any = supabase): void {
  void courtsById(client).catch(() => undefined);
}

/** After adding or hiding a court, the next lookup refetches. */
export function invalidateCourts(): void { cache = null; }
