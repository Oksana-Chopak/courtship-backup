import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";

export type GameRow = {
  id: string;
  player_a: string;
  player_b: string | null; // null = opponent outside the app (see guest_name)
  guest_name?: string | null;
  confirmed_a: boolean;
  confirmed_b: boolean;
  reported_noshow: string | null;
  played_at: string;
  sos_id: string | null;
  archived_by?: string[] | null;
  created_at?: string | null;
  score?: string | null;
  winner?: string | null;
  court_id?: string | null;
};

/** Games this user played that are ≥ 2h after play time, not archived by them,
 *  not yet confirmed by them, and not older than 7 days (silent expiry). */
export async function fetchPendingPostGameChecks(uid: string): Promise<GameRow[]> {
  const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const orFilter = `player_a.eq.${uid},player_b.eq.${uid}`;
  // SOS/open games: only prompt once the play time has passed (2h grace).
  // Manually logged games (sos_id null): the game already happened, so the
  // partner can confirm right away — no grace window.
  const [sosRes, logRes] = await Promise.all([
    (supabase as any).from("games").select("*").or(orFilter)
      .not("sos_id", "is", null).lte("played_at", cutoff).gte("played_at", sevenDaysAgo)
      .is("reported_noshow", null).order("played_at", { ascending: false }),
    (supabase as any).from("games").select("*").or(orFilter)
      .is("sos_id", null).gte("played_at", sevenDaysAgo)
      .is("reported_noshow", null).order("played_at", { ascending: false }),
  ]);
  const rows = [...((sosRes.data as GameRow[]) ?? []), ...((logRes.data as GameRow[]) ?? [])];
  const seen = new Set<string>();
  return rows.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    const mine = g.player_a === uid ? g.confirmed_a : g.confirmed_b;
    if (mine) return false;
    if (Array.isArray(g.archived_by) && g.archived_by.includes(uid)) return false;
    return true;
  });
}

/** The app game (born from an SOS / open post) that a manual "Log a game"
 *  entry is really about: same opponent, not yet confirmed by me, within
 *  ±26h of the logged time. Logging it as a NEW row would leave the original
 *  asking "did this happen?" for a week (Lovable scan 2026-10-05) — so we
 *  confirm the original instead. Pure; the caller fetches the candidates. */
export function findSameGame(rows: GameRow[], uid: string, otherId: string, playedAtISO: string, windowMs = 26 * 3600e3): GameRow | null {
  const at = new Date(playedAtISO).getTime();
  for (const g of rows) {
    const other = g.player_a === uid ? g.player_b : g.player_a;
    if (other !== otherId) continue;
    if (Math.abs(new Date(g.played_at).getTime() - at) > windowMs) continue;
    return g;
  }
  return null;
}

/** Log a game you played (even one not arranged through the app). Creates a
 *  game already confirmed on your side; the other player confirms theirs, then
 *  it counts for both (via the existing bump trigger). Needs the log_game RPC.
 *  If the game already exists as an unconfirmed app game with that opponent
 *  around that time, it is confirmed (with the score) instead of duplicated. */
export async function logGame(
  otherId: string | null,
  playedAtISO: string,
  score?: string,
  winner?: string | null,
  courtId?: string | null,
  guestName?: string | null,
): Promise<{ courtSaved: boolean; merged?: boolean }> {
  if (otherId) {
    try {
      const { data: u } = await getUserLocal();
      const uid = u.user?.id;
      if (uid) {
        const same = findSameGame(await fetchPendingPostGameChecks(uid), uid, otherId, playedAtISO);
        if (same) {
          await confirmGame(same.id, score, winner);
          return { courtSaved: true, merged: true };
        }
      }
    } catch {
      /* lookup is best-effort — fall through to a normal log */
    }
  }
  const params: Record<string, any> = {
    _other_id: otherId,
    _played_at: playedAtISO,
    _score: score && score.trim() ? score.trim() : null,
  };
  // Opponent outside the app: just a name (BATCH14). If the DB isn't migrated
  // yet we must NOT silently degrade — the caller shows a clear error instead.
  if (guestName && guestName.trim()) params._guest_name = guestName.trim();
  if (winner && !params._guest_name) params._winner = winner; // guests can't hold a winner id
  if (courtId) params._court_id = courtId;
  let { error } = await (supabase as any).rpc("log_game", params);
  if (error && params._guest_name && /(_guest_name|does not exist|PGRST202|schema cache)/i.test(error.message ?? "")) {
    throw new Error("guest_needs_sql");
  }
  // Graceful path if the 5-arg RPC (court/winner) isn't applied yet: strip the
  // newer args one by one so the game itself is never lost, and tell the caller.
  if (error && courtId && /(_court_id|does not exist|PGRST202|schema cache)/i.test(error.message ?? "")) {
    delete params._court_id;
    ({ error } = await (supabase as any).rpc("log_game", params));
    if (!error) return { courtSaved: false };
  }
  if (error && params._winner && /(_winner|does not exist|PGRST202|schema cache)/i.test(error.message ?? "")) {
    delete params._winner;
    ({ error } = await (supabase as any).rpc("log_game", params));
    if (!error) return { courtSaved: false };
  }
  if (error) throw new Error(error.message);
  return { courtSaved: !!courtId };
}

export async function confirmGame(gameId: string, score?: string, winner?: string | null) {
  const params: Record<string, any> = { _game_id: gameId };
  // Mirror the _winner guard: only send a real score. (The SQL already keeps the
  // stored score on NULL/blank, but not sending it at all is belt & braces.)
  if (score && score.trim()) params._score = score.trim();
  if (winner) params._winner = winner; // only send when set — resilient if the RPC isn't upgraded yet
  const { error } = await (supabase as any).rpc("confirm_game", params);
  if (error) throw new Error(error.message);
}

export async function reportNoshow(gameId: string) {
  const { error } = await (supabase as any).rpc("report_noshow", { _game_id: gameId });
  if (error) throw new Error(error.message);
}

export async function archiveGame(gameId: string) {
  const { error } = await (supabase as any).rpc("archive_game", { _game_id: gameId });
  if (error) throw new Error(error.message);
}

/** Past games involving this user (played, not no-show, not archived by them), newest first. */
export async function fetchMyGameHistory(uid: string, limit = 20): Promise<GameRow[]> {
  const { data } = await (supabase as any)
    .from("games")
    .select("*")
    .or(`player_a.eq.${uid},player_b.eq.${uid}`)
    .lte("played_at", new Date().toISOString())
    .is("reported_noshow", null)
    .order("played_at", { ascending: false })
    .limit(limit);
  return ((data as GameRow[]) ?? []).filter(
    (g) => !(Array.isArray(g.archived_by) && g.archived_by.includes(uid)),
  );
}
