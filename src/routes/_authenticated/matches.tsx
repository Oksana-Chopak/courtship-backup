import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { LogGameCard, type LogPrefill } from "@/components/LogGameCard";
import { GamesHistory } from "@/components/GamesHistory";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({ meta: [{ title: "Match history — Courtship" }] }),
  validateSearch: (s: Record<string, unknown>): { log?: boolean } => ({
    log: s.log === true || s.log === "1" ? true : undefined,
  }),
  component: MatchesPage,
});

// "Didn't happen" dismissals live on-device: it's a personal triage, and a
// dismissed game can always be logged later via the normal form.
const DISMISS_KEY = "courtship.unlogged.dismissed";
function getDismissed(): Set<string> {
  try { return new Set<string>(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]")); } catch { return new Set(); }
}
function addDismissed(id: string) {
  try {
    const s = getDismissed(); s.add(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...s].slice(-100)));
  } catch { /* ignore */ }
}

type Unlogged = { id: string; playAt: string; courtId: string | null; courtName: string; city: string };

function MatchesPage() {
  const { t, lang } = useI18n();
  const { log } = Route.useSearch();
  // Hosted games whose time passed with NOBODY joining in-app: they shouldn't
  // vanish — they surface here as "did this happen? log it" (2026-07-25 request:
  // people play, but don't rush to tap join).
  const [unlogged, setUnlogged] = useState<Unlogged[]>([]);
  const [prefill, setPrefill] = useState<LogPrefill | null>(null);
  const [logKey, setLogKey] = useState(0);
  // The SOS whose "Log it" opened the form — dismissed on successful save, so
  // the prompt never returns for a game the host just logged (log_game rows
  // carry sos_id = NULL, so the sos_id check alone can't see them —
  // Lovable's "prompts return after you've logged them" report, 2026-08-06).
  const [pendingSos, setPendingSos] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await getUserLocal();
        if (!u.user) return;
        const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
        const { data: sos } = await (supabase as any)
          .from("sos_requests")
          .select("id,play_at,play_until,court_id,status")
          .eq("caller_id", u.user.id)
          .neq("status", "cancelled")
          .gte("play_at", since)
          .order("play_at", { ascending: false })
          .limit(30);
        const now = Date.now();
        const past = ((sos as any[]) ?? []).filter((s) => new Date(s.play_until ?? s.play_at).getTime() < now);
        if (!past.length) { setUnlogged([]); return; }
        // A game "covers" a SOS if it's linked by sos_id OR (for manual logs,
        // which have sos_id = NULL) if the host has ANY game near that slot.
        // Without the time check the prompt nags about already-logged games.
        const { data: gs } = await (supabase as any)
          .from("games")
          .select("sos_id,played_at")
          .or(`player_a.eq.${u.user.id},player_b.eq.${u.user.id}`)
          .gte("played_at", since);
        const games = ((gs as any[]) ?? []);
        const withGames = new Set(games.map((g) => g.sos_id).filter(Boolean));
        const NEAR = 3 * 3600 * 1000; // a log within ±3h of the slot counts as that game
        const coveredByTime = (s: any) => {
          const from = new Date(s.play_at).getTime() - NEAR;
          const to = new Date(s.play_until ?? s.play_at).getTime() + NEAR;
          return games.some((g) => { const gt = new Date(g.played_at).getTime(); return gt >= from && gt <= to; });
        };
        const dismissed = getDismissed();
        const remaining = past.filter((s) => !withGames.has(s.id) && !dismissed.has(s.id) && !coveredByTime(s)).slice(0, 5);
        if (!remaining.length) { setUnlogged([]); return; }
        const courtIds = Array.from(new Set(remaining.map((s) => s.court_id).filter(Boolean)));
        const { data: cs } = courtIds.length
          ? await (supabase as any).from("courts").select("id,name,city").in("id", courtIds)
          : { data: [] as any[] };
        const courtById = new Map<string, any>(((cs as any[]) ?? []).map((c) => [c.id, c]));
        setUnlogged(remaining.map((s) => ({
          id: s.id,
          playAt: s.play_at,
          courtId: s.court_id ?? null,
          courtName: (s.court_id && courtById.get(s.court_id)?.name) || "",
          city: (s.court_id && courtById.get(s.court_id)?.city) || "Uppsala",
        })));
      } catch { /* quiet — the section just doesn't show */ }
    })();
  }, []);

  function startLog(g: Unlogged) {
    const d = new Date(g.playAt);
    const date = new Date(d); date.setHours(0, 0, 0, 0);
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setPrefill({ date, time, courtId: g.courtId ?? undefined, city: g.city });
    setPendingSos(g.id); // remembered until the save actually succeeds
    setLogKey((k) => k + 1); // remount the card so the prefill takes
    setUnlogged((rows) => rows.filter((r) => r.id !== g.id));
  }

  const locale = lang === "sv" ? "sv-SE" : "en-GB";

  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <h1 className="font-display text-3xl">{t("matches.title")}</h1>

      {unlogged.length > 0 && (
        <div className="ccard p-4 space-y-2">
          <div className="csection-label">🕐 {t("unlogged.title")}</div>
          <p className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("unlogged.sub")}</p>
          {unlogged.map((g) => (
            <div key={g.id} className="flex items-center gap-2 border-t border-[var(--ink)]/15 pt-2 first:border-t-0 first:pt-0">
              <div className="flex-1 min-w-0">
                <div className="font-extrabold truncate" style={{ fontSize: 14.5 }}>📍 {g.courtName || t("board.court")}</div>
                <div className="text-sm font-semibold" style={{ opacity: 0.6 }}>
                  {new Date(g.playAt).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} · {new Date(g.playAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <button type="button" className="cbtn cbtn-ghost shrink-0" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => startLog(g)}>
                ✍️ {t("unlogged.log")}
              </button>
              <button type="button" className="shrink-0 font-extrabold" aria-label={t("unlogged.skip")} title={t("unlogged.skip")}
                style={{ fontSize: 16, padding: "4px 8px", opacity: 0.5 }}
                onClick={() => { addDismissed(g.id); setUnlogged((rows) => rows.filter((r) => r.id !== g.id)); }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <LogGameCard key={logKey} defaultOpen={!!log || !!prefill} prefill={prefill ?? undefined}
        onSaved={() => { if (pendingSos) { addDismissed(pendingSos); setPendingSos(null); } }} />
      <GamesHistory />
    </div>
  );
}
