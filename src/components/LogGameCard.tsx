import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { logGame } from "@/lib/games";
import { CourtCombobox } from "@/components/CourtCombobox";
import { DateChipPicker } from "@/components/DateChipPicker";
import { SlotPicker } from "@/components/SlotPicker";
import { useI18n } from "@/lib/i18n";
import { RF } from "@/components/RailKit";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { shareInvite } from "@/lib/share";

function today(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
/** "We just finished" default: the previous half-hour mark. */
function prevHalfHour(): string {
  const n = new Date();
  const m = n.getMinutes() >= 30 ? 30 : 0;
  return `${String(n.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type P = { id: string; name: string; last_name: string | null; photo_url?: string | null };

function fullName(p: { name: string; last_name: string | null }): string { return p.last_name ? p.name + " " + p.last_name : p.name; }

export type LogPrefill = { date?: Date; time?: string; courtId?: string; city?: string };

export function LogGameCard({ defaultOpen = false, prefill, onSaved }: { defaultOpen?: boolean; prefill?: LogPrefill; onSaved?: () => void } = {}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [players, setPlayers] = useState<P[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [otherId, setOtherId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState("");
  // Opponent outside the app — just a name (BATCH14). Mutually exclusive with otherId.
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [date, setDate] = useState<Date>(() => prefill?.date ?? today());
  const [time, setTime] = useState<string>(() => prefill?.time ?? prevHalfHour());
  const [city, setCity] = useState(prefill?.city ?? "Uppsala");
  const [courtId, setCourtId] = useState(prefill?.courtId ?? "");
  const [score, setScore] = useState("");
  const [winner, setWinner] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // After saving a guest game: nudge to invite the friend into the app.
  const [invitePrompt, setInvitePrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!open || players.length) return;
    (async () => {
      const { data: u } = await getUserLocal();
      setMeId(u.user?.id ?? null);
      if (u.user && !prefill?.city) {
        const { data: p } = await (supabase as any).from("profiles").select("home_city").eq("id", u.user.id).maybeSingle();
        if (p?.home_city) setCity(p.home_city);
      }
      const { data } = await (supabase as any).rpc("players_directory");
      setPlayers(((data as any[]) ?? []).map((p) => ({ id: p.id, name: p.name ?? "Player", last_name: p.last_name ?? null, photo_url: p.photo_url ?? null })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, players.length]);

  // No wall-of-players: results appear once you type (2+ chars), capped at 6.
  const q = search.trim().toLowerCase();
  const results = q.length >= 2
    ? players.filter((p) => p.id !== meId).filter((p) => fullName(p).toLowerCase().includes(q)).slice(0, 6)
    : [];

  const opponentChosen = !!otherId || (guestMode && guestName.trim().length >= 2);

  async function submit() {
    if (!opponentChosen) {
      toast.error(guestMode ? t("log.guest_too_short") : t("log.pick_player"));
      return;
    }
    setBusy(true);
    try {
      const [hh, mm] = (time || prevHalfHour()).split(":").map(Number);
      const playedAt = new Date(date);
      playedAt.setHours(hh, mm, 0, 0);
      const guest = guestMode ? guestName.trim() : null;
      const res = await logGame(guest ? null : otherId, playedAt.toISOString(), score, guest ? null : (winner || null), courtId || null, guest);
      toast.success(t("log.done", { name: guest ?? otherName }));
      onSaved?.(); // e.g. Matches page dismisses the "did this happen?" prompt
      if (courtId && !res.courtSaved) toast.message(t("log.court_later"));
      if (guest) setInvitePrompt(guest);
      setOpen(false);
      setOtherId(null);
      setOtherName("");
      setGuestMode(false);
      setGuestName("");
      setSearch("");
      setScore("");
      setWinner("");
      setCourtId("");
      setDate(today());
      setTime(prevHalfHour());
    } catch (e: any) {
      if (String(e?.message) === "guest_needs_sql") toast.error(t("log.guest_needs_sql"), { duration: 9000 });
      else oops(e);
    } finally {
      setBusy(false);
    }
  }

  // Post-save nudge: tracking progress together beats tracking alone.
  if (invitePrompt) {
    return (
      <div className="ccard p-4 space-y-2">
        <div className="font-display text-xl leading-tight">🤗 {t("log.invite_title", { name: invitePrompt })}</div>
        <p className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("log.invite_sub")}</p>
        <div className="flex gap-2">
          <button type="button" className="cbtn cbtn-green flex-1"
            onClick={() => { void shareInvite(t("invite.message"), t("invite.copied")); setInvitePrompt(null); }}>
            🔗 {t("log.invite_cta")}
          </button>
          <button type="button" className="cbtn cbtn-ghost" onClick={() => setInvitePrompt(null)}>{t("common.close")}</button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left" style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)", padding: 0 }}>
        <span style={{ width: 58, flexShrink: 0, background: "#EEF6D6", borderLeft: "4px solid #C9EE3F", borderRight: "1px solid rgba(43,33,24,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✍️</span>
        <span style={{ flex: 1, minWidth: 0, padding: "12px 13px", display: "block" }}>
          <span className="font-display" style={{ fontSize: RF.name - 3, lineHeight: 1.1, display: "block" }}>{t("log.cta")}</span>
          <span style={{ fontWeight: 700, fontSize: RF.meta - 1, color: "rgba(43,33,24,0.55)", marginTop: 2, display: "block" }}>{t("log.cta_sub")}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", paddingRight: 12, fontSize: 20, color: "rgba(43,33,24,0.35)" }}>›</span>
      </button>
    );
  }

  return (
    <div className="ccard p-4 space-y-3">
      <div className="csection-label">{t("log.title")}</div>

      {/* ── opponent ── */}
      {otherId ? (
        <div className="flex items-center justify-between gap-2">
          <div className="font-extrabold truncate">🎾 {otherName}</div>
          <button type="button" className="text-sm underline" onClick={() => { setOtherId(null); setOtherName(""); }}>
            {t("log.change")}
          </button>
        </div>
      ) : guestMode ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="csection-label" style={{ marginBottom: 0 }}>👤 {t("log.guest_label")}</span>
            <button type="button" className="text-sm underline" onClick={() => { setGuestMode(false); setGuestName(""); }}>
              {t("log.change")}
            </button>
          </div>
          <input className="cinput" placeholder={t("log.guest_ph")} value={guestName} maxLength={60}
            onChange={(e) => setGuestName(e.target.value)} autoFocus />
        </div>
      ) : (
        <div className="space-y-2">
          <input className="cinput" placeholder={t("log.search_ph")} value={search} onChange={(e) => setSearch(e.target.value)} />
          {q.length > 0 && q.length < 2 && (
            <div className="text-sm font-semibold" style={{ opacity: 0.55 }}>{t("log.search_hint")}</div>
          )}
          {results.length > 0 && (
            <div>
              {results.map((p) => (
                <button key={p.id} type="button"
                  className="w-full flex items-center gap-2.5 text-left"
                  style={{ padding: "8px 2px", borderBottom: "1px solid rgba(43,33,24,0.12)" }}
                  onClick={() => { setOtherId(p.id); setOtherName(fullName(p)); setSearch(""); }}>
                  <Avatar src={p.photo_url ?? null} name={p.name} seed={p.id} size={34} />
                  <span className="font-extrabold truncate">{fullName(p)}</span>
                </button>
              ))}
            </div>
          )}
          {q.length >= 2 && results.length === 0 && (
            <div className="text-sm font-semibold" style={{ opacity: 0.55 }}>{t("log.no_players")}</div>
          )}
          {/* Playing someone who isn't in the app yet? Log them by name. */}
          <button type="button" onClick={() => setGuestMode(true)}
            className="w-full rounded-xl border px-3 py-2 font-extrabold text-left"
            style={{ borderColor: "rgba(43,33,24,0.28)", background: "rgba(253,249,238,0.6)", fontSize: 13.5 }}>
            ➕ {t("log.guest_add")}
          </button>
        </div>
      )}

      <div>
        <div className="csection-label">{t("log.court")}</div>
        <CourtCombobox city={city} valueId={courtId} onChange={(id) => setCourtId(id)} />
      </div>

      <div className="space-y-2">
        <div className="csection-label">{t("log.when")}</div>
        <DateChipPicker value={date} onChange={setDate} maxDays={0} pastDays={30} />
        <SlotPicker city={city} date={date} value={time} onChange={setTime} allowPast ariaLabel={t("log.when")} />
      </div>

      <div>
        <div className="csection-label">{t("log.score")}</div>
        <input className="cinput" placeholder={t("score.placeholder")} value={score} onChange={(e) => setScore(e.target.value)} />
      </div>

      {/* Winner needs an app identity on both sides — hidden for guest games. */}
      {otherId && !guestMode && (
        <div>
          <div className="csection-label">{t("won.title")}</div>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => setWinner((w) => (meId && w === meId ? "" : meId ?? ""))}
              className="flex-1 rounded-full font-extrabold text-sm py-2"
              style={{ border: "2px solid var(--ink)", background: meId && winner === meId ? "var(--green-pop)" : "var(--cream2)" }}>
              {t("won.me")}
            </button>
            <button type="button"
              onClick={() => setWinner((w) => (w === otherId ? "" : otherId))}
              className="flex-1 rounded-full font-extrabold text-sm py-2"
              style={{ border: "2px solid var(--ink)", background: winner === otherId ? "var(--green-pop)" : "var(--cream2)" }}>
              {t("won.other", { name: otherName })}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className="cbtn cbtn-coral flex-1" disabled={busy || !opponentChosen} style={{ opacity: busy || !opponentChosen ? 0.6 : 1 }} onClick={submit}>
          {busy ? "…" : t("log.submit")}
        </button>
        <button type="button" className="cbtn cbtn-ghost" onClick={() => setOpen(false)}>
          {t("log.cancel")}
        </button>
      </div>

      <p className="text-xs text-[var(--ink)]/60">{t("log.hint")}</p>
    </div>
  );
}
