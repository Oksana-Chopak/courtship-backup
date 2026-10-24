import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { fetchMyGameHistory, type GameRow } from "@/lib/games";
import { useI18n } from "@/lib/i18n";
import { RF, clampLines } from "@/components/RailKit";

export function GamesHistory() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<GameRow[]>([]);
  const [meta, setMeta] = useState<Record<string, { court: string; otherName: string }>>({});
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      if (!u.user) return;
      setMeId(u.user.id);
      const hist = await fetchMyGameHistory(u.user.id);
      setRows(hist);
      if (hist.length) {
        const sosIds = Array.from(new Set(hist.map((g) => g.sos_id).filter(Boolean) as string[]));
        const otherIds = Array.from(new Set(hist.map((g) => (g.player_a === u.user!.id ? g.player_b : g.player_a)).filter(Boolean))) as string[];
        const [{ data: sosRows }, { data: pubs }] = await Promise.all([
          sosIds.length ? (supabase as any).from("sos_requests").select("id,court_id").in("id", sosIds) : Promise.resolve({ data: [] }),
          (supabase as any).rpc("players_directory", { _ids: otherIds }),
        ]);
        const directCourtIds = hist.map((g) => g.court_id).filter(Boolean) as string[];
        const courtIds = Array.from(new Set([
          ...((sosRows as any[]) ?? []).map((s) => s.court_id).filter(Boolean),
          ...directCourtIds,
        ]));
        const { data: cs } = courtIds.length
          ? await (supabase as any).from("courts").select("id,name").in("id", courtIds)
          : { data: [] as any[] };
        const sosToCourt = new Map<string, string>(((sosRows as any[]) ?? []).map((s) => [s.id, s.court_id]));
        const courtName = new Map<string, string>(((cs as any[]) ?? []).map((c) => [c.id, c.name]));
        const nameById = new Map<string, string>(((pubs as any[]) ?? []).map((p) => [p.id, p.name]));
        const m: Record<string, { court: string; otherName: string }> = {};
        for (const g of hist) {
          const otherId = g.player_a === u.user!.id ? g.player_b : g.player_a;
          const cid = g.court_id ?? (g.sos_id ? sosToCourt.get(g.sos_id) : undefined);
          // player_b null = opponent outside the app — show their logged name
          const otherName = otherId ? (nameById.get(otherId) ?? "Player") : ((g as any).guest_name || "Guest");
          m[g.id] = { court: (cid && courtName.get(cid)) || "", otherName };
        }
        setMeta(m);
      }
    })();
  }, []);

  if (rows.length === 0) return null;
  const wins = rows.filter((g) => g.winner && g.winner === meId).length;
  const losses = rows.filter((g) => g.winner && g.winner !== meId).length;
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="csection-label">{t("hist.title")}</div>
        {wins + losses > 0 && <div className="font-extrabold" style={{ fontSize: RF.meta }}>🏆 {wins}–{losses}</div>}
      </div>
      {rows.map((g) => {
        const mm = meta[g.id];
        const confirmed = g.confirmed_a && g.confirmed_b;
        const d = new Date(g.played_at);
        const won = g.winner === meId;
        return (
          <div key={g.id} style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)" }}>
            <div style={{ width: 70, flexShrink: 0, background: g.winner ? (won ? "#EEF6D6" : "#ECE8E0") : "#EEF6D6", borderLeft: `4px solid ${g.winner ? (won ? "#C9EE3F" : "#9B9186") : "#C9EE3F"}`, borderRight: "1px solid rgba(43,33,24,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 4px", textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(43,33,24,0.6)" }}>{d.toLocaleDateString(locale, { weekday: "short" })}</div>
              <div style={{ fontWeight: 700, fontSize: 11, color: "rgba(43,33,24,0.55)", marginTop: 1 }}>{d.toLocaleDateString(locale, { day: "numeric", month: "short" })}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
              <div className="min-w-0 flex-1">
                <div className="font-display" style={{ fontSize: RF.name - 4, lineHeight: 1.1, ...clampLines(1) }}>{t("hist.vs", { name: mm?.otherName ?? "Player" })}</div>
                <div style={{ fontWeight: 700, fontSize: RF.meta - 1, color: "rgba(43,33,24,0.6)", marginTop: 3, ...clampLines(1) }}>{mm?.court ? `📍 ${mm.court}` : ""}{g.score ? `${mm?.court ? " · " : ""}🎾 ${g.score}` : ""}</div>
              </div>
              {g.winner ? (
                <span className="font-extrabold px-2.5 py-1 rounded-full shrink-0" style={{ fontSize: RF.tag, background: won ? "var(--green-pop)" : "var(--cream2)", border: "1.5px solid var(--ink)" }}>
                  {won ? t("hist.won") : t("hist.lost")}
                </span>
              ) : confirmed ? (
                <span className="shrink-0" style={{ fontSize: RF.meta }} title={t("hist.confirmed")}>✓</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
