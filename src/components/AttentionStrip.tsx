import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { fetchPendingPostGameChecks, confirmGame, reportNoshow, archiveGame, type GameRow } from "@/lib/games";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { whenLabel, URGENCY_WINDOW_HOURS } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";

export function AttentionStrip({ onChange }: { onChange?: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<GameRow[]>([]);
  const [pendingMeta, setPendingMeta] = useState<Record<string, { court: string; other: string; otherName: string }>>({});
  const [scores, setScores] = useState<Record<string, string>>({});
  const [winners, setWinners] = useState<Record<string, string>>({});
  const [meId, setMeId] = useState<string | null>(null);
  const [flarePrompts, setFlarePrompts] = useState<any[]>([]);
  const [rowState, setRowState] = useState<Record<string, "ask" | "no" | "confirmed">>({});
  const setRow = (id: string, st: "ask" | "no" | "confirmed") => setRowState((p) => ({ ...p, [id]: st }));

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      if (!u.user) return;
      setMeId(u.user.id);

      const pendingRows = await fetchPendingPostGameChecks(u.user.id);
      setPending(pendingRows);
      if (pendingRows.length) {
        const sosIds = Array.from(new Set(pendingRows.map((g) => g.sos_id).filter(Boolean) as string[]));
        const otherIds = Array.from(new Set(pendingRows.map((g) => (g.player_a === u.user!.id ? g.player_b : g.player_a))));
        const [{ data: sosRows }, { data: pubs }] = await Promise.all([
          sosIds.length ? (supabase as any).from("sos_requests").select("id,court_id").in("id", sosIds) : Promise.resolve({ data: [] }),
          (supabase as any).rpc("players_directory", { _ids: otherIds }),
        ]);
        const courtIds = Array.from(new Set([
          ...((sosRows as any[]) ?? []).map((s) => s.court_id).filter(Boolean),
          ...pendingRows.map((g) => g.court_id).filter(Boolean),
        ]));
        const { data: cs } = courtIds.length
          ? await (supabase as any).from("courts").select("id,name").in("id", courtIds)
          : { data: [] as any[] };
        const sosToCourt = new Map<string, string>(((sosRows as any[]) ?? []).map((s) => [s.id, s.court_id]));
        const courtName = new Map<string, string>(((cs as any[]) ?? []).map((c) => [c.id, c.name]));
        const nameById = new Map<string, string>(((pubs as any[]) ?? []).map((p) => [p.id, p.name]));
        const meta: Record<string, { court: string; other: string; otherName: string }> = {};
        for (const g of pendingRows) {
          // Guest games (player_b null) are auto-confirmed and never reach the
          // pending list, but the types must still tolerate the null.
          const otherId = (g.player_a === u.user!.id ? g.player_b : g.player_a) ?? "";
          const cid = g.court_id ?? (g.sos_id ? sosToCourt.get(g.sos_id) : undefined);
          meta[g.id] = {
            court: (cid && courtName.get(cid)) || "the court",
            other: otherId,
            otherName: (otherId && nameById.get(otherId)) ?? (g as any).guest_name ?? "Player",
          };
        }
        setPendingMeta(meta);
      }

      const cutoff = new Date(Date.now() + URGENCY_WINDOW_HOURS * 3600 * 1000).toISOString();
      const { data: prompts } = await (supabase as any)
        .from("sos_requests")
        .select("id,play_at,court_id,kind,auto_flare,status")
        .eq("caller_id", u.user.id)
        .eq("status", "active")
        .eq("kind", "open")
        .eq("auto_flare", false)
        .gt("play_at", new Date().toISOString())
        .lte("play_at", cutoff);
      setFlarePrompts((prompts as any[]) ?? []);
    })();
  }, []);

  function dismissRow(id: string) { setPending((p) => p.filter((x) => x.id !== id)); }
  // "Yes" counts the game immediately (no form in the way); the row then offers
  // the optional result. confirm_game is idempotent, so the follow-up is a
  // second call that only adds score/winner.
  async function onYes(g: GameRow) {
    try { await confirmGame(g.id); toast.success(t("home.confirmed")); setRow(g.id, "confirmed"); onChange?.(); }
    catch (e: any) { oops(e); }
  }
  async function saveResult(g: GameRow) {
    const score = scores[g.id] ?? (g as any).score ?? "";
    try { await confirmGame(g.id, score, winners[g.id] || null); toast.success(t("home.result_saved")); dismissRow(g.id); onChange?.(); }
    catch (e: any) { oops(e); }
  }
  async function onNoshow(g: GameRow) {
    try { await reportNoshow(g.id); toast.success(t("home.reported_noshow")); setPending((p) => p.filter((x) => x.id !== g.id)); }
    catch (e: any) { oops(e); }
  }
  async function onArchive(g: GameRow) {
    try { await archiveGame(g.id); toast.success(t("home.archived")); setPending((p) => p.filter((x) => x.id !== g.id)); }
    catch (e: any) { oops(e); }
  }
  async function fireFlare(sosId: string) {
    // Direct UPDATE on sos_requests was revoked in the June-19 hardening — this
    // broke the manual flare silently (2026-07-20 audit). Go through the RPC,
    // keep the old direct update only as a pre-SQL fallback.
    let { data, error } = await (supabase as any).rpc("flare_my_game", { _sos_id: sosId });
    if (error && /does not exist|schema cache|PGRST202/i.test(error.message ?? "")) {
      ({ error } = await (supabase as any)
        .from("sos_requests")
        .update({ kind: "sos", flared_at: new Date().toISOString() })
        .eq("id", sosId));
      data = error ? null : [{ ok: true }];
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.ok) { oops(error ?? new Error(String(row?.reason ?? "flare_failed"))); return; }
    // the flare itself (flared_at update) makes the DB fan the SOS out (trg_notify_on_flare)
    toast.success(t("post.flare_fired"));
    setFlarePrompts((p) => p.filter((x) => x.id !== sosId));
    onChange?.();
  }

  if (pending.length === 0 && flarePrompts.length === 0) return null;

  // One line per game (2026-10 crystallization): "Did you play …?" + Yes / No.
  // Yes counts the game at once; the optional who-won/score follow-up is a
  // single line that leaves on save or skip. No → two quiet links.
  const stateOf = (id: string) => rowState[id] ?? "ask";

  return (
    <div className="space-y-3">
      {flarePrompts.map((g) => (
        <div key={g.id} className="ccard p-4 space-y-3" style={{ borderColor: "var(--coral)" }}>
          <div className="font-display text-2xl">{t("home.flare_prompt_title")}</div>
          <div className="text-sm text-[var(--ink)] font-semibold">{whenLabel(g.play_at)}</div>
          <button onClick={() => fireFlare(g.id)} className="cbtn cbtn-coral w-full">{t("home.flare_prompt_cta")}</button>
        </div>
      ))}

      {pending.map((g) => {
        const meta = pendingMeta[g.id];
        const otherName = meta?.otherName ?? "Player";
        const court = meta?.court ?? "the court";
        const st = stateOf(g.id);
        const chip = (on: boolean): React.CSSProperties => ({ border: "2px solid var(--ink)", borderRadius: 999, padding: "6px 10px", fontWeight: 800, fontSize: 13, background: on ? "var(--green-pop)" : "var(--cream2)" });
        return (
          <div key={g.id} className="ccard p-3" style={{ borderColor: "var(--ink)" }}>
            {st === "ask" && (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 font-extrabold leading-snug" style={{ fontSize: 14 }}>
                  {t("home.played_q", { name: otherName, court, when: whenLabel(g.played_at) })}
                </div>
                <button type="button" onClick={() => onYes(g)} className="cbtn cbtn-green shrink-0" style={{ padding: "9px 12px", fontSize: 14 }}>✅ {t("home.yes")}</button>
                <button type="button" onClick={() => setRow(g.id, "no")} className="cbtn cbtn-ghost shrink-0" style={{ padding: "9px 12px", fontSize: 14 }}>{t("home.no")}</button>
              </div>
            )}
            {st === "no" && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-extrabold">
                <button type="button" className="underline" onClick={() => onArchive(g)}>{t("home.didnt_happen")}</button>
                <span style={{ opacity: 0.4 }}>·</span>
                <button type="button" className="underline" onClick={() => onNoshow(g)}>{t("home.player_noshow", { name: otherName })}</button>
                <button type="button" aria-label={t("wiz.back")} className="ml-auto" style={{ opacity: 0.55, padding: "2px 6px" }} onClick={() => setRow(g.id, "ask")}>↩</button>
              </div>
            )}
            {st === "confirmed" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold" style={{ fontSize: 14 }}>{t("home.counted_short")}</span>
                <button type="button" style={chip(!!meId && winners[g.id] === meId)} onClick={() => setWinners((p) => ({ ...p, [g.id]: meId && p[g.id] === meId ? "" : meId ?? "" }))}>{t("won.me")}</button>
                <button type="button" style={chip(!!meta?.other && winners[g.id] === meta.other)} onClick={() => setWinners((p) => ({ ...p, [g.id]: meta?.other && p[g.id] === meta.other ? "" : meta?.other ?? "" }))}>{t("won.other", { name: otherName })}</button>
                <input
                  value={scores[g.id] ?? (g as any).score ?? ""}
                  onChange={(e) => setScores((p) => ({ ...p, [g.id]: e.target.value }))}
                  placeholder={t("score.short_ph")}
                  aria-label={t("score.placeholder")}
                  className="cinput"
                  style={{ width: 112, padding: "7px 10px", fontSize: 14 }}
                />
                <button type="button" className="cbtn cbtn-green" style={{ padding: "8px 12px", fontSize: 14 }} onClick={() => saveResult(g)}>{t("common.save")}</button>
                <button type="button" className="underline text-sm font-extrabold" style={{ opacity: 0.65 }} onClick={() => dismissRow(g.id)}>{t("home.skip")}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
